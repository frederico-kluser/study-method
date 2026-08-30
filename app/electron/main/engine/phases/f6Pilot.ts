/**
 * app/electron/main/engine/phases/f6Pilot.ts — F6 · PILOTO DE TRÊS AULAS E
 * PORTÃO HUMANO (pacote P-25, plano de execução v1).
 *
 * Contrato normativo: `docs/16-engine-de-trilha.md` §4 (F6 ⇉ 3 · portão
 * humano), §14 passo 6 ("Autoria e verificação no piloto de 3 aulas, medindo
 * a taxa de ruído do revisor antes de ligar o laço") e §4.2 ("Risco assumido
 * e não mitigável a jusante: pesquisa errada produz trilha errada, e nenhuma
 * fase posterior detecta. É o único ponto onde a revisão humana é
 * insubstituível — daí o portão de F6. ... um erro de dossiê descoberto na
 * aula 3 custa 3 aulas; na aula 118, custa 118").
 *
 * DECISÕES DO REPLAN (P-25, contrato adicional):
 *   - seleção DETERMINÍSTICA e JUSTIFICADA: raiz, mais armadilhada, tardia
 *     (`selecionarAulasDoPiloto` — A-P25-2; a justificativa de cada escolha É
 *     parte do resultado);
 *   - o marker `aprovacao-f6.json` é criado SÓ por um subcomando INTERATIVO
 *     (`confirmarF6Interativo` lê uma linha do stdin e exige a digitação
 *     EXATA "APROVO F6"); NENHUMA flag o fura — não existe parâmetro
 *     `force`/`skip` em lugar nenhum deste módulo, e a leitura do marker
 *     (`lerAprovacaoF6`) é fail-closed: ausente/corrompido/hash divergente →
 *     `F6Error('F6_NAO_APROVADO')`;
 *   - `--from F7+` (ondas cheias) exige o marker — este pacote entrega o
 *     gate (`garantirAprovacaoF6` + `rodarOndasCheias`, que RECUSA sem o
 *     marker); o P-22 integra o gate no CLI/maquinaria do laço (contrato com
 *     P-22, ver SECÃO CONTRATO COM O P-22);
 *   - o ruído do revisor é a GERAÇÃO 1 do histórico de calibração, medido
 *     ANTES de ligar o laço (contrato: histórico vazio ⇒ laço DESLIGADO —
 *     `calibracaoNecessariaAntesDeLigar` do pacote P-20);
 *   - EXPERIMENTO 10×10 (A-P25-4): 10 aulas autoradas EM PARALELO (scheduler)
 *     vs 10 EM SEQUENCIAL (o MESMO código de autoria, `autorizarAula`, um a
 *     um), comparando violações de orçamento (auditoria da TRILHA DE
 *     BRINQUEDO), duplicata semântica (proxy jaccard do laço F11 entre pares
 *     de aulas) e tokens (telemetria). A trilha usada é uma trilha NOVA DE
 *     BRINQUEDO (orçamento + dossiês sintéticos em memória) — NUNCA
 *     `nodejs-do-zero`.
 *
 * O QUE ESTE ARQUIVO É:
 *
 *   1. `selecionarAulasDoPiloto(orcamento, grafoOuOrdem)` — função PURA e
 *      determinística: (1) raiz = primeira aula da ordem topológica; (2) mais
 *      armadilhada = a aula com a MAIOR carga de risco determinística
 *      (introduces produtivos + profundidade de composição; desempate por
 *      sha256 do ref); (3) tardia = última aula da ordem. A justificativa de
 *      cada escolha (papel, regra aplicada, critério numérico) é parte do
 *      resultado. Fail-closed: orçamento sem aulas, grafo cíclico/órfão,
 *      conceito introduzido fora da ordem ou menos de 3 papéis distintos
 *      LANÇAM `F6Error('PILOTO_INVALIDO')`.
 *
 *   2. `medirRuidoDoRevisor(deps, amostras)` — a MEDIÇÃO da taxa de
 *      falso-passe do revisor via `quality/judgeCalibration.ts` (P-20),
 *      ANTES de ligar o laço; `medicaoComoGeracao(medicao, 1)` a transforma
 *      na geração 1 do histórico. Documentado: histórico vazio ⇒ o laço de
 *      revisão das ondas cheias fica DESLIGADO (`calibracaoNecessariaAntesDeLigar`).
 *
 *   3. O PORTÃO HUMANO — INTRAVESSÁVEL POR FLAG:
 *        - `criarAprovacaoF6(dir, {aulas, metricas})` escreve
 *          `aprovacao-f6.json` com hash do CONTEÚDO (versão + aulas +
 *          métricas, sha256 canonicalizado; o carimbo fica FORA do hash para
 *          que re-aprovar o MESMO conteúdo seja NO-OP);
 *          é chamado SOMENTE pelo fluxo interativo (`confirmarF6Interativo`),
 *          que lê uma linha do stdin e exige a digitação EXATA "APROVO F6" —
 *          qualquer outra entrada NÃO escreve nada (devolve null). NENHUM
 *          parâmetro `force`/`skip` existe neste módulo (prova em teste:
 *          passar a chave não compila, e contrabandear via `any` é ignorado).
 *          Re-criação: conteúdo idêntico é NO-OP; conteúdo DIFERENTE é erro
 *          (nunca sobrescreve uma aprovação por outra em silêncio).
 *        - `lerAprovacaoF6(dir)` fail-closed com `F6_NAO_APROVADO`:
 *          ausente, JSON corrompido, shape inválido OU hash do conteúdo
 *          divergente do declarado (adulteração) — todos viram o MESMO erro
 *          estruturado.
 *        - `garantirAprovacaoF6(dir)` — o gate que o P-22 consulta;
 *        - `rodarOndasCheias(dir, deps, aulas)` — a porta das ondas cheias:
 *          SEM o marker, RECUSA (nada roda, nem uma chamada LLM).
 *
 *   4. `rodarPiloto(deps, orcamento, aulas)` — roda a AUTORIA (via
 *      `runOndaDeAutoria` da F7) nas 3 aulas selecionadas + a calibração do
 *      revisor; o resultado é PERSISTIDO em `piloto-f6.json` (raiz
 *      INJETÁVEL). A-P25-3: o RESULTADO (v1: métricas + aulas aprovadas +
 *      históricos) É a entrada de contexto dos prompts das ondas cheias —
 *      `resumoParaOndasSeguintes(piloto)` devolve esse contexto pronto.
 *      O piloto NUNCA escreve `aprovacao-f6.json` (o marker só nasce no
 *      fluxo interativo).
 *
 *   5. `medir10x10(deps, orcamento, dezAulas)` — o EXPERIMENTO 10×10 com
 *      fakes (LLM fake determinístico nos testes; nunca processos reais).
 *      Resultado TIPADO (`Comparativo10x10`): por regime, violações de
 *      orçamento da auditoria da trilha de brinquedo, pares duplicados
 *      semanticamente (proxy jaccard), tokens de entrada/saída e latência;
 *      telemetria e ledger opcionais (anexam uma linha por regime).
 *
 * DISK LAYOUT (por run, raiz injetável):
 *   - `piloto-f6.json`   — o resultado do piloto (escrito por `rodarPiloto`)
 *   - `aprovacao-f6.json`— o MARKER do portão humano (escrito SÓ por
 *                          `confirmarF6Interativo`)
 *
 * DEPENDÊNCIA: f6Pilot importa de f4Budget/f5Freeze/f7Theory/f8Challenges
 * (fases ANTERIORES), do judgeCalibration/mutantes (P-20), do jaccard do
 * laço (review/loop), do ledger/runState/scheduler (runtime) e do dossiê
 * (prompts). NADA importa deste módulo ainda — sem ciclos.
 */

import * as path from 'node:path';

import { extractAtoms } from '../extract';
import type { ConceptGraph, ConceptId } from '../graph/model';
import { toposort } from '../graph/dag';
import type { Dossier } from '../prompts/dossier';
import { type Ledger, canonicalizarJson, sha256Hex, type TelemetriaFile } from '../runtime/ledger';
import { type EscreverArquivoFn, escreverAtomico, lerArquivoOuVazio } from '../runtime/runState';
import type { RateLimiters } from '../runtime/scheduler';
import type { EngineLlm } from '../runtime/callLlm';
import { jaccardNormalizado } from '../review/loop';
import {
  calibracaoNecessariaAntesDeLigar,
  decisaoDeCalibracao,
  medirTaxaDeFalsoPasse,
  type ArtefatosDeCalibracao,
  type DepsDeCalibracao,
  type GeracaoDeMedicao,
  type MedicaoDeFalsoPasse,
} from '../quality/judgeCalibration';
import { congelarProfundamente, type BudgetF4 } from './f4Budget';
import { derivarSnapshots, type SnapshotAula } from './f5Freeze';
import {
  autorizarAula,
  caminhoDraftAula,
  caminhoDraftDesafio,
  ofensasDeOrcamentoDaTeoria,
  runOndaDeAutoria,
  type DepsDaOndaAutoria,
  type DossieDeAula,
  type EstadoDeAulaNaOnda,
  type ResultadoOndaDeAutoria,
  type TeoriaEscrita,
} from './f7Theory';
import { ofensasDeOrcamentoDoDesafio, type FaixasDeOrcamentoDoDesafio, type SaidaDesafio } from './f8Challenges';

