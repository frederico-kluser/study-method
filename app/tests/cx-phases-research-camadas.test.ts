/**
 * tests/cx-phases-research-camadas.test.ts — CARACTERIZAÇÃO (golden master) de
 * `engine/research/camadas.ts` (a pesquisa em camadas com procedência).
 *
 * PINA: a validação de config (faixas, fail-closed sem default sorrateiro), o
 * prompt do analisador (ordem leitura→afirmações→lacunas, citação por
 * NÚMERO), o parse/normalização da análise (número→URL, índice desconhecido
 * nomeado), o analisador LLM (reasoningEffort OMITIDO = máximo; transporte
 * que recusa vira ANALISE_INDISPONIVEL) e o orquestrador
 * `criarPesquisaEmCamadas` com executor/analisador FAKES (levantamento,
 * aprofundamento por lacuna, política 143 = troca de ferramenta UMA vez,
 * colheita vazia reprovada no portão, lacunas repetidas descartadas).
 *
 * Sem rede, sem Brave, sem LLM real — tudo injetado.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SCHEMA_PESQUISA_EM_CAMADAS,
  TETO_CAMADAS,
  TETO_EVIDENCIA_PADRAO,
  TETO_LACUNAS_POR_CAMADA,
  criarAnalisadorLlm,
  criarPesquisaEmCamadas,
  extrairJson,
  montarPromptDaAnalise,
  normalizarAnalise,
  validarConfig,
  type AnaliseDaColheita,
  type AnalisadorDeColheita,
  type ConfigDaPesquisa,
  type EntradaDaAnalise,
  type ItemDeEvidencia,
} from '../electron/main/engine/research/camadas';
import { PESQUISA_CODES, PesquisaError } from '../electron/main/engine/research/errors';
import { BIN_SURF, type ContextoDaTrilha } from '../electron/main/engine/research/surfBrief';
import type { ExecutorDeProcesso, SaidaDoProcesso } from '../electron/main/engine/research/surfRunner';
import { DECLARACAO_INSUBSTITUIBILIDADE_REVISAO_HUMANA } from '../electron/main/engine/phases/f1Research';
import type { EngineLlm, LlmCallRequest, LlmCallResult } from '../electron/main/engine/runtime/callLlm';

// ---------------------------------------------------------------------------
// Helpers/fakes
// ---------------------------------------------------------------------------

const URL_A = 'https://exemplo.com/a';
const URL_B = 'https://exemplo.com/b';

function configValida(over: Partial<ConfigDaPesquisa> = {}): ConfigDaPesquisa {
  return {
    camadas: 1,
    subAgents: 3,
    timeoutMsPorCamada: 30_000,
    timeoutMsDaAnalise: 60_000,
    maxDepth: 3,
    maxRounds: 10,
    lacunasPorCamada: 2,
    stageVersion: 'pesquisa-v1',
    ...over,
  };
}

function contextoDaTrilha(over: Partial<ContextoDaTrilha> = {}): ContextoDaTrilha {
  return {
    tema: 'JavaScript do zero',
    linguagem: 'javascript',
    publico: 'quem nunca programou',
    unidade: 'funções',
    objetivo: 'entender declaração e chamada de função',
    jaEnsinado: ['variáveis'],
    ...over,
  };
}

/** Envelope do surf (o JSON que sai com --json) com UMA fonte citável. */
function envelopeComFonte(url: string, titulo: string, query = 'como funções funcionam', trecho = 'trecho da fonte'): string {
  return JSON.stringify({
    operation: 'search',
    mode: 'normal',
    answer: 'síntese',
    synthesized: true,
    rounds: 1,
    waves: 1,
    stop_reason: 'done',
    plan: { restated_objective: 'obj', sub_questions: [], success_criteria: [], queries: [] },
    analysis: null,
    sources: [{ n: 1, url, title: titulo, date: null }],
    ledger: {
      stats: { queries: 1, succeeded: 1, failed: 0, sources: 1, credits: 0 },
      sources: [{ n: 1, url, title: titulo, date: null }],
      rows: [
        {
          round: 1,
          id: 'q1',
          sub: null,
          category: null,
          parent: null,
          depth: 0,
          kind: 'search',
          query,
          ok: true,
          results: [{ n: 1, url, title: titulo, date: null, content: trecho }],
        },
      ],
    },
    diagnostics: { degraded: [] },
    elapsed_ms: 10,
  });
}

