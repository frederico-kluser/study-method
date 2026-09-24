/**
 * tests/cx-modes-curriculum-gap.test.ts — CARACTERIZAÇÃO (golden master) de
 * `engine/modes/curriculumGap.ts`.
 *
 * Estes testes FIXAM o comportamento OBSERVÁVEL do sub-fluxo v2 de lacuna
 * ANTES das ondas de refatoração de `modes/` e `fiacao/`: entradas/saídas das
 * funções públicas, erros estruturados, limites (vazio, 1 elemento, dado
 * malformado) e o contrato do modo `dry-run`/`aplicar`. Eles são a rede de
 * segurança que prova que o refactor "continua funcionando": qualquer mudança
 * de saída observável aqui quebra um teste.
 *
 * OFFLINE: fixtures em memória, LLM fake, tmpdirs próprios
 * (`mkdtemp('do-cxmodes-')`). Nenhum arquivo de produção é modificado.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { LoadedTrack } from '../electron/main/content/trackLoader';
import type { TrackChallengeSource, TrackModuleSource, TrackTheorySection } from '../electron/main/content/trackTypes';
import type { AuditReport, Violation } from '../electron/main/engine/audit';
import { auditTrack } from '../electron/main/engine/audit';
import { FORBIDDEN_ALWAYS, type AtomKey } from '../electron/main/engine/atomKeys';
import { entryAxiom } from '../electron/main/engine/budget';
import type { EngineLlm, LlmCallRequest } from '../electron/main/engine/runtime/callLlm';
import type { SaidaAutor } from '../electron/main/engine/prompts/author';
import {
  BUDGET_VERSION_LACUNA,
  CONSTRUCOES_POR_AULA_DEFAULT,
  DIR_DE_SEMENTES,
  ETAPA_LACUNA,
  ErroDeLacuna,
  PREFIXO_SLUG_LACUNA,
  STAGE_VERSION_LACUNA,
  TETO_CONSTRUCOES_PRODUTIVAS_NOVAS,
  TETO_ELEMENTOS_NOVOS_QUE_INTERAGEM,
  TIMEOUT_LACUNA_MS,
  agruparPorCoOcorrencia,
  autorarAulaDeLacuna,
  caminhosDaAulaNova,
  construcaoSignificativa,
  contextoDaSemente,
  criarLeitorDeSementes,
  derivarOrcamentoNaOrdem,
  eiClassDaConstrucao,
  empacotarGrupos,
  fecharLacunasDeCurriculo,
  inserirNaOrdem,
  lacunasDoAudit,
  lessonJsonDaAulaNova,
  moduleJsonComAulasNovas,
  montarDossieDaLacuna,
  ordemDaTrilha,
  planejarAulasDeLacuna,
  sementeParaLacuna,
  slugDaAulaDeLacuna,
  slugDoDesafioDoArquivo,
  verificarAulaNova,
  type AulaNovaPlanejada,
  type BandasDeOrcamento,
  type LacunaDeCurriculo,
  type OrdemPedagogica,
  type SementeDeSplit,
} from '../electron/main/engine/modes/curriculumGap';

// ---------------------------------------------------------------------------
// Fixtures — modelos reduzidos, trilha em memória e fakes (nada de rede)
// ---------------------------------------------------------------------------

const DUAS_CONSTRUCOES: AtomKey[] = ['node:TypeOfExpression', 'op:unary:typeof'];
const CODIGO_TYPEOF = "let valor = 'ana';\nlet tipo = typeof valor;\n";

function lacuna(construcao: AtomKey, ref: string, trecho = 'typeof v;', arquivo = 'c/d1/challenge.json'): LacunaDeCurriculo {
  return { construcao, refDoDesafio: ref, arquivo, campo: 'solutionCode', trechoOfensor: trecho };
}

function semente(parcial: Partial<SementeDeSplit> = {}): SementeDeSplit {
  return {
    aula: 'm01/a02',
    desafio: 'd1',
    minimalCode: CODIGO_TYPEOF,
    atoms: [...DUAS_CONSTRUCOES],
    foraDoOrcamento: [...DUAS_CONSTRUCOES],
    ...parcial,
  };
}

/** Ordem pedagógica sintética — o planejador não precisa de trilha. */
function ordemSintetica(
  aulas: Array<{ ref: string; introduz: AtomKey[] }>,
  extraNoAxioma: AtomKey[] = [],
): OrdemPedagogica {
  const axioma = entryAxiom('receptive-seed', 'javascript');
  for (const k of extraNoAxioma) {
    axioma.receptive.add(k);
    axioma.productive.add(k);
  }
  return {
    axioma: { receptive: axioma.receptive, productive: axioma.productive },
    adapterId: 'javascript',
    aulas: aulas.map((a) => ({ ref: a.ref, introduzProdutivo: a.introduz, introduzReceptivo: a.introduz })),
  };
}

function violacao(parcial: Partial<Violation> = {}): Violation {
  return {
    regra: 'A3',
    arquivo: 'modules/m01/lessons/a02/challenges/d1/challenge.json',
    ref: 'm01/a02',
    campo: 'solutionCode',
    linha: 2,
    coluna: 3,
    construcao: 'op:unary:typeof',
    eixo: 'op',
    faixa: 'productive',
    trechoOfensor: 'typeof v;',
    primeiraAulaQueEnsina: null,
    mensagem: 'mensagem de fixture',
    ...parcial,
  } as Violation;
}

function reportDe(violacoes: Violation[]): AuditReport {
  return {
    trackSlug: 'fixture',
    budgetSource: 'inferred',
    violations: violacoes,
    metrics: [],
    totals: {
      aulas: 0,
      desafios: 0,
      desafiosComViolacao: 0,
      violacoes: violacoes.filter((v) => (v.severidade ?? 'erro') !== 'aviso').length,
      lacunasDeCurriculo: violacoes.filter((v) => v.primeiraAulaQueEnsina === null && v.construcao !== null).length,
      aulasSemConstrucaoNova: 0,
    },
    hygiene: [],
    parseErrors: [],
    limitacoes: [],
  } as AuditReport;
}

function secaoTeoria(id: string, codigo: string): TrackTheorySection {
  return { id, title: id, markdown: 'Prosa da seção.', code: { language: 'js', code: codigo } };
}

function desafio(slug: string, solutionCode: string): TrackChallengeSource {
  return {
    schemaVersion: 1,
    slug,
    title: `Desafio ${slug}`,
    concept: 'conceito',
    difficulty: 2,
    language: 'nodejs',
    statement: 'Escreva a função conforme o enunciado.',
    starterCode: 'export function f(v) {\n  return v;\n}\n',
    testsCode:
      "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { f } from './solution.mjs';\ntest('f', () => { assert.equal(f(1), 'sim'); });\n",
    solutionCode,
    expectedTestCount: 1,
  };
}

interface AulaDeFixture {
  slug: string;
  dificuldade: number;
  teoria: string;
  desafios: TrackChallengeSource[];
}

