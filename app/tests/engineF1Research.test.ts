/**
 * tests/engineF1Research.test.ts — a fase F1 da engine de trilhas (pacote
 * P-14, `docs/16-engine-de-trilha.md` §4.1/§4.2): pesquisa profunda paralela
 * por SUB-ASSUNTO.
 *
 * Os contratos que mordem aqui:
 *   - A-P14-1: SEM chave de busca a fase ABORTA com erro estruturado e NÃO
 *     degrada em silêncio (nunca usa busca keyless como default); chave
 *     inválida e bug de prompt (BAD_REQUEST) também ABORTAM, nomeando a etapa;
 *   - A-P14-3: 429 numa sub-pesquisa NÃO derruba as outras — cada sub-pesquisa
 *     é isolada, a falha fica REGISTRADA no relatório e o run continua; o
 *     artefato emite a nota literal "pesquisa errada produz trilha errada …";
 *   - achado sem URL resolvível (~apenas texto) é REJEITADO, nunca silencioso;
 *   - INV-06: retorno de agente acima do teto de tokens é REJEITADO, nunca
 *     truncado (`rejeitarAcimaDoTeto` pura);
 *   - G-COVER-PESQ: reprova subtópico sem nenhuma fonte (e achado sem
 *     id/URL/data);
 *   - bônus: o inventário de concepções alternativas EXIGE âncora na spec
 *     (ECMA-262/MDN/WHATWG/W3C/URL);
 *   - A-P14-2: a busca é INJETADA — a suíte usa FAKE, roda OFFLINE (sem rede,
 *     sem chave, sem processo);
 *   - `criarBuscaPlanejada`: o atraso sob rate limit (`delayMsOnRateLimit`)
 *     é repassado à multiSearch em TODA chamada (retry de 429 = código vivo);
 *     KEY_MISSING nunca degrada para a heurística; BAD_REQUEST vira erro
 *     estruturado nomeando a etapa — no shape do `LlmStageError` do transporte
 *     OU como erro cru com o mesmo `code`; falha não-chave degrada com
 *     honestidade (heurística > erro, política do researchPlanner).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { LlmStageError } from '../electron/main/engine/runtime/callLlm';
import type { EngineLlm, LlmStageErrorCode } from '../electron/main/engine/runtime/callLlm';
import {
  DECLARACAO_INSUBSTITUIBILIDADE_REVISAO_HUMANA,
  F1Error,
  ancoraNaSpecValida,
  criarBuscaPlanejada,
  criarF1Research,
  estimarTokens,
  gCoverPesq,
  rejeitarAcimaDoTeto,
  validarConfig,
  validarUrlAchado,
} from '../electron/main/engine/phases/f1Research';
import type {
  Achado,
  AchadoCandidato,
  ArtefatoF1,
  Busca,
  ExecutorDeMultiBusca,
  F1Config,
  F1Entrada,
  OpcoesDeBusca,
  PlanoDeSubtopicos,
  RelatorioSubPesquisa,
} from '../electron/main/engine/phases/f1Research';
import { LLM_ERROR_CODES } from '../electron/main/services/llmClient';

// ---------------------------------------------------------------------------
// Fakes (PURAS, em memória — A-P14-2: a suíte roda offline)
// ---------------------------------------------------------------------------

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Espera uma condição no event loop sem timer (só microtasks/setImmediate). */
async function until(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 10_000 && !cond(); i += 1) {
    await new Promise<void>((res) => setImmediate(res));
  }
  assert.ok(cond(), 'condição nunca satisfeita no event loop');
}

/** Erro com código (shape dos serviços: BRAVE_KEY_MISSING etc.). */
function erroComCodigo(code: string, message = `erro ${code}`): Error & { code: string } {
  const e = new Error(message) as Error & { code: string };
  e.code = code;
  return e;
}

/** LlmStageError tipado (transporte da onda 1). */
function llmStageError(code: string, etapa = 'f1:plano:st1'): LlmStageError {
  return new LlmStageError({
    code: code as LlmStageErrorCode,
    etapa,
    message: `falha ${code}`,
    attempts: 1,
    retried: 0,
  });
}

const OPTS: OpcoesDeBusca = { atrasoEntreLotesMs: 1, atrasoSobRateLimitMs: 1 };

function config(over: Partial<F1Config> = {}): F1Config {
  return {
    concorrenciaDeAssuntos: 2,
    atrasoEntreLotesMs: 5,
    atrasoSobRateLimitMs: 25,
    tetoTokensPorRetorno: 2000,
    tetoAchadosPorSubTopico: 10,
    tetoQueriesPorSubTopico: 6,
    stageVersion: 'teste-f1-v1',
    timeoutMs: 10_000,
    ...over,
  };
}

function entrada(subtopicos: string[] = ['funções em JS', 'arrays e métodos', 'closures']): F1Entrada {
  return { tema: 'JavaScript para iniciantes', subtopicos };
}

function planoPara(queries: string[]): PlanoDeSubtopicos {
  return {
    subPerguntas: [{ id: 'sq1', pergunta: 'como funciona?' }],
    queries: queries.map((texto, i) => ({ id: `q${i + 1}`, texto, subPerguntaId: 'sq1' })),
    construcoesCandidatas: [
      {
        id: 'c1',
        nome: 'FunctionDeclaration',
        tipo: 'construcao',
        fonte: 'https://tc39.es/ecma262/#sec-function-definitions',
      },
      { id: 'c2', nome: 'Array.prototype.map', tipo: 'api', fonte: 'MDN: Array.prototype.map' },
    ],
    concepcoesAlternativas: [
      { id: 'm1', descricao: 'hoisting move fisicamente as declarações', ancoraNaSpec: 'ECMA-262 §8.1.2.5' },
    ],
  };
}

