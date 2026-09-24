/**
 * tests/cx-services-quiz-remediation.test.ts — CARACTERIZAÇÃO (golden master)
 * de `electron/main/services/quizRemediation.ts` ANTES da refatoração de
 * core/services.
 *
 * Fixa o ciclo errar → explicar → quiz novo: helpers puros (chave da série,
 * id determinística, posição exigida da resposta, rotação, recorrência), os
 * PROMPTS (autoridade pedagógica — as regras ERR-* são contrato) e o serviço
 * fail-closed (explain/remedial NUNCA lançam; sem LLM/entrada ruim ⇒
 * `{ok:false, code}`). SEM REDE: `chat` é injetado em todos os casos.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { QUIZ_ERROR_CODES } from '../shared/ipc-contract';
import type {
  QuizExplainRequest,
  QuizRemedialRequest,
  TrackAssertionDto,
} from '../shared/ipc-contract';
import {
  QUIZ_OPTION_COUNT,
  askedQuestionsOf,
  buildExplainPrompt,
  buildRecurrenceSection,
  buildRemedialPrompt,
  createQuizRemediation,
  normalizeForCompare,
  parseRemedialQuiz,
  quizStateKeyFor,
  recurrenceOf,
  remedialQuizIdFor,
  requiredAnswerIndexFor,
  rotateOptions,
} from '../electron/main/services/quizRemediation';

// ─── fixtures ────────────────────────────────────────────────────────────────

function assertion(over: Partial<TrackAssertionDto> = {}): TrackAssertionDto {
  return {
    id: 'af-1',
    statement: 'Toda função em JS é um objeto.',
    question: 'O que é uma função em JavaScript?',
    options: ['Um objeto', 'Uma string', 'Um número', 'Um símbolo'],
    answerIndex: 0,
    feedback: 'Funções são objetos chamáveis.',
    ...over,
  };
}

function explainReq(over: Partial<QuizExplainRequest> = {}): QuizExplainRequest {
  return {
    trackSlug: 'js-do-zero',
    lessonId: 'aula-1',
    sectionKey: 'sec-1',
    assertion: assertion(),
    selectedIndex: 1,
    ...over,
  };
}

function remedialReq(over: Partial<QuizRemedialRequest> = {}): QuizRemedialRequest {
  return {
    trackSlug: 'js-do-zero',
    lessonId: 'aula-1',
    sectionKey: 'sec-1',
    originAssertionId: 'af-1',
    generation: 1,
    assertion: assertion({ sectionId: 'sec-t' }),
    ...over,
  };
}

interface ChatCall {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  timeoutMs?: number;
}

function chatFake(
  responder: (call: ChatCall) => { content: string } | Promise<{ content: string }>,
): { chat: (req: ChatCall) => Promise<{ content: string }>; calls: ChatCall[] } {
  const calls: ChatCall[] = [];
  const chat = async (req: ChatCall): Promise<{ content: string }> => {
    calls.push(req);
    return responder(req);
  };
  return { chat, calls };
}

/** Quiz cru válido na forma que a LLM devolve (posição 0 = correta). */
function draftQuiz(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    statement: 'Nova afirmação equivalente.',
    question: 'Pergunta NOVA sobre a mesma ideia?',
    options: ['correta nova', 'errada 1', 'errada 2', 'errada 3'],
    answerIndex: 0,
    feedback: 'A primeira se sustenta.',
    optionRationales: ['rac-0', 'rac-1', 'rac-2', 'rac-3'],
    ...over,
  };
}

// ─── helpers puros ───────────────────────────────────────────────────────────

