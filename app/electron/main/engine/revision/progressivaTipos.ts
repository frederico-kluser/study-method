/**
 * app/electron/main/engine/revision/progressivaTipos.ts — os TIPOS da revisão
 * progressiva (`progressiva.ts`). Extraídos do módulo original na refatoração
 * do lote L05 (para que `progressivaDesafio.ts` e `progressivaRelatorio.ts`
 * os usem sem ciclo de import) sem NENHUMA mudança de comportamento — a fachada
 * `progressiva.ts` re-exporta tudo isto pelos MESMOS nomes.
 */

import type { LoadedTrack } from '../../content/trackLoader';
import type { AtomKey } from '../atomKeys';
import type { BudgetSource, TrackBudget } from '../budget';
import type { LanguageId } from '../lang/registry';
import type { MinimalVerdict } from '../quality/minimal';
import type { ValidacaoRequirements } from '../quality/requirements';
import type { ProverDeDesafio } from '../phases/f9Verifier';

// ---------------------------------------------------------------------------
// Contrato público
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Contrato público
// ---------------------------------------------------------------------------

/** Decisão tomada para uma aula — registrada na memória (progressividade). */
export type DecisaoDeRevisao = 'ok' | 'split' | 'nao-revisavel';

export interface DecisaoRegistrada {
  aula: string;
  decisao: DecisaoDeRevisao;
  motivo: string;
}

/**
 * A MEMÓRIA da revisão: o acumulador que atravessa as aulas na ordem
 * (1ª → última). O feedback da aula N vira contexto da N+1.
 */
export interface MemoriaDeRevisao {
  /** ref `<moduleSlug>/<lessonSlug>` da aula revisada imediatamente antes. */
  aulaAnterior: string | null;
  /** átomos já sinalizados como LACUNA em qualquer aula anterior (sorted, únicos). */
  lacunasVistas: AtomKey[];
  /** histórico de decisões por aula, na ordem da varredura. */
  decisoes: DecisaoRegistrada[];
}

/**
 * Veredito de UM desafio: o veredito do sintetizador mínimo (`MinimalVerdict`)
 * ou `IGNORADO` (desafio multi-arquivo — fora do escopo desta onda; NÃO torna
 * a aula não-revisável).
 */
export type VereditoDeDesafio = MinimalVerdict | { ok: false; reason: 'IGNORADO'; detail: string };

/** Feedback de UM desafio dentro de uma aula. */
export interface FeedbackDeDesafio {
  slug: string;
  /** `<moduleSlug>/<lessonSlug>/<challengeSlug>`. */
  ref: string;
  veredito: VereditoDeDesafio;
  /** o código mínimo que passou no teste (presente quando veredito ok). */
  minimalCode?: string;
  /** `atoms(minimal)` — o que o teste REALMENTE cobra. */
  atomsCobrados: AtomKey[];
  /** LACUNA: atoms(minimal) ∖ (productive ∪ receptive) da aula. */
  foraDoOrcamento: AtomKey[];
  /** EXCESSO: introduces.productive não usado pelo mínimo. */
  excesso: AtomKey[];
  /**
   * SINAL SECUNDÁRIO: validação da bijeção requirements declarados ×
   * test('…'). Gaps aqui = feedback de AJUSTE, nunca motivo de SPLIT. null
   * quando o desafio não declara o campo `requirements`.
   */
  requirements: ValidacaoRequirements | null;
}

/** Feedback de UMA aula — a unidade que decide o SPLIT. */
export interface FeedbackDeAula {
  /** `<moduleSlug>/<lessonSlug>`. */
  aula: string;
  titulo: string;
  /** posição na ordem pedagógica (1-based). */
  indice: number;
  /** a memória VIGENTE na revisão desta aula (o feedback da aula anterior). */
  memoria: MemoriaDeRevisao;
  desafios: FeedbackDeDesafio[];
  /** true ⇔ alguma LACUNA (atoms do mínimo fora do orçamento) — candidato a SPLIT. */
  precisaQuebrar: boolean;
  /** motivo em pt-BR — sempre presente, sempre determinístico. */
  motivo: string;
  /**
   * true ⇔ algum veredito não-ok (SEM_SOLUCAO_ACESSIVEL/PARSE_FALHOU/
   * PROVER_FALHOU): aula NÃO-revisável, documentada, NUNCA loopa (fail-closed).
   */
  naoRevisavel?: boolean;
  naoRevisavelMotivo?: string;
}

