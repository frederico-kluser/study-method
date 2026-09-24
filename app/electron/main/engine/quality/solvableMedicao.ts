/**
 * app/electron/main/engine/quality/solvableMedicao.ts — UMA tentativa do aluno
 * simulado (prompt → LLM → prover), o diff determinístico da primeira
 * construção que faltou e a MEDIÇÃO pass^k (J3, P-19).
 *
 * A prosa normativa vive na fachada `solvable.ts`. Refatoração L04: arquivo
 * ≤500 linhas e toda função com CC≤8, sem mudança de comportamento observável.
 */

import { extractAtoms } from '../extract';
import type { AtomKey } from '../atomKeys';
import type { ChallengeProofsVerdict } from '../exec/proofs';
import { DEFAULT_ADAPTER_ID } from '../lang/registry';
import {
  DEFAULT_K,
  ETAPA_ALUNO_SIMULADO,
  ALUNO_STAGE_VERSION,
  ALUNO_TIMEOUT_MS,
  SOLUBILIDADE_CODES,
  SolubilidadeError,
  exigirJs,
  type MedicaoSolubilidade,
  type ResultadoTentativa,
  type SolubilidadeCtx,
  type SolubilidadeDeps,
  type TentativaMedida,
} from './solvableTipos';
import { ALUNO_SCHEMA, montarPromptDoAluno, parseRespostaDoAluno, resultadoSemTentativa } from './solvableAluno';

/** Chama o LLM do aluno; transporte lançando vira `SolubilidadeError` LLM. */
async function chamarAluno(deps: SolubilidadeDeps, ctx: SolubilidadeCtx, prompt: string): Promise<string> {
  try {
    const resultado = await deps.llm.callLlm(ETAPA_ALUNO_SIMULADO, {
      prompt,
      schema: ALUNO_SCHEMA,
      stageVersion: ALUNO_STAGE_VERSION,
      timeoutMs: ALUNO_TIMEOUT_MS,
      temperature: 0,
    });
    return resultado.content;
  } catch (error) {
    throw new SolubilidadeError({
      code: SOLUBILIDADE_CODES.LLM,
      etapa: ETAPA_ALUNO_SIMULADO,
      message: 'o transporte de LLM falhou ao simular o aluno — a medição não pode ser concluída (fail-closed).',
      cause: error,
    });
  }
}

/**
 * Executa a tentativa do aluno no prover REAL. `solutionFiles` da REFERÊNCIA
 * são descartados de propósito: vazariam a solução para o prover.
 */
async function executarTentativa(
  deps: SolubilidadeDeps,
  ctx: SolubilidadeCtx,
  codigo: string,
): Promise<ChallengeProofsVerdict> {
  try {
    return await deps.prover({ ...ctx.prova, solutionCode: codigo, solutionFiles: undefined });
  } catch (error) {
    throw new SolubilidadeError({
      code: SOLUBILIDADE_CODES.PROVER,
      etapa: ETAPA_ALUNO_SIMULADO,
      message: 'o prover (execução real) falhou durante a simulação do aluno.',
      cause: error,
    });
  }
}

/** Fail-closed: veredito com execError é FALHA DE INFRA do prover, não do aluno. */
function falhaDeInfraDoVeredito(veredito: ChallengeProofsVerdict): boolean {
  return veredito.execError !== undefined || veredito.failures.some((f) => f.proof === 'execError');
}

/**
 * Simula UMA tentativa do aluno: monta o prompt (enunciado + starter + orçamento
 * — e nada além), chama o LLM, interpreta a resposta e, quando há código, pede o
 * VEREDITO POR EXECUÇÃO REAL ao prover. Fail-closed: o transporte de LLM ou o
 * prover LANÇANDO (ou veredito com execError) vira `SolubilidadeError` — nunca
 * um veredito falso.
 */
export async function simularAluno(deps: SolubilidadeDeps, ctx: SolubilidadeCtx): Promise<ResultadoTentativa> {
  exigirJs('simularAluno', ctx.language ?? DEFAULT_ADAPTER_ID);
  const prompt = montarPromptDoAluno({
    enunciado: ctx.enunciado,
    starter: ctx.prova.starterCode,
    orcamento: ctx.orcamento,
  });

  const content = await chamarAluno(deps, ctx, prompt);
  const resposta = parseRespostaDoAluno(content);
  if (resposta.tipo !== 'tentativa') {
    return resultadoSemTentativa(resposta);
  }

  const veredito = await executarTentativa(deps, ctx, resposta.codigo);
  if (falhaDeInfraDoVeredito(veredito)) {
    throw new SolubilidadeError({
      code: SOLUBILIDADE_CODES.PROVER,
      etapa: ETAPA_ALUNO_SIMULADO,
      message: `o prover falhou por infraestrutura ao executar a tentativa: ${veredito.execError ?? 'execError'}`,
      detail: veredito.execError,
    });
  }

  const razao = veredito.valid ? undefined : (veredito.failures[0]?.reason ?? 'veredito inválido');
  return { resposta, passou: veredito.valid, veredito, razao };
}

