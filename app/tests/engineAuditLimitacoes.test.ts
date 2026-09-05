/**
 * tests/engineAuditLimitacoes.test.ts — o placar do `audit` PARA de mentir por
 * omissão (`engine/audit.ts`).
 *
 * O DEFEITO, PROVADO POR MUTAÇÃO (`docs/19-auditoria-da-aula.md`): apagando
 * TODOS os blocos de código da teoria da aula 1 da trilha `python`, o `audit`
 * continuava reportando `0 violações · 0 avisos · exit 0`. A bateria A13–A16
 * (ensino-efetivo, micro-avanço, progressividade, primeira-atividade) é
 * javascript-only por decisão BEM ARGUMENTADA (`engine/audit.ts:220-222`,
 * `quality/progressao.ts:432`) — o defeito nunca foi ela não rodar; foi o
 * placar NÃO DIZER que ela não rodou. A linha `avisos (bateria A13-A16) .. 0`
 * lê-se como "está tudo certo" quando significa "não rodou".
 *
 * O que se prova aqui:
 *   1. a MUTAÇÃO: apagar a teoria da aula não muda `violacoes`/`avisos` — o
 *      sintoma que motivou tudo, travado como fato, não como suspeita;
 *   2. numa trilha de Python o relatório DECLARA a checagem não executada, com
 *      id, motivo e consequência (`docs/16` §9.2, `CONTRIBUTING.md`);
 *   3. numa trilha de JavaScript `limitacoes` é VAZIA — a lista vazia é a
 *      afirmação "nada deixou de rodar", e ela precisa ser verificável;
 *   4. `metrics[].novosVerdadeiros` fica AUSENTE quando a bateria não rodou (o
 *      fallback que fazia a 2ª coluna do histograma sair idêntica à 1ª saiu), e
 *      PRESENTE quando ela rodou;
 *   5. o formatador `linhasDeLimitacoes` devolve o bloco pronto para o resumo,
 *      e `[]` quando não há limitação.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { LoadedLesson, LoadedModule, LoadedTrack } from '../electron/main/content/trackLoader';
import type {
  TrackChallengeLanguage,
  TrackChallengeSource,
  TrackTheorySection,
} from '../electron/main/content/trackTypes';
import { auditTrack, linhasDeLimitacoes } from '../electron/main/engine/audit';
import type { AtomKey } from '../electron/main/engine/atomKeys';
import { extractAtoms } from '../electron/main/engine/extract';
import type { LanguageId } from '../electron/main/engine/lang/registry';
import { pythonAdapter } from '../electron/main/engine/lang/python';

const TEM_PYTHON = pythonAdapter.detect().version !== null;

// ---------------------------------------------------------------------------
// Fixtures (em memória — nenhuma trilha real, nenhum IO)
// ---------------------------------------------------------------------------

function theory(id: string, language: string, code: string): TrackTheorySection {
  return { id, title: id, markdown: 'a teoria mostra o código', code: { language, code } };
}

/**
 * O `introduces` da aula, DERIVADO do próprio conteúdo do fixture.
 *
 * A auditoria roda em modo `declared` (a mesma configuração da trilha real):
 * sem isso o orçamento sairia INFERIDO da teoria, e apagar a teoria mudaria o
 * orçamento — o que faria a mutação medir outra coisa, não a bateria A13–A16.
 */
function introducesDe(codigos: string[], language: LanguageId): { productive: AtomKey[]; receptive: AtomKey[] } {
  const chaves = new Set<AtomKey>();
  for (const c of codigos) {
    const r = extractAtoms(c, { language, fileName: language === 'python' ? 'solucao.py' : 'solution.mjs' });
    if (r.ok) for (const k of r.keys) chaves.add(k);
  }
  const lista = [...chaves].sort();
  return { productive: lista, receptive: lista };
}

