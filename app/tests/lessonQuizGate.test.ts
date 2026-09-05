/**
 * tests/lessonQuizGate.test.ts — ONDA10, DEFEITO 2: o quiz PODIA SER IGNORADO.
 *
 * O QUE O CÓDIGO ANTIGO FAZIA: `isLessonFinishBlocked` só olhava o veredito
 * dos DESAFIOS —
 *
 *     return challenges.length > 0 && challenges.some((c) => c.lastVerdict !== 'passed');
 *
 * — e a LessonView renderizava o card do quiz como REFORÇO ("NUNCA bloqueia o
 * Próximo"). Com todos os desafios passados e NENHUM quiz respondido, o botão
 * "Concluir aula" ficava LIBERADO: dava para terminar a aula sem responder
 * nada. O dono: "quero que o usuario tenha que responder".
 *
 * O QUE ESTA SUÍTE TRAVA:
 *   1. quiz visível sem resposta BLOQUEIA o "Concluir aula" mesmo com todos os
 *      desafios passados — este é o teste que REPROVA o código antigo por
 *      ASSERÇÃO (a função antiga ignora o 2º argumento e devolve `false`);
 *   2. o motivo do bloqueio é EXPLÍCITO (`lessonFinishBlock` → 'quiz' |
 *      'challenges' | null) — a UI tem o que DIZER, nunca um botão mudo;
 *   3. ERRAR NÃO LIBERA (ONDA1-MAESTRIA — ver abaixo): o gate lê MAESTRIA
 *      (houve acerto), nunca a mera resposta; errar abre o ciclo de
 *      remediação e o bloqueio permanece até o acerto;
 *   4. o "Próximo" trava só pela seção ATUAL
 *      (`pendingQuizzesForCurrentSection` / `isNextSectionBlockedByQuiz`);
 *   5. quiz que o aluno AINDA NÃO PODE VER (seção não apresentada) não
 *      bloqueia nada;
 *   6. assertion SEM sectionId entra no gate pela chave `id` (`quizKeyFor`);
 *   7. duas assertions da MESMA seção têm chaves SEPARADAS (bug de colisão
 *      consertado na ONDA1-MAESTRIA — ver o teste);
 *   8. compatibilidade: `isLessonFinishBlocked(challenges)` sem o 2º argumento
 *      mantém o comportamento da ONDA2 byte a byte.
 *
 * ─── ONDA1-MAESTRIA: TRÊS TESTES DESTA SUÍTE FORAM INVERTIDOS DE PROPÓSITO ──
 *
 * A REGRA ANTIGA (ONDA10), que este arquivo travava: "responder basta —
 * acertar não é exigido". O gate lia `answered` e NUNCA `correct`, e
 * `submitQuizAnswer` era cegamente idempotente.
 *
 * A REGRA NOVA, PEDIDO EXPLÍCITO DO DONO nesta onda: errar NÃO libera. O
 * aluno erra → a IA explica por que a alternativa não se sustenta → a
 * explicação entra no histórico do chat → um quiz NOVO é gerado sobre o mesmo
 * conteúdo → o ciclo repete. Só o ACERTO abre o caminho: "só vamos para o
 * desafio depois que o aluno provar que entendeu".
 *
 * POR QUE ISSO NÃO É PUNIÇÃO (e por que a mudança não contradiz o redesign):
 * `docs/ux-redesign.md` §8 item 3 é normativo — falha vira ESTADO DE
 * DIAGNÓSTICO com redação informativa, sem vermelho piscando; e §8.2 mede que
 * o elogio ritualizado derruba a motivação (d = −0,40) enquanto o feedback
 * INFORMACIONAL específico a sobe (d = +0,43 em adultos). O bloqueio aqui é
 * informação ("este trecho ainda não foi demonstrado"), e o ciclo entrega a
 * explicação — não uma repreensão.
 *
 * Os testes invertidos, nominalmente: "respondido (mesmo ERRADO) → o gate sai
 * do caminho", "o gate lê `answered` e NUNCA `correct`" e "duas assertions na
 * MESMA seção compartilham a chave". Os dois primeiros afirmavam a regra
 * antiga; o terceiro travava como CORRETO um bug de colisão de chave (ver o
 * teste correspondente).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyTutorReply,
  createTrackLessonState,
  injectRemediationQuiz,
  isLessonFinishBlocked,
  isNextSectionBlockedByQuiz,
  isQuizAnswered,
  isQuizMastered,
  lessonFinishBlock,
  pendingQuizzes,
  pendingQuizzesForCurrentSection,
  quizAttempts,
  quizKeyFor,
  registerQuizExplanation,
  submitQuizAnswer,
  type TrackLessonUiState,
} from '../src/lib/trackLessonState';
import type { TrackAssertionDto, TrackVerdict, TutorReply } from '../shared/ipc-contract';

function assertion(over: Partial<TrackAssertionDto> = {}): TrackAssertionDto {
  return {
    id: 'a1',
    statement: 'Afirmação da aula.',
    question: 'Pergunta?',
    options: ['a', 'b', 'c', 'd'],
    answerIndex: 1,
    feedback: 'porque sim',
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

function ch(lastVerdict: TrackVerdict | null): { lastVerdict: TrackVerdict | null } {
  return { lastVerdict };
}

/** Estado com as seções `ids` já apresentadas (uma bolha por seção). */
function presented(...ids: string[]): TrackLessonUiState {
  let s = createTrackLessonState();
  ids.forEach((id, i) => {
    s = applyTutorReply(s, reply({ sectionId: id, message: `Seção ${id}.` }), 1000 + i);
  });
  return s;
}

