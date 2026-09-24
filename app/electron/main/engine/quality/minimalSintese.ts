/**
 * app/electron/main/engine/quality/minimalSintese.ts — a SÍNTESE mínima de
 * JavaScript: o map-reduce de candidatos contra o prover REAL (fail-closed) e
 * o lote em paralelo com semáforo.
 *
 * A prosa normativa vive na fachada `minimal.ts`. Refatoração L04: arquivo
 * ≤500 linhas e toda função com CC≤8, sem mudança de comportamento observável.
 */

import * as ts from 'typescript';

import type { AtomKey } from '../atomKeys';
import { extractAtoms } from '../extract';
import type { ChallengeProofsVerdict } from '../exec/proofs';
import type { ProverDeDesafio } from '../phases/f9Verifier';
import { createSemaphore, defaultExecConcurrency } from '../runtime/semaphore';
import { contarLinhas, mensagemDe, parseSource, exigirJs } from './minimalBase';
import { gerarCandidatos } from './minimalCandidatos';
import { extrairLiteraisDoTeste } from './minimalLiterais';
import {
  type LiteraisDoTeste,
  type MinimalCtx,
  type MinimalVerdict,
  type OpcoesDeLote,
} from './minimalTipos';
import { DEFAULT_ADAPTER_ID, type LanguageId } from '../lang/registry';

/** Trecho do teste que chama as funções-alvo — enriquecimento dos átomos. */
export function trechoDoTesteParaAtomos(testsCode: string, funcoesAlvo: string[]): string {
  const source = parseSource(testsCode, 'tests.mjs');
  if (!source) return '';
  const alvo = new Set(funcoesAlvo);
  const trechos: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && alvo.has(node.expression.text)) {
      trechos.push(node.getText(source));
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return trechos.join('\n');
}

/** O resultado de UM candidato frente ao prover. */
type ResultadoDoCandidato = 'passou' | 'infra' | 'reprovado';

/** Roda UM candidato pelas quatro provas reais; infra nunca vira reprovação. */
async function testarCandidato(
  prover: ProverDeDesafio,
  ctx: MinimalCtx,
  candidato: string,
): Promise<{ resultado: ResultadoDoCandidato; veredito?: ChallengeProofsVerdict }> {
  try {
    const veredito = await prover({
      starterCode: ctx.starterCode,
      solutionCode: candidato,
      testsCode: ctx.testsCode,
      expectedTestCount: ctx.expectedTestCount,
    });
    if (veredito.execError !== undefined) return { resultado: 'infra' };
    return veredito.valid ? { resultado: 'passou', veredito } : { resultado: 'reprovado' };
  } catch (err) {
    return { resultado: 'infra' };
  }
}

/** O veredito ok do vencedor (átomos do mínimo + enriquecimento do teste). */
function vereditoVencedor(
  candidato: string,
  ctx: MinimalCtx,
  dados: LiteraisDoTeste,
): MinimalVerdict {
  const extraidoAtoms = extractAtoms(candidato);
  const atoms = extraidoAtoms.ok ? extraidoAtoms.keys : [];
  const trecho = trechoDoTesteParaAtomos(ctx.testsCode, dados.funcoesAlvo);
  const atomsDoTeste = (() => {
    if (trecho.length === 0) return [] as AtomKey[];
    const extraido = extractAtoms(trecho);
    return extraido.ok ? extraido.keys : [];
  })();
  return {
    ok: true,
    minimalCode: candidato,
    atoms,
    atomsDoTeste,
    lines: contarLinhas(candidato),
    proofsValid: true,
  };
}

/** O veredito fail-closed do fim do map-reduce de candidatos. */
function vereditoFinal(tentativas: number, falhasDeInfra: number): MinimalVerdict {
  if (tentativas > 0 && falhasDeInfra === tentativas) {
    return {
      ok: false,
      reason: 'PROVER_FALHOU',
      detail: `todas as ${tentativas} tentativa(s) falharam por falha de infraestrutura do prover`,
    };
  }
  return {
    ok: false,
    reason: 'SEM_SOLUCAO_ACESSIVEL',
    detail: `nenhum dos ${tentativas} candidato(s) passou nas provas — o teste exige mais que literais ou está quebrado`,
  };
}

