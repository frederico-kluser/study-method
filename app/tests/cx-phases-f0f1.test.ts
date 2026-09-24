/**
 * tests/cx-phases-f0f1.test.ts — CARACTERIZAÇÃO (golden master) das fases
 * F0 (`phases/f0Brief.ts`) e F1 (`phases/f1Research.ts`).
 *
 * PINA: os códigos de erro estruturado das duas fases, o gate ÚNICO do brief
 * (política obrigatória/rejeitada, schema FECHADO recursivo, axioma vs
 * vocabulário), o parser de draft da LLM, o vocabulário (carregar/validar/
 * sugestões determinísticas), o contrato da chamada `f0-brief` (etapa/
 * stageVersion/timeout/maxTokens/prompt com as REGRAS DURAS) e as regras da
 * F1: teto de tokens (INV-06: rejeitar, nunca truncar), referências/âncoras de
 * spec, normalizadores com teto de 12 e o gate G-COVER-PESQ.
 *
 * Sem rede, sem chave, sem LLM real (callLlm FAKE).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { z } from 'zod';

import {
  CAMINHO_ATOMOS_DEFAULT,
  EIXOS_FECHADOS_ATOMOS,
  ETAPA_BRIEF,
  FaseF0Error,
  MAX_TOKENS_BRIEF,
  POLITICA_HARNESS_DECIDIDA,
  POLITICAS_HARNESS_DO_SCHEMA,
  POLITICAS_HARNESS_REJEITADAS,
  STAGE_VERSION_BRIEF,
  TIMEOUT_BRIEF_MS,
  carregarAtomos,
  chavesDoVocabulario,
  gerarBrief,
  parsearDraftLlm,
  rejeitarCamposExtras,
  schemaBriefParaLlm,
  sugestoesPorPrefixo,
  validarBrief,
  validarEstruturaAtomos,
  type AtomosJson,
} from '../electron/main/engine/phases/f0Brief';
import type { EngineLlm, LlmCallResult, LlmCallRequest } from '../electron/main/engine/runtime/callLlm';
import {
  DECLARACAO_INSUBSTITUIBILIDADE_REVISAO_HUMANA,
  SCHEMA_F1,
  TETO_PADRAO_TOKENS_POR_RETORNO,
  ancoraNaSpecValida,
  eReferenciaURL,
  eReferenciaValida,
  estimarTokens,
  gCoverPesq,
  normalizarConcepcoesPlanejadas,
  normalizarConstrucoesPlanejadas,
  rejeitarAcimaDoTeto,
  validarConcepcaoPlanejada,
  validarConstrucaoPlanejada,
  validarConfig,
  validarEntrada,
  validarUrlAchado,
  type F1Config,
  type RelatorioSubPesquisa,
} from '../electron/main/engine/phases/f1Research';

// ---------------------------------------------------------------------------
// Fakes/helpers
// ---------------------------------------------------------------------------

function atomosFake(): AtomosJson {
  return {
    schema: 1,
    node_version: 'v0-teste',
    typescript_version: '5-teste',
    axes: {
      node: ['node:Block', 'node:CallExpression'],
      op: ['op:binary:===', 'op:binary:+'],
      decl: ['decl:let', 'decl:const', 'decl:var'],
      global: ['global:console'],
      api: ['api:Array.prototype.push', 'api:node:test'],
    },
    total: 10,
  };
}

function briefValido(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tema: 'JavaScript do zero',
    objetivo_geral: 'escrever programas simples que rodam',
    publico_alvo: 'pessoas sem contato com programação',
    criterios_de_entrada: ['decl:let'],
    construcoes_alvo: ['op:binary:===', 'api:Array.prototype.push'],
    politica_de_harness: 'receptive-seed',
    restricoes: [],
    justificativa: 'todo começo precisa de um mapa',
    aprovado: false,
    ...over,
  };
}

function transportFake(conteudo: string): { callLlm: EngineLlm['callLlm']; pedidos: { etapa: string; req: LlmCallRequest }[] } {
  const pedidos: { etapa: string; req: LlmCallRequest }[] = [];
  const callLlm: EngineLlm['callLlm'] = async (etapa, req) => {
    pedidos.push({ etapa, req });
    const resultado: LlmCallResult = {
      content: conteudo,
      model: 'fake',
      cached: false,
      usage: { promptTokens: 12, completionTokens: 6 },
      stageUsage: { promptTokens: 12, completionTokens: 6, llmCalls: 1, cachedHits: 0, retries: 0 },
      attempts: 1,
      elapsedMs: 1,
    };
    return resultado;
  };
  return { callLlm, pedidos };
}

// ---------------------------------------------------------------------------
// 1. F0 — constantes, erros e parser de draft
// ---------------------------------------------------------------------------

describe('F0-brief — constantes e erro estruturado', () => {
  it('fixa etapa/versões/timeouts da fase e a decisão de produto D1', () => {
    assert.equal(ETAPA_BRIEF, 'f0-brief');
    assert.equal(STAGE_VERSION_BRIEF, '1.0.0');
    assert.equal(TIMEOUT_BRIEF_MS, 60_000);
    assert.equal(MAX_TOKENS_BRIEF, 2_000);
    assert.deepEqual([...POLITICAS_HARNESS_DO_SCHEMA], ['receptive-seed', 'aula-zero', 'wrapper-gerado']);
    assert.equal(POLITICA_HARNESS_DECIDIDA, 'receptive-seed');
    assert.ok(POLITICAS_HARNESS_REJEITADAS.includes('none'), '"none" é valor de orçamento, não de produto');
    assert.deepEqual([...EIXOS_FECHADOS_ATOMOS], ['node', 'op', 'decl', 'global']);
  });

  it('parsearDraftLlm: aceita JSON puro ou cercado de cerca; não-JSON é FaseF0Error nomeando a etapa', () => {
    assert.deepEqual(parsearDraftLlm('{"a":1}', 'f0-brief', 'BRIEF_DRAFT_NAO_JSON'), { a: 1 });
    assert.deepEqual(parsearDraftLlm('```json\n{"a":1}\n```', 'f0-brief', 'BRIEF_DRAFT_NAO_JSON'), { a: 1 });
    assert.throws(
      () => parsearDraftLlm('não é json', 'f0-brief', 'BRIEF_DRAFT_NAO_JSON'),
      (erro: unknown) =>
        erro instanceof FaseF0Error &&
        erro.code === 'BRIEF_DRAFT_NAO_JSON' &&
        /etapa f0-brief/.test(erro.message) &&
        typeof erro.detalhes?.causa === 'string',
    );
  });

  it('rejeitarCamposExtras é RECURSIVO: o campo do erro é o caminho completo + nota D2 em nome de teto', () => {
    assert.doesNotThrow(() => rejeitarCamposExtras({ tema: 'x' }, { tema: z.string() }, 'BRIEF_CAMPO_DESCONHECIDO', 'brief'));
    assert.throws(
      () => rejeitarCamposExtras({ tema: 'x', teto_de_aulas: 10 }, { tema: z.string() }, 'BRIEF_CAMPO_DESCONHECIDO', 'brief'),
      (erro: unknown) =>
        erro instanceof FaseF0Error &&
        erro.code === 'BRIEF_CAMPO_DESCONHECIDO' &&
        erro.campo === 'teto_de_aulas' &&
        /contagem\/teto de aulas é SAÍDA da geração/.test(erro.message),
    );
    assert.throws(
      () =>
        rejeitarCamposExtras(
          { componentes: [{ nome: 'pilha', teto_de_aulas: 3 }] },
          { componentes: z.array(z.object({ nome: z.string() })) },
          'NOTIONAL_CAMPO_DESCONHECIDO',
          'máquina',
        ),
      (erro: unknown) =>
        erro instanceof FaseF0Error &&
        erro.campo === 'componentes[0].teto_de_aulas',
    );
  });

  it('validarEstruturaAtomos: schema 1 + versões + 5 eixos de strings + total (fail-closed com a origem citada)', () => {
    assert.deepEqual(validarEstruturaAtomos(atomosFake(), 'fake'), atomosFake());
    for (const ruim of [
      null,
      [],
      { ...atomosFake(), schema: 2 },
      { ...atomosFake(), node_version: undefined },
      { ...atomosFake(), axes: undefined },
      { ...atomosFake(), axes: { ...atomosFake().axes, op: 'não-lista' } },
      { ...atomosFake(), total: -1 },
    ]) {
      assert.throws(
        () => validarEstruturaAtomos(ruim, 'origem-x'),
        (erro: unknown) => erro instanceof FaseF0Error && erro.code === 'VOCAB_ATOMOS_INVALIDO' && /origem-x/.test(erro.message),
      );
    }
  });

  it('carregarAtomos: o atoms.json REAL do disco carrega; caminho inexistente é erro nomeando o arquivo', () => {
    const atomos = carregarAtomos();
    assert.equal(atomos.schema, 1);
    assert.ok(chavesDoVocabulario(atomos).size > 0);
    assert.ok(CAMINHO_ATOMOS_DEFAULT.endsWith(path.join('engine', 'vocab', 'atoms.json')));
    assert.throws(
      () => carregarAtomos('/nao/existe/atoms.json'),
      (erro: unknown) => erro instanceof FaseF0Error && erro.code === 'VOCAB_ATOMOS_INVALIDO' && /\/nao\/existe\/atoms\.json/.test(erro.message),
    );
  });

  it('chavesDoVocabulario é a união dos 5 eixos; sugestoesPorPrefixo é determinística (top-3, sem prefixo = vazio)', () => {
    const chaves = chavesDoVocabulario(atomosFake());
    assert.equal(chaves.size, 10);
    assert.ok(chaves.has('api:node:test'));
    assert.deepEqual(sugestoesPorPrefixo('decl:lete', chaves), ['decl:let', 'decl:const', 'decl:var']);
    assert.deepEqual(sugestoesPorPrefixo('criterio-inventado', chaves), [], 'sem prefixo comum: "nenhuma sugestão"');
  });
});

describe('F0-brief — o gate ÚNICO do brief (validarBrief)', () => {
  it('draft válido passa e sai tipado; política AUSENTE ou REJEITADA tem erro DEDICADO (nunca default)', () => {
    const brief = validarBrief(briefValido(), atomosFake());
    assert.equal(brief.politica_de_harness, 'receptive-seed');

    const semPolitica = briefValido();
    delete semPolitica.politica_de_harness;
    assert.throws(
      () => validarBrief(semPolitica, atomosFake()),
      (erro: unknown) => erro instanceof FaseF0Error && erro.code === 'POLITICA_HARNESS_AUSENTE' && erro.campo === 'politica_de_harness',
    );
    assert.throws(
      () => validarBrief(briefValido({ politica_de_harness: 'none' }), atomosFake()),
      (erro: unknown) => erro instanceof FaseF0Error && erro.code === 'POLITICA_HARNESS_REJEITADA',
    );
  });

  it('não-objeto, campo extra e campo obrigatório vazio são erros específicos, nesta ordem de cheques', () => {
    assert.throws(() => validarBrief([], atomosFake()), (erro: unknown) => erro instanceof FaseF0Error && erro.code === 'BRIEF_SCHEMA_INVALIDO');
    assert.throws(
      () => validarBrief(briefValido({ extra: 1 }), atomosFake()),
      (erro: unknown) => erro instanceof FaseF0Error && erro.code === 'BRIEF_CAMPO_DESCONHECIDO',
    );
    assert.throws(
      () => validarBrief(briefValido({ tema: '' }), atomosFake()),
      (erro: unknown) =>
        erro instanceof FaseF0Error &&
        erro.code === 'BRIEF_SCHEMA_INVALIDO' &&
        /tema/.test(erro.message),
      'o motivo nomeia o campo na mensagem (formatarErroCampos)',
    );
  });

  it('axioma: eixo FECHADO por pertença estrita; api: aberto por FORMATO; form:/term: por formato', () => {
    // api: fora do vocabulário mas bem-formada é ACEITA (universo aberto).
    const comApiAberta = validarBrief(briefValido({ construcoes_alvo: ['api:Buffer.from'] }), atomosFake());
    assert.deepEqual(comApiAberta.construcoes_alvo, ['api:Buffer.from']);
    assert.ok(validarBrief(briefValido({ construcoes_alvo: ['form:IfStatement[alternate=null]'] }), atomosFake()));
    assert.throws(
      () => validarBrief(briefValido({ criterios_de_entrada: ['decl:lete'] }), atomosFake()),
      (erro: unknown) => erro instanceof FaseF0Error && erro.code === 'AXIOMA_CONSTRUCAO_INEXISTENTE' && erro.campo === 'criterios_de_entrada',
    );
  });
});

describe('F0-brief — gerarBrief (o contrato da chamada f0-brief)', () => {
  it('o pedido ao transporte carrega etapa/versão/timeout/maxTokens e o prompt com as REGRAS DURAS', async () => {
    const { callLlm, pedidos } = transportFake(JSON.stringify(briefValido()));
    const { brief, llm } = await gerarBrief({ callLlm, assunto: 'javascript do zero', atomos: atomosFake() });
    assert.equal(brief.tema, 'JavaScript do zero');
    assert.equal(llm.stageUsage.llmCalls, 1);
    assert.equal(pedidos.length, 1);
    assert.equal(pedidos[0].etapa, ETAPA_BRIEF);
    const req = pedidos[0].req;
    assert.equal(req.stageVersion, STAGE_VERSION_BRIEF);
    assert.equal(req.timeoutMs, TIMEOUT_BRIEF_MS);
    assert.equal(req.maxTokens, MAX_TOKENS_BRIEF);
    assert.equal(req.schema, schemaBriefParaLlm());
    assert.match(req.prompt, /NÃO existe teto nem contagem de aulas/);
    assert.match(req.prompt, /politica_de_harness é OBRIGATÓRIA/);
    assert.match(req.prompt, /"receptive-seed"/);
    const schema = schemaBriefParaLlm();
    for (const campo of ['tema', 'objetivo_geral', 'publico_alvo', 'criterios_de_entrada', 'construcoes_alvo', 'politica_de_harness', 'restricoes', 'justificativa', 'aprovado']) {
      assert.ok(schema.includes(campo), `o schema da LLM declara ${campo}`);
    }
  });

  it('falha da LLM propaga o erro do transporte; draft inválido vira FaseF0Error (fail-closed)', async () => {
    const { callLlm: bom } = transportFake('não é json');
    await assert.rejects(
      gerarBrief({ callLlm: bom, assunto: 'x', atomos: atomosFake() }),
      (erro: unknown) => erro instanceof FaseF0Error && erro.code === 'BRIEF_DRAFT_NAO_JSON',
    );
    const quebrado: EngineLlm['callLlm'] = async () => {
      throw new Error('transporte caiu');
    };
    await assert.rejects(gerarBrief({ callLlm: quebrado, assunto: 'x', atomos: atomosFake() }), /transporte caiu/);
  });
});

// ---------------------------------------------------------------------------
// 2. F1 — teto de tokens, referências, normalizadores, gates
// ---------------------------------------------------------------------------

describe('F1-pesquisa — teto de tokens (INV-06: rejeitar, nunca truncar)', () => {
  it('estimarTokens ≈ 4 caracteres/token; rejeitarAcimaDoTeto é limiar EXCLUSIVO', () => {
    assert.equal(estimarTokens('abcd'), 1);
    assert.equal(estimarTokens('abcde'), 2, 'ceil — meio token é token');
    assert.equal(estimarTokens(''), 0);
    assert.equal(rejeitarAcimaDoTeto('a'.repeat(8_000), TETO_PADRAO_TOKENS_POR_RETORNO), false, 'exatamente o teto passa');
    assert.equal(rejeitarAcimaDoTeto('a'.repeat(8_001), TETO_PADRAO_TOKENS_POR_RETORNO), true);
    assert.equal(TETO_PADRAO_TOKENS_POR_RETORNO, 2000);
    assert.equal(SCHEMA_F1, 'f1-pesquisa');
    assert.match(DECLARACAO_INSUBSTITUIBILIDADE_REVISAO_HUMANA, /humana/i, 'a declaração viaja dentro do artefato');
  });
});

describe('F1-pesquisa — referências e âncoras de spec', () => {
  it('URL resolvível = http/https com host; "apenas texto" não é referência', () => {
    assert.equal(eReferenciaURL('https://developer.mozilla.org/x'), true);
    assert.equal(eReferenciaURL('http://exemplo.com'), true);
    for (const ruim of ['', 'apenas texto', 'ftp://x.com', 'https://', 42 as unknown as string]) {
      assert.equal(eReferenciaURL(ruim), false, JSON.stringify(ruim));
    }
  });

  it('âncora na spec: URL OU referência de especificação nomeada (ECMA-262/MDN/WHATWG/W3C/TC39/Node.js)', () => {
    for (const boa of ['ECMA-262 §14.3', 'MDN: destructuring', 'WHATWG URL spec', 'W3C CSS', 'TC39 proposal-x', 'Node.js docs', 'https://x.com/a']) {
      assert.equal(ancoraNaSpecValida(boa), true, boa);
    }
    for (const ruim of ['', '  ', 'apenas texto comum']) {
      assert.equal(ancoraNaSpecValida(ruim), false);
    }
    assert.equal(eReferenciaValida('ECMA-262'), true, 'a referência de sustentação usa a MESMA régua');
  });

  it('validarUrlAchado distingue vazia de não-resolvível (null = ok, nunca lança)', () => {
    assert.equal(validarUrlAchado('https://x.com'), null);
    assert.equal(validarUrlAchado(''), 'URL vazia');
    assert.equal(validarUrlAchado('  '), 'URL vazia');
    assert.equal(validarUrlAchado('texto solto'), 'URL não resolvível (inválida ou apenas texto)');
    assert.equal(validarUrlAchado(7), 'URL vazia');
  });

  it('candidatura/concepção: sem citação/âncora não entra (motivo nomeado)', () => {
    const boa = { id: 'c1', nome: 'desestruturamento', tipo: 'construcao' as const, fonte: 'MDN: destructuring' };
    assert.equal(validarConstrucaoPlanejada(boa), null);
    assert.equal(validarConstrucaoPlanejada({ ...boa, id: '' }), 'id ausente');
    assert.equal(validarConstrucaoPlanejada({ ...boa, nome: ' ' }), 'nome ausente');
    assert.match(validarConstrucaoPlanejada({ ...boa, tipo: 'outro' as never }) ?? '', /^tipo inválido/);
    assert.match(validarConstrucaoPlanejada({ ...boa, fonte: 'texto comum' }) ?? '', /fonte ausente ou sem referência/);

    const concepcao = { id: 'm1', descricao: 'confunde = com ==', ancoraNaSpec: 'ECMA-262 §12' };
    assert.equal(validarConcepcaoPlanejada(concepcao), null);
    assert.match(validarConcepcaoPlanejada({ ...concepcao, ancoraNaSpec: 'achismo' }) ?? '', /ancoraNaSpec ausente ou sem referência/);
    assert.equal(validarConcepcaoPlanejada({ ...concepcao, descricao: '' }), 'descrição ausente');
  });
});

describe('F1-pesquisa — normalizadores (teto 12) e G-COVER-PESQ', () => {
  it('normalizar* coagem o cru: descartam fora do shape, cortam em 12, aparam/limitam textos', () => {
    const cru = [
      { id: ' c1 ', nome: ' nome ', tipo: 'construcao', fonte: ' MDN:x ' },
      { id: 'api-1', nome: 'push', tipo: 'api', fonte: 'MDN:y' },
      { id: 'ruim', nome: 'sem fonte' },
      'não-objeto',
      { id: 'tipo', nome: 'x', tipo: 'linguagem', fonte: 'MDN:z' },
    ];
    const construcoes = normalizarConstrucoesPlanejadas(cru);
    assert.equal(construcoes.length, 2);
    assert.deepEqual(construcoes[0], { id: 'c1', nome: 'nome', tipo: 'construcao', fonte: 'MDN:x' });
    assert.equal(construcoes[1].tipo, 'api');

    const muitos = Array.from({ length: 15 }, (_, i) => ({ id: `c${i}`, nome: `n${i}`, tipo: 'construcao', fonte: 'MDN' }));
    assert.equal(normalizarConstrucoesPlanejadas(muitos).length, 12, 'teto de 12 por plano');
    assert.deepEqual(normalizarConstrucoesPlanejadas('não-array'), []);

    const concepcoes = normalizarConcepcoesPlanejadas([
      { id: 'm1', descricao: ' d ', ancoraNaSpec: 'ECMA-262' },
      { id: 'm2', descricao: 'sem âncora' },
    ]);
    assert.deepEqual(concepcoes, [{ id: 'm1', descricao: 'd', ancoraNaSpec: 'ECMA-262' }]);
  });

  it('G-COVER-PESQ: aprovado só com achado identificado (id/url/data) em todo subtópico; lacunas declaradas', () => {
    const completo: RelatorioSubPesquisa[] = [
      {
        subTopicoId: 's1',
        achados: [{ id: 'a1', url: 'https://x.com', dataDeColeta: '2026-01-01', titulo: 'X' }],
      },
    ] as unknown as RelatorioSubPesquisa[];
    assert.deepEqual(gCoverPesq(completo), { aprovado: true, subtopicosSemFonte: [], achadosSemIdentidade: [] });

    const comFuros: RelatorioSubPesquisa[] = [
      { subTopicoId: 's1', achados: [] },
      { subTopicoId: 's2', achados: [{ id: 'a1', url: '', dataDeColeta: '' }] },
    ] as unknown as RelatorioSubPesquisa[];
    const v = gCoverPesq(comFuros);
    assert.equal(v.aprovado, false);
    assert.deepEqual(v.subtopicosSemFonte, ['s1']);
    assert.deepEqual(v.achadosSemIdentidade, [{ subTopicoId: 's2', achadoId: 'a1', faltam: ['url', 'dataDeColeta'] }]);
  });

  it('config/entrada: TODOS os parâmetros obrigatórios — problemas "campo: motivo", nunca exceção', () => {
    assert.deepEqual(validarConfig({
      concorrenciaDeAssuntos: 2,
      atrasoEntreLotesMs: 0,
      atrasoSobRateLimitMs: 500,
      tetoTokensPorRetorno: 2000,
      tetoAchadosPorSubTopico: 10,
      tetoQueriesPorSubTopico: 5,
      stageVersion: 'f1-v1',
      timeoutMs: 30_000,
    } as F1Config), []);
    const problemas = validarConfig({
      concorrenciaDeAssuntos: 0,
      atrasoEntreLotesMs: -1,
      atrasoSobRateLimitMs: -1,
      tetoTokensPorRetorno: 0,
      tetoAchadosPorSubTopico: 0,
      tetoQueriesPorSubTopico: 0,
      stageVersion: ' ',
      timeoutMs: 0,
    } as F1Config);
    assert.equal(problemas.length, 8, 'um problema por parâmetro obrigatório');
    assert.ok(problemas.some((p) => p.startsWith('"concorrenciaDeAssuntos":')));
    assert.deepEqual(validarConfig(undefined as unknown as F1Config), ['config ausente']);

    assert.deepEqual(validarEntrada({ tema: 'x', subtopicos: ['a'] }), []);
    const entradaRuim = validarEntrada({ tema: ' ', subtopicos: [''] });
    assert.ok(entradaRuim.includes('"tema": não pode ser vazio'));
    assert.ok(entradaRuim.includes('"subtopicos": contém item vazio'));
    assert.deepEqual(validarEntrada({ tema: 'x', subtopicos: [] }), ['"subtopicos": precisa ter ao menos 1 sub-assunto']);
    assert.deepEqual(validarEntrada(null as unknown as never), ['entrada ausente']);
  });
});
