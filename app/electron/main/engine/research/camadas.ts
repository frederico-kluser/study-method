/**
 * app/electron/main/engine/research/camadas.ts — A PESQUISA EM CAMADAS COM
 * PROCEDÊNCIA: o orquestrador do módulo.
 *
 * ─── O QUE "VÁRIAS CAMADAS" SIGNIFICA AQUI ──────────────────────────────────
 * Camada NÃO é a mesma busca repetida com outras palavras. É profundidade
 * DIRIGIDA, em três tempos:
 *
 *   1. LEVANTAMENTO — uma onda larga que levanta o terreno da unidade.
 *   2. ANÁLISE DA COLHEITA — um passo de LLM que lê a evidência colhida e
 *      responde duas coisas: o que já dá para AFIRMAR (com a citação da fonte)
 *      e o que ficou em ABERTO (as lacunas).
 *   3. APROFUNDAMENTO — uma camada por lacuna, atacando SÓ aquilo. Uma lacuna
 *      cuja pergunta normalizada já foi executada numa camada anterior é
 *      DESCARTADA antes de virar chamada (`filtrarLacunasRepetidas`) — é essa
 *      trava que impede a camada 2 de ser a camada 1 de novo.
 *
 * ─── QUAL FERRAMENTA EM QUAL CAMADA, E POR QUÊ ──────────────────────────────
 * CAMADA 1 = `surf-search-normal`. O `--help` dele diz o motivo: "One wave, by
 * design: the whole run is fitted inside the harness's detected bash timeout,
 * so it returns an answer instead of being killed mid-flight". A camada 1 é a
 * que NÃO pode voltar vazia por ter sido morta: ela é o insumo da análise e,
 * sem ela, não existe camada 2. Auto-orçamento > profundidade, aqui.
 *
 * CAMADAS ≥2 = `surf-search-unlimit --max-depth N`. O `--help` dele: "For real
 * deepening (analyze the harvest, descend, repeat)". A camada 2 pergunta UMA
 * coisa estreita — é exatamente onde descer num ramo fino compensa. O preço
 * está declarado no próprio `--help`: "⚠ No time budget is enforced", e é por
 * isso que a política de 143 existe.
 *
 * ─── 143: TROCA DE FERRAMENTA, NÃO RETRY ────────────────────────────────────
 * Se o `unlimit` for morto por timeout (143 / SIGTERM), a camada é REFEITA
 * UMA ÚNICA VEZ com `surf-search-normal`, que se auto-orça. Isso não é
 * retentativa e não pode virar uma: é a mesma pergunta entregue à ferramenta
 * que cabe no tempo, imediatamente, SEM espera nenhuma entre as duas chamadas.
 * Não existe sleep, jitter ou backoff em nenhum ponto deste arquivo — o surf
 * já ritma cada requisição pelo limite real do plano Brave num token bucket
 * compartilhado entre processos, e um ritmo por cima provoca o 429 que ele
 * evita. A trava `rebaixadaParaNormal` garante o "uma única vez".
 *
 * ─── PROFUNDIDADE É PARÂMETRO ───────────────────────────────────────────────
 * Em nenhum lugar deste módulo existe "pense profundamente, passo a passo" —
 * anti-padrão DECLARADO E REMOVIDO do repositório
 * (`services/challengeContextValidator.ts:26-40`, `docs/16` §7). Profundidade é:
 *   - `--max-depth` / `--max-rounds` / a escolha normal-vs-unlimit, no surf;
 *   - `reasoning: { enabled: true, effort: 'max' }` no LLM, aplicado por padrão
 *     pelo transporte único quando `reasoningEffort` é OMITIDO
 *     (`runtime/callLlm.ts`; `shared/llm/constants.ts:54`). É por isso que o
 *     analisador deste arquivo NÃO passa `reasoningEffort`: omitir É pedir o
 *     máximo.
 *
 * ─── FAIL-CLOSED ────────────────────────────────────────────────────────────
 * §9.3 de `docs/16-engine-de-trilha.md`. Config fora do contrato, contexto
 * incompleto, sem chave Brave, comando malformado e análise indisponível são
 * `PesquisaError` — nunca material aproximado. Colheita vazia é REGISTRADA
 * (exit 1 do surf é degradação real, não erro de transporte) e reprovada UMA
 * vez, no portão, no fim.
 *
 * ─── O QUE ESTE ARQUIVO NÃO FAZ ─────────────────────────────────────────────
 * Não escreve trilha, não fala com o banco, não é uma fase da engine e não
 * toca na CLI. Ele devolve `ResultadoDaPesquisa`; quem transforma isso em aula
 * é outro dono.
 */

