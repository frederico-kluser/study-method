/**
 * tests/quizRemediation.test.ts — o CICLO DE REMEDIAÇÃO do quiz
 * (electron/main/services/quizRemediation.ts), com `chat` FAKE injetado:
 * ZERO rede, ZERO LLM, ZERO disco (só a leitura do próprio fonte na trava
 * anti-rede do fim do arquivo).
 *
 * O que esta suíte trava, em quatro frentes:
 *
 *  1. O PROMPT é função PURA e diz o que a pedagogia manda dizer. Cada regra
 *     `ERR-*` de `skills/study-method/references/pedagogia.md` vira uma
 *     asserção sobre o texto montado — e o que é PROIBIDO (elogio ritualizado,
 *     percentual de domínio, URL/fonte, o imperativo "pense profundamente,
 *     passo a passo" que este repo removeu por ser anti-padrão) não pode
 *     aparecer. Prompt é código: se ninguém o testa, ele apodrece.
 *
 *  2. A RECORRÊNCIA (`ERR-4`) é bloco ADITIVO: no PRIMEIRO erro o texto é
 *     byte-idêntico ao caminho normal (a mesma disciplina de
 *     `buildErrorContextSection` em tutorChat.ts), e a partir do segundo o
 *     bloco entra com o NÚMERO derivado do `#g<N>` — nunca inventado.
 *
 *  3. FAIL-CLOSED em todo caminho de falha, cada um com o seu código: sem
 *     `chat` → UNAVAILABLE; chat que lança (rede/timeout) → UNAVAILABLE;
 *     resposta vazia → EMPTY_REPLY; pedido sem afirmação utilizável →
 *     NOT_FOUND *sem gastar uma chamada de LLM*; quiz malformado da LLM →
 *     INVALID_QUIZ. Nunca uma explicação inventada, nunca um quiz torto.
 *
 *  4. A VALIDAÇÃO do quiz que a LLM devolveu, uma asserção por regra (3
 *     opções, opção vazia, opções duplicadas, answerIndex fora de faixa,
 *     optionRationales com comprimento errado), o nunca-repetir
 *     (`askedQuestions`) e a IDENTIDADE do quiz remedial: a id NUNCA é a de
 *     origem, e ela casa com a convenção `<chave>#g<N>` do renderer —
 *     `remediationAssertionId`/`quizKeyFor` de `src/lib/trackLessonState.ts`
 *     são importadas aqui para travar as duas implementações NOS DOIS
 *     SENTIDOS (a do main é espelho, não import).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  QUIZ_ERROR_CODES,
  type QuizExplainRequest,
  type QuizRemedialRequest,
  type TrackAssertionDto,
  type TrackTheorySectionDto,
} from '../shared/ipc-contract';
import {
  buildExplainPrompt,
  buildRecurrenceSection,
  buildRemedialPrompt,
  askedQuestionsOf,
  createQuizRemediation,
  parseRemedialQuiz,
  recurrenceOf,
  remedialQuizIdFor,
} from '../electron/main/services/quizRemediation';
import type { ChatFn } from '../electron/main/services/tutorChat';
import { quizKeyFor, remediationAssertionId } from '../src/lib/trackLessonState';

const HERE = dirname(fileURLToPath(import.meta.url));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const THEORY: TrackTheorySectionDto = {
  id: 'sec-saida',
  title: 'A saída do programa',
  markdown: 'print escreve o valor na tela — a saída padrão do programa.',
  code: { language: 'python', code: 'print("oi")', explanation: 'escreve oi na tela' },
};

const ASSERTION: TrackAssertionDto = {
  id: 'a-print-mostra',
  statement: 'print() mostra o valor na tela.',
  question: 'O que print("oi") faz?',
  options: [
    'Escreve oi na tela',
    'Guarda oi numa variável chamada oi',
    'Apaga o que já estava na tela',
    'Devolve oi para quem chamou, sem mostrar',
  ],
  answerIndex: 0,
  feedback: 'print() escreve na saída padrão.',
  sectionId: 'sec-saida',
  optionRationales: [
    'É o que a seção demonstra.',
    'Guardar valor é atribuição, não print.',
    'print não limpa a tela.',
    'print não devolve o valor: ele o escreve.',
  ],
};

/** A chave do ciclo desta afirmação, na régua do renderer. */
const CHAVE = quizKeyFor(ASSERTION);

function explainReq(over: Partial<QuizExplainRequest> = {}): QuizExplainRequest {
  return {
    trackSlug: 'python',
    lessonId: 'a-primeira-linha',
    sectionKey: CHAVE,
    assertion: ASSERTION,
    selectedIndex: 1,
    theorySection: THEORY,
    lessonExcerpt: 'A aula 1 mostra print("oi") e nada mais.',
    ...over,
  };
}

