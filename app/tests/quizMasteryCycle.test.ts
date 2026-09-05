/**
 * tests/quizMasteryCycle.test.ts — ONDA1-MAESTRIA: o quiz deixa de aceitar
 * "respondeu, pode passar" e passa a exigir ACERTO, com um ciclo de
 * remediação no meio.
 *
 * A REGRA ANTIGA (ONDA10, travada em `lessonQuizGate.test.ts`): o gate lia
 * `answered` e nunca `correct`; a i18n dizia, literalmente, "acertar não é
 * exigido, só responder"; `submitQuizAnswer` era cegamente idempotente.
 *
 * A REGRA NOVA (pedido explícito do dono desta onda):
 *
 *     erro → a IA explica por que a alternativa não se sustenta → a explicação
 *     ENTRA NO HISTÓRICO do chat → um quiz NOVO sobre o mesmo conteúdo é
 *     injetado → o ciclo repete até o acerto. Só o acerto abre o caminho para
 *     o desafio.
 *
 * O TOM É DIAGNÓSTICO, NÃO CORRETIVO — `docs/ux-redesign.md` §8 item 3 (falha
 * vira estado de diagnóstico com redação informativa, sem punição) e §8.2
 * (elogio ritualizado d = −0,40 ✗; feedback informacional específico d = +0,43
 * em adultos ✓).
 *
 * O QUE ESTA SUÍTE TRAVA:
 *   1. acerto na 1ª tentativa → 'dominado' e chave FECHADA (imutável);
 *   2. erro → ciclo ABERTO ('explicando'), gate NÃO libera;
 *   3. o ciclo inteiro: erro → explicação no chat → quiz remediador → acerto →
 *      gate libera;
 *   4. a bolha da explicação NÃO desloca a âncora dos quizzes (kind próprio
 *      'quiz-explanation' — se fosse 'message' ela contaria como apresentação
 *      de seção e o gate passaria a olhar a bolha errada);
 *   5. o INVARIANTE SAGRADO: nenhuma função pura lê `assertion.answerIndex`
 *      antes de o aluno responder AQUELA geração — provado com um getter
 *      espião, inclusive para o quiz remediador;
 *   6. a chave é única por assertion (bug de colisão consertado) e reversível
 *      a partir da id do remediador;
 *   7. estados LEGADOS (só answered/selected/correct, como os do cache de
 *      sessão) normalizam sem que ninguém precise migrar nada.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTutorReply,
  attemptForGeneration,
  chatBubbleTps,
  createTrackLessonState,
  formatQuizExplanationBubble,
  injectRemediationQuiz,
  isNextSectionBlockedByQuiz,
  isQuizAnswered,
  isQuizMastered,
  nextQuizStep,
  optionVisualState,
  optionVisualStateForGeneration,
  pendingQuizzes,
  quizAttempts,
  quizCycleFor,
  quizCycleOf,
  quizExplanation,
  quizGeneration,
  quizKeyFor,
  quizStepOf,
  quizzesByMessageIndex,
  registerQuizExplanation,
  remediationAssertionId,
  remediationQuizFor,
  sectionPresentationIndexes,
  submitQuizAnswer,
  visibleQuizFor,
  TYPEWRITER_TPS,
  type QuizState,
  type TrackLessonUiState,
} from '../src/lib/trackLessonState';
import type { TrackAssertionDto, TutorReply } from '../shared/ipc-contract';

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

/** Estado com as seções `ids` já apresentadas (uma bolha por seção). */
function presented(...ids: string[]): TrackLessonUiState {
  let s = createTrackLessonState();
  ids.forEach((id, i) => {
    s = applyTutorReply(s, reply({ sectionId: id, message: `Seção ${id}.` }), 1000 + i);
  });
  return s;
}

const EXPLICACAO = {
  question: 'O que os parênteses fazem?',
  chosenOption: 'Fecham o programa',
  explanation: 'A seção mostra a chamada `print("oi")` produzindo texto — nada ali encerra o programa.',
};

