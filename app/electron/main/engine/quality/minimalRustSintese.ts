/**
 * app/electron/main/engine/quality/minimalRustSintese.ts — a SÍNTESE mínima de
 * Rust contra o prover REAL (o spawn do cargo sob o semáforo da engine),
 * fail-closed em todos os caminhos.
 *
 * A prosa normativa vive na fachada `minimalRust.ts`. Refatoração L04: arquivo
 * ≤500 linhas e toda função com CC≤8, sem mudança de comportamento observável.
 */

import type { AtomKey } from '../atomKeys';
import { extractAtoms } from '../extract';
import type { ChallengeProofsVerdict } from '../exec/proofs';
import { RS_ENTRY_PATH } from '../lang/rust';
import type { ProverDeDesafio } from '../phases/f9Verifier';
import { contarLinhas, type MinimalCtx, type MinimalVerdict } from './minimal';
import {
  CRATE_DA_SOLUCAO,
  MINIMAL_RUST_LANGUAGE,
  RS_EMPTY_STUB_CODE,
  type LiteraisDoTesteRust,
} from './minimalRustTipos';
import { extrairLiteraisDoTesteRust } from './minimalRustLeitura';
import { gerarCandidatosRust } from './minimalRustCandidatos';

/** Motivo escrito quando a forma do teste não é nenhuma das reconhecidas. */
function motivoDeFormaDesconhecida(dados: LiteraisDoTesteRust): string {
  return (
    'forma de teste de Rust não reconhecida: o teste não importa do crate do aluno ' +
    `\`${CRATE_DA_SOLUCAO}\` (use ${CRATE_DA_SOLUCAO}::…; forma import) — ` +
    dados.asserts.length + ' assert(s) lidos'
  );
}

/** O `detail` do veredito `SEM_SOLUCAO_ACESSIVEL` quando não há candidato. */
function detailSemCandidatos(dados: LiteraisDoTesteRust): string {
  return dados.forma === 'desconhecida'
    ? motivoDeFormaDesconhecida(dados)
    : 'nenhum candidato mínimo gerado a partir do starter e dos literais do teste';
}

/** O resultado de UM candidato frente ao prover. */
type ResultadoDoCandidato =
  | { tipo: 'passou'; veredito: ChallengeProofsVerdict }
  | { tipo: 'infra'; motivo: string }
  | { tipo: 'reprovado'; motivo: string };

/** Roda UM candidato pelas provas reais; infra nunca vira reprovação do aluno. */
async function testarCandidatoRust(
  prover: ProverDeDesafio,
  ctx: MinimalCtx,
  candidato: string,
): Promise<ResultadoDoCandidato> {
  let veredito: ChallengeProofsVerdict;
  try {
    veredito = await prover({
      starterCode: ctx.starterCode,
      solutionCode: candidato,
      testsCode: ctx.testsCode,
      expectedTestCount: ctx.expectedTestCount,
      language: MINIMAL_RUST_LANGUAGE,
      emptyStubCode: RS_EMPTY_STUB_CODE,
    });
  } catch (err) {
    return { tipo: 'infra', motivo: err instanceof Error ? err.message : String(err) };
  }
  if (veredito.execError !== undefined) {
    return { tipo: 'infra', motivo: veredito.execError };
  }
  if (veredito.valid) {
    return { tipo: 'passou', veredito };
  }
  return { tipo: 'reprovado', motivo: veredito.failures.map((f) => f.reason ?? f.proof).join('; ') };
}

/** O veredito ok do vencedor, com os átomos do código mínimo. */
function vereditoVencedorRust(candidato: string, veredito: ChallengeProofsVerdict): MinimalVerdict {
  const extraidoAtoms = extractAtoms(candidato, {
    fileName: RS_ENTRY_PATH,
    language: MINIMAL_RUST_LANGUAGE,
  });
  const atoms: AtomKey[] = extraidoAtoms.ok ? extraidoAtoms.keys : [];
  return {
    ok: true,
    minimalCode: candidato,
    atoms,
    // ENRIQUECIMENTO VAZIO, E DECLARADO (o mesmo do irmão de Python): em
    // Rust os átomos do teste são o harness (`use`, `#[test]`,
    // `assert_eq!`) — nunca o que o desafio cobra do aluno.
    atomsDoTeste: [],
    lines: contarLinhas(candidato),
    proofsValid: true,
  };
}

/** O veredito fail-closed do fim do map-reduce de candidatos. */
function vereditoFinalRust(tentativas: number, falhasDeInfra: number, motivos: string[]): MinimalVerdict {
  if (tentativas > 0 && falhasDeInfra === tentativas) {
    return {
      ok: false,
      reason: 'PROVER_FALHOU',
      detail:
        'todas as ' + tentativas + ' tentativa(s) falharam por falha de infraestrutura do ' +
        'prover: ' + motivos.join(' | '),
    };
  }
  return {
    ok: false,
    reason: 'SEM_SOLUCAO_ACESSIVEL',
    detail:
      'nenhum dos ' + tentativas + ' candidato(s) passou nas provas — o teste exige mais que ' +
      'literais ou está quebrado: ' + motivos.join(' | '),
  };
}

/**
 * Sintetiza o código mínimo de Rust que passa no teste. Roda cada candidato
 * pelo prover REAL (injetado — o spawn do cargo sob o semáforo da engine) e
 * devolve o PRIMEIRO que passa nas provas. FAIL-CLOSED em todos os caminhos.
 */
export async function sintetizarCodigoMinimoRust(
  prover: ProverDeDesafio,
  ctx: MinimalCtx,
): Promise<MinimalVerdict> {
  const extraido = extrairLiteraisDoTesteRust(ctx.testsCode);
  if (!extraido.ok) {
    return { ok: false, reason: 'PARSE_FALHOU', detail: extraido.error };
  }
  const dados = extraido.dados;
  const candidatos = gerarCandidatosRust(ctx.starterCode, ctx.solutionCode, dados);
  if (candidatos.length === 0) {
    return { ok: false, reason: 'SEM_SOLUCAO_ACESSIVEL', detail: detailSemCandidatos(dados) };
  }

  let tentativas = 0;
  let falhasDeInfra = 0;
  const motivos: string[] = [];
  for (const candidato of candidatos) {
    tentativas += 1;
    const resultado = await testarCandidatoRust(prover, ctx, candidato);
    if (resultado.tipo === 'passou') {
      return vereditoVencedorRust(candidato, resultado.veredito);
    }
    if (resultado.tipo === 'infra') falhasDeInfra += 1;
    motivos.push(resultado.motivo);
  }

  return vereditoFinalRust(tentativas, falhasDeInfra, motivos);
}
