/**
 * electron/main/services/moduleMastery.ts — ANÁLISE DE DOMÍNIO do desafio de
 * módulo (pedido do dono, na íntegra): *"analisar profundamente usando o
 * conteúdo das aulas e propor o conhecimento que o aluno demonstrou possuir e
 * marcar como finalizado as aulas que ele não precisaria fazer — porém sendo
 * criterioso: apenas parecer dominar não significa dominar"*.
 *
 * O FLUXO: o aluno submete o desafio do módulo (multi-teste, cobre o módulo
 * inteiro) →, a partir das EVIDÊNCIAS REAIS da tentativa, esta análise propõe
 * quais aulas o aluno demonstrou dominar → o main marca essas aulas como
 * concluídas e o aluno só refaz as que sobraram ("só faço as aulas que
 * reprovei").
 *
 * ─── POR QUE DUAS CAMADAS, E POR QUE A DECISÃO É PURA ────────────────────
 * `analyzeModuleMastery` é a REGRA: pura, determinística, testável sem LLM,
 * sem IO e sem Electron (mesma receita de `computeUnlockStates`). A montagem
 * das evidências (`buildTestEvidence`/`submittedAtomKeys`) e a gravação
 * (`markModuleMasteryProgress`) recebem tudo por parâmetro. Nada aqui chama a
 * LLM de propósito: a marcação de aula é um fato de progresso e a régua do
 * dono é CRITERIOSA — a análise mecânica de evidência é mais conservadora que
 * qualquer juiz generativo ("apenas parecer dominar não significa dominar").
 *
 * ─── AS REGRAS (todas precisam valer para `dominada: true`) ───────────────
 *   R1. EXECUÇÃO VÁLIDA: a tentativa precisa ter chegado aos testes
 *       (`checks` não-vazio). Sintaxe quebrada, timeout ou spawn falho ⇒
 *       NENHUMA aula marcada — não há o que demonstrar.
 *   R2. EVIDÊNCIA DE TESTE: existe ≥1 teste APROVADO que exercita as
 *       construções da aula (cobertura determinística via
 *       `derivarRequirements` — o que o aluno precisa ESCREVER para passar
 *       cada teste) OU o juiz de domínio atesta demonstração — E NENHUM
 *       teste reprovado que as exige (por cobertura derivada OU pela
 *       atribuição do juiz). A evidência negativa DESQUALIFICA: quem errou o
 *       que a aula ensina não a dominou.
 *   R3. EVIDÊNCIA DE CÓDIGO: o código submetido USA ≥1 construção produtiva
 *       da aula (`extractAtoms(submetido) ∩ introduces.productive`) — a mesma
 *       régua A6 da autoria. Escrever certo é diferente de parecer certo.
 *   R4. SEM ALVO ⇒ SEM MARCAÇÃO: aula sem `introduces.productive` declarado é
 *       AMBÍGUA — nunca marcada. Aula sem teste mapeável só é marcada pelo
 *       caminho do juiz (e ainda assim com R1+R3 de piso).
 *   R5. BASE GARANTIDA: aula marcada só quando suas pré-requisitas (na
 *       análise, ou já concluídas antes) também estão marcadas. Pré-requisito
 *       FORA do escopo do módulo NÃO bloqueia (o desafio do módulo não pode
 *       prová-lo de qualquer jeito, e a progressão sequencial do curso é quem
 *       trata dele) — o que bloqueia é "dominar o avançado sem o básico
 *       DENTRO do que esta análise decide".
 *
 * ─── O JUIZ DE DOMÍNIO (a "análise profunda usando o conteúdo das aulas") ─
 * Os desafios de módulo são, com frequência, PROGRAMAS de um teste só (o
 * `rachando-a-conta` real: 1 teste, cobertura derivada VAZIA) — a evidência
 * mecânica de teste não localiza o que o aluno errou. O juiz (`judgeModule-
 * Mastery`) lê o CONTEÚDO de cada aula + o código submetido + os testes e
 * propõe, aula por aula, se o conhecimento dela foi demonstrado e quais
 * testes reprovados se ligam a ele. Ele NUNCA marca sozinho: R1 e R3 são
 * pisos determinísticos, e uma aula com teste reprovado atribuído a ela cai
 * mesmo com o juiz a favor. Sem juiz (LLM fora, timeout, JSON inválido depois
 * de 1 retry) sobra o caminho determinístico — fail-closed marca nada, nunca
 * demais.
 *
 * ─── O QUE MUDA NO PROGRESSO (e por que marcação AVULSA é aceitável) ─────
 * `computeUnlockStates` trava a aula N quando a N−1 não está concluída, e a
 * marcação por domínio pode deixar "buracos" (aula 2 para refazer, aula 3
 * marcada). Isso é coerente: a 3 mostra "Concluída" (o `done` vence o `locked`
 * na UI), e a 2 — a única a refazer entre elas — nasce destravada (a anterior
 * está marcada). O aluno refaz EXATAMENTE o que reprovou, na ordem que quiser.
 * Nada de prefixo contíguo: o pedido do dono é "só faço as aulas que reprovei".
 *
 * FAIL-CLOSED EM TUDO: evidência que não pode ser apurada (parse do código,
 * derivação de requirements, teste sem resultado) NUNCA vira marcação.
 */