function fazerTrilha(aulas: AulaDeFixture[]): LoadedTrack {
  return {
    root: {
      schemaVersion: 1,
      slug: 'cx-fixture-lacuna',
      title: 'Trilha de fixture',
      description: 'fixture de caracterização do sub-fluxo de lacuna',
      language: 'pt-BR',
      domain: 'programming',
      modules: ['m01'],
    },
    modules: [
      {
        meta: { schemaVersion: 1, slug: 'm01', title: 'Módulo 1', order: 1, lessons: aulas.map((a) => a.slug) },
        challenge: null,
        lessons: aulas.map((a) => ({
          meta: {
            schemaVersion: 1,
            slug: a.slug,
            title: `Aula ${a.slug}`,
            summary: 'resumo',
            difficulty: a.dificuldade,
            concepts: ['conceito'],
            prerequisites: [],
            theory: [secaoTeoria(`t-${a.slug}`, a.teoria)],
            sources: [],
            challenges: a.desafios.map((d) => d.slug),
          },
          challenges: a.desafios,
        })),
      },
    ],
    proficiency: null,
    dir: '/nao-existe/cx-fixture-lacuna',
  };
}

const TEORIA_A01 =
  "function saudacao(nome) {\n  let mensagem = 'ola';\n  return mensagem + nome;\n}\nsaudacao('ana');\n";
const TEORIA_A02 = 'function dobro(n) {\n  let r = n + n;\n  return r;\n}\n';

/** Trilha canônica: a lacuna é `typeof`, cobrada pelo desafio d1 de a02. */
function trilhaComLacunaDeTypeof(): LoadedTrack {
  return fazerTrilha([
    { slug: 'a01', dificuldade: 1, teoria: TEORIA_A01, desafios: [] },
    {
      slug: 'a02',
      dificuldade: 3,
      teoria: TEORIA_A02,
      desafios: [desafio('d1', 'export function f(v) {\n  let t = typeof v;\n  return t;\n}\n')],
    },
    { slug: 'a03', dificuldade: 4, teoria: TEORIA_A02, desafios: [] },
  ]);
}

interface LlmFake {
  llm: EngineLlm;
  chamadas: Array<{ etapa: string; req: LlmCallRequest }>;
}

function criarLlmFake(responder: (etapa: string, req: LlmCallRequest) => string): LlmFake {
  const chamadas: Array<{ etapa: string; req: LlmCallRequest }> = [];
  const llm: EngineLlm = {
    async callLlm(etapa, req) {
      chamadas.push({ etapa, req });
      return {
        content: responder(etapa, req),
        model: 'fake',
        cached: false,
        stageUsage: { promptTokens: 0, completionTokens: 0, llmCalls: 1, cachedHits: 0, retries: 0 },
        attempts: 1,
        elapsedMs: 0,
      };
    },
    getStageUsage: () => undefined,
    getAllStageUsage: () => ({}),
  };
  return { llm, chamadas };
}

function coletorDeEscrita(): { gravar: (a: string, c: string) => Promise<void>; escritos: Map<string, string> } {
  const escritos = new Map<string, string>();
  return { escritos, gravar: async (arquivo, conteudo) => { escritos.set(arquivo, conteudo); } };
}

/** Um draft do autor bem formado — overrides quebram o que cada teste quer. */
function draftDoAutor(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    raciocinio_de_projeto: 'A aula mostra typeof em duas formas antes de qualquer exercício.',
    slug: 'o-autor-nao-escolhe-o-slug',
    title: 'Ler o tipo de um valor',
    objective: {
      verbo: 'usar',
      enunciado: 'Usar typeof para ler o tipo de um valor',
      contexto: 'antes do desafio que já cobra typeof',
      criterio: 'escreve typeof sem consultar',
    },
    introduces: { receptive: DUAS_CONSTRUCOES, productive: DUAS_CONSTRUCOES },
    introducesTerms: [],
    foraDeEscopo: ['comparar tipos entre si'],
    eiClass: 'regra',
    targetAtom: 'op:unary:typeof',
    notionalMachineDelta: 'a máquina passa a responder qual é o tipo de um valor',
    budgetHash: 'o-autor-nao-escolhe-o-hash',
    budgetVersion: 'o-autor-nao-escolhe-a-versao',
    research: [],
    theory: [{ id: 'exemplo-typeof', secao: 'teoria', markdown: CODIGO_TYPEOF, tag: 'js' }],
    assertions: [],
    justificativa: 'A construção aparece em duas formas sintáticas distintas.',
    role: 'regular',
    status: 'rascunho',
    aprovado: false,
    ...over,
  };
}

function aulaPlanejada(over: Partial<AulaNovaPlanejada> = {}): AulaNovaPlanejada {
  return {
    slug: 'lacuna-op-unary-typeof-d1ece7a8',
    moduloSlug: 'm01',
    ref: 'm01/lacuna-op-unary-typeof-d1ece7a8',
    construcoes: [...DUAS_CONSTRUCOES],
    inserirAntesDe: 'm01/a02',
    indiceDeInsercao: 1,
    faixa: { minimo: 0, maximo: 1 },
    alvos: ['m01/a02'],
    depoisDe: null,
    pressupostos: [],
    role: 'regular',
    cobradaEm: ['c/d1/challenge.json'],
    semente: null,
    acao: 'INSERT_INTERMEDIATE',
    acoes_permitidas: ['INSERT_INTERMEDIATE', 'MOVE_CONCEPT_TO_ENTRY_BUDGET'],
    motivo: 'motivo de fixture',
    ...over,
  };
}

/** As DUAS faixas iguais — atalho para o modelo reduzido. */
function bandas(chaves: AtomKey[]): BandasDeOrcamento {
  return { receptive: new Set(chaves), productive: new Set(chaves) };
}

// ---------------------------------------------------------------------------
// 1. Constantes normativas (§3.6) — valores de contrato
// ---------------------------------------------------------------------------

describe('curriculumGap — constantes normativas pinadas', () => {
  it('fixa tetos, etapas e prefixos exatamente como o contrato declara', () => {
    assert.equal(TETO_CONSTRUCOES_PRODUTIVAS_NOVAS, 2);
    assert.equal(CONSTRUCOES_POR_AULA_DEFAULT, 2);
    assert.equal(TETO_ELEMENTOS_NOVOS_QUE_INTERAGEM, 4);
    assert.equal(ETAPA_LACUNA, 'v2-lacuna-autoria-de-aula');
    assert.equal(STAGE_VERSION_LACUNA, 'v2-lacuna-autoria-de-aula-v1');
    assert.equal(TIMEOUT_LACUNA_MS, 120_000);
    assert.equal(BUDGET_VERSION_LACUNA, 'lacuna-v2');
    assert.equal(PREFIXO_SLUG_LACUNA, 'lacuna');
    assert.equal(DIR_DE_SEMENTES, 'splits');
  });
});

// ---------------------------------------------------------------------------
// 2. O modelo reduzido do orçamento — puro e monotônico (§3.5)
// ---------------------------------------------------------------------------

