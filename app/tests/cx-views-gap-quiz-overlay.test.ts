/**
 * tests/cx-views-gap-quiz-overlay.test.ts — o HOST DO QUIZ SOBRE A TELA
 * (`src/components/quiz/QuizOverlayHost.tsx`) RENDERIZADO NA BATERIA cx-views.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O GAP QUE ESTE ARQUIVO FECHA
 * ══════════════════════════════════════════════════════════════════════════
 * A bateria cx-views importa este módulo (cx-views-lesson-helpers.test.ts
 * exercita `focusReturnTarget`) e nunca o RENDERIZA. Aqui ele é montado com
 * `react-dom/server`, o TEMA REAL e os textos REAIS de pt-BR (o padrão de
 * cx-views-views-ssr.test.ts), no estado inicial (FECHADO) e nos estados
 * derivados que as ENTRADAS REAIS do host produzem — as fases do
 * `src/lib/quizOverlayState` + o conteúdo publicado pelo
 * `src/components/quiz/quizOverlayContent` (o tipo `QuizOverlayContent`).
 *
 * As entradas são as APIs REAIS dos stores (`openQuizOverlay`,
 * `publishQuizOverlayContent`) — o mesmo caminho que a LessonView usa em
 * produção; os valores são os do tipo real, com a afirmação de uma aula real
 * do acervo. (O render isolado do host também vive em
 * tests/quizOverlayRender.test.ts; este arquivo é a versão AUTOCONTIDA da
 * bateria — ela não pode depender de arquivos de outra geração de testes.)
 *
 * Bloqueio DECLARADO (fora deste arquivo): `OnboardingOverlay` e
 * `ChallengeView` não são importáveis sob `node --import tsx` (bloqueio de CSS
 * loader — `@xterm/xterm/css/xterm.css` transitivo).
 *
 * Reprodução: `cd app && npm test -- tests/cx-views-gap-quiz-overlay.test.ts`
 */
import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from '@mui/material/styles';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { theme } from '../src/theme';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import { openQuizOverlay, __resetQuizOverlayForTests } from '../src/lib/quizOverlayState';
import {
  publishQuizOverlayContent,
  __resetQuizOverlayContentForTests,
  type QuizOverlayContent,
} from '../src/components/quiz/quizOverlayContent';
import type { TrackAssertionDto } from '../shared/ipc-contract';

const HOST_MODULE = new URL('../src/components/quiz/QuizOverlayHost.tsx', import.meta.url).href;

let QuizOverlayHost: ComponentType<Record<string, never>>;

/* ─── Entradas realistas (TIPOS reais) ────────────────────────────────────── */

const AFIRMACAO: TrackAssertionDto = {
  id: 'print-mostra-na-tela',
  statement: 'print mostra na tela o que estiver entre as aspas.',
  question: 'O que aparece na tela quando se roda print("bom dia")?',
  options: ['bom dia', 'print', 'nada', 'uma linha em branco'],
  answerIndex: 0,
  feedback: 'O que está entre as aspas é o que aparece.',
  sectionId: 'uma-linha-e-so',
};

const CONTEXTO = {
  quizKey: 'uma-linha-e-so::print-mostra-na-tela',
  assertionId: AFIRMACAO.id,
  generation: 0,
  sectionId: AFIRMACAO.sectionId ?? null,
  anchorIndex: 0,
};

const CONTEUDO: QuizOverlayContent = {
  quizKey: CONTEXTO.quizKey,
  assertion: AFIRMACAO,
  quiz: undefined,
  generation: 0,
  status: 'aguardando',
  notice: null,
  onSelect: () => {},
  onMinimize: () => {},
  onRetry: null,
  onReopen: null,
};

