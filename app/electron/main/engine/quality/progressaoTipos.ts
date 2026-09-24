/**
 * app/electron/main/engine/quality/progressaoTipos.ts — o contrato público da
 * bateria A13–A16: entrada achatada de aula/desafio, opções e violações.
 *
 * A prosa normativa vive na fachada `progressao.ts`. Refatoração L04: arquivo
 * ≤500 linhas e toda função com CC≤8, sem mudança de comportamento observável.
 */

import type { TrackTheorySection } from '../../content/trackTypes';
import type { AtomKey } from '../atomKeys';
import type { BudgetSource } from '../budget';
import type { LanguageId } from '../lang/registry';

/** As sete regras da bateria A13–A16. */
export type ProgressaoRule = 'A13' | 'A13d' | 'A14a' | 'A14b' | 'A15a' | 'A15b' | 'A16';

export type Severidade = 'erro' | 'aviso';

/** A superfície onde a violação foi encontrada (espelha o `Surface` do audit). */
export type CampoProgressao = 'starterCode' | 'solutionCode' | 'testsCode' | 'lesson';

/** Um arquivo de desafio achatado (multi-arquivo vira N entradas). */
export interface ProgressaoArquivoInput {
  path: string;
  starter: string;
  solution: string;
}

export interface ProgressaoDesafioInput {
  slug: string;
  /** caminho do challenge.json — é a chave do `desafiosComViolacao` no audit. */
  desafioFile: string;
  files: ProgressaoArquivoInput[];
  tests: string;
}

export interface ProgressaoLessonInput {
  ref: string;
  /** `modules/<m>/lessons/<l>` — prefixo dos caminhos de arquivo (como no audit). */
  baseDir: string;
  theory: readonly TrackTheorySection[];
  challenges: ProgressaoDesafioInput[];
  /** `introduces` declarado da aula (modo declared). */
  declared?: { productive?: AtomKey[]; receptive?: AtomKey[] } | null;
}

export interface ProgressaoOptions {
  /**
   * A14a: teto de construções verdadeiramente novas por aula (spec §4.1,
   * default 4 — o parâmetro do §3.6 "interagindo").
   */
  tetoNovos?: number;
  /**
   * A14a (declared): teto de `introduces.productive` (A7/I2, default 2).
   */
  tetoIntroducesProductive?: number;
  /** A15b: quantos átomos anteriores a solução precisa reutilizar (default 1). */
  minimoReuso?: number;
  /** A15b estrito: `Cum(i)` vira `Demo(i−1)` (aula ANTERIOR IMEDIATA). */
  predecessorImediato?: boolean;
  /** Modo do orçamento — espelha o do audit (affeta A13d/A14a-declared). */
  mode?: BudgetSource;
  /**
   * ADITIVO (onda 5): o ADAPTADOR DA TRILHA (`TrackBudget.adapterId`). É ele
   * que decide qual bloco de teoria conta como DEMONSTRAÇÃO e com que parser
   * cada superfície é lida. Default: o adaptador default.
   */
  adapterId?: LanguageId;
}

export interface ProgressaoViolation {
  regra: ProgressaoRule;
  arquivo: string;
  ref: string;
  campo: CampoProgressao;
  linha: number;
  coluna: number;
  construcao: AtomKey | null;
  eixo: string | null;
  faixa: 'receptive' | 'productive' | null;
  trechoOfensor: string;
  primeiraAulaQueEnsina: string | null;
  mensagem: string;
  severidade: Severidade;
  /** presente quando a violação pertence a UM desafio (A13/A14b/A15a/A16). */
  desafioFile?: string;
}

export interface ProgressaoResult {
  violations: ProgressaoViolation[];
  /** `Novo(i)` de cada aula — exposto para o audit anexar ao placar. */
  novosPorAula: Map<string, number>;
}