function achadoValido(query: string, extras: Partial<AchadoCandidato> = {}): AchadoCandidato {
  return {
    titulo: `resultado de "${query}"`,
    url: `https://docs.example.com/${encodeURIComponent(query)}`,
    ...extras,
  };
}

interface RegistrosDeBuscaFake {
  planos: Array<{ subtopico: string; opt: OpcoesDeBusca }>;
  achados: Array<{ query: string; opt: OpcoesDeBusca }>;
}

/** FAKE da `Busca` — 100% offline; controla plano, achados e falhas por string. */
function criarBuscaFake(opts: {
  planos?: (subtopico: string) => PlanoDeSubtopicos;
  achados?: (query: string) => AchadoCandidato[];
  falhaPlanos?: (subtopico: string) => Error | null;
  falhaAchados?: (query: string) => Error | null;
} = {}): { busca: Busca; registros: RegistrosDeBuscaFake } {
  const registros: RegistrosDeBuscaFake = { planos: [], achados: [] };
  const busca: Busca = {
    async buscarPlano(subtopico, opt) {
      registros.planos.push({ subtopico, opt });
      const falha = opts.falhaPlanos?.(subtopico);
      if (falha) throw falha;
      return opts.planos?.(subtopico) ?? planoPara([`consulta-${subtopico}-1`, `consulta-${subtopico}-2`]);
    },
    async buscarAchados(query, opt) {
      registros.achados.push({ query, opt });
      const falha = opts.falhaAchados?.(query);
      if (falha) throw falha;
      return opts.achados?.(query) ?? [achadoValido(query)];
    },
  };
  return { busca, registros };
}

/** EngineLlm fake — devolve conteúdo por etapa ou lança por etapa. */
function fakeLlm(
  conteudoPorEtapa?: Record<string, string>,
  falhasPorEtapa?: Record<string, Error>,
): EngineLlm {
  const defaultContent = JSON.stringify({
    subQuestions: [{ id: 'sq1', question: 'oq?' }],
    queries: [{ id: 'q1', q: 'consulta padrao', sub: 'sq1', category: 'official-docs' }],
    success_criteria: [] as string[],
    maxRounds: 1,
  });
  return {
    async callLlm(etapa, _req) {
      const falha = falhasPorEtapa?.[etapa];
      if (falha) throw falha;
      const content = conteudoPorEtapa?.[etapa] ?? defaultContent;
      return {
        content,
        model: 'fake',
        cached: false,
        stageUsage: { promptTokens: 10, completionTokens: 5, llmCalls: 1, cachedHits: 0, retries: 0 },
        attempts: 1,
        elapsedMs: 1,
      };
    },
    getStageUsage: () => undefined,
    getAllStageUsage: () => ({}),
  };
}

/** Conteúdo de plano F1 (shape do researchPlanner + inventários) para um sub-assunto. */
function conteudoDePlano(subtopico: string, queries: string[]): string {
  return JSON.stringify({
    subQuestions: [{ id: 'sq1', question: `pesquisa: ${subtopico}` }],
    queries: queries.map((q, i) => ({ id: `q${i + 1}`, q, sub: 'sq1', category: 'official-docs' })),
    success_criteria: [],
    maxRounds: 1,
    construcoesCandidatas: [{ id: 'c1', nome: 'FunctionDeclaration', tipo: 'construcao', fonte: 'https://tc39.es/ecma262/' }],
    concepcoesAlternativas: [{ id: 'm1', descricao: 'hoisting é movimento físico', ancoraNaSpec: 'ECMA-262 §8.1.2.5' }],
  });
}

type ResultadoFakeDeMulti = {
  results: Array<{ title: string; url: string; description?: string }>;
  errors: Array<{ query: string; error: string; code?: string }>;
};

function fakeMulti(
  registros: Array<{ queries: string[]; opts: { concurrency: number; delayMs: number; delayMsOnRateLimit: number } }>,
  resultado: ResultadoFakeDeMulti | ((queries: string[]) => ResultadoFakeDeMulti) = {
    results: [],
    errors: [],
  },
): ExecutorDeMultiBusca {
  return {
    async multiSearch(queries, opts) {
      registros.push({ queries, opts });
      return typeof resultado === 'function' ? resultado(queries) : resultado;
    },
  };
}

/** Relatório fabricado para testes puros do gate (sem passar pela fase). */
function relatorioOk(subTopicoId: string, achados: Achado[]): RelatorioSubPesquisa {
  return {
    subTopicoId,
    subTopico: `sub-${subTopicoId}`,
    status: 'ok',
    achados,
    achadosRejeitados: [],
    construcoes: [],
    construcoesRejeitadas: [],
    concepcoes: [],
    concepcoesRejeitadas: [],
    consultasExecutadas: ['q1'],
  };
}

function achadoNormalizado(subTopicoId: string, over: Partial<Achado> = {}): Achado {
  return {
    id: `${subTopicoId}:a1`,
    url: 'https://docs.example.com/a',
    dataDeColeta: '2026-08-30T00:00:00.000Z',
    titulo: 'título',
    subTopicoId,
    query: 'q1',
    ...over,
  };
}

