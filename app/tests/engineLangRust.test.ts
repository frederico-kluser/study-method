/**
 * tests/engineLangRust.test.ts — O ADAPTADOR RUST, o quarto do registro.
 *
 * Contrato normativo: `docs/research/08-multilingua-trava-deterministica.md`
 * §6 (os 15 membros) e §7 item 3 (a Porta 1 por SUBPROCESSO); os fatos
 * MEDIDOS de `docs/research/06-toolchains.md` (ficha Rust: exit 101, nome
 * qualificado, zero-install `cargo test`); e o defeito §3.1 item 2 de
 * `docs/18-estado-da-fabricacao-dos-cursos.md` (a solução de referência como
 * ÚLTIMO candidato do sintetizador).
 *
 * Este arquivo prova CINCO coisas, na ordem da confiança:
 *
 *   1. QUE O SUBPROCESSO (node + WASM do tree-sitter) É UMA PORTA 1 DE
 *      VERDADE — offsets absolutos que indexam a MESMA string do fonte
 *      (inclusive com acento), e erro de sintaxe virando o MESMO
 *      `PARSE_ERROR` estruturado do lado JavaScript.
 *   2. QUE RUST É TIER A — escopos separando item hoisted, `let` local e
 *      importado, com a sombra local não apagando o `global:` do arquivo.
 *   3. QUE O VOCABULÁRIO É FECHADO E PREVISÍVEL — os cinco eixos sobre
 *      construções Rust, as distinções sintéticas (`&mut T`, `else if`), e
 *      TODA chave emitida pertencendo ao artefato gerado
 *      (`vocab/atoms.rust.json`).
 *   4. QUE A DUPLA-IGUALDADE FECHA DE PONTA A PONTA — `countDeclared` (AST) e
 *      `countRun` (relatório) medindo o MESMO número num desafio que roda de
 *      verdade nesta máquina, com o cargo REAL, OFFLINE e sob a allowlist do
 *      adaptador — inclusive as provas de fronteira: exit 101, o `#[test]`
 *      forjado no lib.rs que NEM RODA, e o "0 passed" que sai 0.
 *   5. QUE A SEMENTE RECEPTIVA COBRE O HARNESS REAL E NADA ALÉM — e que o
 *      sintetizador acha o mínimo e a referência fecha o que o literal não
 *      fecha.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  RS_CHALLENGE_LANGUAGES,
  RS_CRATE_NAME,
  RS_ENTRY_PATH,
  RS_EXIT_PANIC,
  RS_FORBIDDEN_INVARIANTS,
  RS_FORM_AXIS_SUPPORTED,
  RS_MANIFEST_CONTENT,
  RS_MANIFEST_PATH,
  RS_SAFE_FILE_PATH_RE,
  RS_TEST_COMMAND,
  RS_TEST_PATH,
  RS_THEORY_FENCE_TAGS,
  rsApplyParseEnv,
  rsAtomsPath,
  rsCountDeclared,
  rsCountRun,
  rsDetect,
  rsExtractorPath,
  rsInventarioBruto,
  rsLayout,
  rsParse,
  rsParseChecks,
  rsResetDetectCache,
  rsResetInventarioCache,
  rsResetParseCache,
  rsResetEnvScrub,
  rustAdapter,
} from '../electron/main/engine/lang/rust';
import {
  ENV_NUCLEO_COMUM,
  KNOWN_LANGUAGE_IDS,
  adapterIdForChallengeLanguage,
  applyEnvScrub,
  getAdapter,
  type LangNode,
  type ParseOk,
} from '../electron/main/engine/lang/registry';
import {
  RUST_HARNESS_RECEPTIVE_SEED,
  RUST_STRUCTURAL_ALWAYS_ALLOWED,
  harnessReceptiveSeed,
  structuralAlwaysAllowed,
} from '../electron/main/engine/atomKeys';
import { exigirAdaptadorComCaminhada, extractAtoms } from '../electron/main/engine/extract';
import { auditTrack } from '../electron/main/engine/audit';
import { loadTrack } from '../electron/main/content/trackLoader';
import {
  derivarRequirements,
  validarRequirements,
  type RequirementDeclarado,
} from '../electron/main/engine/quality/requirements';
import {
  RS_EMPTY_STUB_CODE,
  extrairLiteraisDoTesteRust,
  gerarCandidatosRust,
  sintetizarCodigoMinimoRust,
} from '../electron/main/engine/quality/minimalRust';
import { criarProverDeDesafio } from '../electron/main/engine/phases/f9Verifier';

const rs = rustAdapter;
const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'rust');

/** A máquina tem `cargo`? Sem ele o adaptador degrada — e DIZ que degradou. */
const TEM_CARGO = rsDetect().version !== null;

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

/** Todas as chaves que o adaptador emite para um fonte (o par de chaves da caminhada genérica). */
function chavesDe(fonte: string): string[] {
  const r = rs.parse(fonte);
  assert.ok(r.ok, `parse falhou: ${r.ok ? '' : r.error.message}`);
  const out = new Set<string>();
  const visitar = (n: LangNode): void => {
    const k = rs.constructKey(n);
    if (k !== null) out.add(k);
    if (n.synthetic !== true) out.add(`node:${n.type}`);
    for (const f of n.children) visitar(f);
  };
  for (const filho of r.root.children) visitar(filho);
  return [...out].sort();
}

// ---------------------------------------------------------------------------

describe('rust — identidade e registro', () => {
  it('está registrado, e o id é a LINGUAGEM (não o runtime nem o binário)', () => {
    assert.ok((KNOWN_LANGUAGE_IDS as readonly string[]).includes('rust'));
    assert.equal(getAdapter('rust'), rs);
    assert.equal(rs.id, 'rust');
    assert.equal(rs.label, 'Rust');
  });

  it("'rs' é a grafia curta (extensão e tag da cerca), não outra linguagem", () => {
    assert.deepEqual([...RS_CHALLENGE_LANGUAGES], ['rust', 'rs']);
    for (const token of RS_CHALLENGE_LANGUAGES) {
      assert.equal(adapterIdForChallengeLanguage(token), 'rust', token);
    }
    // o par (toolchain, runner) do §6 — a versão pinada é campo da TRILHA
    assert.equal(rs.defaultRuntime, 'cargo');
  });

  it('as tags de teoria são as de Rust', () => {
    assert.deepEqual([...rs.theoryFenceTags], [...RS_THEORY_FENCE_TAGS]);
    assert.deepEqual([...rs.theoryFenceTags].sort(), ['rs', 'rust']);
  });

  it('os memos de detect/inventário são reconstruíveis (o mesmo valor depois do reset)', () => {
    const antes = { detect: rs.detect(), inventario: rs.inventory().length };
    rsResetDetectCache();
    rsResetInventarioCache();
    assert.deepEqual(rs.detect(), antes.detect);
    assert.equal(rs.inventory().length, antes.inventario);
  });

  it('detect() acha o cargo e o extrator, ou DIZ o que deixou de funcionar', () => {
    const d = rs.detect();
    assert.ok(rsExtractorPath() !== null, 'vocab/rs/extract_ast.mjs tem de estar no disco');
    assert.ok(rsAtomsPath() !== null, 'vocab/atoms.rust.json tem de estar no disco');
    if (d.ok) {
      assert.equal(d.degradacao, null);
      assert.match(d.version ?? '', /^\d+\.\d+/);
      // o binário é o cargo REAL da toolchain (não o proxy do rustup) — é o
      // que roda sob a allowlist do filho (sem RUSTUP_HOME/CARGO_HOME).
      assert.ok(!d.binary.includes('/.rustup/'), `binário não deveria ser proxy: ${d.binary}`);
    } else {
      assert.ok((d.degradacao ?? '').length > 0, 'toolchain ausente sem mensagem é falha em silêncio');
    }
  });
});

