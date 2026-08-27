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
  /**
   * ONDA5: id da lição PERSISTIDA — lido do TOPO do resultado do generate
   * (`{lesson, rejected, lessonId, subjectId}`) com fallback para os campos do
   * próprio StudyLesson (a onda 4 grava nos dois lugares). undefined quando a
   * geração rodou sem repo. A LessonView usa para recordAnswer/
   * markLessonCompleted/judge-answer com ids reais.
   */
  lessonId?: string;
  /** ONDA5: id do subject persistido (mesma origem do lessonId). */
  subjectId?: string;
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
    // ONDA5: campos ADITIVOS (opcionais — undefined preserva shapes antigos).
    slug: asString(c.slug) || undefined,
    subjectId: asString(c.subjectId) || undefined,
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
    // ONDA5: campos ADITIVOS (undefined tolerado — nada quebra shapes antigos).
    // `exercise` é o exercício de matemática (kind 'math'); `lessonId`/
    // `subjectId` são os ids PERSISTIDOS da onda 4 (recordAnswer/judge-answer).
    ...(isRecord(l.exercise) && asString((l.exercise as Record<string, unknown>).kind) === 'math'
      ? {
          exercise: {
            kind: 'math' as const,
            family: asString((l.exercise as Record<string, unknown>).family),
            seed: typeof (l.exercise as Record<string, unknown>).seed === 'number'
              ? ((l.exercise as Record<string, unknown>).seed as number)
              : 0,
            prompt: asString((l.exercise as Record<string, unknown>).prompt),
            expectedNormalized: asString((l.exercise as Record<string, unknown>).expectedNormalized),
          },
        }
      : {}),
    ...(asString(l.lessonId) ? { lessonId: asString(l.lessonId) } : {}),
    ...(asString(l.subjectId) ? { subjectId: asString(l.subjectId) } : {}),
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
    // ONDA5: ids reais vêm no TOPO do resultado ({lesson, rejected, lessonId,
    // subjectId} — a onda 4 grava nos dois lugares); o campo do StudyLesson
    // serve de fallback defensivo.
    const topLessonId = asString(payload.lessonId);
    const topSubjectId = asString(payload.subjectId);
    return {
      ok: true,
      lesson,
      rejected,
      ...(topLessonId || lesson.lessonId ? { lessonId: topLessonId || lesson.lessonId } : {}),
      ...(topSubjectId || lesson.subjectId ? { subjectId: topSubjectId || lesson.subjectId } : {}),
    };
  }

  const lesson = normalizeLesson(payload);
  if (lesson) return { ok: true, lesson, rejected: [] };

  const msg =
    typeof payload === 'string' && payload.trim()
      ? payload
      : 'Não foi possível gerar a aula: resposta inesperada do provedor.';
  return { ok: false, lesson: null, rejected: [], error: msg };
}