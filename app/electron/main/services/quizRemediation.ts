/**
 * electron/main/services/quizRemediation.ts — O CICLO DE REMEDIAÇÃO DO QUIZ.
 *
 * STUB DE CONTRATO (COMMIT PREP da onda 2). Este arquivo existe ANTES da
 * implementação porque duas sub-tarefas paralelas dependem da MESMA assinatura:
 * quem registra os handlers IPC (`ipc/track-handlers.ts`) precisa importar algo
 * que já exista, e quem implementa o serviço precisa escrever exatamente contra
 * o que o outro importou. Congelar a assinatura aqui é o que permite as duas
 * rodarem ao mesmo tempo sem uma adivinhar a outra.
 *
 * O QUE ESTE MÓDULO FAZ (quando implementado): o aluno erra o quiz, a IA
 * explica POR QUE aquela alternativa está errada (a explicação vira mensagem no
 * histórico da aula), e um quiz NOVO sobre o mesmo conteúdo é gerado na hora. O
 * aluno só chega ao desafio depois de acertar.
 *
 * O QUE ELE NÃO FAZ: não decide o gate (isso é `src/lib/trackLessonState.ts`,
 * puro, no renderer), não persiste (isso é `db/repo.ts`) e não registra canal
 * (isso é `ipc/track-handlers.ts`).
 *
 * DUAS REGRAS QUE NÃO SÃO ESTILO:
 *   1. `chat` é INJETADA, nunca importada — é o que torna o serviço testável
 *      sem rede, como `tutorChat(input, chat)` e `createBraveSearchService({fetchImpl})`.
 *   2. FAIL-CLOSED. Sem cliente de LLM, com resposta vazia, ou com quiz fora do
 *      contrato, o retorno é `{ ok:false, code }` — NUNCA uma explicação
 *      inventada nem um quiz malformado. É o mesmo contrato de
 *      `TUTOR_ERROR_CODES.UNAVAILABLE` em `tutorChat.ts`, e o motivo é o mesmo:
 *      o renderer nunca pode ficar em spinner infinito nem receber conteúdo
 *      fabricado no lugar de um erro.
 *
 * A AUTORIDADE PEDAGÓGICA da explicação NÃO é livre: `docs/02-pedagogia.md` §8
 * e as regras executáveis `ERR-1`..`ERR-8` de
 * `skills/study-method/references/pedagogia.md` governam o texto. Em especial
 * `ERR-8` ("feche o erro com uma verificação") é exatamente o que o quiz novo é.
 */
import type {
  QuizExplainReply,
  QuizExplainRequest,
  QuizRemedialReply,
  QuizRemedialRequest,
} from '@shared/ipc-contract';
import { QUIZ_ERROR_CODES } from '@shared/ipc-contract';

import type { ChatFn } from './tutorChat';

/** Dependências injetadas. `chat` ausente = sem LLM: o serviço falha FECHADO. */
export interface QuizRemediationDeps {
  chat?: ChatFn;
}

/** A superfície que `ipc/track-handlers.ts` consome. Assinatura CONGELADA. */
export interface QuizRemediation {
  /** Explica POR QUE a alternativa escolhida está errada. Fail-closed. */
  explain(req: QuizExplainRequest): Promise<QuizExplainReply>;
  /** Gera o quiz NOVO sobre o mesmo conteúdo, depois da explicação. Fail-closed. */
  remedial(req: QuizRemedialRequest): Promise<QuizRemedialReply>;
}

const NAO_IMPLEMENTADO =
  'o ciclo de remediação do quiz ainda não está disponível nesta build.';

/**
 * STUB: devolve `UNAVAILABLE` nos dois métodos. É o comportamento CORRETO para
 * um serviço ausente — a UI mostra "explicação indisponível" em vez de travar o
 * aluno ou inventar conteúdo. A implementação substitui o corpo, nunca a forma.
 */
export function createQuizRemediation(deps: QuizRemediationDeps = {}): QuizRemediation {
  void deps;
  return {
    async explain(): Promise<QuizExplainReply> {
      return { ok: false, code: QUIZ_ERROR_CODES.UNAVAILABLE, message: NAO_IMPLEMENTADO };
    },
    async remedial(): Promise<QuizRemedialReply> {
      return { ok: false, code: QUIZ_ERROR_CODES.UNAVAILABLE, message: NAO_IMPLEMENTADO };
    },
  };
}
