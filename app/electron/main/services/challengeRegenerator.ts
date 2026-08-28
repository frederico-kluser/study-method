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
import {
  NO_ENTRY_CRITERIA_LABEL,
  verifyChallengeAgainstContext,
  type ChallengeContext,
} from './challengeContextValidator';

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
  /**
   * ONDA 2 (autoria): contexto pedagógico JÁ MONTADO (buildChallengeContext —
   * o chamador tem o LoadedTrack em mãos; o regenerador se mantém puro e sem
   * IO). Quando presente, o draft aprovado na EXECUÇÃO ainda passa pela
   * validação SEMÂNTICA (verifyChallengeAgainstContext) — o desafio só pode
   * cobrar o que foi ensinado. Ausente → entrega validado por execução
   * (caminho defensivo — ver doc de regenerateChallenge).
   */
  context?: ChallengeContext;
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

/**
 * ONDA 2 (autoria): máx de vereditos SEMÂNTICOS por regeneração — um por draft
 * aprovado na execução; com MAX_REGEN_ATTEMPTS=2, no máximo 2 (um por
 * tentativa de geração). A contagem é o teto DOCUMENTADO do loop de retry por
 * reprovação semântica.
 */
export const MAX_SEMANTIC_ATTEMPTS = 2;

/**
 * ONDA 2 (autoria): o contexto (critérios de entrada + aulas anteriores + a
 * aula atual) ENSINOU validação/tratamento de erro? Decide se o FORMATO do
 * prompt pede o "caso de erro" — o caso de erro SÓ pode ser cobrado se o
 * contexto ensinou validação de entrada/erros (ex.: typeof, throw, try/catch,
 * assert.throws). HEURÍSTICA por marcadores de texto/código (exportada para
 * teste): não é o juiz final — o validador semântico
 * (verifyChallengeAgainstContext) decide de verdade; isto apenas molda a
 * instrução do FORMATO que a LLM de geração recebe.
 */
const ERROR_HANDLING_MARKER_RE = /\b(?:throw|typeof|try|catch|assert\.throws|exceção|exception|validaç[ãa]o|validar)\b/i;

