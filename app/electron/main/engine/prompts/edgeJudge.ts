/**
 * app/electron/main/engine/prompts/edgeJudge.ts — O PROMPT DO JUIZ DE ARESTAS
 * da engine de trilhas (pacote P-16, `docs/16-engine-de-trilha.md` §3.4).
 *
 * Contrato normativo: §3.4 (a pergunta canônica VERBATIM; "não sei" PERMITIDO;
 * empate resulta em NENHUMA aresta; precisão vale mais que cobertura — uma
 * aresta errada corrompe o orçamento de TODOS os descendentes, em silêncio) e
 * §7 (convenções dos prompts canônicos).
 *
 * F3 (phases/f3Graph.ts) julga arestas EM PARALELO (fan-out com semáforo), mas
 * CADA chamada deste juiz julga UMA aresta (pares dura A→B onde
 * `B.desbloqueadoPor ∋ A`), recebendo APENAS a fatia CONGELADA: os dois
 * conceitos + a fatia do orçamento do snapshot — nunca o estado vivo do grafo.
 *
 * TRÊS decisões de contrato:
 *
 *   1. Pergunta canônica VERBATIM: `PERGUNTA_CANONICA_ARESTA` é a literal do
 *      §3.4, caractere a caractere (sem as aspas do documento). O prompt a usa
 *      com CITAÇÃO literal, e o teste a procura VERBATIM — a frase não pode ser
 *      reescrita "com as mesmas palavras": o §3.4 é o texto normativo.
 *   2. INV-04/INV-05 (docs §6.3, lint do P-04): `EdgeVoteSchema` tem
 *      `evidencia` (justificativa — nome em JUSTIFICATION_FIELD_NAMES) ANTES de
 *      `veredito` (decisão — nome em DECISION_FIELD_NAMES); TODOS os campos são
 *      obrigatórios e o schema é `.strict()` (campo extra = resposta inválida).
 *      O mesmo `EdgeVoteSchema` (refletido no JSON schema versionado abaixo)
 *      acompanha a chamada como contrato de SAÍDA estruturada.
 *   3. Respostas: `sim` | `nao` | `nao-sei` (`VotoAresta`). `nao-sei` é
 *      resposta VÁLIDA e NUNCA conta como `sim` (a política de voto está na
 *      fase — phases/f3Graph.ts — não aqui: aqui só se define o contrato da
 *      chamada e o parse FAIL-CLOSED da saída).
 *
 * ESTE ARQUIVO não escreve em disco, não chama LLM e não decide voto:
 * `promptDeJuizDeAresta` é uma função PURA (mesma entrada → mesma string);
 * `parseRespostaDeJuiz` é o parse FAIL-CLOSED da saída do modelo (resposta que
 * não é JSON válido, que viola o schema, ou que não ecoa o par pedido é ERRO,
 * nunca veredito). A construção do juiz em PRODUÇÃO (callLlm) é da fase
 * (`criarJuizDeArestaLlm` em phases/f3Graph.ts); os testes usam fakes.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// A pergunta canônica do §3.4 — VERBATIM
// ---------------------------------------------------------------------------

/**
 * A pergunta canônica do §3.4, VERBATIM (a literal do documento, sem as aspas):
 *
 *   "se o aluno acabou de errar B, é praticamente certo que também erraria A,
 *    excluindo erro de digitação e acerto por sorte?"
 *
 * A aresta dura A→B ("não dá para aprender B sem A") SÓ se confirma com `sim`
 * para ESTA pergunta. O teste fixa a literal — não existe paráfrase permitida.
 */
export const PERGUNTA_CANONICA_ARESTA =
  'se o aluno acabou de errar B, é praticamente certo que também erraria A, excluindo erro de digitação e acerto por sorte?';

// ---------------------------------------------------------------------------
// O vocabulário da resposta (contrato da fase F3)
// ---------------------------------------------------------------------------

/** A resposta do juiz de arestas: `nao-sei` é VÁLIDA e nunca conta como `sim`. */
export type VotoAresta = 'sim' | 'nao' | 'nao-sei';

// ---------------------------------------------------------------------------
// A fatia congelada que o juiz recebe (nunca o estado vivo do grafo)
// ---------------------------------------------------------------------------

/**
 * A fatia CONGELADA de UM conceito — o subconjunto do nó atômico (F2) que o
 * juiz precisa para responder a pergunta canônica. `Object.freeze` em
 * profundidade (incluindo os arrays) é feito pela fase antes de chamar o juiz.
 */
export interface FatiaDeConceito {
  /** `concept.id` (snake_case — type check duro do §3.4). */
  id: string;
  /** nome curto humano do nó (ex.: "let e atribuição"). */
  nome: string;
  /** família sintática do conceito (ex.: 'sintaxe') — contexto, não decisão. */
  familiaSintatica: string;
  /** as construções que o nó introduz, nas duas faixas (contexto do que B ensina). */
  introduces: { receptive: readonly string[]; productive: readonly string[] };
  /** papel do nó ('isolado' | 'integration') — nó integrativo é composição (§3.7). */
  role: string;
}

