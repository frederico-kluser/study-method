/**
 * tests/quizOverlayRender.test.ts — o overlay do quiz RENDERIZADO DE VERDADE.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POR QUE ESTE ARQUIVO EXISTE, se já há guarda de fonte
 * ══════════════════════════════════════════════════════════════════════════
 * `tests/quizOverlayWiring.test.ts` lê a fonte e trava a LIGAÇÃO; ele não pode
 * afirmar nada sobre PIXEL. Só que as três perguntas que importam aqui são
 * todas sobre o que chega à tela:
 *
 *   1. o quiz aparece MESMO SOBRE A TELA quando a fase é 'sobre-a-tela'?
 *   2. respondido/minimizado, ele SAI da tela (e o ciclo continua na conversa)?
 *   3. as quatro alternativas nascem IGUAIS — a resposta não vaza antes do
 *      clique, agora que quem desenha é o overlay e não mais só o card inline?
 *
 * Este repositório não usa jsdom, e a técnica que ele já adotou para responder
 * a esse tipo de pergunta é `react-dom/server` — SSR puro, sem DOM, sem
 * dependência nova (precedente: `tests/typewriterSegments.test.ts`, bloco "a
 * TELA renderizada"). É o que este arquivo faz: monta o HOST REAL, com o TEMA
 * REAL e os textos REAIS de pt-BR, nas três fases do store, e mede o HTML.
 *
 * IMPORT DINÂMICO COM SPECIFIER COMPUTADO (a mesma razão do precedente): o
 * projeto composite dos testes compila com `lib: ES2022`, SEM DOM e sem `jsx`,
 * de propósito — é a prova mecânica de que os módulos PUROS desta onda
 * (`quizOverlayContent`, `quizOverlayBridge`) não dependem de DOM. Um import
 * estático de `.tsx` obrigaria a ligar `jsx` e a lib DOM no projeto inteiro e
 * APAGARIA essa garantia. O import dinâmico carrega o componente REAL em
 * runtime (o `tsx` compila o `.tsx`) sem colocá-lo no grafo do `tsc`.
 *
 * Reprodução: `cd app && npm test -- tests/quizOverlayRender.test.ts`
 */
import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from '@mui/material/styles';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { theme } from '../src/theme';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import {
  __resetQuizOverlayForTests,
  minimizeQuizOverlay,
  openQuizOverlay,
} from '../src/lib/quizOverlayState';
import {
  __resetQuizOverlayContentForTests,
  publishQuizOverlayContent,
  type QuizOverlayContent,
} from '../src/components/quiz/quizOverlayContent';
import type { TrackAssertionDto } from '../shared/ipc-contract';

const HERE = dirname(fileURLToPath(import.meta.url));

const HOST_MODULE = new URL('../src/components/quiz/QuizOverlayHost.tsx', import.meta.url).href;
const CHAT_CARD_MODULE = new URL('../src/components/quiz/QuizChatCard.tsx', import.meta.url).href;

const LESSON_PATH = resolve(
  HERE,
  '../resources/tracks/python/modules/a-tela/lessons/a-primeira-linha/lesson.json',
);
const LESSON = JSON.parse(readFileSync(LESSON_PATH, 'utf8')) as { assertions: TrackAssertionDto[] };
/** A afirmação REAL da aula 1 — as opções de verdade, na ordem de verdade. */
const ASSERTION = LESSON.assertions[0];
const QUIZ_KEY = 'as-tres-partes-da-linha::print-mostra-na-tela';

const CTX = {
  quizKey: QUIZ_KEY,
  assertionId: ASSERTION.id,
  generation: 0,
  sectionId: ASSERTION.sectionId ?? null,
  anchorIndex: 0,
};

const CONTENT: QuizOverlayContent = {
  quizKey: QUIZ_KEY,
  assertion: ASSERTION,
  quiz: undefined,
  generation: 0,
  status: 'aguardando',
  notice: null,
  onSelect: () => {},
  onMinimize: () => {},
  onRetry: null,
};

/** Os props do card compacto (declarados aqui porque o import é dinâmico). */
interface ChatCardProps {
  status: string;
  onScreen: boolean;
  question: string;
  generation: number;
  notice: string | null;
  onOpen: () => void;
  onRetry: (() => void) | null;
}

let QuizOverlayHost: ComponentType<Record<string, never>>;
let QuizChatCard: ComponentType<ChatCardProps>;

/** O TEXTO que chega à TELA: o HTML sem as folhas de estilo e sem as tags. */
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

/**
 * A MARCAÇÃO, sem as folhas de estilo do emotion.
 *
 * Isto não é detalhe: o `<style>` que o MUI emite declara as REGRAS de
 * `.Mui-disabled`, `.MuiButton-containedSuccess` e companhia mesmo quando
 * NENHUM elemento as usa. Medir "a alternativa nasce verde" no HTML bruto
 * daria falso positivo garantido — o que vale é a classe APLICADA.
 */
