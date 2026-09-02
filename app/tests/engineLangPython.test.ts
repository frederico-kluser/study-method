/**
 * tests/engineLangPython.test.ts — O ADAPTADOR PYTHON, o segundo do registro.
 *
 * Contrato normativo: `docs/research/08-multilingua-trava-deterministica.md`
 * §5 (Python, Tier A) e §6 (os 15 membros); `docs/17-trilha-python.md`
 * §"O que o `ast` esconde" (as doze distinções) e §"Vocabulário de átomos".
 *
 * Este arquivo prova QUATRO coisas, e a ordem é a da confiança:
 *
 *   1. QUE O SUBPROCESSO É UMA PORTA 1 DE VERDADE — offsets absolutos que
 *      indexam a MESMA string do fonte, inclusive com acento (o `col_offset`
 *      do CPython é em BYTES UTF-8; tratá-lo como caractere desloca todo
 *      trecho em pt-BR), e `SyntaxError` virando o MESMO `PARSE_ERROR`
 *      estruturado que o lado JavaScript produz.
 *   2. QUE PYTHON É TIER A — `symtable` separando local, global e importado,
 *      COM shadowing por escopo, que é onde o caminho JavaScript de hoje
 *      declara ser cego (`extract.ts:38-43`).
 *   3. QUE AS DOZE DISTINÇÕES DO `ast` SÃO REFINADAS — uma asserção por
 *      distinção, com fonte Python real. Sem elas, aulas inteiras
 *      introduziriam ZERO construção nova (violação A6).
 *   4. QUE A DUPLA-IGUALDADE FECHA DE PONTA A PONTA — `countDeclared` (AST) e
 *      `countRun` (relatório) medindo o MESMO número num desafio que roda de
 *      verdade nesta máquina, e o exit 5 sendo reconhecido como "nada rodou".
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  PY_CHALLENGE_LANGUAGES,
  PY_ENTRY_PATH,
  PY_ENV_SCRUB,
  PY_EXIT_NADA_RODOU,
  PY_FORBIDDEN_INVARIANTS,
  PY_FORM_AXIS_SUPPORTED,
  PY_PACKAGE_MARKER,
  PY_SAFE_FILE_PATH_RE,
  PY_TEST_COMMAND,
  PY_TEST_PATH,
  PY_THEORY_FENCE_TAGS,
  pyAtomsPath,
  pyExtractorPath,
  pyInventarioBruto,
  pyResetDetectCache,
  pyResetInventarioCache,
  pyResetParseCache,
  pythonAdapter,
} from '../electron/main/engine/lang/python';
import {
  ENV_ALLOWLIST_COMUM,
  ENV_NUCLEO_COMUM,
  KNOWN_LANGUAGE_IDS,
  adapterIdForChallengeLanguage,
  applyEnvScrub,
  getAdapter,
  type LangNode,
  type ParseOk,
} from '../electron/main/engine/lang/registry';

const py = pythonAdapter;
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'python');

/** A máquina tem `python3`? Sem ele o adaptador degrada — e DIZ que degradou. */
const TEM_PYTHON = py.detect().version !== null;

/** Todos os nós da árvore, em pré-ordem. */
function todosOsNos(raiz: LangNode): LangNode[] {
  const out: LangNode[] = [];
  const visitar = (n: LangNode): void => {
    out.push(n);
    for (const f of n.children) visitar(f);
  };
  visitar(raiz);
  return out;
}

/** Todas as chaves que o adaptador emite para um fonte. */
function chavesDe(fonte: string): string[] {
  const r = py.parse(fonte);
  assert.ok(r.ok, `parse falhou: ${r.ok ? '' : r.error.message}`);
  return todosOsNos(r.root)
    .map((n) => py.constructKey(n))
    .filter((k): k is string => k !== null);
}

// ---------------------------------------------------------------------------

describe('python — identidade e registro', () => {
  it('está registrado, e o id é a LINGUAGEM (não o runtime nem o binário)', () => {
    assert.ok((KNOWN_LANGUAGE_IDS as readonly string[]).includes('python'));
    assert.equal(getAdapter('python'), py);
    assert.equal(py.id, 'python');
    assert.equal(py.label, 'Python');
  });

  it("'python3' e 'cpython' são ALIASES de binário/implementação, não linguagens", () => {
    assert.deepEqual([...PY_CHALLENGE_LANGUAGES], ['python', 'python3', 'cpython']);
    for (const token of PY_CHALLENGE_LANGUAGES) {
      assert.equal(adapterIdForChallengeLanguage(token), 'python', token);
    }
    // o par (toolchain, runner) do §6 — a versão pinada vive no atoms.python.json
    assert.equal(py.defaultRuntime, 'cpython');
  });

  it('as tags de teoria são as de Python; `pycon` (REPL) NÃO é uma delas', () => {
    assert.deepEqual([...py.theoryFenceTags], [...PY_THEORY_FENCE_TAGS]);
    assert.ok(!py.theoryFenceTags.includes('pycon'), 'transcrição de REPL não é Python parseável');
  });

  it('os memos de detect/inventário são reconstruíveis (o mesmo valor depois do reset)', () => {
    const antes = { detect: py.detect(), inventario: py.inventory().length };
    pyResetDetectCache();
    pyResetInventarioCache();
    assert.deepEqual(py.detect(), antes.detect);
    assert.equal(py.inventory().length, antes.inventario);
  });

  it('detect() acha o python3 e o extrator, ou DIZ o que deixou de funcionar', () => {
    const d = py.detect();
    assert.ok(pyExtractorPath() !== null, 'vocab/py/extract_ast.py tem de estar no disco');
    assert.ok(pyAtomsPath() !== null, 'vocab/atoms.python.json tem de estar no disco');
    if (d.ok) {
      assert.equal(d.degradacao, null);
      assert.match(d.version ?? '', /^3\.\d+/);
    } else {
      assert.ok((d.degradacao ?? '').length > 0, 'toolchain ausente sem mensagem é falha em silêncio');
    }
  });
});