describe('ONDA10 defeito 2 — o quiz vira OBRIGATÓRIO para CONCLUIR a aula', () => {
  it('PROVA MÍNIMA (só API antiga): quiz pendente bloqueia mesmo com tudo passed', () => {
    // Este caso usa SOMENTE `isLessonFinishBlocked` — a assinatura que já
    // existia. Contra o código ANTIGO ele reprova por ASSERÇÃO (e não por
    // export faltando): a versão antiga ignorava qualquer coisa além dos
    // desafios e devolvia `false` aqui, liberando o "Concluir aula" com o
    // quiz intocado. É exatamente o defeito que o dono descreveu.
    assert.equal(
      isLessonFinishBlocked([ch('passed')], 1),
      true,
      'um quiz sem resposta basta para bloquear a conclusão',
    );
    assert.equal(isLessonFinishBlocked([], 2), true, 'idem sem nenhum desafio na aula');
  });

  it('desafios TODOS passados + quiz sem resposta → CONCLUIR bloqueado', () => {
    const s = presented('s1');
    const as = [assertion()];
    const pend = pendingQuizzes(s, as);
    assert.equal(pend.length, 1, 'o quiz da seção apresentada está pendente');
    // ↓ é ESTA linha que o código antigo reprova: ele ignorava os quizzes e
    //   devolvia false, liberando a conclusão sem nenhuma resposta.
    assert.equal(
      isLessonFinishBlocked([ch('passed')], pend.length),
      true,
      'com quiz sem resposta a aula NÃO pode ser concluída',
    );
    assert.equal(lessonFinishBlock([ch('passed')], pend.length), 'quiz');
  });

  it('sem desafio nenhum, o quiz sozinho já bloqueia a conclusão', () => {
    const s = presented('s1');
    const pend = pendingQuizzes(s, [assertion()]);
    assert.equal(isLessonFinishBlocked([], pend.length), true);
    assert.equal(lessonFinishBlock([], pend.length), 'quiz');
  });

  it('INVERTIDO (ONDA1-MAESTRIA): errado NÃO libera — o ciclo abre e o gate segue fechado', () => {
    // REGRA ANTIGA (este mesmo teste, chamado "respondido (mesmo ERRADO) → o
    // gate do quiz sai do caminho"): errar contava como responder e liberava.
    // REGRA NOVA (pedido explícito do dono desta onda): errar abre o ciclo de
    // remediação (explicação + quiz novo) e o gate SÓ abre com o acerto.
    const s0 = presented('s1');
    const a = assertion({ answerIndex: 1 });
    // resposta ERRADA (escolheu 3, a certa é 1)
    const s1 = submitQuizAnswer(s0, quizKeyFor(a), 3, a.answerIndex);
    const key = quizKeyFor(a);
    assert.equal(s1.quizBySection[key].correct, false, 'errou mesmo');
    assert.equal(s1.quizBySection[key].stage, 'explicando', 'o ciclo de remediação ABRIU');
    assert.equal(pendingQuizzes(s1, [a]).length, 1, 'errar NÃO conta como dominar');
    assert.equal(isLessonFinishBlocked([ch('passed')], pendingQuizzes(s1, [a]).length), true);
    assert.equal(lessonFinishBlock([ch('passed')], pendingQuizzes(s1, [a]).length), 'quiz');
    // …e o ACERTO, na mesma chave, é o que libera.
    const dominado = submitQuizAnswer(
      injectRemediationQuiz(
        registerQuizExplanation(s1, key, {
          question: a.question,
          chosenOption: a.options[3],
          explanation: 'A seção mostra outra coisa.',
        }),
        key,
        assertion({ id: 'novo', answerIndex: 0 }),
      ),
      key,
      0,
      0,
    );
    assert.equal(pendingQuizzes(dominado, [a]).length, 0, 'acertou → sai do gate');
    assert.equal(lessonFinishBlock([ch('passed')], pendingQuizzes(dominado, [a]).length), null);
  });

  it('INVERTIDO (ONDA1-MAESTRIA): o gate lê MAESTRIA — certo e errado NÃO são equivalentes', () => {
    // REGRA ANTIGA (este teste se chamava "o gate lê `answered` e NUNCA
    // `correct`: certo e errado liberam igual"): a i18n dizia, literalmente,
    // "acertar não é exigido, só responder".
    // REGRA NOVA (pedido explícito do dono): o predicado do gate é
    // `isQuizMastered` — houve acerto. Errar mantém o bloqueio.
    const a = assertion({ answerIndex: 1 });
    const base = presented('s1');
    const errado = submitQuizAnswer(base, quizKeyFor(a), 0, a.answerIndex);
    const certo = submitQuizAnswer(base, quizKeyFor(a), 1, a.answerIndex);
    assert.equal(isQuizMastered(errado, quizKeyFor(a)), false, 'errado NÃO é maestria');
    assert.equal(isQuizMastered(certo, quizKeyFor(a)), true, 'certo É maestria');
    assert.equal(pendingQuizzes(errado, [a]).length, 1, 'errado continua pendente');
    assert.equal(pendingQuizzes(certo, [a]).length, 0, 'certo libera');
    assert.notEqual(
      lessonFinishBlock([], pendingQuizzes(errado, [a]).length),
      lessonFinishBlock([], pendingQuizzes(certo, [a]).length),
      'errar e acertar levam a destravamentos DIFERENTES',
    );
    // Os DOIS registram resposta — o que mudou é o que o gate faz com isso.
    assert.equal(isQuizAnswered(errado, quizKeyFor(a)), true, 'errar segue sendo responder');
  });

  it('anti-dupla-submissão PRESERVADA: 2ª resposta na MESMA geração é no-op', () => {
    // O que a ONDA10 chamava de "idempotência" continua valendo DENTRO de uma
    // geração: dois cliques no mesmo card não viram duas tentativas, e a
    // resposta certa não pode ser "corrigida" por cima da errada sem passar
    // pelo ciclo. O que MUDOU: o no-op não libera mais o gate — só uma
    // geração NOVA (quiz remediador) aceita resposta nova.
    const a = assertion({ answerIndex: 1 });
    const key = quizKeyFor(a);
    const s1 = submitQuizAnswer(presented('s1'), key, 3, a.answerIndex);
    const s2 = submitQuizAnswer(s1, key, 1, a.answerIndex);
    assert.equal(s2, s1, 'no-op: mesma referência');
    assert.equal(s2.quizBySection[key].selected, 3, 'a primeira escolha da geração permanece');
    assert.equal(quizAttempts(s2, key).length, 1, 'uma tentativa, não duas');
    assert.equal(pendingQuizzes(s2, [a]).length, 1, 'e o gate CONTINUA travado (regra nova)');
    // O acerto, esse sim, FECHA a chave para sempre.
    const dominado = submitQuizAnswer(presented('s1'), key, 1, a.answerIndex);
    assert.equal(submitQuizAnswer(dominado, key, 3, a.answerIndex), dominado, 'dominado é imutável');
  });

  it('motivo do bloqueio: quiz tem precedência sobre desafios; sem nada pendente → null', () => {
    const s = presented('s1');
    const a = assertion();
    // quiz pendente E desafio pendente → 'quiz' (desbloqueio mais barato)
    assert.equal(lessonFinishBlock([ch(null)], pendingQuizzes(s, [a]).length), 'quiz');
    // quiz DOMINADO (acerto — regra nova), desafio pendente → 'challenges'
    const respondido = submitQuizAnswer(s, quizKeyFor(a), a.answerIndex, a.answerIndex);
    assert.equal(isQuizMastered(respondido, quizKeyFor(a)), true, 'acertou → dominado');
    assert.equal(lessonFinishBlock([ch('failed')], pendingQuizzes(respondido, [a]).length), 'challenges');
    // tudo em ordem → null
    assert.equal(lessonFinishBlock([ch('passed')], pendingQuizzes(respondido, [a]).length), null);
  });

  it('quiz de seção NÃO apresentada não bloqueia (o aluno nem pode vê-lo)', () => {
    const s = presented('s1');
    const futura = assertion({ id: 'a2', sectionId: 's2' });
    assert.deepEqual(pendingQuizzes(s, [futura]), [], 'quiz sem âncora visível fica fora do gate');
    assert.equal(isLessonFinishBlocked([ch('passed')], pendingQuizzes(s, [futura]).length), false);
  });

  it('aula SEM assertions: nada de quiz, nada de bloqueio novo', () => {
    const s = presented('s1', 's2');
    assert.deepEqual(pendingQuizzes(s, []), []);
    assert.equal(isLessonFinishBlocked([ch('passed')], 0), false);
    assert.equal(isNextSectionBlockedByQuiz(s, []), false);
  });

  it('assertion SEM sectionId entra no gate pela chave `id`', () => {
    const s = presented('s1');
    const semSecao = assertion({ id: 'solta', sectionId: undefined });
    assert.equal(quizKeyFor(semSecao), 'solta');
    assert.equal(pendingQuizzes(s, [semSecao]).length, 1, 'ancorada na última seção → conta');
    // ONDA1-MAESTRIA: sair do gate exige ACERTO (antes bastava responder).
    const errou = submitQuizAnswer(s, quizKeyFor(semSecao), 0, semSecao.answerIndex);
    assert.equal(pendingQuizzes(errou, [semSecao]).length, 1, 'errar mantém a pendência');
    const resp = submitQuizAnswer(s, quizKeyFor(semSecao), semSecao.answerIndex, semSecao.answerIndex);
    assert.equal(pendingQuizzes(resp, [semSecao]).length, 0);
  });

  it('INVERTIDO (ONDA1-MAESTRIA): duas assertions da MESMA seção têm chaves SEPARADAS', () => {
    // O QUE ESTE TESTE AFIRMAVA ANTES: "duas assertions na MESMA seção
    // compartilham a chave: uma resposta cobre as duas" — porque `quizKeyFor`
    // era `sectionId ?? assertion.id`. Aquilo NÃO era contrato: era um BUG
    // travado como se fosse. Responder UMA marcava a OUTRA como respondida, e
    // o gate liberava um quiz que o aluno nunca tinha visto.
    //
    // NÃO É HIPOTÉTICO: no módulo M1 real (python / a-tela), 4 das 20 aulas
    // (a-primeira-linha, dar-nome-a-um-valor, de-texto-para-numero,
    // quando-da-errado) trazem 3 assertions cada, várias na mesma seção. Com
    // "responder basta" o prejuízo era 1 quiz pulado; com MAESTRIA
    // obrigatória vira um furo no gate inteiro.
    //
    // A REGRA NOVA: a chave é `sectionId::assertionId` — única por assertion,
    // com a seção legível dentro dela (a ANCORAGEM por seção continua vindo
    // de quizzesByMessageIndex/sectionPresentationIndexes, não da chave).
    const s = presented('s1');
    const a1 = assertion({ id: 'a1' });
    const a2 = assertion({ id: 'a2', sectionId: 's1' });
    assert.notEqual(quizKeyFor(a1), quizKeyFor(a2), 'chaves DISTINTAS na mesma seção');
    assert.equal(quizKeyFor(a1), 's1::a1');
    assert.equal(quizKeyFor(a2), 's1::a2');
    assert.equal(pendingQuizzes(s, [a1, a2]).length, 2, 'nenhuma dominada → duas pendentes');
    // Dominar UMA deixa a OUTRA pendente — era exatamente isto que o bug
    // escondia.
    const resp = submitQuizAnswer(s, quizKeyFor(a1), a1.answerIndex, a1.answerIndex);
    assert.deepEqual(
      pendingQuizzes(resp, [a1, a2]).map((a) => a.id),
      ['a2'],
      'a segunda afirmação continua exigindo resposta',
    );
    const ambas = submitQuizAnswer(resp, quizKeyFor(a2), a2.answerIndex, a2.answerIndex);
    assert.equal(pendingQuizzes(ambas, [a1, a2]).length, 0, 'as duas dominadas → gate livre');
  });

  it('ordem determinística: pendências saem na ordem das bolhas do histórico', () => {
    const s = presented('s1', 's2');
    const a1 = assertion({ id: 'a1', sectionId: 's1' });
    const a2 = assertion({ id: 'a2', sectionId: 's2' });
    assert.deepEqual(
      pendingQuizzes(s, [a2, a1]).map((a) => a.id),
      ['a1', 'a2'],
      'ordem do histórico, não a ordem do array de assertions',
    );
  });
});

