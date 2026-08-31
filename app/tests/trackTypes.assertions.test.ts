/**
 * tests/trackTypes.assertions.test.ts — AFIRMAÇÕES da aula (onda 1 schema-quiz).
 *
 * Campo ADITIVO (§10 do docs/16-engine-de-trilha.md): `assertions` é OPCIONAL
 * no lesson.json — até 3 afirmações por aula, cada uma com quiz de múltipla
 * escolha (4 opções únicas, índice da correta e feedback). AUSÊNCIA é válida:
 * aula sem quiz continua passando com 0 issues (schemaVersion NUNCA é bumpado).
 *
 * Contratos que mordem:
 *   1. validateAssertions aceita 1..3 afirmações bem formadas.
 *   2. 4+ afirmações → issue de máximo.
 *   3. options: exatamente 4, não vazias e ÚNICAS.
 *   4. answerIndex: inteiro 0..options.length-1.
 *   5. ids únicos e kebab-case (SLUG_RE).
 *   6. validateLessonSource integra validateAssertions (e aula SEM assertions
 *      continua válida — aditivo opcional).
 *   7. REPLAN A1 (sectionId): quando presente, DEVE ser kebab-case (SLUG_RE);
 *      com theoryIds conhecidos, DEVE existir em lesson.theory[].id; sem
 *      theoryIds, só o formato é validado; validateLessonSource repassa os
 *      ids reais da teoria da aula.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_ASSERTIONS_PER_LESSON,
  TRACK_SCHEMA_VERSION,
  validateAssertions,
  validateLessonSource,
  type TrackAssertion,
  type TrackLessonSource,
} from '../electron/main/content/trackTypes';

function assertion(over: Partial<TrackAssertion> = {}): TrackAssertion {
  return {
    id: 'variavel-guarda-valor',
    statement: 'Uma variável guarda um valor em memória.',
    question: 'O que uma variável guarda?',
    options: ['Um valor', 'Um programa', 'Uma pasta', 'Uma tecla'],
    answerIndex: 0,
    feedback: 'Certo! A variável é uma caixa com um valor.',
    ...over,
  };
}

function lesson(over: Partial<TrackLessonSource> = {}): TrackLessonSource {
  return {
    schemaVersion: TRACK_SCHEMA_VERSION,
    slug: 'aula-1',
    title: 'Aula 1',
    summary: 'Resumo da aula 1.',
    difficulty: 1,
    concepts: ['variaveis'],
    prerequisites: [],
    theory: [{ id: 'introducao', title: 'Introdução', markdown: 'Texto da teoria.' }],
    sources: [{ title: 'MDN', url: 'https://example.org', description: 'Fonte' }],
    challenges: [],
    ...over,
  };
}

describe('trackTypes — validateAssertions (ADITIVO)', () => {
  it('aceita 1..3 afirmações válidas', () => {
    assert.deepEqual(validateAssertions([assertion()], 'lesson.json'), []);
    assert.deepEqual(validateAssertions([assertion(), assertion({ id: 'segunda' }), assertion({ id: 'terceira' })], 'lesson.json'), []);
  });

  it('rejeita 4+ afirmações (máximo por aula)', () => {
    const muitas = Array.from({ length: MAX_ASSERTIONS_PER_LESSON + 1 }, (_, i) => assertion({ id: `afirmacao-${i}` }));
    const issues = validateAssertions(muitas, 'lesson.json');
    assert.ok(issues.some((i) => i.message.includes(`máximo ${MAX_ASSERTIONS_PER_LESSON}`)));
  });

  it('rejeita não-array e item não-objeto', () => {
    const naoArray = validateAssertions('nada', 'lesson.json');
    assert.ok(naoArray.some((i) => i.message.includes('assertions inválido')));
    const itemRuim = validateAssertions(['texto'], 'lesson.json');
    assert.ok(itemRuim.some((i) => i.message.includes('assertions[0] não é objeto')));
  });

  it('rejeita options com menos/mais de 4, opção vazia e opção duplicada', () => {
    const tres = validateAssertions([assertion({ options: ['a', 'b', 'c'] })], 'lesson.json');
    assert.ok(tres.some((i) => i.message.includes('options')));
    const cinco = validateAssertions([assertion({ options: ['a', 'b', 'c', 'd', 'e'] })], 'lesson.json');
    assert.ok(cinco.some((i) => i.message.includes('options')));
    const vazia = validateAssertions([assertion({ options: ['a', ' ', 'c', 'd'] })], 'lesson.json');
    assert.ok(vazia.some((i) => i.message.includes('options[1] vazio')));
    const duplicada = validateAssertions([assertion({ options: ['a', 'b', 'a', 'd'] })], 'lesson.json');
    assert.ok(duplicada.some((i) => i.message.includes('options[2] duplicada')));
  });

  it('rejeita answerIndex fora da faixa, não-inteiro e ausente', () => {
    const fora = validateAssertions([assertion({ answerIndex: 4 })], 'lesson.json');
    assert.ok(fora.some((i) => i.message.includes('answerIndex')));
    const negativo = validateAssertions([assertion({ answerIndex: -1 })], 'lesson.json');
    assert.ok(negativo.some((i) => i.message.includes('answerIndex')));
    const naoInteiro = validateAssertions([assertion({ answerIndex: 1.5 })], 'lesson.json');
    assert.ok(naoInteiro.some((i) => i.message.includes('answerIndex')));
    const ausente = validateAssertions([{ ...assertion(), answerIndex: undefined } as never], 'lesson.json');
    assert.ok(ausente.some((i) => i.message.includes('answerIndex')));
  });

  it('rejeita id duplicado entre afirmações da MESMA aula', () => {
    const dup = validateAssertions([assertion(), assertion({ question: 'Outra pergunta' })], 'lesson.json');
    assert.ok(dup.some((i) => i.message.includes('id duplicado')));
  });

  it('rejeita id fora do kebab-case e statement/question/feedback vazios', () => {
    const idRuim = validateAssertions([assertion({ id: 'Variavel Guarda' })], 'lesson.json');
    assert.ok(idRuim.some((i) => i.message.includes('id inválido')));
    const statementVazio = validateAssertions([assertion({ statement: '  ' })], 'lesson.json');
    assert.ok(statementVazio.some((i) => i.message.includes('statement vazio')));
    const questionVazia = validateAssertions([assertion({ question: '' })], 'lesson.json');
    assert.ok(questionVazia.some((i) => i.message.includes('question vazio')));
    const feedbackVazio = validateAssertions([assertion({ feedback: '' })], 'lesson.json');
    assert.ok(feedbackVazio.some((i) => i.message.includes('feedback vazio')));
  });

  it('ADITIVO: aula SEM assertions passa com 0 issues (campo opcional)', () => {
    assert.deepEqual(validateLessonSource(lesson(), 'lesson.json'), []);
  });

  it('validateLessonSource integra assertions — válida passa, inválida reporta', () => {
    const ok = validateLessonSource(lesson({ assertions: [assertion()] }), 'lesson.json');
    assert.deepEqual(ok, []);
    const ruim = validateLessonSource(
      lesson({ assertions: [assertion({ answerIndex: 9 }), assertion({ id: 'variavel-guarda-valor', question: 'Outra' })] }),
      'lesson.json',
    );
    assert.ok(ruim.some((i) => i.message.includes('answerIndex')));
    assert.ok(ruim.some((i) => i.message.includes('id duplicado')));
  });

  it('REPLAN A1: sectionId presente e existente na teoria passa; desconhecido reporta (com theoryIds)', () => {
    const teoria = ['a-maquina-que-confere', 'como-ler-o-desafio', 'as-palavras-da-caixa'];
    const ok = validateAssertions([assertion({ sectionId: 'a-maquina-que-confere' })], 'lesson.json', teoria);
    assert.deepEqual(ok, []);
    const desconhecido = validateAssertions([assertion({ sectionId: 'secao-que-nao-existe' })], 'lesson.json', teoria);
    assert.ok(desconhecido.some((i) => i.message.includes('sectionId desconhecido')));
    assert.ok(desconhecido.some((i) => i.message.includes('secao-que-nao-existe')));
  });

  it('REPLAN A1: sectionId fora do kebab-case reporta SEMPRE (com ou sem theoryIds)', () => {
    const invalido = validateAssertions([assertion({ sectionId: 'Nao E Kebab' })], 'lesson.json', ['a-maquina-que-confere']);
    assert.ok(invalido.some((i) => i.message.includes('sectionId inválido')));
    const semIds = validateAssertions([assertion({ sectionId: 'Nao E Kebab' })], 'lesson.json');
    assert.ok(semIds.some((i) => i.message.includes('sectionId inválido')));
  });

  it('REPLAN A1: sem theoryIds, só o formato kebab-case é validado (id desconhecido não é acusado)', () => {
    const semIds = validateAssertions([assertion({ sectionId: 'qualquer-secao-ok' })], 'lesson.json');
    assert.deepEqual(semIds, []);
  });

  it('REPLAN A1: validateLessonSource repassa os ids reais da teoria — sectionId fora da teoria reporta', () => {
    const ok = validateLessonSource(
      lesson({ theory: [{ id: 'introducao', title: 'Introdução', markdown: 'Texto.' }], assertions: [assertion({ sectionId: 'introducao' })] }),
      'lesson.json',
    );
    assert.deepEqual(ok, []);
    const ruim = validateLessonSource(
      lesson({ theory: [{ id: 'introducao', title: 'Introdução', markdown: 'Texto.' }], assertions: [assertion({ sectionId: 'outra-secao' })] }),
      'lesson.json',
    );
    assert.ok(ruim.some((i) => i.message.includes('sectionId desconhecido')));
  });
});
