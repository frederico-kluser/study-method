/**
 * tests/quizHistoryHydration.test.ts — ONDA3-PERSISTENCIA: o ciclo do quiz
 * deixa de morrer quando o app FECHA.
 *
 * O DEFEITO, medido e declarado pela onda anterior: o banco (tabelas
 * `quiz_attempts`/`quiz_remediations`, migração v5), a repo, os quatro canais
 * de `track:quiz-*` e a UI inteira do ciclo estavam prontos — e o canal
 * `track:quiz-history` NUNCA era chamado. A maestria sobrevivia à troca de aba
 * (o `lessonChatCache` é um Map em memória de módulo) e morria no fechamento
 * do processo: o aluno que dominou três quizzes reabria a aula com tudo por
 * responder, e o gate de maestria o travava de novo em algo que ele já tinha
 * provado.
 *
 * O QUE ESTA SUÍTE TRAVA:
 *   1. o REDUTOR `hydrateQuizFromHistory` inteiro — sem tentativa, só acerto,
 *      erro sem remediação, ciclo completo com N gerações, linha corrompida,
 *      remediação órfã;
 *   2. a regra de MAESTRIA valendo retroativamente: um erro pendurado reabre
 *      em 'explicando', NUNCA em 'dominado' — nada de maestria por decurso de
 *      prazo;
 *   3. a PRECEDÊNCIA entre o cache de sessão e o banco: a sessão vence chave a
 *      chave, o banco só PREENCHE o que falta (a resposta desta sessão pode
 *      ainda não ter sido persistida — `track:quiz-attempt` é best-effort);
 *   4. o CONTEÚDO QUE MUDOU desde a última sessão: chave órfã é inerte
 *      (não bloqueia nem libera), e uma afirmação que trocou de seção troca de
 *      chave — o aluno responde de novo, e nenhuma maestria é emprestada;
 *   5. o INVARIANTE SAGRADO herdado: uma geração RESTAURADA e ainda não
 *      respondida continua neutra, com `answerIndex` intocado (getter espião);
 *   6. a prova ponta a ponta na aula REAL `a-primeira-linha`: o aluno domina
 *      os três quizzes, o app FECHA (estado zerado), o histórico volta do
 *      banco e o gate abre sem ele responder nada;
 *   7. GUARDA DE FONTE da `LessonView`: o canal é chamado no CARREGAMENTO da
 *      aula (uma vez), nunca atrás do `quizAttempt`, e o fail-closed dos dois
 *      ramos (`{ok:false}` e `catch`) existe.
 *
 * POR QUE A GUARDA DO ITEM 7 É TEXTUAL. `LessonView` é um componente React e
 * este repositório NÃO usa jsdom — não há como montá-lo num `node:test` para
 * observar o invoke. É a MESMA razão (e a MESMA técnica) dos precedentes
 * `tests/lessonQuizVisual.test.ts` ("o JSX do card não vê answerIndex") e
 * `tests/lessonQuizKeyCoherence.test.ts`: lê-se o arquivo como TEXTO, removem-
 * se os comentários e reprova-se o CÓDIGO que roda. A lógica em si (itens 1–6)
 * é exercitada de verdade, na máquina pura.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import en from '../src/i18n/locales/en/translation.json';
import {
  applyTutorReply,
  createTrackLessonState,
  hydrateQuizFromHistory,
  isNextSectionBlockedByQuiz,
  isQuizMastered,
  lessonFinishBlock,
  nextQuizStep,
  optionVisualStateForGeneration,
  pendingQuizzes,
  quizCycleFor,
  quizKeyFor,
  remediationAssertionId,
  submitQuizAnswer,
  visibleQuizFor,
  type TrackLessonUiState,
} from '../src/lib/trackLessonState';
import type {
  QuizAttemptDto,
  QuizRemediationDto,
  RemedialQuizDto,
  TrackAssertionDto,
  TrackVerdict,
  TutorReply,
} from '../shared/ipc-contract';

const HERE = dirname(fileURLToPath(import.meta.url));

const TRACK = 'python';
const LESSON = 'a-primeira-linha';

function assertion(over: Partial<TrackAssertionDto> = {}): TrackAssertionDto {
  return {
    id: 'a1',
    statement: 'print mostra texto na tela.',
    question: 'O que os parênteses fazem?',
    options: ['Nada', 'Somam números', 'Seguram o que vai ser mostrado', 'Fecham o programa'],
    answerIndex: 2,
    feedback: 'Os parênteses seguram o que vai ser mostrado.',
    sectionId: 's1',
    ...over,
  };
}

/** Uma linha de `quiz_attempts` como o canal `track:quiz-history` a entrega. */
function attempt(over: Partial<QuizAttemptDto> = {}): QuizAttemptDto {
  return {
    trackSlug: TRACK,
    lessonId: LESSON,
    sectionKey: 's1::a1',
    assertionId: 'a1',
    selectedIndex: 0,
    correct: false,
    attemptNo: 1,
    quizOrigin: 'authored',
    createdAt: '2026-01-01T00:00:01.000Z',
    ...over,
  };
}