describe('cx/quizRemediation: constantes e chave da série', () => {
  it('QUIZ_OPTION_COUNT é 4 (contrato da trilha)', () => {
    assert.equal(QUIZ_OPTION_COUNT, 4);
  });

  it('quizStateKeyFor: section::id; id remedial REVERTE para a chave da série', () => {
    assert.equal(quizStateKeyFor('af-1', 'sec-1'), 'sec-1::af-1');
    assert.equal(quizStateKeyFor('af-1'), 'af-1');
    assert.equal(quizStateKeyFor('sec-1::af-1#g2', 'ignorada'), 'sec-1::af-1');
  });

  it('remedialQuizIdFor: <chave>#g<N> determinística (golden master)', () => {
    assert.equal(
      remedialQuizIdFor({ originAssertionId: 'af-1', generation: 1, assertion: assertion({ sectionId: 'sec-1' }) }),
      'sec-1::af-1#g1',
    );
    assert.equal(
      remedialQuizIdFor({ originAssertionId: 'af-1', generation: 2, assertion: assertion({ sectionId: 'sec-1' }) }),
      'sec-1::af-1#g2',
    );
    assert.equal(remedialQuizIdFor({ originAssertionId: 'af-2', generation: 1, assertion: assertion() }), 'af-2#g1');
  });

  it('requiredAnswerIndexFor: posição derivada do hash da id (golden master + determinismo)', () => {
    assert.equal(
      requiredAnswerIndexFor({ originAssertionId: 'af-1', generation: 1, assertion: assertion({ sectionId: 'sec-1' }) }),
      2,
    );
    assert.equal(
      requiredAnswerIndexFor({ originAssertionId: 'af-1', generation: 2, assertion: assertion({ sectionId: 'sec-1' }) }),
      3,
    );
    assert.equal(requiredAnswerIndexFor({ originAssertionId: 'af-2', generation: 1, assertion: assertion() }), 0);
    // determinismo: duas chamadas, mesmo pedido, mesma posição.
    const req = {
      originAssertionId: 'af-9',
      generation: 3,
      assertion: assertion({ sectionId: 's' }),
    };
    assert.equal(requiredAnswerIndexFor(req), requiredAnswerIndexFor(req));
  });

  it('normalizeForCompare: acento/caixa/espaços NÃO criam alternativa nova', () => {
    assert.equal(normalizeForCompare('FUNÇÃO   Chamável'), normalizeForCompare('funcao chamavel'));
    assert.equal(normalizeForCompare('Função.'), normalizeForCompare('função'));
    assert.equal(normalizeForCompare('a;'), 'a');
  });

  it('rotateOptions preserva a ordem relativa e é TOTAL (índice fora de faixa/inteiro não ⇒ cópia)', () => {
    assert.deepEqual(rotateOptions(['a', 'b', 'c', 'd'], 3, 1), ['c', 'd', 'a', 'b']);
    assert.deepEqual(rotateOptions(['a', 'b', 'c', 'd'], 0, 0), ['a', 'b', 'c', 'd']);
    assert.deepEqual(rotateOptions([], 0, 1), []);
    assert.deepEqual(rotateOptions(['a', 'b'], 5, 0), ['a', 'b']);
    assert.deepEqual(rotateOptions(['a', 'b'], 0, 1.5), ['a', 'b']);
  });
});

describe('cx/quizRemediation: recurrenceOf (ERR-4)', () => {
  it('id `…#g<N>` ⇒ recorrente com ordinal N+1; primeiro erro ⇒ não recorrente', () => {
    assert.deepEqual(
      recurrenceOf({ assertion: assertion({ id: 'af-1#g2' }), quizOrigin: 'remedial' }),
      { recurrent: true, ordinal: 3 },
    );
    assert.deepEqual(recurrenceOf({ assertion: assertion({ id: 'af-1' }) }), {
      recurrent: false,
      ordinal: null,
    });
  });

  it('origem remedial SEM convenção na id ⇒ recorrente com ordinal null (sem inventar cifra)', () => {
    assert.deepEqual(
      recurrenceOf({ assertion: assertion({ id: 'af-1' }), quizOrigin: 'remedial' }),
      { recurrent: true, ordinal: null },
    );
    assert.deepEqual(
      recurrenceOf({
        assertion: undefined as unknown as TrackAssertionDto,
        quizOrigin: 'remedial',
      }),
      { recurrent: true, ordinal: null },
    );
  });
});

