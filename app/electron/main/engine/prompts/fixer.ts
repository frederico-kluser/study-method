/**
 * app/electron/main/engine/prompts/fixer.ts — o PROMPT CANÔNICO DO CORRETOR +
 * os primitivos PUROS do gate F11 (pacote P-13, onda 2 do plano de execução v1).
 *
 * Contrato normativo: `docs/16-engine-de-trilha.md` §7.4 (papel e regras
 * duras) e §6.7 (pins de regressão; ledger de rejeições com justificativa
 * obrigatória de ao menos 40 caracteres).
 *
 * O corretor aplica UMA ação prescrita, no span prescrito — com VERIFY-FIRST:
 * antes de mudar qualquer coisa ele confirma que o defeito existe (evidência
 * citável e verificável no artefato) e TEM O DIREITO DE REJEITAR o apontamento
 * com justificativa (§7.4). A rejeição é um resultado TIPADO —
 * `RejeicaoDoCorretor` `{ rejeitado: true, justificativa }` — que o laço
 * registra no ledger de rejeições (§6.7); rejeitar nunca é silêncio.
 *
 * O GATE (§7.4 — "diff fora do span é rejeitado pelo gate"): `validarDiffNoSpan`
 * é a função PURA que o laço F11 usa. O corretor só pode tocar o span
 * prescrito; qualquer trecho fora dele invalida a correção inteira
 * (FAIL-CLOSED).
 *
 * NENHUM conteúdo didático: este arquivo produz INSTRUÇÕES DE PROCESSO,
 * nunca conteúdo de aula (F-06).
 */

import {
  type AcaoCatalogo,
  type Apontamento,
  type SpanDeArquivo,
} from '../review/actionCatalog';

// ---------------------------------------------------------------------------
// O resultado TIPADO do corretor — aceita ou REJEITA (§7.4)
// ---------------------------------------------------------------------------

/** Justificativa mínima de rejeição — obrigatória e medida (§6.7, ledger). */
export const TAMANHO_MINIMO_DE_JUSTIFICATIVA = 40;

/**
 * A rejeição do apontamento pelo corretor (§7.4). É um resultado legítimo e
 * TIPADO: o laço a registra no ledger de rejeições (chave regra |
 * alvo_normalizado | conceito, §6.7) — o apontamento rejeitado não volta a
 * abrir toda rodada.
 */
export interface RejeicaoDoCorretor {
  rejeitado: true;
  justificativa: string;
}

/** A correção aceita: o delta da ÚNICA ação, restrita ao span prescrito. */
export interface CorrecaoDoCorretor {
  rejeitado: false;
  /** trechos do diff — cada um precisa caber no span (ver `validarDiffNoSpan`). */
  delta: readonly TrechoDeDiff[];
}

export type ResultadoDoCorretor = RejeicaoDoCorretor | CorrecaoDoCorretor;

/** Guarda de runtime do resultado discriminado. */
export function isRejeicaoDoCorretor(valor: unknown): valor is RejeicaoDoCorretor {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    (valor as { rejeitado?: unknown }).rejeitado === true &&
    typeof (valor as { justificativa?: unknown }).justificativa === 'string'
  );
}

/** Fábrica do resultado de rejeição — o único caminho para o corretor recusar. */
export function criarRejeicaoDoCorretor(justificativa: string): RejeicaoDoCorretor {
  return { rejeitado: true, justificativa };
}

/** A régua do ledger (§6.7): justificativa com ao menos 40 caracteres. */
export function justificativaDeRejeicaoValida(justificativa: string): boolean {
  return justificativa.trim().length >= TAMANHO_MINIMO_DE_JUSTIFICATIVA;
}

// ---------------------------------------------------------------------------
// O GATE — validarDiffNoSpan (§7.4)
// ---------------------------------------------------------------------------

/**
 * Um trecho de mudança do diff: substitui o intervalo [inicio, fim] do arquivo
 * por `substituicao` ('' = remoção). Mesma unidade do span do §6.3 — offsets
 * de caractere no arquivo (ex.: [122, 149]).
 */
export interface TrechoDeDiff {
  inicio: number;
  fim: number;
  substituicao: string;
}

/** O diff que o corretor produz para a SUA ação — um arquivo, trechos. */
export interface DiffDeArquivo {
  arquivo: string;
  trechos: readonly TrechoDeDiff[];
}

export interface ResultadoDeValidacaoDeDiff {
  ok: boolean;
  /** trechos que tocam área FORA do span — a correção inteira cai (§7.4). */
  trechos_fora_do_span: readonly TrechoDeDiff[];
  /** trechos malformados (inicio > fim) — estrutura inválida, fail-closed. */
  trechos_invalidos: readonly TrechoDeDiff[];
}

/**
 * validarDiffNoSpan(diff, span) — a função PURA do gate F11 (§7.4): o diff
 * SÓ pode tocar o span prescrito.
 *
 * Intervalos FECHADOS [inicio, fim] nas duas representações (mesma unidade do
 * span do §6.3). Um trecho está DENTRO ⇔ `span[0] <= trecho.inicio` E
 * `trecho.fim <= span[1]`. Trecho que cruza a borda (começa antes ou termina
 * depois) é FORA e invalida a correção inteira; trecho malformado
 * (inicio > fim) também é rejeitado (fail-closed). Diff vazio passa no gate de
 * span (nada fora) — o "corretor que não corrigiu nada" é pego pela
 * re-verificação do laço (o defeito persiste), NÃO por esta função.
 *
 * A conferência de ARQUIVO (diff.arquivo === alvo.arquivo) é do chamador: ela
 * compara com o `alvo` da ação, que esta função não recebe.
 */
