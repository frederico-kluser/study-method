/**
 * app/electron/main/engine/quality/judgeCalibration.ts — a MEDIÇÃO da taxa de
 * falso-passe do revisor contra os MUTANTES e a DECISÃO que governa o laço
 * (pacote P-20, "Mutantes e taxa de falso-passe do revisor", onda 2B do plano
 * de execução v1).
 *
 * Contrato normativo: `docs/16-engine-de-trilha.md` §6.6 — o limiar que
 * governa o laço: um revisor que marca falha como passe a uma taxa
 * ≥ (1−τ)/2 — com τ=0,10, **0,45** — nunca remove nada, com qualquer número
 * de rodadas ou de amostras; a métrica que governa o laço é a taxa de
 * falso-passe medida contra MUTANTES INJETADOS; cruzou o limiar → PARE o
 * laço e conserte o juiz. §9.2 — o placar inclui a taxa de falso-passe do
 * revisor contra mutantes.
 *
 * TRÊS RESPONSABILIDADES, TUDO COM O REVISOR INJETÁVEL:
 *
 *   1. `medirTaxaDeFalsoPasse` — o revisor (pipeline P-12 completo, LLM
 *      injetável) julga o artefato VÁLIDO e cada MUTANTE (`rodaMutante` em
 *      `mutants.ts`). Para um mutante, o defeito foi APONTADO quando existe
 *      apontamento cuja categoria pertence ao conjunto DETECTOR da classe E
 *      abre rodada na tabela fixa do §6.5 (`abreRodada` — sugestão nunca
 *      abre rodada: apontar como estilo/tom/prosa é falso-passe). FALSO-PASSE
 *      da classe = mutantes da classe sem detecção; taxa por classe e geral
 *      saem TIPADAS. FAIL-CLOSED: revisor indisponível durante a calibração
 *      (lançou) → `ErroDeCalibracao` estruturado — a calibração não produz
 *      veredito com o juiz fora do ar (§9.3).
 *
 *   2. `decisaoDeCalibracao` — a decisão do laço. Lê SOMENTE
 *      `medicao.taxaGeral` (a taxa contra os mutantes). `taxaGeral ≥ limiar`
 *      → `{aprovado: false, motivo: 'LIMIAR_FALSO_PASSE'}` com mensagem
 *      explícita de desligamento — mais rodadas e mais amostras não salvam;
 *      o VEREDITO AGREGADO do revisor não é alarme em lugar nenhum deste
 *      pacote (a ausência é fixada por varredura textual em teste).
 *
 *   3. A REMOÇÃO POR CLASSE e o CONTRATO DE LIGAÇÃO:
 *        - `categoriasParaRemover` — função PURA com o estado de gerações
 *          INJETADO (histórico de medições): uma classe cuja razão de acerto
 *          (1 − taxa de falso-passe da classe) fique abaixo do limiar em
 *          DUAS gerações CONSECUTIVAS é marcada para REMOÇÃO do revisor;
 *        - `calibracaoNecessariaAntesDeLigar` — o contrato para o laço F11
 *          (P-22): a calibração roda ANTES de o laço ser ligado numa trilha
 *          real; devolve `true` quando falta calibração aprovada.
 *
 * O QUE ESTE MÓDULO NÃO FAZ: não escreve o report.json (P-24), não liga o
 * laço (P-22), não chama LLM diretamente (o revisor é injetado), não gera
 * mutantes (vêm de `mutants.ts`). Zero IO. As funções de decisão são puras.
 */