/** O quiz remediador PERSISTIDO (a id é a que o SERVIÇO gerou — quem reescreve
 *  para a determinística `<chave>#g<N>` é o estado). */
function remedialQuiz(over: Partial<RemedialQuizDto> = {}): RemedialQuizDto {
  return {
    id: 'gerado-pela-ia-xyz',
    statement: 'print mostra texto na tela (verificação).',
    question: 'O que aparece na tela ao rodar print("oi")?',
    options: ['nada', 'oi', 'print', 'erro'],
    answerIndex: 1,
    feedback: 'A linha mostra o texto que está entre as aspas.',
    sectionId: 's1',
    originAssertionId: 'a1',
    generation: 1,
    ...over,
  };
}

/** Uma linha de `quiz_remediations` (o par explicação + quiz que o aluno viu). */
function remediation(over: Partial<QuizRemediationDto> = {}): QuizRemediationDto {
  return {
    id: 'r1',
    trackSlug: TRACK,
    lessonId: LESSON,
    sectionKey: 's1::a1',
    originAssertionId: 'a1',
    generation: 1,
    explanation: '## Onde essa alternativa se separa do que a seção mostra\n\nA opção 1 não…',
    quiz: remedialQuiz(),
    createdAt: '2026-01-01T00:00:02.000Z',
    ...over,
  };
}

/** Estado com a seção 's1' já apresentada (o quiz dela fica VISÍVEL ao gate). */
function presented(...sections: string[]): TrackLessonUiState {
  let s = createTrackLessonState();
  for (const id of sections) {
    const reply: TutorReply = { ok: true, message: `teoria de ${id}`, sectionId: id, done: false };
    s = applyTutorReply(s, reply, 1_000);
  }
  return s;
}