describe('python — (1) Porta 1: o parse por SUBPROCESSO', () => {
  it('parseia Python real com line/column 1-based e offsets ABSOLUTOS', { skip: !TEM_PYTHON }, () => {
    const fonte = 'def saudar(nome):\n    return "Ola, " + nome\n';
    const r = py.parse(fonte);
    assert.ok(r.ok);
    assert.equal(r.source, fonte);
    assert.equal(r.root.type, 'Module');

    const nos = todosOsNos(r.root);
    const funcao = nos.find((n) => n.type === 'FunctionDef');
    assert.ok(funcao, 'FunctionDef não encontrado');
    assert.equal(funcao.line, 1);
    assert.equal(funcao.column, 1);
    assert.equal(funcao.attributes.name, 'saudar');

    const retorno = nos.find((n) => n.type === 'Return');
    assert.ok(retorno);
    assert.equal(retorno.line, 2);
    assert.equal(retorno.column, 5, 'coluna 1-based, como todo editor mostra');
    // O CONTRATO dos offsets: eles indexam a MESMA string devolvida em `source`.
    assert.equal(fonte.slice(retorno.start, retorno.end), 'return "Ola, " + nome');
  });

  it('ACENTO: os offsets continuam certos com UTF-8 multibyte (col_offset é em BYTES)', { skip: !TEM_PYTHON }, () => {
    // Medido: em `x = "ação"` o `end_col_offset` do literal é 12 (BYTES);
    // em CARACTERES a linha só tem 10. Tratar byte como caractere colocaria o
    // fim do nó DEPOIS do fim da linha — e todo trecho em pt-BR sairia torto.
    const fonte = 'x = "ação"\ncontagem = len("coração")\n';
    const r = py.parse(fonte);
    assert.ok(r.ok);
    const nos = todosOsNos(r.root);

    const literais = nos.filter((n) => n.type === 'StrLiteral');
    assert.equal(literais.length, 2);
    assert.equal(fonte.slice(literais[0].start, literais[0].end), '"ação"');
    assert.equal(literais[0].text, '"ação"');
    assert.equal(literais[0].column, 5);
    assert.equal(fonte.slice(literais[1].start, literais[1].end), '"coração"');
    assert.equal(literais[1].line, 2);

    // Regra geral: para TODO nó, `text` é exatamente a fatia do fonte.
    for (const n of nos) {
      assert.equal(n.text, fonte.slice(n.start, n.end), `${n.type} @${n.line}:${n.column}`);
      assert.ok(n.end <= fonte.length, `${n.type} passa do fim do fonte`);
    }
  });

  it('SyntaxError vira PARSE_ERROR estruturado com linha/coluna — nunca exceção', { skip: !TEM_PYTHON }, () => {
    const r = py.parse('def f(:\n    pass\n');
    assert.equal(r.ok, false);
    assert.ok(!r.ok);
    assert.equal(r.error.code, 'PARSE_ERROR');
    assert.equal(r.error.line, 1);
    assert.equal(r.error.column, 7);
    assert.ok(r.error.message.length > 0);
  });

  it('erro de INDENTAÇÃO também é PARSE_ERROR na linha certa', { skip: !TEM_PYTHON }, () => {
    const r = py.parse('def f():\nreturn 1\n');
    assert.ok(!r.ok);
    assert.equal(r.error.code, 'PARSE_ERROR');
    assert.equal(r.error.line, 2);
  });

  it('MEMOIZA por fonte — sem o cache, uma auditoria faria milhares de spawns', { skip: !TEM_PYTHON }, () => {
    // Uma invocação custa 73-106 ms (medido, research 08 §5). A interface é
    // SÍNCRONA por decisão de arquitetura (registry.ts:28-38), então o cache
    // não é otimização: é o que torna `spawnSync` viável em laço.
    const fonte = 'memo = 1  # fonte exclusivo deste teste\n';
    pyResetParseCache();
    const t0 = process.hrtime.bigint();
    const primeiro = py.parse(fonte);
    const custoFrio = process.hrtime.bigint() - t0;
    const t1 = process.hrtime.bigint();
    const segundo = py.parse(fonte);
    const custoQuente = process.hrtime.bigint() - t1;

    assert.ok(primeiro.ok && segundo.ok);
    assert.equal(primeiro, segundo, 'o memo devolve o MESMO objeto');
    assert.ok(custoQuente * 10n < custoFrio, `frio ${custoFrio}ns, quente ${custoQuente}ns`);

    pyResetParseCache();
    const terceiro = py.parse(fonte);
    assert.notEqual(terceiro, primeiro, 'depois do reset o parse é refeito');
  });

  it('o resolvedor de artefato é TOTAL: env inexistente cai no candidato seguinte', { skip: !TEM_PYTHON }, () => {
    // A env `STUDY_METHOD_PY_EXTRACTOR` vem PRIMEIRO na lista de candidatos —
    // é o conserto operacional de uma instalação em que o `.py` não foi
    // empacotado. Apontá-la para um arquivo inexistente NÃO pode quebrar
    // nada: o resolvedor só aceita candidato que existe no disco.
    const antes = process.env.STUDY_METHOD_PY_EXTRACTOR;
    process.env.STUDY_METHOD_PY_EXTRACTOR = path.join(os.tmpdir(), 'nao-existe-xyz.py');
    try {
      pyResetParseCache();
      assert.ok(pyExtractorPath() !== null, 'caiu no candidato relativo ao módulo');
      const r = py.parse('z = 1  # fonte exclusivo deste teste\n');
      assert.ok(r.ok, 'o parse continua funcionando com a env apontando para o vazio');
    } finally {
      if (antes === undefined) delete process.env.STUDY_METHOD_PY_EXTRACTOR;
      else process.env.STUDY_METHOD_PY_EXTRACTOR = antes;
      pyResetParseCache();
    }
  });
});

