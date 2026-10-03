/**
 * tests/lessonViewBlocks.test.ts — os BLOCOS de VIEW PUROS da aula
 * (`src/views/LessonView/blocks/**`), renderizados DE VERDADE.
 *
 * Extração state/view da LessonView (contrato STORY-SPEC §5): os blocos são só
 * props, então são testáveis aqui — node:test + react-dom/server + tema e i18n
 * REAIS, sem jsdom (o padrão da casa é tests/lessonSidebarHeader.test.ts).
 * O que se mede: o COPY que o produto mostra (pt-BR real), os atributos de
 * acessibilidade (aria-label/disabled/role) e a composição (o card só nasce
 * quando a decisão pura o manda).
 *
 * Os handlers NÃO são exercitáveis em SSR (sem eventos) — a fiação deles é
 * guardada pelas guardas de fonte (tests/lessonChallengeCardWiring.test.ts,
 * tests/lessonChatLayout.test.ts, tests/challengeRetry.test.ts).
 *
 * Reprodução: `bash tools/t.sh tests/lessonViewBlocks.test.ts`
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, type ComponentType, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from '@mui/material/styles';
import i18next from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';

import { theme } from '../src/theme';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import type { TrackChallengeSummaryDto } from '../shared/ipc-contract';

/* ─── Import DINÂMICO dos .tsx (o tsconfig de tests/ não liga jsx) ───────── */

const EMPTY_MODULE = new URL('../src/views/LessonView/blocks/LessonEmptyState.tsx', import.meta.url).href;
const ERROR_MODULE = new URL('../src/views/LessonView/blocks/LessonLoadErrorState.tsx', import.meta.url).href;
const LOADING_MODULE = new URL('../src/views/LessonView/blocks/LessonLoadingState.tsx', import.meta.url).href;
const TYPING_MODULE = new URL('../src/views/LessonView/blocks/LessonTypingRow.tsx', import.meta.url).href;
const START_MODULE = new URL('../src/views/LessonView/blocks/LessonChatStart.tsx', import.meta.url).href;
const CARD_MODULE = new URL('../src/views/LessonView/blocks/LessonChallengeIntroCard.tsx', import.meta.url).href;
const PRESSABLE_MODULE = new URL('../src/views/LessonView/blocks/PressableShell.tsx', import.meta.url).href;

/** Contratos de props declarados LOCALMENTE (o tsconfig de tests/ não liga jsx). */
interface EmptyProps {
  onGoToRoadmap: () => void;
}
interface ErrorProps {
  message: string;
  onRetry: () => void;
}
interface TypingProps {
  show: boolean;
  showSkipButton: boolean;
  onSkip: () => void;
}
interface StartProps {
  busy: boolean;
  onStart: () => void;
  challenge: TrackChallengeSummaryDto | null;
  onTryChallenge: () => void;
}
interface CardProps {
  challenge: TrackChallengeSummaryDto;
  onTryChallenge: () => void;
}
interface PressableProps {
  children?: ReactNode;
}

let LessonEmptyState: ComponentType<EmptyProps>;
let LessonLoadErrorState: ComponentType<ErrorProps>;
let LessonLoadingState: ComponentType<object>;
let LessonTypingRow: ComponentType<TypingProps>;
let LessonChatStart: ComponentType<StartProps>;
let LessonChallengeIntroCard: ComponentType<CardProps>;
let PressableShell: ComponentType<PressableProps>;
let testI18n: ReturnType<typeof i18next.createInstance>;

