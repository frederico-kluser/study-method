/**
 * tests/challengeRegenerator.test.ts — ONDA 2 (autoria): contexto pedagógico
 * no prompt de regeneração + loop de validação SEMÂNTICA do regenerador.
 *
 * A onda 1 entregou o validador de contexto (challengeContextValidator) e o
 * entryCriteria da trilha. Esta onda liga os dois ao regenerador de desafios:
 *   1. buildRegenerationPrompt ganha critérios de entrada + conteúdo das aulas
 *      anteriores + regra "nunca cobrar algo não ensinado" + thinking máximo +
 *      caso de erro CONDICIONADO ao contexto (heuristic contextTeachesErrorHandling).
 *   2. regenerateChallenge, com `input.context`, valida o draft aprovado na
 *      EXECUÇÃO também pela SEMÂNTICA (verifyChallengeAgainstContext):
 *      reprovado → retry com FEEDBACK semântico (máx MAX_SEMANTIC_ATTEMPTS);
 *      aprovado → entrega; validador indisponível (UNAVAILABLE/INVALID_JSON) →
 *      entrega por execução (reforço não trava); sem contexto → entrega por
 *      execução (caminho defensivo do handler).
 *
 * PURE/DI: llm fake (sem rede); a execução usa node REAL (verifica o par).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { TRACK_SCHEMA_VERSION, type TrackLessonSource } from '../electron/main/content/trackTypes';
import {
  MAX_SEMANTIC_ATTEMPTS,
  REGEN_ERROR_CODES,
  buildRegenerationPrompt,
  contextTeachesErrorHandling,
  regenerateChallenge,
} from '../electron/main/services/challengeRegenerator';
import { NO_ENTRY_CRITERIA_LABEL, type ChallengeContext } from '../electron/main/services/challengeContextValidator';

// ---------------------------------------------------------------------------
// Fixtures (PURAS — sem IO)
// ---------------------------------------------------------------------------

function lesson(over: Partial<TrackLessonSource> = {}): TrackLessonSource {
  return {
    schemaVersion: TRACK_SCHEMA_VERSION,
    slug: 'aula-1',
    title: 'Aula 1',
    summary: 'Resumo.',
    difficulty: 1,
    concepts: ['variaveis'],
    prerequisites: [],
    theory: [
      { id: 's1', title: 'Seção 1', markdown: 'Texto da seção 1.' },
      { id: 's2', title: 'Seção 2', markdown: 'Texto da seção 2.' },
    ],
    sources: [],
    challenges: [],
    ...over,
  };
}

/** Contexto pedagógico padrão (2 testes no testsCode dos drafts abaixo). */
const CONTEXT: ChallengeContext = {
  trackTitle: 'Trilha Teste',
  entryCriteria: ['Aritmética básica'],
  previousLessons: [
    { slug: 'o-que-e-programacao', title: 'O que é programação', concepts: ['programacao'], theoryExcerpt: 'typeof 42 é "number".' },
  ],
  currentLesson: { slug: 'aula-1', title: 'Aula 1', concepts: ['variaveis'], theory: 'Uma variável guarda um valor.' },
};

/** Draft A: validado por EXECUÇÃO real (solução passa, starter falha). */
const DRAFT_A = {
  title: 'Dobro do número',
  concept: 'variaveis',
  difficulty: 2,
  statement: 'Escreva uma função que devolve o dobro.',
  starterCode: 'export function dobro(x) { throw new Error("não implementado"); }\n',
  testsCode: `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dobro } from './solution.mjs';
test('dobro 1', () => { assert.equal(dobro(1), 2); });
test('dobro 0', () => { assert.equal(dobro(0), 0); });
`,
  solutionCode: 'export function dobro(x) { return x * 2; }\n',
  expectedTestCount: 2,
};

/** Draft B: OUTRO desafio (também validado por execução). */
const DRAFT_B = {
  ...DRAFT_A,
  title: 'Triplo do número',
  statement: 'Escreva uma função que devolve o triplo.',
  starterCode: 'export function triplo(x) { throw new Error("não implementado"); }\n',
  testsCode: `import { test } from 'node:test';
import assert from 'node:assert/strict';
import { triplo } from './solution.mjs';
test('triplo 1', () => { assert.equal(triplo(1), 3); });
test('triplo 0', () => { assert.equal(triplo(0), 0); });
`,
  solutionCode: 'export function triplo(x) { return x * 3; }\n',
};

/** Veredito semântico da llm fake (um item por test() — nomes livres). */
function verdictJson(aprovado: boolean, motivo1: string, motivo2: string): string {
  return JSON.stringify({
    aprovado,
    testes: [
      { nome: 'dobro 1', aprovado: aprovado, motivo: motivo1 },
      { nome: 'dobro 0', aprovado: aprovado, motivo: motivo2 },
    ],
  });
}