import { DECLARACAO_INSUBSTITUIBILIDADE_REVISAO_HUMANA } from '../phases/f1Research';
import type { EngineLlm } from '../runtime/callLlm';
import { PESQUISA_CODES, PesquisaError } from './errors';
import {
  exigirAprovacao,
  portaoDeQualidade,
  type AfirmacaoComFonte,
  type ResultadoDoGate,
} from './qualityGate';
import {
  filtrarLacunasRepetidas,
  montarArgv,
  montarBrief,
  validarContexto,
  MAX_DEPTH,
  MAX_ROUNDS,
  MAX_SUB_AGENTS,
  type ContextoDaTrilha,
  type FerramentaDoSurf,
  type Lacuna,
  type TipoDeCamada,
} from './surfBrief';
import { fontesDoEnvelope, queriesExecutadas, type FonteComProcedencia } from './surfEnvelope';
import { rodarSurf, type ExecutorDeProcesso } from './surfRunner';

// As constantes vivem em `camadasConstantes.ts` (refatoração L05) e são
// re-exportadas pelos MESMOS nomes de antes.
export {
  SCHEMA_PESQUISA_EM_CAMADAS,
  TETO_CAMADAS,
  TETO_LACUNAS_POR_CAMADA,
} from './camadasConstantes';
import { SCHEMA_PESQUISA_EM_CAMADAS, TETO_CAMADAS, TETO_LACUNAS_POR_CAMADA } from './camadasConstantes';

// O analisador (tipos + implementação de produção) vive em `camadasAnalise.ts`
// (refatoração L05) — re-exportado pelos MESMOS nomes de antes.
export {
  montarPromptDaAnalise,
  extrairJson,
  normalizarAnalise,
  criarAnalisadorLlm,
} from './camadasAnalise';
export type {
  AnalisadorDeColheita,
  AnaliseDaColheita,
  DepsDoAnalisadorLlm,
  EntradaDaAnalise,
  ItemDeEvidencia,
} from './camadasAnalise';
import type {
  AnalisadorDeColheita,
  AnaliseDaColheita,
  EntradaDaAnalise,
  ItemDeEvidencia,
} from './camadasAnalise';

// ─── configuração ───────────────────────────────────────────────────────────

export interface ConfigDaPesquisa {
  /** total de camadas, 1..TETO_CAMADAS. 1 = só levantamento (sem aprofundar). */
  camadas: number;
  /** largura da onda do surf, 1..MAX_SUB_AGENTS. */
  subAgents: number;
  /** deadline de UMA invocação do surf, em ms. */
  timeoutMsPorCamada: number;
  /** deadline de UMA chamada de análise, em ms (obrigatório por etapa). */
  timeoutMsDaAnalise: number;
  /** `--max-depth` das camadas de aprofundamento, 1..MAX_DEPTH. */
  maxDepth: number;
  /** `--max-rounds` do unlimit nas camadas de aprofundamento, 1..MAX_ROUNDS. */
  maxRounds: number;
  /** lacunas atacadas por camada, 1..TETO_LACUNAS_POR_CAMADA. */
  lacunasPorCamada: number;
  /** identidade da lógica da etapa no cache do transporte (não vazio). */
  stageVersion: string;
  /** binário do surf-search-normal (default: PATH). */
  binarioNormal?: string;
  /** binário do surf-search-unlimit (default: PATH). */
  binarioUnlimit?: string;
  /** teto de itens de evidência entregues ao analisador por camada. */
  tetoEvidenciaPorAnalise?: number;
}

