/**
 * app/electron/main/engine/research/camadasAnalise.ts — a ANÁLISE DA COLHEITA
 * da pesquisa em camadas (`camadas.ts`): os tipos do analisador INJETADO e o
 * analisador de PRODUÇÃO (GLM pelo transporte único). Extraído do módulo
 * original na refatoração do lote L05 sem NENHUMA mudança de comportamento —
 * a fachada `camadas.ts` re-exporta tudo isto pelos MESMOS nomes.
 */

import type { EngineLlm } from '../runtime/callLlm';
import { PESQUISA_CODES, PesquisaError } from './errors';
import type { AfirmacaoComFonte } from './qualityGate';
import type { ContextoDaTrilha, Lacuna } from './surfBrief';
import { TETO_LACUNAS_POR_CAMADA } from './camadasConstantes';

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
