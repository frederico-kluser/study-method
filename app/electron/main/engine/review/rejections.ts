/**
 * app/electron/main/engine/review/rejections.ts — o LEDGER DE REJEIÇÕES
 * (pacote P-18, onda 3 do plano de execução v1 — o laço F11).
 *
 * Contrato normativo: `docs/16-engine-de-trilha.md` §6.7 — "Ledger de
 * rejeições — chave `regra | alvo_normalizado | conceito`, justificativa
 * obrigatória de ao menos 40 caracteres, importância nascendo em 2, +1 quando
 * a rejeição se confirma, −1 quando um pin a contradiz, removida em 0. O
 * estado `excecao_intencional` é OBRIGATÓRIO: 55% dos apontamentos não
 * resolvidos em produção são decisão de projeto intencional, e sem esse canal
 * o mesmo apontamento volta toda rodada e o laço nunca converge."
 *
 * MEMÓRIA entre rodadas do laço F11:
 *   - o CORRETOR rejeita um apontamento (verificou e o defeito NÃO se
 *     confirma — §7.4) → a rejeição é REGISTRADA com a chave do apontamento;
 *   - o MESMO apontamento voltar em rodada seguinte e ser rejeitado de novo
 *     CONFIRMA a rejeição (importância +1);
 *   - um PIN que contradiz a rejeição (o defeito existe, o pin está vermelho)
 *     desconta importância (−1) — a rejeição era engano; em 0 a entrada é
 *     REMOVIDA;
 *   - a rejeição CONFIRMADA (duas confirmações) vira **excecao_intencional**:
 *     decidir duas vezes que "é de propósito" de forma espelhada é a decisão
 *     de projeto do §6.7 — o apontamento nesse estado NÃO reabre rodada;
 *   - `marcarComoExcecaoIntencional` é o canal EXPLÍCITO (portão humano do
 *     repair também passa por aqui): nunca se INFERE exceção por ausência.
 *
 * A lista de excluídos: `idsExcluidosComoExcecao()` devolve os ids de
 * apontamentos em estado `excecao_intencional` — é ela que alimenta o campo
 * `excluidosComoExcecao` do prompt do planejador (P-13, WARNING-3: lista
 * DECLARADA, nunca inferida por ausência; `eExcecaoDeclarada` em
 * review/actionCatalog.ts dá o predicado que distingue a exceção do
 * SEM_MAPEAMENTO).
 *
 * Alvo NORMALIZADO: o trecho do alvo passa por `normalizarArtefato` (P-12) —
 * a chave é estável sob reformatação de autoria (o mesmo conceito numa versão
 * limpa de auto-avaliação gera a MESMA chave). O conceito da chave é a aula
 * que ensina (`evidencia.introduzido_em`) ou, na ausência, o token do alvo.
 *
 * FUNÇÕES PURAS + UMA classe de estado em memória: sem disco, sem LLM, sem
 * rede — zero dependências novas.
 */

import { TAMANHO_MINIMO_DE_JUSTIFICATIVA } from '../prompts/fixer';
import type { Apontamento } from './actionCatalog';
import { normalizarArtefato } from './normalize';

// ---------------------------------------------------------------------------
// Estado e chave
// ---------------------------------------------------------------------------

/** O estado de uma entrada: rejeição corrente ou EXCEÇÃO INTENCIONAL. */
export type EstadoDeRejeicao = 'rejeitado' | 'excecao_intencional';

/**
 * A chave de uma rejeição — `regra | alvo_normalizado | conceito` (§6.7).
 * Literal e legível; o mesmo apontamento em rodadas diferentes gera a MESMA
 * chave (o alvo é NORMALIZADO e o conceito é estável).
 */
export interface MaterialDeRejeicao {
  /** a regra violada declarada no apontamento (ex.: 'C1'). */
  regra: string;
  /** o alvo NORMALIZADO (normalizarArtefato do trecho do alvo). */
  alvo_normalizado: string;
  /** o conceito: aula que ensina (`introduzido_em`) ou o token do alvo. */
  conceito: string;
}

/** A chave fechada do ledger: `regra | alvo_normalizado | conceito` (§6.7). */
export function chaveDeRejeicao(material: MaterialDeRejeicao): string {
  return `${material.regra} | ${material.alvo_normalizado} | ${material.conceito}`;
}

/** Justificativa válida — a régua do §6.7: ao menos 40 caracteres. */
export function justificativaDeRejeicaoValida(justificativa: string): boolean {
  return justificativa.trim().length >= TAMANHO_MINIMO_DE_JUSTIFICATIVA;
}

