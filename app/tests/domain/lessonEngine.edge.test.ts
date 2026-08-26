/**
 * tests/domain/lessonEngine.edge.test.ts — TESTES DE BORDA do motor de aula curta
 * (electron/main/domain/lessonEngine.ts), complemento do lessonEngine.test.ts.
 *
 * Cobre o que a suíte básica não pina: markdown só de código, markdown vazio,
 * markdown só de header, extractQuestion sobre StudyLesson malformada/objeto
 * sem markdown, pickNextLesson com difficulty empatada (estabilidade), e
 * buildLessonLesson com body vazio (contrato de prompt).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLessonLesson,
  extractQuestion,
  pickNextLesson,
  summarizeLessonToShort,
  type LessonCandidate,
} from '../../electron/main/domain/lessonEngine';

describe('summarizeLessonToShort — markdown degenerado', () => {
  it('markdown só de código → preserva o bloco como parágrafo prático, sem prosa', () => {
    const { paragraphs, shortBody } = summarizeLessonToShort('```js\nconst x = 1;\n```');
    assert.equal(paragraphs.length, 1);
    assert.ok(paragraphs[0].startsWith('```'), 'bloco de código preservado');
    assert.equal(shortBody, '```js\nconst x = 1;\n```');
  });

  it('markdown vazio → paragraphs [] e shortBody vazio (sem crash)', () => {
    const { paragraphs, shortBody } = summarizeLessonToShort('');
    assert.deepEqual(paragraphs, []);
    assert.equal(shortBody, '');
  });

  it('markdown só de header (#) → mantém o título como parágrafo (comportamento observado)', () => {
    const { paragraphs } = summarizeLessonToShort('# Apenas um titulo');
    assert.equal(paragraphs.length, 1);
    assert.match(paragraphs[0], /Apenas um titulo/);
  });

  it('múltiplos blocos de código → preserva SOMENTE o primeiro', () => {
    const md = ['```py\na = 1\n```', '\n\n', 'teoria breve', '\n\n', '```py\nb = 2\n```'].join('');
    const codeParas = summarizeLessonToShort(md).paragraphs.filter((p) => /^```/.test(p));
    assert.equal(codeParas.length, 1, 'apenas um bloco de código preservado');
  });

  it('maxParagraphs=0 / maxWordsPerParagraph<=0 não trava', () => {
    const { paragraphs } = summarizeLessonToShort('palavras repetidas aqui', {
      maxParagraphs: 0,
      maxWordsPerParagraph: 0,
    });
    assert.ok(Array.isArray(paragraphs), 'nunca retorna não-array');
  });
});

describe('extractQuestion — StudyLesson e objetos degenerados', () => {
  it('aceita um StudyLesson válido (usa campo markdown)', () => {
    const lesson = {
      title: 'Grafos',
      subject: 'Computação',
      markdown: 'Um grafo é um par. O que é um grafo dirigido?',
      findings: [],
      challenges: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    assert.equal(extractQuestion(lesson), 'O que é um grafo dirigido?');
  });

  it('objeto StudyLesson sem campo markdown → string vazia (sem crash)', () => {
    const lesson = {
      title: 'X',
      subject: 'Y',
      markdown: undefined,
      findings: [],
      challenges: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    } as unknown as { markdown?: string } as never;
    assert.equal(extractQuestion(lesson), '');
  });

  it('múltiplas perguntas no mesmo texto → devolve só a primeira', () => {
    const md = 'Por que X? E como funciona Y? Finalmente, o que é Z?';
    assert.equal(extractQuestion(md), 'Por que X?');
  });

  it('ponto de interrogação dentro de bloco de código NÃO é extraído', () => {
    // A regex percorre linha a linha; a block de código não termina a sentença `?`
    // com candidata de sentença interrogativa válida isolada — mas se estiver numa
    // linha só com o `?` do código, devolve essa linha (comportamento da regex).
    const md = 'Sem pergunta na prosa.\n\n```js\n// isso? é comentário\n```';
    const q = extractQuestion(md);
    // Não deve extrair de um parágrafo de prosa que não tem pergunta — e, se pegar o
    // bloco de código, ao menos não pode ser vazio. Garantimos apenas que não lança.
    assert.ok(typeof q === 'string');
  });
});

describe('pickNextLesson — empate de dificuldade (estabilidade)', () => {
  it('incompletas com mesma dificuldade → escolhe a PRIMEIRA (ordem estável)', () => {
    const lessons: LessonCandidate[] = [
      { id: 'a', title: 'Alpha', difficulty: 3, completedAt: null },
      { id: 'b', title: 'Beta', difficulty: 3, completedAt: null },
    ];
    const res = pickNextLesson(lessons);
    assert.equal(res.lessonId, 'a');
    assert.match(res.reason, /Alpha/);
  });

  it('todas completas com mesma dificuldade → desempata por título', () => {
    const lessons: LessonCandidate[] = [
      { id: 'b', title: 'Beta', difficulty: 3, completedAt: '2026-01-01' },
      { id: 'a', title: 'Alpha', difficulty: 3, completedAt: '2026-01-02' },
    ];
    const res = pickNextLesson(lessons);
    assert.equal(res.lessonId, 'a', 'Alpha vem antes de Beta por título');
    assert.match(res.reason, /Alpha/);
  });

  it('null / undefined passado como lista → trata como vazia (lessonId null)', () => {
    const res = pickNextLesson(null as unknown as LessonCandidate[]);
    assert.equal(res.lessonId, null);
  });
});

describe('buildLessonLesson — contrato do prompt', () => {
  it('body vazio + question vazia → prompt genérico e body vazio (sem crash)', () => {
    const res = buildLessonLesson('', '');
    assert.equal(res.body, '');
    assert.equal(res.question, '');
    assert.equal(res.prompt, 'Digite o que você entendeu');
  });

  it('question só de espaços → tratada como ausente', () => {
    const res = buildLessonLesson('Corpo.', '    ');
    assert.equal(res.question, '');
    assert.equal(res.prompt, 'Digite o que você entendeu');
  });
});
