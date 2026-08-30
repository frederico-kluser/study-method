/**
 * tests/engineReviewer.test.ts — o REVISOR e o NORMALIZADOR da engine de
 * trilhas (pacote P-12, onda 1 do plano de execução v1).
 *
 * Contratos que mordem aqui (`docs/16-engine-de-trilha.md` §6.2, §6.3, §6.5 e
 * §7.2):
 *
 *   - A-P12-1 — o schema de SAÍDA do revisor não tem campo de código nem de
 *     patch: o teste PERCORRE o zod shape (todos os níveis) e assere a
 *     ausência estrutural de `code`/`patch`/`correcao`/…, e o parse
 *     (com `.strict()`) REJEITA resposta que traga campo extra de código.
 *     (onda 2 — H-1) Rejeição em QUALQUER profundidade: `alvo`/`evidencia`
 *     são strict no `RevisaoSchema` (o `.strict()` de topo não cobria o
 *     strip-mode aninhado do P-04) e `validarRevisaoSemCodigo` percorre o
 *     DRAFT CRU antes do parse — a PRESENÇA de `code`/`codigo`/`patch`/
 *     `correcao`/`correcao_sugerida`/`fix` na raiz, em alvo[], em evidencia[]
 *     ou em predicados[] invalida a resposta (fail-closed).
 *   - A-P12-2 — assert de roteamento em código: `model(AUTOR) !==
 *     model(REVISOR)` e `family(REVISOR) ∉ families(produtores)` (§6.2),
 *     com mapas modelo→família injetados e FAIL-CLOSED quando a família
 *     não é verificável.
 *   - A-P12-3 — o normalizador é IDEMPOTENTE (aplicar 2× = aplicar 1×).
 *   - A-P12-4 — severidade vem da TABELA FIXA do §6.5; categoria
 *     desconhecida é ERRO, nunca default opinado. (onda 2 — H-2) A leitura
 *     usa `Object.hasOwn`: `toString`/`constructor`/`hasOwnProperty` são
 *     propriedades de Object.prototype, NÃO linhas da tabela — lançam.
 *   - A-P12-5 — categoria `estilo` (e `tom`/`prosa` — sugestão) NUNCA abre
 *     rodada.
 *   - A-P12-6 — o prompt do revisor não tem campo nem conteúdo de
 *     rascunho/raciocínio/plano do AUTOR: a entrada é EXATAMENTE {artefato
 *     normalizado, regras, verificadores}, e o prompt construído não contém
 *     os marcadores de um rascunho de exemplo.
 *   - (onda 2 — H-3) O normalizador neutraliza a VOZ DE AUTOR em variações
 *     reais: avaliação positiva posposta ("Este é um trabalho muito bom.",
 *     "A aula ficou muito boa."), voz possessiva ("Minha aula ficou muito
 *     boa, estou orgulhoso dela."), verbos de autoria ("Feito por GPT-4.")
 *     e assinaturas com travessão ("— GPT") — sem cortar conteúdo técnico.
 *   - (onda 2 — H-4) O modelo NÃO emite `severity`: a saída com o campo é
 *     REJEITADA (strict) e o pipeline anexa a severidade POR TABELA depois
 *     do parse, via `anexarSeveridadePorTabela`.
 *   - INV-04/INV-05 — `RevisaoSchema`/`PredicadoSchema` passam no lint do
 *     P-04 (`lintOrdemCampos`/`encontrarCamposOpcionais`): justificativa
 *     antes do veredito, todo campo obrigatório.
 *
 * Sem rede, sem disco, sem LLM: prompt, normalizador, tabela e roteamento
 * são funções puras.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import {
  anexarSeveridadePorTabela,
  construirPromptRevisor,
  encontrarChavesDeCodigoNoDraft,
  NOMES_PROIBIDOS_DE_CODIGO,
  PREDICADOS_DA_AULA,
  PredicadoSchema,
  PredicadosSchema,
  RevisaoSchema,
  validarRevisaoSemCodigo,
  type EntradaPromptRevisor,
  type RegraDoCatalogo,
} from '../electron/main/engine/prompts/reviewer';
import {
  ErroDeCategoriaDesconhecida,
  ErroDeRoteamento,
  SEVERIDADE_GRANULARIDADE_POS_ESTRUTURA,
  SEVERIDADE_POR_CATEGORIA,
  abreRodada,
  neutralizarTom,
  normalizarArtefato,
  removerAssinaturasDeModelo,
  removerComentarios,
  removerLinhasDeAutoria,
  removerSecoesDeMeta,
  severidadeDeCategoria,
  validarRoteamento,
  type MapaDeFamilias,
} from '../electron/main/engine/review/normalize';
import {
  ApontamentoSchema,
  CategoriaSchema,
  FindingsSchema,
  type SchemaRegistrado,
} from '../electron/main/engine/schemas/artifacts';
import { encontrarCamposOpcionais, lintOrdemCampos } from '../electron/main/engine/schemas/fieldOrder';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Percorre a árvore de um schema zod e devolve TODAS as chaves de TODOS os
 * objetos (topo e aninhados) — a matéria-prima do assert estrutural do
 * A-P12-1: se não há chave de código/patch em NENHUM nível, não há campo
 * onde o modelo escreva código.
 */