export function contextTeachesErrorHandling(
  input: Pick<RegenerationPromptInput, 'lesson' | 'entryCriteria' | 'previousLessons'>,
): boolean {
  const theory = input.lesson.theory.map((s) => s.markdown).join('\n');
  const prev = (input.previousLessons ?? []).map((p) => `${p.title}\n${p.concepts.join(', ')}\n${p.theoryExcerpt}`).join('\n');
  const criteria = (input.entryCriteria ?? []).join('\n');
  return ERROR_HANDLING_MARKER_RE.test(`${theory}\n${prev}\n${criteria}`);
}

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
  /**
   * ONDA 2 (autoria): critérios de entrada da trilha (track.json
   * entryCriteria — o que o aluno sabia ANTES de começar). Ausente/vazio →
   * marca "(nenhum — trilha de senso iniciante)".
   */
  entryCriteria?: string[];
  /**
   * ONDA 2 (autoria): aulas ANTERIORES à atual (o aluno JÁ estudou — o desafio
   * SÓ pode cobrar isto + o conteúdo da aula atual).
   */
  previousLessons?: Array<{ title: string; concepts: string[]; theoryExcerpt: string }>;
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

  // ONDA 2 (autoria): contexto pedagógico no prompt — o desafio SÓ pode cobrar
  // o que o aluno já conhece (critérios de entrada + aulas anteriores + a aula
  // atual). Sem critérios declarados → trilha de senso iniciante.
  const entryCriteria =
    input.entryCriteria && input.entryCriteria.length > 0
      ? input.entryCriteria.map((c) => `- ${c}`).join('\n')
      : `- ${NO_ENTRY_CRITERIA_LABEL}`;
  const previousLessons =
    input.previousLessons && input.previousLessons.length > 0
      ? input.previousLessons
          .map(
            (l, i) =>
              `${i + 1}. ${l.title} — conceitos: ${l.concepts.join(', ') || '(nenhum)'}\n` +
              `   Teoria (trecho):\n${l.theoryExcerpt}`,
          )
          .join('\n\n')
      : '(nenhuma — esta é a primeira aula da trilha)';

  // ONDA 2 (autoria): caso de erro SÓ se o contexto ensinou validação/erros —
  // cobrar assert.throws sem ter ensinado validação de tipos é exatamente o
  // defeito pedagógico que esta onda elimina (caso "somar" da onda 1).
  const testCasesInstruction = contextTeachesErrorHandling(input)
    ? '2 a 4 testes cobrindo caso normal, caso limite e caso de erro'
    : '2 a 4 testes cobrindo caso normal e caso limite (NÃO crie caso de erro — o contexto não ensinou validação/tratamento de erro)';

  return `Você é o autor de desafios do curso "${input.trackTitle}" do study-method. Gere UM desafio de código NOVO para a aula "${lesson.title}" (conceitos: ${lesson.concepts.join(', ')}).

PENSE PROFUNDAMENTE, PASSO A PASSO, antes de produzir o JSON — analise cada teste contra o conteúdo ensinado (critérios de entrada, aulas anteriores e esta aula). O raciocínio não é a resposta; a resposta é SOMENTE o objeto JSON.

CONTEÚDO DA AULA (resumo):
${theoryExcerpt}

CONTEÚDO DAS AULAS ANTERIORES (o aluno JÁ conhece — o desafio SÓ pode usar isto + o conteúdo da aula atual):
${previousLessons}

CRITÉRIOS DE ENTRADA DA TRILHA (o aluno sabia antes de começar):
${entryCriteria}

DESAFIOS QUE O ALUNO JÁ ERROU NESTA AULA — NÃO REPITA NENHUM DESTES (nem o conceito específico cobrado, nem o enunciado):
${failedList}

FORMATO (responda SOMENTE um objeto JSON válido, sem markdown):
{
  "title": "título curto em pt-BR",
  "concept": "concept_id snake_case",
  "difficulty": 2,
  "statement": "enunciado em markdown pt-BR, linguagem simples",
  "starterCode": "código ESM que o aluno edita: exporta a(s) função(ões) com implementação que lança erro (não implementado)",
  "testsCode": "código node:test ESM que importa de './solution.mjs' e testa a função com assert — ${testCasesInstruction}",
  "solutionCode": "implementação de referência CORRETA da(s) mesma(s) função(ões)",
  "expectedTestCount": <número de testes>
}

REGRAS:
- a assinatura da função deve ser a MESMA em starterCode e solutionCode;
- o teste deve falhar com o starter (aluno tem o que fazer) e passar com a solução;
- NUNCA cobrar algo não ensinado — o aluno só conhece as aulas anteriores e esta aula; se um conceito (ex.: validação de tipos, assert.throws, tratamento de erro) não aparece no conteúdo, NÃO crie teste que o exija;
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
 * Regenera um desafio. Valida por execução; falha → retry com feedback do
 * erro; falha de novo → erro estruturado (nunca devolve desafio ruim).
 *
 * ONDA 2 (autoria): quando `input.context` é fornecido, o draft aprovado na
 * EXECUÇÃO ainda passa pela validação SEMÂNTICA (verifyChallengeAgainstContext
 * — o desafio só pode cobrar o que foi ensinado). Veredito semântico
 * REPROVADO → retry com o FEEDBACK SEMÂNTICO (motivos dos testes reprovados
 * concatenados entram no `lastReason` da próxima geração); no máx
 * MAX_SEMANTIC_ATTEMPTS vereditos semânticos (um por draft aprovado na
 * execução — com MAX_REGEN_ATTEMPTS=2, no máximo 2). O validador semântico é
 * um REFORÇO: CONTEXT_UNAVAILABLE/CONTEXT_INVALID_JSON NÃO bloqueiam a entrega
 * — o desafio já passou pela execução e a indisponibilidade do validador não
 * deve travar a regeneração (a porta de auditoria é o CLI
 * track:challenge:context). Contexto ausente → entrega por execução (caminho
 * defensivo do handler quando a montagem do contexto falha).
 */
export async function regenerateChallenge(input: RegenerateInput): Promise<RegenerateOutcome> {
  let lastReason = '';
  let semanticAttempts = 0;
  // ONDA 2 (autoria): o contexto pedagógico (quando presente) alimenta o
  // prompt de geração — critérios de entrada + aulas anteriores entram como
  // conhecimento JÁ ensinado (o desafio só pode cobrar isto + a aula atual).
  const promptInput: RegenerationPromptInput = {
    trackTitle: input.trackTitle,
    lesson: input.lesson,
    failed: input.failed,
    entryCriteria: input.context?.entryCriteria,
    previousLessons: input.context?.previousLessons.map((l) => ({
      title: l.title,
      concepts: l.concepts,
      theoryExcerpt: l.theoryExcerpt,
    })),
  };
  for (let attempt = 0; attempt < MAX_REGEN_ATTEMPTS; attempt += 1) {
    let content: string;
    try {
      const res = await input.llm({
        messages: [
          { role: 'system', content: 'Você responde apenas JSON válido, sem markdown.' },
          { role: 'user', content: buildRegenerationPrompt(promptInput) + (lastReason ? `\n\nO ÚLTIMO desafio foi rejeitado pela verificação. Motivo: ${lastReason}. Corrija e tente de novo.` : '') },
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

    // ONDA 2 (autoria): validação semântica do draft aprovado na execução.
    if (input.context && semanticAttempts < MAX_SEMANTIC_ATTEMPTS) {
      semanticAttempts += 1;
      const semantic = await verifyChallengeAgainstContext({
        context: input.context,
        challenge: {
          title: draft.title,
          statement: draft.statement,
          testsCode: draft.testsCode,
          solutionCode: draft.solutionCode,
        },
        llm: input.llm,
      });
      if (!semantic.ok) {
        // Validador indisponível/JSON inválido: reforço fora do ar não trava a
        // entrega — o desafio já passou pela execução (decisão documentada no
        // handoff da onda 2; o CLI track:challenge:context é a auditoria).
        return { ok: true, challenge: draft };
      }
      if (semantic.aprovado) {
        return { ok: true, challenge: draft };
      }
      // Reprovação SEMÂNTICA (conteúdo não ensinado) → feedback conciso dos
      // motivos dos testes reprovados entra no retry de geração.
      lastReason =
        semantic.testes
          .filter((t) => !t.aprovado)
          .map((t) => t.motivo)
          .join('; ') ||
        'a IA reprovou o desafio na validação semântica (cobra conteúdo não ensinado).';
      continue;
    }

    return { ok: true, challenge: draft };
  }
  return {
    ok: false,
    error: {
      code: REGEN_ERROR_CODES.INVALID_CODE,
      message: `a IA não produziu um desafio válido após as tentativas.${lastReason ? ` Motivo da última rejeição: ${lastReason.slice(0, 300)}.` : ''} Tente de novo.`,
    },
  };
}