describe('ONDA3-PERSISTENCIA — o redutor reconstrói o ciclo a partir do banco', () => {
  it('SEM TENTATIVA: o estado volta INTACTO, na mesma referência (nada a hidratar)', () => {
    const antes = presented('s1');
    const depois = hydrateQuizFromHistory(antes, [], []);
    assert.equal(depois, antes, 'sem histórico não há re-render — mesma referência');
    assert.deepEqual(depois.quizBySection, {}, 'uma seção sem tentativa NÃO aparece');
  });

  it('SÓ ACERTO: a chave volta DOMINADA e o gate abre sem o aluno responder nada', () => {
    const a = assertion();
    const key = quizKeyFor(a);
    assert.equal(key, 's1::a1', 'a chave canônica é sectionId + assertionId');
    const st = hydrateQuizFromHistory(
      presented('s1'),
      [attempt({ sectionKey: key, selectedIndex: 2, correct: true })],
      [],
    );
    assert.equal(isQuizMastered(st, key), true, 'o acerto gravado É a maestria');
    assert.deepEqual(pendingQuizzes(st, [a]), [], 'nada pendente');
    assert.equal(isNextSectionBlockedByQuiz(st, [a]), false, '"Próximo" liberado');
    const cycle = quizCycleFor(st, key);
    assert.equal(cycle.stage, 'dominado');
    assert.equal(cycle.generation, 0, 'o acerto foi no quiz AUTORAL');
    assert.equal(cycle.attempts.length, 1);
    assert.deepEqual(cycle.attempts[0], {
      generation: 0,
      selected: 2,
      correct: true,
      ts: Date.parse('2026-01-01T00:00:01.000Z'),
    });
  });

  it('ERRO SEM REMEDIAÇÃO: reabre no CICLO ("explicando"), nunca em "dominado"', () => {
    const a = assertion();
    const key = quizKeyFor(a);
    const st = hydrateQuizFromHistory(
      presented('s1'),
      [attempt({ sectionKey: key, selectedIndex: 3, correct: false })],
      [],
    );
    const cycle = quizCycleFor(st, key);
    assert.equal(cycle.stage, 'explicando', 'o erro nunca resolvido REABRE o ciclo');
    assert.equal(cycle.mastered, false, 'maestria por decurso de prazo não existe');
    assert.equal(cycle.generation, 0);
    assert.equal(cycle.explanation, null, 'nenhuma explicação foi lida ainda');
    assert.equal(cycle.remediation, null);
    // A view retoma exatamente o passo que faltava.
    assert.deepEqual(nextQuizStep(st, key), {
      kind: 'explicar-erro',
      generation: 0,
      selected: 3,
    });
    assert.deepEqual(pendingQuizzes(st, [a]).map((x) => x.id), ['a1'], 'o gate continua fechado');
  });

  it('ERRO + REMEDIAÇÃO PERSISTIDA: o card volta ZERADO na geração seguinte', () => {
    const a = assertion();
    const key = quizKeyFor(a);
    const r = remediation({ sectionKey: key, generation: 1 });
    const st = hydrateQuizFromHistory(
      presented('s1'),
      [attempt({ sectionKey: key, selectedIndex: 3, correct: false })],
      [r],
    );
    const cycle = quizCycleFor(st, key);
    assert.equal(cycle.stage, 'aguardando-resposta', 'o ciclo já tinha AVANÇADO antes de fechar');
    assert.equal(cycle.generation, 1);
    assert.equal(cycle.answeredThisGeneration, false, 'a geração nova está por responder');
    assert.equal(cycle.explanation, r.explanation, 'a explicação lida volta com o ciclo');
    assert.equal(
      cycle.remediation?.id,
      remediationAssertionId(key, 1),
      'a id volta a ser a DETERMINÍSTICA do estado, não a que o serviço gerou',
    );
    assert.equal(cycle.remediation?.question, r.quiz?.question, 'o conteúdo é o do banco');
    // E a ida e volta continua fechando na MESMA chave (o ciclo não se divide).
    assert.equal(quizKeyFor(cycle.remediation as TrackAssertionDto), key);
    const visible = visibleQuizFor(st, a);
    assert.equal(visible.key, key);
    assert.equal(visible.assertion.id, remediationAssertionId(key, 1), 'a tela mostra o remediador');
    assert.deepEqual(visible.step, { kind: 'aguardar-resposta', generation: 1 });
    assert.equal(isQuizMastered(st, key), false, 'o gate segue fechado até o acerto');
  });

  it('CICLO COMPLETO com N gerações: dois erros, a remediação de cada um, e o acerto na g2', () => {
    const a = assertion();
    const key = quizKeyFor(a);
    const st = hydrateQuizFromHistory(
      presented('s1'),
      [
        attempt({ sectionKey: key, assertionId: 'a1', selectedIndex: 3, correct: false, attemptNo: 1 }),
        attempt({
          sectionKey: key,
          assertionId: remediationAssertionId(key, 1),
          selectedIndex: 0,
          correct: false,
          attemptNo: 2,
          quizOrigin: 'remedial',
          createdAt: '2026-01-01T00:00:03.000Z',
        }),
        attempt({
          sectionKey: key,
          assertionId: remediationAssertionId(key, 2),
          selectedIndex: 2,
          correct: true,
          attemptNo: 3,
          quizOrigin: 'remedial',
          createdAt: '2026-01-01T00:00:05.000Z',
        }),
      ],
      [
        remediation({ id: 'r1', sectionKey: key, generation: 1 }),
        remediation({
          id: 'r2',
          sectionKey: key,
          generation: 2,
          explanation: 'a segunda explicação',
          quiz: remedialQuiz({ id: 'ia-2', generation: 2, question: 'terceira pergunta' }),
          createdAt: '2026-01-01T00:00:04.000Z',
        }),
      ],
    );
    const cycle = quizCycleFor(st, key);
    assert.equal(cycle.stage, 'dominado', 'o acerto FECHA a chave');
    assert.equal(cycle.generation, 2, 'a geração é a do ACERTO');
    assert.equal(cycle.explanation, 'a segunda explicação', 'a última explicação lida');
    assert.equal(cycle.remediation?.question, 'terceira pergunta');
    assert.equal(cycle.remediation?.id, remediationAssertionId(key, 2));
    assert.deepEqual(
      cycle.attempts.map((x) => [x.generation, x.selected, x.correct]),
      [
        [0, 3, false],
        [1, 0, false],
        [2, 2, true],
      ],
      'a GERAÇÃO de cada tentativa é lida da id (o banco não a guarda)',
    );
    assert.equal(isQuizMastered(st, key), true);
    // O card de CADA geração continua mostrando o próprio feedback.
    assert.equal(optionVisualStateForGeneration(3, a, st.quizBySection[key], 0).icon, 'wrong');
    assert.equal(optionVisualStateForGeneration(0, a, st.quizBySection[key], 1).icon, 'wrong');
  });

  it('REMEDIAÇÃO COM QUIZ ILEGÍVEL (quiz: null): falta só o quiz novo, não a explicação', () => {
    const key = 's1::a1';
    const st = hydrateQuizFromHistory(
      presented('s1'),
      [attempt({ sectionKey: key, selectedIndex: 3, correct: false })],
      [remediation({ sectionKey: key, generation: 1, quiz: null, explanation: 'o que ela lê' })],
    );
    const cycle = quizCycleFor(st, key);
    assert.equal(cycle.stage, 'novo-quiz-pendente', 'a explicação JÁ foi lida — não se cobra duas vezes');
    assert.equal(cycle.generation, 0, 'a geração corrente ainda é a do erro');
    assert.equal(cycle.explanation, 'o que ela lê');
    assert.deepEqual(nextQuizStep(st, key), { kind: 'gerar-novo-quiz', generation: 0 });
  });

  it('REMEDIAÇÃO ÓRFÃ (sem tentativa gravada) é ignorada: a chave nem existe', () => {
    const st = hydrateQuizFromHistory(presented('s1'), [], [remediation()]);
    assert.deepEqual(st.quizBySection, {}, 'a tentativa é a ORIGEM da chave');
    assert.equal(quizCycleFor(st, 's1::a1').stage, 'aguardando-resposta');
    assert.equal(isQuizMastered(st, 's1::a1'), false);
  });

  it('LINHA CORROMPIDA é descartada, e não derruba o resto do histórico', () => {
    const st = hydrateQuizFromHistory(
      presented('s1'),
      [
        attempt({ sectionKey: '', selectedIndex: 1, correct: true }),
        attempt({ sectionKey: 's1::a1', assertionId: '', selectedIndex: 1, correct: true }),
        attempt({ sectionKey: 's1::a1', selectedIndex: -1, correct: true }),
        attempt({ sectionKey: 's1::a2', selectedIndex: 1, correct: true, createdAt: 'nem-data-é' }),
      ],
      [],
    );
    assert.deepEqual(Object.keys(st.quizBySection), ['s1::a2'], 'só a linha íntegra virou estado');
    assert.equal(quizCycleFor(st, 's1::a2').attempts[0].ts, 0, 'data ilegível vira ts 0 (informativo)');
    assert.equal(isQuizMastered(st, 's1::a1'), false, 'linha corrompida NÃO vira maestria');
  });

  it('o redutor mexe SÓ em quizBySection — a conversa não recebe bolhas antigas', () => {
    const antes = presented('s1', 's2');
    const depois = hydrateQuizFromHistory(
      antes,
      [attempt({ sectionKey: 's1::a1', selectedIndex: 3, correct: false })],
      [remediation({ sectionKey: 's1::a1' })],
    );
    assert.equal(depois.history, antes.history, 'o histórico do chat é artefato de SESSÃO');
    assert.equal(depois.presentedSections, antes.presentedSections);
    assert.equal(depois.theoryDone, antes.theoryDone);
    assert.equal(depois.challengeError, antes.challengeError);
    assert.equal(depois.lastError, antes.lastError);
  });
});