import type {
  TrackChallengeFileSource,
  TrackChallengeSource,
} from '../content/trackTypes';
import type { LoadedLesson } from '../content/trackLoader';
import type { TrackModuleMasteryReport } from '@shared/ipc-contract';
import type { AtomKey } from '../engine/atomKeys';
import { adapterDoDesafio } from '../engine/exec/proofsCore';
import type { LanguageId } from '../engine/lang/registry';
import { extractAtoms } from '../engine/extract';
import { derivarRequirements } from '../engine/quality/requirements';

/* ─── Evidência (o que a tentativa REALMENTE mostrou) ─────────────────────── */

/** O que a aula ensina e o que ela exige — o recorte do conteúdo da aula. */
export interface ModuleMasteryLesson {
  /** slug da aula (o id de `track_progress`). */
  lessonId: string;
  title: string;
  /** `introduces.productive` da aula (as construções que ela ensina a escrever). */
  productiveAtoms: AtomKey[];
  /** slugs das aulas pré-requisitas (regra R5). */
  prerequisites: string[];
  /** já estava concluída ANTES desta análise (não é mérito dela). */
  alreadyDone: boolean;
}

/** Um teste do desafio do módulo e o que ele exige do aluno. */
export interface ModuleMasteryTest {
  /** nome real do teste (o mesmo de `checks[].name`). */
  test: string;
  /** o teste passou nesta tentativa. */
  passed: boolean;
  /** construções que o aluno precisa escrever para passá-lo (cobertura). */
  atoms: AtomKey[];
}

export interface ModuleMasteryInput {
  lessons: readonly ModuleMasteryLesson[];
  tests: readonly ModuleMasteryTest[];
  /** construções usadas no código submetido (união dos arquivos). */
  submittedAtoms: readonly AtomKey[];
  /** a tentativa chegou aos testes (R1). */
  executionOk: boolean;
  /**
   * Vereditos do juiz de domínio (análise profunda) — o CAMINHO POSITIVO para
   * aulas que a cobertura mecânica de teste não alcança (desafio de um teste
   * só, teste que exercita o módulo inteiro). Ausente ⇒ só o caminho
   * determinístico. O juiz nunca marca sozinho: R1/R3 são pisos.
   */
  judge?: readonly MasteryJudgeVerdict[];
}

/** O veredito do juiz de domínio para UMA aula (a análise profunda). */
export interface MasteryJudgeVerdict {
  lessonId: string;
  /** o código submetido mostra o conhecimento da aula, usado de verdade. */
  demonstrada: boolean;
  motivo: string;
  /** nomes de testes REPROVADOS ligados ao conhecimento desta aula. */
  relacionada: string[];
}

export interface ModuleMasteryEvidence {
  testesAprovados: string[];
  testesReprovados: string[];
  atomsDemonstrados: AtomKey[];
}

