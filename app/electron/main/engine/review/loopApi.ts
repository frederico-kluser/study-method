/**
 * app/electron/main/engine/review/loopApi.ts — a API PÚBLICA do laço de revisão
 * F11 (`loop.ts`). Extraído do módulo original na refatoração do lote L05 sem
 * NENHUMA mudança de comportamento — a fachada `loop.ts` re-exporta tudo isto.
 */

import {
  ErroEstruturadoDoLaco,
  TETO_DE_RODADAS,
  type ContextoDoLaco,
  type PlacarDeEscalada,
  type ResultadoDeRodada,
  type ResultadoDoLaco,
  type SessaoDoLaco,
  type TipoDeParada,
} from './loopTipos';
import { calcularRodadasMaximas } from './loopPrimitivas';
import { criarSessaoDeRevisao } from './loopEstado';
import { rodarRodadaInterna } from './loopRodada';

// ---------------------------------------------------------------------------
// A API pública do laço
// ---------------------------------------------------------------------------

/**
 * UMA rodada de revisão (barreira própria, §6.1). Com `sessao` ausente, cria
 * uma sessão nova (rodada 1 do zero). Com `sessao`, roda a PRÓXIMA rodada da
 * mesma execução (compartilhando pins, ledger e version buffer).
 *
 * TETO (§6.6) — VALE AQUI TAMBÉM: `rodarRodadaDeRevisao` NUNCA roda além de
 * `rodadasMaximas` (default 1, teto duro 3). Se a sessão já rodou o teto
 * (ex.: 2ª chamada com `rodadasMaximas: 1`), a chamada LANÇA
 * `ErroEstruturadoDoLaco` com código `RODADAS_ESGOTADAS` — a garantia
 * "nenhum caminho roda mais que maxRodadas" cobre TODA a superfície pública.
 */
export async function rodarRodadaDeRevisao(ctx: ContextoDoLaco, sessao?: SessaoDoLaco): Promise<ResultadoDeRodada> {
  const sessaoViva = sessao ?? criarSessaoDeRevisao(ctx);
  return rodarRodadaInterna(ctx, sessaoViva);
}

/**
 * O LAÇO COMPLETO (F11): roda EXATAMENTE `rodadasMaximas` rodadas (constante,
 * default 1, teto duro 3) — JAMAIS um laço condicionado a apontamento do
 * revisor. A parada 0 MECÂNICA interrompe antes; a rodada final sem convergir
 * vira FAILSAFE com placar (nunca aceita por cansaço).
 *
 * `sessao` opcional: quando fornecida (ex.: o repair P-23 ou a suíte que já
 * semeou pins/exceções), o laço roda SOBRE ela em vez de criar uma nova.
 */
/** A parada de uma rodada encerra o laço? (mecânica, ping-pong, estagnação, failsafe.) */
function eParadaDefinitiva(parada: ResultadoDeRodada['parada']): parada is TipoDeParada {
  return parada === 'mecanico' || parada === 'pingpong' || parada === 'estagnou' || parada === 'failsafe';
}

/**
 * O placar de escalada da rodada final — a última rodada já o emite no
 * failsafe; quando falta (redundância defensiva), o laço o monta aqui.
 */
function montarEscaladaFinal(rodadas: readonly ResultadoDeRodada[], paradaFinal: TipoDeParada): PlacarDeEscalada | null {
  const ultima = rodadas[rodadas.length - 1];
  return rodadas.length === 0
    ? null
    : ultima.escalada ??
      (paradaFinal === 'failsafe'
        ? {
            quality_warning: true,
            rodada: ultima.rodada,
            score_erro: ultima.scoreDepois,
            apontamentos: ultima.sobreviventesAoProvador.filter(
              (a) => !ultima.excluidosComoExcecao.includes(a.id) && a.severity !== 'sugestao',
            ),
            motivo:
              'rodadas esgotadas sem parada 0 mecânica — ESCALA com placar: nunca aceitar por cansaço (§6.6 failsafe).',
          }
        : null);
}

export async function rodarLacoDeRevisao(ctx: ContextoDoLaco, sessao?: SessaoDoLaco): Promise<ResultadoDoLaco> {
  const rodadasMaximas = calcularRodadasMaximas(ctx);
  const contexto: ContextoDoLaco = { ...ctx, rodadasMaximas };
  const sessaoViva = sessao ?? criarSessaoDeRevisao(contexto);
  if (sessaoViva.rodadaAtual >= rodadasMaximas) {
    // Sessão semeada JÁ esgotada desde antes do laço — nem uma rodada a mais:
    // fail-closed (a guarda de `rodarRodadaInterna` faria o mesmo na 1ª
    // chamada; aqui o erro é ESTRUTURADO e imediato, sem rodar nada).
    throw new ErroEstruturadoDoLaco({
      codigo: 'RODADAS_ESGOTADAS',
      etapa: 'laco',
      mensagem:
        `a sessão já rodou ${sessaoViva.rodadaAtual} rodada(s) do teto ${rodadasMaximas} (teto duro ${TETO_DE_RODADAS}) — ` +
        'o laço não tem rodada alguma a rodar (§6.6): falha estruturada, nunca rodada extra em silêncio.',
    });
  }
  const rodadas: ResultadoDeRodada[] = [];

  let paradaFinal: TipoDeParada | null = null;
  for (let r = 1; r <= rodadasMaximas; r += 1) {
    const rodada = await rodarRodadaInterna(contexto, sessaoViva);
    rodadas.push(rodada);
    if (eParadaDefinitiva(rodada.parada)) {
      paradaFinal = rodada.parada;
      break;
    }
    // 'nenhuma' e 'rollback' (ação, não parada): continua para a próxima
    // rodada se houver (r < rodadasMaximas).
  }

  // O `for` é NUMÉRICO e limitado: terminou sem break → rodadasMaximas rodadas
  // foram rodadas (a última já emitiria failsafe; redundância defensiva).
  if (paradaFinal === null) {
    paradaFinal = 'failsafe';
  }

  const ultima = rodadas[rodadas.length - 1];
  const escalada = montarEscaladaFinal(rodadas, paradaFinal);

  return {
    rodadas,
    paradaFinal,
    acessado: paradaFinal === 'mecanico',
    escalada,
    scoreFinal: ultima?.scoreDepois ?? 0,
    artefatosFinais: [...sessaoViva.artefatos.values()].map((a) => ({ ...a })),
  };
}