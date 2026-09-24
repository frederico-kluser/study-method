/**
 * app/electron/main/engine/quality/judgeCalibrationTipos.ts — os TIPOS, o
 * LIMIAR e os erros estruturados da calibração do revisor (P-20).
 *
 * O contrato e a prosa normativa vivem na fachada `judgeCalibration.ts`; este
 * módulo carrega o vocabulário compartilhado entre a detecção
 * (`judgeCalibrationDeteccao.ts`) e a medição/decisão
 * (`judgeCalibrationMedicao.ts`). Refatoração L04: arquivo ≤500 linhas e toda
 * função com CC≤8, sem mudança de comportamento observável.
 */

import { type RevisaoComSeveridade } from '../prompts/reviewer';
import {
  type ClasseDeDefeito,
  type DesafioParaMutacao,
  type Mutante,
} from './mutants';

// ---------------------------------------------------------------------------
// O limiar — (1−τ)/2, com τ = 0,10 → 0,45 (§6.6)
// ---------------------------------------------------------------------------

/** τ (a tolerância de falso-passe do §6.6). */
export const TAU_DEFAULT = 0.10;

/**
 * O limiar que governa o laço: (1−τ)/2 — 0,45 com τ = 0,10. Um revisor com
 * taxa de falso-passe ≥ este valor nunca remove nada (§6.6).
 */
export function limiarDeFalsoPasse(tau: number = TAU_DEFAULT): number {
  return (1 - tau) / 2;
}

// ---------------------------------------------------------------------------
// A régua: o que conta como "o revisor apontou o defeito" (por classe)
// ---------------------------------------------------------------------------

/**
 * O CONJUNTO DETECTOR de cada classe: as categorias de apontamento cuja
 * PRESENÇA (abrindo rodada) conta como detecção do defeito daquela classe.
 * Categorias de sugestão (`estilo`/`tom`/`prosa`) não aparecem aqui POR
 * CONSTRUÇÃO — sugestão nunca abre rodada (§6.5), apontar o defeito como
 * sugestão é falso-passe. Esta tabela é a chave de prova da classe (d):
 * um defeito de "não exercita a aula" detectado só como `gabarito_nao_passa`
 * NÃO é detecção — o revisor pegou a execução, não o defeito curricular.
 */
export const CATEGORIAS_QUE_DETECTAM: Readonly<Record<ClasseDeDefeito, readonly string[]>> = {
  fora_do_orcamento: ['construcao_nao_ensinada', 'api_nao_ensinada'],
  teste_divergente_do_enunciado: ['teste_invalido', 'ambiguidade_de_enunciado'],
  imprime_em_vez_de_retornar: ['gabarito_nao_passa', 'teste_invalido', 'ambiguidade_de_enunciado'],
  nao_exercita_a_aula: ['teoria_desalinhada_do_desafio', 'cobertura_faltante'],
};

/**
 * A localização do marcador do mutante no artefato MUTADO — a régua do
 * confronto. O `span` (quando resolvido) está em caracteres do CAMPO de
 * código onde o marcador foi encontrado (`solutionCode`/`testsCode`/…); a
 * RESOLUÇÃO é feita por `medirTaxaDeFalsoPasse` sobre o artefato mutado, e a
 * detecção aceita OU a interseção por span OU a menção do marcador no trecho
 * citado do apontamento (a menção é independente de coordenadas — é o
 * caminho robusto contra revisões reais do P-12, cujos spans referem o texto
 * renderizado).
 */
export interface MarcadorLocalizado {
  /** o marcador do mutante (`Mutante.marcador`). */
  texto: string;
  /** span `[inicio, fim]` em caracteres do campo onde o marcador foi achado. */
  span: readonly [number, number] | null;
}

// ---------------------------------------------------------------------------
// A medição
// ---------------------------------------------------------------------------

/** Uma taxa por classe — a unidade da remoção por categoria. */
export interface MedicaoPorClasse {
  classe: ClasseDeDefeito;
  /** total de mutantes da classe julgados. */
  totalMutantes: number;
  /** mutantes cujo defeito o revisor apontou ABRINDO rodada. */
  detectados: number;
  /** mutantes que passaram sem detecção — o falso-passe da classe. */
  falsosPasses: number;
  /** falsosPasses / totalMutantes (0 quando a classe não tem mutante). */
  taxaDeFalsoPasse: number;
  /** 1 − taxaDeFalsoPasse — a razão de acerto da remoção por categoria. */
  razaoDeAcerto: number;
}

/**
 * A medição completa de uma rodada de calibração. `taxaGeral` é a ÚNICA
 * métrica que decide (§6.6): falsos-passantes / total de mutantes.
 */
export interface MedicaoDeFalsoPasse {
  /** total de artefatos julgados nesta rodada (válido + mutantes). */
  amostras: number;
  /** total de mutantes — o denominador da taxa geral. */
  frenteAMutantes: number;
  /** A taxa que governa o laço: falsos-passantes / frenteAMutantes. */
  taxaGeral: number;
  /** a taxa por classe de defeito. */
  porClasse: readonly MedicaoPorClasse[];
  /** achados que abrem rodada no artefato VÁLIDO (diagnóstico — NUNCA decisão). */
  achadosNoValido: number;
}