// ---------------------------------------------------------------------------
// Nomes de artefato e constantes do contrato (declarados — ver cabeçalho)
// ---------------------------------------------------------------------------

/** O MARKER do portão humano — só o fluxo INTERATIVO o cria. */
export const APROVACAO_F6_FILENAME = 'aprovacao-f6.json';

/** O resultado do piloto — escrito por `rodarPiloto`, lido pelo portão. */
export const PILOTO_F6_FILENAME = 'piloto-f6.json';

/** A digitação EXATA que abre o portão. Nada além dela aprova. */
export const APROVACAO_F6_FRASE = 'APROVO F6';

/** O tamanho do piloto: 3 aulas (raiz, mais armadilhada, tardia — §4). */
export const TAMANHO_DO_PILOTO = 3;

/** Tamanho do experimento 10×10: DEZ aulas em cada regime. */
export const TAMANHO_DO_EXPERIMENTO_10X10 = 10;

/**
 * Limiar do proxy de duplicata semântica (jaccard normalizado do laço F11,
 * `review/loop.ts`): um PAR de aulas com similaridade ≥ este valor conta
 * como duplicata. Proxy DECLARADO — nunca embedding real (mesmo espírito do
 * `LIMIAR_DEFAULT_DE_ESTAGNACAO` do laço).
 */
export const DUPLICATA_SEMANTICA_LIMIAR = 0.9;

// ---------------------------------------------------------------------------
// Erros estruturados (fail-closed — INV-03)
// ---------------------------------------------------------------------------

export type F6ErrorCode =
  /** o marker do portão NÃO está aprovado: ausente, corrompido ou adulterado. */
  | 'F6_NAO_APROVADO'
  /** criarAprovacaoF6 com conteúdo DIFERENTE do marker já existente. */
  | 'F6_APROVACAO_DIVERGENTE'
  /** entrada inválida do piloto/seleção/experimento (menos de 3 aulas, grafo inválido etc.). */
  | 'PILOTO_INVALIDO';

export class F6Error extends Error {
  readonly code: F6ErrorCode;
  readonly campo?: string;

  constructor(code: F6ErrorCode, mensagem: string, campo?: string) {
    super(mensagem);
    this.name = 'F6Error';
    this.code = code;
    this.campo = campo;
  }
}

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

// ---------------------------------------------------------------------------
// 1. A SELEÇÃO DETERMINÍSTICA E JUSTIFICADA (A-P25-2)
// ---------------------------------------------------------------------------

/** O papel de cada aula selecionada no piloto (§4 F6). */
export type PapelNoPiloto = 'raiz' | 'mais_armadilhada' | 'tardia';

/** A JUSTIFICATIVA de uma escolha — parte do resultado, nunca um detalhe. */
export interface JustificativaDeSelecao {
  papel: PapelNoPiloto;
  /** `<moduleSlug>/<lessonSlug>` da aula escolhida. */
  aula: string;
  /** a REGRA que decidiu (qual critério da §4 o papel implementa). */
  regra: string;
  /** o CRITÉRIO numérico/determinístico que fez ESTA aula vencer. */
  criterio: string;
}

/** O resultado da seleção: as 3 aulas + a justificativa de cada papel. */
export interface SelecaoDePiloto {
  /** EXATAMENTE 3 aulas distintas, na ordem [raiz, mais_armadilhada, tardia]. */
  aulas: string[];
  /** UMA justificativa por papel, alinhada com `aulas`. */
  justificativas: JustificativaDeSelecao[];
}

/** posição na ordem topológica (índice 0-based) por conceito. */
function posicaoNaOrdem(ordem: readonly ConceptId[]): Map<ConceptId, number> {
  return new Map(ordem.map((id, i) => [id, i]));
}

/**
 * Mínima posição na ordem das construções introduzidas pela aula — a regra
 * de ordenação das AULAS pela DAG (mesma da F4). Fail-closed: conceito
 * introduzido fora da ordem = orçamento × ordem DIVERGENTES (nunca
 * MAX_SAFE_INTEGER silencioso).
 */
function minPosicaoDaAula(aula: BudgetF4['aulas'][number], pos: Map<ConceptId, number>): number {
  const introduces = aula.introduces.productive;
  if (introduces.length === 0) {
    throw new F6Error('PILOTO_INVALIDO', `aula '${aula.ref}' não introduz construção (G-MONO) — não entra na seleção`);
  }
  const fora = introduces.filter((c) => !pos.has(c));
  if (fora.length > 0) {
    throw new F6Error(
      'PILOTO_INVALIDO',
      `aula '${aula.ref}' introduz conceito fora da ordem topológica: ${fora.join(', ')} — orçamento e ordem divergem`,
      'introduces',
    );
  }
  return Math.max(0, ...introduces.map((c) => pos.get(c) as number));
}

/**
 * PROFUNDIDADE DE COMPOSIÇÃO no DAG de pré-requisitos: o comprimento da
 * MAIOR cadeia de `desbloqueado_por` até cada conceito (arestas contadas;
 * raiz = 0). Função PURA, memoizada; ciclo já foi rejeitado pela toposort
 * (a guarda `visitando` é defesa em profundidade, nunca desliga o memo).
 */
export function profundidadesDeComposicao(grafo: ConceptGraph): Map<ConceptId, number> {
  const memo = new Map<ConceptId, number>();
  const visitando = new Set<ConceptId>();
  const profundidadeDe = (id: ConceptId): number => {
    const ja = memo.get(id);
    if (ja !== undefined) return ja;
    if (visitando.has(id)) return 0; // ciclo — toposort já rejeitou; defesa
    visitando.add(id);
    const conceito = grafo.conceitos.find((c) => c.id === id);
    const pais = conceito === undefined ? [] : conceito.desbloqueadoPor.map(profundidadeDe);
    const valor = pais.length === 0 ? 0 : 1 + Math.max(...pais);
    visitando.delete(id);
    memo.set(id, valor);
    return valor;
  };
  for (const conceito of grafo.conceitos) profundidadeDe(conceito.id);
  return memo;
}

/** A CARGA DE RISCO de uma aula: introduces produtivos + profundidade. */
export interface CargaDeRisco {
  aula: string;
  introducesProdutivos: number;
  profundidadeDeComposicao: number;
  riscoTotal: number;
}

/**
 * A função PURA e DETERMINÍSTICA da seleção do piloto (A-P25-2):
 *
 *   (1) raiz            — primeira aula da ordem topológica;
 *   (2) mais armadilhada— a aula com a MAIOR carga de risco determinística:
 *                         `introduces.productive.length` + profundidade de
 *                         composição (maior cadeia de pré-requisitos no DAG,
 *                         ou posição na ordem quando a ordem é fornecida);
 *                         desempate por sha256 do ref (menor hash vence);
 *   (3) tardia          — última aula da ordem topológica.
 *
 * `grafoOuOrdem` aceita o GRAFO (a ordem é derivada por `toposort` com o
 * critério lexicográfico do dag.ts — mesma escolha da F4) ou a ordem JÁ
 * linearizada (F3): nesse caso a profundidade de composição é o PROXY
 * POSICIONAL — a extensão (max − min) das posições do introduces na
 * linearização — declarado no critério (sem grafo não há DAG para medir).
 *
 * Fail-closed (nunca "quase certo"): orçamento vazio; grafo com ciclo/
 * referência inexistente/id duplicado; conceito introduzido fora da ordem;
 * menos de 3 papéis DISTINTOS (um orçamento pequeno demais não tem piloto).
 */
