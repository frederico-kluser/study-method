/**
 * tests/db/quiz-repo.test.ts — a camada de PERSISTÊNCIA do QUIZ ADAPTATIVO
 * (onda1-contrato-quiz), sobre sqlite `:memory:` como o resto de tests/db.
 *
 * A regra do produto que estes testes sustentam: o aluno só chega ao DESAFIO
 * depois de PROVAR que entendeu, e essa prova precisa SOBREVIVER ao fechamento
 * do app. Antes desta onda a resposta do quiz nem chegava ao processo main.
 *
 * O que este arquivo PROVA:
 *   1. round-trip de `recordQuizAttempt`/`listQuizAttempts` (o boolean `correct`
 *      atravessa o 0/1 do SQLite intacto);
 *   2. `attemptNo` DERIVADO pela repo (1, 2, 3…) por SEÇÃO — e o explícito,
 *      quando o chamador o informa, é respeitado;
 *   3. `quizOrigin` default 'authored' e o 'remedial' persistido;
 *   4. escopo: a leitura é por (trackSlug, lessonId) — outra aula não vaza;
 *   5. round-trip de `saveQuizRemediation`/`listQuizRemediations`, com o
 *      RemedialQuizRecord (incluindo `optionRationales`) deep-equal, e o parse
 *      DEFENSIVO de um `quiz_json` corrompido (quiz null, explicação intacta);
 *   6. `quizMasteryFor` com 0, 1 e N tentativas — o gate de maestria;
 *   7. `clearAllProgress` e `purgeTrackScopedState` levam o quiz junto (o quiz
 *      É avanço do aluno: deixá-lo faria o reset abrir o portão do desafio).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import {
  createLessonRepo,
  parseRemedialQuiz,
  type LessonRepo,
  type RecordQuizAttemptInput,
  type RemedialQuizRecord,
} from '../../electron/main/db/repo';

function makeRepo(): { repo: LessonRepo; db: DatabaseSync; close: () => void } {
  const db = new DatabaseSync(':memory:');
  const repo = createLessonRepo(() => db);
  return { repo, db, close: () => db.close() };
}

const AULA = { trackSlug: 'python', lessonId: 'imprimir-na-tela' };

function attempt(over: Partial<RecordQuizAttemptInput> = {}): RecordQuizAttemptInput {
  return {
    ...AULA,
    sectionKey: 'o-que-e-print',
    assertionId: 'print-mostra-na-tela',
    selectedIndex: 1,
    correct: false,
    ...over,
  };
}

function remedialQuiz(over: Partial<RemedialQuizRecord> = {}): RemedialQuizRecord {
  return {
    id: 'print-mostra-na-tela-r1',
    originAssertionId: 'print-mostra-na-tela',
    generation: 1,
    statement: 'print mostra na tela o que você passa entre parênteses.',
    question: 'O que aparece na tela com print("oi")?',
    options: ['oi', 'print', 'nada', 'um erro'],
    answerIndex: 0,
    feedback: 'Isso: o texto entre aspas é o que aparece.',
    sectionId: 'o-que-e-print',
    optionRationales: [
      'Certo: o texto entre aspas é exatamente o que aparece.',
      'Errado: print é o nome do comando, não o que ele mostra.',
      'Errado: print sempre mostra algo — ele existe para isso.',
      'Errado: print("oi") é uma chamada válida, não dá erro.',
    ],
    ...over,
  };
}

describe('repo — recordQuizAttempt / listQuizAttempts (v5)', () => {
  it('1. round-trip completo: o boolean `correct` atravessa o 0/1 do SQLite', async () => {
    const { repo, close } = makeRepo();
    const gravada = await repo.recordQuizAttempt(attempt({ correct: true, selectedIndex: 0 }));
    assert.equal(gravada.correct, true);
    assert.equal(gravada.selectedIndex, 0);
    assert.equal(gravada.attemptNo, 1);
    assert.equal(gravada.quizOrigin, 'authored', 'default do contrato');
    assert.ok(gravada.id.length > 0 && gravada.createdAt.length > 0);

    const lidas = await repo.listQuizAttempts(AULA);
    assert.equal(lidas.length, 1);
    assert.deepEqual(lidas[0], gravada, 'a linha lida é EXATAMENTE a gravada');
    close();
  });

  it('2. attemptNo é DERIVADO (1, 2, 3) por SEÇÃO — e o explícito é respeitado', async () => {
    const { repo, close } = makeRepo();
    const a1 = await repo.recordQuizAttempt(attempt());
    const a2 = await repo.recordQuizAttempt(attempt());
    const a3 = await repo.recordQuizAttempt(attempt({ correct: true, selectedIndex: 0 }));
    assert.deepEqual([a1.attemptNo, a2.attemptNo, a3.attemptNo], [1, 2, 3]);

    // Outra SEÇÃO da mesma aula recomeça em 1 (a unidade do gate é a seção).
    const outra = await repo.recordQuizAttempt(attempt({ sectionKey: 'aspas-e-texto' }));
    assert.equal(outra.attemptNo, 1);

    // Chamador que informa o ordinal manda nele.
    const explicita = await repo.recordQuizAttempt(attempt({ attemptNo: 42 }));
    assert.equal(explicita.attemptNo, 42);
    close();
  });

  it('3. quizOrigin remedial é persistido junto das tentativas autoradas', async () => {
    const { repo, close } = makeRepo();
    await repo.recordQuizAttempt(attempt());
    await repo.recordQuizAttempt(
      attempt({ assertionId: 'print-mostra-na-tela-r1', quizOrigin: 'remedial', correct: true, selectedIndex: 0 }),
    );
    const lidas = await repo.listQuizAttempts(AULA);
    assert.deepEqual(
      lidas.map((l) => l.quizOrigin),
      ['authored', 'remedial'],
      'as duas origens convivem na mesma aula, em ordem cronológica',
    );
    close();
  });

  it('4. a leitura é ESCOPADA por (trackSlug, lessonId) — outra aula não vaza', async () => {
    const { repo, close } = makeRepo();
    await repo.recordQuizAttempt(attempt());
    await repo.recordQuizAttempt(attempt({ lessonId: 'outra-aula' }));
    await repo.recordQuizAttempt(attempt({ trackSlug: 'outra-trilha' }));
    assert.equal((await repo.listQuizAttempts(AULA)).length, 1);
    assert.equal((await repo.listQuizAttempts({ ...AULA, lessonId: 'outra-aula' })).length, 1);
    assert.equal((await repo.listQuizAttempts({ trackSlug: 'outra-trilha', lessonId: AULA.lessonId })).length, 1);
    assert.deepEqual(await repo.listQuizAttempts({ trackSlug: 'nao-existe', lessonId: 'nada' }), []);
    close();
  });
});

describe('repo — saveQuizRemediation / listQuizRemediations (v5)', () => {
  it('5a. round-trip: a explicação e o quiz gerado voltam inteiros (deep-equal)', async () => {
    const { repo, close } = makeRepo();
    const quiz = remedialQuiz();
    const salva = await repo.saveQuizRemediation({
      ...AULA,
      sectionKey: 'o-que-e-print',
      originAssertionId: 'print-mostra-na-tela',
      generation: 1,
      explanation: 'Você marcou "print": esse é o nome do comando, não o que ele mostra.',
      quiz,
    });
    assert.ok(salva.id.length > 0);

    const lidas = await repo.listQuizRemediations(AULA);
    assert.equal(lidas.length, 1);
    assert.equal(lidas[0].explanation, salva.explanation);
    assert.equal(lidas[0].generation, 1);
    assert.deepEqual(lidas[0].quiz, quiz, 'o RemedialQuizRecord volta idêntico (optionRationales incluído)');
    close();
  });

  it('5b. quiz_json corrompido ⇒ quiz null, e a EXPLICAÇÃO continua legível', async () => {
    const { repo, db, close } = makeRepo();
    db.prepare(
      `INSERT INTO quiz_remediations
         (id, track_slug, lesson_id, section_key, origin_assertion_id, generation,
          explanation, quiz_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('rem-corrompida', AULA.trackSlug, AULA.lessonId, 'o-que-e-print', 'print-mostra-na-tela', 1,
      'A explicação sobreviveu.', '{ isto não é json', '2026-05-01T00:00:00.000Z');

    const lidas = await repo.listQuizRemediations(AULA);
    assert.equal(lidas.length, 1);
    assert.equal(lidas[0].quiz, null, 'parse defensivo: nunca lança, devolve null');
    assert.equal(lidas[0].explanation, 'A explicação sobreviveu.');
    close();
  });

  it('5c. parseRemedialQuiz rejeita shapes fora do contrato sem lançar', () => {
    assert.equal(parseRemedialQuiz(null), null);
    assert.equal(parseRemedialQuiz(''), null);
    assert.equal(parseRemedialQuiz('[]'), null);
    assert.equal(parseRemedialQuiz('{"id":"x"}'), null, 'faltam campos obrigatórios');
    const semOpcionais = JSON.stringify({ ...remedialQuiz(), sectionId: undefined, optionRationales: undefined });
    const parseado = parseRemedialQuiz(semOpcionais);
    assert.ok(parseado, 'os campos OPCIONAIS podem faltar');
    assert.equal(parseado.sectionId, undefined);
    assert.equal(parseado.optionRationales, undefined);
    // optionRationales corrompido some em vez de viajar meio quebrado.
    const rationaisRuins = JSON.stringify({ ...remedialQuiz(), optionRationales: [1, 2] });
    assert.equal(parseRemedialQuiz(rationaisRuins)?.optionRationales, undefined);
  });

  /**
   * 5d — FURO FECHADO PELA REVISÃO ADVERSARIAL desta onda.
   *
   * O 5c prova que o TIPO errado é rejeitado. O que ninguém provava era o
   * TAMANHO e a FAIXA: o revisor mediu a versão anterior de `parseRemedialQuiz`
   * e ela ACEITAVA `options.length` 0, 1, 3 e 6, e `answerIndex` -1 — ou seja,
   * um quiz com ZERO alternativas, ou apontando para fora delas, passava como
   * "válido" e chegaria ao renderer assim que o serviço de LLM começasse a
   * gravar em `quiz_json`. A regra vem das fontes de verdade a montante
   * (`validateAssertions` em content/trackTypes.ts e `AssertionDraftSchema` em
   * engine/schemas/artifacts.ts): EXATAMENTE 4 alternativas e `answerIndex`
   * inteiro em 0..3. Cada linha abaixo é uma linha da medição do revisor.
   */
  it('5d. parseRemedialQuiz exige EXATAMENTE 4 opções e answerIndex DENTRO da faixa', () => {
    // `optionRationales: undefined` isola a variável sob teste (o comprimento
    // de `options`) da coerência dos racionais, que o 5e cobre à parte.
    const comOpcoes = (n: number, answerIndex: number): string =>
      JSON.stringify({
        ...remedialQuiz(),
        optionRationales: undefined,
        options: Array.from({ length: n }, (_, i) => `alternativa ${i}`),
        answerIndex,
      });

    // O CASO FELIZ continua passando (é o contrato: 4 opções, índice na faixa).
    const feliz = parseRemedialQuiz(comOpcoes(4, 0));
    assert.ok(feliz, '4 alternativas com answerIndex 0 é o contrato');
    assert.equal(feliz.options.length, 4);
    assert.equal(feliz.answerIndex, 0);
    assert.ok(parseRemedialQuiz(comOpcoes(4, 3)), 'o ÚLTIMO índice válido (3) também passa');

    // A tabela do revisor — antes do fix, TODAS estas linhas eram ACEITAS.
    assert.equal(parseRemedialQuiz(comOpcoes(3, 1)), null, '3 opções não é o contrato');
    assert.equal(parseRemedialQuiz(comOpcoes(1, 0)), null, '1 opção não é o contrato');
    assert.equal(parseRemedialQuiz(comOpcoes(0, 0)), null, 'quiz com ZERO alternativas é inválido');
    assert.equal(parseRemedialQuiz(comOpcoes(6, 5)), null, '6 opções não é o contrato');
    assert.equal(parseRemedialQuiz(comOpcoes(3, -1)), null, 'answerIndex NEGATIVO é inválido');

    // A faixa, agora com o comprimento certo: 0..3 vale, 4 e -1 não.
    assert.equal(parseRemedialQuiz(comOpcoes(4, 4)), null, 'answerIndex == options.length está FORA');
    assert.equal(parseRemedialQuiz(comOpcoes(4, -1)), null, 'answerIndex negativo com 4 opções também');

    // E continua NUNCA lançando: nenhuma das chamadas acima levantou exceção.
  });

  it('5e. optionRationales precisa ser COERENTE com options (0 = ausência, 4 = um por opção)', () => {
    const comRacionais = (optionRationales: unknown): ReturnType<typeof parseRemedialQuiz> =>
      parseRemedialQuiz(JSON.stringify({ ...remedialQuiz(), optionRationales }));

    // 4 racionais para 4 opções: o campo preenchido de verdade sobrevive.
    const cheio = comRacionais(['a', 'b', 'c', 'd']);
    assert.deepEqual(cheio?.optionRationales, ['a', 'b', 'c', 'd']);

    // `[]` é a AUSÊNCIA EXPLÍCITA que o AssertionDraftSchema materializa.
    assert.deepEqual(comRacionais([])?.optionRationales, []);

    // Comprimento intermediário é meia-declaração — o CAMPO some, o quiz fica
    // (mesmo comportamento do array corrompido, provado no 5c).
    const meia = comRacionais(['a', 'b']);
    assert.ok(meia, 'o quiz sobrevive: só o campo incoerente some');
    assert.equal(meia.optionRationales, undefined, '2 racionais para 4 opções é meia-declaração');
    assert.equal(comRacionais(['a', 'b', 'c', 'd', 'e'])?.optionRationales, undefined, '5 > 4 opções');
  });
});