describe('python — (5) resolveScopes: o symtable é o que põe Python em TIER A', () => {
  it('separa local, global e IMPORTADO', { skip: !TEM_PYTHON }, () => {
    const fonte = 'import math\nfrom os import getcwd\n\n\ndef f(x):\n    y = x + 1\n    return len(y) + math.pi\n';
    const r = py.parse(fonte);
    assert.ok(r.ok);
    const escopos = py.resolveScopes(r as ParseOk);

    for (const nome of ['math', 'getcwd', 'f', 'x', 'y']) {
      assert.ok(escopos.declared.has(nome), `${nome} deveria estar em declared`);
    }
    assert.deepEqual([...escopos.imported].sort(), ['getcwd', 'math']);
    assert.ok(escopos.free.has('len'), 'len é referência livre');
    assert.ok(escopos.globals.has('len'), 'len é builtin => global de runtime');
    assert.ok(!escopos.free.has('y'), 'y é local, não é livre');
  });

  it('SHADOWING POR ESCOPO — onde a resolução PLANA do lado JavaScript é cega', { skip: !TEM_PYTHON }, () => {
    // `extract.ts:38-43` declara o limite: junta todos os nomes declarados no
    // ARQUIVO e trata como global o que sobrou. Aqui a análise é por TABELA.
    const fonte = 'def f():\n    len = 3\n    return len\n\n\ndef g():\n    return len([1, 2])\n';
    const chaves = chavesDe(fonte);
    const globais = chaves.filter((k) => k === 'global:len');
    assert.equal(globais.length, 1, 'só a referência de g() é global:len; a de f() é a sombra local');

    // e o oposto: sombra no MÓDULO apaga o global do arquivo inteiro — certo,
    // porque em Python o nome realmente passa a ser o do módulo.
    const sombraDeModulo = chavesDe('len = 3\n\n\ndef g():\n    return len([1, 2])\n');
    assert.ok(!sombraDeModulo.includes('global:len'));
  });

  it('parse sem symtable válido não existe: os dois vêm do MESMO subprocesso', { skip: !TEM_PYTHON }, () => {
    const r = py.parse('a = 1\n');
    assert.ok(r.ok);
    const native = r.native as { scopes?: unknown } | undefined;
    assert.ok(native?.scopes !== undefined, 'a árvore nativa carrega a resolução de escopo');
  });
});

describe('python — (2) os eixos do vocabulário', () => {
  it('mapeia node/op/decl/global/api num trecho representativo', { skip: !TEM_PYTHON }, () => {
    const fonte =
      'import math\n\n\ndef media(numeros):\n    total = 0\n    for n in numeros:\n        total += n\n' +
      '    if not numeros or total == 0:\n        return None\n    return math.floor(total / len(numeros))\n';
    const chaves = new Set(chavesDe(fonte));

    // node: — estrutura
    for (const k of ['node:Module', 'node:FunctionDef', 'node:For', 'node:If', 'node:Return']) {
      assert.ok(chaves.has(k), `faltou ${k}`);
    }
    // op: — cinco famílias, com `compare` SEPARADA de `binary` (docs/17)
    assert.ok(chaves.has('op:aug:+'), 'total += n');
    assert.ok(chaves.has('op:binary:/'), 'total / len(numeros)');
    assert.ok(chaves.has('op:compare:=='), 'total == 0 é ast.Compare, não ast.BinOp');
    assert.ok(chaves.has('op:bool:or'), 'not numeros or ...');
    assert.ok(chaves.has('op:unary:not'));
    assert.ok(!chaves.has('op:binary:=='), 'comparação NUNCA cai na família binary');
    // decl: — formas de ligação
    assert.ok(chaves.has('decl:assign'));
    assert.ok(chaves.has('decl:aug'));
    // global: — builtin livre, cruzado com o symtable
    assert.ok(chaves.has('global:len'));
    // api: — raiz importada vira caminho completo
    assert.ok(chaves.has('api:math'), 'o import em si');
    assert.ok(chaves.has('api:math.floor'), 'a cadeia de atributo');
  });

  it('receptor LOCAL vira `api:.metodo` (o tipo do receptor não é decidível)', { skip: !TEM_PYTHON }, () => {
    const chaves = new Set(chavesDe('def f(xs):\n    xs.append(1)\n    return ", ".join(xs)\n'));
    assert.ok(chaves.has('api:.append'), 'xs é parâmetro local: só o método');
    assert.ok(chaves.has('api:str.join'), 'receptor LITERAL: o tipo É decidível');
  });

  it('inventory()/globals()/builtins() saem do artefato GERADO, com a versão dentro', () => {
    const bruto = pyInventarioBruto();
    assert.ok(bruto !== null, 'atoms.python.json ausente');
    assert.equal(bruto.schema, 1);
    assert.match(bruto.python_version, /^3\.\d+/);
    assert.equal(bruto.python_implementation, 'CPython');

    const inv = py.inventory();
    assert.ok(inv.length > 100, `inventário pequeno demais: ${inv.length}`);
    assert.ok(inv.includes('FunctionDef'));
    assert.ok(inv.includes('IntLiteral'), 'as chaves SINTÉTICAS entram no universo');
    assert.ok(inv.includes('Elif'));
    assert.ok(!inv.includes('Constant'), 'literal NUNCA sai cru (docs/17, distinção 1)');
    assert.ok(!inv.includes('Add'), 'operador é eixo op:, nunca node:');
    assert.deepEqual([...inv], [...inv].sort(), 'ordenado — artefato determinístico');

    // §6 lista `globals()`/`builtins()` com barra porque em Python eles SE
    // SEPARAM: `len` é builtin da linguagem; `__file__` é global de módulo.
    const globais = py.globals();
    const builtins = py.builtins();
    assert.ok(builtins.has('len') && builtins.has('range') && builtins.has('ValueError'));
    assert.ok(globais.has('__file__'));
    assert.ok(!builtins.has('__file__'), 'dunder de módulo NÃO é builtin da linguagem');
    for (const nome of builtins) assert.ok(globais.has(nome), `${nome} deveria estar em globals()`);
    assert.ok(builtins.size < globais.size, 'builtins é subconjunto ESTRITO de globals');
  });

  it('TODA chave emitida nos eixos FECHADOS pertence ao vocabulário gerado', { skip: !TEM_PYTHON }, () => {
    const fonte = fs.readFileSync(path.join(FIXTURES, 'distincoes.py'), 'utf8');
    const bruto = pyInventarioBruto();
    assert.ok(bruto !== null);
    const universo = new Set([...bruto.axes.node, ...bruto.axes.op, ...bruto.axes.decl, ...bruto.axes.global]);
    const forasteiras = new Set<string>();
    for (const chave of chavesDe(fonte)) {
      if (chave.startsWith('api:')) continue; // universo ABERTO por desenho
      if (!universo.has(chave)) forasteiras.add(chave);
    }
    assert.deepEqual([...forasteiras], [], 'emissão fora do vocabulário é bug de cobertura');
  });
});

