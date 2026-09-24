/**
 * tests/cx-services-audit.test.ts — CARACTERIZAÇÃO (golden master) de
 * `engine/audit.ts` ANTES da refatoração de core/services.
 *
 * Fixa o `auditTrack` (shape do AuditReport, presença/ausência HONESTA da barra
 * e das limitações declaradas, invariantes de contagem) e os formatadores de
 * resumo `linhasDoPlacarDaBarra` / `linhasDeLimitacoes` (linhas byte a byte —
 * o formato É contrato de saída do gate).
 * PURO: fixtures em memória (track JSON estruturada em objeto), sem disco.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { LoadedLesson, LoadedModule, LoadedTrack } from '../electron/main/content/trackLoader';
import type {
  TrackChallengeLanguage,
  TrackChallengeSource,
  TrackTheorySection,
} from '../electron/main/content/trackTypes';
import {
  auditTrack,
  linhasDeLimitacoes,
  linhasDoPlacarDaBarra,
  type AuditReport,
  type LimitacaoDeclarada,
  type PlacarDaBarra,
} from '../electron/main/engine/audit';
import type { AtomKey } from '../electron/main/engine/atomKeys';
import { extractAtoms } from '../electron/main/engine/extract';
import type { LanguageId } from '../electron/main/engine/lang/registry';

// ─── fixtures ────────────────────────────────────────────────────────────────

function theory(id: string, language: string, code: string): TrackTheorySection {
  return { id, title: id, markdown: 'a teoria mostra o código', code: { language, code } };
}

function introducesDe(codigos: string[], language: LanguageId): { productive: AtomKey[]; receptive: AtomKey[] } {
  const chaves = new Set<AtomKey>();
  for (const c of codigos) {
    const r = extractAtoms(c, { language, fileName: language === 'python' ? 'solucao.py' : 'solution.mjs' });
    if (r.ok) for (const k of r.keys) chaves.add(k);
  }
  const lista = [...chaves].sort();
  return { productive: lista, receptive: lista };
}

function trilhaJs(): LoadedTrack {
  const desafio: TrackChallengeSource = {
    schemaVersion: 1,
    slug: 'dobrar',
    title: 'dobrar',
    concept: 'funcoes',
    difficulty: 1,
    language: 'javascript',
    statement: '# dobrar',
    starterCode: 'export function dobro(x) {\n  return 0;\n}\n',
    testsCode:
      "import test from 'node:test';\nimport assert from 'node:assert/strict';\n" +
      "import { dobro } from './solution.mjs';\n\ntest('dobro de 2', () => {\n  assert.equal(dobro(2), 4);\n});\n",
    solutionCode: 'export function dobro(x) {\n  return x * 2;\n}\n',
    expectedTestCount: 1,
  };
  const teoriaCodigo = 'export function dobro(x) {\n  return x * 2;\n}\n';
  const introduces = introducesDe(
    [teoriaCodigo, desafio.starterCode ?? '', desafio.solutionCode ?? '', desafio.testsCode],
    'javascript',
  );
  const lesson: LoadedLesson = {
    meta: {
      schemaVersion: 1,
      slug: 'dobrar',
      title: 'dobrar',
      summary: 'dobrar',
      difficulty: 1,
      concepts: ['funcoes'],
      prerequisites: [],
      theory: [theory('t', 'js', teoriaCodigo)],
      sources: [],
      challenges: ['dobrar'],
      introduces,
    } as LoadedLesson['meta'],
    challenges: [desafio],
  };
  const mod: LoadedModule = {
    meta: { schemaVersion: 1, slug: 'numeros', title: 'numeros', order: 1, lessons: ['dobrar'] },
    lessons: [lesson],
    challenge: null,
  };
  const track: LoadedTrack = {
    root: {
      schemaVersion: 1,
      slug: 'fixture-js',
      title: 'fixture',
      description: 'fixture',
      language: 'pt-BR',
      domain: 'programming',
      programmingLanguage: 'javascript' as TrackChallengeLanguage,
      modules: ['numeros'],
    },
    modules: [mod],
    proficiency: null,
    dir: '/tmp/fixture',
  };
  return track;
}

/** Relatório de MÃO para os formatadores (só os campos que eles leem). */
function relatorioDeMao(over: { barra?: PlacarDaBarra; limitacoes?: LimitacaoDeclarada[] }): AuditReport {
  return {
    trackSlug: 'fixture-js',
    violations: [],
    metrics: [],
    limitacoes: over.limitacoes ?? [],
    ...(over.barra ? { barra: over.barra } : {}),
  } as unknown as AuditReport;
}

// ─── linhasDoPlacarDaBarra (formato de saída do resumo) ──────────────────────

