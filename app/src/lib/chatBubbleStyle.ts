/**
 * src/lib/chatBubbleStyle.ts — as duas decisões PURAS do balão de chat: qual é
 * o TOM dele, e se ele se AGRUPA com o balão anterior.
 *
 * ─── DEFEITO 1: DUAS APARÊNCIAS PARA O MESMO AUTOR ────────────────────────
 * O tutor falava por dois balões radicalmente diferentes — papel branco em
 * `message` e ROXO CHAPADO em `reply` — e isso quebra a leitura de "quem está
 * falando": a cor do balão passava a significar "que tipo de turno é este",
 * não "quem disse". A onda anterior documentou a escolha do roxo como "a
 * identidade de resposta do tutor"; ela é MANTIDA, mas migra de PREENCHIMENTO
 * para ACENTO (borda + sombra colorida + avatar), que é exatamente onde a §1 do
 * redesign coloca a personalidade: "superfície quieta, resposta viva — a base é
 * sóbria; a personalidade vive em acento, estado e movimento". Todo balão do
 * tutor passa a ter a MESMA superfície de leitura (nível 1 da rampa); o que
 * muda entre eles é o acento.
 *
 * ─── DEFEITO 2: NENHUM AGRUPAMENTO ────────────────────────────────────────
 * O arquivo do chat dizia seguir o padrão iMessage e não seguia: cada bolha
 * repetia avatar + nome + hora mesmo em 5 mensagens seguidas do tutor.
 *
 * A REGRA DE AGRUPAMENTO NÃO INVENTA NÚMERO. A tentação era "agrupar mensagens
 * a menos de N minutos" — mas N seria um número sem origem, e este repositório
 * não aceita número sem verificação (CONTRIBUTING.md §"O que não é aceito").
 * A regra usada é derivada do que a UI JÁ MOSTRA: duas bolhas se agrupam quando
 * são do mesmo autor, com o mesmo TOM, e o RÓTULO DE HORA que elas exibiriam é
 * o mesmo (`formatChatTime`, HH:MM). Ou seja: o cabeçalho só é repetido quando
 * ele diria algo NOVO. Nada de limiar arbitrário, e o comportamento acompanha
 * de graça qualquer mudança futura no formato da hora.
 *
 * PURO: sem React, sem DOM (`src/lib` é compilado pelo tsconfig.node.json, lib
 * ES2022 sem DOM, e é daqui que os testes node:test leem).
 */
import { formatChatTime, type TutorChatMessage } from './trackLessonState';

/**
 * O TOM visual de um balão. Não é o `kind` do modelo: `review` se abre em dois
 * tons (erro e aprovação) porque as duas coisas são estados diferentes, e o
 * guarda-corpo #1 da §2 exige que todo efeito seja causado por um estado REAL.
 */
export type ChatBubbleTone = 'user' | 'tutor' | 'reply' | 'error' | 'approved';

/** Tom do balão a partir da mensagem. PURA. */
export function chatBubbleTone(message: TutorChatMessage): ChatBubbleTone {
  if (message.role === 'user') return 'user';
  if (message.kind === 'reply') return 'reply';
  if (message.kind === 'review') return message.errorFor === undefined ? 'approved' : 'error';
  return 'tutor';
}

/** Balões de tom `user` ficam à DIREITA; todo balão do tutor, à esquerda. */
export function isUserTone(tone: ChatBubbleTone): boolean {
  return tone === 'user';
}

/**
 * true quando este balão CONTINUA o anterior — mesmo autor, mesmo tom e mesmo
 * rótulo de hora. Nesse caso a UI omite avatar, nome e hora: repetir os três
 * cinco vezes seguidas é ruído, não informação.
 *
 * `previous` ausente (primeira bolha da conversa) nunca agrupa.
 */
export function groupsWithPrevious(
  message: TutorChatMessage,
  previous: TutorChatMessage | undefined,
  locale: string,
): boolean {
  if (previous === undefined) return false;
  if (previous.role !== message.role) return false;
  if (chatBubbleTone(previous) !== chatBubbleTone(message)) return false;
  return formatChatTime(previous.ts, locale) === formatChatTime(message.ts, locale);
}
