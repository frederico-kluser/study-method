/**
 * tests/cx-modes-reorder.test.ts — CARACTERIZAÇÃO (golden master) de
 * `engine/modes/reorder.ts`: posições nos dois níveis de ordem, identidade
 * estável de violação, o plano de movimento mínimo, a aplicação em memória
 * (as DUAS representações andando juntas), o gate diferencial e o modo
 * dry-run/aplicar.
 *
 * Fixtures em memória (auditTrack REAL sobre elas — as violações são
 * mecânicas) + relatórios sintéticos onde o controle fino importa. OFFLINE,
 * tmpdirs próprios, produção intocada.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { LoadedTrack } from '../electron/main/content/trackLoader';
import type { TrackChallengeSource, TrackTheorySection } from '../electron/main/content/trackTypes';
import { auditTrack, type AuditReport, type Violation } from '../electron/main/engine/audit';
import {
  ErroDeReordenacao,
  aplicarMovimentos,
  chaveDaViolacao,
  placarDeReordenacao,
  planejarReordenacao,
  posicoesDaTrilha,
  reordenarTrilha,
  verificarReordenacao,
  type MovimentoDeReordenacao,
  type PlanoDeReordenacao,
} from '../electron/main/engine/modes/reorder';

// ---------------------------------------------------------------------------
// Fixtures — trilhas em memória
// ---------------------------------------------------------------------------

const TEORIA_BASE = [
  'export function saudacao(nome) {',
  "  let mensagem = 'ola';",
  '  let limite = 3;',
  "  if (nome === 'ana') {",
  "    mensagem = mensagem + ' ana';",
  '  }',
  '  return mensagem;',
  '}',
].join('\n');

const SOLUCAO_COM_TYPEOF = [
  'export function f(valor) {',
  '  let t = typeof valor;',
  "  if (t === 'number') {",
  "    return 'sim';",
  '  }',
  "  return 'nao';",
  '}',
].join('\n');

const SOLUCAO_COM_MAIOR_IGUAL = [
  'export function f(valor) {',
  '  if (valor >= 2) {',
  "    return 'sim';",
  '  }',
  "  return 'nao';",
  '}',
].join('\n');

const SOLUCAO_SIMPLES = ['export function f(valor) {', '  let x = valor;', "  return 'sim';", '}'].join('\n');

function secao(id: string, codigo: string): TrackTheorySection {
  return { id, title: `Secao ${id}`, markdown: 'Prosa da secao.', code: { language: 'js', code: codigo } };
}

function desafio(slug: string, concept: string, solutionCode: string): TrackChallengeSource {
  return {
    schemaVersion: 1,
    slug,
    title: `Desafio ${slug}`,
    concept,
    difficulty: 1,
    language: 'nodejs',
    statement: 'Escreva a funcao conforme o enunciado.',
    starterCode: 'export function f(valor) {\n  // complete\n}\n',
    testsCode:
      "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { f } from './solution.mjs';\ntest('f', () => { assert.equal(f(1), 'sim'); });\n",
    solutionCode,
    expectedTestCount: 1,
  };
}

interface AulaDeFixture {
  slug: string;
  conceitos: string[];
  teoria: TrackTheorySection[];
  desafios: TrackChallengeSource[];
  prerequisites?: string[];
}

interface ModuloDeFixture {
  slug: string;
  order: number;
  aulas: AulaDeFixture[];
}

function fazerTrilha(slug: string, modulos: ModuloDeFixture[]): LoadedTrack {
  return {
    root: {
      schemaVersion: 1,
      slug,
      title: 'Trilha de teste',
      description: 'fixture de caracterização do reorder',
      language: 'pt-BR',
      domain: 'programming',
      modules: modulos.map((m) => m.slug),
    },
    modules: modulos.map((m) => ({
      meta: {
        schemaVersion: 1,
        slug: m.slug,
        title: `Modulo ${m.slug}`,
        order: m.order,
        lessons: m.aulas.map((a) => a.slug),
      },
      challenge: null,
      lessons: m.aulas.map((a) => ({
        meta: {
          schemaVersion: 1,
          slug: a.slug,
          title: `Aula ${a.slug}`,
          summary: 'Resumo da aula.',
          difficulty: 1,
          concepts: a.conceitos,
          prerequisites: a.prerequisites ?? [],
          theory: a.teoria,
          sources: [],
          challenges: a.desafios.map((d) => d.slug),
        },
        challenges: a.desafios,
      })),
    })),
    proficiency: null,
    dir: '/memoria/cx-fixture-reorder',
  };
}

function trilhaDeUmModulo(slug: string, aulas: AulaDeFixture[]): LoadedTrack {
  return fazerTrilha(slug, [{ slug: 'm01', order: 1, aulas }]);
}

/** ORDEM canônica: a02 cobra `typeof`; a03 o ensina DEPOIS. */
function trilhaComOrdemSimples(): LoadedTrack {
  return trilhaDeUmModulo('cx-ordem-simples', [
    { slug: 'a01', conceitos: ['base'], teoria: [secao('t1', TEORIA_BASE)], desafios: [desafio('c1', 'base', SOLUCAO_SIMPLES)] },
    { slug: 'a02', conceitos: ['cobra'], teoria: [secao('t2', 'let z = 1 + 2;')], desafios: [desafio('c2', 'cobra', SOLUCAO_COM_TYPEOF)] },
    { slug: 'a03', conceitos: ['ensina'], teoria: [secao('t3', 'const tipo = typeof 10;')], desafios: [] },
  ]);
}

