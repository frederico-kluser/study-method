/**
 * tests/cx-gap-l06-fieldorder-tree.test.ts — GAP de cobertura do lote L06 sobre
 * `engine/schemas/fieldOrder.ts`: a VARREDURA DA ÁRVORE INTEIRA do schema zod
 * (`caminhar` → `lintSchemasDaEngine`) não tinha cobertura própria para os nós
 * de coleção/encapsulamento — array, tupla, record, lazy, effects, união e
 * nullable. Os testes existentes (`engineSchemas.test.ts`) cobrem objeto
 * aninhado simples e união-com-undefined no topo.
 *
 * O que estes testes PINAM (é exatamente o que uma refatoração de `caminhar`
 * pode quebrar em silêncio):
 *   - INV-05: `.optional()`/`.default()`/união-com-undefined em QUALQUER nó da
 *     árvore são detectados — inclusive dentro de array, tupla, record, lazy,
 *     effects e união (o caminho reportado segue a notação do walker);
 *   - INV-04: a inversão justificativa→decisão é detectada em shape de
 *     QUALQUER profundidade/nó, não só no topo;
 *   - `lintSchemasDaEngine` varre a árvore INTEIRA de cada schema registrado e
 *     combina os dois lints; `garantirSchemasValidos` é a forma fail-closed.
 *
 * Sem rede, sem LLM, sem chave: zod puro em memória.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import {
  encontrarCamposOpcionais,
  garantirSchemasValidos,
  lintOrdemCampos,
  lintSchemasDaEngine,
} from '../electron/main/engine/schemas/fieldOrder';
import type { SchemaRegistrado } from '../electron/main/engine/schemas/artifacts';

/** Shape com inversão INV-04: `aprovado` (decisão) ANTES de `motivo` (justificativa). */
const SHAPE_INVERTIDO = { aprovado: z.boolean(), motivo: z.string().min(1) };

function registrado(nome: string, schema: z.ZodTypeAny): SchemaRegistrado {
  return { nome, schema };
}

// ---------------------------------------------------------------------------
// 1. INV-05 — campos opcionais em QUALQUER nó da árvore
// ---------------------------------------------------------------------------