/** A entrada do prompt do juiz: APENAS os dois conceitos + a fatia do orçamento. */
export interface EntradaPromptJuizDeAresta {
  /** o conceito A (origem da aresta A→B). */
  de: FatiaDeConceito;
  /** o conceito B (destino — "se o aluno acabou de errar B, erraria A?"). */
  para: FatiaDeConceito;
  /**
   * a fatia do ORÇAMENTO DO SNAPSHOT (contexto do que o aluno já viu até a
   * aula de B), nas duas faixas. `null` = orçamento não informado (ex.: o
   * draft ainda não deriva orçamento) — o juiz julga só pelos dois conceitos.
   * NUNCA o orçamento vivo em construção.
   */
  orcamentoFatia: { receptive: readonly string[]; productive: readonly string[] } | null;
}

// ---------------------------------------------------------------------------
// O schema de SAÍDA (INV-04/INV-05 — ver cabeçalho)
// ---------------------------------------------------------------------------

/**
 * O contrato de saída estruturada do juiz: `evidencia` ANTES de `veredito`
 * (INV-04 — os nomes estão nas listas do lint do P-04), todos obrigatórios
 * (INV-05), `.strict()` (campo extra — inclusive `voto`, `decisao`, `severity`
 * — invalida a resposta). `de`/`para` ecoam o par pedido: o juiz responde
 * SOBRE o par que recebeu, nunca sobre outro.
 */
export const EdgeVoteSchema = z
  .object({
    de: z.string().min(1),
    para: z.string().min(1),
    evidencia: z.string().min(1),
    veredito: z.enum(['sim', 'nao', 'nao-sei']),
  })
  .strict();

/** O tipo da resposta validada (o veredito já É um `VotoAresta`). */
export type RespostaDeJuiz = z.infer<typeof EdgeVoteSchema>;

/**
 * O MESMO contrato em JSON Schema (versão 07, formato do transporte):
 * `schema` entra na chave do cache do callLlm e é o template rígido enviado
 * ao provedor junto com o prompt. Mantido em sincronia com o zod acima (o
 * teste lint do P-04 valida o zod; o JSON segue o mesmo shape — todos os
 * campos obrigatórios, strict via additionalProperties:false).
 */
export const EDGE_VOTE_JSON_SCHEMA = JSON.stringify(
  {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
    additionalProperties: false,
    required: ['de', 'para', 'evidencia', 'veredito'],
    properties: {
      de: { type: 'string', minLength: 1 },
      para: { type: 'string', minLength: 1 },
      evidencia: { type: 'string', minLength: 1 },
      veredito: { type: 'string', enum: ['sim', 'nao', 'nao-sei'] },
    },
  },
  null,
  2,
);

// ---------------------------------------------------------------------------
// O prompt — função PURA
// ---------------------------------------------------------------------------

/** Renderização determinística da fatia de UM conceito no prompt. */
function renderizarConceito(rotulo: string, c: FatiaDeConceito): string {
  const lines = [
    `  ${rotulo} (id: ${c.id}) — ${c.nome}`,
    `    família sintática: ${c.familiaSintatica}`,
    `    papel do nó: ${c.role}`,
    `    introduz no receptivo: ${c.introduces.receptive.join(', ') || '(nenhuma)'}`,
    `    introduz no produtivo: ${c.introduces.productive.join(', ') || '(nenhuma)'}`,
  ];
  return lines.join('\n');
}

/** Renderização determinística da fatia do orçamento do snapshot (ou aviso). */
function renderizarOrcamento(orcamento: EntradaPromptJuizDeAresta['orcamentoFatia']): string {
  if (orcamento === null) {
    return 'Orçamento do snapshot: NÃO INFORMADO — julgue pelos dois conceitos.';
  }
  return (
    'Orçamento do snapshot (o que o aluno viu até aqui):\n' +
    `  receptivo: ${orcamento.receptive.join(', ') || '(vazio)'}\n` +
    `  produtivo: ${orcamento.productive.join(', ') || '(vazio)'}`
  );
}

/**
 * Monta o prompt completo do juiz de arestas (uma aresta por chamada). Função
 * PURA: mesma entrada → mesma string, zero efeito colateral. A pergunta
 * canônica entra VERBATIM (citação literal do §3.4); `nao-sei` é declarado
 * permitido e a instrução de precisão-antes-de-cobertura é explícita
 * (empate → nada; `nao-sei` nunca conta como `sim`).
 *
 * Convenções do §7 respeitadas: não há "pense profundamente, passo a passo",
 * não há "recomece do zero", a saída é o JSON do schema EXATO.
 */