describe('cx/quizRemediation: buildRecurrenceSection (bloco aditivo ERR-4)', () => {
  it('primeiro erro ⇒ bloco VAZIO (prompt byte-idêntico ao caminho normal)', () => {
    assert.equal(buildRecurrenceSection({ assertion: assertion({ id: 'af-1' }) }), '');
  });

  it('recorrente com ordinal ⇒ manda dizer o NÚMERO como fato sobre o erro', () => {
    const bloco = buildRecurrenceSection({
      assertion: assertion({ id: 'af-1#g2' }),
      quizOrigin: 'remedial',
    });
    assert.ok(bloco.includes('Esta é a 3ª vez seguida'), 'nomeia a recorrência com o número derivado');
    assert.ok(bloco.includes('TROQUE DE ESTRATÉGIA'));
    assert.ok(/nunca "você continua errando"/.test(bloco), 'erro é fato, nunca sobre a pessoa');
  });

  it('recorrente sem ordinal ⇒ proíbe inventar número', () => {
    const bloco = buildRecurrenceSection({
      assertion: assertion({ id: 'avulsa' }),
      quizOrigin: 'remedial',
    });
    assert.ok(bloco.includes('SEM inventar um número'));
  });
});

// ─── prompts (autoridade pedagógica — o texto É contrato) ────────────────────

describe('cx/quizRemediation: buildExplainPrompt (regras ERR-* pinadas)', () => {
  const prompt = buildExplainPrompt(
    explainReq({
      theorySection: {
        id: 'sec-t',
        title: 'Funções são objetos',
        markdown: 'Funções em JS são objetos chamáveis.',
        code: { language: 'js', code: 'const f = () => 1;', explanation: 'arrow function' },
      },
      lessonExcerpt: 'Material da aula sobre funções.',
    }),
  );

  it('contexto traz afirmação, pergunta, alternativas marcadas (escolhida × correta) e feedback', () => {
    assert.ok(prompt.includes('trilha "js-do-zero", aula "aula-1", seção "sec-1"'));
    assert.ok(prompt.includes('AFIRMAÇÃO DA AULA: Toda função em JS é um objeto.'));
    assert.ok(prompt.includes('PERGUNTA DO QUIZ: O que é uma função em JavaScript?'));
    assert.ok(prompt.includes('← ESCOLHIDA PELO ALUNO'));
    assert.ok(prompt.includes('← CORRETA'));
    assert.ok(prompt.includes('ALTERNATIVA ESCOLHIDA PELO ALUNO (a errada): [1] Uma string'));
    assert.ok(prompt.includes('ALTERNATIVA CORRETA: [0] Um objeto'));
    assert.ok(prompt.includes('FEEDBACK AUTORAL DA AFIRMAÇÃO: Funções são objetos chamáveis.'));
  });

  it('ancora na seção de teoria e no material (com o código da seção)', () => {
    assert.ok(prompt.includes('SEÇÃO DE TEORIA QUE DEMONSTRA A AFIRMAÇÃO [id=sec-t]'));
    assert.ok(prompt.includes('```js\nconst f = () => 1;'));
    assert.ok(prompt.includes('MATERIAL DA AULA (todo o conteúdo que o aluno viu):\nMaterial da aula sobre funções.'));
  });

  it('regras pedagógicas obrigatórias presentes (classificar, ERR-2/3/5/6, proibições)', () => {
    assert.ok(prompt.includes('CLASSIFIQUE o erro ANTES de escrever'));
    assert.ok(prompt.includes('DESLIZE'));
    assert.ok(prompt.includes('EQUÍVOCO CONCEITUAL'));
    assert.ok(prompt.includes('SEM reensino, SEM escada de dicas'));
    assert.ok(prompt.includes('NÃO corrija de imediato'));
    assert.ok(prompt.includes('NUNCA no aluno'));
    assert.ok(prompt.includes('PROIBIDO elogio ritualizado'));
    assert.ok(prompt.includes('PROIBIDO qualquer percentual, nota ou porcentagem de domínio'));
    assert.ok(prompt.includes('NUNCA mostre URLs ou fontes'));
    assert.ok(prompt.includes('No máximo 8 linhas'));
    assert.ok(prompt.includes('Feche dizendo que vem uma pergunta NOVA'));
  });

  it('sem imperativo de raciocínio e sem recorrência no primeiro erro', () => {
    assert.ok(!/pense profundamente|passo a passo|think hard/i.test(prompt));
    assert.ok(!prompt.includes('RECORRÊNCIA (obrigatória'));
  });

  it('sem teoria/material no pedido ⇒ placeholders honestos (nada inventado)', () => {
    const p = buildExplainPrompt(explainReq());
    assert.ok(p.includes('SEÇÃO DE TEORIA QUE DEMONSTRA A AFIRMAÇÃO: (não veio no pedido)'));
    assert.ok(p.includes('MATERIAL DA AULA: (não veio no pedido'));
  });
});