/** Mover resolve o alvo mas CRIA violação nova (a03 usa `>=`, ensinado em a02). */
function trilhaOndeMoverQuebra(): LoadedTrack {
  return trilhaDeUmModulo('cx-mover-quebra', [
    { slug: 'a01', conceitos: ['base'], teoria: [secao('t1', TEORIA_BASE)], desafios: [desafio('c1', 'base', SOLUCAO_SIMPLES)] },
    { slug: 'a02', conceitos: ['cobra'], teoria: [secao('t2', 'let v = 1 >= 2;')], desafios: [desafio('c2', 'cobra', SOLUCAO_COM_TYPEOF)] },
    {
      slug: 'a03',
      conceitos: ['ensina'],
      teoria: [secao('t3', 'const tipo = typeof 10;')],
      desafios: [desafio('c3', 'ensina', SOLUCAO_COM_MAIOR_IGUAL)],
    },
  ]);
}

/** PISO: a03 ensina `typeof` mas declara a02 (o cobrador) como pré-requisito. */
function trilhaComPisoDePrerequisito(): LoadedTrack {
  return trilhaDeUmModulo('cx-piso', [
    { slug: 'a01', conceitos: ['base'], teoria: [secao('t1', TEORIA_BASE)], desafios: [desafio('c1', 'base', SOLUCAO_SIMPLES)] },
    { slug: 'a02', conceitos: ['cobra'], teoria: [secao('t2', 'let z = 1 + 2;')], desafios: [desafio('c2', 'cobra', SOLUCAO_COM_TYPEOF)] },
    {
      slug: 'a03',
      conceitos: ['ensina'],
      teoria: [secao('t3', 'const tipo = typeof 10;')],
      desafios: [],
      prerequisites: ['a02'],
    },
  ]);
}

/** CICLO declarado de pré-requisitos (a02 ⇄ a03). */
function trilhaComCiclo(): LoadedTrack {
  return trilhaDeUmModulo('cx-ciclo', [
    { slug: 'a01', conceitos: ['base'], teoria: [secao('t1', TEORIA_BASE)], desafios: [desafio('c1', 'base', SOLUCAO_SIMPLES)] },
    {
      slug: 'a02',
      conceitos: ['cobra'],
      teoria: [secao('t2', 'let z = 1 + 2;')],
      desafios: [desafio('c2', 'cobra', SOLUCAO_COM_TYPEOF)],
      prerequisites: ['a03'],
    },
    {
      slug: 'a03',
      conceitos: ['ensina'],
      teoria: [secao('t3', 'const tipo = typeof 10;')],
      desafios: [],
      prerequisites: ['a02'],
    },
  ]);
}