// ---------------------------------------------------------------------------
// A-P14-1 — chave de busca ausente/inválida ABORTA com erro estruturado
// ---------------------------------------------------------------------------

describe('F1 · A-P14-1 — sem chave de busca, a fase ABORTA (não degrada em silêncio)', () => {
  it('BRAVE_KEY_MISSING no plano → F1Error F1_BUSCA_SEM_CHAVE', async () => {
    const { busca } = criarBuscaFake({ falhaPlanos: () => erroComCodigo('BRAVE_KEY_MISSING', 'chave Brave não configurada') });
    const fase = criarF1Research({ busca, config: config() });
    await assert.rejects(
      fase.executar(entrada()),
      (err) =>
        err instanceof F1Error &&
        err.code === 'F1_BUSCA_SEM_CHAVE' &&
        /não degrada em silêncio/.test(err.message),
    );
  });

  it('LLM_KEY_MISSING (LlmStageError do transporte) → F1Error F1_LLM_SEM_CHAVE', async () => {
    const { busca } = criarBuscaFake({
      falhaPlanos: () => llmStageError(LLM_ERROR_CODES.KEY_MISSING, 'f1:plano:arrays e métodos'),
    });
    const fase = criarF1Research({ busca, config: config() });
    await assert.rejects(
      fase.executar(entrada()),
      (err) => err instanceof F1Error && err.code === 'F1_LLM_SEM_CHAVE',
    );
  });

  it('chave de busca INVÁLIDA em uma query → F1Error F1_BUSCA_CHAVE_INVALIDA (aborta a fase inteira)', async () => {
    const { busca } = criarBuscaFake({ falhaAchados: () => erroComCodigo('BRAVE_KEY_INVALID') });
    const fase = criarF1Research({ busca, config: config() });
    await assert.rejects(
      fase.executar(entrada()),
      (err) => err instanceof F1Error && err.code === 'F1_BUSCA_CHAVE_INVALIDA',
    );
  });

  it('NÃO há caminho "keyless default": a fase rejeita (assert.rejects cobre — nunca resolve com artefato vazio)', async () => {
    const { busca } = criarBuscaFake({ falhaPlanos: () => erroComCodigo('BRAVE_KEY_MISSING') });
    const fase = criarF1Research({ busca, config: config() });
    let resolveu = false;
    await fase
      .executar(entrada(['só-um']))
      .then(() => {
        resolveu = true;
      })
      .catch(() => {});
    assert.equal(resolveu, false, 'a fase ABORTA — não devolve artefato degradado em silêncio');
  });
});

// ---------------------------------------------------------------------------
// A-P14-3 — 429 numa sub-pesquisa não derruba as outras
// ---------------------------------------------------------------------------

describe('F1 · A-P14-3 — 429 numa sub-pesquisa é isolada (falha registrada, run continua)', () => {
  it('BRAVE_RATE_LIMIT nas queries da 2ª sub-pesquisa: as outras completam e a falha fica no relatório', async () => {
    const { busca } = criarBuscaFake({
      planos: (sub) => planoPara([`q-${sub}-1`, `q-${sub}-2`]),
      falhaAchados: (query) => (query.startsWith('q-sub2-') ? erroComCodigo('BRAVE_RATE_LIMIT', 'rate limit na busca') : null),
    });
    const fase = criarF1Research({ busca, config: config() });
    const artefato = await fase.executar(entrada(['sub1', 'sub2', 'sub3']));

    assert.equal(artefato.relatorios.length, 3);
    const r2 = artefato.relatorios[1];
    assert.equal(r2.subTopico, 'sub2');
    assert.equal(r2.status, 'falhou');
    assert.equal(r2.falha?.codigo, 'BRAVE_RATE_LIMIT');
    assert.equal(r2.achados.length, 0);

    // As demais completam normalmente.
    assert.equal(artefato.relatorios[0].status, 'ok');
    assert.equal(artefato.relatorios[0].achados.length, 2);
    assert.equal(artefato.relatorios[2].status, 'ok');
    assert.equal(artefato.relatorios[2].achados.length, 2);

    // A falha é DECLARADA nas limitações, nunca omitida (§9.2).
    assert.ok(artefato.limitacoes.some((l) => l.includes('"st2"') && l.includes('BRAVE_RATE_LIMIT')));
    // subtópico sem fonte → G-COVER-PESQ reprova (a falha é visível).
    assert.equal(artefato.gCoverPesqAprovado, false);
    assert.deepEqual(artefato.cobertura.find((c) => c.subTopicoId === 'st2'), { subTopicoId: 'st2', comFonte: false });
  });

  it('LLM_RATE_LIMIT (LlmStageError) também é isolado por sub-pesquisa', async () => {
    const { busca } = criarBuscaFake({
      planos: (sub) => planoPara([`q-${sub}-1`]),
      falhaAchados: (query) =>
        query.startsWith('q-llm-') ? llmStageError(LLM_ERROR_CODES.RATE_LIMIT, 'f1:plano:llm') : null,
    });
    const fase = criarF1Research({ busca, config: config() });
    const artefato = await fase.executar(entrada(['ok1', 'llm', 'ok2']));
    assert.equal(artefato.relatorios[0].status, 'ok');
    assert.equal(artefato.relatorios[1].status, 'falhou');
    assert.equal(artefato.relatorios[1].falha?.codigo, LLM_ERROR_CODES.RATE_LIMIT);
    assert.equal(artefato.relatorios[2].status, 'ok');
  });

  it('o artefato emite a nota LITERAL da insubstituibilidade da revisão humana (A-P14-3)', async () => {
    const { busca } = criarBuscaFake({ falhaAchados: () => erroComCodigo('BRAVE_RATE_LIMIT') });
    const fase = criarF1Research({ busca, config: config() });
    const artefato = await fase.executar(entrada(['a']));
    assert.equal(artefato.declaracaoInsubstituivel, DECLARACAO_INSUBSTITUIBILIDADE_REVISAO_HUMANA);
    assert.equal(
      artefato.declaracaoInsubstituivel,
      'pesquisa errada produz trilha errada e nenhuma fase posterior detecta — ponto único onde revisão humana é insubstituível',
    );
  });
});

