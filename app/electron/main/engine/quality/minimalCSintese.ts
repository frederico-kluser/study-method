/**
 * app/electron/main/engine/quality/minimalCSintese.ts — a SÍNTESE mínima de C
 * contra o prover REAL (o runner oficial do adaptador: `run.sh` gerado que
 * compila com `cc -std=c11 -g` e roda), fail-closed em todos os caminhos.
 *
 * A prosa normativa vive na fachada `minimalC.ts`. Refatoração L04: arquivo
 * ≤500 linhas e toda função com CC≤8, sem mudança de comportamento observável.
 */

import type { AtomKey } from '../atomKeys';
import { extractAtoms } from '../extract';
import type { ChallengeProofsVerdict } from '../exec/proofs';
import { C_ENTRY_PATH } from '../lang/c';
import type { ProverDeDesafio } from '../phases/f9Verifier';
import { contarLinhas, type MinimalCtx, type MinimalVerdict } from './minimal';
import {
  C_EMPTY_STUB_CODE,
  MINIMAL_C_LANGUAGE,
  type LiteraisDoTesteC,
} from './minimalCTipos';
import { extrairLiteraisDoTesteC, formaDoTesteC } from './minimalCLeitura';
import { gerarCandidatosC } from './minimalCCandidatos';

/** Motivo escrito quando a forma do teste não é nenhuma das reconhecidas. */
function motivoDeFormaDesconhecida(dados: LiteraisDoTesteC): string {
  return (
    'forma de teste de C não reconhecida: o teste não declara protótipo de função do aluno ' +
    'nem chama checa_int/checa_long/checa_double/checa_char/checa_str (counter_protocol, ' +
    '03-tdd §3.9.3) — ' + dados.checas.length + ' verificação(ões) e ' +
    dados.prototipos.length + ' protótipo(s) lidos'
  );
}

/** O `detail` do veredito `SEM_SOLUCAO_ACESSIVEL` quando não há candidato. */
function detailSemCandidatosC(dados: LiteraisDoTesteC): string {
  return formaDoTesteC(dados) === 'desconhecida'
    ? motivoDeFormaDesconhecida(dados)
    : 'nenhum candidato mínimo gerado a partir dos protótipos e das verificações do teste';
}

/** O resultado de UM candidato frente ao prover. */
type ResultadoDoCandidato =
  | { tipo: 'passou'; veredito: ChallengeProofsVerdict }
  | { tipo: 'infra'; motivo: string }
  | { tipo: 'reprovado'; motivo: string };

/** Roda UM candidato pelas provas reais; infra nunca vira reprovação do aluno. */
async function testarCandidatoC(
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
      language: MINIMAL_C_LANGUAGE,
      emptyStubCode: C_EMPTY_STUB_CODE,
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
function vereditoVencedorC(candidato: string, veredito: ChallengeProofsVerdict): MinimalVerdict {
  const extraidoAtoms = extractAtoms(candidato, {
    fileName: C_ENTRY_PATH,
    language: MINIMAL_C_LANGUAGE,
  });
  const atoms: AtomKey[] = extraidoAtoms.ok ? extraidoAtoms.keys : [];
  return {
    ok: true,
    minimalCode: candidato,
    atoms,
    // ENRIQUECIMENTO VAZIO, E DECLARADO (o mesmo partido do irmão de
    // Python na forma `stdout`): o trecho do teste que exerce a função do
    // aluno vive num TU cujos átomos são o HARNESS do counter_protocol
    // (freopen/fgets/fopen/SM_TEST) — emitiria o envelope como se fosse
    // o que o desafio cobra do aluno.
    atomsDoTeste: [],
    lines: contarLinhas(candidato),
    proofsValid: true,
  };
}

/** O veredito fail-closed do fim do map-reduce de candidatos. */
function vereditoFinalC(tentativas: number, falhasDeInfra: number, motivos: string[]): MinimalVerdict {
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
      'nenhum dos ' + tentativas + ' candidato(s) passou nas provas — o teste exige mais que o ' +
      'espaço de síntese cobre (computação, vetor, saída por parâmetro) ou está quebrado: ' +
      motivos.join(' | '),
  };
}

/**
 * Sintetiza o código mínimo de C que passa no teste. Roda cada candidato pelo
 * prover REAL (injetado — o runner oficial do adaptador: `run.sh` gerado que
 * compila com `cc -std=c11 -g` e roda) e devolve o PRIMEIRO que passa nas
 * provas. FAIL-CLOSED em todos os caminhos.
 */
export async function sintetizarCodigoMinimoC(
  prover: ProverDeDesafio,
  ctx: MinimalCtx,
): Promise<MinimalVerdict> {
  const extraido = extrairLiteraisDoTesteC(ctx.testsCode);
  if (!extraido.ok) {
    return { ok: false, reason: 'PARSE_FALHOU', detail: extraido.error };
  }
  const dados = extraido.dados;
  const candidatos = gerarCandidatosC(ctx.starterCode, ctx.solutionCode, dados);
  if (candidatos.length === 0) {
    return { ok: false, reason: 'SEM_SOLUCAO_ACESSIVEL', detail: detailSemCandidatosC(dados) };
  }

  let tentativas = 0;
  let falhasDeInfra = 0;
  const motivos: string[] = [];
  for (const candidato of candidatos) {
    tentativas += 1;
    const resultado = await testarCandidatoC(prover, ctx, candidato);
    if (resultado.tipo === 'passou') {
      return vereditoVencedorC(candidato, resultado.veredito);
    }
    if (resultado.tipo === 'infra') falhasDeInfra += 1;
    motivos.push(resultado.motivo);
  }

  return vereditoFinalC(tentativas, falhasDeInfra, motivos);
}