describe('python — as DOZE distinções que o `ast` esconde (docs/17)', () => {
  const chavesDoFixture = (): Set<string> =>
    new Set(chavesDe(fs.readFileSync(path.join(FIXTURES, 'distincoes.py'), 'utf8')));

  it('1. número · texto · booleano · None · decimal são o MESMO ast.Constant', { skip: !TEM_PYTHON }, () => {
    // Sem o refinamento, a aula de texto introduziria ZERO construção nova.
    const chaves = new Set(chavesDe('a = 7\nb = "oi"\nc = True\nd = None\ne = 3.5\nf = b"x"\n'));
    for (const k of [
      'node:IntLiteral',
      'node:StrLiteral',
      'node:BoolLiteral',
      'node:NoneLiteral',
      'node:FloatLiteral',
      'node:BytesLiteral',
    ]) {
      assert.ok(chaves.has(k), `faltou ${k}`);
    }
    assert.ok(!chaves.has('node:Constant'), 'nunca um node:Constant cru');
    // `True` é `int` em Python (`isinstance(True, int)`): a ordem da checagem
    // importa, e um booleano jamais pode sair como IntLiteral.
    const soBool = new Set(chavesDe('c = True\n'));
    assert.ok(soBool.has('node:BoolLiteral') && !soBool.has('node:IntLiteral'));
  });

  it('2. `elif` × `else:` seguido de `if` têm AST IDÊNTICA (só a coluna difere)', { skip: !TEM_PYTHON }, () => {
    const comElif = new Set(chavesDe('def f(x):\n    if x > 0:\n        return 1\n    elif x < 0:\n        return 2\n'));
    const comElseIf = new Set(
      chavesDe('def f(x):\n    if x > 0:\n        return 1\n    else:\n        if x < 0:\n            return 2\n'),
    );
    assert.ok(comElif.has('node:Elif'), 'o elif tem de ser distinguível');
    assert.ok(!comElif.has('node:IfElse'), 'if/elif sem else final NÃO tem ramo else');
    assert.ok(!comElseIf.has('node:Elif'), 'else: + if NÃO é elif');
    assert.ok(comElseIf.has('node:IfElse'));
  });

  it('3. `if` COM `else` × `if` sem `else`', { skip: !TEM_PYTHON }, () => {
    assert.ok(new Set(chavesDe('def f(x):\n    if x:\n        return 1\n    else:\n        return 2\n')).has('node:IfElse'));
    assert.ok(!new Set(chavesDe('def f(x):\n    if x:\n        return 1\n    return 2\n')).has('node:IfElse'));
  });

  it('4. `for`/`while` com `else`', { skip: !TEM_PYTHON }, () => {
    const chaves = chavesDoFixture();
    assert.ok(chaves.has('node:ForElse'));
    assert.ok(chaves.has('node:WhileElse'));
    assert.ok(!new Set(chavesDe('for i in [1]:\n    pass\n')).has('node:ForElse'));
  });

  it('5. `try` com `finally` · 6. `except ... as e`', { skip: !TEM_PYTHON }, () => {
    const chaves = chavesDoFixture();
    assert.ok(chaves.has('node:Finally'));
    assert.ok(chaves.has('decl:except-as'));
    const semNome = new Set(chavesDe('try:\n    pass\nexcept ValueError:\n    pass\n'));
    assert.ok(!semNome.has('decl:except-as'), '`except X:` sem `as` não liga nome nenhum');
    assert.ok(!semNome.has('node:Finally'));
  });

  it('7. `*args`/`**kwargs` · 8. parâmetro com valor padrão', { skip: !TEM_PYTHON }, () => {
    const chaves = new Set(chavesDe('def f(a, b=1, *args, **kwargs):\n    return a\n'));
    assert.ok(chaves.has('decl:vararg'));
    assert.ok(chaves.has('decl:kwarg'));
    assert.ok(chaves.has('decl:default'));
    const simples = new Set(chavesDe('def f(a):\n    return a\n'));
    for (const k of ['decl:vararg', 'decl:kwarg', 'decl:default']) assert.ok(!simples.has(k), k);
  });

  it('9. decorador — não existe NÓ: vive em `decorator_list`', { skip: !TEM_PYTHON }, () => {
    const chaves = new Set(chavesDe('import functools\n\n\n@functools.cache\ndef f():\n    return 1\n'));
    assert.ok(chaves.has('node:Decorator'));
    assert.ok(!new Set(chavesDe('def f():\n    return 1\n')).has('node:Decorator'));
  });

  it('10. `a, b = 1, 2` tem a MESMA AST de `x = 1` no eixo de nós', { skip: !TEM_PYTHON }, () => {
    const desempacota = new Set(chavesDe('a, b = 1, 2\n'));
    const simples = new Set(chavesDe('x = 1\n'));
    assert.ok(desempacota.has('decl:unpack'));
    assert.ok(!desempacota.has('decl:assign'), 'desempacotar não é atribuição simples');
    assert.ok(simples.has('decl:assign'));
    assert.ok(!simples.has('decl:unpack'));
    // o eixo de NÓS não distingue os dois — é exatamente por isso que o
    // eixo `decl:` teve de ser repreposto para FORMAS DE LIGAÇÃO.
    assert.ok(desempacota.has('node:Assign') && simples.has('node:Assign'));
  });

  it('11. método × função: ambos são FunctionDef, só o pai muda', { skip: !TEM_PYTHON }, () => {
    const chaves = chavesDoFixture();
    assert.ok(chaves.has('node:MethodDef'));
    assert.ok(chaves.has('node:InitMethod'));
    assert.ok(chaves.has('node:DunderStr'));
    const soFuncao = new Set(chavesDe('def f():\n    return 1\n'));
    assert.ok(soFuncao.has('node:FunctionDef'));
    assert.ok(!soFuncao.has('node:MethodDef'), 'função de módulo não é método');
  });

  it('12. `int | None` em anotação × `|` bit a bit (os dois são BinOp/BitOr)', { skip: !TEM_PYTHON }, () => {
    const anotacao = new Set(chavesDe('def f(x: int | None) -> str | None:\n    return None\n'));
    const bitAbit = new Set(chavesDe('mascara = 0b1010 | 0b0101\n'));
    assert.ok(anotacao.has('node:OptionalAnnotation'));
    assert.ok(bitAbit.has('op:binary:|'));
    assert.ok(!bitAbit.has('node:OptionalAnnotation'), '`|` fora de anotação é bit a bit');
  });

  it('as ONZE formas de ligação do eixo `decl:` são todas emitíveis', { skip: !TEM_PYTHON }, () => {
    const chaves = chavesDoFixture();
    const esperadas = [
      'decl:ann',
      'decl:assign',
      'decl:aug',
      'decl:default',
      'decl:except-as',
      'decl:global',
      'decl:kwarg',
      'decl:nonlocal',
      'decl:unpack',
      'decl:vararg',
      'decl:walrus',
    ];
    for (const k of esperadas) assert.ok(chaves.has(k), `faltou ${k}`);
    const bruto = pyInventarioBruto();
    assert.deepEqual([...(bruto?.axes.decl ?? [])].sort(), [...esperadas].sort());
  });

  it('o que o `ast` entrega DE GRAÇA não é refinado (nem se gasta trabalho nisso)', { skip: !TEM_PYTHON }, () => {
    const chaves = new Set(chavesDe('async def f(xs):\n    a = xs[1]\n    b = xs[1:3]\n    return await f(a) or b\n'));
    assert.ok(chaves.has('node:AsyncFunctionDef'));
    assert.ok(chaves.has('node:Await'));
    assert.ok(chaves.has('node:Subscript'));
    assert.ok(chaves.has('node:Slice'), 'fatia já tem nó próprio');
  });
});

