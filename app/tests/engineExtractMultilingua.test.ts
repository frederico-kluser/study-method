/**
 * tests/engineExtractMultilingua.test.ts — O EXTRATOR DEIXOU DE SER
 * JAVASCRIPT-ONLY (onda 7).
 *
 * O QUE ESTAVA BLOQUEADO. `engine/extract.ts` reprovava com
 * `EngineLinguagemError` qualquer `options.language` que não fosse `javascript`
 * (`exigirAdaptadorJavascript`). Consequência medida antes desta onda:
 *
 *     extractAtoms(code, { language: 'typescript' })
 *     → sem implementação para a linguagem "typescript" (só javascript)
 *
 * Como `budget.ts` e `audit.ts` chamam `extractAtoms` com o adaptador DA
 * TRILHA, uma trilha com `programmingLanguage: 'python'` ou `'typescript'`
 * simplesmente NÃO AUDITAVA — que é o objetivo declarado do projeto. Os
 * adaptadores existiam, os 15 membros estavam implementados e testados, e nada
 * disso chegava ao gate.
 *
 * ESTE ARQUIVO PROVA QUATRO COISAS, na ordem em que elas destravam o objetivo:
 *
 *   1. AS DUAS CAMINHADAS EXISTEM E SÃO DIFERENTES. TypeScript vai pela
 *      caminhada NATIVA (`ts.Node` — mesmo parser, `dialect: 'ts'`); Python vai
 *      pela GENÉRICA (`LangNode` vindo de subprocesso). A guarda continua
 *      fail-closed para quem não tem nenhuma das duas.
 *   2. AS CHAVES SINTÉTICAS CHEGAM AO GATE. `constructKey` ganhou consumidor, e
 *      cada nó rende DUAS chaves: a genérica e a específica. É o que faz
 *      `node:StrLiteral` existir (em Python `7` e `"oi"` são o MESMO
 *      `ast.Constant`) e `node:KeyOfType` se separar de `node:ReadonlyArrayType`
 *      (em TypeScript os dois são o MESMO `node:TypeOperator`).
 *   3. `global:` EM POSIÇÃO DE TIPO e as DIRETIVAS DE SUPRESSÃO passaram a ter
 *      emissor (`Partial<T>`; `@ts-ignore`/`@ts-expect-error`, que são
 *      comentários e por isso nenhuma caminhada de AST pode ver).
 *   4. O CICLO INTEIRO RODA: `extractAtoms` → `deriveTrackBudget` →
 *      `auditTrack`, sobre trilhas MÍNIMAS em memória, uma de Python e uma de
 *      TypeScript, produzindo as violações CERTAS.
 *
 * E prova uma quinta, negativa e igualmente importante: o caminho de JavaScript
 * não se moveu. O placar de `nodejs-do-zero` (717 · 112 · 249) é o canário
 * desta engine e está pinado em `tests/engineAuditPlacar.test.ts`; aqui a
 * mesma promessa é conferida no nível do extrator.
 *
 * Sem rede e sem LLM. As trilhas são fixtures em memória. O caminho de Python
 * roda `python3` por subprocesso (é a Porta 1 dele) e os testes que dependem
 * disso se declaram PULADOS quando a máquina não tem o interpretador — nunca
 * verdes por omissão.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PYTHON_HARNESS_RECEPTIVE_SEED,
  PYTHON_STRUCTURAL_ALWAYS_ALLOWED,
  harnessReceptiveSeed,
  isForbiddenAlways,
  structuralAlwaysAllowed,
} from '../electron/main/engine/atomKeys';
import {
  CAMINHADA_POR_LINGUAGEM,
  EngineLinguagemError,
  LINGUAGEM_SEM_EXTRATOR,
  LINGUAGENS_COM_CAMINHADA,
  exigirAdaptadorComCaminhada,
  exigirAdaptadorJavascript,
  extractAllOccurrences,
  extractAtoms,
} from '../electron/main/engine/extract';
import { auditTrack } from '../electron/main/engine/audit';
import { deriveTrackBudget } from '../electron/main/engine/budget';
import { getAdapter, listAdapterIds } from '../electron/main/engine/lang/registry';
import { pythonAdapter } from '../electron/main/engine/lang/python';
import type { LoadedLesson, LoadedModule, LoadedTrack } from '../electron/main/content/trackLoader';
import type {
  TrackChallengeLanguage,
  TrackChallengeSource,
  TrackTheorySection,
} from '../electron/main/content/trackTypes';

/** A máquina tem `python3`? Sem ele a Porta 1 de Python degrada — e DIZ que degradou. */
const TEM_PYTHON = pythonAdapter.detect().version !== null;