/** Importância inicial de uma rejeição (nasce em 2 — §6.7). */
export const IMPORTANCIA_INICIAL = 2;

/** Removida em 0 (§6.7). */
export const IMPORTANCIA_MINIMA = 0;

/**
 * Em quantas CONFIRMAÇÕES uma rejeição vira excecao_intencional: a MESMA
 * rejeição confirmada duas vezes (a 2ª vez que o corretor rejeita por
 * evidência não confirmada) é decisão de projeto espelhada — promove.
 * (1ª rejeição: cria (2). 2ª confirmação: +1 (3) e promove.)
 */
export const CONFIRMACOES_PARA_EXCECAO = 2;

/** Uma entrada do ledger. */
export interface RejeicaoRegistrada {
  chave: string;
  regra: string;
  alvo_normalizado: string;
  conceito: string;
  importancia: number;
  estado: EstadoDeRejeicao;
  justificativa: string;
  criada_na_rodada: number;
  confirmacoes: number;
  contradicoes: number;
  /** todos os ids de apontamento associados a esta chave (para a lista de excluídos). */
  apontamentos_ids: readonly string[];
}

/** O resultado de uma operação de registro (mutação + entrada vigente). */
export interface MutacaoDeRejeicao {
  entrada: RejeicaoRegistrada;
  criada: boolean;
  /** a rejeição foi PROMOVIDA a excecao_intencional nesta operação. */
  promovida: boolean;
  /** invalidada por justificativa curta demais (nada registrado). */
  invalida: boolean;
}

// ---------------------------------------------------------------------------
// Ajudantes de material — do apontamento para a chave
// ---------------------------------------------------------------------------

/**
 * O material da chave a partir do apontamento + o conteúdo do artefato alvo
 * (para normalizar o trecho do span). `conteudo` ausente → o alvo
 * normalizado cai para o token (a chave continua estável entre rodadas, pois
 * o token é campo obrigatório do apontamento). FUNÇÃO PURA.
 */
export function materialDoApontamento(
  apontamento: Apontamento,
  conteudo: string | null,
): MaterialDeRejeicao {
  let alvoCru = apontamento.alvo.token;
  if (conteudo !== null) {
    const [inicio, fim] = apontamento.alvo.span;
    if (inicio >= 0 && fim >= inicio && fim <= conteudo.length) {
      const slice = conteudo.slice(inicio, fim).trim();
      if (slice.length > 0) alvoCru = slice;
    }
  }
  return {
    regra: apontamento.regra_violada,
    alvo_normalizado: normalizarArtefato(alvoCru),
    conceito: apontamento.evidencia.introduzido_em ?? apontamento.alvo.token,
  };
}

// ---------------------------------------------------------------------------
// O ledger — estado em memória
// ---------------------------------------------------------------------------

/**
 * O ledger de rejeições do laço F11 (§6.7). O laço instancia UM ledger por
 * execução e o reutiliza entre rodadas — é a memória que impede o mesmo
 * apontamento de reabrir rodada toda iteração.
 */
export class LedgerDeRejeicoes {
  private readonly _entradas = new Map<string, RejeicaoRegistrada>();

  get entradas(): readonly RejeicaoRegistrada[] {
    return [...this._entradas.values()];
  }

  temEntrada(chave: string): boolean {
    return this._entradas.has(chave);
  }

  entradaPorChave(chave: string): RejeicaoRegistrada | undefined {
    return this._entradas.get(chave);
  }

