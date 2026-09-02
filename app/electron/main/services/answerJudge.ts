/**
 * electron/main/services/answerJudge.ts — avaliador da RESPOSTA DIGITADA
 * (interpretação) do aluno no tutor study-method.
 *
 * Julga o que o aluno ESCREVEU sobre o conceito da aula (não é verificação de
 * número — essa é a mathLib via `study:check-math-answer`). Resultado
 * estruturado { verdict: 'correct' | 'partial' | 'incorrect', feedback } em
 * pt-BR, com as regras anti-bajulação do tutor (AS-1/AS-2: feedback específico,
 * nunca elogio vazio, nunca inventa acerto).
 *
 * Cadeia de provedores (a ordem importa):
 *   1. deepseekClient (LLM remoto) — primeira tentativa;
 *   2. embeddedLlm (LLM local, serviço existente) — FALLBACK quando o
 *      deepseek falha/indisponível (sem chave, rede, content vazio, resposta
 *      não-parseável, rate limit, servidor…);
 *   3. falha TOTAL → erro estruturado com `code` — NUNCA inventa veredito.
 *
 * Códigos de erro estruturados (AnswerJudgeError):
 *   ANSWER_JUDGE_INVALID_INPUT  — payload sem answerText/context utilizável;
 *   ANSWER_JUDGE_UNAVAILABLE    — nenhum provedor respondeu (transporte);
 *   ANSWER_JUDGE_UNPARSEABLE    — provedor(es) responderam sem JSON utilizável.
 *
 * O serviço é TOTAL: `judgeAnswer` nunca lança (devolve a união
 * { ok: true, … } | { ok: false, error }) — o handler IPC valida o shape e
 * lança erros de payload à parte, no padrão dos demais handlers study:*.
 * NÃO importa electron; clientes injetáveis (testes isolam o transporte).
 *
 * RACIOCÍNIO: o provedor remoto é chamado SEM override de esforço — vale o
 * default do cliente, `reasoning: { enabled: true, effort: 'max' }` do
 * contrato congelado `shared/llm/constants.ts`. O prompt não traz imperativo
 * de raciocínio (anti-padrão em modelo com raciocínio nativo — docs/16 §7).
 */

import type { DeepSeekClient } from './deepseekClient';
import { extractFirstJsonObject } from './deepseekLlmJudge';

export const ANSWER_JUDGE_ERROR_CODES = {
  /** Payload sem answerText/context utilizável. */
  INVALID_INPUT: 'ANSWER_JUDGE_INVALID_INPUT',
  /** Nenhum provedor respondeu (transporte/chave/modelo indisponíveis). */
  UNAVAILABLE: 'ANSWER_JUDGE_UNAVAILABLE',
  /** Provedor(es) responderam, mas sem JSON de veredito utilizável. */
  UNPARSEABLE: 'ANSWER_JUDGE_UNPARSEABLE',
} as const;

export type AnswerJudgeErrorCode = (typeof ANSWER_JUDGE_ERROR_CODES)[keyof typeof ANSWER_JUDGE_ERROR_CODES];

/** Erro estruturado do avaliador (carrega `code` estável para a UI). */
export class AnswerJudgeError extends Error {
  readonly code: AnswerJudgeErrorCode;

  constructor(code: AnswerJudgeErrorCode, message: string) {
    super(message);
    this.name = 'AnswerJudgeError';
    this.code = code;
  }
}

/** Veredito da INTERPRETAÇÃO digitada (nunca inventado — só vem do LLM). */
export type AnswerVerdict = 'correct' | 'partial' | 'incorrect';

/** Superfície mínima do LLM local que o avaliador usa (embeddedLlm real ou fake). */
export interface EmbeddedLlmLike {
  getActive(): string | null;
  chat(opts: { modelId: string; prompt: string; temperature?: number }): Promise<{ text: string }>;
}