describe('python — (6) forbiddenInvariants: as construções que fazem o gate mentir', () => {
  it('a lista cobre o §5 do research 08', () => {
    for (const k of ['global:eval', 'global:exec', 'global:compile', 'global:__import__', 'global:globals', 'global:locals']) {
      assert.ok(PY_FORBIDDEN_INVARIANTS.includes(k), `faltou ${k}`);
    }
    assert.ok(PY_FORBIDDEN_INVARIANTS.includes('api:importlib.import_module'));
    assert.deepEqual([...py.forbiddenInvariants], [...PY_FORBIDDEN_INVARIANTS]);
  });

  it('`d[chave]` NÃO é proibido em Python (é o módulo de dicionários da trilha)', () => {
    // A diferença deliberada em relação a JavaScript: lá `obj[expr]` é
    // indecidível e proibido; aqui é matéria.
    assert.ok(!PY_FORBIDDEN_INVARIANTS.includes('node:ComputedNonLiteralAccess'));
  });

  it('`getattr(o, nome)` com nome NÃO literal é marcado; com literal, não', { skip: !TEM_PYTHON }, () => {
    const dinamico = new Set(chavesDe('def f(o, nome):\n    return getattr(o, nome)\n'));
    assert.ok(dinamico.has('node:ComputedNonLiteralAttribute'));
    const literal = new Set(chavesDe('def f(o):\n    return getattr(o, "saldo")\n'));
    assert.ok(!literal.has('node:ComputedNonLiteralAttribute'), 'nome literal É decidível');
  });

  it('`__getattr__`/`__getattribute__` são marcados como gancho dinâmico', { skip: !TEM_PYTHON }, () => {
    const chaves = new Set(chavesDe('class C:\n    def __getattr__(self, nome):\n        return 1\n'));
    assert.ok(chaves.has('node:DynamicAttributeHook'));
    assert.ok(PY_FORBIDDEN_INVARIANTS.includes('node:DynamicAttributeHook'));
  });
});

describe('python — (7)(8)(9) layout, caminho seguro e comando de teste', () => {
  it('layout: solucao.py na raiz, tests/test_*.py, e `tests/__init__.py` OBRIGATÓRIO', () => {
    const layout = py.layout({ code: 'def soma(a, b):\n    return a + b\n', testsCode: 'import unittest\n' });
    assert.equal(layout.entryPath, PY_ENTRY_PATH);
    assert.equal(layout.entryPath, 'solucao.py');
    assert.equal(layout.testPath, PY_TEST_PATH);
    assert.match(path.basename(layout.testPath), /^test_.*\.py$/, 'tem de casar o `-p test_*.py`');

    const caminhos = layout.files.map((f) => f.path);
    assert.ok(caminhos.includes(PY_PACKAGE_MARKER), 'sem tests/__init__.py o discover RECUSA o diretório');
    // o mesmo arquivo carrega o EXIT-GUARD (o porte do EXIT_GUARD_SOURCE).
    const marcador = layout.files.find((f) => f.path === PY_PACKAGE_MARKER);
    assert.match(marcador?.content ?? '', /_sm_os\._exit = /);
    assert.match(marcador?.content ?? '', /_sm_os\.abort = /);
    assert.ok(!/^_sm_sys\.exit = /m.test(marcador?.content ?? ''), 'patchear sys.exit quebra o unittest.main()');
    assert.deepEqual(caminhos, ['tests/__init__.py', 'solucao.py', 'tests/test_solucao.py']);

    // NÃO há manifesto: `package.json {type:'module'}` não tem análogo.
    assert.equal(layout.manifestPath, null);
  });

  it('layout MULTI-ARQUIVO preserva os arquivos do desafio e o marcador de pacote', () => {
    const layout = py.layout({
      code: '',
      files: [
        { path: 'solucao.py', code: 'x = 1\n' },
        { path: 'ajuda/util.py', code: 'y = 2\n' },
      ],
      testsCode: 'import unittest\n',
    });
    assert.deepEqual(
      layout.files.map((f) => f.path),
      ['tests/__init__.py', 'solucao.py', 'ajuda/util.py', 'tests/test_solucao.py'],
    );
  });

  it('filePathPattern aceita .py e recusa escape de diretório', () => {
    assert.equal(py.filePathPattern.source, PY_SAFE_FILE_PATH_RE.source);
    assert.equal(py.filePathPattern.flags, '', 'flag `g` guardaria lastIndex entre chamadas');
    for (const bom of ['solucao.py', 'tests/test_solucao.py', 'pacote/sub/mod_a-1.py']) {
      assert.ok(py.filePathPattern.test(bom), bom);
    }
    for (const ruim of ['../fora.py', 'solucao.mjs', 'a..b.py', 'solucao.py.bak', '/abs.py'.slice(0, 1) + '..py']) {
      assert.ok(!py.filePathPattern.test(ruim), ruim);
    }
  });

  it('testCommand traz `-B` e `-t .` — os dois por motivo MEDIDO', () => {
    assert.deepEqual([...py.testCommand], [...PY_TEST_COMMAND]);
    assert.ok(py.testCommand.includes('-B'), 'sem -B um mutante do MESMO tamanho reusa .pyc velho');
    assert.ok(py.testCommand.includes('-v'), 'sem -v não há como montar parseChecks');
    const i = py.testCommand.indexOf('-t');
    assert.equal(py.testCommand[i + 1], '.', 'a raiz de import é o diretório do desafio');
    assert.ok(!py.testCommand.includes('-I'), '`-I` tiraria o cwd do sys.path e `from solucao import` quebraria');
  });
});