function markup(html: string): string {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
}

function renderHost(): string {
  return renderToStaticMarkup(
    createElement(ThemeProvider, { theme }, createElement(QuizOverlayHost, {})),
  );
}

before(async () => {
  // O banner de patrocínio do i18next iria para o stdout do runner.
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
  // Os textos REAIS de pt-BR: o que este teste mede é o que o aluno lê.
  await i18next.use(initReactI18next).init({
    lng: 'pt-BR',
    resources: { 'pt-BR': { translation: ptBR } },
  });
  const host = (await import(HOST_MODULE)) as { QuizOverlayHost: typeof QuizOverlayHost };
  QuizOverlayHost = host.QuizOverlayHost;
  const card = (await import(CHAT_CARD_MODULE)) as { QuizChatCard: typeof QuizChatCard };
  QuizChatCard = card.QuizChatCard;
});

beforeEach(() => {
  __resetQuizOverlayForTests();
  __resetQuizOverlayContentForTests();
});

describe('o quiz aparece SOBRE A TELA (a fase manda no pixel)', () => {
  it('FECHADO: nada é desenhado', () => {
    publishQuizOverlayContent(CONTENT);
    const html = renderHost();
    assert.ok(!html.includes('role="dialog"'), 'sem fase aberta não existe diálogo');
    assert.equal(onScreen(html), '');
  });

  it('SOBRE A TELA: o diálogo modal aparece, com a pergunta e as 4 alternativas', () => {
    openQuizOverlay(CTX);
    publishQuizOverlayContent(CONTENT);
    const html = renderHost();
    const tela = onScreen(html);

    assert.ok(html.includes('role="dialog"'), 'é um diálogo');
    assert.ok(html.includes('aria-modal="true"'), 'modal — o resto da tela fica atrás');
    assert.ok(tela.includes(ASSERTION.question), 'a pergunta está na tela');
    for (const option of ASSERTION.options) {
      assert.ok(tela.includes(option), `a alternativa "${option}" está na tela`);
    }
    assert.ok(tela.includes(ptBR.lesson.quizOverlayTitle), 'o título do overlay está na tela');
    assert.ok(tela.includes(ptBR.lesson.quizOverlayHint), 'o aluno lê o que responder provoca');
  });

  it('o card FLUTUA de verdade: fixed, acima de tudo, com o backdrop borrado', () => {
    openQuizOverlay(CTX);
    publishQuizOverlayContent(CONTENT);
    const html = renderHost();
    assert.match(html, /position:\s*fixed/, 'o overlay é fixo na viewport');
    assert.match(html, /z-index:\s*1300/, 'a mesma camada do modal irmão');
    assert.match(html, /backdrop-filter:\s*blur\(6px\)/, 'o fundo fica borrado');
  });

  it('MINIMIZADO: o card SAI da tela (ele passa a viver na conversa)', () => {
    openQuizOverlay(CTX);
    publishQuizOverlayContent(CONTENT);
    assert.ok(renderHost().includes('role="dialog"'), 'estava na tela');
    minimizeQuizOverlay(QUIZ_KEY);
    const html = renderHost();
    assert.ok(!html.includes('role="dialog"'), 'depois de responder, o overlay sai');
    assert.equal(onScreen(html), '');
  });

  it('conteúdo de OUTRA chave não vira card órfão sobre a tela', () => {
    openQuizOverlay(CTX);
    publishQuizOverlayContent({ ...CONTENT, quizKey: 'outra-secao::outra-afirmacao' });
    assert.ok(!renderHost().includes('role="dialog"'), 'a identidade tem de bater');
  });

  it('sem conteúdo publicado (a LessonView desmontou) nada é desenhado', () => {
    openQuizOverlay(CTX);
    publishQuizOverlayContent(null);
    assert.equal(onScreen(renderHost()), '');
  });
});

