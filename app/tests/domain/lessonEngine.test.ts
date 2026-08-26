/**
 * tests/domain/lessonEngine.test.ts — testes do MOTOR DE AULA CURTA
 * (electron/main/domain/lessonEngine.ts). Domínio puro: sem jsdom, só importa
 * node:test. Cobre resumo 1-2 parágrafos, extração de pergunta, prompt de
 * interação, encadeamento da próxima aula e slug de assunto.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLessonLesson,
  ensureSubjectSlug,
  extractQuestion,
  pickNextLesson,
  summarizeLessonToShort,
  type LessonCandidate,
} from '../../electron/main/domain/lessonEngine';

describe('summarizeLessonToShort — markdown longo → aula curta', () => {
  it('markdown com MUITOS parágrafos → no máximo 2 parágrafos na saída', () => {
    const md = [
      '# Programação em Rust',
      'O primeiro parágrafo introduz o ciclo de vida dos `borrow` e o rigor do compilador.',
      '',
      'O segundo parágrafo aprofunda ownership, move semantics e como o Rust evita data races em tempo de compilação.',
      '',
      'O terceiro parágrafo traz exemplos de padrões comuns de código.',
      '',
      'O quarto parágrafo fala sobre performance e zero-cost abstractions inerentes ao design.',
      '',
      '```rust',
      'fn main() { let mut x = 5; x += 1; }',
      '```',
    ].join('\n');

    const { paragraphs } = summarizeLessonToShort(md);
    // O bloco de código preservado conta como "parágrafo prático" não-truncado;
    // a PROSA (teoria) fica limitada a 2.
    const proseParas = paragraphs.filter((p) => !/^```/.test(p));
    assert.ok(
      proseParas.length <= 2,
      `prosa deveria ter ≤ 2 parágrafos, veio ${proseParas.length}`,
    );
  });

  it('cada parágrafo é ≤ maxWordsPerParagraph quando truncado', () => {
    const md = Array.from(
      { length: 5 },
      (_, i) => 'palavra '.repeat(40) + `fim-paragrafo-${i}`,
    ).join('\n\n');

    const { paragraphs } = summarizeLessonToShort(md, { maxParagraphs: 2, maxWordsPerParagraph: 10 });
    assert.ok(paragraphs.length >= 1);
    for (const p of paragraphs) {
      const words = p.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
      assert.ok(words.length <= 10 + (p.endsWith('…') ? 0 : 0), `parágrafo tem ${words.length} palavras`);
    }
  });

  it('resumo preserva o núcleo do assunto (palavra-chave do title no primeiro parágrafo)', () => {
    const md = [
      '# Vetores em C',
      'Um vetor (array) agrupa vários elementos do mesmo tipo em memória contígua.',
      '',
      'Índices começam em zero e o acesso é direto pelo operador de subscrito.',
    ].join('\n\n');

    const { paragraphs } = summarizeLessonToShort(md, { maxParagraphs: 1, maxWordsPerParagraph: 100 });
    const first = paragraphs[0] ?? '';
    assert.ok(/vetores|vetor/i.test(first), `núcleo (vetor) não aparece: "${first}"`);
  });

  it('ellipsis (…) quando um parágrafo é cortado', () => {
    const md = 'palavra '.repeat(30) + 'conclusão';
    const { paragraphs } = summarizeLessonToShort(md, { maxWordsPerParagraph: 5 });
    assert.ok(paragraphs[0].endsWith('…'), `deveria terminar em ellipsis: "${paragraphs[0]}"`);
  });

  it('preserva UM bloco de código como exemplo prático', () => {
    const md = [
      'Teoria curta sobre closures.',
      '',
      '```js',
      'const double = (x) => x * 2;',
      '```',
      '',
      'Fim da teoria.',
    ].join('\n');
    const { paragraphs } = summarizeLessonToShort(md);
    const code = paragraphs.find((p) => p.includes('double'));
    assert.ok(code, 'nenhum bloco de código foi preservado');
    assert.ok(code.startsWith('```'), `bloco deveria começar com crase: "${code}"`);
  });
});

describe('extractQuestion — primeira sentença interrogativa', () => {
  it('markdown com "Qual a diferença..." → extrai a pergunta', () => {
    const md = [
      '# Listas concatenadas',
      'Uma lista encadeada guarda nós com ponteiro para o seguinte.',
      '',
      'Qual a diferença entre uma lista simplesmente e duplamente encadeada?',
      '',
      'Depois vem mais conteúdo.',
    ].join('\n');
    assert.equal(extractQuestion(md), 'Qual a diferença entre uma lista simplesmente e duplamente encadeada?');
  });

  it('aceita um StudyLesson (usa o campo markdown)', () => {
    const lesson = {
      title: 'Grafos',
      subject: 'Ciência da Computação',
      markdown: 'Um grafo é um par de vértices e arestas. O que é um grafo dirigido?',
      findings: [],
      challenges: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    assert.equal(extractQuestion(lesson), 'O que é um grafo dirigido?');
  });

  it('sem "?" → devolve string vazia', () => {
    const md = 'Apenas um parágrafo sem nenhuma interrogação no texto.';
    assert.equal(extractQuestion(md), '');
  });

  it('string vazia → devolve string vazia', () => {
    assert.equal(extractQuestion(''), '');
  });
});

describe('buildLessonLesson — prompt de interação', () => {
  it('com pergunta → prompt contém a pergunta', () => {
    const { prompt, question } = buildLessonLesson('Corpo curto.', 'O que é um closure?');
    assert.ok(prompt.includes('O que é um closure?'), `prompt: "${prompt}"`);
    assert.equal(question, 'O que é um closure?');
  });

  it('sem pergunta → prompt genérico de "digite o que entendeu"', () => {
    const { prompt } = buildLessonLesson('Corpo curto.');
    assert.equal(prompt, 'Digite o que você entendeu');
  });

  it('conteúdo com espaços é aparado', () => {
    const { body } = buildLessonLesson('  Corpo  com espaços  ');
    assert.equal(body, 'Corpo  com espaços');
  });
});

describe('pickNextLesson — encadeamento da próxima aula do mesmo assunto', () => {
  it('incompletas presentes → escolhe a primeira incompleta por dificuldade ascendente', () => {
    const lessons: LessonCandidate[] = [
      { id: 'a', title: 'A3', difficulty: 3, completedAt: null },
      { id: 'b', title: 'A1', difficulty: 1, completedAt: null },
      { id: 'c', title: 'A5', difficulty: 5, completedAt: '2026-01-01' },
    ];
    const { lessonId, reason } = pickNextLesson(lessons);
    assert.equal(lessonId, 'b', 'deveria escolher a menor dificuldade incompleta');
    assert.match(reason, /A1/);
  });

  it('todas completas → devolve a de maior dificuldade (continuar evoluindo)', () => {
    const lessons: LessonCandidate[] = [
      { id: 'x', title: 'A2', difficulty: 2, completedAt: '2026-01-01' },
      { id: 'y', title: 'A9', difficulty: 9, completedAt: '2026-01-02' },
      { id: 'z', title: 'A5', difficulty: 5, completedAt: '2026-01-03' },
    ];
    const { lessonId, reason } = pickNextLesson(lessons);
    assert.equal(lessonId, 'y', 'deveria ser a de maior dificuldade');
    assert.match(reason, /evoluindo/i);
  });

  it('lista vazia → lessonId null (sugere gerar nova aula)', () => {
    const { lessonId, reason } = pickNextLesson([]);
    assert.equal(lessonId, null);
    assert.match(reason, /nova aula/i);
  });
});

describe('ensureSubjectSlug — slug ASCII do assunto', () => {
  it('"Programação em Python" → "programacao-em-python"', () => {
    assert.equal(ensureSubjectSlug('Programação em Python'), 'programacao-em-python');
  });

  it('accentos e maiúsculas normalizados', () => {
    assert.equal(ensureSubjectSlug('Álgebra Linear Aplicada'), 'algebra-linear-aplicada');
    assert.equal(ensureSubjectSlug('  Ciências  de  Dados  '), 'ciencias-de-dados');
    assert.equal(ensureSubjectSlug('C++ & Algoritmos!'), 'c-algoritmos');
  });
});
