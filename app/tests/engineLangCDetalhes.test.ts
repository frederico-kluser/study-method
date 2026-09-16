/**
 * tests/engineLangCDetalhes.test.ts — CANTOS DO ADAPTADOR DE C que
 * `engineLangC.test.ts` não cobre (arquivo irmão, sem sobreposição de caso).
 *
 * Fonte NORMATIVA (o contrato, não o diff):
 *   - `engine/lang/registry.ts` — a interface `LanguageAdapter` (15 membros) e
 *     a invariante da DUPLA-IGUALDADE (declared == executed == expected);
 *   - `docs/build-spec/blocks/03-tdd.md` §3.9.3 — o counter_protocol (dois
 *     `static int`, `checa_<tipo>` que imprime `FALHOU [<cenario>]: obtido …,
 *     esperado …. <porque>` em stderr SEM abortar, `TESTS_RUN`/`TESTS_FAILED`
 *     em stdout, exit `falhas==0?0:1`, `getenv("SM_ONLY")`);
 *   - `docs/00-contratos.md` §5.3 — exit 134 (abort) é PROIBIDO como mecanismo;
 *   - `skills/study-method/references/languages.md` D-V11 — exit normalizado
 *     0/1/2/3 com `EXIT_BRUTO`/`DECORRIDO_MS` no stdout.
 *
 * O que ESTE arquivo cobre (gaps medidos contra o irmão):
 *   1. detect(): degradação ESPECÍFICA por componente (PATH esvaziado), o
 *      reset RE-SONDANDO (o teste do irmão só prova estabilidade), e a
 *      resolução do extrator via STUDY_METHOD_C_EXTRACTOR;
 *   2. o ambiente do PARSE (`cApplyParseEnv`) e a semântica VIGENTE do
 *      envScrub (`applyLegacyEnvScrub`), pureza e a família completa do strip;
 *   3. layout MULTI-ARQUIVO (ordem completa das escritas) e bordas do
 *      filePathPattern;
 *   4. countDeclared: zero testes, teste FORA da macro, proto+def à mão,
 *      SM_ONLY não afeta o lado declarado, e o contrato do preâmbulo;
 *   5. countRun/parseChecks: relatório truncado pelo outro lado, valores não
 *      numéricos, nonce-fallback `pid…`, clamp de `pass`, CRLF, last-wins
 *      sobre linha forjada, slug com espaço, cenário FALHOU no meio;
 *   6. resolveScopes: global de runtime usado e não declarado; shadowing;
 *   7. constructKey: `op:update:--`, `op:logical:||`, `%`, `%=`,
 *      `global:stdout` (portadora), função implícita (a flag
 *      `-Wno-error=implicit-function-declaration` é contrato), prioridade dos
 *      eixos (unitário);
 *   8. extração de teoria: bloco ```c``` de uma lesson.json parseável e
 *      trecho inválido → PARSE_ERROR estruturado;
 *   9. acentuação em COMENTÁRIO (coluna em CARACTERES, não bytes);
 *  10. A TESTEMUNHA de regressão do bug do header tratado como TU (o bug foi
 *      CORRIGIDO no cLayout — ver o `it` no fim e a nota da seção 3).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  C_ENTRY_PATH,
  C_FONTES_LIST_PATH,
  C_HARNESS_HEADER_PATH,
  C_HARNESS_MAIN_PATH,
  C_RUNNER_SCRIPT_PATH,
  C_TEST_PATH,
  C_PARSE_FLAGS,
  SM_COUNT_PREABULO,
  cAdapter,
  cApplyParseEnv,
  cDetect,
  cExtractorPath,
  cResetDetectCache,
  cResetParseCache,
} from '../electron/main/engine/lang/c';
import {
  ENV_NUCLEO_COMUM,
  adapterIdForTheoryTag,
  applyEnvScrub,
  applyLegacyEnvScrub,
} from '../electron/main/engine/lang/registry';
import type { LangNode } from '../electron/main/engine/lang/registry';
import {
  execOutput,
  judgeCountMatches,
  judgeSolutionPasses,
} from '../electron/main/engine/exec/proofs';
import {
  cleanupDir,
  prepareIsolatedDir,
} from '../electron/main/engine/exec/harness';
import { fromChallengeExec } from '../electron/main/engine/exec/adapter';
import { criarExecDeLinguagem } from '../electron/main/services/challengeExec';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const c = cAdapter;

/** A máquina tem a toolchain de C COMPLETA? (compilador + clang + python3) */
const TEM_C = cDetect().ok;

/** Chaves de um fonte, pela caminhada do PRÓPRIO adaptador (membro 2). */
function chavesDe(fonte: string): Set<string> {
  const r = c.parse(fonte);
  assert.ok(r.ok, `fixture deve parsear: ${JSON.stringify(r.ok ? '' : r.error)}`);
  if (!r.ok) return new Set();
  const chaves = new Set<string>();
  const visitar = (no: LangNode): void => {
    const k = c.constructKey(no);
    if (k) chaves.add(k);
    if (no.synthetic !== true) chaves.add(`node:${no.type}`);
    for (const filho of no.children) visitar(filho);
  };
  for (const filho of r.root.children) visitar(filho);
  return chaves;
}