function remedialReq(over: Partial<QuizRemedialRequest> = {}): QuizRemedialRequest {
  return {
    trackSlug: 'python',
    lessonId: 'a-primeira-linha',
    sectionKey: CHAVE,
    originAssertionId: ASSERTION.id,
    generation: 1,
    assertion: ASSERTION,
    explanation: 'A alternativa que você escolheu guarda o valor, não mostra.',
    askedQuestions: [ASSERTION.question],
    theorySection: THEORY,
    lessonExcerpt: 'A aula 1 mostra print("oi") e nada mais.',
    ...over,
  };
}

/** Um quiz BEM-FORMADO, como a LLM deveria devolver. */
function bomQuiz(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    statement: 'print() escreve o valor na saída do programa.',
    question: 'Depois de print(2 + 3), o que aparece na tela?',
    options: ['5', 'a conta 2 + 3', 'nada', 'um erro'],
    answerIndex: 0,
    feedback: 'A conta é feita antes; print escreve o resultado.',
    optionRationales: [
      'A conta vira 5 antes de print escrever.',
      'print recebe o resultado, não o texto da conta.',
      'print sempre escreve o que recebe.',
      'Não há erro: somar dois números é válido.',
    ],
    ...over,
  };
}

type ChatReq = Parameters<ChatFn>[0];

/** `chat` FAKE: grava as chamadas e devolve o que o teste mandar. */
function makeChat(respond: string | ((req: ChatReq) => Promise<{ content: string }>)): {
  chat: ChatFn;
  calls: ChatReq[];
} {
  const calls: ChatReq[] = [];
  const chat: ChatFn = async (req) => {
    calls.push(req);
    return typeof respond === 'string' ? { content: respond } : respond(req);
  };
  return { chat, calls };
}

/** O prompt de sistema da última chamada (o que o modelo realmente recebeu). */
function systemOf(calls: ChatReq[]): string {
  const last = calls[calls.length - 1];
  return last.messages.find((m) => m.role === 'system')?.content ?? '';
}

// ─── 1. O prompt da EXPLICAÇÃO (função pura) ─────────────────────────────────

describe('quizRemediation: o prompt da explicação carrega o contexto do erro', () => {
  const prompt = buildExplainPrompt(explainReq());

  it('traz a afirmação, a pergunta e TODAS as alternativas', () => {
    assert.ok(prompt.includes(ASSERTION.statement));
    assert.ok(prompt.includes(ASSERTION.question));
    for (const o of ASSERTION.options) assert.ok(prompt.includes(o), `faltou a alternativa: ${o}`);
  });

  it('marca a alternativa ESCOLHIDA e a CORRETA (as duas, sem ambiguidade)', () => {
    assert.match(prompt, /ALTERNATIVA ESCOLHIDA PELO ALUNO \(a errada\): \[1\] Guarda oi/);
    assert.match(prompt, /ALTERNATIVA CORRETA: \[0\] Escreve oi na tela/);
    assert.ok(prompt.includes('← ESCOLHIDA PELO ALUNO'));
    assert.ok(prompt.includes('← CORRETA'));
  });

  it('traz a SEÇÃO DE TEORIA que demonstra a afirmação (com o código dela) e o material da aula', () => {
    assert.ok(prompt.includes('[id=sec-saida]'));
    assert.ok(prompt.includes(THEORY.markdown));
    assert.ok(prompt.includes('print("oi")'));
    assert.ok(prompt.includes('A aula 1 mostra print("oi") e nada mais.'));
  });

  it('traz os racionais autorais de cada alternativa quando a afirmação os declara', () => {
    assert.ok(prompt.includes('racional autoral: Guardar valor é atribuição, não print.'));
  });

  it('degrada sem seção nem material: diz que não vieram, em vez de fingir que vieram', () => {
    const sem = buildExplainPrompt(explainReq({ theorySection: null, lessonExcerpt: undefined }));
    assert.ok(sem.includes('SEÇÃO DE TEORIA QUE DEMONSTRA A AFIRMAÇÃO: (não veio no pedido)'));
    assert.ok(sem.includes('MATERIAL DA AULA: (não veio no pedido'));
  });
});

