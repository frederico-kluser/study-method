/**
 * tests/quizVerdictCycle.test.ts — ONDA16-VEREDITO / ONDA16-CICLO-CARGA /
 * ONDA16-PIN, COBERTURA DEDICADA: a JANELA DO VEREDITO e o CICLO SOB CARGA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O CONTRATO (os pedidos do dono, que este arquivo torna falsificáveis)
 * ══════════════════════════════════════════════════════════════════════════
 * (T1) Ao responder o quiz, o aluno VÊ o veredito (verde/vermelho + texto +
 *      efeito de entrada) por ~1,6s ANTES de o card minimizar; com
 *      prefers-reduced-motion o veredito aparece SEM animação; sem vazamento
 *      de timer pós-unmount; resposta dupla impossível; minimize acontece
 *      mesmo trocando de aba.
 * (T2a) Quiz respondido durante um turno do tutor em voo (busy) NÃO dispara
 *      quizExplain/quizRemedial (a fila FIFO do LLM local estourava o timeout
 *      de 70s → ciclo morria em 'quiz-indisponivel'); após o turno, o ciclo
 *      retoma; o card diz a verdade durante a espera (status 'aguardando-vez').
 * (T4) O badge de "Desafios" vale 0 até a teoria estar concluída e os quizzes
 *      acertados; o GATING de abertura intocado.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * COMO SE PROVA SEM jsdom (as técnicas da casa)
 * ══════════════════════════════════════════════════════════════════════════
 *   - FUNÇÕES PURAS EXPORTADAS — `QUIZ_VERDICT_MS` e `challengeBadgeCount`
 *     são importados da view REAL por URL do .tsx (o padrão de
 *     tests/lessonActionRow.test.ts);
 *   - PIXEL POR SSR — o HOST REAL do overlay (`QuizOverlayHost`, o que o
 *     shell monta) desenha o LessonQuizCard real com o conteúdo publicado;
 *     publicar um quiz RESPONDIDO e medir o HTML prova que o veredito —
 *     acerto E erro — é o que o aluno lê durante a janela (a técnica de
 *     tests/quizOverlayRender.test.ts);
 *   - MÁQUINAS PURAS — `submitQuizAnswer` (idempotência = resposta dupla
 *     impossível), `visibleQuizFor`, `overlayStatusFor`, `quizCycleTag` e a
 *     máquina do overlay: a sequência EXATA que a view executa, provada da
 *     resposta sob carga até a geração N+1;
 *   - GUARDA DE FONTE — o que só um mount/clique provaria (o timer do
 *     minimize, o cleanup de unmount, os guards de efeito, a ordenação do
 *     statusText) é cobrado como TEXTO sem comentários ancorado no recorte
 *     da função: a técnica de tests/quizOverlayWiring.test.ts.
 *
 * Reprodução: `bash tools/t.sh tests/quizVerdictCycle.test.ts`
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
import en from '../src/i18n/locales/en/translation.json';
import type { TrackAssertionDto, TrackVerdict, TutorReply } from '../shared/ipc-contract';
import {
  applyTutorReply,
  createTrackLessonState,
  injectRemediationQuiz,
  isQuizMastered,
  optionVisualState,
  registerQuizExplanation,
  submitQuizAnswer,
  visibleQuizFor,
  type QuizState,
} from '../src/lib/trackLessonState';
import {
  __resetQuizOverlayForTests,
  minimizeQuizOverlay,
  openQuizOverlay,
  peekQuizOverlay,
  type QuizOverlayContext,
} from '../src/lib/quizOverlayState';
import {
  __resetQuizOverlayContentForTests,
  peekQuizOverlayContent,
  publishQuizOverlayContent,
  type QuizOverlayContent,
} from '../src/components/quiz/quizOverlayContent';
import { overlayStatusFor, quizCycleTag } from '../src/components/quiz/quizOverlayBridge';

const HERE = dirname(fileURLToPath(import.meta.url));

/* ─── Fonte da view: guardas ancoradas no CÓDIGO (sem comentários) ──────── */
const VIEW_PATH = resolve(HERE, '../src/views/LessonView/LessonView.tsx');
const VIEW_SRC = readFileSync(VIEW_PATH, 'utf8');
const VIEW_MODULE = new URL('../src/views/LessonView/LessonView.tsx', import.meta.url).href;

/** Fonte sem comentários — só o código que realmente roda. */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const VIEW = codeOf(VIEW_SRC);

/* A aula REAL do repositório — o cenário dos precedentes (quizOverlayCycle). */
const LESSON_PATH = resolve(
  HERE,
  '../resources/tracks/python-iniciante/modules/a-tela/lessons/a-primeira-linha/lesson.json',
);
const LESSON = JSON.parse(readFileSync(LESSON_PATH, 'utf8')) as {
  theory: { id: string; title: string; markdown: string }[];
  assertions: TrackAssertionDto[];
};

/** O recorte do CORPO de uma `const NOME = …` de topo: até a próxima
 *  declaração de topo do componente (a técnica de quizOverlayWiring, sem
 *  depender de lista de chaves literal, que envelhece a cada refator). */
function bodyOf(decl: string): string {
  const inicio = VIEW.indexOf(decl);
  assert.ok(inicio > 0, `a declaração "${decl}" precisa existir na view`);
  const rel = VIEW.slice(inicio + 1).search(/\n {2}(?:const |useEffect|useMemo|return )/);
  return rel === -1 ? VIEW.slice(inicio) : VIEW.slice(inicio, inicio + 1 + rel);
}

