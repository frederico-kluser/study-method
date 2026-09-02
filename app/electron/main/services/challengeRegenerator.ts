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
 * FAIL-CLOSED (docs/16-engine-de-trilha.md §9.3). O gate SEMÂNTICO
 * (verifyChallengeAgainstContext — "o desafio só cobra o que já foi ensinado")
 * nasceu como REFORÇO e falhava ABERTO: validador fora do ar
 * (CONTEXT_UNAVAILABLE) ou veredito não-parseável (CONTEXT_INVALID_JSON)
 * devolviam `ok: true` e o desafio chegava ao aluno validado SÓ por execução.
 * §9.3 proíbe exatamente isso — "indisponibilidade produz erro estruturado,
 * nunca veredito falso nem aprovação por omissão". Agora as quatro provas de
 * execução (§5.4) e o gate semântico são AMBOS obrigatórios no caminho do
 * aluno: o gate que não CONCLUIR com aprovação REPROVA a entrega, com código
 * de erro e mensagem em pt-BR que diz o que houve e o que fazer.
 *
 * PURE/DI: llm e exec injetáveis (testes sem rede).
 */

import { TrackLessonSource } from '../content/trackTypes';
import { verifyChallengePair, type ExecFn } from './challengeExec';
import {
  CONTEXT_ERROR_CODES,
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
   * Contexto pedagógico JÁ MONTADO (buildChallengeContext — o chamador tem o
   * LoadedTrack em mãos; o regenerador se mantém puro e sem IO). PRESENTE → o
   * draft aprovado na EXECUÇÃO ainda precisa da APROVAÇÃO SEMÂNTICA para ser
   * entregue (fail-closed, §9.3): o desafio só pode cobrar o que foi ensinado.
   *
   * AUSENTE é OPT-OUT DECLARADO do gate — e não um caminho do aluno. Sem
   * contexto não há o que julgar, e o ÚNICO chamador de produção
   * (ipc/track-handlers.ts) sempre manda contexto: quando a montagem falha ele
   * devolve erro estruturado em vez de regenerar sem contexto (antes só emitia
   * um console.warn — era o terceiro furo do fail-closed). Quem exige o gate
   * declara `requireSemanticGate: true` e a ausência de contexto vira erro
   * ANTES de qualquer chamada de LLM. A porta segue aberta apenas para uso
   * FORA do fluxo do aluno — os testes de unidade do laço de execução em
   * `tests/trackServices.test.ts`, que exercitam geração/retry/execução sem
   * nada a validar semanticamente.
   */
  context?: ChallengeContext;
  /**
   * O chamador EXIGE o gate semântico (fail-closed, §9.3): sem `context` não
   * existe regeneração — erro estruturado REGEN_SEMANTIC_NOT_RUN e ZERO
   * chamada de LLM. É `true` no handler IPC (o caminho do ALUNO). O default
   * `false` preserva o opt-out de quem só exercita o laço de execução.
   */
  requireSemanticGate?: boolean;
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
  /** FAIL-CLOSED §9.3: o gate semântico está fora do ar — nada é entregue. */
  SEMANTIC_UNAVAILABLE: 'REGEN_SEMANTIC_UNAVAILABLE',
  /** FAIL-CLOSED §9.3: veredito semântico ilegível mesmo após o retry. */
  SEMANTIC_INVALID_VERDICT: 'REGEN_SEMANTIC_INVALID_VERDICT',
  /** FAIL-CLOSED §9.3: o gate era EXIGIDO e não pôde sequer RODAR. */
  SEMANTIC_NOT_RUN: 'REGEN_SEMANTIC_NOT_RUN',
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
 * As mensagens do fail-closed, escritas para o ALUNO. Elas chegam CRUAS à UI
 * (`src/components/challenge/ChallengeGenerateModal.tsx` e
 * `src/views/ChallengeView/TrackChallengePanel.tsx` mostram `error.message`),
 * então cada uma diz, nesta ordem: o que houve, por que NADA foi entregue e o
 * que fazer agora. Fail-closed significa ouvir "não consegui gerar um desafio
 * agora" em vez de receber um desafio que cobra o que a trilha não ensinou —
 * a mensagem tem de deixar isso claro, sem jargão.
 */
const GATE_HEAD = 'Não deu para conferir se o desafio novo cabe no que você já estudou';
const GATE_WHY = 'Para não te entregar um desafio que cobra conteúdo ainda não ensinado, nada foi gerado.';

export const SEMANTIC_GATE_MESSAGES = {
  unavailable: (detail: string): string =>
    `${GATE_HEAD}: o serviço de IA que faz essa conferência não respondeu (${detail}). ${GATE_WHY} Confira a chave da API e os créditos nas Configurações e tente de novo.`,
  invalidVerdict: (detail: string): string =>
    `${GATE_HEAD}: a IA respondeu num formato ilegível, mesmo depois da segunda tentativa (${detail}). ${GATE_WHY} Tente de novo em alguns instantes.`,
  noContext: (detail: string): string =>
    `${GATE_HEAD}: não deu para montar o histórico das suas aulas (${detail}). ${GATE_WHY} Tente de novo; se continuar, a trilha pode estar com a estrutura inconsistente.`,
  budgetExhausted: (): string =>
    `${GATE_HEAD}: a conferência não coube no orçamento de tentativas desta geração. ${GATE_WHY} Tente de novo.`,
} as const;

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

/**
 * Gera o prompt de regeneração (nunca-repetir é o coração).
 *
 * SEM imperativo de raciocínio no texto: a profundidade é PARÂMETRO do
 * protocolo (`reasoning: { enabled: true, effort: 'max' }`, default do cliente
 * vindo de `shared/llm/constants.ts`), e "pense profundamente, passo a passo"
 * é anti-padrão declarado em `docs/16-engine-de-trilha.md` §7 para modelo com
 * raciocínio nativo.
 */
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
 * Regenera um desafio. Valida por EXECUÇÃO (§5.4: a solução passa, o starter
 * falha, a contagem bate); falha → retry com feedback do erro; falha de novo →
 * erro estruturado (nunca devolve desafio ruim).
 *
 * GATE SEMÂNTICO, FAIL-CLOSED (docs/16-engine-de-trilha.md §9.3). Com
 * `input.context`, o draft aprovado na execução SÓ é entregue se
 * verifyChallengeAgainstContext concluir APROVADO. Os desfechos, todos
 * terminais e todos com erro estruturado + mensagem em pt-BR para o aluno:
 *
 *   - APROVADO → entrega.
 *   - REPROVADO (cobra o não-ensinado) → retry com o FEEDBACK SEMÂNTICO (os
 *     motivos dos testes reprovados entram no `lastReason` da próxima
 *     geração); esgotadas as tentativas → REGEN_INVALID_CODE.
 *   - CONTEXT_UNAVAILABLE (validador fora do ar) → REGEN_SEMANTIC_UNAVAILABLE.
 *     NÃO se retenta a geração: o defeito está no validador, não no draft —
 *     gerar de novo só queimaria crédito para cair no mesmo lugar.
 *   - CONTEXT_INVALID_JSON (veredito ilegível após o retry INTERNO do
 *     validador, MAX_CONTEXT_ATTEMPTS) → REGEN_SEMANTIC_INVALID_VERDICT.
 *   - orçamento semântico esgotado com contexto presente →
 *     REGEN_SEMANTIC_NOT_RUN (entregar sem veredito seria aprovação por
 *     omissão, o que §9.3 proíbe).
 *
 * Teto: MAX_SEMANTIC_ATTEMPTS vereditos por regeneração (um por draft aprovado
 * na execução; com MAX_REGEN_ATTEMPTS=2, no máximo 2).
 *
 * SEM `input.context` o gate não roda — é o OPT-OUT do chamador, descrito em
 * RegenerateInput.context. `requireSemanticGate: true` (o que o handler IPC
 * manda) transforma essa ausência em REGEN_SEMANTIC_NOT_RUN antes da 1ª
 * chamada de LLM, de modo que NENHUM caminho do aluno entrega desafio sem
 * veredito semântico.
 */
export async function regenerateChallenge(input: RegenerateInput): Promise<RegenerateOutcome> {
  // FAIL-CLOSED (§9.3): quem EXIGE o gate não regenera sem contexto — não há o
  // que julgar. Erro estruturado ANTES da 1ª chamada de LLM (nada de crédito
  // gasto para produzir um desafio que seria recusado no fim).
  if (input.requireSemanticGate && !input.context) {
    return {
      ok: false,
      error: {
        code: REGEN_ERROR_CODES.SEMANTIC_NOT_RUN,
        message: SEMANTIC_GATE_MESSAGES.noContext('o histórico não chegou ao gerador'),
      },
    };
  }
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

    // Validação SEMÂNTICA do draft aprovado na execução (fail-closed, §9.3).
    if (input.context) {
      if (semanticAttempts >= MAX_SEMANTIC_ATTEMPTS) {
        // Entregar com contexto em mãos e SEM veredito é aprovação por
        // omissão. Hoje MAX_SEMANTIC_ATTEMPTS === MAX_REGEN_ATTEMPTS e o ramo
        // não dispara; ele existe para que baixar o teto semântico no futuro
        // NÃO reabra o gate sem ninguém perceber.
        return {
          ok: false,
          error: {
            code: REGEN_ERROR_CODES.SEMANTIC_NOT_RUN,
            message: SEMANTIC_GATE_MESSAGES.budgetExhausted(),
          },
        };
      }
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
        // FAIL-CLOSED (§9.3): o gate NÃO concluiu — indisponível ou veredito
        // ilegível. Aprovação por omissão está proibida, então a ENTREGA é
        // reprovada com erro estruturado. Sai já, sem retentar a geração: o
        // defeito está no validador, não no draft.
        const detail = semantic.error.message.slice(0, 160);
        return semantic.error.code === CONTEXT_ERROR_CODES.UNAVAILABLE
          ? {
              ok: false,
              error: {
                code: REGEN_ERROR_CODES.SEMANTIC_UNAVAILABLE,
                message: SEMANTIC_GATE_MESSAGES.unavailable(detail),
              },
            }
          : {
              ok: false,
              error: {
                code: REGEN_ERROR_CODES.SEMANTIC_INVALID_VERDICT,
                message: SEMANTIC_GATE_MESSAGES.invalidVerdict(detail),
              },
            };
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

    // Chegar aqui é `input.context` ausente — o OPT-OUT declarado (o gate não
    // foi pedido e não havia o que julgar): entrega validada por execução.
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