describe('quizRemediation: o prompt da explicação É a pedagogia (ERR-1..ERR-8)', () => {
  const prompt = buildExplainPrompt(explainReq());

  it('ERR-1 — classifica ANTES de responder e CONSOME a classificação do módulo de proficiência', () => {
    assert.ok(prompt.includes('CLASSIFIQUE o erro ANTES de escrever'));
    assert.ok(prompt.includes('módulo de proficiência'));
    assert.ok(prompt.includes('DESLIZE'));
    assert.ok(prompt.includes('EQUÍVOCO CONCEITUAL'));
    // "consuma, não redefina": o prompt proíbe criar outra taxonomia.
    assert.ok(prompt.includes('Não crie outra classificação'));
  });

  it('ERR-2 — deslize: apontamento imediato, curto, SEM reensino e SEM escada', () => {
    assert.match(prompt, /DESLIZE: apontamento imediato e curto/);
    assert.ok(prompt.includes('SEM reensino, SEM escada de dicas'));
  });

  it('ERR-3 — equívoco conceitual: NÃO corrija de imediato; pergunte antes o que ele esperava (C-8)', () => {
    assert.ok(prompt.includes('NÃO corrija de imediato'));
    assert.ok(prompt.includes('O QUE O ALUNO ESPERAVA'));
    assert.ok(prompt.includes('só depois aponte onde isso diverge'));
  });

  it('ERR-5 — o erro é nomeado na alternativa, NUNCA no aluno (com as frases proibidas literais)', () => {
    assert.ok(prompt.includes('NUNCA no aluno'));
    for (const frase of [
      'você não prestou atenção',
      'você está confundindo tudo',
      'isso é básico',
      'de novo?',
    ]) {
      assert.ok(prompt.includes(frase), `faltou proibir: ${frase}`);
    }
  });

  it('ERR-6 — reconhecimento antes da correção SÓ com mérito específico', () => {
    assert.ok(prompt.includes('mérito ESPECÍFICO'));
    assert.ok(prompt.includes('Sem mérito específico, vá direto ao erro'));
  });

  it('ERR-8 — fecha o erro com a VERIFICAÇÃO: a pergunta nova sobre a mesma ideia', () => {
    assert.ok(prompt.includes('vem uma pergunta NOVA sobre a mesma ideia'));
  });

  it('ux §8.2 — proíbe elogio ritualizado e pede feedback informacional específico', () => {
    assert.ok(prompt.includes('PROIBIDO elogio ritualizado'));
    assert.ok(prompt.includes('feedback informacional específico'));
    // e não MANDA elogiar em lugar nenhum:
    assert.doesNotMatch(prompt, /\belogie\b|\bparabenize\b/i);
  });

  it('docs/02 §9 — nada de "você já domina X" nem de percentual de domínio', () => {
    assert.doesNotMatch(prompt, /você já domina/i);
    assert.ok(prompt.includes('PROIBIDO qualquer percentual, nota ou porcentagem de domínio'));
  });

  it('regra 5 do tutor — NUNCA mostrar URLs ou fontes (e o próprio prompt não traz nenhuma)', () => {
    assert.ok(prompt.includes('NUNCA mostre URLs ou fontes'));
    assert.doesNotMatch(prompt, /https?:\/\//);
  });

  it('C-3 — no máximo UMA pergunta, e o tutor não a responde', () => {
    assert.ok(prompt.includes('No máximo UMA pergunta'));
  });

  it('ANTI-PADRÃO: nenhum imperativo de raciocínio no texto (profundidade é parâmetro)', () => {
    assert.doesNotMatch(prompt, /pense profundamente/i);
    assert.doesNotMatch(prompt, /passo a passo/i);
  });
});

// ─── 2. ERR-4: a recorrência é bloco ADITIVO e o número tem lastro ───────────

describe('quizRemediation: ERR-4 — a recorrência é nomeada como fato, nunca inventada', () => {
  it('PRIMEIRO erro (quiz autoral): bloco vazio e o prompt sem uma linha de recorrência', () => {
    const req = explainReq({ quizOrigin: 'authored' });
    assert.equal(buildRecurrenceSection(req), '');
    assert.deepEqual(recurrenceOf(req), { recurrent: false, ordinal: null });
    assert.ok(!buildExplainPrompt(req).includes('RECORRÊNCIA'));
  });

  it('o bloco é ADITIVO: com recorrência o prompt é o anterior MAIS o bloco (byte a byte)', () => {
    const base = explainReq({ quizOrigin: 'authored' });
    const rec = explainReq({ quizOrigin: 'remedial' });
    const bloco = buildRecurrenceSection(rec);
    assert.notEqual(bloco, '');
    assert.equal(buildExplainPrompt(rec), `${buildExplainPrompt(base)}\n\n${bloco}`);
  });

  it('a id `<chave>#g1` do quiz errado dá a 2ª vez; `#g3` dá a 4ª', () => {
    const g1 = explainReq({
      assertion: { ...ASSERTION, id: remediationAssertionId(CHAVE, 1) },
      quizOrigin: 'remedial',
    });
    assert.deepEqual(recurrenceOf(g1), { recurrent: true, ordinal: 2 });
    assert.ok(buildExplainPrompt(g1).includes('Esta é a 2ª vez seguida'));

    const g3 = explainReq({
      assertion: { ...ASSERTION, id: remediationAssertionId(CHAVE, 3) },
      quizOrigin: 'remedial',
    });
    assert.deepEqual(recurrenceOf(g3), { recurrent: true, ordinal: 4 });
    assert.ok(buildExplainPrompt(g3).includes('Esta é a 4ª vez seguida'));
  });

  it('recorrente SEM número derivável: manda nomear a repetição SEM inventar cifra', () => {
    const req = explainReq({ quizOrigin: 'remedial' });
    assert.deepEqual(recurrenceOf(req), { recurrent: true, ordinal: null });
    const prompt = buildExplainPrompt(req);
    assert.ok(prompt.includes('SEM inventar um número'));
    assert.doesNotMatch(prompt, /ª vez seguida/);
  });

  it('o bloco manda TROCAR de estratégia e nomear o erro, nunca a pessoa', () => {
    const bloco = buildRecurrenceSection(explainReq({ quizOrigin: 'remedial' }));
    assert.ok(bloco.includes('TROQUE DE ESTRATÉGIA'));
    assert.ok(bloco.includes('bajulação por omissão'));
    assert.ok(bloco.includes('nunca sobre a pessoa'));
  });
});

// ─── 3. explain: caminhos de falha e caminho feliz ───────────────────────────

describe('quizRemediation.explain: FAIL-CLOSED em cada caminho de falha', () => {
  it('sem `chat` injetada → QUIZ_UNAVAILABLE (nunca uma explicação inventada)', async () => {
    const out = await createQuizRemediation().explain(explainReq());
    assert.equal(out.ok, false);
    assert.equal(out.ok === false && out.code, QUIZ_ERROR_CODES.UNAVAILABLE);
    assert.ok(out.ok === false && out.message.length > 0);
  });

  it('chat que LANÇA (rede/timeout) → QUIZ_UNAVAILABLE, sem propagar a exceção', async () => {
    const chat: ChatFn = async () => {
      throw new Error('ETIMEDOUT');
    };
    const out = await createQuizRemediation({ chat }).explain(explainReq());
    assert.equal(out.ok === false && out.code, QUIZ_ERROR_CODES.UNAVAILABLE);
    assert.ok(out.ok === false && out.message.includes('ETIMEDOUT'));
  });

  it('resposta VAZIA (ou só espaço) → QUIZ_EMPTY_REPLY', async () => {
    const { chat } = makeChat('   \n  ');
    const out = await createQuizRemediation({ chat }).explain(explainReq());
    assert.equal(out.ok === false && out.code, QUIZ_ERROR_CODES.EMPTY_REPLY);
  });

  it('pedido sem afirmação utilizável → NOT_FOUND e ZERO chamada de LLM', async () => {
    const { chat, calls } = makeChat('nunca deveria ser chamado');
    const service = createQuizRemediation({ chat });
    const semAssertion = await service.explain(
      explainReq({ assertion: undefined as unknown as TrackAssertionDto }),
    );
    const semOpcoes = await service.explain(
      explainReq({ assertion: { ...ASSERTION, options: [] } }),
    );
    const respostaTorta = await service.explain(
      explainReq({ assertion: { ...ASSERTION, answerIndex: 9 } }),
    );
    for (const out of [semAssertion, semOpcoes, respostaTorta]) {
      assert.equal(out.ok === false && out.code, QUIZ_ERROR_CODES.NOT_FOUND);
    }
    assert.equal(calls.length, 0, 'nenhum crédito de LLM pode ser gasto num pedido torto');
  });

  it('afirmação com número de opções FORA do contrato (2 ou 3, nem 4) → NOT_FOUND, ZERO chamada de LLM', async () => {
    // O contrato da trilha (`TrackAssertion`/`TrackAssertionDto`,
    // `validateAssertions` em content/trackTypes.ts, `.length(4)` em
    // engine/schemas/artifacts.ts, e o próprio `QUIZ_OPTION_COUNT`/
    // `parseRemedialQuiz` deste arquivo) exige EXATAMENTE 4 opções. Uma
    // afirmação com 2 ou 3 não é "legado tolerado": é dado fora do contrato,
    // e `assertionIsUsable` precisa recusá-la ANTES de gastar LLM — nunca
    // devolver `{ ok:true }` para algo que nenhuma outra camada aceitaria.
    const { chat, calls } = makeChat('nunca deveria ser chamado');
    const service = createQuizRemediation({ chat });
    const duasOpcoes = await service.explain(
      explainReq({ assertion: { ...ASSERTION, options: ['Escreve oi na tela', 'Guarda oi'], answerIndex: 0 } }),
    );
    const tresOpcoes = await service.explain(
      explainReq({
        assertion: { ...ASSERTION, options: ['Escreve oi na tela', 'Guarda oi', 'Apaga a tela'], answerIndex: 0 },
      }),
    );
    for (const out of [duasOpcoes, tresOpcoes]) {
      assert.equal(out.ok, false);
      assert.equal(out.ok === false && out.code, QUIZ_ERROR_CODES.NOT_FOUND);
    }
    assert.equal(calls.length, 0, '2 ou 3 opções não é afirmação utilizável: a LLM não pode ser chamada');
  });

  it('índice escolhido fora de faixa → NOT_FOUND sem chamar a LLM', async () => {
    const { chat, calls } = makeChat('x');
    const service = createQuizRemediation({ chat });
    for (const selectedIndex of [-1, 4, 1.5, Number.NaN]) {
      const out = await service.explain(explainReq({ selectedIndex }));
      assert.equal(out.ok === false && out.code, QUIZ_ERROR_CODES.NOT_FOUND, `índice ${selectedIndex}`);
    }
    assert.equal(calls.length, 0);
  });

  it('a alternativa escolhida É a correta → NOT_FOUND (não se fabrica um erro que não houve)', async () => {
    const { chat, calls } = makeChat('x');
    const out = await createQuizRemediation({ chat }).explain(explainReq({ selectedIndex: 0 }));
    assert.equal(out.ok === false && out.code, QUIZ_ERROR_CODES.NOT_FOUND);
    assert.equal(calls.length, 0);
  });
});

describe('quizRemediation.explain: caminho feliz', () => {
  it('devolve a explicação da LLM (trim) e manda o prompt PURO como mensagem de sistema', async () => {
    const { chat, calls } = makeChat('  A alternativa 2 guarda o valor; a seção mostra o contrário.  ');
    const req = explainReq();
    const out = await createQuizRemediation({ chat }).explain(req);
    assert.equal(out.ok, true);
    assert.equal(
      out.ok === true && out.explanation,
      'A alternativa 2 guarda o valor; a seção mostra o contrário.',
    );
    assert.equal(calls.length, 1);
    assert.equal(systemOf(calls), buildExplainPrompt(req));
    assert.equal(calls[0].messages[0].role, 'system');
    assert.equal(calls[0].messages[1].role, 'user');
  });

  it('a chamada tem temperatura baixa e TIMEOUT (o renderer nunca fica em spinner infinito)', async () => {
    const { chat, calls } = makeChat('ok');
    await createQuizRemediation({ chat }).explain(explainReq());
    assert.equal(calls[0].temperature, 0.3);
    assert.ok(typeof calls[0].timeoutMs === 'number' && calls[0].timeoutMs > 0);
  });
});

// ─── 4. remedial: prompt, identidade e nunca-repetir ─────────────────────────

describe('quizRemediation: o prompt do quiz novo', () => {
  const prompt = buildRemedialPrompt(remedialReq({ askedQuestions: ['Quantas linhas tem a aula?'] }));

  it('cobra o MESMO conteúdo: afirmação de origem, explicação lida, teoria e material', () => {
    assert.ok(prompt.includes(ASSERTION.statement));
    assert.ok(prompt.includes('A alternativa que você escolheu guarda o valor, não mostra.'));
    assert.ok(prompt.includes(THEORY.markdown));
    assert.ok(prompt.includes('A aula 1 mostra print("oi") e nada mais.'));
  });

  it('lista o NUNCA-REPETIR — inclusive a pergunta de origem, mesmo quando o chamador a esquece', () => {
    assert.ok(prompt.includes('NÃO REPITA NENHUMA'));
    assert.ok(prompt.includes(`- ${ASSERTION.question}`));
    assert.ok(prompt.includes('- Quantas linhas tem a aula?'));
    assert.deepEqual(askedQuestionsOf(remedialReq({ askedQuestions: [] })), [ASSERTION.question]);
  });

  it('pede EXATAMENTE 4 alternativas únicas e os 4 optionRationales (um por alternativa)', () => {
    assert.ok(prompt.includes('EXATAMENTE 4 alternativas, todas diferentes entre si'));
    assert.ok(prompt.includes('"optionRationales" tem EXATAMENTE 4 itens'));
    assert.ok(prompt.includes('"answerIndex" é o índice inteiro (0 a 3)'));
  });

  it('proíbe o mesmo que a explicação proíbe: elogio, domínio, percentual, URL, imperativo de raciocínio', () => {
    assert.ok(prompt.includes('nada de "você já domina"'));
    assert.ok(prompt.includes('nada de percentual ou nota de domínio'));
    assert.ok(prompt.includes('NUNCA inclua URLs ou fontes'));
    assert.doesNotMatch(prompt, /https?:\/\//);
    assert.doesNotMatch(prompt, /pense profundamente|passo a passo/i);
  });
});

describe('quizRemediation.remedial: a IDENTIDADE do quiz gerado', () => {
  it('a id NUNCA é a da afirmação de origem — e segue a convenção `<chave>#g<N>` do renderer', async () => {
    const { chat } = makeChat(JSON.stringify(bomQuiz()));
    const req = remedialReq();
    const out = await createQuizRemediation({ chat }).remedial(req);
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.notEqual(out.quiz.id, req.originAssertionId);
    // ida: a id é exatamente a que o renderer geraria…
    assert.equal(out.quiz.id, remediationAssertionId(CHAVE, 1));
    // …e volta: `quizKeyFor` reverte a id remedial para a chave do ciclo.
    assert.equal(quizKeyFor({ id: out.quiz.id, sectionId: out.quiz.sectionId }), CHAVE);
    assert.equal(remedialQuizIdFor(req), out.quiz.id);
  });

  it('preserva a origem, a geração e a âncora de seção; os racionais chegam completos', async () => {
    const { chat } = makeChat(JSON.stringify(bomQuiz()));
    const out = await createQuizRemediation({ chat }).remedial(remedialReq({ generation: 2 }));
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.quiz.originAssertionId, ASSERTION.id);
    assert.equal(out.quiz.generation, 2);
    assert.equal(out.quiz.sectionId, 'sec-saida');
    assert.equal(out.quiz.id, remediationAssertionId(CHAVE, 2));
    assert.equal(out.quiz.options.length, 4);
    assert.equal(out.quiz.optionRationales?.length, 4);
  });

  it('a âncora e a identidade são do PRODUTO: id/sectionId que a LLM inventar são ignorados', async () => {
    const { chat } = makeChat(
      JSON.stringify(bomQuiz({ id: 'id-que-a-llm-inventou', sectionId: 'secao-inventada', generation: 99 })),
    );
    const out = await createQuizRemediation({ chat }).remedial(remedialReq());
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.quiz.id, remediationAssertionId(CHAVE, 1));
    assert.equal(out.quiz.sectionId, 'sec-saida');
    assert.equal(out.quiz.generation, 1);
  });

  it('afirmação SEM sectionId: a chave é a id sozinha e a id remedial continua distinta', async () => {
    const semSecao: TrackAssertionDto = { ...ASSERTION, sectionId: undefined };
    const { chat } = makeChat(JSON.stringify(bomQuiz()));
    const req = remedialReq({ assertion: semSecao, sectionKey: quizKeyFor(semSecao) });
    const out = await createQuizRemediation({ chat }).remedial(req);
    assert.equal(out.ok, true);
    if (!out.ok) return;
    assert.equal(out.quiz.id, `${ASSERTION.id}#g1`);
    assert.notEqual(out.quiz.id, req.originAssertionId);
    assert.equal(out.quiz.sectionId, undefined);
    assert.equal(quizKeyFor({ id: out.quiz.id }), ASSERTION.id);
  });

  it('pedido DEGENERADO cuja id colidiria com a origem → NOT_FOUND, sem chamar a LLM', async () => {
    const { chat, calls } = makeChat('x');
    const out = await createQuizRemediation({ chat }).remedial(
      remedialReq({
        assertion: { ...ASSERTION, sectionId: undefined },
        originAssertionId: `${ASSERTION.id}#g2`,
        generation: 2,
      }),
    );
    assert.equal(out.ok === false && out.code, QUIZ_ERROR_CODES.NOT_FOUND);
    assert.equal(calls.length, 0);
  });
});