export function selecionarAulasDoPiloto(orcamento: BudgetF4, grafoOuOrdem: ConceptGraph | ConceptId[]): SelecaoDePiloto {
  if (orcamento.aulas.length === 0) {
    throw new F6Error('PILOTO_INVALIDO', 'não dá para selecionar pilotos num orçamento sem aulas');
  }

  // 1) ORDEM topológica (derivada do grafo ou fornecida pela F3).
  let ordem: ConceptId[];
  let profundidadeDe: (introduces: readonly ConceptId[]) => number;
  if (Array.isArray(grafoOuOrdem)) {
    if (grafoOuOrdem.length === 0) throw new F6Error('PILOTO_INVALIDO', 'ordem fornecida à seleção está vazia');
    if (new Set(grafoOuOrdem).size !== grafoOuOrdem.length) {
      throw new F6Error('PILOTO_INVALIDO', 'ordem fornecida à seleção repete conceito — linearização inválida');
    }
    ordem = [...grafoOuOrdem];
    const pos = posicaoNaOrdem(ordem);
    // PROXY POSICIONAL (declarado): sem o grafo, o único sinal de composição
    // na linearização é a EXTENSÃO da aula sobre ela — (max − min) das
    // posições dos introduzidos: a aula fecha um vão de composição quanto
    // maior for o seu alcance. Determinístico; não é profundidade de DAG.
    profundidadeDe = (introduces) => {
      if (introduces.length === 0) return 0;
      const fora = introduces.filter((c) => !pos.has(c));
      if (fora.length > 0) {
        throw new F6Error(
          'PILOTO_INVALIDO',
          `conceito introduzido fora da ordem fornecida: ${fora.join(', ')} — orçamento e ordem divergem`,
        );
      }
      const indices = introduces.map((c) => pos.get(c) as number);
      return Math.max(...indices) - Math.min(...indices);
    };
  } else {
    const resultado = toposort(grafoOuOrdem);
    if (!resultado.ok) {
      const motivo =
        resultado.falha === 'ciclo'
          ? `ciclo ${resultado.ciclo.join(' → ')}`
          : resultado.falha === 'referencia-inexistente'
            ? `desbloqueado_por referencia conceito inexistente: ${resultado.refs.join(', ')}`
            : `ids duplicados: ${resultado.ids.join(', ')}`;
      throw new F6Error('PILOTO_INVALIDO', `grafo inválido para a seleção: ${motivo}`);
    }
    ordem = resultado.ordem;
    const profundos = profundidadesDeComposicao(grafoOuOrdem);
    profundidadeDe = (introduces) => {
      if (introduces.length === 0) return 0;
      const fora = introduces.filter((c) => !profundos.has(c));
      if (fora.length > 0) {
        throw new F6Error(
          'PILOTO_INVALIDO',
          `aula introduz conceito fora do grafo: ${fora.join(', ')} — orçamento e grafo divergem`,
        );
      }
      return Math.max(...introduces.map((c) => profundos.get(c) as number));
    };
  }

  // 2) As aulas na ORDEM da DAG (min-posição do introduces; desempate por ref).
  const pos = posicaoNaOrdem(ordem);
  const aulasEmOrdem = [...orcamento.aulas].sort((a, b) => {
    const pa = minPosicaoDaAula(a, pos);
    const pb = minPosicaoDaAula(b, pos);
    if (pa !== pb) return pa - pb;
    return a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0;
  });

  // 3) Carga de risco de cada aula (introduces + profundidade de composição).
  const riscos = new Map<string, CargaDeRisco>();
  for (const aula of orcamento.aulas) {
    const introduces = aula.introduces.productive.length;
    const profundidade = profundidadeDe(aula.introduces.productive);
    riscos.set(aula.ref, { aula: aula.ref, introducesProdutivos: introduces, profundidadeDeComposicao: profundidade, riscoTotal: introduces + profundidade });
  }
  const maisArmadilhada = [...orcamento.aulas].sort((a, b) => {
    const ra = riscos.get(a.ref) as CargaDeRisco;
    const rb = riscos.get(b.ref) as CargaDeRisco;
    if (rb.riscoTotal !== ra.riscoTotal) return rb.riscoTotal - ra.riscoTotal; // MAIOR risco primeiro
    const ha = sha256Hex(a.ref);
    const hb = sha256Hex(b.ref);
    return ha < hb ? -1 : ha > hb ? 1 : 0; // DESEMPATE POR HASH DO REF (menor vence)
  })[0];

  // 4) O resultado: as três escolhas, cada uma com a JUSTIFICATIVA.
  const raiz = aulasEmOrdem[0];
  const tardia = aulasEmOrdem[aulasEmOrdem.length - 1];
  const candidatas: JustificativaDeSelecao[] = [
    {
      papel: 'raiz',
      aula: raiz.ref,
      regra: 'primeira aula da ordem topológica (§4 F6 — a raiz abre o piloto)',
      criterio: `min(posição do introduces) = ${minPosicaoDaAula(raiz, pos)}; ordem[0] = ${ordem[0]}`,
    },
    {
      papel: 'mais_armadilhada',
      aula: maisArmadilhada.ref,
      regra: 'maior carga de risco determinística: introduces produtivos + profundidade de composição; desempate por sha256 do ref (menor hash vence)',
      criterio: (() => {
        const carga = riscos.get(maisArmadilhada.ref) as CargaDeRisco;
        return `introduces=${carga.introducesProdutivos} + profundidade=${carga.profundidadeDeComposicao} = ${carga.riscoTotal} (max)`;
      })(),
    },
    {
      papel: 'tardia',
      aula: tardia.ref,
      regra: 'última aula da ordem topológica (§4 F6 — uma aula tardia valida o fim da trilha)',
      criterio: `min(posição do introduces) = ${minPosicaoDaAula(tardia, pos)}; ordem[${ordem.length - 1}] = ${ordem[ordem.length - 1]}`,
    },
  ];

  const distintas = new Set<string>();
  const justificativas: JustificativaDeSelecao[] = [];
  for (const candidata of candidatas) {
    if (distintas.has(candidata.aula)) continue; // mesma aula em dois papéis → conta uma vez
    distintas.add(candidata.aula);
    justificativas.push(candidata);
  }
  if (justificativas.length < TAMANHO_DO_PILOTO) {
    throw new F6Error(
      'PILOTO_INVALIDO',
      `o orçamento não permite um piloto de ${TAMANHO_DO_PILOTO} aulas DISTINTAS (raiz, mais armadilhada, tardia caíram em ${justificativas.length}) — um orçamento pequeno demais não tem piloto`,
    );
  }

  return congelarProfundamente({ aulas: justificativas.map((j) => j.aula), justificativas });
}

// ---------------------------------------------------------------------------
// 2. RUÍDO DO REVISOR — geração 1 do histórico, ANTES de ligar o laço
// ---------------------------------------------------------------------------

/**
 * MEDE a taxa de falso-passe do revisor contra os mutantes (P-20), ANTES de
 * ligar o laço de revisão (docs §14 passo 6 e §4.2 — o ruído do revisor é
 * medido no piloto). Fail-closed herdado do judgeCalibration: revisor
 * indisponível → `ErroDeCalibracao('REVISOR_INDISPONIVEL')`; sem mutantes →
 * `ErroDeCalibracao('SEM_MUTANTES')`.
 *
 * CONTRATO DOCUMENTADO COM O P-22 (a onda cheia): a medição aqui é a GERAÇÃO
 * 1 do histórico de calibração da trilha; enquanto o histórico estiver vazio
 * ou a última medição reprovar, `calibracaoNecessariaAntesDeLigar` devolve
 * `true` e o laço da onda cheia fica DESLIGADO — ligar o laço sem calibração
 * aprovada é erro de contrato (P-20/P-22).
 */
export async function medirRuidoDoRevisor(deps: DepsDeCalibracao, amostras: ArtefatosDeCalibracao): Promise<MedicaoDeFalsoPasse> {
  return medirTaxaDeFalsoPasse(deps, amostras);
}

/** Transforma uma medição em UMA GERAÇÃO do histórico (default: geração 1). */
export function medicaoComoGeracao(medicao: MedicaoDeFalsoPasse, geracao = 1): GeracaoDeMedicao {
  if (!Number.isInteger(geracao) || geracao < 1) {
    throw new F6Error('PILOTO_INVALIDO', `geração do histórico tem de ser inteiro ≥ 1 (recebida ${geracao})`);
  }
  return { geracao, medicao };
}

// ---------------------------------------------------------------------------
// 3. O PORTÃO HUMANO — intransponível por flag
// ---------------------------------------------------------------------------

/** As métricas que o portão aprova: a seleção justificada + o ruído medido. */
export interface AprovacaoMetricas {
  selecao: SelecaoDePiloto;
  ruidoDoRevisor: MedicaoDeFalsoPasse;
}

/** O MARKER `aprovacao-f6.json` — aprovação HUMANA do piloto, com hash. */
export interface ConteudoAprovacaoF6 {
  versao: '1';
  /** as aulas do piloto aprovadas pelo humano. */
  aulas: string[];
  metricas: AprovacaoMetricas;
  /** momento da aprovação, ISO-8601 (NÃO entra no hash — re-aprovar o mesmo conteúdo é no-op). */
  aprovadoEm: string;
  /** sha256 do CONTEÚDO canonicalizado (versão + aulas + métricas), sem o carimbo. */
  hash: string;
}

/** Dados de UMA aprovação — o par (aulas, métricas), como no contrato. */
export interface DadosDaAprovacao {
  aulas: string[];
  metricas: AprovacaoMetricas;
}

/** Opções de escrita/estampa do marker (NUNCA há flag force/skip aqui). */
export interface OpcoesDaAprovacao {
  /** escrita injetável — produção usa a primitiva D-WRITE; testes usam tmp. */
  escreverArquivo?: EscreverArquivoFn;
  /** relógio injetável — default agora. */
  quando?: string;
}

/** sha256 do CONTEÚDO da aprovação (versão + aulas + métricas) SEM o carimbo. */
export function hashDaAprovacao(conteudo: { versao: '1'; aulas: string[]; metricas: AprovacaoMetricas }): string {
  return sha256Hex(canonicalizarJson({ versao: conteudo.versao, aulas: conteudo.aulas, metricas: conteudo.metricas }));
}

