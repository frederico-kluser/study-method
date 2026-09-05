/**
 * src/components/quiz/quizOverlayBridge.ts — as DUAS funções puras que ligam a
 * máquina do ciclo (`trackLessonState`) à máquina do overlay
 * (`quizOverlayState`) e ao vocabulário da tela.
 *
 * Elas existem para que a LessonView não faça NENHUMA conta: a view chama, o
 * `node:test` cobre. As duas juntas são pequenas de propósito — é a fronteira
 * entre duas máquinas que já estão testadas, não uma terceira máquina.
 *
 *   1. `overlayContextFor` — monta o `QuizOverlayContext` (o que o store do
 *      overlay guarda) a partir da assertion AUTORAL, do `VisibleQuiz` e do
 *      índice da bolha que ancora o quiz na conversa.
 *
 *      A chave SAI SEMPRE de `visible.key` (produzida por `quizKeyFor`) e o
 *      `sectionId` sai da assertion AUTORAL, nunca da remediadora: a
 *      remediadora é gerada pela IA e não carrega âncora de seção — usá-la
 *      apagaria a seção do contexto na primeira remediação. A conversão
 *      `undefined → null` é explícita (o contrato do store diz `string |
 *      null`), e é escrita como ternário, não como `??`, para não reintroduzir
 *      no código a FORMA da chave antiga que `tests/lessonQuizKeyCoherence`
 *      proíbe.
 *
 *   2. `overlayStatusFor` — traduz o `QuizCycleStep` para o que a tela precisa
 *      DIZER. O switch existe porque a tela tem um estado que a máquina pura
 *      não conhece: 'indisponivel'. Ele não é do CICLO, é do CANAL — quando
 *      `track.quizExplain`/`track.quizRemedial` devolvem `{ok:false}` o ciclo
 *      continua exatamente onde estava (a máquina pura está certa), mas a tela
 *      precisa parar de dizer "escrevendo…" e passar a dizer o que faltou, com
 *      um caminho para repetir. Por isso `channelFailed` é um parâmetro em vez
 *      de um campo do estado: o ciclo não pode ficar sabendo de rede.
 *
 * PURAS: sem React, sem DOM, sem i18n, sem Electron.
 */
import type { TrackAssertionDto } from '../../../shared/ipc-contract';
import type { QuizCycleStep, VisibleQuiz } from '../../lib/trackLessonState';
import type { QuizOverlayContext } from '../../lib/quizOverlayState';
import type { QuizOverlayStatus } from './quizOverlayContent';

/**
 * O contexto que o store do overlay guarda para ESTE quiz.
 *
 * `anchorIndex` é o índice da bolha do histórico onde a versão minimizada
 * mora (a bolha que APRESENTOU a seção — `quizzesByMessageIndex`); -1 quando
 * o quiz ainda não tem âncora.
 */
export function overlayContextFor(
  original: Pick<TrackAssertionDto, 'sectionId'>,
  visible: Pick<VisibleQuiz, 'key' | 'assertion' | 'generation'>,
  anchorIndex: number,
): QuizOverlayContext {
  return {
    quizKey: visible.key,
    assertionId: visible.assertion.id,
    generation: visible.generation,
    // Ternário explícito, NÃO `??`: ver o cabeçalho.
    sectionId: original.sectionId === undefined ? null : original.sectionId,
    anchorIndex,
  };
}

/**
 * ETIQUETA de uma volta do ciclo: `<chave>#<geração>`.
 *
 * Existe para dar identidade ao PEDIDO em voo (a explicação, o quiz novo) sem
 * inventar contador nenhum: a chave é a da afirmação e a geração é a do ciclo,
 * então a etiqueta muda sozinha a cada quiz remediador injetado. É o que
 * permite à view saber "este pedido é da volta que está na tela" e descartar,
 * sem ambiguidade, o desfecho atrasado de uma volta anterior.
 */
export function quizCycleTag(quizKey: string, generation: number): string {
  return `${quizKey}#${generation}`;
}

/**
 * O que a tela DIZ sobre este quiz agora.
 *
 * `channelFailed` só é considerado nos dois passos em que existe um pedido em
 * voo ('explicar-erro' e 'gerar-novo-quiz'): um canal que falhou no passado
 * não pode transformar um card que já voltou a esperar resposta — nem um já
 * dominado — em "indisponível".
 */
export function overlayStatusFor(step: QuizCycleStep, channelFailed: boolean): QuizOverlayStatus {
  switch (step.kind) {
    case 'dominado':
      return 'dominado';
    case 'explicar-erro':
      return channelFailed ? 'indisponivel' : 'explicando';
    case 'gerar-novo-quiz':
      return channelFailed ? 'indisponivel' : 'gerando';
    default:
      return 'aguardando';
  }
}