// ---------------------------------------------------------------------------
// URL não resolvível — rejeição registrada, nunca silenciosa
// ---------------------------------------------------------------------------

describe('F1 · achado sem URL resolvível é REJEITADO', () => {
  it('pura: validarUrlAchado distingue URL http(s) de "apenas texto"/esquema não-http', () => {
    assert.equal(validarUrlAchado('https://tc39.es/ecma262/'), null);
    assert.equal(validarUrlAchado('http://docs.example.com/x'), null);
    assert.equal(validarUrlAchado('apenas texto'), 'URL não resolvível (inválida ou apenas texto)');
    assert.equal(validarUrlAchado(''), 'URL vazia');
    assert.equal(validarUrlAchado('ftp://arquivo.example.com/x'), 'URL não resolvível (inválida ou apenas texto)');
  });

  it('fase: achado com URL irresolvível é rejeitado e REGISTRADO; só entram os válidos', async () => {
    const { busca } = criarBuscaFake({
      achados: () => [
        { titulo: 'bom', url: 'https://docs.example.com/guia' },
        { titulo: 'texto puro', url: 'apenas texto' },
        { titulo: 'ftp', url: 'ftp://arquivo.example.com/x' },
      ],
    });
    const fase = criarF1Research({ busca, config: config() });
    const artefato = await fase.executar(entrada(['tema']));
    const r = artefato.relatorios[0];
    assert.equal(r.status, 'ok');
    assert.equal(r.achados.length, 1);
    assert.equal(r.achados[0].url, 'https://docs.example.com/guia');
    assert.equal(r.achadosRejeitados.length, 2);
    for (const rej of r.achadosRejeitados) {
      assert.ok(rej.motivo.length > 0);
      assert.equal(rej.titulo.length > 0, true);
    }
    // a rejeição é DECLARADA nas limitações do artefato.
    assert.ok(artefato.limitacoes.some((l) => l.includes('URL irresolvível')));
  });
});

// ---------------------------------------------------------------------------
// INV-06 — retorno acima do teto é REJEITADO, nunca truncado
// ---------------------------------------------------------------------------

describe('F1 · INV-06 — retorno acima do teto de tokens é REJEITADO, não truncado', () => {
  it('pura: rejeitarAcimaDoTeto/estimarTokens (≈4 chars por token, heurística declarada)', () => {
    assert.equal(estimarTokens('abcd'), 1);
    assert.equal(estimarTokens(''), 0);
    assert.equal(rejeitarAcimaDoTeto('x'.repeat(1000), 100), true); // ~250 tokens > 100
    assert.equal(rejeitarAcimaDoTeto('x'.repeat(100), 100), false); // ~25 tokens ≤ 100
    assert.equal(rejeitarAcimaDoTeto('x'.repeat(401), 100), true); // 401/4 = 100,25 → 101 tokens > 100
  });

  it('fase: sub-pesquisa cujo relatório estoura o teto é REJEITADA e o conteúdo NÃO aparece no artefato (nem truncado)', async () => {
    const conteudoLongo = 'Z'.repeat(6000);
    const { busca } = criarBuscaFake({
      achados: () => [
        { titulo: 'curto', url: 'https://docs.example.com/curto' },
        { titulo: conteudoLongo, url: 'https://docs.example.com/longo' },
      ],
    });
    const fase = criarF1Research({ busca, config: config({ tetoTokensPorRetorno: 50 }) });
    const artefato = await fase.executar(entrada(['tema']));
    const r = artefato.relatorios[0];
    assert.equal(r.status, 'falhou');
    assert.equal(r.falha?.codigo, 'F1_RETORNO_ACIMA_DO_TETO');
    assert.equal(r.falha?.retornoSobTeto, true);
    assert.ok(/REJEITADO \(INV-06\), nunca truncado/.test(r.falha?.mensagem ?? ''));
    const texto = JSON.stringify(artefato);
    assert.equal(texto.includes(conteudoLongo), false, 'conteúdo integral ausente');
    assert.equal(texto.includes(conteudoLongo.slice(0, 100)), false, 'nenhum prefixo truncado do conteúdo');
  });
});

// ---------------------------------------------------------------------------
// G-COVER-PESQ — gate pura de cobertura
// ---------------------------------------------------------------------------

