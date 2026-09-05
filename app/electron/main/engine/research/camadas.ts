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

/** Identidade do artefato produzido por este módulo. */
export const SCHEMA_PESQUISA_EM_CAMADAS = 'pesquisa-em-camadas' as const;

/**
 * Teto de camadas. Não é gosto: cada camada é no mínimo uma chamada de busca
 * mais uma de LLM, e o custo cresce linear. 4 é o teto declarado; quem quiser
 * mais muda aqui e assume a conta.
 */
export const TETO_CAMADAS = 4;
/** Teto de lacunas atacadas por camada — o mesmo raciocínio de custo. */
export const TETO_LACUNAS_POR_CAMADA = 5;

// ─── a análise da colheita (INJETADA) ───────────────────────────────────────

/** Um item de evidência entregue ao analisador, já numerado. */
export interface ItemDeEvidencia {
  n: number;
  url: string;
  titulo: string;
  trecho: string;
}

export interface EntradaDaAnalise {
  ctx: ContextoDaTrilha;
  /** número da camada cuja colheita está sendo analisada (1-based). */
  camada: number;
  evidencia: ItemDeEvidencia[];
  /** perguntas já executadas — o analisador não deve repeti-las. */
  perguntasJaFeitas: string[];
}

export interface AnaliseDaColheita {
  /** leitura curta da evidência — raciocínio ANTES da decisão (INV-04, §6.3). */
  leitura: string;
  afirmacoes: AfirmacaoComFonte[];
  lacunas: Lacuna[];
}

/**
 * O analisador. INJETADO: a suíte usa um fake e roda offline, sem rede e sem
 * chave — mesma disciplina de `braveSearchService` (`fetchImpl`) e da fase F1
 * (`Busca` injetada, A-P14-2).
 */