/* ══════════════════════════════════════════════════════════════════════════
 * Contratos da view, importados DE VERDADE (padrão lessonActionRow.test.ts)
 * ══════════════════════════════════════════════════════════════════════════ */
let QUIZ_VERDICT_MS: number;
let challengeBadgeCount: (input: {
  theoryDone: boolean;
  pendingQuizCount: number;
  challenges: ReadonlyArray<{ lastVerdict: TrackVerdict | null }>;
}) => number;

/* O HOST REAL: é ele que o shell monta; o que ele desenha é o que se mede. */
let QuizOverlayHost: ComponentType<Record<string, never>>;

/** O TEXTO que chega à TELA (técnica de tests/quizOverlayRender.test.ts). */
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
    // A MESMA opção de interpolação da produção (src/i18n/index.ts).
    interpolation: { escapeValue: false },
    resources: { 'pt-BR': { translation: ptBR }, en: { translation: en } },
  });
  const view = (await import(VIEW_MODULE)) as {
    QUIZ_VERDICT_MS: number;
    challengeBadgeCount: typeof challengeBadgeCount;
  };
  QUIZ_VERDICT_MS = view.QUIZ_VERDICT_MS;
  challengeBadgeCount = view.challengeBadgeCount;
  const host = (await import(
    new URL('../src/components/quiz/QuizOverlayHost.tsx', import.meta.url).href
  )) as { QuizOverlayHost: ComponentType<Record<string, never>> };
  QuizOverlayHost = host.QuizOverlayHost;
});

beforeEach(() => {
  __resetQuizOverlayForTests();
  __resetQuizOverlayContentForTests();
});

/* ══════════════════════════════════════════════════════════════════════════
 * BLOCO 1 — O CONTRATO DA JANELA (a constante, o estado, UM timer só)
 * ══════════════════════════════════════════════════════════════════════════ */
