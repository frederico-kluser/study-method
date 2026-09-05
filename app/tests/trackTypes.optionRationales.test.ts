/**
 * tests/trackTypes.optionRationales.test.ts — o RACIONAL POR OPÇÃO das
 * afirmações (onda1-contrato-quiz).
 *
 * `optionRationales` é o material do QUIZ ADAPTATIVO: quando o aluno erra, a
 * explicação que ele recebe é sobre AQUELE distrator, não o `feedback` único
 * da afirmação. O campo é ADITIVO e OPCIONAL (§10 do docs/16-engine-de-trilha.md
 * — o schemaVersion do conteúdo continua 1 e NÃO é bumpado).
 *
 * O que este arquivo PROVA:
 *   1. AUSENTE → 0 issues (as aulas que já estão no disco não têm o campo);
 *   2. `[]` → 0 issues: é a AUSÊNCIA EXPLÍCITA, o valor que o
 *      `AssertionDraftSchema` da engine materializa (INV-05) e que a F12 copia
 *      verbatim para o lesson.json — reprovar `[]` reprovaria toda aula gerada;
 *   3. PRESENTE e não vazio com comprimento ≠ `options.length` → issue;
 *   4. item vazio/não-string → issue (racional em branco não explica nada);
 *   5. não-array → issue;
 *   6. 4 racionais válidos → 0 issues, e `validateLessonSource` integra tudo;
 *   7. as 20 aulas REAIS de `resources/tracks/python/` continuam com 0 issues
 *      e continuam SEM o campo (a prova de que a extensão é mesmo aditiva).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';

import {
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

/** 4 racionais válidos, um por opção, na mesma ordem. */
const QUATRO_RACIONAIS = [
  'Certo: a variável guarda o valor que você atribuiu a ela.',
  'Errado: um programa é a receita inteira, não a caixa de um valor.',
  'Errado: pasta é coisa do sistema de arquivos, não da memória do programa.',
  'Errado: tecla é entrada do teclado; a variável guarda o resultado, não a tecla.',
];

describe('trackTypes — optionRationales (ADITIVO, onda1-contrato-quiz)', () => {
  it('1. AUSENTE: afirmação sem o campo passa com 0 issues', () => {
    assert.deepEqual(validateAssertions([assertion()], 'lesson.json'), []);
  });

  it('2. `[]` é a ausência EXPLÍCITA (o que a engine materializa) — 0 issues', () => {
    assert.deepEqual(validateAssertions([assertion({ optionRationales: [] })], 'lesson.json'), []);
  });

  it('3. comprimento ERRADO (≠ options.length) vira issue', () => {
    const curto = validateAssertions(
      [assertion({ optionRationales: ['só um', 'e outro'] })],
      'lesson.json',
    );
    assert.ok(
      curto.some((i) => i.message.includes('optionRationales com 2 itens')),
      `esperava issue de comprimento, veio: ${JSON.stringify(curto)}`,
    );
    const longo = validateAssertions(
      [assertion({ optionRationales: [...QUATRO_RACIONAIS, 'sobrando'] })],
      'lesson.json',
    );
    assert.ok(longo.some((i) => i.message.includes('optionRationales com 5 itens')));
  });

  it('4. item VAZIO (ou não-string) vira issue — racional em branco não explica nada', () => {
    const comVazio = validateAssertions(
      [assertion({ optionRationales: [QUATRO_RACIONAIS[0], '   ', QUATRO_RACIONAIS[2], QUATRO_RACIONAIS[3]] })],
      'lesson.json',
    );
    assert.ok(comVazio.some((i) => i.message.includes('optionRationales[1] vazio')));

    const naoString = validateAssertions(
      [assertion({ optionRationales: [QUATRO_RACIONAIS[0], 42, QUATRO_RACIONAIS[2], QUATRO_RACIONAIS[3]] as unknown as string[] })],
      'lesson.json',
    );
    assert.ok(naoString.some((i) => i.message.includes('optionRationales[1] vazio')));
  });

  it('5. NÃO-ARRAY vira issue', () => {
    const issues = validateAssertions(
      [assertion({ optionRationales: 'texto solto' as unknown as string[] })],
      'lesson.json',
    );
    assert.ok(issues.some((i) => i.message.includes('optionRationales inválido')));
  });

  it('6. 4 racionais válidos → 0 issues (também via validateLessonSource)', () => {
    assert.deepEqual(
      validateAssertions([assertion({ optionRationales: QUATRO_RACIONAIS })], 'lesson.json'),
      [],
    );
    const ok = validateLessonSource(
      lesson({ assertions: [assertion({ sectionId: 'introducao', optionRationales: QUATRO_RACIONAIS })] }),
      'lesson.json',
    );
    assert.deepEqual(ok, [], `aula com racionais deveria passar, veio: ${JSON.stringify(ok)}`);

    const ruim = validateLessonSource(
      lesson({ assertions: [assertion({ sectionId: 'introducao', optionRationales: ['um'] })] }),
      'lesson.json',
    );
    assert.ok(
      ruim.some((i) => i.message.includes('optionRationales com 1 itens')),
      'validateLessonSource precisa propagar a issue do racional',
    );
  });
});

describe('trackTypes — as aulas REAIS continuam válidas sem o campo', () => {
  it('7. as 20 aulas de resources/tracks/python carregam com 0 issues e SEM optionRationales', async () => {
    const raiz = path.join(__dirname, '..', 'resources', 'tracks', 'python', 'modules');
    const arquivos: string[] = [];
    async function varrer(dir: string): Promise<void> {
      for (const entrada of await fsp.readdir(dir, { withFileTypes: true })) {
        const alvo = path.join(dir, entrada.name);
        if (entrada.isDirectory()) await varrer(alvo);
        else if (entrada.name === 'lesson.json') arquivos.push(alvo);
      }
    }
    await varrer(raiz);
    assert.equal(arquivos.length, 20, 'a trilha python tem 20 aulas no disco');

    for (const arquivo of arquivos) {
      const cru = JSON.parse(await fsp.readFile(arquivo, 'utf8')) as TrackLessonSource;
      const issues = validateLessonSource(cru, arquivo);
      assert.deepEqual(issues, [], `${arquivo} deveria validar com 0 issues`);
      for (const a of cru.assertions ?? []) {
        assert.equal(
          a.optionRationales,
          undefined,
          `${arquivo}: a aula real NÃO declara optionRationales (a extensão é aditiva)`,
        );
      }
    }
  });
});