describe('ONDA3-PERSISTENCIA — a PRECEDÊNCIA: a sessão vence, o banco preenche', () => {
  it('a resposta DESTA SESSÃO não é sobrescrita pelo banco (a gravação pode ter falhado)', () => {
    const a = assertion();
    const key = quizKeyFor(a);
    // Nesta sessão o aluno ACERTOU; `track:quiz-attempt` é best-effort e pode
    // não ter chegado ao disco — o banco só conhece o erro de ontem.
    const sessao = submitQuizAnswer(presented('s1'), key, a.answerIndex, a.answerIndex, 5_000);
    const st = hydrateQuizFromHistory(
      sessao,
      [attempt({ sectionKey: key, selectedIndex: 3, correct: false })],
      [],
    );
    assert.equal(st, sessao, 'nada a preencher: a chave já é da sessão — mesma referência');
    assert.equal(isQuizMastered(st, key), true, 'o acerto de agora NÃO é reaberto pelo erro de ontem');
    assert.equal(quizCycleFor(st, key).attempts.length, 1, 'as tentativas da sessão ficam como estão');
  });

  it('o banco PREENCHE as chaves que a sessão nunca tocou (união, sessão vence o empate)', () => {
    const a1 = assertion({ id: 'a1' });
    const a2 = assertion({ id: 'a2' });
    const k1 = quizKeyFor(a1);
    const k2 = quizKeyFor(a2);
    const sessao = submitQuizAnswer(presented('s1'), k1, 3, a1.answerIndex, 5_000);
    const st = hydrateQuizFromHistory(
      sessao,
      [
        attempt({ sectionKey: k1, selectedIndex: a1.answerIndex, correct: true }),
        attempt({ sectionKey: k2, selectedIndex: a2.answerIndex, correct: true }),
      ],
      [],
    );
    assert.deepEqual(Object.keys(st.quizBySection).sort(), [k1, k2].sort());
    assert.equal(st.quizBySection[k1], sessao.quizBySection[k1], 'a chave da sessão é a MESMA (intocada)');
    assert.equal(isQuizMastered(st, k1), false, 'o erro DESTA sessão vale: o banco não o apaga');
    assert.equal(isQuizMastered(st, k2), true, 'a chave que a sessão não tem vem do banco');
  });

  it('hidratar DUAS vezes é idempotente (o retry do carregamento não desfaz nada)', () => {
    const a = assertion();
    const key = quizKeyFor(a);
    const linhas = [attempt({ sectionKey: key, selectedIndex: 2, correct: true })];
    const um = hydrateQuizFromHistory(presented('s1'), linhas, []);
    const dois = hydrateQuizFromHistory(um, linhas, []);
    assert.equal(dois, um, 'a segunda passada não tem o que preencher — mesma referência');
  });
});

