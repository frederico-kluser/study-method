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
 *   - a REGRA DE DISTINÇÃO do §5.5 é renderizada DAS CONSTANTES
 *     (`ACOES_DE_LACUNA` / `ACOES_DE_ORDEM` + `ACAO_SIGNIFICADOS`), nunca
 *     digitada à mão: o exemplo de ações de lacuna cita exatamente o par de
 *     CRIAR AULA e o exemplo de ações de ordem cita exatamente o complemento
 *     (HIGH-1, onda 2 — antes, o literal citava MOVE_CONCEPT_TO_ENTRY_BUDGET
 *     como ação de ordem, e o gate a rejeitava com POLARIDADE_VIOLADA:
 *     não-convergência por construção);
 *   - apontamento que NÃO mapeia para nenhuma ação não vira ação inventada: o
 *     modelo o deixa fora de `acoes`, e o laço materializa o defeito com
 *     `defeitoSemMapeamento` (review/actionCatalog.ts);
 *   - o ledger de rejeições entra verbatim, para o modelo não reabrir
 *     `excecao_intencional` (§6.7), e a lista DECLARADA `excluidosComoExcecao`
 *     distingue — para o laço F11 — "sem mapeamento" de "exceção intencional"
 *     (WARNING-3, onda 2: detecção por ausência não basta).
 *
 * NENHUM conteúdo didático: este arquivo produz INSTRUÇÕES DE PROCESSO,
 * nunca conteúdo de aula (F-06).
 */

import {
  ACAO_CATALOGO,
  ACAO_SIGNIFICADOS,
  ACOES_DE_LACUNA,
  ACOES_DE_ORDEM,
  type Apontamento,
  type ApontamentoId,
} from '../review/actionCatalog';

