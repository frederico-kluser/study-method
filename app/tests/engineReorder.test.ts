/**
 * tests/engineReorder.test.ts — o EXECUTOR DA REORDENAÇÃO
 * (`electron/main/engine/modes/reorder.ts`).
 *
 * O que está sob teste, e por que cada caso existe:
 *
 *   R1 — MOVIMENTO SIMPLES QUE RESOLVE. A aula que ensina `typeof` vem depois
 *        do desafio que o cobra; o plano a move para antes, a verificação
 *        aprova e o placar do audit MELHORA. É o caso que a mensagem do
 *        `audit.ts:179` manda executar ("mova a aula que a ensina para antes")
 *        e que nenhum código executava.
 *   R2 — MOVIMENTO QUE RESOLVERIA MAS QUEBRA OUTRA AULA: RECUSADO. Mover uma
 *        aula para antes muda o orçamento de TODAS as aulas entre as duas —
 *        aqui a aula movida passa a usar algo que só a aula ultrapassada
 *        ensinava. O alvo some E uma violação NOVA aparece; o veredicto é
 *        `ok: false` com `VIOLACAO_NOVA` e NADA é gravado.
 *   R3 — CICLO DE PRÉ-REQUISITO detectado e reportado COM O CAMINHO (via
 *        `graph/dag.ts::toposort`, o Kahn de critério declarado).
 *   R4 — `order` DUPLICADO depois do movimento (I14) é RECUSADO. O plano é
 *        montado À MÃO (é o que o `repair` ou um humano podem fazer): o gate
 *        não confia no planejador, ele confere o resultado.
 *   R5 — DRY-RUN NÃO ESCREVE NADA: a dep de gravação registra ZERO chamadas
 *        mesmo estando injetada, e `aplicado === false`.
 *   R6 — DEPOIS DE APLICAR, `pedagogicalOrder` E O ORÇAMENTO RECALCULADO BATEM.
 *        Único teste com disco: fixture escrita num diretório TEMPORÁRIO, lida
 *        pelo `loadTrack` real, reordenada com o gravador atômico de produção e
 *        RELIDA — o `module.json` no disco, a ordem pedagógica e o orçamento
 *        derivado têm de contar a mesma história.
 *   R7 — POLARIDADE §5.5: lacuna de currículo NUNCA vira movimento.
 *   R8 — PISO DE PRÉ-REQUISITO: o movimento mínimo poria a aula antes do
 *        próprio pré-requisito → nenhum movimento é planejado (não cascateia).
 *   R9 — I4 sobre um plano montado à mão que viola o mesmo grafo.
 *   R10 — I8 (interleaving) criado pelo movimento, sobre plano à mão.
 *   R11 — MOVIMENTO MALFORMADO (o array `lessons` novo não é permutação do
 *        antigo) é recusado ANTES de aplicar: gravar isso perderia aula.
 *   R12 — ENTRE MÓDULOS o movimento é do MÓDULO inteiro (reescreve `order`).
 *   R13 — o placar deste módulo é o MESMO do `repair` (a duplicação de cinco
 *        campos declarada no cabeçalho do `reorder.ts` é conferida).
 *   R14 — I11 (mudar a FORMA de construção já ensinada exige aula dedicada)
 *        criado pelo movimento. A fixture é de TYPESCRIPT porque em JavaScript
 *        as cinco formas do alfabeto têm BASES distintas
 *        (`form/rules.ts::JAVASCRIPT_FORM_DEFINITIONS`) e duas formas da mesma
 *        construção não existem — em TypeScript existem
 *        (`IfStatement[alternate=null]` × `IfStatement[expression=BinaryExpression]`),
 *        e é lá que I11 tem o que checar.
 *
 * FIXTURES, NUNCA PRODUÇÃO (convenção do commit `33b0eab`; é por isso que o CLI
 * ganhou `--dir`). A trilha `python` de hoje tem ZERO violações de ordem — este
 * módulo é garantia para o que ainda vai ser gerado, e testá-lo contra o
 * conteúdo real só provaria que o conteúdo real está bom. O único teste com
 * disco escreve em `mkdtemp` e apaga no fim; `resources/tracks` não é tocado
 * por nenhum caso.
 *
 * OFFLINE E DETERMINÍSTICO: nenhuma LLM, nenhuma rede, nenhuma chave. O
 * `auditTrack` é o REAL sobre as fixtures — as violações são mecânicas.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { loadTrack, type LoadedTrack } from '../electron/main/content/trackLoader';
import type { TrackChallengeSource, TrackTheorySection } from '../electron/main/content/trackTypes';
import { auditTrack } from '../electron/main/engine/audit';
import { deriveTrackBudget, pedagogicalOrder } from '../electron/main/engine/budget';
import { placarDoAudit } from '../electron/main/engine/modes/repair';
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
// Fixtures — trilhas em memória (o disco só aparece no R6)
// ---------------------------------------------------------------------------

/** Teoria que ensina function/let/const/if/return/===/+/export e numeral. */
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
      description: 'fixture do executor de reordenacao',
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
    dir: '/memoria/fixture-reorder',
  };
}

/** Um só módulo, N aulas — o formato da maioria dos casos. */
function trilhaDeUmModulo(slug: string, aulas: AulaDeFixture[]): LoadedTrack {
  return fazerTrilha(slug, [{ slug: 'm01', order: 1, aulas }]);
}

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

/**
 * FIXTURE 1 — a violação de ORDEM canônica: `a02` cobra `typeof` no desafio e a
 * aula que o ensina (`a03`) vem DEPOIS. O movimento mínimo é `a03` para antes
 * de `a02`, e ele não quebra ninguém.
 */
function trilhaComOrdemSimples(): LoadedTrack {
  return trilhaDeUmModulo('trilha-ordem-simples', [
    { slug: 'a01', conceitos: ['base'], teoria: [secao('t1', TEORIA_BASE)], desafios: [desafio('c1', 'base', SOLUCAO_SIMPLES)] },
    { slug: 'a02', conceitos: ['cobra'], teoria: [secao('t2', 'let z = 1 + 2;')], desafios: [desafio('c2', 'cobra', SOLUCAO_COM_TYPEOF)] },
    { slug: 'a03', conceitos: ['ensina'], teoria: [secao('t3', 'const tipo = typeof 10;')], desafios: [] },
  ]);
}

/**
 * FIXTURE 2 — o movimento resolve o alvo E QUEBRA OUTRA AULA: `a03` (que ensina
 * `typeof`) tem um desafio que usa `>=`, e quem ensina `>=` é `a02` — a aula
 * que `a03` vai ultrapassar. Depois do movimento, `a03` usa o que ainda não foi
 * ensinado: violação NOVA.
 */