describe('ONDA3-PERSISTENCIA — o conteúdo MUDOU desde a última sessão', () => {
  it('chave ÓRFÃ (a afirmação sumiu da aula) é INERTE: não bloqueia e não libera', () => {
    const viva = assertion({ id: 'viva' });
    const st = hydrateQuizFromHistory(
      presented('s1'),
      [
        attempt({ sectionKey: 's1::apagada', selectedIndex: 1, correct: true }),
        attempt({ sectionKey: 's1::tambem-apagada', selectedIndex: 1, correct: false }),
      ],
      [],
    );
    // O estado guarda as chaves órfãs (o redutor não conhece o conteúdo da
    // aula), e o GATE simplesmente não as enxerga — ele parte das assertions
    // que a aula tem HOJE.
    assert.deepEqual(
      pendingQuizzes(st, [viva]).map((x) => x.id),
      ['viva'],
      'o quiz vivo continua pendente: a maestria órfã não vaza para ele',
    );
    assert.equal(isNextSectionBlockedByQuiz(st, [viva]), true, 'o erro órfão também não trava nada');
    assert.equal(
      lessonFinishBlock([{ lastVerdict: 'passed' as TrackVerdict }], pendingQuizzes(st, [viva]).length),
      'quiz',
      'quem decide o bloqueio é a aula de hoje',
    );
  });

  it('a afirmação MUDOU DE SEÇÃO: a chave muda, e a maestria antiga NÃO é emprestada', () => {
    const antesDaEdicao = assertion({ id: 'a1', sectionId: 's1' });
    const depoisDaEdicao = assertion({ id: 'a1', sectionId: 's2' });
    const st = hydrateQuizFromHistory(
      presented('s2'),
      [attempt({ sectionKey: quizKeyFor(antesDaEdicao), selectedIndex: 2, correct: true })],
      [],
    );
    assert.equal(isQuizMastered(st, quizKeyFor(depoisDaEdicao)), false);
    assert.deepEqual(
      pendingQuizzes(st, [depoisDaEdicao]).map((x) => x.id),
      ['a1'],
      'a afirmação reancorada é uma pergunta NOVA — o aluno a responde de novo',
    );
  });
});

