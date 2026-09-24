/**
 * tests/cx-langqual-lang-rust.test.ts — CARACTERIZAÇÃO (golden master) do
 * adaptador de Rust (`engine/lang/rust.ts`). Rede de segurança para a
 * refatoração das ondas seguintes.
 *
 * Contratos que mordem aqui:
 *   1. `rsParse` (node + WASM em subprocesso) é FAIL-CLOSED: fonte quebrado
 *      vira `PARSE_ERROR` estruturado — nunca exceção, nunca árvore parcial —
 *      e a árvore é memoizada por `fileName + source`;
 *   2. `rsResolveScopes` tem DUAS camadas: itens são hoisted no arquivo
 *      inteiro (chamar fn declarada depois NÃO é referência livre) e `use`
 *      entra em `imported` ⊆ `declared`;
 *   3. `rsConstructKey` cobre 5 eixos com precedência declKind → globalName →
 *      apiPath → operatorFamily+operator → node:;
 *   4. A DUPLA-IGUALDADE com a ARMADILHA do libtest: `rsCountDeclared` conta
 *      `#[test] fn` por AST (atributo é IRMÃO; comentário não conta); e
 *      `rsCountRun(output, declarado?)` tem DUAS semânticas — sem `declarado`
 *      é o último bloco `test result:` (a régua dos unitários); COM
 *      `declarado` o bloco só vale se passar na integridade `resumoIntegro`
 *      (cabeçalho `running N tests` == declarado, ≥N linhas por-teste
 *      distintas, resumo por ÚLTIMO, números consistentes) — a forja de
 *      relatório por exit cedo volta ZERO;
 *   5. O MANIFESTO trava `[lib] test = false` + `doctest = false` (o #[test]
 *      forjado no código do aluno nem roda) e `[dependencies]` vazio; o
 *      envScrub PINA RUSTC/RUSTDOC e remove o veneno (RUSTFLAGS,
 *      CARGO_TARGET_DIR, RUSTUP_* e CARGO_*, wrappers, proxies, ANSI).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  rsExtractorPath,
  rsAtomsPath,
  RS_BINARIOS,
  rsDetect,
  rsResetDetectCache,
  rsRunnerBinary,
  rsInventarioBruto,
  rsResetInventarioCache,
  rsInventory,
  rsGlobals,
  rsBuiltins,
  rsResetParseCache,
  rsParse,
  rsApplyParseEnv,
  rsResolveScopes,
  rsConstructKey,
  RS_FORBIDDEN_INVARIANTS,
  RS_CRATE_NAME,
  RS_ENTRY_PATH,
  RS_TEST_PATH,
  RS_MANIFEST_PATH,
  RS_MANIFEST_CONTENT,
  rsLayout,
  RS_SAFE_FILE_PATH_RE,
  RS_TEST_COMMAND,
  rsCountDeclared,
  rsCountRun,
  rsParseChecks,
  RS_FAILURE_POLICY,
  RS_EXIT_PANIC,
  rsEnvScrub,
  rsResetEnvScrub,
  RS_THEORY_FENCE_TAGS,
  RS_CHALLENGE_LANGUAGES,
  RS_DEFAULT_RUNTIME,
  rustAdapter,
  RS_FORM_AXIS_SUPPORTED,
} from '../electron/main/engine/lang/rust';
import type { LangNode, ParseOk } from '../electron/main/engine/lang/registry';

const TEM_RS = rsDetect().ok;
const SEM_EXTRATOR = rsExtractorPath() === null;

function no(type: string, attributes: Record<string, string> = {}): LangNode {
  return { type, line: 1, column: 1, start: 0, end: 0, text: '', attributes, children: [] };
}

function todosOsNos(raiz: LangNode): LangNode[] {
  return [raiz, ...raiz.children.flatMap(todosOsNos)];
}

describe('rust — (0) identidade e constantes do contrato', () => {
  it('binários, caminhos e comando do runner são os pinados', () => {
    assert.deepEqual([...RS_BINARIOS], ['cargo']);
    assert.equal(RS_CRATE_NAME, 'desafio');
    assert.equal(RS_ENTRY_PATH, 'src/lib.rs');
    assert.equal(RS_TEST_PATH, 'tests/desafio.rs');
    assert.equal(RS_MANIFEST_PATH, 'Cargo.toml');
    assert.deepEqual([...RS_TEST_COMMAND], ['test', '--offline'], 'sem filtro de nome (footgun medido) + nunca rede');
  });

  it('identidade do adaptador: label, tags, tokens, runtime, form DESLIGADO', () => {
    assert.equal(rustAdapter.id, 'rust');
    assert.equal(rustAdapter.label, 'Rust');
    assert.deepEqual([...RS_THEORY_FENCE_TAGS], ['rust', 'rs']);
    assert.deepEqual([...RS_CHALLENGE_LANGUAGES], ['rust', 'rs']);
    assert.equal(RS_DEFAULT_RUNTIME, 'cargo');
    assert.equal(RS_FORM_AXIS_SUPPORTED, false);
    assert.strictEqual(rustAdapter.detect, rsDetect);
  });

  it('as proibições globais cobrem a FORJA de relatório (exit/abort/ExitCode/extern/asm/…)', () => {
    assert.deepEqual(
      [...RS_FORBIDDEN_INVARIANTS],
      [
        'api:std::process::exit',
        'api:std::process::abort',
        'api:std::process::ExitCode',
        'node:ForeignModItem',
        'api:asm!',
        'api:naked_asm!',
        'api:link_section',
        'api:export_name',
      ],
    );
  });

  it('os artefatos do extrator e do inventário existem no disco', () => {
    assert.match(rsExtractorPath() ?? '', /rs[/\\]extract_ast\.mjs$/);
    assert.match(rsAtomsPath() ?? '', /atoms\.rust\.json$/);
  });

  it('o MANIFESTO trava lib test=false, doctest=false, edition 2021 e dependencies VAZIO', () => {
    assert.equal(typeof RS_MANIFEST_CONTENT, 'string');
    assert.ok(RS_MANIFEST_CONTENT.includes('name = "desafio"'));
    assert.ok(RS_MANIFEST_CONTENT.includes('edition = "2021"'));
    assert.ok(RS_MANIFEST_CONTENT.includes('[lib]'));
    assert.ok(RS_MANIFEST_CONTENT.includes('test = false'));
    assert.ok(RS_MANIFEST_CONTENT.includes('doctest = false'));
    assert.ok(RS_MANIFEST_CONTENT.includes('[dependencies]'));
  });
});

describe('rust — (1) inventário, globais e builtins (do artefato GERADO)', () => {
  it('o inventário vem do artefato gerado (nunca digitado) e traz os sintéticos', { skip: SEM_EXTRATOR ? 'sem artefatos' : false }, () => {
    const bruto = rsInventarioBruto();
    assert.ok(bruto !== null);
    assert.equal(bruto.schema, 1);
    const inv = [...rsInventory()];
    assert.ok(inv.length >= 50, `inventário pequeno demais: ${inv.length}`);
    assert.ok(inv.includes('FunctionItem'));
    for (const sintetico of ['MutableReference', 'ElseIf', 'ForeignMod']) {
      assert.ok(inv.includes(sintetico), `sintético ${sintetico} tem de estar no inventário`);
    }
    for (const portador of ['GlobalRef', 'ApiRef', 'Op']) {
      assert.ok(!inv.includes(portador), `portador ${portador} NÃO é tipo de inventário (a chave sai no atributo)`);
    }
  });

  it('globais são o prelude da std (String/Vec/Some/Clone…) e builtins COINCIDEM com globais', { skip: SEM_EXTRATOR ? 'sem artefatos' : false }, () => {
    const g = rsGlobals();
    for (const nome of ['String', 'Vec', 'Some', 'Clone']) {
      assert.ok(g.has(nome), `prelude sem ${nome}`);
    }
    assert.deepEqual([...rsBuiltins()].sort(), [...g].sort(), 'em Rust os dois conjuntos coincidem');
  });

  it('os memos de inventário são reconstruíveis (reset ⇒ mesmo valor)', { skip: SEM_EXTRATOR ? 'sem artefatos' : false }, () => {
    const antes = rsInventarioBruto();
    rsResetInventarioCache();
    assert.deepEqual(rsInventarioBruto(), antes);
  });
});

describe('rust — (2) detect() e a degradação honesta', () => {
  it('com cargo e extrator: ok, versão ≥ dígito.dígito, sem degradação', { skip: TEM_RS ? false : 'sem cargo' }, () => {
    const d = rsDetect();
    assert.equal(d.ok, true);
    assert.equal(d.degradacao, null);
    assert.match(d.version ?? '', /^\d+\.\d+/);
  });

  it('rsRunnerBinary() é o MESMO binary do detect()', () => {
    assert.equal(rsRunnerBinary(), rsDetect().binary);
  });

  it('o memo de detect é reconstrutível (reset ⇒ mesmo valor)', () => {
    const antes = rsDetect();
    rsResetDetectCache();
    assert.deepEqual(rsDetect(), antes);
  });

  it('sem PATH: detect() NUNCA crasha — ok:false, binary degrada para o nome do binário', () => {
    const pathOriginal = process.env.PATH;
    try {
      process.env.PATH = '';
      rsResetDetectCache();
      const d = rsDetect();
      assert.equal(d.ok, false);
      assert.equal(d.binary, 'cargo', 'sem binário resolvido sobra o nome candidato');
      assert.equal(d.version, null);
      assert.match(d.degradacao ?? '', /nenhum cargo encontrado no PATH/);
    } finally {
      process.env.PATH = pathOriginal;
      rsResetDetectCache();
    }
  });

  it('rsDetect().binary é o cargo REAL da toolchain (`<sysroot>/bin/cargo`) — proxy do rustup se prova pela EXECUÇÃO, nunca por trecho de caminho', { skip: TEM_RS ? false : 'sem cargo' }, () => {
    const d = rsDetect();
    assert.equal(d.ok, true);
    // CONTRATO (comportamento CORRETO, não bug): o cargo REAL da toolchain
    // mora em `<sysroot>/bin/cargo`, e numa instalação rustup o sysroot É
    // `~/.rustup/toolchains/…` (docs/16-engine-de-trilha.md:445,
    // research/06-toolchains.md:606; `resolverToolchainReal` em rust.ts) —
    // o `/.rustup/` no caminho é a PROVA de que é o real: o PROXY do rustup é
    // que vive em `~/.cargo/bin/`. A prova é por EXECUÇÃO (moldada em
    // tests/engineLangRust.test.ts): com RUSTUP_HOME/CARGO_HOME apontando
    // para diretórios VAZIOS, o proxy morre ("rustup could not choose a
    // version of cargo to run") e o real responde "cargo X.Y".
    const rustupVazio = fs.mkdtempSync(path.join('/tmp', 'do-fixhi-rs-rustup-'));
    const cargoVazio = fs.mkdtempSync(path.join('/tmp', 'do-fixhi-rs-cargo-'));
    try {
      const r = spawnSync(d.binary, ['--version'], {
        encoding: 'utf8',
        timeout: 10_000,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          RUSTUP_HOME: rustupVazio,
          CARGO_HOME: cargoVazio,
        },
      });
      assert.equal(r.error, undefined, `binário não executa: ${d.binary} — ${r.error?.message ?? ''}`);
      assert.equal(
        r.status,
        0,
        `binário é o PROXY do rustup (não roda sem toolchain configurada): ${d.binary} — ${r.stderr ?? ''}`,
      );
      assert.match(`${r.stdout}`.trim(), /^cargo \d+\.\d+/, 'o cargo REAL responde a --version com a sua versão');
    } finally {
      fs.rmSync(rustupVazio, { recursive: true, force: true });
      fs.rmSync(cargoVazio, { recursive: true, force: true });
    }
  });
});

describe('rust — (3) parse: fail-closed e árvore normalizada', () => {
  it('parseia Rust real: SourceFile, FunctionItem com name, PrimitiveType com value', { skip: SEM_EXTRATOR ? 'sem extrator' : false }, () => {
    const fonte = 'pub fn dobro(x: i32) -> i32 {\n    return x * 2;\n}\n';
    const r = rsParse(fonte);
    assert.ok(r.ok);
    assert.equal(r.source, fonte);
    assert.equal(r.root.type, 'SourceFile');
    const fn = r.root.children[0];
    assert.equal(fn.type, 'FunctionItem');
    assert.equal(fn.attributes.name, 'dobro');
    assert.equal(fn.line, 1);
    assert.equal(fn.column, 1, 'coluna 1-based, como todo editor mostra');
    assert.ok(fn.children.some((f) => f.type === 'Parameters'));
    assert.ok(fn.children.some((f) => f.type === 'PrimitiveType' && f.attributes.value === 'i32'));
  });

  it('os offsets são ABSOLUTOS e indexam o MESMO source devolvido', { skip: SEM_EXTRATOR ? 'sem extrator' : false }, () => {
    const fonte = 'pub fn dobro(x: i32) -> i32 {\n    return x * 2;\n}\n';
    const r = rsParse(fonte);
    assert.ok(r.ok);
    const retorno = todosOsNos(r.root).find((n) => n.type === 'ReturnExpression');
    assert.ok(retorno, 'ReturnExpression não encontrado');
    assert.equal(retorno.line, 2);
    assert.equal(retorno.column, 5, 'coluna 1-based');
    assert.equal(fonte.slice(retorno.start, retorno.end), retorno.text);
  });

  it('fonte QUEBRADO vira PARSE_ERROR estruturado (nunca exceção, nunca árvore parcial)', { skip: SEM_EXTRATOR ? 'sem extrator' : false }, () => {
    const r = rsParse('fn f( {\n');
    assert.equal(r.ok, false);
    assert.deepEqual(r.error, {
      code: 'PARSE_ERROR',
      message: 'erro de sintaxe (<trecho.rs>): construção não reconhecida pelo parser — verifique a linha indicada',
      line: 1,
      column: 1,
    });
  });

  it('fonte VAZIO parseia (gramática livre — quem reprova é o orçamento)', { skip: SEM_EXTRATOR ? 'sem extrator' : false }, () => {
    const r = rsParse('');
    assert.equal(r.ok, true);
  });

  it('a árvore é MEMOIZADA por fileName+source e o reset reconstrói', { skip: SEM_EXTRATOR ? 'sem extrator' : false }, () => {
    const fonte = 'fn main() {}\n';
    const r1 = rsParse(fonte);
    const r2 = rsParse(fonte);
    assert.strictEqual(r1, r2);
    rsResetParseCache();
    const r3 = rsParse(fonte);
    assert.notStrictEqual(r1, r3);
    assert.deepEqual({ ...r1, native: null }, { ...r3, native: null });
  });

  it('fileName entra na chave do memo E na mensagem de erro de sintaxe', { skip: SEM_EXTRATOR ? 'sem extrator' : false }, () => {
    const a = rsParse('fn f( {\n', { fileName: 'tests/um.rs' });
    const b = rsParse('fn f( {\n', { fileName: 'tests/dois.rs' });
    assert.notStrictEqual(a, b);
    assert.ok(a.ok === false && a.error.message.includes('tests/um.rs'));
    assert.ok(b.ok === false && b.error.message.includes('tests/dois.rs'));
  });
});

describe('rust — (4) escopos (duas camadas) e a chave de orçamento', () => {
  it('itens são HOISTED: chamar fn declarada depois NÃO é referência livre; use entra em imported', { skip: SEM_EXTRATOR ? 'sem extrator' : false }, () => {
    const fonte =
      'use std::collections::HashMap;\nfn aux() { let mut n: String = String::from("x"); println!("{}", n); Some(1); }\nfn depois() { aux(); }\n';
    const r = rsParse(fonte);
    assert.ok(r.ok);
    const sc = rsResolveScopes(r as ParseOk);
    assert.deepEqual([...sc.declared].sort(), ['HashMap', 'aux', 'depois', 'n']);
    assert.deepEqual([...sc.imported], ['HashMap'], 'imported ⊆ declared');
    assert.deepEqual([...sc.free], [], 'aux() é item hoisted — não é referência livre');
    assert.deepEqual([...sc.globals], []);
  });

  it('parâmetro/let são nomes declarados; retorno não gera free', { skip: SEM_EXTRATOR ? 'sem extrator' : false }, () => {
    const fonte = 'pub fn dobro(x: i32) -> i32 {\n    return x * 2;\n}\n';
    const r = rsParse(fonte);
    assert.ok(r.ok);
    const sc = rsResolveScopes(r as ParseOk);
    assert.deepEqual([...sc.declared].sort(), ['dobro', 'x']);
    assert.deepEqual([...sc.free], []);
  });

  it('constructKey cobre 5 eixos com a precedência declKind → globalName → apiPath → op → node:', () => {
    assert.equal(rsConstructKey(no('LetDeclaration', { declKind: 'let-mut' })), 'decl:let-mut');
    assert.equal(rsConstructKey(no('GlobalRef', { globalName: 'String' })), 'global:String');
    assert.equal(rsConstructKey(no('ApiRef', { apiPath: 'String::from' })), 'api:String::from');
    assert.equal(rsConstructKey(no('Op', { operatorFamily: 'compare', operator: '==' })), 'op:compare:==');
    assert.equal(rsConstructKey(no('ElseIf')), 'node:ElseIf');
    assert.equal(
      rsConstructKey(no('X', { declKind: 'const', globalName: 'g', apiPath: 'p' })),
      'decl:const',
    );
  });
});

describe('rust — (5) a dupla-igualdade e o resumo INTEGRO do libtest', () => {
  it('countDeclared conta #[test] fn por AST (atributo IRMÃO; cadeia cfg(test)+test conta)', { skip: SEM_EXTRATOR ? 'sem extrator' : false }, () => {
    const tests = [
      '#[cfg(test)]',
      '#[test]',
      'fn a() {}',
      '#[test]',
      'fn b() { assert_eq!(1, 1); }',
      '',
    ].join('\n');
    assert.equal(rsCountDeclared(tests), 2);
  });

  it('fn sem #[test] NÃO conta e comentário não é nó', { skip: SEM_EXTRATOR ? 'sem extrator' : false }, () => {
    const tests = [
      'fn testa_sem_atributo() {}',
      '// #[test] fn comentado() {}',
      '/* #[test] fn em_bloco() {} */',
      '',
    ].join('\n');
    assert.equal(rsCountDeclared(tests), 0);
  });

  it('#[test] dentro de mod conta; fonte quebrado devolve 0 (fail-closed)', { skip: SEM_EXTRATOR ? 'sem extrator' : false }, () => {
    const tests = ['mod tests {', '    #[test]', '    fn interno() {}', '}', ''].join('\n');
    assert.equal(rsCountDeclared(tests), 1);
    assert.equal(rsCountDeclared('fn f( {\n'), 0);
  });

  it('SEM declarado: vale o ÚLTIMO bloco test result: (a régua dos unitários)', () => {
    const saida = [
      'running 2 tests',
      'test testa_a ... ok',
      'test testa_b ... ok',
      'test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s',
    ].join('\n');
    assert.deepEqual(rsCountRun(saida), { testsRun: 2, pass: 2, fail: 0, skipped: 0 });
  });

  it('ignored NÃO rodou: skipped carrega e testsRun = passed + failed', () => {
    const saida = 'test result: ok. 1 passed; 0 failed; 2 ignored; 0 measured';
    assert.deepEqual(rsCountRun(saida), { testsRun: 1, pass: 1, fail: 0, skipped: 2 });
  });

  it('veredito FAILED divide pass×fail; sem resumo NENHUM é ZERO; ANSI não derruba', () => {
    assert.deepEqual(
      rsCountRun('test result: FAILED. 1 passed; 1 failed; 0 ignored; 0 measured'),
      { testsRun: 2, pass: 1, fail: 1, skipped: 0 },
    );
    assert.deepEqual(rsCountRun('running 2 tests\ntest a ... ok'), { testsRun: 0, pass: 0, fail: 0, skipped: 0 });
    assert.deepEqual(
      rsCountRun('\u001b[32mtest result: ok. 1 passed; 0 failed; 0 ignored; 0 measured\u001b[0m'),
      { testsRun: 1, pass: 1, fail: 0, skipped: 0 },
    );
  });

  const RELATORIO_INTEGRO = [
    'running 2 tests',
    'test testa_a ... ok',
    'test testa_b ... FAILED',
    'test result: FAILED. 1 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s',
    '',
  ].join('\n');

  it('COM declarado: relatório íntegro vale (cabeçalho==declarado, linhas por-teste, resumo por último)', () => {
    assert.deepEqual(rsCountRun(RELATORIO_INTEGRO, 2), { testsRun: 2, pass: 1, fail: 1, skipped: 0 });
  });

  it('COM declarado: resumo FORJADO sozinho (exit cedo, sem relatório real) volta ZERO', () => {
    const forja = 'test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s\n';
    assert.deepEqual(rsCountRun(forja, 2), { testsRun: 0, pass: 0, fail: 0, skipped: 0 });
    // …e a forma FRACA (sem declarado) aceita — dualidade declarada de propósito:
    assert.deepEqual(rsCountRun(forja), { testsRun: 2, pass: 2, fail: 0, skipped: 0 });
  });

  it('COM declarado: cabeçalho com N errado, linhas a menos ou números inconsistentes ⇒ ZERO', () => {
    const cabecalhoErrado = RELATORIO_INTEGRO.replace('running 2 tests', 'running 3 tests');
    assert.deepEqual(rsCountRun(cabecalhoErrado, 2), { testsRun: 0, pass: 0, fail: 0, skipped: 0 });

    const linhasAMenos = ['running 2 tests', 'test testa_a ... ok', 'test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured'].join('\n');
    assert.deepEqual(rsCountRun(linhasAMenos, 2), { testsRun: 0, pass: 0, fail: 0, skipped: 0 });

    const numerosInconsistentes = [
      'running 2 tests',
      'test testa_a ... ok',
      'test testa_b ... FAILED',
      'test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured',
    ].join('\n');
    assert.deepEqual(rsCountRun(numerosInconsistentes, 2), { testsRun: 0, pass: 0, fail: 0, skipped: 0 });
  });

  it('COM declarado: veredito "ok" com failed>0 é contradição ⇒ ZERO; resumo que NÃO é o último morre; texto alheio (error: test failed) tolerado', () => {
    const contradicao = RELATORIO_INTEGRO.replace('test result: FAILED. 1 passed; 1 failed', 'test result: ok. 1 passed; 1 failed');
    assert.deepEqual(rsCountRun(contradicao, 2), { testsRun: 0, pass: 0, fail: 0, skipped: 0 });

    const naoEUltimo = RELATORIO_INTEGRO + 'test testa_c ... ok\n';
    assert.deepEqual(rsCountRun(naoEUltimo, 2), { testsRun: 0, pass: 0, fail: 0, skipped: 0 });

    const comStderr = RELATORIO_INTEGRO + 'error: test failed\n';
    assert.deepEqual(rsCountRun(comStderr, 2), { testsRun: 2, pass: 1, fail: 1, skipped: 0 });
  });

  it('parseChecks: uma linha por teste — só "ok" passou (FAILED e ignored não)', () => {
    const saida = [
      'test testa_a ... ok',
      'test tests::testa_b ... FAILED',
      'test lento ... ignored',
      'lixo',
    ].join('\n');
    assert.deepEqual(rsParseChecks(saida), [
      { name: 'testa_a', passed: true },
      { name: 'tests::testa_b', passed: false },
      { name: 'lento', passed: false },
    ]);
  });
});

