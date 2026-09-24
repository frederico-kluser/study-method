/**
 * app/electron/main/engine/review/loopParada.ts — a CASCATA DE PARADA (§6.6)
 * do laço de revisão F11 (`loop.ts`): mecânica, ping-pong, rollback, estagnação
 * (proxy Jaccard) e failsafe. Extraída de `rodarRodadaInterna` na refatoração
 * do lote L05 sem NENHUMA mudança de comportamento.
 */

import type { Apontamento } from './actionCatalog';
import {
  LIMIAR_DEFAULT_DE_ESTAGNACAO,
  TOLERANCIA_DEFAULT_DE_ROLLBACK,
  type ContextoDoLaco,
  type ParadaDeRodada,
  type PlacarDeEscalada,
  type SessaoDoLaco,
} from './loopTipos';
import {
  avaliarParadaMecanica,
  distanciaDeArtefatos,
  hashDoConjunto,
} from './loopPrimitivas';
import { guardarEstado, mapaToStrings, restaurarMenorScore, restaurarYAnterior } from './loopEstado';

/** O snapshot do estado pós-rodada nos históricos (ping-pong e estagnação). */
export function empurrarHistorico(sessao: SessaoDoLaco, bloqueantes: number): void {
  sessao.hashes.push(hashDoConjunto(sessao.artefatos));
  sessao.estados.push(mapaToStrings(sessao.artefatos));
  sessao.bloqueantesPorRodada.push(bloqueantes);
  if (sessao.estados.length >= 2) {
    sessao.distancias.push(
      distanciaDeArtefatos(sessao.estados[sessao.estados.length - 2], sessao.estados[sessao.estados.length - 1]),
    );
  }
}

/** 1 — PING-PONG: hash(y_t) == hash(y_t-2) != hash(y_t-1) → menor score. */
function ePingPong(sessao: SessaoDoLaco): boolean {
  return (
    sessao.hashes.length >= 3 &&
    sessao.hashes[sessao.hashes.length - 1] === sessao.hashes[sessao.hashes.length - 3] &&
    sessao.hashes[sessao.hashes.length - 1] !== sessao.hashes[sessao.hashes.length - 2]
  );
}

/**
 * 3 — ESTAGNOU (PROXY DECLARADO): 2 rodadas seguidas com distância < limiar
 * E o número de bloqueantes não caiu.
 */
function eEstagnacao(sessao: SessaoDoLaco, limiar: number): boolean {
  return (
    sessao.distancias.length >= 2 &&
    sessao.distancias[sessao.distancias.length - 1] < limiar &&
    sessao.distancias[sessao.distancias.length - 2] < limiar &&
    sessao.bloqueantesPorRodada.length >= 2 &&
    sessao.bloqueantesPorRodada[sessao.bloqueantesPorRodada.length - 1] >=
      sessao.bloqueantesPorRodada[sessao.bloqueantesPorRodada.length - 2]
  );
}

/** A CASCATA DE PARADA (6.6), na ordem em que dispara. */
export function avaliarCascataDeParada(o: {
  ctx: ContextoDoLaco;
  sessao: SessaoDoLaco;
  rodada: number;
  teto: number;
  scoreAntes: number;
  scoreDepois: number;
  violacoesFinais: number;
  provasFinais: number;
  pinsFalhandoFinal: number;
  bloqueantesOuCorrigir: readonly Apontamento[];
  semExcecao: readonly Apontamento[];
}): { parada: ParadaDeRodada; escalada: PlacarDeEscalada | null } {
  const tolerancia = o.ctx.toleranciaDeRollback ?? TOLERANCIA_DEFAULT_DE_ROLLBACK;
  const limiar = o.ctx.limiarDeEstagnacao ?? LIMIAR_DEFAULT_DE_ESTAGNACAO;

  let parada: ParadaDeRodada = 'nenhuma';
  let escalada: PlacarDeEscalada | null = null;

  // 0 — MECÂNICA (o oráculo; aprovação do revisor NÃO entra aqui).
  if (
    avaliarParadaMecanica({
      violacoesOrcamento: o.violacoesFinais,
      testesFalhando: o.provasFinais,
      pinsFalhando: o.pinsFalhandoFinal,
      apontamentosBloqueantesOuCorrigir: o.bloqueantesOuCorrigir.length,
    })
  ) {
    parada = 'mecanico';
  }
  // 1 — PING-PONG: hash(y_t) == hash(y_t-2) != hash(y_t-1) → menor score.
  else if (ePingPong(o.sessao)) {
    restaurarMenorScore(o.sessao);
    // O estado restaurado é o estado REAL do fim da rodada — o histórico é
    // refeito para que as rodadas seguintes comparem contra a verdade.
    empurrarHistorico(o.sessao, o.bloqueantesOuCorrigir.length);
    parada = 'pingpong';
  }
  // 2 — ROLLBACK: score_erro_t > score_erro_t-1 + 0,10 → volta y_{t-1}.
  else if (o.scoreDepois > o.scoreAntes + tolerancia) {
    restaurarYAnterior(o.sessao);
    // O estado restaurado volta a ser a base da próxima rodada; re-guardamos
    // o score restaurado e o histórico fiel (§6.7).
    guardarEstado(o.sessao, o.rodada, o.scoreAntes);
    empurrarHistorico(o.sessao, o.bloqueantesOuCorrigir.length);
    parada = 'rollback';
  }
  // 3 — ESTAGNOU (PROXY DECLARADO).
  else if (eEstagnacao(o.sessao, limiar)) {
    parada = 'estagnou';
  }
  // 4 — FAILSAFE: rodada final sem convergir → ESCALA, nunca aceita. O teto
  // é o CLAMPED (a mesma conta da guarda): mesmo com `rodadasMaximas` bruto
  // acima do teto duro na chamada avulsa, a rodada final DENTRO do teto já
  // emite o placar (a próxima chamada lançaria RODADAS_ESGOTADAS).
  else if (o.rodada >= o.teto) {
    parada = 'failsafe';
    escalada = {
      quality_warning: true,
      rodada: o.rodada,
      score_erro: o.scoreDepois,
      apontamentos: o.semExcecao,
      motivo:
        `rodada ${o.rodada} de ${o.teto} sem que a parada 0 MECÂNICA fosse atendida — ` +
        'ESCALA com placar (quality_warning): nunca aceitar por cansaço (§6.6 failsafe).',
    };
  }

  return { parada, escalada };
}