function trilhaOndeMoverQuebra(): LoadedTrack {
  return trilhaDeUmModulo('trilha-mover-quebra', [
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

/**
 * FIXTURE 3 — `a03` ensina `typeof` (cobrado em `a02`) mas DECLARA `a02` como
 * pré-requisito: o movimento mínimo poria `a03` antes do próprio pré-requisito.
 */
function trilhaComPisoDePrerequisito(): LoadedTrack {
  return trilhaDeUmModulo('trilha-piso', [
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

/** FIXTURE 4 — ciclo declarado: `a02` exige `a03` e `a03` exige `a02`. */
function trilhaComCiclo(): LoadedTrack {
  return trilhaDeUmModulo('trilha-ciclo', [
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

/**
 * FIXTURE 5 — dois módulos: quem ensina `typeof` está no módulo SEGUINTE, e as
 * duas aulas do primeiro módulo já o cobram. Movimento: o módulo `m02` inteiro
 * para antes de `m01` (mover só a aula exigiria mover o diretório dela).
 *
 * As duas aulas de `m01` cobram `typeof` de propósito: depois do movimento,
 * `m01/a01` deixa de ser a primeira aula da trilha e passa a dever REUSO do que
 * a aula anterior demonstrou (A15b da bateria de progressão). Um desafio que
 * não tocasse em nada de `m02/b01` faria o próprio gate deste módulo recusar o
 * movimento — com razão.
 */
function trilhaComDoisModulos(): LoadedTrack {
  return fazerTrilha('trilha-dois-modulos', [
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

/**
 * FIXTURE 6 — o interleaving (I8): três aulas da família `funcoes` separadas por
 * uma de `outros`. Tirar a intrusa do meio junta as três — o que I8 proíbe.
 */
function trilhaComInterleaving(): LoadedTrack {
  return trilhaDeUmModulo('trilha-interleaving', [
    { slug: 'a01', conceitos: ['base'], teoria: [secao('t1', TEORIA_BASE)], desafios: [] },
    { slug: 'a02', conceitos: ['funcoes'], teoria: [secao('t2', 'let z = 1 + 2;')], desafios: [] },
    { slug: 'a03', conceitos: ['funcoes'], teoria: [secao('t3', 'let w = 2 + 3;')], desafios: [] },
    { slug: 'a04', conceitos: ['outros'], teoria: [secao('t4', 'let y = 3 + 4;')], desafios: [] },
    { slug: 'a05', conceitos: ['funcoes'], teoria: [secao('t5', 'let k = 4 + 5;')], desafios: [] },
  ]);
}

/** Plano montado à mão — o gate não confia no planejador (R4/R9/R10/R11). */
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

// ---------------------------------------------------------------------------
// Escrita da fixture no disco (só o R6)
// ---------------------------------------------------------------------------

async function escreverJson(arquivo: string, valor: unknown): Promise<void> {
  await fsp.mkdir(path.dirname(arquivo), { recursive: true });
  await fsp.writeFile(arquivo, `${JSON.stringify(valor, null, 2)}\n`, 'utf8');
}

/** Materializa uma fixture em memória no layout que o `loadTrack` real espera. */
async function escreverTrilhaNoDisco(track: LoadedTrack, dir: string): Promise<void> {
  await escreverJson(path.join(dir, 'track.json'), track.root);
  for (const mod of track.modules) {
    const dirModulo = path.join(dir, 'modules', mod.meta.slug);
    await escreverJson(path.join(dirModulo, 'module.json'), mod.meta);
    for (const lesson of mod.lessons) {
      const dirAula = path.join(dirModulo, 'lessons', lesson.meta.slug);
      await escreverJson(path.join(dirAula, 'lesson.json'), lesson.meta);
      for (const challenge of lesson.challenges) {
        await escreverJson(path.join(dirAula, 'challenges', challenge.slug, 'challenge.json'), challenge);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// R1 — o movimento simples que resolve
// ---------------------------------------------------------------------------

describe('reorder — o movimento mínimo que resolve a violação de ORDEM', () => {
  it('R1: planeja mover a aula que ensina para antes da que cobra, e a verificação aprova', () => {
    const track = trilhaComOrdemSimples();
    const report = auditTrack(track);

    // A pré-condição do caso: existe violação de ORDEM (a construção É ensinada,
    // só que tarde demais) — sem ela o teste não estaria testando nada.
    const ordens = report.violations.filter(
      (v) => v.primeiraAulaQueEnsina !== null && v.primeiraAulaQueEnsina !== v.ref && v.construcao !== null,
    );
    assert.ok(ordens.length > 0, 'a fixture precisa ter violação de ORDEM');
    assert.ok(
      ordens.every((v) => v.ref === 'm01/a02' && v.primeiraAulaQueEnsina === 'm01/a03'),
      'as violações de ordem da fixture são todas a02 cobrando o que a03 ensina',
    );

    const plano = planejarReordenacao(track, report);
    assert.equal(plano.movimentos.length, 1);
    const mov = plano.movimentos[0];
    assert.equal(mov.tipo, 'MOVER_AULA_NO_MODULO');
    if (mov.tipo !== 'MOVER_AULA_NO_MODULO') return;
    assert.equal(mov.moduleSlug, 'm01');
    assert.equal(mov.lessonSlug, 'a03');
    assert.equal(mov.antesDe, 'a02');
    assert.deepEqual([...mov.lessonsNovas], ['a01', 'a03', 'a02']);

    const veredicto = verificarReordenacao(track, plano);
    assert.equal(veredicto.ok, true, `recusas inesperadas: ${JSON.stringify(veredicto.recusas)}`);
    assert.deepEqual([...veredicto.ordemAntes], ['m01/a01', 'm01/a02', 'm01/a03']);
    assert.deepEqual([...veredicto.ordemDepois], ['m01/a01', 'm01/a03', 'm01/a02']);
    assert.equal(veredicto.alvosPersistentes.length, 0);
    assert.deepEqual([...veredicto.violacoesNovas], []);
    assert.equal(veredicto.alvosResolvidos.length, plano.alvos.length);
    assert.ok(
      veredicto.placarDepois.violacoes < veredicto.placarAntes.violacoes,
      'a reordenação tem de MELHORAR o placar do audit',
    );
  });

  it('R1b: a ordem pedagógica derivada bate com o array `lessons` gravado (os dois níveis andam juntos)', () => {
    const track = trilhaComOrdemSimples();
    const plano = planejarReordenacao(track, auditTrack(track));
    const { trilha, arquivos } = aplicarMovimentos(track, plano.movimentos);

    // O nível 2 (o array do module.json) e o nível 3 (a ordem pedagógica).
    const modulo = trilha.modules.find((m) => m.meta.slug === 'm01');
    assert.ok(modulo);
    assert.deepEqual([...modulo.meta.lessons], ['a01', 'a03', 'a02']);
    assert.deepEqual(
      pedagogicalOrder(trilha).map((a) => a.lessonSlug),
      ['a01', 'a03', 'a02'],
      'pedagogicalOrder lê `mod.lessons` (os objetos), não `mod.meta.lessons` — os dois têm de andar em par',
    );
    assert.deepEqual([...arquivos.keys()], ['modules/m01/module.json']);
    const gravado = JSON.parse(arquivos.get('modules/m01/module.json') as string) as { lessons: string[] };
    assert.deepEqual(gravado.lessons, ['a01', 'a03', 'a02']);
  });
});

// ---------------------------------------------------------------------------
// R2 — resolve o alvo mas quebra outra aula: RECUSADO
// ---------------------------------------------------------------------------

describe('reorder — o gate recusa o movimento que quebra outra aula', () => {
  it('R2: o alvo some, mas aparece violação NOVA no caminho — veredicto ok:false', () => {
    const track = trilhaOndeMoverQuebra();
    const plano = planejarReordenacao(track, auditTrack(track));
    assert.equal(plano.movimentos.length, 1, 'o planejador PROPÕE o movimento — quem recusa é a verificação');

    const veredicto = verificarReordenacao(track, plano);
    assert.equal(veredicto.ok, false);
    assert.ok(motivos(veredicto.recusas).includes('VIOLACAO_NOVA'));
    assert.ok(
      veredicto.violacoesNovas.some((c) => c.includes('m01/lessons/a03') && c.includes('op:binary:>=')),
      `a violação nova é a03 usando \`>=\`, que a02 ensinava: ${JSON.stringify(veredicto.violacoesNovas)}`,
    );
    // O alvo REALMENTE seria resolvido — o que reprova é o dano colateral.
    assert.ok(veredicto.alvosResolvidos.length > 0);
  });

  it('R2b: `aplicar` sobre plano recusado NÃO grava nada e devolve aplicado:false', async () => {
    const track = trilhaOndeMoverQuebra();
    const gravados: string[] = [];
    const resultado = await reordenarTrilha(
      { track, gravarArquivo: (arquivo) => void gravados.push(arquivo) },
      { slug: track.root.slug, modo: 'aplicar' },
    );
    assert.equal(resultado.modo, 'aplicar');
    if (resultado.modo !== 'aplicar') return;
    assert.equal(resultado.veredicto.ok, false);
    assert.equal(resultado.aplicado, false);
    assert.deepEqual(gravados, []);
    assert.deepEqual([...resultado.escritos], []);
    assert.equal(resultado.placarFinal.violacoes, resultado.placarInicial.violacoes);
    assert.equal(resultado.melhorou, false);
  });
});

// ---------------------------------------------------------------------------
// R3 — ciclo de pré-requisito, com o caminho
// ---------------------------------------------------------------------------

describe('reorder — ciclo de pré-requisito', () => {
  it('R3: detecta o ciclo, reporta o CAMINHO fechado e não planeja movimento nenhum', () => {
    const track = trilhaComCiclo();
    const plano = planejarReordenacao(track, auditTrack(track));

    assert.deepEqual([...plano.movimentos], [], 'com ciclo, fail-closed: zero movimentos');
    assert.equal(plano.impossiveis.length, 1);
    const ciclo = plano.impossiveis[0];
    assert.equal(ciclo.motivo, 'CICLO_DE_PREREQUISITO');
    // O caminho vem FECHADO (o primeiro nó se repete no fim) e em refs de AULA —
    // é o contrato do `toposort` traduzido de volta dos ids sintéticos.
    assert.ok(ciclo.caminho.length >= 3, `caminho curto demais: ${JSON.stringify(ciclo.caminho)}`);
    assert.equal(ciclo.caminho[0], ciclo.caminho[ciclo.caminho.length - 1]);
    assert.ok(ciclo.caminho.includes('m01/a02'));
    assert.ok(ciclo.caminho.includes('m01/a03'));
    assert.ok(ciclo.mensagem.includes('→'), 'a mensagem mostra o caminho, não só diz que há ciclo');
  });

  it('R3b: a verificação recusa até um plano montado à mão quando o grafo tem ciclo', () => {
    const track = trilhaComCiclo();
    const veredicto = verificarReordenacao(
      track,
      planoManual(track, [
        {
          tipo: 'MOVER_AULA_NO_MODULO',
          moduleSlug: 'm01',
          lessonSlug: 'a03',
          antesDe: 'a02',
          deIndice: 2,
          paraIndice: 1,
          lessonsNovas: ['a01', 'a03', 'a02'],
        },
      ]),
    );
    assert.equal(veredicto.ok, false);
    assert.ok(motivos(veredicto.recusas).includes('CICLO_DE_PREREQUISITO'));
  });
});

// ---------------------------------------------------------------------------
// R4 — I14: `order` duplicado depois do movimento
// ---------------------------------------------------------------------------

describe('reorder — I14 (`order` único) depois do movimento', () => {
  it('R4: plano à mão que deixaria dois módulos com o mesmo `order` é RECUSADO', () => {
    const track = trilhaComDoisModulos();
    // m01 continua em 1 e m02 passa a 1: `order` duplicado — a ordem pedagógica
    // ficaria indefinida e passaria a depender da ordem do disco.
    const veredicto = verificarReordenacao(
      track,
      planoManual(track, [
        { tipo: 'MOVER_MODULO', moduleSlug: 'm02', antesDe: 'm01', ordensNovas: [{ moduleSlug: 'm02', antes: 2, depois: 1 }] },
      ]),
    );
    assert.equal(veredicto.ok, false);
    assert.ok(motivos(veredicto.recusas).includes('I14_ORDER_INVALIDO'));
    const i14 = veredicto.recusas.find((r) => r.motivo === 'I14_ORDER_INVALIDO');
    assert.ok(i14);
    assert.deepEqual([...i14.refs].sort(), ['m01', 'm02']);
  });

  it('R4b: `order` fora de 1..999 também é recusado (a trilha nem carregaria depois de gravada)', () => {
    const track = trilhaComDoisModulos();
    const veredicto = verificarReordenacao(
      track,
      planoManual(track, [
        { tipo: 'MOVER_MODULO', moduleSlug: 'm02', antesDe: 'm01', ordensNovas: [{ moduleSlug: 'm02', antes: 2, depois: 0 }] },
      ]),
    );
    assert.equal(veredicto.ok, false);
    assert.ok(motivos(veredicto.recusas).includes('I14_ORDER_INVALIDO'));
  });

  it('R4c: o planejador renumera REUSANDO os `order` existentes — I14 sai por construção', () => {
    const track = trilhaComDoisModulos();
    const plano = planejarReordenacao(track, auditTrack(track));
    const mov = plano.movimentos.find((m) => m.tipo === 'MOVER_MODULO');
    assert.ok(mov && mov.tipo === 'MOVER_MODULO');
    const { trilha } = aplicarMovimentos(track, [mov]);
    const orders = trilha.modules.map((m) => m.meta.order).sort((a, b) => a - b);
    assert.deepEqual(orders, [1, 2], 'os valores de `order` da trilha são REUSADOS, não inventados');
    assert.equal(new Set(orders).size, orders.length, 'e continuam únicos (I14)');
  });
});

// ---------------------------------------------------------------------------
// R5 — dry-run é o default e não escreve
// ---------------------------------------------------------------------------

describe('reorder — dry-run', () => {
  it('R5: dry-run NÃO chama a dep de gravação nem uma vez, e devolve o plano', async () => {
    const track = trilhaComOrdemSimples();
    const gravados: Array<{ arquivo: string; conteudo: string }> = [];
    const resultado = await reordenarTrilha(
      { track, gravarArquivo: (arquivo, conteudo) => void gravados.push({ arquivo, conteudo }) },
      { slug: track.root.slug, modo: 'dry-run' },
    );

    assert.equal(resultado.modo, 'dry-run');
    assert.equal(resultado.aplicado, false);
    assert.deepEqual(gravados, [], 'dry-run com dep de escrita INJETADA continua sem escrever');
    assert.deepEqual([...resultado.escritos], []);
    assert.equal(resultado.plano.movimentos.length, 1);
    assert.equal(resultado.veredicto.ok, true);
    // O delta esperado é o que o dry-run existe para mostrar.
    assert.deepEqual([...resultado.veredicto.ordemDepois], ['m01/a01', 'm01/a03', 'm01/a02']);
    assert.ok(resultado.declaracoes.some((d) => d.includes('dry-run: NADA é gravado')));
  });

  it('R5b: sem trilha injetada e sem carregador, o erro é ESTRUTURADO (fail-closed)', async () => {
    await assert.rejects(
      () => reordenarTrilha({}, { slug: 'inexistente', modo: 'dry-run' }),
      (erro: unknown) => {
        assert.ok(erro instanceof ErroDeReordenacao);
        assert.equal(erro.codigo, 'REORDER_TRILHA_INDISPONIVEL');
        assert.equal(erro.etapa, 'entrada');
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// R6 — depois de aplicar: ordem pedagógica e orçamento batem (o único com disco)
// ---------------------------------------------------------------------------

describe('reorder — aplicar de verdade, em disco', () => {
  it('R6: grava o module.json, e a trilha RELIDA tem a mesma ordem e o mesmo orçamento', async () => {
    const dir = await fsp.mkdtemp(path.join(tmpdir(), 'reorder-fixture-'));
    try {
      const fixture = trilhaComOrdemSimples();
      const dirTrilha = path.join(dir, fixture.root.slug);
      await escreverTrilhaNoDisco(fixture, dirTrilha);

      const track = await loadTrack(dirTrilha);
      assert.deepEqual(
        pedagogicalOrder(track).map((a) => a.lessonSlug),
        ['a01', 'a02', 'a03'],
      );

      // Sem `deps.gravarArquivo`: usa o gravador default (escreverAtomico —
      // tmp + fsync + rename), que é o caminho de produção.
      const resultado = await reordenarTrilha({ track }, { slug: fixture.root.slug, modo: 'aplicar' });
      assert.equal(resultado.modo, 'aplicar');
      if (resultado.modo !== 'aplicar') return;
      assert.equal(resultado.aplicado, true);
      assert.deepEqual([...resultado.escritos], ['modules/m01/module.json']);
      assert.ok(resultado.melhorou, 'o placar do audit tem de melhorar');

      // Nenhum arquivo temporário sobrou (`.module.json.tmp.<pid>.<hex>`).
      const noDiretorio = await fsp.readdir(path.join(dirTrilha, 'modules', 'm01'));
      assert.deepEqual(noDiretorio.filter((n) => n.includes('.tmp.')), [], 'escrita atômica não deixa tmp para trás');

      // A PROVA: a trilha RELIDA do disco conta a mesma história.
      const relida = await loadTrack(dirTrilha);
      const ordemRelida = pedagogicalOrder(relida).map((a) => `${a.moduleSlug}/${a.lessonSlug}`);
      assert.deepEqual(ordemRelida, [...resultado.veredicto.ordemDepois]);
      assert.deepEqual(
        relida.modules.find((m) => m.meta.slug === 'm01')?.meta.lessons,
        ['a01', 'a03', 'a02'],
      );

      const orcamento = deriveTrackBudget(relida);
      assert.deepEqual(
        orcamento.lessons.map((l) => l.ref),
        ordemRelida,
        'o orçamento é derivado DA ORDEM: as duas sequências são a mesma',
      );
      // `typeof` passou a ser ensinado ANTES da aula que o cobra.
      assert.equal(orcamento.firstTaughtIn.get('op:unary:typeof'), 'm01/a03');
      const a02 = orcamento.byRef.get('m01/a02');
      assert.ok(a02);
      assert.ok(a02.entrada.productive.has('op:unary:typeof'), 'a02 agora ENTRA com typeof no orçamento');

      const auditRelido = auditTrack(relida);
      assert.equal(auditRelido.totals.violacoes, resultado.placarFinal.violacoes);
      assert.deepEqual(
        posicoesDaTrilha(relida).get('m01/a03')?.indiceGlobal,
        1,
        'a aula que ensina está agora na posição 1 da ordem pedagógica',
      );
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// R7 — polaridade §5.5: lacuna NUNCA vira movimento
// ---------------------------------------------------------------------------

describe('reorder — polaridade §5.5', () => {
  it('R7: violação com `primeiraAulaQueEnsina === null` sai como LACUNA_DE_CURRICULO, nunca como movimento', () => {
    const track = trilhaComOrdemSimples();
    const report = auditTrack(track);
    const plano = planejarReordenacao(track, report);

    const lacunasDoAudit = report.violations.filter(
      (v) => (v.severidade ?? 'erro') !== 'aviso' && v.construcao !== null && v.primeiraAulaQueEnsina === null,
    );
    assert.ok(lacunasDoAudit.length > 0, 'a fixture precisa ter ao menos uma lacuna para o teste valer');

    const chavesDeLacuna = new Set(lacunasDoAudit.map(chaveDaViolacao));
    for (const alvo of plano.alvos) {
      assert.equal(chavesDeLacuna.has(alvo.chave), false, 'nenhuma lacuna pode virar alvo de movimento');
      assert.notEqual(alvo.ensinadaEm, null);
    }
    assert.ok(motivos(plano.foraDeEscopo).includes('LACUNA_DE_CURRICULO'));
    assert.ok(
      plano.foraDeEscopo
        .filter((r) => r.motivo === 'LACUNA_DE_CURRICULO')
        .every((r) => r.mensagem.includes('CRIAR A AULA')),
      'a mensagem manda CRIAR A AULA — a outra metade do pedido, não desta',
    );
  });

  it('R7b: construção ensinada pela PRÓPRIA aula não vira movimento (mover para antes de si mesma não existe)', () => {
    const track = trilhaComOrdemSimples();
    const plano = planejarReordenacao(track, auditTrack(track));
    for (const alvo of plano.alvos) assert.notEqual(alvo.ensinadaEm, alvo.ref);
  });
});

// ---------------------------------------------------------------------------
// R8/R9 — o grafo de pré-requisitos manda
// ---------------------------------------------------------------------------

describe('reorder — o grafo de pré-requisitos', () => {
  it('R8: quando o movimento mínimo poria a aula antes do próprio pré-requisito, nada é planejado', () => {
    const track = trilhaComPisoDePrerequisito();
    const plano = planejarReordenacao(track, auditTrack(track));

    assert.ok(plano.alvos.length > 0, 'a violação de ordem existe');
    assert.deepEqual([...plano.movimentos], [], 'e mesmo assim nenhum movimento é planejado');
    assert.equal(plano.impossiveis.length, 1);
    assert.equal(plano.impossiveis[0].motivo, 'PISO_DE_PREREQUISITO');
    assert.deepEqual([...plano.impossiveis[0].refs], ['m01/a03', 'm01/a02']);
    assert.ok(
      plano.impossiveis[0].mensagem.includes('não cascateia'),
      'o módulo declara que NÃO move o pré-requisito junto — isso não seria movimento mínimo',
    );
  });

  it('R9: plano à mão que inverte um pré-requisito é recusado por I4', () => {
    const track = trilhaComPisoDePrerequisito();
    const veredicto = verificarReordenacao(
      track,
      planoManual(track, [
        {
          tipo: 'MOVER_AULA_NO_MODULO',
          moduleSlug: 'm01',
          lessonSlug: 'a03',
          antesDe: 'a02',
          deIndice: 2,
          paraIndice: 1,
          lessonsNovas: ['a01', 'a03', 'a02'],
        },
      ]),
    );
    assert.equal(veredicto.ok, false);
    assert.ok(motivos(veredicto.recusas).includes('I4_PREREQUISITO_DEPOIS'));
    const i4 = veredicto.recusas.find((r) => r.motivo === 'I4_PREREQUISITO_DEPOIS');
    assert.ok(i4);
    assert.deepEqual([...i4.refs], ['m01/a03', 'm01/a02']);
  });
});

// ---------------------------------------------------------------------------
// R10 — I8 (interleaving) criado pelo movimento
// ---------------------------------------------------------------------------

describe('reorder — I8 (interleaving)', () => {
  it('R10: o movimento que junta 3 aulas da mesma família é recusado', () => {
    const track = trilhaComInterleaving();
    // Tira a04 (família `outros`) do meio e joga para o fim: a02/a03/a05 (todas
    // `funcoes`) ficam consecutivas.
    const veredicto = verificarReordenacao(
      track,
      planoManual(track, [
        {
          tipo: 'MOVER_AULA_NO_MODULO',
          moduleSlug: 'm01',
          lessonSlug: 'a04',
          antesDe: 'a05',
          deIndice: 3,
          paraIndice: 4,
          lessonsNovas: ['a01', 'a02', 'a03', 'a05', 'a04'],
        },
      ]),
    );
    assert.equal(veredicto.ok, false);
    assert.ok(motivos(veredicto.recusas).includes('I8_INTERLEAVING'));
    const i8 = veredicto.recusas.find((r) => r.motivo === 'I8_INTERLEAVING');
    assert.ok(i8);
    assert.deepEqual([...i8.refs], ['m01/a02', 'm01/a03', 'm01/a05']);
  });

  it('R10b: o interleaving que JÁ existia antes não reprova o movimento (verificação diferencial)', () => {
    const track = trilhaDeUmModulo('trilha-i8-pre-existente', [
      { slug: 'a01', conceitos: ['funcoes'], teoria: [secao('t1', TEORIA_BASE)], desafios: [] },
      { slug: 'a02', conceitos: ['funcoes'], teoria: [secao('t2', 'let z = 1 + 2;')], desafios: [] },
      { slug: 'a03', conceitos: ['funcoes'], teoria: [secao('t3', 'let w = 2 + 3;')], desafios: [] },
    ]);
    // Permuta a02/a03: as 3 aulas continuam sendo a mesma família — a violação
    // I8 é a MESMA de antes, e não é o movimento que a criou.
    const veredicto = verificarReordenacao(
      track,
      planoManual(track, [
        {
          tipo: 'MOVER_AULA_NO_MODULO',
          moduleSlug: 'm01',
          lessonSlug: 'a03',
          antesDe: 'a02',
          deIndice: 2,
          paraIndice: 1,
          lessonsNovas: ['a01', 'a03', 'a02'],
        },
      ]),
    );
    assert.equal(motivos(veredicto.recusas).includes('I8_INTERLEAVING'), false);
  });
});

// ---------------------------------------------------------------------------
// R11 — movimento malformado
// ---------------------------------------------------------------------------

describe('reorder — forma do movimento', () => {
  it('R11: `lessonsNovas` que não é permutação de `lessons` é recusado ANTES de aplicar', () => {
    const track = trilhaComOrdemSimples();
    const veredicto = verificarReordenacao(
      track,
      planoManual(track, [
        {
          tipo: 'MOVER_AULA_NO_MODULO',
          moduleSlug: 'm01',
          lessonSlug: 'a03',
          antesDe: 'a02',
          deIndice: 2,
          paraIndice: 1,
          lessonsNovas: ['a01', 'a03'], // a02 SUMIU
        },
      ]),
    );
    assert.equal(veredicto.ok, false);
    assert.deepEqual(motivos(veredicto.recusas), ['MOVIMENTO_INVALIDO']);
    assert.deepEqual([...veredicto.ordemDepois], [...veredicto.ordemAntes], 'nada foi aplicado nem em memória');
  });

  it('R11b: movimento citando módulo inexistente é recusado, e aplicar lança erro ESTRUTURADO', () => {
    const track = trilhaComOrdemSimples();
    const movimento: MovimentoDeReordenacao = {
      tipo: 'MOVER_MODULO',
      moduleSlug: 'm99',
      antesDe: 'm01',
      ordensNovas: [{ moduleSlug: 'm99', antes: 9, depois: 1 }],
    };
    const veredicto = verificarReordenacao(track, planoManual(track, [movimento]));
    assert.equal(veredicto.ok, false);
    assert.deepEqual(motivos(veredicto.recusas), ['MOVIMENTO_INVALIDO']);

    assert.throws(
      () => aplicarMovimentos(track, [movimento]),
      (erro: unknown) => {
        assert.ok(erro instanceof ErroDeReordenacao);
        assert.equal(erro.codigo, 'REORDER_MODULO_NAO_ENCONTRADO');
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// R12 — entre módulos, o movimento é do MÓDULO
// ---------------------------------------------------------------------------

describe('reorder — movimento entre módulos', () => {
  it('R12: aula que ensina em outro módulo ⇒ o MÓDULO inteiro se move (reescreve `order`)', async () => {
    const track = trilhaComDoisModulos();
    const plano = planejarReordenacao(track, auditTrack(track));
    assert.equal(plano.movimentos.length, 1);
    const mov = plano.movimentos[0];
    assert.equal(mov.tipo, 'MOVER_MODULO');
    if (mov.tipo !== 'MOVER_MODULO') return;
    assert.equal(mov.moduleSlug, 'm02');
    assert.equal(mov.antesDe, 'm01');
    assert.deepEqual(
      [...mov.ordensNovas].sort((a, b) => (a.moduleSlug < b.moduleSlug ? -1 : 1)),
      [
        { moduleSlug: 'm01', antes: 1, depois: 2 },
        { moduleSlug: 'm02', antes: 2, depois: 1 },
      ],
    );
    assert.ok(
      plano.declaracoes.some((d) => d.includes('MÓDULOS diferentes')),
      'o módulo DECLARA por que o movimento é grosso (mover a aula exigiria mover o diretório dela)',
    );

    // E a aplicação grava os DOIS module.json (os dois `order` mudaram).
    const gravados: string[] = [];
    const resultado = await reordenarTrilha(
      { track, gravarArquivo: (arquivo) => void gravados.push(arquivo) },
      { slug: track.root.slug, modo: 'aplicar' },
    );
    assert.equal(resultado.modo, 'aplicar');
    if (resultado.modo !== 'aplicar') return;
    assert.equal(resultado.veredicto.ok, true, `recusas: ${JSON.stringify(resultado.veredicto.recusas)}`);
    assert.equal(resultado.aplicado, true);
    // Os DOIS `module.json` (os dois `order` mudaram) MAIS o `track.json`: a
    // ordem do array `track.json.modules` é a que o loader usa para montar
    // `track.modules`, e a bateria A13-A16 do audit a percorre crua — deixar as
    // duas representações discordando faria a mesma violação sumir de um
    // relatório e ficar no outro.
    assert.deepEqual(gravados.sort(), ['modules/m01/module.json', 'modules/m02/module.json', 'track.json']);
    assert.deepEqual([...resultado.veredicto.ordemDepois], ['m02/b01', 'm01/a01', 'm01/a02']);
  });
});

// ---------------------------------------------------------------------------
// R14 — I11 (mudança de forma) criada pelo movimento
// ---------------------------------------------------------------------------

function secaoTs(id: string, codigo: string): TrackTheorySection {
  return { id, title: `Secao ${id}`, markdown: 'Prosa da secao.', code: { language: 'ts', code: codigo } };
}

/**
 * FIXTURE 7 — trilha de TYPESCRIPT, e o dialeto importa: as cinco formas de
 * JavaScript (`form/rules.ts::JAVASCRIPT_FORM_DEFINITIONS`) têm BASES
 * distintas entre si, então duas formas da MESMA construção — que é a
 * pré-condição de I11 — não existem num arquivo `.mjs`. Em TypeScript existem:
 * `IfStatement[alternate=null]` (o `if` sem `else`) e
 * `IfStatement[expression=BinaryExpression]` (o `if (a === 1)`).
 *
 * Na ordem original a aula das DUAS formas (`a03`) vem ANTES da aula dedicada
 * ao `if` sem `else` (`a02`) — ninguém muda forma já ensinada, e I11 está
 * limpa. Trocar as duas de lugar cria a violação: `a03` passa a mudar a forma
 * de `IfStatement` dentro de uma aula que apresenta duas formas.
 */
function trilhaTypescriptComFormas(): LoadedTrack {
  const track = fazerTrilha('trilha-formas-ts', [
    {
      slug: 'm01',
      order: 1,
      aulas: [
        {
          slug: 'a01',
          conceitos: ['base'],
          teoria: [secaoTs('t1', 'export function g(n: number): number {\n  return n;\n}')],
          desafios: [],
        },
        {
          slug: 'a03',
          conceitos: ['duasformas'],
          teoria: [
            secaoTs(
              't3',
              'export function k(n: number): number {\n  if (n === 1) {\n    return 1;\n  } else {\n    return 0;\n  }\n}\nconst m = { p() { return 1; } };',
            ),
          ],
          desafios: [],
        },
        {
          slug: 'a02',
          conceitos: ['ifsemelse'],
          teoria: [secaoTs('t2', 'export function h(n: number): number {\n  if (n) {\n    return 1;\n  }\n  return 0;\n}')],
          desafios: [],
        },
      ],
    },
  ]);
  track.root.programmingLanguage = 'typescript';
  return track;
}

describe('reorder — I11 (mudar a forma exige aula dedicada)', () => {
  it('R14: o movimento que põe a aula de UMA forma antes da aula de DUAS é recusado por I11', () => {
    const track = trilhaTypescriptComFormas();
    // Pré-condição: na ordem original I11 está limpa (nada a herdar do passado).
    assert.equal(verificarReordenacao(track, planoManual(track, [])).ok, true);

    const veredicto = verificarReordenacao(
      track,
      planoManual(track, [
        {
          tipo: 'MOVER_AULA_NO_MODULO',
          moduleSlug: 'm01',
          lessonSlug: 'a02',
          antesDe: 'a03',
          deIndice: 2,
          paraIndice: 1,
          lessonsNovas: ['a01', 'a02', 'a03'],
        },
      ]),
    );
    assert.equal(veredicto.ok, false);
    assert.deepEqual(motivos(veredicto.recusas), ['I11_MUDANCA_DE_FORMA']);
    const i11 = veredicto.recusas[0];
    assert.deepEqual([...i11.refs], ['m01/a03', 'm01/a02']);
    assert.ok(i11.mensagem.includes('IfStatement'));
    assert.ok(i11.mensagem.includes('AULA DEDICADA'));
  });
});

// ---------------------------------------------------------------------------
// R13 — o placar é o mesmo do repair
// ---------------------------------------------------------------------------

describe('reorder — placar', () => {
  it('R13: `placarDeReordenacao` e o `placarDoAudit` do repair concordam campo a campo', () => {
    const report = auditTrack(trilhaComOrdemSimples());
    assert.deepEqual(placarDeReordenacao(report), placarDoAudit(report));
  });
});

// ---------------------------------------------------------------------------
// R15/R16 — COMPOSIÇÃO: dois ou mais movimentos no MESMO módulo
// ---------------------------------------------------------------------------

/**
 * FIXTURE 8 — DUAS violações de ordem INDEPENDENTES no mesmo módulo, em faixas
 * de índice DISJUNTAS: `a02` cobra `typeof` (ensinado por `a03`) e `a04` cobra
 * `>=` (ensinado por `a05`). Nenhuma das duas tem nada a ver com a outra — e é
 * exatamente por isso que a fixture existe: é o cenário para o qual o módulo
 * foi construído ("reorganize a ordem das matérias" em conteúdo com mais de uma
 * violação por módulo), e o único em que a COMPOSIÇÃO dos movimentos importa.
 */
function trilhaComDuasViolacoesNoMesmoModulo(): LoadedTrack {
  return trilhaDeUmModulo('trilha-duas-violacoes', [
    { slug: 'a01', conceitos: ['base'], teoria: [secao('t1', TEORIA_BASE)], desafios: [desafio('c1', 'base', SOLUCAO_SIMPLES)] },
    { slug: 'a02', conceitos: ['cobra1'], teoria: [secao('t2', 'let z = 1 + 2;')], desafios: [desafio('c2', 'cobra1', SOLUCAO_COM_TYPEOF)] },
    { slug: 'a03', conceitos: ['ensina1'], teoria: [secao('t3', 'const tipo = typeof 10;')], desafios: [] },
    { slug: 'a04', conceitos: ['cobra2'], teoria: [secao('t4', 'let w = 2 + 3;')], desafios: [desafio('c4', 'cobra2', SOLUCAO_COM_MAIOR_IGUAL)] },
    { slug: 'a05', conceitos: ['ensina2'], teoria: [secao('t5', 'const v = 1 >= 2;')], desafios: [] },
  ]);
}

const SOLUCAO_COM_RESTO = [
  'export function f(valor) {',
  '  let r = valor % 2;',
  "  if (r === 0) {",
  "    return 'sim';",
  '  }',
  "  return 'nao';",
  '}',
].join('\n');

/** FIXTURE 9 — TRÊS violações independentes no mesmo módulo (typeof, `>=`, `%`). */
function trilhaComTresViolacoesNoMesmoModulo(): LoadedTrack {
  return trilhaDeUmModulo('trilha-tres-violacoes', [
    { slug: 'a01', conceitos: ['base'], teoria: [secao('t1', TEORIA_BASE)], desafios: [desafio('c1', 'base', SOLUCAO_SIMPLES)] },
    { slug: 'a02', conceitos: ['cobra1'], teoria: [secao('t2', 'let z = 1 + 2;')], desafios: [desafio('c2', 'cobra1', SOLUCAO_COM_TYPEOF)] },
    { slug: 'a03', conceitos: ['ensina1'], teoria: [secao('t3', 'const tipo = typeof 10;')], desafios: [] },
    { slug: 'a04', conceitos: ['cobra2'], teoria: [secao('t4', 'let w = 2 + 3;')], desafios: [desafio('c4', 'cobra2', SOLUCAO_COM_MAIOR_IGUAL)] },
    { slug: 'a05', conceitos: ['ensina2'], teoria: [secao('t5', 'const v = 1 >= 2;')], desafios: [] },
    { slug: 'a06', conceitos: ['cobra3'], teoria: [secao('t6', 'let q = 3 + 4;')], desafios: [desafio('c6', 'cobra3', SOLUCAO_COM_RESTO)] },
    { slug: 'a07', conceitos: ['ensina3'], teoria: [secao('t7', 'const r = 4 % 2;')], desafios: [] },
  ]);
}

/**
 * FIXTURE 10 — uma violação de ordem em CADA módulo: um movimento por módulo,
 * nenhum deles compondo com o outro. É o controle do conserto: mexer na
 * composição DENTRO do módulo não pode mudar nada entre módulos.
 */
function trilhaComViolacaoEmDoisModulos(): LoadedTrack {
  return fazerTrilha('trilha-violacao-por-modulo', [
    {
      slug: 'm01',
      order: 1,
      aulas: [
        { slug: 'a01', conceitos: ['base'], teoria: [secao('t1', TEORIA_BASE)], desafios: [desafio('c1', 'base', SOLUCAO_SIMPLES)] },
        { slug: 'a02', conceitos: ['cobra1'], teoria: [secao('t2', 'let z = 1 + 2;')], desafios: [desafio('c2', 'cobra1', SOLUCAO_COM_TYPEOF)] },
        { slug: 'a03', conceitos: ['ensina1'], teoria: [secao('t3', 'const tipo = typeof 10;')], desafios: [] },
      ],
    },
    {
      slug: 'm02',
      order: 2,
      aulas: [
        { slug: 'b01', conceitos: ['cobra2'], teoria: [secao('u1', 'let w = 2 + 3;')], desafios: [desafio('d1', 'cobra2', SOLUCAO_COM_MAIOR_IGUAL)] },
        { slug: 'b02', conceitos: ['ensina2'], teoria: [secao('u2', 'const v = 1 >= 2;')], desafios: [] },
      ],
    },
  ]);
}

describe('reorder — dois movimentos no MESMO módulo COMPÕEM', () => {
  it('R15: duas violações independentes no mesmo módulo são resolvidas AS DUAS (o segundo movimento não apaga o primeiro)', () => {
    const track = trilhaComDuasViolacoesNoMesmoModulo();
    const report = auditTrack(track);

    // Pré-condição: as DUAS violações de ordem existem, e são independentes.
    const ordens = report.violations.filter(
      (v) => v.primeiraAulaQueEnsina !== null && v.primeiraAulaQueEnsina !== v.ref && v.construcao !== null,
    );
    assert.ok(
      ordens.some((v) => v.ref === 'm01/a02' && v.primeiraAulaQueEnsina === 'm01/a03'),
      'a02 cobra o que a03 ensina',
    );
    assert.ok(
      ordens.some((v) => v.ref === 'm01/a04' && v.primeiraAulaQueEnsina === 'm01/a05'),
      'a04 cobra o que a05 ensina',
    );

    const plano = planejarReordenacao(track, report);
    assert.equal(plano.movimentos.length, 2, 'um movimento por violação de ordem');
    const [mov1, mov2] = plano.movimentos;
    assert.equal(mov1.tipo, 'MOVER_AULA_NO_MODULO');
    assert.equal(mov2.tipo, 'MOVER_AULA_NO_MODULO');
    if (mov1.tipo !== 'MOVER_AULA_NO_MODULO' || mov2.tipo !== 'MOVER_AULA_NO_MODULO') return;

    // ORDEM DE COMPOSIÇÃO DECLARADA: destino global crescente, desempate pelo
    // ref da aula que se move. a03 vai para a posição 1; a05, para a 3.
    assert.equal(mov1.lessonSlug, 'a03');
    assert.equal(mov2.lessonSlug, 'a05');
    assert.deepEqual([...mov1.lessonsNovas], ['a01', 'a03', 'a02', 'a04', 'a05']);
    assert.deepEqual(
      [...mov2.lessonsNovas],
      ['a01', 'a03', 'a02', 'a05', 'a04'],
      'o SEGUNDO movimento é calculado contra o array que o PRIMEIRO deixou — senão ele o apaga por inteiro',
    );

    // A aplicação COMPÕE: os dois movimentos sobrevivem no array final.
    const { trilha } = aplicarMovimentos(track, plano.movimentos);
    assert.deepEqual(
      [...(trilha.modules.find((m) => m.meta.slug === 'm01')?.meta.lessons ?? [])],
      ['a01', 'a03', 'a02', 'a05', 'a04'],
    );

    const veredicto = verificarReordenacao(track, plano);
    assert.equal(veredicto.ok, true, `recusas inesperadas: ${JSON.stringify(veredicto.recusas)}`);
    assert.deepEqual([...veredicto.ordemDepois], ['m01/a01', 'm01/a03', 'm01/a02', 'm01/a05', 'm01/a04']);
    assert.deepEqual([...veredicto.alvosPersistentes], [], 'nenhum alvo pode sobrar de pé');
    assert.deepEqual([...veredicto.violacoesNovas], []);
    assert.equal(veredicto.alvosResolvidos.length, plano.alvos.length);
    assert.ok(veredicto.placarDepois.violacoes < veredicto.placarAntes.violacoes);
  });

  it('R15b: TRÊS movimentos no mesmo módulo compõem em cadeia', () => {
    const track = trilhaComTresViolacoesNoMesmoModulo();
    const plano = planejarReordenacao(track, auditTrack(track));
    assert.equal(plano.movimentos.length, 3);
    assert.deepEqual(
      plano.movimentos.map((m) => (m.tipo === 'MOVER_AULA_NO_MODULO' ? m.lessonSlug : m.moduleSlug)),
      ['a03', 'a05', 'a07'],
    );
    const ultimo = plano.movimentos[2];
    assert.equal(ultimo.tipo, 'MOVER_AULA_NO_MODULO');
    if (ultimo.tipo !== 'MOVER_AULA_NO_MODULO') return;
    assert.deepEqual([...ultimo.lessonsNovas], ['a01', 'a03', 'a02', 'a05', 'a04', 'a07', 'a06']);

    const veredicto = verificarReordenacao(track, plano);
    assert.equal(veredicto.ok, true, `recusas inesperadas: ${JSON.stringify(veredicto.recusas)}`);
    assert.deepEqual(
      [...veredicto.ordemDepois],
      ['m01/a01', 'm01/a03', 'm01/a02', 'm01/a05', 'm01/a04', 'm01/a07', 'm01/a06'],
    );
    assert.deepEqual([...veredicto.alvosPersistentes], []);
  });

  it('R15c: movimentos em módulos DIFERENTES continuam independentes (um por módulo)', async () => {
    const track = trilhaComViolacaoEmDoisModulos();
    const plano = planejarReordenacao(track, auditTrack(track));
    assert.equal(plano.movimentos.length, 2);
    assert.deepEqual(
      plano.movimentos.map((m) => (m.tipo === 'MOVER_AULA_NO_MODULO' ? `${m.moduleSlug}/${m.lessonSlug}` : m.moduleSlug)),
      ['m01/a03', 'm02/b02'],
    );

    const gravados: string[] = [];
    const resultado = await reordenarTrilha(
      { track, gravarArquivo: (arquivo) => void gravados.push(arquivo) },
      { slug: track.root.slug, modo: 'aplicar' },
    );
    assert.equal(resultado.modo, 'aplicar');
    if (resultado.modo !== 'aplicar') return;
    assert.equal(resultado.veredicto.ok, true, `recusas: ${JSON.stringify(resultado.veredicto.recusas)}`);
    assert.equal(resultado.aplicado, true);
    assert.deepEqual(gravados.sort(), ['modules/m01/module.json', 'modules/m02/module.json']);
    assert.deepEqual([...resultado.veredicto.ordemDepois], ['m01/a01', 'm01/a03', 'm01/a02', 'm02/b02', 'm02/b01']);
  });
});

describe('reorder — movimentos que NÃO compõem são recusados com a causa certa', () => {
  it('R16: dois movimentos calculados contra o array ORIGINAL (o segundo apagaria o primeiro) ⇒ CONFLITO_DE_COMPOSICAO', () => {
    const track = trilhaComDuasViolacoesNoMesmoModulo();
    // Exatamente o par que um planejador SEM estado acumulado produziria: cada
    // `lessonsNovas` é uma permutação válida de `lessons`, e mesmo assim
    // aplicá-los em sequência apaga o primeiro movimento por inteiro.
    const veredicto = verificarReordenacao(
      track,
      planoManual(track, [
        {
          tipo: 'MOVER_AULA_NO_MODULO',
          moduleSlug: 'm01',
          lessonSlug: 'a03',
          antesDe: 'a02',
          deIndice: 2,
          paraIndice: 1,
          lessonsNovas: ['a01', 'a03', 'a02', 'a04', 'a05'],
        },
        {
          tipo: 'MOVER_AULA_NO_MODULO',
          moduleSlug: 'm01',
          lessonSlug: 'a05',
          antesDe: 'a04',
          deIndice: 4,
          paraIndice: 3,
          lessonsNovas: ['a01', 'a02', 'a03', 'a05', 'a04'], // contra o ORIGINAL
        },
      ]),
    );
    assert.equal(veredicto.ok, false);
    assert.deepEqual(motivos(veredicto.recusas), ['CONFLITO_DE_COMPOSICAO']);
    assert.deepEqual([...veredicto.recusas[0].refs], ['m01/a05', 'm01/a03']);
    assert.ok(
      veredicto.recusas[0].mensagem.includes('apagaria'),
      `a causa é a composição, não "o plano não entrega o que promete": ${veredicto.recusas[0].mensagem}`,
    );
    assert.equal(
      motivos(veredicto.recusas).includes('VIOLACAO_ALVO_PERSISTE'),
      false,
      'a causa ERRADA (o sintoma) não pode aparecer no lugar da causa certa',
    );
    assert.deepEqual([...veredicto.ordemDepois], [...veredicto.ordemAntes], 'nada foi aplicado nem em memória');
  });

  it('R16b: dois movimentos que exigem ordens OPOSTAS entre as mesmas aulas ⇒ CONFLITO_DE_COMPOSICAO', () => {
    const track = trilhaComDuasViolacoesNoMesmoModulo();
    // Cada movimento é, sozinho, uma cadeia coerente (relocação de UMA aula).
    // O que não fecha é o pedido: um quer a03 antes de a02, o outro quer a02
    // antes de a03 — compostos, o segundo desfaz o primeiro.
    const veredicto = verificarReordenacao(
      track,
      planoManual(track, [
        {
          tipo: 'MOVER_AULA_NO_MODULO',
          moduleSlug: 'm01',
          lessonSlug: 'a03',
          antesDe: 'a02',
          deIndice: 2,
          paraIndice: 1,
          lessonsNovas: ['a01', 'a03', 'a02', 'a04', 'a05'],
        },
        {
          tipo: 'MOVER_AULA_NO_MODULO',
          moduleSlug: 'm01',
          lessonSlug: 'a02',
          antesDe: 'a03',
          deIndice: 2,
          paraIndice: 1,
          lessonsNovas: ['a01', 'a02', 'a03', 'a04', 'a05'],
        },
      ]),
    );
    assert.equal(veredicto.ok, false);
    assert.deepEqual(motivos(veredicto.recusas), ['CONFLITO_DE_COMPOSICAO']);
    assert.deepEqual([...veredicto.recusas[0].refs], ['m01/a03', 'm01/a02']);
    assert.ok(veredicto.recusas[0].mensagem.includes('ordens OPOSTAS'));
    assert.equal(motivos(veredicto.recusas).includes('VIOLACAO_ALVO_PERSISTE'), false);
  });

  it('R16c: `aplicarMovimentos` direto sobre cadeia incoerente LANÇA erro estruturado (nunca apaga em silêncio)', () => {
    const track = trilhaComDuasViolacoesNoMesmoModulo();
    assert.throws(
      () =>
        aplicarMovimentos(track, [
          {
            tipo: 'MOVER_AULA_NO_MODULO',
            moduleSlug: 'm01',
            lessonSlug: 'a03',
            antesDe: 'a02',
            deIndice: 2,
            paraIndice: 1,
            lessonsNovas: ['a01', 'a03', 'a02', 'a04', 'a05'],
          },
          {
            tipo: 'MOVER_AULA_NO_MODULO',
            moduleSlug: 'm01',
            lessonSlug: 'a05',
            antesDe: 'a04',
            deIndice: 4,
            paraIndice: 3,
            lessonsNovas: ['a01', 'a02', 'a03', 'a05', 'a04'],
          },
        ]),
      (erro: unknown) => {
        assert.ok(erro instanceof ErroDeReordenacao);
        assert.equal(erro.codigo, 'REORDER_COMPOSICAO_INCOERENTE');
        assert.equal(erro.etapa, 'aplicar-movimentos');
        return true;
      },
    );
  });
});