/** O TEXTO que chega à tela: HTML sem folhas de estilo nem tags. */
function onScreen(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderHost(): string {
  return renderToStaticMarkup(
    createElement(ThemeProvider, { theme }, createElement(QuizOverlayHost, {})),
  );
}

before(async () => {
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
  await i18next.use(initReactI18next).init({
    lng: 'pt-BR',
    interpolation: { escapeValue: false },
    resources: { 'pt-BR': { translation: ptBR } },
  });
  const mod = (await import(HOST_MODULE)) as unknown as {
    QuizOverlayHost: ComponentType<Record<string, never>>;
  };
  QuizOverlayHost = mod.QuizOverlayHost;
});

beforeEach(() => {
  __resetQuizOverlayForTests();
  __resetQuizOverlayContentForTests();
});

/* ══════════════════════════════════════════════════════════════════════════
 * 1. ESTADO INICIAL — fechado (o default dos stores)
 * ══════════════════════════════════════════════════════════════════════════ */

describe('QuizOverlayHost — estado inicial (fechado): nada sobe para a tela', () => {
  it('sem nada publicado, o render é vazio e nunca quebra', () => {
    const html = renderHost();
    assert.doesNotThrow(() => renderHost());
    assert.equal(onScreen(html), '');
  });

  it('com conteúdo PUBLICADO mas fase fechada, nada aparece (a fase manda no pixel)', () => {
    publishQuizOverlayContent(CONTEUDO);
    const html = renderHost();
    assert.ok(!html.includes('role="dialog"'), 'sem fase aberta não existe diálogo');
    assert.equal(onScreen(html), '');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 2. ESTADOS DERIVADOS — as fases do store × o ciclo do quiz
 * ══════════════════════════════════════════════════════════════════════════ */

describe('QuizOverlayHost — estados derivados: a fase "sobre-a-tela" e o ciclo do quiz', () => {
  it('sobre-a-tela: o diálogo com a pergunta, as 4 alternativas e a saída "Minimizar"', () => {
    openQuizOverlay(CONTEXTO);
    publishQuizOverlayContent(CONTEUDO);
    const html = renderHost();
    const tela = onScreen(html);

    assert.ok(html.includes('role="dialog"'), 'é um diálogo');
    assert.ok(html.includes('aria-modal="true"'), 'modal — o resto da tela fica atrás');
    assert.ok(tela.includes(ptBR.lesson.quizOverlayTitle), 'o nome acessível diz o propósito');
    assert.ok(tela.includes(AFIRMACAO.question), 'a pergunta é a voz principal do corpo');
    for (const alternativa of AFIRMACAO.options) {
      assert.ok(tela.includes(alternativa), `a alternativa "${alternativa}" está na tela`);
    }
    assert.ok(tela.includes(ptBR.lesson.quizOverlayHint), 'o aluno lê o que responder provoca');
    assert.ok(tela.includes(ptBR.lesson.quizOverlayMinimize), 'a ÚNICA saída é minimizar — nunca fechar');
  });

  it('respondido: o veredito aparece DEPOIS do clique (✓/✗ + diagnóstico), com o rótulo do quiz', () => {
    openQuizOverlay(CONTEXTO);
    const errado = AFIRMACAO.answerIndex === 0 ? 1 : 0;
    publishQuizOverlayContent({
      ...CONTEUDO,
      generation: 1,
      quiz: { answered: true, selected: errado, correct: false },
    });
    const html = renderHost();
    const tela = onScreen(html);

    assert.ok(html.includes('data-testid="CancelIcon"'), 'a marcada é apontada depois');
    assert.ok(html.includes('data-testid="CheckCircleIcon"'), 'a certa é apontada depois');
    assert.ok(tela.includes(ptBR.lesson.quizWrong), 'a redação é diagnóstica, não repreensão');
    assert.ok(
      tela.includes(ptBR.lesson.quizAttemptLabel.replace('{{n}}', '2')),
      'a geração seguinte é rotulada (quiz 2 desta afirmação)',
    );
  });

  it('canal fora do ar (fail-closed): o aviso + as DUAS saídas que não dependem de adivinhar', () => {
    openQuizOverlay(CONTEXTO);
    publishQuizOverlayContent({
      ...CONTEUDO,
      status: 'indisponivel',
      notice: ptBR.lesson.quizRemedialUnavailable,
      onRetry: () => {},
      onReopen: () => {},
    });
    const tela = onScreen(renderHost());
    assert.ok(tela.includes(ptBR.lesson.quizRemedialUnavailable), 'o aluno lê o que faltou');
    assert.ok(tela.includes(ptBR.lesson.quizChatRetry), 'dá para pedir de novo');
    assert.ok(tela.includes(ptBR.lesson.quizChatReopen), 'e para responder a MESMA pergunta de novo');
  });
});
