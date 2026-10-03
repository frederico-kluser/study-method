/**
 * tests/quizOverlayViewRender.test.ts — a VIEW extraída do overlay do quiz
 * (`QuizOverlayView`) RENDERIZADA por SSR, puramente a partir de PROPS.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POR QUE ESTE ARQUIVO EXISTE ao lado de tests/quizOverlayRender.test.ts
 * ══════════════════════════════════════════════════════════════════════════
 * O irmão monta o CONTAINER real (loja de módulo + `openQuizOverlay`) e prova
 * o ciclo inteiro; este mede a VIEW isolada — a extração state/view da onda de
 * stories. As três fases chegam como PROPS (`QuizOverlayState` +
 * `QuizOverlayContent`), que é exatamente como o Storybook as documenta: sem
 * loja, sem seed, sem DOM. Se a view voltar a depender do store, ESTE teste
 * deixa de conseguir montá-la com props e reprova.
 *
 * A par dele, a regra pura que decide "o overlay desenha?" —
 * `quizOverlayIsShowing` (components/quiz/quizOverlayContent.ts) — é medida
 * caso a caso, incluindo as duas pernas negativas (conteúdo de outra chave;
 * conteúdo ausente) que impedem o card órfão.
 *
 * Sem jsdom: `react-dom/server` + tema real + textos reais de pt-BR (a técnica
 * da casa, ver tests/quizOverlayRender.test.ts). O import do `.tsx` é
 * DINÂMICO com specifier computado — o projeto composite dos testes compila
 * sem `jsx`/DOM de propósito.
 *
 * Reprodução: `bash tools/t.sh tests/quizOverlayViewRender.test.ts`
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from '@mui/material/styles';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { theme } from '../src/theme';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import {
  quizOverlayIsShowing,
  type QuizOverlayContent,
} from '../src/components/quiz/quizOverlayContent';
import type { QuizOverlayState } from '../src/lib/quizOverlayState';
import type { TrackAssertionDto } from '../shared/ipc-contract';

const VIEW_MODULE = new URL('../src/components/quiz/QuizOverlayHost.tsx', import.meta.url).href;

/** A afirmação do quiz (dados puros — sem Electron, sem trilha em disco). */
const ASSERTION: TrackAssertionDto = {
  id: 'af-print-mostra',
  statement: 'A função print mostra na tela o texto que recebe.',
  question: 'O que a função print mostra na tela?',
  options: [
    'O texto que ela recebe',
    'O nome do arquivo',
    'O número da linha',
    'Nada — ela só escreve no disco',
  ],
  answerIndex: 0,
  feedback: 'print escreve na saída o que recebe entre parênteses.',
  sectionId: 'as-tres-partes',
};

const QUIZ_KEY = 'as-tres-partes::af-print-mostra';

/** Os props da view (declarados aqui: o import do .tsx é dinâmico). */
interface QuizOverlayViewProps {
  overlay: {
    phase: QuizOverlayState['phase'];
    quizKey: string | null;
  };
  content: QuizOverlayContent | null;
  cardRef: { current: null };
  minimize: () => void;
}

function overlayParcial(partial: Partial<QuizOverlayState>): QuizOverlayViewProps['overlay'] {
  return {
    phase: partial.phase ?? 'fechado',
    quizKey: partial.quizKey ?? null,
    ...partial,
  } as QuizOverlayViewProps['overlay'];
}

function conteudo(parcial: Partial<QuizOverlayContent> = {}): QuizOverlayContent {
  return {
    quizKey: QUIZ_KEY,
    assertion: ASSERTION,
    quiz: undefined,
    generation: 0,
    status: 'aguardando',
    notice: null,
    onSelect: () => {},
    onMinimize: () => {},
    onRetry: null,
    onReopen: null,
    ...parcial,
  };
}

let QuizOverlayView: ComponentType<QuizOverlayViewProps>;

/** O TEXTO que chega à TELA: HTML sem folhas de estilo e sem tags. */
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

function renderView(overlay: QuizOverlayViewProps['overlay'], content: QuizOverlayContent | null): string {
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme },
      createElement(QuizOverlayView, {
        overlay,
        content,
        cardRef: { current: null },
        minimize: () => {},
      }),
    ),
  );
}

const FECHADO = overlayParcial({ phase: 'fechado', quizKey: null });
const NA_TELA = overlayParcial({ phase: 'sobre-a-tela', quizKey: QUIZ_KEY });
const MINIMIZADO = overlayParcial({ phase: 'minimizado-no-chat', quizKey: QUIZ_KEY });

before(async () => {
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
  await i18next.use(initReactI18next).init({
    lng: 'pt-BR',
    interpolation: { escapeValue: false },
    resources: { 'pt-BR': { translation: ptBR } },
  });
  const mod = (await import(VIEW_MODULE)) as { QuizOverlayView: typeof QuizOverlayView };
  QuizOverlayView = mod.QuizOverlayView;
});