/** O revisor INJETÁVEL: o pipeline P-12 completo (LLM por dentro), por artefato. */
export interface DepsDeCalibracao {
  /**
   * Julga um artefato (válido ou mutado) e devolve a revisão do pipeline P-12
   * já com severidade anexada por tabela (`anexarSeveridadePorTabela`). O
   * P-22 injeta aqui o pipeline real (normalizar → prompt → parse → tabela)
   * ou um substituto em teste. Um lançamento desta função = revisor
   * INDISPONÍVEL: a medição falha fechada.
   */
  revisor: (artefato: DesafioParaMutacao) => Promise<RevisaoComSeveridade>;
}

/** O que calibramos: o artefato válido + os mutantes de `gerarMutantes`. */
export interface ArtefatosDeCalibracao {
  /** o desafio VÁLIDO (fixture em memória) — também é julgado (sanity). */
  valido: DesafioParaMutacao;
  /** os mutantes gerados — a régua do laço. */
  mutantes: readonly Mutante[];
}

/** O motivo estruturado de um erro de calibração. */
export type TipoDeErroDeCalibracao = 'REVISOR_INDISPONIVEL' | 'SEM_MUTANTES';

/**
 * O ERRO ESTRUTURADO da calibração (§9.3 — a engine falha fechada):
 * `REVISOR_INDISPONIVEL` quando o revisor lançou durante a medição e
 * `SEM_MUTANTES` quando a calibração foi chamada sem régua. Nunca um
 * veredito por omissão.
 */
export class ErroDeCalibracao extends Error {
  readonly tipo: TipoDeErroDeCalibracao;
  readonly causa?: unknown;

  constructor(tipo: TipoDeErroDeCalibracao, mensagem: string, causa?: unknown) {
    super(mensagem);
    this.name = 'ErroDeCalibracao';
    this.tipo = tipo;
    this.causa = causa;
  }
}

// ---------------------------------------------------------------------------
// A decisão — o desligamento do laço (§6.6)
// ---------------------------------------------------------------------------

/** O único motivo estruturado de desligamento: o limiar de falso-passe. */
export type MotivoDeDesligamento = 'LIMIAR_FALSO_PASSE';

/** A decisão da calibração — o que o laço F11 (P-22) consulta. */
export interface DecisaoDeCalibracao {
  /** `false` DESLIGA o laço — pare e conserte o juiz (§6.6). */
  aprovado: boolean;
  /** presente quando NÃO aprovado — o motivo estruturado do desligamento. */
  motivo?: MotivoDeDesligamento;
  /** mensagem EXPLÍCITA de desligamento (vai para o log do laço). */
  mensagem: string;
  /** o limiar aplicado ((1−τ)/2; 0,45 com τ=0,10). */
  limiar: number;
  /** a taxa medida contra os mutantes — a ÚNICA métrica que decide (§6.6). */
  taxaGeral: number;
}

// ---------------------------------------------------------------------------
// DESLIGAMENTO AUTOMÁTICO POR CATEGORIA (estado de gerações INJETADO)
// ---------------------------------------------------------------------------

/** Uma geração de calibração no histórico (a ordem é por `geracao`). */
export interface GeracaoDeMedicao {
  geracao: number;
  medicao: MedicaoDeFalsoPasse;
}

/** Parâmetros da remoção por categoria — o limiar de ACERTO e as gerações. */
export interface ParametrosDeRemocaoPorCategoria {
  /** razão de acerto (1 − taxa de falso-passe da classe) ABAIXO da qual a classe conta como falha. */
  limiarDeAcerto: number;
  /** gerações CONSECUTIVAS com acerto abaixo do limiar para remover a classe. */
  geracoesConsecutivas: number;
}

/**
 * Parâmetro PADRÃO: `limiarDeAcerto = 1 − limiarDeFalsoPasse()` (0,55) —
 * o ESPELHO do limiar do §6.6: uma classe com falso-passe ≥ 0,45 tem acerto
 * ≤ 0,55 e conta como falha. `geracoesConsecutivas = 2` — a regra da
 * tarefa: DUAS gerações.
 */
export const PARAMETROS_PADRAO_DE_REMOCAO: ParametrosDeRemocaoPorCategoria = {
  limiarDeAcerto: 1 - limiarDeFalsoPasse(),
  geracoesConsecutivas: 2,
};

/** Uma classe marcada para REMOÇÃO do revisor. */
export interface CategoriaParaRemover {
  classe: ClasseDeDefeito;
  /** quantas gerações CONSECUTIVAS a classe ficou com acerto abaixo do limiar. */
  geracoesConsecutivasAbaixo: number;
  /** a razão de acerto na ÚLTIMA geração considerada. */
  ultimaRazaoDeAcerto: number;
}