const ENVELOPE_VAZIO = JSON.stringify({
  operation: 'search',
  mode: 'normal',
  answer: '',
  synthesized: true,
  rounds: 1,
  waves: 1,
  stop_reason: 'done',
  plan: { restated_objective: '', sub_questions: [], success_criteria: [], queries: [] },
  analysis: null,
  sources: [],
  ledger: {
    stats: { queries: 1, succeeded: 0, failed: 1, sources: 0, credits: 0 },
    sources: [],
    rows: [{ round: 1, id: 'q1', sub: null, category: null, parent: null, depth: 0, kind: 'search', query: 'pergunta sem fruto', ok: false, results: [] }],
  },
  diagnostics: { degraded: [] },
  elapsed_ms: 10,
});

function analise(over: Partial<AnaliseDaColheita> = {}): AnaliseDaColheita {
  return {
    leitura: 'a evidência sustenta o básico.',
    afirmacoes: [{ id: 'a1', texto: 'função é declarada com function.', fontes: [URL_A] }],
    lacunas: [],
    ...over,
  };
}

interface Chamadas {
  bins: string[];
  args: string[][];
  timeouts: number[];
}

function executorFake(saidas: SaidaDoProcesso[]): { exec: ExecutorDeProcesso; chamadas: Chamadas } {
  const chamadas: Chamadas = { bins: [], args: [], timeouts: [] };
  let i = 0;
  const exec: ExecutorDeProcesso = async (bin, args, opcoes) => {
    chamadas.bins.push(bin);
    chamadas.args.push([...args]);
    chamadas.timeouts.push(opcoes.timeoutMs);
    const saida = saidas[i] ?? { code: 0, stdout: ENVELOPE_VAZIO, stderr: '' };
    i += 1;
    if (saida instanceof Error) throw saida;
    return saida;
  };
  return { exec, chamadas };
}

const MORTO_143: SaidaDoProcesso = { code: 143, stdout: '', stderr: 'SIGTERM', mortoPorTimeout: true };

function analisadorFake(respostas: AnaliseDaColheita[]): { analisador: AnalisadorDeColheita; entradas: EntradaDaAnalise[] } {
  const entradas: EntradaDaAnalise[] = [];
  let i = 0;
  const analisador: AnalisadorDeColheita = {
    async analisar(entrada) {
      entradas.push(entrada);
      const r = respostas[i] ?? analise({ afirmacoes: [], lacunas: [] });
      i += 1;
      return r;
    },
  };
  return { analisador, entradas };
}

async function esperaPesquisaError(fn: () => Promise<unknown>): Promise<PesquisaError> {
  let capturado: unknown;
  try {
    await fn();
  } catch (erro) {
    capturado = erro;
  }
  assert.ok(capturado instanceof PesquisaError, `esperado PesquisaError, veio ${String(capturado)}`);
  return capturado;
}

// ---------------------------------------------------------------------------
// 1. Constantes e validação de configuração
// ---------------------------------------------------------------------------