import { type RevisaoComSeveridade } from '../prompts/reviewer';
import { abreRodada } from '../review/normalize';
import {
  type ClasseDeDefeito,
  type DesafioParaMutacao,
  type Mutante,
  rodaMutante,
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
 * Um apontamento detecta o defeito do mutante quando (1) a categoria está no
 * conjunto detector da classe E (2) a categoria ABRE RODADA na tabela fixa do
 * §6.5 — o apontamento conta como acerto só quando mobiliza o laço.
 */
export function apontamentoDetectaDefeito(
  apontamento: RevisaoComSeveridade['apontamentos'][number],
  mutante: Mutante,
): boolean {
  return abreRodada(apontamento.categoria) && CATEGORIAS_QUE_DETECTAM[mutante.classe].includes(apontamento.categoria);
}

/** A revisão inteira detecta o defeito quando algum apontamento detecta. */
export function revisaoDetectaDefeito(revisao: RevisaoComSeveridade, mutante: Mutante): boolean {
  return revisao.apontamentos.some((apontamento) => apontamentoDetectaDefeito(apontamento, mutante));
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

/** Envolve a chamada ao revisor: lançamento vira erro estruturado de calibração. */
async function julgarComSeguranca(
  deps: DepsDeCalibracao,
  artefato: DesafioParaMutacao,
  rotulo: string,
): Promise<RevisaoComSeveridade> {
  try {
    return await deps.revisor(artefato);
  } catch (causa) {
    throw new ErroDeCalibracao(
      'REVISOR_INDISPONIVEL',
      `revisor indisponível durante a calibração (${rotulo}) — fail-closed: a calibração não produz veredito com o juiz fora do ar (§9.3)`,
      causa,
    );
  }
}

/**
 * Mede a taxa de falso-passe do revisor: cada artefato (válido + mutantes) é
 * julgado por `deps.revisor`; por classe e no geral, a taxa é
 * falsos-passantes / total da classe. O válido é julgado por SANITY:
 * `achadosNoValido` é diagnóstico, NUNCA entra em nenhuma decisão deste
 * pacote (a decisão lê SÓ a taxa contra os mutantes, §6.6). FAIL-CLOSED:
 * revisor indisponível → `ErroDeCalibracao('REVISOR_INDISPONIVEL')`;
 * calibração sem mutantes → `ErroDeCalibracao('SEM_MUTANTES')`.
 */
export async function medirTaxaDeFalsoPasse(
  deps: DepsDeCalibracao,
  artefatos: ArtefatosDeCalibracao,
): Promise<MedicaoDeFalsoPasse> {
  if (artefatos.mutantes.length === 0) {
    throw new ErroDeCalibracao(
      'SEM_MUTANTES',
      'calibração sem mutantes não é medição — gere os mutantes com `gerarMutantes` antes de medir',
    );
  }

  const revisaoDoValido = await julgarComSeguranca(deps, artefatos.valido, 'artefato válido');
  const achadosNoValido = revisaoDoValido.apontamentos.filter((a) => abreRodada(a.categoria)).length;

  const porClasse: MedicaoPorClasse[] = [];
  for (const classe of [...new Set(artefatos.mutantes.map((m) => m.classe))]) {
    const daClasse = artefatos.mutantes.filter((m) => m.classe === classe);
    let falsosPasses = 0;
    for (const mutante of daClasse) {
      const mutado = rodaMutante(mutante, artefatos.valido);
      const revisao = await julgarComSeguranca(deps, mutado, `mutante ${mutante.id}`);
      if (!revisaoDetectaDefeito(revisao, mutante)) falsosPasses += 1;
    }
    const totalMutantes = daClasse.length;
    const detectados = totalMutantes - falsosPasses;
    const taxaDeFalsoPasse = totalMutantes === 0 ? 0 : falsosPasses / totalMutantes;
    porClasse.push({
      classe,
      totalMutantes,
      detectados,
      falsosPasses,
      taxaDeFalsoPasse,
      razaoDeAcerto: 1 - taxaDeFalsoPasse,
    });
  }

  const frenteAMutantes = artefatos.mutantes.length;
  const falsosPassesTotais = porClasse.reduce((soma, c) => soma + c.falsosPasses, 0);
  return {
    amostras: frenteAMutantes + 1,
    frenteAMutantes,
    taxaGeral: falsosPassesTotais / frenteAMutantes,
    porClasse,
    achadosNoValido,
  };
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

const formatarPorcentagem = (fracao: number): string => `${(fracao * 100).toFixed(1)}%`;

/**
 * A DECISÃO da calibração — função pura paramétrica no limiar. `taxaGeral ≥
 * limiar` devolve `{aprovado: false, motivo: 'LIMIAR_FALSO_PASSE'}` com a
 * mensagem explícita do §6.6: este revisor nunca remove nada, mais rodadas e
 * mais amostras não salvam — PARE o laço e conserte o juiz. A decisão lê
 * SOMENTE a taxa contra os mutantes; o veredito agregado do revisor não é
 * alarme em lugar nenhum deste pacote.
 */
export function decisaoDeCalibracao(
  medicao: MedicaoDeFalsoPasse,
  limiar: number = limiarDeFalsoPasse(),
): DecisaoDeCalibracao {
  if (medicao.taxaGeral >= limiar) {
    return {
      aprovado: false,
      motivo: 'LIMIAR_FALSO_PASSE',
      mensagem:
        `LIMIAR_FALSO_PASSE: o revisor marcou ${formatarPorcentagem(medicao.taxaGeral)} dos mutantes como passe ` +
        `(limiar ${formatarPorcentagem(limiar)}, limite ≥ ${String(limiar)}) — um revisor assim NUNCA remove nada; ` +
        'mais rodadas não salvam, mais amostras não salvam. PARE o laço e conserte o juiz (§6.6).',
      limiar,
      taxaGeral: medicao.taxaGeral,
    };
  }
  return {
    aprovado: true,
    mensagem:
      `calibração aprovada: taxa geral de falso-passe ${formatarPorcentagem(medicao.taxaGeral)} abaixo do limiar ` +
      `${formatarPorcentagem(limiar)} — o laço pode ser ligado nesta trilha.`,
    limiar,
    taxaGeral: medicao.taxaGeral,
  };
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

/**
 * DESLIGAMENTO AUTOMÁTICO POR CATEGORIA — função PURA com o estado de
 * gerações INJETADO (o histórico é parâmetro, nunca estado global). Uma
 * classe cuja razão de acerto (1 − taxa de falso-passe da classe) fique
 * ABAIXO de `limiarDeAcerto` por `geracoesConsecutivas` gerações
 * CONSECUTIVAS é devolvida para REMOÇÃO do revisor; uma geração acima do
 * limiar ZERA o contador da classe. A decisão de remoção usa SÓ a taxa por
 * classe contra os mutantes — o mesmo princípio do §6.6, aplicado por
 * categoria.
 */
export function categoriasParaRemover(
  historico: readonly GeracaoDeMedicao[],
  parametros: ParametrosDeRemocaoPorCategoria = PARAMETROS_PADRAO_DE_REMOCAO,
): CategoriaParaRemover[] {
  if (parametros.geracoesConsecutivas < 1) {
    throw new Error('categoriasParaRemover: geracoesConsecutivas tem de ser ≥ 1');
  }

  const ordenado = [...historico].sort((a, b) => a.geracao - b.geracao);
  const estado = new Map<ClasseDeDefeito, { consecutivas: number; ultimaRazaoDeAcerto: number }>();

  for (const geracao of ordenado) {
    for (const medicaoDaClasse of geracao.medicao.porClasse) {
      const abaixo = medicaoDaClasse.razaoDeAcerto < parametros.limiarDeAcerto;
      const anterior = estado.get(medicaoDaClasse.classe);
      estado.set(medicaoDaClasse.classe, {
        consecutivas: abaixo ? (anterior?.consecutivas ?? 0) + 1 : 0,
        ultimaRazaoDeAcerto: medicaoDaClasse.razaoDeAcerto,
      });
    }
  }

  const saida: CategoriaParaRemover[] = [];
  for (const [classe, st] of estado) {
    if (st.consecutivas >= parametros.geracoesConsecutivas) {
      saida.push({ classe, geracoesConsecutivasAbaixo: st.consecutivas, ultimaRazaoDeAcerto: st.ultimaRazaoDeAcerto });
    }
  }
  return saida.sort((a, b) => a.classe.localeCompare(b.classe));
}

// ---------------------------------------------------------------------------
// O CONTRATO PARA O P-22 (A-P20-2): calibração ANTES de ligar o laço
// ---------------------------------------------------------------------------

/**
 * A-P20-2 — a calibração roda ANTES de o laço ser ligado numa trilha real.
 *
 * CONTRATO PARA O P-22 (o laço F11): antes de ligar o laço de revisão de uma
 * trilha, o P-22 DEVE
 *
 *   1. gerar os mutantes (`gerarMutantes(desafioValidoExemplo())` — ou sobre
 *      um desafio controlado da trilha em questão, via
 *      `engine/quality/mutants.ts`);
 *   2. medir o revisor REAL (`medirTaxaDeFalsoPasse` com o pipeline P-12
 *      completo injetado) — a medição falha fechada se o revisor estiver
 *      fora do ar;
 *   3. guardar cada medição no histórico e consultar ESTA função: devolve
 *      `true` enquanto faltar uma calibração APROVADA, e o laço não pode ser
 *      ligado. `false` só quando a ÚLTIMA medição do histórico foi aprovada
 *      por `decisaoDeCalibracao` (taxa geral abaixo do limiar).
 *
 * A função é PURA: o histórico é parâmetro. Histórico vazio → `true`
 * (nunca se liga um laço nunca calibrado). Mediçoes subsequentes aprovadas
 * mantêm `false`; a primeira medição que cruzar o limiar volta a exigir
 * calibração.
 */
export function calibracaoNecessariaAntesDeLigar(
  medicoesHistorico: readonly MedicaoDeFalsoPasse[],
  limiar: number = limiarDeFalsoPasse(),
): boolean {
  if (medicoesHistorico.length === 0) return true;
  const ultima = medicoesHistorico[medicoesHistorico.length - 1];
  return !decisaoDeCalibracao(ultima, limiar).aprovado;
}