describe('repo — quizMasteryFor (o GATE do desafio)', () => {
  it('6a. ZERO tentativas: nenhuma seção na lista (nada respondido, nada provado)', async () => {
    const { repo, close } = makeRepo();
    assert.deepEqual(await repo.quizMasteryFor(AULA), []);
    close();
  });

  it('6b. UMA tentativa ERRADA: a seção aparece, mas mastered=false', async () => {
    const { repo, close } = makeRepo();
    await repo.recordQuizAttempt(attempt({ correct: false }));
    const mastery = await repo.quizMasteryFor(AULA);
    assert.equal(mastery.length, 1);
    assert.equal(mastery[0].sectionKey, 'o-que-e-print');
    assert.equal(mastery[0].mastered, false, 'errar não prova nada — o desafio continua fechado');
    assert.equal(mastery[0].attemptCount, 1);
    assert.equal(mastery[0].correctCount, 0);
    assert.equal(mastery[0].firstCorrectAt, null);
    assert.ok(mastery[0].lastAttemptAt);
    close();
  });

  it('6c. N tentativas: erra, erra, ACERTA ⇒ mastered=true (errar não trava, nunca acertar trava)', async () => {
    const { repo, close } = makeRepo();
    await repo.recordQuizAttempt(attempt({ correct: false }));
    await repo.recordQuizAttempt(
      attempt({ correct: false, quizOrigin: 'remedial', assertionId: 'print-mostra-na-tela-r1' }),
    );
    const acerto = await repo.recordQuizAttempt(
      attempt({ correct: true, selectedIndex: 0, quizOrigin: 'remedial', assertionId: 'print-mostra-na-tela-r2' }),
    );

    // Uma SEGUNDA seção da mesma aula, ainda sem acerto: o gate da aula
    // inteira só fecha quando TODAS as seções respondidas estiverem provadas —
    // a repo entrega o material, quem decide é o gate.
    await repo.recordQuizAttempt(attempt({ sectionKey: 'aspas-e-texto', correct: false }));

    const mastery = await repo.quizMasteryFor(AULA);
    assert.equal(mastery.length, 2);
    assert.deepEqual(
      mastery.map((m) => m.sectionKey),
      ['aspas-e-texto', 'o-que-e-print'],
      'ordenado por sectionKey (determinístico)',
    );
    const print = mastery.find((m) => m.sectionKey === 'o-que-e-print')!;
    assert.equal(print.mastered, true);
    assert.equal(print.attemptCount, 3);
    assert.equal(print.correctCount, 1);
    assert.equal(print.firstCorrectAt, acerto.createdAt);
    const aspas = mastery.find((m) => m.sectionKey === 'aspas-e-texto')!;
    assert.equal(aspas.mastered, false);
    assert.equal(aspas.attemptCount, 1);

    // Escopo: outra aula não herda maestria nenhuma.
    assert.deepEqual(await repo.quizMasteryFor({ ...AULA, lessonId: 'outra-aula' }), []);
    close();
  });
});