/** A entrada do prompt do planejador — tudo o que o papel recebe (§6.2/§7.3). */
export interface EntradaDoPromptDoPlanejador {
  trilha: string;
  rodada: number;
  /** apontamentos SOBREVIVENTES (pós-filtro estrutural R1-R8 e pós-provador). */
  apontamentos: readonly Apontamento[];
  /**
   * Apontamentos que NÃO devem gerar ação nesta rodada — a lista DECLARADA de
   * exceções intencionais do ledger (§6.7, estado `excecao_intencional`).
   *
   * RESPONSABILIDADE DO CHAMADOR (o laço F11, P-18): passar exatamente os ids
   * dos apontamentos sobreviventes marcados como exceção intencional no
   * ledger. Essa declaração é o que permite ao laço DISTINGUIR — WARNING-3 —
   * um apontamento ausente do plano por FALTA de mapeamento (SEM_MAPEAMENTO,
   * vira defeito via `defeitoSemMapeamento`) de um ausente por EXCEÇÃO
   * DECLARADA (não vira defeito; `eExcecaoDeclarada` em
   * review/actionCatalog.ts). NUNCA inferir por ausência: um id que o ledger
   * não marque como exceção e que não mapeie é SEM_MAPEAMENTO, não exceção.
   */
  excluidosComoExcecao: readonly ApontamentoId[];
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
 * A regra de distinção da LACUNA (§5.5), renderizada DAS CONSTANTES — nunca
 * literal. O tipo da entrada (`readonly AcaoDeLacuna[]` via `ACOES_DE_LACUNA`)
 * fecha por construção: é impossível citar aqui uma ação que não seja do par
 * de CRIAR AULA (HIGH-1, onda 2).
 */
function renderizarRegraDeLacuna(): string {
  const permitidas = ACOES_DE_LACUNA.map((acao) => `${acao} — ${ACAO_SIGNIFICADOS[acao]}`).join('; ');
  return (
    '- LACUNA DE CURRÍCULO — introduzido_em === null — a ação é CRIAR AULA. ' +
    `AÇÕES DE LACUNA PERMITIDAS: ${permitidas}. ` +
    'NUNCA REWRITE_IN_BUDGET: reescrever o desafio para caber num currículo furado é o laço que nunca termina (§5.5).'
  );
}

/**
 * A regra de distinção da ORDEM (§5.5), renderizada DAS CONSTANTES — nunca
 * literal. O tipo da entrada (`readonly AcaoDeOrdem[]` via `ACOES_DE_ORDEM`)
 * fecha por construção: é impossível citar aqui uma ação do par de CRIAR AULA
 * (HIGH-1, onda 2 — o literal antigo citava MOVE_CONCEPT_TO_ENTRY_BUDGET como
 * ação de ordem e o gate a rejeitava com POLARIDADE_VIOLADA).
 */
function renderizarRegraDeOrdem(): string {
  const permitidas = ACOES_DE_ORDEM.map((acao) => `${acao} — ${ACAO_SIGNIFICADOS[acao]}`).join('; ');
  return (
    '- VIOLAÇÃO DE ORDEM — introduzido_em !== null — a ação é reescrever/movimentar/reordenar. ' +
    `AÇÕES DE ORDEM PERMITIDAS: ${permitidas}. ` +
    'NUNCA criar aula: INSERT_INTERMEDIATE e MOVE_CONCEPT_TO_ENTRY_BUDGET são PROIBIDOS para ordem (§5.5).'
  );
}

/**
 * A seção dos apontamentos EXCLUÍDOS COMO EXCEÇÃO INTENCIONAL (WARNING-3,
 * onda 2): a lista DECLARADA que distingue "exceção intencional" de "sem
 * mapeamento" para o laço F11. Nenhum id é inferido por ausência — só entra
 * aqui o que o chamador passou em `excluidosComoExcecao`.
 */
function renderizarExcluidosComoExcecao(excluidos: readonly ApontamentoId[]): string {
  if (excluidos.length === 0) {
    return 'APONTAMENTOS EXCLUÍDOS COMO EXCEÇÃO INTENCIONAL (nenhum nesta rodada)';
  }
  const lista = excluidos.map((id) => `  ${id}`).join('\n');
  return (
    'APONTAMENTOS EXCLUÍDOS COMO EXCEÇÃO INTENCIONAL (docs §6.7 — NÃO gerar ação; NÃO contar como "sem mapeamento"):\n' +
    lista
  );
}

/**
 * promptDoPlanejador(entrada) — FUNÇÃO PURA: a mesma entrada devolve o mesmo
 * texto byte a byte. O retorno é o prompt de sistema/usuário canônico do
 * planejador (a saída estruturada é validada pelo `ActionsSchema` do P-04).
 */
export function promptDoPlanejador(entrada: EntradaDoPromptDoPlanejador): string {
  const catalogo = renderizarCatalogo();
  const regraDeLacuna = renderizarRegraDeLacuna();
  const regraDeOrdem = renderizarRegraDeOrdem();
  const excluidos = renderizarExcluidosComoExcecao(entrada.excluidosComoExcecao);
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
   ${regraDeLacuna}
   ${regraDeOrdem}
6. APONTAMENTO SEM MAPEAMENTO: se nenhuma ação do catálogo mapeia o apontamento, NÃO invente ação. Deixe-o FORA de "acoes" — ele será devolvido como DEFEITO DO CATÁLOGO (falha de mapeamento estruturada) e volta a você na rodada seguinte. No "motivo" das demais ações, diga explicitamente qual apontamento ficou de fora e por quê.
7. EXCEÇÃO INTENCIONAL (docs §6.7): apontamentos listados em "APONTAMENTOS EXCLUÍDOS COMO EXCEÇÃO INTENCIONAL" (abaixo) NÃO são reabertos — NÃO gere ação para eles, e NÃO os trate como "sem mapeamento": a ausência deles do plano é EXCEÇÃO DECLARADA, não defeito do catálogo. O mesmo vale para apontamentos marcados como excecao_intencional no LEDGER.

O CATÁLOGO FECHADO (as 14 ações, docs §6.7):
${catalogo}

APONTAMENTOS SOBREVIVENTES${temApontamentos ? '' : ' (nenhum — se não há apontamento, responda com "acoes": [])'}
${apontamentos}

LEDGER DE REJEIÇÕES${temLedger ? '' : ' (vazio nesta rodada)'}
${entrada.ledgerDeRejeicoes}

${excluidos}

SAÍDA (JSON) — o único texto da resposta, sem bloco de código:
{ "acoes": [ { "posicao": <int crescente>, "apontamento_id": "<id do apontamento>", "alvo": { "arquivo": "<caminho do arquivo>", "span": [<inicio>, <fim>] }, "motivo": "<por que esta ação e não outra — obrigatório antes da decisão>", "acao": "<uma ação literal do catálogo fechado>", "resultado_esperado": "<o que muda de verificável no artefato>" } ] }

Limite: a saída cabe em 2.000 tokens (docs §7). Qualquer ação fora do catálogo, qualquer span sem arquivo, qualquer motivo vazio ou qualquer criação de aula em violação de ordem invalida o plano.`;
}