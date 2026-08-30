/**
 * tests/engineSchemas.test.ts — schemas dos artefatos da engine de trilhas
 * (pacote P-04, onda 1). Primeiro consumidor de `zod` no repositório.
 *
 * Contratos que mordem aqui (`docs/16-engine-de-trilha.md` §6.3 e §7):
 *   - INV-04: a ORDEM dos campos não é estética — justificativa ANTES de
 *     decisão. O lint de build falha quando o índice do campo de decisão é
 *     menor que o do campo de justificativa (o modelo decide antes de pensar
 *     quando a ordem está invertida).
 *   - INV-05: TODO campo de TODO schema da engine é obrigatório — zero
 *     `.optional()`; ausência válida é valor vazio EXPLÍCITO.
 *   - A-P04-2: o lint varre a lista REAL de schemas (`SCHEMA_REGISTRY`),
 *     nunca uma lista curada derivada; o registro é fixado aqui com os 12
 *     artefatos — esquecer de registrar um schema novo quebra este teste.
 *   - erro de validação NOMEIA o campo e o motivo (`formatarErroCampos`).
 *
 * Sem rede, sem disco, sem LLM: schemas e lints são funções puras.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import {
  BriefSchema,
  ChallengeDraftSchema,
  ConceitoAtomicoSchema,
  LessonDraftSchema,
  SCHEMA_REGISTRY,
  type SchemaRegistrado,
} from '../electron/main/engine/schemas/artifacts';
import {
  DECISION_FIELD_NAMES,
  JUSTIFICATION_FIELD_NAMES,
  encontrarCamposOpcionais,
  formatarErroCampos,
  garantirSchemasValidos,
  lintOrdemCampos,
} from '../electron/main/engine/schemas/fieldOrder';

/** Um schema sintético com a ordem INVERTIDA (decisão antes de justificativa). */
function schemaComDecisaoAntesDeJustificativa(): SchemaRegistrado {
  return { nome: 'invertido', schema: z.object({ aprovado: z.boolean(), motivo: z.string() }) };
}