function coletarChavesDeTodoSchema(schema: z.ZodTypeAny): string[] {
  const chaves: string[] = [];
  const def = schema._def as { typeName?: string };
  switch (def.typeName) {
    case 'ZodObject': {
      const forma = (schema as z.ZodObject<z.ZodRawShape>).shape;
      for (const [chave, filho] of Object.entries(forma)) {
        chaves.push(chave);
        chaves.push(...coletarChavesDeTodoSchema(filho));
      }
      return chaves;
    }
    case 'ZodArray':
      return coletarChavesDeTodoSchema((def as { type: z.ZodTypeAny }).type);
    case 'ZodTuple':
      return (def as { items: z.ZodTypeAny[] }).items.flatMap((item) => coletarChavesDeTodoSchema(item));
    case 'ZodUnion':
      return (def as { options: z.ZodTypeAny[] }).options.flatMap((opcao) => coletarChavesDeTodoSchema(opcao));
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodDefault':
      return coletarChavesDeTodoSchema((def as { innerType: z.ZodTypeAny }).innerType);
    case 'ZodEffects':
      return coletarChavesDeTodoSchema((def as { schema: z.ZodTypeAny }).schema);
    case 'ZodRecord':
      return coletarChavesDeTodoSchema((def as { valueType: z.ZodTypeAny }).valueType);
    case 'ZodLazy':
      return coletarChavesDeTodoSchema((def as { getter: () => z.ZodTypeAny }).getter());
    default:
      return [];
  }
}

/** Tokens proibidos no shape de saída do revisor (A-P12-1). */
const TOKENS_PROIBIDOS = ['code', 'patch', 'correcao', 'codigo', 'fix', 'diff'];

function chavesContemTokenProibido(chaves: readonly string[]): string[] {
  return chaves.filter((chave) => TOKENS_PROIBIDOS.some((token) => chave.toLowerCase().includes(token)));
}

/** Um apontamento válido do P-04, reutilizado nos testes de schema. */
function apontamentoValido(): z.infer<typeof ApontamentoSchema> {
  return {
    id: 'APT-0042',
    rodada: 1,
    artefato: 'desafio',
    alvo: { caminho: 'm01/a03/desafio.md', linha: 7, span: [122, 149], no_ast: 'ThrowStatement', token: 'throw' },
    evidencia: {
      tipo: 'orcamento',
      prova: 'token `throw` não pertence ao orçamento',
      introduzido_em: 'm02/a05',
      reproduzivel_por: 'npm run engine -- audit m01/a03',
    },
    defeito: 'O desafio usa `throw` na linha 7.',
    regra_violada: 'C1',
    categoria: 'construcao_nao_ensinada',
    severity: 'bloqueante',
    acao_sugerida: 'trocar por uma construção do orçamento',
    confianca: 0.95,
  };
}

/**
 * O mesmíssimo apontamento SEM `severity` — como o MODELO o produz (H-4):
 * o schema de saída do revisor não tem o campo; a severidade é anexada pelo
 * pipeline, por tabela fixa, depois do parse.
 */
function apontamentoDoModelo(): Omit<z.infer<typeof ApontamentoSchema>, 'severity'> {
  const { severity: _severity, ...apontamento } = apontamentoValido();
  return apontamento;
}

function cincoPredicadosValidos(): z.infer<typeof PredicadosSchema>['predicados'] {
  return PREDICADOS_DA_AULA.map((p) => ({
    id: p.id as 'E1' | 'E2' | 'E3' | 'E4' | 'E5',
    pergunta: p.pergunta,
    justificativa: `A aula ${p.id} atende ao predicado conforme o trecho citado.`,
    veredito: 'sim' as const,
  }));
}

/** Um artefato SUJO, de exemplo: comentário, auto-elogio, assinatura, modelo, changelog, auto-avaliação. */
const AMOSTRA_SUJA = [
  '<!-- rascunho interno do autor — não publicar -->',
  '# Aula 5 — Laços',
  '',
  'Este rascunho está excelente! Estou muito satisfeito com o resultado final.',
  'Fiquei muito satisfeito com o resultado.',
  '',
  'Autor: Ana Beatriz',
  'Modelo: deepseek-v4-flash-0731',
  '',
  'Changelog:',
  '- v2: corrigi um typo na teoria',
  '- v1: primeira versão',
  '',
  '## Teoria',
  'A definição segue abaixo.',
  '',
  '## Auto-avaliação',
  'Acho que ficou perfeito e pronto.',
  '',
  '## Desafio',
  'Escreva um laço enquanto.',
].join('\n');

/** As regras C1–C8 do §6.7, o catálogo FECHADO de regras do revisor. */
const REGRAS_DO_CATALOGO: readonly RegraDoCatalogo[] = [
  { id: 'C1', texto: 'nada fora do orçamento em qualquer lugar do artefato' },
  { id: 'C2', texto: 'desafio resolvível apenas com o que foi ensinado' },
  { id: 'C3', texto: 'testes legíveis com o orçamento de entrada' },
  { id: 'C4', texto: 'uma unidade nova por aula' },
  { id: 'C5', texto: 'o desafio exercita o conceito novo' },
  { id: 'C6', texto: 'não é resolvível por `return` constante' },
  { id: 'C7', texto: 'a teoria ensina tudo o que o desafio cobra' },
  { id: 'C8', texto: 'nenhum conceito órfão' },
];

// ---------------------------------------------------------------------------
// A-P12-1 — schema de SAÍDA do revisor sem campo de código/patch (estrutural)
// ---------------------------------------------------------------------------