function lesson(
  slug: string,
  sections: TrackTheorySection[],
  challenges: TrackChallengeSource[],
  introduces: { productive: AtomKey[]; receptive: AtomKey[] },
): LoadedLesson {
  return {
    meta: {
      schemaVersion: 1,
      slug,
      title: slug,
      summary: slug,
      difficulty: 1,
      concepts: ['conceito'],
      prerequisites: [],
      theory: sections,
      sources: [],
      challenges: challenges.map((c) => c.slug),
      introduces,
    } as LoadedLesson['meta'],
    challenges,
  };
}

function moduleOf(slug: string, lessons: LoadedLesson[]): LoadedModule {
  return {
    meta: { schemaVersion: 1, slug, title: slug, order: 1, lessons: lessons.map((l) => l.meta.slug) },
    lessons,
    challenge: null,
  };
}

function trackOf(programmingLanguage: TrackChallengeLanguage, modules: LoadedModule[]): LoadedTrack {
  return {
    root: {
      schemaVersion: 1,
      slug: 'fixture',
      title: 'fixture',
      description: 'fixture',
      language: 'pt-BR',
      domain: 'programming',
      programmingLanguage,
      modules: modules.map((m) => m.meta.slug),
    },
    modules,
    proficiency: null,
    dir: '/tmp/fixture',
  };
}

const TESTS_PY = [
  'import unittest',
  '',
  'from solucao import dobro',
  '',
  '',
  'class TestSolucao(unittest.TestCase):',
  '    def test_dobro(self):',
  '        self.assertEqual(dobro(2), 4)',
  '',
].join('\n');

/** Trilha de Python; `comTeoria: false` é a MUTAÇÃO (teoria sem código). */
function trilhaPython(comTeoria: boolean): LoadedTrack {
  const desafio: TrackChallengeSource = {
    schemaVersion: 1,
    slug: 'dobrar',
    title: 'dobrar',
    concept: 'conceito',
    difficulty: 1,
    language: 'python',
    statement: '# dobrar',
    starterCode: 'def dobro(x):\n    return 0\n',
    testsCode: TESTS_PY,
    solutionCode: 'def dobro(x):\n    return x * 2\n',
    expectedTestCount: 1,
  };
  const teoriaCodigo = 'def dobro(x):\n    return x * 2\n';
  const secoes = comTeoria
    ? [theory('t', 'python', teoriaCodigo)]
    : [{ id: 't', title: 't', markdown: 'a teoria ficou SEM nenhum bloco de código' }];
  // O orçamento DECLARADO é o MESMO nos dois fixtures — a mutação tira só a
  // teoria, nunca o orçamento contra o qual o desafio é medido.
  const introduces = introducesDe(
    [teoriaCodigo, desafio.starterCode ?? '', desafio.solutionCode ?? '', desafio.testsCode],
    'python',
  );
  return trackOf('python', [moduleOf('numeros', [lesson('dobrar', secoes, [desafio], introduces)])]);
}

const TESTS_JS = [
  "import test from 'node:test';",
  "import assert from 'node:assert/strict';",
  "import { dobro } from './solution.mjs';",
  '',
  "test('dobro de 2', () => {",
  '  assert.equal(dobro(2), 4);',
  '});',
  '',
].join('\n');

function trilhaJs(): LoadedTrack {
  const desafio: TrackChallengeSource = {
    schemaVersion: 1,
    slug: 'dobrar',
    title: 'dobrar',
    concept: 'conceito',
    difficulty: 1,
    language: 'javascript',
    statement: '# dobrar',
    starterCode: 'export function dobro(x) {\n  return 0;\n}\n',
    testsCode: TESTS_JS,
    solutionCode: 'export function dobro(x) {\n  return x * 2;\n}\n',
    expectedTestCount: 1,
  };
  const teoriaCodigo = 'export function dobro(x) {\n  return x * 2;\n}\n';
  const introduces = introducesDe(
    [teoriaCodigo, desafio.starterCode ?? '', desafio.solutionCode ?? '', desafio.testsCode],
    'javascript',
  );
  return trackOf('javascript', [
    moduleOf('numeros', [lesson('dobrar', [theory('t', 'js', teoriaCodigo)], [desafio], introduces)]),
  ]);
}

// ---------------------------------------------------------------------------
// 1 — a mutação (o sintoma), travada como FATO
// ---------------------------------------------------------------------------