describe('F1 · G-COVER-PESQ — todo subtópico tem ≥1 fonte; todo achado tem id/URL/data', () => {
  it('pura: reprova subtópico sem NENHUMA fonte', () => {
    const gate = gCoverPesq([relatorioOk('st1', [achadoNormalizado('st1')]), relatorioOk('st2', [])]);
    assert.equal(gate.aprovado, false);
    assert.deepEqual(gate.subtopicosSemFonte, ['st2']);
    assert.deepEqual(gate.achadosSemIdentidade, []);
  });

  it('pura: reprova achado sem id/URL/data de coleta (identidade incompleta)', () => {
    const gate = gCoverPesq([
      relatorioOk('st1', [achadoNormalizado('st1', { dataDeColeta: '' })]),
      relatorioOk('st2', [achadoNormalizado('st2', { url: '' })]),
    ]);
    assert.equal(gate.aprovado, false);
    assert.deepEqual(gate.subtopicosSemFonte, []);
    assert.equal(gate.achadosSemIdentidade.length, 2);
    assert.deepEqual(gate.achadosSemIdentidade[0].faltam, ['dataDeColeta']);
    assert.deepEqual(gate.achadosSemIdentidade[1].faltam, ['url']);
  });

  it('pura: aprovado quando tudo coberto e íntegro', () => {
    const gate = gCoverPesq([relatorioOk('st1', [achadoNormalizado('st1')])]);
    assert.equal(gate.aprovado, true);
  });

  it('fase: subtópico com zero achados reprova o gate no artefato (e a limitação é declarada)', async () => {
    const { busca } = criarBuscaFake({ achados: () => [] });
    const fase = criarF1Research({ busca, config: config() });
    const artefato = await fase.executar(entrada(['tema']));
    assert.equal(artefato.relatorios[0].status, 'ok'); // a pesquisa rodou…
    assert.equal(artefato.cobertura[0].comFonte, false); // …mas sem fontes o gate reprova
    assert.equal(artefato.gCoverPesqAprovado, false);
    assert.ok(artefato.limitacoes.some((l) => l.includes('G-COVER-PESQ reprovado')));
  });
});

// ---------------------------------------------------------------------------
// Bônus — inventário de concepções alternativas EXIGE âncora na spec
// ---------------------------------------------------------------------------

describe('F1 · bônus — concepções alternativas exigem âncora na spec (§4.2)', () => {
  it('pura: ancoraNaSpecValida aceita URL e refs de spec; rejeita vazio/livre texto', () => {
    assert.equal(ancoraNaSpecValida('https://tc39.es/ecma262/#sec-functions'), true);
    assert.equal(ancoraNaSpecValida('ECMA-262 §13.3'), true);
    assert.equal(ancoraNaSpecValida('MDN: Array.prototype.map'), true);
    assert.equal(ancoraNaSpecValida('WHATWG: Streams Standard'), true);
    assert.equal(ancoraNaSpecValida(''), false);
    assert.equal(ancoraNaSpecValida('apenas texto'), false);
    assert.equal(ancoraNaSpecValida('   '), false);
    assert.equal(ancoraNaSpecValida('https://'), false);
  });

  it('fase: concepção sem âncora válida é REJEITADA e não entra no inventário (rejeição registrada)', async () => {
    const { busca } = criarBuscaFake({
      planos: () => ({
        ...planoPara(['q1']),
        concepcoesAlternativas: [
          { id: 'm1', descricao: 'ancorada', ancoraNaSpec: 'ECMA-262 §8.1.2.5' },
          { id: 'm2', descricao: 'sem ancora', ancoraNaSpec: 'apenas texto' },
          { id: 'm3', descricao: 'vazia', ancoraNaSpec: '   ' },
        ],
      }),
    });
    const fase = criarF1Research({ busca, config: config() });
    const artefato = await fase.executar(entrada(['tema']));
    const r = artefato.relatorios[0];
    assert.equal(r.concepcoes.length, 1);
    assert.equal(r.concepcoes[0].id, 'm1');
    assert.equal(r.concepcoesRejeitadas.length, 2);
    assert.deepEqual(artefato.inventarioConcepcoes.map((c) => c.id), ['m1']);
    assert.ok(artefato.limitacoes.some((l) => l.includes('concepção rejeitada sem âncora')));
  });
});

// ---------------------------------------------------------------------------
// Fail-closed: config e entrada
// ---------------------------------------------------------------------------