describe('derivarOrcamentoNaOrdem — derivação cumulativa, pura e monotônica', () => {
  it('LIMITE: ordem sem aula devolve derivação vazia sobre o axioma', () => {
    const ordem = ordemSintetica([]);
    const d = derivarOrcamentoNaOrdem(ordem);
    assert.equal(d.aulas.length, 0);
    assert.equal(d.porRef.size, 0);
    assert.equal(d.firstTaughtIn.size, 0);
    assert.equal(d.indicePorRef.size, 0);
  });

  it('LIMITE: UMA aula — entrada é o axioma, saída é entrada ∪ introduces', () => {
    const ordem = ordemSintetica([{ ref: 'm01/a01', introduz: ['op:binary:+'] }]);
    const d = derivarOrcamentoNaOrdem(ordem);
    assert.equal(d.aulas.length, 1);
    const a = d.aulas[0];
    assert.equal(a.ref, 'm01/a01');
    assert.equal(a.index, 0);
    assert.deepEqual([...a.entrada.receptive].sort(), [...ordem.axioma.receptive].sort());
    assert.ok(a.saida.receptive.has('op:binary:+'));
    assert.ok(a.saida.productive.has('op:binary:+'));
    assert.equal(d.firstTaughtIn.get('op:binary:+'), 'm01/a01');
    assert.equal(d.indicePorRef.get('m01/a01'), 0);
  });

  it('MONOTÔNICA: entrada(N) = saída(N-1) e firstTaughtIn fica com a PRIMEIRA aula', () => {
    const ordem = ordemSintetica([
      { ref: 'm01/a01', introduz: ['op:binary:+'] },
      { ref: 'm01/a02', introduz: ['op:binary:+', 'op:binary:-'] },
    ]);
    const d = derivarOrcamentoNaOrdem(ordem);
    assert.deepEqual([...d.aulas[1].entrada.receptive].sort(), [...d.aulas[0].saida.receptive].sort());
    // a mesma construção repetida NÃO troca de dona
    assert.equal(d.firstTaughtIn.get('op:binary:+'), 'm01/a01');
    assert.equal(d.firstTaughtIn.get('op:binary:-'), 'm01/a02');
  });

  it('receptivo declarado é ADITIVO ao produtivo (§3.2)', () => {
    const axioma = entryAxiom('receptive-seed', 'javascript');
    const ordem: OrdemPedagogica = {
      axioma: { receptive: axioma.receptive, productive: axioma.productive },
      adapterId: 'javascript',
      aulas: [{ ref: 'm01/a01', introduzProdutivo: ['op:binary:+'], introduzReceptivo: ['term:escopo'] }],
    };
    const d = derivarOrcamentoNaOrdem(ordem);
    assert.ok(d.aulas[0].saida.receptive.has('term:escopo'));
    assert.ok(!d.aulas[0].saida.productive.has('term:escopo'));
  });
});

describe('inserirNaOrdem — pura, com clamp de índice', () => {
  it('insere no índice pedido sem tocar a ordem original', () => {
    const ordem = ordemSintetica([
      { ref: 'm01/a01', introduz: [] },
      { ref: 'm01/a03', introduz: [] },
    ]);
    const nova = inserirNaOrdem(ordem, 1, { ref: 'm01/a02', introduzProdutivo: [], introduzReceptivo: [] });
    assert.deepEqual(nova.aulas.map((a) => a.ref), ['m01/a01', 'm01/a02', 'm01/a03']);
    assert.deepEqual(ordem.aulas.map((a) => a.ref), ['m01/a01', 'm01/a03'], 'a ordem original não pode mudar');
  });

  it('LIMITE: índice negativo vira 0 e índice longe do fim vira o fim', () => {
    const ordem = ordemSintetica([{ ref: 'm01/a01', introduz: [] }]);
    const aula = { ref: 'm01/x', introduzProdutivo: [], introduzReceptivo: [] };
    assert.deepEqual(inserirNaOrdem(ordem, -5, aula).aulas.map((a) => a.ref), ['m01/x', 'm01/a01']);
    assert.deepEqual(inserirNaOrdem(ordem, 999, aula).aulas.map((a) => a.ref), ['m01/a01', 'm01/x']);
  });
});

// ---------------------------------------------------------------------------
// 3. Extração da lacuna do audit (§5.5) e a semente do revise
// ---------------------------------------------------------------------------

describe('lacunasDoAudit — só sem-dona, sem proibidas, deduplicada', () => {
  it('extrai violações com primeiraAulaQueEnsina === null e construção', () => {
    const l = lacunasDoAudit(reportDe([violacao()]));
    assert.equal(l.length, 1);
    assert.equal(l[0].construcao, 'op:unary:typeof');
    assert.equal(l[0].refDoDesafio, 'm01/a02');
    assert.equal(l[0].campo, 'solutionCode');
  });

  it('exclui violação COM aula dona, sem construção e DEC/proibida', () => {
    const l = lacunasDoAudit(
      reportDe([
        violacao({ primeiraAulaQueEnsina: 'm01/a03' }),
        violacao({ construcao: null, regra: 'A6' }),
        violacao({ regra: 'DEC', construcao: 'global:eval' }),
        violacao({ construcao: FORBIDDEN_ALWAYS[0] }),
      ]),
    );
    assert.deepEqual(l, []);
  });

  it('deduplica por (construção, ref) — três superfícies da mesma aula é UMA lacuna', () => {
    const l = lacunasDoAudit(
      reportDe([
        violacao({ campo: 'solutionCode' }),
        violacao({ campo: 'testsCode' }),
        violacao({ campo: 'starterCode' }),
        violacao({ construcao: 'node:TypeOfExpression', campo: 'solutionCode' }),
      ]),
    );
    assert.equal(l.length, 2);
  });

  it('LIMITE: relatório sem violações → lista vazia', () => {
    assert.deepEqual(lacunasDoAudit(reportDe([])), []);
  });
});

describe('slugDoDesafioDoArquivo — o slug do desafio extraído do caminho', () => {
  it('extrai o slug entre challenges/ e challenge.json', () => {
    assert.equal(slugDoDesafioDoArquivo('modules/m01/lessons/a02/challenges/d1/challenge.json'), 'd1');
  });

  it('LIMITE: caminho sem `challenges` → null', () => {
    assert.equal(slugDoDesafioDoArquivo('modules/m01/lessons/a02/lesson.json'), null);
  });

  it('LIMITE: `challenges/` vazio ou direto no arquivo → null', () => {
    assert.equal(slugDoDesafioDoArquivo('x/challenges/challenge.json'), null);
    assert.equal(slugDoDesafioDoArquivo('x/challenges/'), null);
  });
});

describe('sementeParaLacuna — casamento por especificidade decrescente', () => {
  it('prefere mesma aula + mesmo desafio + construção fora do orçamento', () => {
    const geral = semente({ desafio: 'outro', foraDoOrcamento: [] });
    const alvo = semente({ foraDoOrcamento: ['op:unary:typeof'] });
    const r = sementeParaLacuna([geral, alvo], lacuna('op:unary:typeof', 'm01/a02'));
    assert.equal(r, alvo);
  });

  it('LIMITE: nenhuma semente da aula → null; lista vazia → null', () => {
    assert.equal(sementeParaLacuna([semente({ aula: 'm01/outra' })], lacuna('op:unary:typeof', 'm01/a02')), null);
    assert.equal(sementeParaLacuna([], lacuna('op:unary:typeof', 'm01/a02')), null);
  });

  it('empate entre sementes → a PRIMEIRA da lista recebida (determinístico)', () => {
    const primeira = semente({ desafio: 'd1' });
    const segunda = semente({ desafio: 'd2' });
    assert.equal(sementeParaLacuna([primeira, segunda], lacuna('op:unary:typeof', 'm01/a02')), primeira);
    assert.equal(sementeParaLacuna([segunda, primeira], lacuna('op:unary:typeof', 'm01/a02')), segunda);
  });
});