describe('A-P12-1 — o schema de saída do revisor não tem campo de código nem de patch (estrutural)', () => {
  it('o zod shape de TODOS os níveis não contém chave de código/patch/correção', () => {
    for (const [nome, schema] of [
      ['FindingsSchema', FindingsSchema],
      ['ApontamentoSchema', ApontamentoSchema],
      ['PredicadoSchema', PredicadoSchema],
      ['PredicadosSchema', PredicadosSchema],
      ['RevisaoSchema', RevisaoSchema],
    ] as const) {
      const chaves = coletarChavesDeTodoSchema(schema);
      assert.equal(
        chavesContemTokenProibido(chaves).length,
        0,
        `${nome}: o shape contém chave(s) de código/patch: ${JSON.stringify(chavesContemTokenProibido(chaves))}`,
      );
    }
  });

  it('o shape do ApontamentoSchema (P-04) não tem chave direta de código', () => {
    for (const chave of ['code', 'patch', 'correcao', 'codigo', 'fix', 'diff']) {
      assert.ok(!(chave in ApontamentoSchema.shape), `ApontamentoSchema não pode ter campo "${chave}"`);
    }
  });

  it('o RevisaoSchema é a saída do revisor: findings do P-04 + o bloco de cinco predicados', () => {
    assert.deepEqual(Object.keys(RevisaoSchema.shape), [...Object.keys(FindingsSchema.shape), 'predicados']);
    assert.deepEqual(Object.keys(PredicadoSchema.shape), ['id', 'pergunta', 'justificativa', 'veredito']);
    assert.equal(PREDICADOS_DA_AULA.length, 5, 'exatamente cinco predicados por aula (§7.2)');
    assert.deepEqual(
      PREDICADOS_DA_AULA.map((p) => p.id),
      ['E1', 'E2', 'E3', 'E4', 'E5'],
    );
  });

  it('o parse REJEITA resposta com campo extra de código (RevisaoSchema é strict)', () => {
    const resposta = {
      artefato: 'm01/a03',
      hash_artefato: 'abc123',
      rodada: 1,
      apontamentos: [apontamentoDoModelo()],
      resumo: 'dois achados',
      predicados: cincoPredicadosValidos(),
      codigo: 'console.log("eu escrevo código mesmo assim")',
    };
    const r = RevisaoSchema.safeParse(resposta);
    assert.equal(r.success, false, 'campo extra de código deve ser REJEITADO — a proibição é estrutural e o parse é strict');
  });

  it('uma resposta VÁLIDA passa no RevisaoSchema', () => {
    const r = RevisaoSchema.safeParse({
      artefato: 'm01/a03',
      hash_artefato: 'abc123',
      rodada: 1,
      apontamentos: [apontamentoDoModelo()],
      resumo: 'um achado',
      predicados: cincoPredicadosValidos(),
    });
    assert.equal(r.success, true);
  });
});

// ---------------------------------------------------------------------------
// H-1 (onda 2) — rejeição estrutural em QUALQUER profundidade
// ---------------------------------------------------------------------------

describe('H-1 — chave de código em QUALQUER profundidade invalida a resposta (raiz, alvo, evidencia, predicados)', () => {
  function baseCom(apontamento: unknown, predicados: unknown = undefined): Record<string, unknown> {
    const resposta: Record<string, unknown> = {
      artefato: 'm01/a03',
      hash_artefato: 'abc123',
      rodada: 1,
      apontamentos: [apontamento],
      resumo: 'um achado',
    };
    resposta.predicados = predicados === undefined ? cincoPredicadosValidos() : predicados;
    return resposta;
  }

  it('o walker acha a chave proibida na RAIZ e os caminhos apontam o nível exato', () => {
    const comRaiz = { ...baseCom(apontamentoDoModelo()), codigo: 'x' };
    assert.deepEqual(encontrarChavesDeCodigoNoDraft(comRaiz), ['$.codigo']);
  });

  it('o walker acha a chave proibida DENTRO de alvo[]', () => {
    const comPatchNoAlvo = baseCom({ ...apontamentoDoModelo(), alvo: { ...apontamentoDoModelo().alvo, patch: 'o patch que não pode existir' } });
    assert.deepEqual(encontrarChavesDeCodigoNoDraft(comPatchNoAlvo), ['$.apontamentos[0].alvo.patch']);
  });

  it('o walker acha a chave proibida DENTRO de evidencia[]', () => {
    const comCorrecaoNaEvidencia = baseCom({
      ...apontamentoDoModelo(),
      evidencia: { ...apontamentoDoModelo().evidencia, correcao: 'trocar por outra construção' },
    });
    assert.deepEqual(encontrarChavesDeCodigoNoDraft(comCorrecaoNaEvidencia), ['$.apontamentos[0].evidencia.correcao']);
  });

  it('o walker acha a chave proibida DENTRO de predicados[]', () => {
    const comFixNoPredicado = baseCom(
      apontamentoDoModelo(),
      [{ ...cincoPredicadosValidos()[0], fix: 'escrever o código aqui' }, ...cincoPredicadosValidos().slice(1)],
    );
    assert.deepEqual(encontrarChavesDeCodigoNoDraft(comFixNoPredicado), ['$.predicados[0].fix']);
  });

  it('o casamento é por igualdade NORMALIZADA (case/camel/snake) e NUNCA por substring', () => {
    assert.deepEqual(encontrarChavesDeCodigoNoDraft({ correcaoSugerida: 'x' }), ['$.correcaoSugerida']);
    assert.deepEqual(encontrarChavesDeCodigoNoDraft({ 'Correcao-Sugerida': 'x' }), ['$.Correcao-Sugerida']);
    assert.deepEqual(encontrarChavesDeCodigoNoDraft({ CODE: 'x' }), ['$.CODE']);
    assert.deepEqual(encontrarChavesDeCodigoNoDraft({ fixacao: 'x', codigos: ['y'], codigoFonte: 'z' }), []);
    assert.deepEqual(NOMES_PROIBIDOS_DE_CODIGO, ['code', 'codigo', 'patch', 'correcao', 'correcao_sugerida', 'fix']);
  });

  it('validarRevisaoSemCodigo LANÇA (fail-closed) quando há chave em qualquer nível; passa sem', () => {
    assert.throws(() => validarRevisaoSemCodigo({ codigo: 'x' }), /A-P12-1/);
    assert.throws(() => validarRevisaoSemCodigo({ apontamentos: [{ alvo: { code: 1 } }] }), /alvo/);
    assert.throws(() => validarRevisaoSemCodigo(baseCom(apontamentoDoModelo(), [{ ...cincoPredicadosValidos()[0], patch: 'x' }])), /predicados/);
    assert.doesNotThrow(() => validarRevisaoSemCodigo(baseCom(apontamentoDoModelo())));
  });

  it('o zod é strict em TODOS os níveis: chave desconhecida dentro de alvo/evidencia/apontamento também é rejeitada (não strippada)', () => {
    const comExtraNoAlvo = baseCom({ ...apontamentoDoModelo(), alvo: { ...apontamentoDoModelo().alvo, extra: 1 } });
    assert.equal(RevisaoSchema.safeParse(comExtraNoAlvo).success, false, 'alvo strict: campo extra rejeitado');

    const comExtraNaEvidencia = baseCom({ ...apontamentoDoModelo(), evidencia: { ...apontamentoDoModelo().evidencia, extra: 1 } });
    assert.equal(RevisaoSchema.safeParse(comExtraNaEvidencia).success, false, 'evidencia strict: campo extra rejeitado');

    const comPatchNoAlvo = baseCom({ ...apontamentoDoModelo(), alvo: { ...apontamentoDoModelo().alvo, patch: 'x' } });
    assert.equal(RevisaoSchema.safeParse(comPatchNoAlvo).success, false, 'patch aninhado rejeitado pelo zod strict (não só pelo walker)');
  });
});

