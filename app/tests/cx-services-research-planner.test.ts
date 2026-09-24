/**
 * tests/cx-services-research-planner.test.ts — CARACTERIZAÇÃO (golden master)
 * de `electron/main/services/researchPlanner.ts` ANTES da refatoração de
 * core/services.
 *
 * Fixa o planejador de pesquisa: heurística determinística (6 subtópicos
 * pt-BR), normalização de planos LLM, nunca-repetir/dedup, digest, prompts,
 * parse de JSON e o laço `plan()` com DEGRADAÇÃO HONESTA (brave-missing,
 * chave inválida, rate limit, analista ausente). SEM REDE: `search.multiSearch`
 * e os geradores LLM são fakes injetados.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { StudyFinding } from '../shared/ipc-contract';
import type {
  MultiSearchOptions,
  MultiSearchResult,
  QueryDoneInfo,
} from '../electron/main/services/braveSearchService';
import {
  buildDigest,
  buildFollowUpPrompt,
  buildPlanPrompt,
  createResearchPlanner,
  dedupeQueries,
  defaultQueriesFor,
  followUpsWithLlm,
  heuristicPlanFor,
  normalizeFollowUps,
  normalizePlanShape,
  normalizeQuery,
  parseLlmJson,
  planWithLlm,
  type FollowUpContext,
  type LlmClientLike,
  type ResearchPlannerDeps,
} from '../electron/main/services/researchPlanner';

// ─── helpers/fakes ───────────────────────────────────────────────────────────

function finding(over: Partial<StudyFinding> = {}): StudyFinding {
  return {
    query: 'q',
    title: 't',
    url: 'https://exemplo.dev/doc',
    description: 'd',
    ...over,
  };
}

interface MultiSearchFake {
  fn: (queries: string[], opts?: MultiSearchOptions) => Promise<MultiSearchResult>;
  chamadas: string[][];
}

/**
 * Fake de multiSearch fiel ao serviço real: dispara onQueryStart/onQueryDone por
 * query e devolve `responder(queries)` como resultado da rodada.
 */
function multiSearchFake(
  responder: (queries: string[]) => MultiSearchResult,
): MultiSearchFake {
  const chamadas: string[][] = [];
  const fn = async (queries: string[], opts?: MultiSearchOptions): Promise<MultiSearchResult> => {
    chamadas.push([...queries]);
    for (const q of queries) {
      opts?.onQueryStart?.(q);
      const info: QueryDoneInfo = { query: q, ok: true, provider: 'brave', hits: 1, latencyMs: 5 };
      opts?.onQueryDone?.(info);
    }
    return responder(queries);
  };
  return { fn, chamadas };
}

function depsCom(
  search: MultiSearchFake,
  over: Partial<ResearchPlannerDeps> = {},
  apiKey = 'chave-brave',
): ResearchPlannerDeps {
  return {
    search: { multiSearch: search.fn },
    resolveApiKey: async () => apiKey,
    ...over,
  };
}

function followUpCtx(over: Partial<FollowUpContext> = {}): FollowUpContext {
  return {
    subject: 'funções',
    subQuestions: [{ id: 'sq1', question: 'funções: conceito' }],
    queries: [{ id: 'q1', q: 'funções conceito', sub: 'sq1', category: 'official-docs' }],
    digest: '- [q] t — https://exemplo.dev/doc',
    alreadyRan: ['funções conceito'],
    round: 1,
    maxRounds: 2,
    ...over,
  };
}

// ─── funções puras ───────────────────────────────────────────────────────────