describe('ONDA10 defeito 2 — o "Próximo" trava pela seção ATUAL', () => {
  it('seção atual com quiz sem resposta → avanço bloqueado', () => {
    const s = presented('s1');
    const a = assertion();
    assert.equal(pendingQuizzesForCurrentSection(s, [a]).length, 1);
    assert.equal(isNextSectionBlockedByQuiz(s, [a]), true);
  });

  it('INVERTIDO (ONDA1-MAESTRIA): errado NÃO libera o avanço; o acerto sim', () => {
    // REGRA ANTIGA deste teste ("respondido (errado) → o avanço libera na
    // hora"): responder bastava. REGRA NOVA (pedido do dono): o "Próximo" só
    // abre com o acerto — o ciclo de remediação acontece ANTES do avanço.
    const a = assertion({ answerIndex: 1 });
    const errado = submitQuizAnswer(presented('s1'), quizKeyFor(a), 2, a.answerIndex);
    assert.equal(isNextSectionBlockedByQuiz(errado, [a]), true, 'errar mantém o avanço travado');
    const certo = submitQuizAnswer(presented('s1'), quizKeyFor(a), 1, a.answerIndex);
    assert.equal(isNextSectionBlockedByQuiz(certo, [a]), false, 'acertar libera o avanço');
  });

  it('quiz PENDENTE de seção ANTERIOR não trava o "Próximo" (só a conclusão)', () => {
    const s = presented('s1', 's2');
    const antiga = assertion({ id: 'a1', sectionId: 's1' });
    assert.equal(
      isNextSectionBlockedByQuiz(s, [antiga]),
      false,
      'a trava do avanço é da seção ATUAL',
    );
    assert.equal(
      pendingQuizzes(s, [antiga]).length,
      1,
      'mas a conclusão continua bloqueada por ela',
    );
  });

  it('seção atual SEM quiz → avanço livre', () => {
    const s = presented('s1', 's2');
    const soNaPrimeira = assertion({ id: 'a1', sectionId: 's1' });
    const respondida = submitQuizAnswer(
      s,
      quizKeyFor(soNaPrimeira),
      soNaPrimeira.answerIndex,
      soNaPrimeira.answerIndex,
    );
    assert.equal(isNextSectionBlockedByQuiz(respondida, [soNaPrimeira]), false);
  });

  it('nenhuma seção apresentada ainda → nada a responder, nada a travar', () => {
    const vazio = createTrackLessonState();
    assert.deepEqual(pendingQuizzesForCurrentSection(vazio, [assertion()]), []);
    assert.equal(isNextSectionBlockedByQuiz(vazio, [assertion()]), false);
  });
});

describe('ONDA10 defeito 2 — compatibilidade com o gate da ONDA2', () => {
  it('isLessonFinishBlocked(challenges) sem quiz mantém a regra antiga', () => {
    assert.equal(isLessonFinishBlocked([]), false, 'sem desafios → liberado');
    assert.equal(isLessonFinishBlocked([ch('passed'), ch('passed')]), false, 'todos passed → liberado');
    assert.equal(isLessonFinishBlocked([ch('passed'), ch(null)]), true, 'nunca tentado → bloqueia');
    assert.equal(isLessonFinishBlocked([ch('failed')]), true, 'falhou → bloqueia');
    assert.equal(isLessonFinishBlocked([ch('timeout')]), true, 'timeout → bloqueia');
    assert.equal(isLessonFinishBlocked([ch('abandoned')]), true, 'abandonado → bloqueia');
  });

  it('pendingQuizCount 0 é o default — nenhum chamador antigo muda de comportamento', () => {
    assert.equal(lessonFinishBlock([ch('passed')]), null);
    assert.equal(lessonFinishBlock([ch(null)]), 'challenges');
  });
});