describe('python — (10)(11)(12) a dupla-igualdade e os checks', () => {
  const CODIGO_DE_TESTE =
    'import unittest\n\nfrom solucao import soma\n\n\n' +
    'class Base(unittest.TestCase):\n    def ajudante(self):\n        return 1\n\n\n' +
    'class TestSoma(Base):\n' +
    '    def test_positivos(self):\n        self.assertEqual(soma(1, 2), 3)\n\n' +
    '    def test_zero(self):\n        self.assertEqual(soma(0, 0), 0)\n\n' +
    '    def auxiliar(self):\n        return 0\n\n\n' +
    'def test_solto():\n    """não é coletado pelo unittest — e não conta."""\n    pass\n\n\n' +
    'if __name__ == "__main__":\n    unittest.main()\n';

  it('countDeclared conta SÓ métodos `test*` dentro de TestCase (herança inclusa)', { skip: !TEM_PYTHON }, () => {
    assert.equal(py.countDeclared(CODIGO_DE_TESTE), 2);
  });

  it('countDeclared é por AST, não por regex: `# def test_x` comentado não conta', { skip: !TEM_PYTHON }, () => {
    const fonte =
      'import unittest\n\n\nclass T(unittest.TestCase):\n' +
      '    # def test_comentado(self): ...\n' +
      '    def test_real(self):\n        self.assertTrue(True)\n';
    assert.equal(py.countDeclared(fonte), 1);
  });

  it('countDeclared aceita `from unittest import TestCase` e recusa classe qualquer', { skip: !TEM_PYTHON }, () => {
    assert.equal(
      py.countDeclared('from unittest import TestCase\n\n\nclass T(TestCase):\n    def test_a(self):\n        pass\n'),
      1,
    );
    assert.equal(py.countDeclared('class T:\n    def test_a(self):\n        pass\n'), 0);
  });

  it('countDeclared de fonte quebrado é 0 (fail-closed: 0 nunca bate com o esperado)', { skip: !TEM_PYTHON }, () => {
    assert.equal(py.countDeclared('class T(unittest.TestCase:\n'), 0);
  });

  it('countRun lê `Ran N tests` — a linha que sai na STDERR', () => {
    // `execOutput` (exec/proofs.ts:77) já concatena stdout+stderr antes de
    // chamar o contador; por isso não há mudança a montante.
    const stderr =
      'test_a (tests.test_solucao.T.test_a) ... ok\ntest_b (tests.test_solucao.T.test_b) ... ok\n' +
      '\n----------------------------------------------------------------------\nRan 2 tests in 0.001s\n\nOK\n';
    assert.deepEqual(py.countRun(`\n${stderr}`), { testsRun: 2, pass: 2, fail: 0, skipped: 0 });
  });

  it('countRun soma failures + errors + unexpected successes como FALHA', () => {
    const saida = 'Ran 6 tests in 0.01s\n\nFAILED (failures=1, errors=2, skipped=1, unexpected successes=1)\n';
    // 6 executados − (1 failure + 2 errors + 1 unexpected success) − 1 skipped = 1 passou
    assert.deepEqual(py.countRun(saida), { testsRun: 6, pass: 1, fail: 4, skipped: 1 });
  });

  it('countRun trata `expected failures` como PASSOU (o teste fez o que prometeu)', () => {
    assert.deepEqual(py.countRun('Ran 2 tests in 0.0s\n\nOK (expected failures=1)\n'), {
      testsRun: 2,
      pass: 2,
      fail: 0,
      skipped: 0,
    });
  });

  it('countRun toma o ÚLTIMO resumo — relatório FORJADO pelo código sob teste não ganha', () => {
    const forjado = 'Ran 99 tests in 0.0s\n\nOK\n'; // impresso pelo módulo sob teste
    const real = 'Ran 2 tests in 0.001s\n\nFAILED (failures=2)\n';
    assert.deepEqual(py.countRun(`${forjado}\n${real}`), { testsRun: 2, pass: 0, fail: 2, skipped: 0 });
  });

  it('countRun sem relatório é ZERO (fail-closed) e `NO TESTS RAN` é zero executados', () => {
    assert.deepEqual(py.countRun('qualquer coisa\nsem resumo\n'), { testsRun: 0, pass: 0, fail: 0, skipped: 0 });
    assert.deepEqual(py.countRun('Ran 0 tests in 0.000s\n\nNO TESTS RAN\n'), {
      testsRun: 0,
      pass: 0,
      fail: 0,
      skipped: 0,
    });
  });

  it('countRun tolera ANSI (defesa em profundidade, como o lado JavaScript)', () => {
    assert.deepEqual(py.countRun('\u001b[32mRan 1 test in 0.0s\u001b[0m\n\n\u001b[32mOK\u001b[0m\n'), {
      testsRun: 1,
      pass: 1,
      fail: 0,
      skipped: 0,
    });
  });

  it('parseChecks devolve um check por teste, e o DOCSTRING não confunde o nome', () => {
    const saida =
      'test_a (tests.test_solucao.T.test_a) ... ok\n' +
      'test_b (tests.test_solucao.T.test_b)\nSoma dois positivos ... FAIL\n' +
      'test_c (tests.test_solucao.T.test_c) ... ERROR\n' +
      "test_d (tests.test_solucao.T.test_d) ... skipped 'ainda não'\n" +
      '\nRan 4 tests in 0.0s\n\nFAILED (failures=1, errors=1, skipped=1)\n';
    assert.deepEqual(py.parseChecks(saida), [
      { name: 'test_a', passed: true },
      { name: 'test_b', passed: false },
      { name: 'test_c', passed: false },
      { name: 'test_d', passed: false },
    ]);
  });
});