describe('cx/researchPlanner: heurística determinística (degradação honesta)', () => {
  it('normalizeQuery: trim + lowercase + whitespace colapsado', () => {
    assert.equal(normalizeQuery('  Foo   BAR\tBAZ '), 'foo bar baz');
  });

  it('defaultQueriesFor: os 6 subtópicos pt-BR fixos; vazio ⇒ []; longo demais é filtrado', () => {
    assert.deepEqual(defaultQueriesFor('funções'), [
      'funções conceito',
      'funções exemplos práticos',
      'funções como funciona',
      'funções erros comuns',
      'funções comparação',
      'funções exercícios',
    ]);
    assert.deepEqual(defaultQueriesFor(''), []);
    assert.deepEqual(defaultQueriesFor('   '), []);
    assert.deepEqual(defaultQueriesFor('x'.repeat(130)), [], 'query > 120 chars sai');
  });

  it('heuristicPlanFor: sub-perguntas sq1..sq6, categorias mapeadas, maxRounds 1 (nunca pede rodada extra)', () => {
    const plano = heuristicPlanFor('funções');
    assert.deepEqual(
      plano.subQuestions.map((s) => s.id),
      ['sq1', 'sq2', 'sq3', 'sq4', 'sq5', 'sq6'],
    );
    assert.equal(plano.subQuestions[0].question, 'funções: conceito');
    assert.deepEqual(
      plano.queries.map((q) => q.category),
      ['official-docs', 'practice', 'official-docs', 'common-errors', 'comparison', 'exercises'],
    );
    assert.deepEqual(
      plano.queries.map((q) => q.sub),
      ['sq1', 'sq2', 'sq3', 'sq4', 'sq5', 'sq6'],
    );
    assert.deepEqual(plano.successCriteria, []);
    assert.equal(plano.maxRounds, 1);
  });
});

describe('cx/researchPlanner: normalizePlanShape (LLM cru ⇒ shape do contrato)', () => {
  it('coage ids/subs/categorias, trunca (q 120, question 200, criteria 300) e corta em 6', () => {
    const plano = normalizePlanShape({
      subQuestions: Array.from({ length: 8 }, () => ({ question: '  pergunta?  ' })),
      queries: Array.from({ length: 8 }, () => ({ q: ' q ', category: 'practice' })),
      successCriteria: ['crit', 42, 'x'.repeat(400)],
      maxRounds: 99,
    });
    assert.equal(plano.subQuestions.length, 6, 'cap 6');
    assert.equal(plano.queries.length, 6, 'cap 6');
    assert.equal(plano.subQuestions[0].id, 'sq1', 'id derivado quando ausente');
    assert.equal(plano.subQuestions[0].question, 'pergunta?');
    assert.equal(plano.queries[0].id, 'q1');
    assert.equal(plano.queries[0].q, 'q');
    assert.equal(plano.queries[0].sub, 'sq1', 'sub cai na primeira sub-pergunta');
    assert.equal(plano.queries[0].category, 'practice');
    assert.deepEqual(plano.successCriteria, ['crit', 'x'.repeat(300)], 'só strings, ≤300');
    assert.equal(plano.maxRounds, 2, 'clamp no cap total (MAX 2)');
  });

  it('entradas inválidas viram vazio; maxRounds clamp 1..2 e default 2 quando não-numérico', () => {
    assert.deepEqual(normalizePlanShape(null), {
      subQuestions: [],
      queries: [],
      successCriteria: [],
      maxRounds: 2,
    });
    assert.deepEqual(normalizePlanShape({ queries: [{ q: '  ' }, { sub: 1 }] }).queries, []);
    assert.equal(normalizePlanShape({ maxRounds: 0 }).maxRounds, 1);
    assert.equal(normalizePlanShape({ maxRounds: 1.9 }).maxRounds, 1, 'floor');
    assert.equal(normalizePlanShape({ maxRounds: 'x' }).maxRounds, 2);
    assert.equal(normalizePlanShape({}).maxRounds, 2);
  });
});

describe('cx/researchPlanner: normalizeFollowUps e dedupeQueries', () => {
  it('follow-ups: ids estáveis da rodada (r{N+1}q{i+1}), sub default "follow-up", cap 6', () => {
    const qs = normalizeFollowUps(
      [
        { q: ' lacuna 1 ' },
        { q: 'lacuna 2', sub: 'sq2', category: 'official-docs' },
        { q: '   ' },
        { q: 'lacuna 3', category: 'categoria-invalida' },
      ],
      1,
    );
    assert.deepEqual(qs, [
      { id: 'r2q1', q: 'lacuna 1', sub: 'follow-up', category: null },
      { id: 'r2q2', q: 'lacuna 2', sub: 'sq2', category: 'official-docs' },
      { id: 'r2q3', q: 'lacuna 3', sub: 'follow-up', category: null },
    ]);
    assert.deepEqual(normalizeFollowUps('não-array', 0), []);
  });

  it('dedupeQueries: remove já-executadas (normalizadas) e duplicatas internas, preserva ordem', () => {
    const pendentes = [
      { id: 'q1', q: 'Funções   Conceito', sub: 'sq1', category: null },
      { id: 'q2', q: 'nova', sub: 'sq1', category: null },
      { id: 'q3', q: 'NOVA', sub: 'sq1', category: null },
      { id: 'q4', q: '   ', sub: 'sq1', category: null },
    ];
    const out = dedupeQueries(pendentes, ['funções conceito']);
    assert.deepEqual(
      out.map((q) => q.id),
      ['q2'],
    );
  });
});