describe('rust — (1) Porta 1: o parse por SUBPROCESSO (node + WASM)', () => {
  it('parseia Rust real com line/column 1-based e offsets ABSOLUTOS', { skip: TEM_CARGO ? false : true }, () => {
    const fonte = 'pub fn dobro(x: i32) -> i32 {\n    return x * 2;\n}\n';
    const r = rs.parse(fonte);
    assert.ok(r.ok);
    assert.equal(r.source, fonte);
    assert.equal(r.root.type, 'SourceFile');

    const nos = todosOsNos(r.root);
    const funcao = nos.find((n) => n.type === 'FunctionItem');
    assert.ok(funcao, 'FunctionItem não encontrado');
    assert.equal(funcao.line, 1);
    assert.equal(funcao.column, 1);
    assert.equal(funcao.attributes.name, 'dobro');

    const retorno = nos.find((n) => n.type === 'ReturnExpression');
    assert.ok(retorno);
    assert.equal(retorno.line, 2);
    assert.equal(retorno.column, 5, 'coluna 1-based, como todo editor mostra');
    // O CONTRATO dos offsets: eles indexam a MESMA string devolvida em `source`.
    assert.equal(fonte.slice(retorno.start, retorno.end), 'return x * 2', 'o `;` é token anônimo — fora do nó');
  });

  it('ACENTO: os offsets continuam certos com UTF-8 multibyte', { skip: TEM_CARGO ? false : true }, () => {
    // O tree-sitter conta code points (o `col_offset` do CPython é em BYTES —
    // aqui não há a conversão, mas o contrato é o mesmo: a fatia bate).
    const fonte = 'fn saudacao() -> &\'static str {\n    "ação"\n}\nlet coração = 1;\n';
    const r = rs.parse(fonte);
    assert.ok(r.ok);
    const nos = todosOsNos(r.root);
    const literais = nos.filter((n) => n.type === 'StringLiteral');
    assert.ok(literais.length >= 1);
    assert.equal(fonte.slice(literais[0].start, literais[0].end), '"ação"');
    assert.equal(literais[0].text, '"ação"');
    // Regra geral: para TODO nó, `text` é exatamente a fatia do fonte.
    for (const n of nos) {
      assert.equal(n.text, fonte.slice(n.start, n.end), `${n.type} @${n.line}:${n.column}`);
      assert.ok(n.end <= fonte.length, `${n.type} passa do fim do fonte`);
    }
  });

  it('erro de sintaxe vira PARSE_ERROR estruturado com linha/coluna — nunca exceção', { skip: TEM_CARGO ? false : true }, () => {
    const r = rs.parse('fn f( {\n');
    assert.ok(!r.ok);
    assert.equal(r.error.code, 'PARSE_ERROR');
    assert.ok(r.error.line >= 1);
    assert.ok(r.error.column >= 1);
    assert.ok(r.error.message.length > 0);
  });

  it('MEMOIZA por fonte — sem o cache, uma auditoria faria milhares de spawns', { skip: TEM_CARGO ? false : true }, () => {
    // Uma invocação custa ~100-200 ms (node + WASM). A interface é SÍNCRONA
    // por decisão de arquitetura (registry.ts:28-38), então o cache não é
    // otimização: é o que torna `spawnSync` viável em laço.
    const fonte = 'let memo = 1; // fonte exclusivo deste teste\n';
    rsResetParseCache();
    const t0 = process.hrtime.bigint();
    const primeiro = rs.parse(fonte);
    const custoFrio = process.hrtime.bigint() - t0;
    const t1 = process.hrtime.bigint();
    const segundo = rs.parse(fonte);
    const custoQuente = process.hrtime.bigint() - t1;

    assert.ok(primeiro.ok && segundo.ok);
    assert.equal(primeiro, segundo, 'o memo devolve o MESMO objeto');
    assert.ok(custoQuente * 10n < custoFrio, `frio ${custoFrio}ns, quente ${custoQuente}ns`);

    rsResetParseCache();
    const terceiro = rs.parse(fonte);
    assert.notEqual(terceiro, primeiro, 'depois do reset o parse é refeito');
  });

  it('o resolvedor de artefato é TOTAL: env inexistente cai no candidato seguinte', { skip: TEM_CARGO ? false : true }, () => {
    // A env `STUDY_METHOD_RS_EXTRACTOR` vem PRIMEIRO na lista de candidatos —
    // apontá-la para um arquivo inexistente NÃO pode quebrar nada: o
    // resolvedor só aceita candidato que existe no disco.
    const antes = process.env.STUDY_METHOD_RS_EXTRACTOR;
    process.env.STUDY_METHOD_RS_EXTRACTOR = path.join(os.tmpdir(), 'nao-existe-xyz.mjs');
    try {
      rsResetParseCache();
      assert.ok(rsExtractorPath() !== null, 'caiu no candidato relativo ao módulo');
      const r = rs.parse('let z = 1; // fonte exclusivo deste teste\n');
      assert.ok(r.ok, 'o parse continua funcionando com a env apontando para o vazio');
    } finally {
      if (antes === undefined) delete process.env.STUDY_METHOD_RS_EXTRACTOR;
      else process.env.STUDY_METHOD_RS_EXTRACTOR = antes;
      rsResetParseCache();
    }
  });

  it('o ambiente do parser é allowlist + ELECTRON_RUN_AS_NODE, sem herança livre', () => {
    const env = rsApplyParseEnv({ PATH: '/usr/bin', HOME: '/home/x', SEGREDO: 'x', NODE_OPTIONS: '--require evil' });
    assert.equal(env.PATH, '/usr/bin');
    assert.equal(env.SEGREDO, undefined, 'allowlist: o que não foi permitido não passa');
    assert.equal(env.NODE_OPTIONS, undefined, 'um --require herdado rodaria código no parser');
    assert.equal(env.ELECTRON_RUN_AS_NODE, '1', 'é o que faz o execPath do Electron rodar o .mjs como node');
    assert.equal(env.LC_ALL, ENV_NUCLEO_COMUM.LC_ALL);
  });
});

describe('rust — (5) resolveScopes: o que põe Rust em TIER A', () => {
  it('separa local, item HOISTED e IMPORTADO', { skip: TEM_CARGO ? false : true }, () => {
    // Rust é order-independent no nível de item: a chamada a `futuro` ANTES
    // da declaração dela não é referência livre.
    const fonte = 'use std::io::stdout;\nfn atual() { futuro(); stdout(); }\nfn futuro() {}\n';
    const r = rs.parse(fonte);
    assert.ok(r.ok);
    const escopos = rs.resolveScopes(r as ParseOk);
    for (const nome of ['atual', 'futuro', 'stdout']) {
      assert.ok(escopos.declared.has(nome), `${nome} deveria estar em declared`);
    }
    assert.deepEqual([...escopos.imported].sort(), ['stdout']);
    assert.ok(!escopos.free.has('futuro'), 'item hoisted não é livre');
    assert.ok(!escopos.free.has('stdout'), 'importado não é livre');
  });

  it('SOMBRA LOCAL: `let String = 3;` numa função não apaga o global:String do arquivo', { skip: TEM_CARGO ? false : true }, () => {
    // O análogo do `len = 3` de Python (a cegueira que a resolução PLANA do
    // lado JavaScript declara): a sombra é LEXICAL por bloco.
    const chaves = new Set(chavesDe('fn f() { let String = 3; }\nfn g() -> u8 { String::len(&String::new()) }\n'));
    assert.ok(chaves.has('global:String'), 'a referência de g() continua sendo global:String');
  });

  it('parse sem escopos não existe: os dois vêm do MESMO subprocesso', { skip: TEM_CARGO ? false : true }, () => {
    const r = rs.parse('let a = 1;\n');
    assert.ok(r.ok);
    const native = r.native as { scopes?: unknown } | undefined;
    assert.ok(native?.scopes !== undefined, 'a árvore nativa carrega a resolução de escopo');
  });
});

