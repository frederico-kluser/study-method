/**
 * tests/challengeFirstFailFlow.test.ts — ONDA2 (falha-ver-aula), o fluxo da
 * falha do desafio TENTADO ANTES DA AULA.
 *
 * Pedido do dono, verbatim: "quando clico em tentar desafio e falho, posso
 * clicar para VER A AULA e não em próximo ou continuar, porque tentei o
 * desafio antes da aula — clicar nisso limpa tudo e começa a aula do início.
 * Nesse caso o aluno REFAZ O MESMO teste; somente se falhar de novo é que se
 * gera um novo desafio".
 *
 * ARQUIVO NOVO de propósito: os testes criados pelas subwaves de teste da
 * onda 1 são de outro agente (FORBIDDEN_FILES) — este arquivo mede SOMENTE o
 * que esta onda acrescenta, tudo em lógica PURA (node:test sem jsdom, mesmo
 * padrão de challengeNav.test.ts / lessonChallengeCard.test.ts):
 *
 *   1. o CONTRATO: `attemptedBeforeLesson` no `TrackChallengeNavSelection`
 *      (setado SÓ pelo openChallengeFromCard — aqui prova-se que o reducer o
 *      preserva) e no `TrackChallengeErrorReport` (o painel copia);
 *   2. `buildErrorReport` com e sem o flag;
 *   3. `seedChallengeError` carrega o flag para a bolha 'review'
 *      (`errorBeforeLesson`) e o `chatHistory` o STRIPA (nunca vai ao main);
 *   4. `lessonChallengeBubbleAction` — a regra pura que decide "Ver a aula" ×
 *      "Gerar novo desafio" (1ª falha antes da aula × fluxo normal × 2ª
 *      falha);
 *   5. `lessonChallengeCardStatus` — o card distingue 'untried' de 'failed'
 *      (o CTA do retry do MESMO desafio depende disso).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  challengeNavReducer,
  initialChallengeNavState,
} from '../src/lib/challengeNav';
import {
  buildErrorReport,
  chatHistory,
  createTrackLessonState,
  seedChallengeError,
} from '../src/lib/trackLessonState';
import {
  lessonChallengeBubbleAction,
  lessonChallengeCard,
  lessonChallengeCardStatus,
} from '../src/lib/lessonChallengeCard';
import type { TrackChallengeErrorReport, TrackChallengeSummaryDto } from '../shared/ipc-contract';

/** Resumo de desafio de aula (payload track.lesson) — só o que os testes leem. */
function summary(over: Partial<TrackChallengeSummaryDto>): TrackChallengeSummaryDto {
  return {
    slug: 'dobro-do-numero',
    title: 'O dobro do número',
    concept: 'funções',
    difficulty: 1,
    lastVerdict: null,
    stars: 0,
    failedCount: 0,
    generated: false,
    ...over,
  };
}

/** Relatório de erro base — sem flag (fluxo normal). */
function report(over: Partial<TrackChallengeErrorReport>): TrackChallengeErrorReport {
  return {
    trackSlug: 'nodejs-do-zero',
    lessonId: 'aula-1',
    challengeId: 'dobro-do-numero',
    challengeTitle: 'O dobro do número',
    files: [{ path: 'solution.mjs', code: 'export function dobro(n) { return n; }' }],
    output: '✖ dobro de 2 é 4',
    checks: [{ name: 'dobro de 2 é 4', passed: false }],
    passedCount: 0,
    totalCount: 1,
    ...over,
  };
}