describe('cx/quizRemediation: buildRemedialPrompt (posição exigida + nunca-repetir)', () => {
  const req = remedialReq({ explanation: 'A explicação que o aluno leu.', askedQuestions: ['Pergunta antiga?'] });
  const required = requiredAnswerIndexFor(req);
  const prompt = buildRemedialPrompt(req);

  it('o FORMATO JSON pede answerIndex na posição EXIGIDA e a regra 3 nomeia a posição', () => {
    assert.ok(prompt.includes(`"answerIndex": ${required}`));
    assert.ok(prompt.includes(`TEM DE ficar na posição ${required}`));
    assert.ok(prompt.includes(`a ${required + 1}ª da lista`));
    assert.ok(prompt.includes(`"optionRationales" tem EXATAMENTE ${QUIZ_OPTION_COUNT} itens`));
  });

  it('nunca-repetir: a pergunta de ORIGEM entra na lista mesmo sem o chamador pedir', () => {
    assert.ok(prompt.includes('PERGUNTAS QUE O ALUNO JÁ VIU NESTA SEÇÃO'));
    assert.ok(prompt.includes('- O que é uma função em JavaScript?'), 'pergunta de origem listada');
    assert.ok(prompt.includes('- Pergunta antiga?'));
    assert.ok(prompt.includes('NÃO REPITA NENHUMA'));
  });

  it('explicação lida entra no prompt; ausente vira placeholder', () => {
    assert.ok(prompt.includes('EXPLICAÇÃO QUE O ALUNO ACABOU DE LER (o quiz novo cobra o que ela ensinou):\nA explicação que o aluno leu.'));
    assert.ok(buildRemedialPrompt(remedialReq()).includes('(não veio no pedido)'));
  });

  it('proibições de estilo/URL e resposta SOMENTE JSON', () => {
    assert.ok(prompt.includes('NUNCA do aluno'));
    assert.ok(prompt.includes('NUNCA inclua URLs ou fontes'));
    assert.ok(prompt.includes('Responda SOMENTE o objeto JSON'));
  });
});

describe('cx/quizRemediation: askedQuestionsOf (nunca-repetir)', () => {
  it('a pergunta de origem vem PRIMEIRO e duplicatas normalizadas são removidas', () => {
    const lista = askedQuestionsOf(
      remedialReq({
        askedQuestions: ['O que é uma função em JavaScript?', 'Outra?', 'outra?', '   '],
      }),
    );
    assert.deepEqual(lista, ['O que é uma função em JavaScript?', 'Outra?']);
  });

  it('caracterização: duplicata com espaço à direita ESCAPA do dedup (ver BUG ao final)', () => {
    // Efeito prático do defeito de normalizeForCompare: o mesmo texto com
    // whitespace à direita gera outra chave de comparação.
    const lista = askedQuestionsOf(
      remedialReq({ askedQuestions: ['O que é uma função em JavaScript?  '] }),
    );
    assert.deepEqual(lista, [
      'O que é uma função em JavaScript?',
      'O que é uma função em JavaScript?',
    ]);
  });
});