describe('a janela do veredito: contrato, estado e UM timer só', () => {
  it('QUIZ_VERDICT_MS é exportado e é o contrato de 1600ms (~1,6s, o pedido do dono)', () => {
    assert.equal(typeof QUIZ_VERDICT_MS, 'number');
    // A régua mais frouxa (1400–1800, "perceptível") já mora em
    // tests/quizOverlayWiring.test.ts; aqui o VALOR é o contrato: 1,6s.
    assert.equal(QUIZ_VERDICT_MS, 1600);
  });

  it('a janela é ESTADO (os efeitos de fase e publicação precisam re-executar no fim dela)', () => {
    assert.match(
      VIEW,
      /useState<\{ key: string; card: QuizCardEntry \} \| null>\(null\)/,
      'verdictHold é useState — um ref não dispararia a retomada do desenho quando a janela termina',
    );
    // O espelho em ref é lido pelo cleanup de unmount e pelo handleQuizReopen
    // (ambos com deps []) — a cópia da casa (tIRef/chatRef/activeRef).
    assert.match(VIEW, /const verdictHoldRef = useRef\(verdictHold\);/);
    assert.match(VIEW, /verdictHoldRef\.current = verdictHold;/);
  });

  it('UM timer só: responder outro quiz durante a janela CANCELA a anterior (o gesto recente vence)', () => {
    const corpo = bodyOf('const handleQuizAnswer = useCallback');
    const clearTimeoutAt = corpo.indexOf('clearTimeout(verdictTimerRef.current)');
    const setTimeoutAt = corpo.indexOf('setTimeout(');
    assert.ok(clearTimeoutAt > 0, 'o cancelamento do timer anterior existe');
    assert.ok(setTimeoutAt > clearTimeoutAt,
      'o clearTimeout PRECISA vir antes do setTimeout — sem isso dois timers no ar minimizariam duas vezes');
  });

  it('o timer dispara a CADEIA CERTA, usando a CONSTANTE (nenhum número solto)', () => {
    const corpo = bodyOf('const handleQuizAnswer = useCallback');
    const inicio = corpo.indexOf('verdictTimerRef.current = setTimeout(');
    const fim = corpo.indexOf('}, QUIZ_VERDICT_MS)', inicio);
    assert.ok(inicio > 0 && fim > inicio, 'o timer do minimize existe e termina na constante');
    const timer = corpo.slice(inicio, fim);
    const ordem = [
      timer.indexOf('verdictTimerRef.current = null;'),
      timer.indexOf('setVerdictHold(null);'),
      timer.indexOf('minimizeQuizOverlay(visible.key);'),
    ];
    for (const [i, at] of ordem.entries()) {
      assert.ok(at > 0, `a cadeia do timer está incompleta no passo ${i}`);
    }
    assert.ok(ordem[0] < ordem[1] && ordem[1] < ordem[2],
      'limpa o ref → solta a janela → minimiza, nesta ordem');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * BLOCO 2 — FQ1: O VEREDITO FICA VISÍVEL (acerto E erro) — pixel via host real
 *
 * DURANTE a janela a view publica o card RESPONDIDO; o host desenha o
 * LessonQuizCard real com esse conteúdo. Medir o HTML publicado é medir o que
 * o aluno lê na janela.
 * ══════════════════════════════════════════════════════════════════════════ */
describe('FQ1 — o veredito aparece antes de o card sumir (acerto E erro)', () => {
  const A = LESSON.assertions[0];
  const KEY = A.sectionId ? `${A.sectionId}::${A.id}` : A.id;
  const ERRADO = A.answerIndex === 0 ? 1 : 0;

  function ctx(): QuizOverlayContext {
    return {
      quizKey: KEY,
      assertionId: A.id,
      generation: 0,
      sectionId: A.sectionId ?? null,
      anchorIndex: 0,
    };
  }

  function contentWith(quiz: QuizState | undefined): QuizOverlayContent {
    return {
      quizKey: KEY,
      assertion: A,
      quiz,
      generation: 0,
      status: 'aguardando',
      notice: null,
      onSelect: () => {},
      onMinimize: () => {},
      onRetry: null,
      onReopen: null,
    };
  }

  it('ACERTO publicado durante a janela: role=status, texto do acerto, tinta VERDE', () => {
    const state = submitQuizAnswer(
      createTrackLessonState(),
      KEY,
      A.answerIndex,
      A.answerIndex,
      2_000,
    );
    const quiz = visibleQuizFor(state, A).quiz;
    assert.equal(quiz?.answered, true);
    assert.equal(quiz?.correct, true);

    openQuizOverlay(ctx());
    publishQuizOverlayContent(contentWith(quiz));
    const html = renderHost();
    assert.ok(html.includes('role="dialog"'), 'a janela é o overlay aberto sobre a tela');
    assert.ok(html.includes('role="status"'), 'o veredito é anunciado por role=status (SC 4.1.3)');
    assert.ok(onScreen(html).includes(ptBR.lesson.quizCorrect), 'o texto do ACERTO está na tela');
    assert.match(
      html,
      /color:\s*var\(--mui-palette-success-main\)/,
      'o veredito de acerto é VERDE (a cor é o que o dono pediu para ver)',
    );
  });

  it('ERRO publicado durante a janela: texto do erro + o FEEDBACK que explica o porquê', () => {
    const state = submitQuizAnswer(createTrackLessonState(), KEY, ERRADO, A.answerIndex, 2_000);
    const quiz = visibleQuizFor(state, A).quiz;
    assert.equal(quiz?.correct, false);

    openQuizOverlay(ctx());
    publishQuizOverlayContent(contentWith(quiz));
    const html = renderHost();
    const tela = onScreen(html);
    assert.ok(html.includes('role="status"'));
    assert.ok(tela.includes(ptBR.lesson.quizWrong), 'o texto do ERRO está na tela');
    assert.ok(
      A.feedback !== undefined && tela.includes(A.feedback),
      'o feedback da assertion é o que o aluno lê durante a janela',
    );
    assert.match(html, /color:\s*var\(--mui-palette-error-main\)/, 'o veredito de erro é VERMELHO');
  });

  it('sem resposta: NENHUM veredito na tela — o box só existe quando answered', () => {
    openQuizOverlay(ctx());
    publishQuizOverlayContent(contentWith(undefined));
    const html = renderHost();
    assert.ok(!html.includes(ptBR.lesson.quizCorrect), 'nada de veredito antes da resposta');
    assert.ok(!html.includes(ptBR.lesson.quizWrong));
  });

  it('a publicação congelada carrega o card RESPONDIDO — o estado novo nasce FORA do updater', () => {
    const corpo = bodyOf('const handleQuizAnswer = useCallback');
    assert.match(
      corpo,
      /submitQuizAnswer\(chatRef\.current, visible\.key, answerIndex, correctIndex\)/,
      'o submit lê o chat ATUAL pelo ref — o card congelado precisa da resposta JÁ gravada',
    );
    assert.match(
      corpo,
      /card: \{ \.\.\.card, visible: visibleQuizFor\(proximo, card\.original\) \}/,
      'o card congelado é derivado do estado PÓS-resposta (o veredito de verdade)',
    );
    assert.match(corpo, /key: visible\.key,/, 'a janela está presa ao quiz respondido');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * BLOCO 3 — A JANELA CONGELA FASE E CONTEÚDO — e nada a derruba antes do fim
 * ══════════════════════════════════════════════════════════════════════════ */
describe('os dois efeitos respeitam a janela (o veredito não é derrubado)', () => {
  it('o EFEITO DE FASE sai cedo durante a janela, e RETOMA quando ela termina', () => {
    const at = VIEW.indexOf('if (verdictHold !== null) return;');
    assert.ok(at > 0, 'o guard da fase existe');
    // O recorte é o efeito que o contém: do useEffect anterior até a lista de
    // deps — é ELE que precisa da dep verdictHold.
    const inicio = VIEW.lastIndexOf('useEffect(() => {', at);
    const fim = VIEW.indexOf('}, [', at);
    assert.ok(inicio > 0 && fim > at, 'o guard mora dentro do efeito de fase');
    assert.ok(VIEW.slice(inicio, fim).includes('applyQuizOverlayStep('),
      'é o efeito que aplica o passo do ciclo');
    assert.match(
      VIEW.slice(fim, VIEW.indexOf(']);', fim) + 4),
      /\[activeQuizCard, quizOverlay\.quizKey, lesson, chat, verdictHold\]/,
      'verdictHold é dependência do efeito de fase — sem ela o desenho não retoma no fim da janela',
    );
  });

  it('a PUBLICAÇÃO congelada é INCONDICIONAL — o ciclo rápido não troca o veredito por trás da janela', () => {
    const at = VIEW.indexOf('if (verdictHold !== null) {');
    assert.ok(at > 0, 'a publicação congelada existe');
    const ramo = VIEW.slice(
      at + 'if (verdictHold !== null) {'.length,
      VIEW.indexOf('if (activeQuizCard === null)', at),
    );
    assert.ok(ramo.includes('return;'), 'a janela interrompe o desenho ANTES do ramo normal');
    assert.ok(
      ramo.includes("status: 'aguardando'"),
      'o status na janela é o neutro da casa — o veredito é desenhado pelo ESTADO respondido',
    );
    assert.ok(ramo.includes('quiz: verdictHold.card.visible.quiz'),
      'o conteúdo congelado é o card RESPONDIDO (o veredito)');
    assert.ok(ramo.includes('quizKey: verdictHold.card.visible.key'),
      'a chave publicada é a do quiz respondido — conteúdo de OUTRA chave esconderia o card aberto');
    assert.ok(ramo.includes('onRetry: null') && ramo.includes('onReopen: null'),
      'na janela não há retry nem reopen — as opções estão travadas pelo estado respondido');
    assert.ok(ramo.includes('onMinimize: handleQuizMinimize'),
      'Esc/backdrop/botão continuam funcionando DURANTE a janela: quem quer sair antes, sai');
  });

  it('a publicação congelada é a ÚNICA da base (não há segunda cópia do congelamento)', () => {
    assert.equal(
      VIEW.split('if (verdictHold !== null) {').length - 1,
      1,
      'uma publicação congelada só — guardas duplicadas escondem corridas',
    );
  });

  it('trocar de ABA no meio da janela: o cleanup drena o timer e executa o minimize', () => {
    // O cleanup de unmount: o efeito vazio cuja função de retorno drena tudo.
    const cleanupAt = VIEW.indexOf('return () => {', VIEW.indexOf('publishQuizOverlayContent(null);\n'));
    const cleanup = VIEW.slice(cleanupAt, VIEW.indexOf('}, []);', cleanupAt));
    const ordem = [
      cleanup.indexOf('clearTimeout(verdictTimerRef.current)'),
      cleanup.indexOf('verdictTimerRef.current = null;'),
      cleanup.indexOf('const hold = verdictHoldRef.current;'),
      cleanup.indexOf('verdictHoldRef.current = null;'),
      cleanup.indexOf('minimizeQuizOverlay(hold.key)'),
    ];
    for (const [i, at] of ordem.entries()) assert.ok(at > 0, `cleanup incompleto no passo ${i}`);
    assert.ok(
      ordem.every((at, i) => i === 0 || at > ordem[i - 1]),
      'ordem: cancela o timer → zera o ref → lê e zera o hold → minimiza. ' +
        'Nenhum timer sobrevive à view, e o minimize acontece MESMO com a aba trocada',
    );
  });

  it('a transição que o cleanup executa é REAL no store de módulo (nada segura a fase)', () => {
    openQuizOverlay({
      quizKey: 'k::a',
      assertionId: 'a',
      generation: 0,
      sectionId: 'k',
      anchorIndex: 0,
    });
    assert.equal(peekQuizOverlay().phase, 'sobre-a-tela');
    minimizeQuizOverlay('k::a');
    assert.equal(peekQuizOverlay().phase, 'minimizado-no-chat',
      'o store é de módulo: o minimize do cleanup é seguro pós-unmount');
  });

  it('abrir OUTRO quiz na janela ENCERRA a janela; o MESMO quiz não (o gesto do aluno vence)', () => {
    const corpo = bodyOf('const handleQuizReopen = useCallback');
    assert.match(
      corpo,
      /if \(hold !== null && hold\.key !== quizKey\) \{/,
      'só a janela de OUTRO quiz é cancelada',
    );
    const ramo = corpo.slice(
      corpo.indexOf('if (hold !== null && hold.key !== quizKey) {'),
      corpo.indexOf('const snapshot'),
    );
    assert.ok(ramo.includes('clearTimeout(verdictTimerRef.current)'), 'o timer é cancelado');
    assert.ok(ramo.includes('verdictTimerRef.current = null;'), 'o ref do timer é zerado');
    assert.ok(ramo.includes('setVerdictHold(null)'), 'o hold é solto — o overlay desenha o quiz pedido');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * BLOCO 4 — RESPOSTA DUPLA IMPOSSÍVEL (duas camadas)
 * ══════════════════════════════════════════════════════════════════════════ */
describe('resposta dupla é impossível: guard na view + idempotência na máquina', () => {
  const A = LESSON.assertions[0];
  const KEY = A.sectionId ? `${A.sectionId}::${A.id}` : A.id;
  const ERRADO = A.answerIndex === 0 ? 1 : 0;

  it('GUARDA DE FONTE: dominado OU já respondido retorna CEDO, ANTES do submit', () => {
    const corpo = bodyOf('const handleQuizAnswer = useCallback');
    const guarda = corpo.indexOf(
      "if (visible.step.kind === 'dominado' || visible.quiz?.answered === true) return;",
    );
    const submit = corpo.indexOf('submitQuizAnswer(chatRef.current');
    assert.ok(guarda > 0, 'a guarda de resposta dupla existe');
    assert.ok(submit > guarda, 'a guarda vem ANTES do submit — a mesma guarda cobre a janela do veredito');
  });

  it('MÁQUINA: a primeira resposta vence — qualquer segunda submissão é no-op POR REFERÊNCIA', () => {
    let s = createTrackLessonState();
    const antes = s;
    s = submitQuizAnswer(s, KEY, ERRADO, A.answerIndex, 2_000);
    const primeira = s;
    assert.notEqual(primeira, antes, 'a primeira resposta grava de verdade');
    for (const deNovo of [0, 1, 2, 3, A.answerIndex]) {
      if (deNovo === ERRADO) continue;
      const segunda = submitQuizAnswer(primeira, KEY, deNovo, A.answerIndex, 3_000);
      assert.equal(segunda, primeira, `a submissão dupla com índice ${deNovo} é no-op por referência`);
    }
    const quiz = visibleQuizFor(primeira, A).quiz;
    assert.equal(quiz?.selected, ERRADO, 'o índice da PRIMEIRA resposta permanece');
  });

  it('MÁQUINA: acerto anterior fecha a chave — nem trocando o índice se reabre', () => {
    let s = submitQuizAnswer(createTrackLessonState(), KEY, A.answerIndex, A.answerIndex, 2_000);
    const dominado = s;
    s = submitQuizAnswer(dominado, KEY, ERRADO, A.answerIndex, 3_000);
    assert.equal(s, dominado, 'dominado é dominado: submit é no-op');
  });

  it('durante a janela as opções do card congelado estão TODAS travadas (o segundo clique nem existe)', () => {
    const state = submitQuizAnswer(createTrackLessonState(), KEY, ERRADO, A.answerIndex, 2_000);
    const { quiz } = visibleQuizFor(state, A);
    for (let i = 0; i < A.options.length; i++) {
      assert.equal(optionVisualState(i, A, quiz).disabled, true,
        `opção ${i}: o estado respondido desabilita a alternativa`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * BLOCO 5 — FQ2: REDUCED-MOTION — o movimento sai, a INFORMAÇÃO nunca
 * ══════════════════════════════════════════════════════════════════════════ */
describe('FQ2 — prefers-reduced-motion: o veredito aparece SEM animação', () => {
  const QUIZ_CARD_SRC = readFileSync(resolve(HERE, '../src/views/LessonView/LessonQuiz.tsx'), 'utf8');
  const QUIZ_CARD = codeOf(QUIZ_CARD_SRC);

  it('o card lê a preferência ANTES de desenhar o veredito', () => {
    assert.ok(QUIZ_CARD.includes('useReducedMotion()'), 'useReducedMotion é consultado');
    const leitura = QUIZ_CARD.indexOf('useReducedMotion()');
    const veredito = QUIZ_CARD.indexOf('initial={reduceMotion');
    assert.ok(leitura > 0 && veredito > leitura, 'a preferência é lida antes do uso');
  });

  it('com movimento reduzido o box do veredito NASCE PRONTO (initial={false}) — mas NASCE', () => {
    assert.match(
      QUIZ_CARD_SRC,
      /initial=\{reduceMotion \? false : \{ opacity: 0, scale: 0\.92 \}\}/,
      'reduceMotion → initial={false}: sem animação de entrada, o box do veredito já está lá',
    );
    // O ternário da animação NÃO é a condicional de EXISTÊNCIA: o box mora
    // dentro do ramo `answered ?`, nunca dentro de `reduceMotion ?`. É isso
    // que garante "a informação nunca" — reduzir o movimento não esconde nada.
    const answered = QUIZ_CARD.indexOf('{answered ? (');
    const motion = QUIZ_CARD.indexOf('initial={reduceMotion', answered);
    const status = QUIZ_CARD.indexOf('role="status"', motion);
    assert.ok(answered > 0 && motion > answered && status > motion,
      'o box do veredito está no ramo answered, e não no ternário de reduceMotion');
  });

  it('a entrada animada é nível spatial: só transform + opacity — cor nunca entra', () => {
    assert.match(QUIZ_CARD_SRC, /animate=\{\{ opacity: 1, scale: 1 \}\}/,
      'a animação é só opacity/scale');
    const inicio = QUIZ_CARD_SRC.indexOf('initial={reduceMotion');
    const fim = QUIZ_CARD_SRC.indexOf('transformOrigin', inicio);
    const veredito = QUIZ_CARD_SRC.slice(inicio, fim);
    assert.ok(!/#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b/.test(veredito), 'nenhuma cor crua na animação');
    assert.ok(veredito.includes('springs.snappy'), 'o spring é o snappy (o pop curto)');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * BLOCO 6 — FQ3: O CICLO SOB CARGA — o motor espera a vez, e retoma
 * ══════════════════════════════════════════════════════════════════════════ */
describe('FQ3 — o motor do ciclo espera o turno do tutor (guard de busy)', () => {
  it('o guard de busy é o PRIMEIRO comando do efeito motor — nada dispara enquanto o turno roda', () => {
    const at = VIEW.indexOf('if (busy) return;');
    assert.ok(at > 0, 'o guard existe');
    // Recorte do efeito motor: do useEffect até a lista de deps com busy.
    const inicio = VIEW.lastIndexOf('useEffect(() => {', at);
    const fim = VIEW.indexOf('}, [activeQuizCard, activeNotice, driveQuizCycle, busy]);', at);
    assert.ok(inicio > 0 && fim > at, 'o efeito motor termina na deps com busy');
    const efeito = VIEW.slice(inicio, fim);
    const antesDoGuard = efeito.slice(efeito.indexOf('{') + 1, efeito.indexOf('if (busy) return;'));
    assert.ok(
      !/activeQuizCard|driveQuizCycle|quizExplain|quizRemedial/.test(antesDoGuard),
      'NADA do ciclo roda antes do guard: com turno em voo, nenhum pedido sai',
    );
    // O freio do laço de retentativa vem DEPOIS e fica INTACTO.
    const depois = efeito.slice(efeito.indexOf('if (busy) return;'));
    assert.ok(
      depois.includes("activeNotice === 'quiz-indisponivel'"),
      "o freio 'quiz-indisponivel' continua no efeito — a espera não burla o laço",
    );
  });

  it('busy é dependência do efeito: quando o turno acaba, o efeito re-executa (o passo não se perde)', () => {
    assert.match(
      VIEW,
      /\}, \[activeQuizCard, activeNotice, driveQuizCycle, busy\]\);/,
      'sem busy nas deps o efeito não re-executaria quando o turno termina',
    );
  });

  it('o quizInFlightRef é declarado ANTES do activeQuizStatus que o lê', () => {
    const inFlight = VIEW.indexOf('const quizInFlightRef = useRef<Set<string>>(new Set());');
    const status = VIEW.indexOf('const activeQuizStatus = useMemo(');
    assert.ok(inFlight > 0 && status > inFlight,
      'a ordem do arquivo importa: activeQuizStatus lê o ref (TDZ)');
  });

  it("'aguardando-vez' só na espera REAL: pedido em voo volta a dizer o passo do ciclo", () => {
    const corpo = bodyOf('const activeQuizStatus = useMemo(');
    assert.match(
      corpo,
      /busy &&\s*\n\s*activeNotice === null &&/,
      'a espera exige busy E nenhum aviso de canal (a indisponibilidade vence)',
    );
    assert.match(
      corpo,
      /step\.kind === 'explicar-erro' \|\| step\.kind === 'gerar-novo-quiz'/,
      "'aguardando-vez' vale só para os passos que disparam pedidos",
    );
    assert.match(corpo, /quizInFlightRef\.current\.has\(`\$\{tag\}#explicar`\)/, 'gate do explicar');
    assert.match(corpo, /quizInFlightRef\.current\.has\(`\$\{tag\}#remediar`\)/, 'gate do remediar');
    assert.match(
      corpo,
      /if \(!pedidoEmVoo\) return 'aguardando-vez';/,
      'só SEM pedido em voo o card diz que está esperando a vez',
    );
  });

  it('com aviso de canal o status é o de INDISPONIBILIDADE mesmo sob busy (o freio vence a espera)', () => {
    // A orquestração: o ramo de 'aguardando-vez' exige activeNotice === null.
    // Com 'quiz-indisponivel' o fluxo cai em overlayStatusFor(step, true) →
    // 'indisponivel' — o gate honesto de cima da casa, não burlado pela espera.
    const explicar = { kind: 'explicar-erro', generation: 0, selected: 1 } as const;
    const gerar = { kind: 'gerar-novo-quiz', generation: 0 } as const;
    assert.equal(overlayStatusFor(explicar, true), 'indisponivel');
    assert.equal(overlayStatusFor(gerar, true), 'indisponivel');
  });

  it('a etiqueta do ciclo é única POR GERAÇÃO — a geração N+1 não empresta o gate da N', () => {
    assert.notEqual(quizCycleTag('secao::afirmacao', 0), quizCycleTag('secao::afirmacao', 1));
    assert.equal(`${quizCycleTag('k', 0)}#explicar`, 'k#0#explicar', 'o formato do in-flight gate');
  });

  it('A SEQUÊNCIA PURA DA RETOMADA: resposta sob busy → turno acaba → explicação → quiz N+1 → acerto', () => {
    // O passo do ciclo SOBREVIVE à espera: quando `busy` vira false, o efeito
    // re-executa e driveQuizCycle retoma exatamente o passo do card em cena.
    // O que a view faz, passo a passo, é a sequência pura abaixo.
    let s = createTrackLessonState();
    for (const section of LESSON.theory) {
      const reply: TutorReply = { ok: true, message: section.markdown, sectionId: section.id, done: false };
      s = applyTutorReply(s, reply, 1_000);
    }
    const first = LESSON.assertions[0];
    const key = first.sectionId ? `${first.sectionId}::${first.id}` : first.id;

    // 1. o aluno responde DURANTE o turno do tutor — o gesto grava a resposta…
    s = submitQuizAnswer(s, key, 1, first.answerIndex, 2_000);
    let visible = visibleQuizFor(s, first);
    assert.equal(visible.step.kind, 'explicar-erro', '…e o passo do ciclo fica ali, esperando a vez');
    // 2. o turno acaba → o efeito motor roda → quizExplain + quizRemedial.
    s = registerQuizExplanation(
      s,
      key,
      { question: first.question, chosenOption: first.options[1], explanation: 'explica' },
      { title: 'Onde se separa', chosen: 'Alternativa' },
      3_000,
    );
    s = injectRemediationQuiz(s, key, {
      ...first,
      id: 'id-que-a-ia-inventou',
      options: ['a', 'b', 'c', 'd'],
      answerIndex: 2,
    });
    visible = visibleQuizFor(s, first);
    // 3. a retomada entregou a geração N+1, e o status voltou ao honesto de
    //    esperar resposta — nenhum 'aguardando-vez' sobrando.
    assert.equal(visible.generation, 1, 'a geração N+1 nasceu da retomada');
    assert.equal(visible.step.kind, 'aguardar-resposta');
    assert.equal(overlayStatusFor(visible.step, false), 'aguardando');
    // 4. acerto no remediador fecha o ciclo.
    s = submitQuizAnswer(s, key, 2, visible.assertion.answerIndex, 4_000);
    assert.equal(visibleQuizFor(s, first).step.kind, 'dominado');
    assert.equal(isQuizMastered(s, key), true);
  });

  it('BORDA: errar DE NOVO no remediador (geração 1) produz a etiqueta da geração 1 — sem gate emprestado', () => {
    let s = createTrackLessonState();
    const first = LESSON.assertions[0];
    const key = first.sectionId ? `${first.sectionId}::${first.id}` : first.id;
    s = submitQuizAnswer(s, key, 1, first.answerIndex, 2_000);
    s = registerQuizExplanation(s, key, { question: 'q', chosenOption: 'o', explanation: 'e' }, {}, 3_000);
    s = injectRemediationQuiz(s, key, { ...first, id: 'g1', options: ['a', 'b', 'c', 'd'], answerIndex: 2 });
    let visible = visibleQuizFor(s, first);
    assert.equal(visible.generation, 1);
    s = submitQuizAnswer(s, key, 0, visible.assertion.answerIndex, 4_000); // erra de novo
    visible = visibleQuizFor(s, first);
    assert.equal(visible.step.kind, 'explicar-erro', 'o ciclo pode rodar de novo');
    assert.equal(quizCycleTag(visible.key, visible.generation), `${key}#1`,
      'a etiqueta carrega a geração — o in-flight guard da N+1 é OUTRO');
    assert.notEqual(quizCycleTag(key, 0), quizCycleTag(key, 1));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * BLOCO 7 — O CARD DIZ A VERDADE: 'aguardando-vez' no vocabulário da tela
 * ══════════════════════════════════════════════════════════════════════════ */
describe("'aguardando-vez' — o status honesto, do módulo ao card", () => {
  it('o módulo de conteúdo circula o novo status (e o snapshot estável o cobre)', () => {
    const base: QuizOverlayContent = {
      quizKey: 'k',
      assertion: LESSON.assertions[0],
      quiz: undefined,
      generation: 0,
      status: 'aguardando-vez',
      notice: null,
      onSelect: () => {},
      onMinimize: () => {},
      onRetry: null,
      onReopen: null,
    };
    assert.equal(publishQuizOverlayContent(base), true);
    assert.equal(peekQuizOverlayContent()?.status, 'aguardando-vez');
    assert.equal(publishQuizOverlayContent({ ...base }), false,
      'republicar o mesmo desenho com o novo status é no-op por referência');
  });

  it('overlayStatusFor é DELIBERADAMENTE CEGA a ele — a orquestração é quem decide', () => {
    const passos = [
      { kind: 'aguardar-resposta', generation: 0 },
      { kind: 'explicar-erro', generation: 0, selected: 1 },
      { kind: 'gerar-novo-quiz', generation: 0 },
      { kind: 'dominado', generation: 1 },
    ] as const;
    for (const step of passos) {
      for (const canal of [false, true]) {
        assert.notEqual(
          overlayStatusFor(step as never, canal),
          'aguardando-vez',
          `passo ${step.kind} × canal=${canal}: a função pura nunca inventa o status da orquestração`,
        );
      }
    }
  });

  it('GUARDA DE FONTE: o statusText do QuizChatCard responde a espera ANTES dos ramos do ciclo', () => {
    const card = codeOf(readFileSync(resolve(HERE, '../src/components/quiz/QuizChatCard.tsx'), 'utf8'));
    const queued = card.indexOf("status === 'aguardando-vez'");
    assert.ok(queued > 0, 'o ramo de espera existe');
    for (const outro of [
      "status === 'explicando'",
      "status === 'gerando'",
      "status === 'indisponivel'",
      "status === 'dominado'",
    ]) {
      const at = card.indexOf(outro);
      assert.ok(at > queued, `${outro} vem depois da espera — a fila é respondida primeiro`);
    }
    assert.ok(card.includes("t('translation:lesson.quizChatQueued')"), 'o ramo usa a chave nova');
    assert.ok(card.includes("status === 'aguardando-vez'"), 'e o QuizChatCard é quem desenha o status');
  });

  it('o texto de espera é HONESTO: diz com quem se espera, nunca anuncia trabalho não pedido', () => {
    const ptLesson = (ptBR as unknown as { lesson: Record<string, string> }).lesson;
    const enLesson = (en as unknown as { lesson: Record<string, string> }).lesson;
    const pt = ptLesson.quizChatQueued;
    const enStr = enLesson.quizChatQueued;
    assert.ok(pt.length > 0 && enStr.length > 0, 'a chave existe e não é vazia nos dois idiomas');
    assert.ok(!/escrevendo|preparando/i.test(pt), 'pt: sem "explicando"/"gerando" disfarçado');
    assert.ok(!/writing|preparing/i.test(enStr), 'en: sem "explaining"/"generating" disfarçado');
    assert.ok(/tutor|fila|turno/i.test(pt), 'pt: diz COM QUEM se espera');
    assert.ok(/tutor|queue|queued|turn/i.test(enStr), 'en: diz com quem se espera');
    // Os textos de espera são DIFERENTES dos de trabalho em curso — mentir
    // seria exatamente o defeito que o status novo mata.
    assert.notEqual(pt, ptLesson.quizChatExplaining);
    assert.notEqual(enStr, enLesson.quizChatExplaining);
  });

  it('o par de locales é simétrico: quizChatQueued existe nos DOIS, e o teste dos dois lados', () => {
    for (const [nome, dict] of [['pt-BR', ptBR], ['en', en]] as const) {
      const lesson = (dict as unknown as { lesson: Record<string, unknown> }).lesson;
      assert.equal(typeof lesson.quizChatQueued, 'string', `${nome} tem lesson.quizChatQueued`);
      assert.ok((lesson.quizChatQueued as string).length > 0, `${nome}: a chave não é vazia`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * BLOCO 7.5 — O PIN DO BADGE NÃO VOLTA A ACENDER (guarda de fonte da view)
 * ══════════════════════════════════════════════════════════════════════════ */
describe('a view alimenta o badge pela função pura (não por filtro inline)', () => {
  it('pendingChallengeCount sai de challengeBadgeCount com os inputs da liberação', () => {
    assert.match(
      VIEW,
      /const pendingChallengeCount = challengeBadgeCount\(\{/,
      'a view usa a função pura exportada — o padrão de lessonActionStep',
    );
    const chamada = VIEW.slice(
      VIEW.indexOf('const pendingChallengeCount = challengeBadgeCount('),
      VIEW.indexOf('});', VIEW.indexOf('const pendingChallengeCount = challengeBadgeCount(')),
    );
    assert.match(chamada, /theoryDone: chat\.theoryDone/, 'a liberação lê a teoria concluída');
    assert.match(chamada, /pendingQuizCount: quizPendingAll\.length/, 'e o MESMO quizPendingAll que o gate lê');
    assert.match(chamada, /challenges: lesson\.challenges/, 'e os desafios da aula');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * BLOCO 8 — FQ5: O BADGE DE DESAFIOS — a tabela completa
 * ══════════════════════════════════════════════════════════════════════════ */
describe('FQ5 — challengeBadgeCount: a régua completa do pin de Desafios', () => {
  const VERDICTS: (TrackVerdict | null)[] = [null, 'failed', 'timeout', 'abandoned', 'passed'];

  /** Misturas de desafios cobrindo os cinco vereditos e as composições reais. */
  const MISTURAS: { lastVerdict: TrackVerdict | null }[][] = [
    [],
    [{ lastVerdict: null }],
    VERDICTS.map((lastVerdict) => ({ lastVerdict })),
    [{ lastVerdict: 'passed' }, { lastVerdict: null }, { lastVerdict: 'timeout' }],
    [{ lastVerdict: 'failed' }, { lastVerdict: 'abandoned' }, { lastVerdict: 'passed' }, { lastVerdict: null }],
  ];

  it('ANTES da liberação: 0 SEMPRE — teoria em curso OU quiz pendente, qualquer mistura de vereditos', () => {
    for (const theoryDone of [false, true]) {
      for (const pendingQuizCount of [0, 1, 3]) {
        for (const challenges of MISTURAS) {
          const liberado = theoryDone && pendingQuizCount === 0;
          const esperado = liberado
            ? challenges.filter((ch) => ch.lastVerdict !== 'passed').length
            : 0;
          const count = challengeBadgeCount({ theoryDone, pendingQuizCount, challenges });
          assert.equal(
            count,
            esperado,
            `theoryDone=${theoryDone} pending=${pendingQuizCount} desafios=${challenges.length} → ${esperado}`,
          );
          assert.ok(Number.isInteger(count) && count >= 0, 'o badge é um inteiro não-negativo');
        }
      }
    }
  });

  it('LIBERADO: cada veredito conta exatamente como o gating de sempre (null/failed/timeout/abandoned = 1)', () => {
    for (const v of VERDICTS) {
      assert.equal(
        challengeBadgeCount({ theoryDone: true, pendingQuizCount: 0, challenges: [{ lastVerdict: v }] }),
        v === 'passed' ? 0 : 1,
        `lastVerdict = ${String(v)}`,
      );
    }
    // Vários desafios: só os não-passados contam, na ordem que vierem.
    assert.equal(
      challengeBadgeCount({
        theoryDone: true,
        pendingQuizCount: 0,
        challenges: [{ lastVerdict: 'passed' }, { lastVerdict: 'abandoned' }, { lastVerdict: null }],
      }),
      2,
    );
  });

  it('a régua do pin CONCORDA com o passo da linha de ação, estado a estado (uma decisão, dois lugares)', () => {
    // O badge é 0 exatamente enquanto o desafio não LIBERA — e a liberação é a
    // MESMA condição que produz o passo 'desafio': teoria concluída E quiz
    // pendente zero. Se alguém mexer num lado só, elas divergem de novo.
    for (const theoryDone of [false, true]) {
      for (const pendingQuizCount of [0, 1]) {
        const liberado = theoryDone && pendingQuizCount === 0;
        const count = challengeBadgeCount({
          theoryDone,
          pendingQuizCount,
          challenges: [{ lastVerdict: null }],
        });
        assert.equal(count, liberado ? 1 : 0, `theoryDone=${theoryDone} pending=${pendingQuizCount}`);
      }
    }
  });

  it('GUARDA: o GATING de abertura segue INTACTO — o pin não virou porta nova', () => {
    assert.ok(VIEW.includes('export function challengeOpenBlockedByQuiz'), 'o gating continua exportado');
    assert.match(VIEW, /return finishBlock === 'quiz';/,
      'a regra é a MESMA de sempre: só quiz sem acerto tranca o desafio');
  });
});