describe('rust — (6) exits, env do parser e envScrub do filho', () => {
  it('RS_FAILURE_POLICY: 101 é o exit de panic/falha/compilação; 137 nunca distingue timeout×OOM', () => {
    assert.equal(RS_EXIT_PANIC, 101);
    assert.equal(RS_FAILURE_POLICY.isFailure(0), false);
    assert.equal(RS_FAILURE_POLICY.isFailure(101), true);
    assert.equal(RS_FAILURE_POLICY.successRequiresCountMatch, true);
    assert.equal(RS_FAILURE_POLICY.meaning(0), 'exit 0');
    assert.equal(RS_FAILURE_POLICY.meaning(101), 'exit 101 (teste falhou, panic ou erro de compilação)');
    assert.equal(RS_FAILURE_POLICY.meaning(1), 'exit 1 (erro de uso do cargo)');
    assert.equal(RS_FAILURE_POLICY.meaning(2), 'exit 2 (argumento inválido do cargo)');
    assert.equal(RS_FAILURE_POLICY.meaning(137), 'timeout-ou-OOM');
    assert.equal(RS_FAILURE_POLICY.meaning(42), 'exit 42');
  });

  it('rsApplyParseEnv: allowlist mínima + ELECTRON_RUN_AS_NODE; NODE_OPTIONS herdado NÃO entra (--require rodaria código)', () => {
    const env = rsApplyParseEnv({
      PATH: '/usr/bin',
      HOME: '/home/x',
      NODE_OPTIONS: '--require /evil.js',
      SEGREDO: 'VAZOU?',
    });
    assert.deepEqual(env, {
      PATH: '/usr/bin',
      HOME: '/home/x',
      LC_ALL: 'C.UTF-8',
      TZ: 'UTC',
      ELECTRON_RUN_AS_NODE: '1',
    });
  });

  it('rsEnvScrub: offline/incremental/ANSI/panic determinísticos + NO_PROXY; veneno de Rust removido', () => {
    const p = rsEnvScrub();
    assert.equal(p.allow.length, 0, 'cargo não precisa de nada além do ENV_ALLOWLIST_COMUM');
    assert.equal(p.fixed.CARGO_NET_OFFLINE, 'true');
    assert.equal(p.fixed.CARGO_INCREMENTAL, '0');
    assert.equal(p.fixed.CARGO_TERM_COLOR, 'never');
    assert.equal(p.fixed.RUST_BACKTRACE, '0');
    assert.equal(p.fixed.NO_PROXY, '*');
    for (const veneno of [
      'RUSTFLAGS',
      'CARGO_ENCODED_RUSTFLAGS',
      'CARGO_TARGET_DIR',
      'CARGO_HOME',
      'RUSTUP_HOME',
      'RUSTUP_TOOLCHAIN',
      'CARGO',
      'RUSTC_WRAPPER',
      'RUSTC_WORKSPACE_WRAPPER',
      'HTTP_PROXY',
      'http_proxy',
      'FORCE_COLOR',
      'NO_COLOR',
    ]) {
      assert.ok(p.strip.includes(veneno), `strip tem de levar ${veneno}`);
    }
    for (const nome of p.strip) {
      assert.ok(!(nome in p.fixed), 'fixed e strip nunca se sobrepõem');
    }
    assert.ok(p.scope.some((s) => s.startsWith('LIMITE:')), 'os limites são declarados, não escondidos');
  });

  it('rsEnvScrub PINA RUSTC/RUSTDOC do cargo real quando a toolchain resolve (decisão 6)', () => {
    const d = rsDetect();
    const p = rsEnvScrub();
    if (d.ok && d.degradacao === null) {
      assert.equal(typeof p.fixed.RUSTC, 'string', 'sem o pin o cargo real despacha o PROXY e o filho morre');
      assert.match(p.fixed.RUSTC, /rustc$/);
    }
  });

  it('rsEnvScrub é MEMOIZADA e o reset reconstrói (e o getter do adapter aponta para ela)', () => {
    const p1 = rsEnvScrub();
    assert.strictEqual(p1, rsEnvScrub());
    assert.strictEqual(rustAdapter.envScrub, p1);
    rsResetEnvScrub();
    assert.deepEqual(rsEnvScrub(), p1);
  });
});