export function validarDiffNoSpan(diff: DiffDeArquivo, span: SpanDeArquivo): ResultadoDeValidacaoDeDiff {
  const fora: TrechoDeDiff[] = [];
  const invalidos: TrechoDeDiff[] = [];
  for (const trecho of diff.trechos) {
    if (trecho.inicio > trecho.fim) {
      invalidos.push(trecho);
      continue;
    }
    if (trecho.inicio < span[0] || trecho.fim > span[1]) fora.push(trecho);
  }
  return { ok: fora.length === 0 && invalidos.length === 0, trechos_fora_do_span: fora, trechos_invalidos: invalidos };
}

// ---------------------------------------------------------------------------
// O prompt do corretor — verify-first, direito de rejeitar, span restrito
// ---------------------------------------------------------------------------

/** A decisão prescrita (uma ação, um alvo, um resultado esperado) — §7.4. */
export interface DecisaoDoCorretor {
  apontamento: Apontamento;
  acao: AcaoCatalogo;
  alvo: { arquivo: string; span: SpanDeArquivo };
  resultado_esperado: string;
}

export interface EntradaDoPromptDoCorretor {
  trilha: string;
  rodada: number;
  decisao: DecisaoDoCorretor;
  /** pins de regressão em vigor, renderizados (semântica do §6.7). */
  pins: readonly string[];
}

/**
 * promptDoCorretor(entrada) — FUNÇÃO PURA (mesma entrada, mesmo texto byte a
 * byte). O prompt embute UMA ação prescrita e o span dela, instrui o
 * verify-first, o direito de rejeitar (com o resultado tipado) e a proibição
 * estrutural de tocar fora do span.
 */
export function promptDoCorretor(entrada: EntradaDoPromptDoCorretor): string {
  const d = entrada.decisao;
  const a = d.apontamento;
  const preenchido = a.evidencia.introduzido_em === null ? 'null (lacuna de currículo)' : `"${a.evidencia.introduzido_em}"`;
  const pins = entrada.pins.map((pin, indice) => `PIN ${indice + 1}: ${pin}`).join('\n');

  return `Você é o CORRETOR da engine de trilhas. Trilha: "${entrada.trilha}" · rodada ${entrada.rodada}.

PAPEL
Você aplica UMA ação prescrita, no arquivo prescrito, no span prescrito, e nada além disso. Você NÃO decide outra ação, NÃO melhora o texto, NÃO toca em outro arquivo, NÃO toca fora do span.

VERIFY-FIRST — antes de mudar QUALQUER coisa, confirme que o defeito existe (§7.4)
1. Leia o artefato no arquivo alvo e confirme que a evidência do apontamento se verifica: o trecho citado em "prova" precisa existir literalmente no artefato, na posição indicada pelo span e pelo token.
2. Confirme que a ação prescrita corresponde ao defeito confirmado.
3. SÓ ENTÃO aplique a mudança — uma ação, no span prescrito.

DIREITO DE REJEITAR (§7.4)
Se a evidência NÃO se confirma (o trecho não existe, o token não está lá, o defeito já não existe), você TEM O DIREITO — e o dever — de REJEITAR o apontamento. A rejeição é um resultado legítimo e TIPADO:
{ "rejeitado": true, "justificativa": "<por que a evidência não se confirma — ao menos ${TAMANHO_MINIMO_DE_JUSTIFICATIVA} caracteres>" }
A justificativa é obrigatória e registrada no ledger de rejeições (§6.7). NUNCA invente uma correção para um defeito que não confirmou: isso é o que faz o laço convergir.

O SPAN É LEI (§7.4)
- O diff SÓ pode tocar o intervalo [${d.alvo.span[0]}, ${d.alvo.span[1]}] do arquivo "${d.alvo.arquivo}".
- Qualquer trecho do diff FORA desse span é rejeitado PELO GATE: a correção inteira é invalidada (fail-closed). Não teste o limite: um trecho que cruza a borda derruba a rodada.
- Não toque em nenhum outro arquivo.

PINS DE REGRESSÃO (§6.7)
Todos os pins rodam depois da sua correção. Quebrar um pin já verde invalida a correção — se a sua mudança quebraria um pin, REJEITE o apontamento com essa justificativa em vez de quebrá-lo.
${pins}

A DECISÃO PRESCRITA
  apontamento: ${a.id} (rodada ${a.rodada}, artefato ${a.artefato})
  defeito: ${a.defeito}
  regra_violada: ${a.regra_violada} · categoria: ${a.categoria} · severity: ${a.severity}
  evidencia: tipo=${a.evidencia.tipo} prova="${a.evidencia.prova}" introduzido_em=${preenchido} reproduzivel_por="${a.evidencia.reproduzivel_por}"
  alvo do apontamento: caminho="${a.alvo.caminho}" linha=${a.alvo.linha} span=[${a.alvo.span[0]}, ${a.alvo.span[1]}] token="${a.alvo.token}"
  AÇÃO PRESCRITA: ${d.acao}
  ARQUIVO: "${d.alvo.arquivo}"
  SPAN: [${d.alvo.span[0]}, ${d.alvo.span[1]}]
  RESULTADO ESPERADO: ${d.resultado_esperado}

SAÍDA (JSON) — o único texto da resposta, sem bloco de código:
Aceitando: { "rejeitado": false, "delta": [ { "inicio": <int>, "fim": <int>, "substituicao": "<texto que substitui o trecho>" } ] }
Rejeitando: { "rejeitado": true, "justificativa": "<ao menos ${TAMANHO_MINIMO_DE_JUSTIFICATIVA} caracteres>" }

Limite: a saída cabe em 2.000 tokens (docs §7). Trecho fora do span, arquivo diferente do prescrito, ação diferente da prescrita ou justificativa curta demais invalidam a rodada.`;
}