export interface ModuleMasteryLessonVerdict {
  lessonId: string;
  title: string;
  /**
   * A tentativa DEMONSTROU domínio (R1–R5). Para aula já concluída antes da
   * tentativa o valor é `true` por direito próprio (não precisa de demonstração
   * — a marcação anterior é o fato), e `alreadyDone` distingue os dois casos.
   */
  dominada: boolean;
  /** já estava concluída antes desta análise (o domínio não é mérito dela). */
  alreadyDone: boolean;
  evidencias: ModuleMasteryEvidence;
  /** o porquê, em pt-BR — é o que a tela mostra ao aluno. */
  motivo: string;
}

export interface ModuleMasteryAnalysis {
  /** aulas com evidência forte de domínio — as que o main marca. */
  marcaveis: string[];
  /** aulas a refazer (não demonstradas e ainda não concluídas). */
  refazer: string[];
  lessons: ModuleMasteryLessonVerdict[];
}

const EMPTY_EVIDENCE: ModuleMasteryEvidence = {
  testesAprovados: [],
  testesReprovados: [],
  atomsDemonstrados: [],
};

/** Testes que exercitam as construções da aula (R2). PURA. */
function testsCoveringLesson(
  tests: readonly ModuleMasteryTest[],
  productiveAtoms: readonly AtomKey[],
): ModuleMasteryTest[] {
  const alvo = new Set(productiveAtoms);
  return tests.filter((t) => t.atoms.some((a) => alvo.has(a)));
}

/** Veredito de UMA aula sem olhar pré-requisitos (R1–R4). PURA. */
function baseVerdict(
  input: ModuleMasteryInput,
  lesson: ModuleMasteryLesson,
): { dominada: boolean; evidencias: ModuleMasteryEvidence; motivo: string } {
  if (!input.executionOk) {
    return {
      dominada: false,
      evidencias: EMPTY_EVIDENCE,
      motivo: 'A tentativa não chegou aos testes — sem execução não há o que demonstrar.',
    };
  }
  if (lesson.productiveAtoms.length === 0) {
    return {
      dominada: false,
      evidencias: EMPTY_EVIDENCE,
      motivo: 'A aula não declara as construções que ensina: sem alvo verificável, nunca é dispensada.',
    };
  }
  const covering = testsCoveringLesson(input.tests, lesson.productiveAtoms);
  const judgeV = input.judge?.find((j) => j.lessonId === lesson.lessonId) ?? null;
  if (covering.length === 0 && judgeV === null) {
    return {
      dominada: false,
      evidencias: EMPTY_EVIDENCE,
      motivo:
        'Nenhum teste deste desafio exercita as construções desta aula e não há análise profunda disponível — sem evidência, ela não é dispensada.',
    };
  }
  const aprovados = covering.filter((t) => t.passed).map((t) => t.test);
  const reprovados = covering.filter((t) => !t.passed).map((t) => t.test);
  // Atribuição negativa do juiz: teste REPROVADO ligado ao conhecimento da
  // aula conta como reprovação dela (a evidência negativa desqualifica).
  const falhasDoJuiz = (judgeV?.relacionada ?? []).filter((nome) =>
    input.tests.some((t) => t.test === nome && !t.passed),
  );
  const alvo = new Set(lesson.productiveAtoms);
  const demonstrados = input.submittedAtoms.filter((a) => alvo.has(a));
  const evidencias: ModuleMasteryEvidence = {
    testesAprovados: aprovados,
    testesReprovados: [...new Set([...reprovados, ...falhasDoJuiz])],
    atomsDemonstrados: demonstrados,
  };
  if (reprovados.length > 0 || falhasDoJuiz.length > 0) {
    return {
      dominada: false,
      evidencias,
      motivo: `Reprovou o que a aula cobre (${evidencias.testesReprovados.join(', ')}): evidência negativa desqualifica a marcação.`,
    };
  }
  if (demonstrados.length === 0) {
    return {
      dominada: false,
      evidencias,
      motivo: 'O código submetido não usa as construções que esta aula ensina — passar no teste sem usá-las não é domínio.',
    };
  }
  if (aprovados.length === 0 && judgeV?.demonstrada !== true) {
    return {
      dominada: false,
      evidencias,
      motivo: 'Nenhum teste que exercita esta aula passou, e a análise profunda não atestou o domínio.',
    };
  }
  const motivo =
    aprovados.length > 0
      ? `Demonstrada: ${aprovados.join(', ')} passaram e o código usa ${demonstrados.join(', ')}.`
      : `Demonstrada (análise profunda): ${judgeV?.motivo || 'o código usa corretamente o que a aula ensina'}`;
  return { dominada: true, evidencias, motivo };
}

