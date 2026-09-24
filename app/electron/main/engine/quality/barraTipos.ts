/**
 * app/electron/main/engine/quality/barraTipos.ts — os LIMIARES da barra
 * pedagógica (A17–A24) e o contrato de achados/métricas/relatório.
 *
 * A prosa normativa (a motivação de cada regra e a medição que justifica cada
 * teto) vive na fachada `barra.ts`. Refatoração L04: arquivo ≤500 linhas e
 * toda função com CC≤8, sem mudança de comportamento observável.
 */

import type { AtomKey } from '../atomKeys';
import type { BudgetSource } from '../budget';
import type { LanguageId } from '../lang/registry';

// ---------------------------------------------------------------------------
// Os tetos — um lugar só, e cada número com a medição que o justifica
// ---------------------------------------------------------------------------

/**
 * Os limiares da barra. Medidos contra o `python-iniciante` (112 aulas, o
 * curso que o dono considera bom) e contra o `rust-iniciante` (101 aulas, o
 * curso que motivou esta bateria) em 2026-09-22:
 *
 *   |produtivas novas| por aula:     python 1/1/3 (min/mediana/max) · rust 1/1/6
 *   |novas| (prod ∪ recept) máximo:  python 3                      · rust 11
 *   seções de teoria:                python 2/3/5                  · rust 1/3/3
 *   chave declarada sem demo:        python 0                      · rust 3
 *
 * Os tetos são o que o curso de referência cumpre com folga e o curso ruim
 * viola: 2 produtivas (o A7/I2 do contrato), 4 novas no total, 2 seções.
 */
export const TETO_PRODUTIVAS_NOVAS = 2;
export const TETO_PRODUTIVAS_NOVAS_AULA_1 = 1;
export const TETO_NOVAS_TOTAL = 4;
export const MINIMO_SECOES_DE_TEORIA = 2;
export const MINIMO_FORMAS_POR_CHAVE = 2;
/**
 * A24 — a folga de comprimento que separa "coincidência" de VAZAMENTO no quiz.
 *
 * MEDIDO em 2026-09-22 nos três cursos, contando as afirmações em que a opção
 * CORRETA é a mais longa das quatro, sozinha:
 *
 *   python-iniciante  58/320 = 18%   ← ABAIXO do acaso
 *   c-iniciante       36/138 = 26%   ← no acaso
 *   rust-iniciante   173/235 = 73%   ← TRÊS VEZES o acaso
 *
 * O acaso é 25%: com quatro opções de comprimentos quaisquer, a correta é a mais
 * longa em uma de cada quatro. Um quiz em que ela é a mais longa em 73% das
 * afirmações é acertável SEM LER — "clique na maior" leva a estrela, e o gate de
 * maestria da aula vira decoração. (O produto já de-vaza a POSIÇÃO: o
 * `quizOptionOrder.ts` permuta a ordem de exibição, e é por isso que
 * `answerIndex: 0` no corpus inteiro não é defeito. Ninguém de-vaza o
 * COMPRIMENTO.)
 *
 * O teto de 8 caracteres é o que separa a aula que vaza por sistema da que vaza
 * por coincidência: com a regra "TODA afirmação da aula vaza, e por mais de 8
 * caracteres", o curso de referência tem 1 aula em 112 e o rust tem 27 em 103.
 */
export const FOLGA_DE_COMPRIMENTO_DO_QUIZ = 8;

/** As regras desta bateria, na ordem em que reprovam. */
export const REGRAS_DA_BARRA = ['A17', 'A18', 'A19', 'A20', 'A21', 'A22', 'A23', 'A24'] as const;
export type RegraDaBarra = (typeof REGRAS_DA_BARRA)[number];

export interface AchadoDaBarra {
  /** a regra violada — id estável, do catálogo acima. */
  regra: RegraDaBarra;
  /** `<moduleSlug>/<lessonSlug>`. */
  ref: string;
  /** a chave de átomo envolvida, quando a regra é sobre uma chave. */
  chave: AtomKey | null;
  /** o que o disco mostra (a evidência vem ANTES do veredito — §6.3). */
  evidencia: string;
  /** a frase em pt-BR que o autor lê. */
  mensagem: string;
  /** a ação prescrita do catálogo fechado (§6.7). */
  acao: 'SPLIT_LESSON' | 'REWRITE_IN_BUDGET' | 'ADD_TEST' | 'INSERT_INTERMEDIATE' | 'DECLARE_INTEGRATIVE';
  severidade: 'erro' | 'aviso';
}