/** DOIS módulos: quem ensina `typeof` está no módulo SEGUINTE. */
function trilhaComDoisModulos(): LoadedTrack {
  return fazerTrilha('cx-dois-modulos', [
    {
      slug: 'm01',
      order: 1,
      aulas: [
        { slug: 'a01', conceitos: ['base'], teoria: [secao('t1', TEORIA_BASE)], desafios: [desafio('c1', 'base', SOLUCAO_COM_TYPEOF)] },
        { slug: 'a02', conceitos: ['cobra'], teoria: [secao('t2', 'let z = 1 + 2;')], desafios: [desafio('c2', 'cobra', SOLUCAO_COM_TYPEOF)] },
      ],
    },
    {
      slug: 'm02',
      order: 2,
      aulas: [{ slug: 'b01', conceitos: ['ensina'], teoria: [secao('t3', 'const tipo = typeof 10;')], desafios: [] }],
    },
  ]);
}

/** Só LACUNA (`typeof` nunca ensinado) — nada de ORDEM a mover. */
function trilhaSoComLacuna(): LoadedTrack {
  return trilhaDeUmModulo('cx-so-lacuna', [
    { slug: 'a01', conceitos: ['base'], teoria: [secao('t1', TEORIA_BASE)], desafios: [desafio('c1', 'base', SOLUCAO_COM_TYPEOF)] },
  ]);
}

function planoManual(track: LoadedTrack, movimentos: MovimentoDeReordenacao[]): PlanoDeReordenacao {
  return {
    trackSlug: track.root.slug,
    alvos: [],
    movimentos,
    impossiveis: [],
    foraDeEscopo: [],
    declaracoes: ['plano montado à mão pelo teste — o veredicto é o único juiz'],
  };
}

function motivos(recusas: readonly { motivo: string }[]): string[] {
  return recusas.map((r) => r.motivo);
}

function violacao(parcial: Partial<Violation> = {}): Violation {
  return {
    regra: 'A3',
    arquivo: 'modules/m01/lessons/a02/challenges/c2/challenge.json',
    ref: 'm01/a02',
    campo: 'solutionCode',
    linha: 2,
    coluna: 3,
    construcao: 'op:unary:typeof',
    eixo: 'op',
    faixa: 'productive',
    trechoOfensor: 'typeof valor;',
    primeiraAulaQueEnsina: 'm01/a03',
    mensagem: 'mensagem de fixture',
    ...parcial,
  } as Violation;
}

function reportDe(violacoes: Violation[]): AuditReport {
  return {
    trackSlug: 'fixture',
    budgetSource: 'inferred',
    violations: violacoes,
    metrics: [],
    totals: {
      aulas: 3,
      desafios: 2,
      desafiosComViolacao: 1,
      violacoes: violacoes.filter((v) => (v.severidade ?? 'erro') !== 'aviso').length,
      lacunasDeCurriculo: violacoes.filter((v) => v.primeiraAulaQueEnsina === null && v.construcao !== null).length,
      aulasSemConstrucaoNova: 0,
    },
    hygiene: [],
    parseErrors: [],
    limitacoes: [],
  } as AuditReport;
}

function movAula(parcial: Partial<Extract<MovimentoDeReordenacao, { tipo: 'MOVER_AULA_NO_MODULO' }>> = {}): MovimentoDeReordenacao {
  return {
    tipo: 'MOVER_AULA_NO_MODULO',
    moduleSlug: 'm01',
    lessonSlug: 'a03',
    antesDe: 'a02',
    deIndice: 2,
    paraIndice: 1,
    lessonsNovas: ['a01', 'a03', 'a02'],
    ...parcial,
  };
}

// ---------------------------------------------------------------------------
// 1. Posições e identidade de violação
// ---------------------------------------------------------------------------

describe('posicoesDaTrilha — os dois níveis de ordem indexados', () => {
  it('GOLDEN: índice global (módulos por order), índice no módulo e order do módulo', () => {
    const pos = posicoesDaTrilha(trilhaComDoisModulos());
    assert.deepEqual(pos.get('m01/a01'), {
      ref: 'm01/a01', moduleSlug: 'm01', lessonSlug: 'a01', indiceGlobal: 0, indiceNoModulo: 0, moduleOrder: 1,
    });
    assert.deepEqual(pos.get('m01/a02'), {
      ref: 'm01/a02', moduleSlug: 'm01', lessonSlug: 'a02', indiceGlobal: 1, indiceNoModulo: 1, moduleOrder: 1,
    });
    assert.deepEqual(pos.get('m02/b01'), {
      ref: 'm02/b01', moduleSlug: 'm02', lessonSlug: 'b01', indiceGlobal: 2, indiceNoModulo: 0, moduleOrder: 2,
    });
  });
});