/** R5 — a marcação só anda com a base garantida. PURA. */
function applyPrerequisiteClosure(
  lessons: readonly ModuleMasteryLesson[],
  verdicts: Map<string, ModuleMasteryLessonVerdict>,
): void {
  const byId = new Map(lessons.map((l) => [l.lessonId, l]));
  // Pré-requisito provado = demonstrado nesta tentativa OU já concluído antes.
  const prova = (id: string): boolean => {
    const v = verdicts.get(id);
    return v !== undefined && (v.dominada || v.alreadyDone);
  };
  // Pré-requisito aponta para trás (ordem autoral), mas a demora é um ponto
  // fixo: em duas passadas o caso encadeado fecha. Pré-requisito FORA da lista
  // (outra unidade do curso) NÃO bloqueia — ver a regra R5 do cabeçalho.
  for (let pass = 0; pass < lessons.length + 1; pass += 1) {
    let mudou = false;
    for (const lesson of lessons) {
      const v = verdicts.get(lesson.lessonId);
      if (v === undefined || !v.dominada || v.alreadyDone) continue;
      const fraco = lesson.prerequisites.find((p) => byId.has(p) && !prova(p));
      if (fraco === undefined) continue;
      v.dominada = false;
      v.motivo = `A pré-requisita "${byId.get(fraco)?.title ?? fraco}" não foi demonstrada: a marcação só acontece com a base garantida.`;
      mudou = true;
    }
    if (!mudou) break;
  }
}

/**
 * A ANÁLISE: regras R1–R5 sobre as evidências já apuradas. PURA — sem LLM,
 * sem IO. A ordem de `lessons` é a ordem pedagógica e é preservada na saída.
 */
export function analyzeModuleMastery(input: ModuleMasteryInput): ModuleMasteryAnalysis {
  const verdicts = new Map<string, ModuleMasteryLessonVerdict>();
  for (const lesson of input.lessons) {
    const base = lesson.alreadyDone
      ? {
          dominada: true,
          evidencias: EMPTY_EVIDENCE,
          motivo: 'Já estava concluída antes desta tentativa — nada a refazer.',
        }
      : baseVerdict(input, lesson);
    verdicts.set(lesson.lessonId, {
      lessonId: lesson.lessonId,
      title: lesson.title,
      dominada: base.dominada,
      alreadyDone: lesson.alreadyDone,
      evidencias: base.evidencias,
      motivo: base.motivo,
    });
  }
  applyPrerequisiteClosure(input.lessons, verdicts);
  const lessons = input.lessons.map((l) => verdicts.get(l.lessonId)).filter(
    (v): v is ModuleMasteryLessonVerdict => v !== undefined,
  );
  return {
    marcaveis: lessons.filter((v) => v.dominada).map((v) => v.lessonId),
    refazer: lessons.filter((v) => !v.dominada && !v.alreadyDone).map((v) => v.lessonId),
    lessons,
  };
}

/* ─── Montagem da evidência (pura, mas com as ferramentas da engine) ──────── */

/** `introduces.productive` de um lesson.meta — leitura defensiva (o loader faz
 *  cast, não pick: o campo é aditivo e trilhas antigas não o declaram). */
export function readIntroducesProductive(meta: unknown): AtomKey[] {
  const introduces = (meta as { introduces?: unknown } | null)?.introduces;
  const productive = (introduces as { productive?: unknown } | null)?.productive;
  if (!Array.isArray(productive)) return [];
  return productive.filter((a): a is AtomKey => typeof a === 'string' && a.trim().length > 0);
}

/** Slugs das aulas pré-requisitas de um lesson.meta (leitura defensiva). */
export function readPrerequisites(meta: unknown): string[] {
  const prereqs = (meta as { prerequisites?: unknown } | null)?.prerequisites;
  if (!Array.isArray(prereqs)) return [];
  return prereqs.filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
}

