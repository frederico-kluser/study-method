/**
 * tests/moduleMasteryJudge.test.ts — O JUIZ DE DOMÍNIO (a "análise profunda
 * usando o conteúdo das aulas") e o contrato fail-closed dele.
 *
 * O dono, literal: *"analisar profundamente usando o conteúdo das aulas e
 * propor o conhecimento que o aluno demonstrou possuir … sendo criterioso:
 * apenas parecer dominar não significa dominar"*. O juiz é o LLM lendo o
 * CONTEÚDO de cada aula + o código submetido + os testes; a régua de
 * conservadorismo é dupla:
 *
 *   - no PROMPT: a REGRA DE OURO ("apenas parecer dominar não significa
 *     dominar") + incerteza sempre contra a marcação + teste reprovado ligado
 *     à aula em `relacionada`;
 *   - no CÓDIGO: o juiz NUNCA marca sozinho — `analyzeModuleMastery` exige R1
 *     (execução) e R3 (código usa as construções) mesmo com veredito favorável
 *     (isso é a suíte irmã moduleMastery.test.ts).
 *
 * O QUE ESTA SUÍTE TRAVA:
 *   1. o prompt entrega o CONTEÚDO das aulas (resumo, conceitos, construções,
 *      teoria), o código submetido, os testes e a saída — e manda responder
 *      só JSON, no formato exato;
 *   2. `parseMasteryJudgeReply` é fail-closed: JSON ilegível, aula desconhecida,
 *      aula faltando, aula duplicada ou campo errado ⇒ null (nunca inventa);
 *   3. `judgeModuleMastery` com chat fake: veredito válido ⇒ ok; 1º reply
 *      inválido ⇒ RETENTA e aceita o 2º; dois inválidos ⇒ erro estruturado
 *      INVALID; chat fora do ar/timeout/resposta vazia ⇒ UNAVAILABLE — nos
 *      dois casos o chamador segue sem juiz e o determinístico decide.
 *
 * Reprodução: `cd app && npm test -- tests/moduleMasteryJudge.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MASTERY_JUDGE_ERROR_CODES,
  buildMasteryJudgePrompt,
  judgeModuleMastery,
  parseMasteryJudgeReply,
  type MasteryJudgeChat,
  type MasteryJudgeInput,
} from '../electron/main/services/moduleMastery';

const KNOWN = new Set(['a-print', 'a-round']);

function judgeInput(over: Partial<MasteryJudgeInput> = {}): MasteryJudgeInput {
  return {
    trackTitle: 'Python Iniciante',
    moduleTitle: 'A tela',
    lessons: [
      {
        lessonId: 'a-print',
        title: 'A primeira linha',
        summary: 'Você escreve uma linha e ela aparece na tela.',
        concepts: ['imprimir'],
        productiveAtoms: ['global:print', 'node:Call'],
        theoryExcerpt: 'print("bom dia") mostra o texto na tela.',
      },
      {
        lessonId: 'a-round',
        title: 'Duas casas',
        summary: 'O round arredonda para duas casas.',
        concepts: ['arredondar'],
        productiveAtoms: ['global:round'],
        theoryExcerpt: 'round(valor, 2) devolve o valor com duas casas.',
      },
    ],
    submittedCode: 'print("oi")\n',
    checks: [{ name: 'test_recibo', passed: false }],
    outputExcerpt: 'AssertionError: esperado 51.54',
    ...over,
  };
}

function chatQue(...replies: Array<string | Error>): MasteryJudgeChat {
  let i = 0;
  return async () => {
    const reply = replies[Math.min(i, replies.length - 1)];
    i += 1;
    if (reply instanceof Error) throw reply;
    return { content: reply };
  };
}

const VEREDITO_VALIDO =
  '{"aulas":[{"lessonId":"a-print","demonstrada":true,"motivo":"usa print() nas linhas do recibo","relacionada":[]},{"lessonId":"a-round","demonstrada":false,"motivo":"o round ficou com um argumento só","relacionada":["test_recibo"]}]}';

describe('moduleMasteryJudge — o prompt lê o CONTEÚDO das aulas', () => {
  it('entrega resumo, conceitos, construções, teoria, código, testes e saída', () => {
    const { system, user } = buildMasteryJudgePrompt(judgeInput());
    assert.match(system, /apenas parecer dominar não significa dominar/, 'a regra de ouro é normativa');
    assert.match(system, /"relacionada"/, 'o juiz atribui teste reprovado à aula');
    assert.match(system, /APENAS JSON válido/);
    assert.match(user, /Você escreve uma linha/, 'o resumo da aula entra');
    assert.match(user, /global:round/, 'as construções que a aula ensina entram');
    assert.match(user, /round\(valor, 2\)/, 'o trecho da teoria entra');
    assert.match(user, /print\("oi"\)/, 'o código submetido entra');
    assert.match(user, /✖ test_recibo/, 'os testes da tentativa entram');
    assert.match(user, /AssertionError/, 'a saída da execução entra');
  });
});

describe('moduleMasteryJudge — parse fail-closed', () => {
  it('aceita o formato exato (com ou sem cerca de markdown)', () => {
    assert.equal(parseMasteryJudgeReply(VEREDITO_VALIDO, KNOWN)?.length, 2);
    assert.equal(parseMasteryJudgeReply(`\`\`\`json\n${VEREDITO_VALIDO}\n\`\`\``, KNOWN)?.length, 2);
  });

  it('recusa JSON ilegível, aula desconhecida, aula faltando e aula duplicada', () => {
    assert.equal(parseMasteryJudgeReply('não sou json', KNOWN), null);
    assert.equal(
      parseMasteryJudgeReply('{"aulas":[{"lessonId":"inventada","demonstrada":true,"motivo":"","relacionada":[]}]}', KNOWN),
      null,
      'id que não existe na entrada não pode vazar para a marcação',
    );
    assert.equal(
      parseMasteryJudgeReply('{"aulas":[{"lessonId":"a-print","demonstrada":true,"motivo":"","relacionada":[]}]}', KNOWN),
      null,
      'aula faltando ⇒ veredito incompleto nunca vale',
    );
    assert.equal(
      parseMasteryJudgeReply(
        '{"aulas":[{"lessonId":"a-print","demonstrada":true,"motivo":"","relacionada":[]},{"lessonId":"a-print","demonstrada":false,"motivo":"","relacionada":[]}]}',
        KNOWN,
      ),
      null,
      'aula duplicada ⇒ indefensável',
    );
  });

  it('recusa campo errado (demonstrada que não é boolean)', () => {
    assert.equal(
      parseMasteryJudgeReply(
        '{"aulas":[{"lessonId":"a-print","demonstrada":"sim","motivo":"","relacionada":[]},{"lessonId":"a-round","demonstrada":true,"motivo":"","relacionada":[]}]}',
        KNOWN,
      ),
      null,
    );
  });
});

describe('moduleMasteryJudge — a chamada (1 retry; tudo degrada sem juiz)', () => {
  it('veredito válido ⇒ ok, na ordem da entrada', async () => {
    const res = await judgeModuleMastery(judgeInput(), chatQue(VEREDITO_VALIDO));
    assert.equal(res.ok, true);
    assert.deepEqual(res.verdicts.map((v) => v.lessonId), ['a-print', 'a-round']);
    assert.equal(res.verdicts[0].demonstrada, true);
    assert.deepEqual(res.verdicts[1].relacionada, ['test_recibo']);
  });

  it('1º reply inválido ⇒ RETENTA e aceita o 2º (a régua do gate semântico)', async () => {
    const res = await judgeModuleMastery(judgeInput(), chatQue('banana', VEREDITO_VALIDO));
    assert.equal(res.ok, true, 'o retry salvou a análise');
    assert.equal(res.verdicts.length, 2);
  });

  it('dois replies inválidos ⇒ erro estruturado INVALID (nada é presumido)', async () => {
    const res = await judgeModuleMastery(judgeInput(), chatQue('banana', 'mais banana'));
    assert.equal(res.ok, false);
    assert.equal(res.error?.code, MASTERY_JUDGE_ERROR_CODES.INVALID);
    assert.deepEqual(res.verdicts, []);
  });

  it('chat fora do ar / resposta vazia ⇒ UNAVAILABLE (fail-closed)', async () => {
    const fora = await judgeModuleMastery(judgeInput(), chatQue(new Error('llm off')));
    assert.equal(fora.ok, false);
    assert.equal(fora.error?.code, MASTERY_JUDGE_ERROR_CODES.UNAVAILABLE);
    const vazia = await judgeModuleMastery(judgeInput(), chatQue('   '));
    assert.equal(vazia.ok, false);
    assert.equal(vazia.error?.code, MASTERY_JUDGE_ERROR_CODES.UNAVAILABLE);
  });
});
