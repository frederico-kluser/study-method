/**
 * app/electron/main/engine/research/surfRunner.ts — A INVOCAÇÃO DO SURF por
 * subprocesso, e o tratamento de UM POR UM dos códigos de saída dele.
 *
 * O QUE ESTE ARQUIVO FAZ
 *   1. `ExecutorDeProcesso` — a interface INJETADA. Todo o resto do módulo
 *      depende dela, e só dela: a suíte roda offline, sem rede, sem chave e
 *      sem processo. Mesma disciplina de `services/braveSearchService.ts`
 *      (`fetchImpl` injetável) e de `services/studyMethodRunner.ts`
 *      (`deps.exec?: typeof spawn`).
 *   2. `executorSurfReal` — a implementação de produção, com `spawn`.
 *   3. `interpretarSaidaDoSurf` — função PURA: (código, stdout, stderr) →
 *      resultado ou `PesquisaError`. É a tabela de exit codes virada código.
 *
 * O QUE ELE NÃO FAZ, E É DE PROPÓSITO: **não tem retry, não tem sleep, não tem
 * jitter e não tem backoff.** O surf já ritma cada requisição pelo limite real
 * do plano Brave, num token bucket compartilhado ENTRE PROCESSOS — o stderr da
 * execução medida mostra isso literalmente ("brave: paced 1010ms (plan allows
 * 1 req/s)", "paced 2033ms (plan allows 50 req/s)"). Um ritmo por cima briga
 * com o limitador e provoca exatamente o 429 que ele evita. Quem precisa de
 * backoff nesta engine é o transporte de LLM (`runtime/callLlm.ts`), que tem o
 * dele; a busca NÃO.
 *
 * ─── OS CÓDIGOS DE SAÍDA, UM A UM ───────────────────────────────────────────
 * Documentados no `--help` das duas ferramentas e confirmados na fonte
 * (`~/.agents/skills/surf-research-agent-skill/src/lib/ai/cli.mjs:160-190`):
 *
 *   0   ok. Envelope em stdout.
 *   1   "nothing retrieved". DEGRADAÇÃO REAL, e o mais sutil dos cinco: o
 *       `cli.mjs` ESCREVE o envelope em stdout ANTES de devolver 1
 *       (`return result.stats.sources === 0 ? 1 : 0`). Então exit 1 com
 *       envelope parseável NÃO é erro de transporte — é uma colheita VAZIA que
 *       tem que ser REGISTRADA (com plano, ledger e diagnostics), nunca
 *       trocada por outra ferramenta. Quem reprova o vazio é o portão de
 *       qualidade, no fim, uma vez. Exit 1 SEM envelope é outra coisa: é o
 *       `reportAiError` genérico — aí sim vira erro estruturado.
 *   2   usage error. É BUG DESTE MÓDULO (flag inexistente, valor fora de
 *       faixa, pergunta vazia). Erro estruturado imediato: retentar um comando
 *       malformado é gastar cota para receber o mesmo 2.
 *   78  EX_CONFIG — sem chave Brave válida. A fonte do surf diz por quê:
 *       "A configuration problem is not a failed operation. Exit 78 (EX_CONFIG)
 *       so an orchestrating agent can tell 'fix your setup' from 'the search
 *       failed'". Retentar é INÚTIL. Erro estruturado, fail-closed
 *       (`docs/16-engine-de-trilha.md` §9.3).
 *   143 SIGTERM (128+15) — o harness matou por timeout. A resposta prescrita é
 *       REFAZER COM `surf-search-normal`, que se auto-orça ("the whole run is
 *       fitted inside the harness's detected bash timeout"). Isso NÃO é retry:
 *       é TROCA DE FERRAMENTA, uma única vez, sem espera nenhuma entre as duas
 *       chamadas — e o `camadas.ts` é quem a executa, com a trava de "no
 *       máximo uma vez por camada". Este arquivo só CLASSIFICA o 143.
 *
 * Qualquer outro não-zero cai em SURF_FALHOU com o rabo do stderr nos details.
 *
 * ─── ENCODING ───────────────────────────────────────────────────────────────
 * stdout e stderr são acumulados como `Buffer` e decodificados UMA vez no fim.
 * O precedente do repo (`services/challengeExec.ts:127`) faz `stdout += String(d)`
 * por chunk, e isso CORROMPE um caractere multibyte partido na fronteira de dois
 * chunks. Aqui isso não é teórico: os títulos que a Brave devolve vêm cheios de
 * acento, e um título corrompido é uma fonte corrompida na aula. Buffer.concat
 * resolve pelo mesmo preço.
 */

import { spawn } from 'node:child_process';
import { parseEnvelopeDoSurf, type SurfEnvelope } from './surfEnvelope';
import { PESQUISA_CODES, PesquisaError } from './errors';

// ─── códigos de saída do surf ───────────────────────────────────────────────