// ─── parseRemedialQuiz (valida ANTES de acreditar + normaliza a posição) ─────

describe('cx/quizRemediation: parseRemedialQuiz (saída da LLM)', () => {
  const req = remedialReq({ generation: 2 });
  const required = requiredAnswerIndexFor(req);

  it('aceita o draft e NORMALIZA identidade/posição do pedido (nunca o que a LLM inventou)', () => {
    const quiz = parseRemedialQuiz(draftQuiz({ answerIndex: 0 }), req);
    assert.ok(quiz);
    assert.equal(quiz.id, remedialQuizIdFor(req));
    assert.equal(quiz.originAssertionId, 'af-1');
    assert.equal(quiz.generation, 2);
    assert.equal(quiz.sectionId, 'sec-t');
    assert.equal(quiz.answerIndex, required, 'posição exigida vence a posição devolvida');
    // a alternativa CORRETA devolvida (índice 0) termina no índice exigido.
    assert.equal(quiz.options[required], 'correta nova');
    // racionais giram JUNTO — item i descreve a alternativa i.
    assert.equal(quiz.optionRationales?.[required], 'rac-0');
  });

  it('modelo obedeceu a posição ⇒ ordem intacta (shift 0)', () => {
    const quiz = parseRemedialQuiz(draftQuiz({ answerIndex: required }), req);
    assert.ok(quiz);
    assert.deepEqual(quiz.options, ['correta nova', 'errada 1', 'errada 2', 'errada 3']);
  });

  it('REPROVA (null): não-objeto, campos vazios, opções ≠ 4, duplicadas, índice fora', () => {
    assert.equal(parseRemedialQuiz(null, req), null);
    assert.equal(parseRemedialQuiz([draftQuiz()], req), null);
    assert.equal(parseRemedialQuiz(draftQuiz({ statement: '  ' }), req), null);
    assert.equal(parseRemedialQuiz(draftQuiz({ feedback: '' }), req), null);
    assert.equal(parseRemedialQuiz(draftQuiz({ options: ['a', 'b', 'c'] }), req), null);
    assert.equal(parseRemedialQuiz(draftQuiz({ options: ['a', 'b', 'c', 'd', 'e'] }), req), null);
    assert.equal(parseRemedialQuiz(draftQuiz({ options: ['a', 'A', 'b', 'c'] }), req), null, 'duplicadas normalizadas contam');
    assert.equal(parseRemedialQuiz(draftQuiz({ answerIndex: 4 }), req), null);
    assert.equal(parseRemedialQuiz(draftQuiz({ answerIndex: -1 }), req), null);
    assert.equal(parseRemedialQuiz(draftQuiz({ answerIndex: 1.5 }), req), null);
  });

  it('optionRationales: 4 preenchidos mantidos; [] ⇒ campo ausente; 1..3 ou vazio ⇒ REPROVA o quiz', () => {
    const semRacionais = parseRemedialQuiz(draftQuiz({ optionRationales: [] }), req);
    assert.ok(semRacionais);
    assert.equal('optionRationales' in semRacionais, false, '[] = ausência declarada (não entra)');

    assert.equal(parseRemedialQuiz(draftQuiz({ optionRationales: ['a', 'b'] }), req), null);
    assert.equal(parseRemedialQuiz(draftQuiz({ optionRationales: ['a', 'b', 'c', ''] }), req), null);
    assert.equal(parseRemedialQuiz(draftQuiz({ optionRationales: 'não-array' }), req), null);
  });

  it('pergunta REPETIDA (normalizada) reprova — o nunca-repetir não é sugestão', () => {
    assert.equal(
      parseRemedialQuiz(draftQuiz(), remedialReq({ generation: 2, askedQuestions: ['pergunta NOVA sobre a mesma ideia?'] })),
      null,
      'repete uma já vista',
    );
    assert.equal(
      parseRemedialQuiz(draftQuiz({ question: 'O que é uma função em JavaScript?' }), req),
      null,
      'repete a pergunta de origem',
    );
  });
});

