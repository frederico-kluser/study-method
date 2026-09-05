/**
 * tests/engineResearchCamadas.test.ts — a CAMADA DE PESQUISA EM CAMADAS COM
 * PROCEDÊNCIA (`electron/main/engine/research/**`).
 *
 * A suíte inteira roda OFFLINE: sem rede, sem chave, sem processo. O executor
 * de subprocesso é INJETADO (mesma disciplina do `fetchImpl` de
 * `braveSearchService` e da `Busca` injetada da fase F1), e o transporte de LLM
 * também. Nenhum teste daqui invoca o surf de verdade.
 *
 * O que morde aqui:
 *   - o envelope `--json` do surf, com a forma MEDIDA numa execução real
 *     (2026-09-05): `sources[]` tem `n,url,title,date` e NÃO tem descrição — o
 *     trecho vive em `ledger.rows[].results[].content` e o join é por URL;
 *   - `TrackSourceLink` é o formato de saída (o que a aula já carrega), não um
 *     formato novo;
 *   - o brief é montado do CONTEXTO da trilha (unidade, público, o que já foi
 *     ensinado) e muda por camada;
 *   - o anti-padrão "pense profundamente, passo a passo" não pode voltar:
 *     contexto ou brief que o carregue é REJEITADO;
 *   - os cinco códigos de saída do surf, um a um: 0 · 1 · 2 · 78 · 143;
 *   - 143 é TROCA DE FERRAMENTA (uma vez), nunca retry — e não existe sleep,
 *     jitter ou backoff em volta do surf em lugar nenhum do módulo;
 *   - o portão de qualidade fail-closed: colheita vazia, fonte sem URL,
 *     afirmação sem fonte e citação inventada REPROVAM.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { EngineLlm, LlmCallRequest } from '../electron/main/engine/runtime/callLlm';
import {
  BIN_SURF,
  PESQUISA_CODES,
  PesquisaError,
  REPROVACOES,
  SCHEMA_PESQUISA_EM_CAMADAS,
  SURF_EXIT,
  TETO_DESCRICAO,
  contemImperativoDeProfundidade,
  criarAnalisadorLlm,
  criarPesquisaEmCamadas,
  exigirAprovacao,
  extrairJson,
  filtrarLacunasRepetidas,
  fontesDoEnvelope,
  interpretarSaidaDoSurf,
  montarArgv,
  montarBrief,
  montarPromptDaAnalise,
  normalizarAnalise,
  parseEnvelopeDoSurf,
  portaoDeQualidade,
  redigirSegredos,
  validarConfig,
  validarContexto,
  type AnaliseDaColheita,
  type ConfigDaPesquisa,
  type ContextoDaTrilha,
  type EntradaDaAnalise,
  type ExecutorDeProcesso,
  type SaidaDoProcesso,
} from '../electron/main/engine/research';

// ───────────────────────────────────────────────────────────────────────────
// Fixtures — a FORMA vem da execução real medida em 2026-09-05:
//   surf-search-normal "what does Python's built-in print() function return" \
//     --task … --goal … --insights … --deliverable … --sub-agents=5 --json
//   → exit 0 · 5 queries · 21 fontes · 3481 ms · 2 etapas degradadas
// As duas URLs abaixo são fontes reais daquela colheita.
// ───────────────────────────────────────────────────────────────────────────

const URL_A = 'https://www.geeksforgeeks.org/python/difference-between-return-and-print-in-python';
const URL_B = 'https://realpython.com/python-print';

function envelopeMedido(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    operation: 'surf-ai',
    mode: 'normal',
    answer: '> ⚠ **Degraded mode — no LLM synthesis.**',
    synthesized: false,
    rounds: 1,
    waves: 1,
    frontier: { pending: [], seen_queries: [] },
    stop_reason: 'normal mode: a single wave by design',
    plan: {
      restated_objective: 'medir a forma do envelope',
      sub_questions: [{ id: 'sq1', question: 'o que print() devolve', why: 'a pergunta como feita' }],
      success_criteria: ['a pergunta é respondida com ao menos uma fonte citada'],
      queries: [{ id: 'h1', q: 'o que print() devolve', sub: 'sq1', category: 'community', priority: 0.9 }],
    },
    analysis: null,
    sources: [
      { n: 1, url: URL_A, title: 'Difference between return and print in Python - GeeksforGeeks', date: '2025-07-23T15:58:43' },
      { n: 2, url: URL_B, title: 'Your Guide to the Python print() Function – Real Python', date: '2026-07-03T10:29:58' },
    ],
    ledger: {
      stats: { queries: 1, succeeded: 1, failed: 0, sources: 2, credits: 1 },
      sources: [],
      rows: [
        {
          round: 1,
          id: 'h1',
          sub: 'sq1',
          category: 'community',
          parent: null,
          depth: 0,
          kind: 'breadth',
          query: 'o que print() devolve',
          ok: true,
          provider: 'brave',
          latency_ms: 638,
          credits: 1,
          answer: null,
          results: [
            { n: 1, url: URL_A, title: 'GeeksforGeeks', date: null, content: 'print exibe no console; return devolve valor da função' },
            { n: 2, url: URL_B, title: 'Real Python', date: null, content: 'curto' },
            { n: 2, url: URL_B, title: 'Real Python', date: null, content: 'print() escreve no stdout e devolve None' },
          ],
        },
      ],
    },
    diagnostics: {
      mode: 'normal',
      harness: 'claude-code',
      subAgents: 5,
      maxDepth: 2,
      models: ['deepseek/deepseek-v4-pro'],
      llm_calls: [],
      degraded: [
        { stage: 'plan', reason: 'every OpenRouter model/key combination failed' },
        { stage: 'synthesize', reason: 'no usable OpenRouter key' },
      ],
      budget_ms: 300000,
    },
    elapsed_ms: 3481,
    ...over,
  };
}

const STDOUT_MEDIDO = JSON.stringify(envelopeMedido());

function envelopeVazio(): string {
  return JSON.stringify(
    envelopeMedido({
      sources: [],
      ledger: {
        stats: { queries: 1, succeeded: 1, failed: 0, sources: 0, credits: 1 },
        sources: [],
        rows: [
          { round: 1, id: 'h1', sub: 'sq1', category: null, parent: null, depth: 0, kind: 'breadth', query: 'nada', ok: true, results: [] },
        ],
      },
    }),
  );
}

const CTX: ContextoDaTrilha = {
  tema: 'Python do zero ao sênior',
  linguagem: 'python',
  publico: 'quem nunca programou na vida',
  unidade: 'M1 · A saída: print',
  objetivo: 'ensinar a imprimir um texto na tela e nada além disso',
  jaEnsinado: [],
};

const CTX_AVANCADO: ContextoDaTrilha = {
  ...CTX,
  unidade: 'M4 · Funções que devolvem valor',
  objetivo: 'ensinar a diferença entre imprimir e retornar',
  jaEnsinado: ['print de literal', 'variáveis', 'if/else', 'laço for'],
};

const CFG: ConfigDaPesquisa = {
  camadas: 2,
  subAgents: 5,
  timeoutMsPorCamada: 300_000,
  timeoutMsDaAnalise: 120_000,
  maxDepth: 3,
  maxRounds: 4,
  lacunasPorCamada: 2,
  stageVersion: 'pesquisa@1',
};

function ctxDeSaida(bin: string = BIN_SURF.normal): { bin: string; args: string[]; etapa: string } {
  return { bin, args: ['pergunta', '--json'], etapa: 'teste' };
}

function saida(over: Partial<SaidaDoProcesso>): SaidaDoProcesso {
  return { code: 0, stdout: '', stderr: '', ...over };
}

// ───────────────────────────────────────────────────────────────────────────
describe('envelope --json do surf (forma MEDIDA)', () => {
  it('parseia o envelope real: sources[] tem n,url,title,date e NADA mais', () => {
    const env = parseEnvelopeDoSurf(STDOUT_MEDIDO);
    assert.equal(env.sources.length, 2);
    assert.deepEqual(Object.keys(env.sources[0]).sort(), ['date', 'n', 'title', 'url']);
    assert.equal(env.sources[0].url, URL_A);
    assert.equal(env.sources[0].n, 1);
    assert.equal(env.synthesized, false, 'a execução medida veio com synthesized:false');
    assert.equal(env.diagnostics.degraded.length, 2);
    assert.equal(env.ledger.rows[0].provider, 'brave');
  });

  it('stdout vazio, texto não-JSON, JSON não-objeto e envelope sem ledger.rows são ENVELOPE_INVALIDO', () => {
    for (const entrada of ['', '   ', 'surf: colhendo…', '[]', '{"sources":[]}']) {
      assert.throws(
        () => parseEnvelopeDoSurf(entrada),
        (e: unknown) => e instanceof PesquisaError && e.code === PESQUISA_CODES.ENVELOPE_INVALIDO,
        `entrada ${JSON.stringify(entrada)} deveria reprovar`,
      );
    }
  });

  it('envelope sem `sources` é ENVELOPE_INVALIDO mesmo com ledger válido', () => {
    const semSources = JSON.parse(STDOUT_MEDIDO) as Record<string, unknown>;
    delete semSources['sources'];
    assert.throws(
      () => parseEnvelopeDoSurf(JSON.stringify(semSources)),
      (e: unknown) => e instanceof PesquisaError && e.code === PESQUISA_CODES.ENVELOPE_INVALIDO,
    );
  });

  it('tolera os campos que a execução real NÃO trouxe (score, answer, analysis)', () => {
    const env = parseEnvelopeDoSurf(STDOUT_MEDIDO);
    assert.equal(env.ledger.rows[0].results[0].score, undefined);
    assert.equal(env.analysis, null);
  });
});

describe('envelope → TrackSourceLink (o formato que a aula JÁ tem)', () => {
  it('a descrição vem do trecho do LEDGER, porque sources[] não tem descrição', () => {
    const { fontes } = fontesDoEnvelope(parseEnvelopeDoSurf(STDOUT_MEDIDO));
    const a = fontes.find((f) => f.link.url === URL_A);
    assert.ok(a);
    assert.equal(a.link.description, 'print exibe no console; return devolve valor da função');
    assert.deepEqual(Object.keys(a.link).sort(), ['description', 'title', 'url']);
  });

  it('entre dois trechos da MESMA url, fica o mais longo (mais evidência)', () => {
    const { fontes } = fontesDoEnvelope(parseEnvelopeDoSurf(STDOUT_MEDIDO));
    const b = fontes.find((f) => f.link.url === URL_B);
    assert.ok(b);
    assert.equal(b.link.description, 'print() escreve no stdout e devolve None');
  });

  it('guarda a procedência: número de citação e as queries que trouxeram a url', () => {
    const { fontes } = fontesDoEnvelope(parseEnvelopeDoSurf(STDOUT_MEDIDO));
    assert.equal(fontes[0].citacao, 1);
    assert.deepEqual(fontes[0].queries, ['h1']);
    assert.equal(fontes[0].publicadaEm, '2025-07-23T15:58:43');
  });

  it('url sem esquema/host é REJEITADA e registrada — nunca emitida em silêncio', () => {
    const env = parseEnvelopeDoSurf(
      JSON.stringify(envelopeMedido({ sources: [{ n: 1, url: '/apenas/um/caminho', title: 'sem host', date: null }] })),
    );
    const { fontes, rejeitadas } = fontesDoEnvelope(env);
    assert.equal(fontes.length, 0);
    assert.equal(rejeitadas.length, 1);
    assert.match(rejeitadas[0].motivo, /citável/);
  });

  it('título vazio vira a URL (o schema da aula exige title não-vazio)', () => {
    const env = parseEnvelopeDoSurf(
      JSON.stringify(envelopeMedido({ sources: [{ n: 1, url: URL_A, title: '', date: null }] })),
    );
    const { fontes } = fontesDoEnvelope(env);
    assert.equal(fontes[0].link.title, URL_A);
  });

  it('descrição longa é truncada no teto, com reticência', () => {
    const gigante = 'x'.repeat(TETO_DESCRICAO + 200);
    const env = parseEnvelopeDoSurf(
      JSON.stringify(
        envelopeMedido({
          sources: [{ n: 1, url: URL_A, title: 't', date: null }],
          ledger: {
            stats: { queries: 1, succeeded: 1, failed: 0, sources: 1, credits: 1 },
            sources: [],
            rows: [
              { round: 1, id: 'h1', sub: null, category: null, parent: null, depth: 0, kind: 'breadth', query: 'q', ok: true,
                results: [{ n: 1, url: URL_A, title: 't', date: null, content: gigante }] },
            ],
          },
        }),
      ),
    );
    const { fontes } = fontesDoEnvelope(env);
    assert.equal(fontes[0].link.description.length, TETO_DESCRICAO);
    assert.ok(fontes[0].link.description.endsWith('…'));
  });

  it('a mesma url em duas fontes não vira duas entradas', () => {
    const env = parseEnvelopeDoSurf(
      JSON.stringify(
        envelopeMedido({
          sources: [
            { n: 1, url: URL_A, title: 'um', date: null },
            { n: 2, url: URL_A, title: 'dois', date: null },
          ],
        }),
      ),
    );
    assert.equal(fontesDoEnvelope(env).fontes.length, 1);
  });
});

describe('brief adaptado ao contexto real da trilha', () => {
  it('a camada 1 fala da unidade, do público e da linguagem — não é prompt fixo', () => {
    const b = montarBrief(CTX_AVANCADO, 'levantamento');
    assert.match(b.task, /M4 · Funções que devolvem valor/);
    assert.match(b.task, /quem nunca programou na vida/);
    assert.match(b.goal, /python/);
    assert.match(b.insights, /print de literal; variáveis; if\/else; laço for/);
  });

  it('primeira unidade (jaEnsinado vazio) muda o insights, não some com ele', () => {
    const b = montarBrief(CTX, 'levantamento');
    assert.match(b.insights, /PRIMEIRA unidade/);
    assert.doesNotMatch(b.insights, /já ensinou/);
  });

  it('duas unidades diferentes da MESMA trilha produzem briefs diferentes', () => {
    const b1 = montarBrief(CTX, 'levantamento');
    const b2 = montarBrief(CTX_AVANCADO, 'levantamento');
    assert.notEqual(b1.task, b2.task);
    assert.notEqual(b1.goal, b2.goal);
    assert.notEqual(b1.insights, b2.insights);
  });

  it('camada de aprofundamento sem lacuna alvo é CONFIG_INVALIDA', () => {
    assert.throws(
      () => montarBrief(CTX, 'aprofundamento'),
      (e: unknown) => e instanceof PesquisaError && e.code === PESQUISA_CODES.CONFIG_INVALIDA,
    );
  });

  it('camada de aprofundamento pergunta a LACUNA, não a pergunta da camada 1', () => {
    const b = montarBrief(CTX, 'aprofundamento', {
      id: 'l1',
      pergunta: 'print() aceita mais de um argumento posicional?',
      porque: 'a camada 1 não trouxe evidência sobre sep/end',
    });
    assert.equal(b.question, 'print() aceita mais de um argumento posicional?');
    assert.match(b.goal, /fechar UMA lacuna/);
    assert.match(b.insights, /repetir a busca larga não acrescenta nada/);
  });

  it('contexto sem campo obrigatório é CONTEXTO_INVALIDO (nenhum default sorrateiro)', () => {
    for (const campo of ['tema', 'linguagem', 'publico', 'unidade', 'objetivo'] as const) {
      const quebrado = { ...CTX, [campo]: '  ' };
      assert.throws(
        () => validarContexto(quebrado),
        (e: unknown) =>
          e instanceof PesquisaError &&
          e.code === PESQUISA_CODES.CONTEXTO_INVALIDO &&
          e.details['campo'] === campo,
      );
    }
  });

  it('jaEnsinado que não é array é CONTEXTO_INVALIDO (vazio é válido; ausente não)', () => {
    assert.throws(
      () => validarContexto({ ...CTX, jaEnsinado: undefined as unknown as string[] }),
      (e: unknown) => e instanceof PesquisaError && e.code === PESQUISA_CODES.CONTEXTO_INVALIDO,
    );
  });
});

describe('o anti-padrão declarado não pode voltar', () => {
  it('detecta as formas imperativas conhecidas, pt-BR e en', () => {
    for (const t of [
      'pense profundamente sobre isso',
      'Pense passo a passo antes de responder',
      'raciocine passo a passo',
      'think step by step',
      'Think step-by-step',
      'think deeply about the answer',
      'use chain-of-thought',
    ]) {
      assert.equal(contemImperativoDeProfundidade(t), true, t);
    }
  });

  it('NÃO reprova prosa didática legítima (limite declarado)', () => {
    for (const t of [
      'um roteiro passo a passo da instalação',
      'o aluno acompanha o exemplo passo a passo',
      'profundidade de recursão',
    ]) {
      assert.equal(contemImperativoDeProfundidade(t), false, t);
    }
  });

  it('contexto que carrega o imperativo é REJEITADO antes de montar o brief', () => {
    assert.throws(
      () => montarBrief({ ...CTX, objetivo: 'pense profundamente sobre print' }, 'levantamento'),
      (e: unknown) => e instanceof PesquisaError && e.code === PESQUISA_CODES.IMPERATIVO_DE_PROFUNDIDADE,
    );
  });

  it('nenhum campo do brief gerado carrega imperativo de profundidade', () => {
    for (const ctx of [CTX, CTX_AVANCADO]) {
      const b = montarBrief(ctx, 'levantamento');
      for (const campo of [b.question, b.task, b.goal, b.insights, b.deliverable]) {
        assert.equal(contemImperativoDeProfundidade(campo), false, campo);
      }
    }
  });

  it('montarArgv também recusa um brief contaminado (segunda porta)', () => {
    assert.throws(
      () =>
        montarArgv(
          { question: 'q', task: 't', goal: 'think step by step', insights: 'i', deliverable: 'd' },
          { ferramenta: 'normal', subAgents: 5 },
        ),
      (e: unknown) => e instanceof PesquisaError && e.code === PESQUISA_CODES.IMPERATIVO_DE_PROFUNDIDADE,
    );
  });
});

describe('montagem do comando (vetor, nunca string de shell)', () => {
  const brief = montarBrief(CTX, 'levantamento');

  it('passa os quatro campos do brief, --sub-agents e SEMPRE --json', () => {
    const { bin, args } = montarArgv(brief, { ferramenta: 'normal', subAgents: 5 });
    assert.equal(bin, 'surf-search-normal');
    assert.equal(args[0], brief.question);
    for (const flag of ['--task', '--goal', '--insights', '--deliverable']) {
      assert.ok(args.includes(flag), `faltou ${flag}`);
    }
    assert.ok(args.includes('--sub-agents=5'));
    assert.ok(args.includes('--json'));
    assert.equal(args.filter((a) => a === '--json').length, 1);
  });

  it('o valor de cada flag é um ARGUMENTO próprio — nada de aspas montadas à mão', () => {
    const { args } = montarArgv(brief, { ferramenta: 'normal', subAgents: 5 });
    assert.equal(args[args.indexOf('--task') + 1], brief.task);
    assert.equal(args[args.indexOf('--goal') + 1], brief.goal);
    for (const a of args) assert.doesNotMatch(a, /^"|"$/);
  });

  it('escolhe o binário por ferramenta e aceita override', () => {
    assert.equal(montarArgv(brief, { ferramenta: 'unlimit', subAgents: 5 }).bin, 'surf-search-unlimit');
    assert.equal(montarArgv(brief, { ferramenta: 'normal', subAgents: 5, binario: '/tmp/fake' }).bin, '/tmp/fake');
  });

  it('--max-depth e --max-rounds entram como parâmetros de PROFUNDIDADE', () => {
    const { args } = montarArgv(brief, { ferramenta: 'unlimit', subAgents: 5, maxDepth: 4, maxRounds: 3 });
    assert.equal(args[args.indexOf('--max-depth') + 1], '4');
    assert.equal(args[args.indexOf('--max-rounds') + 1], '3');
  });

  it('--max-rounds no surf-search-normal é CONFIG_INVALIDA (ele roda UMA onda por design)', () => {
    assert.throws(
      () => montarArgv(brief, { ferramenta: 'normal', subAgents: 5, maxRounds: 3 }),
      (e: unknown) => e instanceof PesquisaError && e.code === PESQUISA_CODES.CONFIG_INVALIDA,
    );
  });

  it('valores fora das faixas medidas no --help são CONFIG_INVALIDA (o surf sairia 2)', () => {
    const casos: { subAgents?: number; maxDepth?: number }[] = [
      { subAgents: 0 },
      { subAgents: 21 },
      { subAgents: 5, maxDepth: 7 },
      { subAgents: 5, maxDepth: 0 },
    ];
    for (const caso of casos) {
      assert.throws(
        () => montarArgv(brief, { ferramenta: 'normal', subAgents: caso.subAgents ?? 5, ...(caso.maxDepth !== undefined ? { maxDepth: caso.maxDepth } : {}) }),
        (e: unknown) => e instanceof PesquisaError && e.code === PESQUISA_CODES.CONFIG_INVALIDA,
        JSON.stringify(caso),
      );
    }
  });
});

describe('os cinco códigos de saída do surf, um a um', () => {
  it('0 → colheita, com o envelope parseado', () => {
    const r = interpretarSaidaDoSurf(saida({ code: SURF_EXIT.OK, stdout: STDOUT_MEDIDO }), ctxDeSaida());
    assert.equal(r.tipo, 'colheita');
    assert.equal(r.exitCode, 0);
    assert.equal(r.envelope.sources.length, 2);
  });

  it('1 COM envelope → vazio REGISTRADO (o cli.mjs escreve o JSON antes de sair 1)', () => {
    const r = interpretarSaidaDoSurf(saida({ code: SURF_EXIT.NADA_COLHIDO, stdout: envelopeVazio() }), ctxDeSaida());
    assert.equal(r.tipo, 'vazio');
    assert.equal(r.exitCode, 1);
    assert.equal(r.envelope.ledger.rows.length, 1, 'o plano e o ledger do vazio são preservados');
  });

  it('1 SEM envelope → SURF_FALHOU (veio do reportAiError genérico, não é colheita vazia)', () => {
    assert.throws(
      () => interpretarSaidaDoSurf(saida({ code: 1, stdout: '', stderr: '❌ Error: boom' }), ctxDeSaida()),
      (e: unknown) => e instanceof PesquisaError && e.code === PESQUISA_CODES.SURF_FALHOU,
    );
  });

  it('2 → SURF_USO_INVALIDO, nomeando o defeito como MEU (comando montado errado)', () => {
    assert.throws(
      () => interpretarSaidaDoSurf(saida({ code: SURF_EXIT.USO_INVALIDO, stderr: '❌ Error: unknown flag' }), ctxDeSaida()),
      (e: unknown) =>
        e instanceof PesquisaError &&
        e.code === PESQUISA_CODES.SURF_USO_INVALIDO &&
        /montado errado por ESTE módulo/.test(e.message),
    );
  });

  it('78 → SURF_SEM_CHAVE, dizendo que retentar é inútil (EX_CONFIG)', () => {
    assert.throws(
      () => interpretarSaidaDoSurf(saida({ code: SURF_EXIT.SEM_CHAVE_BRAVE, stderr: 'no valid Brave key' }), ctxDeSaida()),
      (e: unknown) =>
        e instanceof PesquisaError &&
        e.code === PESQUISA_CODES.SURF_SEM_CHAVE &&
        /retentar é inútil/.test(e.message),
    );
  });

  it('143 → SURF_MORTO_POR_TIMEOUT, prescrevendo o surf-search-normal', () => {
    assert.throws(
      () => interpretarSaidaDoSurf(saida({ code: SURF_EXIT.MORTO_POR_SIGTERM }), ctxDeSaida(BIN_SURF.unlimit)),
      (e: unknown) =>
        e instanceof PesquisaError &&
        e.code === PESQUISA_CODES.SURF_MORTO_POR_TIMEOUT &&
        /surf-search-normal/.test(e.message),
    );
  });

  it('morto pelo NOSSO deadline cai no MESMO tratamento do 143', () => {
    assert.throws(
      () => interpretarSaidaDoSurf(saida({ code: 0, mortoPorTimeout: true }), ctxDeSaida(BIN_SURF.unlimit)),
      (e: unknown) => e instanceof PesquisaError && e.code === PESQUISA_CODES.SURF_MORTO_POR_TIMEOUT,
    );
  });

  it('qualquer outro não-zero é SURF_FALHOU, com o exit code preservado', () => {
    assert.throws(
      () => interpretarSaidaDoSurf(saida({ code: 127, stderr: 'command not found' }), ctxDeSaida()),
      (e: unknown) => e instanceof PesquisaError && e.code === PESQUISA_CODES.SURF_FALHOU && e.details['exitCode'] === 127,
    );
  });

  it('nenhum segredo vaza do stderr para o erro estruturado', () => {
    const stderrComSegredo = 'auth failed with BSAbcdefghijklmnopqrstuvwxyz01 and sk-or-v1-deadbeefcafe';
    try {
      interpretarSaidaDoSurf(saida({ code: SURF_EXIT.SEM_CHAVE_BRAVE, stderr: stderrComSegredo }), ctxDeSaida());
      assert.fail('deveria lançar');
    } catch (e) {
      assert.ok(e instanceof PesquisaError);
      const serializado = JSON.stringify(e.details);
      assert.doesNotMatch(serializado, /BSAbcdefghijklmnopqrstuvwxyz01/);
      assert.doesNotMatch(serializado, /sk-or-v1-deadbeefcafe/);
      assert.match(serializado, /REDIGIDO/);
    }
  });

  it('redigirSegredos não estraga uma URL comum', () => {
    assert.equal(redigirSegredos(URL_A), URL_A);
  });
});

describe('portão de qualidade — fail-closed', () => {
  const fonteOk = {
    link: { title: 'GfG', url: URL_A, description: 'trecho' },
    citacao: 1,
    queries: ['h1'],
    publicadaEm: null,
  };

  it('colheita completa e rastreável APROVA e devolve TrackSourceLink[]', () => {
    const r = portaoDeQualidade({
      fontes: [fonteOk],
      afirmacoes: [{ id: 'a1', texto: 'print escreve no stdout', fontes: [URL_A] }],
    });
    assert.equal(r.aprovado, true);
    assert.deepEqual(r.fontesAprovadas, [{ title: 'GfG', url: URL_A, description: 'trecho' }]);
  });

  it('colheita VAZIA reprova (nunca "aprovado com zero itens")', () => {
    const r = portaoDeQualidade({ fontes: [], afirmacoes: [{ id: 'a1', texto: 'x', fontes: [URL_A] }] });
    assert.equal(r.aprovado, false);
    assert.ok(r.reprovacoes.some((x) => x.motivo === REPROVACOES.COLHEITA_VAZIA));
  });

  it('fonte sem URL resolvível reprova', () => {
    const r = portaoDeQualidade({
      fontes: [{ ...fonteOk, link: { title: 't', url: 'nao-e-url', description: '' } }],
      afirmacoes: [{ id: 'a1', texto: 'x', fontes: [URL_A] }],
    });
    assert.ok(r.reprovacoes.some((x) => x.motivo === REPROVACOES.FONTE_SEM_URL));
  });

  it('fonte sem título reprova (o schema da aula exige title e url)', () => {
    const r = portaoDeQualidade({
      fontes: [{ ...fonteOk, link: { title: '   ', url: URL_A, description: 'x' } }],
      afirmacoes: [{ id: 'a1', texto: 'x', fontes: [URL_A] }],
    });
    assert.ok(r.reprovacoes.some((x) => x.motivo === REPROVACOES.FONTE_SEM_TITULO));
  });

  it('afirmação SEM fonte reprova', () => {
    const r = portaoDeQualidade({ fontes: [fonteOk], afirmacoes: [{ id: 'a1', texto: 'órfã', fontes: [] }] });
    assert.ok(r.reprovacoes.some((x) => x.motivo === REPROVACOES.AFIRMACAO_SEM_FONTE));
  });

  it('afirmação que cita URL fora da colheita reprova como CITAÇÃO INVENTADA', () => {
    const r = portaoDeQualidade({
      fontes: [fonteOk],
      afirmacoes: [{ id: 'a1', texto: 'x', fontes: ['https://exemplo.invalido/inventado'] }],
    });
    const rep = r.reprovacoes.find((x) => x.motivo === REPROVACOES.AFIRMACAO_COM_FONTE_DESCONHECIDA);
    assert.ok(rep);
    assert.match(rep.mensagem, /inventada/);
  });

  it('zero afirmações reprova (não há o que a aula ensine)', () => {
    const r = portaoDeQualidade({ fontes: [fonteOk], afirmacoes: [] });
    assert.ok(r.reprovacoes.some((x) => x.motivo === REPROVACOES.SEM_AFIRMACAO));
  });

  it('fonte sem descrição é AVISO, não reprovação (a Brave nem sempre devolve trecho)', () => {
    const r = portaoDeQualidade({
      fontes: [{ ...fonteOk, link: { title: 't', url: URL_A, description: '' } }],
      afirmacoes: [{ id: 'a1', texto: 'x', fontes: [URL_A] }],
    });
    assert.equal(r.aprovado, true);
    assert.ok(r.avisos.some((a) => a.tipo === 'fonte-sem-descricao'));
  });

  it('surf degradado é AVISO declarado — colheita boa não é invalidada por isso', () => {
    const r = portaoDeQualidade({
      fontes: [fonteOk],
      afirmacoes: [{ id: 'a1', texto: 'x', fontes: [URL_A] }],
      degradacoes: [{ stage: 'synthesize', reason: 'no usable OpenRouter key' }],
      sintetizadoPeloSurf: false,
    });
    assert.equal(r.aprovado, true);
    assert.ok(r.avisos.some((a) => a.tipo === 'surf-degradado'));
    assert.ok(r.avisos.some((a) => a.tipo === 'sintese-do-surf-ausente'));
  });

  it('exigirAprovacao transforma reprovação em PesquisaError GATE_REPROVADO', () => {
    const r = portaoDeQualidade({ fontes: [], afirmacoes: [] });
    assert.throws(
      () => exigirAprovacao(r),
      (e: unknown) => e instanceof PesquisaError && e.code === PESQUISA_CODES.GATE_REPROVADO,
    );
  });
});

describe('camadas de verdade — anti-repetição', () => {
  it('lacuna cuja pergunta já foi executada é descartada (normalização igual à do surf)', () => {
    const { manter, descartadas } = filtrarLacunasRepetidas(
      [
        { id: 'l1', pergunta: '  O QUE   print() devolve ', porque: 'p' },
        { id: 'l2', pergunta: 'print aceita sep e end?', porque: 'p' },
      ],
      ['o que print() devolve'],
    );
    assert.deepEqual(manter.map((l) => l.id), ['l2']);
    assert.equal(descartadas[0].id, 'l1');
  });

  it('duas lacunas iguais entre si também colapsam', () => {
    const { manter } = filtrarLacunasRepetidas(
      [
        { id: 'l1', pergunta: 'mesma coisa', porque: 'p' },
        { id: 'l2', pergunta: 'Mesma  coisa', porque: 'p' },
      ],
      [],
    );
    assert.equal(manter.length, 1);
  });

  it('lacuna sem pergunta é descartada com motivo', () => {
    const { manter, descartadas } = filtrarLacunasRepetidas([{ id: 'l1', pergunta: '   ', porque: 'p' }], []);
    assert.equal(manter.length, 0);
    assert.match(descartadas[0].motivo, /sem pergunta/);
  });
});

describe('validarConfig — sem default sorrateiro', () => {
  it('cada campo fora da faixa é CONFIG_INVALIDA', () => {
    const casos: Partial<ConfigDaPesquisa>[] = [
      { camadas: 0 },
      { camadas: 5 },
      { subAgents: 21 },
      { maxDepth: 7 },
      { maxRounds: 51 },
      { lacunasPorCamada: 6 },
      { timeoutMsPorCamada: 0 },
      { timeoutMsDaAnalise: 0 },
      { stageVersion: '' },
    ];
    for (const over of casos) {
      assert.throws(
        () => validarConfig({ ...CFG, ...over }),
        (e: unknown) => e instanceof PesquisaError && e.code === PESQUISA_CODES.CONFIG_INVALIDA,
        JSON.stringify(over),
      );
    }
  });

  it('a configuração de referência passa', () => {
    assert.doesNotThrow(() => validarConfig(CFG));
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Orquestração — executor e analisador INJETADOS: zero rede, zero processo
// ───────────────────────────────────────────────────────────────────────────

interface ChamadaGravada {
  bin: string;
  args: string[];
  timeoutMs: number;
}

function executorFake(
  respostas: (chamada: ChamadaGravada) => SaidaDoProcesso,
): { executor: ExecutorDeProcesso; chamadas: ChamadaGravada[] } {
  const chamadas: ChamadaGravada[] = [];
  const executor: ExecutorDeProcesso = async (bin, args, opcoes) => {
    const c = { bin, args, timeoutMs: opcoes.timeoutMs };
    chamadas.push(c);
    return respostas(c);
  };
  return { executor, chamadas };
}

function analisadorFake(
  porCamada: (entrada: EntradaDaAnalise) => AnaliseDaColheita,
): { analisador: { analisar(e: EntradaDaAnalise): Promise<AnaliseDaColheita> }; entradas: EntradaDaAnalise[] } {
  const entradas: EntradaDaAnalise[] = [];
  return {
    entradas,
    analisador: {
      async analisar(entrada: EntradaDaAnalise) {
        entradas.push(entrada);
        return porCamada(entrada);
      },
    },
  };
}

const ANALISE_PADRAO = (entrada: EntradaDaAnalise): AnaliseDaColheita => ({
  leitura: 'a evidência sustenta o básico',
  afirmacoes: [{ id: 'a1', texto: 'print() escreve no stdout', fontes: [URL_A] }],
  lacunas:
    entrada.camada === 1
      ? [{ id: 'l1', pergunta: 'print() aceita sep e end?', porque: 'a camada 1 não trouxe isso' }]
      : [],
});

describe('pesquisa em camadas — orquestração (offline)', () => {
  it('camada 1 usa surf-search-normal e camada 2 usa surf-search-unlimit', async () => {
    const { executor, chamadas } = executorFake(() => saida({ code: 0, stdout: STDOUT_MEDIDO }));
    const { analisador } = analisadorFake(ANALISE_PADRAO);
    const r = await criarPesquisaEmCamadas({ executor, analisador, config: CFG }).executar(CTX);

    assert.equal(chamadas.length, 2);
    assert.equal(chamadas[0].bin, 'surf-search-normal');
    assert.equal(chamadas[1].bin, 'surf-search-unlimit');
    assert.equal(r.schema, SCHEMA_PESQUISA_EM_CAMADAS);
    assert.equal(r.camadas.length, 2);
    assert.equal(r.chamadasAoSurf, 2);
  });

  it('a camada 2 pergunta a LACUNA — não repete a pergunta da camada 1', async () => {
    const { executor, chamadas } = executorFake(() => saida({ code: 0, stdout: STDOUT_MEDIDO }));
    const { analisador } = analisadorFake(ANALISE_PADRAO);
    await criarPesquisaEmCamadas({ executor, analisador, config: CFG }).executar(CTX);
    assert.equal(chamadas[1].args[0], 'print() aceita sep e end?');
    assert.notEqual(chamadas[1].args[0], chamadas[0].args[0]);
    assert.ok(chamadas[1].args.includes('--max-rounds'), 'a camada 2 declara profundidade por PARÂMETRO');
  });

  it('a profundidade da camada 2 vai no --max-depth, não em texto de prompt', async () => {
    const { executor, chamadas } = executorFake(() => saida({ code: 0, stdout: STDOUT_MEDIDO }));
    const { analisador } = analisadorFake(ANALISE_PADRAO);
    await criarPesquisaEmCamadas({ executor, analisador, config: CFG }).executar(CTX);
    assert.equal(chamadas[1].args[chamadas[1].args.indexOf('--max-depth') + 1], '3');
    for (const a of chamadas[1].args) assert.equal(contemImperativoDeProfundidade(a), false, a);
  });

  it('lacuna que só repete uma query já executada NÃO vira camada', async () => {
    const { executor, chamadas } = executorFake(() => saida({ code: 0, stdout: STDOUT_MEDIDO }));
    // a query 'o que print() devolve' já está no ledger do envelope medido
    const { analisador } = analisadorFake(() => ({
      leitura: '',
      afirmacoes: [{ id: 'a1', texto: 'x', fontes: [URL_A] }],
      lacunas: [{ id: 'l1', pergunta: 'O QUE print() DEVOLVE', porque: 'repetida' }],
    }));
    const r = await criarPesquisaEmCamadas({ executor, analisador, config: CFG }).executar(CTX);
    assert.equal(chamadas.length, 1, 'só a camada 1 rodou');
    assert.equal(r.camadas.length, 1);
  });

  it('camada 1 vazia (exit 1) é REGISTRADA e o gate reprova no fim — não troca de ferramenta', async () => {
    const { executor, chamadas } = executorFake(() => saida({ code: 1, stdout: envelopeVazio() }));
    const { analisador } = analisadorFake(() => ({ leitura: '', afirmacoes: [], lacunas: [] }));
    await assert.rejects(
      () => criarPesquisaEmCamadas({ executor, analisador, config: { ...CFG, camadas: 1 } }).executar(CTX),
      (e: unknown) => e instanceof PesquisaError && e.code === PESQUISA_CODES.GATE_REPROVADO,
    );
    assert.equal(chamadas.length, 1, 'nenhuma outra ferramenta foi tentada por causa do vazio');
  });

  it('143 no unlimit rebaixa para surf-search-normal UMA vez — troca de ferramenta, não retry', async () => {
    const { executor, chamadas } = executorFake((c) =>
      c.bin === 'surf-search-unlimit' ? saida({ code: 143 }) : saida({ code: 0, stdout: STDOUT_MEDIDO }),
    );
    const { analisador } = analisadorFake(ANALISE_PADRAO);
    const r = await criarPesquisaEmCamadas({ executor, analisador, config: CFG }).executar(CTX);

    assert.deepEqual(chamadas.map((c) => c.bin), ['surf-search-normal', 'surf-search-unlimit', 'surf-search-normal']);
    assert.equal(r.chamadasAoSurf, 3);
    const camada2 = r.camadas[1];
    assert.equal(camada2.rebaixadaParaNormal, true);
    assert.equal(camada2.ferramenta, 'normal');
    assert.ok(!chamadas[2].args.includes('--max-rounds'), 'o normal roda UMA onda: --max-rounds não vai');
  });

  it('143 no surf-search-normal NÃO rebaixa (seria o retry que este módulo não faz)', async () => {
    const { executor, chamadas } = executorFake(() => saida({ code: 143 }));
    const { analisador } = analisadorFake(ANALISE_PADRAO);
    await assert.rejects(
      () => criarPesquisaEmCamadas({ executor, analisador, config: CFG }).executar(CTX),
      (e: unknown) => e instanceof PesquisaError && e.code === PESQUISA_CODES.SURF_MORTO_POR_TIMEOUT,
    );
    assert.equal(chamadas.length, 1);
  });

  it('78 aborta a execução inteira, fail-closed', async () => {
    const { executor } = executorFake(() => saida({ code: 78, stderr: 'no valid Brave key' }));
    const { analisador } = analisadorFake(ANALISE_PADRAO);
    await assert.rejects(
      () => criarPesquisaEmCamadas({ executor, analisador, config: CFG }).executar(CTX),
      (e: unknown) => e instanceof PesquisaError && e.code === PESQUISA_CODES.SURF_SEM_CHAVE,
    );
  });

  it('analisador indisponível vira ANALISE_INDISPONIVEL — nenhuma afirmação inventada', async () => {
    const { executor } = executorFake(() => saida({ code: 0, stdout: STDOUT_MEDIDO }));
    const analisador = {
      async analisar(): Promise<AnaliseDaColheita> {
        throw new Error('rede caiu');
      },
    };
    await assert.rejects(
      () => criarPesquisaEmCamadas({ executor, analisador, config: CFG }).executar(CTX),
      (e: unknown) => e instanceof PesquisaError && e.code === PESQUISA_CODES.ANALISE_INDISPONIVEL,
    );
  });

  it('análise fora de forma também é ANALISE_INDISPONIVEL', async () => {
    const { executor } = executorFake(() => saida({ code: 0, stdout: STDOUT_MEDIDO }));
    const analisador = {
      async analisar(): Promise<AnaliseDaColheita> {
        return { leitura: 'x' } as unknown as AnaliseDaColheita;
      },
    };
    await assert.rejects(
      () => criarPesquisaEmCamadas({ executor, analisador, config: CFG }).executar(CTX),
      (e: unknown) => e instanceof PesquisaError && e.code === PESQUISA_CODES.ANALISE_INDISPONIVEL,
    );
  });

  it('o resultado sai no formato da aula, deduplicado, com a declaração de revisão humana', async () => {
    const { executor } = executorFake(() => saida({ code: 0, stdout: STDOUT_MEDIDO }));
    const { analisador } = analisadorFake(ANALISE_PADRAO);
    const r = await criarPesquisaEmCamadas({ executor, analisador, config: CFG }).executar(CTX);

    assert.equal(r.fontes.length, 2, 'as MESMAS 2 urls das duas camadas colapsam em 2');
    for (const f of r.fontes) assert.deepEqual(Object.keys(f).sort(), ['description', 'title', 'url']);
    assert.match(r.declaracao, /nenhuma fase posterior detecta/);
    assert.equal(r.gate.aprovado, true);
    assert.ok(r.gate.avisos.some((a) => a.tipo === 'surf-degradado'));
  });

  it('o analisador recebe a evidência ACUMULADA e as perguntas já feitas', async () => {
    const { executor } = executorFake(() => saida({ code: 0, stdout: STDOUT_MEDIDO }));
    const { analisador, entradas } = analisadorFake(ANALISE_PADRAO);
    await criarPesquisaEmCamadas({ executor, analisador, config: CFG }).executar(CTX);

    assert.equal(entradas.length, 2);
    assert.equal(entradas[0].camada, 1);
    assert.equal(entradas[1].camada, 2);
    assert.ok(entradas[1].perguntasJaFeitas.length > entradas[0].perguntasJaFeitas.length);
    assert.deepEqual(entradas[0].evidencia.map((e) => e.n), [1, 2]);
  });

  it('cada invocação do surf carrega o deadline configurado', async () => {
    const { executor, chamadas } = executorFake(() => saida({ code: 0, stdout: STDOUT_MEDIDO }));
    const { analisador } = analisadorFake(ANALISE_PADRAO);
    await criarPesquisaEmCamadas({ executor, analisador, config: CFG }).executar(CTX);
    for (const c of chamadas) assert.equal(c.timeoutMs, CFG.timeoutMsPorCamada);
  });

  it('camadas:1 não aprofunda — uma única invocação do surf', async () => {
    const { executor, chamadas } = executorFake(() => saida({ code: 0, stdout: STDOUT_MEDIDO }));
    const { analisador } = analisadorFake(ANALISE_PADRAO);
    const r = await criarPesquisaEmCamadas({ executor, analisador, config: { ...CFG, camadas: 1 } }).executar(CTX);
    assert.equal(chamadas.length, 1);
    assert.equal(r.lacunasAbertas.length, 1, 'a lacuna fica DECLARADA em aberto, não escondida');
  });

  it('executor ou analisador ausente é CONFIG_INVALIDA na construção', () => {
    const { executor } = executorFake(() => saida({ code: 0 }));
    const { analisador } = analisadorFake(ANALISE_PADRAO);
    assert.throws(
      () => criarPesquisaEmCamadas({ executor: undefined as unknown as ExecutorDeProcesso, analisador, config: CFG }),
      (e: unknown) => e instanceof PesquisaError && e.code === PESQUISA_CODES.CONFIG_INVALIDA,
    );
    assert.throws(
      () => criarPesquisaEmCamadas({ executor, analisador: {} as never, config: CFG }),
      (e: unknown) => e instanceof PesquisaError && e.code === PESQUISA_CODES.CONFIG_INVALIDA,
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// O analisador de produção, com o transporte de LLM injetado (sem rede)
// ───────────────────────────────────────────────────────────────────────────

function llmFake(conteudo: string | (() => never)): { llm: EngineLlm; pedidos: LlmCallRequest[] } {
  const pedidos: LlmCallRequest[] = [];
  const llm: EngineLlm = {
    async callLlm(_etapa, req) {
      pedidos.push(req);
      if (typeof conteudo === 'function') conteudo();
      return {
        content: conteudo as string,
        model: 'z-ai/glm-5.3-flash',
        cached: false,
        stageUsage: { promptTokens: 0, completionTokens: 0, llmCalls: 1, cachedHits: 0, retries: 0 },
        attempts: 1,
        elapsedMs: 1,
      };
    },
    getStageUsage: () => undefined,
    getAllStageUsage: () => ({}),
  };
  return { llm, pedidos };
}

const ENTRADA_ANALISE: EntradaDaAnalise = {
  ctx: CTX_AVANCADO,
  camada: 1,
  evidencia: [
    { n: 1, url: URL_A, titulo: 'GfG', trecho: 'print exibe; return devolve' },
    { n: 2, url: URL_B, titulo: 'Real Python', trecho: 'print devolve None' },
  ],
  perguntasJaFeitas: ['o que print() devolve'],
};

describe('analisador de colheita (produção, LLM injetado)', () => {
  it('o prompt carrega o contexto real e a evidência NUMERADA', () => {
    const p = montarPromptDaAnalise(ENTRADA_ANALISE, 3);
    assert.match(p, /M4 · Funções que devolvem valor/);
    assert.match(p, /print de literal; variáveis/);
    assert.match(p, /\[1\] GfG/);
    assert.match(p, /\[2\] Real Python/);
    assert.match(p, /no máximo 3 lacunas/);
    assert.match(p, /PERGUNTAS JÁ EXECUTADAS/);
  });

  it('o prompt NÃO pede profundidade em texto — profundidade é parâmetro', () => {
    assert.equal(contemImperativoDeProfundidade(montarPromptDaAnalise(ENTRADA_ANALISE, 3)), false);
  });

  it('a chamada OMITE reasoningEffort (omitir é o que aplica effort máximo)', async () => {
    const { llm, pedidos } = llmFake(
      JSON.stringify({ leitura: 'ok', afirmacoes: [{ id: 'a1', texto: 't', fontes: [1] }], lacunas: [] }),
    );
    await criarAnalisadorLlm({ llm, stageVersion: 'v1', timeoutMs: 1000 }).analisar(ENTRADA_ANALISE);
    assert.equal(pedidos.length, 1);
    assert.equal('reasoningEffort' in pedidos[0], false);
    assert.equal(pedidos[0].timeoutMs, 1000, 'timeout obrigatório por etapa');
    assert.equal(pedidos[0].stageVersion, 'v1');
  });

  it('mapeia número de citação → URL da evidência (o modelo nunca cola URL de memória)', async () => {
    const { llm } = llmFake(
      JSON.stringify({
        leitura: 'ok',
        afirmacoes: [{ id: 'a1', texto: 'print devolve None', fontes: [2] }],
        lacunas: [{ id: 'l1', pergunta: 'e sep/end?', porque: 'faltou' }],
      }),
    );
    const r = await criarAnalisadorLlm({ llm, stageVersion: 'v1', timeoutMs: 1000 }).analisar(ENTRADA_ANALISE);
    assert.deepEqual(r.afirmacoes[0].fontes, [URL_B]);
    assert.equal(r.lacunas[0].pergunta, 'e sep/end?');
  });

  it('índice fora da lista vira citação DESCONHECIDA e o portão reprova', async () => {
    const { llm } = llmFake(
      JSON.stringify({ leitura: '', afirmacoes: [{ id: 'a1', texto: 't', fontes: [99] }], lacunas: [] }),
    );
    const r = await criarAnalisadorLlm({ llm, stageVersion: 'v1', timeoutMs: 1000 }).analisar(ENTRADA_ANALISE);
    assert.deepEqual(r.afirmacoes[0].fontes, ['indice-desconhecido:99']);
    const gate = portaoDeQualidade({
      fontes: [{ link: { title: 'GfG', url: URL_A, description: 'x' }, citacao: 1, queries: [], publicadaEm: null }],
      afirmacoes: r.afirmacoes,
    });
    assert.ok(gate.reprovacoes.some((x) => x.motivo === REPROVACOES.AFIRMACAO_COM_FONTE_DESCONHECIDA));
  });

  it('resposta cercada por ``` ainda é lida', () => {
    const cru = extrairJson('```json\n{"leitura":"x","afirmacoes":[],"lacunas":[]}\n```');
    assert.ok(normalizarAnalise(cru, []));
  });

  it('resposta que não é JSON vira ANALISE_INDISPONIVEL', async () => {
    const { llm } = llmFake('desculpe, não consegui');
    await assert.rejects(
      () => criarAnalisadorLlm({ llm, stageVersion: 'v1', timeoutMs: 1000 }).analisar(ENTRADA_ANALISE),
      (e: unknown) => e instanceof PesquisaError && e.code === PESQUISA_CODES.ANALISE_INDISPONIVEL,
    );
  });

  it('transporte que recusa vira ANALISE_INDISPONIVEL com a causa preservada', async () => {
    const { llm } = llmFake(() => {
      throw new Error('LLM_STAGE_TIMEOUT');
    });
    await assert.rejects(
      () => criarAnalisadorLlm({ llm, stageVersion: 'v1', timeoutMs: 1000 }).analisar(ENTRADA_ANALISE),
      (e: unknown) =>
        e instanceof PesquisaError &&
        e.code === PESQUISA_CODES.ANALISE_INDISPONIVEL &&
        String((e.cause as Error).message).includes('LLM_STAGE_TIMEOUT'),
    );
  });

  it('JSON sem `afirmacoes`/`lacunas` é recusado (normalizarAnalise devolve null)', () => {
    assert.equal(normalizarAnalise({ leitura: 'x' }, []), null);
    assert.equal(normalizarAnalise(null, []), null);
    assert.equal(extrairJson('   '), null);
  });
});