export function promptDeJuizDeAresta(entrada: EntradaPromptJuizDeAresta): string {
  return [
    'Você é o JUIZ DE ARESTAS da fase F3 da engine de trilhas (docs/16-engine-de-trilha.md §3.4).',
    'Seu trabalho é julgar UMA aresta dura de pré-requisito por chamada.',
    '',
    'Uma aresta dura A → B significa: "não dá para aprender B sem A". Ela alimenta a ordenação',
    'topológica e a detecção de salto do currículo. Uma aresta errada corrompe o orçamento de',
    'TODOS os descendentes de B, em silêncio — por isso PRECISÃO VALE MAIS QUE COBERTURA: em',
    'caso de dúvida, é melhor NÃO criar a aresta do que criar uma errada.',
    '',
    'A pergunta canônica, VERBATIM (docs §3.4):',
    '',
    `  "${PERGUNTA_CANONICA_ARESTA}"`,
    '',
    'Responda `sim` somente quando a resposta for "praticamente certo" — excluindo erro de',
    'digitação e acerto por sorte. Dúvida real, contexto insuficiente ou empate entre as',
    'evidências: responda `nao-sei` (resposta PERMITIDA) ou `nao`. `nao-sei` NUNCA conta como',
    '`sim`: a política de voto da fase trata empate como NENHUMA aresta.',
    '',
    '## Os dois conceitos',
    renderizarConceito('A (de)', entrada.de),
    'e o conceito B, o destino da aresta:',
    renderizarConceito('B (para)', entrada.para),
    '',
    'Responda a pergunta canônica com B no papel de "o aluno errou B" e A no papel de "erraria A?".',
    '',
    '## Orçamento do snapshot',
    renderizarOrcamento(entrada.orcamentoFatia),
    '',
    '## Formato de saída',
    'Responda APENAS com JSON válido neste formato (todo campo é obrigatório; a `evidencia` vem',
    'ANTES do `veredito` — a ordem dos campos no schema é parte do contrato):',
    '{',
    '  "de": "' + entrada.de.id + '",',
    '  "para": "' + entrada.para.id + '",',
    '  "evidencia": "a evidência que sustenta o veredito, citando o que nos dois conceitos decide",',
    '  "veredito": "sim" | "nao" | "nao-sei"',
    '}',
    'Nenhuma prosa fora do JSON, nenhum comentário, nenhum fence.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Parse da saída — FAIL-CLOSED (resposta inválida nunca vira veredito)
// ---------------------------------------------------------------------------

/**
 * Extrai o objeto JSON da resposta do modelo: remove fences ```json```
 * defensivos e isola o primeiro par `{...}` balanceado. Arremessa Error com
 * mensagem acionável quando não há objeto JSON.
 */
function extrairObjetoJson(content: string): string {
  const trimado = content.trim();
  const fence = trimado.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const candidato = fence ? fence[1] : trimado;
  const inicio = candidato.indexOf('{');
  const fim = candidato.lastIndexOf('}');
  if (inicio === -1 || fim === -1 || fim < inicio) {
    throw new Error(`edgeJudge: a resposta não contém um objeto JSON — ${JSON.stringify(content.slice(0, 120))}`);
  }
  return candidato.slice(inicio, fim + 1);
}

/**
 * Valida a resposta crua do modelo contra o `EdgeVoteSchema` (strict, todos
 * obrigatórios) e, quando o par esperado é informado, confere que `de`/`para`
 * ecoam EXATAMENTE o par julgado (o juiz responde sobre o par que recebeu —
 * eco errado é resposta inválida, fail-closed). Devole o `VotoAresta`.
 *
 * Use em produção (após o callLlm) e nos testes do contrato de resposta.
 */
export function parseRespostaDeJuiz(content: string, esperado?: { de: string; para: string }): VotoAresta {
  let cru: unknown;
  try {
    cru = JSON.parse(extrairObjetoJson(content));
  } catch (erro) {
    if (erro instanceof SyntaxError) {
      throw new Error(`edgeJudge: resposta não é JSON válido — ${erro.message}`);
    }
    throw erro;
  }
  const checagem = EdgeVoteSchema.safeParse(cru);
  if (!checagem.success) {
    const detalhe = checagem.error.issues
      .map((issue) => `campo "${issue.path.map(String).join('.') || '(raiz)'}": ${issue.message}`)
      .join('; ');
    throw new Error(`edgeJudge: resposta fora do EdgeVoteSchema — ${detalhe}`);
  }
  if (esperado !== undefined) {
    if (checagem.data.de !== esperado.de || checagem.data.para !== esperado.para) {
      throw new Error(
        `edgeJudge: resposta ecoa o par ${checagem.data.de}→${checagem.data.para}, mas o par julgado era ${esperado.de}→${esperado.para}`,
      );
    }
  }
  return checagem.data.veredito;
}