describe('python — (13) failureExitCodes: 0 passou · 1 falhou · 5 NADA rodou', () => {
  it('exit 5 é reconhecido como "nada rodou" e É falha', () => {
    assert.equal(PY_EXIT_NADA_RODOU, 5);
    assert.ok(py.failureExitCodes.isFailure(5));
    assert.match(py.failureExitCodes.meaning(5), /NADA rodou/);
  });

  it('exit 1 é falha de teste; 0 é sucesso; 137 é timeout-OU-OOM (nunca afirmar qual)', () => {
    assert.ok(py.failureExitCodes.isFailure(1));
    assert.ok(!py.failureExitCodes.isFailure(0));
    assert.equal(py.failureExitCodes.meaning(137), 'timeout-ou-OOM');
    assert.equal(py.failureExitCodes.meaning(42), 'exit 42');
  });

  it('a dupla-igualdade é INVARIANTE — nenhum adaptador pode dispensá-la', () => {
    assert.equal(py.failureExitCodes.successRequiresCountMatch, true);
    // e Python NÃO tem o buraco do Node: aqui "nada rodou" não sai 0.
    assert.ok(py.failureExitCodes.isFailure(PY_EXIT_NADA_RODOU));
  });
});

describe('python — (14) envScrub: determinismo e o veneno do §6 obs. 2', () => {
  it('`fixed` e `strip` NUNCA se sobrepõem (as duas semânticas fariam o oposto)', () => {
    // applyEnvScrub: fixed e DEPOIS delete strip. applyLegacyEnvScrub: o
    // contrário. Uma chave nos dois conjuntos teria efeito oposto em cada uma.
    const strip = new Set(PY_ENV_SCRUB.strip);
    for (const chave of Object.keys(PY_ENV_SCRUB.fixed)) {
      assert.ok(!strip.has(chave), `${chave} está em fixed E em strip`);
    }
  });

  it('a allowlist constrói o ambiente do NADA e remove PYTHONPATH', () => {
    const base = {
      PATH: '/usr/bin',
      HOME: '/home/aluno',
      PYTHONPATH: '/veneno/lib',
      VIRTUAL_ENV: '/home/aluno/.venv',
      SEGREDO_DA_MAQUINA: 'x',
    };
    const env = applyEnvScrub(PY_ENV_SCRUB, base);
    assert.equal(env.PYTHONPATH, undefined, 'o veneno nomeado no §6 obs. 2');
    assert.equal(env.VIRTUAL_ENV, undefined, 'venv herdado faria `import numpy` funcionar só na máquina do dev');
    assert.equal(env.SEGREDO_DA_MAQUINA, undefined, 'allowlist: o que não foi permitido não passa');
    assert.equal(env.PATH, '/usr/bin', 'sem PATH o spawn nem acha o binário');
    assert.equal(env.PYTHONHASHSEED, '0', 'sem isso a ordem de set/dict muda a cada execução');
    assert.equal(env.PYTHONDONTWRITEBYTECODE, '1');
    assert.equal(env.PYTHONNOUSERSITE, '1');
    assert.equal(env.LC_ALL, ENV_NUCLEO_COMUM.LC_ALL);
    assert.equal(env.TZ, ENV_NUCLEO_COMUM.TZ);
  });

  it('`allow` é vazio: python3 não precisa de extra nenhum além do núcleo comum', () => {
    assert.deepEqual([...PY_ENV_SCRUB.allow], []);
    assert.ok(ENV_ALLOWLIST_COMUM.includes('PATH'));
  });

  it('o `scope` DECLARA os limites, inclusive o do exit-guard', () => {
    const texto = PY_ENV_SCRUB.scope.join('\n');
    assert.match(texto, /EXIT_GUARD_SOURCE/, 'limite escondido é pior que limite nenhum');
    assert.match(texto, /socket cru/);
    assert.ok(PY_ENV_SCRUB.scope.some((l) => l.startsWith('LIMITE:')));
  });
});

describe('python — o eixo `form:` está DESABILITADO na v1, e isso é declarado', () => {
  it('PY_FORM_AXIS_SUPPORTED é false — o consumidor PERGUNTA em vez de descobrir', () => {
    assert.equal(PY_FORM_AXIS_SUPPORTED, false);
  });

  it('nenhuma chave `form:` é emitida — as distinções foram para node:/decl:', { skip: !TEM_PYTHON }, () => {
    const fonte = fs.readFileSync(path.join(FIXTURES, 'distincoes.py'), 'utf8');
    assert.deepEqual(chavesDe(fonte).filter((k) => k.startsWith('form:')), []);
  });
});

// ---------------------------------------------------------------------------
// A prova de ponta a ponta: o layout + o testCommand rodando de verdade
// ---------------------------------------------------------------------------

function escrever(layout: { files: readonly { path: string; content: string }[] }, dir: string): void {
  for (const f of layout.files) {
    const destino = path.join(dir, f.path);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, f.content, 'utf8');
  }
}