describe('ONDA1-MAESTRIA — acertar de primeira FECHA a chave', () => {
  it('acerto na 1ª → dominado, gate libera, e a chave vira imutável', () => {
    const a = assertion();
    const key = quizKeyFor(a);
    const s0 = presented('s1');
    assert.equal(pendingQuizzes(s0, [a]).length, 1, 'antes de responder, pendente');

    const s1 = submitQuizAnswer(s0, key, a.answerIndex, a.answerIndex, 42);
    assert.equal(isQuizMastered(s1, key), true);
    assert.equal(quizCycleFor(s1, key).stage, 'dominado');
    assert.deepEqual(nextQuizStep(s1, key), { kind: 'dominado', generation: 0 });
    assert.equal(pendingQuizzes(s1, [a]).length, 0, 'gate liberado');
    assert.equal(isNextSectionBlockedByQuiz(s1, [a]), false);
    assert.deepEqual(quizAttempts(s1, key), [
      { generation: 0, selected: a.answerIndex, correct: true, ts: 42 },
    ]);

    // IMUTÁVEL dali em diante: nem uma resposta errada, nem explicação, nem
    // quiz remediador reabrem uma chave dominada.
    assert.equal(submitQuizAnswer(s1, key, 0, a.answerIndex), s1, 'submit posterior é no-op');
    assert.equal(registerQuizExplanation(s1, key, EXPLICACAO), s1, 'explicação é no-op');
    assert.equal(injectRemediationQuiz(s1, key, assertion({ id: 'x' })), s1, 'remediador é no-op');
    // e o estado ANTERIOR não foi mutado (contrato de imutabilidade do módulo)
    assert.equal(s0.quizBySection[key], undefined);
  });
});

describe('ONDA1-MAESTRIA — errar ABRE o ciclo (e não libera nada)', () => {
  it('erro → stage "explicando", gate fechado, próximo passo = explicar', () => {
    const a = assertion();
    const key = quizKeyFor(a);
    const s1 = submitQuizAnswer(presented('s1'), key, 3, a.answerIndex, 7);

    assert.equal(isQuizAnswered(s1, key), true, 'responder segue sendo responder');
    assert.equal(isQuizMastered(s1, key), false, '…mas responder não é dominar');
    assert.equal(quizCycleFor(s1, key).stage, 'explicando');
    assert.deepEqual(nextQuizStep(s1, key), {
      kind: 'explicar-erro',
      generation: 0,
      selected: 3,
    });
    assert.equal(pendingQuizzes(s1, [a]).length, 1, 'CONCLUIR continua travado');
    assert.equal(isNextSectionBlockedByQuiz(s1, [a]), true, 'PRÓXIMO continua travado');
  });

  it('a 2ª resposta na MESMA geração é no-op (dois cliques ≠ duas tentativas)', () => {
    const a = assertion();
    const key = quizKeyFor(a);
    const s1 = submitQuizAnswer(presented('s1'), key, 3, a.answerIndex);
    assert.equal(submitQuizAnswer(s1, key, 2, a.answerIndex), s1, 'mesma referência');
    assert.equal(quizAttempts(s1, key).length, 1);
  });
});