// ---------------------------------------------------------------------------
// buildRegenerationPrompt — contexto pedagógico (Q1)
// ---------------------------------------------------------------------------

describe('buildRegenerationPrompt — ONDA 2 (autoria)', () => {
  it('inclui critérios de entrada + aulas anteriores + regra de não-cobrar-não-ensinado + thinking máximo', () => {
    const prompt = buildRegenerationPrompt({
      trackTitle: 'Node.js do Zero',
      lesson: lesson(),
      failed: [],
      entryCriteria: ['Aritmética básica', 'Ler enunciados'],
      previousLessons: [{ title: 'O que é programação', concepts: ['programacao'], theoryExcerpt: 'typeof 42 é "number".' }],
    });
    // Thinking máximo explícito (mesmo idioma do validador da onda 1).
    assert.match(prompt, /PENSE PROFUNDAMENTE, PASSO A PASSO/);
    // Critérios de entrada da trilha.
    assert.match(prompt, /CRITÉRIOS DE ENTRADA DA TRILHA/);
    assert.match(prompt, /- Aritmética básica/);
    assert.match(prompt, /- Ler enunciados/);
    // Conteúdo das aulas anteriores — o aluno JÁ conhece.
    assert.match(prompt, /CONTEÚDO DAS AULAS ANTERIORES \(o aluno JÁ conhece — o desafio SÓ pode usar isto \+ o conteúdo da aula atual\)/);
    assert.match(prompt, /O que é programação/);
    assert.match(prompt, /typeof 42 é "number"\./);
    // Regra de não cobrar o não-ensinado (ex.: validação de tipos, assert.throws).
    assert.match(prompt, /NUNCA cobrar algo não ensinado/);
    assert.match(prompt, /assert\.throws/);
    assert.match(prompt, /NÃO crie teste que o exija/);
  });

  it('sem critérios nem aulas anteriores → marcas de trilha de senso iniciante', () => {
    const prompt = buildRegenerationPrompt({ trackTitle: 'T', lesson: lesson(), failed: [] });
    assert.ok(prompt.includes(NO_ENTRY_CRITERIA_LABEL), 'marca de critério ausente aparece');
    assert.match(prompt, /\(nenhuma — esta é a primeira aula da trilha\)/);
  });

  it('caso de erro SÓ quando o contexto ensina validação/erros; senão só normal + limite', () => {
    // Contexto SEM validação/erros → FORMATO pede só caso normal e caso limite.
    const semErro = buildRegenerationPrompt({
      trackTitle: 'T',
      lesson: lesson(),
      failed: [],
      previousLessons: [{ title: 'P', concepts: ['x'], theoryExcerpt: 'Só números e variáveis.' }],
    });
    assert.ok(semErro.includes('caso normal e caso limite'), 'pede caso normal + limite');
    assert.ok(semErro.includes('NÃO crie caso de erro'), 'explicita a proibição');
    // A frase completa do FORMATO "cobrindo ... caso de erro" NÃO pode aparecer
    // (o aviso 'NÃO crie caso de erro' contém o substring 'caso de erro').
    assert.ok(!semErro.includes('cobrindo caso normal, caso limite e caso de erro'), 'o "caso de erro" do FORMATO some');

    // Contexto COM validação (typeof/throw na aula anterior) → FORMATO mantém.
    const comErro = buildRegenerationPrompt({
      trackTitle: 'T',
      lesson: lesson(),
      failed: [],
      previousLessons: [{ title: 'P', concepts: ['x'], theoryExcerpt: 'Conferimos com typeof e lançamos um erro com throw.' }],
    });
    assert.match(comErro, /caso normal, caso limite e caso de erro/);
  });

  it('contextTeachesErrorHandling: heurística por marcadores (exportada)', () => {
    assert.equal(
      contextTeachesErrorHandling({ lesson: lesson(), previousLessons: [{ title: 'P', concepts: [], theoryExcerpt: 'Só números.' }] }),
      false,
    );
    assert.equal(
      contextTeachesErrorHandling({ lesson: lesson(), previousLessons: [{ title: 'P', concepts: [], theoryExcerpt: 'typeof e throw.' }] }),
      true,
    );
    assert.equal(
      contextTeachesErrorHandling({ lesson: lesson({ theory: [{ id: 's', title: 'S', markdown: 'try/catch' }] }) }),
      true,
    );
    assert.equal(contextTeachesErrorHandling({ lesson: lesson(), entryCriteria: ['Validação de entrada'] }), true);
  });
});

// ---------------------------------------------------------------------------
// regenerateChallenge — loop SEMÂNTICO (Q2)
// ---------------------------------------------------------------------------

