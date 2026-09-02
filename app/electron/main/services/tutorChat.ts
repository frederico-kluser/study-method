/**
 * electron/main/services/tutorChat.ts — chat do TUTOR de aula (rodada 8).
 *
 * A aula é um chat direto com a IA: ela APRESENTA a base teórica em
 * linguagem simples, uma SEÇÃO por vez ('next'), e o aluno pode perguntar
 * qualquer dúvida ('answer') — o tutor responde ancorado no conteúdo da aula.
 * As FONTES nunca aparecem no fluxo (a UI tem o botão "Fontes"); os
 * PRÉ-REQUISITOS são aulas anteriores da trilha que o tutor pode recomendar
 * quando o aluno não entender.
 *
 * ONDA 1 (teoria-pronta): 'next' é DETERMINÍSTICO — o markdown da seção
 * (com o code block e explanation quando houver) vira a mensagem do chat,
 * SEM chamar a LLM (o conteúdo vem pronto do arquivo da trilha; o texto
 * aparece INSTANTANEAMENTE, nunca esperando LLM). A LLM é usada SÓ em
 * 'answer' (dúvida do aluno) e na regeneração de desafios.
 *
 * Degradação honesta:
 *   - 'answer' com LLM indisponível → erro estruturado TUTOR_UNAVAILABLE
 *     imediato (falha RÁPIDA — nunca spinner infinito, nunca inventa
 *     resposta).
 *
 * ONDA1 (error-contract): quando um desafio da trilha FALHA, o chat da aula
 * vira a discussão do erro — o input traz `challengeError` (código enviado +
 * saída dos testes + checklist) e o system prompt ganha um BLOCO ADICIONAL
 * "CONTEXTO DE ERRO" + "REGRAS DE ERRO" (validar a hipótese do aluno contra
 * o erro real; analisar sozinho diante de "não sei"; nunca resolver o
 * desafio). Sem challengeError o prompt é byte-idêntico ao fluxo normal;
 * 'next' continua determinístico e ignora o erro.
 *
 * PURE/DI: `chat` injetável (testes com fake; produção = llmClient).
 */

import { TrackLessonSource } from '../content/trackTypes';
import type { TrackChallengeErrorReport } from '@shared/ipc-contract';

export type TutorRole = 'system' | 'user' | 'assistant';

export interface TutorChatMessageLike {
  role: 'assistant' | 'user';
  content: string;
}

export interface TutorChatInput {
  trackTitle: string;
  lesson: TrackLessonSource;
  /** aulas anteriores da trilha (título) que o tutor pode recomendar. */
  prereqTitles: string[];
  presentedSections: string[];
  history: TutorChatMessageLike[];
  action: 'next' | 'answer';
  /**
   * ADITIVO (onda1-error-contract): relatório do erro de um desafio que
   * falhou (código enviado + saída + checks). Presente nos turnos 'answer'
   * da discussão do erro — o system prompt ganha o bloco CONTEXTO DE ERRO +
   * REGRAS DE ERRO. Ausente/undefined no fluxo normal (nada muda).
   */
  challengeError?: TrackChallengeErrorReport;
}

export interface TutorChatResult {
  ok: boolean;
  message: string;
  sectionId: string | null;
  sectionTitle?: string;
  done: boolean;
  /** erro estruturado (apenas quando ok=false). */
  error?: { code: string; message: string };
}

export type ChatFn = (req: {
  messages: Array<{ role: TutorRole; content: string }>;
  temperature?: number;
  timeoutMs?: number;
}) => Promise<{ content: string }>;

export const TUTOR_ERROR_CODES = {
  UNAVAILABLE: 'TUTOR_UNAVAILABLE',
  EMPTY_REPLY: 'TUTOR_EMPTY_REPLY',
} as const;

/** A próxima seção a apresentar (primeira não apresentada, na ordem). */
export function nextSection(lesson: TrackLessonSource, presented: readonly string[]): TrackLessonSource['theory'][number] | null {
  const seen = new Set(presented);
  for (const s of lesson.theory) {
    if (!seen.has(s.id)) return s;
  }
  return null;
}

/** Recorta o histórico para as últimas N mensagens (limite de tokens). */
export function trimHistory(history: readonly TutorChatMessageLike[], maxMessages = 20): TutorChatMessageLike[] {
  return history.slice(-maxMessages);
}

/**
 * ONDA1 (error-contract): bloco de contexto do erro de um desafio que FALHOU
 * (turnos 'answer' da discussão do erro no chat da aula). PURA e testável —
 * devolve '' quando não há challengeError ou a action não é 'answer' (nada
 * muda no fluxo normal: o prompt fica byte-idêntico ao anterior).
 *
 * O bloco entrega ao tutor os FATOS REAIS (código do aluno, saída dos testes
 * e checklist do node:test) e as REGRAS DE ERRO: validar a hipótese do aluno
 * contra o erro real, analisar sozinho quando ele disser "não sei", nunca
 * resolver o desafio por ele e manter o tom simples em português.
 */