describe('ONDA1-MAESTRIA — o CICLO completo: erro → explicação → quiz novo → acerto', () => {
  it('o ciclo roda e só o acerto libera o gate', () => {
    const a = assertion();
    const key = quizKeyFor(a);

    // 1) erro
    const errou = submitQuizAnswer(presented('s1'), key, 3, a.answerIndex, 10);
    assert.equal(pendingQuizzes(errou, [a]).length, 1);

    // 2) a explicação entra no HISTÓRICO do chat
    const explicado = registerQuizExplanation(errou, key, EXPLICACAO, {}, 20);
    const bolha = explicado.history[explicado.history.length - 1];
    assert.equal(bolha.role, 'assistant');
    assert.equal(bolha.kind, 'quiz-explanation');
    assert.equal(bolha.ts, 20);
    assert.ok(bolha.content.includes('Fecham o programa'), 'a bolha nomeia a alternativa marcada');
    assert.equal(quizExplanation(explicado, key), bolha.content);
    assert.equal(quizCycleFor(explicado, key).stage, 'novo-quiz-pendente');
    assert.deepEqual(nextQuizStep(explicado, key), { kind: 'gerar-novo-quiz', generation: 0 });
    assert.equal(pendingQuizzes(explicado, [a]).length, 1, 'explicar não libera');
    // idempotente: registrar de novo é no-op (StrictMode / reentrada)
    assert.equal(registerQuizExplanation(explicado, key, EXPLICACAO), explicado);

    // 3) o quiz remediador entra — geração 1, card ZERADO
    const nova = assertion({ id: 'gerado-pela-llm', answerIndex: 1, sectionId: 's1' });
    const remediado = injectRemediationQuiz(explicado, key, nova);
    assert.equal(quizGeneration(remediado, key), 1);
    assert.equal(isQuizAnswered(remediado, key), false, 'a geração nova começa sem resposta');
    assert.equal(quizCycleFor(remediado, key).stage, 'aguardando-resposta');
    assert.deepEqual(nextQuizStep(remediado, key), { kind: 'aguardar-resposta', generation: 1 });
    assert.equal(remediationQuizFor(remediado, key)?.id, remediationAssertionId(key, 1));
    assert.equal(quizAttempts(remediado, key).length, 1, 'a tentativa antiga PERMANECE');
    assert.equal(pendingQuizzes(remediado, [a]).length, 1, 'ainda não dominado');

    // a view renderiza a REMEDIADORA sob a MESMA chave
    const visible = visibleQuizFor(remediado, a);
    assert.equal(visible.key, key, 'a chave continua a da assertion autoral');
    assert.equal(visible.assertion.id, remediationAssertionId(key, 1));
    assert.equal(visible.generation, 1);
    assert.equal(quizKeyFor(visible.assertion), key, 'a id do remediador VOLTA para a chave');

    // 4) erra de novo → o ciclo simplesmente repete (geração 2)
    const errouDeNovo = submitQuizAnswer(remediado, key, 0, nova.answerIndex, 30);
    assert.equal(quizCycleFor(errouDeNovo, key).stage, 'explicando');
    assert.equal(quizAttempts(errouDeNovo, key).length, 2);
    const ciclo2 = injectRemediationQuiz(
      registerQuizExplanation(errouDeNovo, key, EXPLICACAO, {}, 40),
      key,
      assertion({ id: 'outra', answerIndex: 3 }),
    );
    assert.equal(quizGeneration(ciclo2, key), 2);
    assert.equal(pendingQuizzes(ciclo2, [a]).length, 1);

    // 5) acerta → dominado, gate LIVRE
    const dominou = submitQuizAnswer(ciclo2, key, 3, 3, 50);
    assert.equal(isQuizMastered(dominou, key), true);
    assert.equal(quizAttempts(dominou, key).length, 3, 'as três tentativas ficam registradas');
    assert.equal(pendingQuizzes(dominou, [a]).length, 0);
    assert.equal(isNextSectionBlockedByQuiz(dominou, [a]), false);
  });

  it('degradação: sem explicação disponível, o remediador ainda entra (não trava o aluno)', () => {
    const a = assertion();
    const key = quizKeyFor(a);
    const errou = submitQuizAnswer(presented('s1'), key, 0, a.answerIndex);
    // pula o registro da explicação (a LLM falhou) e injeta direto
    const remediado = injectRemediationQuiz(errou, key, assertion({ id: 'g', answerIndex: 0 }));
    assert.equal(quizGeneration(remediado, key), 1);
    assert.equal(quizExplanation(remediado, key), null, 'sem explicação registrada');
    assert.equal(quizCycleFor(remediado, key).stage, 'aguardando-resposta');
  });

  it('injetar remediador em chave que nunca errou é no-op', () => {
    const a = assertion();
    const key = quizKeyFor(a);
    const s = presented('s1');
    assert.equal(injectRemediationQuiz(s, key, assertion({ id: 'g' })), s);
    assert.equal(registerQuizExplanation(s, key, EXPLICACAO), s);
  });
});