// ---------------------------------------------------------------------------
// Fixtures de trilha (PURAS — nenhuma trilha real, nenhum IO)
// ---------------------------------------------------------------------------

function theory(id: string, markdown: string, language: string, code: string): TrackTheorySection {
  return { id, title: id, markdown, code: { language, code } };
}

function lesson(
  slug: string,
  sections: TrackTheorySection[],
  challenges: TrackChallengeSource[],
): LoadedLesson {
  return {
    meta: {
      schemaVersion: 1,
      slug,
      title: slug,
      summary: slug,
      difficulty: 1,
      concepts: ['conceito'],
      prerequisites: [],
      theory: sections,
      sources: [],
      challenges: challenges.map((c) => c.slug),
    },
    challenges,
  };
}

function moduleOf(slug: string, order: number, lessons: LoadedLesson[]): LoadedModule {
  return {
    meta: { schemaVersion: 1, slug, title: slug, order, lessons: lessons.map((l) => l.meta.slug) },
    lessons,
    challenge: null,
  };
}

function trackOf(programmingLanguage: TrackChallengeLanguage, modules: LoadedModule[]): LoadedTrack {
  return {
    root: {
      schemaVersion: 1,
      slug: 'fixture',
      title: 'fixture',
      description: 'fixture',
      language: 'pt-BR',
      domain: 'programming',
      programmingLanguage,
      modules: modules.map((m) => m.meta.slug),
    },
    modules,
    proficiency: null,
    dir: '/tmp/fixture',
  };
}

// ---------------------------------------------------------------------------
// 1. AS DUAS CAMINHADAS, E A GUARDA QUE CONTINUA FECHADA
// ---------------------------------------------------------------------------