const PAPEIS_VALIDOS: readonly string[] = ['raiz', 'mais_armadilhada', 'tardia'];

/** valida o par (aulas, métricas) ANTES de virar marker — fail-closed. */
function validarDadosDaAprovacao(dados: DadosDaAprovacao): void {
  if (!Array.isArray(dados.aulas) || dados.aulas.length === 0 || dados.aulas.some((a) => typeof a !== 'string' || a.trim() === '')) {
    throw new F6Error('PILOTO_INVALIDO', 'aprovacao-f6.json exige a lista de aulas aprovadas, não vazia');
  }
  if (new Set(dados.aulas).size !== dados.aulas.length) {
    throw new F6Error('PILOTO_INVALIDO', 'aulas da aprovação duplicadas');
  }
  if (dados.metricas === null || typeof dados.metricas !== 'object') {
    throw new F6Error('PILOTO_INVALIDO', 'métricas da aprovação ausentes');
  }
  const selecao = dados.metricas.selecao;
  if (selecao === null || typeof selecao !== 'object') {
    throw new F6Error('PILOTO_INVALIDO', 'métricas.selecao ausente');
  }
  if (!Array.isArray(selecao.justificativas) || selecao.justificativas.length !== TAMANHO_DO_PILOTO) {
    throw new F6Error('PILOTO_INVALIDO', `métricas da aprovação precisam de ${TAMANHO_DO_PILOTO} justificativas de seleção`);
  }
  if (canonicalizarJson(selecao.aulas) !== canonicalizarJson(dados.aulas)) {
    throw new F6Error('PILOTO_INVALIDO', 'métricas.selecao.aulas diverge de aulas — a aprovação seria incoerente');
  }
  for (const justificativa of selecao.justificativas) {
    if (justificativa === null || typeof justificativa !== 'object' || !PAPEIS_VALIDOS.includes(justificativa.papel)) {
      throw new F6Error('PILOTO_INVALIDO', `papel de seleção desconhecido: ${JSON.stringify(justificativa)}`);
    }
    if (typeof justificativa.aula !== 'string' || justificativa.aula.trim() === '') {
      throw new F6Error('PILOTO_INVALIDO', 'justificativa de seleção sem aula');
    }
    if (typeof justificativa.regra !== 'string' || justificativa.regra.trim() === '') {
      throw new F6Error('PILOTO_INVALIDO', 'justificativa de seleção sem regra');
    }
    if (typeof justificativa.criterio !== 'string' || justificativa.criterio.trim() === '') {
      throw new F6Error('PILOTO_INVALIDO', 'justificativa de seleção sem critério');
    }
  }
  const ruido = dados.metricas.ruidoDoRevisor;
  if (ruido === null || typeof ruido !== 'object' || typeof ruido.taxaGeral !== 'number' || !(ruido.taxaGeral >= 0 && ruido.taxaGeral <= 1)) {
    throw new F6Error('PILOTO_INVALIDO', 'métricas.ruidoDoRevisor precisa de taxaGeral ∈ [0, 1]');
  }
}

/**
 * Valida o conteúdo CRU de um marker (JSON.parse) — a porta de leitura
 * fail-closed. TODA falha aqui (versão, shape, hash divergente) vira
 * `F6_NAO_APROVADO`: uma aprovação que não se prova é uma aprovação que não
 * existe (sem overclaim).
 */
function validarAprovacaoF6(cru: unknown): ConteudoAprovacaoF6 {
  const falhar = (motivo: string): never => {
    throw new F6Error(
      'F6_NAO_APROVADO',
      `aprovacao-f6.json inválido: ${motivo} — o portão humano NÃO foi aprovado; a onda cheia não roda`,
      'aprovacao-f6.json',
    );
  };
  if (typeof cru !== 'object' || cru === null || Array.isArray(cru)) falhar('não é um objeto');
  const o = cru as Record<string, unknown>;
  if (o['versao'] !== '1') falhar(`versao inesperada: ${JSON.stringify(o['versao'])}`);
  const aulasBrutas = o['aulas'];
  if (
    !Array.isArray(aulasBrutas) ||
    aulasBrutas.length === 0 ||
    aulasBrutas.some((a) => typeof a !== 'string' || (a as string).trim() === '')
  ) {
    falhar("'aulas' ausente ou inválida");
  }
  const aulas = aulasBrutas as string[]; // Array.isArray já provou — cast explícito
  if (new Set(aulas).size !== aulas.length) falhar("'aulas' duplicadas");
  const metricas = o['metricas'];
  if (typeof metricas !== 'object' || metricas === null) falhar("'metricas' ausentes");
  const m = metricas as Record<string, unknown>;
  const selecao = m['selecao'];
  if (typeof selecao !== 'object' || selecao === null) falhar("'metricas.selecao' ausente");
  const s = selecao as Record<string, unknown>;
  const sAulas = s['aulas'];
  if (!Array.isArray(sAulas) || canonicalizarJson(sAulas) !== canonicalizarJson(aulas)) {
    falhar("'metricas.selecao.aulas' diverge de 'aulas'");
  }
  const justificativasBrutas = s['justificativas'];
  if (!Array.isArray(justificativasBrutas) || justificativasBrutas.length !== TAMANHO_DO_PILOTO) {
    falhar(`'metricas.selecao.justificativas' precisa ter ${TAMANHO_DO_PILOTO} itens`);
  }
  const justificativas = justificativasBrutas as Record<string, unknown>[];
  for (const j of justificativas) {
    if (typeof j !== 'object' || j === null) falhar('justificativa de seleção inválida');
    if (!PAPEIS_VALIDOS.includes(j['papel'] as string)) falhar(`papel de seleção desconhecido: ${JSON.stringify(j['papel'])}`);
    for (const campo of ['aula', 'regra', 'criterio'] as const) {
      if (typeof j[campo] !== 'string' || (j[campo] as string).trim() === '') falhar(`justificativa sem '${campo}'`);
    }
  }
  const ruido = m['ruidoDoRevisor'];
  if (typeof ruido !== 'object' || ruido === null) falhar("'metricas.ruidoDoRevisor' ausente");
  const taxaGeral = (ruido as Record<string, unknown>)['taxaGeral'];
  if (typeof taxaGeral !== 'number' || !(taxaGeral >= 0 && taxaGeral <= 1)) falhar("'metricas.ruidoDoRevisor.taxaGeral' fora de [0, 1]");
  const aprovadoEmBruto = o['aprovadoEm'];
  if (typeof aprovadoEmBruto !== 'string' || Number.isNaN(Date.parse(aprovadoEmBruto))) falhar("'aprovadoEm' não é data ISO-8601");
  const aprovadoEm = aprovadoEmBruto as string; // typeof já provou — cast explícito (narrowing composto não propaga)
  const hashBruto = o['hash'];
  if (typeof hashBruto !== 'string' || hashBruto.trim() === '') falhar("'hash' ausente");
  const hash = hashBruto as string; // typeof já provou — cast explícito (narrowing composto não propaga)
  const semHash: Omit<ConteudoAprovacaoF6, 'hash'> = {
    versao: '1',
    aulas,
    metricas: metricas as AprovacaoMetricas,
    aprovadoEm,
  };
  // O hash cobre o CONTEÚDO (versão + aulas + métricas), não o carimbo:
  // re-aprovar as MESMAS aulas com as MESMAS métricas é o MESMO conteúdo
  // (idempotente), e a adulteração de aulas/métricas/hash quebra aqui.
  if (hashDaAprovacao({ versao: semHash.versao, aulas: semHash.aulas, metricas: semHash.metricas }) !== hash) {
    falhar('o hash do conteúdo NÃO bate com o hash declarado — arquivo adulterado');
  }
  return congelarProfundamente({ ...semHash, hash });
}

/**
 * ESCREVE `aprovacao-f6.json` com hash do conteúdo. Esta função NÃO é um
 * caminho de auto-aprovação: é chamada SOMENTE a partir do fluxo INTERATIVO
 * (`confirmarF6Interativo`, o subcomando humano) — não existe 'force' nem
 * 'skip' em lugar nenhum. Re-escrever MESMO conteúdo é NO-OP (idempotente);
 * re-escrever conteúdo DIFERENTE sobre uma aprovação existente é erro
 * estruturado (nunca uma aprovação engole outra em silêncio).
 */