// ---------------------------------------------------------------------------
// 1. detect() — degradação ESPECÍFICA por componente, reset que RE-SONDA, e a
//    resolução do extrator (gap: o irmão só testa o caminho feliz e o reset
//    "estável", que passaria mesmo com um reset no-op)
// ---------------------------------------------------------------------------

describe('c — detect(): degradação por componente e reset que RE-SONDA', () => {
  it('cExtractorPath aponta o vocab/c/extract_ast.py do repositório (env ausente)', () => {
    const anterior = process.env.STUDY_METHOD_C_EXTRACTOR;
    delete process.env.STUDY_METHOD_C_EXTRACTOR;
    try {
      const caminho = cExtractorPath();
      assert.ok(caminho, 'o extrator existe no repositório');
      assert.match(caminho ?? '', /vocab[/\\]c[/\\]extract_ast\.py$/);
      assert.equal(fs.existsSync(caminho ?? ''), true);
    } finally {
      if (anterior !== undefined) process.env.STUDY_METHOD_C_EXTRACTOR = anterior;
    }
  });

  it('STUDY_METHOD_C_EXTRACTOR vence — a env conserta a instalação sem recompilar', () => {
    const anterior = process.env.STUDY_METHOD_C_EXTRACTOR;
    const falso = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sm-c-extr-')), 'extract_ast.py');
    fs.writeFileSync(falso, '# extrator de teste\n');
    process.env.STUDY_METHOD_C_EXTRACTOR = falso;
    try {
      assert.equal(cExtractorPath(), falso, 'o candidato da env é o PRIMEIRO da resolução');
    } finally {
      if (anterior !== undefined) process.env.STUDY_METHOD_C_EXTRACTOR = anterior;
      else delete process.env.STUDY_METHOD_C_EXTRACTOR;
      fs.rmSync(path.dirname(falso), { recursive: true, force: true });
    }
  });

  it('PATH esvaziado: DEGRADAÇÃO ESPECÍFICA por componente — compilador, clang e python3, cada um com o seu motivo', () => {
    // Sem PATH nenhum binário responde: as TRÊS sondas de binário caem, mas o
    // EXTRATOR (arquivo do repositório) continua — a degradação tem de nomear
    // cada falta separadamente, nunca uma mensagem genérica.
    const vazio = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-c-path-vazio-'));
    const pathAnterior = process.env.PATH;
    process.env.PATH = vazio;
    cResetDetectCache();
    try {
      const d = cDetect();
      assert.equal(d.ok, false);
      assert.equal(d.binary, 'sh', 'o binário do spawn é o sh MESMO degradado');
      assert.equal(d.version, null, 'sem compilador não há versão');
      assert.match(d.degradacao ?? '', /nenhum compilador C encontrado no PATH \(procurados: cc, gcc, clang\)/);
      assert.match(d.degradacao ?? '', /clang não encontrado — o PARSE de C exige clang/);
      assert.match(d.degradacao ?? '', /nenhum python3 no PATH \(procurados: python3, python\)/);
      assert.ok(
        !(d.degradacao ?? '').includes('extract_ast.py não encontrado'),
        'o extrator EXISTE — a degradação não pode alegar falta dele',
      );
    } finally {
      if (pathAnterior !== undefined) process.env.PATH = pathAnterior;
      else delete process.env.PATH;
      cResetDetectCache();
      fs.rmSync(vazio, { recursive: true, force: true });
    }
  });

  it('cResetDetectCache RE-SONDA: o mesmo processo muda de veredito quando o mundo muda', { skip: !TEM_C }, () => {
    // O teste do irmão prova estabilidade (deepEqual antes/depois) — que
    // passaria TAMBÉM se o reset fosse no-op. Este prova o outro sentido:
    // depois do reset, a sonda refaz as perguntas.
    const vazio = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-c-path-vazio-'));
    const pathAnterior = process.env.PATH;
    assert.equal(cDetect().ok, true, 'pré-condição: a toolchain existe nesta máquina');
    process.env.PATH = vazio;
    cResetDetectCache();
    try {
      assert.equal(cDetect().ok, false, 'com PATH esvaziado e reset, a degradação aparece');
    } finally {
      if (pathAnterior !== undefined) process.env.PATH = pathAnterior;
      else delete process.env.PATH;
      cResetDetectCache();
      fs.rmSync(vazio, { recursive: true, force: true });
    }
    assert.equal(cDetect().ok, true, 'PATH restaurado + reset: a detecção se recupera');
  });
});

// ---------------------------------------------------------------------------
// 2. o ambiente do PARSE e as DUAS semânticas do envScrub
// ---------------------------------------------------------------------------