describe('camadas — constantes e validarConfig', () => {
  it('fixa os tetos declarados (4 camadas, 5 lacunas, 40 evidências)', () => {
    assert.equal(SCHEMA_PESQUISA_EM_CAMADAS, 'pesquisa-em-camadas');
    assert.equal(TETO_CAMADAS, 4);
    assert.equal(TETO_LACUNAS_POR_CAMADA, 5);
    assert.equal(TETO_EVIDENCIA_PADRAO, 40);
  });

  it('config válida passa em silêncio', () => {
    validarConfig(configValida());
    validarConfig(configValida({ camadas: TETO_CAMADAS, lacunasPorCamada: TETO_LACUNAS_POR_CAMADA }));
  });

  it('cada campo FORA da faixa é CONFIG_INVALIDA nomeando o campo (fail-closed, sem default)', () => {
    for (const [campo, valor] of [
      ['camadas', 0],
      ['camadas', TETO_CAMADAS + 1],
      ['subAgents', 0],
      ['maxDepth', 7],
      ['maxRounds', 51],
      ['lacunasPorCamada', 0],
      ['timeoutMsPorCamada', 0],
      ['timeoutMsDaAnalise', 1.5],
      ['tetoEvidenciaPorAnalise', 501],
    ] as const) {
      assert.throws(
        () => validarConfig(configValida({ [campo]: valor })),
        (erro: unknown) =>
          erro instanceof PesquisaError &&
          erro.code === PESQUISA_CODES.CONFIG_INVALIDA &&
          new RegExp(`\`${campo}\``).test(erro.message),
        `${campo}=${valor} deveria ser CONFIG_INVALIDA`,
      );
    }
  });

  it('stageVersion vazio e config ausente são CONFIG_INVALIDA', () => {
    assert.throws(
      () => validarConfig(configValida({ stageVersion: '  ' })),
      (erro: unknown) => erro instanceof PesquisaError && /stageVersion/.test(erro.message),
    );
    assert.throws(
      () => validarConfig(null as unknown as ConfigDaPesquisa),
      (erro: unknown) => erro instanceof PesquisaError && /ausente/.test(erro.message),
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Prompt do analisador
// ---------------------------------------------------------------------------

describe('camadas — montarPromptDaAnalise (formato, não profundidade)', () => {
  const entrada: EntradaDaAnalise = {
    ctx: contextoDaTrilha(),
    camada: 2,
    evidencia: [
      { n: 1, url: URL_A, titulo: 'Fonte A', trecho: 'trecho um' },
      { n: 2, url: URL_B, titulo: 'Fonte B', trecho: '' },
    ],
    perguntasJaFeitas: ['como declarar função?'],
  };

  it('pede JSON na ordem leitura→afirmacoes→lacunas (INV-04) e cita fonte por NÚMERO', () => {
    const prompt = montarPromptDaAnalise(entrada, 3);
    const iLeitura = prompt.indexOf('"leitura"');
    const iAfirm = prompt.indexOf('"afirmacoes"');
    const iLacunas = prompt.indexOf('"lacunas"');
    assert.ok(iLeitura >= 0 && iLeitura < iAfirm && iAfirm < iLacunas, 'raciocínio ANTES da decisão');
    assert.match(prompt, /\[1\] Fonte A\n {4}https:\/\/exemplo\.com\/a\n {4}trecho um/);
    assert.match(prompt, /\(a busca não devolveu trecho\)/, 'item sem trecho diz que não tem');
    assert.match(prompt, /número tem que existir na lista acima/);
    assert.match(prompt, /no máximo 3 lacunas/);
  });

  it('embebe o contexto (unidade/tema/linguagem/público/objetivo/já-ensinado) e as perguntas já executadas', () => {
    const prompt = montarPromptDaAnalise(entrada, 5);
    assert.match(prompt, /"funções" da trilha "JavaScript do zero" \(javascript\), para quem nunca programou/);
    assert.match(prompt, /Objetivo da unidade: entender declaração e chamada de função/);
    assert.match(prompt, /O currículo já ensinou: variáveis/);
    assert.match(prompt, /- como declarar função\?/);
    assert.ok(!/pense profundamente|passo a passo/i.test(prompt), 'sem imperativo de profundidade (anti-padrão)');
  });

  it('primeira unidade e colheita vazia usam os textos explícitos de ausência', () => {
    const prompt = montarPromptDaAnalise(
      { ...entrada, ctx: contextoDaTrilha({ jaEnsinado: [] }), evidencia: [], perguntasJaFeitas: [] },
      1,
    );
    assert.match(prompt, /\(nada — primeira unidade\)/);
    assert.match(prompt, /EVIDÊNCIA COLHIDA \(camada 2\)[\s\S]*\(nenhuma\)/);
    assert.match(prompt, /\(nenhuma\)/);
  });
});

// ---------------------------------------------------------------------------
// 3. Parse/normalização da análise
// ---------------------------------------------------------------------------

describe('camadas — extrairJson e normalizarAnalise', () => {
  it('extrai o objeto JSON mesmo cercado de prosa ou de cerca ```', () => {
    assert.deepEqual(extrairJson('{"a":1}'), { a: 1 });
    assert.deepEqual(extrairJson('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(extrairJson('claro! aqui está:\n{"a":1}\nEspero que ajude.'), { a: 1 });
  });

  it('conteúdo sem JSON utilizável devolve null (nunca lança)', () => {
    assert.equal(extrairJson(''), null);
    assert.equal(extrairJson('   '), null);
    assert.equal(extrairJson('sem chave nenhuma'), null);
    assert.equal(extrairJson('{quebrado'), null);
    assert.equal(extrairJson(null as unknown as string), null);
  });

  const evidencia: ItemDeEvidencia[] = [
    { n: 1, url: URL_A, titulo: 'A', trecho: 'x' },
    { n: 2, url: URL_B, titulo: 'B', trecho: 'y' },
  ];

  it('normalizarAnalise mapeia número→URL e NOMEIA índice desconhecido (o portão reprova depois)', () => {
    const n = normalizarAnalise(
      {
        leitura: 'ok',
        afirmacoes: [{ id: 'a1', texto: 'frase', fontes: [1, 2, 9, '2'] }],
        lacunas: [{ id: 'l1', pergunta: 'p?', porque: 'q' }],
      },
      evidencia,
    );
    assert.ok(n);
    assert.equal(n.leitura, 'ok');
    assert.deepEqual(n.afirmacoes[0].fontes, [URL_A, URL_B, 'indice-desconhecido:9', URL_B], 'string numérica também resolve');
    assert.deepEqual(n.lacunas, [{ id: 'l1', pergunta: 'p?', porque: 'q' }]);
  });

  it('ausências viram valores vazios explícitos com ids derivados (a1/l1)', () => {
    const n = normalizarAnalise({ afirmacoes: [{ texto: 'frase' }], lacunas: [{ pergunta: 'p?' }] }, evidencia);
    assert.ok(n);
    assert.equal(n.leitura, '');
    assert.deepEqual(n.afirmacoes, [{ id: 'a1', texto: 'frase', fontes: [] }]);
    assert.deepEqual(n.lacunas, [{ id: 'l1', pergunta: 'p?', porque: '' }]);
  });

  it('formato inválido devolve null (o chamador vira ANALISE_INDISPONIVEL)', () => {
    assert.equal(normalizarAnalise(null, evidencia), null);
    assert.equal(normalizarAnalise([1, 2], evidencia), null);
    assert.equal(normalizarAnalise({ afirmacoes: [] }, evidencia), null);
    assert.equal(normalizarAnalise({ lacunas: [] }, evidencia), null);
  });
});

// ---------------------------------------------------------------------------
// 4. Analisador LLM (transporte único, effort OMITIDO)
// ---------------------------------------------------------------------------

describe('camadas — criarAnalisadorLlm', () => {
  function llmFake(content: string | Error): { llm: EngineLlm; pedidos: { etapa: string; req: LlmCallRequest }[] } {
    const pedidos: { etapa: string; req: LlmCallRequest }[] = [];
    const llm: EngineLlm = {
      async callLlm(etapa, req) {
        pedidos.push({ etapa, req });
        if (content instanceof Error) throw content;
        const resultado: LlmCallResult = {
          content,
          model: 'fake',
          cached: false,
          usage: { promptTokens: 1, completionTokens: 1 },
          stageUsage: { promptTokens: 1, completionTokens: 1, llmCalls: 1, cachedHits: 0, retries: 0 },
          attempts: 1,
          elapsedMs: 1,
        };
        return resultado;
      },
      getStageUsage: () => undefined,
      getAllStageUsage: () => ({}),
    };
    return { llm, pedidos };
  }

  const entrada: EntradaDaAnalise = {
    ctx: contextoDaTrilha(),
    camada: 1,
    evidencia: [{ n: 1, url: URL_A, titulo: 'A', trecho: 'x' }],
    perguntasJaFeitas: [],
  };

  it('uma chamada por análise, temperatura 0, com stageVersion/timeout declarados e SEM reasoningEffort', async () => {
    const { llm, pedidos } = llmFake('{"leitura":"ok","afirmacoes":[{"id":"a1","texto":"f","fontes":[1]}],"lacunas":[]}');
    const analisador = criarAnalisadorLlm({ llm, stageVersion: 'sv-1', timeoutMs: 12_345 });
    const r = await analisador.analisar(entrada);
    assert.deepEqual(r.afirmacoes[0].fontes, [URL_A]);
    assert.equal(pedidos.length, 1);
    assert.equal(pedidos[0].etapa, 'pesquisa-analise-camada-1');
    assert.equal(pedidos[0].req.temperature, 0);
    assert.equal(pedidos[0].req.stageVersion, 'sv-1');
    assert.equal(pedidos[0].req.timeoutMs, 12_345);
    assert.equal('reasoningEffort' in pedidos[0].req, false, 'omitir É pedir o máximo (transporte aplica)');
  });

  it('conteúdo cercado de prosa/cerca parseia; JSON inválido vira ANALISE_INDISPONIVEL', async () => {
    const comProsa = llmFake('resposta:\n```json\n{"leitura":"","afirmacoes":[],"lacunas":[]}\n```');
    const analisador = criarAnalisadorLlm({ llm: comProsa.llm, stageVersion: 'sv', timeoutMs: 1_000 });
    assert.deepEqual((await analisador.analisar(entrada)).lacunas, []);

    const sujo = llmFake('não vou responder com JSON');
    const analisador2 = criarAnalisadorLlm({ llm: sujo.llm, stageVersion: 'sv', timeoutMs: 1_000 });
    const erro = await esperaPesquisaError(() => analisador2.analisar(entrada));
    assert.equal(erro.code, PESQUISA_CODES.ANALISE_INDISPONIVEL);
    assert.match(erro.message, /não voltou como JSON/);
  });

  it('transporte que recusa vira ANALISE_INDISPONIVEL com a causa preservada (fail-closed)', async () => {
    const { llm } = llmFake(new Error('transporte caiu'));
    const analisador = criarAnalisadorLlm({ llm, stageVersion: 'sv', timeoutMs: 1_000 });
    const erro = await esperaPesquisaError(() => analisador.analisar(entrada));
    assert.equal(erro.code, PESQUISA_CODES.ANALISE_INDISPONIVEL);
    assert.match(erro.message, /nenhuma afirmação é inventada/);
    assert.ok(erro.cause instanceof Error);
    assert.equal(erro.etapa, 'pesquisa-analise-camada-1');
  });
});

// ---------------------------------------------------------------------------
// 5. Orquestrador — levantamento, aprofundamento, 143 e portão
// ---------------------------------------------------------------------------

describe('camadas — criarPesquisaEmCamadas (orquestração)', () => {
  it('executor/analisador ausentes são CONFIG_INVALIDA antes de qualquer trabalho', () => {
    const { analisador } = analisadorFake([]);
    assert.throws(
      () => criarPesquisaEmCamadas({ executor: undefined as unknown as ExecutorDeProcesso, analisador, config: configValida() }),
      (erro: unknown) => erro instanceof PesquisaError && erro.code === PESQUISA_CODES.CONFIG_INVALIDA,
    );
    const { exec } = executorFake([]);
    assert.throws(
      () => criarPesquisaEmCamadas({ executor: exec, analisador: {} as AnalisadorDeColheita, config: configValida() }),
      (erro: unknown) => erro instanceof PesquisaError && erro.code === PESQUISA_CODES.CONFIG_INVALIDA,
    );
  });

  it('levantamento (camada 1, surf-search-normal): relatório, fontes aprovadas, declaração humana no artefato', async () => {
    const { exec, chamadas } = executorFake([{ code: 0, stdout: envelopeComFonte(URL_A, 'Fonte A'), stderr: '' }]);
    const { analisador, entradas } = analisadorFake([analise()]);
    const pesquisa = criarPesquisaEmCamadas({ executor: exec, analisador, config: configValida() });
    const r = await pesquisa.executar(contextoDaTrilha());

    assert.equal(r.schema, SCHEMA_PESQUISA_EM_CAMADAS);
    assert.equal(r.declaracao, DECLARACAO_INSUBSTITUIBILIDADE_REVISAO_HUMANA);
    assert.equal(r.chamadasAoSurf, 1);
    assert.equal(r.camadas.length, 1);
    const c1 = r.camadas[0];
    assert.equal(c1.camada, 1);
    assert.equal(c1.tipo, 'levantamento');
    assert.equal(c1.ferramenta, 'normal');
    assert.equal(c1.exitCode, 0);
    assert.equal(c1.vazia, false);
    assert.deepEqual(c1.queries, ['como funções funcionam']);
    assert.equal(c1.fontes[0].link.url, URL_A);
    assert.deepEqual(r.fontes, [{ title: 'Fonte A', url: URL_A, description: 'trecho da fonte' }]);
    assert.equal(r.gate.aprovado, true);
    assert.deepEqual(r.afirmacoes, analise().afirmacoes);
    assert.equal(r.lacunasAbertas.length, 0);

    // O executor real do surf recebe o binário normal e o envelope (--json).
    assert.deepEqual(chamadas.bins, [BIN_SURF.normal]);
    assert.ok(chamadas.args[0].includes('--json'));
    assert.deepEqual(chamadas.timeouts, [30_000]);
    assert.equal(entradas[0].camada, 1);
  });

  it('camadas ≥2 aprofundam UMA lacuna por vez no surf-search-unlimit, com lacunaId no relatório', async () => {
    const { exec, chamadas } = executorFake([
      { code: 0, stdout: envelopeComFonte(URL_A, 'Fonte A', 'pergunta ampla'), stderr: '' },
      { code: 0, stdout: envelopeComFonte(URL_B, 'Fonte B', 'pergunta estreita'), stderr: '' },
    ]);
    const { analisador } = analisadorFake([
      analise({ lacunas: [{ id: 'l1', pergunta: 'o que é closure?', porque: 'importa para funções' }] }),
      analise({ afirmacoes: [{ id: 'a2', texto: 'closure captura escopo.', fontes: [URL_A] }], lacunas: [] }),
    ]);
    const pesquisa = criarPesquisaEmCamadas({
      executor: exec,
      analisador,
      config: configValida({ camadas: 2, lacunasPorCamada: 1 }),
    });
    const r = await pesquisa.executar(contextoDaTrilha());

    assert.equal(r.camadas.length, 2);
    assert.equal(r.camadas[1].camada, 2);
    assert.equal(r.camadas[1].tipo, 'aprofundamento');
    assert.equal(r.camadas[1].ferramenta, 'unlimit');
    assert.equal(r.camadas[1].lacunaId, 'l1');
    assert.deepEqual(chamadas.bins, [BIN_SURF.normal, BIN_SURF.unlimit]);
    assert.equal(r.chamadasAoSurf, 2);
    assert.deepEqual(r.fontes.map((f) => f.url).sort(), [URL_A, URL_B].sort(), 'fontes consolidadas das DUAS camadas');
    // a análise FINAL (camada 2) é a que vale como afirmação da unidade.
    assert.deepEqual(r.afirmacoes.map((a) => a.id), ['a2']);
  });

  it('política 143: unlimit morto por timeout é REFEITO uma vez com o normal (troca de ferramenta, não retry)', async () => {
    const { exec, chamadas } = executorFake([
      { code: 0, stdout: envelopeComFonte(URL_A, 'Fonte A'), stderr: '' },
      MORTO_143,
      { code: 0, stdout: envelopeComFonte(URL_B, 'Fonte B', 'pergunta estreita'), stderr: '' },
    ]);
    const { analisador } = analisadorFake([
      analise({ lacunas: [{ id: 'l1', pergunta: 'o que é closure?', porque: 'importa' }] }),
      analise({ afirmacoes: [{ id: 'a2', texto: 'closure.', fontes: [URL_A] }] }),
    ]);
    const pesquisa = criarPesquisaEmCamadas({ executor: exec, analisador, config: configValida({ camadas: 2 }) });
    const r = await pesquisa.executar(contextoDaTrilha());

    assert.deepEqual(chamadas.bins, [BIN_SURF.normal, BIN_SURF.unlimit, BIN_SURF.normal], 'sem espera entre as duas chamadas');
    assert.equal(r.chamadasAoSurf, 3, 'a refeita conta como chamada');
    assert.equal(r.camadas.length, 2);
    assert.equal(r.camadas[1].ferramenta, 'normal', 'a camada rebaixada reporta a ferramenta REAL');
    assert.equal(r.camadas[1].rebaixadaParaNormal, true);
  });

  it('o 143 rebaixa UMA única vez: o normal morto de novo propaga o erro (sem terceira tentativa)', async () => {
    const { exec, chamadas } = executorFake([
      { code: 0, stdout: envelopeComFonte(URL_A, 'Fonte A'), stderr: '' },
      MORTO_143,
      MORTO_143,
    ]);
    const { analisador } = analisadorFake([
      analise({ lacunas: [{ id: 'l1', pergunta: 'o que é closure?', porque: 'importa' }] }),
      analise(),
    ]);
    const pesquisa = criarPesquisaEmCamadas({ executor: exec, analisador, config: configValida({ camadas: 2 }) });
    const erro = await esperaPesquisaError(() => pesquisa.executar(contextoDaTrilha()));
    assert.equal(erro.code, PESQUISA_CODES.SURF_MORTO_POR_TIMEOUT);
    assert.deepEqual(chamadas.bins, [BIN_SURF.normal, BIN_SURF.unlimit, BIN_SURF.normal], 'a troca de ferramenta acontece UMA vez; nunca vira retry');
  });

  it('colheita vazia é REGISTRADA (vazia: true) e REPROVADA no portão — nunca material sem fonte', async () => {
    const { exec } = executorFake([{ code: 1, stdout: ENVELOPE_VAZIO, stderr: '' }]);
    const { analisador } = analisadorFake([analise({ afirmacoes: [], lacunas: [] })]);
    const pesquisa = criarPesquisaEmCamadas({ executor: exec, analisador, config: configValida() });
    const erro = await esperaPesquisaError(() => pesquisa.executar(contextoDaTrilha()));
    assert.equal(erro.code, PESQUISA_CODES.GATE_REPROVADO);
    assert.match(erro.message, /portão de qualidade reprovou/);
  });

  it('análise indisponível (analisador lança) vira ANALISE_INDISPONIVEL com etapa nomeada', async () => {
    const { exec } = executorFake([{ code: 0, stdout: envelopeComFonte(URL_A, 'Fonte A'), stderr: '' }]);
    const analisador: AnalisadorDeColheita = {
      async analisar() {
        throw new TypeError('analisador explodiu');
      },
    };
    const pesquisa = criarPesquisaEmCamadas({ executor: exec, analisador, config: configValida() });
    const erro = await esperaPesquisaError(() => pesquisa.executar(contextoDaTrilha()));
    assert.equal(erro.code, PESQUISA_CODES.ANALISE_INDISPONIVEL);
    assert.equal(erro.etapa, 'analise-camada-1');
  });

  it('lacuna cuja pergunta JÁ foi executada é descartada — a camada 2 não vira a camada 1 de novo', async () => {
    const { exec, chamadas } = executorFake([{ code: 0, stdout: envelopeComFonte(URL_A, 'Fonte A', 'o que é closure?'), stderr: '' }]);
    const { analisador } = analisadorFake([
      analise({ lacunas: [{ id: 'l1', pergunta: 'o que é closure?', porque: 'repetida' }] }),
    ]);
    const pesquisa = criarPesquisaEmCamadas({ executor: exec, analisador, config: configValida({ camadas: 2 }) });
    const r = await pesquisa.executar(contextoDaTrilha());
    assert.equal(r.camadas.length, 1, 'nenhum aprofundamento roda sobre pergunta já executada');
    assert.equal(chamadas.bins.length, 1);
  });

  it('contexto incompleto é CONTEXTO_INVALIDO antes de qualquer chamada', async () => {
    const { exec, chamadas } = executorFake([]);
    const { analisador } = analisadorFake([]);
    const pesquisa = criarPesquisaEmCamadas({ executor: exec, analisador, config: configValida() });
    const erro = await esperaPesquisaError(() => pesquisa.executar(contextoDaTrilha({ objetivo: ' ' })));
    assert.equal(erro.code, PESQUISA_CODES.CONTEXTO_INVALIDO);
    assert.equal(chamadas.bins.length, 0);
  });
});
