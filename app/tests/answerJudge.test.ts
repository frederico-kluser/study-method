/**
 * tests/answerJudge.test.ts — cobertura do avaliador da RESPOSTA DIGITADA
 * (onda3-respostas): veredito parseado do llm (JSON), FALLBACK para o
 * embeddedLlm quando o llm falha/indisponível, e erro ESTRUTURADO com
 * `code` em falha total — nunca inventa veredito (AS-1/AS-2: feedback
 * específico; veredito só vem do LLM).
 *
 * NUNCA toca rede: clientes 100% mockados (LlmClient-like + EmbeddedLlmLike).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ANSWER_JUDGE_ERROR_CODES,
  createAnswerJudge,
  type AnswerJudgeDeps,
  type EmbeddedLlmLike,
  type JudgeAnswerInput,
} from '../electron/main/services/answerJudge';
import type { LlmClient } from '../electron/main/services/llmClient';
import { OPENROUTER_MODEL } from '@shared/llm/constants';

const INPUT: JudgeAnswerInput = {
  answerText: 'Uma closure é uma função que lembra do escopo onde nasceu.',
  context: { subject: 'Closures em JavaScript', lessonExcerpt: 'Closures capturam o léxico.' },
};

const VALID_JSON = JSON.stringify({ verdict: 'correct', feedback: 'Você descreveu a captura do escopo.' });

/** LlmClient fake configurável (resposta ou throw). */
function fakeLlmClient(behavior: { content?: string; throwError?: Error }): LlmClient & { calls: Array<{ messages: unknown[]; temperature: number }> } {
  const calls: Array<{ messages: unknown[]; temperature: number }> = [];
  return {
    calls,
    async chatCompletion(req) {
      calls.push({ messages: req.messages, temperature: req.temperature ?? 0 });
      if (behavior.throwError) throw behavior.throwError;
      return { content: behavior.content ?? VALID_JSON, model: OPENROUTER_MODEL.id };
    },
  };
}

/** EmbeddedLlm fake configurável. */
function fakeEmbedded(behavior: { text?: string; throwError?: Error; noActive?: boolean }): EmbeddedLlmLike & { calls: Array<{ modelId: string; prompt: string }> } {
  const calls: Array<{ modelId: string; prompt: string }> = [];
  return {
    calls,
    getActive: () => (behavior.noActive ? null : 'modelo-local-1'),
    async chat(opts) {
      calls.push({ modelId: opts.modelId, prompt: opts.prompt });
      if (behavior.throwError) throw behavior.throwError;
      return { text: behavior.text ?? VALID_JSON };
    },
  };
}

function makeJudge(overrides: Partial<AnswerJudgeDeps> = {}) {
  const llm = fakeLlmClient({});
  const embedded = fakeEmbedded({});
  const judge = createAnswerJudge({ llm, embedded, ...overrides });
  return { judge, llm, embedded };
}