describe('chaveDaViolacao — identidade ESTÁVEL através de uma reordenação', () => {
  it('linha/coluna ficam DE FORA; construção nenhuma vira string vazia', () => {
    const a = violacao();
    const b = violacao({ linha: 99, coluna: 100 });
    assert.equal(chaveDaViolacao(a), chaveDaViolacao(b));
    assert.notEqual(chaveDaViolacao(a), chaveDaViolacao(violacao({ construcao: 'op:binary:+' })));
    assert.ok(chaveDaViolacao(violacao({ construcao: null })).endsWith('\u0000'));
  });
});

// ---------------------------------------------------------------------------
// 2. O planejamento do movimento mínimo
// ---------------------------------------------------------------------------

describe('planejarReordenacao — movimento mínimo, zero LLM, polaridade §5.5', () => {
  it('happy: a aula que ensina vai ANTES da primeira que cobra, com o array literal a gravar', () => {
    const track = trilhaComOrdemSimples();
    const plano = planejarReordenacao(track, auditTrack(track));
    assert.equal(plano.movimentos.length, 1);
    const mov = plano.movimentos[0];
    assert.equal(mov.tipo, 'MOVER_AULA_NO_MODULO');
    assert.ok(mov.tipo === 'MOVER_AULA_NO_MODULO');
    assert.equal(mov.lessonSlug, 'a03');
    assert.equal(mov.antesDe, 'a02');
    assert.deepEqual(mov.lessonsNovas, ['a01', 'a03', 'a02']);
    assert.equal(plano.alvos.length > 0, true);
    assert.equal(plano.impossiveis.length, 0);
  });

  it('polaridade §5.5: LACUNA nunca vira movimento (foraDeEscopo com o motivo)', () => {
    const track = trilhaSoComLacuna();
    const plano = planejarReordenacao(track, auditTrack(track));
    assert.equal(plano.movimentos.length, 0);
    assert.ok(plano.foraDeEscopo.some((r) => r.motivo === 'LACUNA_DE_CURRICULO'));
  });

  it('classificação das recusas: SEM_CONSTRUCAO, ALVO_NA_MESMA_AULA, ORIGEM_JA_ESTA_ANTES, MOVIMENTO_INVALIDO', () => {
    const track = trilhaDeUmModulo('cx-classifica', [
      { slug: 'a01', conceitos: [], teoria: [secao('t1', TEORIA_BASE)], desafios: [] },
      { slug: 'a02', conceitos: [], teoria: [secao('t2', 'let z = 1 + 2;')], desafios: [] },
    ]);
    const plano = planejarReordenacao(
      track,
      reportDe([
        violacao({ construcao: null, primeiraAulaQueEnsina: 'm01/a02' }),
        violacao({ ref: 'm01/a01', primeiraAulaQueEnsina: 'm01/a01' }),
        violacao({ ref: 'm01/a02', primeiraAulaQueEnsina: 'm01/a01', construcao: 'op:binary:+' }),
        violacao({ ref: 'm01/fantasma', primeiraAulaQueEnsina: 'm01/a01', construcao: 'op:binary:*' }),
      ]),
    );
    const ms = motivos(plano.foraDeEscopo);
    assert.ok(ms.includes('SEM_CONSTRUCAO'));
    assert.ok(ms.includes('ALVO_NA_MESMA_AULA'));
    assert.ok(ms.includes('ORIGEM_JA_ESTA_ANTES'));
    assert.ok(ms.includes('MOVIMENTO_INVALIDO'));
  });

  it('deduplica por chaveDeViolacao e IGNORA aviso — o plano é sobre erros', () => {
    const track = trilhaComOrdemSimples();
    const plano = planejarReordenacao(
      track,
      reportDe([
        violacao({ linha: 1 }),
        violacao({ linha: 2 }),
        violacao({ severidade: 'aviso', construcao: 'op:binary:===' }),
      ]),
    );
    assert.equal(plano.alvos.length, 1);
  });

  it('PISO_DE_PREREQUISITO: o mínimo poria a aula antes do próprio pré-requisito → impossível, sem cascatear', () => {
    const track = trilhaComPisoDePrerequisito();
    const plano = planejarReordenacao(track, auditTrack(track));
    assert.equal(plano.movimentos.length, 0);
    assert.ok(plano.impossiveis.some((r) => r.motivo === 'PISO_DE_PREREQUISITO'));
  });

  it('CICLO_DE_PREREQUISITO: NENHUM movimento e o caminho do ciclo vem fechado em `caminho`', () => {
    const track = trilhaComCiclo();
    const plano = planejarReordenacao(track, auditTrack(track));
    assert.deepEqual(plano.movimentos, []);
    const ciclo = plano.impossiveis.find((r) => r.motivo === 'CICLO_DE_PREREQUISITO');
    assert.ok(ciclo !== undefined);
    assert.ok(ciclo.caminho.length >= 3, 'o caminho do ciclo vem com os refs');
    assert.equal(ciclo.caminho[0], ciclo.caminho[ciclo.caminho.length - 1]);
  });

  it('entre MÓDULOS o movimento é do módulo inteiro (renumerar `order`), nunca mover diretório', () => {
    const track = trilhaComDoisModulos();
    const plano = planejarReordenacao(track, auditTrack(track));
    const mov = plano.movimentos.find((m) => m.tipo === 'MOVER_MODULO');
    assert.ok(mov !== undefined && mov.tipo === 'MOVER_MODULO');
    assert.equal(mov.moduleSlug, 'm02');
    assert.equal(mov.antesDe, 'm01');
    assert.ok(mov.ordensNovas.length > 0);
    assert.ok(plano.declaracoes.some((d) => d.includes('MÓDULOS diferentes')));
  });

  it('LIMITE: relatório sem erro → zero movimento, zero alvo (e aviso não vira alvo)', () => {
    const plano = planejarReordenacao(trilhaComOrdemSimples(), reportDe([]));
    assert.deepEqual(plano.movimentos, []);
    assert.deepEqual(plano.alvos, []);
  });
});

