/**
 * tests/cx-phases-gap-lint-real.test.ts — fechamento do achado "INV-05
 * SUB-PINADO" da revisão adversarial da bateria cx-phases (gap de régua).
 *
 * HONESTIDADE DA RÉGUA (correção exigida pela revisão deste arquivo): a REGRA
 * correta é a do lint REAL (`lintSchemasDaEngine`/`encontrarCamposOpcionais`/
 * `lintOrdemCampos`, schemas/fieldOrder.ts) — INV-05 nega `.optional()`,
 * `.default()` e união-com-undefined; INV-04 exige justificativa antes da
 * decisão. Mas a COBERTURA do lint atual tem BLIND SPOTS e a varredura de
 * `cx-phases-schemas-artifacts.test.ts` é SUPERSET do lint: pega o que o lint
 * hoje NÃO pega. Os blind spots do lint (comportamento medido e PINADO no
 * último teste abaixo — furo, NÃO promessa):
 *
 *   - descida: `ZodTuple.rest` (rest de tupla), `ZodRecord.keyType` (chave de
 *     record), `catchall` de objeto, e os tipos de nó inteiros ZodReadonly,
 *     ZodIntersection, ZodPipeline, ZodDiscriminatedUnion, ZodMap (keyType E
 *     valueType), ZodSet, ZodPromise, ZodFunction (args/returns), ZodCatch e
 *     ZodBranded — 13 entradas no total, TODAS pinadas como fixtures no teste
 *     de blind spots abaixo;
 *   - ordem: o lint INV-04 `continue`s no `indexOf === -1`
 *     (fieldOrder.ts:177-180) — campo AUSENTO de um par não pinado some do
 *     relato em silêncio (ex.: `raciocinio_de_projeto` de ConceitoAtomicoSchema
 *     ou `justificativa` de OrderSchema.modulos).
 *
 * Repro medido: `z.intersection(..., z.object({ b: z.string().optional() }))`
 * → `encontrarCamposOpcionais` = []. Tudo isso é o BUG R (registrado; dono
 * L06, fix na Onda 3 — produção NÃO se mexe aqui).
 *
 * Este arquivo prova as três metades da régua:
 *   (a) o lint real continua VERDE sobre o SCHEMA_REGISTRY inteiro;
 *   (b) a MUTAÇÃO que o lint ALCANÇA o reprova — `z.string().default('')`,
 *       `.optional()`, união-com-undefined (sob lazy/efeito/array) e inversão
 *       de ordem justificativa→decisão — com código/caminho;
 *   (c) os blind spots do lint são PINADOS como furo conhecido (bug R): o
 *       teste de blind spots reprova quando o lint cobrir ESTA lista inteira —
 *       e o superset do pin de INV-05 só volta a ser igual à régua quando o
 *       lint descer a ÁRVORE INTEIRA (fechar só os tipos listados ainda deixa
 *       o superset à frente do lint).
 *
 * Produção INTOCADA: as mutações existem só como FIXTURES locais deste teste.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import { SCHEMA_REGISTRY, type SchemaRegistrado } from '../electron/main/engine/schemas/artifacts';
import {
  encontrarCamposOpcionais,
  garantirSchemasValidos,
  lintOrdemCampos,
  lintSchemasDaEngine,
  type ProblemaDeCampoOpcional,
} from '../electron/main/engine/schemas/fieldOrder';

/** registra uma fixture sob o mesmo contrato do SCHEMA_REGISTRY. */
function fixture(schema: z.ZodTypeAny): SchemaRegistrado[] {
  return [{ nome: 'fixture', schema }];
}