export const SURF_EXIT = {
  OK: 0,
  NADA_COLHIDO: 1,
  USO_INVALIDO: 2,
  SEM_CHAVE_BRAVE: 78,
  MORTO_POR_SIGTERM: 143,
} as const;

// ─── o executor injetado ────────────────────────────────────────────────────

export interface SaidaDoProcesso {
  /** exit code; quando o processo morreu por sinal, 128+sinal (143 = SIGTERM). */
  code: number;
  stdout: string;
  stderr: string;
  /** true quando FOI ESTE módulo que matou por estourar `timeoutMs`. */
  mortoPorTimeout?: boolean;
}

export interface OpcoesDeExecucao {
  /** deadline em ms. Obrigatório: um subprocesso sem deadline segura a onda. */
  timeoutMs: number;
}

/**
 * A execução de UM subprocesso. Injetada em tudo que roda o surf — nos testes
 * é uma função pura que devolve fixture.
 */
export type ExecutorDeProcesso = (
  bin: string,
  args: string[],
  opcoes: OpcoesDeExecucao,
) => Promise<SaidaDoProcesso>;

/** Rabo do stderr guardado nos `details` de um erro (bytes, não linhas). */
export const TETO_STDERR_EM_ERRO = 800;

/**
 * Redige o que PARECE segredo antes de qualquer texto do subprocesso entrar
 * num erro ou num log. O surf não imprime chave no progresso — mas "não
 * imprime hoje" não é garantia, e a regra do repo é que chave de API não
 * aparece em log nem em erro (`runtime/callLlm.ts`, item 6).
 * Limite declarado: são padrões NOMEADOS (Brave `BS…`, OpenRouter `sk-or-…`,
 * `Bearer …`), não um detector genérico — um detector genérico redigiria URLs.
 */
export function redigirSegredos(texto: string): string {
  return String(texto ?? '')
    .replace(/\bBS[A-Za-z0-9_-]{16,}\b/g, 'BS[REDIGIDO]')
    .replace(/\bsk-or-v1-[A-Za-z0-9_-]{8,}\b/gi, 'sk-or-v1-[REDIGIDO]')
    .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, 'sk-[REDIGIDO]')
    .replace(/\b(Bearer|X-Subscription-Token:?)\s+\S+/gi, '$1 [REDIGIDO]');
}

function rabo(texto: string): string {
  const limpo = redigirSegredos(texto).trim();
  return limpo.length > TETO_STDERR_EM_ERRO ? `…${limpo.slice(-TETO_STDERR_EM_ERRO)}` : limpo;
}

// ─── interpretação PURA dos códigos ─────────────────────────────────────────

/** O que uma execução do surf produziu, já classificada. */
export interface ResultadoDoSurf {
  /** 'colheita' = veio fonte; 'vazio' = rodou e não achou nada (exit 1). */
  tipo: 'colheita' | 'vazio';
  envelope: SurfEnvelope;
  /** o exit code cru, preservado para auditoria. */
  exitCode: number;
}

/**
 * (código, stdout, stderr) → resultado classificado, ou `PesquisaError`.
 * PURA: nenhuma I/O, nenhum relógio. É esta função que os testes usam para
 * cobrir os cinco códigos sem tocar em processo.
 */
