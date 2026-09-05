/**
 * tests/engineCurriculumGap.test.ts — O SUB-FLUXO v2: a lacuna de currículo
 * vira AULA (`engine/modes/curriculumGap.ts`).
 *
 * O que estes testes provam, na ordem em que o pedido do dono os cobra:
 *
 *   1. PLANEJAMENTO POSICIONAL, em vários formatos de lacuna: a aula nova entra
 *      IMEDIATAMENTE ANTES do desafio que cobra e DEPOIS de tudo que ela
 *      própria pressupõe; a ação é sempre do par de CRIAR AULA e NUNCA
 *      `REWRITE_IN_BUDGET` (§5.5); pressuposto ensinado tarde demais vira
 *      `POSICAO_IMPOSSIVEL`; pressuposto que ninguém ensina vira
 *      `PRESSUPOSTO_NAO_ENSINADO` (lacuna encadeada); construção proibida
 *      SEMPRE nunca vira aula.
 *   2. REJEIÇÃO DE AULA QUE NÃO FECHA A LACUNA — `NAO_DEMONSTRA`,
 *      `INTRODUCES_DIVERGE` e `LACUNA_PERSISTE`.
 *   3. REJEIÇÃO DE AULA QUE ABRE LACUNA NOVA — `LACUNA_NOVA` (ninguém ensina)
 *      e `ORDEM_NOVA` (ensinada depois).
 *   4. REJEIÇÃO DE AULA QUE ESTOURA O §3.6 — teto de construções produtivas
 *      novas, elementos novos que interagem, e o receptivo inflado.
 *   5. DRY-RUN NÃO ESCREVE NADA e NÃO CHAMA LLM (o default do repo).
 *
 * OFFLINE POR CONSTRUÇÃO: nenhuma trilha em disco (a fixture é `LoadedTrack`
 * em memória), nenhum LLM real (o transporte é um fake que conta chamadas),
 * nenhuma rede e nenhuma chave de API. O único teste que toca o sistema de
 * arquivos é o do leitor de sementes, e ele usa um diretório temporário
 * próprio, criado e apagado por ele mesmo.
 *
 * A trilha Python de produção tem ZERO lacunas (medido: `coverage python` →
 * 21/21, 0 lacunas). Estes testes usam FIXTURES de propósito: o sub-fluxo é a
 * garantia para os cursos que ainda vão ser gerados, e teste de engine que
 * depende de conteúdo de produção quebra quando o conteúdo muda.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { LoadedTrack } from '../electron/main/content/trackLoader';
import type { TrackChallengeSource, TrackTheorySection } from '../electron/main/content/trackTypes';
import { auditTrack } from '../electron/main/engine/audit';
import { deriveTrackBudget, entryAxiom } from '../electron/main/engine/budget';
import type { AtomKey } from '../electron/main/engine/atomKeys';
import type { EngineLlm, LlmCallRequest } from '../electron/main/engine/runtime/callLlm';
import { LlmStageError } from '../electron/main/engine/runtime/callLlm';
import type { SaidaAutor } from '../electron/main/engine/prompts/author';
import {
  ErroDeLacuna,
  TETO_CONSTRUCOES_PRODUTIVAS_NOVAS,
  agruparPorCoOcorrencia,
  construcaoSignificativa,
  criarLeitorDeSementes,
  eiClassDaConstrucao,
  fecharLacunasDeCurriculo,
  lacunasDoAudit,
  lessonJsonDaAulaNova,
  moduleJsonComAulasNovas,
  montarDossieDaLacuna,
  ordemDaTrilha,
  planejarAulasDeLacuna,
  sementeParaLacuna,
  slugDaAulaDeLacuna,
  verificarAulaNova,
  type AulaNovaPlanejada,
  type LacunaDeCurriculo,
  type OrdemPedagogica,
  type SementeDeSplit,
} from '../electron/main/engine/modes/curriculumGap';

// ---------------------------------------------------------------------------
// Fixtures — trilha em memória (nada de disco), na convenção do engineRepair
// ---------------------------------------------------------------------------

/** a01 ensina function, let, string, `+`, chamada e return. */
const TEORIA_A01 =
  "function saudacao(nome) {\n  let mensagem = 'ola';\n  return mensagem + nome;\n}\nsaudacao('ana');\n";
/** a02 só REUSA o que a01 ensinou (introduces vazio). */
const TEORIA_A02 = 'function dobro(n) {\n  let r = n + n;\n  return r;\n}\n';
/** a03 ensina `===` — DEPOIS da posição em que a aula de lacuna entra. */
const TEORIA_A03 = "function ehAna(nome) {\n  return nome === 'ana';\n}\n";

/** O exemplo que DEMONSTRA `typeof` usando só o que a01 já ensinou. */
const CODIGO_TYPEOF = "let valor = 'ana';\nlet tipo = typeof valor;\n";

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
      slug: 'fixture-lacuna',
      title: 'Trilha de fixture',
      description: 'fixture do sub-fluxo de lacuna',
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
    dir: '/nao-existe/fixture-lacuna',
  };
}

/** A trilha canônica destes testes: a lacuna é `typeof`, cobrada em a02. */
function trilhaComLacunaDeTypeof(): LoadedTrack {
  return fazerTrilha([
    { slug: 'a01', dificuldade: 1, teoria: TEORIA_A01, desafios: [] },
    {
      slug: 'a02',
      dificuldade: 3,
      teoria: TEORIA_A02,
      desafios: [desafio('d1', 'export function f(v) {\n  let t = typeof v;\n  return t;\n}\n')],
    },
    { slug: 'a03', dificuldade: 4, teoria: TEORIA_A03, desafios: [] },
  ]);
}

// ---------------------------------------------------------------------------
// Fakes — transporte de LLM (zero rede) e coletor de escrita
// ---------------------------------------------------------------------------

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
  return {
    escritos,
    gravar: async (arquivo, conteudo) => {
      escritos.set(arquivo, conteudo);
    },
  };
}

const DUAS_CONSTRUCOES = ['node:TypeOfExpression', 'op:unary:typeof'];