export async function criarAprovacaoF6(
  dir: string,
  dados: DadosDaAprovacao,
  opcoes: OpcoesDaAprovacao = {},
): Promise<ConteudoAprovacaoF6> {
  validarDadosDaAprovacao(dados);
  // O hash cobre o CONTEÚDO (versão + aulas + métricas) — o carimbo fica fora
  // exatamente para que re-aprovar o MESMO conteúdo seja idempotente (no-op).
  const hash = hashDaAprovacao({ versao: '1', aulas: dados.aulas, metricas: dados.metricas });
  const conteudo: ConteudoAprovacaoF6 = {
    versao: '1',
    aulas: [...dados.aulas],
    metricas: dados.metricas,
    aprovadoEm: opcoes.quando ?? new Date().toISOString(),
    hash,
  };
  const caminho = path.join(dir, APROVACAO_F6_FILENAME);

  const existente = await lerArquivoOuVazio(caminho);
  if (existente !== '') {
    let atual: ConteudoAprovacaoF6;
    try {
      atual = validarAprovacaoF6(JSON.parse(existente));
    } catch (erro) {
      // Conteúdo existente que não se PROVA como aprovação válida (JSON quebrado
      // ou adulterado): recusa sobrescrever — nunca se conserta um portão
      // corrompido escrevendo outro por cima (fail-closed).
      throw new F6Error(
        'F6_APROVACAO_DIVERGENTE',
        `aprovacao-f6.json existente em ${dir} não é uma aprovação válida (${mensagemDe(erro)}) — recusa sobrescrever`,
      );
    }
    if (atual.hash === hash) {
      return atual; // idempotente: a MESMA aprovação já está registrada
    }
    throw new F6Error(
      'F6_APROVACAO_DIVERGENTE',
      `aprovacao-f6.json existente em ${dir} aprova conteúdo DIFERENTE (hash ${atual.hash} ≠ ${hash}) — uma aprovação humana não é sobrescrita por outra (fail-closed)`,
    );
  }

  try {
    await escreverAtomico(caminho, `${JSON.stringify(conteudo, null, 2)}\n`, opcoes.escreverArquivo);
  } catch (erro) {
    if (erro instanceof F6Error) throw erro;
    throw new F6Error('PILOTO_INVALIDO', `falha ao gravar ${caminho}: ${mensagemDe(erro)}`);
  }
  return conteudo;
}

/**
 * O SUBCOMANDO INTERATIVO do portão — o ÚNICO caminho que cria o marker.
 * Lê UMA linha do stdin (injetável nos testes) e exige a digitação EXATA
 * `"APROVO F6"` (sem trim: " APROVO F6 " com espaço NÃO aprova, e nada além
 * da frase abre o portão). Qualquer outra entrada devolve `null` e NÃO
 * escreve NADA. O marker sai com o hash do conteúdo; `criarAprovacaoF6` não
 * é chamável por nenhum outro caminho deste módulo.
 */
export async function confirmarF6Interativo(entrada: {
  dir: string;
  aulas: string[];
  metricas: AprovacaoMetricas;
  /** lê a próxima linha do stdin (production: readline sobre process.stdin). */
  lerLinha: () => Promise<string | null>;
  escreverArquivo?: EscreverArquivoFn;
  quando?: string;
}): Promise<ConteudoAprovacaoF6 | null> {
  const linha = await entrada.lerLinha();
  if (linha !== APROVACAO_F6_FRASE) {
    return null; // qualquer coisa que não a frase EXATA não aprova — nada é escrito
  }
  return criarAprovacaoF6(entrada.dir, { aulas: entrada.aulas, metricas: entrada.metricas }, {
    escreverArquivo: entrada.escreverArquivo,
    quando: entrada.quando,
  });
}

/**
 * LÊ o marker do portão — FAIL-CLOSED: ausente, JSON corrompido, shape
 * inválido OU hash divergente (adulteração) lançam `F6Error('F6_NAO_APROVADO')`
 * — o mesmo erro estruturado para todas as falhas, porque TODAS significam
 * "o humano não aprovou o piloto". A assinatura NÃO tem parâmetro de bypass
 * (não existe force/skip); o `OpcoesDaAprovacao` só carrega escrita injetável
 * e relógio — nada disso abre o portão.
 */
export async function lerAprovacaoF6(dir: string, _opcoes: OpcoesDaAprovacao = {}): Promise<ConteudoAprovacaoF6> {
  const caminho = path.join(dir, APROVACAO_F6_FILENAME);
  const conteudo = await lerArquivoOuVazio(caminho);
  if (conteudo === '') {
    throw new F6Error(
      'F6_NAO_APROVADO',
      `aprovacao-f6.json NÃO existe em ${dir} — o portão humano do piloto não foi aprovado; a onda cheia (F7+) não pode rodar`,
      'aprovacao-f6.json',
    );
  }
  let cru: unknown;
  try {
    cru = JSON.parse(conteudo);
  } catch (erro) {
    throw new F6Error('F6_NAO_APROVADO', `aprovacao-f6.json em ${dir} não é JSON válido: ${mensagemDe(erro)}`, 'aprovacao-f6.json');
  }
  return validarAprovacaoF6(cru); // shape/hash → F6_NAO_APROVADO
}

/**
 * O GATE que o P-22 consulta ANTES de rodar as ondas cheias (`--from F7+`
 * exige o marker). Devolve a aprovação válida ou lança `F6_NAO_APROVADO`.
 */
export async function garantirAprovacaoF6(dir: string): Promise<ConteudoAprovacaoF6> {
  return lerAprovacaoF6(dir);
}

// ---------------------------------------------------------------------------
// 4. RODAR O PILOTO + persistir + RESULTADO como contexto das ondas cheias
// ---------------------------------------------------------------------------

/** Dependências do piloto: autoria (F7/F8) + calibração (P-20) + dossiês. */
export interface DepsDoPiloto {
  llm: EngineLlm;
  prover: DepsDaOndaAutoria['prover'];
  /** pools SEPARADOS do SEM_LLM do transporte (P-27 — quem costura injeta). */
  limiters: RateLimiters;
  escreverArquivo: EscreverArquivoFn;
  /** raiz dos DRAFTS autorados (default ''). */
  baseDir?: string;
  /** raiz INJETÁVEL do `piloto-f6.json` (default: baseDir). */
  raizDoResultado?: string;
  /** dossiês P-11 das aulas — a fonte do objetivo/orçamentos da autoria. */
  dossies: ReadonlyMap<string, Dossier>;
  /** o revisor INJETÁVEL do piloto (pipeline P-12 completo ou fake). */
  revisor: DepsDeCalibracao['revisor'];
  /** o artefato válido + os mutantes — a régua do ruído (P-20). */
  amostrasDeCalibracao: ArtefatosDeCalibracao;
  /**
   * Quando presente, a SELEÇÃO é re-derivada deterministicamente e VALIDADA
   * contra `aulas` (fail-closed: divergência = erro). Ausente, `aulas` é
   * usada como veio pronta (a justificativa registra a origem).
   */
  grafoOuOrdem?: ConceptGraph | ConceptId[];
  tetoOnda?: number;
  quando?: string;
}

/** O resultado do piloto — PERSISTIDO e fonte do contexto das ondas cheias. */
export interface ResultadoDoPiloto {
  versao: '1';
  /** a seleção determinística com as 3 justificativas (A-P25-2). */
  selecao: SelecaoDePiloto;
  /** o resultado da onda de autoria das 3 aulas (estados + waves). */
  autoria: ResultadoOndaDeAutoria;
  /** métricas do piloto: o ruído do revisor MEDIDO antes de ligar o laço. */
  ruidoDoRevisor: MedicaoDeFalsoPasse;
  /** histórico de calibração da trilha — começa com a GERAÇÃO 1 deste piloto. */
  historicoDeCalibracao: GeracaoDeMedicao[];
  /** momento da persistência, ISO-8601. */
  persistidoEm: string;
  /** sha256 do conteúdo canonicalizado sem o próprio campo. */
  hash: string;
}

/** As aulas do piloto que a autoria entregou VALIDADAS (ordem estável). */
export function aulasAprovadasDoPiloto(piloto: ResultadoDoPiloto): string[] {
  return piloto.autoria.estados.filter((e) => e.status === 'validado').map((e) => e.aula_slug).sort();
}

/**
 * RODA O PILOTO: mede o ruído do revisor (ANTES de qualquer autoria — o
 * contrato da §14 passo 6) e autoriza as 3 aulas selecionadas via
 * `runOndaDeAutoria` (⇉ 3, uma onda). O resultado é PERSISTIDO em
 * `piloto-f6.json` na raiz injetável — e o piloto NUNCA escreve o marker
 * `aprovacao-f6.json` (o marker só nasce no fluxo interativo). Fail-closed:
 * aula fora do orçamento, dossiê ausente, snapshot ausente ou seleção ×
 * `aulas` divergente → `F6Error('PILOTO_INVALIDO')`.
 */
