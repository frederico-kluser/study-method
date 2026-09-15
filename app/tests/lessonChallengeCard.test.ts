/**
 * tests/lessonChallengeCard.test.ts — lógica PURA do card do desafio no
 * início da aula (onda1-card-desafio-inicial). Sem jsdom, sem React: a
 * decisão (aparece? qual desafio? qual estado?) é provada aqui.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  lessonChallengeCard,
  lessonChallengeCardStatus,
  type LessonChallengeCardInput,
} from '../src/lib/lessonChallengeCard';
import type { TrackChallengeSummaryDto } from '../shared/ipc-contract';

/** Fábrica de resumo de desafio (payload track.lesson), defaults neutros. */
function summary(overrides: Partial<TrackChallengeSummaryDto> = {}): TrackChallengeSummaryDto {
  return {
    slug: 'ch-1',
    title: 'Desafio 1',
    concept: 'o conceito que o desafio treina',
    difficulty: 2,
    lastVerdict: null,
    stars: 0,
    failedCount: 0,
    generated: false,
    ...overrides,
  };
}

function input(challenges: TrackChallengeSummaryDto[]): LessonChallengeCardInput {
  return { challenges };
}

describe('lessonChallengeCard (card do desafio no início da aula)', () => {
  it('sem desafios na aula → não aparece (pedido do dono)', () => {
    const out = lessonChallengeCard(input([]));
    assert.equal(out.show, false);
    assert.equal(out.challenge, null);
  });

  it('desafio nunca tentado → aparece, destacando-o', () => {
    const out = lessonChallengeCard(input([summary()]));
    assert.equal(out.show, true);
    assert.equal(out.challenge?.slug, 'ch-1');
  });

  it('desafio pendente (failed/timeout/abandoned) → aparece (o MESMO critério de handleChallengeStep)', () => {
    for (const verdict of ['failed', 'timeout', 'abandoned'] as const) {
      const out = lessonChallengeCard(input([summary({ lastVerdict: verdict, failedCount: 1 })]));
      assert.equal(out.show, true, `verdict=${verdict} deveria manter o card`);
      assert.equal(out.challenge?.lastVerdict, verdict);
    }
  });

  it('só desafios PASSADOS → não aparece (não há o que pular)', () => {
    const out = lessonChallengeCard(input([summary({ lastVerdict: 'passed', stars: 3 })]));
    assert.equal(out.show, false);
    assert.equal(out.challenge, null);
  });

  it('mistos: pendentes e passados → aparece com o PRIMEIRO pendente na ordem do payload', () => {
    const out = lessonChallengeCard(input([
      summary({ slug: 'feitos', title: 'Já passou', lastVerdict: 'passed', stars: 2 }),
      summary({ slug: 'alvo', title: 'Pendente 1' }),
      summary({ slug: 'depois', title: 'Pendente 2' }),
    ]));
    assert.equal(out.show, true);
    assert.equal(out.challenge?.slug, 'alvo');
    assert.equal(out.challenge?.title, 'Pendente 1');
  });

  it('vários pendentes sem passado antes → o primeiro da ordem editorial', () => {
    const out = lessonChallengeCard(input([
      summary({ slug: 'a' }),
      summary({ slug: 'b' }),
    ]));
    assert.equal(out.challenge?.slug, 'a');
  });
});

describe('lessonChallengeCardStatus (linha secundária do card)', () => {
  it('null = nunca tentou → untried', () => {
    assert.equal(lessonChallengeCardStatus(summary({ lastVerdict: null })), 'untried');
  });

  it('qualquer veredito que não seja passed → failed', () => {
    for (const verdict of ['failed', 'timeout', 'abandoned'] as const) {
      assert.equal(lessonChallengeCardStatus(summary({ lastVerdict: verdict })), 'failed', `verdict=${verdict}`);
    }
  });
});