describe('c — ambiente: cApplyParseEnv (Porta 1) e as duas semânticas do envScrub', () => {
  it('cApplyParseEnv: allowlist estrita + o núcleo de determinismo IMPOSTO', () => {
    const env = cApplyParseEnv({
      PATH: '/usr/bin',
      HOME: '/home/dev',
      CPATH: '/veneno/include',
      LD_PRELOAD: '/veneno/evil.so',
      DYLD_INSERT_LIBRARIES: '/veneno/evil.dylib',
      SEGREDO_DA_MAQUINA: 'x',
    });
    assert.equal(env.PATH, '/usr/bin');
    assert.equal(env.HOME, '/home/dev');
    assert.equal(env.CPATH, undefined, 'veneno de include NÃO entra no parse');
    assert.equal(env.LD_PRELOAD, undefined);
    assert.equal(env.DYLD_INSERT_LIBRARIES, undefined);
    assert.equal(env.SEGREDO_DA_MAQUINA, undefined, 'allowlist: nada além do comum passa');
    assert.equal(env.LC_ALL, 'C.UTF-8');
    assert.equal(env.TZ, 'UTC');
    assert.equal(env.PYTHONIOENCODING, 'utf-8', 'o helper python3 é subprocesso deste parse');
    assert.equal(env.PYTHONDONTWRITEBYTECODE, '1');
  });

  it('applyLegacyEnvScrub (a semântica VIGENTE do harness): denylist copia TUDO e NÃO injeta o núcleo', () => {
    // registry.ts declara as duas semânticas de propósito; o comportamento
    // vigente (buildChildEnv) é esta função — e a diferença é contrato:
    // variável arbitrária PASSA, e LC_ALL/TZ NÃO são impostos por ela.
    const env = applyLegacyEnvScrub(c.envScrub, {
      PATH: '/usr/bin',
      SEGREDO_DA_MAQUINA: 'x',
      CFLAGS: '-O0',
      LD_PRELOAD: '/veneno/evil.so',
      HTTPS_PROXY: 'http://proxy:8080',
    });
    assert.equal(env.SEGREDO_DA_MAQUINA, 'x', 'denylist: o que não está no strip herda');
    assert.equal(env.CFLAGS, undefined);
    assert.equal(env.LD_PRELOAD, undefined);
    assert.equal(env.HTTPS_PROXY, undefined);
    assert.equal(env.NO_PROXY, '*', 'o fixed entra nas duas semânticas');
    assert.equal(env.no_proxy, '*');
    assert.equal(env.LC_ALL, undefined, 'o NÚCLEO comum é da allowlist, não da legacy');
    assert.equal(env.TZ, undefined);
  });

  it('as duas semânticas são PURAS — nenhuma muta o ambiente base', () => {
    const base = { PATH: '/usr/bin', CFLAGS: '-O0', LD_PRELOAD: '/v.so', SEGREDO: 'x' };
    const copia = { ...base };
    applyEnvScrub(c.envScrub, base);
    applyLegacyEnvScrub(c.envScrub, base);
    assert.deepEqual(base, copia, 'base intacta depois das duas aplicações');
  });

  it('o strip cobre a família inteira do veneno de C — cada nome apagado de fato', () => {
    const familiaObrigatoria = [
      'CFLAGS', 'CPPFLAGS', 'CXXFLAGS', 'LDFLAGS',
      'CPATH', 'C_INCLUDE_PATH', 'CPLUS_INCLUDE_PATH', 'OBJC_INCLUDE_PATH',
      'LIBRARY_PATH', 'COMPILER_PATH',
      'LD_PRELOAD', 'LD_LIBRARY_PATH',
      'DYLD_INSERT_LIBRARIES', 'DYLD_LIBRARY_PATH', 'DYLD_FALLBACK_LIBRARY_PATH',
      'DYLD_FRAMEWORK_PATH', 'DYLD_PRINT_LIBRARIES',
      'LIB', 'INCLUDE', 'CL', 'CLFLAGS',
      'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY',
      'http_proxy', 'https_proxy', 'all_proxy',
      'FORCE_COLOR',
    ];
    for (const nome of familiaObrigatoria) {
      assert.ok(
        c.envScrub.strip.includes(nome),
        `${nome} precisa estar declarado no strip (veneno de C do §6 obs. 2)`,
      );
    }
    // e a lista não é só declaração: cada nome posto na base morre na allowlist
    const base: Record<string, string> = {};
    for (const nome of familiaObrigatoria) base[nome] = '/veneno';
    base.PATH = '/usr/bin';
    const env = applyEnvScrub(c.envScrub, base);
    for (const nome of familiaObrigatoria) {
      assert.equal(env[nome], undefined, `${nome} sobreviveu ao scrub`);
    }
    assert.equal(env.PATH, '/usr/bin');
    assert.equal(env.LC_ALL, ENV_NUCLEO_COMUM.LC_ALL);
    assert.equal(env.TZ, ENV_NUCLEO_COMUM.TZ);
  });
});

// ---------------------------------------------------------------------------
// 3. layout MULTI-ARQUIVO (ordem completa) e bordas do filePathPattern
// ---------------------------------------------------------------------------

