/**
 * src/lib/lessonParse.ts — parser puro do retorno de `study.generateLesson`.
 *
 * O canal `study:generate-lesson` é tipado como `Promise<unknown>` no
 * api-schema (a implementação do main chega na onda do study runner), então
 * normalizamos o payload para uma forma conhecida sem confiar em `any`. Aceita
 * tanto o objeto `StudyLesson` direto quanto `{ lesson, rejected }`, e marca
 * claramente quando o payload não casa a forma esperada.
 */
import type { ChallengeInfo, StudyFinding, StudyLesson } from '../../shared/ipc-contract';

/** Desafio rejeitado na geração (surge quando o main retorna `{lesson, rejected}`). */
export interface RejectedChallengeInfo {
  title: string;
  language?: string;
  verdict?: string;
  reason?: string;
}

export interface ParsedLesson {
  ok: boolean;
  lesson: StudyLesson | null;
  rejected: RejectedChallengeInfo[];
  /** Mensagem de erro user-facing em pt-BR quando `ok` é false. */
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeFinding(f: unknown): StudyFinding | null {
  if (!isRecord(f)) return null;
  return {
    query: asString(f.query),
    title: asString(f.title, asString(f.url)),
    url: asString(f.url),
    description: asString(f.description),
    score: typeof f.score === 'number' ? f.score : undefined,
  };
}

function normalizeChallenge(c: unknown): ChallengeInfo | null {
  if (!isRecord(c)) return null;
  return {
    challengeId: asString(c.challengeId, asString(c.title)),
    title: asString(c.title),
    language: asString(c.language),
    concept: asString(c.concept),
    difficulty: typeof c.difficulty === 'number' ? c.difficulty : 1,
    status: asString(c.status),
    verdict: asString(c.verdict),
    workspaceDir: asString(c.workspaceDir),
    statementPath: asString(c.statementPath),
  };
}

function normalizeLesson(l: unknown): StudyLesson | null {
  if (!isRecord(l)) return null;
  const markdown = asString(l.markdown);
  if (!markdown) return null;
  const findings: StudyFinding[] = Array.isArray(l.findings)
    ? l.findings.map(normalizeFinding).filter((f): f is StudyFinding => f !== null)
    : [];
  const challenges: ChallengeInfo[] = Array.isArray(l.challenges)
    ? l.challenges.map(normalizeChallenge).filter((c): c is ChallengeInfo => c !== null)
    : [];
  return {
    title: asString(l.title, asString(l.subject)),
    subject: asString(l.subject),
    markdown,
    findings,
    challenges,
    createdAt: asString(l.createdAt),
  };
}

/**
 * Normaliza o payload de `generateLesson`. Pode ser:
 *  - `StudyLesson` direto;
 *  - `{ lesson: StudyLesson, rejected?: RejectedChallengeInfo[] }`;
 *  - um erro/string (devolve ok:false com mensagem pt-BR).
 */
export function parseLessonResult(payload: unknown): ParsedLesson {
  if (isRecord(payload) && payload.lesson !== undefined) {
    const lesson = normalizeLesson(payload.lesson);
    const rejected: RejectedChallengeInfo[] = Array.isArray(payload.rejected)
      ? payload.rejected
          .map((r): RejectedChallengeInfo | null => {
            if (!isRecord(r)) return null;
            return {
              title: asString(r.title),
              language: typeof r.language === 'string' ? r.language : undefined,
              verdict: typeof r.verdict === 'string' ? r.verdict : undefined,
              reason:
                typeof r.reason === 'string'
                  ? r.reason
                  : typeof r.verdict === 'string'
                    ? r.verdict
                    : undefined,
            };
          })
          .filter((r): r is RejectedChallengeInfo => r !== null)
      : [];
    if (!lesson) {
      return {
        ok: false,
        lesson: null,
        rejected,
        error: 'A geração da aula terminou sem conteúdo de aula válido.',
      };
    }
    return { ok: true, lesson, rejected };
  }

  const lesson = normalizeLesson(payload);
  if (lesson) return { ok: true, lesson, rejected: [] };

  const msg =
    typeof payload === 'string' && payload.trim()
      ? payload
      : 'Não foi possível gerar a aula: resposta inesperada do provedor.';
  return { ok: false, lesson: null, rejected: [], error: msg };
}