describe('ONDA3-PERSISTENCIA — o INVARIANTE SAGRADO atravessa a restauração', () => {
  /** Assertion cujo `answerIndex` REGISTRA cada leitura (getter espião — o
   *  mesmo de tests/quizMasteryCycle.test.ts). */
  function spy(): { assertion: { readonly answerIndex: number }; reads: () => number } {
    let reads = 0;
    return {
      assertion: {
        get answerIndex(): number {
          reads += 1;
          return 1;
        },
      },
      reads: () => reads,
    };
  }

  it('a geração RESTAURADA e ainda não respondida é neutra, sem ler answerIndex', () => {
    const key = 's1::a1';
    const st = hydrateQuizFromHistory(
      presented('s1'),
      [attempt({ sectionKey: key, selectedIndex: 3, correct: false })],
      [remediation({ sectionKey: key, generation: 1 })],
    );
    const quiz = st.quizBySection[key];
    const s = spy();
    for (const i of [0, 1, 2, 3]) optionVisualStateForGeneration(i, s.assertion, quiz, 1);
    assert.equal(s.reads(), 0, 'a geração 1 voltou do banco por responder — nada é lido');
    for (const i of [0, 1, 2, 3]) {
      assert.deepEqual(optionVisualStateForGeneration(i, { answerIndex: 1 }, quiz, 1), {
        color: 'inherit',
        variant: 'outlined',
        icon: null,
        disabled: false,
      });
    }
  });
});