describe('quizRemediation.remedial: FAIL-CLOSED', () => {
  it('sem `chat` → QUIZ_UNAVAILABLE (sem LLM não existe quiz)', async () => {
    const out = await createQuizRemediation().remedial(remedialReq());
    assert.equal(out.ok === false && out.code, QUIZ_ERROR_CODES.UNAVAILABLE);
  });

  it('chat que LANÇA → QUIZ_UNAVAILABLE; resposta vazia → QUIZ_EMPTY_REPLY', async () => {
    const explode: ChatFn = async () => {
      throw new Error('ECONNRESET');
    };
    const a = await createQuizRemediation({ chat: explode }).remedial(remedialReq());
    assert.equal(a.ok === false && a.code, QUIZ_ERROR_CODES.UNAVAILABLE);

    const { chat } = makeChat('');
    const b = await createQuizRemediation({ chat }).remedial(remedialReq());
    assert.equal(b.ok === false && b.code, QUIZ_ERROR_CODES.EMPTY_REPLY);
  });

  it('geração inválida ou origem vazia → NOT_FOUND sem gastar LLM', async () => {
    const { chat, calls } = makeChat('x');
    const service = createQuizRemediation({ chat });
    for (const generation of [0, -1, 1.5]) {
      const out = await service.remedial(remedialReq({ generation }));
      assert.equal(out.ok === false && out.code, QUIZ_ERROR_CODES.NOT_FOUND, `geração ${generation}`);
    }
    const semOrigem = await service.remedial(remedialReq({ originAssertionId: '  ' }));
    assert.equal(semOrigem.ok === false && semOrigem.code, QUIZ_ERROR_CODES.NOT_FOUND);
    assert.equal(calls.length, 0);
  });

  it('afirmação de origem com 2 ou 3 opções (fora do contrato de 4) → NOT_FOUND sem gastar LLM', async () => {
    const { chat, calls } = makeChat('nunca deveria ser chamado');
    const service = createQuizRemediation({ chat });
    const duasOpcoes = await service.remedial(
      remedialReq({ assertion: { ...ASSERTION, options: ['Escreve oi na tela', 'Guarda oi'], answerIndex: 0 } }),
    );
    assert.equal(duasOpcoes.ok === false && duasOpcoes.code, QUIZ_ERROR_CODES.NOT_FOUND);
    assert.equal(calls.length, 0, '2 opções não é afirmação utilizável: a LLM não pode ser chamada');
  });

  it('a chamada do quiz novo também tem timeout (nunca spinner infinito)', async () => {
    const { chat, calls } = makeChat(JSON.stringify(bomQuiz()));
    await createQuizRemediation({ chat }).remedial(remedialReq());
    assert.ok(typeof calls[0].timeoutMs === 'number' && calls[0].timeoutMs > 0);
    assert.equal(systemOf(calls), buildRemedialPrompt(remedialReq()));
  });
});