before(async () => {
  LessonEmptyState = (await import(EMPTY_MODULE)).LessonEmptyState;
  LessonLoadErrorState = (await import(ERROR_MODULE)).LessonLoadErrorState;
  LessonLoadingState = (await import(LOADING_MODULE)).LessonLoadingState;
  LessonTypingRow = (await import(TYPING_MODULE)).LessonTypingRow;
  LessonChatStart = (await import(START_MODULE)).LessonChatStart;
  LessonChallengeIntroCard = (await import(CARD_MODULE)).LessonChallengeIntroCard;
  PressableShell = (await import(PRESSABLE_MODULE)).PressableShell;
  // Instância ISOLADA por teste — renders que dependem do singleton default
  // ficam reféns da ordem dos ficheiros da suíte (padrão da casa).
  testI18n = i18next.createInstance();
  void testI18n.use(initReactI18next).init({
    lng: 'pt-BR',
    fallbackLng: 'pt-BR',
    resources: { 'pt-BR': { translation: ptBR } },
    interpolation: { escapeValue: false },
  });
});

/** SSR com tema REAL + i18n REAL. */
function render(el: ReactElement): string {
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme },
      createElement(I18nextProvider, { i18n: testI18n }, el),
    ),
  );
}

/** HTML sem as folhas <style> do emotion — só a marcação. */
function markup(html: string): string {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
}

const lesson = (ptBR as unknown as { lesson: Record<string, string> }).lesson;
const common = (ptBR as unknown as { common: Record<string, string> }).common;

const DESAFIO: TrackChallengeSummaryDto = {
  slug: 'mostre-seu-nome',
  title: 'Mostre o seu nome',
  concept: 'imprimir',
  difficulty: 1,
  lastVerdict: null,
  stars: 0,
  failedCount: 0,
  generated: false,
};

describe('LessonEmptyState — o estado vazio da aula', () => {
  it('mostra título, descrição e o CTA para a trilha (copy real pt-BR)', () => {
    const html = markup(render(createElement(LessonEmptyState, { onGoToRoadmap: () => {} })));
    assert.ok(html.includes(lesson.emptyTitle), 'título do vazio');
    assert.ok(html.includes(lesson.emptyDescription), 'orientação de onde procurar');
    assert.ok(html.includes(lesson.emptyCta), 'o CTA leva para a trilha');
    assert.ok(html.includes('<button'), 'o CTA é um botão de verdade');
  });
});

describe('LessonLoadErrorState — erro de carregamento com retry', () => {
  it('mostra a mensagem e UM "Tentar de novo"', () => {
    const html = markup(
      render(
        createElement(LessonLoadErrorState, {
          message: 'Não foi possível carregar a aula.',
          onRetry: () => {},
        }),
      ),
    );
    assert.ok(html.includes('Não foi possível carregar a aula.'), 'a mensagem do erro está na tela');
    assert.ok(html.includes('role="alert"'), 'é um Alert de erro');
    assert.ok(html.includes(common.tryAgain), 'o retry usa a chave comum');
    assert.equal(html.split(common.tryAgain).length - 1, 1, 'UM único "Tentar de novo"');
  });
});

describe('LessonLoadingState — a espera com texto', () => {
  it('diz o que está a acontecer e a barra tem nome acessível', () => {
    const html = markup(render(createElement(LessonLoadingState)));
    assert.ok(html.includes(lesson.loading), 'a espera tem texto visível');
    assert.ok(html.includes(`aria-label="${common.loading}"`), 'a barra anuncia a espera');
  });
});

describe('LessonTypingRow — "digitando" + "Mostrar tudo"', () => {
  it('sem show não renderiza nada (mount condicional)', () => {
    const html = markup(
      render(createElement(LessonTypingRow, { show: false, showSkipButton: true, onSkip: () => {} })),
    );
    assert.ok(!html.includes(lesson.skipTypingButton), 'sem digitação não há botão');
    assert.ok(!html.includes(lesson.typingIndicator), 'nem indicador');
  });

  it('mostra o indicador e o botão acessível de saída', () => {
    const html = markup(
      render(createElement(LessonTypingRow, { show: true, showSkipButton: true, onSkip: () => {} })),
    );
    assert.ok(html.includes(lesson.skipTypingButton), 'a saída explícita existe');
    assert.ok(html.includes(lesson.typingIndicator), 'o indicador é anunciável');
  });

  it('no passo revelar o botão some (o composer já revela — W3)', () => {
    const html = markup(
      render(createElement(LessonTypingRow, { show: true, showSkipButton: false, onSkip: () => {} })),
    );
    assert.ok(!html.includes(lesson.skipTypingButton), 'sem duplicata do "Mostrar tudo"');
    assert.ok(html.includes(lesson.typingIndicator), 'o indicador continua');
  });
});