describe('INV-04/INV-05 — o schema do revisor passa no lint de ordem e de opcionais do P-04', () => {
  it('RevisaoSchema e PredicadosSchema não invertem justificativa/decisão e não têm campo opcional', () => {
    const registrados: SchemaRegistrado[] = [
      { nome: 'revisao', schema: RevisaoSchema },
      { nome: 'predicados', schema: PredicadosSchema },
      { nome: 'predicado', schema: PredicadoSchema },
    ];
    assert.deepEqual(lintOrdemCampos(registrados), [], 'justificativa ANTES de veredito em todo nível (INV-04)');
    assert.deepEqual(encontrarCamposOpcionais(registrados), [], 'todo campo obrigatório (INV-05)');
  });

  it('o lint do P-04 PEGA uma inversão de verdade no predicado: veredito antes de justificativa', () => {
    const invertido: SchemaRegistrado = {
      nome: 'predicado-invertido',
      schema: z.object({
        id: z.string(),
        pergunta: z.string(),
        veredito: z.enum(['sim', 'nao']),
        justificativa: z.string(),
      }),
    };
    const problemas = lintOrdemCampos([invertido]);
    assert.equal(problemas.length, 1);
    assert.equal(problemas[0].campo_decisao, 'veredito');
    assert.equal(problemas[0].campo_justificativa, 'justificativa');
  });

  it('PREDICADOS_DA_AULA contém as cinco perguntas exatas do §7.2', () => {
    const perguntas = PREDICADOS_DA_AULA.map((p) => p.pergunta);
    for (const trecho of ['sintático', 'adição mínima', 'pré-requisito', 'exemplo relevante da teoria', 'desafio desta aula']) {
      assert.ok(perguntas.some((q) => q.toLowerCase().includes(trecho)), `falta predicado sobre "${trecho}"`);
    }
  });
});

// ---------------------------------------------------------------------------
// Normalizador — A-P12-3 e o comportamento do §6.2
// ---------------------------------------------------------------------------

describe('normalizador — remove autoria, auto-avaliação e neutraliza tom (§6.2)', () => {
  it('remove comentário de markdown sem tocar em código', () => {
    const comComentario = 'linha um\n<!-- nota do autor -->\nlinha dois';
    assert.equal(removerComentarios(comComentario), 'linha um\nlinha dois');
    // `//` e `/‌* *‌/` dentro de bloco de código são CONTEÚDO — ficam.
    const comCodigo = 'const x = 1; // comentário de código legítimo';
    assert.equal(removerComentarios(comCodigo), comCodigo);
  });

  it('remove linhas de autoria e de nome de modelo', () => {
    const cenario = [
      'Autor: Ana Beatriz',
      'Autoria: equipe de trilhas',
      'Modelo: deepseek-v4-flash-0731',
      'Modelo utilizado：claude-sonnet-4',
      'Escrito por Fulano',
      'Prosa normal: por exemplo, isso aqui fica.',
      '## Título',
    ].join('\n');
    const limpo = removerLinhasDeAutoria(cenario);
    assert.ok(!limpo.includes('Ana Beatriz'));
    assert.ok(!limpo.includes('equipe de trilhas'));
    assert.ok(!limpo.includes('deepseek'));
    assert.ok(!limpo.includes('claude-sonnet-4'));
    assert.ok(!limpo.includes('Fulano'));
    assert.ok(limpo.includes('Prosa normal: por exemplo, isso aqui fica.'), 'linha que começa com "por exemplo" NÃO é autoria');
    assert.ok(limpo.includes('## Título'));
  });

  it('remove seções de changelog e auto-avaliação inteiras, até a próxima heading', () => {
    const cenario = [
      '## Changelog',
      '- v2: corrigi um typo',
      '- v1: primeira versão',
      '## Teoria',
      'conteúdo que fica',
      '## Auto-avaliação',
      'Acho que ficou perfeito e pronto.',
      'Mais um parágrafo de auto-elogio.',
    ].join('\n');
    const limpo = removerSecoesDeMeta(cenario);
    assert.equal(limpo, '## Teoria\nconteúdo que fica');
    assert.ok(!limpo.includes('Changelog'));
    assert.ok(!limpo.includes('Auto-avaliação'));
    assert.ok(!limpo.includes('perfeito'));
  });

  it('remove auto-elogio e assinatura de autoria da amostra suja', () => {
    const limpo = normalizarArtefato(AMOSTRA_SUJA);
    assert.ok(!limpo.includes('<!--'), 'comentário removido');
    assert.ok(!limpo.includes('excelente'), 'auto-elogio removido');
    assert.ok(!limpo.includes('satisfeito'), 'auto-avaliação removida');
    assert.ok(!limpo.includes('Ana Beatriz'), 'assinatura de autoria removida');
    assert.ok(!limpo.includes('deepseek'), 'nome de modelo removido');
    assert.ok(!limpo.includes('Changelog'), 'changelog removido');
    assert.ok(!limpo.includes('corrigi um typo'), 'corpo do changelog removido');
    assert.ok(!limpo.includes('Auto-avaliação'), 'seção de auto-avaliação removida');
    assert.ok(!limpo.includes('perfeito'), 'auto-elogio dentro da seção removido');
    assert.ok(limpo.includes('# Aula 5 — Laços'), 'conteúdo legitimo preservado');
    assert.ok(limpo.includes('## Teoria'));
    assert.ok(limpo.includes('A definição segue abaixo.'));
    assert.ok(limpo.includes('## Desafio'));
    assert.ok(limpo.includes('Escreva um laço enquanto.'));
  });

  it('neutralizarTom remove elogio e colapsa ênfase acumulada', () => {
    const texto = 'Uma explicação excelente e perfeita!!!';
    assert.equal(neutralizarTom(texto), 'Uma explicação e!');
    assert.equal(neutralizarTom('ótimo e ótima e ótimos'), 'e e ótimos', 'só as formas curadas casam');
  });

  it('é IDEMPOTENTE — aplicar 2× = aplicar 1× (A-P12-3)', () => {
    const umaVez = normalizarArtefato(AMOSTRA_SUJA);
    const duasVezes = normalizarArtefato(umaVez);
    assert.equal(duasVezes, umaVez, 'a segunda aplicação não muda nada');

    // E idempotente também sobre conteúdo já LIMPO (sem meta para remover).
    const limpo = ['# Aula 5 — Laços', '', '## Teoria', 'A definição segue abaixo.', '## Desafio', 'const i = 0; // fora do orçamento'].join('\n');
    assert.equal(normalizarArtefato(normalizarArtefato(limpo)), normalizarArtefato(limpo));
  });

  it('o texto normalizado não tem voz de autor: elogio sumiu e a assinatura não reaparece com duas passadas', () => {
    const umaVez = normalizarArtefato(AMOSTRA_SUJA);
    const duasVezes = normalizarArtefato(umaVez);
    for (const marcador of ['excelente', 'satisfeito', 'Ana Beatriz', 'deepseek', 'Changelog', 'Auto-avaliação']) {
      assert.ok(!duasVezes.includes(marcador), `"${marcador}" não pode sobreviver a duas passadas`);
    }
  });
});