describe('c — layout multi-arquivo e filePathPattern (bordas)', () => {
  it('multi-arquivo: as SETE escritas na ordem — header, main, arquivos do desafio, teste, fontes, script; manifesto null', () => {
    const layout = c.layout({
      code: 'ignorado quando há files',
      files: [
        { path: 'util.h', code: 'int soma(int a, int b);\n' },
        { path: 'util.c', code: 'int soma(int a, int b) { return a + b; }\n' },
      ],
      testsCode: 'int soma(int a, int b);\nSM_TEST(x) { checa_int("x", 0, 0, "nada"); }\n',
    });
    assert.deepEqual(
      layout.files.map((f) => f.path),
      [
        C_HARNESS_HEADER_PATH,   // incluído pelo teste — primeiro
        C_HARNESS_MAIN_PATH,     // o produtor da contagem
        'util.h',                // os arquivos do DESAFIO, na ordem dada
        'util.c',
        C_TEST_PATH,             // o teste do autor
        C_FONTES_LIST_PATH,      // a lista de fontes (só depois de saber os paths)
        C_RUNNER_SCRIPT_PATH,    // o runner por último
      ],
      'a ordem de escrita é contrato do layout (manifesto incluso quando há)',
    );
    assert.equal(layout.manifestPath, null, 'C não tem manifesto — também em multi-arquivo');
    const fontes = layout.files.find((f) => f.path === C_FONTES_LIST_PATH);
    // PÓS-FIX (95f7200, onda 2): SÓ os `.c` entram na lista de TUs — o `.h`
    // continua indo a disco (a ordem de escritas acima segue contrato), mas
    // fora do sm_fontes.txt, porque o runner alimenta cada linha da lista ao
    // `cc -c` e `cc -c util.h` produz precompiled header, não objeto.
    assert.equal(fontes?.content, 'util.c\n', 'SÓ os .c vão à lista de TUs (o .h fica em disco, fora dela)');
    assert.equal(layout.entryPath, C_ENTRY_PATH);
    assert.equal(layout.testPath, C_TEST_PATH);
  });

  it('filePathPattern: aceita aninhamento e os DOIS sufixos; recusa caixa alta, acento, sufixo extra e `..`', () => {
    for (const okDe of ['solucao.c', 'lib/util.h', 'a/b/c/d.c', 'meu-lib_2.c', 'x.h']) {
      assert.equal(c.filePathPattern.test(okDe), true, `deveria aceitar ${okDe}`);
    }
    for (const recusaDe of [
      'sol.C',           // extensão em caixa alta não é .c
      'solução.c',       // acento fora do alfabeto do regex
      'x.c.bak',         // sufixo extra depois de .c
      'x.cpp',           // C++ não é este adaptador
      'x.hpp',
      '.c',              // basename vazio
      '../fuga.c',       // escape de diretório — a proibição explícita do contrato
      'fuga/../x.c',
      'espaco em branco.c',
      'run.sh',
    ]) {
      assert.equal(c.filePathPattern.test(recusaDe), false, `deveria recusar ${recusaDe}`);
    }
    // PREMISSA (convenção herdada, não bug): a barra inicial é aceita — o
    // regex do JavaScript é idêntico (`JS_SAFE_FILE_PATH_RE`,
    // lang/javascript.ts:140) e o `path.join(dir, arquivo.path)` do
    // `prepareIsolatedDir` (exec/harness.ts) resolve `/absoluto.c` para
    // DENTRO do diretório de execução, então não há escape real.
    assert.equal(c.filePathPattern.test('/absoluto.c'), true);
  });
});

// ---------------------------------------------------------------------------
// 4. countDeclared — o lado DECLARADO (gaps do irmão)
// ---------------------------------------------------------------------------