/**
 * Sintetiza o código mínimo que passa no teste. Roda cada candidato pelo
 * prover REAL (injetado — `criarProverDeDesafio` na produção, fake nos
 * testes) e devolve o PRIMEIRO que passa nas quatro provas. Fail-closed.
 */
export async function sintetizarCodigoMinimo(prover: ProverDeDesafio, ctx: MinimalCtx): Promise<MinimalVerdict> {
  const language = ctx.language ?? DEFAULT_ADAPTER_ID;
  exigirJs('sintetizarCodigoMinimo', language);
  const extraido = extrairLiteraisDoTeste(ctx.testsCode, language);
  if (!extraido.ok) {
    return { ok: false, reason: 'PARSE_FALHOU', detail: extraido.error };
  }
  const dados = extraido.dados;
  const candidatos = gerarCandidatos(ctx.starterCode, ctx.solutionCode, dados, language);
  if (candidatos.length === 0) {
    return {
      ok: false,
      reason: 'SEM_SOLUCAO_ACESSIVEL',
      detail: 'nenhum candidato mínimo gerado a partir do starter e dos literais do teste',
    };
  }

  let tentativas = 0;
  let falhasDeInfra = 0;
  for (const candidato of candidatos) {
    tentativas += 1;
    const r = await testarCandidato(prover, ctx, candidato);
    if (r.resultado === 'passou' && r.veredito !== undefined) {
      return vereditoVencedor(candidato, ctx, dados);
    }
    if (r.resultado === 'infra') {
      falhasDeInfra += 1;
    }
  }

  return vereditoFinal(tentativas, falhasDeInfra);
}

/**
 * Sintetiza o código mínimo de N desafios em MAP PARALELO com semáforo.
 *
 * - Resultados na MESMA ordem dos `ctxs` (índice estável — nunca a ordem de
 *   conclusão);
 * - concorrência LIMITADA por `OpcoesDeLote` (default SEM_EXEC);
 * - FAIL-CLOSED POR ITEM: uma falha inesperada de UM desafio vira o veredito
 *   `{ok:false, reason:'PROVER_FALHOU'}` DAQUELE item — o lote inteiro nunca
 *   derruba por causa de um (o `sintetizarCodigoMinimo` já é fail-closed por
 *   construção; o try/catch aqui é a última linha contra o imprevisto).
 *
 * Cada item chama `sintetizarCodigoMinimo(prover, ctx)` — o prover é
 * compartilhado (na produção ele já limita os spawns pelo SEM_EXEC interno de
 * `criarProverDeDesafio`; o semáforo deste lote limita as SÍNTESES em voo,
 * que por sua vez podem rodar vários candidatos cada).
 */
export async function sintetizarEmLote(
  prover: ProverDeDesafio,
  ctxs: readonly MinimalCtx[],
  opcoes: OpcoesDeLote = {},
): Promise<MinimalVerdict[]> {
  // A guarda roda ANTES do lote: uma linguagem sem sintetizador tem de derrubar
  // a chamada, não virar N vereditos `PROVER_FALHOU` (o try/catch por item
  // existe para o imprevisto do prover, não para esconder erro de contrato).
  for (const ctx of ctxs) exigirJs('sintetizarEmLote', ctx.language ?? DEFAULT_ADAPTER_ID);
  const semaforo = opcoes.semaforo ?? createSemaphore(opcoes.concorrencia ?? defaultExecConcurrency());
  const resultados = new Array<MinimalVerdict>(ctxs.length);
  await Promise.all(
    ctxs.map(async (ctx, indice) => {
      const release = await semaforo.acquire();
      try {
        try {
          resultados[indice] = await sintetizarCodigoMinimo(prover, ctx);
        } catch (erro) {
          resultados[indice] = {
            ok: false,
            reason: 'PROVER_FALHOU',
            detail: `falha inesperada na síntese do lote: ${mensagemDe(erro)}`,
          };
        }
      } finally {
        release();
      }
    }),
  );
  return resultados;
}