describe('ONDA3-PERSISTENCIA — a aula REAL: o app fecha e o gate continua aberto', () => {
  const LESSON_PATH = resolve(
    HERE,
    '../resources/tracks/python/modules/a-tela/lessons/a-primeira-linha/lesson.json',
  );
  interface RealLesson {
    theory: { id: string; title: string; markdown: string }[];
    assertions: TrackAssertionDto[];
  }
  const real = JSON.parse(readFileSync(LESSON_PATH, 'utf8')) as RealLesson;

  /** O tutor apresenta TODA a teoria (uma bolha por seção, como o 'next'). */
  function comTeoriaApresentada(): TrackLessonUiState {
    return presented(...real.theory.map((s) => s.id));
  }

  it('as três afirmações dominadas ontem voltam dominadas hoje (e o "Concluir aula" abre)', () => {
    // ONTEM: o aluno acertou os três quizzes. É isto que o banco guarda —
    // `sectionKey` é a chave canônica que a view grava (`visible.key`).
    const linhas: QuizAttemptDto[] = real.assertions.map((a, i) =>
      attempt({
        sectionKey: quizKeyFor(a),
        assertionId: a.id,
        selectedIndex: a.answerIndex,
        correct: true,
        attemptNo: 1,
        createdAt: `2026-01-01T00:00:0${i + 1}.000Z`,
      }),
    );
    // HOJE: o app foi FECHADO — o cache de sessão morreu com o processo e o
    // chat recomeça vazio, com a teoria reapresentada da seção 1.
    const hoje = hydrateQuizFromHistory(comTeoriaApresentada(), linhas, []);
    assert.deepEqual(pendingQuizzes(hoje, real.assertions), [], 'nada por responder');
    assert.equal(isNextSectionBlockedByQuiz(hoje, real.assertions), false, '"Próximo" liberado');
    assert.equal(
      lessonFinishBlock([{ lastVerdict: 'passed' as TrackVerdict }], 0),
      null,
      '"Concluir aula" liberado',
    );
    for (const a of real.assertions) assert.equal(isQuizMastered(hoje, quizKeyFor(a)), true);
  });

  it('SEM a hidratação (o defeito desta onda), as mesmas três voltam TODAS pendentes', () => {
    const semHistorico = comTeoriaApresentada();
    assert.deepEqual(
      pendingQuizzes(semHistorico, real.assertions).map((a) => a.id),
      real.assertions.map((a) => a.id),
      'era este o defeito: o aluno provava de novo o que já tinha provado',
    );
  });

  it('quem errou ontem e não voltou reabre no CICLO, não no gate aberto', () => {
    const alvo = real.assertions[0];
    const key = quizKeyFor(alvo);
    const errado = (alvo.answerIndex + 1) % alvo.options.length;
    const hoje = hydrateQuizFromHistory(comTeoriaApresentada(), [
      attempt({ sectionKey: key, assertionId: alvo.id, selectedIndex: errado, correct: false }),
    ], []);
    assert.equal(quizCycleFor(hoje, key).stage, 'explicando');
    assert.equal(isQuizMastered(hoje, key), false);
    assert.deepEqual(nextQuizStep(hoje, key), {
      kind: 'explicar-erro',
      generation: 0,
      selected: errado,
    });
  });
});

