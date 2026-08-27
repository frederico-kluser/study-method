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
 * Degradação honesta:
 *   - 'next' com LLM indisponível → apresenta a seção VERBATIM (markdown do
 *     arquivo) — o conteúdo nunca trava por falha de serviço;
 *   - 'answer' com LLM indisponível → erro estruturado TUTOR_UNAVAILABLE
 *     (nunca inventa resposta).
 *
 * PURE/DI: `chat` injetável (testes com fake; produção = deepseekClient).
 */

import { TrackLessonSource } from '../content/trackTypes';

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

function buildSystemPrompt(input: TutorChatInput): string {
  const { lesson, trackTitle } = input;
  const sections = lesson.theory
    .map((s, i) => `SEÇÃO ${i + 1} [id=${s.id}]: ${s.title}\n${s.markdown}${s.code ? `\n\`\`\`${s.code.language}\n${s.code.code}\n\`\`\`` : ''}`)
    .join('\n\n---\n\n');
  const prereqs = input.prereqTitles.length > 0 ? input.prereqTitles.join('; ') : '(nenhuma)';
  return `Você é o tutor do curso "${trackTitle}" do study-method. Está ensinando a aula "${lesson.title}" (resumo: ${lesson.summary}).

REGRAS (obrigatórias):
1. Fale em PORTUGUÊS, linguagem simples, como um professor de verdade: frases curtas, analogias do dia a dia, zero jargão sem explicar.
2. NUNCA apresente mais de UMA seção por vez. O aluno avança seção a seção.
3. NUNCA invente conteúdo que não está no material abaixo. Se a dúvida fugir do escopo da aula, diga que é um assunto avançado e sugira seguir o curso.
4. Se o aluno disser que NÃO entendeu, ofereça revisar uma aula anterior da trilha (títulos disponíveis: ${prereqs}) e/ou uma nova analogia do MESMO conteúdo.
5. NUNCA mostre URLs ou fontes — as fontes não aparecem no chat.
6. Termine a apresentação de cada seção com UMA pergunta curta para o aluno checar se entendeu (ou um convite: "o que você quer saber?").

MATERIAL DA AULA (todo o conteúdo — o aluno só viu as seções já apresentadas):
${sections}`;
}

/**
 * Turno do tutor. 'next' apresenta a próxima seção (LLM, fallback verbatim);
 * 'answer' responde à última pergunta do aluno ancorada no material.
 */
export async function tutorChat(input: TutorChatInput, chat: ChatFn): Promise<TutorChatResult> {
  const section = nextSection(input.lesson, input.presentedSections);

  if (input.action === 'next') {
    if (!section) {
      // todas as seções apresentadas — a aula teórica terminou.
      return { ok: true, message: '', sectionId: null, done: true };
    }
    const messages: Array<{ role: TutorRole; content: string }> = [
      { role: 'system', content: buildSystemPrompt(input) },
      {
        role: 'user',
        content: `Apresente a SEÇÃO "${section.title}" (id=${section.id}) agora, em linguagem simples, como mensagem de chat. Use o material da seção. Uma seção só. Termine com uma pergunta curta. Não cite fontes.`,
      },
    ];
    // done = NÃO há mais seções depois desta (a última seção fecha a teoria —
    // a UI mostra "Concluir aula" assim que a última seção é apresentada).
    const done = nextSection(input.lesson, [...input.presentedSections, section.id]) === null;
    try {
      const res = await chat({ messages, temperature: 0.4, timeoutMs: 45_000 });
      const text = res.content.trim();
      if (!text) throw new Error('empty');
      return { ok: true, message: text, sectionId: section.id, sectionTitle: section.title, done };
    } catch (err) {
      // Fallback DETERMINÍSTICO: apresenta o markdown da seção verbatim.
      // O conteúdo da aula é o que importa; a adaptação de tom é luxo.
      const markdown = section.code
        ? `${section.markdown}\n\n\`\`\`${section.code.language}\n${section.code.code}\n\`\`\`${section.code.explanation ? `\n\n${section.code.explanation}` : ''}`
        : section.markdown;
      return { ok: true, message: markdown, sectionId: section.id, sectionTitle: section.title, done };
    }
  }

  // action === 'answer' — precisa de uma pergunta do aluno.
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