export async function rodarPiloto(deps: DepsDoPiloto, orcamento: BudgetF4, aulas: string[]): Promise<ResultadoDoPiloto> {
  if (aulas.length !== TAMANHO_DO_PILOTO) {
    throw new F6Error('PILOTO_INVALIDO', `o piloto F6 autor EXATAMENTE ${TAMANHO_DO_PILOTO} aulas (recebidas ${aulas.length})`);
  }
  if (new Set(aulas).size !== aulas.length) {
    throw new F6Error('PILOTO_INVALIDO', 'as aulas do piloto precisam ser distintas');
  }

  // A seleção: re-derivada (e validada) quando o grafo/ordem está presente.
  let selecao: SelecaoDePiloto;
  if (deps.grafoOuOrdem !== undefined) {
    selecao = selecionarAulasDoPiloto(orcamento, deps.grafoOuOrdem);
    if (canonicalizarJson(selecao.aulas) !== canonicalizarJson(aulas)) {
      throw new F6Error(
        'PILOTO_INVALIDO',
        `as aulas do piloto não batem com a seleção determinística: recebidas [${aulas.join(', ')}]; seleção [${selecao.aulas.join(', ')}] — use o resultado de selecionarAulasDoPiloto`,
      );
    }
  } else {
    const papeis: PapelNoPiloto[] = ['raiz', 'mais_armadilhada', 'tardia'];
    selecao = {
      aulas: [...aulas],
      justificativas: aulas.map((aula, i) => ({
        papel: papeis[i] ?? 'tardia',
        aula,
        regra: 'seleção fornecida pelo chamador (sem grafo/ordem — as justificativas determinísticas vêm de selecionarAulasDoPiloto)',
        criterio: `aulas[${i}] = ${aula}`,
      })),
    };
  }

  // Dossiês de aula + snapshots congelados (F5) — a entrada literal da autoria.
  const snapshots = derivarSnapshots(orcamento);
  const dossiesDeAula: DossieDeAula[] = aulas.map((ref) => {
    const dossie = deps.dossies.get(ref);
    if (dossie === undefined) {
      throw new F6Error('PILOTO_INVALIDO', `dossiê ausente para a aula do piloto: ${ref} — seleção e dossiês divergem`);
    }
    const snapshot = snapshots.find((s) => s.aula_slug === ref);
    if (snapshot === undefined) {
      throw new F6Error('PILOTO_INVALIDO', `aula ${ref} não existe no orçamento do piloto — snapshot congelado ausente`);
    }
    return { aula_slug: ref, snapshot, dossie, desafios_anteriores: [] };
  });

  // 1) RUÍDO DO REVISOR — ANTES de autorar (geração 1 do histórico; contrato:
  //    histórico vazio ⇒ laço desligado no P-22).
  const ruidoDoRevisor = await medirRuidoDoRevisor({ revisor: deps.revisor }, deps.amostrasDeCalibracao);
  const historicoDeCalibracao = [medicaoComoGeracao(ruidoDoRevisor, 1)];

  // 2) AUTORIA das 3 aulas — uma onda (⇉ 3), posse validada pelo scheduler.
  const autoria = await runOndaDeAutoria(
    {
      llm: deps.llm,
      prover: deps.prover,
      limiters: deps.limiters,
      escreverArquivo: deps.escreverArquivo,
      baseDir: deps.baseDir,
      tetoOnda: deps.tetoOnda,
    },
    dossiesDeAula,
  );

  // 3) PERSISTE o resultado em piloto-f6.json (raiz injetável) — A-P25-3.
  const persistidoEm = deps.quando ?? new Date().toISOString();
  const semHash: Omit<ResultadoDoPiloto, 'hash'> = {
    versao: '1',
    selecao,
    autoria,
    ruidoDoRevisor,
    historicoDeCalibracao,
    persistidoEm,
  };
  const resultado: ResultadoDoPiloto = { ...semHash, hash: sha256Hex(canonicalizarJson(semHash)) };
  const raizDoResultado = deps.raizDoResultado ?? deps.baseDir ?? '';
  const caminho = path.join(raizDoResultado, PILOTO_F6_FILENAME);
  try {
    await escreverAtomico(caminho, `${JSON.stringify(resultado, null, 2)}\n`, deps.escreverArquivo);
  } catch (erro) {
    if (erro instanceof F6Error) throw erro;
    throw new F6Error('PILOTO_INVALIDO', `falha ao gravar ${caminho}: ${mensagemDe(erro)}`);
  }
  return congelarProfundamente(resultado);
}

/**
 * O RESULTADO DO PILOTO COMO CONTEXTO DAS ONDAS SEGUINTES (A-P25-3): o
 * piloto é persistido E ALIMENTA os prompts da onda cheia — este resumo é o
 * bloco de contexto (v1: métricas + aulas aprovadas + históricos) que o
 * P-22/CLI injeta nos prompts das ondas seguintes. DETERMINÍSTICO: mesmo
 * piloto → mesmo texto byte a byte.
 */
export function resumoParaOndasSeguintes(piloto: ResultadoDoPiloto): string {
  const decisao = decisaoDeCalibracao(piloto.ruidoDoRevisor);
  const ligar = !calibracaoNecessariaAntesDeLigar(piloto.historicoDeCalibracao.map((h) => h.medicao));
  const linhas: string[] = [
    '=== PILOTO F6 — CONTEXTO PARA AS ONDAS SEGUINTES (A-P25-3) ===',
    `piloto-f6.json hash: ${piloto.hash}`,
    '',
    'seleção determinística justificada (A-P25-2):',
  ];
  for (const justificativa of piloto.selecao.justificativas) {
    linhas.push(`  - ${justificativa.papel}: ${justificativa.aula} (${justificativa.regra}; critério: ${justificativa.criterio})`);
  }
  const aprovadas = aulasAprovadasDoPiloto(piloto);
  linhas.push('');
  linhas.push('resultado da autoria (aulas aprovadas):');
  if (aprovadas.length === 0) {
    linhas.push('  (nenhuma aula aprovada no piloto — a onda cheia herda um sinal de alerta)');
  } else {
    for (const ref of aprovadas) {
      const estado = piloto.autoria.estados.find((e) => e.aula_slug === ref);
      linhas.push(`  - ${ref}: ${estado?.status ?? 'validado'} (budgetHash ${estado?.budgetHash ?? '—'})`);
    }
  }
  for (const estado of piloto.autoria.estados.filter((e) => e.status !== 'validado')) {
    linhas.push(`  - ${estado.aula_slug}: ${estado.status}${estado.motivo !== undefined ? ` — ${estado.motivo}` : ''}${estado.erro !== undefined ? ` — ${estado.erro}` : ''}`);
  }
  linhas.push('');
  linhas.push(`ruído do revisor — geração ${piloto.historicoDeCalibracao.map((h) => h.geracao).join(', ')} do histórico, medida ANTES de ligar o laço (docs §14 passo 6):`);
  linhas.push(`  - frente a ${piloto.ruidoDoRevisor.frenteAMutantes} mutantes; ${piloto.ruidoDoRevisor.amostras} amostras julgadas; taxa geral ${(piloto.ruidoDoRevisor.taxaGeral * 100).toFixed(1)}%`);
  for (const porClasse of piloto.ruidoDoRevisor.porClasse) {
    linhas.push(
      `    - ${porClasse.classe}: ${porClasse.falsosPasses}/${porClasse.totalMutantes} falsos-passantes (${(porClasse.taxaDeFalsoPasse * 100).toFixed(1)}%)`,
    );
  }
  linhas.push(`  - decisão da calibração: ${decisao.aprovado ? `aprovada (${(decisao.taxaGeral * 100).toFixed(1)}% < limiar ${(decisao.limiar * 100).toFixed(1)}%)` : decisao.mensagem}`);
  linhas.push(
    `  - laço de revisão das ondas cheias: ${ligar ? 'PODE ser ligado (calibração aprovada no histórico)' : 'DESLIGADO — histórico vazio ou última medição reprovada (P-22 NÃO liga o laço; conserte o juiz antes)'}`,
  );
  return linhas.join('\n');
}

// ---------------------------------------------------------------------------
// A PORTA DAS ONDAS CHEIAS — sem o portão, NADA roda (contrato com o P-22)
// ---------------------------------------------------------------------------

/**
 * A BARREIRA das ondas cheias: --from F7+ (autoria em escala) exige o marker
 * do portão humano. Sem `aprovacao-f6.json` válido, RECUSA com
 * `F6_NAO_APROVADO` ANTES de qualquer chamada LLM (nem uma tarefa roda). Com
 * o marker, delega ao `runOndaDeAutoria` da F7. O P-22 integra ESTE gate na
 * maquinaria do laço/CLI: nenhum caminho alternativo existe, nenhuma flag o
 * fura.
 */
export async function rodarOndasCheias(
  dir: string,
  deps: DepsDaOndaAutoria,
  aulas: readonly DossieDeAula[],
): Promise<ResultadoOndaDeAutoria> {
  await garantirAprovacaoF6(dir); // F6_NAO_APROVADO sem o marker — falha antes de QUALQUER escrita
  return runOndaDeAutoria(deps, aulas);
}

// ---------------------------------------------------------------------------
// 5. O EXPERIMENTO 10×10 (A-P25-4)
// ---------------------------------------------------------------------------

/** Um par de aulas duplicado semanticamente (proxy jaccard do laço F11). */
export interface ParDuplicado {
  a: string;
  b: string;
  /** jaccard normalizado (0..1) entre os drafts das duas aulas. */
  jaccard: number;
}

/** Um draft autorado, pronto para a auditoria da trilha de brinquedo. */
export interface DraftDeBrinquedo {
  aula: string;
  dossie: Dossier;
  /** a teoria ESCRITA (estrutural — aceita o draft validado da F7). */
  draftAula: TeoriaEscrita;
  /** o desafio validado no envelope da F8. */
  desafio: SaidaDesafio;
}