describe('ONDA3-PERSISTENCIA — guarda de FONTE: a view lê o histórico no CARREGAMENTO', () => {
  const VIEW_SRC = readFileSync(resolve(HERE, '../src/views/LessonView/LessonView.tsx'), 'utf8');
  /** Fonte sem comentários (só o código que roda) — a técnica dos precedentes. */
  const VIEW = VIEW_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const ocorrencias = (texto: string, agulha: string): number => texto.split(agulha).length - 1;

  it('o canal é chamado — UMA vez — e dentro do loadLesson', () => {
    assert.equal(
      ocorrencias(VIEW, 'track.quizHistory('),
      1,
      'o histórico é lido num ponto só: o carregamento da aula',
    );
    const inicio = VIEW.indexOf('const loadLesson');
    const fim = VIEW.indexOf('const handleQuizAnswer');
    assert.ok(inicio >= 0 && fim > inicio, 'os dois marcadores existem, nesta ordem');
    assert.ok(
      VIEW.slice(inicio, fim).includes('track.quizHistory('),
      'a leitura mora no caminho de CARREGAMENTO da aula',
    );
  });

  it('o resultado passa pelo redutor PURO (a view não reconstrói ciclo nenhum)', () => {
    assert.match(
      VIEW_SRC,
      /import\s*\{[\s\S]*?\bhydrateQuizFromHistory\b[\s\S]*?\}\s*from\s*'\.\.\/\.\.\/lib\/trackLessonState'/,
      'o redutor precisa vir de trackLessonState',
    );
    assert.ok(
      VIEW.includes('hydrateQuizFromHistory(st, res.attempts, res.remediations)'),
      'as duas listas do contrato vão inteiras para o redutor',
    );
    assert.ok(
      VIEW.includes('setChat((st) => hydrateQuizFromHistory('),
      'a forma FUNCIONAL do setChat é o que garante ver o estado mais novo (o cache de sessão)',
    );
    assert.ok(
      !VIEW.includes("stage: 'dominado'"),
      'a view não decide estágio de ciclo na mão — quem reconstrói é o redutor puro',
    );
  });

  it('FAIL-CLOSED nos DOIS ramos: {ok:false} e canal mudo viram o MESMO aviso', () => {
    assert.ok(VIEW.includes("kind: 'historico-indisponivel'"), 'o aviso existe');
    assert.equal(
      ocorrencias(VIEW, "kind: 'historico-indisponivel'"),
      2,
      'um ramo para {ok:false} e outro para o catch (timeout/canal mudo)',
    );
    assert.ok(
      VIEW.includes('if (res.ok === false) {'),
      'o resultado é checado antes de virar estado',
    );
    assert.match(
      VIEW,
      /withTimeout\(\s*getApi\(\)\.track\.quizHistory\([^)]*\),\s*IPC_TIMEOUT_MS,/,
      'o invoke tem timeout: nada de spinner eterno esperando o banco',
    );
  });

  it('o histórico que chega TARDE não hidrata o chat de OUTRA aula', () => {
    // O chip de pré-requisito troca de aula sem cancelar o carregamento
    // anterior (`openPrerequisite` descarta o cancelador de `loadLesson`): sem
    // esta guarda, o histórico da aula ANTIGA cairia no chat da aula NOVA.
    assert.ok(
      VIEW.includes('loadTargetRef.current = { trackSlug, lessonId };'),
      'o alvo do carregamento é marcado de forma SÍNCRONA',
    );
    assert.equal(
      ocorrencias(VIEW, "alvo.trackSlug !== trackSlug || alvo.lessonId !== lessonId) return;"),
      2,
      'os dois desfechos do histórico (hidratar e avisar) checam o alvo',
    );
  });

  it('o aviso do histórico não se disfarça de aviso do ciclo do quiz', () => {
    assert.ok(
      VIEW.includes("const QUIZ_HISTORY_NOTICE_TAG = 'historico-da-aula'"),
      'a etiqueta é própria e constante',
    );
    assert.ok(
      !VIEW.includes("quizCycleTag(QUIZ_HISTORY_NOTICE_TAG"),
      'a falha é da AULA, não de uma volta do ciclo',
    );
  });

  it('a chave i18n do aviso existe, não vazia, nos dois idiomas', () => {
    const bloco = (raiz: unknown): Record<string, unknown> =>
      (raiz as { lesson: Record<string, unknown> }).lesson;
    for (const [nome, dict] of [['pt-BR', bloco(ptBR)], ['en', bloco(en)]] as const) {
      const v = dict['quizHistoryUnavailable'];
      assert.equal(typeof v, 'string', `${nome} sem lesson.quizHistoryUnavailable`);
      assert.notEqual(v, '', `${nome} com lesson.quizHistoryUnavailable vazia`);
    }
  });
});