// ---------------------------------------------------------------------------
// 3. A aplicação em memória — as DUAS representações andando juntas
// ---------------------------------------------------------------------------

describe('aplicarMovimentos — clone puro, meta.lessons ↔ lessons em par', () => {
  it('move UMA aula nas duas representações e devolve o module.json a gravar', () => {
    const track = trilhaComOrdemSimples();
    const r = aplicarMovimentos(track, [movAula()]);
    assert.deepEqual(r.trilha.modules[0].meta.lessons, ['a01', 'a03', 'a02']);
    assert.deepEqual(r.trilha.modules[0].lessons.map((l) => l.meta.slug), ['a01', 'a03', 'a02']);
    assert.deepEqual(track.modules[0].meta.lessons, ['a01', 'a02', 'a03'], 'a entrada NÃO pode mudar (clone)');
    assert.deepEqual([...r.arquivos.keys()], ['modules/m01/module.json']);
    const meta = JSON.parse(r.arquivos.get('modules/m01/module.json') as string) as { lessons: string[] };
    assert.deepEqual(meta.lessons, ['a01', 'a03', 'a02']);
  });

  it('MOVER_MODULO renumera `order` E reescreve o track.json (a ordem tem DUAS representações)', () => {
    const track = trilhaComDoisModulos();
    const r = aplicarMovimentos(track, [
      {
        tipo: 'MOVER_MODULO',
        moduleSlug: 'm02',
        antesDe: 'm01',
        ordensNovas: [
          { moduleSlug: 'm02', antes: 2, depois: 1 },
          { moduleSlug: 'm01', antes: 1, depois: 2 },
        ],
      },
    ]);
    assert.ok(r.arquivos.has('track.json'));
    const root = JSON.parse(r.arquivos.get('track.json') as string) as { modules: string[] };
    assert.deepEqual(root.modules, ['m02', 'm01']);
    assert.deepEqual(r.trilha.modules.map((m) => m.meta.slug), ['m02', 'm01']);
  });

  it('fail-closed: módulo inexistente e cadeia de composição quebrada LANÇAM erro estruturado', () => {
    const track = trilhaComOrdemSimples();
    assert.throws(
      () => aplicarMovimentos(track, [movAula({ moduleSlug: 'nao-existe' })]),
      (e: unknown) => e instanceof ErroDeReordenacao && e.codigo === 'REORDER_MODULO_NAO_ENCONTRADO',
    );
    // movimento 2 calculado contra OUTRO estado: aplicá-lo apagaria o primeiro
    assert.throws(
      () => aplicarMovimentos(track, [movAula(), movAula({ lessonSlug: 'a02', lessonsNovas: ['a03', 'a02', 'a01'] })]),
      (e: unknown) => e instanceof ErroDeReordenacao && e.codigo === 'REORDER_COMPOSICAO_INCOERENTE',
    );
  });
});