/** Um SPLIT registrado como PENDÊNCIA — o que foi gerado NUNCA se perde. */
export interface SplitPendente {
  aula: string;
  desafio: string;
  /** a SEMENTE da aula nova: o código mínimo que passou no teste. */
  minimalCode: string;
  atoms: AtomKey[];
  foraDoOrcamento: AtomKey[];
}

export interface PlacarDeRevisao {
  aulas: number;
  /** revisáveis sem lacuna (precisaQuebrar=false). */
  cobertas: number;
  /** com lacuna → candidatas a SPLIT. */
  comLacuna: number;
  /** veredito não-ok → fail-closed, não-revisáveis. */
  naoRevisaveis: number;
  /** com ao menos um excesso (informacional — decisão de ajuste). */
  comExcesso: number;
  splitsPendentes: number;
}

export interface RelatorioDeRevisao {
  trackSlug: string;
  /** 'declared' (introduces do lesson.json) | 'inferred' | 'injetado' (tests). */
  orcamentoFonte: BudgetSource | 'injetado';
  /**
   * A LINGUAGEM com que a trilha foi revisada — DECLARADA no relatório porque
   * ela é quem escolhe o sintetizador mínimo e a derivação de requirements. Um
   * relatório sem esse campo não dizia se o veredito era sobre o conteúdo ou
   * sobre o parser errado.
   */
  linguagem: LanguageId;
  aulas: FeedbackDeAula[];
  /** true ⇔ hash do relatório estável entre iterações. */
  convergencia: boolean;
  /** nº de iterações da varredura (2 = uma repetição estável). */
  iteracoes: number;
  placar: PlacarDeRevisao;
  /** a memória acumulada DEPOIS da última aula (o que foi aprendido). */
  memoriaFinal: MemoriaDeRevisao;
  /** todos os SPLITs registrados (minimalCode pronto — seed da aula nova). */
  splitsPendentes: SplitPendente[];
}

/** O orçamento de comparação de uma aula (mesma forma do `coverage` do CLI). */
export interface OrcamentoDeAula {
  productive: ReadonlySet<AtomKey>;
  receptive: ReadonlySet<AtomKey>;
  introducesProductive: AtomKey[];
  ref: string | null;
}

export interface RevisarCursoOptions {
  track: LoadedTrack;
  prover: ProverDeDesafio;
  /**
   * Injeta o orçamento por aula. Ausente ⇒ default: `deriveTrackBudget(track,
   * { mode: 'declared' })` — a MESMA fonte do audit em modo declared
   * (introduces do lesson.json).
   */
  orcamentoPorAula?: (lessonRef: string) => OrcamentoDeAula;
  /**
   * Rótulo da fonte do orçamento no relatório (o chamador que injeta o
   * orçamento sabe de onde ele veio). Default: 'injetado'.
   */
  orcamentoFonte?: BudgetSource | 'injetado';
  /** nº máximo de AULAS a revisar (amostra rápida). Default: todas. */
  limite?: number;
  /**
   * A LINGUAGEM da trilha — quem decide qual sintetizador mínimo e qual
   * derivação de requirements rodam (`quality/minimalPorLinguagem.ts`,
   * `quality/requirements.ts`).
   *
   * Ausente ⇒ `trackAdapterId(track)`, isto é, o `programmingLanguage` da
   * própria trilha — a MESMA resolução que `deriveTrackBudget` faz para o
   * `budget.adapterId`. É opção só para o chamador que já resolveu (o CLI) não
   * ter de resolver duas vezes; NUNCA para escolher uma linguagem diferente da
   * que a trilha declara.
   */
  language?: LanguageId;
}

export interface RodarRevisaoOptions {
  /** a varredura do curso inteiro (uma iteração). */
  revisarCurso: () => Promise<RelatorioDeRevisao>;
  /** válvula anti-loop. Default 3. */
  maxIteracoes?: number;
}

export interface ResultadoGravacao {
  dir: string;
  arquivos: string[];
}


