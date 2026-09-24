/**
 * tests/cx-views-lesson-helpers.test.ts — GOLDEN MASTER das funções PURAS das
 * views (`LessonView.tsx`, `TrackChallengePanel.tsx`) e da decisão de devolução
 * de foco do overlay de quiz (`QuizOverlayHost.tsx`) para as ondas de
 * refatoração.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO É
 * ══════════════════════════════════════════════════════════════════════════
 * Caracterização das DECISÕES que as views delegam a funções exportadas —
 * tudo o que dá para provar sem DOM: o passo da linha de ação e o que o clique
 * faz (inclusive "revelar NUNCA avança"), o rótulo da mensagem de estado, o
 * gate do botão "Desafios" e o badge dele, o eixo da coluna da aula, o
 * auto-scroll sem guarda, o veredito do quiz em ms, a decisão de gravar
 * 'abandoned', a normalização do rascunho retomado (o beco sem saída do
 * desafio de MÓDULO), a reconstrução do tracker de estrelas e para onde o foco
 * volta quando o modal do quiz sai.
 *
 * IMPORT DINÂMICO COM SPECIFIER COMPUTADO (o idioma de
 * tests/quizOverlayRender.test.ts e tests/lessonChatLayout.test.ts): os
 * alvos são `.tsx` e o projeto dos testes é compilado SEM jsx/DOM de propósito
 * — o import estático apagaria essa garantia. O `before()` carrega os módulos
 * REAIS em runtime; os tipos abaixo são a assinatura pública observada.
 *
 * Reprodução: `cd app && npm test -- tests/cx-views-lesson-helpers.test.ts`
 */
import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetChallengeDraftForTests,
  takeChallengeDraft,
  type ChallengeDraft,
} from '../src/lib/challengeDraftCache';

/* ─── Assinaturas públicas observadas (os imports são dinâmicos) ──────────── */

interface LessonActionInput {
  started: boolean;
  theoryDone: boolean;
  doneMarked: boolean;
  typingTheory: boolean;
  nextBlockedByQuiz: boolean;
  finishBlock: 'quiz' | 'challenges' | null;
}

interface BadgeInput {
  theoryDone: boolean;
  pendingQuizCount: number;
  challenges: ReadonlyArray<{ lastVerdict: string | null }>;
}

interface ScrollPinEl {
  scrollTop: number;
  scrollHeight: number;
}

interface ScrollNudgeEl {
  scrollHeight: number;
  scrollTo: (opts: { top: number; behavior: string }) => void;
}

interface LessonViewModule {
  LESSON_COLUMN_SX: Record<string, unknown>;
  lessonLogSx: (theme: unknown) => Record<string, unknown>;
  lessonActionStep: (input: LessonActionInput) => string;
  nextClickAction: (step: string) => 'revelar' | 'avancar' | 'nada';
  lessonActionStatusKey: (step: string, quizCardOnScreen: boolean) => string | null;
  challengeOpenBlockedByQuiz: (finishBlock: 'quiz' | 'challenges' | null) => boolean;
  challengeBadgeCount: (input: BadgeInput) => number;
  pinLogToBottom: (el: ScrollPinEl) => void;
  nudgeLogToBottom: (el: ScrollNudgeEl) => void;
  QUIZ_VERDICT_MS: number;
}

interface PanelModule {
  shouldMarkAbandon: (input: {
    started: boolean;
    concluded: string | null;
    hasSpec: boolean;
    marked: string | null;
  }) => boolean;
  normalizeDraftForResume: (draft: ChallengeDraft, timeLimitMs: number) => ChallengeDraft;
  persistDraftOnUnmount: (snapshot: {
    key: { trackSlug: string; target: string; lessonId?: string; moduleSlug?: string; challengeId: string };
    timeLimitMs: number;
    draft: ChallengeDraft;
  } | null) => void;
  restoreStarTracker: (input: {
    timeLimitMs: number;
    minFirstStarMs: number;
    elapsedMs: number;
    starsLeft: number;
  }) => { stars: () => number };
}

interface FocoNode {
  readonly isConnected: boolean;
  focus: () => void;
}