describe('extract — as duas caminhadas e a guarda fail-closed', () => {
  it('a tabela de caminhadas diz QUEM vai por onde, e as duas famílias são diferentes', () => {
    assert.equal(CAMINHADA_POR_LINGUAGEM.javascript, 'ts-node');
    assert.equal(CAMINHADA_POR_LINGUAGEM.typescript, 'ts-node');
    assert.equal(CAMINHADA_POR_LINGUAGEM.python, 'lang-node');
    assert.deepEqual([...LINGUAGENS_COM_CAMINHADA], ['javascript', 'python', 'typescript']);
  });

  it('a guarda REPROVA a linguagem sem caminhada, com erro ESTRUTURADO', () => {
    // `ruby` não tem adaptador: quem reprova é o registro.
    assert.throws(() => extractAtoms('x = 1', { language: 'ruby' as never }));
    // e a guarda do extrator continua existindo para o caso seguinte — id
    // CONHECIDO sem caminhada implementada aqui.
    assert.throws(
      () => exigirAdaptadorComCaminhada('ruby'),
      (e: unknown) => e instanceof Error,
    );
  });

  it('TODO adaptador REGISTRADO tem caminhada — a guarda não pode ficar aberta em silêncio', () => {
    // A guarda existe para a linguagem que ALGUÉM registrar sem porta o
    // extrator. Enquanto isso não acontece, o invariante é este: todo id do
    // registro está na tabela. Um adaptador novo sem linha aqui reprova ESTE
    // teste antes de reprovar uma trilha inteira em produção.
    for (const id of LINGUAGENS_COM_CAMINHADA) assert.ok(getAdapter(id));
    for (const id of listAdapterIds()) {
      assert.ok(
        LINGUAGENS_COM_CAMINHADA.includes(id),
        `${id} está registrado e não tem caminhada em CAMINHADA_POR_LINGUAGEM`,
      );
    }
  });

  it('a mensagem do erro lista as linguagens que o módulo SABE — não "(só javascript)"', () => {
    // A mensagem de erro é o que o autor da trilha lê. Dizer "(só javascript)"
    // num módulo que já sabe três linguagens mandaria consertar a coisa errada.
    const erro = new EngineLinguagemError({
      modulo: 'engine/extract.ts',
      pedido: 'ruby',
      suportado: LINGUAGENS_COM_CAMINHADA,
      motivo: 'motivo',
    });
    for (const lingua of LINGUAGENS_COM_CAMINHADA) assert.ok(erro.message.includes(lingua), erro.message);
    assert.ok(erro.message.includes('"ruby"'));
    assert.equal(erro.code, LINGUAGEM_SEM_EXTRATOR);
  });

  it('`exigirAdaptadorJavascript` NÃO foi afrouxada — as cinco baterias de qualidade continuam JS-only', () => {
    // Se ela tivesse sido alargada para destravar o extrator, as baterias
    // `quality/{minimal,mutants,solvable,requirements,progressao}.ts` passariam
    // a rodar tabelas de `ts.SyntaxKind` e do runner `node:test` contra Python —
    // e dariam veredito ERRADO E SILENCIOSO. O extrator ganhou guarda própria.
    assert.equal(exigirAdaptadorJavascript('m', 'motivo', 'javascript').id, 'javascript');
    for (const lingua of ['typescript', 'python']) {
      assert.throws(
        () => exigirAdaptadorJavascript('m', 'motivo', lingua),
        (e: unknown) => e instanceof EngineLinguagemError,
        lingua,
      );
      // …e a MESMA linguagem passa pela guarda do extrator.
      assert.equal(exigirAdaptadorComCaminhada(lingua).id, lingua);
    }
  });

  it('erro de sintaxe continua sendo PARSE_ERROR estruturado nas duas caminhadas', () => {
    const ts = extractAtoms('const = ;', { language: 'typescript' });
    assert.equal(ts.ok, false);
    if (!ts.ok) assert.equal(ts.error.code, 'PARSE_ERROR');
    if (!TEM_PYTHON) return;
    const py = extractAtoms('def f(:\n', { language: 'python' });
    assert.equal(py.ok, false);
    if (!py.ok) {
      assert.equal(py.error.code, 'PARSE_ERROR');
      assert.ok(py.error.line >= 1 && py.error.column >= 1, 'posição 1-based');
    }
  });
});

// ---------------------------------------------------------------------------
// 2. AS CHAVES SINTÉTICAS CHEGAM AO GATE — TypeScript
// ---------------------------------------------------------------------------