describe('regenerateChallenge — validação semântica (ONDA 2)', () => {
  it('veredito semântico APROVADO na 1ª → entrega (1 geração + 1 validação)', async () => {
    let calls = 0;
    const outcome = await regenerateChallenge({
      trackTitle: 'T',
      lesson: lesson(),
      failed: [],
      context: CONTEXT,
      llm: async () => {
        calls += 1;
        return calls === 1 ? { content: JSON.stringify(DRAFT_A) } : { content: verdictJson(true, 'ok', 'ok') };
      },
    });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.challenge?.title, DRAFT_A.title);
    assert.equal(calls, 2, 'geração + veredito semântico');
  });

  it('veredito semântico REPROVADO → retry com FEEDBACK semântico → aprovado na 2ª → entrega', async () => {
    const prompts: string[] = [];
    let calls = 0;
    const outcome = await regenerateChallenge({
      trackTitle: 'T',
      lesson: lesson(),
      failed: [],
      context: CONTEXT,
      llm: async (req) => {
        prompts.push(req.messages[1].content);
        calls += 1;
        if (calls === 1) return { content: JSON.stringify(DRAFT_A) };
        if (calls === 2) return { content: verdictJson(false, 'cobra typeof sem aula que ensine', 'soma ok') };
        if (calls === 3) return { content: JSON.stringify(DRAFT_B) };
        return { content: verdictJson(true, 'ok', 'ok') };
      },
    });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.challenge?.title, DRAFT_B.title, 'entrega o 2º draft');
    assert.equal(calls, 4, '2 gerações + 2 vereditos semânticos');
    // O FEEDBACK semântico (motivo do teste reprovado) chega à 2ª geração.
    assert.ok(prompts[2].includes('cobra typeof sem aula que ensine'), 'motivo semântico entra no retry');
  });

  it('veredito semântico REPROVADO nas DUAS tentativas → erro estruturado (nunca entrega não-ensinado)', async () => {
    let calls = 0;
    const outcome = await regenerateChallenge({
      trackTitle: 'T',
      lesson: lesson(),
      failed: [],
      context: CONTEXT,
      llm: async () => {
        calls += 1;
        return calls % 2 === 1 ? { content: JSON.stringify(DRAFT_A) } : { content: verdictJson(false, 'não ensinado', 'também não ensinado') };
      },
    });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.error?.code, REGEN_ERROR_CODES.INVALID_CODE);
    assert.match(outcome.error?.message ?? '', /não ensinado/);
    assert.equal(calls, 4, `${MAX_SEMANTIC_ATTEMPTS} vereditos semânticos (um por draft aprovado na execução)`);
  });

  it('validador semântico INDISPONÍVEL (UNAVAILABLE) → entrega por EXECUÇÃO (reforço não trava)', async () => {
    let calls = 0;
    const outcome = await regenerateChallenge({
      trackTitle: 'T',
      lesson: lesson(),
      failed: [],
      context: CONTEXT,
      llm: async () => {
        calls += 1;
        if (calls === 1) return { content: JSON.stringify(DRAFT_A) };
        throw new Error('rede fora do ar');
      },
    });
    assert.equal(outcome.ok, true, 'indisponibilidade do validador não bloqueia a entrega');
    assert.equal(outcome.challenge?.slug, 'dobro-do-numero');
    assert.equal(calls, 2, '1 geração + 1 tentativa de validação (que falhou)');
  });

  it('validador semântico com JSON inválido (INVALID_JSON) → entrega por EXECUÇÃO', async () => {
    let calls = 0;
    const outcome = await regenerateChallenge({
      trackTitle: 'T',
      lesson: lesson(),
      failed: [],
      context: CONTEXT,
      llm: async () => {
        calls += 1;
        return calls === 1 ? { content: JSON.stringify(DRAFT_A) } : { content: 'não é um veredito' };
      },
    });
    assert.equal(outcome.ok, true);
    assert.equal(calls, 3, '1 geração + 2 tentativas internas do validador (retry de JSON inválido)');
  });

  it('SEM contexto → entrega por execução sem NENHUMA chamada semântica (caminho defensivo)', async () => {
    let calls = 0;
    const outcome = await regenerateChallenge({
      trackTitle: 'T',
      lesson: lesson(),
      failed: [],
      llm: async () => {
        calls += 1;
        return { content: JSON.stringify(DRAFT_A) };
      },
    });
    assert.equal(outcome.ok, true);
    assert.equal(calls, 1, 'só a geração — sem validação semântica');
  });

  it('REGRESSÃO: código inválido na execução continua com retry e erro estruturado', async () => {
    const bad = { ...DRAFT_A, solutionCode: 'export function dobro(x) { return x; }\n' }; // falha nos testes
    const outcome = await regenerateChallenge({
      trackTitle: 'T',
      lesson: lesson(),
      failed: [],
      context: CONTEXT,
      llm: async () => ({ content: JSON.stringify(bad) }),
    });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.error?.code, REGEN_ERROR_CODES.INVALID_CODE);
  });
});