export function interpretarSaidaDoSurf(
  saida: SaidaDoProcesso,
  contexto: { bin: string; args: string[]; etapa: string },
): ResultadoDoSurf {
  const { code, stdout, stderr } = saida;
  const flags = contexto.args.filter((a) => a.startsWith('--'));

  if (saida.mortoPorTimeout === true || code === SURF_EXIT.MORTO_POR_SIGTERM) {
    throw new PesquisaError({
      code: PESQUISA_CODES.SURF_MORTO_POR_TIMEOUT,
      etapa: contexto.etapa,
      message:
        `\`${contexto.bin}\` foi morto por timeout (${code}) — a onda não coube no tempo. ` +
        'A resposta prescrita é refazer com surf-search-normal, que se auto-orça; nunca esperar e repetir o mesmo comando',
      details: { bin: contexto.bin, exitCode: code, flags, stderr: rabo(stderr) },
    });
  }

  if (code === SURF_EXIT.SEM_CHAVE_BRAVE) {
    throw new PesquisaError({
      code: PESQUISA_CODES.SURF_SEM_CHAVE,
      etapa: contexto.etapa,
      message:
        'sem chave Brave válida (exit 78, EX_CONFIG): é problema de configuração, não busca que falhou — ' +
        'retentar é inútil. Rode `surf` uma vez para configurar. Fail-closed: nenhum material é produzido sem fonte',
      details: { bin: contexto.bin, exitCode: code, stderr: rabo(stderr) },
    });
  }

  if (code === SURF_EXIT.USO_INVALIDO) {
    throw new PesquisaError({
      code: PESQUISA_CODES.SURF_USO_INVALIDO,
      etapa: contexto.etapa,
      message:
        'o surf recusou o comando (exit 2, usage): o comando foi montado errado por ESTE módulo. ' +
        'Corrigir a montagem — retentar um comando malformado gasta cota e devolve o mesmo 2',
      details: { bin: contexto.bin, exitCode: code, flags, stderr: rabo(stderr) },
    });
  }

  if (code === SURF_EXIT.OK) {
    return { tipo: 'colheita', envelope: parseEnvelopeDoSurf(stdout), exitCode: code };
  }

  if (code === SURF_EXIT.NADA_COLHIDO) {
    // O envelope É escrito antes do exit 1 quando a busca rodou e não achou
    // nada. Se ele não estiver lá, o 1 veio do `reportAiError` genérico.
    let envelope: SurfEnvelope;
    try {
      envelope = parseEnvelopeDoSurf(stdout);
    } catch {
      throw new PesquisaError({
        code: PESQUISA_CODES.SURF_FALHOU,
        etapa: contexto.etapa,
        message: 'o surf saiu com 1 sem escrever envelope — é falha de execução, não colheita vazia',
        details: { bin: contexto.bin, exitCode: code, stderr: rabo(stderr) },
      });
    }
    return { tipo: 'vazio', envelope, exitCode: code };
  }

  throw new PesquisaError({
    code: PESQUISA_CODES.SURF_FALHOU,
    etapa: contexto.etapa,
    message: `\`${contexto.bin}\` saiu com ${code} (código não previsto no contrato do surf)`,
    details: { bin: contexto.bin, exitCode: code, flags, stderr: rabo(stderr) },
  });
}

// ─── o executor de produção ─────────────────────────────────────────────────

/**
 * `spawn` de verdade. Decisões:
 *   - SEM shell: argv vai como vetor, então aspas/acentos do brief não são
 *     reinterpretados por ninguém.
 *   - stdin fechado ('ignore'): o surf não lê stdin, e um stdin aberto
 *     penduraria o filho se ele decidisse perguntar algo.
 *   - env HERDADO: o surf lê a chave Brave do estado dele sob `$HOME`. Podar o
 *     env quebraria a resolução da chave. A chave NÃO passa por este processo:
 *     nada aqui a lê, e o stderr é redigido antes de entrar em erro.
 *   - timeout com SIGTERM (não SIGKILL): SIGTERM dá ao processo o mesmo 143 que
 *     o harness produz, então o caminho de tratamento é UM só.
 */
export const executorSurfReal: ExecutorDeProcesso = (bin, args, opcoes) =>
  new Promise<SaidaDoProcesso>((resolve) => {
    const filho = spawn(bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let mortoPorTimeout = false;

    const timer =
      opcoes.timeoutMs > 0
        ? setTimeout(() => {
            mortoPorTimeout = true;
            filho.kill('SIGTERM');
          }, opcoes.timeoutMs)
        : null;

    filho.stdout.on('data', (d: Buffer) => out.push(d));
    filho.stderr.on('data', (d: Buffer) => err.push(d));

    filho.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      const codigo = code ?? (signal ? 128 + sinalParaNumero(signal) : 1);
      resolve({
        code: codigo,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
        ...(mortoPorTimeout ? { mortoPorTimeout: true } : {}),
      });
    });

    filho.on('error', (e) => {
      if (timer) clearTimeout(timer);
      resolve({
        code: 127,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: `${Buffer.concat(err).toString('utf8')}\n${String(e)}`,
      });
    });
  });

/** SIGTERM→15, SIGKILL→9, SIGINT→2 — os únicos que este caminho vê. */
function sinalParaNumero(signal: NodeJS.Signals): number {
  if (signal === 'SIGTERM') return 15;
  if (signal === 'SIGKILL') return 9;
  if (signal === 'SIGINT') return 2;
  return 0;
}

/**
 * Roda o surf uma vez e classifica. UMA chamada, sem espera antes, sem espera
 * depois, sem retry.
 */
export async function rodarSurf(
  executor: ExecutorDeProcesso,
  comando: { bin: string; args: string[] },
  opcoes: OpcoesDeExecucao & { etapa: string },
): Promise<ResultadoDoSurf> {
  if (!Number.isInteger(opcoes.timeoutMs) || opcoes.timeoutMs < 1) {
    throw new PesquisaError({
      code: PESQUISA_CODES.CONFIG_INVALIDA,
      message: 'timeoutMs obrigatório e ≥1: subprocesso sem deadline segura a onda inteira',
      details: { timeoutMs: opcoes.timeoutMs },
    });
  }
  const saida = await executor(comando.bin, comando.args, { timeoutMs: opcoes.timeoutMs });
  return interpretarSaidaDoSurf(saida, {
    bin: comando.bin,
    args: comando.args,
    etapa: opcoes.etapa,
  });
}