// ---------------------------------------------------------------------------
// 4. O gate — verificação DIFERENCIAL ("não piora nada")
// ---------------------------------------------------------------------------

describe('verificarReordenacao — o veredicto antes de qualquer escrita', () => {
  it('movimento que resolve: ok, alvo resolvido e a ordem dePOIS é a delta esperada', () => {
    const track = trilhaComOrdemSimples();
    const plano = planejarReordenacao(track, auditTrack(track));
    const v = verificarReordenacao(track, plano);
    assert.equal(v.ok, true);
    assert.equal(v.alvosResolvidos.length, plano.alvos.length);
    assert.deepEqual(v.alvosPersistentes, []);
    assert.deepEqual(v.ordemDepois, ['m01/a01', 'm01/a03', 'm01/a02']);
    assert.deepEqual(v.ordemAntes, ['m01/a01', 'm01/a02', 'm01/a03']);
  });

  it('VIOLACAO_NOVA: mover que quebra outra aula é RECUSADO (o critério é diferencial)', () => {
    const track = trilhaOndeMoverQuebra();
    const plano = planejarReordenacao(track, auditTrack(track));
    const v = verificarReordenacao(track, plano);
    assert.equal(v.ok, false);
    assert.ok(motivos(v.recusas).includes('VIOLACAO_NOVA'));
    assert.ok(v.violacoesNovas.length > 0);
  });

  it('plano SEM movimento: ok, nada a verificar — e TODO alvo segue persistente (nunca "resolvido")', () => {
    const track = trilhaComOrdemSimples();
    const plano = planejarReordenacao(trilhaComPisoDePrerequisito(), auditTrack(trilhaComPisoDePrerequisito()));
    const v = verificarReordenacao(track, planoManual(track, []));
    assert.equal(v.ok, true);
    assert.deepEqual(v.ordemDepois, v.ordemAntes);
    const comAlvos = { ...planoManual(track, []), alvos: plano.alvos };
    const v2 = verificarReordenacao(trilhaComPisoDePrerequisito(), comAlvos);
    assert.deepEqual(v2.alvosPersistentes, plano.alvos.map((a) => a.chave));
  });

  it('plano À MÃO malformado: não-permutação vira MOVIMENTO_INVALIDO (gravar perderia aula)', () => {
    const track = trilhaComOrdemSimples();
    const v = verificarReordenacao(track, planoManual(track, [movAula({ lessonsNovas: ['a01', 'a03'] })]));
    assert.equal(v.ok, false);
    assert.ok(motivos(v.recusas).includes('MOVIMENTO_INVALIDO'));
  });

  it('CONFLITO_DE_COMPOSICAO: dois movimentos do mesmo módulo que não compõem (um desfaz o outro)', () => {
    const track = trilhaComOrdemSimples();
    const v = verificarReordenacao(
      track,
      planoManual(track, [movAula(), movAula({ lessonSlug: 'a02', lessonsNovas: ['a03', 'a02', 'a01'] })]),
    );
    assert.equal(v.ok, false);
    assert.ok(motivos(v.recusas).includes('CONFLITO_DE_COMPOSICAO'));
  });

  it('I14: `order` duplicado depois do movimento é RECUSADO (a trilha não carregaria)', () => {
    const track = trilhaComDoisModulos();
    const v = verificarReordenacao(
      track,
      planoManual(track, [
        {
          tipo: 'MOVER_MODULO',
          moduleSlug: 'm02',
          antesDe: 'm01',
          ordensNovas: [{ moduleSlug: 'm02', antes: 2, depois: 1 }],
        },
      ]),
    );
    assert.equal(v.ok, false);
    assert.ok(motivos(v.recusas).includes('I14_ORDER_INVALIDO'));
  });
});

// ---------------------------------------------------------------------------
// 5. O modo completo — dry-run (default) | aplicar
// ---------------------------------------------------------------------------