// ---------------------------------------------------------------------------
// H-3 (onda 2) — o normalizador neutraliza a VOZ DE AUTOR em variações reais
// ---------------------------------------------------------------------------

describe('H-3 — voz de autor em variações reais é neutralizada sem cortar conteúdo técnico', () => {
  it('família (a): avaliação positiva posposta em frase declarativa de autoria some', () => {
    assert.ok(!normalizarArtefato('Este é um trabalho muito bom.').includes('muito bom'));
    assert.ok(!normalizarArtefato('A aula ficou muito boa.').includes('muito boa'));
    assert.ok(!normalizarArtefato('Este trabalho está excelente.').includes('excelente'));
    assert.ok(!normalizarArtefato('A aula ficou perfeita.').includes('perfeita'));
  });

  it('família (b): voz possessiva de autoria + verbo de estado/orgulho some', () => {
    assert.ok(!normalizarArtefato('Minha aula ficou muito boa, estou orgulhoso dela.').includes('orgulhoso'));
    assert.ok(!normalizarArtefato('Meu material ficou ótimo.').includes('ótimo'));
  });

  it('família (c): verbos de autoria ("feito por") e assinatura com travessão no fim some', () => {
    assert.ok(!normalizarArtefato('Feito por GPT-4.').includes('GPT'));
    assert.ok(!normalizarArtefato('Escrito por Ana.').includes('Ana'));
    assert.ok(!normalizarArtefato('— GPT').includes('GPT'));
    assert.ok(!normalizarArtefato('— Ana Beatriz').includes('Ana Beatriz'));
  });

  it('família (d): linha que é SÓ nome de modelo sai inteira', () => {
    for (const linha of ['GPT-4.', 'Claude', 'DeepSeek', 'Gemini', 'Llama', 'ChatGPT']) {
      const limpo = normalizarArtefato(linha);
      assert.ok(linha.length > 0 && limpo.length === 0, `linha de modelo "${linha}" deve sair inteira`);
    }
  });

  it('assinatura com travessão no FIM da linha sai SEM cortar o corpo da aula', () => {
    const cenario = ['## Teoria', 'A definição segue abaixo — GPT-4.', '## Desafio', 'Escreva um laço.'].join('\n');
    const limpo = normalizarArtefato(cenario);
    assert.ok(!limpo.includes('GPT-4'), 'assinatura de modelo removida');
    assert.ok(limpo.includes('A definição segue abaixo'), 'corpo da teoria preservado');
    assert.ok(limpo.includes('Escreva um laço.'), 'corpo do desafio preservado');
    assert.ok(limpo.includes('## Desafio'));
  });

  it('é conservador: instruções e conteúdo técnico com "muito bom"/"muito bem" NÃO saem', () => {
    const conteudo = [
      '## Desafio',
      'Explique muito bem o conceito de laço.',
      'Um exemplo muito bom de recursão é o fatorial.',
      'A função recebe um número e devolve o fatorial.',
    ].join('\n');
    const limpo = normalizarArtefato(conteudo);
    assert.ok(limpo.includes('Explique muito bem o conceito de laço.'), 'instrução com "muito bem" preservada');
    assert.ok(limpo.includes('Um exemplo muito bom de recursão é o fatorial.'), 'conteúdo sem sujeito de autoria preservado');
    assert.ok(limpo.includes('A função recebe um número'));
  });

  it('o título com travessão ("# Aula 5 — Laços") não é assinatura', () => {
    assert.ok(normalizarArtefato('# Aula 5 — Laços').includes('Laços'));
  });

  it('removerAssinaturasDeModelo é IDEMPOTENTE (2× = 1×)', () => {
    const texto = 'linha um — GPT-4\n— GPT\nlinha dois\n— Ana Beatriz';
    const umaVez = removerAssinaturasDeModelo(texto);
    assert.equal(removerAssinaturasDeModelo(umaVez), umaVez);
    assert.ok(!umaVez.includes('GPT'));
    assert.ok(!umaVez.includes('Ana Beatriz'));
    assert.ok(umaVez.includes('linha um'));
    assert.ok(umaVez.includes('linha dois'));
  });

  it('normalizarArtefato é IDEMPOTENTE nas variações de voz de autor (A-P12-3)', () => {
    const sujo = [
      'Este é um trabalho muito bom.',
      'A aula ficou muito boa.',
      'Minha aula ficou muito boa, estou orgulhoso dela.',
      'Feito por GPT-4.',
      '— GPT',
      '## Teoria',
      'A definição segue abaixo — GPT-4.',
    ].join('\n');
    const umaVez = normalizarArtefato(sujo);
    const duasVezes = normalizarArtefato(umaVez);
    assert.equal(duasVezes, umaVez, 'a segunda aplicação não muda nada');
    for (const marcador of ['muito bom', 'muito boa', 'orgulhoso', 'GPT']) {
      assert.ok(!duasVezes.includes(marcador), `"${marcador}" não pode sobreviver a duas passadas`);
    }
  });
});