describe('LessonChallengeIntroCard — o card do desafio de abertura', () => {
  it('mostra título, conceito, dificuldade e estado "nunca tentado"', () => {
    const html = markup(render(createElement(LessonChallengeIntroCard, { challenge: DESAFIO, onTryChallenge: () => {} })));
    assert.ok(html.includes(DESAFIO.title), 'título do desafio');
    assert.ok(html.includes(DESAFIO.concept), 'conceito do desafio');
    assert.ok(html.includes(lesson.challengeIntroCardTitle), 'rótulo do card');
    assert.ok(html.includes(lesson.challengeUntried), 'estado nunca tentado');
  });

  it("no estado 'failed' o CTA vira o retry do MESMO desafio (com aria própria)", () => {
    const html = markup(
      render(
        createElement(LessonChallengeIntroCard, {
          challenge: { ...DESAFIO, lastVerdict: 'failed', failedCount: 1 },
          onTryChallenge: () => {},
        }),
      ),
    );
    assert.ok(html.includes(lesson.challengeIntroCardTryAgain), 'o CTA diz o retry');
    assert.ok(
      html.includes(lesson.challengeFailedCount.split('{{n}}')[0]),
      'o chip conta as falhas ({{n}} interpolado)',
    );
    assert.ok(
      html.includes(lesson.challengeIntroCardTryAgainAria.split('{{title}}')[0]),
      'o nome acessível do retry nomeia o desafio',
    );
  });

  it('veredito sem falha contada não fica mudo (ramo "não passou")', () => {
    const html = markup(
      render(
        createElement(LessonChallengeIntroCard, {
          challenge: { ...DESAFIO, lastVerdict: 'abandoned' },
          onTryChallenge: () => {},
        }),
      ),
    );
    assert.ok(html.includes(lesson.challengeNotPassed), 'a linha de chips diz o estado');
  });
});

describe('LessonChatStart — o convite de abertura', () => {
  it('bolha inicial + "Começar aula" + card (quando a decisão o manda)', () => {
    const html = markup(
      render(
        createElement(LessonChatStart, {
          busy: false,
          onStart: () => {},
          challenge: DESAFIO,
          onTryChallenge: () => {},
        }),
      ),
    );
    assert.ok(html.includes(lesson.chatStart), 'o convite diz que a aula é um chat');
    assert.ok(html.includes(lesson.startButton), 'o "Começar aula" dispara a primeira seção');
    assert.ok(html.includes(lesson.challengeIntroCardTitle), 'o card nasce abaixo do convite');
    assert.equal(html.includes('disabled=""'), false, 'com aula livre o botão está vivo');
  });

  it('sem desafio (decisão fail-closed) não há card; turno em voo trava o botão', () => {
    const html = markup(
      render(
        createElement(LessonChatStart, {
          busy: true,
          onStart: () => {},
          challenge: null,
          onTryChallenge: () => {},
        }),
      ),
    );
    assert.ok(!html.includes(lesson.challengeIntroCardTitle), 'sem desafio não há card');
    assert.ok(html.includes('disabled=""'), 'turno em voo trava o "Começar aula"');
  });
});

describe('PressableShell — a casca de press-feedback', () => {
  it('a casca animada NUNCA é parada de tab (tabIndex=-1 no span)', () => {
    const html = markup(render(createElement(PressableShell, {})));
    assert.ok(html.includes('<span'), 'a casca é um span');
    assert.ok(html.includes('tabindex="-1"'), 'o framer não pode marcar tabIndex=0 na casca');
    assert.ok(html.includes('display:inline-block'), 'o scale precisa de um box de verdade');
  });
});