describe('cx/researchPlanner: buildDigest', () => {
  it('formato `- [query] title — url — desc(≤180)`; orçamento estourado corta ANTES da linha', () => {
    const digest = buildDigest([finding({ query: 'busca', title: 'Doc', url: 'https://u', description: 'd'.repeat(300) })]);
    assert.ok(digest.startsWith('- [busca] Doc — https://u — '));
    assert.ok(digest.includes('d'.repeat(180)));
    assert.ok(!digest.includes('d'.repeat(181)), 'descrição truncada a 180');
    assert.equal(
      buildDigest([finding()], 5),
      '',
      'linha que estoura o orçamento NÃO entra (primeira linha acima do corte ⇒ vazio)',
    );
    assert.equal(buildDigest(Array.from({ length: 30 }, (_, i) => finding({ url: `https://u/${i}` }))).split('\n').length, 24, 'máx. 24 findings');
  });
});

describe('cx/researchPlanner: prompts (contrato textual do planner/analista)', () => {
  it('buildPlanPrompt: assinatura, categorias fechadas e shape JSON EXATO', () => {
    const { system, user } = buildPlanPrompt('funções');
    assert.ok(system.includes('PLANEJADOR'));
    assert.ok(system.includes('Responda SOMENTE com JSON válido'));
    assert.ok(user.includes('ASSUNTO DA AULA: "funções"'));
    assert.ok(user.includes('official-docs, practice, common-errors, comparison, exercises'));
    assert.ok(user.includes('"maxRounds": 2'));
    assert.ok(
      user.includes(
        '{"subQuestions":[{"id":"sq1","question":"..."}],"queries":[{"id":"q1","q":"...","sub":"sq1","category":"official-docs"}],"success_criteria":["..."],"maxRounds":2}',
      ),
      'shape JSON declarado literalmente',
    );
  });

  it('buildFollowUpPrompt: rodada x/y, não-repetição, digest e a saída {"next_queries":[]}', () => {
    const { system, user } = buildFollowUpPrompt(followUpCtx());
    assert.ok(system.includes('ANALISTA'));
    assert.ok(user.includes('RODADA CONCLUÍDA: 1/2'));
    assert.ok(user.includes('- sq1: funções: conceito'));
    assert.ok(user.includes('QUERIES JÁ EXECUTADAS (NÃO repita nenhuma'));
    assert.ok(user.includes('- "funções conceito"'));
    assert.ok(user.includes('- [q] t — https://exemplo.dev/doc'));
    assert.ok(user.includes('{"next_queries":[]}'));
    assert.ok(
      buildFollowUpPrompt(followUpCtx({ digest: '   ' })).user.includes(
        '(nenhuma fonte retornou resultados)',
      ),
    );
  });
});

describe('cx/researchPlanner: parseLlmJson', () => {
  it('aceita JSON puro e cercado por ```/```json; vazio e inválido LANÇAM', () => {
    assert.deepEqual(parseLlmJson('{"a":1}'), { a: 1 });
    assert.deepEqual(parseLlmJson('```json\n{"a":1}\n```'), { a: 1 });
    assert.deepEqual(parseLlmJson('```\n{"a":1}\n```'), { a: 1 });
    assert.throws(() => parseLlmJson('   '), /resposta vazia/);
    assert.throws(() => parseLlmJson('não é json'));
    assert.throws(() => parseLlmJson('```json\n{quebrado\n```'));
  });
});