describe('slugDaAulaDeLacuna — determinístico, global, prefixado', () => {
  it('GOLDEN: o slug derivado é byte a byte este, para sempre', () => {
    assert.equal(slugDaAulaDeLacuna(DUAS_CONSTRUCOES), 'lacuna-node-typeofexpression-op-unary-typeof-1bf56845');
    assert.equal(slugDaAulaDeLacuna(['op:unary:typeof']), 'lacuna-op-unary-typeof-d1ece7a8');
    assert.equal(
      slugDaAulaDeLacuna(['op:unary:typeof', 'node:TypeOfExpression']),
      'lacuna-op-unary-typeof-node-typeofexpression-87af2ca5',
    );
  });

  it('LIMITE: sem construções o slug é `lacuna-<hash>` (sem hífen órfão)', () => {
    assert.equal(slugDaAulaDeLacuna([]), 'lacuna-e3b0c442');
  });

  it('a ORDEM das construções muda o slug (a assinatura é a lista, não o conjunto)', () => {
    assert.notEqual(slugDaAulaDeLacuna(['a:b:c' as AtomKey, 'd:e:f' as AtomKey]), slugDaAulaDeLacuna(['d:e:f' as AtomKey, 'a:b:c' as AtomKey]));
  });
});

describe('agruparPorCoOcorrencia + empacotarGrupos — §3.1 e §3.6', () => {
  it('mesmo arquivo+campo+trecho viaja JUNTO (dois eixos do mesmo nó)', () => {
    const g = agruparPorCoOcorrencia([
      lacuna('node:TypeOfExpression', 'm01/a02'),
      lacuna('op:unary:typeof', 'm01/a02'),
      lacuna('op:binary:+', 'm01/a02', 'outro trecho'),
    ]);
    assert.equal(g.length, 2);
    assert.equal(g[0].length, 2);
    assert.equal(g[1].length, 1);
  });

  it('empacota sem partir grupo e respeita o teto', () => {
    const g = agruparPorCoOcorrencia([
      lacuna('node:TypeOfExpression', 'm01/a02'),
      lacuna('op:unary:typeof', 'm01/a02'),
      lacuna('op:binary:+', 'm01/a02', 'outro trecho'),
    ]);
    const r = empacotarGrupos(g, 2);
    assert.equal(r.aulas.length, 2, 'grupo de 2 + grupo de 1 não cabem juntos no teto 2 — e o grupo NUNCA se parte');
    assert.equal(r.aulas[0].length, 2);
    assert.equal(r.aulas[1].length, 1);
    assert.deepEqual(r.acimaDoTeto, []);
  });

  it('LIMITE: grupo maior que o teto sozinho sai em acimaDoTeto; vazio → tudo vazio', () => {
    const g3 = [[lacuna('a:b:1', 'm01/a02', 'x'), lacuna('a:b:2', 'm01/a02', 'x'), lacuna('a:b:3', 'm01/a02', 'x')]];
    const r = empacotarGrupos(g3, 2);
    assert.equal(r.aulas.length, 0);
    assert.equal(r.acimaDoTeto.length, 1);
    const vazio = empacotarGrupos([], 2);
    assert.deepEqual(vazio, { aulas: [], acimaDoTeto: [] });
  });
});

// ---------------------------------------------------------------------------
// 4. O planejamento posicional — puro e determinístico
// ---------------------------------------------------------------------------

describe('planejarAulasDeLacuna — o plano posicional (P1: decidido por código)', () => {
  it('happy path: 1 lacuna → 1 aula ANTES do desafio, ação CRIAR AULA, nunca REWRITE', () => {
    const plano = planejarAulasDeLacuna({
      trackSlug: 't',
      ordem: ordemSintetica(
        [
          { ref: 'm01/a01', introduz: ['decl:let'] },
          { ref: 'm01/a02', introduz: [] },
        ],
        ['decl:let'],
      ),
      lacunas: [lacuna('op:unary:typeof', 'm01/a02')],
    });
    assert.equal(plano.aulasNovas.length, 1);
    assert.equal(plano.bloqueios.length, 0);
    const a = plano.aulasNovas[0];
    assert.equal(a.inserirAntesDe, 'm01/a02');
    assert.equal(a.indiceDeInsercao, 1);
    assert.deepEqual(a.faixa, { minimo: 0, maximo: 1 });
    assert.deepEqual(a.alvos, ['m01/a02']);
    assert.equal(a.acao, 'INSERT_INTERMEDIATE');
    assert.ok(!a.acoes_permitidas.includes('REWRITE_IN_BUDGET' as never));
    assert.equal(a.role, 'regular');
    assert.equal(a.slug, 'lacuna-op-unary-typeof-d1ece7a8');
    assert.equal(a.ref, 'm01/lacuna-op-unary-typeof-d1ece7a8');
    assert.equal(plano.deltasEsperados.length, 1);
    assert.deepEqual(plano.deltasEsperados[0].arquivos, [
      'modules/m01/lessons/lacuna-op-unary-typeof-d1ece7a8/lesson.json',
      'modules/m01/module.json',
    ]);
  });

  it('AGREGAÇÃO: a MESMA construção cobrada por 2 desafios vira 1 aula com alvos=[2] (nunca SLUG_EM_USO falso)', () => {
    const plano = planejarAulasDeLacuna({
      trackSlug: 't',
      ordem: ordemSintetica([
        { ref: 'm01/a01', introduz: [] },
        { ref: 'm01/a02', introduz: [] },
        { ref: 'm01/a05', introduz: [] },
      ]),
      lacunas: [lacuna('op:unary:typeof', 'm01/a05'), lacuna('op:unary:typeof', 'm01/a02')],
    });
    assert.equal(plano.aulasNovas.length, 1);
    assert.equal(plano.bloqueios.length, 0, 'colisão da mesma construção consigo mesma NÃO é bloqueio');
    const a = plano.aulasNovas[0];
    assert.deepEqual(a.alvos, ['m01/a02', 'm01/a05']);
    assert.equal(a.inserirAntesDe, 'm01/a02', 'a meta MAIS CEDO dita a posição');
    assert.equal(a.indiceDeInsercao, 1);
  });

  it('POSICAO_IMPOSSIVEL: pressuposto ensinado DEPOIS do desafio → bloqueio, nunca chute', () => {
    const plano = planejarAulasDeLacuna({
      trackSlug: 't',
      ordem: ordemSintetica([
        { ref: 'm01/a01', introduz: [] },
        { ref: 'm01/a02', introduz: ['op:binary:==='] },
      ]),
      lacunas: [lacuna('op:unary:typeof', 'm01/a01')],
      sementes: [semente({ aula: 'm01/a01', atoms: ['op:unary:typeof', 'op:binary:==='], foraDoOrcamento: [] })],
    });
    assert.equal(plano.aulasNovas.length, 0);
    assert.equal(plano.bloqueios.length, 1);
    assert.equal(plano.bloqueios[0].motivo, 'POSICAO_IMPOSSIVEL');
  });

  it('PRESSUPOSTO_NAO_ENSINADO: lacuna encadeada é declarada, não criada por cima', () => {
    const plano = planejarAulasDeLacuna({
      trackSlug: 't',
      ordem: ordemSintetica([{ ref: 'm01/a01', introduz: [] }]),
      lacunas: [lacuna('op:unary:typeof', 'm01/a01')],
      sementes: [semente({ aula: 'm01/a01', atoms: ['op:unary:typeof', 'op:binary:>>>'], foraDoOrcamento: [] })],
    });
    assert.equal(plano.bloqueios.length, 1);
    assert.equal(plano.bloqueios[0].motivo, 'PRESSUPOSTO_NAO_ENSINADO');
  });

  it('AULA_DO_DESAFIO_DESCONHECIDA: ref fora da ordem → fail-closed, nada planejado', () => {
    const plano = planejarAulasDeLacuna({
      trackSlug: 't',
      ordem: ordemSintetica([{ ref: 'm01/a01', introduz: [] }]),
      lacunas: [lacuna('op:unary:typeof', 'm01/fantasma')],
    });
    assert.equal(plano.aulasNovas.length, 0);
    assert.equal(plano.bloqueios[0].motivo, 'AULA_DO_DESAFIO_DESCONHECIDA');
  });

  it('SLUG_EM_USO: colisão contra aula EXISTENTE no disco bloqueia nomeando a ref real', () => {
    const slugAlvo = slugDaAulaDeLacuna(['op:unary:typeof']);
    const plano = planejarAulasDeLacuna({
      trackSlug: 't',
      ordem: ordemSintetica([
        { ref: `m01/${slugAlvo}`, introduz: [] },
        { ref: 'm01/a02', introduz: [] },
      ]),
      lacunas: [lacuna('op:unary:typeof', 'm01/a02')],
    });
    assert.equal(plano.aulasNovas.length, 0);
    assert.equal(plano.bloqueios[0].motivo, 'SLUG_EM_USO');
    assert.match(plano.bloqueios[0].detalhe, /COMO AULA DESTA TRILHA/);
  });

  it('GRUPO_ACIMA_DO_TETO: um único nó com 3 eixos não é atômico (§3.6)', () => {
    const plano = planejarAulasDeLacuna({
      trackSlug: 't',
      ordem: ordemSintetica([{ ref: 'm01/a02', introduz: [] }]),
      lacunas: [
        lacuna('node:X1', 'm01/a02', 'trecho unico'),
        lacuna('node:X2', 'm01/a02', 'trecho unico'),
        lacuna('node:X3', 'm01/a02', 'trecho unico'),
      ],
    });
    assert.equal(plano.aulasNovas.length, 0);
    assert.equal(plano.bloqueios.length, 1);
    assert.equal(plano.bloqueios[0].motivo, 'GRUPO_ACIMA_DO_TETO');
  });

  it('LIMITE: zero lacunas → plano vazio; construcoesPorAula é CLAMPADA em [1, 2]', () => {
    const vazio = planejarAulasDeLacuna({
      trackSlug: 't',
      ordem: ordemSintetica([{ ref: 'm01/a01', introduz: [] }]),
      lacunas: [],
    });
    assert.deepEqual(vazio.aulasNovas, []);
    assert.deepEqual(vazio.bloqueios, []);
    assert.deepEqual(vazio.deltasEsperados, []);

    // teto pedindo 99 vira 2: as duas construções co-ocorrentes cabem em 1 aula
    const grande = planejarAulasDeLacuna({
      trackSlug: 't',
      ordem: ordemSintetica([{ ref: 'm01/a02', introduz: [] }]),
      lacunas: [lacuna('node:TypeOfExpression', 'm01/a02'), lacuna('op:unary:typeof', 'm01/a02')],
      construcoesPorAula: 99,
    });
    assert.equal(grande.aulasNovas.length, 1);
    // teto pedindo 0 vira 1: cada lacuna vira uma aula própria
    const minusculo = planejarAulasDeLacuna({
      trackSlug: 't',
      ordem: ordemSintetica([
        { ref: 'm01/a02', introduz: [] },
        { ref: 'm01/a03', introduz: [] },
      ]),
      lacunas: [lacuna('op:unary:typeof', 'm01/a02', 't1'), lacuna('op:binary:+', 'm01/a03', 't2')],
      construcoesPorAula: 0,
    });
    assert.equal(minusculo.aulasNovas.length, 2);
    assert.equal(minusculo.aulasNovas[0].construcoes.length, 1);
  });

  it('role integration quando a aula carrega mais de UM grupo de co-ocorrência', () => {
    const plano = planejarAulasDeLacuna({
      trackSlug: 't',
      ordem: ordemSintetica([{ ref: 'm01/a02', introduz: [] }]),
      lacunas: [lacuna('op:unary:typeof', 'm01/a02', 'trecho A'), lacuna('op:binary:+', 'm01/a02', 'trecho B')],
      construcoesPorAula: 2,
    });
    assert.equal(plano.aulasNovas.length, 1);
    assert.equal(plano.aulasNovas[0].role, 'integration');
  });
});