describe('extract — TypeScript: as chaves sintéticas, o `global:` de tipo e a trivia', () => {
  const FONTE = [
    "import type { Pessoa } from './pessoa.ts';",
    'type Chaves = keyof Pessoa;',
    'type Lista = readonly string[];',
    'const parcial: Partial<Pessoa> = {};',
    '// @ts-ignore',
    'const n = valor as unknown as number;',
    '',
  ].join('\n');

  const r = extractAtoms(FONTE, { language: 'typescript' });

  it('parseia TypeScript pelo adaptador de TypeScript (era EngineLinguagemError)', () => {
    assert.ok(r.ok, r.ok ? '' : r.error.message);
  });

  it('`keyof T` e `readonly T[]` deixam de ser o MESMO `node:TypeOperator`', () => {
    assert.ok(r.ok);
    if (!r.ok) return;
    // A distinção que só existe porque `constructKey` ganhou consumidor.
    assert.ok(r.keys.includes('node:KeyOfType'));
    assert.ok(r.keys.includes('node:ReadonlyArrayType'));
    // AS DUAS CHAVES: a genérica continua saindo, e é ela que faz um orçamento
    // já escrito continuar casando.
    assert.ok(r.keys.includes('node:TypeOperator'), 'a chave genérica não pode sumir');
  });

  it('`import type` vira chave própria e a dupla asserção é PROIBIÇÃO com emissor', () => {
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.ok(r.keys.includes('node:TypeOnlyImport'));
    assert.ok(r.keys.includes('node:DoubleAssertionViaUnknown'));
    assert.ok(isForbiddenAlways('node:DoubleAssertionViaUnknown', 'typescript'));
    assert.ok(!isForbiddenAlways('node:DoubleAssertionViaUnknown', 'javascript'));
  });

  it('`Partial` em posição de TIPO sai no eixo `global:` (o passe deixou de ser JS-only)', () => {
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.ok(r.keys.includes('global:Partial'), 'resolveScopes do TS já resolvia; faltava o emissor');
    // e o mesmo fonte lido pelo adaptador de JAVASCRIPT não conhece `Partial`
    // como global (o universo de `jsGlobals()` é o de runtime, sem os tipos).
    const comoJs = extractAtoms(FONTE, { language: 'javascript', dialect: 'ts' });
    assert.ok(comoJs.ok);
    if (comoJs.ok) assert.ok(!comoJs.keys.includes('global:Partial'));
  });

  it('`@ts-ignore` é COMENTÁRIO e mesmo assim vira violação — com linha e coluna', () => {
    assert.ok(r.ok);
    if (!r.ok) return;
    const occ = r.occurrences.find((o) => o.key === 'node:TsIgnoreDirective');
    assert.ok(occ, 'a proibição precisava de emissor');
    assert.equal(occ.line, 5);
    assert.equal(FONTE.slice(occ.start, occ.end), '@ts-ignore');
    assert.ok(isForbiddenAlways(occ.key, 'typescript'));
  });

  it('o eixo `form:` continua valendo em TypeScript (a caminhada é a NATIVA)', () => {
    const comForma = extractAtoms('const f = (x: number) => x + 1;\n', { language: 'typescript' });
    assert.ok(comForma.ok);
    if (!comForma.ok) return;
    assert.ok(
      comForma.keys.some((k) => k.startsWith('form:')),
      'o seletor de forma casa contra o AST do TypeScript — e o adaptador de TS entrega esse AST',
    );
  });
});

// ---------------------------------------------------------------------------
// 3. AS CHAVES SINTÉTICAS CHEGAM AO GATE — Python
// ---------------------------------------------------------------------------