describe('c — countDeclared: zero, fora-da-macro, proto+def à mão, SM_ONLY, preâmbulo', () => {
  it('ZERO testes declarados: fonte vazio, whitespace e só protótipos — 0 nunca mente', { skip: !TEM_C }, () => {
    assert.equal(c.countDeclared(''), 0);
    assert.equal(c.countDeclared('   \n\t\n'), 0);
    assert.equal(c.countDeclared('int dobro(int x);\n'), 0, 'protótipo não é teste');
  });

  it('teste FORA da macro conta; sm_reg_ e comentário com test_ NÃO contam', { skip: !TEM_C }, () => {
    // A convenção permite o bloco escrito à mão (a expansão da macro é só
    // isso); o construtor gerado não é teste (não começa com test_); e a
    // contagem é POR AST — comentário não é nó.
    const fonte = [
      '/* void test_comentado(void) { } */',
      '// test_nem_linha(void)',
      'static void test_solta(void) { }',
      'static void sm_reg_nao_e_teste(void) { }',
    ].join('\n');
    assert.equal(c.countDeclared(fonte), 1);
  });

  it('protótipo + definição ESCRITOS À MÃO contam UM (o Set de nomes únicos)', { skip: !TEM_C }, () => {
    assert.equal(c.countDeclared('static void test_a(void);\nstatic void test_a(void) { }\n'), 1);
  });

  it('SM_ONLY NÃO afeta o lado declarado — o filtro é do RUNTIME (main do harness), não do AST', { skip: !TEM_C }, () => {
    const fonte = [
      'int dobro(int x);',
      'SM_TEST(dobro_de_2) { checa_int("dobro_de_2", dobro(2), 4, "o dobro de 2 e 4"); }',
      'SM_TEST(dobro_de_menos_1) { checa_long("dobro_de_menos_1", dobro(-1), -2, "o dobro de -1 e -2"); }',
    ].join('\n');
    const anterior = process.env.SM_ONLY;
    process.env.SM_ONLY = 'dobro_de_2';
    try {
      assert.equal(c.countDeclared(fonte), 2, 'a contagem declarada ignora SM_ONLY');
    } finally {
      if (anterior !== undefined) process.env.SM_ONLY = anterior;
      else delete process.env.SM_ONLY;
    }
  });

  it('o PREÂMBULO da contagem declara os helpers do counter_protocol e a macro SM_TEST (contrato estático)', () => {
    // Sem os protótipos, cada checa_* do testsCode viraria declaração
    // implícita na frente do parse — a árvore ficaria menos fiel e a
    // contagem dependeria do warning ser tolerado.
    for (const tipo of ['int', 'long', 'double', 'char', 'str']) {
      assert.match(SM_COUNT_PREABULO, new RegExp(`static void checa_${tipo}\\(`), `falta checa_${tipo} no preâmbulo`);
    }
    assert.match(SM_COUNT_PREABULO, /#define SM_TEST\(slug\)/);
    assert.match(SM_COUNT_PREABULO, /sm_registrar\(#slug/);
    // e as flags do parse carregam a tolerância decidida no cabeçalho de
    // C_PARSE_FLAGS: chamada implícita a função é warning, não erro
    assert.ok(C_PARSE_FLAGS.includes('-Wno-error=implicit-function-declaration'));
  });
});

// ---------------------------------------------------------------------------
// 5. countRun / parseChecks — truncado pelo OUTRO lado, não numérico,
//    nonce-fallback, clamp, CRLF, last-wins, slug com espaço, falha no meio
// ---------------------------------------------------------------------------

describe('c — countRun/parseChecks: os cantos do relatório com nonce', () => {
  it('relatório truncado pelo OUTRO lado (só TESTS_FAILED) é contagem ZERO (fail-closed)', () => {
    assert.deepEqual(c.countRun('SMabc123 TESTS_FAILED=0\n'), { testsRun: 0, pass: 0, fail: 0, skipped: 0 });
  });

  it('valor NÃO numérico não casa (\\d+) — TESTS_RUN=abc ou =+2 não são contagem', () => {
    assert.deepEqual(c.countRun('SMabc TESTS_RUN=abc\nSMabc TESTS_FAILED=0\n'), { testsRun: 0, pass: 0, fail: 0, skipped: 0 });
    assert.deepEqual(c.countRun('SMabc TESTS_RUN=+2\nSMabc TESTS_FAILED=0\n'), { testsRun: 0, pass: 0, fail: 0, skipped: 0 });
  });

  it('o nonce-fallback do run.sh (SM_NONCE="pid$$") é aceito — \\S+ não exige hex', () => {
    assert.deepEqual(c.countRun('SMpid4242 TESTS_RUN=1\nSMpid4242 TESTS_FAILED=0\n'), {
      testsRun: 1, pass: 1, fail: 0, skipped: 0,
    });
  });

  it('TESTS_FAILED > TESTS_RUN: pass é CLAMPADO em zero (Math.max), fail reflete o relatório', () => {
    // Estado impossível de um harness sadio, mas a álgebra não pode inventar
    // pass positivo de relatório contraditório.
    assert.deepEqual(c.countRun('SMabc TESTS_RUN=1\nSMabc TESTS_FAILED=3\n'), {
      testsRun: 1, pass: 0, fail: 3, skipped: 0,
    });
  });

  it('CRLF na saída do runner é tolerada (\\s* absorve o \\r)', () => {
    assert.deepEqual(c.countRun('SMabc TESTS_RUN=2\r\nSMabc TESTS_FAILED=0\r\n'), {
      testsRun: 2, pass: 2, fail: 0, skipped: 0,
    });
  });

  it('LAST-WINS: linha SM forjada com nonce ERRADO ANTES da real é suplantada', () => {
    // O contrato de cCountRun: as ÚLTIMAS linhas canônicas valem — a linha do
    // runner real é sempre a última no stdout (o script a imprime por fim).
    assert.deepEqual(
      c.countRun('SMfalso TESTS_RUN=9\nSMfalso TESTS_FAILED=0\nSMreal TESTS_RUN=2\nSMreal TESTS_FAILED=1\n'),
      { testsRun: 2, pass: 1, fail: 1, skipped: 0 },
    );
  });

  it('parseChecks: slug com ESPAÇO parseia; linha T sem veredito é ignorada', () => {
    assert.deepEqual(
      c.parseChecks('SMx T meu teste ok\nSMx T foo\nSMx T bar FALHOU\n'),
      [
        { name: 'meu teste', passed: true },
        { name: 'bar', passed: false },
      ],
    );
  });

  it('counter_protocol na prática do relatório: FALHOU no MEIO não esconde os cenários seguintes', () => {
    const saida = [
      'SMabc T um ok',
      'SMabc T dois FALHOU',
      'SMabc T tres ok',
      'SMabc TESTS_RUN=3',
      'SMabc TESTS_FAILED=1',
    ].join('\n');
    assert.deepEqual(c.parseChecks(saida), [
      { name: 'um', passed: true },
      { name: 'dois', passed: false },
      { name: 'tres', passed: true },
    ], 'um check por cenário, EM ORDEM — o protocolo nunca aborta no primeiro erro');
    assert.deepEqual(c.countRun(saida), { testsRun: 3, pass: 2, fail: 1, skipped: 0 });
  });
});

// ---------------------------------------------------------------------------
// 6. resolveScopes — global de runtime usado e não declarado; shadowing
// ---------------------------------------------------------------------------

describe('c — resolveScopes: o limite PLANO nos dois sentidos', () => {
  it('global de runtime usado e NÃO declarado vira free E globals; função de biblioteca fica só em free', { skip: !TEM_C }, () => {
    const r = c.parse('#include <stdio.h>\nint main(void) { fprintf(stderr, "x"); return 0; }\n');
    assert.ok(r.ok);
    if (!r.ok) return;
    const escopos = c.resolveScopes(r);
    assert.ok(escopos.free.has('stderr'));
    assert.ok(escopos.free.has('fprintf'), 'fprintf é função de BIBLIOTECA (api:), não global de runtime');
    assert.deepEqual([...escopos.globals], ['stderr'], 'globals = free ∩ globals() — SÓ stderr');
    assert.deepEqual([...escopos.imported], []);
    assert.ok(escopos.declared.has('main'));
    assert.ok(!escopos.declared.has('fprintf'), 'declaração implícita de header não é declarado DO ARQUIVO');
  });

  it('shadowing: um `int printf` LOCAL é declarado — deixa de ser livre e não vira global', { skip: !TEM_C }, () => {
    // O limite declarado do adaptador (escopo PLANO): o nome sombreado sai
    // de free/globals — comportamento DOCUMENTADO, aqui travado em teste.
    const r = c.parse('int main(void) { int printf = 1; printf = 2; return 0; }\n');
    assert.ok(r.ok);
    if (!r.ok) return;
    const escopos = c.resolveScopes(r);
    assert.ok(escopos.declared.has('printf'));
    assert.ok(!escopos.free.has('printf'));
    assert.equal(escopos.globals.size, 0);
  });
});

// ---------------------------------------------------------------------------
// 7. constructKey — os eixos que faltavam no irmão + a prioridade dos eixos
// ---------------------------------------------------------------------------

describe('c — constructKey: op:update:--, op:logical:||, %, %=, global:stdout, prioridade', () => {
  it('op:update:-- (pré e pós), op:logical:||, op:binary:% e op:assign:%=', { skip: !TEM_C }, () => {
    const chaves = chavesDe([
      'int main(void) {',
      '    int x = 10;',
      '    x--; --x;',
      '    x %= 3;',
      '    if (x || 0) { }',
      '    return x % 2;',
      '}',
    ].join('\n'));
    assert.ok(chaves.has('op:update:--'), [...chaves].join(' '));
    assert.ok(chaves.has('op:logical:||'), [...chaves].join(' '));
    assert.ok(chaves.has('op:binary:%'), [...chaves].join(' '));
    assert.ok(chaves.has('op:assign:%='), [...chaves].join(' '));
  });

  it('global:stdout: a portadora GlobalRef rende a chave de eixo e NUNCA a genérica node:GlobalRef', { skip: !TEM_C }, () => {
    const chaves = chavesDe('#include <stdio.h>\nint main(void) { fputs("", stdout); return 0; }\n');
    assert.ok(chaves.has('global:stdout'), [...chaves].join(' '));
    assert.ok(!chaves.has('node:GlobalRef'), 'nó synthetic não rende chave genérica fora do inventário');
    assert.ok(chaves.has('api:fputs'), 'a função de biblioteca continua api:');
  });

  it('chamada a função SEM #include PARSEIA (a flag -Wno-error é contrato) e sai api:printf', { skip: !TEM_C }, () => {
    // Sem a flag, o clang 16+ elevaria implicit-function-declaration a erro e
    // o trecho de teoria inteiro viraria PARSE_ERROR por causa de um aviso.
    const r = c.parse('int main(void) { printf("oi"); return 0; }\n');
    assert.ok(r.ok, `trecho sem include deve parsear: ${JSON.stringify(r.ok ? '' : r.error)}`);
    if (!r.ok) return;
    const chaves = chavesDe('int main(void) { printf("oi"); return 0; }\n');
    assert.ok(chaves.has('api:printf'), [...chaves].join(' '));
    const escopos = c.resolveScopes(r);
    assert.ok(escopos.free.has('printf'), 'o nome implícito é livre (não declarado no arquivo)');
  });

  it('PRIORIDADE dos eixos: decl: vence global:/api:, op: exige operator+family, resto é node:', () => {
    const no = (type: string, attributes: Record<string, string>): LangNode => ({
      type, line: 1, column: 1, start: 0, end: 0, text: '', attributes, children: [],
    });
    assert.equal(c.constructKey(no('X', { declKind: 'var' })), 'decl:var');
    assert.equal(c.constructKey(no('GlobalRef', { globalName: 'stdout' })), 'global:stdout');
    assert.equal(c.constructKey(no('ApiRef', { apiPath: 'printf' })), 'api:printf');
    assert.equal(c.constructKey(no('CompoundAssignOperator', { operator: '%=', operatorFamily: 'assign' })), 'op:assign:%=');
    assert.equal(
      c.constructKey(no('BinaryOperator', { operator: '+' })),
      'node:BinaryOperator',
      'operator SEM family não compõe op: — cai na genérica',
    );
    assert.equal(c.constructKey(no('CompoundStmt', {})), 'node:CompoundStmt');
    assert.equal(
      c.constructKey(no('X', { declKind: 'var', apiPath: 'printf' })),
      'decl:var',
      'decl: tem prioridade sobre api:',
    );
  });

  it('os SEIS kinds novos do §8.2 usam o eixo node: — atributos dot/arrow/castType NÃO mudam a chave', { skip: !TEM_C }, () => {
    // docs/20 §8 nomeia cada construção UMA vez; a distinção que o clang
    // carrega no nó (isArrow, tagUsed, castKind) é metadata de relatório — o
    // padrão resolvedName/storageClass do extrator, não o declKind.
    const chaves = chavesDe([
      'struct P { int x; };',
      'typedef struct P P2;',
      'int main(void) {',
      '    struct P s = {1};',
      '    struct P *p = &s;',
      '    s.x = p->x;',
      '    int y = 1 > 0 ? 2 : 3;',
      '    switch (y) { case 2: break; default: break; }',
      '    return (int)1.5;',
      '}',
    ].join('\n'));
    for (const chave of ['node:RecordDecl', 'node:MemberExpr', 'node:TypedefDecl', 'node:ConditionalOperator', 'node:SwitchStmt', 'node:CStyleCastExpr']) {
      assert.ok(chaves.has(chave), `falta ${chave}: ${[...chaves].join(' ')}`);
    }
    assert.ok(!chaves.has('op:member:.'), 'o acesso a campo não é operador — é node:MemberExpr');
    assert.ok(!chaves.has('op:member:->'), 'dot e arrow compartilham a MESMA chave');
  });

  it('o FIM do nó inclui o ÚLTIMO TOKEN (medido: range.end.offset é o INÍCIO dele; o tokLen completa)', { skip: !TEM_C }, () => {
    // A correção da onda 3, travada: antes, todo nó multi-token perdia o
    // último token no snippet (`p.x = 3` saía `p.x = `, `x * 2` saía
    // `x * `). O snippet é o `trechoOfensor` do relatório de auditoria.
    const fonte = 'int dobro(int x) {\n    return x * 2;\n}\n';
    const r = c.parse(fonte);
    assert.ok(r.ok);
    if (!r.ok) return;
    const achar = (tipo: string, no: LangNode): LangNode | null => {
      if (no.type === tipo) return no;
      for (const filho of no.children) {
        const achado = achar(tipo, filho);
        if (achado) return achado;
      }
      return null;
    };
    const bin = achar('BinaryOperator', r.root);
    assert.ok(bin);
    assert.equal(bin?.text, 'x * 2', `texto completo do operador: veio ${String(bin?.text)}`);
    const func = achar('FunctionDecl', r.root);
    assert.ok(func);
    assert.ok(func?.text.endsWith('}'), 'a definição termina na chave de fechamento');
    // e o INVARIANTE geral: todo nó fatia o fonte exatamente no seu texto
    const visitar = (no: LangNode): void => {
      assert.equal(fonte.slice(no.start, no.end), no.text, `${no.type}: offsets fora do fonte`);
      for (const filho of no.children) visitar(filho);
    };
    for (const filho of r.root.children) visitar(filho);
  });
});

// ---------------------------------------------------------------------------
// 8. extração de teoria — o bloco ```c``` de uma lesson.json
// ---------------------------------------------------------------------------

describe('c — teoria: o bloco ```c``` de uma lesson.json vai ao parser deste adaptador', () => {
  /** Os blocos cercados ```c de uma teoria (o formato de TrackTheorySection). */
  function blocosC(teoria: string): string[] {
    const re = /```c\n([\s\S]*?)```/g;
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(teoria)) !== null) out.push(m[1]);
    return out;
  }

  const LESSON = {
    id: 'c-funcoes-aula-1',
    title: 'Funções em C',
    theory: [
      '# A função empacota um cálculo',
      '',
      'Em C, toda função declara o tipo do retorno:',
      '',
      '```c',
      'int dobro(int x) {',
      '    return x * 2;',
      '}',
      '```',
      '',
      'Erro comum — expressão incompleta:',
      '',
      '```c',
      'int main(void) { int x = ; }',
      '```',
    ].join('\n'),
  };

  it('a tag do bloco resolve para o adaptador c e o trecho VÁLIDO parseia com as chaves da aula', { skip: !TEM_C }, () => {
    assert.equal(adapterIdForTheoryTag('c'), 'c', 'a fiação tag→adaptador aponta para C');
    const blocos = blocosC(LESSON.theory);
    assert.equal(blocos.length, 2);
    const r = c.parse(blocos[0]);
    assert.ok(r.ok, `o trecho de teoria deve parsear: ${JSON.stringify(r.ok ? '' : r.error)}`);
    if (!r.ok) return;
    const chaves = chavesDe(blocos[0]);
    assert.ok(chaves.has('decl:func'), [...chaves].join(' '));
    assert.ok(chaves.has('op:binary:*'), [...chaves].join(' '));
    assert.ok(chaves.has('node:ReturnStmt'), [...chaves].join(' '));
  });

  it('o trecho INVÁLIDO da teoria dá PARSE_ERROR ESTRUTURADO (nunca exceção, nunca árvore parcial)', { skip: !TEM_C }, () => {
    const blocos = blocosC(LESSON.theory);
    const r = c.parse(blocos[1]);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.error.code, 'PARSE_ERROR');
    assert.equal(r.error.line, 1);
    assert.ok(r.error.column >= 1);
    assert.ok(r.error.message.length > 0);
  });
});