describe('fieldOrder/INV-05 — a varredura alcança o objeto inteiro (array, tupla, record, lazy, effects, união)', () => {
  it('.optional() dentro de item de ARRAY é flagrado com o caminho do walker', () => {
    const schema = z.object({ itens: z.array(z.object({ campo: z.string().optional() })) });
    assert.deepEqual(encontrarCamposOpcionais([registrado('r', schema)]), [
      { schema: 'r', caminho: 'itens[].campo', tipo: 'ZodOptional' },
    ]);
  });

  it('.optional() dentro de item de TUPLA é flagrado', () => {
    const schema = z.object({ par: z.tuple([z.object({ campo: z.string().optional() }), z.string()]) });
    assert.deepEqual(encontrarCamposOpcionais([registrado('r', schema)]), [
      { schema: 'r', caminho: 'par[].campo', tipo: 'ZodOptional' },
    ]);
  });

  it('.optional() no VALOR de um record é flagrado', () => {
    const schema = z.object({ mapa: z.record(z.object({ campo: z.string().optional() })) });
    assert.deepEqual(encontrarCamposOpcionais([registrado('r', schema)]), [
      { schema: 'r', caminho: 'mapa[].campo', tipo: 'ZodOptional' },
    ]);
  });

  it('.optional() atrás de z.lazy é flagrado (o getter é desembrulhado)', () => {
    const schema = z.object({ pregui: z.lazy(() => z.string().optional()) });
    assert.deepEqual(encontrarCamposOpcionais([registrado('r', schema)]), [
      { schema: 'r', caminho: 'pregui', tipo: 'ZodOptional' },
    ]);
  });

  it('.optional() atrás de z.effects (z.preprocess) é flagrado', () => {
    const schema = z.object({ embrulhado: z.preprocess((v) => v, z.string().optional()) });
    assert.deepEqual(encontrarCamposOpcionais([registrado('r', schema)]), [
      { schema: 'r', caminho: 'embrulhado', tipo: 'ZodOptional' },
    ]);
  });

  it('.optional() dentro de opção de UNIÃO é flagrado', () => {
    const schema = z.object({ uni: z.union([z.object({ campo: z.string().optional() }), z.string()]) });
    assert.deepEqual(encontrarCamposOpcionais([registrado('r', schema)]), [
      { schema: 'r', caminho: 'uni.campo', tipo: 'ZodOptional' },
    ]);
  });

  it('.default() é INV-05 igual a .optional() — inclusive dentro de array', () => {
    const topo = z.object({ campo: z.string().default('x') });
    const fundo = z.object({ itens: z.array(z.object({ campo: z.number().default(0) })) });
    assert.deepEqual(encontrarCamposOpcionais([registrado('t', topo)]), [
      { schema: 't', caminho: 'campo', tipo: 'ZodDefault' },
    ]);
    assert.deepEqual(encontrarCamposOpcionais([registrado('f', fundo)]), [
      { schema: 'f', caminho: 'itens[].campo', tipo: 'ZodDefault' },
    ]);
  });

  it('união-com-undefined é o equivalente funcional de .optional() — inclusive dentro de array', () => {
    const topo = z.object({ campo: z.union([z.string(), z.undefined()]) });
    const fundo = z.object({ itens: z.array(z.union([z.string(), z.undefined()])) });
    assert.deepEqual(encontrarCamposOpcionais([registrado('t', topo)]), [
      { schema: 't', caminho: 'campo', tipo: 'uniao-com-undefined' },
    ]);
    assert.deepEqual(encontrarCamposOpcionais([registrado('f', fundo)]), [
      { schema: 'f', caminho: 'itens[]', tipo: 'uniao-com-undefined' },
    ]);
  });

  it('z.null() em união NÃO é opcional (valor vazio EXPLÍCITO) — controle negativo', () => {
    const schema = z.object({
      campo: z.union([z.string().min(1), z.null()]),
      itens: z.array(z.union([z.number(), z.null()])),
    });
    assert.deepEqual(encontrarCamposOpcionais([registrado('r', schema)]), []);
  });

  it('profundidade MISTA (array → objeto → record → objeto) é varrida até a folha', () => {
    const schema = z.object({
      nivel1: z.array(z.object({ nivel2: z.record(z.object({ campo: z.string().optional() })) })),
    });
    assert.deepEqual(encontrarCamposOpcionais([registrado('r', schema)]), [
      { schema: 'r', caminho: 'nivel1[].nivel2[].campo', tipo: 'ZodOptional' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// 2. INV-04 — inversão justificativa→decisão em QUALQUER nó da árvore
// ---------------------------------------------------------------------------

describe('fieldOrder/INV-04 — a ordem é conferida em todo shape da árvore, não só o de topo', () => {
  it('shape de topo invertido é flagrado como (raiz) com índices exatos', () => {
    const problemas = lintOrdemCampos([registrado('topo', z.object(SHAPE_INVERTIDO))]);
    assert.deepEqual(problemas, [
      {
        schema: 'topo',
        caminho: '(raiz)',
        campo_decisao: 'aprovado',
        campo_justificativa: 'motivo',
        indice_decisao: 0,
        indice_justificativa: 1,
      },
    ]);
  });

  it('inversão dentro de item de ARRAY é flagrado com o caminho do walker', () => {
    const schema = z.object({ itens: z.array(z.object(SHAPE_INVERTIDO)) });
    const problemas = lintOrdemCampos([registrado('arr', schema)]);
    assert.equal(problemas.length, 1);
    assert.equal(problemas[0].caminho, 'itens[]');
  });

  it('inversão dentro de record, tupla, lazy, effects e união também é flagrada', () => {
    const casos: Array<[string, z.ZodTypeAny, string]> = [
      ['rec', z.object({ mapa: z.record(z.object(SHAPE_INVERTIDO)) }), 'mapa[]'],
      ['tup', z.object({ par: z.tuple([z.object(SHAPE_INVERTIDO)]) }), 'par[]'],
      ['lazy', z.object({ l: z.lazy(() => z.object(SHAPE_INVERTIDO)) }), 'l'],
      ['eff', z.object({ e: z.preprocess((v) => v, z.object(SHAPE_INVERTIDO)) }), 'e'],
      ['uni', z.object({ u: z.union([z.object(SHAPE_INVERTIDO), z.string()]) }), 'u'],
    ];
    for (const [nome, schema, caminhoEsperado] of casos) {
      const problemas = lintOrdemCampos([registrado(nome, schema)]);
      assert.equal(problemas.length, 1, nome);
      assert.equal(problemas[0].caminho, caminhoEsperado, nome);
      assert.equal(problemas[0].campo_decisao, 'aprovado', nome);
      assert.equal(problemas[0].campo_justificativa, 'motivo', nome);
    }
  });

  it('ordem CORRETA (justificativa antes de decisão) em qualquer profundidade não gera problema', () => {
    const schema = z.object({
      itens: z.array(z.object({ motivo: z.string(), aprovado: z.boolean() })),
    });
    assert.deepEqual(lintOrdemCampos([registrado('ok', schema)]), []);
  });
});

// ---------------------------------------------------------------------------
// 3. lintSchemasDaEngine varre a ÁRVORE INTEIRA e combina os dois lints
// ---------------------------------------------------------------------------

describe('fieldOrder — lintSchemasDaEngine cobre a árvore inteira de TODOS os registrados', () => {
  it('um schema com violação dos DOIS tipos aparece nas DUAS listas; o limpo não aparece', () => {
    const sujo = registrado(
      'sujo',
      z.object({
        ...SHAPE_INVERTIDO,
        opcional: z.string().optional(),
      }),
    );
    const limpo = registrado('limpo', z.object({ motivo: z.string(), aprovado: z.boolean() }));
    const resultado = lintSchemasDaEngine([sujo, limpo]);
    assert.equal(resultado.ordem.length, 1);
    assert.equal(resultado.ordem[0].schema, 'sujo');
    assert.equal(resultado.camposOpcionais.length, 1);
    assert.equal(resultado.camposOpcionais[0].schema, 'sujo');
  });

  it('violações DE FUNDO (array → objeto) entram no resultado combinado', () => {
    const fundo = registrado('fundo', z.object({ itens: z.array(z.object(SHAPE_INVERTIDO)) }));
    const resultado = lintSchemasDaEngine([fundo]);
    assert.equal(resultado.ordem.length, 1);
    assert.equal(resultado.ordem[0].caminho, 'itens[]');
    assert.deepEqual(resultado.camposOpcionais, []);
  });

  it('garantirSchemasValidos é a forma FAIL-CLOSED: lança listando INV-04 e INV-05 nomeando schema@caminho', () => {
    const sujo = registrado(
      'sujo',
      z.object({ itens: z.array(z.object({ aprovado: z.boolean(), motivo: z.string(), extra: z.number().default(0) })) }),
    );
    assert.throws(
      () => garantirSchemasValidos([sujo]),
      (erro: unknown) => {
        assert.ok(erro instanceof Error);
        assert.match(erro.message, /INV-04 sujo@itens\[\]/);
        assert.match(erro.message, /INV-05 sujo@itens\[\]\.extra/);
        assert.match(erro.message, /justificativa antes de decisão/);
        assert.match(erro.message, /nunca opcional/);
        return true;
      },
    );
  });

  it('registro íntegro não lança nada (o lint não é vaca morta para o lado do verde)', () => {
    const limpo = registrado('limpo', z.object({ motivo: z.string(), aprovado: z.boolean() }));
    assert.doesNotThrow(() => garantirSchemasValidos([limpo]));
  });
});