describe('answerJudge: llm primário', () => {
  it('veredito parseado do JSON do llm → { ok: true, provider: openrouter }', async () => {
    const { judge, llm, embedded } = makeJudge();
    const out = await judge.judgeAnswer(INPUT);

    assert.deepEqual(out, {
      ok: true,
      verdict: 'correct',
      feedback: 'Você descreveu a captura do escopo.',
      provider: 'openrouter',
    });
    assert.equal(llm.calls.length, 1, 'llm chamado primeiro');
    assert.equal(embedded.calls.length, 0, 'fallback NÃO chamado quando o llm responde');
    // O prompt vai em pt-BR com o contexto e a resposta digitada.
    const user = llm.calls[0].messages[1] as { content: string };
    assert.match(user.content, /Closures em JavaScript/);
    assert.match(user.content, /RESPOSTA DIGITADA DO ALUNO/);
    assert.match(user.content, /Uma closure é uma função/);
    assert.equal(llm.calls[0].temperature, 0, 'temperatura 0 (determinístico)');
  });

  it('verdict partial e incorrect também parseiam', async () => {
    for (const verdict of ['partial', 'incorrect'] as const) {
      const llm = fakeLlmClient({
        content: JSON.stringify({ verdict, feedback: `Feedback de ${verdict}.` }),
      });
      const judge = createAnswerJudge({ llm, embedded: fakeEmbedded({}) });
      const out = await judge.judgeAnswer(INPUT);
      assert.ok(out.ok);
      if (out.ok) {
        assert.equal(out.verdict, verdict);
        assert.equal(out.provider, 'openrouter');
      }
    }
  });

  it('JSON com crases/texto ao redor é tolerado (extractFirstJsonObject)', async () => {
    const llm = fakeLlmClient({ content: '```json\n{"verdict": "partial", "feedback": "Quase — falta o estado."}\n```' });
    const judge = createAnswerJudge({ llm, embedded: fakeEmbedded({}) });
    const out = await judge.judgeAnswer(INPUT);
    assert.ok(out.ok);
    if (out.ok) assert.equal(out.verdict, 'partial');
  });
});

describe('answerJudge: fallback para o embeddedLlm', () => {
  it('llm indisponível (sem chave) → embedded julga; provider embedded', async () => {
    const llm = fakeLlmClient({ content: 'ignorado' });
    const embedded = fakeEmbedded({});
    const judge = createAnswerJudge({
      llm,
      embedded,
      getApiKey: async () => '', // sem chave ⇒ degrada ANTES da rede
    });
    const out = await judge.judgeAnswer(INPUT);
    assert.ok(out.ok);
    if (out.ok) {
      assert.equal(out.provider, 'embedded');
      assert.equal(out.verdict, 'correct');
    }
    assert.equal(llm.calls.length, 0, 'sem chave não há chamada à rede');
    assert.equal(embedded.calls.length, 1);
    // O fallback entrega o MESMO contexto no prompt único.
    assert.match(embedded.calls[0].prompt, /RESPOSTA DIGITADA DO ALUNO/);
  });

  it('llm com erro de rede → fallback embedded', async () => {
    const llm = fakeLlmClient({ throwError: new Error('ECONNRESET') });
    const embedded = fakeEmbedded({});
    const judge = createAnswerJudge({ llm, embedded });
    const out = await judge.judgeAnswer(INPUT);
    assert.ok(out.ok);
    if (out.ok) assert.equal(out.provider, 'embedded');
    assert.equal(embedded.calls.length, 1, 'fallback chamado após falha de rede');
  });

  it('llm respondeu sem JSON utilizável → fallback embedded', async () => {
    const llm = fakeLlmClient({ content: 'Desculpe, não entendi.' });
    const embedded = fakeEmbedded({ text: JSON.stringify({ verdict: 'incorrect', feedback: 'Não é isso.' }) });
    const judge = createAnswerJudge({ llm, embedded });
    const out = await judge.judgeAnswer(INPUT);
    assert.ok(out.ok);
    if (out.ok) {
      assert.equal(out.provider, 'embedded');
      assert.equal(out.verdict, 'incorrect');
    }
  });

  it('embedded sem modelo ativo → falha estruturada UNAVAILABLE', async () => {
    const llm = fakeLlmClient({ throwError: new Error('timeout') });
    const embedded = fakeEmbedded({ noActive: true });
    const judge = createAnswerJudge({ llm, embedded });
    const out = await judge.judgeAnswer(INPUT);
    assert.ok(!out.ok);
    if (!out.ok) assert.equal(out.error.code, ANSWER_JUDGE_ERROR_CODES.UNAVAILABLE);
  });
});