type ChallengeCodeSource = Pick<
  TrackChallengeSource,
  'starterCode' | 'solutionCode' | 'testsCode' | 'files'
>;

function joinFileCode(files: readonly TrackChallengeFileSource[] | undefined, campo: 'starterCode' | 'solutionCode'): string {
  return (files ?? []).map((f) => f[campo]).join('\n');
}

/** A solução de referência do desafio (união dos arquivos no multi-arquivo). */
export function challengeReferenceCode(challenge: ChallengeCodeSource): string {
  return challenge.files !== undefined && challenge.files.length > 0
    ? joinFileCode(challenge.files, 'solutionCode')
    : challenge.solutionCode ?? '';
}

/** O starter do desafio (união dos arquivos no multi-arquivo). */
export function challengeStarterCode(challenge: ChallengeCodeSource): string {
  return challenge.files !== undefined && challenge.files.length > 0
    ? joinFileCode(challenge.files, 'starterCode')
    : challenge.starterCode ?? '';
}

/**
 * A evidência de TESTE: para cada teste com resultado, o que ele exige do
 * aluno (cobertura determinística — `derivarRequirements`, as construções das
 * funções da solução que o assert chama). Teste SEM resultado não entra (não
 * é nem aprovação nem reprovação — e sem evidência positiva a aula não é
 * marcada). Derivação que não parseia ⇒ [] (fail-closed: nada é marcado).
 */
export function buildTestEvidence(
  challenge: ChallengeCodeSource,
  checks: readonly { name: string; passed: boolean }[],
  language: string,
): ModuleMasteryTest[] {
  if (checks.length === 0) return [];
  let coberturaPorTeste: Map<string, AtomKey[]>;
  try {
    const adapter = adapterDoDesafio(language);
    const derivados = derivarRequirements(
      challenge.testsCode,
      challengeReferenceCode(challenge),
      challengeStarterCode(challenge),
      adapter.id,
    );
    coberturaPorTeste = new Map<string, AtomKey[]>(
      derivados.requirements.map((req) => [
        req.teste,
        derivados.cobertura.find((c) => c.requirementId === req.id)?.atoms ?? [],
      ]),
    );
  } catch {
    return [];
  }
  const out: ModuleMasteryTest[] = [];
  for (const check of checks) {
    const atoms = coberturaPorTeste.get(check.name);
    // teste com resultado mas sem requirement derivado: entra com cobertura
    // VAZIA — nunca cobre aula nenhuma (R4 segura o outro lado).
    out.push({ test: check.name, passed: check.passed === true, atoms: atoms ?? [] });
  }
  return out;
}

/**
 * As construções usadas no código submetido (união dos arquivos). Qualquer
 * arquivo que não parseia ⇒ [] — fail-closed: sem código lido, nenhuma aula é
 * marcada (R3 não pode ser suprida por esperança).
 */
export function submittedAtomKeys(
  submitted: { code?: string; files?: readonly { path: string; code: string }[] },
  language: string,
): AtomKey[] {
  const trechos: string[] = [];
  if (typeof submitted.code === 'string' && submitted.code.trim()) trechos.push(submitted.code);
  for (const f of submitted.files ?? []) {
    if (typeof f?.code === 'string' && f.code.trim()) trechos.push(f.code);
  }
  if (trechos.length === 0) return [];
  let adapterId: LanguageId;
  try {
    adapterId = adapterDoDesafio(language).id;
  } catch {
    return [];
  }
  const atoms = new Set<AtomKey>();
  for (const [i, trecho] of trechos.entries()) {
    const result = extractAtoms(trecho, { fileName: `submissao#${i}`, language: adapterId });
    if (!result.ok) return [];
    for (const key of result.keys) atoms.add(key);
  }
  return [...atoms].sort();
}

/* ─── O juiz de domínio — a análise profunda (LLM opcional, fail-closed) ──── */

/** Ponte de chat injetável (mesma assinatura do `ChatFn` do tutor). */
export type MasteryJudgeChat = (req: {
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  temperature?: number;
  timeoutMs?: number;
}) => Promise<{ content: string }>;