export const TETO_EVIDENCIA_PADRAO = 40;

/** Valida a configuração ANTES de qualquer trabalho. Sem default sorrateiro. */
export function validarConfig(cfg: ConfigDaPesquisa): void {
  const faixa = (nome: string, v: unknown, min: number, max: number): void => {
    if (!Number.isInteger(v) || (v as number) < min || (v as number) > max) {
      throw new PesquisaError({
        code: PESQUISA_CODES.CONFIG_INVALIDA,
        message: `\`${nome}\` fora de ${min}..${max}`,
        details: { [nome]: v },
      });
    }
  };
  if (typeof cfg !== 'object' || cfg === null) {
    throw new PesquisaError({
      code: PESQUISA_CODES.CONFIG_INVALIDA,
      message: 'configuração da pesquisa ausente',
    });
  }
  faixa('camadas', cfg.camadas, 1, TETO_CAMADAS);
  faixa('subAgents', cfg.subAgents, 1, MAX_SUB_AGENTS);
  faixa('maxDepth', cfg.maxDepth, 1, MAX_DEPTH);
  faixa('maxRounds', cfg.maxRounds, 1, MAX_ROUNDS);
  faixa('lacunasPorCamada', cfg.lacunasPorCamada, 1, TETO_LACUNAS_POR_CAMADA);
  faixa('timeoutMsPorCamada', cfg.timeoutMsPorCamada, 1, Number.MAX_SAFE_INTEGER);
  faixa('timeoutMsDaAnalise', cfg.timeoutMsDaAnalise, 1, Number.MAX_SAFE_INTEGER);
  if (typeof cfg.stageVersion !== 'string' || cfg.stageVersion.trim() === '') {
    throw new PesquisaError({
      code: PESQUISA_CODES.CONFIG_INVALIDA,
      message: '`stageVersion` obrigatório: é a invalidação explícita do cache do transporte',
    });
  }
  if (cfg.tetoEvidenciaPorAnalise !== undefined) faixa('tetoEvidenciaPorAnalise', cfg.tetoEvidenciaPorAnalise, 1, 500);
}

// ─── relatório ──────────────────────────────────────────────────────────────

export interface RelatorioDeCamada {
  camada: number;
  tipo: TipoDeCamada;
  ferramenta: FerramentaDoSurf;
  pergunta: string;
  /** id da lacuna atacada (ausente na camada de levantamento). */
  lacunaId?: string;
  exitCode: number;
  /** true quando o surf saiu 1: rodou e não achou nada. Registrado, não trocado. */
  vazia: boolean;
  queries: string[];
  fontes: FonteComProcedencia[];
  fontesRejeitadas: { url: string; motivo: string }[];
  degradacoes: { stage: string; reason: string }[];
  sintetizadoPeloSurf: boolean;
  /** true quando o 143 obrigou a refazer esta camada com surf-search-normal. */
  rebaixadaParaNormal?: boolean;
}

export interface ResultadoDaPesquisa {
  schema: typeof SCHEMA_PESQUISA_EM_CAMADAS;
  contexto: ContextoDaTrilha;
  camadas: RelatorioDeCamada[];
  /** fontes consolidadas e aprovadas, no formato que a aula já carrega. */
  fontes: ReturnType<typeof portaoDeQualidade>['fontesAprovadas'];
  afirmacoes: AfirmacaoComFonte[];
  /** lacunas que continuaram abertas depois da última camada. */
  lacunasAbertas: Lacuna[];
  gate: ResultadoDoGate;
  /** invocações do surf realmente feitas (inclui as rebaixadas por 143). */
  chamadasAoSurf: number;
  /**
   * A nota LITERAL de `docs/16` §4.2 / A-P14-3, que viaja DENTRO do artefato:
   * nenhuma fase posterior detecta pesquisa errada.
   */
  declaracao: string;
}