describe('gap INV-05/INV-04 — régua = lint REAL; onde o lint AINDA não alcança (bug R) está documentado', () => {
  it('o lint real continua VERDE sobre o SCHEMA_REGISTRY inteiro (ordem + opcionais)', () => {
    assert.deepEqual(
      lintSchemasDaEngine(SCHEMA_REGISTRY),
      { ordem: [], camposOpcionais: [] },
      'o lint de build passa nos 14 schemas reais — o teste só fortalece, produção não muda',
    );
    assert.doesNotThrow(() => garantirSchemasValidos(SCHEMA_REGISTRY), 'a forma fail-closed também não lança');
  });

  it('MUTAÇÃO reprova o lint (INV-05): default/optional/uniao-com-undefined nos NÓS QUE O LINT VARRE, com código e caminho', () => {
    // A mutação canônica do achado: adicionar `z.string().default('')` a um
    // schema real. Aqui ela vive como fixture — e o lint a flagra.
    const casos: Array<[string, z.ZodTypeAny, ProblemaDeCampoOpcional[]]> = [
      [
        'a mutação `z.string().default(\'\')` num campo reprova como ZodDefault',
        z.object({ campo: z.string().default('') }),
        [{ schema: 'fixture', caminho: 'campo', tipo: 'ZodDefault' }],
      ],
      [
        '.optional() ANINHADO (objeto.dentro.array[]) reprova como ZodOptional',
        z.object({ aninhado: z.object({ dentro: z.array(z.string().optional()) }) }),
        [{ schema: 'fixture', caminho: 'aninhado.dentro[]', tipo: 'ZodOptional' }],
      ],
      [
        'união-com-undefined reprova como uniao-com-undefined',
        z.object({ talvez: z.union([z.string(), z.undefined()]) }),
        [{ schema: 'fixture', caminho: 'talvez', tipo: 'uniao-com-undefined' }],
      ],
      [
        'opcional sob LAZY reprova (o getter resolve e a árvore entra)',
        z.lazy(() => z.object({ escondido: z.preprocess((v: unknown) => v, z.string().optional()) })),
        [{ schema: 'fixture', caminho: 'escondido', tipo: 'ZodOptional' }],
      ],
      [
        'default sob EFEITO (z.preprocess) reprova (efeito não esconde)',
        z.preprocess((v: unknown) => v, z.object({ d: z.string().default('x') })),
        [{ schema: 'fixture', caminho: 'd', tipo: 'ZodDefault' }],
      ],
    ];
    for (const [rotulo, schema, esperado] of casos) {
      assert.deepEqual(encontrarCamposOpcionais(fixture(schema)), esperado, rotulo);
      assert.throws(
        () => garantirSchemasValidos(fixture(schema)),
        (erro: unknown) => erro instanceof Error && /INV-05/.test(erro.message),
        `${rotulo} — a forma fail-closed lança com o código INV-05`,
      );
    }
  });

  it('MUTAÇÃO de ORDEM reprova o lint (INV-04): decisão antes da justificativa sai com índices nomeados', () => {
    const invertido = z.object({ aprovado: z.boolean(), justificativa: z.string().min(1) });
    assert.deepEqual(encontrarCamposOpcionais(fixture(invertido)), [], 'o schema invertido não tem opcional — é só INV-04');
    assert.deepEqual(lintOrdemCampos(fixture(invertido)), [
      {
        schema: 'fixture',
        caminho: '(raiz)',
        campo_decisao: 'aprovado',
        campo_justificativa: 'justificativa',
        indice_decisao: 0,
        indice_justificativa: 1,
      },
    ]);
    assert.throws(
      () => garantirSchemasValidos(fixture(invertido)),
      (erro: unknown) => erro instanceof Error && /INV-04/.test(erro.message),
    );
  });

  it('BLIND SPOTS do lint (bug R — fix na Onda 3): os 13 casos abaixo (tuple-rest, record-key, catchall, readonly, interseção, pipeline, discriminatedUnion, map, set, promise, function, catch, branded) NÃO são flagrados — CARACTERIZAÇÃO do furo, não validação', () => {
    // ESTES asserts descrevem o que o lint faz HOJE — e não deveria: o opcional
    // EXISTE no schema e o relato vem VAZIO. É o bug R (registrado; dono L06,
    // fix na Onda 3; produção não se mexe neste ciclo). O pin de INV-05 de
    // `cx-phases-schemas-artifacts.test.ts` cobre estes casos como SUPERSET.
    // ESTE teste reprova quando o lint cobrir ESTA lista inteira — e o superset
    // só volta a ser igual à régua quando o lint descer a ÁRVORE INTEIRA (fechar
    // só os tipos listados ainda deixa o superset à frente do lint).
    const furos: Array<[string, z.ZodTypeAny]> = [
      [
        'rest de tupla (z.tuple([...]).rest(z.string().optional()))',
        z.object({ t: z.tuple([z.string()]).rest(z.string().optional()) }),
      ],
      [
        'chave de record (z.record(z.string().optional(), z.string()))',
        z.object({ r: z.record(z.string().optional(), z.string()) }),
      ],
      [
        'catchall de objeto (z.object({}).catchall(z.string().optional()))',
        z.object({}).catchall(z.string().optional()),
      ],
      [
        'ZodReadonly (z.object({ b: z.string().optional() }).readonly())',
        z.object({ b: z.string().optional() }).readonly(),
      ],
      [
        'ZodIntersection (repro medido do revisor)',
        z.intersection(z.object({ a: z.string() }), z.object({ b: z.string().optional() })),
      ],
      [
        'ZodPipeline (z.pipeline(z.string(), z.object({ b: z.string().optional() })))',
        z.pipeline(z.string(), z.object({ b: z.string().optional() })),
      ],
      [
        'ZodDiscriminatedUnion (opcional aninhado numa opção)',
        z.discriminatedUnion('t', [
          z.object({ t: z.literal('a'), x: z.object({ b: z.string().optional() }) }),
          z.object({ t: z.literal('b') }),
        ]),
      ],
      [
        'ZodMap (keyType E valueType)',
        z.map(z.string().optional(), z.string().optional()),
      ],
      [
        'ZodSet (valueType)',
        z.set(z.string().optional()),
      ],
      [
        'ZodPromise (type)',
        z.promise(z.string().optional()),
      ],
      [
        'ZodFunction (args E returns)',
        z.function().args(z.string().optional()).returns(z.string().optional()),
      ],
      [
        'ZodCatch (innerType escondido no catch)',
        z.string().optional().catch('x'),
      ],
      [
        'ZodBranded (innerType escondido na marca)',
        z.string().optional().brand('x'),
      ],
    ];
    for (const [rotulo, schema] of furos) {
      assert.deepEqual(
        encontrarCamposOpcionais(fixture(schema)),
        [],
        `BUG R (furo conhecido, fix na Onda 3): o lint NÃO flagra ${rotulo}`,
      );
    }
  });

  it('controle negativo: `z.null()` em união e `z.preprocess` de vazio explícito NÃO são opcionais; ordem correta NÃO é inversão', () => {
    const vazioExplicito = z.object({
      introduzido_em: z.union([z.string().min(1), z.null()]),
      ausencia: z.preprocess((v: unknown) => (v === undefined ? [] : v), z.array(z.string())),
      evidencia: z.string().min(1),
      acao: z.string().min(1),
    });
    assert.deepEqual(encontrarCamposOpcionais(fixture(vazioExplicito)), [], 'null explícito/preprocess não são opcionalidade');
    assert.deepEqual(lintOrdemCampos(fixture(vazioExplicito)), [], 'justificativa "evidencia" (2) ANTES da decisão "acao" (3) não é inversão');
    assert.doesNotThrow(() => garantirSchemasValidos(fixture(vazioExplicito)));
  });
});
