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
 *      aprovado → entrega.
 *
 * FAIL-CLOSED (docs/16-engine-de-trilha.md §9.3) — o que esta rodada inverteu.
 * Dois testes daqui PINAVAM o defeito: validador INDISPONÍVEL e veredito
 * ILEGÍVEL entregavam o desafio "por execução", com a asserção dizendo em voz
 * alta que "a indisponibilidade do validador não bloqueia a entrega". §9.3 diz
 * o contrário — "indisponibilidade produz erro estruturado, nunca veredito
 * falso nem aprovação por omissão" — e agora eles provam o OPOSTO. O terceiro
 * caminho (SEM contexto) continua entregando por execução, mas como OPT-OUT
 * declarado de quem não pediu o gate: quem exige (`requireSemanticGate: true`,
 * o que o handler IPC manda) recebe erro estruturado sem gastar 1 chamada de
 * LLM.
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
  it('inclui critérios de entrada + aulas anteriores + regra de não-cobrar-não-ensinado, SEM imperativo de raciocínio', () => {
    const prompt = buildRegenerationPrompt({
      trackTitle: 'Node.js do Zero',
      lesson: lesson(),
      failed: [],
      entryCriteria: ['Aritmética básica', 'Ler enunciados'],
      previousLessons: [{ title: 'O que é programação', concepts: ['programacao'], theoryExcerpt: 'typeof 42 é "number".' }],
    });
    // ANOTAÇÃO #8 do EXPLAINER: o imperativo "pense profundamente, passo a
    // passo" é anti-padrão banido por docs/16-engine-de-trilha.md §7 em modelo com
    // raciocínio nativo — a profundidade é PARÂMETRO do protocolo
    // (`reasoning: { enabled: true, effort: 'max' }`, default do cliente vindo
    // de shared/llm/constants.ts), nunca texto de prompt.
    assert.doesNotMatch(prompt, /PENSE\s+PROFUNDAMENTE/i);
    assert.doesNotMatch(prompt, /passo a passo/i);
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

  it('validador semântico INDISPONÍVEL (UNAVAILABLE) → FAIL-CLOSED: nada é entregue (§9.3)', async () => {
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
    // O draft PASSOU nas provas de execução (§5.4) — e mesmo assim não sai:
    // sem veredito semântico, entregar seria aprovação por omissão.
    assert.equal(outcome.ok, false, 'gate fora do ar REPROVA a entrega');
    assert.equal(outcome.challenge, undefined, 'nenhum desafio chega ao aluno');
    assert.equal(outcome.error?.code, REGEN_ERROR_CODES.SEMANTIC_UNAVAILABLE);
    // A mensagem é para o ALUNO: diz o que houve, que nada foi gerado e o que
    // fazer (a UI mostra `error.message` cru).
    assert.match(outcome.error?.message ?? '', /nada foi gerado/i);
    assert.match(outcome.error?.message ?? '', /chave da API e os créditos/i);
    assert.equal(calls, 2, '1 geração + 1 tentativa de validação (que falhou) — sem retry inútil');
  });

  it('validador semântico com JSON inválido (INVALID_JSON) → FAIL-CLOSED: nada é entregue (§9.3)', async () => {
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
    assert.equal(outcome.ok, false, 'veredito ilegível REPROVA a entrega');
    assert.equal(outcome.challenge, undefined, 'nenhum desafio chega ao aluno');
    assert.equal(outcome.error?.code, REGEN_ERROR_CODES.SEMANTIC_INVALID_VERDICT);
    assert.match(outcome.error?.message ?? '', /nada foi gerado/i);
    assert.match(outcome.error?.message ?? '', /tente de novo/i);
    assert.equal(calls, 3, '1 geração + 2 tentativas internas do validador (retry de JSON inválido)');
  });

  // O TERCEIRO caminho, decidido nesta rodada. Sem contexto não existe o que
  // julgar: o gate não pode "rodar e aprovar", só deixar de rodar. Em vez de
  // proibir a ausência dentro do serviço (o que quebraria os testes do laço de
  // execução em tests/trackServices.test.ts, que chamam sem contexto de
  // propósito), a ausência virou OPT-OUT DECLARADO — e a exigência virou
  // PARÂMETRO. O caminho do ALUNO manda `requireSemanticGate: true`
  // (ipc/track-handlers.ts), e lá o contexto sempre existe: a montagem que
  // falha agora devolve erro estruturado em vez de seguir sem contexto.
  it('SEM contexto e SEM exigir o gate → entrega por execução (opt-out declarado, fora do fluxo do aluno)', async () => {
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

  it('gate EXIGIDO sem contexto → FAIL-CLOSED antes da 1ª chamada de LLM (§9.3)', async () => {
    let calls = 0;
    const outcome = await regenerateChallenge({
      trackTitle: 'T',
      lesson: lesson(),
      failed: [],
      requireSemanticGate: true,
      llm: async () => {
        calls += 1;
        return { content: JSON.stringify(DRAFT_A) };
      },
    });
    assert.equal(outcome.ok, false, 'sem contexto, quem EXIGE o gate não recebe desafio');
    assert.equal(outcome.challenge, undefined);
    assert.equal(outcome.error?.code, REGEN_ERROR_CODES.SEMANTIC_NOT_RUN);
    assert.match(outcome.error?.message ?? '', /histórico das suas aulas/i);
    assert.match(outcome.error?.message ?? '', /nada foi gerado/i);
    assert.equal(calls, 0, 'zero chamada de LLM — não se queima crédito para recusar no fim');
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