// ─── o serviço (fail-closed: nunca lança) ────────────────────────────────────

describe('cx/quizRemediation: explain — validação ANTES de gastar LLM', () => {
  it('sem chat ⇒ QUIZ_UNAVAILABLE (fail-closed, mensagem de configuração)', async () => {
    const svc = createQuizRemediation();
    const reply = await svc.explain(explainReq());
    assert.equal(reply.ok, false);
    assert.ok(!reply.ok && reply.code === QUIZ_ERROR_CODES.UNAVAILABLE);
    assert.ok(!reply.ok && /não está configurada/.test(reply.message));
  });

  it('pedido malformado ⇒ QUIZ_NOT_FOUND sem CHAMAR a LLM (nenhum crédito gasto)', async () => {
    const { chat, calls } = chatFake(async () => ({ content: 'não deveria chegar aqui' }));
    const svc = createQuizRemediation({ chat });

    const semAlternativas = await svc.explain(explainReq({ assertion: assertion({ options: ['a', 'b', 'c'] }) }));
    assert.ok(!semAlternativas.ok && semAlternativas.code === QUIZ_ERROR_CODES.NOT_FOUND);

    const foraDeFaixa = await svc.explain(explainReq({ selectedIndex: 7 }));
    assert.ok(!foraDeFaixa.ok && foraDeFaixa.code === QUIZ_ERROR_CODES.NOT_FOUND);
    assert.ok(!foraDeFaixa.ok && /não existe nesse quiz/.test(foraDeFaixa.message));

    const semErro = await svc.explain(explainReq({ selectedIndex: 0 }));
    assert.ok(!semErro.ok && semErro.code === QUIZ_ERROR_CODES.NOT_FOUND);
    assert.ok(!semErro.ok && /a correta/.test(semErro.message), 'explicar erro que não houve é recusado');

    assert.equal(calls.length, 0, 'nenhuma chamada de LLM para pedido inválido');
  });

  it('pedido válido ⇒ explica com temperature 0.3 / 45s e devolve o texto', async () => {
    const { chat, calls } = chatFake(async () => ({ content: '  A opção escolhida descreve…  ' }));
    const reply = await createQuizRemediation({ chat }).explain(explainReq());
    assert.deepEqual(reply, { ok: true, explanation: 'A opção escolhida descreve…' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].temperature, 0.3);
    assert.equal(calls[0].timeoutMs, 45_000);
    assert.equal(calls[0].messages[0].role, 'system');
    assert.equal(calls[0].messages[1].role, 'user');
    assert.ok(calls[0].messages[0].content.includes('CLASSIFIQUE o erro ANTES'));
  });

  it('resposta vazia ⇒ QUIZ_EMPTY_REPLY; transporte falha ⇒ QUIZ_UNAVAILABLE (nunca lança)', async () => {
    const vazia = createQuizRemediation({ chat: chatFake(async () => ({ content: '   ' })).chat });
    const r1 = await vazia.explain(explainReq());
    assert.ok(!r1.ok && r1.code === QUIZ_ERROR_CODES.EMPTY_REPLY);
    assert.ok(!r1.ok && /respondeu vazio/.test(r1.message));

    const quebrado = createQuizRemediation({
      chat: async () => {
        throw new Error('timeout do transport');
      },
    });
    const r2 = await quebrado.explain(explainReq());
    assert.ok(!r2.ok && r2.code === QUIZ_ERROR_CODES.UNAVAILABLE);
    assert.ok(!r2.ok && /não respondeu/.test(r2.message));
  });
});