describe('challengeFirstFailFlow — contrato attemptedBeforeLesson', () => {
  it('o reducer preserva attemptedBeforeLesson na seleção (setado só pelo card)', () => {
    const s = challengeNavReducer(initialChallengeNavState, {
      type: 'setTrack',
      selection: {
        trackSlug: 'nodejs-do-zero',
        target: 'lesson',
        lessonId: 'aula-1',
        challengeId: 'dobro-do-numero',
        title: 'O dobro do número',
        attemptedBeforeLesson: true,
      },
    });
    assert.equal(s.trackChallenge?.attemptedBeforeLesson, true);
    // clearTrack limpa a seleção INTEIRA — o flag não sobra órfão.
    const cleared = challengeNavReducer(s, { type: 'clearTrack' });
    assert.equal(cleared.trackChallenge, null);
  });

  it('a seleção do fluxo NORMAL não carrega o flag (campo ausente, não false)', () => {
    const s = challengeNavReducer(initialChallengeNavState, {
      type: 'setTrack',
      selection: {
        trackSlug: 'nodejs-do-zero',
        target: 'lesson',
        lessonId: 'aula-1',
        challengeId: 'dobro-do-numero',
      },
    });
    // Ausente === nunca setado: o gate do fluxo normal não precisa saber dele.
    assert.ok(!('attemptedBeforeLesson' in (s.trackChallenge ?? {})));
  });

  it('buildErrorReport copia o flag quando presente e omite no fluxo normal', () => {
    const comFlag = buildErrorReport({
      trackSlug: 'nodejs-do-zero',
      lessonId: 'aula-1',
      challengeId: 'dobro-do-numero',
      challengeTitle: 'O dobro do número',
      files: [{ path: 'solution.mjs', code: 'x' }],
      result: {
        ok: true,
        passed: false,
        output: '✖',
        checks: [{ name: 'a', passed: false }],
        passedCount: 0,
        totalCount: 1,
        testsRun: 1,
        expectedTests: 1,
      },
      attemptedBeforeLesson: true,
    });
    assert.equal(comFlag.attemptedBeforeLesson, true);

    const semFlag = buildErrorReport({
      trackSlug: 'nodejs-do-zero',
      lessonId: 'aula-1',
      challengeId: 'dobro-do-numero',
      challengeTitle: 'O dobro do número',
      files: [{ path: 'solution.mjs', code: 'x' }],
      result: {
        ok: true,
        passed: false,
        output: '✖',
        checks: [{ name: 'a', passed: false }],
        passedCount: 0,
        totalCount: 1,
        testsRun: 1,
        expectedTests: 1,
      },
    });
    assert.ok(!('attemptedBeforeLesson' in semFlag));
  });

  it('seedChallengeError leva o flag para a bolha review (errorBeforeLesson) e o chatHistory o stripa', () => {
    const comFlag = seedChallengeError(
      createTrackLessonState(),
      report({ attemptedBeforeLesson: true }),
      'O que você acha que errou?',
      {},
      1_000,
    );
    const review = comFlag.history.find((m) => m.kind === 'review');
    assert.ok(review, 'a bolha review foi semeada');
    assert.equal(review.errorFor, 'dobro-do-numero');
    assert.equal(review.errorBeforeLesson, true);
    // Nada do metadata (kind/errorFor/errorBeforeLesson) trafega ao main.
    for (const msg of chatHistory(comFlag)) {
      assert.deepEqual(Object.keys(msg).sort(), ['content', 'role']);
    }

    const semFlag = seedChallengeError(
      createTrackLessonState(),
      report({}),
      'O que você acha que errou?',
      {},
      2_000,
    );
    const review2 = semFlag.history.find((m) => m.kind === 'review');
    assert.ok(review2);
    // Ausente = fluxo normal (a regra da bolha trata undefined como false).
    assert.ok(!('errorBeforeLesson' in review2));
  });
});

describe('challengeFirstFailFlow — lessonChallengeBubbleAction (regra pura da bolha)', () => {
  it('1ª falha do desafio tentado antes da aula → viewLesson (nunca "Gerar novo")', () => {
    assert.equal(
      lessonChallengeBubbleAction({ attemptedBeforeLesson: true, failedCount: 1 }),
      'viewLesson',
    );
  });

  it('2ª falha (já depois da aula) → regenerate — o dono manda gerar desafio novo', () => {
    assert.equal(
      lessonChallengeBubbleAction({ attemptedBeforeLesson: true, failedCount: 2 }),
      'regenerate',
    );
    assert.equal(
      lessonChallengeBubbleAction({ attemptedBeforeLesson: true, failedCount: 5 }),
      'regenerate',
    );
  });

  it('fluxo normal (sem flag) → regenerate em QUALQUER contagem — comportamento intacto', () => {
    assert.equal(
      lessonChallengeBubbleAction({ attemptedBeforeLesson: false, failedCount: 1 }),
      'regenerate',
    );
    assert.equal(
      lessonChallengeBubbleAction({ attemptedBeforeLesson: false, failedCount: 0 }),
      'regenerate',
    );
  });

  it('guardas defensivos: failedCount 0/NaN com flag → 1ª falha (viewLesson)', () => {
    // Payload defasado (failedCount 0): com o flag presente, "Ver a aula" é a
    // escolha conservadora — gerar desafio novo ANTES da aula violaria a regra.
    assert.equal(
      lessonChallengeBubbleAction({ attemptedBeforeLesson: true, failedCount: 0 }),
      'viewLesson',
    );
    assert.equal(
      lessonChallengeBubbleAction({ attemptedBeforeLesson: true, failedCount: Number.NaN }),
      'viewLesson',
    );
  });
});

describe('challengeFirstFailFlow — card do desafio no início da aula', () => {
  it('status distingue untried × failed (timeout/abandoned também são "tentou e não passou")', () => {
    assert.equal(lessonChallengeCardStatus(summary({ lastVerdict: null })), 'untried');
    assert.equal(lessonChallengeCardStatus(summary({ lastVerdict: 'failed' })), 'failed');
    assert.equal(lessonChallengeCardStatus(summary({ lastVerdict: 'timeout' })), 'failed');
    assert.equal(lessonChallengeCardStatus(summary({ lastVerdict: 'abandoned' })), 'failed');
    // passed NÃO é pendência — o card some (regra da onda 1, intacta).
    const passedOnly = lessonChallengeCard({
      challenges: [summary({ lastVerdict: 'passed', stars: 3 })],
    });
    assert.equal(passedOnly.show, false);
  });

  it('o card destacado é o MESMO desafio que o retry reabre (primeiro pendente)', () => {
    const d = lessonChallengeCard({
      challenges: [
        summary({ slug: 'dobro-do-numero', lastVerdict: 'failed', failedCount: 1 }),
        summary({ slug: 'outro', lastVerdict: null }),
      ],
    });
    assert.equal(d.show, true);
    assert.equal(d.challenge?.slug, 'dobro-do-numero');
    assert.equal(lessonChallengeCardStatus(d.challenge!), 'failed');
  });
});