// ---------------------------------------------------------------------------
// 5. O dossiê determinístico e o contexto da semente
// ---------------------------------------------------------------------------

describe('construcaoSignificativa / eiClassDaConstrucao — decisões de código (P1)', () => {
  it('a construção significativa é a de eixo não-node; vazio → undefined', () => {
    assert.equal(construcaoSignificativa(['node:TypeOfExpression', 'op:unary:typeof']), 'op:unary:typeof');
    assert.equal(construcaoSignificativa(['node:TypeOfExpression']), 'node:TypeOfExpression');
    assert.equal(construcaoSignificativa([]), undefined);
  });

  it('ei_class deriva do eixo: api/global→fato, term→categoria, sintaxe→regra; integration→integrativo', () => {
    assert.equal(eiClassDaConstrucao(['api:node:test']), 'fato');
    assert.equal(eiClassDaConstrucao(['global:test']), 'fato');
    assert.equal(eiClassDaConstrucao(['term:escopo']), 'categoria');
    assert.equal(eiClassDaConstrucao(['op:unary:typeof']), 'regra');
    assert.equal(eiClassDaConstrucao([], 'regular'), 'regra');
    assert.equal(eiClassDaConstrucao(['api:node:test'], 'integration'), 'integrativo');
  });
});

describe('montarDossieDaLacuna — 13 campos, orçamento LITERAL com assimetria §3.3', () => {
  it('budget_teste = entrada.receptive; receptivo = saída.receptive; produtivo = saída.productive', () => {
    const aula = aulaPlanejada({ construcoes: [...DUAS_CONSTRUCOES], pressupostos: ['op:binary:+'] });
    const d = montarDossieDaLacuna({ aula, entrada: bandas(['decl:let', 'term:escopo']) });
    assert.deepEqual([...d.introduces_productive].sort(), [...DUAS_CONSTRUCOES].sort());
    assert.deepEqual([...d.budget_teste].sort(), ['decl:let', 'term:escopo']);
    assert.deepEqual([...d.budget_produtivo].sort(), [...DUAS_CONSTRUCOES, 'decl:let', 'term:escopo'].sort());
    assert.deepEqual([...d.budget_receptivo].sort(), [...DUAS_CONSTRUCOES, 'decl:let', 'term:escopo'].sort());
    assert.deepEqual(d.terms, ['escopo']);
    assert.equal(d.ei_class, 'regra');
  });

  it('fora_de_escopo tem item com motivo para pressuposto fora do orçamento + a linha-fallback sempre presente', () => {
    const aula = aulaPlanejada({ pressupostos: ['op:binary:+'] });
    const d = montarDossieDaLacuna({ aula, entrada: bandas(['decl:let']) });
    assert.ok(d.fora_de_escopo.some((f) => f.item === 'op:binary:+'));
    const ultima = d.fora_de_escopo[d.fora_de_escopo.length - 1];
    assert.match(ultima.item, /qualquer construção fora das listas/);
  });
});

describe('contextoDaSemente — evidência de execução no system, nunca no dossiê', () => {
  it('sem semente → undefined (o transporte omite o campo)', () => {
    assert.equal(contextoSementeSemSemente(), undefined);
  });
  function contextoSementeSemSemente(): string | undefined {
    return contextoDaSemente(aulaPlanejada({ semente: null }));
  }

  it('com semente → traz o código mínimo e as listas ordenadas', () => {
    const c = contextoDaSemente(aulaPlanejada({ semente: semente() }));
    assert.ok(c !== undefined);
    assert.match(c, /=== SEMENTE/);
    assert.match(c, /let tipo = typeof valor;/);
    assert.match(c, /construções do mínimo: node:TypeOfExpression, op:unary:typeof/);
  });
});