export interface MetricaDaBarra {
  ref: string;
  index: number;
  /** produtivas novas (fora da entrada), antes do colapso. */
  produtivasNovas: number;
  /** produtivas novas depois do colapso pela regra do par (A23). */
  produtivasColapsadas: number;
  /** novas totais (produtivas ∪ receptivas, fora da entrada) colapsadas. */
  novasTotais: number;
  secoesDeTeoria: number;
  blocosDeCodigo: number;
  /** chaves novas sem NENHUMA demonstração nos blocos desta aula. */
  chavesSemDemonstracao: number;
  /** chaves produtivas novas com menos de 2 formas distintas. */
  chavesComUmaFormaSo: number;
  desafios: number;
  /** afirmações do quiz com exatamente 4 opções (as que A24 mede). */
  afirmacoesMedidas: number;
  /** afirmações em que a opção correta é a mais longa, sozinha (A24, aviso). */
  afirmacoesQueVazamPorTamanho: number;
  /**
   * OS GRUPOS DA REGRA DO PAR, medidos no disco: componentes conexas da relação
   * "ocorre na MESMA LINHA de um bloco de código desta aula" sobre as chaves
   * novas. Cada grupo é UMA construção do ponto de vista do aluno — é o que a
   * prosa do contrato chama de "a chave que distingue + as derivadas que a mesma
   * construção produz inevitavelmente".
   *
   * Existe para o PLANEJADOR DA QUEBRA (`modes/convergencia.ts`): quebrar uma
   * aula é distribuir estes grupos por N aulas, e um grupo NUNCA se parte — se
   * `printf("oi")` emite três chaves na mesma linha, não existe aula que ensine
   * duas delas e não a terceira.
   *
   * Chave nova SEM demonstração nenhuma (A19) fica num grupo só dela: ela não
   * tem linha para co-ocorrer, e o planejador precisa vê-la.
   */
  grupos: AtomKey[][];
}

export interface RelatorioDaBarra {
  trackSlug: string;
  adapterId: LanguageId;
  budgetSource: BudgetSource;
  achados: AchadoDaBarra[];
  metricas: MetricaDaBarra[];
  totais: {
    aulas: number;
    erros: number;
    avisos: number;
    aulasComErro: number;
    /** blocos de teoria que não parseiam — não medido nunca conta como verde. */
    blocosQueNaoParseiam: number;
  };
}

export interface OpcoesDaBarra {
  /** força o modo do orçamento (default: automático, como o `audit`). */
  modo?: BudgetSource;
  /**
   * O RECORTE: as `ref`s (`<modulo>/<aula>`) a MEDIR. Ausente = a trilha toda.
   *
   * Existe por CUSTO, e o custo foi medido (2026-09-22, autoria do
   * `c-iniciante`): a demonstração de uma aula sai de `extractAllOccurrences`
   * sobre cada bloco de teoria, e em C cada chamada spawna `clang` + `python3`.
   * Medir as 115 aulas para relatar UMA (o que o `--aula` do CLI fazia,
   * filtrando só na impressão) custava minutos por verificação, e o autor roda
   * essa verificação depois de cada aula que escreve.
   *
   * O recorte é SEGURO porque a pergunta de cada regra desta bateria é LOCAL à
   * aula: A19/A22/A23 olham os blocos DELA, A17/A18/A21 contam o `introduces`
   * DELA contra a entrada — e a ENTRADA continua vindo do orçamento cumulativo
   * da trilha INTEIRA (`deriveTrackBudget`, que lê JSON e não spawna parser).
   * O que o recorte muda é só quantas aulas têm a demonstração extraída; o
   * orçamento, que é o que depende das outras aulas, nunca é recortado.
   *
   * O PLACAR de um relatório recortado fala só do recorte — quem publica roda
   * sem ele.
   */
  apenas?: readonly string[];
}