// ─── 5. A validação do quiz que a LLM devolveu (uma asserção por regra) ──────

describe('quizRemediation.remedial: quiz malformado da LLM é REJEITADO (INVALID_QUIZ)', () => {
  async function rejeita(payload: unknown, motivo: string): Promise<void> {
    const { chat } = makeChat(typeof payload === 'string' ? payload : JSON.stringify(payload));
    const out = await createQuizRemediation({ chat }).remedial(remedialReq());
    assert.equal(out.ok, false, `deveria REJEITAR: ${motivo}`);
    assert.equal(out.ok === false && out.code, QUIZ_ERROR_CODES.INVALID_QUIZ, motivo);
  }

  it('3 opções (menos que 4)', async () => {
    await rejeita(bomQuiz({ options: ['5', 'a conta', 'nada'] }), '3 opções');
  });

  it('5 opções (mais que 4)', async () => {
    await rejeita(bomQuiz({ options: ['5', 'a conta', 'nada', 'erro', 'sei lá'] }), '5 opções');
  });

  it('opção VAZIA (ou só espaço)', async () => {
    await rejeita(bomQuiz({ options: ['5', '   ', 'nada', 'erro'] }), 'opção vazia');
  });

  it('opções DUPLICADAS — inclusive quando só mudam caixa, acento ou pontuação', async () => {
    await rejeita(bomQuiz({ options: ['5', '5', 'nada', 'erro'] }), 'duplicata literal');
    await rejeita(bomQuiz({ options: ['A conta', 'a  conta.', 'nada', 'erro'] }), 'duplicata normalizada');
  });

  it('answerIndex fora de faixa (-1, 4) ou não-inteiro (1.5, "0")', async () => {
    await rejeita(bomQuiz({ answerIndex: -1 }), 'answerIndex -1');
    await rejeita(bomQuiz({ answerIndex: 4 }), 'answerIndex 4');
    await rejeita(bomQuiz({ answerIndex: 1.5 }), 'answerIndex 1.5');
    await rejeita(bomQuiz({ answerIndex: '0' }), 'answerIndex string');
  });

  it('optionRationales com COMPRIMENTO errado (3) ou com item vazio', async () => {
    await rejeita(bomQuiz({ optionRationales: ['a', 'b', 'c'] }), '3 racionais');
    await rejeita(bomQuiz({ optionRationales: ['a', 'b', 'c', 'd', 'e'] }), '5 racionais');
    await rejeita(bomQuiz({ optionRationales: ['a', '', 'c', 'd'] }), 'racional vazio');
    await rejeita(bomQuiz({ optionRationales: 'quatro racionais' }), 'racionais não-array');
  });

  it('statement / question / feedback vazios', async () => {
    await rejeita(bomQuiz({ statement: '  ' }), 'statement vazio');
    await rejeita(bomQuiz({ question: '' }), 'question vazia');
    await rejeita(bomQuiz({ feedback: null }), 'feedback nulo');
  });

  it('resposta sem objeto JSON nenhum (prosa, número solto, objeto vazio)', async () => {
    await rejeita('Claro! Aqui está o quiz que você pediu.', 'prosa');
    await rejeita('42', 'número');
    await rejeita({}, 'objeto vazio');
  });

  it('quiz que REPETE uma pergunta já vista (mesmo com outra caixa/pontuação) — o nunca-repetir', async () => {
    await rejeita(bomQuiz({ question: ASSERTION.question }), 'repete a pergunta de origem');
    await rejeita(bomQuiz({ question: 'o que print("oi") FAZ' }), 'repete a de origem, normalizada');
    const { chat } = makeChat(JSON.stringify(bomQuiz({ question: 'Qual é a saída?' })));
    const out = await createQuizRemediation({ chat }).remedial(
      remedialReq({ askedQuestions: [ASSERTION.question, 'qual é a saída?'] }),
    );
    assert.equal(out.ok === false && out.code, QUIZ_ERROR_CODES.INVALID_QUIZ);
  });
});