// ---------------------------------------------------------------------------
// 6. A autoria — a única parte com LLM (fake), fail-closed
// ---------------------------------------------------------------------------

describe('autorarAulaDeLacuna — chamada única, teto duro, blocked é legítimo', () => {
  const dossie = () => montarDossieDaLacuna({ aula: aulaPlanejada(), entrada: bandas(['decl:let']) });

  it('ok: devolve draft + checksum quando há cauda; usa ETAPA/STAGE/TIMEOUT do contrato', async () => {
    const { llm, chamadas } = criarLlmFake(() => `${JSON.stringify(draftDoAutor())}\nnode:TypeOfExpression`);
    const r = await autorarAulaDeLacuna({ llm }, aulaPlanejada(), dossie());
    assert.equal(r.status, 'ok');
    assert.equal(chamadas.length, 1);
    assert.equal(chamadas[0].etapa, ETAPA_LACUNA);
    assert.equal(chamadas[0].req.stageVersion, STAGE_VERSION_LACUNA);
    assert.equal(chamadas[0].req.timeoutMs, TIMEOUT_LACUNA_MS);
    assert.ok(r.status === 'ok' && r.checksum !== null);
  });

  it('sem cauda → checksum null (conferência reportada, nunca bloqueante)', async () => {
    const { llm } = criarLlmFake(() => JSON.stringify(draftDoAutor()));
    const r = await autorarAulaDeLacuna({ llm }, aulaPlanejada(), dossie());
    assert.ok(r.status === 'ok' && r.checksum === null);
  });

  it('blocked (§7.1 R3) → recusa BLOQUEADO, resultado legítimo e não falha', async () => {
    const { llm } = criarLlmFake(() => JSON.stringify({ blocked: true, missing: ['term:escopo'], motivo: 'grafo furado' }));
    const r = await autorarAulaDeLacuna({ llm }, aulaPlanejada(), dossie());
    assert.equal(r.status, 'recusado');
    assert.ok(r.status === 'recusado' && r.recusas[0].motivo === 'BLOQUEADO');
  });

  it('saída não-JSON e schema inválido → recusas SAIDA_NAO_JSON / SCHEMA_INVALIDO', async () => {
    const naoJson = criarLlmFake(() => 'isto não é json nenhum');
    const r1 = await autorarAulaDeLacuna({ llm: naoJson.llm }, aulaPlanejada(), dossie());
    assert.ok(r1.status === 'recusado' && r1.recusas[0].motivo === 'SAIDA_NAO_JSON');

    const schema = criarLlmFake(() => JSON.stringify({ ...draftDoAutor(), title: '' }));
    const r2 = await autorarAulaDeLacuna({ llm: schema.llm }, aulaPlanejada(), dossie());
    assert.ok(r2.status === 'recusado' && r2.recusas[0].motivo === 'SCHEMA_INVALIDO');
  });

  it('ACIMA_DO_TETO: saída maior que o teto de tokens é REJEITADA, nunca truncada', async () => {
    const grande = JSON.stringify(draftDoAutor({ title: 'x'.repeat(9000) }));
    const { llm } = criarLlmFake(() => grande);
    const r = await autorarAulaDeLacuna({ llm }, aulaPlanejada(), dossie());
    assert.ok(r.status === 'recusado' && r.recusas[0].motivo === 'ACIMA_DO_TETO');
  });

  it('falha do transporte → ErroDeLacuna LACUNA_LLM_INDISPONIVEL (indisponibilidade ≠ recusa)', async () => {
    const llm: EngineLlm = {
      async callLlm() { throw new Error('429 esgotado'); },
      getStageUsage: () => undefined,
      getAllStageUsage: () => ({}),
    };
    await assert.rejects(
      autorarAulaDeLacuna({ llm }, aulaPlanejada(), dossie()),
      (e: unknown) => e instanceof ErroDeLacuna && e.codigo === 'LACUNA_LLM_INDISPONIVEL' && e.etapa === ETAPA_LACUNA,
    );
  });
});

// ---------------------------------------------------------------------------
// 7. A verificação — o veredito determinístico que decide
// ---------------------------------------------------------------------------

