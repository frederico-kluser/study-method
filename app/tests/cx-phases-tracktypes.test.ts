/**
 * tests/cx-phases-tracktypes.test.ts — CARACTERIZAÇÃO (golden master) de
 * `content/trackTypes.ts` (os tipos/validadores do produto em disco).
 *
 * PINA: as constantes de layout e regras do produto (estrela, quiz ≤3, cadeia
 * de cursos), a resolução dos campos multilíngua com DEFAULT explícito
 * (programmingLanguage/runtime/harnessLanguage) e o contrato dos validadores —
 * `TrackValidationIssue[]` determinístico, NUNCA exceção — para desafio
 * (single/multi-arquivo), teoria, assertions (bijeção/âncoras/racionais),
 * aula, módulo, trilha e cadeia de cursos.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CHALLENGE_FILE,
  DEFAULT_MIN_FIRST_STAR_MS,
  DEFAULT_TRACK_CHALLENGE_LANGUAGE,
  LESSON_FILE,
  MAX_ASSERTIONS_PER_LESSON,
  MODULE_FILE,
  PROFICIENCY_FILE,
  PROFICIENCY_MIN_FIRST_STAR_MS,
  SAFE_FILE_PATH_RE,
  SLUG_RE,
  TRACK_CHAIN_IDS,
  TRACK_CHAIN_MAX_LEVEL,
  TRACK_FILE,
  TRACK_SCHEMA_VERSION,
  trackHarnessLanguage,
  trackProgrammingLanguage,
  trackRuntime,
  validateAssertions,
  validateChallengeSource,
  validateLessonSource,
  validateModuleSource,
  validateSlug,
  validateTheorySection,
  validateTrackChain,
  validateTrackSource,
  type TrackValidationIssue,
} from '../electron/main/content/trackTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function desafio(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    slug: 'soma-simples',
    title: 'Soma simples',
    concept: 'variaveis',
    difficulty: 2,
    language: 'nodejs',
    statement: 'Implemente a função soma.',
    starterCode: 'export function soma() {}',
    solutionCode: 'export function soma(a, b) { return a + b; }',
    testsCode: "test('soma', () => {});",
    expectedTestCount: 1,
    ...over,
  };
}

function aula(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    slug: 'variaveis',
    title: 'Variáveis',
    summary: 'o que é uma variável',
    difficulty: 1,
    concepts: ['variaveis'],
    prerequisites: [],
    sources: [],
    challenges: ['soma-simples'],
    theory: [{ id: 'a-maquina', title: 'A máquina', markdown: 'let x = 1;' }],
    ...over,
  };
}

function afiracao(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'let-guarda-valor',
    statement: 'let declara variável mutável.',
    question: 'qual declara variável mutável?',
    options: ['let', 'const', 'var', 'def'],
    answerIndex: 0,
    feedback: 'let permite reatribuição.',
    ...over,
  };
}

function trilha(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    slug: 'js-do-zero',
    title: 'JS do zero',
    description: 'a primeira trilha',
    language: 'pt-BR',
    domain: 'programming',
    modules: ['m1'],
    ...over,
  };
}

function mensagens(issues: TrackValidationIssue[]): string[] {
  return issues.map((i) => i.message);
}

// ---------------------------------------------------------------------------
// 1. Constantes de produto
// ---------------------------------------------------------------------------

describe('trackTypes — constantes de layout e regras do produto', () => {
  it('nomes de arquivo e schemaVersion', () => {
    assert.equal(TRACK_FILE, 'track.json');
    assert.equal(MODULE_FILE, 'module.json');
    assert.equal(LESSON_FILE, 'lesson.json');
    assert.equal(CHALLENGE_FILE, 'challenge.json');
    assert.equal(PROFICIENCY_FILE, 'proficiency.json');
    assert.equal(TRACK_SCHEMA_VERSION, 1);
  });

  it('carência da 1ª estrela: 60s na aula, 2 min na proficiência; quiz ≤ 3 por aula', () => {
    assert.equal(DEFAULT_MIN_FIRST_STAR_MS, 60_000);
    assert.equal(PROFICIENCY_MIN_FIRST_STAR_MS, 120_000);
    assert.equal(MAX_ASSERTIONS_PER_LESSON, 3);
  });

  it('linguagem default do desafio é "nodejs" (o runtime do par javascript/node)', () => {
    assert.equal(DEFAULT_TRACK_CHALLENGE_LANGUAGE, 'nodejs');
  });

  it('cadeia de cursos: 3 ids FECHADOS, 4 níveis (iniciante→especialista)', () => {
    assert.deepEqual([...TRACK_CHAIN_IDS], ['python', 'rust', 'c']);
    assert.equal(TRACK_CHAIN_MAX_LEVEL, 4);
  });

  it('SAFE_FILE_PATH_RE (multi-arquivo): .mjs dentro do dir de execução, sem ..', () => {
    assert.equal(SAFE_FILE_PATH_RE.test('lib/soma.mjs'), true);
    assert.equal(SAFE_FILE_PATH_RE.test('solution.mjs'), true);
    assert.equal(SAFE_FILE_PATH_RE.test('../fuga.mjs'), false);
    assert.equal(SAFE_FILE_PATH_RE.test('arquivo.txt'), false);
  });
});

// ---------------------------------------------------------------------------
// 2. Resolução multilíngua (default num lugar só)
// ---------------------------------------------------------------------------

describe('trackTypes — resolução de programmingLanguage/harnessLanguage/runtime', () => {
  it('campos ausentes resolvem para os defaults (nunca undefined ≠ string)', () => {
    assert.equal(trackProgrammingLanguage({}), 'javascript');
    assert.equal(trackProgrammingLanguage({ programmingLanguage: 'python' }), 'python');
    assert.equal(trackHarnessLanguage({}), 'javascript');
    assert.equal(trackHarnessLanguage({ programmingLanguage: 'rust' }), 'rust');
    assert.equal(trackHarnessLanguage({ programmingLanguage: 'rust', harnessLanguage: 'c' }), 'c');
    assert.equal(trackRuntime({}), 'nodejs');
    assert.equal(trackRuntime({ runtime: 'cpython 3.12' }), 'cpython 3.12');
  });
});

// ---------------------------------------------------------------------------
// 3. Slugs e desafio
// ---------------------------------------------------------------------------

describe('trackTypes — validateSlug e validateChallengeSource', () => {
  it('slug: kebab-case ASCII; validateSlug NUNCA lança, devolve issues', () => {
    assert.deepEqual(validateSlug('minha-trilha', 'track.json'), []);
    assert.equal(SLUG_RE.test('a1-b2-c3'), true);
    const issues = validateSlug('Minha Trilha', 'track.json');
    assert.equal(issues.length, 1);
    assert.match(issues[0].message, /slug inválido: "Minha Trilha"/);
    assert.equal(issues[0].file, 'track.json');
    assert.notEqual(validateSlug(undefined, 'x').length, 0);
    assert.notEqual(validateSlug('a_b', 'x').length, 0, 'underscore não é kebab-case');
  });

  it('desafio single-file válido passa com ZERO issues', () => {
    assert.deepEqual(validateChallengeSource(desafio(), 'challenge.json'), []);
  });

  it('desafio: cada campo quebrado gera issue nomeada (fail-closed, nunca exceção)', () => {
    const mensagensRuin = mensagens(
      validateChallengeSource(
        desafio({
          schemaVersion: 2,
          slug: 'Ruim',
          title: ' ',
          concept: 'Variaveis',
          difficulty: 9,
          language: 'cobol',
          statement: '',
          starterCode: undefined,
          solutionCode: '   ',
          testsCode: '',
          expectedTestCount: 0,
        }),
        'challenge.json',
      ),
    );
    for (const esperado of [
      /schemaVersion inválido: 2/,
      /slug inválido/,
      /title vazio/,
      /concept inválido/,
      /difficulty inválido: 9 \(esperado número 1\.\.5\)/,
      /language inválido: "cobol"/,
      /statement vazio/,
      /starterCode ausente/,
      /solutionCode vazio/,
      /testsCode vazio/,
      /expectedTestCount inválido: 0 \(esperado número 1\.\.100\)/,
    ]) {
      assert.ok(mensagensRuin.some((m) => esperado.test(m)), `esperava issue ${esperado}`);
    }
    assert.notEqual(validateChallengeSource(null, 'c.json').length, 0, 'raiz não-objeto é issue');
  });

  it('language pertence ao REGISTRO (nodejs/python/ts/c/rust…); minFirstStarMs tem faixa própria', () => {
    for (const linguagem of ['nodejs', 'javascript', 'python', 'typescript', 'c', 'rust', 'ts']) {
      assert.deepEqual(validateChallengeSource(desafio({ language: linguagem }), 'c.json'), [], linguagem);
    }
    const comEstrela = validateChallengeSource(desafio({ minFirstStarMs: 500 }), 'c.json');
    assert.deepEqual(comEstrela, []);
    assert.match(mensagens(validateChallengeSource(desafio({ minFirstStarMs: 0 }), 'c.json'))[0], /minFirstStarMs inválido/);
  });

  it('multi-arquivo (files): path seguro + starter + solução; paths ÚNICOS; substitui os de topo', () => {
    const multi = desafio({
      starterCode: undefined,
      solutionCode: undefined,
      files: [
        { path: 'lib/soma.mjs', starterCode: 'export const a = 1;', solutionCode: 'export const a = 2;' },
        { path: 'lib/soma.mjs', starterCode: 'x', solutionCode: 'y' },
        { path: '../fuga.mjs', starterCode: 'x', solutionCode: 'y' },
        { path: 'lib/sem-solucao.mjs', starterCode: 'x' },
      ],
    });
    const ms = mensagens(validateChallengeSource(multi, 'challenge.json'));
    assert.ok(ms.some((m) => /files\[1\]\.path duplicado/.test(m)));
    assert.ok(ms.some((m) => /files\[2\]\.path inválido/.test(m)));
    assert.ok(ms.some((m) => /files\[3\]\.solutionCode vazio/.test(m)));
    assert.ok(!ms.some((m) => !m.includes('files[') && /starterCode ausente|solutionCode vazio/.test(m)), 'com files, o de topo não é exigido');

    assert.match(mensagens(validateChallengeSource(desafio({ files: [] }), 'c.json'))[0], /files presente mas vazio/);
  });
});

// ---------------------------------------------------------------------------
// 4. Teoria e assertions
// ---------------------------------------------------------------------------

describe('trackTypes — validateTheorySection e validateAssertions', () => {
  it('seção de teoria: id kebab, title, markdown; code malformado é issue nomeada', () => {
    assert.deepEqual(validateTheorySection({ id: 'a-maquina', title: 'A máquina', markdown: 'texto' }, 'l.json'), []);
    const ms = mensagens(validateTheorySection({ id: 'Ruim', title: '', markdown: '' }, 'l.json'));
    assert.ok(ms.some((m) => /id de seção inválido/.test(m)));
    assert.ok(ms.some((m) => /seção sem title/.test(m)));
    assert.ok(ms.some((m) => /sem markdown/.test(m)));
    assert.match(
      mensagens(validateTheorySection({ id: 'ok', title: 't', markdown: 'm', code: { language: 'js' } }, 'l.json'))[0],
      /code malformado \(language e code obrigatórios\)/,
    );
  });

  it('assertions: máx. 3, ids kebab-únicos, 4 opções ÚNICAS, answerIndex na faixa real', () => {
    assert.deepEqual(validateAssertions([afiracao()], 'l.json'), []);
    assert.match(mensagens(validateAssertions('não-array', 'l.json'))[0], /assertions inválido/);
    assert.match(
      mensagens(validateAssertions([afiracao(), afiracao({ id: 'b' }), afiracao({ id: 'c' }), afiracao({ id: 'd' })], 'l.json'))[0],
      /máximo 3 por aula/,
    );
    assert.ok(mensagens(validateAssertions([afiracao({ id: 'A' }), afiracao({ id: 'a', statement: 'x y z' })], 'l.json')).some((m) => /id inválido|id duplicado/.test(m) || /duplicado/.test(m)));
    const ms = mensagens(
      validateAssertions([afiracao({ options: ['a', 'a', 'b', ''] , answerIndex: 9 })], 'l.json'),
    );
    assert.ok(ms.some((m) => /options\[1\] duplicada/.test(m)));
    assert.ok(ms.some((m) => /options\[3\] vazio/.test(m)));
    assert.ok(ms.some((m) => /answerIndex inválido: 9/.test(m)));
    assert.ok(ms.some((m) => /options inválido \(esperado array com EXATAMENTE 4 opções\)/.test(mensagens(validateAssertions([afiracao({ options: ['a', 'b'] })], 'l.json')).join('\n'))));
    assert.ok(mensagens(validateAssertions([afiracao({ feedback: '' })], 'l.json')).some((m) => /feedback vazio/.test(m)));
  });

  it('sectionId: ausente é aceito; presente é kebab E (com theoryIds) deve existir na teoria', () => {
    assert.deepEqual(validateAssertions([afiracao()], 'l.json', ['a-maquina']), []);
    assert.deepEqual(validateAssertions([afiracao({ sectionId: 'a-maquina' })], 'l.json', ['a-maquina']), []);
    assert.ok(
      mensagens(validateAssertions([afiracao({ sectionId: 'a-maquina' })], 'l.json', ['outra-secao'])).some((m) =>
        /sectionId desconhecido: "a-maquina"/.test(m),
      ),
    );
    assert.ok(mensagens(validateAssertions([afiracao({ sectionId: 'Ruim' })], 'l.json')).some((m) => /sectionId inválido/.test(m)));
  });

  it('optionRationales: ausente/[] ok; não-vazio tem de ter um por opção, todos não vazios', () => {
    assert.deepEqual(validateAssertions([afiracao({ optionRationales: [] })], 'l.json'), []);
    assert.deepEqual(validateAssertions([afiracao({ optionRationales: ['a', 'b', 'c', 'd'] })], 'l.json'), []);
    const ms = mensagens(validateAssertions([afiracao({ optionRationales: ['a', 'b'] })], 'l.json'));
    assert.ok(ms.some((m) => /optionRationales com 2 itens \(esperado 4/.test(m)));
    assert.ok(mensagens(validateAssertions([afiracao({ optionRationales: ['a', '', 'c', 'd'] })], 'l.json')).some((m) => /optionRationales\[1\] vazio/.test(m)));
  });
});

// ---------------------------------------------------------------------------
// 5. Aula, módulo, trilha e cadeia
// ---------------------------------------------------------------------------

describe('trackTypes — validateLessonSource/validateModuleSource/validateTrackSource', () => {
  it('aula válida passa; theory OBRIGATÓRIA e não-vazia; assertions ausentes são válidas', () => {
    assert.deepEqual(validateLessonSource(aula(), 'lesson.json'), []);
    assert.ok(mensagens(validateLessonSource(aula({ theory: [] }), 'lesson.json')).some((m) => /theory ausente\/vazia/.test(m)));
    assert.ok(
      mensagens(validateLessonSource(aula({ sources: [{ url: 'https://x.com' }] }), 'lesson.json')).some((m) =>
        /sources\[0\] malformada/.test(m),
      ),
    );
    assert.ok(mensagens(validateLessonSource(aula({ challenges: undefined }), 'lesson.json')).some((m) => /challenges ausente/.test(m)));
  });

  it('aula com assertions: o sectionId precisa ancorar nas seções de teoria DA AULA', () => {
    const comAncoraErrada = aula({ assertions: [afiracao({ sectionId: 'secao-inexistente' })] });
    assert.ok(mensagens(validateLessonSource(comAncoraErrada, 'lesson.json')).some((m) => /sectionId desconhecido: "secao-inexistente"/.test(m)));
    const comAncoraCerta = aula({ assertions: [afiracao({ sectionId: 'a-maquina' })] });
    assert.deepEqual(validateLessonSource(comAncoraCerta, 'lesson.json'), []);
  });

  it('módulo: order 1..999, lessons não-vazio, challenge declarado precisa ser slug', () => {
    assert.deepEqual(validateModuleSource({ schemaVersion: 1, slug: 'm1', title: 'Módulo', order: 1, lessons: ['l1'] }, 'module.json'), []);
    const ms = mensagens(validateModuleSource({ schemaVersion: 1, slug: 'm1', title: 'M', order: 0, lessons: [], challenge: 'Ruim' }, 'module.json'));
    assert.ok(ms.some((m) => /order inválido: 0 \(esperado número 1\.\.999\)/.test(m)));
    assert.ok(ms.some((m) => /lessons ausente\/vazio/.test(m)));
    assert.ok(ms.some((m) => /slug inválido: "Ruim"/.test(m)));
  });

  it('trilha: língua da prosa pt-BR/en, domain programming/math, módulos, campos multilíngua PRESENTES são validados', () => {
    assert.deepEqual(validateTrackSource(trilha(), 'track.json'), []);
    const ms = mensagens(
      validateTrackSource(trilha({ language: 'fr', domain: 'história', modules: [], programmingLanguage: 'cobol', runtime: '  ' }), 'track.json'),
    );
    assert.ok(ms.some((m) => /language inválido: "fr"/.test(m)));
    assert.ok(ms.some((m) => /domain inválido/.test(m)));
    assert.ok(ms.some((m) => /modules ausente\/vazio/.test(m)));
    assert.ok(ms.some((m) => /programmingLanguage inválido: "cobol"/.test(m)));
    assert.ok(ms.some((m) => /runtime inválido/.test(m)));
    // ausentes = defaults; presentes válidos = ok; entryCriteria é opcional.
    assert.deepEqual(validateTrackSource(trilha({ programmingLanguage: 'python', entryCriteria: ['saber somar'] }), 'track.json'), []);
    assert.ok(mensagens(validateTrackSource(trilha({ entryCriteria: [''] }), 'track.json')).some((m) => /entryCriteria\[0\] vazio/.test(m)));
    assert.ok(mensagens(validateTrackSource(trilha({ entryCriteria: 'x' }), 'track.json')).some((m) => /entryCriteria inválido/));
  });
});

describe('trackTypes — validateTrackChain (a cadeia de cursos)', () => {
  it('os três campos ausentes = trilha FORA de cadeia, ZERO issue (aditividade)', () => {
    assert.deepEqual(validateTrackChain({ slug: 'js-do-zero' }, 'track.json'), []);
  });

  it('meia declaração é issue: os três campos vêm juntos ou nenhum vem', () => {
    const ms = mensagens(validateTrackChain({ slug: 'x', cadeia: 'python' }, 'track.json'));
    assert.equal(ms.length >= 1, true);
    assert.match(ms[0], /cadeia incompleta: declarou 'cadeia' e faltam 'nivel', 'cursoAnterior'/);
  });

  it('cadeia ∈ {python,rust,c}; nivel inteiro 1..4; cursoAnterior slug ou null (e não a própria trilha)', () => {
    assert.deepEqual(
      validateTrackChain({ slug: 'py-2', cadeia: 'python', nivel: 2, cursoAnterior: 'py-1' }, 'track.json'),
      [],
    );
    const entradaRuim = { slug: 'py-2', cadeia: 'java', nivel: 9, cursoAnterior: 'Ruim' };
    const ms = mensagens(
      validateTrackChain(entradaRuim as unknown as Parameters<typeof validateTrackChain>[0], 'track.json'),
    );
    assert.ok(ms.some((m) => /cadeia inválida: "java"/.test(m)));
    assert.ok(ms.some((m) => /nivel inválido: 9/.test(m)));
    assert.ok(ms.some((m) => /cursoAnterior inválido: "Ruim"/.test(m)));
    assert.ok(
      mensagens(validateTrackChain({ slug: 'py-1', cadeia: 'python', nivel: 1, cursoAnterior: 'py-1' }, 'track.json')).some((m) =>
        /ciclo de tamanho 1/.test(m),
      ),
    );
  });

  it('coerência nivel × cursoAnterior revela BURACO sem sair do arquivo', () => {
    assert.ok(
      mensagens(validateTrackChain({ slug: 'py-1', cadeia: 'python', nivel: 1, cursoAnterior: 'py-0' }, 'track.json')).some((m) =>
        /o primeiro curso da cadeia não tem predecessor/.test(m),
      ),
    );
    assert.ok(
      mensagens(validateTrackChain({ slug: 'py-3', cadeia: 'python', nivel: 3, cursoAnterior: null }, 'track.json')).some((m) =>
        /buraco: declare o predecessor direto/.test(m),
      ),
    );
    // nível 1 com cursoAnterior null é o começo LEGÍTIMO da cadeia.
    assert.deepEqual(validateTrackChain({ slug: 'py-1', cadeia: 'python', nivel: 1, cursoAnterior: null }, 'track.json'), []);
  });
});