// ---------------------------------------------------------------------------
// A-P12-4 — severidade por TABELA FIXA (§6.5)
// ---------------------------------------------------------------------------

describe('A-P12-4 — severidade vem da tabela fixa do §6.5, nunca opinada', () => {
  it('bloqueante: as cinco categorias da primeira linha da tabela', () => {
    for (const categoria of [
      'construcao_nao_ensinada',
      'api_nao_ensinada',
      'pre_requisito_violado',
      'teste_invalido',
      'gabarito_nao_passa',
    ]) {
      assert.equal(severidadeDeCategoria(categoria), 'bloqueante', `${categoria} → bloqueante`);
    }
  });

  it('corrigir: cobertura, teoria e ambiguidade; granularidade corrige na fase de estrutura', () => {
    for (const categoria of ['cobertura_faltante', 'teoria_desalinhada_do_desafio', 'ambiguidade_de_enunciado', 'granularidade']) {
      assert.equal(severidadeDeCategoria(categoria), 'corrigir', `${categoria} → corrigir`);
    }
    assert.equal(SEVERIDADE_GRANULARIDADE_POS_ESTRUTURA, 'sugestao', 'granularidade vira sugestão depois da fase de estrutura (§6.5)');
  });

  it('sugestão: estilo, tom e prosa', () => {
    for (const categoria of ['estilo', 'tom', 'prosa']) {
      assert.equal(severidadeDeCategoria(categoria), 'sugestao', `${categoria} → sugestão`);
    }
  });

  it('a tabela cobre EXATAMENTE o enum de categorias do P-04 (nenhuma linha faltando)', () => {
    assert.deepEqual(Object.keys(SEVERIDADE_POR_CATEGORIA).sort(), [...CategoriaSchema.options].sort());
  });

  it('categoria DESCONHECIDA é ERRO (FAIL-CLOSED), não default opinado', () => {
    assert.throws(() => severidadeDeCategoria('categoria_inventada'), ErroDeCategoriaDesconhecida);
    assert.throws(() => severidadeDeCategoria('ESTILO'), ErroDeCategoriaDesconhecida, 'não há normalização de entrada: o enum é exato');
    assert.throws(() => severidadeDeCategoria(''), ErroDeCategoriaDesconhecida);
  });

  it('chaves herdadas de Object.prototype NÃO são linhas da tabela (H-2: leitura via Object.hasOwn)', () => {
    for (const categoria of ['toString', 'constructor', 'hasOwnProperty', 'valueOf', 'isPrototypeOf', '__proto__']) {
      assert.throws(
        () => severidadeDeCategoria(categoria),
        ErroDeCategoriaDesconhecida,
        `"${categoria}" é herança de Object.prototype, não linha da tabela fixa (§6.5)`,
      );
      assert.throws(() => abreRodada(categoria), ErroDeCategoriaDesconhecida, `"${categoria}" não pode abrir rodada`);
    }
  });
});

// ---------------------------------------------------------------------------
// A-P12-5 — `estilo` (sugestão) NUNCA abre rodada
// ---------------------------------------------------------------------------

describe('A-P12-5 — categoria de sugestão nunca abre rodada (§6.5)', () => {
  it('estilo, tom e prosa → false', () => {
    for (const categoria of ['estilo', 'tom', 'prosa']) {
      assert.equal(abreRodada(categoria), false, `${categoria} nunca abre rodada`);
    }
  });

  it('bloqueante e corrigir → true (abrem rodada); granularidade abre (na fase de estrutura)', () => {
    assert.equal(abreRodada('construcao_nao_ensinada'), true);
    assert.equal(abreRodada('gabarito_nao_passa'), true);
    assert.equal(abreRodada('cobertura_faltante'), true);
    assert.equal(abreRodada('granularidade'), true);
  });

  it('categoria desconhecida também é erro aqui', () => {
    assert.throws(() => abreRodada('nao_existe'), ErroDeCategoriaDesconhecida);
  });
});

// ---------------------------------------------------------------------------
// A-P12-6 — o prompt do revisor não carrega o rascunho/raciocínio do autor
// ---------------------------------------------------------------------------

