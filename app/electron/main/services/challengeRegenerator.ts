/**
 * electron/main/services/challengeRegenerator.ts — REGENERAÇÃO de desafio com
 * nunca-repetir (rodada 8).
 *
 * Quando o aluno FALHA num desafio da aula, a UI mostra o erro + o botão
 * "Gerar novo desafio". Este serviço pede à LLM um desafio NOVO para a MESMA
 * aula, informando-a de TODOS os desafios que o aluno já errou (slug+título+
 * enunciado) para NÃO repeti-los, e VALIDA o resultado por execução (mesmas
 * provas do CLI: solução passa com igualdade de contagem, starter falha)
 * antes de devolver — desafio ruim nunca chega ao aluno.
 *
 * PURE/DI: llm e exec injetáveis (testes sem rede).
 */

import { TrackLessonSource } from '../content/trackTypes';
import { verifyChallengePair, type ExecFn } from './challengeExec';

export interface FailedChallengeInfo {
  slug: string;
  title: string;
  statement: string;
}

export interface GeneratedChallengeDraft {
  slug: string;
  title: string;
  concept: string;
  difficulty: number;
  statement: string;
  starterCode: string;
  testsCode: string;
  solutionCode: string;
  expectedTestCount: number;
}

export interface RegenerateInput {
  lesson: TrackLessonSource;
  trackTitle: string;
  failed: FailedChallengeInfo[];
  llm: (req: { messages: Array<{ role: 'system' | 'user'; content: string }>; temperature?: number; timeoutMs?: number }) => Promise<{ content: string }>;
  exec?: ExecFn;
}

export interface RegenerateOutcome {
  ok: boolean;
  challenge?: GeneratedChallengeDraft;
  error?: { code: string; message: string };
}

export const REGEN_ERROR_CODES = {
  UNAVAILABLE: 'REGEN_UNAVAILABLE',
  INVALID_JSON: 'REGEN_INVALID_JSON',
  INVALID_CODE: 'REGEN_INVALID_CODE',
} as const;

export const MAX_REGEN_ATTEMPTS = 2;