describe('ONDA1-MAESTRIA — a bolha da explicação não estraga a ANCORAGEM', () => {
  it("kind 'quiz-explanation' não conta como apresentação de seção", () => {
    const a1 = assertion({ id: 'a1', sectionId: 's1' });
    const a2 = assertion({ id: 'a2', sectionId: 's2' });
    let s = presented('s1');
    const antes = sectionPresentationIndexes(s).get('s1');
    s = submitQuizAnswer(s, quizKeyFor(a1), 0, a1.answerIndex);
    s = registerQuizExplanation(s, quizKeyFor(a1), EXPLICACAO);
    assert.equal(s.history.length, 2, 'a explicação entrou na conversa');
    assert.equal(sectionPresentationIndexes(s).get('s1'), antes, 'a âncora de s1 não se moveu');

    // a próxima seção continua ancorando na PRÓPRIA bolha
    s = applyTutorReply(s, reply({ sectionId: 's2', message: 'Seção s2.' }), 2000);
    assert.equal(sectionPresentationIndexes(s).get('s2'), 2, 's2 na bolha 2');
    const porBolha = quizzesByMessageIndex(s, [a1, a2]);
    assert.deepEqual((porBolha.get(0) ?? []).map((x) => x.id), ['a1']);
    assert.deepEqual((porBolha.get(2) ?? []).map((x) => x.id), ['a2']);
  });

  it('a explicação é digitada em velocidade de LEITURA (é texto para ler)', () => {
    const a = assertion();
    let s = presented('s1');
    s = submitQuizAnswer(s, quizKeyFor(a), 0, a.answerIndex);
    s = registerQuizExplanation(s, quizKeyFor(a), EXPLICACAO);
    assert.equal(chatBubbleTps(s.history, 1), TYPEWRITER_TPS.theory);
  });

  it('o markdown da bolha usa fence DINÂMICO (o trecho citado pode ter backticks)', () => {
    const md = formatQuizExplanationBubble({
      ...EXPLICACAO,
      codeExcerpt: 'print("```oi```")',
      codeLanguage: 'python',
    });
    assert.ok(md.includes('````python'), 'fence de 4 backticks quando o conteúdo tem run de 3');
    assert.ok(md.startsWith('## '), 'título em markdown');
    // Tom: informacional/diagnóstico — nada de repreensão nem de elogio.
    for (const proibido of ['Parabéns', 'Errado', 'Que pena', 'continue assim']) {
      assert.ok(!md.includes(proibido), `redação sem "${proibido}" (§8/§8.2)`);
    }
  });
});

describe('ONDA1-MAESTRIA — o INVARIANTE SAGRADO: answerIndex não é lido antes da resposta', () => {
  /** Assertion cujo `answerIndex` REGISTRA cada leitura (getter espião). */
  function spy(): { assertion: { readonly answerIndex: number }; reads: () => number } {
    let reads = 0;
    return {
      assertion: {
        get answerIndex(): number {
          reads += 1;
          return 2;
        },
      },
      reads: () => reads,
    };
  }

  it('optionVisualState não toca answerIndex enquanto não há resposta', () => {
    const s = spy();
    for (const i of [0, 1, 2, 3]) optionVisualState(i, s.assertion, undefined);
    const naoRespondido: QuizState = { answered: false, selected: null, correct: null };
    for (const i of [0, 1, 2, 3]) optionVisualState(i, s.assertion, naoRespondido);
    assert.equal(s.reads(), 0, 'o índice da resposta NÃO foi lido nenhuma vez');
  });

  it('o quiz REMEDIADOR herda o invariante: geração sem tentativa → neutro sem ler nada', () => {
    const a = assertion();
    const key = quizKeyFor(a);
    let st = submitQuizAnswer(presented('s1'), key, 3, a.answerIndex);
    st = registerQuizExplanation(st, key, EXPLICACAO);
    st = injectRemediationQuiz(st, key, assertion({ id: 'g', answerIndex: 1 }));
    const quiz = st.quizBySection[key];

    const s = spy();
    for (const i of [0, 1, 2, 3]) optionVisualStateForGeneration(i, s.assertion, quiz, 1);
    assert.equal(s.reads(), 0, 'a geração 1 ainda não foi respondida — nada é lido');
    // e o visual é o neutro, idêntico entre as alternativas
    const visuais = [0, 1, 2, 3].map((i) => optionVisualStateForGeneration(i, { answerIndex: 1 }, quiz, 1));
    for (const v of visuais) {
      assert.deepEqual(v, { color: 'inherit', variant: 'outlined', icon: null, disabled: false });
    }
  });

  it('o card da geração ANTIGA continua mostrando o próprio feedback', () => {
    const a = assertion();
    const key = quizKeyFor(a);
    let st = submitQuizAnswer(presented('s1'), key, 3, a.answerIndex);
    st = registerQuizExplanation(st, key, EXPLICACAO);
    st = injectRemediationQuiz(st, key, assertion({ id: 'g', answerIndex: 1 }));
    const quiz = st.quizBySection[key];

    // geração 0: a escolha errada (3) em vermelho, a certa (2) em verde
    assert.deepEqual(optionVisualStateForGeneration(3, a, quiz, 0), {
      color: 'error',
      variant: 'outlined',
      icon: 'wrong',
      disabled: true,
    });
    assert.deepEqual(optionVisualStateForGeneration(2, a, quiz, 0), {
      color: 'success',
      variant: 'contained',
      icon: 'correct',
      disabled: true,
    });
    assert.equal(attemptForGeneration(quiz, 0)?.selected, 3);
    assert.equal(attemptForGeneration(quiz, 1), undefined);
  });
});