describe('audit — a prova por mutação que motivou a declaração', {
  skip: !TEM_PYTHON ? 'python3 ausente' : false,
}, () => {
  it('apagar TODOS os blocos de código da teoria NÃO muda violacoes/avisos', () => {
    const comTeoria = auditTrack(trilhaPython(true), { mode: 'declared' });
    const semTeoria = auditTrack(trilhaPython(false), { mode: 'declared' });
    assert.equal(semTeoria.totals.violacoes, comTeoria.totals.violacoes);
    assert.equal(semTeoria.totals.avisos ?? 0, comTeoria.totals.avisos ?? 0);
  });

  it('…e agora o relatório DECLARA por quê, em vez de deixar o zero falar', () => {
    const semTeoria = auditTrack(trilhaPython(false), { mode: 'declared' });
    assert.equal(semTeoria.totals.checagensNaoExecutadas, 1);
    assert.ok(
      semTeoria.totals.checagensNaoExecutadas! > 0,
      'zeros sobre uma checagem não executada não são zeros medidos',
    );
  });
});

// ---------------------------------------------------------------------------
// 2 + 3 + 4 + 5 — a declaração, o histograma e o formatador
// ---------------------------------------------------------------------------

describe('audit — limitações declaradas (docs/16 §9.2, CONTRIBUTING.md)', {
  skip: !TEM_PYTHON ? 'python3 ausente' : false,
}, () => {
  it('numa trilha de Python a bateria A13–A16 é declarada com id, motivo e consequência', () => {
    const r = auditTrack(trilhaPython(true), { mode: 'declared' });
    assert.equal(r.limitacoes.length, 1);
    const lim = r.limitacoes[0];
    assert.equal(lim.id, 'A13-A16-NAO-RODOU');
    assert.match(lim.checagem, /A13/);
    assert.match(lim.motivo, /javascript-only/);
    assert.match(lim.motivo, /python/);
    assert.match(lim.consequencia, /avisos/);
    assert.match(lim.consequencia, /novosVerdadeiros/);
  });

  it('`novosVerdadeiros` fica AUSENTE quando a bateria não rodou (o fallback saiu)', () => {
    const r = auditTrack(trilhaPython(true), { mode: 'declared' });
    assert.ok(r.metrics.length > 0);
    for (const m of r.metrics) {
      assert.equal(
        m.novosVerdadeiros,
        undefined,
        'o fallback `?? novas` fazia a 2ª coluna do histograma sair idêntica à 1ª',
      );
    }
  });

  it('o formatador devolve o bloco pronto para o resumo, com o que NÃO rodou', () => {
    const linhas = linhasDeLimitacoes(auditTrack(trilhaPython(true), { mode: 'declared' }));
    const texto = linhas.join('\n');
    assert.match(texto, /LIMITACOES DECLARADAS: 1 checagem\(ns\) NAO EXECUTADA/);
    assert.match(texto, /\[A13-A16-NAO-RODOU\]/);
    assert.match(texto, /NAO RODOU porque:/);
    assert.match(texto, /no placar isso significa:/);
  });
});

describe('audit — quando TUDO roda, a lista vazia é uma afirmação verificável', () => {
  it('trilha de JavaScript: `limitacoes` vazia, `checagensNaoExecutadas` 0', () => {
    const r = auditTrack(trilhaJs(), { mode: 'declared' });
    assert.deepEqual(r.limitacoes, []);
    assert.equal(r.totals.checagensNaoExecutadas, 0);
  });

  it('…e `novosVerdadeiros` está PRESENTE em toda aula (a bateria mediu)', () => {
    const r = auditTrack(trilhaJs(), { mode: 'declared' });
    assert.ok(r.metrics.length > 0);
    for (const m of r.metrics) {
      assert.equal(typeof m.novosVerdadeiros, 'number', m.ref);
    }
  });

  it('sem limitação, o formatador devolve [] — o chamador pode imprimir sempre', () => {
    assert.deepEqual(linhasDeLimitacoes(auditTrack(trilhaJs(), { mode: 'declared' })), []);
  });
});