describe('F1 · FAIL-CLOSED — config e entrada fora do contrato', () => {
  it('validarConfig nomeia campo+motivo para cada parâmetro obrigatório ausente/inválido', () => {
    const casos: Array<[Partial<F1Config>, string]> = [
      [{ concorrenciaDeAssuntos: 0 }, 'concorrenciaDeAssuntos'],
      [{ atrasoEntreLotesMs: -1 }, 'atrasoEntreLotesMs'],
      [{ atrasoEntreLotesMs: Number.NaN }, 'atrasoEntreLotesMs'],
      [{ atrasoSobRateLimitMs: -1 }, 'atrasoSobRateLimitMs'],
      [{ tetoTokensPorRetorno: 0 }, 'tetoTokensPorRetorno'],
      [{ tetoAchadosPorSubTopico: 0 }, 'tetoAchadosPorSubTopico'],
      [{ tetoQueriesPorSubTopico: 0 }, 'tetoQueriesPorSubTopico'],
      [{ stageVersion: '' }, 'stageVersion'],
      [{ timeoutMs: 0 }, 'timeoutMs'],
    ];
    for (const [over, campo] of casos) {
      const problemas = validarConfig(config(over));
      assert.ok(
        problemas.some((p) => p.includes(campo)),
        `esperava problema em "${campo}": ${problemas.join('; ')}`,
      );
    }
    assert.deepEqual(validarConfig(config()), []);
  });

  it('fase: config inválida lança F1_CONFIG_INVALIDO ANTES de qualquer trabalho', async () => {
    const { busca } = criarBuscaFake();
    const fase = criarF1Research({ busca, config: config({ atrasoSobRateLimitMs: -5 }) });
    await assert.rejects(
      fase.executar(entrada()),
      (err) =>
        err instanceof F1Error &&
        err.code === 'F1_CONFIG_INVALIDO' &&
        /atrasoSobRateLimitMs/.test(err.message),
    );
  });

  it('fase: entrada sem sub-assuntos lança F1_ENTRADA_VAZIA', async () => {
    const { busca } = criarBuscaFake();
    const fase = criarF1Research({ busca, config: config() });
    await assert.rejects(
      fase.executar({ tema: 'x', subtopicos: [] }),
      (err) => err instanceof F1Error && err.code === 'F1_ENTRADA_VAZIA',
    );
  });

  it('plano sem queries → sub-pesquisa falha isolada (F1_PLANO_INVALIDO); as outras seguem', async () => {
    const { busca } = criarBuscaFake({
      planos: (sub) =>
        sub === 'ruim'
          ? { subPerguntas: [], queries: [], construcoesCandidatas: [], concepcoesAlternativas: [] }
          : planoPara([`q-${sub}-1`]),
    });
    const fase = criarF1Research({ busca, config: config() });
    const artefato = await fase.executar(entrada(['ruim', 'bom']));
    assert.equal(artefato.relatorios[0].status, 'falhou');
    assert.equal(artefato.relatorios[0].falha?.codigo, 'F1_PLANO_INVALIDO');
    assert.equal(artefato.relatorios[1].status, 'ok');
    assert.equal(artefato.relatorios[1].achados.length, 1);
  });
});

// ---------------------------------------------------------------------------
// Paralelismo e parâmetros declarados
// ---------------------------------------------------------------------------

describe('F1 · paralelismo por sub-assunto e parâmetros declarados', () => {
  it('sub-pesquisas paralelas respeitam concorrenciaDeAssuntos (pico ≤ teto, semáforo próprio)', async () => {
    const emVoo = { atual: 0, pico: 0 };
    const portoes = [deferred(), deferred(), deferred()];
    let passo = 0;
    const busca: Busca = {
      async buscarPlano(subtopico) {
        emVoo.atual += 1;
        emVoo.pico = Math.max(emVoo.pico, emVoo.atual);
        const meuPortao = portoes[Math.min(passo, portoes.length - 1)];
        passo += 1;
        await meuPortao.promise;
        emVoo.atual -= 1;
        return planoPara([`q-${subtopico}-1`]);
      },
      async buscarAchados(query) {
        return [achadoValido(query)];
      },
    };
    const fase = criarF1Research({ busca, config: config({ concorrenciaDeAssuntos: 2 }) });
    const promise = fase.executar(entrada(['a', 'b', 'c']));
    await until(() => passo >= 2);
    assert.equal(emVoo.pico, 2);
    assert.ok(passo <= 2, 'a terceira sub-pesquisa ainda não começou (semáforo)');
    portoes[0].resolve();
    await until(() => passo >= 3);
    portoes[1].resolve();
    portoes[2].resolve();
    const artefato = await promise;
    assert.equal(emVoo.pico, 2, 'pico nunca supera concorrenciaDeAssuntos');
    assert.equal(artefato.relatorios.length, 3);
  });

  it('NÃO paraleliza queries DENTRO de um assunto (uma por vez — o limitador da busca é 2)', async () => {
    const emVoo = { atual: 0, pico: 0 };
    const { busca } = criarBuscaFake();
    const buscaSeq: Busca = {
      async buscarPlano(subtopico, opt) {
        return busca.buscarPlano(subtopico, opt);
      },
      async buscarAchados(query, opt) {
        emVoo.atual += 1;
        emVoo.pico = Math.max(emVoo.pico, emVoo.atual);
        await new Promise<void>((res) => setImmediate(res));
        emVoo.atual -= 1;
        return busca.buscarAchados(query, opt);
      },
    };
    const fase = criarF1Research({ busca: buscaSeq, config: config({ concorrenciaDeAssuntos: 3 }) });
    const artefato = await fase.executar(entrada(['só-um']));
    assert.equal(emVoo.pico, 1, 'queries do mesmo assunto nunca em paralelo');
    assert.ok(artefato.relatorios[0].achados.length >= 1);
  });

  it('A-P14-3: atraso entre lotes e atraso sob rate limit são passados à busca em TODA chamada', async () => {
    const cfg = config({ atrasoEntreLotesMs: 7, atrasoSobRateLimitMs: 99 });
    const { busca, registros } = criarBuscaFake();
    const fase = criarF1Research({ busca, config: cfg });
    const artefato = await fase.executar(entrada(['a', 'b']));
    assert.ok(artefato.relatorios.length === 2);
    assert.ok(registros.planos.length >= 2, 'uma chamada de plano por sub-assunto');
    assert.ok(registros.achados.length >= 2);
    for (const p of registros.planos) {
      assert.deepEqual(p.opt, { atrasoEntreLotesMs: 7, atrasoSobRateLimitMs: 99 });
    }
    for (const a of registros.achados) {
      assert.deepEqual(a.opt, { atrasoEntreLotesMs: 7, atrasoSobRateLimitMs: 99 });
    }
  });
});