describe('extract — Python: a caminhada GENÉRICA sobre o LangNode do subprocesso', { skip: !TEM_PYTHON ? 'python3 ausente' : false }, () => {
  const FONTE = [
    'import math',
    '',
    '',
    'class Calculadora:',
    '    def __init__(self, nome):',
    '        self.nome = nome',
    '',
    '    def raiz(self, x):',
    '        if x < 0:',
    '            return None',
    '        elif x == 0:',
    '            return 0',
    '        else:',
    '            return math.sqrt(x)',
    '',
    '',
    'total = 7',
    'rotulo = "oi"',
    'a, b = 1, 2',
    'print(len(rotulo))',
    '',
  ].join('\n');

  const r = extractAtoms(FONTE, { language: 'python' });

  it('parseia Python por subprocesso e devolve o MESMO shape de resultado', () => {
    assert.ok(r.ok, r.ok ? '' : r.error.message);
  });

  it('A DISTINÇÃO #1: `7` e `"oi"` deixam de ser o MESMO `ast.Constant`', () => {
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.ok(r.keys.includes('node:IntLiteral'));
    assert.ok(r.keys.includes('node:StrLiteral'));
    // e o `Constant` cru NUNCA sai — se saísse, uma aula de texto introduziria
    // ZERO construção nova e o gate A6 a reprovaria.
    assert.ok(!r.keys.includes('node:Constant'));
  });

  it('as demais distinções que o `ast` colapsa também chegam ao gate', () => {
    assert.ok(r.ok);
    if (!r.ok) return;
    for (const chave of [
      'node:Elif', // `elif` × `else:` + `if` têm AST IDÊNTICA
      'node:IfElse', // `if` com `else` × `if` sem
      'node:MethodDef', // método × função
      'node:InitMethod',
      'decl:assign',
      'decl:unpack', // `a, b = 1, 2` × `x = 1`: mesma AST no eixo de nós
      'op:compare:<', // `<` é `ast.Compare`, não `ast.BinOp`
      'global:len',
      'global:print',
      'api:math.sqrt',
    ]) {
      assert.ok(r.keys.includes(chave), `faltou ${chave} em: ${r.keys.join(' ')}`);
    }
  });

  it('NÓ PORTADOR não vira chave genérica — `node:Binding`/`GlobalRef`/`ApiRef` não existem', () => {
    assert.ok(r.ok);
    if (!r.ok) return;
    // Eles carregam `decl:`/`global:`/`api:` e nada mais: emitir a genérica
    // deles poluiria o eixo `node:` com nomes fora de `inventory()`, que
    // nenhum orçamento poderia declarar.
    const inventario = new Set(pythonAdapter.inventory());
    for (const chave of r.keys) {
      if (!chave.startsWith('node:')) continue;
      assert.ok(inventario.has(chave.slice('node:'.length)), `${chave} está fora do inventário`);
    }
    for (const proibida of ['node:Binding', 'node:GlobalRef', 'node:ApiRef', 'node:Op']) {
      assert.ok(!r.keys.includes(proibida), proibida);
    }
  });

  it('AS DUAS CHAVES também aqui: `x * 2` sai como `node:BinOp` E `op:binary:*`', () => {
    const rr = extractAtoms('def dobro(x):\n    return x * 2\n', { language: 'python' });
    assert.ok(rr.ok);
    if (!rr.ok) return;
    assert.ok(rr.keys.includes('node:BinOp'));
    assert.ok(rr.keys.includes('op:binary:*'));
  });

  it('toda ocorrência tem posição 1-based que indexa o MESMO fonte (com acento)', () => {
    const fonte = 'nome = "José"\ntamanho = len(nome)\n';
    const todas = extractAllOccurrences(fonte, { language: 'python' });
    assert.ok(todas.ok);
    if (!todas.ok) return;
    for (const occ of todas.occurrences) {
      assert.ok(occ.line >= 1 && occ.column >= 1, `${occ.key} ${occ.line}:${occ.column}`);
      assert.ok(occ.start >= 0 && occ.end >= occ.start && occ.end <= fonte.length, occ.key);
    }
    const literal = todas.occurrences.find((o) => o.key === 'node:StrLiteral');
    assert.ok(literal);
    assert.equal(fonte.slice(literal.start, literal.end), '"José"');
    const usoDeLen = todas.occurrences.find((o) => o.key === 'global:len');
    assert.ok(usoDeLen);
    assert.equal(usoDeLen.line, 2);
  });

  it('o eixo `form:` NÃO existe em Python, e isso é declarado — não silencioso', () => {
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.ok(!r.keys.some((k) => k.startsWith('form:')), 'form/selector.ts é tipado sobre ts.Node');
  });

  it('a resolução de escopo é POR ESCOPO — o shadowing local não apaga o global do vizinho', () => {
    const fonte = ['def f():', '    len = 3', '    return len', '', '', 'def g():', '    return len([1])', ''].join('\n');
    const rr = extractAtoms(fonte, { language: 'python' });
    assert.ok(rr.ok);
    if (!rr.ok) return;
    const ocorrencias = extractAllOccurrences(fonte, { language: 'python' });
    assert.ok(ocorrencias.ok);
    if (!ocorrencias.ok) return;
    const globais = ocorrencias.occurrences.filter((o) => o.key === 'global:len');
    assert.equal(globais.length, 1, 'só o `len` de `g` é global — o de `f` está sombreado');
    assert.equal(globais[0].line, 7);
  });
});

// ---------------------------------------------------------------------------
// 4. O CICLO INTEIRO — extractAtoms → deriveTrackBudget → auditTrack
// ---------------------------------------------------------------------------

