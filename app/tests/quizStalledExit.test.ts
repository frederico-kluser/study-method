/**
 * tests/quizStalledExit.test.ts — ONDA4-SAÍDA-DO-CICLO: o aluno deixa de ficar
 * TRANCADO na aula quando a IA está fora do ar.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O DEFEITO (medido, não suposto)
 * ══════════════════════════════════════════════════════════════════════════
 * `tests/e2e/e2e-quiz.spec.ts` (teste 5) rodava o Electron de release com
 * `E2E_QUIZ_AI=off` e afirmava, como comportamento OBSERVADO e explicitamente
 * NÃO aprovado, que "Próximo" continuava desabilitado para sempre depois de um
 * erro. A causa é a soma de duas decisões corretas:
 *
 *   - o GATE DE MAESTRIA — "só vamos para o desafio depois que o aluno provar
 *     que entendeu" (pedido explícito do dono): só o ACERTO fecha a chave;
 *   - o FAIL-CLOSED da IA — sem LLM não existe explicação nem quiz novo
 *     (`quizRemediation.ts` nunca inventa conteúdo).
 *
 * Juntas: erro → 'explicando' → o quiz remediador não vem → o ciclo PARA em
 * 'explicando'/'novo-quiz-pendente', e não existe nada na tela que o mova. Sem
 * quiz novo não há o que responder; sem responder não há acerto; sem acerto o
 * gate não abre.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * A SAÍDA (decisão do produto, implementada por `reopenStalledQuiz`)
 * ══════════════════════════════════════════════════════════════════════════
 * Com o ciclo TRAVADO por indisponibilidade, o aluno REABRE a pergunta que já
 * está na tela para uma tentativa nova. Ela NÃO dispensa o gate: continua
 * sendo preciso ACERTAR. Ela devolve o gesto que faltava — responder o que já
 * está ali — em vez de esperar por um quiz que não vai chegar.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTA SUÍTE TRAVA (e por que cada item é o que é)
 * ══════════════════════════════════════════════════════════════════════════
 *   1. A transição SÓ EXISTE com o ciclo travado. Sem `channelFailed`, ou em
 *      'aguardando-resposta'/'dominado', ela é no-op POR REFERÊNCIA — se ela
 *      valesse sempre, seria um botão de "pular o quiz" e o gate viraria
 *      decoração;
 *   2. REABRIR + ACERTAR libera o gate; REABRIR + ERRAR de novo MANTÉM travado.
 *      As duas metades juntas são a prova de que a saída é uma segunda chance,
 *      não uma dispensa;
 *   3. O INVARIANTE SAGRADO continua de pé: `assertion.answerIndex` tem ZERO
 *      leituras nas funções de decisão visual antes de a GERAÇÃO REABERTA ser
 *      respondida (getter-espião, a mesma técnica de
 *      `tests/quizMasteryCycle.test.ts`). Este é o item mais delicado da onda:
 *      reabrir a MESMA geração deixaria a tentativa antiga registrada NELA, e
 *      `optionVisualStateForGeneration` pintaria a certa de verde antes do
 *      clique — o vazamento que a ONDA10 fechou, reaberto pela porta dos
 *      fundos. É por isso que a reabertura sobe a GERAÇÃO;
 *   4. A CONTAGEM É HONESTA: `attempts` é preservado (nada de `resetQuiz`, que
 *      apaga a chave inteira), a tentativa nova entra no histórico, e a id da
 *      geração reaberta (`<chave>#g<N>`) é EXATAMENTE a que `recurrenceOf`
 *      (ERR-4, `electron/main/services/quizRemediation.ts`) lê para dizer "é a
 *      Nª vez". Reabrir não apaga o rastro do erro;
 *   5. A PROTEÇÃO ANTI-DUPLA-SUBMISSÃO de `submitQuizAnswer` sobrevive: ela é
 *      por GERAÇÃO, e a reabertura CONVIVE com ela em vez de afrouxá-la;
 *   6. A LIMITAÇÃO DECLARADA É TRAÇADA, não suposta: a geração reaberta não
 *      grava linha em `quiz_remediations` (esse canal é o que CHAMA a IA), e
 *      os testes percorrem o que `hydrateQuizFromHistory` reconstrói depois de
 *      o app fechar — geração e histórico certos, zero maestria inventada,
 *      zero tentativa perdida;
 *   7. GUARDA DE FONTE (precedente `tests/lessonQuizVisual.test.ts:167-196`,
 *      "guarda de FONTE: o JSX do card não vê answerIndex"): este repositório
 *      NÃO usa jsdom, então a ligação da tela — o botão só nasce com o ciclo
 *      travado, e nenhum caminho novo escreve maestria — é travada lendo a
 *      fonte como texto, com os comentários removidos.
 *
 * Reprodução: `cd app && npm test -- tests/quizStalledExit.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  applyTutorReply,
  attemptForGeneration,
  canReopenStalledQuiz,
  createTrackLessonState,
  hydrateQuizFromHistory,
  injectRemediationQuiz,
  isNextSectionBlockedByQuiz,
  isQuizMastered,
  nextQuizStep,
  optionVisualState,
  optionVisualStateForGeneration,
  pendingQuizzes,
  quizAttempts,
  quizCycleFor,
  quizGeneration,
  quizKeyFor,
  registerQuizExplanation,
  remediationAssertionId,
  reopenStalledQuiz,
  submitQuizAnswer,
  visibleQuizFor,
  type TrackLessonUiState,
} from '../src/lib/trackLessonState';
import { recurrenceOf } from '../electron/main/services/quizRemediation';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import en from '../src/i18n/locales/en/translation.json';
import type { QuizAttemptDto, TrackAssertionDto, TutorReply } from '../shared/ipc-contract';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Fonte sem comentários (só o código que realmente roda) — a técnica dos
 *  precedentes lessonQuizVisual / quizOverlayWiring. */
