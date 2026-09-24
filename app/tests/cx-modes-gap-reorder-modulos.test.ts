/**
 * tests/cx-modes-gap-reorder-modulos.test.ts — o GAP fechado pela revisão
 * adversarial da bateria cx-modes: o CHAIN COMPLETO planejar → verificar →
 * aplicar de um `MOVER_MODULO` com DOIS MÓDULOS REAIS, pinando o produto REAL
 * (`track.json` + os DOIS `module.json`) gravado em tmpdir própria, com o
 * `order` renumérico byte a byte.
 *
 * Por que este arquivo existe: em `cx-modes-reorder.test.ts` o
 * `aplicarMovimentos` recebia movimento MONTADO À MÃO e o
 * `reordenarTrilha('aplicar')` só corria com UM módulo — o plano REAL de dois
 * módulos (e os pares antes/depois de `ordensNovas` que ele calcula) nunca era
 * aplicado nem conferido contra o que o disco guarda.
 *
 * OFFLINE: fixtures em memória, tmpdirs próprios (`mkdtemp('do-cxmodes-gap-')`),
 * produção intocada.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { LoadedTrack } from '../electron/main/content/trackLoader';
import type { TrackChallengeSource, TrackTheorySection } from '../electron/main/content/trackTypes';
import { auditTrack } from '../electron/main/engine/audit';
import {
  aplicarMovimentos,
  planejarReordenacao,
  reordenarTrilha,
  verificarReordenacao,
} from '../electron/main/engine/modes/reorder';

// ---------------------------------------------------------------------------
// Fixtures — a MESMA trilha de dois módulos de cx-modes-reorder.test.ts
// (quem ensina `typeof` é b01, no módulo SEGUINTE ao que o cobra)
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

/** DOIS módulos: `typeof` é cobrado em m01 (a01, a02) e ensinado em m02 (b01). */
function trilhaComDoisModulos(dir: string): LoadedTrack {
  return {
    root: {
      schemaVersion: 1,
      slug: 'cx-gap-dois-modulos',
      title: 'Trilha gap',
      description: 'fixture do chain de dois modulos',
      language: 'pt-BR',
      domain: 'programming',
      modules: ['m01', 'm02'],
    },
    modules: [
      {
        meta: { schemaVersion: 1, slug: 'm01', title: 'Modulo m01', order: 1, lessons: ['a01', 'a02'] },
        challenge: null,
        lessons: [
          {
            meta: {
              schemaVersion: 1,
              slug: 'a01',
              title: 'Aula a01',
              summary: 'Resumo da aula.',
              difficulty: 1,
              concepts: ['base'],
              prerequisites: [],
              theory: [secao('t1', TEORIA_BASE)],
              sources: [],
              challenges: ['c1'],
            },
            challenges: [desafio('c1', 'base', SOLUCAO_COM_TYPEOF)],
          },
          {
            meta: {
              schemaVersion: 1,
              slug: 'a02',
              title: 'Aula a02',
              summary: 'Resumo da aula.',
              difficulty: 1,
              concepts: ['cobra'],
              prerequisites: [],
              theory: [secao('t2', 'let z = 1 + 2;')],
              sources: [],
              challenges: ['c2'],
            },
            challenges: [desafio('c2', 'cobra', SOLUCAO_COM_TYPEOF)],
          },
        ],
      },
      {
        meta: { schemaVersion: 1, slug: 'm02', title: 'Modulo m02', order: 2, lessons: ['b01'] },
        challenge: null,
        lessons: [
          {
            meta: {
              schemaVersion: 1,
              slug: 'b01',
              title: 'Aula b01',
              summary: 'Resumo da aula.',
              difficulty: 1,
              concepts: ['ensina'],
              prerequisites: [],
              theory: [secao('t3', 'const tipo = typeof 10;')],
              sources: [],
              challenges: [],
            },
            challenges: [],
          },
        ],
      },
    ],
    proficiency: null,
    dir,
  };
}

/** tmpdir própria por teste — nada grava fora dela. */
async function tmpdirPropria(): Promise<string> {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'do-cxmodes-gap-'));
}

async function lerJson(dir: string, arquivo: string): Promise<unknown> {
  return JSON.parse(await fsp.readFile(path.join(dir, arquivo), 'utf8'));
}

// ---------------------------------------------------------------------------
// O chain — planejar → verificar → aplicar — com o plano REAL de 2 módulos
// ---------------------------------------------------------------------------

