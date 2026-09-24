/**
 * tests/cx-langqual-lang-registry.test.ts — CARACTERIZAÇÃO (golden master) do
 * REGISTRO de adaptadores e dos tipos centrais do contrato de linguagem
 * (`engine/lang/registry.ts`). Rede de segurança para a refatoração das ondas
 * seguintes: qualquer mudança de comportamento OBSERVÁVEL destes módulos tem de
 * passar por aqui primeiro.
 *
 * Contratos que mordem aqui:
 *   1. Vocabulários fechados: KNOWN_LANGUAGE_IDS, KNOWN_CHALLENGE_LANGUAGES,
 *      NON_CODE_THEORY_TAGS e os três defaults ('javascript', 'nodejs',
 *      'nodejs') são LITERAL do contrato — nada de reordenar por esquecimento;
 *   2. O registro é FAIL-CLOSED com erro ESTRUTURADO (`LanguageRegistryError`
 *      com code + detalhes.pedido + detalhes.conhecidos) nos códigos
 *      ADAPTADOR_DESCONHECIDO / ADAPTADOR_DUPLICADO / ID_NAO_DECLARADO;
 *   3. Resolução de token é NORMALIZADA (trim + lower) e TOTAL: todo token cai
 *      em um adaptador ou em `null` — 'nodejs' (runtime) resolve para
 *      'javascript' (linguagem);
 *   4. `classifyTheoryTag` é TOTAL nos quatro baldes ('codigo' | 'nao-codigo'
 *      | 'desconhecida' | 'ausente') e `classifyTheoryTag(tag).kind` decide o
 *      destino do bloco (parser × nenhum parser);
 *   5. As DUAS semânticas de env scrub convivem DE PROPÓSITO (§ registry.ts):
 *      `applyEnvScrub` = allowlist construída do nada (com ENV_NUCLEO_COMUM);
 *      `applyLegacyEnvScrub` = denylist sobre cópia do pai (SEM o núcleo). As
 *      duas são PURAS (não mutam `base`) e divergem em strip×fixed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  KNOWN_LANGUAGE_IDS,
  KNOWN_CHALLENGE_LANGUAGES,
  DEFAULT_ADAPTER_ID,
  DEFAULT_CHALLENGE_LANGUAGE,
  DEFAULT_RUNTIME,
  NON_CODE_THEORY_TAGS,
  ENV_NUCLEO_COMUM,
  ENV_ALLOWLIST_COMUM,
  LanguageRegistryError,
  registerAdapter,
  getAdapter,
  findAdapter,
  defaultAdapter,
  listAdapterIds,
  listAdapters,
  hasAdapter,
  listChallengeLanguages,
  adapterIdForChallengeLanguage,
  isChallengeLanguage,
  classifyTheoryTag,
  adapterIdForTheoryTag,
  listTheoryCodeTags,
  applyEnvScrub,
  applyLegacyEnvScrub,
  type ChildEnv,
  type EnvScrubPolicy,
  type LanguageAdapter,
} from '../electron/main/engine/lang/registry';

describe('registry — (1) vocabulários fechados do contrato', () => {
  it('KNOWN_LANGUAGE_IDS é a lista literal, em ordem de declaração', () => {
    assert.deepEqual(
      [...KNOWN_LANGUAGE_IDS],
      ['javascript', 'python', 'typescript', 'c', 'rust'],
    );
  });

  it('KNOWN_CHALLENGE_LANGUAGES é a lista literal (linguagens × runtimes/aliases)', () => {
    assert.deepEqual(
      [...KNOWN_CHALLENGE_LANGUAGES],
      [
        'javascript',
        'nodejs',
        'python',
        'python3',
        'cpython',
        'typescript',
        'ts',
        'c',
        'c11',
        'rust',
        'rs',
      ],
    );
  });

  it('NON_CODE_THEORY_TAGS cobre dados/prosa/saída — inclusive pycon/traceback', () => {
    assert.deepEqual(
      [...NON_CODE_THEORY_TAGS],
      [
        'json',
        'jsonc',
        'http',
        'bash',
        'sh',
        'shell',
        'zsh',
        'console',
        'terminal',
        'output',
        'text',
        'txt',
        'plain',
        'md',
        'markdown',
        'diff',
        'yaml',
        'yml',
        'toml',
        'ini',
        'env',
        'csv',
        'xml',
        'log',
        'pycon',
        'py-repl',
        'traceback',
      ],
    );
  });

  it('os três defaults são os do contrato (não renomear o disco)', () => {
    assert.equal(DEFAULT_ADAPTER_ID, 'javascript');
    assert.equal(DEFAULT_CHALLENGE_LANGUAGE, 'nodejs');
    assert.equal(DEFAULT_RUNTIME, 'nodejs');
  });
});

describe('registry — (2) o registro fail-closed', () => {
  it('os 5 adaptadores canônicos estão registrados, em ordem alfabética estável', () => {
    assert.deepEqual(listAdapterIds(), ['c', 'javascript', 'python', 'rust', 'typescript']);
  });

  it('listAdapters() bate 1:1 com listAdapterIds() (mesma ordem)', () => {
    const ids = listAdapters().map((a) => a.id);
    assert.deepEqual(ids, listAdapterIds());
  });

  it('hasAdapter é sensível a CAIXA e a id desconhecido', () => {
    assert.equal(hasAdapter('c'), true);
    assert.equal(hasAdapter('C'), false);
    assert.equal(hasAdapter('golang'), false);
  });

  it('defaultAdapter() é o javascript', () => {
    assert.equal(defaultAdapter().id, 'javascript');
  });

  it("getAdapter('c') devolve o adaptador registrado com id 'c'", () => {
    assert.equal(getAdapter('c').id, 'c');
  });

  it('getAdapter desconhecido LANÇA LanguageRegistryError ADAPTADOR_DESCONHECIDO com a lista do que é válido', () => {
    assert.throws(
      () => getAdapter('golang'),
      (e: unknown) => {
        assert.ok(e instanceof LanguageRegistryError);
        assert.equal(e.name, 'LanguageRegistryError');
        assert.equal(e.code, 'ADAPTADOR_DESCONHECIDO');
        assert.equal(e.detalhes.pedido, 'golang');
        assert.deepEqual(e.detalhes.conhecidos, ['c', 'javascript', 'python', 'rust', 'typescript']);
        assert.match(e.message, /"golang"/);
        assert.match(e.message, /conhecidas/);
        return true;
      },
    );
  });

  it('findAdapter é a variante TOLERANTE: null em vez de lançar', () => {
    assert.equal(findAdapter('golang'), null);
    assert.equal(findAdapter('python')?.id, 'python');
  });

  it('registerAdapter com id fantasma LANÇA ID_NAO_DECLARADO citando KNOWN_LANGUAGE_IDS', () => {
    const falso = { id: 'golang' } as unknown as LanguageAdapter;
    assert.throws(
      () => registerAdapter(falso),
      (e: unknown) => {
        assert.ok(e instanceof LanguageRegistryError);
        assert.equal(e.code, 'ID_NAO_DECLARADO');
        assert.equal(e.detalhes.pedido, 'golang');
        assert.deepEqual(e.detalhes.conhecidos, [...KNOWN_LANGUAGE_IDS]);
        assert.match(e.message, /KNOWN_LANGUAGE_IDS/);
        return true;
      },
    );
  });

  it('registerAdapter duplicado LANÇA ADAPTADOR_DUPLICADO (um id, um adaptador)', () => {
    const jaRegistrado = getAdapter('c');
    assert.throws(
      () => registerAdapter(jaRegistrado),
      (e: unknown) => {
        assert.ok(e instanceof LanguageRegistryError);
        assert.equal(e.code, 'ADAPTADOR_DUPLICADO');
        assert.equal(e.detalhes.pedido, 'c');
        assert.deepEqual(e.detalhes.conhecidos, ['c', 'javascript', 'python', 'rust', 'typescript']);
        assert.match(e.message, /um id, um adaptador/);
        return true;
      },
    );
  });

  it('LanguageRegistryError é Error com name próprio (serializável em relatório)', () => {
    const e = new LanguageRegistryError('ADAPTADOR_DESCONHECIDO', 'x', { pedido: 'y', conhecidos: [] });
    assert.ok(e instanceof Error);
    assert.equal(e.name, 'LanguageRegistryError');
  });
});

describe('registry — (3) resolução de token de desafio/trilha', () => {
  it('cada token conhecido resolve para o adaptador dono (runtime → linguagem)', () => {
    assert.equal(adapterIdForChallengeLanguage('javascript'), 'javascript');
    assert.equal(adapterIdForChallengeLanguage('nodejs'), 'javascript');
    assert.equal(adapterIdForChallengeLanguage('python'), 'python');
    assert.equal(adapterIdForChallengeLanguage('python3'), 'python');
    assert.equal(adapterIdForChallengeLanguage('cpython'), 'python');
    assert.equal(adapterIdForChallengeLanguage('typescript'), 'typescript');
    assert.equal(adapterIdForChallengeLanguage('ts'), 'typescript');
    assert.equal(adapterIdForChallengeLanguage('c'), 'c');
    assert.equal(adapterIdForChallengeLanguage('c11'), 'c');
    assert.equal(adapterIdForChallengeLanguage('rust'), 'rust');
    assert.equal(adapterIdForChallengeLanguage('rs'), 'rust');
  });

  it('a resolução NORMALIZA caixa e espaços (a igualdade é sobre o resultado, não a string crua)', () => {
    assert.equal(adapterIdForChallengeLanguage(' NodeJS '), 'javascript');
    assert.equal(adapterIdForChallengeLanguage('C11'), 'c');
    assert.equal(adapterIdForChallengeLanguage('RS'), 'rust');
  });

  it('token desconhecido ou não-string resolve para null (quem chama decide se é erro)', () => {
    assert.equal(adapterIdForChallengeLanguage('golang'), null);
    assert.equal(adapterIdForChallengeLanguage(''), null);
    assert.equal(adapterIdForChallengeLanguage(null), null);
    assert.equal(adapterIdForChallengeLanguage(undefined), null);
    assert.equal(adapterIdForChallengeLanguage(42), null);
  });

  it('isChallengeLanguage espelha a resolução (type guard total)', () => {
    assert.equal(isChallengeLanguage('nodejs'), true);
    assert.equal(isChallengeLanguage('ts'), true);
    assert.equal(isChallengeLanguage('java'), false);
    assert.equal(isChallengeLanguage(null), false);
  });

  it('listChallengeLanguages reúne TODOS os tokens dos adaptadores registrados, em ordem estável', () => {
    assert.deepEqual(listChallengeLanguages(), [
      'c',
      'c11',
      'cpython',
      'javascript',
      'nodejs',
      'python',
      'python3',
      'rs',
      'rust',
      'ts',
      'typescript',
    ]);
  });
});

describe('registry — (4) classificação de tag de teoria (TOTAL em 4 baldes)', () => {
  it('tag de código resolve para o adaptador dono, com tag NORMALIZADA', () => {
    assert.deepEqual(classifyTheoryTag('c'), { kind: 'codigo', adapterId: 'c', tag: 'c' });
    assert.deepEqual(classifyTheoryTag(' RUST '), { kind: 'codigo', adapterId: 'rust', tag: 'rust' });
    assert.deepEqual(classifyTheoryTag('JSX'), { kind: 'codigo', adapterId: 'javascript', tag: 'jsx' });
  });

  it('tag de NÃO-código (json, pycon, traceback…) não vai a parser nenhum', () => {
    assert.deepEqual(classifyTheoryTag('json'), { kind: 'nao-codigo', adapterId: null, tag: 'json' });
    assert.deepEqual(classifyTheoryTag('pycon'), { kind: 'nao-codigo', adapterId: null, tag: 'pycon' });
    assert.deepEqual(classifyTheoryTag('OUTPUT'), { kind: 'nao-codigo', adapterId: null, tag: 'output' });
  });

  it('tag desconhecida é DESCONHECIDA — nunca cai num parser por engano', () => {
    assert.deepEqual(classifyTheoryTag('cobol'), { kind: 'desconhecida', adapterId: null, tag: 'cobol' });
  });

  it('tag AUSENTE (não-string, vazia, só espaços) tem tag vazia', () => {
    assert.deepEqual(classifyTheoryTag(''), { kind: 'ausente', adapterId: null, tag: '' });
    assert.deepEqual(classifyTheoryTag('   '), { kind: 'ausente', adapterId: null, tag: '' });
    assert.deepEqual(classifyTheoryTag(null), { kind: 'ausente', adapterId: null, tag: '' });
    assert.deepEqual(classifyTheoryTag(undefined), { kind: 'ausente', adapterId: null, tag: '' });
    assert.deepEqual(classifyTheoryTag(7), { kind: 'ausente', adapterId: null, tag: '' });
  });

  it('adapterIdForTheoryTag devolve o parser certo ou null (não-código/desconhecida/ausente)', () => {
    assert.equal(adapterIdForTheoryTag('mjs'), 'javascript');
    assert.equal(adapterIdForTheoryTag('python3'), 'python');
    assert.equal(adapterIdForTheoryTag('json'), null);
    assert.equal(adapterIdForTheoryTag('cobol'), null);
    assert.equal(adapterIdForTheoryTag(''), null);
  });

  it('listTheoryCodeTags é a união das tags de TODOS os adaptadores, em ordem estável', () => {
    assert.deepEqual(listTheoryCodeTags(), [
      'c',
      'cjs',
      'javascript',
      'js',
      'jsx',
      'mjs',
      'node',
      'py',
      'python',
      'python3',
      'rs',
      'rust',
      'ts',
      'typescript',
    ]);
  });
});

// ---------------------------------------------------------------------------
// (5) env scrub — as DUAS semânticas que convivem de propósito
// ---------------------------------------------------------------------------

const POLICY: EnvScrubPolicy = {
  allow: ['EXTRA_OK'],
  fixed: { FIXADO: '1' },
  strip: ['VENENO'],
  scope: ['fixture de teste'],
};

describe('registry — (5a) applyEnvScrub: allowlist construída do nada', () => {
  it('só herda o que está na allowlist comum + extras da política — segredos NÃO vazam', () => {
    const base: ChildEnv = {
      PATH: '/usr/bin',
      HOME: '/home/aluno',
      TMPDIR: '/tmp/x',
      EXTRA_OK: 'herdado',
      AWS_SECRET_ACCESS_KEY: 'VAZOU?',
      NPM_TOKEN: 'VAZOU?',
      LC_ALL: 'pt_BR.UTF-8',
    };
    const env = applyEnvScrub(POLICY, base);
    assert.equal(env.PATH, '/usr/bin');
    assert.equal(env.HOME, '/home/aluno');
    assert.equal(env.TMPDIR, '/tmp/x');
    assert.equal(env.EXTRA_OK, 'herdado');
    assert.equal(env.AWS_SECRET_ACCESS_KEY, undefined);
    assert.equal(env.NPM_TOKEN, undefined);
  });

  it('injeta o NÚCLEO COMUM de determinismo e os valores fixed (LC_ALL/TZ sempre)', () => {
    const env = applyEnvScrub(POLICY, { LC_ALL: 'pt_BR.UTF-8' });
    assert.deepEqual(ENV_NUCLEO_COMUM, { LC_ALL: 'C.UTF-8', TZ: 'UTC' });
    assert.equal(env.LC_ALL, 'C.UTF-8', 'o núcleo SOBRESCREVE o herdado');
    assert.equal(env.TZ, 'UTC');
    assert.equal(env.FIXADO, '1');
  });

  it('a denylist residual vence até o fixed (strip é o último passo)', () => {
    const policy: EnvScrubPolicy = { allow: [], fixed: { VENENO: 'do-fixed' }, strip: ['VENENO'], scope: [] };
    const env = applyEnvScrub(policy, { VENENO: 'do-pai' });
    assert.equal(env.VENENO, undefined);
  });

  it('variáveis da allowlist com valor undefined NÃO entram', () => {
    const env = applyEnvScrub(POLICY, { PATH: undefined });
    assert.ok(!('PATH' in env));
  });

  it('é PURA: não muta o base', () => {
    const base: ChildEnv = { PATH: '/bin', VENENO: 'v' };
    const copia = { ...base };
    applyEnvScrub(POLICY, base);
    assert.deepEqual(base, copia);
  });

  it('ENV_ALLOWLIST_COMUM é a lista literal do spawn mínimo', () => {
    assert.deepEqual(
      [...ENV_ALLOWLIST_COMUM],
      ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'COMSPEC', 'PATHEXT'],
    );
  });
});

describe('registry — (5b) applyLegacyEnvScrub: denylist sobre cópia do pai (comportamento vigente)', () => {
  it('copia o AMBIENTE INTEIRO do pai e apaga só o veneno — segredo herdado CONTINUA (limite declarado)', () => {
    const base: ChildEnv = {
      PATH: '/usr/bin',
      AWS_SECRET_ACCESS_KEY: 'continua-aqui',
      VENENO: 'apagado',
    };
    const env = applyLegacyEnvScrub(POLICY, base);
    assert.equal(env.PATH, '/usr/bin');
    assert.equal(env.AWS_SECRET_ACCESS_KEY, 'continua-aqui', 'legacy é denylist — não é a allowlist');
    assert.equal(env.VENENO, undefined);
  });

  it('NÃO injeta o núcleo comum (é o comportamento vigente, que não o tem)', () => {
    const env = applyLegacyEnvScrub(POLICY, { LC_ALL: 'pt_BR.UTF-8' });
    assert.equal(env.LC_ALL, 'pt_BR.UTF-8');
    assert.equal(env.TZ, undefined);
  });

  it('aqui o FIXED vence a denylist (a ordem é strip-antes-fixed — contraste com applyEnvScrub)', () => {
    const policy: EnvScrubPolicy = { allow: [], fixed: { VENENO: 'do-fixed' }, strip: ['VENENO'], scope: [] };
    const env = applyLegacyEnvScrub(policy, { VENENO: 'do-pai' });
    assert.equal(env.VENENO, 'do-fixed');
  });

  it('é PURA: não muta o base', () => {
    const base: ChildEnv = { PATH: '/bin', VENENO: 'v' };
    const copia = { ...base };
    applyLegacyEnvScrub(POLICY, base);
    assert.deepEqual(base, copia);
  });
});

describe('registry — (6) shape observável dos adaptadores registrados', () => {
  it('todo adaptador registrado tem os membros mínimos do LanguageAdapter', () => {
    for (const a of listAdapters()) {
      assert.equal(typeof a.label, 'string');
      assert.ok(a.label.length > 0);
      assert.ok(a.challengeLanguages.length > 0);
      assert.ok(a.theoryFenceTags.length > 0);
      assert.equal(typeof a.defaultRuntime, 'string');
      assert.ok(a.filePathPattern instanceof RegExp);
      assert.ok(a.testCommand.length > 0);
      assert.equal(a.failureExitCodes.successRequiresCountMatch, true);
      assert.equal(typeof a.parse, 'function');
      assert.equal(typeof a.constructKey, 'function');
      assert.equal(typeof a.inventory, 'function');
      assert.equal(typeof a.globals, 'function');
      assert.equal(typeof a.builtins, 'function');
      assert.equal(typeof a.resolveScopes, 'function');
      assert.equal(typeof a.layout, 'function');
      assert.equal(typeof a.countDeclared, 'function');
      assert.equal(typeof a.countRun, 'function');
      assert.equal(typeof a.parseChecks, 'function');
      assert.equal(typeof a.detect, 'function');
    }
  });

  it('a INVARIANTE da dupla-igualdade vale em toda linguagem (successRequiresCountMatch é true literal)', () => {
    for (const a of listAdapters()) {
      assert.equal(a.failureExitCodes.successRequiresCountMatch, true);
    }
  });
});