describe('cx/researchPlanner: planWithLlm / followUpsWithLlm (cliente fake)', () => {
  function clientFake(content: string): { client: LlmClientLike; reqs: Array<Record<string, unknown>> } {
    const reqs: Array<Record<string, unknown>> = [];
    return {
      client: {
        chatCompletion: async (req) => {
          reqs.push(req as unknown as Record<string, unknown>);
          return { content };
        },
      },
      reqs,
    };
  }

  it('planWithLlm: temperature 0.3 / 1400 tokens / 45s e shape normalizado', async () => {
    const { client, reqs } = clientFake(
      '```json\n{"subQuestions":[{"id":"sq1","question":"pq?"}],"queries":[{"id":"q1","q":"busca","sub":"sq1","category":"practice"}],"success_criteria":["c"],"maxRounds":2}\n```',
    );
    const plano = await planWithLlm(client, 'funções');
    assert.equal(plano.queries.length, 1);
    assert.equal(plano.maxRounds, 2);
    assert.equal(reqs[0].temperature, 0.3);
    assert.equal(reqs[0].maxTokens, 1400);
    assert.equal(reqs[0].timeoutMs, 45_000);
  });

  it('planWithLlm com ZERO queries ⇒ lança (o chamador cai na heurística)', async () => {
    const { client } = clientFake('{"subQuestions":[],"queries":[]}');
    await assert.rejects(() => planWithLlm(client, 'x'), /zero queries/);
  });

  it('followUpsWithLlm: temperature 0.2 / 900 tokens / 45s; sem next_queries ⇒ []', async () => {
    const { client, reqs } = clientFake('{"next_queries":[{"q":"lacuna"}]}');
    const qs = await followUpsWithLlm(client, followUpCtx());
    assert.deepEqual(qs, [{ id: 'r2q1', q: 'lacuna', sub: 'follow-up', category: null }]);
    assert.equal(reqs[0].temperature, 0.2);
    assert.equal(reqs[0].maxTokens, 900);
    assert.equal(reqs[0].timeoutMs, 45_000);

    const vazio = clientFake('{"outra_chave": 1}');
    assert.deepEqual(await followUpsWithLlm(vazio.client, followUpCtx()), []);
  });
});

// ─── o laço plan() ───────────────────────────────────────────────────────────

describe('cx/researchPlanner: plan() — validação e brave obrigatória', () => {
  it('assunto vazio LANÇA antes de qualquer coisa', async () => {
    const search = multiSearchFake(() => ({ results: [], errors: [] }));
    await assert.rejects(() => createResearchPlanner(depsCom(search)).plan('   '), /Assunto de pesquisa vazio/);
    assert.deepEqual(search.chamadas, []);
  });

  it('sem chave Brave ⇒ research:done {errorKind:"brave-missing"} E erro com code BRAVE_KEY_MISSING (nenhuma query roda)', async () => {
    const search = multiSearchFake(() => ({ results: [], errors: [] }));
    const eventos: Array<Record<string, unknown>> = [];
    await assert.rejects(
      () =>
        createResearchPlanner(depsCom(search, {}, '')).plan('funções', {
          onProgress: (e) => eventos.push(e as unknown as Record<string, unknown>),
        }),
      (e: unknown) => (e as Error & { code?: string }).code === 'BRAVE_KEY_MISSING',
    );
    assert.deepEqual(search.chamadas, []);
    assert.deepEqual(eventos, [
      { kind: 'research:done', sources: 0, rounds: 0, stopReason: 'brave-missing', errorKind: 'brave-missing' },
    ]);
  });

  it('resolveApiKey que LANÇA degrada igual a chave vazia', async () => {
    const search = multiSearchFake(() => ({ results: [], errors: [] }));
    const planner = createResearchPlanner(
      depsCom(search, {
        resolveApiKey: async () => {
          throw new Error('settings quebrado');
        },
      }),
    );
    await assert.rejects(() => planner.plan('funções'), (e: unknown) => (e as Error & { code?: string }).code === 'BRAVE_KEY_MISSING');
  });

  it('chave rejeitada (401/403) em TODAS as queries sem fonte ⇒ BRAVE_KEY_INVALID + done errorKind', async () => {
    const search = multiSearchFake((queries) => ({
      results: [],
      errors: queries.map((q) => ({ query: q, error: '401', code: 'BRAVE_KEY_INVALID' })),
    }));
    const eventos: Array<Record<string, unknown>> = [];
    await assert.rejects(
      () =>
        createResearchPlanner(depsCom(search)).plan('funções', {
          onProgress: (e) => eventos.push(e as unknown as Record<string, unknown>),
        }),
      (e: unknown) => (e as Error & { code?: string }).code === 'BRAVE_KEY_INVALID',
    );
    const done = eventos.find((e) => e.kind === 'research:done');
    assert.deepEqual(done, {
      kind: 'research:done',
      sources: 0,
      rounds: 1,
      stopReason: 'brave-key-invalid',
      errorKind: 'brave-key-invalid',
    });
  });
});

