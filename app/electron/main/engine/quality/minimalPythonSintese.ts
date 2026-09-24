/**
 * app/electron/main/engine/quality/minimalPythonSintese.ts — a SÍNTESE mínima
 * de Python contra o prover REAL, fail-closed em todos os caminhos.
 *
 * A prosa normativa vive na fachada `minimalPython.ts`. Refatoração L04:
 * arquivo ≤500 linhas e toda função com CC≤8, sem mudança de comportamento.
 */

import type { AtomKey } from '../atomKeys';
import { extractAtoms } from '../extract';
import type { ChallengeProofsVerdict } from '../exec/proofs';
import { PY_ENTRY_PATH } from '../lang/python';
import type { ProverDeDesafio } from '../phases/f9Verifier';
import { contarLinhas, type MinimalCtx, type MinimalVerdict } from './minimal';
import {
  MINIMAL_PYTHON_LANGUAGE,
  MODULO_DA_SOLUCAO,
  PY_EMPTY_STUB_CODE,
  type LiteraisDoTestePython,
} from './minimalPythonTipos';
import { extrairLiteraisDoTestePython } from './minimalPythonLeitura';
import { gerarCandidatosPython } from './minimalPythonCandidatos';

/** Motivo escrito quando a forma do teste não é nenhuma das reconhecidas. */
function motivoDeFormaDesconhecida(dados: LiteraisDoTestePython): string {
  return (
    'forma de teste de Python não reconhecida: o teste não roda ' +
    'runpy.run_path("' + PY_ENTRY_PATH + '") (forma stdout) nem importa de ' +
    MODULO_DA_SOLUCAO + ' (forma import) — ' + dados.asserts.length + ' assert(s) lidos'
  );
}

/** O `detail` do veredito `SEM_SOLUCAO_ACESSIVEL` quando não há candidato. */
function detailSemCandidatosPy(dados: LiteraisDoTestePython): string {
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
async function testarCandidatoPy(
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
      language: MINIMAL_PYTHON_LANGUAGE,
      emptyStubCode: PY_EMPTY_STUB_CODE,
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
function vereditoVencedorPy(candidato: string, veredito: ChallengeProofsVerdict): MinimalVerdict {
  const extraidoAtoms = extractAtoms(candidato, {
    fileName: PY_ENTRY_PATH,
    language: MINIMAL_PYTHON_LANGUAGE,
  });
  const atoms: AtomKey[] = extraidoAtoms.ok ? extraidoAtoms.keys : [];
  return {
    ok: true,
    minimalCode: candidato,
    atoms,
    // ENRIQUECIMENTO VAZIO, E DECLARADO: em JavaScript `atomsDoTeste` são
    // os átomos do TRECHO do teste que chama a função-alvo. Na forma
    // `stdout` esse trecho não existe — o teste chama `rodar()`, um helper
    // do PRÓPRIO teste, e os átomos dele (io/contextlib/runpy/unittest)
    // seriam o harness, nunca o que o desafio cobra do aluno.
    atomsDoTeste: [],
    lines: contarLinhas(candidato),
    proofsValid: true,
  };
}

/** O veredito fail-closed do fim do map-reduce de candidatos. */
function vereditoFinalPy(tentativas: number, falhasDeInfra: number, motivos: string[]): MinimalVerdict {
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
 * Sintetiza o código mínimo de Python que passa no teste. Roda cada candidato
 * pelo prover REAL (injetado) e devolve o PRIMEIRO que passa nas provas.
 * FAIL-CLOSED em todos os caminhos.
 */
export async function sintetizarCodigoMinimoPython(
  prover: ProverDeDesafio,
  ctx: MinimalCtx,
): Promise<MinimalVerdict> {
  const extraido = extrairLiteraisDoTestePython(ctx.testsCode);
  if (!extraido.ok) {
    return { ok: false, reason: 'PARSE_FALHOU', detail: extraido.error };
  }
  const dados = extraido.dados;
  const candidatos = gerarCandidatosPython(ctx.starterCode, ctx.solutionCode, dados);
  if (candidatos.length === 0) {
    return { ok: false, reason: 'SEM_SOLUCAO_ACESSIVEL', detail: detailSemCandidatosPy(dados) };
  }

  let tentativas = 0;
  let falhasDeInfra = 0;
  const motivos: string[] = [];
  for (const candidato of candidatos) {
    tentativas += 1;
    const resultado = await testarCandidatoPy(prover, ctx, candidato);
    if (resultado.tipo === 'passou') {
      return vereditoVencedorPy(candidato, resultado.veredito);
    }
    if (resultado.tipo === 'infra') falhasDeInfra += 1;
    motivos.push(resultado.motivo);
  }

  return vereditoFinalPy(tentativas, falhasDeInfra, motivos);
}
