/**
 * tests/cx-gap-l05-audit.test.ts — TESTES DE GAP do lote L05 sobre
 * `engine/audit.ts`, escritos ANTES da refatoração (fatiação de `auditTrack` e
 * split do arquivo). Caracterização dos trechos que os cx-* existentes NÃO
 * cobrem: as mensagens de `messageFor` (A1/A2/A3/A4), a regra A11 (cenário de
 * erro), a regra A6 (direção puxada), os estruturais I14/I15/I17, o DESAFIO DE
 * MÓDULO (orçamento da última aula do módulo) e o rótulo multi-arquivo das
 * superfícies (`files[<path>].…`). PURO: fixtures em memória, sem disco.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { LoadedLesson, LoadedModule, LoadedTrack } from '../electron/main/content/trackLoader';
import type {
  TrackChallengeLanguage,
  TrackChallengeSource,
  TrackTheorySection,
} from '../electron/main/content/trackTypes';
import { auditTrack, type Violation } from '../electron/main/engine/audit';
import { humanLabel, type AtomKey } from '../electron/main/engine/atomKeys';
import { extractAtoms } from '../electron/main/engine/extract';

// ─── fixtures (o mesmo padrão de cx-services-audit.test.ts) ──────────────────

function theory(id: string, language: string, code: string): TrackTheorySection {
  return { id, title: id, markdown: 'a teoria mostra o código', code: { language, code } };
}

function chavesDe(...codigos: string[]): AtomKey[] {
  const set = new Set<AtomKey>();
  for (const codigo of codigos) {
    const r = extractAtoms(codigo, { language: 'javascript', fileName: 'solution.mjs' });
    if (r.ok) for (const k of r.keys) set.add(k);
  }
  return [...set].sort();
}

interface AulaOpts {
  slug: string;
  teoria?: TrackTheorySection[];
  desafios?: TrackChallengeSource[];
  productive?: AtomKey[];
  receptive?: AtomKey[];
  concepts?: string[];
}

function aulaDoModulo(modulo: string, opts: AulaOpts): LoadedLesson {
  const introduces = { productive: opts.productive ?? [], receptive: opts.receptive ?? [] };
  return {
    meta: {
      schemaVersion: 1,
      slug: opts.slug,
      title: opts.slug,
      summary: opts.slug,
      difficulty: 1,
      concepts: opts.concepts ?? ['prog'],
      prerequisites: [],
      theory: opts.teoria ?? [],
      sources: [],
      challenges: (opts.desafios ?? []).map((d) => d.slug),
      introduces,
    } as LoadedLesson['meta'],
    challenges: opts.desafios ?? [],
  };
}

function trilha(modulos: Array<{ slug: string; order: number; aulas: LoadedLesson[]; challenge?: TrackChallengeSource }>): LoadedTrack {
  return {
    root: {
      schemaVersion: 1,
      slug: 'fixture-gap-l05',
      title: 'fixture',
      description: 'fixture',
      language: 'pt-BR',
      domain: 'programming',
      programmingLanguage: 'javascript' as TrackChallengeLanguage,
      modules: modulos.map((m) => m.slug),
    },
    modules: modulos.map(
      (m): LoadedModule => ({
        meta: { schemaVersion: 1, slug: m.slug, title: m.slug, order: m.order, lessons: m.aulas.map((a) => a.meta.slug) },
        lessons: m.aulas,
        challenge: m.challenge ?? null,
      }),
    ),
    proficiency: null,
    dir: '/tmp/do-l05-fixture',
  };
}

function desafio(over: Partial<TrackChallengeSource> & { slug: string }): TrackChallengeSource {
  return {
    schemaVersion: 1,
    title: over.slug,
    concept: 'prog',
    difficulty: 1,
    language: 'javascript',
    statement: '# desafio',
    starterCode: 'export function f(x) {\n  return x * 2;\n}\n',
    testsCode: 'const t = 1;\n',
    solutionCode: 'export function f(x) {\n  return x * 2;\n}\n',
    expectedTestCount: 1,
    ...over,
  } as TrackChallengeSource;
}

// ─── messageFor — as três mensagens alcançáveis (A1/A2/A3/A4) ────────────────

describe('cx-gap/l05/audit: messageFor — mensagens por origem da construção', () => {
  it('lacuna de currículo (nenhuma aula ensina): a mensagem diz que falta CRIAR a aula', () => {
    const starter = 'export function f(x) {\n  return x * 2;\n}\n';
    const t = trilha([
      {
        slug: 'm1',
        order: 1,
        aulas: [
          aulaDoModulo('m1', {
            slug: 'l1',
            desafios: [desafio({ slug: 'd1', starterCode: starter, solutionCode: starter })],
            productive: [],
            receptive: [],
          }),
        ],
      },
    ]);
    const report = auditTrack(t);
    const lacunas = report.violations.filter((v) => v.campo === 'starterCode' && v.regra === 'A1');
    assert.ok(lacunas.length > 0, 'o starter sem orçamento produz violação A1');
    for (const v of lacunas) {
      assert.equal(v.primeiraAulaQueEnsina, null);
      assert.equal(
        v.mensagem,
        `${humanLabel(v.construcao as AtomKey)} não é ensinado em NENHUMA aula desta trilha — isto é lacuna de currículo, não erro de redação: falta criar a aula atômica que o introduz`,
      );
    }
  });

  it('testsCode × construção ensinada NA MESMA aula: lido ANTES da aula (orçamento de ENTRADA)', () => {
    const starter = 'export function f(x) {\n  return x * 2;\n}\n';
    const solution = 'export function f(x) {\n  return x * 3;\n}\n';
    const tests = "import { f } from './solution.mjs';\nconst t = f(1);\n";
    const t = trilha([
      {
        slug: 'm1',
        order: 1,
        aulas: [
          aulaDoModulo('m1', {
            slug: 'l1',
            desafios: [desafio({ slug: 'd1', starterCode: starter, solutionCode: solution, testsCode: tests })],
            // tudo que o desafio usa é ensinado POR ESTA aula (produtivo);
            // o testsCode mede contra a ENTRADA (vazia aqui) ⇒ variante "ANTES".
            productive: chavesDe(starter, solution, tests),
            receptive: chavesDe(starter, solution),
          }),
        ],
      },
    ]);
    const report = auditTrack(t);
    const doTests = report.violations.filter((v) => v.campo === 'testsCode' && v.regra === 'A3');
    assert.ok(doTests.length > 0, 'o testsCode contra a entrada vazia produz violação A3');
    for (const v of doTests) {
      assert.equal(v.primeiraAulaQueEnsina, 'm1/l1');
      assert.equal(
        v.mensagem,
        `${humanLabel(v.construcao as AtomKey)} é ensinado nesta mesma aula — mas o arquivo de teste é lido ANTES da aula, e por isso só pode usar o orçamento de ENTRADA`,
      );
    }
  });

  it('construção ensinada em aula POSTERIOR: a mensagem nomeia a aula e a ordem (DEPOIS)', () => {
    const starter = 'export function f(x) {\n  return x ** 2;\n}\n';
    const t = trilha([
      {
        slug: 'm1',
        order: 1,
        aulas: [
          aulaDoModulo('m1', {
            slug: 'l1',
            desafios: [desafio({ slug: 'd1', starterCode: starter, solutionCode: starter })],
            productive: [],
            receptive: [],
          }),
          aulaDoModulo('m1', {
            slug: 'l2',
            // a aula 2 é quem ensina o que a aula 1 já usou.
            productive: chavesDe(starter),
            receptive: [],
          }),
        ],
      },
    ]);
    const report = auditTrack(t);
    const posteriores = report.violations.filter(
      (v): v is Violation & { construcao: AtomKey } =>
        v.campo === 'starterCode' && v.regra === 'A1' && v.primeiraAulaQueEnsina === 'm1/l2',
    );
    assert.ok(posteriores.length > 0, 'o starter da aula 1 com construção da aula 2 produz violação de ORDEM');
    for (const v of posteriores) {
      assert.equal(
        v.mensagem,
        `${humanLabel(v.construcao)} só é ensinado em \`m1/l2\`, que vem DEPOIS de \`m1/l1\` — reescreva sem essa construção, ou mova a aula que a ensina para antes`,
      );
    }
  });
});

// ─── A11 — cenário de erro DERIVADO do orçamento ─────────────────────────────

describe('cx-gap/l05/audit: A11 — throw/assert.throws cobrado sem estar no orçamento', () => {
  it('throw na solução fora do orçamento vira A11 (nunca A2 genérica), com a mensagem da regra', () => {
    const starter = 'export function f(x) {\n  return x * 2;\n}\n';
    const solution = "export function f(x) {\n  if (x) {\n    throw new Error('e');\n  }\n  return x * 2;\n}\n";
    const t = trilha([
      {
        slug: 'm1',
        order: 1,
        aulas: [
          aulaDoModulo('m1', {
            slug: 'l1',
            desafios: [desafio({ slug: 'd1', starterCode: starter, solutionCode: solution })],
            // o orçamento NÃO tem `throw` (só o que o starter/solução usam, menos o throw).
            productive: chavesDe(starter, solution).filter((k) => k !== 'node:ThrowStatement'),
            receptive: chavesDe(starter),
          }),
        ],
      },
    ]);
    const report = auditTrack(t);
    const a11 = report.violations.filter((v) => v.regra === 'A11');
    assert.ok(a11.length > 0, 'o throw fora do orçamento produz A11');
    for (const v of a11) {
      assert.equal(v.construcao, 'node:ThrowStatement');
      assert.equal(v.campo, 'solutionCode');
      assert.equal(
        v.mensagem,
        `${humanLabel(v.construcao as AtomKey)} cobra tratamento de erro, e o orçamento desta aula não tem \`throw\` nem \`assert.throws\` — cenário de erro é DERIVADO do orçamento, nunca obrigatório por padrão`,
      );
    }
  });
});

// ─── A6 — direção PUXADA: o desafio exercita a aula? ─────────────────────────

describe('cx-gap/l05/audit: A6 — desafio que não exercita o que a aula introduziu', () => {
  it('solução que não usa NENHUMA construção nova reprova A6 com a mensagem da direção puxada', () => {
    const codigo = 'export function f(x) {\n  return x * 2;\n}\n';
    const t = trilha([
      {
        slug: 'm1',
        order: 1,
        aulas: [
          aulaDoModulo('m1', {
            slug: 'l1',
            desafios: [desafio({ slug: 'd1', starterCode: codigo, solutionCode: codigo })],
            // a aula introduz algo que o desafio NÃO usa.
            productive: ['op:binary:**' as AtomKey],
            receptive: ['op:binary:**' as AtomKey],
          }),
        ],
      },
    ]);
    const report = auditTrack(t);
    const a6 = report.violations.filter((v) => v.regra === 'A6');
    assert.equal(a6.length, 1);
    assert.equal(a6[0].campo, 'solutionCode');
    assert.equal(a6[0].primeiraAulaQueEnsina, 'm1/l1');
    assert.equal(a6[0].trechoOfensor, 'op:binary:**');
    assert.equal(
      a6[0].mensagem,
      'o desafio não usa NADA do que esta aula introduziu — ele só repete o que o aluno já sabia, e portanto não exercita a aula',
    );
  });
});

// ─── estruturais I14 / I15 / I17 (mensagens que nenhum teste fixa) ───────────

describe('cx-gap/l05/audit: estruturais I14/I15/I17 — mensagens verbatim', () => {
  it('order de módulo duplicado (I14), theory[].id duplicado (I15) e files[].path reservado (I17)', () => {
    const codigo = 'export function f(x) {\n  return x * 2;\n}\n';
    const desafioMulti = desafio({
      slug: 'd1',
      starterCode: codigo,
      solutionCode: codigo,
      files: [
        { path: 'test.mjs', starterCode: 'const a = 1;\n', solutionCode: 'const a = 2;\n' },
      ],
    });
    const t = trilha([
      {
        slug: 'm1',
        order: 7,
        aulas: [
          aulaDoModulo('m1', {
            slug: 'l1',
            teoria: [theory('t', 'js', codigo), theory('t', 'js', codigo)],
            desafios: [desafioMulti],
            productive: chavesDe(codigo),
            receptive: chavesDe(codigo),
          }),
        ],
      },
      {
        slug: 'm2',
        order: 7, // ordem duplicada com m1
        aulas: [aulaDoModulo('m2', { slug: 'l2', productive: [], receptive: [] })],
      },
    ]);
    const report = auditTrack(t);

    const i14 = report.violations.filter((v) => v.regra === 'I14');
    assert.equal(i14.length, 1);
    assert.equal(
      i14[0].mensagem,
      '`order` 7 está duplicado com o módulo `m1` — a ordem pedagógica fica indefinida e o orçamento cumulativo passa a depender da ordem do disco',
    );

    const i15 = report.violations.filter((v) => v.regra === 'I15');
    assert.equal(i15.length, 1);
    assert.equal(
      i15[0].mensagem,
      '`theory[].id` duplicado (`t`) — a segunda seção com esse id nunca é apresentada e a aula "termina" mais cedo',
    );

    const i17 = report.violations.filter((v) => v.regra === 'I17');
    assert.equal(i17.length, 1);
    assert.equal(i17[0].trechoOfensor, 'test.mjs');
    assert.equal(
      i17[0].mensagem,
      '`files[].path` = `test.mjs` é sobrescrito pelo runner em silêncio — o que o aluno escrever nesse arquivo desaparece',
    );
  });

  it('conceito do desafio fora de concepts da aula reprova (I16) com a mensagem da aula dona', () => {
    const codigo = 'export function f(x) {\n  return x * 2;\n}\n';
    const t = trilha([
      {
        slug: 'm1',
        order: 1,
        aulas: [
          aulaDoModulo('m1', {
            slug: 'l1',
            concepts: ['outro'],
            desafios: [desafio({ slug: 'd1', concept: 'prog', starterCode: codigo, solutionCode: codigo })],
            productive: chavesDe(codigo),
            receptive: chavesDe(codigo),
          }),
        ],
      },
    ]);
    const report = auditTrack(t);
    const i16 = report.violations.filter((v) => v.regra === 'I16');
    assert.equal(i16.length, 1);
    assert.equal(i16[0].trechoOfensor, 'prog');
    assert.equal(
      i16[0].mensagem,
      'o desafio exercita o conceito `prog`, que a aula não declara em `concepts` — conceito sem aula dona não entra em nenhum orçamento',
    );
  });
});

// ─── DESAFIO DE MÓDULO — o orçamento é o da ÚLTIMA aula do módulo ────────────

describe('cx-gap/l05/audit: desafio de MÓDULO contra o orçamento da última aula', () => {
  it('violação do desafio de módulo sai com ref <mod>/module, sufixo DESAFIO DE MÓDULO e totals.desafiosDeModulo', () => {
    const ensinadoDepois = 'export function f(x) {\n  return x ** 2;\n}\n';
    const doDesafio = 'export function f(x) {\n  return x ** 3;\n}\n';
    const t = trilha([
      {
        slug: 'm1',
        order: 1,
        aulas: [
          aulaDoModulo('m1', {
            slug: 'l1',
            desafios: [],
            productive: [],
            receptive: [],
          }),
        ],
        challenge: desafio({ slug: 'dm1', starterCode: 'const s = 1;\n', solutionCode: doDesafio, testsCode: 'const t = 1;\n' }),
      },
      {
        slug: 'm2',
        order: 2,
        aulas: [
          aulaDoModulo('m2', {
            slug: 'l2',
            // o módulo 2 é quem ensina as construções do desafio do módulo 1.
            productive: chavesDe(ensinadoDepois, doDesafio),
            receptive: chavesDe(ensinadoDepois, doDesafio),
          }),
        ],
      },
    ]);
    const report = auditTrack(t);
    assert.equal(report.totals.desafiosDeModulo, 1);

    const doModulo = report.violations.filter((v) => v.ref === 'm1/module');
    assert.ok(doModulo.length > 0, 'o desafio de módulo é medido e sai em violations');
    for (const v of doModulo) {
      assert.ok(
        v.mensagem.endsWith(
          '— e este é o DESAFIO DE MÓDULO, cujo orçamento é o de saída de `m1/l1`, a última aula do módulo',
        ),
        `mensagem sem o sufixo de módulo: ${v.mensagem}`,
      );
    }
    const deOrdem = doModulo.filter((v) => v.primeiraAulaQueEnsina === 'm2/l2');
    assert.ok(deOrdem.length > 0, 'a construção ensinada no módulo seguinte é violação de ORDEM com aula nomeada');
  });
});

// ─── superfícies multi-arquivo — rótulo files[<path>].<campo> ────────────────

describe('cx-gap/l05/audit: challengeSurfaces — desafio multi-arquivo achata com rótulo files[path]', () => {
  it('erro de parse num file[].starterCode sai como A2 com trechoOfensor files[<path>].starterCode', () => {
    const ok = 'export function f(x) {\n  return x * 2;\n}\n';
    const t = trilha([
      {
        slug: 'm1',
        order: 1,
        aulas: [
          aulaDoModulo('m1', {
            slug: 'l1',
            desafios: [
              desafio({
                slug: 'd1',
                starterCode: undefined as unknown as string,
                solutionCode: undefined as unknown as string,
                files: [
                  { path: 'a.mjs', starterCode: ok, solutionCode: ok },
                  { path: 'b.mjs', starterCode: 'function (', solutionCode: ok },
                ],
              }),
            ],
            productive: chavesDe(ok),
            receptive: chavesDe(ok),
          }),
        ],
      },
    ]);
    const report = auditTrack(t);
    const a2 = report.violations.filter((v) => v.regra === 'A2');
    assert.ok(a2.some((v) => v.trechoOfensor === 'files[b.mjs].starterCode'), 'o rótulo carrega o path do arquivo');
    assert.ok(a2.every((v) => v.mensagem.startsWith('`files[')), 'a mensagem A2 nomeia a superfície multi-arquivo');
  });
});