/** Uma violação achada pela auditoria da trilha de brinquedo. */
export interface ViolacaoDeAuditoria {
  aula: string;
  regra: string;
  mensagem: string;
}

/** O resultado da auditoria: re-auditoria determinística dos drafts. */
export interface AuditoriaDeTrilhaDeBrinquedo {
  aulasAuditadas: number;
  violacoes: readonly ViolacaoDeAuditoria[];
}

/**
 * A AUDITORIA da TRILHA DE BRINQUEDO (função PURA, zero LLM): re-aplica os
 * gates de orçamento da engine sobre os drafts AUTORADOS e conta violações —
 * (A4) teoria fora do orçamento, (A2/A3) desafio fora do orçamento e (A6) a
 * DIREÇÃO PUXADA: o desafio precisa exercitar alguma construção NOVA da aula
 * (`introduces_productive`) — a dimensão que a autoria NÃO valida e que esta
 * auditoria pega de forma independente (mesma regra do `audit.ts` A6).
 *
 * ORÇAMENTO POR FAIXAS (§3.3, assinatura pós-fix-P-17): CADA superfície é
 * auditada contra a faixa PRÓPRIA do dossiê — a teoria contra a RECEPTIVA
 * (A4: o aluno LÊ a teoria), o `testsCode` contra a de TESTE (A3: o aluno lê
 * o teste ANTES da aula), o `starterCode` contra a RECEPTIVA (A1) e o
 * `solutionCode` contra a PRODUTIVA (A2) — nunca a união das três listas (a
 * união deixaria passar, por exemplo, um teste com construção só-produtiva).
 */
export function auditarTrilhaDeBrinquedo(drafts: readonly DraftDeBrinquedo[]): AuditoriaDeTrilhaDeBrinquedo {
  const violacoes: ViolacaoDeAuditoria[] = [];
  for (const draft of drafts) {
    // A4 — a teoria é LIDA pelo aluno (§3.3): só a faixa RECEPTIVA se aplica
    // (mesma regra de `validarDraftDeAula` da F7 — A4).
    const teoria = ofensasDeOrcamentoDaTeoria(draft.draftAula, new Set(draft.dossie.budget_receptivo));
    if (teoria.falhaDeParse !== null) {
      violacoes.push({
        aula: draft.aula,
        regra: 'A4-PARSE',
        mensagem: `bloco de código da teoria não parseia (seção ${teoria.falhaDeParse.secao}): ${teoria.falhaDeParse.mensagem}`,
      });
    }
    for (const ofensa of teoria.ofensas) {
      violacoes.push({
        aula: draft.aula,
        regra: 'A4',
        mensagem: `a teoria usa construção fora do orçamento: ${ofensa.construcao} — trecho "${ofensa.snippet}"`,
      });
    }
    // A2/A3 — §3.3: CADA superfície do desafio contra a faixa PRÓPRIA dela
    // (solutionCode ⊆ produtivo, starterCode ⊆ receptivo, testsCode ⊆ teste) —
    // nunca a união. O terceiro argumento carrega as `introduces_productive`
    // (A6 — a direção puxada é auditada ADIANTE por conta própria, com parse
    // próprio; aqui o gate devolve o veredito, que ignoramos).
    const faixas: FaixasDeOrcamentoDoDesafio = {
      receptivo: new Set(draft.dossie.budget_receptivo),
      produtivo: new Set(draft.dossie.budget_produtivo),
      teste: new Set(draft.dossie.budget_teste),
    };
    const desafio = ofensasDeOrcamentoDoDesafio(
      draft.desafio,
      faixas,
      new Set(draft.dossie.introduces_productive),
    );
    if (desafio.falhaDeParse !== null) {
      violacoes.push({
        aula: draft.aula,
        regra: 'A2-PARSE',
        mensagem: `código do desafio não parseia no campo ${desafio.falhaDeParse.campo}: ${desafio.falhaDeParse.mensagem}`,
      });
    }
    for (const ofensa of desafio.ofensas) {
      violacoes.push({
        aula: draft.aula,
        regra: 'A2-A3',
        mensagem: `o desafio usa construção fora do orçamento: ${ofensa.construcao} — trecho "${ofensa.snippet}"`,
      });
    }
    // A6 — DIREÇÃO PUXADA: a solução precisa exercitar a construção nova.
    const solucao = extractAtoms(draft.desafio.solutionCode, { fileName: 'desafio.mjs' });
    if (!solucao.ok) {
      violacoes.push({
        aula: draft.aula,
        regra: 'A6-PARSE',
        mensagem: `a solução do desafio não parseia: ${solucao.error.message}`,
      });
      continue;
    }
    const novas = new Set(draft.dossie.introduces_productive);
    const exercita = solucao.keys.some((chave) => novas.has(chave));
    if (!exercita) {
      violacoes.push({
        aula: draft.aula,
        regra: 'A6',
        mensagem: `o desafio NÃO exercita nenhuma construção nova da aula (${[...novas].join(', ') || '(nenhuma)'}) — só repete o que o aluno já sabia`,
      });
    }
  }
  return { aulasAuditadas: drafts.length, violacoes };
}

/**
 * DUPLICATA SEMÂNTICA entre pares de aulas: o MESMO proxy determinístico do
 * laço F11 (jaccard normalizado sobre os artefatos normalizados,
 * `review/loop.ts`) — NUNCA embedding real (declarado). Um par com jaccard ≥
 * `limiar` conta como duplicata. Função PURA.
 */
export function paresDuplicadosSemanticamente(
  conteudos: readonly { aula: string; conteudo: string }[],
  limiar: number = DUPLICATA_SEMANTICA_LIMIAR,
): { total: number; pares: readonly ParDuplicado[] } {
  if (!(limiar >= 0 && limiar <= 1)) {
    throw new F6Error('PILOTO_INVALIDO', `limiar de duplicata semântica fora de [0, 1]: ${limiar}`);
  }
  const pares: ParDuplicado[] = [];
  for (let i = 0; i < conteudos.length; i += 1) {
    for (let j = i + 1; j < conteudos.length; j += 1) {
      const jaccard = jaccardNormalizado(conteudos[i].conteudo, conteudos[j].conteudo);
      if (jaccard >= limiar) {
        pares.push({ a: conteudos[i].aula, b: conteudos[j].aula, jaccard });
      }
    }
  }
  return { total: pares.length, pares };
}

/** O resultado de UM REGIME (paralelo ou sequencial) do experimento 10×10. */
export interface ResultadoDeRegime {
  modo: 'paralelo' | 'sequencial';
  /** paralelo: ondas do scheduler (10 tarefas = 1 onda); sequencial: 1 por aula. */
  ondas: number;
  /** quantas das 10 aulas saíram VALIDADAS da autoria. */
  aulasAutoradas: number;
  estados: EstadoDeAulaNaOnda[];
  /** violações de orçamento da AUDITORIA da trilha de brinquedo. */
  violacoesDeOrcamento: number;
  /** pares de aulas duplicados semanticamente (proxy jaccard). */
  duplicatasSemanticas: { total: number; pares: readonly ParDuplicado[] };
  /** tokens de ENTRADA consumidos pelo regime (telemetria de usage). */
  tokensEntrada: number;
  /** tokens de SAÍDA produzidos pelo regime (telemetria de usage). */
  tokensSaida: number;
  /** chamadas LLM efetivas do regime. */
  chamadasLlm: number;
  /** latência total do regime, em ms. */
  latenciaMs: number;
}

/** O comparativo ´10 paralelas × 10 sequenciais` — resultado TIPADO (A-P25-4). */
export interface Comparativo10x10 {
  versao: '1';
  /** as 10 aulas do experimento (trilha NOVA de brinquedo). */
  aulas: string[];
  paralelo: ResultadoDeRegime;
  sequencial: ResultadoDeRegime;
}

/** Dependências do experimento — um TRANSPORTE NOVO POR REGIME (usage isolado). */
export interface DepsDe10x10 {
  /** cria um transporte LLM FRESCO — os tokens de cada regime ficam isolados. */
  criarLlm: () => EngineLlm;
  prover: DepsDaOndaAutoria['prover'];
  limiters: RateLimiters;
  escreverArquivo: EscreverArquivoFn;
  baseDir?: string;
  /** dossiês das 10 aulas DA TRILHA DE BRINQUEDO (nunca uma trilha real). */
  dossies: ReadonlyMap<string, Dossier>;
  tetoOnda?: number;
  quando?: string;
  /** telemetria opcional — anexa uma linha por regime (dados de telemetria). */
  telemetria?: TelemetriaFile;
  /** ledger opcional — anexa um checkpoint por regime (dados de ledger). */
  ledger?: Ledger;
  /** runId obrigatório quando o ledger é injetado (D-ÂNCORA-RUNID). */
  runId?: string;
}

/**
 * Roda UM regime (paralelo via `runOndaDeAutoria`/scheduler; sequencial com
 * o MESMO código de autoria — `autorizarAula` — um a um) e mede: auditoria
 * da trilha de brinquedo, duplicatas semânticas, tokens e latência.
 */