describe('rust — (2) os eixos do vocabulário', () => {
  it('mapeia node/op/decl/global/api num trecho representativo', { skip: TEM_CARGO ? false : true }, () => {
    const fonte = [
      'use std::collections::HashMap;',
      'fn media(numeros: Vec<i32>) -> i32 {',
      '    let mut total = 0;',
      '    for n in numeros {',
      '        total += n;',
      '    }',
      '    if total > 0 && total < LIMITE {',
      '        return total / 2;',
      '    }',
      '    let mapa: HashMap<String, i32> = HashMap::new();',
      '    String::from("chave");',
      '    mapa.len();',
      '    0',
      '}',
      'const LIMITE: i32 = 100;',
    ].join('\n');
    const chaves = new Set(chavesDe(fonte));

    // node: — estrutura
    for (const k of ['node:FunctionItem', 'node:ForExpression', 'node:IfExpression', 'node:LetDeclaration']) {
      assert.ok(chaves.has(k), `faltou ${k}`);
    }
    // op: — famílias SEPARADAS (como em Python, compare nunca cai em binary)
    assert.ok(chaves.has('op:assign:+='), 'total += n');
    assert.ok(chaves.has('op:binary:/'), 'total / 2');
    assert.ok(chaves.has('op:compare:>'), 'total > 0');
    assert.ok(chaves.has('op:logical:&&'), '&& é família própria');
    assert.ok(!chaves.has('op:binary:>'), 'comparação NUNCA cai na família binary');
    assert.ok(!chaves.has('op:binary:&&'));
    // decl: — as QUATRO formas de ligação
    assert.ok(chaves.has('decl:let-mut'), 'let mut');
    assert.ok(chaves.has('decl:const'), 'const');
    // global: — prelude livre
    assert.ok(chaves.has('global:String'), 'String é prelude');
    assert.ok(chaves.has('global:std'), 'a raiz std é global');
    // api: — raiz importada/global vira caminho completo; receptor local vira .método
    assert.ok(chaves.has('api:std::collections'), 'o caminho do import em si');
    assert.ok(chaves.has('api:std::collections::HashMap'));
    assert.ok(chaves.has('api:HashMap::new'), 'raiz importada');
    assert.ok(chaves.has('api:.len'), 'mapa é local: só o método');
  });

  it('o receptor LITERAL tem tipo decidível (`"abc".len()` → `api:str.len`)', { skip: TEM_CARGO ? false : true }, () => {
    const chaves = new Set(chavesDe('fn f() -> usize { return "abc".len(); }\n'));
    assert.ok(chaves.has('api:str.len'), 'o tipo de um literal de texto É decidível');
  });

  it('o crate do ALUNO nunca é API (`use desafio::x;` não emite api:)', { skip: TEM_CARGO ? false : true }, () => {
    const chaves = new Set(chavesDe(`use ${RS_CRATE_NAME}::dobro;\nuse crate::interno;\nfn f() { ${RS_CRATE_NAME}::dobro(2); }\n`));
    for (const k of chaves) {
      assert.ok(!k.startsWith(`api:${RS_CRATE_NAME}`), `${k} — o módulo do aluno não é API`);
      assert.ok(!k.startsWith('api:crate'), `${k} — caminho interno não é API`);
    }
    assert.ok(chaves.has('node:UseDeclaration'));
  });

  it('inventory()/globals()/builtins() saem do artefato GERADO, com a toolchain dentro', () => {
    const bruto = rsInventarioBruto();
    assert.ok(bruto !== null, 'atoms.rust.json ausente');
    assert.equal(bruto.schema, 1);

    const inv = rs.inventory();
    assert.ok(inv.length > 50, `inventário pequeno demais: ${inv.length}`);
    assert.ok(inv.includes('FunctionItem'));
    assert.ok(inv.includes('MutableReference'), 'as chaves SINTÉTICAS entram no universo');
    assert.ok(inv.includes('ElseIf'));
    assert.ok(!inv.includes('GlobalRef') && !inv.includes('ApiRef') && !inv.includes('Op'),
      'os PORTADORES não entram: a chave deles sai pelo atributo');
    assert.ok(!inv.some((n) => /[a-z]/.test(n[0])), 'PascalCase: primeira letra maiúscula');
    assert.deepEqual([...inv], [...inv].sort(), 'ordenado — artefato determinístico');

    // §6 lista `globals()`/`builtins()` com barra; em Rust os dois COINCIDEM
    // (tudo o que a linguagem embute é prelude, sem import — é em Python que
    // os dois se separam).
    const globais = rs.globals();
    const builtins = rs.builtins();
    for (const nome of ['i32', 'String', 'Vec', 'Option', 'Some', 'None', 'Debug']) {
      assert.ok(builtins.has(nome) && globais.has(nome), nome);
    }
    assert.deepEqual([...builtins].sort(), [...globais].sort());
  });

  it('TODA chave emitida nos eixos FECHADOS pertence ao vocabulário gerado', { skip: TEM_CARGO ? false : true }, () => {
    // A mesma régua do lado Python: o corpus é a entrada do gerador — emissão
    // fora do vocabulário é bug de cobertura, e o teste reprova.
    const fonte = fs.readFileSync(path.join(FIXTURES, 'corpus.rs'), 'utf8');
    const bruto = rsInventarioBruto();
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

describe('rust — as distinções que o parser colapsa (chaves sintéticas)', () => {
  it('1. `&T` × `&mut T` são o MESMO reference_type', { skip: TEM_CARGO ? false : true }, () => {
    const imutavel = new Set(chavesDe('fn f(x: i32) { let r: &i32 = &x; }\n'));
    const mutavel = new Set(chavesDe('fn f(x: i32) { let r: &mut i32 = &mut x; }\n'));
    assert.ok(imutavel.has('node:ReferenceType') && mutavel.has('node:ReferenceType'), 'o tipo do nó é o MESMO');
    assert.ok(mutavel.has('node:MutableReference'), 'a distinção `&mut` é a chave sintética');
    assert.ok(!imutavel.has('node:MutableReference'), '`&` imutável NÃO é MutableReference');
  });

  it('2. `else if` × `else { }`', { skip: TEM_CARGO ? false : true }, () => {
    const comElseIf = new Set(chavesDe('fn f(x: i32) { if x == 0 { } else if x == 1 { } }\n'));
    const comElse = new Set(chavesDe('fn f(x: i32) { if x == 0 { } else { } }\n'));
    assert.ok(comElseIf.has('node:ElseIf'), 'o else if tem de ser distinguível');
    assert.ok(!comElse.has('node:ElseIf'), 'else puro NÃO é ElseIf');
  });

  it('3. `op:unary:*` (deref) × `op:binary:*` (multiplicação) — o token é o mesmo', { skip: TEM_CARGO ? false : true }, () => {
    const deref = new Set(chavesDe('fn f(x: &mut i32) { *x = 2; }\n'));
    const mult = new Set(chavesDe('fn f(x: i32) -> i32 { x * 2 }\n'));
    assert.ok(deref.has('op:unary:*') && !deref.has('op:binary:*'));
    assert.ok(mult.has('op:binary:*') && !mult.has('op:binary:=') === false || mult.has('op:binary:*'));
    assert.ok(!mult.has('op:unary:*'));
  });

  it('4. `-1` é unary, `a - b` é binary (o mesmo token `-`)', { skip: TEM_CARGO ? false : true }, () => {
    const negativo = new Set(chavesDe('let n = -1;\n'));
    const subtracao = new Set(chavesDe('fn f(a: i32, b: i32) -> i32 { a - b }\n'));
    assert.ok(negativo.has('op:unary:-') && !negativo.has('op:binary:-'));
    assert.ok(subtracao.has('op:binary:-') && !subtracao.has('op:unary:-'));
  });

  it('5. macros do prelude emitem `api:<nome>!`; macro local não', { skip: TEM_CARGO ? false : true }, () => {
    const prelude = new Set(chavesDe('fn f() { vec![1]; }\n'));
    assert.ok(prelude.has('api:vec!'));
    const local = new Set(chavesDe('macro_rules! meu { () => {}; }\nfn g() { meu!(); }\n'));
    assert.ok(![...local].some((k) => k.startsWith('api:meu')), 'macro definida no arquivo é conteúdo');
  });

  it('o eixo `form:` está DESABILITADO na v1, e isso é declarado', () => {
    assert.equal(RS_FORM_AXIS_SUPPORTED, false);
    if (TEM_CARGO) {
      const fonte = fs.readFileSync(path.join(FIXTURES, 'corpus.rs'), 'utf8');
      assert.deepEqual(chavesDe(fonte).filter((k) => k.startsWith('form:')), []);
    }
  });
});

describe('rust — (6) forbiddenInvariants: a forja de relatório e o escape do compilador', () => {
  it('a lista cobre a forja de `test result` e os caminhos de escape', () => {
    for (const k of ['api:std::process::exit', 'api:std::process::abort', 'node:ForeignModItem', 'api:asm!', 'api:link_section']) {
      assert.ok(RS_FORBIDDEN_INVARIANTS.includes(k), `faltou ${k}`);
    }
    assert.deepEqual([...rs.forbiddenInvariants], [...RS_FORBIDDEN_INVARIANTS]);
  });

  it('`std::process::exit(0)` e `use std::process::exit` emitem a MESMA chave proibida', { skip: TEM_CARGO ? false : true }, () => {
    const direto = new Set(chavesDe('fn f() { std::process::exit(0); }\n'));
    const importado = new Set(chavesDe('use std::process::exit;\nfn g() { exit(0); }\n'));
    assert.ok(direto.has('api:std::process::exit'));
    assert.ok(importado.has('api:std::process::exit'), 'o import emite a MESMA chave — as duas grafias caem juntas');
  });
});

describe('rust — (7)(8)(9) layout, caminho seguro e comando de teste', () => {
  it('layout: Cargo.toml primeiro, src/lib.rs, tests/desafio.rs', () => {
    const layout = rs.layout({ code: 'pub fn soma(a: i32, b: i32) -> i32 { a + b }\n', testsCode: 'use desafio::soma;\n' });
    assert.equal(layout.entryPath, RS_ENTRY_PATH);
    assert.equal(layout.entryPath, 'src/lib.rs');
    assert.equal(layout.testPath, RS_TEST_PATH);
    assert.equal(layout.testPath, 'tests/desafio.rs');
    assert.equal(layout.manifestPath, RS_MANIFEST_PATH);

    const caminhos = layout.files.map((f) => f.path);
    assert.deepEqual(caminhos, ['Cargo.toml', 'src/lib.rs', 'tests/desafio.rs']);
    const manifesto = layout.files[0].content;
    // O manifesto É O HARNESS: as travas medidas estão nele.
    assert.match(manifesto, /\[lib\]\s*\ntest = false/, '[lib] test = false: o #[test] do aluno nem roda');
    assert.match(manifesto, /doctest = false/, 'doc-comment não vira prova');
    assert.match(manifesto, /name = "desafio"/, 'o crate que o teste importa');
    assert.match(manifesto, /edition = "2021"/, 'edition pinada e declarada');
    assert.match(manifesto, /\[dependencies\]\s*$/, 'dependencies VAZIO — stdlib only, rede zero');
  });

  it('layout MULTI-ARQUIVO preserva os arquivos do desafio e o manifesto', () => {
    const layout = rs.layout({
      code: '',
      files: [
        { path: 'src/lib.rs', code: 'pub mod util;\n' },
        { path: 'src/util.rs', code: 'pub fn ajuda() {}\n' },
      ],
      testsCode: 'use desafio::util::ajuda;\n',
    });
    assert.deepEqual(
      layout.files.map((f) => f.path),
      ['Cargo.toml', 'src/lib.rs', 'src/util.rs', 'tests/desafio.rs'],
      'com `files`, o src/lib.rs implícito NÃO é escrito (igual ao harness do JS)',
    );
  });

  it('filePathPattern aceita .rs e recusa escape de diretório', () => {
    assert.equal(rs.filePathPattern.source, RS_SAFE_FILE_PATH_RE.source);
    assert.equal(rs.filePathPattern.flags, '', 'flag `g` guardaria lastIndex entre chamadas');
    for (const bom of ['src/lib.rs', 'src/util/mod.rs', 'pacote/sub/mod_a-1.rs']) {
      assert.ok(rs.filePathPattern.test(bom), bom);
    }
    for (const ruim of ['../fora.rs', 'lib.mjs', 'a..b.rs', 'lib.rs.bak', 'Cargo.toml']) {
      assert.ok(!rs.filePathPattern.test(ruim), ruim);
    }
  });

  it('testCommand roda a suíte INTEIRA, offline — sem filtro por nome (o footgun medido)', () => {
    assert.deepEqual([...rs.testCommand], [...RS_TEST_COMMAND]);
    assert.ok(rs.testCommand.includes('--offline'), 'cinto; CARGO_NET_OFFLINE=1 é o suspensório');
    // O filtro por nome é a armadilha do docs/research/06: `cargo test
    // <nome-curto>` sai 0 silenciosamente quando o nome não é qualificado —
    // sem filtro, o problema não existe.
    const nomes = rs.testCommand.filter((a) => a.startsWith('testa_') || a.startsWith('tests::'));
    assert.deepEqual(nomes, [], 'nenhum filtro de nome no comando');
  });
});

describe('rust — (10)(11)(12) a dupla-igualdade e os checks', () => {
  const CODIGO_DE_TESTE = [
    'use desafio::soma;',
    '',
    '// helper local — não é teste',
    'fn ajudante() -> i32 { 1 }',
    '',
    '#[test]',
    'fn testa_positivos() {',
    '    assert_eq!(soma(1, 2), 3);',
    '}',
    '',
    '#[cfg(test)]',
    '#[test]',
    'fn testa_zero() {',
    '    assert_eq!(soma(0, 0), 0);',
    '}',
    '',
    '// #[test]',
    '// fn test_comentado() {}',
    '',
    'fn testa_sem_atributo() {}',
  ].join('\n');

  it('countDeclared conta SÓ `#[test] fn` (cadeia de atributos inclusa)', { skip: TEM_CARGO ? false : true }, () => {
    assert.equal(rs.countDeclared(CODIGO_DE_TESTE), 2);
  });

  it('countDeclared é por AST, não por regex: `// #[test]` comentado não conta', { skip: TEM_CARGO ? false : true }, () => {
    // O comentário é nó NO tree-sitter, mas o `#[test]` dentro dele não vira
    // atributo — e `fn` sem atributo `test` não é coletada pelo cargo.
    assert.equal(rsCountDeclared('fn f() {}\n'), 0, 'fn sem #[test] não é teste');
  });

  it('countDeclared de fonte quebrado é 0 (fail-closed: 0 nunca bate com o esperado)', { skip: TEM_CARGO ? false : true }, () => {
    assert.equal(rs.countDeclared('fn f( {\n'), 0);
  });

  it('countRun lê o ÚLTIMO `test result:` — o do runner real, tolerante a ANSI', () => {
    const forjado = 'test result: ok. 99 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s';
    const real = [
      'running 2 tests',
      'test testa_a ... ok',
      'test testa_b ... FAILED',
      '',
      'failures:',
      '',
      'failures:',
      '    testa_b',
      '',
      'test result: FAILED. 1 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s',
    ].join('\n');
    assert.deepEqual(rs.countRun(`${forjado}\n${real}`), { testsRun: 2, pass: 1, fail: 1, skipped: 0 });
    assert.deepEqual(
      rs.countRun(`\u001b[32mtest result: ok. 1 passed; 0 failed; 0 ignored; 0 measured\u001b[0m`),
      { testsRun: 1, pass: 1, fail: 0, skipped: 0 },
      'tolerante a ANSI (defesa em profundidade)',
    );
  });

  it('countRun: `#[ignore]` é skipped e NÃO é "passou" (a prova 1 é integral)', () => {
    assert.deepEqual(
      rs.countRun('test result: ok. 1 passed; 0 failed; 2 ignored; 0 measured; 0 filtered out; finished in 0.01s'),
      { testsRun: 1, pass: 1, fail: 0, skipped: 2 },
    );
  });

  it('countRun sem relatório é ZERO (fail-closed: erro de compilação não tem resumo)', () => {
    assert.deepEqual(rs.countRun('error[E0432]: unresolved import `desafio::dobro`\n'), {
      testsRun: 0, pass: 0, fail: 0, skipped: 0,
    });
  });

  it('parseChecks devolve um check por teste, com o nome que o cargo imprime', () => {
    const saida = [
      'running 3 tests',
      'test tests::a ... ok',
      'test testa_errado ... FAILED',
      'test lento ... ignored',
      '',
      'test result: FAILED. 1 passed; 1 failed; 1 ignored; 0 measured; 0 filtered out; finished in 0.01s',
    ].join('\n');
    assert.deepEqual(rs.parseChecks(saida), [
      { name: 'tests::a', passed: true },
      { name: 'testa_errado', passed: false },
      { name: 'lento', passed: false },
    ]);
  });

  // ── FIX H1: a integridade de saída no RUNTIME (rsCountRun com declarado) ──
  const ZERO = { testsRun: 0, pass: 0, fail: 0, skipped: 0 };
  const REAL_OK = [
    'running 2 tests',
    'test testa_a ... ok',
    'test testa_b ... ok',
    '',
    'test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s',
  ].join('\n');

  it('FIX H1 · com o declarado, o relatório REAL do libtest é aceito (as quatro condições fecham)', () => {
    assert.deepEqual(rs.countRun(REAL_OK, 2), { testsRun: 2, pass: 2, fail: 0, skipped: 0 });
    // SINGULAR medido do libtest: um teste só imprime "running 1 test"
    const umTeste = [
      'running 1 test',
      'test testa_dobro ... ok',
      '',
      'test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s',
    ].join('\n');
    assert.deepEqual(rs.countRun(umTeste, 1), { testsRun: 1, pass: 1, fail: 0, skipped: 0 });
    // corrida FALHA real: linhas FAILED, resumo por último, números coerentes
    const realFalho = [
      'running 2 tests',
      'test testa_a ... ok',
      'test testa_b ... FAILED',
      '',
      'failures:',
      '',
      'failures:',
      '    testa_b',
      '',
      'test result: FAILED. 1 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s',
    ].join('\n');
    assert.deepEqual(rs.countRun(realFalho, 2), { testsRun: 2, pass: 1, fail: 1, skipped: 0 });
    // o stderr do cargo DEPOIS do resumo (`error: test failed…`) não é
    // conteúdo do libtest — não desqualifica o relatório real.
    assert.deepEqual(rs.countRun(`${REAL_OK}\nerror: test failed, to rerun pass \`--lib\``, 2), {
      testsRun: 2, pass: 2, fail: 0, skipped: 0,
    });
  });

  it('FIX H1 · o ATAQUE medido — resumo forjado SOZINHO — reprova em 1 e 2 (sem header, sem linhas)', () => {
    // O ataque do revisor, verbatim no fd: exit 0, o bloco forjado por último,
    // o resumo real do libtest nunca sai.
    const forja =
      'test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s';
    assert.deepEqual(rs.countRun(forja, 2), ZERO, 'a forja sozinha volta ZERO com o declarado ligado');
    // sem o declarado (a régua fraca dos unitários), o último bloco é lido —
    // é POR ISSO que o runtime precisa passar o declarado.
    assert.deepEqual(rs.countRun(forja), { testsRun: 2, pass: 2, fail: 0, skipped: 0 });
  });

  it('FIX H1 · cabeçalho com contagem DIFERENTE do declarado reprova (condição 1)', () => {
    const saida = REAL_OK.replace('running 2 tests', 'running 3 tests');
    assert.deepEqual(rs.countRun(saida, 2), ZERO);
    // e SEM o cabeçalho inteiro (a forja que imprime só linhas + resumo)
    const semHeader = REAL_OK.split('\n').slice(1).join('\n');
    assert.deepEqual(rs.countRun(semHeader, 2), ZERO);
  });

  it('FIX H1 · linhas por-teste insuficientes/duplicadas reprova (condição 2)', () => {
    // header certo, UMA linha por-teste para DOIS testes declarados
    const curto = [
      'running 2 tests',
      'test testa_a ... ok',
      '',
      'test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s',
    ].join('\n');
    assert.deepEqual(rs.countRun(curto, 2), ZERO);
  });

  it('FIX H1 · resumo que NÃO é o último conteúdo do libtest reprova (condição 3)', () => {
    // a forja completa (header + linhas + resumo) seguida de mais conteúdo de
    // teste — não é o fechamento de um relatório real.
    const forjaSeguidaDeTeste = [
      'running 2 tests',
      'test testa_a ... ok',
      'test testa_b ... ok',
      'test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s',
      'test testa_c ... ok',
    ].join('\n');
    assert.deepEqual(rs.countRun(forjaSeguidaDeTeste, 2), ZERO);
  });

  it('FIX H1 · números do bloco inconsistentes com as linhas por-teste reprova (condição 4)', () => {
    // duas linhas ok, resumo diz 3 passed
    const inflado = [
      'running 2 tests',
      'test testa_a ... ok',
      'test testa_b ... ok',
      '',
      'test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s',
    ].join('\n');
    assert.deepEqual(rs.countRun(inflado, 2), ZERO);
    // veredito `ok` com failed > 0 é contradição do libtest
    const contraditorio = [
      'running 2 tests',
      'test testa_a ... ok',
      'test testa_b ... FAILED',
      '',
      'test result: ok. 1 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s',
    ].join('\n');
    assert.deepEqual(rs.countRun(contraditorio, 2), ZERO);
  });
});

describe('rust — (13) failureExitCodes: 0 passou · 101 FALHOU (não 1)', () => {
  it('exit 101 é o panic do Rust (inclusive assert_eq! falho) E o erro de compilação', () => {
    assert.equal(RS_EXIT_PANIC, 101);
    assert.ok(rs.failureExitCodes.isFailure(101));
    assert.match(rs.failureExitCodes.meaning(101), /101/);
    assert.match(rs.failureExitCodes.meaning(101), /compila/);
  });

  it('exit 1 é erro de uso do cargo; 0 é sucesso; 137 é timeout-OU-OOM (nunca afirmar qual)', () => {
    assert.ok(rs.failureExitCodes.isFailure(1));
    assert.ok(!rs.failureExitCodes.isFailure(0));
    assert.equal(rs.failureExitCodes.meaning(137), 'timeout-ou-OOM');
    assert.equal(rs.failureExitCodes.meaning(42), 'exit 42');
  });

  it('a dupla-igualdade é INVARIANTE — nenhum adaptador pode dispensá-la', () => {
    assert.equal(rs.failureExitCodes.successRequiresCountMatch, true);
    // e Rust TEM o buraco do Node: `running 0 tests` sai 0 — por isso o gate
    // de contagem é obrigatório também aqui.
    assert.ok(rs.failureExitCodes.isFailure(0) === false, 'exit 0 com 0 testes é o caso do gate de contagem');
  });
});

describe('rust — (14) envScrub: o veneno do §6 obs. 2 e o RUSTC pinado', () => {
  it('`fixed` e `strip` NUNCA se sobrepõem (as duas semânticas fariam o oposto)', () => {
    const strip = new Set(rs.envScrub.strip);
    for (const chave of Object.keys(rs.envScrub.fixed)) {
      assert.ok(!strip.has(chave), `${chave} está em fixed E em strip`);
    }
  });

  it('a allowlist constrói o ambiente do NADA e remove o veneno Rust', () => {
    const base = {
      PATH: '/usr/bin',
      HOME: '/home/dev',
      RUSTFLAGS: '-C link-arg=veneno',
      CARGO_TARGET_DIR: '/fora/do/desafio',
      RUSTUP_HOME: '/outra/toolchain',
      CARGO_HOME: '/outro/cargo',
      SEGREDO_DA_MAQUINA: 'x',
    };
    const env = applyEnvScrub(rs.envScrub, base);
    assert.equal(env.RUSTFLAGS, undefined, 'o veneno nomeado no §6 obs. 2');
    assert.equal(env.CARGO_TARGET_DIR, undefined, 'o build fica DENTRO do diretório isolado');
    assert.equal(env.RUSTUP_HOME, undefined, 'a toolchain é a que o detect() resolveu');
    assert.equal(env.CARGO_HOME, undefined);
    assert.equal(env.SEGREDO_DA_MAQUINA, undefined, 'allowlist: o que não foi permitido não passa');
    assert.equal(env.PATH, '/usr/bin', 'sem PATH o spawn nem acha o binário');
    assert.equal(env.CARGO_NET_OFFLINE, 'true', 'nunca toca crates.io');
    assert.equal(env.CARGO_INCREMENTAL, '0', 'build incremental é estado entre execuções');
    assert.equal(env.CARGO_TERM_COLOR, 'never', 'ANSI derruba o regex de contagem');
    assert.equal(env.LC_ALL, ENV_NUCLEO_COMUM.LC_ALL);
    assert.equal(env.TZ, ENV_NUCLEO_COMUM.TZ);
  });

  it('RUSTC/RUSTDOC ficam em fixed (PINADOS), e o pin é o caminho REAL da toolchain', () => {
    // O cargo REAL despacha o rustc pelo PATH — o PROXY do rustup numa máquina
    // de dev — e o filho morre sem o pin (medido: "rustup could not choose a
    // version of rustc"). `allow` é vazio: nada disso é herdado.
    assert.deepEqual([...rs.envScrub.allow], []);
    const d = rsDetect();
    if (d.version !== null && d.ok) {
      assert.match(rs.envScrub.fixed.RUSTC ?? '', /\/bin\/rustc$/, 'o pin é o rustc REAL');
    } else {
      assert.equal(rs.envScrub.fixed.RUSTC, undefined, 'sem toolchain não há pin (spawn fail-closed no detect)');
    }
  });

  it('o `scope` DECLARA os limites, inclusive o do exit-guard', () => {
    const texto = rs.envScrub.scope.join('\n');
    assert.match(texto, /exit-guard/, 'limite escondido é pior que limite nenhum');
    assert.match(texto, /socket cru/);
    assert.ok(rs.envScrub.scope.some((l) => l.startsWith('LIMITE:')));
  });

  it('a política é reconstruível (o reset re-resolve o pin)', () => {
    const antes = rs.envScrub.fixed;
    rsResetEnvScrub();
    assert.deepEqual(rs.envScrub.fixed, antes);
  });
});

// ---------------------------------------------------------------------------
// A SEMENTE RECEPTIVA × O HARNESS REAL
// ---------------------------------------------------------------------------

describe('rust — a semente receptiva cobre o harness REAL, e nada além dele', () => {
  /** Os harnesses que a trilha de fato escreve, por forma (o análogo dos
   * `harness-fase-*.py`): teste de integração e módulo de testes interno. */
  const HARNESSES = ['harness-desafio.rs', 'harness-mod-testes.rs'] as const;

  const PERDOADO = new Set<string>([
    ...RUST_HARNESS_RECEPTIVE_SEED,
    ...RUST_STRUCTURAL_ALWAYS_ALLOWED,
  ]);

  function chavesDoHarness(nome: string): Set<string> {
    return new Set(chavesDe(fs.readFileSync(path.join(FIXTURES, nome), 'utf8')));
  }

  it('FORMA INTEGRAÇÃO: toda chave do harness `use desafio::…` está na semente ∪ estrutural', { skip: TEM_CARGO ? false : true }, () => {
    const chaves = [...chavesDoHarness('harness-desafio.rs')].sort();
    // guarda de sanidade: se o fixture parasse de ser o harness da forma
    // `import`, o teste passaria vazio e não provaria nada.
    for (const marca of ['api:test', 'api:assert_eq!', 'node:UseDeclaration']) {
      assert.ok(chaves.includes(marca), `o fixture deixou de ser o harness de integração (sem ${marca})`);
    }
    const fora = chaves.filter((k) => !PERDOADO.has(k));
    // A FRONTEIRA declarada (o análogo do `global:ValueError` do lado Python):
    // o `dobro(-3)` do segundo teste é ARGUMENTO — o `op:unary:-` é matéria da
    // aula que ensina negação, entra pelo orçamento CUMULATIVO, nunca pela
    // semente. Só ele fica fora.
    assert.deepEqual(fora, ['op:unary:-'], `o conjunto fora-da-semente mudou: ${fora.join(' ')}`);
    assert.ok(!RUST_HARNESS_RECEPTIVE_SEED.includes('op:unary:-'));
  });

  it('FORMA mod tests: TODO o invólucro do `#[cfg(test)] mod tests` está na semente ∪ estrutural', { skip: TEM_CARGO ? false : true }, () => {
    const chaves = [...chavesDoHarness('harness-mod-testes.rs')].sort();
    for (const marca of ['api:cfg.test', 'node:ModItem', 'api:assert_ne!']) {
      assert.ok(chaves.includes(marca), `o fixture deixou ser o harness de mod interno (sem ${marca})`);
    }
    const fora = chaves.filter((k) => !PERDOADO.has(k));
    assert.deepEqual(fora, [], `o harness de mod interno emite chave que a semente não perdoa: ${fora.join(' ')}`);
  });

  it('`use desafio::X` NÃO emite `api:` — o crate do aluno não é API', { skip: TEM_CARGO ? false : true }, () => {
    for (const nome of HARNESSES) {
      for (const k of chavesDoHarness(nome)) {
        assert.ok(!k.startsWith(`api:${RS_CRATE_NAME}`), `${nome} emitiu ${k} — o crate do aluno não é API`);
      }
    }
    for (const k of RUST_HARNESS_RECEPTIVE_SEED) {
      assert.ok(!k.startsWith(`api:${RS_CRATE_NAME}`), `a semente cresceu com ${k} — crate do aluno não é API`);
    }
  });

  it('o ARGUMENTO do teste é conteúdo — `op:unary:-` NÃO entra na semente', { skip: TEM_CARGO ? false : true }, () => {
    // `dobro(-3)` emite `op:unary:-` sobre o harness. Nada do harness emite
    // isso — é o NÚMERO NEGATIVO do argumento, matéria da aula que o ensina.
    // A semente perdoa invólucro, nunca argumento (o análogo exato do
    // `dobro(-3)` do lado Python).
    const comNegativo =
      `${fs.readFileSync(path.join(FIXTURES, 'harness-desafio.rs'), 'utf8')}` +
      '\n#[test]\nfn testa_dobro_de_negativo() {\n    assert_eq!(dobro(-3), -6);\n}\n';
    const fora = [...new Set(chavesDe(comNegativo))].filter((k) => !PERDOADO.has(k)).sort();
    assert.deepEqual(fora, ['op:unary:-']);
    for (const k of fora) assert.ok(!RUST_HARNESS_RECEPTIVE_SEED.includes(k), k);
  });

  it('NADA SOBRA: toda chave da semente é emitida por algum harness real', { skip: TEM_CARGO ? false : true }, () => {
    const emitidas = new Set<string>();
    for (const nome of HARNESSES) for (const k of chavesDoHarness(nome)) emitidas.add(k);
    const gordura = RUST_HARNESS_RECEPTIVE_SEED.filter((k) => !emitidas.has(k));
    assert.deepEqual(
      [...gordura],
      [],
      `semente é PERDÃO: estas chaves perdoam construções que nenhum harness lê — ${gordura.join(' ')}`,
    );
  });

  it('a semente NÃO empresta nada do harness de JavaScript/Python', { skip: TEM_CARGO ? false : true }, () => {
    // Redundante com engineLangPython por escolha: é a invariante que a
    // tentação de "crescer a lista para o gate passar" quebra primeiro.
    for (const k of RUST_HARNESS_RECEPTIVE_SEED) {
      assert.ok(!k.startsWith('form:'), `o eixo form: está desabilitado em Rust (${k})`);
      assert.ok(!k.includes('node:test') && !k.includes('unittest'), k);
      assert.ok(!k.startsWith('api:solucao'), k);
    }
  });

  it('as tabelas da engine respondem por rust (o gate do orçamento destravado)', () => {
    assert.ok(harnessReceptiveSeed('rust').includes('api:assert_eq!'));
    assert.ok(structuralAlwaysAllowed('rust').includes('node:SourceFile'));
    assert.equal(exigirAdaptadorComCaminhada('rust').id, 'rust', 'a caminhada lang-node cobre rust');
  });
});

// ---------------------------------------------------------------------------
// Requirements: derivação a partir dos NOMES dos testes + bijeção
// ---------------------------------------------------------------------------

describe('rust — requirements: um por `#[test] fn`, com descrição derivada do assert', () => {
  const TESTS = [
    'use desafio::dobro;',
    '',
    '#[test]',
    'fn testa_dobro_positivo() {',
    '    assert_eq!(dobro(2), 4);',
    '}',
    '',
    '#[test]',
    'fn testa_dobro_negativo() {',
    '    assert_eq!(dobro(-3), -6);',
    '}',
  ].join('\n');
  const SOLUTION = 'pub fn dobro(x: i32) -> i32 {\n    x * 2\n}\n';

  it('deriva um requirement POR TESTE, na ordem, com a descrição do TEXTO REAL', { skip: TEM_CARGO ? false : true }, () => {
    const { requirements, cobertura } = derivarRequirements(TESTS, SOLUTION, '', 'rust');
    assert.equal(requirements.length, 2);
    assert.deepEqual(requirements.map((r) => r.teste), ['testa_dobro_positivo', 'testa_dobro_negativo']);
    assert.deepEqual(requirements.map((r) => r.id), ['REQ-1', 'REQ-2']);
    assert.match(requirements[0].descricao, /A função dobro deve devolver 4 quando chamada com 2\./);
    assert.match(requirements[1].descricao, /devolver -6 quando chamada com -3/);
    // cobertura: os átomos do trecho da SOLUÇÃO que declara a função chamada
    assert.ok(cobertura[0].atoms.includes('node:FunctionItem'), JSON.stringify(cobertura[0]));
    assert.ok(cobertura[0].atoms.includes('op:binary:*'), 'o corpo do dobro tem a multiplicação');
  });

  it('a bijeção fecha: requirement sem teste e teste sem requirement são GAP', { skip: TEM_CARGO ? false : true }, () => {
    const declarados: RequirementDeclarado[] = [
      { id: 'REQ-1', teste: 'testa_dobro_positivo' },
      { id: 'REQ-2', teste: 'testa_dobro_negativo' },
    ];
    const ok = validarRequirements(TESTS, declarados, 'rust');
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.semTeste, []);
    assert.deepEqual(ok.testesSemRequirement, []);

    const falha = validarRequirements(TESTS, [declarados[0]], 'rust');
    assert.equal(falha.ok, false);
    assert.deepEqual(falha.testesSemRequirement, ['testa_dobro_negativo']);
  });
});

// ---------------------------------------------------------------------------
// O sintetizador (coverage): literais primeiro, referência por último
// ---------------------------------------------------------------------------

describe('rust — o sintetizador mínimo: ECO, LITERAL e a REFERÊNCIA por último', () => {
  const TESTS_UM_CASO =
    'use desafio::dobro;\n\n#[test]\nfn testa_dobro() {\n    assert_eq!(dobro(2), 4);\n}\n';
  const STARTER = 'pub fn dobro(x: i32) -> i32 {\n    todo!()\n}\n';
  const SOLUTION = 'pub fn dobro(x: i32) -> i32 {\n    x * 2\n}\n';

  it('extrai a forma import, as funções-alvo e os asserts', { skip: TEM_CARGO ? false : true }, () => {
    const r = extrairLiteraisDoTesteRust(TESTS_UM_CASO);
    assert.ok(r.ok);
    assert.equal(r.dados.forma, 'import');
    assert.deepEqual(r.dados.funcoesAlvo, ['dobro']);
    assert.equal(r.dados.asserts.length, 1);
    assert.equal(r.dados.asserts[0].funcao, 'dobro');
    assert.equal(r.dados.asserts[0].esperado, '4');
  });

  it('gera LITERAL como a assinatura do starter com o corpo trocado', { skip: TEM_CARGO ? false : true }, () => {
    const dados = extrairLiteraisDoTesteRust(TESTS_UM_CASO);
    assert.ok(dados.ok);
    const candidatos = gerarCandidatosRust(STARTER, SOLUTION, dados.dados);
    assert.ok(candidatos.length >= 2, `esperado literal + referência, veio ${candidatos.length}`);
    assert.match(
      candidatos[0],
      /pub fn dobro\(x: i32\) -> i32 \{\n    4\n\}/,
      'o candidato mínimo PRESERVA a assinatura e troca só o corpo',
    );
    assert.equal(candidatos[candidatos.length - 1], SOLUTION, 'a REFERÊNCIA é o ÚLTIMO candidato');
  });

  it('teste com ≥2 casos divergentes SÓ fecha com a referência (o defeito §3.1.2)', { skip: TEM_CARGO ? false : true }, () => {
    const dois = `${TESTS_UM_CASO}\n#[test]\nfn testa_outro() {\n    assert_eq!(dobro(3), 6);\n}\n`;
    const dados = extrairLiteraisDoTesteRust(dois);
    assert.ok(dados.ok);
    const candidatos = gerarCandidatosRust(STARTER, SOLUTION, dados.dados);
    // Os literais (4 e 6) vêm ANTES, e a referência FECHA o que eles não fecham:
    assert.ok(candidatos.some((c) => c.includes('    4\n')), 'o literal do caso 1 continua na ordem');
    assert.ok(candidatos.some((c) => c.includes('    6\n')), 'o literal do caso 2 também');
    assert.equal(candidatos[candidatos.length - 1], SOLUTION, 'e a referência é o último recurso');
  });

  it('forma desconhecida NÃO ganha a referência (o mínimo que é o máximo)', { skip: TEM_CARGO ? false : true }, () => {
    const dados = extrairLiteraisDoTesteRust('#[test]\nfn t() { assert!(true); }\n');
    assert.ok(dados.ok);
    assert.equal(dados.dados.forma, 'desconhecida');
    assert.deepEqual(gerarCandidatosRust(STARTER, SOLUTION, dados.dados), []);
  });

  it('sintetiza de verdade contra o prover (cargo REAL, offline, sob o semáforo)', { skip: TEM_CARGO ? false : true }, async () => {
    // O prover OFICIAL (f9Verifier) — spawn do cargo endurecido pelo harness.
    const prover = criarProverDeDesafio({ limiter: undefined });
    const veredito = await sintetizarCodigoMinimoRust(prover, {
      starterCode: STARTER,
      solutionCode: SOLUTION,
      testsCode: TESTS_UM_CASO,
      expectedTestCount: 1,
      language: 'rust',
    });
    assert.ok(veredito.ok, `síntese falhou: ${JSON.stringify(veredito)}`);
    assert.match(veredito.minimalCode, /pub fn dobro\(x: i32\) -> i32 \{\n    4\n\}/);
    assert.ok(veredito.atoms.includes('node:FunctionItem'));
    assert.ok(veredito.atoms.includes('node:IntegerLiteral'));
    assert.ok(!veredito.atoms.includes('op:binary:*'), 'o LITERAL não precisa da multiplicação — é o que expõe o EXCESSO da aula');
    assert.deepEqual(veredito.atomsDoTeste, [], 'o enriquecimento é VAZIO (os átomos do teste são harness)');
  });

  it('o stub vazio de Rust é o lib.rs vazio (não o `export {}` de JavaScript)', () => {
    assert.equal(RS_EMPTY_STUB_CODE, '');
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

function rodarCargo(dir: string): { status: number | null; saida: string } {
  const res = spawnSync(rs.detect().binary, [...rs.testCommand], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 60_000,
    env: applyEnvScrub(rs.envScrub, process.env),
  });
  return { status: res.status ?? -1, saida: `${res.stdout ?? ''}\n${res.stderr ?? ''}` };
}

const TESTS_PONTA_A_PONTA =
  'use desafio::dobro;\n\n#[test]\nfn testa_dobro_positivo() {\n    assert_eq!(dobro(2), 4);\n}\n\n#[test]\nfn testa_dobro_negativo() {\n    assert_eq!(dobro(-3), -6);\n}\n';

describe('rust — ponta a ponta: cargo REAL, offline, e a dupla-igualdade fecha', () => {
  it('Q2a · a SOLUÇÃO passa: exit 0, 2 testes, DECLARADO === EXECUTADO === esperado', { skip: TEM_CARGO ? false : true }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-rs-ok-'));
    try {
      escrever(rs.layout({ code: 'pub fn dobro(x: i32) -> i32 {\n    x * 2\n}\n', testsCode: TESTS_PONTA_A_PONTA }), dir);
      const { status, saida } = rodarCargo(dir);
      assert.equal(status, 0, saida);
      assert.ok(!rs.failureExitCodes.isFailure(status));

      const executado = rs.countRun(saida);
      const declarado = rs.countDeclared(TESTS_PONTA_A_PONTA);
      assert.equal(declarado, 2);
      assert.deepEqual(executado, { testsRun: 2, pass: 2, fail: 0, skipped: 0 });
      assert.equal(executado.testsRun, declarado, 'a dupla-igualdade do §6 obs. 3');
      assert.deepEqual(
        rs.parseChecks(saida).sort((a, b) => a.name.localeCompare(b.name)),
        [
          { name: 'testa_dobro_negativo', passed: true },
          { name: 'testa_dobro_positivo', passed: true },
        ],
        'cargo roda em paralelo — a ORDEM dos checks não é determinística, o conjunto é',
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('Q2b · o STARTER (todo!) FALHA com exit 101 — não 1 (o fato do docs/research/06)', { skip: TEM_CARGO ? false : true }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-rs-starter-'));
    try {
      escrever(rs.layout({ code: 'pub fn dobro(x: i32) -> i32 {\n    todo!()\n}\n', testsCode: TESTS_PONTA_A_PONTA }), dir);
      const { status, saida } = rodarCargo(dir);
      assert.equal(status, RS_EXIT_PANIC, saida);
      assert.ok(rs.failureExitCodes.isFailure(status));
      assert.match(saida, /not implemented|panicked/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('Q2c · a CONTAGEM BATE e o STUB VAZIO falha por E0432 (não por sintaxe)', { skip: TEM_CARGO ? false : true }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-rs-stub-'));
    try {
      escrever(rs.layout({ code: '', testsCode: TESTS_PONTA_A_PONTA }), dir);
      const { status, saida } = rodarCargo(dir);
      assert.equal(status, RS_EXIT_PANIC, saida);
      assert.match(saida, /error\[E0432\]/, 'unresolved import — o teste EXERCE o código do aluno');
      // e o lado DECLARADO bate com o esperado do desafio (prova 3)
      assert.equal(rs.countDeclared(TESTS_PONTA_A_PONTA), 2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('Q2d · solução ERRADA: exit 101 e o relatório acusa a falha', { skip: TEM_CARGO ? false : true }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-rs-fail-'));
    try {
      escrever(rs.layout({ code: 'pub fn dobro(x: i32) -> i32 {\n    x * 3\n}\n', testsCode: TESTS_PONTA_A_PONTA }), dir);
      const { status, saida } = rodarCargo(dir);
      assert.equal(status, RS_EXIT_PANIC, saida);
      const contagem = rs.countRun(saida);
      assert.equal(contagem.testsRun, 2);
      assert.equal(contagem.fail, 2, 'x * 3 erra os DOIS casos (2→6≠4, -3→-9≠-6)');
      assert.ok(saida.includes('left') && saida.includes('right'), 'assert_eq! mostra os dois lados');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('Q2e · 0 testes declarados sai 0 — o buraco do Node repetido, fechado pela contagem', { skip: TEM_CARGO ? false : true }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-rs-zero-'));
    try {
      escrever(rs.layout({ code: 'pub fn dobro(x: i32) -> i32 { x * 2 }\n', testsCode: '// nenhum teste\n' }), dir);
      const { status, saida } = rodarCargo(dir);
      assert.equal(status, 0, `${saida}\n— o cargo sai 0 com \`running 0 tests\`, como o node:test vazio`);
      assert.equal(rs.countRun(saida).testsRun, 0, 'e a contagem EXECUTADA é 0 — o gate reprova');
      assert.equal(rs.countDeclared('// nenhum teste\n'), 0, 'e o lado DECLARADO é 0 — a prova 3 reprova antes');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('Q2f · EXIT-GUARD: o `#[test]` FORJADO no código do aluno NEM RODA ([lib] test = false)', { skip: TEM_CARGO ? false : true }, () => {
    // A forja da CRITICAL 1, portada para Rust: um teste no lib.rs que imprime
    // um resumo mentiroso e mata o processo com exit 0. MEDIDO: com o
    // manifesto do layout (`[lib] test = false`), o cargo NEM O COLETA —
    // `running 2 tests` são só os do desafio, e o exit 0 é legítimo.
    const FORJA = [
      'pub fn dobro(x: i32) -> i32 {',
      '    x * 2',
      '}',
      '',
      '#[cfg(test)]',
      'mod forjado {',
      '    #[test]',
      '    fn testa_forjado() {',
      '        println!("test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out");',
      '        std::process::exit(0);',
      '    }',
      '}',
    ].join('\n');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-rs-forja-'));
    try {
      escrever(rs.layout({ code: FORJA, testsCode: TESTS_PONTA_A_PONTA }), dir);
      const { status, saida } = rodarCargo(dir);
      assert.equal(status, 0, `${saida}\n— exit 0 LEGÍTIMO: a forja nunca executou`);
      assert.equal(rs.countRun(saida).testsRun, 2, 'os 2 testes do desafio, não os 2 da forja');
      assert.ok(!saida.includes('9 passed'), 'nenhum resumo forjado na saída');
      // e a DEFESA ESTÁTICA: a forja tem `std::process::exit` — o orçamento
      // reprova o desafio inteiro na auditoria, antes de qualquer execução.
      const extraido = extractAtoms(FORJA, { fileName: RS_ENTRY_PATH, language: 'rust' });
      assert.ok(extraido.ok);
      assert.ok(
        extraido.keys.some((k) => RS_FORBIDDEN_INVARIANTS.includes(k)),
        `a forja emite chave proibida: ${extraido.keys.join(' ')}`,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('Q2g · REGRESSÃO H1: a forja do revisor (write_all no fd + exit 0) NÃO aprova solução errada', { skip: TEM_CARGO ? false : true }, () => {
    // O ataque MEDIDO do revisor adversarial, verbatim (o corpo do lib.rs é o
    // fixture ataque-resumo-forjado.rs): `write_all` em std::io::stdout()
    // BYPASSA a captura do libtest (que só intercepta `println!`) e
    // `std::process::exit(0)` mata o runner — exit 0 com o bloco forjado por
    // ÚLTIMO, o resumo real nunca sai. É o caminho do SUBMIT do aluno
    // (runStudentCode), que não passa pelo gate de autoria.
    const ATAQUE = fs.readFileSync(path.join(FIXTURES, 'ataque-resumo-forjado.rs'), 'utf8');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-rs-forja-fd-'));
    try {
      escrever(rs.layout({ code: ATAQUE, testsCode: TESTS_PONTA_A_PONTA }), dir);
      const { status, saida } = rodarCargo(dir);
      assert.equal(status, 0, `${saida}\n— o ataque mata o runner com exit 0`);
      assert.ok(saida.includes('test result: ok. 2 passed'), 'o bloco FORJADO está na saída (a forja executou)');

      // O CAMINHO DO RUNTIME (runStudentCode/proofs): a contagem declarada
      // liga a integridade — a forja não tem header nem linhas por-teste.
      const declarado = rs.countDeclared(TESTS_PONTA_A_PONTA);
      assert.equal(declarado, 2);
      const counts = rs.countRun(saida, declarado);
      assert.deepEqual(counts, { testsRun: 0, pass: 0, fail: 0, skipped: 0 }, 'o contador NÃO aceita o resumo forjado');
      // e o veredito de submit reprova: passed = exit 0 && testsRun === 2 && declared === 2
      assert.equal(status === 0 && counts.testsRun === 2 && declarado === 2, false, 'passed === false');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('Q1 · a trilha fixture de Rust passa na CAMINHADA da engine (parser certo, never o alheio)', { skip: TEM_CARGO ? false : true }, () => {
    // O gates multilíngue: `challenge.language: "rust"` resolve o adaptador
    // RUST (não o de JavaScript, que aprovaria qualquer coisa), a caminhada é
    // a genérica (lang-node), e o orçamento deriva com as tabelas de Rust.
    const trackJson = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, 'fixtures', 'tracks', 'trilha-rust-minima', 'track.json'),
        'utf8',
      ),
    ) as { programmingLanguage?: string };
    assert.equal(adapterIdForChallengeLanguage(trackJson.programmingLanguage), 'rust');

    const challengeJson = JSON.parse(
      fs.readFileSync(
        path.join(
          __dirname,
          'fixtures', 'tracks', 'trilha-rust-minima', 'modules', 'modulo-1',
          'lessons', 'a-primeira-funcao', 'challenges', 'dobre-o-numero', 'challenge.json',
        ),
        'utf8',
      ),
    ) as { language: string; testsCode: string; solutionCode: string; expectedTestCount: number };

    assert.equal(adapterIdForChallengeLanguage(challengeJson.language), 'rust');
    const extraido = extractAtoms(challengeJson.solutionCode, { fileName: RS_ENTRY_PATH, language: 'rust' });
    assert.ok(extraido.ok);
    assert.ok(extraido.keys.includes('node:FunctionItem'));
    assert.ok(extraido.keys.includes('op:binary:*'));
    assert.ok(!extraido.keys.includes('node:FunctionDeclaration'), 'não é o parser de JavaScript');
    assert.ok(!extraido.keys.includes('node:FunctionDef'), 'não é o parser de Python');
    assert.equal(rs.countDeclared(challengeJson.testsCode), challengeJson.expectedTestCount,
      'a dupla-igualdade fecha na trilha fixture');
  });
});

// ---------------------------------------------------------------------------
// FIX M2 — NÃO-PODRIDÃO: a trilha fixture passa na PRÓPRIA auditoria
// ---------------------------------------------------------------------------

describe('rust — a trilha fixture passa na própria auditoria (o gate que a mede)', () => {
  it('audit da fixture: 0 violações (a fixture não pode apodrecer em silêncio)', async () => {
    // O MESMO gate do CLI (`track-engine/cli.ts audit`): trilha carregada,
    // orçamento cumulativo derivado, cada superfície confrontada. A fixture é
    // a régua dos testes da engine — se ela mesma viola A1–A4, a régua não
    // mede nada. Este teste é a anti-podridão: qualquer edição na
    // lesson.json/challenge.json que introduza construção fora do orçamento
    // reprova AQUI, sem precisar rodar o CLI na mão.
    const track = await loadTrack(path.join(__dirname, 'fixtures', 'tracks', 'trilha-rust-minima'));
    const report = auditTrack(track);
    assert.deepEqual(
      report.violations.map((v) => `${v.regra} ${v.campo} ${v.construcao ?? ''}`.trim()),
      [],
      `a fixture voltou a violar a própria engine: ${JSON.stringify(report.violations)}`,
    );
    assert.equal(report.totals.violacoes, 0);
    assert.equal(report.totals.aulas, 1);
    assert.equal(report.totals.desafios, 1);
  });

  it('a lesson da fixture declara o que a teoria demonstra (op:unary:- tem P-FORMA)', { skip: TEM_CARGO ? false : true }, () => {
    // A negação (`dobro(-3)` no teste real da trilha anterior) é RECEPTIVA e
    // DEMONSTRADA num bloco ```rust da teoria: o aluno LÊ a construção antes
    // de qualquer superfície usá-la.
    const lessonJson = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, 'fixtures', 'tracks', 'trilha-rust-minima', 'modules', 'modulo-1', 'lessons', 'a-primeira-funcao', 'lesson.json'),
        'utf8',
      ),
    ) as { introduces: { productive: string[]; receptive: string[] }; theory: { markdown: string }[] };
    assert.ok(lessonJson.introduces.receptive.includes('op:unary:-'));
    assert.ok(lessonJson.introduces.receptive.includes('node:UnaryExpression'));
    const demostrado = lessonJson.theory.some((bloco) => bloco.markdown.includes('```rust\ndobro(-3)'));
    assert.ok(demostrado, 'a negação tem demonstração em bloco ```rust (P-FORMA)');
  });
});
