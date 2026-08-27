/**
 * tests/homeSubjects.test.ts — lógica pura das MATÉRIAS da Home (onda 4).
 * Sem jsdom: agrupamento por domínio (`groupSubjectsByDomain`/`homeDomainSections`),
 * progresso do cartão (`subjectProgressCounts`) e o aviso de troca de matéria
 * (`shouldWarnOnSubjectSwitch`) moram em src/lib/homeSetup.ts. Cobre também a
 * presença das chaves i18n novas (home.subjects.* / home.switchDialog.*) nos
 * DOIS locales (a paridade exata entre eles é o contrato do
 * i18n-resources.test.ts).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  groupSubjectsByDomain,
  homeDomainSections,
  subjectProgressCounts,
  shouldWarnOnSubjectSwitch,
  type HomeDomainSection,
} from '../src/lib/homeSetup';
import type { SubjectSummary } from '../shared/ipc-contract';
import en from '../src/i18n/locales/en/translation.json';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';

type JsonRecord = Record<string, unknown>;
function valueAt(obj: JsonRecord, dotted: string): unknown {
  return dotted
    .split('.')
    .reduce<unknown>((acc, part) => (acc as JsonRecord | undefined)?.[part], obj);
}

function subject(partial: Partial<SubjectSummary> & { id: string }): SubjectSummary {
  return {
    name: partial.id,
    slug: partial.id,
    domain: 'programming',
    lessonCount: 0,
    answeredCount: 0,
    ...partial,
  };
}

const SAMPLE = {
  math1: subject({ id: 'equacoes', name: 'Equações do 2º grau', domain: 'math', lessonCount: 3, answeredCount: 1 }),
  math2: subject({ id: 'pitagoras', name: 'Teorema de Pitágoras', domain: 'math', lessonCount: 0, answeredCount: 0 }),
  prog1: subject({ id: 'arvore', name: 'Inverter uma árvore binária', domain: 'programming', lessonCount: 5, answeredCount: 4 }),
  prog2: subject({ id: 'mergesort', name: 'Merge sort', domain: 'programming', lessonCount: 2, answeredCount: 0 }),
} as const;

describe('groupSubjectsByDomain — agrupamento por domínio', () => {
  it('null/undefined/[] (estado vazio — onboarding) devolvem os dois grupos vazios', () => {
    for (const input of [null, undefined, []]) {
      const groups = groupSubjectsByDomain(input);
      assert.deepEqual(groups, { programming: [], math: [] });
    }
  });

  it('agrupa por domínio preservando a ordem dentro de cada grupo', () => {
    const groups = groupSubjectsByDomain([SAMPLE.prog1, SAMPLE.math1, SAMPLE.prog2, SAMPLE.math2]);
    assert.deepEqual(
      groups.programming.map((s) => s.id),
      ['arvore', 'mergesort'],
    );
    assert.deepEqual(
      groups.math.map((s) => s.id),
      ['equacoes', 'pitagoras'],
    );
  });

  it('só programação → grupo math vazio (e vice-versa)', () => {
    const onlyProg = groupSubjectsByDomain([SAMPLE.prog1, SAMPLE.prog2]);
    assert.equal(onlyProg.math.length, 0);
    assert.equal(onlyProg.programming.length, 2);
    const onlyMath = groupSubjectsByDomain([SAMPLE.math1]);
    assert.equal(onlyMath.programming.length, 0);
    assert.equal(onlyMath.math.length, 1);
  });
});

describe('homeDomainSections — seções na ordem canônica', () => {
  it('programação ANTES de matemática, só com domínios que têm matérias', () => {
    const sections = homeDomainSections(groupSubjectsByDomain([SAMPLE.math1, SAMPLE.prog1]));
    assert.equal(sections.length, 2);
    assert.deepEqual(
      sections.map((s: HomeDomainSection) => s.domain),
      ['programming', 'math'],
    );
  });

  it('domínio sem matérias não rende seção nenhuma', () => {
    const sections = homeDomainSections(groupSubjectsByDomain([SAMPLE.prog1]));
    assert.equal(sections.length, 1);
    assert.equal(sections[0].domain, 'programming');
    assert.deepEqual(
      sections[0].subjects.map((s) => s.id),
      ['arvore'],
    );
  });

  it('sem matérias → nenhuma seção (a Home fica no onboarding)', () => {
    assert.equal(homeDomainSections(groupSubjectsByDomain([])).length, 0);
  });
});

describe('subjectProgressCounts — contagens sanitizadas do cartão', () => {
  it('não-número vira 0 e negativo é preso em 0', () => {
    assert.deepEqual(subjectProgressCounts({ answeredCount: Number.NaN, lessonCount: 3 }), {
      answered: 0,
      total: 3,
    });
    assert.deepEqual(subjectProgressCounts({ answeredCount: 2, lessonCount: Number.POSITIVE_INFINITY }), {
      answered: 2,
      total: 0,
    });
    assert.deepEqual(subjectProgressCounts({ answeredCount: -1, lessonCount: -5 }), {
      answered: 0,
      total: 0,
    });
  });

  it('valores normais passam intactos', () => {
    assert.deepEqual(subjectProgressCounts({ answeredCount: 4, lessonCount: 5 }), {
      answered: 4,
      total: 5,
    });
  });
});

describe('shouldWarnOnSubjectSwitch — aviso de troca de matéria', () => {
  it('sem sessão ativa (null/undefined/em branco) → sem aviso', () => {
    for (const active of [null, undefined, '', '   ']) {
      assert.equal(shouldWarnOnSubjectSwitch(active, 'Equações do 2º grau'), false);
    }
  });

  it('mesma matéria (após trim) → sem aviso', () => {
    assert.equal(shouldWarnOnSubjectSwitch('Árvores binárias', 'Árvores binárias'), false);
    assert.equal(shouldWarnOnSubjectSwitch('  Grafos  ', 'grafos'), false);
  });

  it('matéria DIFERENTE com sessão ativa → aviso', () => {
    assert.equal(shouldWarnOnSubjectSwitch('Grafos', 'Equações do 2º grau'), true);
    assert.equal(shouldWarnOnSubjectSwitch('Grafos', 'Merge sort'), true);
  });

  it('clique sem matéria (vazio) nunca avisa', () => {
    for (const clicked of [null, undefined, '', '  ']) {
      assert.equal(shouldWarnOnSubjectSwitch('Grafos', clicked), false);
    }
  });
});

describe('i18n das matérias da Home — chaves novas presentes nos dois locales', () => {
  const requiredKeys = [
    'home.subjects.answeredOfTotal',
    'home.subjects.noLessonsYet',
    'home.switchDialog.title',
    'home.switchDialog.description',
    'home.switchDialog.continueCurrent',
    'home.switchDialog.goToLesson',
  ];

  for (const dotted of requiredKeys) {
    it(`'${dotted}' existe em pt-BR e en (com texto)`, () => {
      const pt = valueAt(ptBR as JsonRecord, dotted);
      const enValue = valueAt(en as JsonRecord, dotted);
      assert.ok(typeof pt === 'string' && (pt as string).length > 0, `${dotted} em pt-BR`);
      assert.ok(typeof enValue === 'string' && (enValue as string).length > 0, `${dotted} em en`);
    });
  }

  it('answeredOfTotal interpola as duas variáveis em ambos os locales', () => {
    for (const locale of [ptBR, en]) {
      const template = valueAt(locale as JsonRecord, 'home.subjects.answeredOfTotal') as string;
      assert.ok(template.includes('{{answered}}'), 'deve interpolar {{answered}}');
      assert.ok(template.includes('{{total}}'), 'deve interpolar {{total}}');
    }
  });
});
