/**
 * app/electron/main/engine/review/filterReproducao.ts — o R5 do filtro R1–R8
 * (`docs/16-engine-de-trilha.md` §6.4): `reproduzivel_por` roda e NÃO reproduz.
 *
 * Extraído de `review/filter.ts` na refatoração do lote L05 (o arquivo passava
 * de 500 linhas) sem NENHUMA mudança de comportamento — a fachada `filter.ts`
 * re-exporta tudo isto pelos MESMOS nomes.
 */

import type { ExecFn } from '../exec/proofs';
import type { Apontamento } from './actionCatalog';

/**
 * O prefixo que marca apontamentos MECÂNICOS (produzidos pelo verificador
 * determinístico do laço, não pelo revisor LLM). `reproduzivel_por` começa
 * com ele → R5 pula: a reprodução já aconteceu — foi o próprio verificador
 * que produziu a violação.
 */
export const REPRODUZIVEL_MECANICO_PREFIX = 'mecanico:';

/** O resultado da checagem de reprodução do R5. */
export type ResultadoDeReproducao =
  | { reproduz: true }
  | { reproduz: false; razao: 'nao_reproduziu' }
  | { reproduz: false; razao: 'falhou_ao_rodar'; erro: string };

/** Teto DEFAULT de tempo para o comando de reprodução do revisor. */
export const R5_TIMEOUT_MS_DEFAULT = 30_000;

/** O comando arbitrário do revisor roda como `sh -c <comando>` (declarado). */
export const R5_SHELL = 'sh';

/**
 * R5 — `reproduzivel_por` RODA e NÃO reproduz → descarta (§6.4).
 *
 * Proxy de "reproduz": exit code ≠ 0 (o comando reportou o defeito) OU a
 * saída combinada menciona o token acusador (`alvo.token`). Exit 0 sem o
 * token → o comando rodou limpo → NÃO reproduziu.
 *
 * EXCEÇÃO (fail-closed): exit 126/127 — comando NÃO ENCONTRADO (127) ou NÃO
 * EXECUTÁVEL (126) — é DESCARTADO igual ao comando que não rodou: sem
 * execução não existe evidência de reprodução, e um exit de ambiente NUNCA é
 * o comando "reportando o defeito". Outros exit ≠ 0 seguem como reprodução.
 *
 * Execução com timeout e endurecimento: o `exec` INJETADO é o ExecFn que o
 * chamador compõe com `createHardenedExec` (exec/harness.ts — SEM_EXEC,
 * proxies removidos, `NO_PROXY=*`, `NODE_OPTIONS` removido). SEM executor
 * configurado, a acusação é NÃO verificável → fail-closed: `falhou_ao_rodar`.
 *
 * LIMITE DECLARADO: o endurecimento cobre tráfego via proxy e TLS, mas não
 * bloqueia socket cru (TCP/UDP) — o corte de rede de verdade exige wrapper
 * de SO (`NETWORK_HARDENING.wrapperCommand`, exec/harness.ts).
 */
export async function r5ExigeReproducao(
  apontamento: Apontamento,
  exec: ExecFn | undefined,
  timeoutMs: number,
): Promise<ResultadoDeReproducao> {
  const comando = apontamento.evidencia.reproduzivel_por.trim();
  if (comando.startsWith(REPRODUZIVEL_MECANICO_PREFIX)) {
    // Apontamento do VERIFICADOR determinístico: a reprodução já aconteceu —
    // foi o verificador que produziu a violação. R5 pula por construção.
    return { reproduz: true };
  }
  if (exec === undefined) {
    return {
      reproduz: false,
      razao: 'falhou_ao_rodar',
      erro: 'sem executor de reprodução configurado (R5 não verificável — fail-closed)',
    };
  }
  try {
    const resultado = await exec(process.cwd(), [R5_SHELL, '-c', comando], { timeoutMs });
    return interpretarResultadoR5(apontamento, resultado);
  } catch (erro) {
    return {
      reproduz: false,
      razao: 'falhou_ao_rodar',
      erro: erro instanceof Error ? erro.message : String(erro),
    };
  }
}

/** A leitura do exit/saída do comando de reprodução (o proxy determinístico). */
function interpretarResultadoR5(
  apontamento: Apontamento,
  resultado: { exitCode: number; stdout: string; stderr: string },
): ResultadoDeReproducao {
  const saida = `${resultado.stdout}\n${resultado.stderr}`;
  if (resultado.exitCode === 126 || resultado.exitCode === 127) {
    // O comando NÃO RODOU (não encontrado / não executável): sem execução,
    // sem evidência de reprodução — o exit denuncia o AMBIENTE, não o
    // defeito. Fail-closed: descarta a acusação, nunca a "reproduz".
    return {
      reproduz: false,
      razao: 'falhou_ao_rodar',
      erro: `comando não encontrado ou não executável (exit ${resultado.exitCode}) — sem evidência de reprodução (fail-closed)`,
    };
  }
  if (resultado.exitCode !== 0) return { reproduz: true };
  if (saida.includes(apontamento.alvo.token)) return { reproduz: true };
  return { reproduz: false, razao: 'nao_reproduziu' };
}