describe('rust — (7) layout e caminho seguro de arquivo', () => {
  it('layout de arquivo único: manifesto PRIMEIRO, depois src/lib.rs e tests/desafio.rs', () => {
    const l = rsLayout({ code: 'fn f() {}', testsCode: '#[test]\nfn t() {}' });
    assert.deepEqual(l.files.map((f) => f.path), ['Cargo.toml', 'src/lib.rs', 'tests/desafio.rs']);
    assert.equal(l.entryPath, 'src/lib.rs');
    assert.equal(l.testPath, 'tests/desafio.rs');
    assert.equal(l.manifestPath, 'Cargo.toml', 'sem manifesto o diretório nem é projeto cargo');
    assert.equal(l.files[0].content, RS_MANIFEST_CONTENT);
    assert.equal(l.files[1].content, 'fn f() {}');
    assert.equal(l.files[2].content, '#[test]\nfn t() {}');
  });

  it('layout multi-arquivo: files VERBATIM, sem src/lib.rs implícito', () => {
    const l = rsLayout({
      code: 'ignorado',
      files: [
        { path: 'src/lib.rs', code: 'pub fn a() {}' },
        { path: 'src/util.rs', code: 'pub fn b() {}' },
      ],
      testsCode: '',
    });
    assert.deepEqual(l.files.map((f) => f.path), ['Cargo.toml', 'src/lib.rs', 'src/util.rs', 'tests/desafio.rs']);
  });

  it('RS_SAFE_FILE_PATH_RE: .rs com diretórios seguros passa; .. e extensão errada caem', () => {
    assert.ok(RS_SAFE_FILE_PATH_RE.test('src/lib.rs'));
    assert.ok(RS_SAFE_FILE_PATH_RE.test('tests/desafio.rs'));
    assert.ok(RS_SAFE_FILE_PATH_RE.test('a-b_c.rs'));
    assert.ok(!RS_SAFE_FILE_PATH_RE.test('../fuga.rs'));
    assert.ok(!RS_SAFE_FILE_PATH_RE.test('a/../b.rs'));
    assert.ok(!RS_SAFE_FILE_PATH_RE.test('/etc/x.rs'), 'escape por caminho absoluto é proibido');
    assert.ok(!RS_SAFE_FILE_PATH_RE.test('arquivo.txt'));
    assert.ok(!RS_SAFE_FILE_PATH_RE.test('a b.rs'));
  });
});