describe('quizOverlayIsShowing — a regra pura do "o overlay desenha?"', () => {
  it('só desenha com a fase a pedir a tela E o conteúdo do MESMO quiz', () => {
    assert.equal(quizOverlayIsShowing(NA_TELA, conteudo()), true);
  });

  it('fechado e minimizado não desenham', () => {
    assert.equal(quizOverlayIsShowing(FECHADO, conteudo()), false);
    assert.equal(quizOverlayIsShowing(MINIMIZADO, conteudo()), false);
  });

  it('conteúdo de OUTRA chave não vira card órfão (a view trocou de aula)', () => {
    const outro = conteudo({ quizKey: 'outra-aula::outra-afirmacao' });
    assert.equal(quizOverlayIsShowing(NA_TELA, outro), false);
  });

  it('conteúdo ausente (a LessonView desmontou) não desenha nada', () => {
    assert.equal(quizOverlayIsShowing(NA_TELA, null), false);
    assert.equal(quizOverlayIsShowing(FECHADO, null), false);
  });
});

describe('QuizOverlayView — as três fases, por props', () => {
  it('FECHADO: nada é desenhado', () => {
    const html = renderView(FECHADO, conteudo());
    assert.ok(!html.includes('role="dialog"'), 'sem fase aberta não existe diálogo');
    assert.equal(onScreen(html), '');
  });

  it('MINIMIZADO-NO-CHAT: o overlay sai (o card fica é na conversa)', () => {
    const html = renderView(MINIMIZADO, conteudo());
    assert.ok(!html.includes('role="dialog"'), 'minimizado não é sobre a tela');
    assert.equal(onScreen(html), '');
  });

  it('SOBRE A TELA: o diálogo modal aparece, com pergunta e as 4 alternativas', () => {
    const html = renderView(NA_TELA, conteudo());
    const tela = onScreen(html);

    assert.ok(html.includes('role="dialog"'), 'é um diálogo');
    assert.ok(html.includes('aria-modal="true"'), 'modal — o resto da tela fica atrás');
    assert.ok(html.includes('aria-label'), 'tem nome acessível (o do overlay, em pt-BR)');
    assert.ok(tela.includes(ASSERTION.question), 'a pergunta está na tela');
    for (const option of ASSERTION.options) {
      assert.ok(tela.includes(option), `a alternativa "${option}" está na tela`);
    }
    assert.ok(tela.includes(ptBR.lesson.quizOverlayTitle), 'o título do overlay está na tela');
    assert.ok(tela.includes(ptBR.lesson.quizOverlayMinimize), 'a saída "Minimizar" está na tela');
    assert.ok(tela.includes(ptBR.lesson.quizOverlayHint), 'a dica do rodapé está na tela');
  });

  it('SOBRE A TELA com chave alheia: nada — o card órfão continua proibido', () => {
    const html = renderView(NA_TELA, conteudo({ quizKey: 'outra::chave' }));
    assert.ok(!html.includes('role="dialog"'), 'conteúdo de outro quiz não desenha o diálogo');
  });

  it('o veredito da resposta aparece quando o quiz vem respondido (certo e errado)', () => {
    const errado = renderView(
      NA_TELA,
      conteudo({ quiz: { answered: true, selected: 1, correct: false } }),
    );
    assert.ok(
      onScreen(errado).includes(ptBR.lesson.quizWrong),
      'a revelação ERRADA mostra o veredito informativo (nunca repreensão)',
    );

    const certo = renderView(
      NA_TELA,
      conteudo({ quiz: { answered: true, selected: 0, correct: true } }),
    );
    assert.ok(
      onScreen(certo).includes(ptBR.lesson.quizCorrect),
      'a revelação CERTA mostra o que ficou demonstrado (sem elogio ritual)',
    );
  });

  it('com geração > 0, a etiqueta "Quiz N desta afirmação" aparece', () => {
    const html = renderView(NA_TELA, conteudo({ generation: 2 }));
    assert.ok(
      onScreen(html).includes('Quiz 3 desta afirmação'),
      'a geração exibida é N+1 (0 = o quiz autoral)',
    );
  });

  it('o aviso do canal (fail-closed) e as saídas do ciclo travado chegam à tela', () => {
    const html = renderView(
      NA_TELA,
      conteudo({
        status: 'indisponivel',
        notice: 'O ciclo parou aqui. Você pode pedir de novo.',
        onRetry: () => {},
        onReopen: () => {},
      }),
    );
    const tela = onScreen(html);
    assert.ok(tela.includes('O ciclo parou aqui'), 'o aviso está na tela');
    assert.ok(tela.includes(ptBR.lesson.quizChatRetry), 'a saída "Pedir de novo" está na tela');
    assert.ok(tela.includes(ptBR.lesson.quizChatReopen), 'e a saída que não depende da IA');
  });

  it('sem saídas (fora do ciclo travado) não há botões de retry/reabrir', () => {
    const html = renderView(NA_TELA, conteudo({ status: 'aguardando' }));
    const tela = onScreen(html);
    assert.ok(!tela.includes(ptBR.lesson.quizChatRetry), 'sem o que repetir não há "Pedir de novo"');
    assert.ok(!tela.includes(ptBR.lesson.quizChatReopen), 'reabrir não é um botão de pular o quiz');
  });
});