describe('cx/researchPlanner: plan() — rodadas, eventos e dedup', () => {
  it('caminho heurístico: ordem dos eventos, dedup por URL e stopReason do cap de rodadas', async () => {
    const search = multiSearchFake((queries) => ({
      results: queries.map((q, i) => finding({ query: q, url: i % 2 === 0 ? 'https://u/par' : 'https://u/impar' })),
      errors: [],
    }));
    const eventos: Array<Record<string, unknown>> = [];
    const plano = await createResearchPlanner(depsCom(search)).plan('  funções  ', {
      onProgress: (e) => eventos.push(e as unknown as Record<string, unknown>),
    });

    assert.equal(plano.subject, 'funções');
    assert.deepEqual(plano.queries, defaultQueriesFor('funções'));
    assert.deepEqual(
      plano.findings.map((f) => f.url),
      ['https://u/par', 'https://u/impar'],
      'dedup por URL entre queries',
    );
    assert.equal(plano.rounds, 1);
    assert.equal(plano.stopReason, 'limite de rodadas atingido (1)');
    assert.ok(plano.createdAt);

    // ordem garantida por rodada: plan → round-start → (query-start → query-done)* → round-done → done
    assert.deepEqual(
      eventos.map((e) => e.kind),
      [
        'research:plan',
        'research:round-start',
        ...Array.from({ length: 6 }, () => ['research:query-start', 'research:query-done']).flat(),
        'research:round-done',
        'research:done',
      ],
    );
    const plan = eventos[0];
    assert.equal(plan.maxRounds, 1, 'sem ANALISTA ⇒ totalRounds 1');
    const roundDone = eventos.find((e) => e.kind === 'research:round-done');
    assert.deepEqual(roundDone, {
      kind: 'research:round-done',
      round: 1,
      ok: 6,
      failed: 0,
      uniqueSources: 2,
    });
  });

  it('maxResults corta o topo; findings com score saem ordenados por score DESC', async () => {
    const search = multiSearchFake(() => ({
      results: [
        finding({ url: 'https://u/1', score: 1 }),
        finding({ url: 'https://u/5', score: 5 }),
        finding({ url: 'https://u/3', score: 3 }),
      ],
      errors: [],
    }));
    const plano = await createResearchPlanner(depsCom(search)).plan('funções', { maxResults: 2 });
    assert.deepEqual(
      plano.findings.map((f) => f.url),
      ['https://u/5', 'https://u/3'],
    );
  });

  it('planner LLM que devolve ZERO queries degrada para a heurística (resposta > erro)', async () => {
    const search = multiSearchFake(() => ({ results: [], errors: [] }));
    const planner = createResearchPlanner(
      depsCom(search, { generatePlan: async () => heuristicPlanFor('irrelevante') /* re-normalizado abaixo */ }),
    );
    // generatePlan devolvendo plano SEM queries ⇒ throw interno ⇒ heurística.
    const plannerZero = createResearchPlanner(
      depsCom(search, {
        generatePlan: async () => ({ subQuestions: [], queries: [], successCriteria: [], maxRounds: 1 }),
      }),
    );
    const plano = await plannerZero.plan('funções');
    assert.deepEqual(plano.queries, defaultQueriesFor('funções'), 'heurística assumiu');
    void planner;
  });

  it('generatePlan válido vence a heurística; generateQueries legado infere categoria/sub', async () => {
    const search = multiSearchFake(() => ({ results: [], errors: [] }));
    const comPlano = createResearchPlanner(
      depsCom(search, {
        generatePlan: async () => ({
          subQuestions: [{ id: 'sq9', question: 'p' }],
          queries: [{ id: 'qz', q: 'query do llm', sub: 'sq9', category: 'comparison' }],
          successCriteria: [],
          maxRounds: 2,
        }),
      }),
    );
    const p1 = await comPlano.plan('funções');
    assert.deepEqual(p1.queries, ['query do llm']);
    assert.deepEqual(search.chamadas[0], ['query do llm']);

    const legado = createResearchPlanner(
      depsCom(search, {
        generateQueries: async () => ['x erros comuns', 'abc', '', 'y', 'z'.repeat(130)],
      }),
    );
    const p2 = await legado.plan('funções');
    assert.deepEqual(p2.queries, ['x erros comuns', 'abc'], 'vazias/curtas/longas demais filtradas');
  });

  it('COM analista: rodada 2 só com follow-up NOVO; sem novidade/analista quebrado ⇒ stopReasons próprios', async () => {
    // (a) follow-up novo ⇒ 2 rodadas.
    const search = multiSearchFake(() => ({ results: [], errors: [] }));
    const comNovidade = createResearchPlanner(
      depsCom(search, {
        generateFollowUps: async () => [
          { id: 'r2q1', q: 'follow-up novo', sub: 'sq1', category: null },
        ],
      }),
    );
    const pa = await comNovidade.plan('funções');
    assert.equal(pa.rounds, 2);
    assert.equal(pa.stopReason, 'limite de rodadas atingido (2)');
    assert.deepEqual(search.chamadas.length, 2);
    assert.deepEqual(search.chamadas[1], ['follow-up novo']);

    // (b) analista devolve só query já executada.
    const search2 = multiSearchFake(() => ({ results: [], errors: [] }));
    const repetido = createResearchPlanner(
      depsCom(search2, {
        generateFollowUps: async (ctx) => [{ id: 'x', q: ctx.alreadyRan[0], sub: 'sq1', category: null }],
      }),
    );
    const pb = await repetido.plan('funções');
    assert.equal(pb.rounds, 1);
    assert.equal(pb.stopReason, 'analista não sugeriu follow-ups novos — pesquisa concluída');

    // (c) analista LANÇA ⇒ sem rodada extra.
    const search3 = multiSearchFake(() => ({ results: [], errors: [] }));
    const quebrado = createResearchPlanner(
      depsCom(search3, {
        generateFollowUps: async () => {
          throw new Error('analista fora');
        },
      }),
    );
    const pc = await quebrado.plan('funções');
    assert.equal(pc.rounds, 1);
    assert.equal(pc.stopReason, 'analista indisponível — sem rodada extra');
    assert.equal(search3.chamadas.length, 1);
  });

  it('429 numa query CANCELA a rodada de follow-up (degradação documentada)', async () => {
    const search: MultiSearchFake = {
      chamadas: [],
      fn: async (queries, opts) => {
        search.chamadas.push([...queries]);
        for (const q of queries) {
          opts?.onQueryStart?.(q);
          opts?.onQueryDone?.({
            query: q,
            ok: false,
            provider: 'brave',
            error: { code: 'BRAVE_RATE_LIMIT', message: '429' },
          });
        }
        return {
          results: [],
          errors: queries.map((q) => ({ query: q, error: '429', code: 'BRAVE_RATE_LIMIT' })),
        };
      },
    };
    let analistaChamado = false;
    const planner = createResearchPlanner(
      depsCom(search, {
        generateFollowUps: async () => {
          analistaChamado = true;
          return [{ id: 'r', q: 'novo', sub: 'sq1', category: null }];
        },
      }),
    );
    const p = await planner.plan('funções');
    assert.equal(p.stopReason, 'rate limit (429) — sem rodada de follow-up');
    assert.equal(p.rounds, 1);
    assert.equal(analistaChamado, false, 'analista nem é chamado sob rate limit');
  });

  it('falha de infra do multiSearch degrada a rodada inteira (sem lançar, sem fontes)', async () => {
    const search: MultiSearchFake = {
      chamadas: [],
      fn: async () => {
        throw new Error('infra quebrou');
      },
    };
    const p = await createResearchPlanner(depsCom(search)).plan('funções');
    assert.deepEqual(p.findings, []);
    assert.equal(p.rounds, 1);
  });
});