export interface AnalisadorDeColheita {
  analisar(entrada: EntradaDaAnalise): Promise<AnaliseDaColheita>;
}

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
    const binario = ferramenta === 'normal' ? cfg.binarioNormal : cfg.binarioUnlimit;

    const comando = montarArgv(brief, {
      ferramenta,
      subAgents: cfg.subAgents,
      maxDepth: cfg.maxDepth,
      ...(ferramenta === 'unlimit' ? { maxRounds: cfg.maxRounds } : {}),
      ...(binario ? { binario } : {}),
    });

    let chamadas = 1;
    let rebaixada = false;
    let resultado;
    try {
      resultado = await rodarSurf(deps.executor, comando, {
        timeoutMs: cfg.timeoutMsPorCamada,
        etapa,
      });
    } catch (e) {
      // 143: a onda não coube no tempo. TROCA DE FERRAMENTA, uma única vez,
      // sem espera. Só se a camada estava no `unlimit` — rebaixar o `normal`
      // para ele mesmo seria o retry que este módulo não faz.
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
        resultado = await rodarSurf(deps.executor, comandoNormal, {
          timeoutMs: cfg.timeoutMsPorCamada,
          etapa: `${etapa}-rebaixada`,
        });
      } else {
        throw e;
      }
    }

    const { fontes, rejeitadas } = fontesDoEnvelope(resultado.envelope);
    return {
      chamadas,
      relatorio: {
        camada: numero,
        tipo,
        ferramenta: rebaixada ? 'normal' : ferramenta,
        pergunta: brief.question,
        ...(alvo ? { lacunaId: alvo.id } : {}),
        exitCode: resultado.exitCode,
        vazia: resultado.tipo === 'vazio',
        queries: queriesExecutadas(resultado.envelope),
        fontes,
        fontesRejeitadas: rejeitadas,
        degradacoes: resultado.envelope.diagnostics.degraded,
        sintetizadoPeloSurf: resultado.envelope.synthesized,
        ...(rebaixada ? { rebaixadaParaNormal: true } : {}),
      },
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

// ─── o analisador de PRODUÇÃO (GLM 5.3 Flash pelo transporte único) ─────────

export interface DepsDoAnalisadorLlm {
  /** o transporte único da engine (`runtime/callLlm.ts`). INV-01: só ele. */
  llm: EngineLlm;
  stageVersion: string;
  timeoutMs: number;
  /** teto de lacunas pedidas por análise (default TETO_LACUNAS_POR_CAMADA). */
  tetoLacunas?: number;
}

/**
 * O prompt do analisador. Ele pede FORMATO, não profundidade:
 *   - `leitura` vem ANTES de `afirmacoes` e `lacunas` no JSON — raciocínio
 *     antes da decisão, INV-04/§6.3;
 *   - as fontes são citadas por NÚMERO da lista de evidência, não por URL
 *     colada de memória: número curto o modelo não erra, URL longa ele
 *     alucina. O mapeamento número→URL é feito por ESTE código, com os dados
 *     que vieram do surf;
 *   - índice fora da lista vira `indice-desconhecido:<n>`, que o portão de
 *     qualidade reprova como citação inventada — nunca é silenciado.
 * Não existe imperativo de profundidade no texto: `reasoningEffort` é OMITIDO
 * na chamada, e omitir é o que faz o transporte aplicar `effort: 'max'`.
 */
export function montarPromptDaAnalise(entrada: EntradaDaAnalise, tetoLacunas: number): string {
  const ctx = entrada.ctx;
  const jaEnsinado = ctx.jaEnsinado.length ? ctx.jaEnsinado.join('; ') : '(nada — primeira unidade)';
  const evidencia = entrada.evidencia
    .map((e) => `[${e.n}] ${e.titulo}\n    ${e.url}\n    ${e.trecho || '(a busca não devolveu trecho)'}`)
    .join('\n');
  const jaFeitas = entrada.perguntasJaFeitas.length
    ? entrada.perguntasJaFeitas.map((q) => `- ${q}`).join('\n')
    : '(nenhuma)';

  return [
    `Unidade em produção: "${ctx.unidade}" da trilha "${ctx.tema}" (${ctx.linguagem}), para ${ctx.publico}.`,
    `Objetivo da unidade: ${ctx.objetivo}`,
    `O currículo já ensinou: ${jaEnsinado}`,
    '',
    `EVIDÊNCIA COLHIDA (camada ${entrada.camada}) — cada item tem um número de citação:`,
    evidencia || '(nenhuma)',
    '',
    'PERGUNTAS JÁ EXECUTADAS (não repita nenhuma delas como lacuna):',
    jaFeitas,
    '',
    'Responda SOMENTE com um objeto JSON, nesta ordem de campos:',
    '{',
    '  "leitura": "o que a evidência acima sustenta e o que ela não sustenta",',
    '  "afirmacoes": [{"id":"a1","texto":"uma frase que a unidade pode ensinar","fontes":[1,3]}],',
    `  "lacunas": [{"id":"l1","pergunta":"o que ficou sem resposta","porque":"por que importa para esta unidade"}]`,
    '}',
    '',
    'Regras do conteúdo:',
    '- toda afirmação carrega ao menos um número de `fontes`, e o número tem que existir na lista acima;',
    '- afirmação que a evidência não sustenta não entra — falta de evidência vira lacuna, não afirmação;',
    '- o que o currículo já ensinou não é afirmação nova;',
    `- no máximo ${tetoLacunas} lacunas, cada uma diferente das perguntas já executadas.`,
  ].join('\n');
}

/**
 * Extrai o primeiro objeto JSON de uma resposta que pode vir cercada de prosa
 * ou de cerca ``` — mesmo problema que `researchPlanner.parseLlmJson` resolve
 * do lado dele. Devolve `null` em vez de lançar: quem decide o que fazer com a
 * falha é o chamador (que a transforma em ANALISE_INDISPONIVEL).
 */
export function extrairJson(conteudo: string): unknown | null {
  const texto = String(conteudo ?? '').trim();
  if (texto === '') return null;
  const semCerca = texto.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const inicio = semCerca.indexOf('{');
  const fim = semCerca.lastIndexOf('}');
  if (inicio < 0 || fim <= inicio) return null;
  try {
    return JSON.parse(semCerca.slice(inicio, fim + 1));
  } catch {
    return null;
  }
}

/** Converte a resposta crua do modelo na análise tipada, mapeando número→URL. */
export function normalizarAnalise(cru: unknown, evidencia: ItemDeEvidencia[]): AnaliseDaColheita | null {
  if (typeof cru !== 'object' || cru === null || Array.isArray(cru)) return null;
  const o = cru as Record<string, unknown>;
  if (!Array.isArray(o['afirmacoes']) || !Array.isArray(o['lacunas'])) return null;
  const porNumero = new Map<number, string>();
  for (const e of evidencia) porNumero.set(e.n, e.url);

  const afirmacoes: AfirmacaoComFonte[] = [];
  (o['afirmacoes'] as unknown[]).forEach((a, i) => {
    if (typeof a !== 'object' || a === null) return;
    const item = a as Record<string, unknown>;
    const numeros = Array.isArray(item['fontes']) ? item['fontes'] : [];
    afirmacoes.push({
      id: typeof item['id'] === 'string' && item['id'].trim() !== '' ? item['id'].trim() : `a${i + 1}`,
      texto: typeof item['texto'] === 'string' ? item['texto'] : '',
      fontes: numeros.map((n) => {
        const num = typeof n === 'number' ? n : Number(n);
        const url = porNumero.get(num);
        return url ?? `indice-desconhecido:${String(n)}`;
      }),
    });
  });

  const lacunas: Lacuna[] = [];
  (o['lacunas'] as unknown[]).forEach((l, i) => {
    if (typeof l !== 'object' || l === null) return;
    const item = l as Record<string, unknown>;
    lacunas.push({
      id: typeof item['id'] === 'string' && item['id'].trim() !== '' ? item['id'].trim() : `l${i + 1}`,
      pergunta: typeof item['pergunta'] === 'string' ? item['pergunta'] : '',
      porque: typeof item['porque'] === 'string' ? item['porque'] : '',
    });
  });

  return {
    leitura: typeof o['leitura'] === 'string' ? o['leitura'] : '',
    afirmacoes,
    lacunas,
  };
}

/**
 * O analisador de PRODUÇÃO. Uma chamada por camada, pelo transporte único —
 * que já traz semáforo, backoff por código, timeout obrigatório, cache e log
 * sanitizado. `reasoningEffort` NÃO é passado: omitir é pedir o máximo.
 */
export function criarAnalisadorLlm(deps: DepsDoAnalisadorLlm): AnalisadorDeColheita {
  const tetoLacunas = deps.tetoLacunas ?? TETO_LACUNAS_POR_CAMADA;
  return {
    async analisar(entrada: EntradaDaAnalise): Promise<AnaliseDaColheita> {
      const etapa = `pesquisa-analise-camada-${entrada.camada}`;
      let resposta;
      try {
        resposta = await deps.llm.callLlm(etapa, {
          prompt: montarPromptDaAnalise(entrada, tetoLacunas),
          system:
            'Você lê evidência de busca e separa o que ela sustenta do que ela não sustenta. ' +
            'Responde só com o objeto JSON pedido, sem texto em volta.',
          stageVersion: deps.stageVersion,
          timeoutMs: deps.timeoutMs,
          temperature: 0,
        });
      } catch (e) {
        throw new PesquisaError({
          code: PESQUISA_CODES.ANALISE_INDISPONIVEL,
          etapa,
          message: 'o transporte de LLM recusou a análise da colheita — fail-closed, nenhuma afirmação é inventada',
          cause: e,
        });
      }
      const analise = normalizarAnalise(extrairJson(resposta.content), entrada.evidencia);
      if (!analise) {
        throw new PesquisaError({
          code: PESQUISA_CODES.ANALISE_INDISPONIVEL,
          etapa,
          message: 'a análise da colheita não voltou como JSON com `afirmacoes` e `lacunas`',
        });
      }
      return analise;
    },
  };
}