describe('MOVER_MODULO com 2 módulos REAIS — o chain completo e o produto gravado', () => {
  it('(a) o plano real traz os pares antes/depois de `ordensNovas` LITERAIS', () => {
    const track = trilhaComDoisModulos('/memoria/cx-gap-dois-modulos');
    const plano = planejarReordenacao(track, auditTrack(track));
    assert.deepEqual(plano.movimentos, [
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
  });

  it('(b) chain planejar→verificar→aplicar: track.json + 2 module.json GRAVADOS com `order` renumérico', async () => {
    const dir = await tmpdirPropria();
    try {
      const track = trilhaComDoisModulos(dir);
      const plano = planejarReordenacao(track, auditTrack(track));
      const v = verificarReordenacao(track, plano);
      assert.equal(plano.alvos.length, 12, 'A2/A13/A16 × {node:TypeOfExpression, op:unary:typeof} × os 2 desafios');
      assert.equal(v.ok, true, 'o plano REAL de 2 módulos passa pelo gate');
      assert.deepEqual(v.ordemAntes, ['m01/a01', 'm01/a02', 'm02/b01']);
      assert.deepEqual(v.ordemDepois, ['m02/b01', 'm01/a01', 'm01/a02']);
      assert.equal(v.alvosResolvidos.length, 12, 'o movimento do módulo inteiro resolve os 12 alvos');
      assert.deepEqual(v.alvosPersistentes, []);
      assert.deepEqual(v.violacoesNovas, []);

      const { trilha, arquivos } = aplicarMovimentos(track, plano.movimentos);
      assert.deepEqual([...arquivos.keys()], ['track.json', 'modules/m01/module.json', 'modules/m02/module.json']);

      // GRAVA de verdade na tmpdir e RELÊ — o que o disco guarda é o produto.
      for (const [arquivo, conteudo] of arquivos) {
        await fsp.mkdir(path.join(dir, path.dirname(arquivo)), { recursive: true });
        await fsp.writeFile(path.join(dir, arquivo), conteudo);
      }

      // track.json: a ordem do array `modules` é a DUPLA do `order` (I14 × A13–A16)
      assert.deepEqual(await lerJson(dir, 'track.json'), {
        schemaVersion: 1,
        slug: 'cx-gap-dois-modulos',
        title: 'Trilha gap',
        description: 'fixture do chain de dois modulos',
        language: 'pt-BR',
        domain: 'programming',
        modules: ['m02', 'm01'],
      });
      // os `module.json` com o `order` RENUMERADO (m02 passa a 1; m01, a 2)
      assert.deepEqual(await lerJson(dir, 'modules/m01/module.json'), {
        schemaVersion: 1,
        slug: 'm01',
        title: 'Modulo m01',
        order: 2,
        lessons: ['a01', 'a02'],
      });
      assert.deepEqual(await lerJson(dir, 'modules/m02/module.json'), {
        schemaVersion: 1,
        slug: 'm02',
        title: 'Modulo m02',
        order: 1,
        lessons: ['b01'],
      });
      // e as DUAS representações andam juntas na trilha em memória
      assert.deepEqual(trilha.root.modules, ['m02', 'm01']);
      assert.deepEqual(trilha.modules.map((m) => [m.meta.slug, m.meta.order]), [
        ['m02', 1],
        ['m01', 2],
      ]);
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it('reordenarTrilha aplicar com 2 módulos: os TRÊS arquivos saem pela escrita atômica e o placar fecha', async () => {
    const dir = await tmpdirPropria();
    try {
      const track = trilhaComDoisModulos(dir);
      // SEM gravarArquivo injetado: o default é `escreverAtomico` sob track.dir
      const r = await reordenarTrilha({ track }, { slug: track.root.slug, modo: 'aplicar' });
      assert.ok(r.modo === 'aplicar' && r.aplicado === true);
      assert.ok(r.modo === 'aplicar' && r.melhorou === true);
      assert.deepEqual(r.escritos, ['track.json', 'modules/m01/module.json', 'modules/m02/module.json']);
      // placar do audit REAL em LITERAIS: o movimento tira 13 dos 17 erros
      // (as 12 chaves de alvo resolvidas pelo gate)
      assert.ok(r.modo === 'aplicar');
      assert.deepEqual(r.placarInicial, { violacoes: 17, desafiosComViolacao: 2, lacunas: 2, aulas: 3, desafios: 2 });
      assert.deepEqual(r.placarFinal, { violacoes: 4, desafiosComViolacao: 2, lacunas: 2, aulas: 3, desafios: 2 });

      // o que a escrita atômica REALMENTE deixou no disco
      assert.deepEqual(await lerJson(dir, 'track.json'), {
        schemaVersion: 1,
        slug: 'cx-gap-dois-modulos',
        title: 'Trilha gap',
        description: 'fixture do chain de dois modulos',
        language: 'pt-BR',
        domain: 'programming',
        modules: ['m02', 'm01'],
      });
      assert.deepEqual(await lerJson(dir, 'modules/m01/module.json'), {
        schemaVersion: 1,
        slug: 'm01',
        title: 'Modulo m01',
        order: 2,
        lessons: ['a01', 'a02'],
      });
      assert.deepEqual(await lerJson(dir, 'modules/m02/module.json'), {
        schemaVersion: 1,
        slug: 'm02',
        title: 'Modulo m02',
        order: 1,
        lessons: ['b01'],
      });
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});