describe('reordenarTrilha — dry-run não escreve; aplicar só grava depois do veredicto', () => {
  it('dry-run: ZERO escrita mesmo com a dep injetada, aplicado false, plano + veredicto no resultado', async () => {
    const track = trilhaComOrdemSimples();
    let chamadas = 0;
    const r = await reordenarTrilha(
      { track, gravarArquivo: async () => { chamadas += 1; } },
      { slug: track.root.slug, modo: 'dry-run' },
    );
    assert.equal(r.modo, 'dry-run');
    assert.equal(r.aplicado, false);
    assert.deepEqual(r.escritos, []);
    assert.equal(chamadas, 0, 'a dep de escrita NÃO pode ser chamada no dry-run');
    assert.equal(r.plano.movimentos.length, 1);
    assert.equal(r.veredicto.ok, true);
    assert.ok(r.declaracoes.some((d) => d.includes('dry-run: NADA é gravado')));
  });

  it('aplicar feliz: grava o module.json movido, auditFinal comparado e `melhorou` verdadeiro', async () => {
    const track = trilhaComOrdemSimples();
    const escritos = new Map<string, string>();
    const r = await reordenarTrilha(
      { track, gravarArquivo: async (a, c) => { escritos.set(a, c); } },
      { slug: track.root.slug, modo: 'aplicar' },
    );
    assert.equal(r.modo, 'aplicar');
    assert.ok(r.modo === 'aplicar' && r.aplicado === true);
    assert.deepEqual(r.escritos, ['modules/m01/module.json']);
    assert.equal(escritos.size, 1);
    assert.ok(r.modo === 'aplicar' && r.melhorou === true);
    assert.ok(r.modo === 'aplicar' && r.placarFinal.violacoes < r.placarInicial.violacoes);
  });

  it('aplicar com veredicto RECUSADO: nada gravado (recusa é resultado, não exceção)', async () => {
    const track = trilhaOndeMoverQuebra();
    let chamadas = 0;
    const r = await reordenarTrilha(
      { track, gravarArquivo: async () => { chamadas += 1; } },
      { slug: track.root.slug, modo: 'aplicar' },
    );
    assert.ok(r.modo === 'aplicar' && r.aplicado === false);
    assert.deepEqual(r.escritos, []);
    assert.equal(chamadas, 0);
    assert.ok(r.declaracoes.some((d) => d.includes('plano RECUSADO')));
  });

  it('aplicar sem movimento (só lacuna): "nada a reordenar" — não é falha', async () => {
    const track = trilhaSoComLacuna();
    const r = await reordenarTrilha(
      { track, gravarArquivo: async () => { throw new Error('não deveria gravar'); } },
      { slug: track.root.slug, modo: 'aplicar' },
    );
    assert.ok(r.modo === 'aplicar' && r.aplicado === false);
    assert.ok(r.declaracoes.some((d) => d.includes('nada a reordenar')));
  });

  it('fail-closed: sem trilha → REORDER_TRILHA_INDISPONIVEL; escrita que falha → REORDER_ESCRITA_FALHOU', async () => {
    await assert.rejects(
      reordenarTrilha({}, { slug: 'nao-existe', modo: 'dry-run' }),
      (e: unknown) => e instanceof ErroDeReordenacao && e.codigo === 'REORDER_TRILHA_INDISPONIVEL',
    );
    const track = trilhaComOrdemSimples();
    await assert.rejects(
      reordenarTrilha(
        { track, gravarArquivo: async () => { throw new Error('disco cheio'); } },
        { slug: track.root.slug, modo: 'aplicar' },
      ),
      (e: unknown) => e instanceof ErroDeReordenacao && e.codigo === 'REORDER_ESCRITA_FALHOU',
    );
  });
});

describe('placarDeReordenacao — o recorte comparável do audit', () => {
  it('GOLDEN: os cinco campos saem do totals do relatório, sem recontagem', () => {
    const report = auditTrack(trilhaComOrdemSimples());
    assert.deepEqual(placarDeReordenacao(report), {
      violacoes: report.totals.violacoes,
      desafiosComViolacao: report.totals.desafiosComViolacao,
      lacunas: report.totals.lacunasDeCurriculo,
      aulas: report.totals.aulas,
      desafios: report.totals.desafios,
    });
  });
});