export function buildErrorContextSection(input: TutorChatInput): string {
  const report = input.challengeError;
  if (!report || input.action !== 'answer') return '';

  const files = report.files.map((f) => `### ${f.path}\n\`\`\`js\n${f.code}\n\`\`\``).join('\n\n');
  const checks = report.checks.map((c) => `${c.passed ? '✔' : '✖'} ${c.name}`).join('\n');

  return `CONTEXTO DE ERRO (desafio "${report.challengeTitle}" [id=${report.challengeId}] — a aula acabou de fechar porque ele falhou):

CÓDIGO ENVIADO PELO ALUNO (todos os arquivos):
${files}

SAÍDA DOS TESTES (runStudentCode):
${report.output}

CHECKLIST DOS TESTES (${report.passedCount} de ${report.totalCount} passaram):
${checks || '(nenhum check rodou — a execução nem chegou aos testes)'}

REGRAS DE ERRO (obrigatórias — valem para ESTA resposta):
1. O aluno acabou de falhar o desafio e respondeu O QUE ELE ACHA que errou. Analise a hipótese dele contra o ERRO REAL (saída + checks + código do aluno) e responda: confirme se a hipótese está certa ou corrija, mostrando EXATAMENTE onde está o erro real no código dele (cite o trecho).
2. Se o aluno disser que NÃO SABE / não faz ideia / "não sei" (ou variações), ANALISE o erro você mesmo e explique exatamente onde ele errou no código dele, com o trecho e o porquê.
3. NUNCA resolva o desafio por ele: guie até ele achar a correção; não escreva a solução completa.
4. Linguagem simples, português, frases curtas (mesmo tom das REGRAS existentes).`;
}

function buildSystemPrompt(input: TutorChatInput): string {
  const { lesson, trackTitle } = input;
  const sections = lesson.theory
    .map((s, i) => `SEÇÃO ${i + 1} [id=${s.id}]: ${s.title}\n${s.markdown}${s.code ? `\n\`\`\`${s.code.language}\n${s.code.code}\n\`\`\`` : ''}`)
    .join('\n\n---\n\n');
  const prereqs = input.prereqTitles.length > 0 ? input.prereqTitles.join('; ') : '(nenhuma)';
  // ONDA1 (error-contract): o contexto de erro é um BLOCO ADICIONAL ao final
  // do prompt — sem challengeError o texto retorna byte-idêntico ao fluxo
  // normal (sem regressão); com challengeError + 'answer', o bloco entra.
  const base = `Você é o tutor do curso "${trackTitle}" do study-method. Está ensinando a aula "${lesson.title}" (resumo: ${lesson.summary}).

REGRAS (obrigatórias):
1. Fale em PORTUGUÊS, linguagem simples, como um professor de verdade: frases curtas, analogias do dia a dia, zero jargão sem explicar.
2. NUNCA apresente mais de UMA seção por vez. O aluno avança seção a seção.
3. NUNCA invente conteúdo que não está no material abaixo. Se a dúvida fugir do escopo da aula, diga que é um assunto avançado e sugira seguir o curso.
4. Se o aluno disser que NÃO entendeu, ofereça revisar uma aula anterior da trilha (títulos disponíveis: ${prereqs}) e/ou uma nova analogia do MESMO conteúdo.
5. NUNCA mostre URLs ou fontes — as fontes não aparecem no chat.
6. Termine a apresentação de cada seção com UMA pergunta curta para o aluno checar se entendeu (ou um convite: "o que você quer saber?").

MATERIAL DA AULA (todo o conteúdo — o aluno só viu as seções já apresentadas):
${sections}`;
  const errorSection = buildErrorContextSection(input);
  return errorSection ? `${base}\n\n${errorSection}` : base;
}

/**
 * Turno do tutor. 'next' apresenta a próxima seção (LLM, fallback verbatim);
 * 'answer' responde à última pergunta do aluno ancorada no material.
 */
export async function tutorChat(input: TutorChatInput, chat: ChatFn): Promise<TutorChatResult> {
  const section = nextSection(input.lesson, input.presentedSections);

  if (input.action === 'next') {
    // ONDA 1 (teoria-pronta): apresentação DETERMINÍSTICA — o markdown da
    // seção (com o code block e explanation quando houver) vira a mensagem,
    // SEM chamar a LLM. Nenhum estado de "digitando" no renderer: o texto já
    // está no arquivo da trilha e aparece instantaneamente.
    if (!section) {
      // todas as seções apresentadas — a aula teórica terminou.
      return { ok: true, message: '', sectionId: null, done: true };
    }
    const markdown = section.code
      ? `${section.markdown}\n\n\`\`\`${section.code.language}\n${section.code.code}\n\`\`\`${section.code.explanation ? `\n\n${section.code.explanation}` : ''}`
      : section.markdown;
    // done = NÃO há mais seções depois desta (a última seção fecha a teoria —
    // a UI mostra "Concluir aula" assim que a última seção é apresentada).
    const done = nextSection(input.lesson, [...input.presentedSections, section.id]) === null;
    return { ok: true, message: markdown, sectionId: section.id, sectionTitle: section.title, done };
  }

  // action === 'answer' — precisa de uma pergunta do aluno. Falha RÁPIDA:
  // qualquer erro do chat (cliente ausente, rede, timeout) → TUTOR_UNAVAILABLE
  // imediato — o renderer nunca fica em spinner infinito.
  const lastUser = [...trimHistory(input.history)].reverse().find((m) => m.role === 'user');
  if (!lastUser || !lastUser.content.trim()) {
    return {
      ok: false,
      message: '',
      sectionId: null,
      done: false,
      error: { code: TUTOR_ERROR_CODES.EMPTY_REPLY, message: 'não há pergunta do aluno para responder.' },
    };
  }
  const messages: Array<{ role: TutorRole; content: string }> = [
    { role: 'system', content: buildSystemPrompt(input) },
    ...trimHistory(input.history).map((m) => ({ role: m.role as TutorRole, content: m.content })),
  ];
  try {
    const res = await chat({ messages, temperature: 0.3, timeoutMs: 45_000 });
    const text = res.content.trim();
    if (!text) throw new Error('empty');
    return { ok: true, message: text, sectionId: null, done: false };
  } catch (err) {
    return {
      ok: false,
      message: '',
      sectionId: null,
      done: false,
      error: { code: TUTOR_ERROR_CODES.UNAVAILABLE, message: 'O tutor não está disponível agora (falha do serviço de IA). Tente de novo em instantes.' },
    };
  }
}