describe('cx/quizRemediation: remedial — o quiz novo validado antes de chegar ao aluno', () => {
  it('pedido degenerado (origem/geração/id colidindo) ⇒ QUIZ_NOT_FOUND sem LLM', async () => {
    const { chat, calls } = chatFake(async () => ({ content: JSON.stringify(draftQuiz()) }));
    const svc = createQuizRemediation({ chat });

    const semOrigem = await svc.remedial(remedialReq({ originAssertionId: '   ' }));
    assert.ok(!semOrigem.ok && semOrigem.code === QUIZ_ERROR_CODES.NOT_FOUND);

    const geracaoRuim = await svc.remedial(remedialReq({ generation: 0 }));
    assert.ok(!geracaoRuim.ok && geracaoRuim.code === QUIZ_ERROR_CODES.NOT_FOUND);
    assert.ok(!geracaoRuim.ok && /1, 2, 3/.test(geracaoRuim.message));

    // origem JÁ remedial pedindo a MESMA geração ⇒ a id nova colidiria.
    const degenerado = await svc.remedial(
      remedialReq({ originAssertionId: 'af-1#g1', generation: 1, assertion: assertion() }),
    );
    assert.ok(!degenerado.ok && degenerado.code === QUIZ_ERROR_CODES.NOT_FOUND);
    assert.ok(!degenerado.ok && /colidiria/.test(degenerado.message));
    assert.equal(calls.length, 0);
  });

  it('quiz novo ⇒ ok com id/posição normalizados e temperature 0.7 / 60s', async () => {
    const req = remedialReq();
    const required = requiredAnswerIndexFor(req);
    const { chat, calls } = chatFake(async () => ({ content: JSON.stringify(draftQuiz()) }));
    const reply = await createQuizRemediation({ chat }).remedial(req);

    assert.ok(reply.ok);
    if (reply.ok) {
      assert.equal(reply.quiz.id, remedialQuizIdFor(req));
      assert.equal(reply.quiz.answerIndex, required);
      assert.equal(reply.quiz.options[required], 'correta nova');
      assert.equal(reply.quiz.originAssertionId, 'af-1');
    }
    assert.equal(calls[0].temperature, 0.7);
    assert.equal(calls[0].timeoutMs, 60_000);
  });

  it('quiz fora do formato ou repetido ⇒ QUIZ_INVALID_QUIZ (nunca quiz malformado na tela)', async () => {
    const lixo = createQuizRemediation({ chat: chatFake(async () => ({ content: 'isto não é JSON' })).chat });
    const r1 = await lixo.remedial(remedialReq());
    assert.ok(!r1.ok && r1.code === QUIZ_ERROR_CODES.INVALID_QUIZ);
    assert.ok(!r1.ok && /fora do formato/.test(r1.message));

    const repetido = createQuizRemediation({
      chat: chatFake(async () => ({
        content: JSON.stringify(draftQuiz({ question: 'O que é uma função em JavaScript?' })),
      })).chat,
    });
    const r2 = await repetido.remedial(remedialReq());
    assert.ok(!r2.ok && r2.code === QUIZ_ERROR_CODES.INVALID_QUIZ);
  });
});

// ─── BUG marcado (não corrigido aqui) ───────────────────────────────────────

describe('cx/quizRemediation: defeitos nomeados (NÃO corrigidos — apenas registrados)', () => {
  it('caracterização atual: o trim final SÓ acontece sem espaço à direita', () => {
    assert.equal(normalizeForCompare('  Olá, Mundo!!  '), 'ola, mundo!!');
    assert.equal(normalizeForCompare('Olá, Mundo!!'), 'ola, mundo');
  });

  it(
    'BUG: normalizeForCompare não tira pontuação final quando há espaço à direita — quizRemediation.ts:146-154',
    {
      todo: 'BUG: normalizeForCompare("Q?! ") !== normalizeForCompare("Q") — a pontuação final só é removida sem whitespace à direita, e o nunca-repetir/unicidade deixa de casar duplicatas — quizRemediation.ts:146-154',
    },
    () => {
      // Comportamento CORRETO: a normalização para comparação não pode depender
      // de whitespace à direita — 'Q?! ' e 'q' são a MESMA pergunta.
      assert.equal(normalizeForCompare('O que é?!  '), normalizeForCompare('O que é'));
    },
  );
});