describe('A RESPOSTA NÃO VAZA — medido no HTML, não na intenção', () => {
  it('antes do clique, as 4 alternativas nascem VISUALMENTE iguais', () => {
    openQuizOverlay(CTX);
    publishQuizOverlayContent(CONTENT);
    const html = markup(renderHost());

    // O MUI marca a alternativa "certa" de um card RESPONDIDO com a variante
    // `contained` e a cor `success`. Nenhuma das duas pode estar aplicada aqui.
    assert.ok(!html.includes('MuiButton-contained'), 'nenhuma alternativa nasce preenchida');
    assert.ok(!html.includes('Success'), 'nenhuma alternativa nasce verde');
    assert.ok(!html.includes('Error'), 'nenhuma alternativa nasce vermelha');
    // Nem ícone de veredito (CheckCircle/Cancel são o ✓ e o ✗ do card).
    assert.ok(!html.includes('data-testid="CheckCircleIcon"'), 'nenhum ✓ antes de responder');
    assert.ok(!html.includes('data-testid="CancelIcon"'), 'nenhum ✗ antes de responder');
    // E nenhuma delas nasce desabilitada: todas são clicáveis.
    assert.ok(!html.includes('Mui-disabled'), 'as quatro alternativas são clicáveis');
    // As quatro compartilham EXATAMENTE a mesma lista de classes de botão.
    const classes = [...html.matchAll(/class="([^"]*MuiButton-root[^"]*)"/g)].map((m) => m[1]);
    assert.equal(classes.length, ASSERTION.options.length, 'as quatro alternativas estão lá');
    assert.equal(new Set(classes).size, 1, 'nada distingue uma alternativa das outras');
  });

  it('o veredito só aparece DEPOIS da resposta (e aí sim é específico)', () => {
    openQuizOverlay(CTX);
    const errado = ASSERTION.answerIndex === 0 ? 1 : 0;
    publishQuizOverlayContent({
      ...CONTENT,
      quiz: { answered: true, selected: errado, correct: false },
    });
    const html = markup(renderHost());
    const tela = onScreen(html);
    assert.ok(html.includes('data-testid="CheckCircleIcon"'), 'a certa é apontada depois');
    assert.ok(html.includes('data-testid="CancelIcon"'), 'a marcada é apontada depois');
    assert.ok(html.includes('role="status"'), 'o veredito é anunciado (SC 4.1.3)');
    assert.ok(tela.includes(ptBR.lesson.quizWrong), 'a redação é a diagnóstica, não repreensão');
    assert.ok(!/parab|congrat/i.test(tela), 'nada de elogio ritualizado (§8.2)');
  });
});

describe('o aviso de canal (fail-closed) chega à tela, e com saída', () => {
  it('o overlay mostra o aviso e o botão de repetir', () => {
    openQuizOverlay(CTX);
    let clicado = 0;
    publishQuizOverlayContent({
      ...CONTENT,
      status: 'indisponivel',
      notice: ptBR.lesson.quizRemedialUnavailable,
      onRetry: () => {
        clicado += 1;
      },
    });
    const tela = onScreen(renderHost());
    assert.ok(tela.includes(ptBR.lesson.quizRemedialUnavailable), 'o aluno lê o que faltou');
    assert.ok(tela.includes(ptBR.lesson.quizChatRetry), 'e tem como pedir de novo');
    assert.equal(clicado, 0, 'nada é disparado só por renderizar');
  });
});

describe('o card MINIMIZADO, na conversa', () => {
  const renderCard = (props: Partial<ChatCardProps>): string =>
    renderToStaticMarkup(
      createElement(
        ThemeProvider,
        { theme },
        createElement(QuizChatCard, {
          status: 'aguardando',
          onScreen: false,
          question: ASSERTION.question,
          generation: 0,
          notice: null,
          onOpen: () => {},
          onRetry: null,
          ...props,
        }),
      ),
    );

  it('esperando resposta: a pergunta e o botão de responder', () => {
    const tela = onScreen(renderCard({}));
    assert.ok(tela.includes(ASSERTION.question));
    assert.ok(tela.includes(ptBR.lesson.quizChatWaiting));
    assert.ok(tela.includes(ptBR.lesson.quizChatAnswer));
  });

  it('sobre a tela: o lugar fica reservado e o botão some (o card já está aberto)', () => {
    const tela = onScreen(renderCard({ onScreen: true }));
    assert.ok(tela.includes(ptBR.lesson.quizChatOnScreen));
    assert.ok(!tela.includes(ptBR.lesson.quizChatAnswer), 'nada de dois caminhos para o mesmo card');
  });

  it('ciclo em andamento: diz o que está acontecendo e NÃO oferece botão morto', () => {
    const explicando = onScreen(renderCard({ status: 'explicando' }));
    assert.ok(explicando.includes(ptBR.lesson.quizChatExplaining));
    assert.ok(!explicando.includes(ptBR.lesson.quizChatAnswer));

    const gerando = onScreen(renderCard({ status: 'gerando' }));
    assert.ok(gerando.includes(ptBR.lesson.quizChatGenerating));
    assert.ok(!gerando.includes(ptBR.lesson.quizChatAnswer));
  });

  it('canal fora do ar: aviso informativo + "pedir de novo" (§8 item 3, diagnóstico)', () => {
    const html = renderCard({
      status: 'indisponivel',
      notice: ptBR.lesson.quizExplainUnavailable,
      onRetry: () => {},
    });
    const tela = onScreen(html);
    assert.ok(tela.includes(ptBR.lesson.quizChatUnavailable));
    assert.ok(tela.includes(ptBR.lesson.quizExplainUnavailable));
    assert.ok(tela.includes(ptBR.lesson.quizChatRetry));
    assert.ok(html.includes('role="status"'), 'o andamento também é anunciado');
  });

  it('o card é um objeto do CHAT: a mesma casca de balão do tutor (borda 2px)', () => {
    const html = renderCard({});
    assert.match(html, /border:\s*2px solid/, 'a borda 2px vem de bubbleShellStyle');
  });
});