describe('verificarAulaNova — o veredito puro (a lacuna fecha e nada abre)', () => {
  function entradaHappy(overDraft: Record<string, unknown> = {}) {
    return {
      ordem: ordemSintetica([{ ref: 'm01/a02', introduz: [] }], ['decl:let']),
      aula: aulaPlanejada({ indiceDeInsercao: 0, alvos: ['m01/a02'], construcoes: [...DUAS_CONSTRUCOES] }),
      draft: draftDoAutor(overDraft) as unknown as SaidaAutor,
    };
  }

  it('happy: a lacuna FECHA e nenhum buraco novo abre → ok, com contagem de elementos novos', () => {
    const r = verificarAulaNova(entradaHappy());
    assert.ok(r.ok, JSON.stringify(r));
    assert.ok(r.ok && r.novosElementos === 2);
  });

  it('TETO_CONSTRUCOES: 3 construções produtivas novas reprovam (§3.6: ≤ 2, nunca 3)', () => {
    const r = verificarAulaNova(entradaHappy({ introduces: { receptive: DUAS_CONSTRUCOES, productive: [...DUAS_CONSTRUCOES, 'op:binary:+'] } }));
    assert.ok(!r.ok && r.recusas.some((x) => x.motivo === 'TETO_CONSTRUCOES'));
  });

  it('INTRODUCES_DIVERGE: o autor não escolhe O QUE introduzir (P1)', () => {
    const r = verificarAulaNova(entradaHappy({ introduces: { receptive: ['op:binary:+'], productive: ['op:binary:+'] } }));
    assert.ok(!r.ok && r.recusas.some((x) => x.motivo === 'INTRODUCES_DIVERGE'));
  });

  it('INTRODUCES_DIVERGE: receptivo extra inflaria o orçamento adiante — reprovado', () => {
    const r = verificarAulaNova(entradaHappy({ introduces: { receptive: [...DUAS_CONSTRUCOES, 'op:binary:+'], productive: DUAS_CONSTRUCOES } }));
    assert.ok(!r.ok && r.recusas.filter((x) => x.motivo === 'INTRODUCES_DIVERGE').length === 1);
  });

  it('CHAVE_INVALIDA e CONSTRUCAO_PROIBIDA: chave malformada e proibida SEMPRE reprovam', () => {
    const ruim = verificarAulaNova(entradaHappy({ introduces: { receptive: ['chave-invalida'], productive: ['chave-invalida'] } }));
    assert.ok(!ruim.ok && ruim.recusas.some((x) => x.motivo === 'CHAVE_INVALIDA'));

    const proibida = verificarAulaNova(
      entradaHappy({ introduces: { receptive: [FORBIDDEN_ALWAYS[0]], productive: [FORBIDDEN_ALWAYS[0]] } }),
    );
    assert.ok(!proibida.ok && proibida.recusas.some((x) => x.motivo === 'CONSTRUCAO_PROIBIDA'));
  });

  it('NAO_DEMONSTRA: a construção-alvo tem de aparecer no CÓDIGO da teoria (§3.6)', () => {
    const r = verificarAulaNova(entradaHappy({ theory: [{ id: 't', secao: 'teoria', markdown: "let v = 'x';\n", tag: 'js' }] }));
    assert.ok(!r.ok && r.recusas.some((x) => x.motivo === 'NAO_DEMONSTRA'));
  });

  it('LACUNA_NOVA × ORDEM_NOVA: teoria que usa o que ninguém ensina / o que vem depois', () => {
    // node:Parameter não é ensinado em lugar nenhum
    const nova = verificarAulaNova({
      ordem: ordemSintetica([{ ref: 'm01/a02', introduz: [] }], ['decl:let']),
      aula: aulaPlanejada({ indiceDeInsercao: 0, alvos: ['m01/a02'] }),
      draft: draftDoAutor({
        theory: [{ id: 't', secao: 'teoria', markdown: `let t = typeof v;\nfunction f(p) {\n  return p;\n}\n`, tag: 'js' }],
      }) as unknown as SaidaAutor,
    });
    assert.ok(!nova.ok && nova.recusas.some((x) => x.motivo === 'LACUNA_NOVA' && x.construcao === 'node:Parameter'));

    // node:Parameter é ensinado em a03, que vem DEPOIS da inserção
    const ordem = verificarAulaNova({
      ordem: ordemSintetica(
        [
          { ref: 'm01/a02', introduz: [] },
          { ref: 'm01/a03', introduz: ['node:Parameter', 'node:FunctionDeclaration', 'node:ReturnStatement', 'op:unary:typeof', 'node:TypeOfExpression'] },
        ],
        ['decl:let'],
      ),
      aula: aulaPlanejada({ indiceDeInsercao: 0, alvos: ['m01/a02'] }),
      draft: draftDoAutor({
        theory: [{ id: 't', secao: 'teoria', markdown: `let t = typeof v;\nfunction f(p) {\n  return p;\n}\n`, tag: 'js' }],
      }) as unknown as SaidaAutor,
    });
    assert.ok(!ordem.ok && ordem.recusas.some((x) => x.motivo === 'ORDEM_NOVA' && x.construcao === 'node:Parameter'));
  });

  it('TAG_DESCONHECIDA e TEORIA_NAO_PARSEIA: bloco que não vai a parser nenhum é fail-closed', () => {
    const tag = verificarAulaNova(
      entradaHappy({ theory: [{ id: 't', secao: 'teoria', markdown: CODIGO_TYPEOF, tag: 'brainfuck' }] }),
    );
    assert.ok(!tag.ok && tag.recusas.some((x) => x.motivo === 'TAG_DESCONHECIDA'));

    const parse = verificarAulaNova(
      entradaHappy({ theory: [{ id: 't', secao: 'teoria', markdown: 'function (', tag: 'js' }] }),
    );
    assert.ok(!parse.ok && parse.recusas.some((x) => x.motivo === 'TEORIA_NAO_PARSEIA'));
  });

  it('ESTOURA_ELEMENTOS: > 4 elementos novos que interagem reprovam (§3.6)', () => {
    const r = verificarAulaNova({
      ordem: ordemSintetica([{ ref: 'm01/a02', introduz: [] }], ['decl:let']),
      aula: aulaPlanejada({ indiceDeInsercao: 0, alvos: ['m01/a02'], construcoes: ['node:FunctionDeclaration', 'op:binary:+'] }),
      draft: draftDoAutor({
        introduces: { receptive: ['node:FunctionDeclaration', 'op:binary:+'], productive: ['node:FunctionDeclaration', 'op:binary:+'] },
        theory: [{ id: 't', secao: 'teoria', markdown: TEORIA_A01, tag: 'js' }],
      }) as unknown as SaidaAutor,
    });
    assert.ok(!r.ok && r.recusas.some((x) => x.motivo === 'ESTOURA_ELEMENTOS' && x.detalhe.includes('5 elementos novos')));
  });

  it('RESEARCH_NAO_URL: fonte inventada não entra no produto', () => {
    const r = verificarAulaNova(entradaHappy({ research: ['livro-de-bolso'] }));
    assert.ok(!r.ok && r.recusas.some((x) => x.motivo === 'RESEARCH_NAO_URL'));
  });
});

// ---------------------------------------------------------------------------
// 8. Materialização — caminhos e conteúdo determinísticos
// ---------------------------------------------------------------------------

describe('caminhosDaAulaNova / lessonJsonDaAulaNova / moduleJsonComAulasNovas', () => {
  it('os caminhos são o lesson.json da aula nova + o module.json do módulo', () => {
    assert.deepEqual(caminhosDaAulaNova(aulaPlanejada()), [
      'modules/m01/lessons/lacuna-op-unary-typeof-d1ece7a8/lesson.json',
      'modules/m01/module.json',
    ]);
  });

  it('lesson.json nasce SEM desafio, com origem rastreada e dificuldade clampada em 1..5', () => {
    const j = lessonJsonDaAulaNova({
      aula: aulaPlanejada({ alvos: ['m01/a02', 'm01/a05'] }),
      draft: draftDoAutor({ research: ['https://example.org/x.html'] }) as unknown as SaidaAutor,
      dificuldadeDaAncora: 9,
    });
    assert.equal(j.slug, 'lacuna-op-unary-typeof-d1ece7a8', 'o slug vem do PLANO, não do autor');
    assert.equal(j.title, 'Ler o tipo de um valor');
    assert.equal(j.difficulty, 5);
    assert.deepEqual(j.concepts, []);
    assert.deepEqual(j.prerequisites, []);
    assert.deepEqual(j.challenges, []);
    const origem = (j as Record<string, unknown>).origem as Record<string, unknown>;
    assert.equal(origem.subfluxo, 'curriculum-gap-v2');
    assert.deepEqual(origem.alvos, ['m01/a02', 'm01/a05']);
    const sources = j.sources as Array<{ url: string }>;
    assert.deepEqual(sources.map((s) => s.url), ['https://example.org/x.html']);
  });

  it('module.json: slug inserido NA ÂNCORA; âncora ausente vai para o FIM (nunca some)', () => {
    const meta: TrackModuleSource = {
      schemaVersion: 1, slug: 'm01', title: 'Módulo', order: 1, lessons: ['a01', 'a02', 'a03'],
    } as unknown as TrackModuleSource;
    const comAncora = moduleJsonComAulasNovas(meta, [aulaPlanejada({ inserirAntesDe: 'm01/a02' })]);
    assert.deepEqual(comAncora.lessons, ['a01', 'lacuna-op-unary-typeof-d1ece7a8', 'a02', 'a03']);
    const semAncora = moduleJsonComAulasNovas(meta, [aulaPlanejada({ inserirAntesDe: 'm01/fantasma' })]);
    assert.deepEqual(semAncora.lessons, ['a01', 'a02', 'a03', 'lacuna-op-unary-typeof-d1ece7a8']);
    assert.deepEqual(meta.lessons, ['a01', 'a02', 'a03'], 'o meta original não pode mudar');
  });
});

// ---------------------------------------------------------------------------
// 9. O modo completo — dry-run por default, aplicar fail-closed
// ---------------------------------------------------------------------------