export interface AnswerJudgeDeps {
  /** Cliente DeepSeek one-shot (provedor primário). */
  deepseek: DeepSeekClient;
  /** Resolve a chave do provedor de LLM sob demanda; vazia ⇒ degrada ao fallback. */
  getApiKey?: () => Promise<string>;
  /** LLM local (fallback). Ausente ⇒ só o deepseek. */
  embedded?: EmbeddedLlmLike;
  /** Sobrescreve o model do provedor remoto (default: OPENROUTER_MODEL.id, aplicado no cliente). */
  model?: string;
}

export interface JudgeAnswerInput {
  /** Id da lição quando a resposta é de uma aula persistida (contexto). */
  lessonId?: string;
  /** O que o aluno DIGITOU (a interpretação dele). */
  answerText: string;
  context: {
    /** Assunto da aula (ex.: 'Closures em JavaScript'). */
    subject: string;
    /** Trecho do material da aula (contexto do que foi ensinado). */
    lessonExcerpt: string;
  };
}

export type JudgeAnswerOutcome =
  | { ok: true; verdict: AnswerVerdict; feedback: string; provider: 'deepseek' | 'embedded' }
  | { ok: false; error: { code: string; message: string } };

const SYSTEM_PROMPT_PT_BR =
  'Você é o avaliador do tutor study-method. Você recebe o ASSUNTO da aula, um ' +
  'TRECHO do material e a RESPOSTA DIGITADA do aluno. Julgue a INTERPRETAÇÃO: o ' +
  'que o aluno escreveu demonstra que entendeu o conceito ensinado? ' +
  'Responda APENAS com um objeto JSON, sem texto ao redor, no layout exato: ' +
  '{"verdict": "<correct|partial|incorrect>", "feedback": "<texto>"}. ' +
  'verdict: "correct" quando a resposta demonstra domínio do conceito; ' +
  '"partial" quando demonstra entendimento parcial (acerto parcial, lacuna ou ' +
  'imprecisão); "incorrect" quando não demonstra entendimento ou sai do assunto. ' +
  'feedback: 1 a 3 frases em pt-BR, específicas e concretas, apontando o que a ' +
  'resposta acerta ou onde ela diverge do conceito — nunca elogio vazio, nunca ' +
  'invente um acerto, nunca trate resposta errada como "quase certa".';

/** Monta a mensagem do usuário (usada nos dois provedores). */
function buildUserPrompt(input: JudgeAnswerInput): string {
  const parts: string[] = [];
  parts.push(`ASSUNTO:\n${input.context.subject}`);
  parts.push(`TRECHO DO MATERIAL DA AULA:\n${input.context.lessonExcerpt}`);
  if (input.lessonId) parts.push(`ID DA LIÇÃO: ${input.lessonId}`);
  parts.push(`RESPOSTA DIGITADA DO ALUNO:\n${input.answerText}`);
  parts.push(
    'RESPOSTA: produza apenas o objeto JSON {"verdict": "...", "feedback": "..."} do layout acima.'
  );
  return parts.join('\n\n');
}

/** Valida o JSON do modelo; null ⇒ tentativa sem veredito utilizável. */
function parseVerdictOutcome(parsed: unknown): { verdict: AnswerVerdict; feedback: string } | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;
  const verdict = o.verdict;
  if (verdict !== 'correct' && verdict !== 'partial' && verdict !== 'incorrect') return null;
  const feedback = typeof o.feedback === 'string' ? o.feedback.trim() : '';
  if (!feedback) return null;
  return { verdict, feedback };
}

type AttemptResult = { outcome: JudgeAnswerOutcome } | { failed: 'transport' | 'unparseable' };

/**
 * Fabrica o avaliador. `judgeAnswer` é TOTAL (nunca lança): devolve a união
 * { ok: true, verdict, feedback, provider } | { ok: false, error: { code } }.
 */