// ---------------------------------------------------------------------------
// 9. acentuação em COMENTÁRIO — a coluna é em CARACTERES (byte→char do helper)
// ---------------------------------------------------------------------------

describe('c — acentuação em comentário: a coluna é em CARACTERES, não em bytes', () => {
  it('nó DEPOIS de um comentário acentuado: coluna 21 (char), não 23 (byte)', { skip: !TEM_C }, () => {
    // `int /* ação! */ y = 7;` — `ação` tem 4 chars e 6 bytes em UTF-8.
    // Uma coluna em BYTES daria 23; o contrato é em CARACTERES (o mesmo
    // editor mostra), então 21.
    const fonte = 'int /* ação! */ y = 7;\n';
    const r = c.parse(fonte);
    assert.ok(r.ok);
    if (!r.ok) return;
    let literal: LangNode | null = null;
    const achar = (no: LangNode): void => {
      if (no.type === 'IntegerLiteral' && literal === null) literal = no;
      for (const filho of no.children) achar(filho);
    };
    for (const filho of r.root.children) achar(filho);
    assert.ok(literal, 'a árvore expõe o IntegerLiteral depois do comentário');
    const lit = literal as LangNode;
    assert.equal(lit.column, 21, `coluna em caracteres (byte daria 23): veio ${lit.column}`);
    assert.equal(fonte.slice(lit.start, lit.end), '7', 'o offset (em chars) fatia o literal certo');
    // e o INVARIANTE geral: todo nó fatia o fonte exatamente no seu texto
    const visitar = (no: LangNode): void => {
      assert.equal(fonte.slice(no.start, no.end), no.text, `${no.type}: offsets fora do fonte`);
      for (const filho of no.children) visitar(filho);
    };
    for (const filho of r.root.children) visitar(filho);
  });
});