/** O harness que TODO desafio de Python carrega (`unittest discover`). */
function testsPython(funcao: string): string {
  return [
    'import unittest',
    `from solucao import ${funcao}`,
    '',
    '',
    'class TestSolucao(unittest.TestCase):',
    `    def test_${funcao}(self):`,
    `        self.assertEqual(${funcao}(2), 4)`,
    '',
  ].join('\n');
}

describe('trilha de PYTHON — o gate roda de ponta a ponta', { skip: !TEM_PYTHON ? 'python3 ausente' : false }, () => {
  /**
   * A trilha mínima do critério de aceitação: UMA aula que ensina só NÚMERO
   * (`total = 7`) e um desafio cuja solução devolve TEXTO. Sem as chaves
   * sintéticas, `7` e `"oi"` seriam o MESMO `ast.Constant` e o desafio pareceria
   * usar exatamente o que a aula ensinou.
   */
  function trilhaPython(solutionCode: string): LoadedTrack {
    const desafio: TrackChallengeSource = {
      schemaVersion: 1,
      slug: 'dobrar',
      title: 'dobrar',
      concept: 'conceito',
      difficulty: 1,
      language: 'python',
      statement: '# dobrar',
      starterCode: 'def dobro(x):\n    return 0\n',
      testsCode: testsPython('dobro'),
      solutionCode,
      expectedTestCount: 1,
    };
    return trackOf('python', [
      moduleOf('numeros', 1, [
        lesson(
          'o-numero',
          [theory('n', 'Um número é um valor.', 'python', 'total = 7\n')],
          [desafio],
        ),
      ]),
    ]);
  }

  it('deriveTrackBudget resolve o adaptador da trilha e mede a aula com o parser CERTO', () => {
    const budget = deriveTrackBudget(trilhaPython('def dobro(x):\n    return 4\n'));
    assert.equal(budget.adapterId, 'python');
    const aula = budget.lessons[0];
    assert.ok(aula.introduces.productive.includes('node:IntLiteral'), 'a aula ensina NÚMERO');
    assert.ok(!aula.introduces.productive.includes('node:StrLiteral'), 'e não ensina TEXTO');
    // a semente do harness de Python está no receptivo de ENTRADA da aula 1
    for (const chave of PYTHON_HARNESS_RECEPTIVE_SEED) {
      assert.ok(aula.entrada.receptive.has(chave), `a semente perdeu ${chave}`);
    }
    for (const chave of PYTHON_STRUCTURAL_ALWAYS_ALLOWED) {
      assert.ok(aula.entrada.productive.has(chave), `as estruturais perderam ${chave}`);
    }
    assert.deepEqual([...harnessReceptiveSeed('python')], [...PYTHON_HARNESS_RECEPTIVE_SEED]);
    assert.deepEqual([...structuralAlwaysAllowed('python')], [...PYTHON_STRUCTURAL_ALWAYS_ALLOWED]);
  });

  it('A PROVA: o desafio que devolve TEXTO reprova apontando `node:StrLiteral`', () => {
    const relatorio = auditTrack(trilhaPython('def dobro(x):\n    return "oi"\n'));
    const violacao = relatorio.violations.find(
      (v) => v.construcao === 'node:StrLiteral' && v.campo === 'solutionCode',
    );
    assert.ok(
      violacao,
      `nenhuma violação citou node:StrLiteral; saíram: ${relatorio.violations
        .map((v) => `${v.regra}:${v.construcao}`)
        .join(' ')}`,
    );
    assert.equal(violacao.regra, 'A2');
    assert.equal(violacao.eixo, 'node');
    assert.equal(violacao.faixa, 'productive');
    assert.ok(violacao.trechoOfensor.includes('"oi"'), violacao.trechoOfensor);
    assert.ok(violacao.linha >= 1 && violacao.coluna >= 1);
  });

  it('e o desafio que devolve NÚMERO não é reprovado por essa construção', () => {
    const comTexto = auditTrack(trilhaPython('def dobro(x):\n    return "oi"\n'));
    const comNumero = auditTrack(trilhaPython('def dobro(x):\n    return 4\n'));
    assert.ok(
      !comNumero.violations.some((v) => v.construcao === 'node:StrLiteral'),
      'número é o que a aula ensinou — reprovar aqui seria falso positivo',
    );
    // O DIFERENCIAL é a prova de que a chave sintética é o que MOVE o gate:
    // trocar `4` por `"oi"` — mesma AST do `ast`, mesmo `ast.Constant` — muda o
    // veredito. Sem `node:IntLiteral`/`node:StrLiteral` os dois seriam iguais.
    assert.ok(
      comTexto.violations.length > comNumero.violations.length,
      `texto=${comTexto.violations.length} número=${comNumero.violations.length}`,
    );
  });

  it('a bateria A13–A16 é PULADA (ela é javascript-only) em vez de matar a auditoria', () => {
    // Antes da onda 7 esta chamada MORRIA: `quality/progressao.ts` lança
    // `EngineLinguagemError` para adaptador não-default — e com ela morriam as
    // outras 20 regras, que são agnósticas de linguagem. A bateria continua
    // fechada para Python (H13/AX são chaves do `ts.SyntaxKind`); o que mudou é
    // que a auditoria não depende mais dela.
    const relatorio = auditTrack(trilhaPython('def dobro(x):\n    return 4\n'));
    for (const v of relatorio.violations) {
      assert.ok(!/^A1[3-6]/.test(v.regra), `a bateria JS-only vazou para Python: ${v.regra}`);
    }
    assert.ok(relatorio.violations.length > 0, 'o gate de orçamento continua rodando');
  });
});