export interface DepsDaPesquisa {
  executor: ExecutorDeProcesso;
  analisador: AnalisadorDeColheita;
  config: ConfigDaPesquisa;
}

export interface PesquisaEmCamadas {
  executar(ctx: ContextoDaTrilha): Promise<ResultadoDaPesquisa>;
}

// ─── o orquestrador ─────────────────────────────────────────────────────────

export function criarPesquisaEmCamadas(deps: DepsDaPesquisa): PesquisaEmCamadas {
  if (typeof deps?.executor !== 'function') {
    throw new PesquisaError({
      code: PESQUISA_CODES.CONFIG_INVALIDA,
      message: 'executor de subprocesso obrigatório (injetado — a suíte roda sem rede)',
    });
  }
  if (typeof deps?.analisador?.analisar !== 'function') {
    throw new PesquisaError({
      code: PESQUISA_CODES.CONFIG_INVALIDA,
      message: 'analisador de colheita obrigatório (injetado)',
    });
  }
  const cfg = deps.config;
  validarConfig(cfg);
  const tetoEvidencia = cfg.tetoEvidenciaPorAnalise ?? TETO_EVIDENCIA_PADRAO;

  async function umaCamada(
    ctx: ContextoDaTrilha,
    numero: number,
    tipo: TipoDeCamada,
    alvo?: Lacuna,
  ): Promise<{ relatorio: RelatorioDeCamada; chamadas: number }> {
    const brief = montarBrief(ctx, tipo, alvo);
    const etapa = `pesquisa-camada-${numero}`;
    const ferramenta: FerramentaDoSurf = tipo === 'levantamento' ? 'normal' : 'unlimit';
    const comando = montarComandoDaCamada(brief, ferramenta);

    const execucao = await rodarComFallback143(deps, comando, brief, ferramenta, etapa);

    const { fontes, rejeitadas } = fontesDoEnvelope(execucao.resultado.envelope);
    return {
      chamadas: execucao.chamadas,
      relatorio: montarRelatorioDeCamada(numero, tipo, ferramenta, brief, alvo, execucao, fontes, rejeitadas),
    };
  }

  /** O argv da camada (binário alternativo e `--max-rounds` só no unlimit). */
  function montarComandoDaCamada(
    brief: ReturnType<typeof montarBrief>,
    ferramenta: FerramentaDoSurf,
  ): ReturnType<typeof montarArgv> {
    const binario = ferramenta === 'normal' ? cfg.binarioNormal : cfg.binarioUnlimit;
    return montarArgv(brief, {
      ferramenta,
      subAgents: cfg.subAgents,
      maxDepth: cfg.maxDepth,
      ...(ferramenta === 'unlimit' ? { maxRounds: cfg.maxRounds } : {}),
      ...(binario ? { binario } : {}),
    });
  }

  /** O resultado de UMA camada, já com a contagem de invocações ao surf. */
  interface ExecucaoDaCamada {
    resultado: Awaited<ReturnType<typeof rodarSurf>>;
    chamadas: number;
    rebaixada: boolean;
  }

  /**
   * 143: TROCA DE FERRAMENTA, uma única vez, sem espera. Só se a camada estava
   * no `unlimit` — rebaixar o `normal` para ele mesmo seria o retry que este
   * módulo não faz.
   */
  async function rodarComFallback143(
    depsDaCamada: DepsDaPesquisa,
    comando: ReturnType<typeof montarArgv>,
    brief: ReturnType<typeof montarBrief>,
    ferramenta: FerramentaDoSurf,
    etapa: string,
  ): Promise<ExecucaoDaCamada> {
    let chamadas = 1;
    let rebaixada = false;
    let resultado;
    try {
      resultado = await rodarSurf(depsDaCamada.executor, comando, {
        timeoutMs: cfg.timeoutMsPorCamada,
        etapa,
      });
    } catch (e) {
      if (
        e instanceof PesquisaError &&
        e.code === PESQUISA_CODES.SURF_MORTO_POR_TIMEOUT &&
        ferramenta === 'unlimit'
      ) {
        rebaixada = true;
        chamadas += 1;
        const comandoNormal = montarArgv(brief, {
          ferramenta: 'normal',
          subAgents: cfg.subAgents,
          maxDepth: cfg.maxDepth,
          ...(cfg.binarioNormal ? { binario: cfg.binarioNormal } : {}),
        });
        resultado = await rodarSurf(depsDaCamada.executor, comandoNormal, {
          timeoutMs: cfg.timeoutMsPorCamada,
          etapa: `${etapa}-rebaixada`,
        });
      } else {
        throw e;
      }
    }
    return { resultado, chamadas, rebaixada };
  }

  /** O `RelatorioDeCamada` da execução (pergunta, queries, fontes, degradações). */
  function montarRelatorioDeCamada(
    numero: number,
    tipo: TipoDeCamada,
    ferramenta: FerramentaDoSurf,
    brief: ReturnType<typeof montarBrief>,
    alvo: Lacuna | undefined,
    execucao: ExecucaoDaCamada,
    fontes: FonteComProcedencia[],
    rejeitadas: { url: string; motivo: string }[],
  ): RelatorioDeCamada {
    return {
      camada: numero,
      tipo,
      ferramenta: execucao.rebaixada ? 'normal' : ferramenta,
      pergunta: brief.question,
      ...(alvo ? { lacunaId: alvo.id } : {}),
      exitCode: execucao.resultado.exitCode,
      vazia: execucao.resultado.tipo === 'vazio',
      queries: queriesExecutadas(execucao.resultado.envelope),
      fontes,
      fontesRejeitadas: rejeitadas,
      degradacoes: execucao.resultado.envelope.diagnostics.degraded,
      sintetizadoPeloSurf: execucao.resultado.envelope.synthesized,
      ...(execucao.rebaixada ? { rebaixadaParaNormal: true } : {}),
    };
  }

  function evidenciaDe(fontes: FonteComProcedencia[]): ItemDeEvidencia[] {
    const vistas = new Set<string>();
    const itens: ItemDeEvidencia[] = [];
    for (const f of fontes) {
      if (vistas.has(f.link.url)) continue;
      vistas.add(f.link.url);
      itens.push({
        n: itens.length + 1,
        url: f.link.url,
        titulo: f.link.title,
        trecho: f.link.description,
      });
      if (itens.length >= tetoEvidencia) break;
    }
    return itens;
  }

  async function executar(ctx: ContextoDaTrilha): Promise<ResultadoDaPesquisa> {
    validarContexto(ctx);

    const relatorios: RelatorioDeCamada[] = [];
    const afirmacoes: AfirmacaoComFonte[] = [];
    const perguntasJaFeitas: string[] = [];
    let chamadasAoSurf = 0;
    let lacunasAbertas: Lacuna[] = [];

    // ── camada 1: levantamento ──
    const primeira = await umaCamada(ctx, 1, 'levantamento');
    chamadasAoSurf += primeira.chamadas;
    relatorios.push(primeira.relatorio);
    perguntasJaFeitas.push(primeira.relatorio.pergunta, ...primeira.relatorio.queries);

    let acumuladas: FonteComProcedencia[] = [...primeira.relatorio.fontes];
    let analise = await analisarOuFalhar(deps.analisador, {
      ctx,
      camada: 1,
      evidencia: evidenciaDe(acumuladas),
      perguntasJaFeitas: [...perguntasJaFeitas],
    });
    afirmacoes.push(...analise.afirmacoes);
    lacunasAbertas = analise.lacunas;

    // ── camadas 2..N: aprofundamento, uma lacuna por vez ──
    for (let numero = 2; numero <= cfg.camadas; numero += 1) {
      const { manter } = filtrarLacunasRepetidas(lacunasAbertas, perguntasJaFeitas);
      const alvos = manter.slice(0, cfg.lacunasPorCamada);
      if (alvos.length === 0) break;

      const novasDaCamada: FonteComProcedencia[] = [];
      for (const alvo of alvos) {
        // SEQUENCIAL de propósito: paralelizar invocações do surf faria vários
        // processos disputarem o MESMO token bucket do plano Brave. O surf já
        // ritma por dentro; empurrar mais em voo não colhe mais rápido.
        const camada = await umaCamada(ctx, numero, 'aprofundamento', alvo);
        chamadasAoSurf += camada.chamadas;
        relatorios.push(camada.relatorio);
        perguntasJaFeitas.push(camada.relatorio.pergunta, ...camada.relatorio.queries);
        novasDaCamada.push(...camada.relatorio.fontes);
      }

      acumuladas = [...acumuladas, ...novasDaCamada];
      analise = await analisarOuFalhar(deps.analisador, {
        ctx,
        camada: numero,
        evidencia: evidenciaDe(acumuladas),
        perguntasJaFeitas: [...perguntasJaFeitas],
      });
      afirmacoes.length = 0;
      afirmacoes.push(...analise.afirmacoes);
      lacunasAbertas = filtrarLacunasRepetidas(analise.lacunas, perguntasJaFeitas).manter;
    }

    // ── consolidação e portão ──
    const dedup = new Map<string, FonteComProcedencia>();
    for (const f of acumuladas) if (!dedup.has(f.link.url)) dedup.set(f.link.url, f);

    const gate = portaoDeQualidade({
      fontes: [...dedup.values()],
      afirmacoes,
      degradacoes: relatorios.flatMap((r) => r.degradacoes),
      sintetizadoPeloSurf: relatorios.every((r) => r.sintetizadoPeloSurf),
    });
    exigirAprovacao(gate, 'pesquisa-em-camadas');

    return {
      schema: SCHEMA_PESQUISA_EM_CAMADAS,
      contexto: ctx,
      camadas: relatorios,
      fontes: gate.fontesAprovadas,
      afirmacoes,
      lacunasAbertas,
      gate,
      chamadasAoSurf,
      declaracao: DECLARACAO_INSUBSTITUIBILIDADE_REVISAO_HUMANA,
    };
  }

  return { executar };
}

