/**
 * src/lib/lessonProgress.ts — parser puro dos eventos de progresso de aula.
 *
 * O canal `study:lesson-progress` entrega payloads de forma `unknown` no
 * api-schema. Este módulo normaliza qualquer payload em um estado de fase
 * tipado para a UI, tolerando formas variadas:
 *   { phase: 'pesquisando'|'autorando'|..., progress: 0..1, message?, status? }
 *   { phase: 'research'|'authoring'|'materializing'|'validating'|'done'|'error',
 *     message?, fraction? }  ← vocabulário real do main (lessonOrchestrator)
 *   { status: 'generating', stage: 'research'|'writing'|..., percent: 0..100 }
 * `phase` aceita pt-BR E inglês (mapeado via STAGE_TO_PHASE).
 * Se nada for reconhecível, devolve 'gerando' com progresso 0.
 */

export type LessonPhaseKey =
  | 'pesquisando'
  | 'autorando'
  | 'materializando'
  | 'validando'
  | 'concluindo'
  | 'gerando';

export interface LessonPhaseState {
  phase: LessonPhaseKey;
  /** Fração 0..1 do progresso (0 quando desconhecida). */
  fraction: number;
  /** Mensagem descritiva opcional (pt-BR ou vinda do main). */
  message: string;
  /** true quando o payload indica fim (done/success/completo). */
  done: boolean;
  /** true quando o payload sinaliza erro (phase:'error' / error:true). A fase
   *  não é tocada: a decisão de preservar a fase anterior é da view. */
  failed: boolean;
}

const PHASE_MESSAGES: Record<LessonPhaseKey, string> = {
  pesquisando: 'Pesquisando fontes sobre o assunto…',
  autorando: 'Redigindo a aula…',
  materializando: 'Materializando exemplos e analogias…',
  validando: 'Validando as conclusões…',
  concluindo: 'Concluindo e revisando…',
  gerando: 'Gerando a aula…',
};

/** Fallback pt-BR quando o evento de erro não traz message (parser é puro). */
const ERROR_MESSAGE = 'Falha na geração da aula.';

const STAGE_TO_PHASE: Record<string, LessonPhaseKey> = {
  research: 'pesquisando',
  searching: 'pesquisando',
  writing: 'autorando',
  authoring: 'autorando',
  'materializing': 'materializando',
  validation: 'validando',
  validating: 'validando',
  concluding: 'concluindo',
  done: 'concluindo',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeFraction(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  // Aceita 0..1 ou 0..100 (divide por 100).
  const v = value > 1 ? value / 100 : value;
  return Math.max(0, Math.min(1, v));
}

/**
 * Converte um payload bruto de `lesson-progress` em um `LessonPhaseState`.
 */
export function parseLessonProgressEvent(raw: unknown): LessonPhaseState {
  const base: LessonPhaseState = {
    phase: 'gerando',
    fraction: 0,
    message: PHASE_MESSAGES.gerando,
    done: false,
    failed: false,
  };
  if (!isRecord(raw)) return base;

  // done / success / complete
  if (raw.done === true || raw.success === true || raw.complete === true) {
    base.done = true;
    base.phase = 'concluindo';
    base.message = PHASE_MESSAGES.concluindo;
  }

  // erro explícito: phase 'error' (main) ou flag error — sinaliza `failed`
  // sem tocar na fase (a view preserva a última fase real; o fallback do
  // parser para a fase permanece 'gerando' quando nada é reconhecido).
  if (
    (typeof raw.phase === 'string' && raw.phase.toLowerCase() === 'error') ||
    raw.error === true
  ) {
    base.failed = true;
    base.done = false;
    base.message =
      typeof raw.message === 'string' && raw.message.trim()
        ? raw.message.trim()
        : ERROR_MESSAGE;
  }

  // stage em ingles → fase
  if (typeof raw.stage === 'string') {
    const mapped = STAGE_TO_PHASE[raw.stage.toLowerCase()];
    if (mapped) {
      base.phase = mapped;
      base.message = PHASE_MESSAGES[mapped];
    }
  }

  // phase nomeada direto (aceita pt-BR, 'done' e o vocabulário em inglês do main)
  if (typeof raw.phase === 'string') {
    const asKey = raw.phase.toLowerCase();
    if (PHASE_MESSAGES[asKey as LessonPhaseKey]) {
      base.phase = asKey as LessonPhaseKey;
      base.message = PHASE_MESSAGES[base.phase];
    } else if (asKey === 'done') {
      base.phase = 'concluindo';
      base.message = PHASE_MESSAGES.concluindo;
      base.done = true;
    } else {
      // fallback inglês: 'research'|'authoring'|'materializing'|'validating'…
      // (o que o main REALMENTE emite) → fase pt-BR interna
      const mapped = STAGE_TO_PHASE[asKey];
      if (mapped) {
        base.phase = mapped;
        base.message = PHASE_MESSAGES[mapped];
      }
    }
  }

  // progresso: progress (0..1) ou percent (0..100)
  if (typeof raw.progress === 'number') {
    base.fraction = normalizeFraction(raw.progress);
  } else if (typeof raw.percent === 'number') {
    base.fraction = normalizeFraction(raw.percent);
  } else if (typeof raw.fraction === 'number') {
    // `fraction` é o campo que o main (lessonOrchestrator) REALMENTE emite
    // (0..1, ex.: {phase:'research', fraction: 0.1}).
    base.fraction = normalizeFraction(raw.fraction);
  }

  // mensagem custom
  if (typeof raw.message === 'string' && raw.message.trim()) {
    base.message = raw.message.trim();
  }

  return base;
}