// ---------------------------------------------------------------------------
// 10. TESTEMUNHA DE REGRESSÃO PERMANENTE — o bug do header tratado como TU foi
//     CORRIGIDO no cLayout (commit 95f7200, onda 2): a lista de fontes emite
//     SÓ os `.c`; o `.h` segue para o disco mas fora de sm_fontes.txt; o
//     SM_RUNNER_SCRIPT NÃO mudou.
// ---------------------------------------------------------------------------

describe('c — desafio multi-arquivo .c + .h: bug do header-como-TU CORRIGIDO (testemunha de regressão permanente)', () => {
  // FUNÇÃO DO TESTE: provar o CONTRATO de ponta a ponta (layout → runner) —
  // um desafio multi-arquivo com header (.c + .h), formato aceito pelo
  // filePathPattern, deve COMPILAR E RODAR até o fim.
  //
  // HISTÓRIA DO BUG (já corrigido): o cLayout antigo empurrava TODO
  // challenge.files — inclusive `.h` — para sm_fontes.txt, e o `run.sh`
  // alimenta CADA linha da lista ao `cc -c`; `cc -c util.h` produz um
  // PRECOMPILED HEADER ("data"), não um objeto — `ld: unknown file type in
  // '…/aluno1.o'`. A solução CORRETA do aluno falhava o gate com exit 1. O
  // conserto (95f7200) ficou no cLayout — fontes = só os `.c`, o header
  // chega ao compilador via `#include` — e o runner permaneceu intocado.
  //
  // A LISTA DE FONTES NÃO É ESCRITA À MÃO: os arquivos do desafio entram pelo
  // `side.files` e o `sm_fontes.txt` materializado é o que o PRÓPRIO cLayout
  // escreve (prepareIsolatedDir deriva de `adapter.layout`). A expectativa
  // acompanha o layout em qualquer conserto futuro — o teste não duplica a
  // regra, ele EXERCITA a cadeia inteira.
  //
  // ESTADO DESTA WORKTREE: o c.ts local ainda é PRÉ-fix (o branch nasceu
  // antes do merge de 95f7200), então este teste roda VERMELHO AQUI por
  // design — a falha É a prova do bug. Pós-merge do conserto fica VERDE e
  // PERMANECE verde: testemunha de regressão, não mais TDD de bug aberto.
  it('desafio multi-arquivo .c + .h compila e roda (cLayout não lista header como TU)', { skip: !TEM_C }, async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-c-bug-h-'));
    const TESTS = 'int soma(int a, int b);\nSM_TEST(soma_de_2_3) { checa_int("soma_de_2_3", soma(2, 3), 5, "2+3=5"); }\n';
    try {
      const dir = await prepareIsolatedDir(
        base,
        {
          code: '',
          files: [
            { path: 'util.h', code: 'int soma(int a, int b);\n' },
            { path: 'util.c', code: 'int soma(int a, int b) { return a + b; }\n' },
          ],
          testsCode: TESTS,
        },
        c,
      );
      const res = await fromChallengeExec(criarExecDeLinguagem(c))(dir, [...c.testCommand], { timeoutMs: 60_000 });
      const saida = execOutput(res);
      assert.equal(res.exitCode, 0, `o desafio com header deve passar; saída:\n${saida}`);
      assert.deepEqual(c.countRun(saida), { testsRun: 1, pass: 1, fail: 0, skipped: 0 });
      assert.deepEqual(c.parseChecks(saida), [{ name: 'soma_de_2_3', passed: true }]);
      assert.equal(judgeSolutionPasses(res, 1, c).passed, true);
      assert.equal(judgeCountMatches(1, 1, res, c).passed, true);
    } finally {
      await fs.promises.rm(base, { recursive: true, force: true }).catch(() => {});
    }
  });
});

// O memo de parse é resetado no fim: este arquivo poluiu o CACHE_PARSE com
// fontes de teste e o processo pode continuar em outra suíte (node --test
// roda arquivos em processos separados, mas o reset é barato e honesto).
cResetParseCache();
cResetDetectCache();