function codeOf(rel: string): string {
  return readFileSync(resolve(HERE, '..', rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function assertion(over: Partial<TrackAssertionDto> = {}): TrackAssertionDto {
  return {
    id: 'a1',
    statement: 'print mostra texto na tela.',
    question: 'O que os parênteses fazem?',
    options: ['Nada', 'Somam números', 'Seguram o que vai ser mostrado', 'Fecham o programa'],
    answerIndex: 2,
    feedback: 'Os parênteses seguram o argumento da chamada.',
    sectionId: 's1',
    ...over,
  };
}

function reply(over: Partial<TutorReply> = {}): TutorReply {
  return {
    ok: true,
    message: 'Seção apresentada.',
    sectionId: 's1',
    sectionTitle: 'Seção 1',
    done: false,
    ...over,
  };
}

/** Estado com a seção `s1` já apresentada (o quiz da afirmação fica VISÍVEL —
 *  é o que faz o gate do "Próximo" olhar para ele). */
function presented(): TrackLessonUiState {
  return applyTutorReply(createTrackLessonState(), reply({ message: 'Seção s1.' }), 1000);
}

const A = assertion();
const KEY = quizKeyFor(A);
/** Uma alternativa ERRADA (a certa é a 2). */
const ERRADA = 3;

/**
 * O ciclo TRAVADO como a IA fora do ar o deixa: o aluno errou o quiz autoral e
 * NADA voltou dos canais. `stage: 'explicando'`, geração 0, uma tentativa.
 * É EXATAMENTE o estado que o e2e observa com `E2E_QUIZ_AI=off`.
 */
function travadoSemExplicacao(): TrackLessonUiState {
  return submitQuizAnswer(presented(), KEY, ERRADA, A.answerIndex, 2_000);
}

/**
 * O OUTRO travamento possível: a explicação chegou (o canal de explicar estava
 * de pé), mas o quiz novo não. `stage: 'novo-quiz-pendente'`.
 */
function travadoComExplicacao(): TrackLessonUiState {
  return registerQuizExplanation(
    travadoSemExplicacao(),
    KEY,
    {
      question: A.question,
      chosenOption: A.options[ERRADA],
      explanation: 'A seção mostra a chamada produzindo texto — nada ali fecha o programa.',
    },
    {},
    3_000,
  );
}

// ─── 1. A transição SÓ EXISTE quando o ciclo está travado ────────────────────

describe('1. a saída só é oferecida com o ciclo TRAVADO por indisponibilidade', () => {
  it('canal DE PÉ: nem em "explicando" nem em "novo-quiz-pendente" há reabertura', () => {
    for (const st of [travadoSemExplicacao(), travadoComExplicacao()]) {
      assert.equal(canReopenStalledQuiz(st.quizBySection[KEY], false), false);
      assert.equal(
        reopenStalledQuiz(st, KEY, A, false),
        st,
        'sem canal caído a transição é no-op POR REFERÊNCIA (nada de re-render à toa)',
      );
    }
  });

  it('canal CAÍDO: os dois estágios travados aceitam a reabertura', () => {
    assert.equal(canReopenStalledQuiz(travadoSemExplicacao().quizBySection[KEY], true), true);
    assert.equal(canReopenStalledQuiz(travadoComExplicacao().quizBySection[KEY], true), true);
  });

  it('AGUARDANDO RESPOSTA não é travamento: não há o que reabrir (a pergunta já está clicável)', () => {
    const st = presented();
    assert.equal(canReopenStalledQuiz(st.quizBySection[KEY], true), false);
    assert.equal(reopenStalledQuiz(st, KEY, A, true), st);
    // e o mesmo vale para a geração remediadora recém-injetada, que também
    // está esperando resposta.
    let comRemediador = registerQuizExplanation(travadoSemExplicacao(), KEY, {
      question: A.question,
      chosenOption: A.options[ERRADA],
      explanation: 'texto',
    });
    comRemediador = injectRemediationQuiz(comRemediador, KEY, assertion({ id: 'g1', answerIndex: 1 }));
    assert.equal(canReopenStalledQuiz(comRemediador.quizBySection[KEY], true), false);
    assert.equal(reopenStalledQuiz(comRemediador, KEY, A, true), comRemediador);
  });

  it('DOMINADO nunca reabre: a chave fechou e reabrir seria refazer o que já foi provado', () => {
    const st = submitQuizAnswer(presented(), KEY, A.answerIndex, A.answerIndex, 2_000);
    assert.equal(isQuizMastered(st, KEY), true);
    assert.equal(canReopenStalledQuiz(st.quizBySection[KEY], true), false);
    assert.equal(reopenStalledQuiz(st, KEY, A, true), st);
  });

  it('chave INEXISTENTE (nada respondido) é no-op mesmo com o canal caído', () => {
    const st = presented();
    assert.equal(canReopenStalledQuiz(undefined, true), false);
    assert.equal(reopenStalledQuiz(st, 'chave-que-nao-existe', A, true), st);
  });
});

// ─── 2. Reabrir devolve a PERGUNTA, não a resposta ───────────────────────────

describe('2. reabrir zera o card da geração NOVA e preserva o ciclo', () => {
  it('a geração sobe, o card volta a esperar resposta e a pergunta é A MESMA', () => {
    const antes = travadoSemExplicacao();
    const depois = reopenStalledQuiz(antes, KEY, A, true);

    assert.equal(quizGeneration(antes, KEY), 0);
    assert.equal(quizGeneration(depois, KEY), 1, 'a reabertura é uma GERAÇÃO nova');
    assert.deepEqual(nextQuizStep(depois, KEY), { kind: 'aguardar-resposta', generation: 1 });

    const v = visibleQuizFor(depois, A);
    assert.equal(v.key, KEY, 'a chave é a mesma — o ciclo inteiro vive numa chave só');
    assert.equal(v.assertion.question, A.question, 'a MESMA pergunta volta (não se inventa outra)');
    assert.deepEqual(v.assertion.options, A.options);
    assert.equal(v.quiz?.answered, false, 'o card da geração nova nasce sem resposta');
    assert.equal(v.quiz?.selected, null);
    assert.equal(v.quiz?.correct, null);
  });

  it('a id da geração reaberta é a DETERMINÍSTICA `<chave>#g<N>` e volta à mesma chave', () => {
    const depois = reopenStalledQuiz(travadoSemExplicacao(), KEY, A, true);
    const v = visibleQuizFor(depois, A);
    assert.equal(v.assertion.id, remediationAssertionId(KEY, 1));
    assert.equal(quizKeyFor(v.assertion), KEY, 'a ida e volta da id continua reversível');
  });

  it('a explicação já lida NÃO se perde ao reabrir', () => {
    const antes = travadoComExplicacao();
    const depois = reopenStalledQuiz(antes, KEY, A, true);
    assert.equal(quizCycleFor(depois, KEY).explanation, quizCycleFor(antes, KEY).explanation);
    assert.notEqual(quizCycleFor(depois, KEY).explanation, null);
  });

  it('a bolha da conversa não é mexida: reabrir é do card, não do histórico', () => {
    const antes = travadoComExplicacao();
    const depois = reopenStalledQuiz(antes, KEY, A, true);
    assert.deepEqual(depois.history, antes.history);
  });
});

// ─── 3. O GATE NÃO FOI DISPENSADO ────────────────────────────────────────────

describe('3. reabrir devolve a chance de responder — nunca a maestria', () => {
  it('logo depois de reabrir, o gate CONTINUA fechado (nada foi dominado)', () => {
    const depois = reopenStalledQuiz(travadoSemExplicacao(), KEY, A, true);
    assert.equal(isQuizMastered(depois, KEY), false);
    assert.equal(isNextSectionBlockedByQuiz(depois, [A]), true);
    assert.deepEqual(pendingQuizzes(depois, [A]), [A]);
  });

  it('REABRIR + ACERTAR: a chave fecha e o gate abre', () => {
    let st = reopenStalledQuiz(travadoSemExplicacao(), KEY, A, true);
    const v = visibleQuizFor(st, A);
    st = submitQuizAnswer(st, v.key, v.assertion.answerIndex, v.assertion.answerIndex, 4_000);
    assert.equal(isQuizMastered(st, KEY), true);
    assert.equal(isNextSectionBlockedByQuiz(st, [A]), false);
    assert.deepEqual(pendingQuizzes(st, [A]), []);
  });

  it('REABRIR + ERRAR DE NOVO: continua travado, e o ciclo volta a pedir explicação', () => {
    let st = reopenStalledQuiz(travadoSemExplicacao(), KEY, A, true);
    const v = visibleQuizFor(st, A);
    st = submitQuizAnswer(st, v.key, ERRADA, v.assertion.answerIndex, 4_000);
    assert.equal(isQuizMastered(st, KEY), false);
    assert.equal(isNextSectionBlockedByQuiz(st, [A]), true);
    assert.deepEqual(nextQuizStep(st, KEY), {
      kind: 'explicar-erro',
      generation: 1,
      selected: ERRADA,
    });
    // …e com a IA ainda fora, a saída volta a ser oferecida: o aluno pode
    // reabrir de novo. O laço é do ALUNO, nunca automático.
    assert.equal(canReopenStalledQuiz(st.quizBySection[KEY], true), true);
  });

  it('a proteção anti-dupla-submissão sobrevive: dois cliques na geração reaberta = um', () => {
    let st = reopenStalledQuiz(travadoSemExplicacao(), KEY, A, true);
    const v = visibleQuizFor(st, A);
    st = submitQuizAnswer(st, v.key, ERRADA, v.assertion.answerIndex, 4_000);
    const depoisDoPrimeiro = st;
    st = submitQuizAnswer(st, v.key, v.assertion.answerIndex, v.assertion.answerIndex, 5_000);
    assert.equal(st, depoisDoPrimeiro, 'a segunda submissão da MESMA geração é no-op');
    assert.equal(isQuizMastered(st, KEY), false, 'nem por acerto tardio a chave fecha sozinha');
  });
});

// ─── 4. O INVARIANTE SAGRADO ─────────────────────────────────────────────────

describe('4. o INVARIANTE SAGRADO: a reabertura NÃO abre a porta do answerIndex', () => {
  /** Assertion cujo `answerIndex` REGISTRA cada leitura (getter espião). */
  function spy(): { assertion: { readonly answerIndex: number }; reads: () => number } {
    let reads = 0;
    return {
      assertion: {
        get answerIndex(): number {
          reads += 1;
          return A.answerIndex;
        },
      },
      reads: () => reads,
    };
  }

  it('geração REABERTA e ainda sem resposta: ZERO leituras nas duas funções visuais', () => {
    const st = reopenStalledQuiz(travadoSemExplicacao(), KEY, A, true);
    const quiz = st.quizBySection[KEY];

    const s = spy();
    for (const i of [0, 1, 2, 3]) optionVisualState(i, s.assertion, quiz);
    for (const i of [0, 1, 2, 3]) optionVisualStateForGeneration(i, s.assertion, quiz, 1);
    assert.equal(s.reads(), 0, 'o índice da resposta NÃO foi lido nenhuma vez');

    // E o visual é o NEUTRO, idêntico entre as quatro: nada distingue a certa.
    for (const i of [0, 1, 2, 3]) {
      assert.deepEqual(optionVisualStateForGeneration(i, { answerIndex: A.answerIndex }, quiz, 1), {
        color: 'inherit',
        variant: 'outlined',
        icon: null,
        disabled: false,
      });
    }
  });

  it('O CENÁRIO DO VAZAMENTO, executável: reabrir a MESMA geração entregaria a resposta', () => {
    // Isto é o que a implementação NÃO faz — e a razão de a reabertura ser uma
    // geração NOVA. Se o card apenas voltasse a `answered:false` mantendo a
    // geração 0, a tentativa registrada NELA continuaria lá e
    // `optionVisualStateForGeneration` a acharia: verde e ✓ antes do clique.
    const travado = travadoSemExplicacao();
    const errado: TrackLessonUiState = {
      ...travado,
      quizBySection: {
        ...travado.quizBySection,
        // a "reabertura ingênua": zera o card, MANTÉM a geração
        [KEY]: { ...travado.quizBySection[KEY], answered: false, selected: null, correct: null },
      },
    };
    const sVaza = spy();
    for (const i of [0, 1, 2, 3]) optionVisualStateForGeneration(i, sVaza.assertion, errado.quizBySection[KEY], 0);
    assert.ok(sVaza.reads() > 0, 'a reabertura ingênua LÊ o answerIndex — o vazamento');
    assert.equal(
      optionVisualStateForGeneration(A.answerIndex, A, errado.quizBySection[KEY], 0).icon,
      'correct',
      'e o ✓ apareceria antes de qualquer clique',
    );

    // A implementação REAL, no MESMO cenário, não vaza.
    const certo = reopenStalledQuiz(travado, KEY, A, true);
    const sReal = spy();
    for (const i of [0, 1, 2, 3]) optionVisualStateForGeneration(i, sReal.assertion, certo.quizBySection[KEY], 1);
    assert.equal(sReal.reads(), 0);
  });

  it('a geração ANTIGA continua mostrando o próprio feedback (o erro não some da tela)', () => {
    const st = reopenStalledQuiz(travadoSemExplicacao(), KEY, A, true);
    const quiz = st.quizBySection[KEY];
    assert.equal(optionVisualStateForGeneration(ERRADA, A, quiz, 0).icon, 'wrong');
    assert.equal(optionVisualStateForGeneration(A.answerIndex, A, quiz, 0).icon, 'correct');
    assert.equal(attemptForGeneration(quiz, 0)?.selected, ERRADA);
    assert.equal(attemptForGeneration(quiz, 1), undefined, 'a geração reaberta ainda não tem tentativa');
  });

  it('depois de responder a geração reaberta, o feedback DELA aparece (e só então)', () => {
    let st = reopenStalledQuiz(travadoSemExplicacao(), KEY, A, true);
    const v = visibleQuizFor(st, A);
    st = submitQuizAnswer(st, v.key, ERRADA, v.assertion.answerIndex, 4_000);
    const quiz = st.quizBySection[KEY];
    assert.equal(optionVisualStateForGeneration(ERRADA, A, quiz, 1).icon, 'wrong');
    assert.equal(optionVisualState(ERRADA, A, quiz).icon, 'wrong');
  });
});

// ─── 5. CONTAGEM HONESTA: a tentativa reaberta CONTA ─────────────────────────

describe('5. reabrir não apaga o rastro do erro', () => {
  it('as tentativas anteriores PERMANECEM e a nova entra no histórico', () => {
    let st = reopenStalledQuiz(travadoSemExplicacao(), KEY, A, true);
    assert.equal(quizAttempts(st, KEY).length, 1, 'reabrir NÃO apaga a tentativa do erro');

    const v = visibleQuizFor(st, A);
    st = submitQuizAnswer(st, v.key, ERRADA, v.assertion.answerIndex, 4_000);
    const attempts = quizAttempts(st, KEY);
    assert.equal(attempts.length, 2, 'a tentativa da geração reaberta CONTA');
    assert.deepEqual(
      attempts.map((a) => [a.generation, a.selected, a.correct]),
      [
        [0, ERRADA, false],
        [1, ERRADA, false],
      ],
    );
  });

  it('três voltas de reabertura = três tentativas registradas, em ordem', () => {
    let st = travadoSemExplicacao();
    for (let volta = 1; volta <= 3; volta += 1) {
      st = reopenStalledQuiz(st, KEY, visibleQuizFor(st, A).assertion, true);
      const v = visibleQuizFor(st, A);
      assert.equal(v.generation, volta);
      st = submitQuizAnswer(st, v.key, ERRADA, v.assertion.answerIndex, 5_000 + volta);
    }
    assert.deepEqual(
      quizAttempts(st, KEY).map((a) => a.generation),
      [0, 1, 2, 3],
      'nenhuma tentativa foi engolida pelo caminho',
    );
    assert.equal(isQuizMastered(st, KEY), false, 'e o gate seguiu fechado o tempo todo');
  });

  it('`resetQuiz` NÃO é o gancho: ele apagaria a chave inteira (por isso não foi usado)', () => {
    // A prova de que a escolha de implementação importa: `resetQuiz` existe e
    // é um escape hatch legítimo, mas usá-lo aqui apagaria `attempts` — e com
    // ele o rastro do erro e a recorrência ERR-4.
    const st = reopenStalledQuiz(travadoSemExplicacao(), KEY, A, true);
    assert.notEqual(st.quizBySection[KEY], undefined, 'a chave continua no mapa');
    assert.ok(quizAttempts(st, KEY).length > 0, 'com o histórico intacto');
  });

  it('ERR-4: a geração reaberta é EXATAMENTE o que o serviço de remediação conta', () => {
    // `recurrenceOf` (electron/main/services/quizRemediation.ts) deriva o
    // número da série da id `<chave>#g<N>`. A reabertura escreve essa MESMA id,
    // então errar de novo aparece como "a 2ª vez", "a 3ª vez"… sem que o
    // serviço precise saber que houve reabertura.
    let st = travadoSemExplicacao();
    const esperado = [2, 3, 4];
    for (let volta = 1; volta <= 3; volta += 1) {
      st = reopenStalledQuiz(st, KEY, visibleQuizFor(st, A).assertion, true);
      const v = visibleQuizFor(st, A);
      assert.deepEqual(
        recurrenceOf({ assertion: v.assertion, quizOrigin: 'remedial' }),
        { recurrent: true, ordinal: esperado[volta - 1] },
        `a volta ${volta} é a ${esperado[volta - 1]}ª vez nesta afirmação`,
      );
      st = submitQuizAnswer(st, v.key, ERRADA, v.assertion.answerIndex, 5_000 + volta);
    }
  });

  it('o quiz AUTORAL (geração 0) continua sendo o "primeiro erro" — nada foi inflado', () => {
    assert.deepEqual(recurrenceOf({ assertion: A, quizOrigin: 'authored' }), {
      recurrent: false,
      ordinal: null,
    });
  });
});

// ─── 6. A LIMITAÇÃO DECLARADA: o que sobrevive ao FECHAMENTO do app ──────────
//
// A geração reaberta NÃO grava linha em `quiz_remediations`: esse canal é o
// que CHAMA a IA, e chamá-lo aqui seria pedir de novo justamente o que acabou
// de falhar. Os três testes abaixo TRAÇAM a degradação em vez de supô-la — o
// ponto é que ela é benigna: nada de maestria inventada, nada de tentativa
// perdida.

describe('6. a limitação declarada: reabrir e FECHAR o app degrada sem mentir', () => {
  const NOW = '2026-09-05T12:00:00.000Z';
  const attemptRow = (assertionId: string, correct: boolean, attemptNo: number): QuizAttemptDto => ({
    trackSlug: 'python',
    lessonId: 'l1',
    sectionKey: KEY,
    assertionId,
    selectedIndex: correct ? A.answerIndex : ERRADA,
    correct,
    attemptNo,
    quizOrigin: attemptNo === 1 ? 'authored' : 'remedial',
    createdAt: NOW,
  });

  it('errou, reabriu e errou de novo: geração e histórico voltam certos, SEM maestria', () => {
    const st = hydrateQuizFromHistory(
      presented(),
      [attemptRow(A.id, false, 1), attemptRow(remediationAssertionId(KEY, 1), false, 2)],
      [],
    );
    assert.equal(quizGeneration(st, KEY), 1, 'a geração reaberta sobreviveu (a id a carrega)');
    assert.equal(quizAttempts(st, KEY).length, 2, 'as duas tentativas voltaram');
    assert.equal(isQuizMastered(st, KEY), false, 'e nenhuma maestria foi inventada');
    // A assertion volta a ser a AUTORAL — que é a MESMA pergunta que a
    // reabertura repetia, então o aluno não vê diferença nenhuma.
    assert.equal(visibleQuizFor(st, A).assertion.question, A.question);
  });

  it('acertou a geração reaberta: a MAESTRIA sobrevive ao fechamento', () => {
    const st = hydrateQuizFromHistory(
      presented(),
      [attemptRow(A.id, false, 1), attemptRow(remediationAssertionId(KEY, 1), true, 2)],
      [],
    );
    assert.equal(isQuizMastered(st, KEY), true);
    assert.equal(isNextSectionBlockedByQuiz(st, [A]), false);
  });

  it('reabriu e fechou SEM responder: o ciclo volta travado — e a saída é oferecida de novo', () => {
    const st = hydrateQuizFromHistory(presented(), [attemptRow(A.id, false, 1)], []);
    assert.equal(quizGeneration(st, KEY), 0, 'a reabertura não respondida não deixou rastro');
    assert.equal(isQuizMastered(st, KEY), false);
    assert.equal(
      canReopenStalledQuiz(st.quizBySection[KEY], true),
      true,
      'e o aluno reabre outra vez — nunca fica sem saída',
    );
  });
});

// ─── 7. GUARDA DE FONTE: a ligação com a tela ────────────────────────────────
//
// Sem jsdom não há como montar a LessonView e clicar. O que dá para provar,
// e é o que importa aqui, é que o botão NÃO nasce fora do estado travado e
// que nenhum caminho novo escreve maestria — precedente
// tests/lessonQuizVisual.test.ts:167-196.

describe('7. guarda de FONTE: o botão só existe com o ciclo travado', () => {
  const VIEW = codeOf('src/views/LessonView/LessonView.tsx');
  const CARD = codeOf('src/components/quiz/QuizChatCard.tsx');
  const HOST = codeOf('src/components/quiz/QuizOverlayHost.tsx');

  it('a view chama a transição PURA (nada de mexer em quizBySection na mão)', () => {
    assert.ok(VIEW.includes('reopenStalledQuiz('), 'a reabertura é da máquina pura');
    assert.ok(
      !/setChat\(\s*\(st\)\s*=>\s*\(\{[\s\S]{0,400}quizBySection/.test(VIEW),
      'a view nunca escreve quizBySection diretamente',
    );
  });

  it('a view NUNCA passa `true` literal como canal-caído (a guarda tem de ser real)', () => {
    const chamada = VIEW.slice(VIEW.indexOf('reopenStalledQuiz('));
    const linha = chamada.slice(0, chamada.indexOf('\n'));
    assert.ok(
      !linha.includes(', true)'),
      'um `true` fixo transformaria a saída num botão de pular o quiz',
    );
    assert.ok(
      VIEW.includes('activeNoticeRef.current'),
      'o canal-caído sai do aviso REAL da volta em cena',
    );
  });

  it('a saída só é publicada com o status "indisponivel" (nas duas metades do quiz)', () => {
    const ocorrencias = VIEW.split('onReopen').length - 1;
    assert.equal(ocorrencias, 2, 'o overlay e o card compacto — e nada além disso');
    for (const trecho of VIEW.split('onReopen').slice(1)) {
      const janela = trecho.slice(0, 200);
      assert.ok(
        janela.includes("activeQuizStatus === 'indisponivel'"),
        'todo onReopen é condicionado ao ciclo TRAVADO',
      );
    }
  });

  it('nenhum caminho novo escreve maestria: a reabertura não toca em "dominado"', () => {
    const corte = VIEW.indexOf('const handleQuizReopenGeneration');
    assert.ok(corte > 0, 'o handler precisa existir na view');
    const handler = VIEW.slice(corte, corte + 1200);
    for (const proibido of ['dominado', 'isQuizMastered', 'closeQuizOverlay', 'submitQuizAnswer']) {
      assert.ok(!handler.includes(proibido), `o handler da reabertura não pode citar ${proibido}`);
    }
  });

  it('o card e o overlay desenham o botão a partir do prop, nunca de estado próprio', () => {
    for (const [nome, texto] of [
      ['QuizChatCard', CARD],
      ['QuizOverlayHost', HOST],
    ] as const) {
      assert.ok(texto.includes('quizChatReopen'), `${nome} precisa rotular a saída pela i18n`);
      assert.ok(!/useState\(/.test(texto), `${nome} não pode inventar estado local do ciclo`);
    }
    assert.ok(CARD.includes('onReopen ? ('), 'o card só desenha o botão quando o prop existe');
    assert.ok(HOST.includes('content.onReopen ? ('), 'o overlay idem');
  });
});

// ─── 8. A REDAÇÃO: sem punição e sem elogio (§8 item 3 / §8.2) ───────────────

describe('8. o texto da saída é informacional', () => {
  // O bloco `lesson` do JSON tem sub-objetos (`phase`), então o índice é
  // `unknown` e a leitura passa por um acessor que só devolve string — o mesmo
  // padrão de tests/quizOverlayWiring.test.ts.
  const lessonPt = (ptBR as unknown as { lesson: Record<string, unknown> }).lesson;
  const lessonEn = (en as unknown as { lesson: Record<string, unknown> }).lesson;
  const texto = (dict: Record<string, unknown>, key: string): string => {
    const v = dict[key];
    return typeof v === 'string' ? v : '';
  };
  const textos = [texto(lessonPt, 'quizChatReopen'), texto(lessonEn, 'quizChatReopen')];

  it('a chave existe, não vazia, nos dois idiomas', () => {
    for (const t of textos) assert.notEqual(t.trim(), '');
  });

  it('nem castigo nem prêmio: o rótulo diz o que o clique FAZ', () => {
    for (const t of textos) {
      // §8 item 3: "sem punição… redação informativa".
      assert.ok(!/errad|wrong|falhou|failed|que pena/i.test(t), `sem repreensão em "${t}"`);
      // §8.2: elogio ritualizado (d = −0,40) fora.
      assert.ok(!/parab|congrat|🎉|muito bem|well done/i.test(t), `sem elogio em "${t}"`);
      // docs/02-pedagogia.md §9: nada de promessa nem de número sem lastro.
      assert.ok(!/\d/.test(t), `sem número sem lastro em "${t}"`);
      assert.ok(!/fácil|easy|simples|rapidinho/i.test(t), `sem minimizar a dificuldade em "${t}"`);
    }
  });

  it('a saída é DISTINGUÍVEL do "Pedir de novo" (são coisas diferentes)', () => {
    assert.notEqual(texto(lessonPt, 'quizChatReopen'), texto(lessonPt, 'quizChatRetry'));
    assert.notEqual(texto(lessonEn, 'quizChatReopen'), texto(lessonEn, 'quizChatRetry'));
  });
});