describe('A-P12-6 — o prompt do REVISOR não contém o raciocínio nem o rascunho do AUTOR (§6.2 e §7.2)', () => {
  it('a entrada do prompt tem EXATAMENTE três campos: artefato normalizado, regras, verificadores', () => {
    const entrada: EntradaPromptRevisor = {
      artefatoNormalizado: '# Aula 5',
      regras: REGRAS_DO_CATALOGO,
      verificadores: '0 violações; testes verdes; pins verdes',
    };
    assert.deepEqual(Object.keys(entrada), ['artefatoNormalizado', 'regras', 'verificadores']);
    for (const campoProibido of ['raciocinioDoAutor', 'rascunhoDoAutor', 'planoDoAutor', 'draft', 'pensamento']) {
      assert.ok(!(campoProibido in entrada), `a entrada não pode ter campo "${campoProibido}"`);
    }
  });

  it('o prompt construído não contém os rastros de autoria de um rascunho de exemplo (comentário, auto-elogio, assinatura, modelo, changelog, auto-avaliação)', () => {
    // O §6.2 nomeia o que o normalizador remove — estes marcadores vivem em
    // cada uma dessas TRINCAS de autoria. A cadeia normalizador → prompt tem
    // de deixar o revisor sem NENHUM deles.
    const marcadores = ['PENSAMENTO_INTERNO_DO_AUTOR', 'MEU_PLANO_DE_AUTORIA', 'JUSTIFICATIVA_INTERNA'];
    const rascunhoDoAutor = [
      `<!-- ${marcadores[0]}: usei reduce porque acho mais elegante -->`,
      '# Aula 5 — Laços',
      '',
      `Este rascunho está excelente! ${marcadores[1]}: primeiro teoria, depois desafio.`,
      '',
      `Autor: ${marcadores[0]} da Ana`,
      `Modelo: ${marcadores[1]}-0731`,
      '',
      `Changelog:`,
      `- v2: ${marcadores[2]}: corrigi porque preferi let`,
      '',
      '## Teoria',
      'A definição segue abaixo.',
      '',
      '## Auto-avaliação',
      `${marcadores[2]} é minha decisão de design e ficou perfeita.`,
    ].join('\n');

    const normalizado = normalizarArtefato(rascunhoDoAutor);
    const prompt = construirPromptRevisor({
      artefatoNormalizado: normalizado,
      regras: REGRAS_DO_CATALOGO,
      verificadores: '0 violações de orçamento; testes verdes; pins verdes',
    });

    for (const marcador of marcadores) {
      assert.ok(!normalizado.includes(marcador), `o texto normalizado não pode conter "${marcador}"`);
      assert.ok(!prompt.includes(marcador), `o prompt não pode conter "${marcador}"`);
    }
    for (const nomeDeCampo of ['raciocinio_do_autor', 'rascunho_do_autor', 'plano_do_autor', 'pensamento_do_autor']) {
      assert.ok(!prompt.includes(nomeDeCampo), `o prompt não tem campo "${nomeDeCampo}"`);
    }
  });

  it('o prompt instrui tudo o que o §7.2 manda (papel, evidência citável, reporte total, cinco predicados, sem código)', () => {
    const prompt = construirPromptRevisor({
      artefatoNormalizado: '# Aula 5 — Laços\n\n## Teoria\nA definição segue abaixo.',
      regras: REGRAS_DO_CATALOGO,
      verificadores: '0 violações; testes verdes; pins verdes',
    });
    assert.ok(prompt.includes('NÃO escreve código'), 'papel: não escreve código');
    assert.ok(prompt.includes('span'), 'regra dura: todo apontamento carrega span');
    assert.ok(prompt.includes('Reporte TUDO'), 'regra dura: reporte tudo — triagem é etapa separada');
    assert.ok(prompt.includes('nota de 1 a 5'), 'regra dura: sem nota 1–5');
    assert.ok(prompt.includes('tabela fixa') || prompt.includes('TABELA FIXA'), 'severidade por tabela, nunca opinada');
    assert.ok(prompt.includes('categoria'), 'o revisor escolhe categoria, não severidade');
    assert.ok(prompt.includes('E5'), 'bloco de cinco predicados presente');
    assert.ok(prompt.includes('justificativa'), 'justificativa exigida');
    for (const p of PREDICADOS_DA_AULA) {
      assert.ok(prompt.includes(p.pergunta), `pergunta do predicado ${p.id} no prompt`);
    }
    assert.ok(!prompt.includes('pense profundamente, passo a passo'), 'anti-padrão declarado do §7 não pode estar no prompt');
    assert.ok(!prompt.includes('recomece do zero'), 'proibição do §7 não pode estar no prompt');
  });

  it('regras vazias é ERRO (FAIL-CLOSED): revisor sem catálogo não existe', () => {
    assert.throws(
      () => construirPromptRevisor({ artefatoNormalizado: 'x', regras: [], verificadores: 'ok' }),
      /catálogo de regras vazio/,
    );
  });

  it('o prompt é FUNÇÃO PURA: mesma entrada, mesma string', () => {
    const entrada: EntradaPromptRevisor = {
      artefatoNormalizado: '# Aula 5 — Laços',
      regras: REGRAS_DO_CATALOGO,
      verificadores: '0 violações',
    };
    assert.equal(construirPromptRevisor(entrada), construirPromptRevisor({ ...entrada, verificadores: '0 violações' }));
  });
});

// ---------------------------------------------------------------------------
// H-4 (onda 2) — o MODELO não emite `severity`; o pipeline anexa pela Tabela
// ---------------------------------------------------------------------------

