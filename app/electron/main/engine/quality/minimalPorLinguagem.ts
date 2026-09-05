/**
 * app/electron/main/engine/quality/minimalPorLinguagem.ts — O DESPACHANTE do
 * sintetizador de solução mínima.
 *
 * UMA pergunta, N implementações. "Qual é o menor código que o teste aceita?"
 * é a mesma pergunta em toda linguagem; a RESPOSTA é escrita em cada uma delas,
 * e por isso cada linguagem tem o seu arquivo:
 *
 *   javascript  ->  `quality/minimal.ts`        (`export function` + `return`)
 *   python      ->  `quality/minimalPython.ts`  (`print` e `def`, indentado)
 *
 * ─── POR QUE ESTE ARQUIVO EXISTE (o defeito MEDIDO que ele fecha) ──────────
 *
 * O comando `coverage` do CLI chamava `sintetizarCodigoMinimo` DIRETO, sem
 * dizer a linguagem — e aquele módulo é javascript-only por decisão declarada.
 * Na única trilha real do produto (`python`) o resultado medido em
 * `main@26dbc19` foi `parse-falhou` nos 21 desafios: nada foi medido, e o
 * comando ainda assim saía 0. Este despachante é o ponto onde a LINGUAGEM DA
 * TRILHA passa a decidir quem sintetiza.
 *
 * ─── FAIL-CLOSED (a convenção do repositório) ──────────────────────────────
 *
 * A tabela é EXPLÍCITA, no mesmo espírito de `CAMINHADA_POR_LINGUAGEM`
 * (`engine/extract.ts`): linguagem registrada mas SEM sintetizador LANÇA
 * `EngineLinguagemError` — nunca cai no sintetizador de JavaScript, porque
 * sintetizar Python com o gerador de JavaScript produziria candidatos que nem
 * compilam e um `SEM_SOLUCAO_ACESSIVEL` FALSO: o pior resultado possível,
 * porque se parece com sinal legítimo. `getAdapter` já é fail-closed para id
 * desconhecido; esta tabela cobre o degrau seguinte.
 */

import { EngineLinguagemError } from '../extract';
import { DEFAULT_ADAPTER_ID, getAdapter, type LanguageId } from '../lang/registry';
import type { ProverDeDesafio } from '../phases/f9Verifier';
import { sintetizarCodigoMinimo, type MinimalCtx, type MinimalVerdict } from './minimal';
import { sintetizarCodigoMinimoPython } from './minimalPython';

/** Quem sintetiza a solução mínima de cada linguagem. */
export type SintetizadorMinimo = (
  prover: ProverDeDesafio,
  ctx: MinimalCtx,
) => Promise<MinimalVerdict>;

/**
 * A TABELA. Uma linha por linguagem que tem sintetizador ESCRITO — nunca
 * derivada do registro de adaptadores, porque ter adaptador (parser, layout,
 * runner) não é o mesmo que ter gerador de código mínimo.
 */
export const SINTETIZADOR_POR_LINGUAGEM: Readonly<Record<string, SintetizadorMinimo>> = {
  javascript: sintetizarCodigoMinimo,
  python: sintetizarCodigoMinimoPython,
};

/** As linguagens que TÊM sintetizador de código mínimo, em ordem estável. */
export const LINGUAGENS_COM_SINTETIZADOR: readonly LanguageId[] = Object.keys(
  SINTETIZADOR_POR_LINGUAGEM,
).sort() as LanguageId[];

/**
 * Resolve o sintetizador de uma linguagem. LANÇA `EngineLinguagemError` quando
 * a linguagem existe no registro mas ninguém escreveu o sintetizador dela.
 */
export function exigirSintetizadorMinimo(language: string = DEFAULT_ADAPTER_ID): SintetizadorMinimo {
  const adapter = getAdapter(language);
  const sintetizador = SINTETIZADOR_POR_LINGUAGEM[adapter.id];
  if (sintetizador === undefined) {
    throw new EngineLinguagemError({
      modulo: 'engine/quality/minimalPorLinguagem.ts',
      pedido: language,
      suportado: LINGUAGENS_COM_SINTETIZADOR,
      motivo:
        'o sintetizador de código mínimo GERA TEXTO da linguagem alvo (e lê o teste com o parser ' +
        'dela): acrescente `quality/minimal<Linguagem>.ts` e a linha correspondente nesta tabela — ' +
        'reaproveitar o gerador de outra linguagem produziria candidatos que não compilam e um ' +
        'veredito SEM_SOLUCAO_ACESSIVEL falso',
    });
  }
  return sintetizador;
}

/**
 * Sintetiza o código mínimo do desafio na LINGUAGEM DA TRILHA.
 *
 * `ctx.language` ausente cai no adaptador default (`javascript`), que é o que
 * as trilhas do disco sem `programmingLanguage` significam. Linguagem sem
 * sintetizador LANÇA — quem chama (o `coverage`) transforma isso em reprovação
 * declarada, nunca em aprovação por omissão (`docs/16` §9.3).
 */
export async function sintetizarCodigoMinimoDaLinguagem(
  prover: ProverDeDesafio,
  ctx: MinimalCtx,
): Promise<MinimalVerdict> {
  const language = ctx.language ?? DEFAULT_ADAPTER_ID;
  return exigirSintetizadorMinimo(language)(prover, ctx);
}