// ---------------------------------------------------------------------------
// criarBuscaPlanejada — a Busca de produção (transporte LLM + multi-busca)
// ---------------------------------------------------------------------------

describe('F1 · criarBuscaPlanejada (produção)', () => {
  it('A-P14-3: repassa delayMsOnRateLimit e delayMs à multiSearch em TODA query — o retry de 429 vira código vivo', async () => {
    const registros: Array<{ queries: string[]; opts: { concurrency: number; delayMs: number; delayMsOnRateLimit: number } }> = [];
    const multi = fakeMulti(registros, {
      results: [{ title: 'resultado', url: 'https://docs.example.com/r' }],
      errors: [],
    });
    const busca = criarBuscaPlanejada({ llm: fakeLlm(), multi, stageVersion: 'v1', timeoutMs: 5000 });
    const achados = await busca.buscarAchados('consulta', { atrasoEntreLotesMs: 7, atrasoSobRateLimitMs: 99 });
    assert.equal(achados.length, 1);
    assert.equal(registros.length, 1);
    assert.deepEqual(registros[0].queries, ['consulta']);
    assert.deepEqual(registros[0].opts, { concurrency: 1, delayMs: 7, delayMsOnRateLimit: 99 });
    assert.equal(achados[0].titulo, 'resultado');
  });

  it('UMA chamada de plano por sub-assunto via transporte único (REUSA helpers do researchPlanner)', async () => {
    const etapas: string[] = [];
    const llm: EngineLlm = {
      async callLlm(etapa, req) {
        etapas.push(etapa);
        assert.equal(req.stageVersion, 'v1');
        assert.equal(req.timeoutMs, 5000);
        assert.ok(req.prompt.length > 0);
        assert.ok(req.system !== undefined && req.system.length > 0);
        return {
          content: conteudoDePlano('funções', ['query sobre funções']),
          model: 'fake',
          cached: false,
          stageUsage: { promptTokens: 10, completionTokens: 5, llmCalls: 1, cachedHits: 0, retries: 0 },
          attempts: 1,
          elapsedMs: 1,
        };
      },
      getStageUsage: () => undefined,
      getAllStageUsage: () => ({}),
    };
    const busca = criarBuscaPlanejada({ llm, multi: fakeMulti([]), stageVersion: 'v1', timeoutMs: 5000 });
    const plano = await busca.buscarPlano('funções', OPTS);
    assert.equal(etapas.length, 1);
    assert.ok(etapas[0].startsWith('f1:plano:'));
    assert.equal(plano.queries.length, 1);
    assert.equal(plano.queries[0].texto, 'query sobre funções');
    assert.equal(plano.construcoesCandidatas.length, 1);
    assert.equal(plano.concepcoesAlternativas.length, 1);
    assert.equal(plano.concepcoesAlternativas[0].ancoraNaSpec, 'ECMA-262 §8.1.2.5');
  });

  it('KEY_MISSING NUNCA degrada para a heurística — sobe para a fase ABORTAR (A-P14-1)', async () => {
    const llm = fakeLlm({}, { 'f1:plano:assunto': llmStageError(LLM_ERROR_CODES.KEY_MISSING) });
    const busca = criarBuscaPlanejada({ llm, multi: fakeMulti([]), stageVersion: 'v1', timeoutMs: 5000 });
    await assert.rejects(
      busca.buscarPlano('assunto', OPTS),
      (err) => err instanceof LlmStageError && err.code === LLM_ERROR_CODES.KEY_MISSING,
    );
  });

  it('BAD_REQUEST = bug de prompt da etapa → F1Error F1_LLM_PROMPT_INVALIDO NOMEANDO a etapa', async () => {
    const llm = fakeLlm({}, { 'f1:plano:assunto': llmStageError(LLM_ERROR_CODES.BAD_REQUEST, 'f1:plano:assunto') });
    const busca = criarBuscaPlanejada({ llm, multi: fakeMulti([]), stageVersion: 'v1', timeoutMs: 5000 });
    const fase = criarF1Research({ busca, config: config() });
    await assert.rejects(
      fase.executar(entrada(['assunto'])),
      (err) =>
        err instanceof F1Error &&
        err.code === 'F1_LLM_PROMPT_INVALIDO' &&
        err.etapa === 'f1:plano:assunto' &&
        /bug de prompt da etapa/.test(err.message),
    );
  });

  it('erro CRU {code:\'LLM_BAD_REQUEST\'} do EngineLlm → NUNCA degrada: a fase ABORTA (F1_LLM_PROMPT_INVALIDO)', async () => {
    // Um EngineLlm injetado pode lançar o erro do cliente de LLM CRU (sem o
    // shape LlmStageError do transporte). BAD_REQUEST é bug de prompt — a
    // heurística NUNCA o substitui nem cru nem tipado (A-P14-1).
    const registrosMulti: Array<{ queries: string[]; opts: { concurrency: number; delayMs: number; delayMsOnRateLimit: number } }> = [];
    const llm = fakeLlm({}, { 'f1:plano:assunto': erroComCodigo(LLM_ERROR_CODES.BAD_REQUEST, 'bug de prompt da etapa f1:plano:assunto') });
    const busca = criarBuscaPlanejada({ llm, multi: fakeMulti(registrosMulti), stageVersion: 'v1', timeoutMs: 5000 });
    const fase = criarF1Research({ busca, config: config() });
    await assert.rejects(
      fase.executar(entrada(['assunto'])),
      (err) =>
        err instanceof F1Error &&
        err.code === 'F1_LLM_PROMPT_INVALIDO' &&
        /bug de prompt da etapa F1/.test(err.message),
    );
    assert.equal(registrosMulti.length, 0, 'nunca chega à busca: BAD_REQUEST cru não degrada para a heurística');
  });

  it('falha NÃO-chave do planejador LLM → resposta degradada (heurística determinística) > erro', async () => {
    const llm = fakeLlm({}, { 'f1:plano:assunto': llmStageError(LLM_ERROR_CODES.NETWORK) });
    const busca = criarBuscaPlanejada({ llm, multi: fakeMulti([]), stageVersion: 'v1', timeoutMs: 5000 });
    const plano = await busca.buscarPlano('assunto', OPTS);
    assert.ok(plano.queries.length >= 1, 'a heurística cobre o assunto sem LLM');
    assert.ok(plano.queries.some((q) => q.texto.toLowerCase().includes('assunto')));
  });

  it('sem fallback declarado (usarHeuristica:false), falha do planejador é fail-closed', async () => {
    const llm = fakeLlm({}, { 'f1:plano:assunto': llmStageError(LLM_ERROR_CODES.NETWORK) });
    const busca = criarBuscaPlanejada({
      llm,
      multi: fakeMulti([]),
      stageVersion: 'v1',
      timeoutMs: 5000,
      usarHeuristica: false,
    });
    await assert.rejects(busca.buscarPlano('assunto', OPTS));
  });

  it('erro da multiSearch preserva o código (BRAVE_RATE_LIMIT) para a fase isolar', async () => {
    const registros: Array<{ queries: string[]; opts: { concurrency: number; delayMs: number; delayMsOnRateLimit: number } }> = [];
    const multi = fakeMulti(registros, {
      results: [],
      errors: [{ query: 'q', error: 'rate limit', code: 'BRAVE_RATE_LIMIT' }],
    });
    const busca = criarBuscaPlanejada({ llm: fakeLlm(), multi, stageVersion: 'v1', timeoutMs: 5000 });
    await assert.rejects(
      busca.buscarAchados('q', OPTS),
      (err) => (err as { code?: string }).code === 'BRAVE_RATE_LIMIT',
    );
  });

  it('integração: 429 numa sub-pesquisa via criarBuscaPlanejada não derruba as outras', async () => {
    const llm = fakeLlm(
      Object.fromEntries(['b1', 'b2', 'b3'].map((s) => [`f1:plano:${s}`, conteudoDePlano(s, [`q-${s}-1`])])),
    );
    const multi = fakeMulti([], (queries) =>
      queries[0].startsWith('q-b2-')
        ? { results: [], errors: [{ query: queries[0], error: 'rate limit', code: 'BRAVE_RATE_LIMIT' }] }
        : { results: [{ title: 'resultado', url: 'https://docs.example.com/r' }], errors: [] },
    );
    const busca = criarBuscaPlanejada({ llm, multi, stageVersion: 'v1', timeoutMs: 5000 });
    const fase = criarF1Research({ busca, config: config() });
    const artefato = await fase.executar(entrada(['b1', 'b2', 'b3']));
    assert.equal(artefato.relatorios[0].status, 'ok');
    assert.equal(artefato.relatorios[0].achados.length, 1);
    assert.equal(artefato.relatorios[1].status, 'falhou');
    assert.equal(artefato.relatorios[1].falha?.codigo, 'BRAVE_RATE_LIMIT');
    assert.equal(artefato.relatorios[2].status, 'ok');
    assert.equal(artefato.gCoverPesqAprovado, false);
  });
});

