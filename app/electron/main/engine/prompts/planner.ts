/**
 * app/electron/main/engine/prompts/planner.ts — o PROMPT CANÔNICO DO
 * PLANEJADOR (pacote P-13, onda 2 do plano de execução v1).
 *
 * Contrato normativo: `docs/16-engine-de-trilha.md` §7.3 (papel e regra dura),
 * §6.7 (catálogo fechado), §5.5 (a distinção lacuna × ordem) e §7 (convenções
 * dos prompts canônicos: nada de "pense passo a passo" — profundidade é
 * parâmetro; saída do artefato limitada; raciocínio antes de decisão — INV-04,
 * §6.3).
 *
 * O PROMPT É UMA FUNÇÃO PURA DA ENTRADA (trilha + rodada + apontamentos
 * sobreviventes + ledger de rejeições): a mesma entrada produz o MESMO texto
 * byte a byte — sem relógio, sem aleatoriedade, sem estado. O catálogo é
 * embutido da fonte única (`review/actionCatalog.ts`, que re-exporta o
 * `as const` do P-04) — nenhum nome de ação é digitado à mão aqui.
 *
 * O que o texto GARANTE por construção:
 *   - toda ação usada é DO CATÁLOGO FECHADO (as 14 são listadas integralmente
 *     com significado; improvisar é proibido);
 *   - toda ação nomeia arquivo, span e resultado esperado (§7.3);
 *   - a REGRA DE DISTINÇÃO do §5.5 aparece literalmente: lacuna → CRIAR AULA
 *     (nunca REWRITE_IN_BUDGET); ordem → reescrita/movimentação (nunca criar
 *     aula);
 *   - apontamento que NÃO mapeia para nenhuma ação não vira ação inventada: o
 *     modelo o deixa fora de `acoes`, e o laço materializa o defeito com
 *     `defeitoSemMapeamento` (review/actionCatalog.ts);
 *   - o ledger de rejeições entra verbatim, para o modelo não reabrir
 *     `excecao_intencional` (§6.7).
 *
 * NENHUM conteúdo didático: este arquivo produz INSTRUÇÕES DE PROCESSO,
 * nunca conteúdo de aula (F-06).
 */

import {
  ACAO_CATALOGO,
  ACAO_SIGNIFICADOS,
  type Apontamento,
} from '../review/actionCatalog';

/** A entrada do prompt do planejador — tudo o que o papel recebe (§6.2/§7.3). */
export interface EntradaDoPromptDoPlanejador {
  trilha: string;
  rodada: number;
  /** apontamentos SOBREVIVENTES (pós-filtro estrutural R1-R8 e pós-provador). */
  apontamentos: readonly Apontamento[];
  /** o LEDGER DE REJEIÇÕES renderizado (§6.7) — texto verbatim. */
  ledgerDeRejeicoes: string;
}

/** Renderização determinística de um apontamento (mesma ordem dos campos do §6.3). */
function renderizarApontamento(apontamento: Apontamento, indice: number): string {
  const a = apontamento;
  const introduzidoEm =
    a.evidencia.introduzido_em === null
      ? 'null (LACUNA DE CURRÍCULO — não há aula que ensine o conceito)'
      : `"${a.evidencia.introduzido_em}"`;
  return [
    `APONTAMENTO ${indice}:`,
    `  id: ${a.id}`,
    `  rodada: ${a.rodada}`,
    `  artefato: ${a.artefato}`,
    `  alvo: caminho="${a.alvo.caminho}" linha=${a.alvo.linha} span=[${a.alvo.span[0]}, ${a.alvo.span[1]}] no_ast="${a.alvo.no_ast}" token="${a.alvo.token}"`,
    `  evidencia: tipo=${a.evidencia.tipo} prova="${a.evidencia.prova}"`,
    `  evidencia.introduzido_em: ${introduzidoEm}`,
    `  evidencia.reproduzivel_por: "${a.evidencia.reproduzivel_por}"`,
    `  defeito: ${a.defeito}`,
    `  regra_violada: ${a.regra_violada}`,
    `  categoria: ${a.categoria}`,
    `  severity: ${a.severity}`,
    `  acao_sugerida (do revisor — NÃO é obrigatória): ${a.acao_sugerida}`,
    `  confianca: ${a.confianca}`,
  ].join('\n');
}

/** O catálogo fechado renderizado integralmente: número, nome e significado. */
function renderizarCatalogo(): string {
  return ACAO_CATALOGO.map(
    (acao, indice) => `${String(indice + 1).padStart(2, ' ')}. ${acao} — ${ACAO_SIGNIFICADOS[acao]}`,
  ).join('\n');
}