describe('lint de ordem — INV-04 (justificativa ANTES de decisão, docs §6.3)', () => {
  it('REPROVA um schema com `aprovado` antes de `motivo`', () => {
    const problemas = lintOrdemCampos([schemaComDecisaoAntesDeJustificativa()]);
    assert.equal(problemas.length, 1, 'um par decisão×justificativa invertido = uma violação');
    assert.equal(problemas[0].schema, 'invertido');
    assert.equal(problemas[0].caminho, '(raiz)');
    assert.equal(problemas[0].campo_decisao, 'aprovado');
    assert.equal(problemas[0].campo_justificativa, 'motivo');
    assert.ok(problemas[0].indice_decisao < problemas[0].indice_justificativa);
  });

  it('REPROVA um schema com `atomico` antes de `raciocinio_de_projeto` (falso-verde da revisão adversarial)', () => {
    const invertido: SchemaRegistrado = {
      nome: 'invertido-atomico',
      schema: z.object({ atomico: z.boolean(), raciocinio_de_projeto: z.string() }),
    };
    const problemas = lintOrdemCampos([invertido]);
    assert.equal(problemas.length, 1, 'a decisão de atomicidade exige raciocínio ANTES');
    assert.equal(problemas[0].campo_decisao, 'atomico');
    assert.equal(problemas[0].campo_justificativa, 'raciocinio_de_projeto');
    assert.ok(problemas[0].indice_decisao < problemas[0].indice_justificativa);
  });

  it('REPROVA um schema com `status` antes de `justificativa` (decisão de ciclo de vida)', () => {
    const invertido: SchemaRegistrado = {
      nome: 'invertido-status',
      schema: z.object({ status: z.enum(['rascunho', 'aprovado']), justificativa: z.string() }),
    };
    const problemas = lintOrdemCampos([invertido]);
    assert.equal(problemas.length, 1, 'o estado do draft só vem depois do motivo');
    assert.equal(problemas[0].campo_decisao, 'status');
    assert.equal(problemas[0].campo_justificativa, 'justificativa');
  });

  it('REPROVA um schema com `role` antes de `justificativa` (classificação-decisão §3.7)', () => {
    const invertido: SchemaRegistrado = {
      nome: 'invertido-role',
      schema: z.object({ role: z.enum(['regular', 'integration']), justificativa: z.string() }),
    };
    const problemas = lintOrdemCampos([invertido]);
    assert.equal(problemas.length, 1, 'marcar `integration` é decisão que exige motivo antes');
    assert.equal(problemas[0].campo_decisao, 'role');
    assert.equal(problemas[0].campo_justificativa, 'justificativa');
  });

  it('APROVA o schema corrigido — TestVerdict `nome → construcoes_encontradas → motivo → aprovado` (§6.3)', () => {
    const corrigido: SchemaRegistrado = {
      nome: 'test-verdict-corrigido',
      schema: z.object({
        nome: z.string(),
        construcoes_encontradas: z.array(z.string()),
        motivo: z.string(),
        aprovado: z.boolean(),
      }),
    };
    assert.deepEqual(lintOrdemCampos([corrigido]), []);
  });

  it('enxerga a inversão em shape ANINHADO, não só no topo do schema', () => {
    const aninhado: SchemaRegistrado = {
      nome: 'aninhado',
      schema: z.object({
        itens: z.array(z.object({ aprovado: z.boolean(), evidencia: z.string() })),
      }),
    };
    const problemas = lintOrdemCampos([aninhado]);
    assert.equal(problemas.length, 1);
    assert.equal(problemas[0].caminho, 'itens[]');
    assert.equal(problemas[0].campo_decisao, 'aprovado');
    assert.equal(problemas[0].campo_justificativa, 'evidencia');
  });

  it('não acusa quando os nomes só CONTÊM um nome da lista (casamento é EXATO)', () => {
    const parecido: SchemaRegistrado = {
      nome: 'parecido',
      schema: z.object({ acao_sugerida: z.string(), justificativa_de_redacao: z.string() }),
    };
    // `acao_sugerida` ≠ `acao`; `justificativa_de_redacao` ≠ `justificativa`.
    assert.deepEqual(lintOrdemCampos([parecido]), []);
  });

  it('as listas de nomes de campo são explícitas e versionadas (constantes exportadas)', () => {
    for (const decisao of [
      'aprovado',
      'decision',
      'acao',
      'veredito',
      'approve',
      'escolha',
      'result',
      // Revisão adversarial (onda 1): 'atomico', 'role' e 'status' também são
      // classificações-decisão — sem elas o lint daria falso-verde no par
      // raciocinio_de_projeto/atomico e em status/justificativa.
      'atomico',
      'role',
      'status',
    ]) {
      assert.ok(DECISION_FIELD_NAMES.includes(decisao), `faltou decisão "${decisao}"`);
    }
    for (const justificativa of [
      'motivo',
      'justificativa',
      'raciocinio',
      'raciocinio_de_projeto',
      'evidencia',
      'reasoning',
      'justificacao',
      'explicacao',
    ]) {
      assert.ok(JUSTIFICATION_FIELD_NAMES.includes(justificativa), `faltou justificativa "${justificativa}"`);
    }
  });

  it('FAIL-CLOSED (INV-03): garantirSchemasValidos lança listando a violação de ordem', () => {
    assert.throws(() => garantirSchemasValidos([schemaComDecisaoAntesDeJustificativa()]), /INV-04/);
    // Sobre o registro real, não lança — o build pode fechar verde.
    assert.doesNotThrow(() => garantirSchemasValidos(SCHEMA_REGISTRY));
  });
});

describe('campos opcionais — INV-05 (todo campo obrigatório, docs §6.3)', () => {
  it('NENHUM schema registrado da engine tem campo opcional (varredura sobre TODOS)', () => {
    const problemas = encontrarCamposOpcionais(SCHEMA_REGISTRY);
    assert.deepEqual(
      problemas,
      [],
      problemas.length > 0 ? `campos opcionais encontrados no registro: ${JSON.stringify(problemas, null, 2)}` : undefined,
    );
  });

  it('a varredura PEGA um `.optional()` de verdade (não é vaca morta)', () => {
    const sintetico: SchemaRegistrado = {
      nome: 'sintetico',
      schema: z.object({ raciocinio: z.string(), aprovado: z.boolean().optional() }),
    };
    const problemas = encontrarCamposOpcionais([sintetico]);
    assert.equal(problemas.length, 1);
    assert.equal(problemas[0].schema, 'sintetico');
    assert.equal(problemas[0].caminho, 'aprovado');
    assert.equal(problemas[0].tipo, 'ZodOptional');
  });

  it('`null` em união NÃO é opcional (valor vazio EXPLÍCITO permitido) — `undefined` em união É', () => {
    const comNull: SchemaRegistrado = {
      nome: 'com-null',
      schema: z.object({ evidencia: z.union([z.string(), z.null()]) }),
    };
    assert.deepEqual(encontrarCamposOpcionais([comNull]), [], 'null explícito é permitido');

    const comUndefined: SchemaRegistrado = {
      nome: 'com-undefined',
      schema: z.object({ evidencia: z.union([z.string(), z.undefined()]) }),
    };
    const problemas = encontrarCamposOpcionais([comUndefined]);
    assert.equal(problemas.length, 1);
    assert.equal(problemas[0].caminho, 'evidencia');
    assert.equal(problemas[0].tipo, 'uniao-com-undefined');
  });
});