async function analisarOuFalhar(
  analisador: AnalisadorDeColheita,
  entrada: EntradaDaAnalise,
): Promise<AnaliseDaColheita> {
  let bruto: AnaliseDaColheita;
  try {
    bruto = await analisador.analisar(entrada);
  } catch (e) {
    if (e instanceof PesquisaError) throw e;
    throw new PesquisaError({
      code: PESQUISA_CODES.ANALISE_INDISPONIVEL,
      etapa: `analise-camada-${entrada.camada}`,
      message:
        'a análise da colheita não ficou disponível — fail-closed: sem análise não se inventa afirmação ' +
        'nem lacuna, a camada seguinte simplesmente não acontece',
      cause: e,
    });
  }
  if (!bruto || !Array.isArray(bruto.afirmacoes) || !Array.isArray(bruto.lacunas)) {
    throw new PesquisaError({
      code: PESQUISA_CODES.ANALISE_INDISPONIVEL,
      etapa: `analise-camada-${entrada.camada}`,
      message: 'a análise da colheita voltou fora de forma (afirmacoes/lacunas ausentes)',
    });
  }
  return {
    leitura: typeof bruto.leitura === 'string' ? bruto.leitura : '',
    afirmacoes: bruto.afirmacoes,
    lacunas: bruto.lacunas,
  };
}