  /**
   * REGISTRA (ou CONFIRMA) uma rejeição. Justificativa < 40 caracteres →
   * operação INVÁLIDA (nada registrado — FAIL-CLOSED; a régua do §6.7 é
   * obrigatória). Entrada nova nasce com importância 2; entrada existente
   * ganha +1 de confirmação e, ao atingir `CONFIRMACOES_PARA_EXCECAO`, é
   * PROMOVIDA a `excecao_intencional` (decisão de projeto espelhada).
   */
  registrarRejeicao(opts: {
    material: MaterialDeRejeicao;
    justificativa: string;
    rodada: number;
    apontamento_id: string;
  }): MutacaoDeRejeicao {
    if (!justificativaDeRejeicaoValida(opts.justificativa)) {
      return {
        entrada: {
          chave: chaveDeRejeicao(opts.material),
          regra: opts.material.regra,
          alvo_normalizado: opts.material.alvo_normalizado,
          conceito: opts.material.conceito,
          importancia: 0,
          estado: 'rejeitado',
          justificativa: opts.justificativa,
          criada_na_rodada: opts.rodada,
          confirmacoes: 0,
          contradicoes: 0,
          apontamentos_ids: [],
        },
        criada: false,
        promovida: false,
        invalida: true,
      };
    }
    const chave = chaveDeRejeicao(opts.material);
    const existente = this._entradas.get(chave);
    if (existente === undefined) {
      const entrada: RejeicaoRegistrada = {
        chave,
        regra: opts.material.regra,
        alvo_normalizado: opts.material.alvo_normalizado,
        conceito: opts.material.conceito,
        importancia: IMPORTANCIA_INICIAL,
        estado: 'rejeitado',
        justificativa: opts.justificativa.trim(),
        criada_na_rodada: opts.rodada,
        confirmacoes: 0,
        contradicoes: 0,
        apontamentos_ids: [opts.apontamento_id],
      };
      this._entradas.set(chave, entrada);
      return { entrada, criada: true, promovida: false, invalida: false };
    }
    // Confirmação: +1 importância, registra o id (se novo) e promove quando
    // a MESMA rejeição se confirma `CONFIRMACOES_PARA_EXCECAO` vezes.
    const confirmacoes = existente.confirmacoes + 1;
    const ids = existente.apontamentos_ids.includes(opts.apontamento_id)
      ? existente.apontamentos_ids
      : [...existente.apontamentos_ids, opts.apontamento_id];
    const promovida = confirmacoes >= CONFIRMACOES_PARA_EXCECAO && existente.estado !== 'excecao_intencional';
    const atualizada: RejeicaoRegistrada = {
      ...existente,
      importancia: existente.importancia + 1,
      confirmacoes,
      contradicoes: existente.contradicoes,
      apontamentos_ids: ids,
      justificativa: opts.justificativa.trim(),
      estado: promovida ? 'excecao_intencional' : existente.estado,
    };
    this._entradas.set(chave, atualizada);
    return { entrada: atualizada, criada: false, promovida, invalida: false };
  }

  /**
   * UM PIN contradiz a rejeição (o defeito existe — o pin está vermelho):
   * importância −1; em 0 a entrada é REMOVIDA (§6.7).
   */
  contradizerComPin(material: MaterialDeRejeicao): boolean {
    const chave = chaveDeRejeicao(material);
    const existente = this._entradas.get(chave);
    if (existente === undefined) return false;
    const importancia = existente.importancia - 1;
    if (importancia <= IMPORTANCIA_MINIMA) {
      this._entradas.delete(chave);
      return false; // removida
    }
    this._entradas.set(chave, {
      ...existente,
      importancia,
      contradicoes: existente.contradicoes + 1,
    });
    return true;
  }

  /**
   * O canal EXPLÍCITO de exceção intencional (§6.7): marca uma chave (portão
   * humano do repair / decisão de projeto). Devolve `false` quando a chave
   * não existe — NUNCA se cria entrada por marcação (exceção declarada exige
   * rejeição registrada antes).
   */
  marcarComoExcecaoIntencional(material: MaterialDeRejeicao): boolean {
    const chave = chaveDeRejeicao(material);
    const existente = this._entradas.get(chave);
    if (existente === undefined) return false;
    this._entradas.set(chave, { ...existente, estado: 'excecao_intencional' });
    return true;
  }

  /** O apontamento está EXCLUÍDO (excecao_intencional)? — não reabre rodada. */
  eExcecaoIntencional(material: MaterialDeRejeicao): boolean {
    const existente = this._entradas.get(chaveDeRejeicao(material));
    return existente !== undefined && existente.estado === 'excecao_intencional';
  }

  /**
   * Os ids DECLARADOS de excluídos — a lista que alimenta
   * `excluidosComoExcecao` do prompt do planejador (P-13, WARNING-3).
   */
  idsExcluidosComoExcecao(): string[] {
    const ids = new Set<string>();
    for (const entrada of this._entradas.values()) {
      if (entrada.estado !== 'excecao_intencional') continue;
      for (const id of entrada.apontamentos_ids) ids.add(id);
    }
    return [...ids];
  }

  /** Renderização verbatim para o prompt do planejador (§6.7 / P-13). */
  renderizar(): string {
    if (this._entradas.size === 0) return '';
    const linhas = [...this._entradas.values()].map(
      (e) => `- ${e.chave}: importância ${e.importancia} · estado ${e.estado} — justificativa: ${e.justificativa}`,
    );
    return ['LEDGER DE REJEIÇÕES (docs §6.7):', ...linhas].join('\n');
  }
}