describe('ONDA1-MAESTRIA — chave única por assertion e normalização do legado', () => {
  it('duas assertions da mesma seção têm chaves distintas; sem sectionId, a id sozinha', () => {
    assert.equal(quizKeyFor(assertion({ id: 'a1', sectionId: 's1' })), 's1::a1');
    assert.equal(quizKeyFor(assertion({ id: 'a2', sectionId: 's1' })), 's1::a2');
    assert.equal(quizKeyFor(assertion({ id: 'solta', sectionId: undefined })), 'solta');
    // e a id do remediador é reversível para a chave
    assert.equal(quizKeyFor({ id: remediationAssertionId('s1::a1', 3), sectionId: 's1' }), 's1::a1');
    assert.equal(quizKeyFor({ id: remediationAssertionId('solta', 1), sectionId: undefined }), 'solta');
  });

  it('estado LEGADO (só answered/selected/correct) normaliza sem migração', () => {
    // acerto antigo vale como maestria; erro antigo REABRE o ciclo (sob a
    // regra nova aquele erro nunca foi resolvido).
    const certoLegado: QuizState = { answered: true, selected: 2, correct: true };
    const erradoLegado: QuizState = { answered: true, selected: 0, correct: false };
    const virgemLegado: QuizState = { answered: false, selected: null, correct: null };

    assert.equal(quizCycleOf(certoLegado).stage, 'dominado');
    assert.equal(quizCycleOf(certoLegado).mastered, true);
    assert.deepEqual(quizCycleOf(certoLegado).attempts, [
      { generation: 0, selected: 2, correct: true, ts: 0 },
    ]);
    assert.equal(quizCycleOf(erradoLegado).stage, 'explicando');
    assert.equal(quizCycleOf(erradoLegado).mastered, false);
    assert.deepEqual(quizStepOf(erradoLegado), {
      kind: 'explicar-erro',
      generation: 0,
      selected: 0,
    });
    assert.equal(quizCycleOf(virgemLegado).stage, 'aguardando-resposta');
    assert.equal(quizCycleOf(undefined).stage, 'aguardando-resposta');
    assert.equal(quizCycleOf(undefined).generation, 0);
    assert.deepEqual(quizCycleOf(undefined).attempts, []);
  });

  it('visibleQuizFor devolve a assertion AUTORAL enquanto não há remediador', () => {
    const a = assertion();
    const v = visibleQuizFor(presented('s1'), a);
    assert.equal(v.assertion, a);
    assert.equal(v.generation, 0);
    assert.equal(v.quiz, undefined);
    assert.deepEqual(v.step, { kind: 'aguardar-resposta', generation: 0 });
  });
});