describe('python — ponta a ponta: o desafio roda, e a dupla-igualdade fecha', () => {
  const testsCode =
    'import unittest\n\nfrom solucao import soma\n\n\n' +
    'class TestSoma(unittest.TestCase):\n' +
    '    def test_positivos(self):\n        self.assertEqual(soma(1, 2), 3)\n\n' +
    '    def test_com_acento(self):\n        self.assertEqual(soma(0, 0), 0)\n\n\n' +
    'if __name__ == "__main__":\n    unittest.main()\n';

  it('solução correta: exit 0, `Ran 2 tests`, e DECLARADO === EXECUTADO', { skip: !TEM_PYTHON }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-py-ok-'));
    try {
      escrever(py.layout({ code: 'def soma(a, b):\n    return a + b\n', testsCode }), dir);
      const res = spawnSync(py.detect().binary, [...py.testCommand], {
        cwd: dir,
        encoding: 'utf8',
        timeout: 30_000,
        env: applyEnvScrub(PY_ENV_SCRUB, process.env),
      });
      const saida = `${res.stdout ?? ''}\n${res.stderr ?? ''}`;
      assert.equal(res.status, 0, saida);
      assert.ok(!py.failureExitCodes.isFailure(res.status ?? 1));

      const executado = py.countRun(saida);
      const declarado = py.countDeclared(testsCode);
      assert.equal(declarado, 2);
      assert.deepEqual(executado, { testsRun: 2, pass: 2, fail: 0, skipped: 0 });
      assert.equal(executado.testsRun, declarado, 'a dupla-igualdade do §6 obs. 3');
      assert.deepEqual(py.parseChecks(saida), [
        { name: 'test_com_acento', passed: true },
        { name: 'test_positivos', passed: true },
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('solução ERRADA: exit 1 e o relatório acusa a falha', { skip: !TEM_PYTHON }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-py-fail-'));
    try {
      escrever(py.layout({ code: 'def soma(a, b):\n    return a - b\n', testsCode }), dir);
      const res = spawnSync(py.detect().binary, [...py.testCommand], {
        cwd: dir,
        encoding: 'utf8',
        timeout: 30_000,
        env: applyEnvScrub(PY_ENV_SCRUB, process.env),
      });
      const saida = `${res.stdout ?? ''}\n${res.stderr ?? ''}`;
      assert.equal(res.status, 1, saida);
      assert.ok(py.failureExitCodes.isFailure(res.status ?? 0));
      const contagem = py.countRun(saida);
      assert.equal(contagem.testsRun, 2);
      assert.equal(contagem.fail, 1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('SEM `tests/__init__.py` o discover RECUSA o diretório (a armadilha medida)', { skip: !TEM_PYTHON }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-py-nopkg-'));
    try {
      const layout = py.layout({ code: 'def soma(a, b):\n    return a + b\n', testsCode });
      escrever({ files: layout.files.filter((f) => f.path !== PY_PACKAGE_MARKER) }, dir);
      const res = spawnSync(py.detect().binary, [...py.testCommand], {
        cwd: dir,
        encoding: 'utf8',
        timeout: 30_000,
        env: applyEnvScrub(PY_ENV_SCRUB, process.env),
      });
      const saida = `${res.stdout ?? ''}\n${res.stderr ?? ''}`;
      assert.notEqual(res.status, 0, 'sem o marcador de pacote NADA roda');
      assert.match(saida, /Start directory is not importable/);
      // e o gate NÃO se engana: sem `Ran N tests` a contagem é 0.
      assert.equal(py.countRun(saida).testsRun, 0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('diretório de testes VAZIO sai 5 — Python não tem o buraco "exit 0 sem teste"', { skip: !TEM_PYTHON }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-py-vazio-'));
    try {
      fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'tests', '__init__.py'), '# pacote\n', 'utf8');
      fs.writeFileSync(path.join(dir, PY_ENTRY_PATH), 'def soma(a, b):\n    return a + b\n', 'utf8');
      const res = spawnSync(py.detect().binary, [...py.testCommand], {
        cwd: dir,
        encoding: 'utf8',
        timeout: 30_000,
        env: applyEnvScrub(PY_ENV_SCRUB, process.env),
      });
      const saida = `${res.stdout ?? ''}\n${res.stderr ?? ''}`;
      assert.equal(res.status, PY_EXIT_NADA_RODOU, saida);
      assert.match(saida, /NO TESTS RAN/);
      assert.equal(py.countRun(saida).testsRun, 0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // A FORJA da CRITICAL 1, portada para Python: o código sob teste imprime um
  // resumo mentiroso e mata o processo antes de o runner imprimir o real.
  const FORJA =
    'import os\nimport sys\n\n' +
    'sys.stderr.write("\\n---\\nRan 2 tests in 0.001s\\n\\nOK\\n")\nsys.stderr.flush()\n' +
    'os._exit(0)\n\n\ndef soma(a, b):\n    return a + b\n';

  function rodar(dir: string): { status: number | null; saida: string } {
    const res = spawnSync(py.detect().binary, [...py.testCommand], {
      cwd: dir,
      encoding: 'utf8',
      timeout: 30_000,
      env: applyEnvScrub(PY_ENV_SCRUB, process.env),
    });
    return { status: res.status, saida: `${res.stdout ?? ''}\n${res.stderr ?? ''}` };
  }

  it('EXIT-GUARD: relatório forjado + `os._exit(0)` é BLOQUEADO pelo tests/__init__.py', { skip: !TEM_PYTHON }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-py-forja-'));
    try {
      escrever(py.layout({ code: FORJA, testsCode }), dir);
      const { status, saida } = rodar(dir);
      assert.equal(status, 1, saida);
      assert.ok(py.failureExitCodes.isFailure(status ?? 0));
      assert.match(saida, /exit-guard: os\._exit bloqueado/);
      // e a igualdade dupla também reprova: 1 executado (o erro de import)
      // contra 2 declarados.
      const executado = py.countRun(saida);
      assert.equal(executado.fail, 1);
      assert.notEqual(executado.testsRun, py.countDeclared(testsCode));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('SEM o guard a MESMA forja PASSARIA — é a medida do que o guard vale', { skip: !TEM_PYTHON }, () => {
    // Este teste existe para que o valor do guard seja MEDIDO e não suposto:
    // com o `tests/__init__.py` reduzido ao marcador de pacote, a forja sai 0
    // e a igualdade dupla é enganada. É o cenário que o guard elimina.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-py-semguard-'));
    try {
      escrever(py.layout({ code: FORJA, testsCode }), dir);
      fs.writeFileSync(path.join(dir, PY_PACKAGE_MARKER), '# só o marcador de pacote\n', 'utf8');
      const { status, saida } = rodar(dir);
      assert.equal(status, 0, 'sem guard o processo morre com 0');
      assert.deepEqual(py.countRun(saida), { testsRun: 2, pass: 2, fail: 0, skipped: 0 });
      assert.equal(py.countRun(saida).testsRun, py.countDeclared(testsCode), 'a forja enganaria a igualdade dupla');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('`sys.exit(0)` no import NÃO precisa de guard: o unittest já o captura', { skip: !TEM_PYTHON }, () => {
    // Medido: patchear `sys.exit` QUEBRARIA o caminho feliz (o próprio
    // `unittest.main()` chama `sys.exit`), e não é preciso.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-py-sysexit-'));
    try {
      escrever(py.layout({ code: 'import sys\n\nsys.exit(0)\n\n\ndef soma(a, b):\n    return a + b\n', testsCode }), dir);
      const { status, saida } = rodar(dir);
      assert.equal(status, 1, saida);
      assert.match(saida, /SystemExit/);
      assert.notEqual(py.countRun(saida).testsRun, py.countDeclared(testsCode));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