export function createAnswerJudge(deps: AnswerJudgeDeps) {
  const model = deps.model;

  async function attemptDeepseek(input: JudgeAnswerInput): Promise<AttemptResult> {
    try {
      if (deps.getApiKey) {
        const key = (await deps.getApiKey()).trim();
        if (!key) return { failed: 'transport' }; // sem chave ⇒ degrada ao fallback
      } else if (!deps.deepseek) {
        return { failed: 'transport' };
      }
      const raw = await deps.deepseek.chatCompletion({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT_PT_BR },
          { role: 'user', content: buildUserPrompt(input) },
        ],
        temperature: 0,
        ...(model ? { model } : {}),
      });
      if (!raw || !raw.content || raw.content.trim().length === 0) {
        return { failed: 'transport' };
      }
      const verdict = parseVerdictOutcome(extractFirstJsonObject(raw.content));
      if (!verdict) return { failed: 'unparseable' };
      return {
        outcome: {
          ok: true,
          verdict: verdict.verdict,
          feedback: verdict.feedback,
          provider: 'deepseek',
        },
      };
    } catch {
      // Qualquer falha do transporte DeepSeek (sem chave, rede, key inválida,
      // rate limit, servidor, content vazio) degrada ao fallback local — nunca
      // inventa veredito. O erro estruturado só vem na falha TOTAL.
      return { failed: 'transport' };
    }
  }

  async function attemptEmbedded(input: JudgeAnswerInput): Promise<AttemptResult> {
    try {
      if (!deps.embedded) return { failed: 'transport' };
      const modelId = deps.embedded.getActive() ?? null;
      if (!modelId) return { failed: 'transport' }; // nenhum modelo local carregado
      const out = await deps.embedded.chat({
        modelId,
        prompt: `${SYSTEM_PROMPT_PT_BR}\n\n${buildUserPrompt(input)}`,
        temperature: 0,
      });
      if (!out || !out.text || out.text.trim().length === 0) {
        return { failed: 'transport' };
      }
      const verdict = parseVerdictOutcome(extractFirstJsonObject(out.text));
      if (!verdict) return { failed: 'unparseable' };
      return {
        outcome: {
          ok: true,
          verdict: verdict.verdict,
          feedback: verdict.feedback,
          provider: 'embedded',
        },
      };
    } catch {
      return { failed: 'transport' };
    }
  }

  async function judgeAnswer(input: JudgeAnswerInput): Promise<JudgeAnswerOutcome> {
    const answerText = typeof input?.answerText === 'string' ? input.answerText.trim() : '';
    const subject = typeof input?.context?.subject === 'string' ? input.context.subject.trim() : '';
    const lessonExcerpt =
      typeof input?.context?.lessonExcerpt === 'string' ? input.context.lessonExcerpt.trim() : '';
    if (!answerText || !subject || !lessonExcerpt) {
      return {
        ok: false,
        error: {
          code: ANSWER_JUDGE_ERROR_CODES.INVALID_INPUT,
          message:
            'answerJudge: resposta digitada vazia ou contexto incompleto (subject/lessonExcerpt obrigatórios).',
        },
      };
    }
    const normalized: JudgeAnswerInput = {
      ...(input.lessonId ? { lessonId: input.lessonId } : {}),
      answerText,
      context: { subject, lessonExcerpt },
    };

    const deepseek = await attemptDeepseek(normalized);
    if ('outcome' in deepseek) return deepseek.outcome;

    const embedded = await attemptEmbedded(normalized);
    if ('outcome' in embedded) return embedded.outcome;

    // Falha TOTAL: erro estruturado — nunca um veredito inventado.
    const anyUnparseable =
      ('failed' in deepseek && deepseek.failed === 'unparseable') ||
      ('failed' in embedded && embedded.failed === 'unparseable');
    return {
      ok: false,
      error: {
        code: anyUnparseable ? ANSWER_JUDGE_ERROR_CODES.UNPARSEABLE : ANSWER_JUDGE_ERROR_CODES.UNAVAILABLE,
        message: anyUnparseable
          ? 'answerJudge: os provedores responderam sem um veredito parseável — não foi possível avaliar a resposta.'
          : 'answerJudge: deepseek e LLM local indisponíveis — não foi possível avaliar a resposta.',
      },
    };
  }

  return { judgeAnswer };
}

/** Superfície estrutural do avaliador usada pelos handlers IPC (DI de testes). */
export interface AnswerJudgeLike {
  judgeAnswer(input: JudgeAnswerInput): Promise<JudgeAnswerOutcome>;
}

export type AnswerJudge = ReturnType<typeof createAnswerJudge>;