async function rodarRegimeDoExperimento(
  deps: DepsDe10x10,
  aulasDossie: readonly DossieDeAula[],
  modo: 'paralelo' | 'sequencial',
  dirDoRegime: string,
): Promise<ResultadoDeRegime> {
  const llm = deps.criarLlm();
  const registrados = new Map<string, string>(); // cópia dos drafts p/ auditoria
  const escreverComRegistro: EscreverArquivoFn = async (caminho, conteudo) => {
    registrados.set(caminho, conteudo);
    await deps.escreverArquivo(caminho, conteudo);
  };

  const inicio = performance.now();
  let resultado: ResultadoOndaDeAutoria;
  if (modo === 'paralelo') {
    resultado = await runOndaDeAutoria(
      {
        llm,
        prover: deps.prover,
        limiters: deps.limiters,
        escreverArquivo: escreverComRegistro,
        baseDir: dirDoRegime,
        tetoOnda: deps.tetoOnda ?? aulasDossie.length,
      },
      aulasDossie,
    );
  } else {
    // SEQUENCIAL — MESMO código de autoria (autorizarAula), uma aula por vez.
    const estados: EstadoDeAulaNaOnda[] = [];
    const executadas: string[] = [];
    for (const aula of aulasDossie) {
      const ref = aula.aula_slug;
      try {
        const r = await autorizarAula({ llm, prover: deps.prover, scheduler: { limiters: deps.limiters } }, aula);
        if (r.status === 'blocked') {
          estados.push({ aula_slug: ref, status: 'blocked', etapa: r.etapa, faltantes: r.faltantes, motivo: r.motivo, budgetHash: r.budgetHash });
          continue;
        }
        const relAula = caminhoDraftAula(ref);
        const relDesafio = caminhoDraftDesafio(ref);
        await escreverComRegistro(path.join(dirDoRegime, relAula), `${JSON.stringify(r.draftAula, null, 2)}\n`);
        await escreverComRegistro(path.join(dirDoRegime, relDesafio), `${JSON.stringify(r.desafio, null, 2)}\n`);
        estados.push({
          aula_slug: ref,
          status: 'validado',
          caminhos: { draftAula: relAula, draftDesafio: relDesafio },
          budgetHash: r.budgetHash,
        });
        executadas.push(ref);
      } catch (erro) {
        estados.push({ aula_slug: ref, status: 'falhou', erro: mensagemDe(erro) });
      }
    }
    resultado = { estados, ondas: aulasDossie.length, executadas, waves: [], warnings: [] };
  }
  const latenciaMs = performance.now() - inicio;

  // TOKENS/telemetria: o usage do transporte FRESCO deste regime.
  let tokensEntrada = 0;
  let tokensSaida = 0;
  let chamadasLlm = 0;
  for (const etapa of Object.values(llm.getAllStageUsage())) {
    tokensEntrada += etapa.promptTokens;
    tokensSaida += etapa.completionTokens;
    chamadasLlm += etapa.llmCalls;
  }

  // AUDITORIA da trilha de brinquedo: os drafts efetivamente autorados.
  const drafts: DraftDeBrinquedo[] = [];
  for (const aula of aulasDossie) {
    const ref = aula.aula_slug;
    const pa = registrados.get(path.join(dirDoRegime, caminhoDraftAula(ref)));
    const pd = registrados.get(path.join(dirDoRegime, caminhoDraftDesafio(ref)));
    if (pa === undefined || pd === undefined) continue; // aula não autorada
    let draftAula: TeoriaEscrita;
    let desafio: SaidaDesafio;
    try {
      draftAula = JSON.parse(pa) as TeoriaEscrita;
      desafio = JSON.parse(pd) as SaidaDesafio;
    } catch {
      continue; // draft ilegível no registro — não auditável (defesa)
    }
    if (!Array.isArray(draftAula.theory)) continue; // guarda estrutural
    drafts.push({ aula: ref, dossie: aula.dossie, draftAula, desafio });
  }
  const auditoria = auditarTrilhaDeBrinquedo(drafts);

  // DUPLICATA SEMÂNTICA entre pares de aulas (proxy jaccard do laço F11).
  const conteudos: { aula: string; conteudo: string }[] = [];
  for (const aula of aulasDossie) {
    const ref = aula.aula_slug;
    const pa = registrados.get(path.join(dirDoRegime, caminhoDraftAula(ref)));
    const pd = registrados.get(path.join(dirDoRegime, caminhoDraftDesafio(ref)));
    if (pa === undefined || pd === undefined) continue;
    conteudos.push({ aula: ref, conteudo: `${pa}\n${pd}` });
  }
  const duplicatasSemanticas = paresDuplicadosSemanticamente(conteudos);

  return {
    modo,
    ondas: modo === 'paralelo' ? resultado.ondas : aulasDossie.length,
    aulasAutoradas: resultado.estados.filter((e) => e.status === 'validado').length,
    estados: resultado.estados,
    violacoesDeOrcamento: auditoria.violacoes.length,
    duplicatasSemanticas,
    tokensEntrada,
    tokensSaida,
    chamadasLlm,
    latenciaMs,
  };
}

/**
 * O EXPERIMENTO 10×10 (A-P25-4): as MESMAS 10 aulas da trilha NOVA de
 * brinquedo autoradas (a) EM PARALELO — uma onda de 10 tarefas via
 * `runOndaDeAutoria` (scheduler) — e (b) EM SEQUENCIAL — o MESMO código de
 * autoria (`autorizarAula`), uma aula por vez. Compara violações de
 * orçamento (auditoria da trilha de brinquedo), duplicata semântica (proxy
 * jaccard sobre os drafts), tokens de entrada/saída e latência. Telemetria e
 * ledger OPIONAIS anexam uma linha por regime. Custo alto → os testes usam
 * FAKES (LLM fake com script determinístico) — NUNCA processos reais e NUNCA
 * uma trilha de produção (nunca `nodejs-do-zero`).
 *
 * Fail-closed: exatamente 10 aulas DISTINTAS, dossiê/snapshot para cada uma,
 * e `runId` quando o ledger é injetado.
 */
export async function medir10x10(deps: DepsDe10x10, orcamento: BudgetF4, dezAulas: string[]): Promise<Comparativo10x10> {
  if (dezAulas.length !== TAMANHO_DO_EXPERIMENTO_10X10) {
    throw new F6Error(
      'PILOTO_INVALIDO',
      `o experimento 10×10 exige EXATAMENTE ${TAMANHO_DO_EXPERIMENTO_10X10} aulas (recebidas ${dezAulas.length})`,
    );
  }
  if (new Set(dezAulas).size !== dezAulas.length) {
    throw new F6Error('PILOTO_INVALIDO', 'as 10 aulas do experimento precisam ser distintas');
  }

  const snapshots = derivarSnapshots(orcamento);
  const aulasDossie: DossieDeAula[] = dezAulas.map((ref) => {
    const dossie = deps.dossies.get(ref);
    if (dossie === undefined) {
      throw new F6Error('PILOTO_INVALIDO', `dossiê ausente para a aula do experimento: ${ref}`);
    }
    const snapshot = snapshots.find((s) => s.aula_slug === ref);
    if (snapshot === undefined) {
      throw new F6Error('PILOTO_INVALIDO', `aula ${ref} não existe no orçamento da trilha de brinquedo do experimento`);
    }
    return { aula_slug: ref, snapshot, dossie, desafios_anteriores: [] };
  });

  const raizDoExperimento = path.join(deps.baseDir ?? '', '10x10');
  const paralelo = await rodarRegimeDoExperimento(deps, aulasDossie, 'paralelo', path.join(raizDoExperimento, 'paralelo'));
  const sequencial = await rodarRegimeDoExperimento(deps, aulasDossie, 'sequencial', path.join(raizDoExperimento, 'sequencial'));

  const quando = deps.quando ?? new Date().toISOString();
  if (deps.telemetria !== undefined) {
    for (const regime of [paralelo, sequencial]) {
      await deps.telemetria.anexar({
        quando,
        tarefa: 'piloto-10x10',
        etapa: `F6-10x10-${regime.modo}`,
        tokensEntrada: regime.tokensEntrada,
        tokensSaida: regime.tokensSaida,
        latenciaMs: regime.latenciaMs,
        contagem: 1,
      });
    }
  }
  if (deps.ledger !== undefined) {
    if (deps.runId === undefined || deps.runId.trim() === '') {
      throw new F6Error('PILOTO_INVALIDO', 'ledger injetado no experimento exige runId (D-ÂNCORA-RUNID)');
    }
    for (const regime of [paralelo, sequencial]) {
      await deps.ledger.anexar({
        tipo: 'checkpoint',
        runId: deps.runId,
        descricao:
          `F6 10×10 — regime ${regime.modo}: ${regime.aulasAutoradas} aulas autoradas, ` +
          `${regime.violacoesDeOrcamento} violações de orçamento, ${regime.duplicatasSemanticas.total} pares duplicados, ` +
          `${regime.tokensEntrada + regime.tokensSaida} tokens`,
      });
    }
  }

  return congelarProfundamente({ versao: '1', aulas: [...dezAulas], paralelo, sequencial });
}