/**
 * Chaves de `extractAtoms` fora do orçamento, agregadas sobre as tentativas que
 * falharam com código, ordenadas por FREQUÊNCIA (quantas tentativas usaram a
 * chave; decrescente) e, no desempate, por ordem ALFABÉTICA — determinístico.
 * Código que não parseia (PARSE_ERROR) contribui zero chaves: sintaxe quebrada
 * não culpa construção. A primeira do resultado é `primeiraConstrucaoFaltante`.
 */
function construcoesForaDoOrcamento(codigos: readonly string[], orcamento: ReadonlySet<string>): AtomKey[] {
  const frequencia = new Map<AtomKey, number>();
  for (const codigo of codigos) {
    const extraido = extractAtoms(codigo);
    if (!extraido.ok) continue;
    const jaContadas = new Set<AtomKey>();
    for (const chave of extraido.keys) {
      if (orcamento.has(chave) || jaContadas.has(chave)) continue;
      jaContadas.add(chave);
      frequencia.set(chave, (frequencia.get(chave) ?? 0) + 1);
    }
  }
  return [...frequencia.entries()]
    .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([chave]) => chave);
}

/**
 * Decide `primeiraConstrucaoFaltante` a partir das tentativas realizadas
 * (regras do cabeçalho: (i) bloqueado → precisoDe; (ii) sem bloqueio → diff por
 * frequência; (iii) sem código analisável → null).
 */
function primeiraFaltante(realizadas: readonly TentativaMedida[], orcamento: ReadonlySet<string>): string | null {
  const bloqueada = realizadas.find((t) => t.tipo === 'bloqueado' && !t.passou && t.precisoDe !== undefined);
  if (bloqueada?.precisoDe !== undefined) {
    // (i) a PRIMEIRA construção da lista dele que NÃO está no orçamento (a mais
    // requisitada). Todos os itens dentro do orçamento = aluno confuso → null.
    return bloqueada.precisoDe.find((chave) => !orcamento.has(chave)) ?? null;
  }
  const codigosFalhos = realizadas
    .filter((t) => t.tipo === 'tentativa' && !t.passou && t.codigo !== undefined)
    .map((t) => t.codigo as string);
  if (codigosFalhos.length > 0) {
    // (ii) diff determinístico por frequência.
    const fora = construcoesForaDoOrcamento(codigosFalhos, orcamento);
    return fora.length > 0 ? fora[0] : null;
  }
  // (iii) só respostas inválidas / bloqueios vazios — nada a nomear.
  return null;
}

function paraTentativaMedida(ordem: number, r: ResultadoTentativa): TentativaMedida {
  const t: TentativaMedida = { ordem, tipo: r.resposta.tipo, passou: r.passou };
  if (r.resposta.tipo === 'tentativa') t.codigo = r.resposta.codigo;
  if (r.resposta.tipo === 'bloqueado') t.precisoDe = [...r.resposta.precisoDe];
  if (r.razao !== undefined) t.razao = r.razao;
  if (r.veredito !== undefined) t.veredito = r.veredito;
  return t;
}

/**
 * Mede a solubilidade do desafio com k tentativas INDEPENDENTES do aluno
 * simulado (default k=3; pass^k: TODAS passam — uma falha derruba; nunca
 * pass-at-k). As k tentativas SEMPRE são executadas (mesmo depois de uma falha)
 * para que a taxa de acerto e o aviso de tarefa quebrada sejam honestos: 0%
 * em k tentativas — e não 0% em meia medição abortada — é o sinal de TAREFA
 * QUEBRADA que o relatório carrega (`avisoTarefaQuebrada`).
 *
 * Fail-closed: `SolubilidadeError` (LLM/prover/argumento) atravessa a medição;
 * o chamador (relatório, P-24) trata erro estruturado, nunca veredito falso.
 */
export async function medirSolubilidade(
  deps: SolubilidadeDeps,
  ctx: SolubilidadeCtx,
  tentativas: number = DEFAULT_K,
): Promise<MedicaoSolubilidade> {
  exigirJs('medirSolubilidade', ctx.language ?? DEFAULT_ADAPTER_ID);
  if (!Number.isInteger(tentativas) || tentativas < 1) {
    throw new SolubilidadeError({
      code: SOLUBILIDADE_CODES.ARGUMENTO,
      message: `tentativas deve ser inteiro ≥ 1 (recebido ${tentativas}) — pass^k sem tentativas não mede nada.`,
    });
  }

  const orcamento = new Set<string>(ctx.orcamento);
  const realizadas: TentativaMedida[] = [];
  let passaram = 0;

  for (let ordem = 1; ordem <= tentativas; ordem += 1) {
    const resultado = await simularAluno(deps, ctx);
    realizadas.push(paraTentativaMedida(ordem, resultado));
    if (resultado.passou) passaram += 1;
  }

  const taxaDeAcerto = passaram / tentativas;
  return {
    passou: taxaDeAcerto === 1, // pass^k estrito — nunca pass-at-k
    tentativas,
    taxaDeAcerto,
    primeiraConstrucaoFaltante: primeiraFaltante(realizadas, orcamento),
    // 0% de acerto = sinal de tarefa QUEBRADA, não de aluno incapaz (J3).
    avisoTarefaQuebrada: taxaDeAcerto === 0,
    tentativasRealizadas: realizadas,
  };
}