describe('repo — o quiz é AVANÇO: sai no reset e na remoção do slug', () => {
  it('7a. clearAllProgress apaga tentativas e remediações', async () => {
    const { repo, close } = makeRepo();
    await repo.recordQuizAttempt(attempt({ correct: true }));
    await repo.saveQuizRemediation({
      ...AULA,
      sectionKey: 'o-que-e-print',
      originAssertionId: 'print-mostra-na-tela',
      generation: 1,
      explanation: 'exp',
      quiz: remedialQuiz(),
    });
    await repo.clearAllProgress();
    assert.deepEqual(await repo.listQuizAttempts(AULA), []);
    assert.deepEqual(await repo.listQuizRemediations(AULA), []);
    assert.deepEqual(await repo.quizMasteryFor(AULA), [], 'o portão do desafio volta a ficar fechado');
    close();
  });

  it('7b. purgeTrackScopedState leva o quiz do slug junto (e só o daquele slug)', async () => {
    const { repo, close } = makeRepo();
    await repo.recordQuizAttempt(attempt({ correct: true }));
    await repo.saveQuizRemediation({
      ...AULA,
      sectionKey: 'o-que-e-print',
      originAssertionId: 'print-mostra-na-tela',
      generation: 1,
      explanation: 'exp',
      quiz: remedialQuiz(),
    });
    await repo.recordQuizAttempt(attempt({ trackSlug: 'outra-trilha', correct: true }));
    // O slug precisa EXISTIR no estado por slug para o purge não ser no-op.
    await repo.markTrackLessonDone(AULA.trackSlug, AULA.lessonId);

    const removido = await repo.purgeTrackScopedState(AULA.trackSlug);
    assert.ok(removido, 'o slug tinha estado a remover');
    assert.deepEqual(await repo.listQuizAttempts(AULA), []);
    assert.deepEqual(await repo.listQuizRemediations(AULA), []);
    assert.equal(
      (await repo.listQuizAttempts({ trackSlug: 'outra-trilha', lessonId: AULA.lessonId })).length,
      1,
      'a outra trilha fica INTACTA',
    );
    close();
  });
});