describe('quizRemediation: o que a validação ACEITA', () => {
  it('optionRationales AUSENTE ou [] passa (o campo some do DTO, INV-05)', () => {
    const semRacionais = parseRemedialQuiz(
      { ...bomQuiz(), optionRationales: undefined },
      remedialReq(),
    );
    assert.ok(semRacionais);
    assert.equal(semRacionais?.optionRationales, undefined);

    const vazio = parseRemedialQuiz({ ...bomQuiz(), optionRationales: [] }, remedialReq());
    assert.ok(vazio);
    assert.equal(vazio?.optionRationales, undefined);
  });

  it('quiz VÁLIDO embrulhado num array é extraído (a tolerância é a de extractFirstJsonObject)', async () => {
    const { chat } = makeChat(JSON.stringify([bomQuiz()]));
    const out = await createQuizRemediation({ chat }).remedial(remedialReq());
    assert.equal(out.ok, true);
    assert.equal(out.ok === true && out.quiz.question, bomQuiz().question);
  });

  it('JSON dentro de cercas markdown (```json) é lido — o modelo cercar não é motivo para recusar', async () => {
    const { chat } = makeChat('Aqui:\n```json\n' + JSON.stringify(bomQuiz()) + '\n```\n');
    const out = await createQuizRemediation({ chat }).remedial(remedialReq());
    assert.equal(out.ok, true);
    assert.equal(out.ok === true && out.quiz.question, bomQuiz().question);
  });

  it('trim em tudo: enunciado, pergunta, alternativas, feedback e racionais chegam limpos', () => {
    const quiz = parseRemedialQuiz(
      bomQuiz({
        statement: '  com espaço  ',
        question: '  a pergunta nova?  ',
        options: [' 5 ', ' a conta ', ' nada ', ' erro '],
        feedback: '  o porquê  ',
        optionRationales: [' a ', ' b ', ' c ', ' d '],
      }),
      remedialReq(),
    );
    assert.equal(quiz?.statement, 'com espaço');
    assert.equal(quiz?.question, 'a pergunta nova?');
    assert.deepEqual(quiz?.options, ['5', 'a conta', 'nada', 'erro']);
    assert.equal(quiz?.feedback, 'o porquê');
    assert.deepEqual(quiz?.optionRationales, ['a', 'b', 'c', 'd']);
  });
});

// ─── 6. A trava anti-rede ────────────────────────────────────────────────────

describe('quizRemediation: o serviço NÃO tem porta de saída própria', () => {
  it('o fonte não faz fetch/http nem importa cliente de LLM — a única porta é a `chat` injetada', () => {
    const src = readFileSync(
      join(HERE, '..', 'electron', 'main', 'services', 'quizRemediation.ts'),
      'utf8',
    );
    assert.doesNotMatch(src, /\bfetch\s*\(/);
    assert.doesNotMatch(src, /node:https?/);
    assert.doesNotMatch(src, /from '\.\/llmClient'/);
    assert.ok(src.includes('chat?: ChatFn'), 'a dependência de LLM continua sendo injetada');
  });
});