interface HostModule {
  focusReturnTarget: <N extends FocoNode>(
    opener: N | null,
    anchor: { readonly isConnected: boolean; querySelector: (sel: string) => N | null } | null,
  ) => N | null;
}

const VIEW_MODULE = new URL('../src/views/LessonView/LessonView.tsx', import.meta.url).href;
const PANEL_MODULE = new URL('../src/views/ChallengeView/TrackChallengePanel.tsx', import.meta.url).href;
const HOST_MODULE = new URL('../src/components/quiz/QuizOverlayHost.tsx', import.meta.url).href;

let VIEW: LessonViewModule;
let PANEL: PanelModule;
let HOST: HostModule;

before(async () => {
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
  VIEW = (await import(VIEW_MODULE)) as unknown as LessonViewModule;
  PANEL = (await import(PANEL_MODULE)) as unknown as PanelModule;
  HOST = (await import(HOST_MODULE)) as unknown as HostModule;
});

beforeEach(() => {
  __resetChallengeDraftForTests();
});

/** rascunho neutro de fábrica (o shape completo do cache). */
function rascunho(over: Partial<ChallengeDraft> = {}): ChallengeDraft {
  return {
    code: 'console.log(1)',
    filesCode: {},
    activeFile: null,
    started: true,
    elapsedMs: 60_000,
    starsLeft: 2,
    concluded: null,
    result: null,
    marked: null,
    ...over,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
 * 1. A VIEW DA AULA — eixo, linha de ação, gates e auto-scroll
 * ══════════════════════════════════════════════════════════════════════════ */

describe('LessonView — o eixo da coluna e o painel de mensagens', () => {
  it('LESSON_COLUMN_SX é UM objeto, aplicado na raiz: preenche, sem teto e sem centralização', () => {
    assert.deepEqual({ ...VIEW.LESSON_COLUMN_SX }, { width: '100%', minWidth: 0 });
    assert.equal('maxWidth' in VIEW.LESSON_COLUMN_SX, false, 'a coluna perdeu o teto de propósito');
    assert.equal('mx' in VIEW.LESSON_COLUMN_SX, false);
  });

  it('lessonLogSx: a conversa SEM caixa — nível 0, ancorada EMBAIXO', () => {
    const theme = { vars: { palette: { surface: { level0: 'var(--surface-0)' } } } };
    assert.deepEqual({ ...VIEW.lessonLogSx(theme) }, {
      flexGrow: 1,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-end',
      gap: 1,
      bgcolor: 'var(--surface-0)',
    });
  });
});

describe('lessonActionStep — UM passo, com precedência explícita', () => {
  const base: LessonActionInput = {
    started: true,
    theoryDone: false,
    doneMarked: false,
    typingTheory: false,
    nextBlockedByQuiz: false,
    finishBlock: null,
  };

  it("'nao-comecou' tem precedência MÁXIMA — nem o doneMarked renderiza avanço antes de começar", () => {
    assert.equal(VIEW.lessonActionStep({ ...base, started: false }), 'nao-comecou');
    assert.equal(
      VIEW.lessonActionStep({ ...base, started: false, doneMarked: true, typingTheory: true, nextBlockedByQuiz: true }),
      'nao-comecou',
    );
  });

  it("'proxima-aula' vem depois: concluída é concluída, nada mais bloqueia", () => {
    assert.equal(VIEW.lessonActionStep({ ...base, doneMarked: true }), 'proxima-aula');
    assert.equal(
      VIEW.lessonActionStep({ ...base, doneMarked: true, nextBlockedByQuiz: true, finishBlock: 'challenges' }),
      'proxima-aula',
    );
  });

  it("teoria em curso: 'revelar' (em escrita) vence o gate do quiz; depois 'quiz-secao'; senão 'proximo'", () => {
    assert.equal(
      VIEW.lessonActionStep({ ...base, typingTheory: true, nextBlockedByQuiz: true }),
      'revelar',
      'em digitação o clique MOSTRA TUDO — o gate volta no render seguinte',
    );
    assert.equal(VIEW.lessonActionStep({ ...base, nextBlockedByQuiz: true }), 'quiz-secao');
    assert.equal(VIEW.lessonActionStep(base), 'proximo');
  });

  it("teoria acabada: o motivo do finishBlock diz qual é o CTA ('quiz-aula' vence 'desafio')", () => {
    assert.equal(VIEW.lessonActionStep({ ...base, theoryDone: true, finishBlock: 'quiz' }), 'quiz-aula');
    assert.equal(VIEW.lessonActionStep({ ...base, theoryDone: true, finishBlock: 'challenges' }), 'desafio');
    assert.equal(VIEW.lessonActionStep({ ...base, theoryDone: true, finishBlock: null }), 'concluir');
  });
});

describe('nextClickAction — o que o clique faz (e o que NUNCA faz)', () => {
  it("'revelar' revela; 'proximo' avança; TODOS os demais passos são 'nada'", () => {
    assert.equal(VIEW.nextClickAction('revelar'), 'revelar');
    assert.equal(VIEW.nextClickAction('proximo'), 'avancar');
    for (const passo of ['nao-comecou', 'quiz-secao', 'quiz-aula', 'desafio', 'concluir', 'proxima-aula']) {
      assert.equal(VIEW.nextClickAction(passo), 'nada', `o passo "${passo}" não pode disparar sendNext`);
    }
  });
});

describe('lessonActionStatusKey — a frase role="status" (switch EXAUSTIVO)', () => {
  it('cada passo diz a frase certa (ou nenhuma) — com a distinção card-quiz na tela', () => {
    assert.equal(VIEW.lessonActionStatusKey('revelar', false), 'lesson.revealGateTyping');
    assert.equal(VIEW.lessonActionStatusKey('revelar', true), 'lesson.revealGateTyping');
    assert.equal(VIEW.lessonActionStatusKey('quiz-secao', true), 'lesson.quizGateNext');
    assert.equal(VIEW.lessonActionStatusKey('quiz-secao', false), 'lesson.quizGateTyping');
    assert.equal(VIEW.lessonActionStatusKey('quiz-aula', false), 'lesson.quizGateFinish');
    assert.equal(VIEW.lessonActionStatusKey('desafio', false), 'lesson.challengeGateFinish');
  });

  it("os passos de botão vivo ('nao-comecou'/'proximo'/'concluir'/'proxima-aula') não pedem desculpa", () => {
    for (const passo of ['nao-comecou', 'proximo', 'concluir', 'proxima-aula']) {
      assert.equal(VIEW.lessonActionStatusKey(passo, false), null, passo);
      assert.equal(VIEW.lessonActionStatusKey(passo, true), null, passo);
    }
  });
});

describe('o gate e o badge do botão "Desafios"', () => {
  it('challengeOpenBlockedByQuiz: só o quiz tranca a porta da aula (não esconde o botão)', () => {
    assert.equal(VIEW.challengeOpenBlockedByQuiz('quiz'), true);
    assert.equal(VIEW.challengeOpenBlockedByQuiz('challenges'), false, "desafio pendente não tranca o desafio");
    assert.equal(VIEW.challengeOpenBlockedByQuiz(null), false);
  });

  it('challengeBadgeCount: o pin SÓ acende quando o desafio de fato liberou', () => {
    const desafios = [
      { lastVerdict: null },
      { lastVerdict: 'failed' },
      { lastVerdict: 'timeout' },
      { lastVerdict: 'abandoned' },
      { lastVerdict: 'passed' },
    ];
    // teoria em curso → 0 (o pin não anuncia o que ainda não existe)
    assert.equal(VIEW.challengeBadgeCount({ theoryDone: false, pendingQuizCount: 0, challenges: desafios }), 0);
    // quiz pendente → 0 (mesma regra do passo 'desafio')
    assert.equal(VIEW.challengeBadgeCount({ theoryDone: true, pendingQuizCount: 2, challenges: desafios }), 0);
    // liberado: conta os que NÃO passaram (null incluído = nunca tentado)
    assert.equal(VIEW.challengeBadgeCount({ theoryDone: true, pendingQuizCount: 0, challenges: desafios }), 4);
    // todos passed ou sem desafios → badge zerado (o MUI esconde o 0)
    assert.equal(
      VIEW.challengeBadgeCount({
        theoryDone: true,
        pendingQuizCount: 0,
        challenges: [{ lastVerdict: 'passed' }, { lastVerdict: 'passed' }],
      }),
      0,
    );
    assert.equal(VIEW.challengeBadgeCount({ theoryDone: true, pendingQuizCount: 0, challenges: [] }), 0);
  });
});

describe('auto-scroll — as DUAS portas, sem guarda de posição (pedido do dono)', () => {
  it('pinLogToBottom vai ao FIM mesmo com o aluno rolado lá para cima', () => {
    const el: ScrollPinEl = { scrollTop: 0, scrollHeight: 9876 };
    VIEW.pinLogToBottom(el);
    assert.equal(el.scrollTop, 9876);
  });

  it('nudgeLogToBottom é o irmão SUAVE (behavior: smooth), para o mesmo fim', () => {
    const chamadas: Array<{ top: number; behavior: string }> = [];
    const el: ScrollNudgeEl = {
      scrollHeight: 4321,
      scrollTo: (opts) => {
        chamadas.push(opts);
      },
    };
    VIEW.nudgeLogToBottom(el);
    assert.deepEqual(chamadas, [{ top: 4321, behavior: 'smooth' }]);
  });

  it('a janela do veredito do quiz é 1600 ms (tempo de ler um veredito de uma linha)', () => {
    assert.equal(VIEW.QUIZ_VERDICT_MS, 1600);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 2. O PAINEL DO DESAFIO — abandono, rascunho retomado e estrelas
 * ══════════════════════════════════════════════════════════════════════════ */

describe('shouldMarkAbandon — só marca abandono se NENHUM terminal saiu', () => {
  it('true apenas para started && !concluded && hasSpec && marked === null', () => {
    assert.equal(PANEL.shouldMarkAbandon({ started: true, concluded: null, hasSpec: true, marked: null }), true);
  });

  it("qualquer terminal JÁ gravado impede o 'abandoned' de passar por cima (o bug do unmount)", () => {
    for (const marked of ['passed', 'failed', 'timeout', 'abandoned', 'veredito-desconhecido']) {
      assert.equal(
        PANEL.shouldMarkAbandon({ started: true, concluded: null, hasSpec: true, marked }),
        false,
        `marked=${marked}`,
      );
    }
  });

  it('e os demais eixos: não começou, já concluiu ou sem spec ⇒ nada a marcar', () => {
    assert.equal(PANEL.shouldMarkAbandon({ started: false, concluded: null, hasSpec: true, marked: null }), false);
    assert.equal(PANEL.shouldMarkAbandon({ started: true, concluded: 'passed', hasSpec: true, marked: null }), false);
    assert.equal(PANEL.shouldMarkAbandon({ started: true, concluded: null, hasSpec: false, marked: null }), false);
  });
});

describe('normalizeDraftForResume — veredito terminal salvo NÃO vira beco sem saída', () => {
  const LIMITE = 210_000; // timeLimitForDifficultyMs(2) — o relógio do desafio de módulo

  it("'passed' e o rascunho em curso passam INTACTOS — por VALOR, campo a campo", () => {
    const aprovado = rascunho({ concluded: 'passed', elapsedMs: LIMITE });
    // POR VALOR, e não por referência: o contrato é "passa INTACTO — nada é
    // normalizado". `return draft` e `return { ...draft }` são o MESMO
    // comportamento; exigir a identidade reprovaria a segunda refatoração sem
    // que nenhum comportamento tivesse mudado. Onde a identidade É contrato
    // (os NO-OP por referência do trackLessonState e do dockReducer), ela
    // continua exigida nos testes daquelas funções.
    assert.deepEqual(PANEL.normalizeDraftForResume(aprovado, LIMITE), aprovado);
    const emCurso = rascunho();
    assert.deepEqual(PANEL.normalizeDraftForResume(emCurso, LIMITE), emCurso);
  });

  it("'failed' RETOMA: código, saída do erro e relógio preservados — só o concluded zera", () => {
    const r = rascunho({
      concluded: 'failed',
      elapsedMs: 100_000,
      starsLeft: 1,
      code: 'quase lá',
      result: { output: 'saída do erro' } as never,
      marked: 'failed',
    });
    const out = PANEL.normalizeDraftForResume(r, LIMITE);
    assert.equal(out.concluded, null, 'editor e "Testar resposta" voltam liberados');
    assert.equal(out.code, 'quase lá');
    assert.equal(out.elapsedMs, 100_000);
    assert.equal(out.starsLeft, 1);
    assert.deepEqual(out.result, { output: 'saída do erro' });
    assert.equal(out.marked, 'failed', 'o marked evita regravar o mesmo terminal');
  });

  it("'failed' que nasceu ESTOURADO morreu: o relógio recomeça (o 1º tick não reconclui 'timeout')", () => {
    const out = PANEL.normalizeDraftForResume(
      rascunho({ concluded: 'failed', elapsedMs: LIMITE, starsLeft: 0, code: 'código fica' }),
      LIMITE,
    );
    assert.equal(out.concluded, null);
    assert.equal(out.elapsedMs, 0);
    assert.equal(out.starsLeft, 3);
    assert.equal(out.code, 'código fica', 'a evidência continua na tela');
  });

  it("'timeout' sempre recomeça a tentativa (mantendo código e evidência)", () => {
    const out = PANEL.normalizeDraftForResume(
      rascunho({ concluded: 'timeout', elapsedMs: LIMITE + 5, starsLeft: 0, code: 'meu código' }),
      0, // limite inválido: mesmo assim o 'timeout' é terminal
    );
    assert.equal(out.concluded, null);
    assert.equal(out.elapsedMs, 0);
    assert.equal(out.starsLeft, 3);
    assert.equal(out.code, 'meu código');
  });

  it('limite em que não se pode confiar (0, negativo, NaN, Infinity) NUNCA zera uma tentativa VIVA', () => {
    for (const limite of [0, -1, NaN, Infinity, -Infinity]) {
      const r = rascunho({ concluded: 'failed', elapsedMs: 999_999 });
      const out = PANEL.normalizeDraftForResume(r, limite);
      assert.equal(out.elapsedMs, 999_999, `limite=${limite}: preserva o relógio`);
      assert.equal(out.starsLeft, 2);
    }
  });
});

describe('persistDraftOnUnmount — a decisão de persistir, com o cache REAL', () => {
  const KEY = {
    trackSlug: 'python',
    target: 'module',
    moduleSlug: 'a-tela',
    challengeId: 'dobro',
  };

  it('sem snapshot nada é gravado; rascunho INTOCADO também não entra no cache', () => {
    assert.doesNotThrow(() => PANEL.persistDraftOnUnmount(null));
    assert.equal(takeChallengeDraft(KEY as never), null);
    // intocado = nem começou, sem teste rodado e sem veredito: restaurá-lo daria
    // exatamente o estado inicial.
    PANEL.persistDraftOnUnmount({
      key: KEY as never,
      timeLimitMs: 210_000,
      draft: rascunho({ started: false, concluded: null, result: null, marked: null }),
    });
    assert.equal(takeChallengeDraft(KEY as never), null, 'intocado = restaurar daria o estado inicial');
  });

  it("rascunho INICIADO entra no cache, NORMALIZADO (um 'failed' estourado volta com relógio novo)", () => {
    PANEL.persistDraftOnUnmount({
      key: KEY as never,
      timeLimitMs: 210_000,
      draft: rascunho({ concluded: 'failed', elapsedMs: 210_000, starsLeft: 0 }),
    });
    const guardado = takeChallengeDraft(KEY as never);
    assert.equal(guardado?.concluded, null);
    assert.equal(guardado?.elapsedMs, 0);
    assert.equal(guardado?.starsLeft, 3);
    assert.equal(guardado?.started, true, 'o aluno JÁ tinha começado — isso não se perde');
  });

  it("um 'passed' persiste como está (o aluno vê o que conquistou ao voltar)", () => {
    PANEL.persistDraftOnUnmount({
      key: KEY as never,
      timeLimitMs: 210_000,
      draft: rascunho({ concluded: 'passed', starsLeft: 3, elapsedMs: 45_000 }),
    });
    const guardado = takeChallengeDraft(KEY as never);
    assert.equal(guardado?.concluded, 'passed');
    assert.equal(guardado?.elapsedMs, 45_000);
    assert.equal(guardado?.starsLeft, 3);
  });
});

describe('restoreStarTracker — a estrela perdida NUNCA volta (nem é cobrada duas vezes)', () => {
  const CASA = { timeLimitMs: 300_000, minFirstStarMs: 60_000 };

  it('sem perda nenhuma: 3 estrelas de volta com o tempo que passou', () => {
    assert.equal(PANEL.restoreStarTracker({ ...CASA, elapsedMs: 30_000, starsLeft: 3 }).stars(), 3);
    assert.equal(PANEL.restoreStarTracker({ ...CASA, elapsedMs: 59_999, starsLeft: 3 }).stars(), 3);
  });

  it('as perdas por DEMORA são reproduzidas pelo tick (mesmo tempo ⇒ mesmas perdas)', () => {
    // 200s ≥ 60% do limite ⇒ −1; < 85% ⇒ só uma.
    assert.equal(PANEL.restoreStarTracker({ ...CASA, elapsedMs: 200_000, starsLeft: 2 }).stars(), 2);
    // 270s ≥ 85% ⇒ −2.
    assert.equal(PANEL.restoreStarTracker({ ...CASA, elapsedMs: 270_000, starsLeft: 1 }).stars(), 1);
  });

  it('a perda EXPLÍCITA (blur) é reposta: diferença entre o tick e o starsLeft', () => {
    assert.equal(PANEL.restoreStarTracker({ ...CASA, elapsedMs: 30_000, starsLeft: 2 }).stars(), 2);
    // blur + duas demoras: o tracker novo reproduz tudo e chega em 0.
    assert.equal(PANEL.restoreStarTracker({ ...CASA, elapsedMs: 270_000, starsLeft: 0 }).stars(), 0);
  });

  it('é DETERMINÍSTICO: o mesmo input devolve o mesmo tracker (sem devolver estrela no tick seguinte)', () => {
    const a = PANEL.restoreStarTracker({ ...CASA, elapsedMs: 200_000, starsLeft: 2 }).stars();
    const b = PANEL.restoreStarTracker({ ...CASA, elapsedMs: 200_000, starsLeft: 2 }).stars();
    assert.equal(a, b);
    assert.equal(a, 2);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 3. FOCO DE VOLTA quando o modal do quiz sai (SC 2.4.3)
 * ══════════════════════════════════════════════════════════════════════════ */

describe('focusReturnTarget — para onde o foco volta (ordem explícita)', () => {
  function node(nome: string, conectado: boolean, focos: string[] = []): FocoNode & { nome: string } {
    return {
      nome,
      isConnected: conectado,
      focus: () => {
        focos.push(nome);
      },
    };
  }

  it('1º: o próprio abridor, SE ainda estiver na árvore (nem a âncora é consultada)', () => {
    const abridor = node('abridor', true);
    let consultada = false;
    const ancora = {
      isConnected: true,
      querySelector: (): null => {
        consultada = true;
        return null;
      },
    };
    assert.equal(HOST.focusReturnTarget(abridor, ancora), abridor);
    assert.equal(consultada, false, 'a âncora só entra quando o abridor já caiu');
  });

  it('2º: o primeiro focável dentro do CARD que sobrevive (o caminho real do CTA renascido)', () => {
    const renascido = node('cta-renascido', true);
    const ancora = { isConnected: true, querySelector: (): FocoNode => renascido };
    assert.equal(HOST.focusReturnTarget(node('abridor-morto', false), ancora), renascido);
    assert.equal(HOST.focusReturnTarget(null, ancora), renascido);
  });

  it('3º: NINGUÉM — devolver o foco a elemento arbitrário é pior que deixá-lo onde está', () => {
    assert.equal(HOST.focusReturnTarget(node('morto', false), null), null);
    assert.equal(HOST.focusReturnTarget(null, null), null);
    assert.equal(HOST.focusReturnTarget(null, { isConnected: false, querySelector: () => node('x', true) }), null);
    assert.equal(HOST.focusReturnTarget(node('morto', false), { isConnected: true, querySelector: () => null }), null);
  });
});