export const MASTERY_JUDGE_ERROR_CODES = {
  UNAVAILABLE: 'MASTERY_JUDGE_UNAVAILABLE',
  INVALID: 'MASTERY_JUDGE_INVALID',
} as const;

/** O que cada aula dá ao juiz — o CONTEÚDO da aula (o pedido é "usando o
 *  conteúdo das aulas"). */
export interface MasteryJudgeLessonInput {
  lessonId: string;
  title: string;
  summary: string;
  concepts: string[];
  productiveAtoms: AtomKey[];
  theoryExcerpt: string;
}

export interface MasteryJudgeInput {
  trackTitle: string;
  moduleTitle: string;
  lessons: readonly MasteryJudgeLessonInput[];
  /** código submetido, todos os arquivos (junto em `path` + código). */
  submittedCode: string;
  checks: readonly { name: string; passed: boolean }[];
  outputExcerpt: string;
}

export interface MasteryJudgeResult {
  ok: boolean;
  verdicts: MasteryJudgeVerdict[];
  error?: { code: string; message: string };
}

/**
 * Teto do juiz. O invoke do submit tem 45s no renderer (ACTION_TIMEOUTS.
 * challengeSubmit) e os testes já consomem alguns: 20s de juiz + 1 retry de
 * parse cabem no orçamento, e estourando, o caminho determinístico segue —
 * a análise nunca atrasa o veredito do aluno além disso.
 */
export const MASTERY_JUDGE_TIMEOUT_MS = 20_000;
const MAX_MASTERY_JUDGE_ATTEMPTS = 2;

/** Prompt do juiz — PURO e testável (a verificação olha o texto, não a tela). */
export function buildMasteryJudgePrompt(input: MasteryJudgeInput): {
  system: string;
  user: string;
} {
  const system = `Você é o AVALIADOR DE DOMÍNIO do desafio de módulo do curso "${input.trackTitle}" do study-method. O aluno submeteu uma tentativa do desafio do módulo "${input.moduleTitle}" (que junta tudo o que o módulo ensinou). Você decide, AULA POR AULA, se o código submetido demonstra o conhecimento que aquela aula ensina.

REGRAS (obrigatórias):
1. REGRA DE OURO: apenas parecer dominar não significa dominar. Declare "demonstrada": true SOMENTE quando o código submetido USA, e usa CORRETAMENTE, as construções que a aula ensina (cada aula lista as suas). Código que não usa a construção, a usa errado, ou é genérico demais para mostrar nada NÃO demonstra.
2. Se um teste REPROVADO exercita o conhecimento de uma aula, liste o nome dele em "relacionada" — essa aula NÃO pode ser declarada demonstrada.
3. Incerteza ⇒ "demonstrada": false. Nunca invente o que o código não mostra.
4. "motivo": curto, em português simples, apontando o que o código mostra (ou o que falta).
5. Responda APENAS JSON válido, sem markdown, neste formato exato:
{"aulas":[{"lessonId":"...","demonstrada":true,"motivo":"...","relacionada":["nome_do_teste"]}]}
Toda aula da entrada aparece UMA vez na saída, na mesma ordem. "relacionada" pode ser [].`;
  const aulas = input.lessons
    .map(
      (l) =>
        `### ${l.lessonId} — ${l.title}\nResumo: ${l.summary}\nConceitos: ${l.concepts.join(', ') || '(nenhum)'}\nConstruções que ensina: ${l.productiveAtoms.join(', ') || '(nenhuma)'}\nTrecho da teoria: ${l.theoryExcerpt}`,
    )
    .join('\n\n');
  const checks = input.checks.map((c) => `${c.passed ? '✔' : '✖'} ${c.name}`).join('\n');
  const user = `AULAS DO MÓDULO (o que cada uma ensina):

${aulas}

CÓDIGO SUBMETIDO (todos os arquivos):

${input.submittedCode}

TESTES DESTA TENTATIVA:
${checks || '(nenhum teste rodou)'}

SAÍDA DA EXECUÇÃO (trecho):
${input.outputExcerpt || '(vazia)'}`;
  return { system, user };
}