describe('H-4 — saída do modelo sem severity; severidade anexada por TABELA FIXA depois do parse', () => {
  function respostaDoModelo(): z.infer<typeof RevisaoSchema> {
    return {
      artefato: 'm01/a03',
      hash_artefato: 'abc123',
      rodada: 1,
      apontamentos: [apontamentoDoModelo()],
      resumo: 'um achado',
      predicados: cincoPredicadosValidos(),
    };
  }

  it('saída do modelo SEM severity é aceita pelo RevisaoSchema', () => {
    const r = RevisaoSchema.safeParse(respostaDoModelo());
    assert.equal(r.success, true, 'o schema de saída do revisor não tem campo severity');
    if (r.success) {
      assert.ok(!('severity' in r.data.apontamentos[0]), 'nenhum apontamento validado carrega severity');
    }
  });

  it('saída do modelo COM severity é REJEITADA (campo extra em schema strict)', () => {
    const comSeveridade = respostaDoModelo();
    // `apontamentoValido()` é o P-04 INTEIRO (com severity): só o campo extra
    // já tem de derrubar o parse — strict, não strip.
    comSeveridade.apontamentos = [apontamentoValido()];
    const r = RevisaoSchema.safeParse(comSeveridade);
    assert.equal(r.success, false, 'severity é campo extra — nunca vem do modelo (H-4)');
  });

  it('anexarSeveridadePorTabela anexa a severidade da TABELA FIXA em cada apontamento', () => {
    const revisao = RevisaoSchema.parse(respostaDoModelo());
    const anexada = anexarSeveridadePorTabela(revisao);
    assert.equal(anexada.apontamentos[0].severity, 'bloqueante', 'construcao_nao_ensinada → bloqueante (§6.5)');
    assert.equal(anexada.predicados.length, 5, 'predicados passam intactos');
    // O resultado volta ao FORMATO do P-04: valida nos schemas originais (com severity).
    const ap = ApontamentoSchema.safeParse(anexada.apontamentos[0]);
    assert.equal(ap.success, true, 'apontamento anexado continua válido no ApontamentoSchema do P-04');
    if (ap.success) {
      assert.equal(ap.data.severity, 'bloqueante');
    }
  });

  it('anexarSeveridadePorTabela mapeia CADA categoria → linha da tabela', () => {
    const revisao = RevisaoSchema.parse({
      ...respostaDoModelo(),
      apontamentos: [
        apontamentoDoModelo(),
        { ...apontamentoDoModelo(), id: 'APT-0043', categoria: 'estilo' },
        { ...apontamentoDoModelo(), id: 'APT-0044', categoria: 'granularidade' },
      ],
    });
    const anexada = anexarSeveridadePorTabela(revisao);
    assert.equal(anexada.apontamentos[0].severity, 'bloqueante');
    assert.equal(anexada.apontamentos[1].severity, 'sugestao', 'estilo → sugestão');
    assert.equal(anexada.apontamentos[2].severity, 'corrigir', 'granularidade → corrigir (fase de estrutura)');
  });

  it('o prompt instrui explicitamente a NÃO emitir severity e o JSON de exemplo não o traz', () => {
    const prompt = construirPromptRevisor({
      artefatoNormalizado: '## Teoria',
      regras: REGRAS_DO_CATALOGO,
      verificadores: 'ok',
    });
    assert.ok(prompt.includes('NÃO inclua o campo "severity"'), 'instrução explícita de não emitir severity');
    assert.ok(!prompt.includes('"severity":'), 'o JSON de exemplo não contém o campo severity');
    assert.ok(prompt.includes('tabela fixa') || prompt.includes('TABELA FIXA'), 'severidade continua sendo tabela fixa, fora da resposta');
  });
});

// ---------------------------------------------------------------------------
// A-P12-2 (bônus) — assert de roteamento em código (§6.2)
// ---------------------------------------------------------------------------

describe('A-P12-2 — validarRoteamento rejeita autor==revisor e família do revisor nas famílias produtoras', () => {
  const familias: MapaDeFamilias = {
    familiaPorModelo: {
      'deepseek-v4-flash-0731': 'deepseek',
      'deepseek-flash-copy': 'deepseek',
      'claude-sonnet-4': 'anthropic',
    },
    familiasProdutoras: ['deepseek'],
  };

  it('model(AUTOR) === model(REVISOR) é erro, com ou sem mapas', () => {
    assert.throws(() => validarRoteamento('deepseek-v4-flash-0731', 'deepseek-v4-flash-0731'), ErroDeRoteamento);
    assert.throws(() => validarRoteamento('mesmo-modelo', 'mesmo-modelo'), ErroDeRoteamento);
  });

  it('família do REVISOR dentro das famílias PRODUTORAS é erro (a autopreferência se estende à família)', () => {
    assert.throws(() => validarRoteamento('deepseek-v4-flash-0731', 'deepseek-flash-copy', familias), ErroDeRoteamento);
    assert.throws(() => validarRoteamento('deepseek-v4-flash-0731', 'deepseek-flash-copy', familias), /fam[íi]lia/i);
  });

  it('família não verificável no mapa é erro (FAIL-CLOSED: sem família não se prova a restrição 2)', () => {
    assert.throws(() => validarRoteamento('deepseek-v4-flash-0731', 'modelo-desconhecido', familias), ErroDeRoteamento);
    assert.throws(() => validarRoteamento('modelo-desconhecido', 'claude-sonnet-4', familias), ErroDeRoteamento);
  });

  it('roteamento VÁLIDO passa: modelos e famílias distintos', () => {
    assert.doesNotThrow(() => validarRoteamento('deepseek-v4-flash-0731', 'claude-sonnet-4', familias));
    assert.doesNotThrow(() => validarRoteamento('autor-a', 'revisor-b'), 'sem mapas injetados, só a restrição 1 é exigida');
  });

  it('é a mesma regra do §6.2: revisor em família produtora NUNCA revisa, mesmo com modelos diferentes', () => {
    // A armadilha que o assert mata: dois modelos DIFERENTES da MESMA família produtora.
    const msg = (() => {
      try {
        validarRoteamento('deepseek-v4-flash-0731', 'deepseek-flash-copy', familias);
        return '';
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    })();
    assert.match(msg, /famílias produtoras/);
  });
});