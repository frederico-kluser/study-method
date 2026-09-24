/**
 * app/electron/main/engine/review/loopCorrecao.ts — o passo 5 da rodada do
 * laço F11 (PLANEJADOR → CORRETOR, catálogo FECHADO, gate do diff) e a
 * re-verificação parcial (§6.7). Extraído de `rodarRodadaInterna` na refatoração
 * do lote L05 sem NENHUMA mudança de comportamento.
 */

import {
  isRejeicaoDoCorretor,
  validarDiffNoSpan,
  type DecisaoDoCorretor,
  type DiffDeArquivo,
  type RejeicaoDoCorretor,
} from '../prompts/fixer';
import {
  defeitoSemMapeamento,
  validarAcaoParaApontamento,
  type AcaoCatalogo,
  type Apontamento,
  type DefeitoDoCatalogo,
  type SpanDeArquivo,
} from './actionCatalog';
import { materialDoApontamento } from './rejections';
import type { PinDeRegressao, VereditoDePin } from './prover';
import { aplicarDelta } from './loopPrimitivas';
import { chamarSeguro } from './loopEstado';
import type { AcaoDoPlano, ContextoDoLaco, CorrecaoAplicada, SessaoDoLaco } from './loopTipos';

/** Tudo o que o planejador→corretor produz (as seis saídas observáveis). */
export interface SaidasDoPlanoDeCorrecao {
  defeitosDoCatalogo: DefeitoDoCatalogo[];
  plano: AcaoDoPlano[];
  correcoes: CorrecaoAplicada[];
  rejeicoesDoCorretor: RejeicaoDoCorretor[];
  correcoesInvalidas: { apontamento_id: string; motivo: string }[];
  rejeicoesPorPinQuebrado: { apontamento_id: string; pin_id: string }[];
}

interface OpcoesDaCorrecao {
  ctx: ContextoDoLaco;
  sessao: SessaoDoLaco;
  rodada: number;
  agir: readonly Apontamento[];
  /** ids DECLARADOS de excluídos (excecao_intencional — P-13 WARNING-3). */
  excluidos: readonly string[];
  comPin: readonly { apontamento: Apontamento; pin: PinDeRegressao }[];
  vereditosDePins: readonly VereditoDePin[];
  verdesAntes: ReadonlySet<string>;
}

/**
 * (5) PLANEJADOR → CORRETOR (catálogo FECHADO; gate do diff). A ação fora do
 * catálogo ou de polaridade errada vira DEFEITO DO CATÁLOGO; o plano órfão
 * também (§7.3) — nunca ação improvisada.
 */
export async function planejarECorrigir(o: OpcoesDaCorrecao): Promise<SaidasDoPlanoDeCorrecao> {
  const saida: SaidasDoPlanoDeCorrecao = {
    defeitosDoCatalogo: [],
    plano: [],
    correcoes: [],
    rejeicoesDoCorretor: [],
    correcoesInvalidas: [],
    rejeicoesPorPinQuebrado: [],
  };
  const { ctx, sessao, rodada, agir, excluidos } = o;
  if (agir.length === 0) return saida;

  const planoDoModelo = await chamarSeguro(
    'planejador',
    () =>
      ctx.llm.planejar({
        trilha: ctx.trilha,
        rodada,
        apontamentos: agir,
        excluidosComoExcecao: excluidos,
        ledgerDeRejeicoes: sessao.ledger.renderizar(),
      }),
    ctx,
  );
  for (const acao of [...planoDoModelo.acoes].sort((a, b) => a.posicao - b.posicao)) {
    saida.plano.push(acao);
    const alvo = agir.find((a) => a.id === acao.apontamento_id);
    if (alvo === undefined) {
      // O plano referencia apontamento que não sobreviveu — defeito ESTRUTURADO
      // do laço (nunca ação improvisada; §7.3).
      saida.defeitosDoCatalogo.push(
        defeitoSemMapeamento(acao.apontamento_id, `plano referencia apontamento inexistente "${acao.apontamento_id}" — o apontamento morreu no provador ou foi excluído`),
      );
      continue;
    }
    const validacao = validarAcaoParaApontamento(alvo, acao.acao);
    if (!validacao.ok) {
      saida.defeitosDoCatalogo.push(validacao.defeito);
      continue;
    }
    await aplicarCorrecao({ ...o, alvo, acao, acaoValida: validacao.plano.acao, saida });
  }
  return saida;
}

interface OpcoesDaAplicacao extends OpcoesDaCorrecao {
  alvo: Apontamento;
  acao: AcaoDoPlano;
  acaoValida: AcaoCatalogo;
  saida: SaidasDoPlanoDeCorrecao;
}

