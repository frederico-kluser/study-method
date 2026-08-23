/**
 * tests/piFeedbackPrompt.test.ts — prompt do pi: regras anti-bajulação, dados
 * do desafio embutidos e construção determinística.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPiFeedbackPrompt,
  digestStudyMethodRules,
} from '../src/lib/piFeedbackPrompt';

const BASE = {
  subject: 'Filas em C',
  statement: 'Implemente uma fila FIFO com os métodos push e pop.',
  studentCode: '// stub do aluno',
  testOutput: 'TESTS_RUN=2 ESPERADOS=2\nPASSOU',
  language: 'c',
};

describe('buildPiFeedbackPrompt', () => {
  it('contém o enunciado, o código do aluno e a saída dos testes', () => {
    const prompt = buildPiFeedbackPrompt(BASE);
    assert.match(prompt, /Implemente uma fila FIFO/);
    assert.match(prompt, /\/\/ stub do aluno/);
    assert.match(prompt, /TESTS_RUN=2 ESPERADOS=2/);
    assert.match(prompt, /PASSOU/);
  });

  it('inclui a matéria e a linguagem quando fornecidas', () => {
    const prompt = buildPiFeedbackPrompt(BASE);
    assert.match(prompt, /Filas em C/);
    assert.match(prompt, /LINGUAGEM: c/);
  });

  it('não atribui nota/score/percentual à resposta (AS-13)', () => {
    const prompt = buildPiFeedbackPrompt(BASE).toLowerCase();
    // Nenhum símbolo de % nem atribuição de nota/score ao aluno (o prompt pode
    // citar a palavra "nota" nas regras — o que importa é não a atribuir).
    assert.ok(!prompt.includes('%'));
    assert.ok(!/\b(score|nota)\s*[:+=]/i.test(prompt));
    assert.ok(!/\b\d+\s*\/\s*10\b/.test(prompt));
    assert.ok(!/\b\d+s\s*de\s*\d+\b/.test(prompt));
  });

  it('instrução pede o próximo passo da escada e UMA pergunta', () => {
    const prompt = buildPiFeedbackPrompt(BASE);
    assert.match(prompt, /PRÓXIMO passo da escada/);
    assert.match(prompt, /UMA pergunta/);
  });

  it('não distorce o veredito: pede evidência, nunca elogio vazio (AS-1/2)', () => {
    const prompt = buildPiFeedbackPrompt(BASE);
    assert.match(prompt, /nunca elogie uma resposta que contém erro/i);
    assert.match(prompt, /objeto específico e verificável/i);
  });

  it('saída vazia devolve um fallback explícito', () => {
    const prompt = buildPiFeedbackPrompt({ ...BASE, testOutput: '' });
    assert.match(prompt, /sem saída/);
  });

  it('subject opcional ausente não deixa linha vazia de matéria', () => {
    const prompt = buildPiFeedbackPrompt({
      statement: 'x',
      studentCode: 'y',
      testOutput: 'z',
      language: 'txt',
    });
    assert.match(prompt, /LINGUAGEM: txt/);
  });

  it('linguagem vazia/SÓ espaços reverte para "indefinida"', () => {
    for (const lang of ['', '   ']) {
      const prompt = buildPiFeedbackPrompt({ ...BASE, language: lang });
      assert.match(prompt, /LINGUAGEM: indefinida/);
      assert.doesNotMatch(prompt, /LINGUAGEM: +$/);
    }
  });

  it('rulesDigest injetado substitui o resumo padrão', () => {
    const prompt = buildPiFeedbackPrompt({
      ...BASE,
      rulesDigest: 'DIGEST_CUSTOMO',
    });
    assert.match(prompt, /DIGEST_CUSTOMO/);
    assert.doesNotMatch(prompt, /ANTI-BAJULAÇÃO/);
  });
});

describe('digestStudyMethodRules', () => {
  it('é estável (não vazio) e embute as principais regras anti-bajulação', () => {
    const digest = digestStudyMethodRules();
    assert.ok(digest.length > 200);
    assert.match(digest, /AS-\d/);
    assert.match(digest, /ERR-\d/);
    assert.match(digest, /anti-bajulação/i);
    assert.match(digest, /C-12/);
  });

  it('não cita percentual/score numérico (mas pode citar a palavra da regra)', () => {
    const d = digestStudyMethodRules().toLowerCase();
    assert.ok(!d.includes('%'));
    assert.ok(!/\b\d+\s*\/\s*10\b/.test(d));
  });
});