describe('registro de schemas — A-P04-2 (o lint varre a lista REAL)', () => {
  it('SCHEMA_REGISTRY contém exatamente os 12 artefatos da engine', () => {
    assert.deepEqual(
      SCHEMA_REGISTRY.map((s) => s.nome).sort(),
      [
        'actions',
        'brief',
        'budget',
        'challenge-draft',
        'concepts',
        'findings',
        'freeze',
        'graph',
        'lesson-draft',
        'notional-machine',
        'order',
        'report',
      ],
    );
  });

  it('o lint REAL, sobre o registro inteiro, passa: ordem correta e zero opcionais', () => {
    assert.deepEqual(lintOrdemCampos(SCHEMA_REGISTRY), [], 'toda justificativa antes da decisão');
    assert.deepEqual(encontrarCamposOpcionais(SCHEMA_REGISTRY), [], 'todo campo obrigatório');
  });

  it('nos schemas REAIS, os pares da revisão adversarial estão na ordem certa (raciocinio_de_projeto/atomico e justificativa/status|role)', () => {
    // ConceitoAtômico: raciocínio declarado ANTES da decisão `atomico`.
    const chavesConceito = Object.keys(ConceitoAtomicoSchema.shape);
    assert.ok(
      chavesConceito.indexOf('raciocinio_de_projeto') < chavesConceito.indexOf('atomico'),
      'raciocinio_de_projeto deve preceder atomico no ConceitoAtomicoSchema',
    );
    // LessonDraft: a justificativa antes de `role`, `status` e `aprovado`.
    const chaves = Object.keys(LessonDraftSchema.shape);
    assert.ok(chaves.indexOf('justificativa') < chaves.indexOf('role'), 'justificativa antes de role');
    assert.ok(chaves.indexOf('justificativa') < chaves.indexOf('status'), 'justificativa antes de status');
    assert.ok(chaves.indexOf('justificativa') < chaves.indexOf('aprovado'), 'justificativa antes de aprovado');
  });
});

describe('validação de artefato — erro que NOMEIA o campo e o motivo', () => {
  it('brief inválido (faltando campos obrigatórios) → formatarErroCampos nomeia cada campo', () => {
    const r = BriefSchema.safeParse({ aprovado: true, justificativa: 'ok' });
    assert.equal(r.success, false);
    if (r.success) return;
    const texto = formatarErroCampos(r.error);
    assert.match(texto, /campo "tema"/);
    assert.match(texto, /campo "objetivo_geral"/);
    assert.match(texto, /campo "publico_alvo"/);
    assert.match(texto, /campo "politica_de_harness"/);
  });

  it('tipo errado em campo aninhado → nomeia o CAMINHO e o MOTIVO', () => {
    const r = ChallengeDraftSchema.safeParse({ expectedTestCount: 'nao-e-numero' } as unknown);
    assert.equal(r.success, false);
    if (r.success) return;
    const texto = formatarErroCampos(r.error);
    assert.match(texto, /campo "expectedTestCount"/);
    assert.match(texto, /Expected number|received string/, 'o motivo (mensagem do zod) aparece');
  });

  it('um brief VÁLIDO passa (o schema não é ruído)', () => {
    const r = BriefSchema.safeParse({
      tema: 'JavaScript do zero',
      objetivo_geral: 'ler e escrever os primeiros programas',
      publico_alvo: 'iniciante absoluto',
      criterios_de_entrada: ['abrir um terminal'],
      construcoes_alvo: ['node:FunctionDeclaration', 'op:binary:+'],
      politica_de_harness: 'receptive-seed',
      restricoes: ['sem npm install'],
      justificativa: 'viável para o público-alvo, custo zero de API',
      aprovado: true,
    });
    assert.equal(r.success, true);
    if (!r.success) return;
    assert.equal(r.data.aprovado, true);
    assert.equal(r.data.politica_de_harness, 'receptive-seed');
  });

  it('usa o formato estruturado do ZodError (issues com path e message) — o helper só formata', () => {
    const r = BriefSchema.safeParse({});
    assert.equal(r.success, false);
    if (r.success) return;
    assert.ok(r.error.issues.length > 0);
    const caminhos = r.error.issues.map((i) => i.path.join('.'));
    assert.ok(caminhos.includes('tema'));
    assert.ok(
      r.error.issues.every((i) => typeof i.message === 'string' && i.message.length > 0),
      'todo issue tem motivo',
    );
  });
});