describe('trilha de TYPESCRIPT — o gate roda de ponta a ponta', () => {
  const TESTS_TS = [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { dobro } from './solution.ts';",
    '',
    "test('dobro de 2', () => {",
    '  assert.equal(dobro(2), 4);',
    '});',
    '',
  ].join('\n');

  function trilhaTs(solutionCode: string): LoadedTrack {
    const desafio: TrackChallengeSource = {
      schemaVersion: 1,
      slug: 'dobrar',
      title: 'dobrar',
      concept: 'conceito',
      difficulty: 1,
      language: 'typescript',
      statement: '# dobrar',
      starterCode: 'export function dobro(x: number): number {\n  return 0;\n}\n',
      testsCode: TESTS_TS,
      solutionCode,
      expectedTestCount: 1,
    };
    return trackOf('typescript', [
      moduleOf('tipos', 1, [
        lesson(
          'anotar',
          [theory('t', 'Anotar é dizer o tipo.', 'ts', 'export function dobro(x: number): number {\n  return x * 2;\n}\n')],
          [desafio],
        ),
      ]),
    ]);
  }

  it('deriveTrackBudget resolve `typescript` e mede a teoria com `dialect: ts`', () => {
    const budget = deriveTrackBudget(trilhaTs('export function dobro(x: number): number {\n  return x * 2;\n}\n'));
    assert.equal(budget.adapterId, 'typescript');
    assert.deepEqual(budget.parseErrors, [], 'a teoria em TypeScript não pode dar PARSE_ERROR');
    assert.ok(budget.lessons[0].introduces.productive.includes('op:binary:*'));
  });

  it('A PROVA: `as unknown as` no desafio vira violação DEC (proibição global)', () => {
    const relatorio = auditTrack(
      trilhaTs('export function dobro(x: number): number {\n  return (x as unknown as number) * 2;\n}\n'),
    );
    const dec = relatorio.violations.find((v) => v.construcao === 'node:DoubleAssertionViaUnknown');
    assert.ok(
      dec,
      `saíram: ${relatorio.violations.map((v) => `${v.regra}:${v.construcao}`).join(' ')}`,
    );
    assert.equal(dec.regra, 'DEC');
    assert.equal(dec.campo, 'solutionCode');
    assert.ok(dec.mensagem.includes('decidibilidade'));
  });

  it('A PROVA: `@ts-ignore` no desafio vira violação DEC — e ele é COMENTÁRIO', () => {
    const relatorio = auditTrack(
      trilhaTs('// @ts-ignore\nexport function dobro(x: number): number {\n  return x * 2;\n}\n'),
    );
    const dec = relatorio.violations.find((v) => v.construcao === 'node:TsIgnoreDirective');
    assert.ok(
      dec,
      `saíram: ${relatorio.violations.map((v) => `${v.regra}:${v.construcao}`).join(' ')}`,
    );
    assert.equal(dec.regra, 'DEC');
    assert.equal(dec.linha, 1);
  });

  it('a solução limpa não colhe nenhuma das duas', () => {
    const relatorio = auditTrack(trilhaTs('export function dobro(x: number): number {\n  return x * 2;\n}\n'));
    for (const proibida of ['node:DoubleAssertionViaUnknown', 'node:TsIgnoreDirective', 'node:AnyKeyword']) {
      assert.ok(!relatorio.violations.some((v) => v.construcao === proibida), proibida);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. A PROMESSA NEGATIVA — o caminho de JavaScript não se moveu
// ---------------------------------------------------------------------------

describe('o placar do JavaScript não pode mudar', () => {
  const FONTE = [
    "import { deepEqual } from 'node:assert/strict';",
    'export function cumprimentar(nome) {',
    "  if (typeof nome !== 'string') {",
    "    throw new Error('nome precisa ser um texto');",
    '  }',
    "  const chave = 'nome';",
    '  const alvo = { nome }[chave];',
    "  return 'Olá, ' + alvo + '!';",
    '}',
    '',
  ].join('\n');

  it('`jsConstructKey` é, por construção, um SUBCONJUNTO do que a caminhada já emitia', () => {
    // É esta a razão de o placar não se mover: para o adaptador default,
    // `constructKey` devolve `node:<type>` (idêntico à chave genérica),
    // `op:<familia>:<op>` ou `decl:<kind>` — e o extrator só aceita do adaptador
    // o eixo `node:`. Zero chave nova.
    const js = getAdapter('javascript');
    const r = extractAtoms(FONTE);
    assert.ok(r.ok);
    if (!r.ok) return;
    const chavesDeNo = r.keys.filter((k) => k.startsWith('node:'));
    assert.ok(chavesDeNo.length > 0);
    // nenhuma chave `node:` sintética existe no adaptador default
    assert.equal(js.forbiddenInvariants.includes('node:DoubleAssertionViaUnknown'), false);
    assert.ok(!r.keys.includes('node:TsIgnoreDirective'));
    assert.ok(!r.keys.includes('node:KeyOfType'));
  });

  it('as chaves e as POSIÇÕES do caso canônico continuam byte a byte as mesmas', () => {
    const r = extractAtoms(FONTE);
    assert.ok(r.ok);
    if (!r.ok) return;
    for (const esperada of [
      'node:FunctionDeclaration',
      'node:Parameter',
      'node:IfStatement',
      'op:unary:typeof',
      'op:binary:!==',
      'node:ThrowStatement',
      'node:NewExpression',
      'global:Error',
      'node:ReturnStatement',
      'op:binary:+',
      'api:node:assert/strict',
      'node:ComputedNonLiteralAccess',
      'node:ElementAccessExpression',
    ]) {
      assert.ok(r.keys.includes(esperada), `faltou ${esperada}`);
    }
    // a POSIÇÃO do operador continua sendo a do TOKEN, não a da expressão —
    // é o que a violação cita, e é por isso que o extrator não aceita a chave
    // `op:` do adaptador nesta caminhada.
    const op = r.occurrences.find((o) => o.key === 'op:binary:!==');
    assert.ok(op);
    assert.equal(FONTE.slice(op.start, op.end), '!==');
    // e pontuação continua fora do eixo `node:`
    assert.ok(!r.keys.includes('node:PlusToken'));
    assert.ok(!r.keys.includes('node:ExclamationEqualsEqualsToken'));
  });
});