/** Parse fail-closed do veredito: forma errada ⇒ null (nunca inventa). */
export function parseMasteryJudgeReply(
  content: string,
  knownIds: ReadonlySet<string>,
): MasteryJudgeVerdict[] | null {
  const limpo = content.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const match = /\{[\s\S]*\}/.exec(limpo);
  if (match === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const aulas = (parsed as { aulas?: unknown } | null)?.aulas;
  if (!Array.isArray(aulas)) return null;
  const out: MasteryJudgeVerdict[] = [];
  const seen = new Set<string>();
  for (const item of aulas) {
    if (typeof item !== 'object' || item === null) return null;
    const r = item as Record<string, unknown>;
    const lessonId = typeof r.lessonId === 'string' ? r.lessonId : null;
    if (lessonId === null || !knownIds.has(lessonId) || seen.has(lessonId)) return null;
    if (typeof r.demonstrada !== 'boolean') return null;
    seen.add(lessonId);
    out.push({
      lessonId,
      demonstrada: r.demonstrada,
      motivo: typeof r.motivo === 'string' ? r.motivo : '',
      relacionada: Array.isArray(r.relacionada)
        ? r.relacionada.filter((s): s is string => typeof s === 'string')
        : [],
    });
  }
  if (seen.size !== knownIds.size) return null;
  return out;
}

/**
 * Roda o juiz (1 retry de parse, como o gate semântico do regenerador). Toda
 * degradação devolve `ok: false` — o chamador segue SEM o juiz e o caminho
 * determinístico decide. O juiz nunca marca sozinho: R1/R3 são pisos.
 */
export async function judgeModuleMastery(
  input: MasteryJudgeInput,
  chat: MasteryJudgeChat,
): Promise<MasteryJudgeResult> {
  const known = new Set(input.lessons.map((l) => l.lessonId));
  const { system, user } = buildMasteryJudgePrompt(input);
  let lastError: { code: string; message: string } = {
    code: MASTERY_JUDGE_ERROR_CODES.UNAVAILABLE,
    message: 'o avaliador de domínio não respondeu',
  };
  for (let attempt = 0; attempt < MAX_MASTERY_JUDGE_ATTEMPTS; attempt += 1) {
    let content: string;
    try {
      const res = await chat({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0,
        timeoutMs: MASTERY_JUDGE_TIMEOUT_MS,
      });
      content = res.content.trim();
      if (!content) throw new Error('empty');
    } catch {
      return {
        ok: false,
        verdicts: [],
        error: {
          code: MASTERY_JUDGE_ERROR_CODES.UNAVAILABLE,
          message: 'O avaliador de domínio não está disponível agora — a análise seguiu só com as evidências de teste e código.',
        },
      };
    }
    const verdicts = parseMasteryJudgeReply(content, known);
    if (verdicts !== null) return { ok: true, verdicts };
    lastError = {
      code: MASTERY_JUDGE_ERROR_CODES.INVALID,
      message: 'o avaliador devolveu um veredito em formato inválido',
    };
  }
  return {
    ok: false,
    verdicts: [],
    error: {
      code: lastError.code,
      message: 'O veredito do avaliador chegou em formato inválido — a análise seguiu só com as evidências de teste e código.',
    },
  };
}

/* ─── O serviço: análise + marcação (o handler só chama) ──────────────────── */

/** O pedaço do repo que esta análise precisa (DI — testável com fake). */
export interface ModuleMasteryProgress {
  listTrackLessonProgress(trackSlug: string): Promise<{ lessonId: string }[]>;
  markTrackLessonDone(trackSlug: string, lessonId: string): Promise<void>;
}

export interface ModuleMasteryAttempt {
  trackSlug: string;
  /** títulos que o juiz usa para se situar (nunca trafegam para o renderer). */
  trackTitle: string;
  moduleTitle: string;
  /** aulas do MÓDULO, na ordem pedagógica (o escopo do desafio). */
  lessons: readonly LoadedLesson[];
  /** o desafio do módulo (testsCode/soluções nunca saem do main). */
  challenge: TrackChallengeSource;
  /** checks da execução já feita no submit (nada é reexecutado aqui). */
  checks: readonly { name: string; passed: boolean }[];
  /** saída da execução (o juiz lê o trecho para localizar o erro). */
  output?: string;
  /** o código que o aluno submeteu nesta tentativa. */
  submitted: { code?: string; files?: readonly { path: string; code: string }[] };
  progress: ModuleMasteryProgress;
  /** juiz de domínio (LLM) — opcional; ausente ⇒ só evidência mecânica. */
  chat?: MasteryJudgeChat;
}

/** O código submetido no formato que o juiz lê (path + código por arquivo). */
function submittedCodeForJudge(submitted: ModuleMasteryAttempt['submitted']): string {
  const trechos: string[] = [];
  if (typeof submitted.code === 'string' && submitted.code.trim()) {
    trechos.push(submitted.code);
  }
  for (const f of submitted.files ?? []) {
    if (typeof f?.code === 'string' && f.code.trim()) trechos.push(`# arquivo: ${f.path}\n${f.code}`);
  }
  return trechos.join('\n\n').slice(0, 8000) || '(vazio)';
}

/** O conteúdo das aulas para o juiz (resumo + teoria truncada). */
function judgeLessonsFor(lessons: readonly LoadedLesson[]): MasteryJudgeLessonInput[] {
  return lessons.map((l) => ({
    lessonId: l.meta.slug,
    title: l.meta.title,
    summary: l.meta.summary,
    concepts: l.meta.concepts ?? [],
    productiveAtoms: readIntroducesProductive(l.meta),
    theoryExcerpt: (l.meta.theory ?? [])
      .map((s) => s.markdown)
      .join('\n')
      .slice(0, 1500),
  }));
}

/**
 * Analisa a tentativa do desafio do módulo e GRAVA as aulas demonstradas
 * (`markTrackLessonDone` — idempotente). Devolve o relatório que a tela
 * mostra. Qualquer erro de apuração degrada para análise SEM evidência (o
 * fail-closed marca nada, nunca demais) — o veredito do submit do aluno nunca
 * vira erro por causa da análise.
 */
export async function analyzeAndMarkModuleMastery(
  attempt: ModuleMasteryAttempt,
): Promise<TrackModuleMasteryReport> {
  const doneRows = await attempt.progress.listTrackLessonProgress(attempt.trackSlug);
  const doneSet = new Set(doneRows.map((r) => r.lessonId));
  const input: ModuleMasteryInput = {
    lessons: attempt.lessons.map((l) => ({
      lessonId: l.meta.slug,
      title: l.meta.title,
      productiveAtoms: readIntroducesProductive(l.meta),
      prerequisites: readPrerequisites(l.meta),
      alreadyDone: doneSet.has(l.meta.slug),
    })),
    tests: buildTestEvidence(attempt.challenge, attempt.checks, attempt.challenge.language),
    submittedAtoms: submittedAtomKeys(attempt.submitted, attempt.challenge.language),
    executionOk: attempt.checks.length > 0,
  };
  // A ANÁLISE PROFUNDA (juiz): o que a cobertura mecânica de teste não alcança
  // — desafio de um teste só, teste que exercita o módulo inteiro. Falha/JSON
  // inválido ⇒ segue sem juiz (o determinístico decide; nada é marcado por
  // esperança).
  if (attempt.chat !== undefined && attempt.lessons.length > 0) {
    const juiz = await judgeModuleMastery(
      {
        trackTitle: attempt.trackTitle,
        moduleTitle: attempt.moduleTitle,
        lessons: judgeLessonsFor(attempt.lessons),
        submittedCode: submittedCodeForJudge(attempt.submitted),
        checks: attempt.checks,
        outputExcerpt: (attempt.output ?? '').slice(0, 2000),
      },
      attempt.chat,
    );
    if (juiz.ok) input.judge = juiz.verdicts;
  }
  const analysis = analyzeModuleMastery(input);
  for (const lessonId of analysis.marcaveis) {
    await attempt.progress.markTrackLessonDone(attempt.trackSlug, lessonId);
  }
  return {
    marcadas: analysis.marcaveis,
    refazer: analysis.refazer,
    lessons: analysis.lessons.map((v) => ({
      lessonId: v.lessonId,
      title: v.title,
      dominada: v.dominada,
      alreadyDone: v.alreadyDone,
      motivo: v.motivo,
    })),
  };
}