describe('fecharLacunasDeCurriculo — dry-run puro; aplicar fail-closed', () => {
  it('dry-run: ZERO escrita, ZERO LLM, plano + declaração de limitação', async () => {
    const track = trilhaComLacunaDeTypeof();
    const report = auditTrack(track);
    const { llm, chamadas } = criarLlmFake(() => JSON.stringify(draftDoAutor()));
    const { gravar, escritos } = coletorDeEscrita();
    const r = await fecharLacunasDeCurriculo({ llm, gravarArquivo: gravar }, { slug: 'cx-fixture-lacuna', modo: 'dry-run', track, report });
    assert.equal(r.modo, 'dry-run');
    assert.deepEqual(r.escritos, []);
    assert.equal(chamadas.length, 0);
    assert.equal(escritos.size, 0);
    assert.ok(r.plano.aulasNovas.length > 0);
    assert.match(r.declaracoes[0], /DRY-RUN: zero escrita, zero chamada de LLM/);
  });

  it('o default do modo é dry-run (sem `modo` nada é escrito)', async () => {
    const track = trilhaComLacunaDeTypeof();
    const { gravar, escritos } = coletorDeEscrita();
    const r = await fecharLacunasDeCurriculo({ gravarArquivo: gravar }, { slug: 'cx-fixture-lacuna', track, report: auditTrack(track) });
    assert.equal(r.modo, 'dry-run');
    assert.equal(escritos.size, 0);
  });

  it('trilha indisponível → ErroDeLacuna LACUNA_TRILHA_INDISPONIVEL (lançado, não veredito)', async () => {
    await assert.rejects(
      fecharLacunasDeCurriculo({}, { slug: 'nao-existe' }),
      (e: unknown) => e instanceof ErroDeLacuna && e.codigo === 'LACUNA_TRILHA_INDISPONIVEL',
    );
    await assert.rejects(
      fecharLacunasDeCurriculo({ carregarTrilha: async () => { throw new Error('sem disco'); } }, { slug: 'nao-existe' }),
      (e: unknown) => e instanceof ErroDeLacuna && e.codigo === 'LACUNA_TRILHA_INDISPONIVEL',
    );
  });

  it('aplicar sem LLM / sem escrita → LACUNA_SEM_LLM / LACUNA_SEM_ESCRITA antes de qualquer coisa', async () => {
    const track = trilhaComLacunaDeTypeof();
    await assert.rejects(
      fecharLacunasDeCurriculo({}, { slug: 'x', modo: 'aplicar', track, report: auditTrack(track) }),
      (e: unknown) => e instanceof ErroDeLacuna && e.codigo === 'LACUNA_SEM_LLM',
    );
    const { llm } = criarLlmFake(() => JSON.stringify(draftDoAutor()));
    await assert.rejects(
      fecharLacunasDeCurriculo({ llm }, { slug: 'x', modo: 'aplicar', track, report: auditTrack(track) }),
      (e: unknown) => e instanceof ErroDeLacuna && e.codigo === 'LACUNA_SEM_ESCRITA',
    );
  });

  it('aplicar feliz: autoria verificada vira lesson.json + module.json gravados, draft carimbado', async () => {
    const track = trilhaComLacunaDeTypeof();
    const { llm } = criarLlmFake(() => JSON.stringify(draftDoAutor()));
    const { gravar, escritos } = coletorDeEscrita();
    const r = await fecharLacunasDeCurriculo(
      { llm, gravarArquivo: gravar },
      { slug: 'cx-fixture-lacuna', modo: 'aplicar', track, report: auditTrack(track) },
    );
    assert.equal(r.recusadas.length, 0);
    assert.equal(r.aceitas.length, r.plano.aulasNovas.length);
    assert.ok(r.escritos.length >= 2, 'lesson.json + module.json');
    assert.equal(escritos.size, r.escritos.length);
    // CAMIMBRO determinístico (P1): o autor não escolhe slug/hash/estado
    const aceita = r.aceitas[0];
    assert.equal(aceita.draft.slug, aceita.aula.slug);
    assert.equal(aceita.draft.budgetVersion, BUDGET_VERSION_LACUNA);
    assert.equal(aceita.draft.status, 'pronto_para_revisao');
    assert.equal(aceita.draft.aprovado, false);
    assert.deepEqual(aceita.draft.introduces.receptive, aceita.aula.construcoes);
    // o module.json gravado contém o slug novo antes da âncora
    const modulo = escritos.get('modules/m01/module.json');
    assert.ok(modulo !== undefined);
    const meta = JSON.parse(modulo) as { lessons: string[] };
    assert.ok(meta.lessons.indexOf(aceita.aula.slug) < meta.lessons.indexOf('a02'));
  });

  it('autor blocked → recusada e NADA gravado; escrita que falha → LACUNA_ESCRITA_FALHOU', async () => {
    const track = trilhaComLacunaDeTypeof();
    const blocked = criarLlmFake(() => JSON.stringify({ blocked: true, missing: ['x'], motivo: 'y' }));
    const { gravar, escritos } = coletorDeEscrita();
    const r = await fecharLacunasDeCurriculo(
      { llm: blocked.llm, gravarArquivo: gravar },
      { slug: 'cx-fixture-lacuna', modo: 'aplicar', track, report: auditTrack(track) },
    );
    assert.equal(r.aceitas.length, 0);
    assert.equal(r.recusadas.length, r.plano.aulasNovas.length);
    assert.deepEqual(r.escritos, []);
    assert.equal(escritos.size, 0);

    const { llm } = criarLlmFake(() => JSON.stringify(draftDoAutor()));
    await assert.rejects(
      fecharLacunasDeCurriculo(
        { llm, gravarArquivo: async () => { throw new Error('disco cheio'); } },
        { slug: 'cx-fixture-lacuna', modo: 'aplicar', track, report: auditTrack(track) },
      ),
      (e: unknown) => e instanceof ErroDeLacuna && e.codigo === 'LACUNA_ESCRITA_FALHOU',
    );
  });

  it('construção proibida SEMPRE (DEC) vira BLOQUEIO declarado, nunca aula', async () => {
    const track = trilhaComLacunaDeTypeof();
    const report = reportDe([violacao({ regra: 'DEC', construcao: 'global:eval' })]);
    const r = await fecharLacunasDeCurriculo({}, { slug: 'cx-fixture-lacuna', track, report });
    assert.ok(r.bloqueios.some((b) => b.motivo === 'CONSTRUCAO_PROIBIDA_SEMPRE'));
  });
});

// ---------------------------------------------------------------------------
// 10. O leitor de sementes — o ÚNICO ponto que toca o disco (tmpdir próprio)
// ---------------------------------------------------------------------------

describe('criarLeitorDeSementes — lê splits/*.seed.json e descarta o quebrado', () => {
  it('lê as sementes válidas em ordem de nome e DESCARTA a corrompida (fail-soft)', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'do-cxmodes-'));
    try {
      await fsp.mkdir(path.join(dir, DIR_DE_SEMENTES), { recursive: true });
      await fsp.writeFile(
        path.join(dir, DIR_DE_SEMENTES, 'a02--d1.seed.json'),
        JSON.stringify({ aula: 'm01/a02', desafio: 'd1', atoms: ['op:unary:typeof'], foraDoOrcamento: [], minimalCode: 'let t = typeof v;' }),
      );
      await fsp.writeFile(path.join(dir, DIR_DE_SEMENTES, 'quebrado.seed.json'), '{ não é json');
      await fsp.writeFile(
        path.join(dir, DIR_DE_SEMENTES, 'fora-do-schema.seed.json'),
        JSON.stringify({ aula: '', desafio: 'd9', atoms: [], foraDoOrcamento: [], minimalCode: '' }),
      );
      const ler = criarLeitorDeSementes(dir);
      const sementes = await ler();
      assert.equal(sementes.length, 1);
      assert.equal(sementes[0].aula, 'm01/a02');
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it('LIMITE: diretório sem splits/ → lista vazia (nunca lança)', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'do-cxmodes-'));
    try {
      const sementes = await criarLeitorDeSementes(dir)();
      assert.deepEqual(sementes, []);
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});