// ---------------------------------------------------------------------------
// Inventário de construções — saída obrigatória além da prosa (§4.2)
// ---------------------------------------------------------------------------

describe('F1 · saídas obrigatórias além da prosa (§4.2)', () => {
  it('o artefato consolida o inventário de construções/APIs candidatas COM citação', async () => {
    const { busca } = criarBuscaFake({
      planos: (sub) => ({
        ...planoPara([`q-${sub}-1`]),
        construcoesCandidatas: [
          { id: 'c1', nome: 'FunctionDeclaration', tipo: 'construcao', fonte: 'https://tc39.es/ecma262/' },
          { id: 'c99', nome: 'sem citação', tipo: 'construcao', fonte: ' ' },
        ],
      }),
    });
    const fase = criarF1Research({ busca, config: config() });
    const artefato: ArtefatoF1 = await fase.executar(entrada(['a', 'b']));
    // dedup por (tipo+nome): cada construção aparece uma vez no inventário consolidado.
    const nomes = artefato.inventarioConstrucoes.map((c) => c.nome);
    assert.equal(new Set(nomes).size, nomes.length, 'inventário deduplicado');
    assert.ok(nomes.includes('FunctionDeclaration'));
    for (const c of artefato.inventarioConstrucoes) {
      assert.ok(c.fonte.length > 0, `construção "${c.nome}" com citação`);
      assert.ok(c.subTopicoId.length > 0);
      assert.ok(c.tipo === 'construcao' || c.tipo === 'api');
    }
    // a candidatura sem citação foi REJEITADA e registrada, não silenciada.
    assert.ok(artefato.limitacoes.some((l) => l.includes('candidata rejeitada sem citação')));
    const todasAsSub = artefato.relatorios.flatMap((r) => r.construcoes);
    assert.equal(todasAsSub.some((c) => c.nome === 'sem citação'), false);
  });
});