/** Um draft do autor bem formado — os overrides quebram o que cada teste quer. */
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

/** Uma ordem pedagógica SINTÉTICA — o planejador não precisa de trilha. */
function ordemSintetica(aulas: Array<{ ref: string; introduz: AtomKey[] }>, extraNoAxioma: AtomKey[] = []): OrdemPedagogica {
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

function lacuna(construcao: AtomKey, ref: string, trecho = 'typeof v;', arquivo = 'c/d1/challenge.json'): LacunaDeCurriculo {
  return { construcao, refDoDesafio: ref, arquivo, campo: 'solutionCode', trechoOfensor: trecho };
}

// ---------------------------------------------------------------------------
// 1. Extração da lacuna do audit
// ---------------------------------------------------------------------------

describe('lacunasDoAudit — a distinção do §5.5, lida do relatório real', () => {
  it('extrai só as violações SEM aula dona, e nomeia o desafio que cobra', () => {
    const report = auditTrack(trilhaComLacunaDeTypeof());
    const lacunas = lacunasDoAudit(report);

    assert.ok(lacunas.length > 0, 'a fixture precisa ter lacuna, senão o teste não prova nada');
    for (const l of lacunas) {
      assert.equal(l.refDoDesafio, 'm01/a02');
      assert.match(l.arquivo, /challenges\/d1\/challenge\.json$/);
    }
    const chaves = lacunas.map((l) => l.construcao).sort();
    assert.deepEqual(chaves, DUAS_CONSTRUCOES);

    // Toda violação COM aula dona é ORDEM e NUNCA entra aqui.
    const comDona = report.violations.filter((v) => v.primeiraAulaQueEnsina !== null);
    for (const v of comDona) {
      assert.ok(!lacunas.some((l) => l.construcao === v.construcao && l.refDoDesafio === v.ref));
    }
  });

  it('NUNCA promove a aula uma construção proibida SEMPRE (§5.3)', () => {
    const trilha = fazerTrilha([
      { slug: 'a01', dificuldade: 1, teoria: TEORIA_A01, desafios: [] },
      {
        slug: 'a02',
        dificuldade: 2,
        teoria: TEORIA_A02,
        desafios: [desafio('d1', "export function f(v) {\n  return eval('1');\n}\n")],
      },
    ]);
    const report = auditTrack(trilha);
    assert.ok(
      report.violations.some((v) => v.regra === 'DEC' || String(v.construcao).includes('eval')),
      'a fixture precisa produzir a violação de construção proibida',
    );
    const lacunas = lacunasDoAudit(report);
    assert.ok(!lacunas.some((l) => l.construcao.includes('eval')), '`eval` jamais vira aula: ensinar faria o gate mentir');
  });
});

// ---------------------------------------------------------------------------
// 2. O planejamento posicional — puro, vários formatos de lacuna
// ---------------------------------------------------------------------------

describe('planejarAulasDeLacuna — onde a aula nova entra (P1: decidido por código)', () => {
  it('insere IMEDIATAMENTE antes do desafio que cobra, com ação de CRIAR AULA', () => {
    const trilha = trilhaComLacunaDeTypeof();
    const budget = deriveTrackBudget(trilha);
    const ordem = ordemDaTrilha(budget);
    const plano = planejarAulasDeLacuna({
      trackSlug: 'fixture-lacuna',
      ordem,
      lacunas: lacunasDoAudit(auditTrack(trilha)),
    });

    assert.equal(plano.aulasNovas.length, 1);
    const aula = plano.aulasNovas[0];
    assert.equal(aula.inserirAntesDe, 'm01/a02');
    assert.equal(aula.indiceDeInsercao, 1, 'a01 fica no índice 0, a aula nova assume o 1 e empurra a02');
    assert.deepEqual(aula.faixa, { minimo: 0, maximo: 1 });
    assert.equal(aula.moduloSlug, 'm01');
    assert.equal(aula.ref, `m01/${aula.slug}`);

    // §5.5: a polaridade é de LACUNA, e o par NUNCA inclui reescrita.
    assert.equal(aula.acao, 'INSERT_INTERMEDIATE');
    assert.deepEqual([...aula.acoes_permitidas].sort(), ['INSERT_INTERMEDIATE', 'MOVE_CONCEPT_TO_ENTRY_BUDGET']);
    assert.ok(!(aula.acoes_permitidas as readonly string[]).includes('REWRITE_IN_BUDGET'));

    assert.equal(plano.deltasEsperados.length, 1);
    assert.deepEqual(plano.deltasEsperados[0].arquivos, [
      `modules/m01/lessons/${aula.slug}/lesson.json`,
      'modules/m01/module.json',
    ]);
  });

  it('os dois EIXOS do mesmo nó viajam na MESMA aula (co-ocorrência)', () => {
    const lacunas = [lacuna('node:TypeOfExpression', 'm01/a02'), lacuna('op:unary:typeof', 'm01/a02')];
    assert.equal(agruparPorCoOcorrencia(lacunas).length, 1, 'mesmo trechoOfensor ⇒ mesmo nó ⇒ um grupo');

    const plano = planejarAulasDeLacuna({
      trackSlug: 't',
      ordem: ordemSintetica([{ ref: 'm01/a01', introduz: [] }, { ref: 'm01/a02', introduz: [] }]),
      lacunas,
    });
    assert.equal(plano.aulasNovas.length, 1);
    assert.deepEqual([...plano.aulasNovas[0].construcoes].sort(), DUAS_CONSTRUCOES);
    assert.equal(plano.aulasNovas[0].role, 'regular', 'dois eixos do MESMO nó não são composição (§3.7)');
  });

  it('duas construções de nós DIFERENTES na mesma aula viram nó de INTEGRAÇÃO (§3.7)', () => {
    const plano = planejarAulasDeLacuna({
      trackSlug: 't',
      ordem: ordemSintetica([{ ref: 'm01/a01', introduz: [] }, { ref: 'm01/a02', introduz: [] }]),
      lacunas: [
        lacuna('op:unary:typeof', 'm01/a02', 'typeof v;'),
        lacuna('op:binary:!==', 'm01/a02', "v !== 'x';"),
      ],
    });
    assert.equal(plano.aulasNovas.length, 1);
    assert.equal(plano.aulasNovas[0].role, 'integration');
    assert.equal(eiClassDaConstrucao(plano.aulasNovas[0].construcoes, 'integration'), 'integrativo');
  });

  it('grupo que já estoura o teto do §3.6 sozinho vira BLOQUEIO, nunca aula grande', () => {
    const plano = planejarAulasDeLacuna({
      trackSlug: 't',
      ordem: ordemSintetica([{ ref: 'm01/a01', introduz: [] }, { ref: 'm01/a02', introduz: [] }]),
      lacunas: [
        lacuna('node:A', 'm01/a02', 'trecho unico'),
        lacuna('op:binary:x', 'm01/a02', 'trecho unico'),
        lacuna('decl:const', 'm01/a02', 'trecho unico'),
      ],
    });
    assert.equal(plano.aulasNovas.length, 0);
    assert.equal(plano.bloqueios.length, 1);
    assert.equal(plano.bloqueios[0].motivo, 'GRUPO_ACIMA_DO_TETO');
    assert.equal(plano.bloqueios[0].construcoes.length, 3);
    assert.ok(plano.bloqueios[0].construcoes.length > TETO_CONSTRUCOES_PRODUTIVAS_NOVAS);
  });

  it('a semente empurra o PISO da faixa: a aula nova vem depois do que ela pressupõe', () => {
    const ordem = ordemSintetica([
      { ref: 'm01/a01', introduz: ['decl:let'] },
      { ref: 'm01/a02', introduz: ['op:binary:+'] },
      { ref: 'm01/a03', introduz: [] },
    ]);
    const semente: SementeDeSplit = {
      aula: 'm01/a03',
      desafio: 'd1',
      minimalCode: 'let x = 1 + 1;',
      atoms: ['decl:let', 'op:binary:+', 'op:unary:typeof'],
      foraDoOrcamento: ['op:unary:typeof'],
    };
    const plano = planejarAulasDeLacuna({
      trackSlug: 't',
      ordem,
      lacunas: [lacuna('op:unary:typeof', 'm01/a03')],
      sementes: [semente],
    });
    assert.equal(plano.aulasNovas.length, 1);
    const aula = plano.aulasNovas[0];
    assert.equal(aula.depoisDe, 'm01/a02', 'o pressuposto mais tardio é `op:binary:+`, da aula de índice 1');
    assert.deepEqual(aula.faixa, { minimo: 2, maximo: 2 });
    assert.equal(aula.indiceDeInsercao, 2);
    assert.deepEqual(aula.pressupostos, ['decl:let', 'op:binary:+']);
    assert.equal(aula.semente, semente, 'a semente do revise vai junto — é o insumo do autor');
  });

  it('pressuposto ensinado DEPOIS do desafio ⇒ POSICAO_IMPOSSIVEL (é ordem, não lacuna)', () => {
    const ordem = ordemSintetica([
      { ref: 'm01/a01', introduz: [] },
      { ref: 'm01/a02', introduz: [] },
      { ref: 'm01/a03', introduz: ['op:binary:==='] },
    ]);
    const plano = planejarAulasDeLacuna({
      trackSlug: 't',
      ordem,
      lacunas: [lacuna('op:unary:typeof', 'm01/a02')],
      sementes: [
        {
          aula: 'm01/a02',
          desafio: 'd1',
          minimalCode: "typeof v === 'x';",
          atoms: ['op:unary:typeof', 'op:binary:==='],
          foraDoOrcamento: ['op:unary:typeof'],
        },
      ],
    });
    assert.equal(plano.aulasNovas.length, 0);
    assert.equal(plano.bloqueios.length, 1);
    assert.equal(plano.bloqueios[0].motivo, 'POSICAO_IMPOSSIVEL');
    assert.match(plano.bloqueios[0].detalhe, /reordena/);
  });

  it('pressuposto que NINGUÉM ensina ⇒ PRESSUPOSTO_NAO_ENSINADO (lacuna encadeada)', () => {
    const plano = planejarAulasDeLacuna({
      trackSlug: 't',
      ordem: ordemSintetica([{ ref: 'm01/a01', introduz: [] }, { ref: 'm01/a02', introduz: [] }]),
      lacunas: [lacuna('op:unary:typeof', 'm01/a02')],
      sementes: [
        {
          aula: 'm01/a02',
          desafio: 'd1',
          minimalCode: 'nada',
          atoms: ['op:unary:typeof', 'api:Array.prototype.map'],
          foraDoOrcamento: ['op:unary:typeof'],
        },
      ],
    });
    assert.equal(plano.aulasNovas.length, 0);
    assert.equal(plano.bloqueios[0].motivo, 'PRESSUPOSTO_NAO_ENSINADO');
  });

  it('pressuposto que a PRÓPRIA leva cria não bloqueia (a leva se resolve em ordem)', () => {
    const plano = planejarAulasDeLacuna({
      trackSlug: 't',
      ordem: ordemSintetica([{ ref: 'm01/a01', introduz: [] }, { ref: 'm01/a02', introduz: [] }]),
      lacunas: [lacuna('op:unary:typeof', 'm01/a02', 'a'), lacuna('op:binary:!==', 'm01/a02', 'b')],
      construcoesPorAula: 1,
      sementes: [
        {
          aula: 'm01/a02',
          desafio: 'd1',
          minimalCode: 'nada',
          atoms: ['op:unary:typeof', 'op:binary:!=='],
          foraDoOrcamento: ['op:unary:typeof', 'op:binary:!=='],
        },
      ],
    });
    assert.equal(plano.bloqueios.length, 0);
    assert.equal(plano.aulasNovas.length, 2, 'teto 1 ⇒ uma aula por grupo');
    assert.notEqual(plano.aulasNovas[0].slug, plano.aulasNovas[1].slug, 'slug é chave global (I12): nunca colide');
  });

  it('aula do desafio fora da ordem ⇒ BLOQUEIO, nunca planejamento às cegas', () => {
    const plano = planejarAulasDeLacuna({
      trackSlug: 't',
      ordem: ordemSintetica([{ ref: 'm01/a01', introduz: [] }]),
      lacunas: [lacuna('op:unary:typeof', 'm09/inexistente')],
    });
    assert.equal(plano.aulasNovas.length, 0);
    assert.equal(plano.bloqueios[0].motivo, 'AULA_DO_DESAFIO_DESCONHECIDA');
  });

  it('é DETERMINÍSTICO: mesma entrada, mesmo plano byte a byte', () => {
    const trilha = trilhaComLacunaDeTypeof();
    const ordem = ordemDaTrilha(deriveTrackBudget(trilha));
    const lacunas = lacunasDoAudit(auditTrack(trilha));
    const a = planejarAulasDeLacuna({ trackSlug: 'x', ordem, lacunas });
    const b = planejarAulasDeLacuna({ trackSlug: 'x', ordem, lacunas });
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });

  it('o slug é estável, kebab-case e distingue construções diferentes', () => {
    const s1 = slugDaAulaDeLacuna(['op:unary:typeof']);
    const s2 = slugDaAulaDeLacuna(['op:unary:typeof']);
    const s3 = slugDaAulaDeLacuna(['op:binary:!==']);
    assert.equal(s1, s2);
    assert.notEqual(s1, s3);
    assert.match(s1, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.match(s3, /^[a-z0-9]+(-[a-z0-9]+)*$/, 'chave com `!==` continua produzindo slug válido');
  });
});

// ---------------------------------------------------------------------------
// 3. O dossiê determinístico
// ---------------------------------------------------------------------------

describe('montarDossieDaLacuna — o estado congelado, montado por código (P1)', () => {
  it('respeita a assimetria das superfícies e é literal e completo (§3.3 / §7.1)', () => {
    const trilha = trilhaComLacunaDeTypeof();
    const budget = deriveTrackBudget(trilha);
    const ordem = ordemDaTrilha(budget);
    const plano = planejarAulasDeLacuna({
      trackSlug: 'fixture-lacuna',
      ordem,
      lacunas: lacunasDoAudit(auditTrack(trilha)),
    });
    const aula = plano.aulasNovas[0];
    const a01 = budget.byRef.get('m01/a01');
    assert.ok(a01);
    const dossie = montarDossieDaLacuna({
      aula,
      entrada: { receptive: a01.saida.receptive, productive: a01.saida.productive },
    });

    assert.deepEqual(dossie.introduces_productive, [...aula.construcoes]);
    assert.ok(dossie.introduces_productive.length <= TETO_CONSTRUCOES_PRODUTIVAS_NOVAS);
    // budget_teste = ENTRADA receptiva (o aluno lê o teste ANTES da aula).
    assert.deepEqual(dossie.budget_teste, [...a01.saida.receptive].sort());
    // budget_receptivo = SAÍDA receptiva = entrada ∪ o que a aula introduz.
    for (const k of aula.construcoes) {
      assert.ok(dossie.budget_receptivo.includes(k));
      assert.ok(dossie.budget_produtivo.includes(k));
      assert.ok(!dossie.budget_teste.includes(k), 'o teste é lido ANTES: a construção nova não cabe nele');
    }
    assert.equal(dossie.kc_type, construcaoSignificativa(aula.construcoes));
    assert.equal(dossie.ei_class, 'regra');
    assert.ok(dossie.fora_de_escopo.length >= 1);
    for (const item of dossie.fora_de_escopo) assert.ok(item.motivo.length > 0, 'motivo é obrigatório por item');
    assert.deepEqual(dossie.desafios_ja_escritos, [], 'a aula de lacuna nasce sem desafio (F8 é outra fase)');
  });
});

// ---------------------------------------------------------------------------
// 4. A verificação — o veredito determinístico
// ---------------------------------------------------------------------------

/** A ordem + a aula planejada usadas nos testes de verificação. */
function cenarioDeVerificacao(): { ordem: OrdemPedagogica; aula: AulaNovaPlanejada } {
  const trilha = trilhaComLacunaDeTypeof();
  const ordem = ordemDaTrilha(deriveTrackBudget(trilha));
  const plano = planejarAulasDeLacuna({
    trackSlug: 'fixture-lacuna',
    ordem,
    lacunas: lacunasDoAudit(auditTrack(trilha)),
  });
  return { ordem, aula: plano.aulasNovas[0] };
}

function comoDraft(objeto: Record<string, unknown>): SaidaAutor {
  return objeto as unknown as SaidaAutor;
}

describe('verificarAulaNova — a aula só é aceita se FECHA a lacuna e não abre outra', () => {
  it('aceita a aula que ensina a construção e não sai do orçamento', () => {
    const { ordem, aula } = cenarioDeVerificacao();
    const veredito = verificarAulaNova({ ordem, aula, draft: comoDraft(draftDoAutor()) });
    assert.equal(veredito.ok, true);
    if (veredito.ok) {
      assert.equal(veredito.novosElementos, 2, 'só os dois eixos do `typeof` são novos');
      assert.equal(veredito.ordemNova.aulas.length, ordem.aulas.length + 1);
      assert.equal(veredito.ordemNova.aulas[1].ref, aula.ref);
    }
  });

  it('RECUSA a aula que não DEMONSTRA a construção (teste 1 de atomicidade, §3.6)', () => {
    const { ordem, aula } = cenarioDeVerificacao();
    const draft = draftDoAutor({
      theory: [{ id: 'so-prosa', secao: 'teoria', markdown: "let x = 'ana';\n", tag: 'js' }],
    });
    const veredito = verificarAulaNova({ ordem, aula, draft: comoDraft(draft) });
    assert.equal(veredito.ok, false);
    if (!veredito.ok) {
      assert.ok(veredito.recusas.some((r) => r.motivo === 'NAO_DEMONSTRA'));
    }
  });

  it('RECUSA a aula que introduz OUTRA coisa (o autor não escolhe o que ensinar)', () => {
    const { ordem, aula } = cenarioDeVerificacao();
    const draft = draftDoAutor({
      introduces: { receptive: ['decl:const'], productive: ['decl:const'] },
    });
    const veredito = verificarAulaNova({ ordem, aula, draft: comoDraft(draft) });
    assert.equal(veredito.ok, false);
    if (!veredito.ok) assert.ok(veredito.recusas.some((r) => r.motivo === 'INTRODUCES_DIVERGE'));
  });

  it('RECUSA `introduces.receptive` inflado (isso inflaria o orçamento da trilha inteira)', () => {
    const { ordem, aula } = cenarioDeVerificacao();
    const draft = draftDoAutor({
      introduces: { receptive: [...DUAS_CONSTRUCOES, 'op:binary:==='], productive: DUAS_CONSTRUCOES },
    });
    const veredito = verificarAulaNova({ ordem, aula, draft: comoDraft(draft) });
    assert.equal(veredito.ok, false);
    if (!veredito.ok) assert.ok(veredito.recusas.some((r) => r.motivo === 'INTRODUCES_DIVERGE'));
  });

  it('RECUSA a aula que ABRE lacuna nova (construção que ninguém ensina)', () => {
    const { ordem, aula } = cenarioDeVerificacao();
    const draft = draftDoAutor({
      theory: [
        { id: 'exemplo-typeof', secao: 'teoria', markdown: `${CODIGO_TYPEOF}let lista = [1];\n`, tag: 'js' },
      ],
    });
    const veredito = verificarAulaNova({ ordem, aula, draft: comoDraft(draft) });
    assert.equal(veredito.ok, false);
    if (!veredito.ok) {
      assert.ok(
        veredito.recusas.some((r) => r.motivo === 'LACUNA_NOVA'),
        `esperava LACUNA_NOVA, veio ${veredito.recusas.map((r) => r.motivo).join(',')}`,
      );
    }
  });

  it('RECUSA a aula que abre violação de ORDEM (construção ensinada só depois)', () => {
    const { ordem, aula } = cenarioDeVerificacao();
    const draft = draftDoAutor({
      theory: [
        {
          id: 'exemplo-typeof',
          secao: 'teoria',
          markdown: `${CODIGO_TYPEOF}let igual = tipo === valor;\n`,
          tag: 'js',
        },
      ],
    });
    const veredito = verificarAulaNova({ ordem, aula, draft: comoDraft(draft) });
    assert.equal(veredito.ok, false);
    if (!veredito.ok) {
      const ordemNova = veredito.recusas.find((r) => r.motivo === 'ORDEM_NOVA');
      assert.ok(ordemNova, `esperava ORDEM_NOVA, veio ${veredito.recusas.map((r) => r.motivo).join(',')}`);
      assert.equal(ordemNova.construcao, 'op:binary:===');
    }
  });

  it('RECUSA a aula que estoura o teto de construções produtivas novas (§3.6)', () => {
    const { ordem, aula } = cenarioDeVerificacao();
    const tres = [...DUAS_CONSTRUCOES, 'decl:const'];
    const draft = draftDoAutor({ introduces: { receptive: tres, productive: tres } });
    const veredito = verificarAulaNova({ ordem, aula, draft: comoDraft(draft) });
    assert.equal(veredito.ok, false);
    if (!veredito.ok) assert.ok(veredito.recusas.some((r) => r.motivo === 'TETO_CONSTRUCOES'));
  });

  it('RECUSA a aula que apresenta elementos novos demais de uma vez (§3.6)', () => {
    // A aula introduz os dois eixos do `typeof`, mas a teoria mostra `const`,
    // `!==`, `else`… — tudo novo de uma vez. O teto é 4.
    const { ordem, aula } = cenarioDeVerificacao();
    const draft = draftDoAutor({
      theory: [
        {
          id: 'demais',
          secao: 'teoria',
          markdown:
            "let valor = 'ana';\nlet tipo = typeof valor;\nconst outro = 1;\nlet dif = tipo !== outro;\nlet neg = !dif;\nlet ou = dif || neg;\n",
          tag: 'js',
        },
      ],
    });
    const veredito = verificarAulaNova({ ordem, aula, draft: comoDraft(draft) });
    assert.equal(veredito.ok, false);
    if (!veredito.ok) {
      assert.ok(
        veredito.recusas.some((r) => r.motivo === 'ESTOURA_ELEMENTOS' || r.motivo === 'LACUNA_NOVA'),
        'excesso de elementos novos reprova (por teto ou por lacuna nova) — nunca passa',
      );
    }
  });

  it('RECUSA a aula posicionada DEPOIS do desafio que cobra (LACUNA_PERSISTE)', () => {
    const { ordem, aula } = cenarioDeVerificacao();
    const tardia: AulaNovaPlanejada = { ...aula, indiceDeInsercao: 2 };
    const veredito = verificarAulaNova({ ordem, aula: tardia, draft: comoDraft(draftDoAutor()) });
    assert.equal(veredito.ok, false);
    if (!veredito.ok) {
      assert.ok(veredito.recusas.some((r) => r.motivo === 'LACUNA_PERSISTE'));
    }
  });

  it('RECUSA construção proibida SEMPRE declarada em introduces (§5.3)', () => {
    const { ordem, aula } = cenarioDeVerificacao();
    const proibida: AulaNovaPlanejada = { ...aula, construcoes: ['global:eval'] };
    const draft = draftDoAutor({ introduces: { receptive: ['global:eval'], productive: ['global:eval'] } });
    const veredito = verificarAulaNova({ ordem, aula: proibida, draft: comoDraft(draft) });
    assert.equal(veredito.ok, false);
    if (!veredito.ok) assert.ok(veredito.recusas.some((r) => r.motivo === 'CONSTRUCAO_PROIBIDA'));
  });

  it('RECUSA tag de bloco que o registro não conhece (bloco que nenhum parser recebe)', () => {
    const { ordem, aula } = cenarioDeVerificacao();
    const draft = draftDoAutor({
      theory: [{ id: 'exemplo-typeof', secao: 'teoria', markdown: CODIGO_TYPEOF, tag: 'javascrpt' }],
    });
    const veredito = verificarAulaNova({ ordem, aula, draft: comoDraft(draft) });
    assert.equal(veredito.ok, false);
    if (!veredito.ok) assert.ok(veredito.recusas.some((r) => r.motivo === 'TAG_DESCONHECIDA'));
  });

  it('RECUSA `research` que não é URL http(s) — fonte inventada não vira produto', () => {
    const { ordem, aula } = cenarioDeVerificacao();
    const draft = draftDoAutor({ research: ['MDN, capítulo sobre typeof'] });
    const veredito = verificarAulaNova({ ordem, aula, draft: comoDraft(draft) });
    assert.equal(veredito.ok, false);
    if (!veredito.ok) assert.ok(veredito.recusas.some((r) => r.motivo === 'RESEARCH_NAO_URL'));
  });
});

// ---------------------------------------------------------------------------
// 5. O modo — dry-run e aplicar
// ---------------------------------------------------------------------------

describe('fecharLacunasDeCurriculo — DRY-RUN por default', () => {
  it('não escreve NADA, não chama LLM NENHUMA e ainda assim entrega o plano', async () => {
    const fake = criarLlmFake(() => {
      throw new Error('o dry-run NUNCA pode chamar LLM');
    });
    const escrita = coletorDeEscrita();
    const resultado = await fecharLacunasDeCurriculo(
      { llm: fake.llm, gravarArquivo: escrita.gravar },
      { slug: 'fixture-lacuna', track: trilhaComLacunaDeTypeof() },
    );

    assert.equal(resultado.modo, 'dry-run');
    assert.equal(fake.chamadas.length, 0, 'zero chamadas de LLM');
    assert.equal(escrita.escritos.size, 0, 'zero escritas');
    assert.deepEqual(resultado.escritos, []);
    assert.equal(resultado.aceitas.length, 0);
    assert.equal(resultado.recusadas.length, 0);
    assert.equal(resultado.plano.aulasNovas.length, 1);
    assert.equal(resultado.plano.deltasEsperados.length, 1);
    assert.ok(resultado.declaracoes.some((d) => d.startsWith('DRY-RUN')));
  });

  it('funciona SEM transporte de LLM e SEM dep de escrita (roda sem chave)', async () => {
    const resultado = await fecharLacunasDeCurriculo(
      {},
      { slug: 'fixture-lacuna', track: trilhaComLacunaDeTypeof(), modo: 'dry-run' },
    );
    assert.equal(resultado.plano.aulasNovas.length, 1);
  });

  it('declara a construção proibida SEMPRE como BLOQUEIO — nunca como aula', async () => {
    const trilha = fazerTrilha([
      { slug: 'a01', dificuldade: 1, teoria: TEORIA_A01, desafios: [] },
      {
        slug: 'a02',
        dificuldade: 2,
        teoria: TEORIA_A02,
        desafios: [desafio('d1', "export function f(v) {\n  return eval('1');\n}\n")],
      },
    ]);
    const resultado = await fecharLacunasDeCurriculo({}, { slug: 'fixture-lacuna', track: trilha });
    assert.ok(resultado.bloqueios.some((b) => b.motivo === 'CONSTRUCAO_PROIBIDA_SEMPRE'));
    assert.ok(!resultado.plano.aulasNovas.some((a) => a.construcoes.some((c) => c.includes('eval'))));
  });
});

describe('fecharLacunasDeCurriculo — APLICAR', () => {
  it('autora, verifica e grava o lesson.json + o module.json com o slug na âncora', async () => {
    const fake = criarLlmFake(() => JSON.stringify(draftDoAutor()));
    const escrita = coletorDeEscrita();
    const resultado = await fecharLacunasDeCurriculo(
      { llm: fake.llm, gravarArquivo: escrita.gravar },
      { slug: 'fixture-lacuna', track: trilhaComLacunaDeTypeof(), modo: 'aplicar' },
    );

    assert.equal(resultado.recusadas.length, 0, JSON.stringify(resultado.recusadas, null, 1));
    assert.equal(resultado.aceitas.length, 1);
    assert.equal(fake.chamadas.length, 1);
    assert.equal(fake.chamadas[0].etapa, 'v2-lacuna-autoria-de-aula');
    assert.equal(fake.chamadas[0].req.reasoningEffort, undefined, 'omitir o campo é o que aplica o esforço máximo');

    const aceita = resultado.aceitas[0];
    // CARIMBO determinístico (P1): o autor não escolhe nada disto.
    assert.equal(aceita.draft.slug, aceita.aula.slug);
    assert.equal(aceita.draft.budgetVersion, 'lacuna-v2');
    assert.notEqual(aceita.draft.budgetHash, 'o-autor-nao-escolhe-o-hash');
    assert.equal(aceita.draft.status, 'pronto_para_revisao');
    assert.equal(aceita.draft.aprovado, false);
    assert.equal(aceita.draft.role, 'regular');
    assert.deepEqual(aceita.draft.introduces.receptive, [...aceita.aula.construcoes]);

    const lessonPath = `modules/m01/lessons/${aceita.aula.slug}/lesson.json`;
    assert.deepEqual([...escrita.escritos.keys()].sort(), ['modules/m01/module.json', lessonPath].sort());
    assert.deepEqual(resultado.escritos.length, 2);

    const lesson = JSON.parse(escrita.escritos.get(lessonPath) as string);
    assert.equal(lesson.slug, aceita.aula.slug);
    assert.equal(lesson.schemaVersion, 1);
    assert.deepEqual(lesson.challenges, [], 'a aula de lacuna nasce sem desafio (F8 é outra fase)');
    assert.equal(lesson.difficulty, 3, 'herda a dificuldade da aula-âncora (a02), nunca a aumenta');
    assert.ok(Array.isArray(lesson.theory) && lesson.theory.length > 0);
    assert.equal(lesson.theory[0].code.language, 'js');
    assert.equal(lesson.origem.subfluxo, 'curriculum-gap-v2');
    assert.equal(lesson.origem.acao, 'INSERT_INTERMEDIATE');

    const mod = JSON.parse(escrita.escritos.get('modules/m01/module.json') as string);
    assert.deepEqual(mod.lessons, ['a01', aceita.aula.slug, 'a02', 'a03']);
  });

  it('a trilha COM a aula nova não tem mais a lacuna (o audit é o gate, e ele concorda)', async () => {
    const trilha = trilhaComLacunaDeTypeof();
    const fake = criarLlmFake(() => JSON.stringify(draftDoAutor()));
    const escrita = coletorDeEscrita();
    const resultado = await fecharLacunasDeCurriculo(
      { llm: fake.llm, gravarArquivo: escrita.gravar },
      { slug: 'fixture-lacuna', track: trilha, modo: 'aplicar' },
    );
    const aceita = resultado.aceitas[0];
    assert.ok(aceita);

    // Reconstrói a trilha COM a aula nova no lugar planejado e re-audita: as
    // lacunas de `typeof` somem, e nenhuma outra nasce.
    const antes = lacunasDoAudit(auditTrack(trilha)).map((l) => l.construcao).sort();
    assert.deepEqual(antes, DUAS_CONSTRUCOES);

    const nova = fazerTrilha([
      { slug: 'a01', dificuldade: 1, teoria: TEORIA_A01, desafios: [] },
      { slug: aceita.aula.slug, dificuldade: 3, teoria: CODIGO_TYPEOF, desafios: [] },
      {
        slug: 'a02',
        dificuldade: 3,
        teoria: TEORIA_A02,
        desafios: [desafio('d1', 'export function f(v) {\n  let t = typeof v;\n  return t;\n}\n')],
      },
      { slug: 'a03', dificuldade: 4, teoria: TEORIA_A03, desafios: [] },
    ]);
    assert.deepEqual(lacunasDoAudit(auditTrack(nova)), [], 'a lacuna fechou e nenhuma outra abriu');
  });

  it('aula RECUSADA não é gravada — nem parcialmente', async () => {
    const fake = criarLlmFake(() =>
      JSON.stringify(draftDoAutor({ theory: [{ id: 'nada', secao: 'teoria', markdown: 'let x = 1;\n', tag: 'js' }] })),
    );
    const escrita = coletorDeEscrita();
    const resultado = await fecharLacunasDeCurriculo(
      { llm: fake.llm, gravarArquivo: escrita.gravar },
      { slug: 'fixture-lacuna', track: trilhaComLacunaDeTypeof(), modo: 'aplicar' },
    );
    assert.equal(resultado.aceitas.length, 0);
    assert.equal(resultado.recusadas.length, 1);
    assert.ok(resultado.recusadas[0].recusas.some((r) => r.motivo === 'NAO_DEMONSTRA'));
    assert.equal(escrita.escritos.size, 0, 'nada é gravado quando a aula não passa');
  });

  it('`blocked` é resultado LEGÍTIMO (§7.1 R3): recusa estruturada, zero escrita', async () => {
    const fake = criarLlmFake(() =>
      JSON.stringify({ blocked: true, missing: ['op:binary:==='], motivo: 'o orçamento não permite comparar' }),
    );
    const escrita = coletorDeEscrita();
    const resultado = await fecharLacunasDeCurriculo(
      { llm: fake.llm, gravarArquivo: escrita.gravar },
      { slug: 'fixture-lacuna', track: trilhaComLacunaDeTypeof(), modo: 'aplicar' },
    );
    assert.equal(resultado.aceitas.length, 0);
    assert.equal(resultado.recusadas[0].recusas[0].motivo, 'BLOQUEADO');
    assert.equal(escrita.escritos.size, 0);
  });

  it('saída fora do schema vira recusa estruturada, nunca aula inventada', async () => {
    const fake = criarLlmFake(() => JSON.stringify({ ...draftDoAutor(), eiClass: 'inventei-uma-classe' }));
    const escrita = coletorDeEscrita();
    const resultado = await fecharLacunasDeCurriculo(
      { llm: fake.llm, gravarArquivo: escrita.gravar },
      { slug: 'fixture-lacuna', track: trilhaComLacunaDeTypeof(), modo: 'aplicar' },
    );
    assert.equal(resultado.recusadas[0].recusas[0].motivo, 'SCHEMA_INVALIDO');
    assert.equal(escrita.escritos.size, 0);
  });

  it('saída que não é JSON vira recusa, nunca exceção solta', async () => {
    const fake = criarLlmFake(() => 'desculpe, não consigo escrever esta aula');
    const resultado = await fecharLacunasDeCurriculo(
      { llm: fake.llm, gravarArquivo: async () => undefined },
      { slug: 'fixture-lacuna', track: trilhaComLacunaDeTypeof(), modo: 'aplicar' },
    );
    assert.equal(resultado.recusadas[0].recusas[0].motivo, 'SAIDA_NAO_JSON');
  });

  it('aceita o JSON seguido do CHECKSUM DE CAUDA que o prompt do §7.1 pede', async () => {
    const fake = criarLlmFake(
      () => `${JSON.stringify(draftDoAutor())}\n\n=== CHECKSUM DE CAUDA ===\n- op:unary:typeof\n`,
    );
    const resultado = await fecharLacunasDeCurriculo(
      { llm: fake.llm, gravarArquivo: async () => undefined },
      { slug: 'fixture-lacuna', track: trilhaComLacunaDeTypeof(), modo: 'aplicar' },
    );
    assert.equal(resultado.aceitas.length, 1, JSON.stringify(resultado.recusadas, null, 1));
    assert.ok(resultado.aceitas[0].checksum, 'a cauda é conferida e reportada');
    assert.equal(resultado.aceitas[0].checksum?.ok, false, 'a repetição parcial é DETECTADA (e reportada, não fatal)');
  });
});

describe('fecharLacunasDeCurriculo — FAIL-CLOSED (§9.3)', () => {
  it('`aplicar` sem transporte de LLM ⇒ ErroDeLacuna estruturado', async () => {
    await assert.rejects(
      () =>
        fecharLacunasDeCurriculo(
          { gravarArquivo: async () => undefined },
          { slug: 'fixture-lacuna', track: trilhaComLacunaDeTypeof(), modo: 'aplicar' },
        ),
      (erro: unknown) => erro instanceof ErroDeLacuna && erro.codigo === 'LACUNA_SEM_LLM',
    );
  });

  it('`aplicar` sem dep de escrita ⇒ ErroDeLacuna estruturado', async () => {
    const fake = criarLlmFake(() => JSON.stringify(draftDoAutor()));
    await assert.rejects(
      () =>
        fecharLacunasDeCurriculo(
          { llm: fake.llm },
          { slug: 'fixture-lacuna', track: trilhaComLacunaDeTypeof(), modo: 'aplicar' },
        ),
      (erro: unknown) => erro instanceof ErroDeLacuna && erro.codigo === 'LACUNA_SEM_ESCRITA',
    );
  });

  it('transporte indisponível ⇒ ErroDeLacuna, jamais veredito por omissão', async () => {
    const llm: EngineLlm = {
      async callLlm() {
        throw new LlmStageError({
          code: 'LLM_STAGE_TIMEOUT',
          etapa: 'v2-lacuna-autoria-de-aula',
          message: 'a etapa estourou o timeout',
          attempts: 1,
          retried: 0,
        });
      },
      getStageUsage: () => undefined,
      getAllStageUsage: () => ({}),
    };
    const escrita = coletorDeEscrita();
    await assert.rejects(
      () =>
        fecharLacunasDeCurriculo(
          { llm, gravarArquivo: escrita.gravar },
          { slug: 'fixture-lacuna', track: trilhaComLacunaDeTypeof(), modo: 'aplicar' },
        ),
      (erro: unknown) => erro instanceof ErroDeLacuna && erro.codigo === 'LACUNA_LLM_INDISPONIVEL',
    );
    assert.equal(escrita.escritos.size, 0);
  });

  it('trilha indisponível ⇒ ErroDeLacuna, antes de qualquer trabalho', async () => {
    await assert.rejects(
      () => fecharLacunasDeCurriculo({}, { slug: 'inexistente' }),
      (erro: unknown) => erro instanceof ErroDeLacuna && erro.codigo === 'LACUNA_TRILHA_INDISPONIVEL',
    );
  });
});

// ---------------------------------------------------------------------------
// 6. Peças de apoio: semente, materialização e separador de JSON
// ---------------------------------------------------------------------------

describe('a semente do `revise` — o insumo de que a aula nova nasce', () => {
  it('escolhe por especificidade decrescente (desafio + construção fora do orçamento)', () => {
    const alvo = lacuna('op:unary:typeof', 'm01/a02', 'typeof v;', 'x/challenges/d2/challenge.json');
    const s1: SementeDeSplit = { aula: 'm01/a02', desafio: 'd1', minimalCode: '1', atoms: [], foraDoOrcamento: [] };
    const s2: SementeDeSplit = {
      aula: 'm01/a02',
      desafio: 'd2',
      minimalCode: '2',
      atoms: ['op:unary:typeof'],
      foraDoOrcamento: ['op:unary:typeof'],
    };
    const outraAula: SementeDeSplit = {
      aula: 'm01/a09',
      desafio: 'd2',
      minimalCode: '3',
      atoms: ['op:unary:typeof'],
      foraDoOrcamento: ['op:unary:typeof'],
    };
    assert.equal(sementeParaLacuna([s1, s2, outraAula], alvo), s2);
    assert.equal(sementeParaLacuna([outraAula], alvo), null, 'semente de OUTRA aula não serve');
  });

  it('o leitor lê `splits/*.seed.json` e descarta o arquivo corrompido sem derrubar o fluxo', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lacuna-sementes-'));
    try {
      const splits = path.join(dir, 'splits');
      await fsp.mkdir(splits, { recursive: true });
      await fsp.writeFile(
        path.join(splits, 'm01-a02--d1.seed.json'),
        JSON.stringify({
          aula: 'm01/a02',
          desafio: 'd1',
          atoms: ['op:unary:typeof'],
          foraDoOrcamento: ['op:unary:typeof'],
          minimalCode: 'typeof v;',
        }),
        'utf8',
      );
      await fsp.writeFile(path.join(splits, 'quebrado.seed.json'), '{ isto nao e json', 'utf8');
      const sementes = await criarLeitorDeSementes(dir)();
      assert.equal(sementes.length, 1);
      assert.equal(sementes[0].aula, 'm01/a02');
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it('diretório sem `splits/` devolve lista vazia (semente é contexto, não gate)', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lacuna-sem-splits-'));
    try {
      assert.deepEqual(await criarLeitorDeSementes(dir)(), []);
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});

describe('materialização e separador — as peças puras de saída', () => {
  it('o module.json insere o slug ANTES da âncora e nunca perde a aula nova', () => {
    const { aula } = cenarioDeVerificacao();
    const meta = { schemaVersion: 1, slug: 'm01', title: 'M', order: 1, lessons: ['a01', 'a02', 'a03'] };
    assert.deepEqual(moduleJsonComAulasNovas(meta, [aula]).lessons, ['a01', aula.slug, 'a02', 'a03']);

    const orfa: AulaNovaPlanejada = { ...aula, inserirAntesDe: 'm01/nao-existe', slug: 'nova' };
    assert.deepEqual(moduleJsonComAulasNovas(meta, [orfa]).lessons, ['a01', 'a02', 'a03', 'nova']);
  });

  it('o lesson.json sai com os campos do produto e os aditivos do §10', () => {
    const { aula } = cenarioDeVerificacao();
    const lesson = lessonJsonDaAulaNova({
      aula,
      draft: comoDraft(draftDoAutor()),
      dificuldadeDaAncora: 3,
    });
    assert.equal(lesson.schemaVersion, 1);
    assert.equal(lesson.slug, aula.slug);
    assert.deepEqual(lesson.concepts, []);
    assert.deepEqual(lesson.prerequisites, []);
    assert.deepEqual(lesson.sources, []);
    assert.equal(lesson.theory.length, 1);
    assert.equal(lesson.difficulty, 3);
    assert.equal((lesson as Record<string, unknown>).eiClass, 'regra');
  });
});
