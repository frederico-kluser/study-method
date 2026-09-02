/**
 * tests/engineLangRegistry.test.ts — O REGISTRO DE ADAPTADORES DE LINGUAGEM.
 *
 * Contrato normativo: `docs/research/08-multilingua-trava-deterministica.md`
 * §6 (linhas 855-957). Este arquivo cobre DUAS coisas, e a segunda é a que
 * importa mais nesta onda:
 *
 *   1. O REGISTRO em si — enum de ids, fail-closed em id desconhecido,
 *      resolução de token de desafio (`nodejs` → `javascript`) e de tag de
 *      bloco de teoria.
 *   2. A PARIDADE do adaptador JavaScript com os valores que hoje vivem
 *      espalhados. O adaptador foi publicado com a promessa de ZERO mudança de
 *      comportamento; cada campo copiado de outro arquivo é comparado AQUI com
 *      a sua origem. Quando a onda 5 apagar a origem e fizer o arquivo
 *      importar do adaptador, estes testes continuam valendo — só param de
 *      comparar duas coisas e passam a comparar uma com ela mesma, que é
 *      exatamente o sinal de que a migração terminou.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_ADAPTER_ID,
  DEFAULT_CHALLENGE_LANGUAGE,
  DEFAULT_RUNTIME,
  ENV_ALLOWLIST_COMUM,
  ENV_NUCLEO_COMUM,
  KNOWN_CHALLENGE_LANGUAGES,
  KNOWN_LANGUAGE_IDS,
  LanguageRegistryError,
  adapterIdForChallengeLanguage,
  adapterIdForTheoryTag,
  applyEnvScrub,
  applyLegacyEnvScrub,
  classifyTheoryTag,
  defaultAdapter,
  findAdapter,
  getAdapter,
  hasAdapter,
  isChallengeLanguage,
  listAdapterIds,
  listChallengeLanguages,
  listTheoryCodeTags,
  registerAdapter,
  type LanguageAdapter,
} from '../electron/main/engine/lang/registry';
import { javascriptAdapter, jsKindName } from '../electron/main/engine/lang/javascript';
import { pyAtomsPath, pyExtractorPath, pythonAdapter } from '../electron/main/engine/lang/python';
import { typescriptAdapter } from '../electron/main/engine/lang/typescript';

// as FONTES que o adaptador duplica hoje (a paridade é medida contra elas)
import { SAFE_FILE_PATH_RE } from '../electron/main/content/trackTypes';
import { SPEC_TEST_ARGS, exitCodeMeaning, parseSpecCounts } from '../electron/main/engine/exec/proofs';
import { NETWORK_HARDENING, buildChildEnv } from '../electron/main/engine/exec/harness';
import { FORBIDDEN_ALWAYS } from '../electron/main/engine/atomKeys';
import { RUNTIME_GLOBALS, countTestDeclarations } from '../electron/main/engine/extract';
import { nodeBinary, parseSpecChecks } from '../electron/main/services/challengeExec';
import { JS_FENCE_TAGS, collectLessonCode, extractFencedBlocks } from '../electron/main/engine/theoryCode';
import { kindName } from '../electron/main/engine/kindNames';
import { readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

const js = javascriptAdapter;
const py = pythonAdapter;
const tsAdapter = typescriptAdapter;

describe('registro — enum de ids e resolução', () => {
  it('todo id DECLARADO tem adaptador registrado, e todo adaptador tem id declarado', () => {
    assert.deepEqual(listAdapterIds(), [...KNOWN_LANGUAGE_IDS].sort());
  });

  it('o adaptador default é javascript e está registrado', () => {
    assert.equal(DEFAULT_ADAPTER_ID, 'javascript');
    assert.equal(defaultAdapter().id, 'javascript');
    assert.ok(hasAdapter('javascript'));
  });

  it('getAdapter de id desconhecido LANÇA erro estruturado — nunca cai no default', () => {
    // ONDA 5: 'python' passou a EXISTIR (segundo adaptador). ONDA 6:
    // 'typescript' (terceiro). O id de teste é 'ruby', que o §7 lista como
    // PRÓXIMO da fila (depois de Go) e ainda não tem adaptador — trocar o id
    // aqui é o sinal esperado de que a linguagem entrou.
    assert.throws(
      () => getAdapter('ruby'),
      (err: unknown) => {
        assert.ok(err instanceof LanguageRegistryError);
        assert.equal(err.code, 'ADAPTADOR_DESCONHECIDO');
        assert.equal(err.detalhes.pedido, 'ruby');
        assert.deepEqual(err.detalhes.conhecidos, ['javascript', 'python', 'typescript']);
        assert.ok(err.message.includes('javascript'), err.message);
        return true;
      },
    );
  });

  it('findAdapter é a variante TOLERANTE (null em vez de lançar)', () => {
    assert.equal(findAdapter('ruby'), null);
    assert.equal(findAdapter('javascript'), js);
    assert.equal(findAdapter('python'), py);
  });

  it("registerAdapter recusa id fora de KNOWN_LANGUAGE_IDS (id fantasma)", () => {
    const falso = { ...js, id: 'go' } as unknown as LanguageAdapter;
    assert.throws(
      () => registerAdapter(falso),
      (err: unknown) => {
        assert.ok(err instanceof LanguageRegistryError);
        assert.equal(err.code, 'ID_NAO_DECLARADO');
        return true;
      },
    );
  });

  it('registerAdapter recusa id DUPLICADO (um id, um adaptador)', () => {
    assert.throws(
      () => registerAdapter(js),
      (err: unknown) => {
        assert.ok(err instanceof LanguageRegistryError);
        assert.equal(err.code, 'ADAPTADOR_DUPLICADO');
        return true;
      },
    );
  });

  it("'nodejs' é RUNTIME e resolve para a LINGUAGEM 'javascript' (§6: nodejs não é linguagem)", () => {
    assert.equal(adapterIdForChallengeLanguage('nodejs'), 'javascript');
    assert.equal(adapterIdForChallengeLanguage('javascript'), 'javascript');
    assert.equal(adapterIdForChallengeLanguage('NodeJS'), 'javascript', 'caixa e espaço normalizados');
    assert.equal(adapterIdForChallengeLanguage('python'), 'python');
    assert.equal(adapterIdForChallengeLanguage('CPython'), 'python', 'alias de implementação');
    assert.equal(adapterIdForChallengeLanguage('python3'), 'python', 'alias de binário');
    assert.equal(adapterIdForChallengeLanguage('ruby'), null);
    assert.equal(adapterIdForChallengeLanguage(undefined), null);
    assert.equal(adapterIdForChallengeLanguage(42), null);
  });

  it('isChallengeLanguage e listChallengeLanguages batem com o declarado', () => {
    assert.ok(isChallengeLanguage('nodejs'));
    assert.ok(isChallengeLanguage('python'));
    assert.ok(!isChallengeLanguage('ruby'));
    assert.deepEqual(listChallengeLanguages(), [...KNOWN_CHALLENGE_LANGUAGES].sort());
  });

  it("o DEFAULT de challenge.language continua 'nodejs' (as 112 trilhas do disco)", () => {
    assert.equal(DEFAULT_CHALLENGE_LANGUAGE, 'nodejs');
    assert.equal(DEFAULT_RUNTIME, 'nodejs');
  });
});

describe('registro — tag de bloco de teoria (qual parser recebe cada bloco)', () => {
  it('tag de código resolve para o adaptador; dado/prosa não vai a parser; desconhecida idem', () => {
    assert.deepEqual(classifyTheoryTag('js'), { kind: 'codigo', adapterId: 'javascript', tag: 'js' });
    assert.deepEqual(classifyTheoryTag('JavaScript'), { kind: 'codigo', adapterId: 'javascript', tag: 'javascript' });
    assert.deepEqual(classifyTheoryTag('json'), { kind: 'nao-codigo', adapterId: null, tag: 'json' });
    assert.deepEqual(classifyTheoryTag('http'), { kind: 'nao-codigo', adapterId: null, tag: 'http' });
    assert.deepEqual(classifyTheoryTag('py'), { kind: 'codigo', adapterId: 'python', tag: 'py' });
    assert.deepEqual(classifyTheoryTag('Python'), { kind: 'codigo', adapterId: 'python', tag: 'python' });
    // `pycon` é transcrição de REPL — texto, não Python parseável.
    assert.deepEqual(classifyTheoryTag('pycon'), { kind: 'nao-codigo', adapterId: null, tag: 'pycon' });
    assert.deepEqual(classifyTheoryTag('ruby'), { kind: 'desconhecida', adapterId: null, tag: 'ruby' });
    assert.deepEqual(classifyTheoryTag(''), { kind: 'ausente', adapterId: null, tag: '' });
    assert.deepEqual(classifyTheoryTag(undefined), { kind: 'ausente', adapterId: null, tag: '' });
  });

  it('as 4 tags que a trilha REAL usa em theory[].code.language são todas classificadas', () => {
    // medido: `js` 148, `javascript` 20, `http` 1, `json` 1 em resources/tracks.
    for (const tag of ['js', 'javascript', 'http', 'json']) {
      assert.notEqual(classifyTheoryTag(tag).kind, 'desconhecida', tag);
    }
  });

  it('listTheoryCodeTags é a união das tags dos adaptadores', () => {
    assert.deepEqual(
      listTheoryCodeTags(),
      [...js.theoryFenceTags, ...py.theoryFenceTags, ...tsAdapter.theoryFenceTags].sort(),
    );
  });
});

describe('paridade JS — VALORES copiados batem com a origem de hoje', () => {
  it('filePathPattern === SAFE_FILE_PATH_RE (content/trackTypes.ts:67)', () => {
    assert.equal(js.filePathPattern.source, SAFE_FILE_PATH_RE.source);
    assert.equal(js.filePathPattern.flags, SAFE_FILE_PATH_RE.flags);
    assert.equal(js.filePathPattern.flags, '', 'sem /g: RegExp compartilhado com /g guarda lastIndex');
    assert.ok(js.filePathPattern.test('lib/soma.mjs'));
    assert.ok(!js.filePathPattern.test('../fuga.mjs'));
    assert.ok(!js.filePathPattern.test('solution.js'));
  });

  it('testCommand === SPEC_TEST_ARGS (engine/exec/proofs.ts:74)', () => {
    assert.deepEqual([...js.testCommand], [...SPEC_TEST_ARGS]);
  });

  it('forbiddenInvariants === FORBIDDEN_ALWAYS (engine/atomKeys.ts:163)', () => {
    assert.deepEqual([...js.forbiddenInvariants], [...FORBIDDEN_ALWAYS]);
  });

  it('globals() === RUNTIME_GLOBALS (engine/extract.ts:121)', () => {
    assert.deepEqual([...js.globals()].sort(), [...RUNTIME_GLOBALS].sort());
    for (const nome of ['undefined', 'NaN', 'Infinity', 'arguments', 'eval', 'console']) {
      assert.ok(js.globals().has(nome), nome);
    }
    assert.equal(js.builtins(), js.globals(), 'em JS builtins e globals coincidem');
  });

  it('theoryFenceTags === JS_FENCE_TAGS (engine/theoryCode.ts:32)', () => {
    assert.deepEqual([...js.theoryFenceTags].sort(), [...JS_FENCE_TAGS].sort());
  });

  it('detect().binary === nodeBinary() (services/challengeExec.ts:52)', () => {
    const d = js.detect();
    assert.equal(d.binary, nodeBinary());
    assert.equal(d.ok, true);
    assert.equal(d.version, process.versions.node);
  });

  it('layout() escreve os MESMOS arquivos que prepareIsolatedDir (engine/exec/harness.ts:78-100)', () => {
    const unico = js.layout({ code: 'export const a = 1;\n', testsCode: 'test();\n' });
    assert.deepEqual(
      unico.files.map((f) => f.path),
      ['package.json', 'solution.mjs', 'test.mjs'],
    );
    assert.equal(unico.files[0].content, JSON.stringify({ type: 'module' }));
    assert.equal(unico.entryPath, 'solution.mjs');
    assert.equal(unico.testPath, 'test.mjs');
    assert.equal(unico.manifestPath, 'package.json');

    const multi = js.layout({
      code: 'ignorado',
      files: [
        { path: 'lib/soma.mjs', code: 'export const soma = 1;' },
        { path: 'solution.mjs', code: 'export const s = 2;' },
      ],
      testsCode: 'test();\n',
    });
    assert.deepEqual(
      multi.files.map((f) => f.path),
      ['package.json', 'lib/soma.mjs', 'solution.mjs', 'test.mjs'],
      'com `files`, o solution.mjs implícito NÃO é escrito (igual ao harness)',
    );
  });
});

describe('paridade JS — envScrub (§6 obs. 2: allowlist) sem quebrar a denylist vigente', () => {
  it('strip cobre NODE_TEST_CONTEXT + toda a NETWORK_HARDENING.stripEnv', () => {
    assert.ok(js.envScrub.strip.includes('NODE_TEST_CONTEXT'));
    for (const nome of NETWORK_HARDENING.stripEnv) {
      assert.ok(js.envScrub.strip.includes(nome), `faltou ${nome}`);
    }
  });

  it('fixed === NETWORK_HARDENING.fixedEnv (sem o núcleo comum — quem o injeta é o applyEnvScrub)', () => {
    assert.deepEqual(js.envScrub.fixed, NETWORK_HARDENING.fixedEnv);
  });

  // ONDA 5 — A MIGRAÇÃO DENYLIST → ALLOWLIST ACONTECEU.
  // Este teste comparava `applyLegacyEnvScrub` com `buildChildEnv` para provar
  // que o adaptador reproduzia o comportamento VIGENTE byte a byte. A onda 5
  // fez a troca deliberada do §6 obs. 2: `buildChildEnv` passou a ser a
  // ALLOWLIST (`applyEnvScrub`). O contrato de `applyLegacyEnvScrub` continua
  // valendo — ele é a semântica ANTERIOR, hoje usada só como REFORÇO DE
  // INVARIANTE sobre um env já construído (`reforcarInvariantesDeEnv`).
  it('applyLegacyEnvScrub continua sendo a DENYLIST (a semântica anterior à onda 5)', () => {
    const base = {
      PATH: '/usr/bin',
      HOME: '/home/x',
      NODE_TEST_CONTEXT: 'test',
      HTTP_PROXY: 'http://proxy',
      https_proxy: 'http://proxy',
      NODE_TLS_REJECT_UNAUTHORIZED: '0',
      FORCE_COLOR: '1',
      NODE_OPTIONS: '--require evil',
      MINHA_VAR: 'preservada',
    };
    assert.deepEqual(applyLegacyEnvScrub(js.envScrub, base), {
      PATH: '/usr/bin',
      HOME: '/home/x',
      MINHA_VAR: 'preservada',
      NO_PROXY: '*',
      no_proxy: '*',
    });
    // e o que ele preserva: a denylist NÃO derruba variável desconhecida.
    assert.equal(applyLegacyEnvScrub(js.envScrub, base).MINHA_VAR, 'preservada');
    assert.equal(applyLegacyEnvScrub(js.envScrub, base).NODE_TEST_CONTEXT, undefined);
    assert.deepEqual(base.NODE_TEST_CONTEXT, 'test', 'PURA: não muta o base');
  });

  it('buildChildEnv É a allowlist (applyEnvScrub) — a troca deliberada da onda 5', () => {
    const base = {
      PATH: '/usr/bin',
      HOME: '/home/x',
      NODE_TEST_CONTEXT: 'test',
      HTTP_PROXY: 'http://proxy',
      MINHA_VAR: 'vazava antes',
    };
    assert.deepEqual(buildChildEnv({ ...base }), applyEnvScrub(js.envScrub, { ...base }));
    // As DUAS diferenças medidas contra a denylist de antes:
    assert.equal(buildChildEnv({ ...base }).MINHA_VAR, undefined, 'variável fora da allowlist não entra mais');
    assert.equal(buildChildEnv({ ...base }).LC_ALL, ENV_NUCLEO_COMUM.LC_ALL, 'o determinismo de locale passou a ser imposto');
    assert.equal(buildChildEnv({ ...base }).TZ, ENV_NUCLEO_COMUM.TZ);
    // e o que NÃO mudou: o veneno continua fora e os fixed continuam valendo.
    assert.equal(buildChildEnv({ ...base }).NODE_TEST_CONTEXT, undefined);
    assert.equal(buildChildEnv({ ...base }).HTTP_PROXY, undefined);
    assert.equal(buildChildEnv({ ...base }).NO_PROXY, '*');
    assert.equal(buildChildEnv({ ...base }).PATH, '/usr/bin');
  });

  it('applyEnvScrub é ALLOWLIST: só o permitido entra, e o determinismo é imposto', () => {
    const env = applyEnvScrub(js.envScrub, {
      PATH: '/usr/bin',
      MINHA_VAR: 'nao deveria passar',
      GOFLAGS: '-mod=mod',
      PYTHONPATH: '/veneno',
      LC_ALL: 'pt_BR.UTF-8',
      TZ: 'America/Sao_Paulo',
    });
    assert.equal(env.PATH, '/usr/bin');
    assert.equal(env.MINHA_VAR, undefined, 'allowlist: o que não está na lista não entra');
    assert.equal(env.GOFLAGS, undefined);
    assert.equal(env.PYTHONPATH, undefined);
    assert.equal(env.LC_ALL, ENV_NUCLEO_COMUM.LC_ALL, 'o núcleo comum SOBRESCREVE o herdado');
    assert.equal(env.TZ, ENV_NUCLEO_COMUM.TZ);
    assert.equal(env.NO_PROXY, '*');
  });

  it('a allowlist comum tem o mínimo para o spawn sequer achar o binário', () => {
    assert.ok(ENV_ALLOWLIST_COMUM.includes('PATH'));
    assert.ok(ENV_ALLOWLIST_COMUM.includes('HOME'));
  });
});

describe('paridade JS — comportamento DELEGADO (contagens, checks, exit codes)', () => {
  const TESTS_CODE = [
    "import test from 'node:test';",
    "test('a', () => {});",
    "test('b', () => {});",
    "// test('comentado', () => {});",
    "test.skip('c', () => {});",
  ].join('\n');

  it('countDeclared === countTestDeclarations (comentário não conta)', () => {
    assert.equal(js.countDeclared(TESTS_CODE), countTestDeclarations(TESTS_CODE));
    assert.equal(js.countDeclared(TESTS_CODE), 3);
  });

  it('countRun === parseSpecCounts (último bloco de resumo, tolerante a ANSI)', () => {
    const saida = [
      "console.log do codigo sob teste: ℹ tests 99",
      'ℹ tests 3',
      'ℹ pass 2',
      'ℹ fail 1',
      'ℹ skipped 0',
    ].join('\n');
    assert.deepEqual(js.countRun(saida), parseSpecCounts(saida));
    assert.deepEqual(js.countRun(saida), { testsRun: 3, pass: 2, fail: 1, skipped: 0 });
  });

  it('parseChecks === parseSpecChecks', () => {
    const saida = '✔ caso 1 (0.42175ms)\n✖ caso 2 (1.203ms)\nℹ tests 2\n';
    assert.deepEqual(js.parseChecks(saida), parseSpecChecks(saida));
    assert.deepEqual(js.parseChecks(saida), [
      { name: 'caso 1', passed: true },
      { name: 'caso 2', passed: false },
    ]);
  });

  it('failureExitCodes: falha é code !== 0, e a dupla-igualdade é INVARIANTE (§6 obs. 3)', () => {
    assert.equal(js.failureExitCodes.isFailure(0), false);
    assert.equal(js.failureExitCodes.isFailure(1), true);
    assert.equal(js.failureExitCodes.isFailure(137), true);
    assert.equal(js.failureExitCodes.meaning(137), exitCodeMeaning(137));
    assert.equal(js.failureExitCodes.successRequiresCountMatch, true);
  });
});

describe('paridade JS — Porta 1 (parse) e os membros que a onda 5 vai consumir', () => {
  it('parse devolve árvore com line/column 1-based e offsets absolutos', () => {
    const fonte = 'const a = 1;\nconst b = a + 2;\n';
    const r = js.parse(fonte);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.source, fonte);
    assert.equal(r.root.line, 1);
    assert.equal(r.root.column, 1);
    assert.equal(r.root.start, 0);

    const achar = (tipo: string, no = r.root): typeof r.root | null => {
      if (no.type === tipo) return no;
      for (const filho of no.children) {
        const achado = achar(tipo, filho);
        if (achado) return achado;
      }
      return null;
    };
    const bin = achar('BinaryExpression');
    assert.ok(bin, 'a árvore normalizada expõe BinaryExpression');
    if (!bin) return;
    assert.equal(bin.line, 2, '`a + 2` está na 2ª linha');
    assert.equal(bin.attributes.operator, '+');
    assert.equal(bin.attributes.operatorFamily, 'binary');
    assert.equal(fonte.slice(bin.start, bin.end), bin.text, 'offsets indexam o fonte devolvido');
  });

  it('parse de código quebrado devolve PARSE_ERROR estruturado (nunca exceção, nunca árvore parcial)', () => {
    const r = js.parse('const = ;');
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.error.code, 'PARSE_ERROR');
    assert.ok(r.error.line >= 1);
    assert.ok(r.error.column >= 1);
    assert.ok(r.error.message.length > 0);
  });

  it('constructKey: tipo + ATRIBUTO, não só tipo (§6)', () => {
    const r = js.parse('let x = 1; x += 2; const y = x !== 3;');
    assert.ok(r.ok);
    if (!r.ok) return;
    const chaves = new Set<string>();
    const visitar = (no: typeof r.root): void => {
      const k = js.constructKey(no);
      if (k) chaves.add(k);
      for (const f of no.children) visitar(f);
    };
    visitar(r.root);
    assert.ok(chaves.has('op:assign:+='), [...chaves].join(' '));
    assert.ok(chaves.has('op:binary:!=='), [...chaves].join(' '));
    assert.ok(chaves.has('decl:let'), [...chaves].join(' '));
    assert.ok(chaves.has('decl:const'), [...chaves].join(' '));
    assert.ok(chaves.has('node:IfStatement') === false);
  });

  it('inventory é o enum FECHADO de tipos de nó — ordenado, sem marcador de faixa', () => {
    const inv = js.inventory();
    assert.ok(inv.length > 100, `esperado > 100 tipos, veio ${inv.length}`);
    assert.deepEqual([...inv], [...inv].sort(), 'ordenado (determinismo do complemento)');
    assert.ok(inv.includes('IfStatement'));
    assert.ok(inv.includes('BinaryExpression'));
    assert.ok(!inv.some((n) => n.startsWith('First') || n.startsWith('Last')));
    assert.equal(js.inventory(), inv, 'memoizado — mesma referência');
  });

  it('resolveScopes separa declarado, importado e livre (limite PLANO declarado)', () => {
    const r = js.parse(
      "import assert from 'node:assert/strict';\nconst local = 1;\nfunction f(p) { return p + local + console.log(assert); }\n",
    );
    assert.ok(r.ok);
    if (!r.ok) return;
    const escopos = js.resolveScopes(r);
    assert.ok(escopos.declared.has('local'));
    assert.ok(escopos.declared.has('f'));
    assert.ok(escopos.declared.has('p'));
    assert.ok(escopos.declared.has('assert'));
    assert.ok(escopos.imported.has('assert'));
    assert.ok(!escopos.free.has('local'), 'nome declarado não é livre');
    assert.ok(escopos.globals.has('console'), 'console é global de runtime e não foi declarado');
  });
});

describe('theoryCode — adapterId por bloco (o campo que a onda 5 consome)', () => {
  it('cerca com tag de código: adapterId javascript; isJavaScript continua derivado', () => {
    const { blocks } = extractFencedBlocks('```js\nconst a = 1;\n```\n');
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].adapterId, 'javascript');
    assert.equal(blocks[0].isJavaScript, true);
  });

  it('cerca com tag de DADO: sem adaptador (não vai a parser)', () => {
    const { blocks } = extractFencedBlocks('```json\n{"a":1}\n```\n');
    assert.equal(blocks[0].adapterId, null);
    assert.equal(blocks[0].isJavaScript, false);
  });

  it('cerca SEM tag: sem adaptador E defeito de formato (o comportamento de hoje)', () => {
    const { blocks, hygiene } = extractFencedBlocks('```\nqualquer coisa\n```\n');
    assert.equal(blocks[0].adapterId, null);
    assert.equal(blocks[0].isJavaScript, false);
    assert.equal(hygiene[0].code, 'FENCE_SEM_TAG');
  });

  it('campo `code` da seção SEM language: DEFAULT do adaptador (a assimetria documentada)', () => {
    const { blocks } = collectLessonCode([{ id: 's', code: { code: 'const a = 1;' } }]);
    assert.equal(blocks[0].origin, 'section-code');
    assert.equal(blocks[0].adapterId, 'javascript');
    assert.equal(blocks[0].isJavaScript, true, 'preserva engine/theoryCode.ts:178 de antes da onda');
  });

  it('campo `code` da seção com language de dado: sem adaptador', () => {
    const { blocks } = collectLessonCode([{ id: 's', code: { language: 'json', code: '{"a":1}' } }]);
    assert.equal(blocks[0].adapterId, null);
    assert.equal(blocks[0].isJavaScript, false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// ONDA 6 — O ADAPTADOR TEM DE SOBREVIVER AO BUNDLE DO MAIN
//
// O defeito que estes testes fecham: `lang/javascript.ts` alcançava metade dos
// seus membros por `require` POSTERGADO com caminho RELATIVO
// (`carregar('../extract')`, `carregar('../exec/proofs')`,
// `carregar('../../services/challengeExec')`). Rollup não enxerga
// `require(variável)` — a string sobrevivia LITERAL ao bundle e, resolvida a
// partir de `out/main/index.js`, apontava para módulos que não existem lá.
// Reprodução medida antes do conserto:
//
//     npm run build && cd out/main && node -e "require('../exec/proofs')"
//     → Error: Cannot find module '../exec/proofs'
//
// Efeito no produto: no app EMPACOTADO, `runStudentCode` (submissão do aluno)
// e `verifyChallengePair` (regeneração) lançavam MODULE_NOT_FOUND. A suíte
// roda DO FONTE, onde o caminho relativo resolve — por isso o gate não via
// nada. O teste abaixo não roda o bundle: ele proíbe a CAUSA no fonte.
// ───────────────────────────────────────────────────────────────────────────

describe('bundle-safety — TODO adaptador de engine/lang é um módulo FOLHA', () => {
  // ONDA 7 — A GUARDA DEIXOU DE SER SÓ DO `javascript.ts`.
  //
  // Ela cobria UM arquivo, e o defeito que ela fecha já estava ARMADO num
  // segundo: `lang/python.ts` tem o MESMO helper `carregar(modulo)`, com nove
  // chamadas. Hoje é inofensivo — todos os argumentos são builtins (`node:path`,
  // `node:fs`, `node:url`, `node:child_process`), que resolvem a partir de
  // QUALQUER diretório, do fonte ou do bundle. Mas é a mesma armadilha, sem
  // guarda: bastava uma chamada com caminho relativo para reproduzir o
  // MODULE_NOT_FOUND do app empacotado, e a suíte (que roda do fonte, onde o
  // relativo resolve) não veria nada. Agora a guarda vale para todo `lang/*.ts`,
  // e vale para arquivo que ainda nem existe: a lista sai do `readdirSync`.
  const DIR_LANG = path.join(__dirname, '..', 'electron', 'main', 'engine', 'lang');
  const ARQUIVOS = readdirSync(DIR_LANG)
    .filter((nome) => nome.endsWith('.ts'))
    .sort();

  // COMENTÁRIOS FORA. Os cabeçalhos CITAM os `require` relativos que foram
  // apagados (é a documentação do defeito); sem tirar os comentários, o teste
  // acusaria a própria explicação e nunca ficaria verde.
  function fonteDe(nome: string): string {
    return readFileSync(path.join(DIR_LANG, nome), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[^\n]*?\/\/.*$/gm, '');
  }

  /**
   * Todo especificador de módulo em posição de CARGA: o `require('x')` direto e
   * o `carregar<T>('x')` postergado. Os dois viram a mesma coisa em runtime, e
   * um teste que olhasse só para `require(` deixaria as nove chamadas de
   * `python.ts` sem cobertura nenhuma.
   */
  function especificadores(fonte: string): string[] {
    const re = /\b(?:require|carregar)\s*(?:<[^<>]*>)?\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
    return [...fonte.matchAll(re)].map((m) => m[1]);
  }

  it('a guarda cobre TODOS os arquivos de engine/lang (a lista sai do disco)', () => {
    assert.deepEqual(ARQUIVOS, ['javascript.ts', 'python.ts', 'registry.ts', 'typescript.ts']);
  });

  for (const nome of ARQUIVOS) {
    describe(`lang/${nome}`, () => {
      const fonte = fonteDe(nome);

      it('nenhum especificador de caminho — nem relativo (`./`, `../`) nem absoluto (`/`)', () => {
        // O que não sobrevive ao rebase de diretório que o bundle faz: a árvore
        // de `out/main/` não é a de `electron/main/`.
        const caminhos = especificadores(fonte).filter((e) => e.startsWith('.') || e.startsWith('/'));
        assert.deepEqual(caminhos, [], `especificador de caminho proibido: ${caminhos.join(', ')}`);
      });

      it('todo especificador é BARE: um builtin `node:*` ou o pacote `typescript`', () => {
        // BUILTIN `node:*` e PACOTE são as duas formas que resolvem de qualquer
        // diretório. `typescript` é `dependency` de runtime (teste abaixo) e o
        // `externalizeDepsPlugin()` a mantém fora do bundle; um builtin não
        // passa nem perto do bundler.
        for (const spec of especificadores(fonte)) {
          assert.ok(
            spec === 'typescript' || spec.startsWith('node:'),
            `${nome}: especificador não-bare/não-builtin: ${spec}`,
          );
        }
      });

      it('`require(variável)` só existe dentro do helper de carga, e o helper é uma linha', () => {
        // Rollup não enxerga `require(variável)`: a string sobrevive LITERAL ao
        // bundle. O padrão é tolerado num único lugar — o helper `carregar`,
        // cujo corpo é `return require(modulo) as T` e cujos ARGUMENTOS o teste
        // acima já provou serem literais bare. Qualquer outro `require(x)` é
        // uma string que ninguém conferiu.
        const dinamicos = [...fonte.matchAll(/\brequire\(\s*(?!['"`])([A-Za-z_$][\w$]*)\s*\)/g)].map(
          (m) => m[0],
        );
        if (dinamicos.length === 0) return;
        assert.deepEqual(
          dinamicos,
          ['require(modulo)'],
          `${nome}: require dinâmico fora do helper de carga`,
        );
        assert.match(
          fonte,
          /function carregar<T>\(modulo: string\): T \{\s*return require\(modulo\) as T;\s*\}/,
          `${nome}: o helper de carga não é o de uma linha auditável`,
        );
      });
    });
  }

  it('`typescript` é DEPENDENCY de runtime, não devDependency', () => {
    // Como devDependency o electron-builder não a empacota, e o
    // `require('typescript')` do adaptador morreria no app instalado — a
    // contagem DECLARADA (`countDeclared`) precisa do compilador em runtime.
    // Como dependency, `externalizeDepsPlugin()` também a mantém FORA do
    // bundle, em vez de inlinar o compilador em out/main/index.js.
    const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    assert.ok(pkg.dependencies.typescript, 'typescript tem de estar em dependencies');
    assert.equal(pkg.devDependencies.typescript, undefined, 'e não pode ficar duplicada em devDependencies');
  });

  it('`javascript.ts` não tem import ESTÁTICO de valor — o ciclo com o registro continua fechado', () => {
    // Só ele: `registry.ts` importa os três adaptadores como VALOR (é o
    // registro), e `typescript.ts` importa `javascriptAdapter` (é composição
    // sobre ele). O `javascript.ts` é a FOLHA da árvore e não pode importar
    // ninguém — é dele que o ciclo partiria.
    const fonte = fonteDe('javascript.ts');
    const imports = [...fonte.matchAll(/^import\s+(?!type\b)[^;]*?from\s*['"][^'"]+['"];/gm)].map((m) => m[0]);
    assert.deepEqual(imports, [], `import de valor proibido: ${imports.join(' | ')}`);
  });

  it('`python.ts` também é folha: nada de import de valor, e os artefatos vêm por resolução', () => {
    const fonte = fonteDe('python.ts');
    const imports = [...fonte.matchAll(/^import\s+(?!type\b)[^;]*?from\s*['"][^'"]+['"];/gm)].map((m) => m[0]);
    assert.deepEqual(imports, [], `import de valor proibido: ${imports.join(' | ')}`);
    // O `.py` e o `.json` NÃO entram por `require`/`import` — eles são
    // RESOLVIDOS em disco entre candidatos (fonte, bundle achatado, raiz do
    // repo) com uma variável de ambiente na frente. É por isso que o adaptador
    // sobrevive ao bundle sem que o bundler precise enxergar o artefato.
    assert.ok(pyExtractorPath() !== null, 'vocab/py/extract_ast.py tem de resolver');
    assert.ok(pyAtomsPath() !== null, 'vocab/atoms.python.json tem de resolver');
  });
});

describe('paridade da TABELA CANÔNICA de SyntaxKind (jsKindName × engine/kindNames)', () => {
  // O adaptador constrói a sua própria tabela a partir do compilador LAZY, em
  // vez de importar `engine/kindNames.ts` — aquele módulo importa `typescript`
  // ESTATICAMENTE e um import daqui faria todo start do main pagar o
  // compilador (~42 ms, ~45 MB) só para abrir uma aula. O preço dessa escolha é
  // uma segunda cópia do algoritmo; este teste é o que impede a divergência,
  // comparando as duas para TODO valor do enum, um a um.
  it('mesmo nome para TODO valor de ts.SyntaxKind (incluindo os marcadores de faixa)', () => {
    const enumeracao = ts.SyntaxKind as unknown as Record<string, number>;
    const valores = new Set<number>();
    for (const nome of Object.keys(enumeracao)) {
      if (!Number.isNaN(Number(nome))) continue;
      valores.add(enumeracao[nome]);
    }
    assert.ok(valores.size > 300, `esperado > 300 kinds distintos, veio ${valores.size}`);
    for (const valor of valores) {
      assert.equal(jsKindName(valor), kindName(valor), `divergência no kind ${valor}`);
    }
  });

  it('a armadilha do marcador de faixa: NumericLiteral não vira FirstLiteralToken', () => {
    // `ts.SyntaxKind[ts.SyntaxKind.NumericLiteral]` devolve "FirstLiteralToken"
    // (busca reversa do enum: o ÚLTIMO nome atribuído ao valor vence).
    assert.equal(ts.SyntaxKind[ts.SyntaxKind.NumericLiteral], 'FirstLiteralToken');
    assert.equal(jsKindName(ts.SyntaxKind.NumericLiteral), 'NumericLiteral');
  });

  it('kind desconhecido degrada para o número, como a tabela original', () => {
    assert.equal(jsKindName(999999), '999999');
    assert.equal(jsKindName(999999), kindName(999999 as ts.SyntaxKind));
  });
});

describe('parse — `root` é PREGUIÇOSO (regressão de performance da onda 6)', () => {
  const FONTE = 'const a = 1;\nfunction f(x) { return x + a; }\n';

  it('`root` é getter, não propriedade de dado — a árvore não é construída no parse', () => {
    const r = js.parse(FONTE);
    assert.ok(r.ok);
    if (!r.ok) return;
    const desc = Object.getOwnPropertyDescriptor(r, 'root');
    assert.ok(desc, 'root existe');
    assert.equal(typeof desc?.get, 'function', 'root é um getter');
    assert.equal(desc?.value, undefined, 'root NÃO é um valor pré-computado');
  });

  it('materializa UMA vez e memoiza — duas leituras devolvem a MESMA referência', () => {
    const r = js.parse(FONTE);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.root, r.root, 'a árvore é construída uma vez só');
    assert.equal(r.root.children[0], r.root.children[0], 'e os filhos junto com ela');
  });

  it('o CONTRATO de ParseOk não mudou: ok/source/native/root seguem observáveis', () => {
    const r = js.parse(FONTE);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.source, FONTE);
    assert.ok(r.native, 'a árvore NATIVA continua exposta (é o que o extrator usa)');
    assert.equal(r.root.type, 'SourceFile');
    assert.equal(r.root.start, 0);
    assert.equal(FONTE.slice(r.root.start, r.root.end), r.root.text);
    assert.deepEqual(Object.keys(r).sort(), ['native', 'ok', 'root', 'source']);
  });

  it('o consumidor real (extract) NÃO toca root — a prova de que a preguiça vale', () => {
    // se algum dia o extrator passar a usar `root`, este teste continua verde
    // (nada quebra); ele existe para documentar de onde vem o ganho medido.
    const r = js.parse(FONTE);
    assert.ok(r.ok);
    if (!r.ok) return;
    const escopos = js.resolveScopes(r);
    assert.ok(escopos.declared.has('f'), 'resolveScopes trabalha sobre `native`');
    assert.equal(
      Object.getOwnPropertyDescriptor(r, 'root')?.value,
      undefined,
      'resolveScopes não materializou a árvore normalizada',
    );
  });
});