/** Uma ação do plano: corretor (verify-first) → gate do diff → re-verificação. */
async function aplicarCorrecao(o: OpcoesDaAplicacao): Promise<void> {
  const { ctx, sessao, rodada, alvo, acao, saida } = o;
  const decisao: DecisaoDoCorretor = {
    apontamento: alvo,
    acao: o.acaoValida,
    alvo: { arquivo: acao.alvo.arquivo, span: acao.alvo.span as SpanDeArquivo },
    resultado_esperado: acao.resultado_esperado,
  };
  const resultadoDoCorretor = await chamarSeguro(
    `corretor:${alvo.id}`,
    () =>
      ctx.llm.corrigir({
        trilha: ctx.trilha,
        rodada,
        decisao,
        pins: sessao.pins.renderizar(),
      }),
    ctx,
  );

  if (isRejeicaoDoCorretor(resultadoDoCorretor)) {
    registrarRejeicaoDoCorretor(o, resultadoDoCorretor);
    return;
  }

  // Corretor ACEITOU: o GATE do span é lei (§7.4) — diff fora do span ou
  // malformado invalida a correção inteira; artefato inexistente idem.
  const artefatoAlvo = sessao.artefatos.get(decisao.alvo.arquivo);
  if (artefatoAlvo === undefined) {
    saida.correcoesInvalidas.push({ apontamento_id: alvo.id, motivo: `arquivo "${decisao.alvo.arquivo}" não existe no laço` });
    return;
  }
  const diff: DiffDeArquivo = { arquivo: decisao.alvo.arquivo, trechos: resultadoDoCorretor.delta };
  const gate = validarDiffNoSpan(diff, decisao.alvo.span);
  if (!gate.ok) {
    saida.correcoesInvalidas.push({ apontamento_id: alvo.id, motivo: 'diff fora do span ou malformado — gate §7.4 (fail-closed)' });
    return;
  }
  const antes = artefatoAlvo.conteudo;
  const depois = aplicarDelta(antes, resultadoDoCorretor.delta);
  if (depois === antes) {
    saida.correcoesInvalidas.push({ apontamento_id: alvo.id, motivo: 'corretor devolveu delta que não muda nada' });
    return;
  }

  // ── (6) RE-VERIFICAÇÃO PARCIAL: TODOS os pins (regressão roda já) ───────
  artefatoAlvo.conteudo = depois;
  const vereditosPos = await sessao.pins.todosRodam();
  const quebrouVerde = vereditosPos.some((v) => o.verdesAntes.has(v.pin.id) && !v.verde);
  if (quebrouVerde) {
    // Correção que quebra pin verde é REJEITADA (§6.7) — o artefato volta.
    artefatoAlvo.conteudo = antes;
    const primeiroQuebrado = vereditosPos.find((v) => o.verdesAntes.has(v.pin.id) && !v.verde);
    saida.rejeicoesPorPinQuebrado.push({ apontamento_id: alvo.id, pin_id: primeiroQuebrado?.pin.id ?? '?' });
    return;
  }
  artefatoAlvo.ultimaEdicao = rodada;
  saida.correcoes.push({
    apontamento_id: alvo.id,
    acao: decisao.acao,
    arquivo: decisao.alvo.arquivo,
    span: decisao.alvo.span,
    delta: resultadoDoCorretor.delta,
  });
}

/** O DIREITO DE REJEITAR (§7.4): vai para o LEDGER, com reconciliação por pin. */
function registrarRejeicaoDoCorretor(o: OpcoesDaAplicacao, resultadoDoCorretor: RejeicaoDoCorretor): void {
  const { sessao, rodada, alvo, saida } = o;
  const conteudo = sessao.artefatos.get(alvo.alvo.caminho)?.conteudo ?? null;
  const material = materialDoApontamento(alvo, conteudo);
  const mutacao = sessao.ledger.registrarRejeicao({
    material,
    justificativa: resultadoDoCorretor.justificativa,
    rodada,
    apontamento_id: alvo.id,
  });
  saida.rejeicoesDoCorretor.push(resultadoDoCorretor);
  if (mutacao.invalida) return;
  const pinDoApontamento = o.comPin.find((c) => c.apontamento.id === alvo.id)?.pin;
  if (pinDoApontamento !== undefined && o.vereditosDePins.some((v) => v.pin.id === pinDoApontamento.id && !v.verde)) {
    // Um pin VERMELHO do mesmo apontamento CONTRADIZ a rejeição (§6.7).
    sessao.ledger.contradizerComPin(material);
  }
}