describe('cx/audit: linhasDoPlacarDaBarra (golden master do resumo)', () => {
  it('sem a seção barra ⇒ [] (imprimir zeros que ninguém mediu é o defeito do §9.2)', () => {
    assert.deepEqual(linhasDoPlacarDaBarra(relatorioDeMao({})), []);
  });

  it('linhas byte a byte: cabeçalho da faixa, totais, por regra (padEnd 56) e o "reproduz"', () => {
    const barra: PlacarDaBarra = {
      porRegra: [
        { regra: 'A17', erros: 2, avisos: 0 },
        { regra: 'A22', erros: 0, avisos: 5 },
      ],
      erros: 2,
      avisos: 5,
      aulasComErro: 3,
      blocosQueNaoParseiam: 0,
    };
    const linhas = linhasDoPlacarDaBarra(relatorioDeMao({ barra }));
    assert.deepEqual(linhas, [
      'BARRA PEDAGOGICA A17-A24 (agnostica de linguagem — quality/barra.ts)',
      '  erros (ja contados em violacoes) ..... 2',
      '  aulas com erro de barra .............. 3',
      '  avisos (A22 formas · A24 quiz) ....... 5',
      '  blocos de teoria que nao parseiam .... 0',
      '    A17 teto do passo (<=2 produtivas novas) '.padEnd(56, '.') + ' 2 erro(s) · 0 aviso(s)',
      '    A22 duas formas sintaticas (AVISO) '.padEnd(56, '.') + ' 0 erro(s) · 5 aviso(s)',
      '  reproduz: npm run engine -- barra fixture-js --limite 0',
      '',
    ]);
  });

  it('blocos que não parseiam > 0 ganham o aviso fail-closed na própria linha', () => {
    const barra: PlacarDaBarra = {
      porRegra: [],
      erros: 0,
      avisos: 0,
      aulasComErro: 0,
      blocosQueNaoParseiam: 2,
    };
    const linhas = linhasDoPlacarDaBarra(relatorioDeMao({ barra }));
    assert.equal(
      linhas[4],
      '  blocos de teoria que nao parseiam .... 2  <- bloco que o parser recusa nao demonstra nada: entra como erro A19 (fail-closed)',
    );
  });
});

describe('cx/audit: linhasDeLimitacoes (golden master do resumo)', () => {
  it('sem limitações ⇒ [] (a lista vazia é a afirmação "nada deixou de rodar")', () => {
    assert.deepEqual(linhasDeLimitacoes(relatorioDeMao({})), []);
  });

  it('cada limitação vira 3 linhas sob o cabeçalho com a contagem', () => {
    const limitacoes: LimitacaoDeclarada[] = [
      {
        id: 'A13-A16-NAO-RODOU',
        checagem: 'bateria A13-A16 (ensino-efetivo, micro-avanço, progressividade, primeira-atividade)',
        motivo: 'a bateria é javascript-only (engine/audit.ts)',
        consequencia: 'a linha de avisos NAO fala pela bateria A13-A16',
      },
    ];
    assert.deepEqual(linhasDeLimitacoes(relatorioDeMao({ limitacoes })), [
      'LIMITACOES DECLARADAS: 1 checagem(ns) NAO EXECUTADA(S) ' +
        '(CONTRIBUTING.md · docs/16 §9.2 — o placar abaixo NAO fala por elas)',
      '  [A13-A16-NAO-RODOU] bateria A13-A16 (ensino-efetivo, micro-avanço, progressividade, primeira-atividade)',
      '     NAO RODOU porque: a bateria é javascript-only (engine/audit.ts)',
      '     no placar isso significa: a linha de avisos NAO fala pela bateria A13-A16',
      '',
    ]);
  });
});

// ─── auditTrack (caracterização do relatório) ────────────────────────────────

describe('cx/audit: auditTrack — shape e honestidade do relatório', () => {
  it('modo declared (JS): identidade, totais coerentes e limitacoes VAZIA (nada deixou de rodar)', () => {
    const rep = auditTrack(trilhaJs(), { mode: 'declared' });
    assert.equal(rep.trackSlug, 'fixture-js');
    assert.equal(rep.budgetSource, 'declared');
    assert.equal(rep.totals.aulas, 1);
    assert.equal(rep.totals.desafios, 1);
    assert.deepEqual(rep.limitacoes, [], 'JS declared: toda checagem rodou');
    assert.equal(rep.totals.checagensNaoExecutadas, 0);

    // invariantes de contagem (derivadas dos próprios achados — o refactor não
    // pode passar a contar diferente do que reporta).
    assert.equal(
      rep.totals.violacoes + (rep.totals.avisos ?? 0),
      rep.violations.length,
      'violacoes + avisos = achados listados',
    );
    assert.equal(rep.totals.checagensNaoExecutadas, rep.limitacoes.length);
    assert.equal(
      rep.totals.lacunasDeCurriculo,
      rep.violations.filter(
        (v) => v.severidade !== 'aviso' && v.construcao !== null && v.primeiraAulaQueEnsina === null,
      ).length,
    );
    assert.equal(
      rep.totals.aulasSemConstrucaoNova,
      rep.metrics.filter((m) => m.novas === 0).length,
    );

    // métricas na ordem pedagógica, com a ref `<module>/<lesson>`.
    assert.equal(rep.metrics[0].ref, 'numeros/dobrar');
    assert.equal(rep.metrics[0].desafios, 1);

    // a barra A17-A24 RODOU ⇒ a seção existe e o formatador imprime.
    assert.ok(rep.barra, 'modo declared ⇒ o placar da barra é medido');
    assert.ok(linhasDoPlacarDaBarra(rep).length > 0);
  });

  it('modo inferred: a barra NÃO roda e a limitação é DECLARADA (ausência > zero mentiroso)', () => {
    const rep = auditTrack(trilhaJs(), { mode: 'inferred' });
    assert.equal(rep.budgetSource, 'inferred');
    assert.equal(rep.barra, undefined, 'barra ausente quando não medida');
    assert.deepEqual(linhasDoPlacarDaBarra(rep), []);
    assert.ok(
      rep.limitacoes.some((l) => l.id === 'A17-A23-NAO-RODOU-EM-INFERRED'),
      'a entrada que explica por que a barra não rodou',
    );
    for (const l of rep.limitacoes) {
      assert.ok(l.checagem.length > 0, 'toda limitação diz O QUE não rodou');
      assert.ok(l.motivo.length > 0, '…e POR QUÊ');
      assert.ok(l.consequencia.length > 0, '…e o que o placar NÃO fala');
    }
  });
});