describe('answerJudge: falha total — erro estruturado com code, nunca veredito inventado', () => {
  it('ambos os provedores indisponíveis → { ok:false, code: UNAVAILABLE }', async () => {
    const llm = fakeLlmClient({ throwError: new Error('network') });
    const embedded = fakeEmbedded({ throwError: new Error('segfault no filho') });
    const judge = createAnswerJudge({ llm, embedded });
    const out = await judge.judgeAnswer(INPUT);
    assert.ok(!out.ok);
    if (!out.ok) {
      assert.equal(out.error.code, ANSWER_JUDGE_ERROR_CODES.UNAVAILABLE);
      assert.match(out.error.message, /indisponíveis/);
      assert.ok(!('verdict' in out), 'falha total NUNCA carrega veredito');
    }
  });

  it('ambos responderam sem JSON parseável → code UNPARSEABLE', async () => {
    const llm = fakeLlmClient({ content: 'texto sem json' });
    const embedded = fakeEmbedded({ text: 'também sem json' });
    const judge = createAnswerJudge({ llm, embedded });
    const out = await judge.judgeAnswer(INPUT);
    assert.ok(!out.ok);
    if (!out.ok) assert.equal(out.error.code, ANSWER_JUDGE_ERROR_CODES.UNPARSEABLE);
  });

  it('verdict fora do vocabulário (ex.: "maybe") → tratado como não-parseável', async () => {
    const llm = fakeLlmClient({ content: JSON.stringify({ verdict: 'maybe', feedback: 'x' }) });
    const embedded = fakeEmbedded({ text: 'nada' });
    const judge = createAnswerJudge({ llm, embedded });
    const out = await judge.judgeAnswer(INPUT);
    assert.ok(!out.ok);
    if (!out.ok) assert.equal(out.error.code, ANSWER_JUDGE_ERROR_CODES.UNPARSEABLE);
  });

  it('feedback vazio → não-parseável (feedback em pt-BR é obrigatório)', async () => {
    const llm = fakeLlmClient({ content: JSON.stringify({ verdict: 'correct', feedback: '  ' }) });
    const embedded = fakeEmbedded({});
    const judge = createAnswerJudge({ llm, embedded });
    const out = await judge.judgeAnswer(INPUT);
    assert.ok(out.ok, 'fallback embedded julga quando o llm vem sem feedback');
    if (out.ok) assert.equal(out.provider, 'embedded');
  });

  it('sem embedded injetado e llm falhando → UNAVAILABLE', async () => {
    const llm = fakeLlmClient({ throwError: new Error('network') });
    const judge = createAnswerJudge({ llm }); // sem embedded
    const out = await judge.judgeAnswer(INPUT);
    assert.ok(!out.ok);
    if (!out.ok) assert.equal(out.error.code, ANSWER_JUDGE_ERROR_CODES.UNAVAILABLE);
  });
});

describe('answerJudge: validação de entrada (INVALID_INPUT)', () => {
  it('answerText vazio / contexto incompleto → { ok:false, code: INVALID_INPUT }', async () => {
    const { judge, llm, embedded } = makeJudge();
    for (const bad of [
      { ...INPUT, answerText: '' },
      { ...INPUT, answerText: '   ' },
      { ...INPUT, context: { subject: '', lessonExcerpt: 'x' } },
      { ...INPUT, context: { subject: 'x', lessonExcerpt: '' } },
      { ...INPUT, context: {} as JudgeAnswerInput['context'] },
    ]) {
      const out = await judge.judgeAnswer(bad);
      assert.ok(!out.ok);
      if (!out.ok) assert.equal(out.error.code, ANSWER_JUDGE_ERROR_CODES.INVALID_INPUT);
    }
    assert.equal(llm.calls.length, 0, 'entrada inválida nem chama o LLM');
    assert.equal(embedded.calls.length, 0);
  });

  it('lessonId é opcional (não entra no julgamento)', async () => {
    const { judge } = makeJudge();
    const out = await judge.judgeAnswer({ ...INPUT, lessonId: '42' });
    assert.ok(out.ok);
  });
});