/** Extrai o primeiro objeto JSON de uma resposta (tolera fences ```json). */
export function extractJsonObject(text: string): unknown {
  // remove fences de markdown
  const noFences = text.replace(/```(?:json)?/g, '');
  const start = noFences.indexOf('{');
  const end = noFences.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(noFences.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Converte slug kebab-case em função camelCase (mesma regra do CLI). */
export function slugToFunctionName(slug: string): string {
  const camel = slug.replace(/-([a-z0-9])/gi, (_m, c: string) => c.toUpperCase());
  return /^[a-zA-Z_$]/.test(camel) ? camel : `f_${camel}`;
}

/** O que o prompt de regeneração precisa (subconjunto de RegenerateInput). */
export interface RegenerationPromptInput {
  trackTitle: string;
  lesson: TrackLessonSource;
  failed: FailedChallengeInfo[];
}

/** Gera o prompt de regeneração (nunca-repetir é o coração). */
export function buildRegenerationPrompt(input: RegenerationPromptInput): string {
  const { lesson } = input;
  const theoryExcerpt = lesson.theory
    .map((s) => s.markdown)
    .join('\n')
    .slice(0, 2000);
  const failedList =
    input.failed.length > 0
      ? input.failed
          .map((f) => `- "${f.title}" (slug ${f.slug}) — enunciado: ${f.statement.slice(0, 400)}`)
          .join('\n')
      : '(nenhum — é a primeira geração para esta aula)';

  return `Você é o autor de desafios do curso "${input.trackTitle}" do study-method. Gere UM desafio de código NOVO para a aula "${lesson.title}" (conceitos: ${lesson.concepts.join(', ')}).

CONTEÚDO DA AULA (resumo):
${theoryExcerpt}

DESAFIOS QUE O ALUNO JÁ ERROU NESTA AULA — NÃO REPITA NENHUM DESTES (nem o conceito específico cobrado, nem o enunciado):
${failedList}

FORMATO (responda SOMENTE um objeto JSON válido, sem markdown):
{
  "title": "título curto em pt-BR",
  "concept": "concept_id snake_case",
  "difficulty": 2,
  "statement": "enunciado em markdown pt-BR, linguagem simples",
  "starterCode": "código ESM que o aluno edita: exporta a(s) função(ões) com implementação que lança erro (não implementado)",
  "testsCode": "código node:test ESM que importa de './solution.mjs' e testa a função com assert — 2 a 4 testes cobrindo caso normal, caso limite e caso de erro",
  "solutionCode": "implementação de referência CORRETA da(s) mesma(s) função(ões)",
  "expectedTestCount": <número de testes>
}

REGRAS:
- a assinatura da função deve ser a MESMA em starterCode e solutionCode;
- o teste deve falhar com o starter (aluno tem o que fazer) e passar com a solução;
- o desafio deve ser DIFERENTE de tudo que o aluno já errou.`;
}

function parseDraft(raw: unknown): GeneratedChallengeDraft | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === 'string' && r.title.trim() ? r.title.trim() : null;
  const concept = typeof r.concept === 'string' && /^[a-z][a-z0-9_]{1,62}$/.test(r.concept) ? r.concept : null;
  const difficulty = typeof r.difficulty === 'number' && r.difficulty >= 1 && r.difficulty <= 5 ? r.difficulty : 2;
  const statement = typeof r.statement === 'string' && r.statement.trim() ? r.statement.trim() : null;
  const starterCode = typeof r.starterCode === 'string' && r.starterCode.trim() ? r.starterCode : null;
  const testsCode = typeof r.testsCode === 'string' && r.testsCode.trim() ? r.testsCode : null;
  const solutionCode = typeof r.solutionCode === 'string' && r.solutionCode.trim() ? r.solutionCode : null;
  const expectedTestCount = Number(r.expectedTestCount);
  if (!title || !concept || !statement || !starterCode || !testsCode || !solutionCode) return null;
  if (!Number.isInteger(expectedTestCount) || expectedTestCount < 1 || expectedTestCount > 20) return null;
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'desafio-gerado';
  return { slug, title, concept, difficulty, statement, starterCode, testsCode, solutionCode, expectedTestCount };
}

/**
 * Regenera um desafio. Valida por execução; falha → 1 retry com feedback do
 * erro; falha de novo → erro estruturado (nunca devolve desafio ruim).
 */
export async function regenerateChallenge(input: RegenerateInput): Promise<RegenerateOutcome> {
  let lastReason = '';
  for (let attempt = 0; attempt < MAX_REGEN_ATTEMPTS; attempt += 1) {
    let content: string;
    try {
      const res = await input.llm({
        messages: [
          { role: 'system', content: 'Você responde apenas JSON válido, sem markdown.' },
          { role: 'user', content: buildRegenerationPrompt(input) + (lastReason ? `\n\nO ÚLTIMO desafio foi rejeitado pela verificação. Motivo: ${lastReason}. Corrija e tente de novo.` : '') },
        ],
        temperature: 0.7,
        timeoutMs: 60_000,
      });
      content = res.content;
    } catch (err) {
      return { ok: false, error: { code: REGEN_ERROR_CODES.UNAVAILABLE, message: `falha do serviço de IA: ${String(err)}` } };
    }
    if (!content || !content.trim()) {
      return { ok: false, error: { code: REGEN_ERROR_CODES.UNAVAILABLE, message: 'a IA não devolveu conteúdo.' } };
    }

    const draft = parseDraft(extractJsonObject(content));
    if (!draft) {
      lastReason = 'a resposta não era um JSON no formato pedido.';
      continue;
    }

    const verdict = await verifyChallengePair(
      {
        solutionCode: draft.solutionCode,
        starterCode: draft.starterCode,
        testsCode: draft.testsCode,
        expectedTestCount: draft.expectedTestCount,
      },
      input.exec,
    );
    const declared = (draft.testsCode.match(/\btest\(/g) ?? []).length;
    if (!verdict.solutionPasses || !verdict.starterFails || declared !== draft.expectedTestCount) {
      lastReason = verdict.solutionPasses
        ? 'o teste não falha com o starter (ou a contagem de testes não bate).'
        : 'o teste não passa com a solução de referência.';
      continue;
    }

    return { ok: true, challenge: draft };
  }
  return {
    ok: false,
    error: {
      code: REGEN_ERROR_CODES.INVALID_CODE,
      message: 'a IA não produziu um desafio válido após as tentativas. Tente de novo.',
    },
  };
}