/**
 * promptDoPlanejador(entrada) — FUNÇÃO PURA: a mesma entrada devolve o mesmo
 * texto byte a byte. O retorno é o prompt de sistema/usuário canônico do
 * planejador (a saída estruturada é validada pelo `ActionsSchema` do P-04).
 */
export function promptDoPlanejador(entrada: EntradaDoPromptDoPlanejador): string {
  const catalogo = renderizarCatalogo();
  const apontamentos = entrada.apontamentos.map(renderizarApontamento).join('\n\n');
  const temApontamentos = entrada.apontamentos.length > 0;
  const temLedger = entrada.ledgerDeRejeicoes.trim().length > 0;

  return `Você é o PLANEJADOR da engine de trilhas. Trilha: "${entrada.trilha}" · rodada ${entrada.rodada}.

PAPEL
Você transforma os apontamentos sobreviventes do revisor em AÇÕES DO CATÁLOGO FECHADO, ordenadas. Você NÃO escreve conteúdo didático: nenhuma prosa de aula, nenhum código de desafio, nenhum teste. Sua única saída é o plano de ações (JSON, formato no fim).

REGRAS DURAS (docs §7.3 e §6.7)
1. Toda ação usa UMA E SOMENTE UMA das ações do catálogo fechado abaixo. Ação fora do catálogo é PROIBIDA — improvisar é defeito.
2. Toda ação nomeia: o arquivo alvo, o span (intervalo [inicio, fim] no arquivo) e o resultado esperado (o que muda de verificável depois da correção).
3. Raciocínio antes de decisão (INV-04, docs §6.3): em toda ação, escreva o MOTIVO antes de escolher a ação. Nunca escolha a ação sem justificar.
4. As ações saem ORDENADAS: "posicao" crescente — essa é a ordem de aplicação.
5. A REGRA DE DISTINÇÃO que faz o laço terminar (docs §5.5):
   - apontamento com introduzido_em === null (LACUNA DE CURRÍCULO): a ação é CRIAR AULA — INSERT_INTERMEDIATE (aula atômica intermediária que ensina o conceito) ou MOVE_CONCEPT_TO_ENTRY_BUDGET (o conceito pertence aos critérios de entrada). NUNCA REWRITE_IN_BUDGET para lacuna: reescrever o desafio para caber num currículo furado é o laço que nunca termina.
   - apontamento com introduzido_em !== null (violação de ORDEM): a ação é reescrever/movimentar/reordenar — REWRITE_IN_BUDGET, REMOVE_EDGE, ADD_EDGE, MOVE_CONCEPT_TO_ENTRY_BUDGET etc. NUNCA criar aula.
6. APONTAMENTO SEM MAPEAMENTO: se nenhuma ação do catálogo mapeia o apontamento, NÃO invente ação. Deixe-o FORA de "acoes" — ele será devolvido como DEFEITO DO CATÁLOGO (falha de mapeamento estruturada) e volta a você na rodada seguinte. No "motivo" das demais ações, diga explicitamente qual apontamento ficou de fora e por quê.
7. LEDGER DE REJEIÇÕES (docs §6.7): um apontamento que aparece como excecao_intencional no ledger NÃO é reaberto — não gere ação para ele nesta rodada.

O CATÁLOGO FECHADO (as 14 ações, docs §6.7):
${catalogo}

APONTAMENTOS SOBREVIVENTES${temApontamentos ? '' : ' (nenhum — se não há apontamento, responda com "acoes": [])'}
${apontamentos}

LEDGER DE REJEIÇÕES${temLedger ? '' : ' (vazio nesta rodada)'}
${entrada.ledgerDeRejeicoes}

SAÍDA (JSON) — o único texto da resposta, sem bloco de código:
{ "acoes": [ { "posicao": <int crescente>, "apontamento_id": "<id do apontamento>", "alvo": { "arquivo": "<caminho do arquivo>", "span": [<inicio>, <fim>] }, "motivo": "<por que esta ação e não outra — obrigatório antes da decisão>", "acao": "<uma ação literal do catálogo fechado>", "resultado_esperado": "<o que muda de verificável no artefato>" } ] }

Limite: a saída cabe em 2.000 tokens (docs §7). Qualquer ação fora do catálogo, qualquer span sem arquivo, qualquer motivo vazio ou qualquer criação de aula em violação de ordem invalida o plano.`;
}