/**
 * tests/enginePilot.test.ts — pacote P-25: F6 · PILOTO DE TRÊS AULAS E
 * PORTÃO HUMANO (`docs/16-engine-de-trilha.md` §4 F6, §14 passo 6, §4.2).
 *
 * O que este arquivo PROVA (critérios A-P25-1..4):
 *
 *   1. a ONDA CHEIA não roda sem a aprovação do portão: `lerAprovacaoF6`
 *      ausente → `F6_NAO_APROVADO`; `rodarOndasCheias` RECUSA (nem uma
 *      chamada LLM); com o marker criado pelo fluxo interativo, roda;
 *   2. a SELEÇÃO das três aulas é DETERMINÍSTICA e JUSTIFICADA (A-P25-2):
 *      raiz = primeira da ordem topológica, mais armadilhada = maior carga
 *      de risco (introduces + profundidade de composição), tardia = última
 *      da ordem; duas execuções → mesmo resultado; justificativas presentes;
 *   3. o RESULTADO do piloto é PERSISTIDO (piloto-f6.json na raiz injetável)
 *      e ALIMENTA os prompts seguintes (A-P25-3): `resumoParaOndasSeguintes`
 *      presente e preenchido (aulas aprovadas, geração 1 do ruído, laço);
 *   4. o PORTÃO é intransponível por flag: nenhum caminho aceita `force`
 *      (compile-time via @ts-expect-error + runtime com a chave contrabandeada
 *      por `any` — ignorada); string errada no stdin → SEM marker; hash do
 *      conteúdo divergente → `F6_NAO_APROVADO`; re-aprovar conteúdo diferente
 *      → `F6_APROVACAO_DIVERGENTE`;
 *   5. `medir10x10` com FAKES produz o comparativo TIPADO (A-P25-4):
 *      paralelo (1 onda) × sequencial (10), violações de orçamento da
 *      auditoria da trilha de brinquedo, duplicata semântica (proxy jaccard
 *      do laço F11), tokens iguais por regimento, telemetria e ledger
 *      anexando uma linha por regime;
 *   6. o RUÍDO do revisor é medido ANTES de ligar o laço — revisor COMPLACENTE
 *      → taxa geral 1.0 reportada, `decisaoDeCalibracao` reprova com
 *      `LIMIAR_FALSO_PASSE`, `calibracaoNecessariaAntesDeLigar` devolve true
 *      (histórico vazio OU última medição reprovada ⇒ laço DESLIGADO).
 *
 * HIGIENE: LLM, provador, revisor e limitadores são FAKES injetados; o único
 * IO é em diretórios TEMPORÁRIOS criados e limpos pelo próprio teste.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import type { EngineLlm, LlmCallRequest, LlmCallResult, StageUsage } from '../electron/main/engine/runtime/callLlm';
import type { RateLimiter, RateLimiters } from '../electron/main/engine/runtime/scheduler';
import type { EscreverArquivoFn } from '../electron/main/engine/runtime/runState';
import { Ledger, TelemetriaFile } from '../electron/main/engine/runtime/ledger';
import type { ChallengeProofsInput, ChallengeProofsVerdict } from '../electron/main/engine/exec/proofs';
import type { Concept, ConceptGraph, ConceptId } from '../electron/main/engine/graph/model';
import { conceptId } from '../electron/main/engine/graph/model';
import { extractAtoms } from '../electron/main/engine/extract';
import { deriveBudgetDoGrafo, type BudgetF4 } from '../electron/main/engine/phases/f4Budget';
import type { DossieDeAula } from '../electron/main/engine/phases/f7Theory';
import type { ProverDeDesafio } from '../electron/main/engine/phases/f8Challenges';
import {
  APROVACAO_F6_FILENAME,
  APROVACAO_F6_FRASE,
  PILOTO_F6_FILENAME,
  TAMANHO_DO_PILOTO,
  auditarTrilhaDeBrinquedo,
  aulasAprovadasDoPiloto,
  confirmarF6Interativo,
  criarAprovacaoF6,
  garantirAprovacaoF6,
  lerAprovacaoF6,
  medicaoComoGeracao,
  medir10x10,
  medirRuidoDoRevisor,
  paresDuplicadosSemanticamente,
  resumoParaOndasSeguintes,
  rodarOndasCheias,
  rodarPiloto,
  selecionarAulasDoPiloto,
  type AprovacaoMetricas,
  type Comparativo10x10,
  type DepsDe10x10,
  type OpcoesDaAprovacao,
} from '../electron/main/engine/phases/f6Pilot';
import { F6Error } from '../electron/main/engine/phases/f6Pilot';
import {
  calibracaoNecessariaAntesDeLigar,
  decisaoDeCalibracao,
  type DepsDeCalibracao,
  type MedicaoDeFalsoPasse,
} from '../electron/main/engine/quality/judgeCalibration';
import { CLASSES_DE_DEFEITO, desafioValidoExemplo, gerarMutantes } from '../electron/main/engine/quality/mutants';
import { PREDICADOS_DA_AULA } from '../electron/main/engine/prompts/reviewer';
import { montarDossie, type Dossier } from '../electron/main/engine/prompts/dossier';

// ---------------------------------------------------------------------------
// Fixtures de CÓDIGO (os orçamentos dos dossiês são derivados do MESMO código
// que os drafts usam — a fixture nunca dessincroniza do orçamento que a valida)
// ---------------------------------------------------------------------------

const CODIGO_TEORIA = 'function dobra(n) {\n  return n * 2;\n}\n';
const CODIGO_STARTER = 'function dobra(n) {\n}\n';
const CODIGO_SOLUCAO = 'function dobra(n) {\n  return n * 2;\n}\n';
const CODIGO_TESTES =
  "import { test } from 'node:test';\n" +
  "import assert from 'node:assert/strict';\n" +
  "import { dobra } from './solution.mjs';\n" +
  "test('dobro de 2', () => { assert.equal(dobra(2), 4); });\n";

function atomosDo(codigo: string): string[] {
  const extraido = extractAtoms(codigo);
  assert.equal(extraido.ok, true, `código da fixture não parseia:\n${codigo}`);
  return extraido.ok ? extraido.keys : [];
}

function uniaoDosAtomos(...codigos: string[]): string[] {
  const set = new Set<string>();
  for (const codigo of codigos) {
    for (const chave of atomosDo(codigo)) set.add(chave);
  }
  return [...set].sort();
}

function dossieBase(sobre: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    objetivo: {
      verbo: 'dobrar',
      objeto: 'um número com uma função',
      contexto: 'num programa de console',
      criterio: 'a função retorna o dobro',
    },
    introduces_productive: ['node:FunctionDeclaration'],
    budget_produtivo: atomosDo(CODIGO_SOLUCAO),
    budget_receptivo: uniaoDosAtomos(CODIGO_TEORIA, CODIGO_STARTER),
    budget_teste: atomosDo(CODIGO_TESTES),
    kc_type: 'function',
    ei_class: 'regra',
    subgoals: ['declarar função'],
    terms: ['função'],
    notional_machine_delta: 'a função é um mapa de entrada para saída',
    fora_de_escopo: [{ item: 'arrow function', motivo: 'é construção de aula posterior no grafo' }],
    misconceptions_a_refutar: [{ concepcao: 'função sempre precisa de return', ancora_na_spec: 'ECMA-262 §14.1' }],
    desafios_ja_escritos: [],
    ...sobre,
  };
}

function dossieDe(_ref: string): Dossier {
  return montarDossie(dossieBase());
}

function draftAula(sobre: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    raciocinio_de_projeto: 'a aula ensina a função como menor incremento demonstrável sobre o estado atual',
    slug: 'm1/a1',
    title: 'Função que dobra',
    objective: {
      verbo: 'dobrar',
      enunciado: 'dobra um número',
      contexto: 'num programa de console',
      criterio: 'retorna o dobro',
    },
    introduces: { receptive: ['node:FunctionDeclaration'], productive: ['node:FunctionDeclaration'] },
    introducesTerms: ['função'],
    foraDeEscopo: ['arrow function'],
    eiClass: 'regra',
    targetAtom: 'node:FunctionDeclaration',
    notionalMachineDelta: 'a função é um mapa de entrada para saída',
    budgetHash: 'hash-que-o-autor-escreveu',
    budgetVersion: 'v1',
    research: ['ecma-262'],
    theory: [{ id: 't1', secao: 'teoria', markdown: CODIGO_TEORIA, tag: 'js' }],
    justificativa: 'menor incremento demonstrável sobre o estado de conhecimento',
    role: 'regular',
    status: 'rascunho',
    aprovado: false,
    ...sobre,
  };
}

function draftDesafio(sobre: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    raciocinio_de_projeto: 'exercita a construção nova no desafio da própria aula (I6/A6)',
    slug: 'm1/a1/desafio-dobro',
    conceito: 'node:FunctionDeclaration',
    statement: 'Escreva a função dobra que retorna o dobro de um número.',
    starterCode: CODIGO_STARTER,
    solutionCode: CODIGO_SOLUCAO,
    testsCode: CODIGO_TESTES,
    expectedTestCount: 1,
    outputChannel: 'retorno',
    requires: ['node:FunctionDeclaration'],
    notRequired: ['arrow function'],
    subgoals: ['declarar função'],
    scenarios: [{ tipo: 'exemplo', derivado_de: 'node:FunctionDeclaration', descricao: 'dobro de 2 é 4' }],
    taskSkill: 'escrever sintaxe',
    supportLevel: 'sem_andaime',
    surfaceDomain: 'funções',
    solutionAlternates: [],
    wrongSolutions: ['function dobra(n) { return n; }'],
    requirements: [{ id: 'REQ-1', descricao: 'retorna o dobro', teste: 'dobra(2) === 4' }],
    justificativa: 'a construção nova é exigida no desafio da própria aula',
    aprovado: false,
    ...sobre,
  };
}

/** Um DossieDeAula de brinquedo para a onda cheia (snapshot genérico). */
function dossieDeAulaDe(ref: string): DossieDeAula {
  return {
    aula_slug: ref,
    snapshot: {
      aula_slug: ref,
      caminho: `snapshots/${ref.replace(/\//g, '__')}.json`,
      budgetHash: 'b'.repeat(64),
      hash: 'a'.repeat(64),
    },
    dossie: dossieDe(ref),
    desafios_anteriores: [],
  };
}

// ---------------------------------------------------------------------------
// Fakes injetados — LLM com USO ACUMULADO, provador, limitadores, revisores
// ---------------------------------------------------------------------------

interface FalsoLlm {
  llm: EngineLlm;
  chamadas: string[];
  uso: () => { tokensEntrada: number; tokensSaida: number; chamadas: number };
}

/** LLM fake com USO ACUMULADO por etapa (a telemetria do experimento lê daqui). */
function criarFalsoLlm(): FalsoLlm {
  const chamadas: string[] = [];
  const usoPorEtapa = new Map<string, StageUsage>();
  const acumular = (etapa: string): StageUsage => {
    const anterior = usoPorEtapa.get(etapa) ?? { promptTokens: 0, completionTokens: 0, llmCalls: 0, cachedHits: 0, retries: 0 };
    const proximo: StageUsage = {
      promptTokens: anterior.promptTokens + 10,
      completionTokens: anterior.completionTokens + 5,
      llmCalls: anterior.llmCalls + 1,
      cachedHits: anterior.cachedHits,
      retries: anterior.retries,
    };
    usoPorEtapa.set(etapa, proximo);
    return proximo;
  };
  const respostaDe: (etapa: string) => unknown = (etapa) => {
    if (etapa === 'f8-desafio') return draftDesafio();
    return draftAula();
  };
  const llm: EngineLlm = {
    async callLlm(etapa: string, _req: LlmCallRequest): Promise<LlmCallResult> {
      chamadas.push(etapa);
      const stageUsage = acumular(etapa);
      return {
        content: JSON.stringify(respostaDe(etapa)),
        model: 'fake-llm',
        cached: false,
        usage: { promptTokens: 10, completionTokens: 5 },
        stageUsage,
        attempts: 1,
        elapsedMs: 0,
      };
    },
    getStageUsage: (etapa: string) => usoPorEtapa.get(etapa),
    getAllStageUsage: () => Object.fromEntries(usoPorEtapa),
  };
  return {
    llm,
    chamadas,
    uso: () => {
      let tokensEntrada = 0;
      let tokensSaida = 0;
      let chamadasCount = 0;
      for (const etapa of usoPorEtapa.values()) {
        tokensEntrada += etapa.promptTokens;
        tokensSaida += etapa.completionTokens;
        chamadasCount += etapa.llmCalls;
      }
      return { tokensEntrada, tokensSaida, chamadas: chamadasCount };
    },
  };
}

function fakeProver(): ProverDeDesafio {
  return async (input: ChallengeProofsInput): Promise<ChallengeProofsVerdict> => ({
    valid: true,
    failures: [],
    declared: input.expectedTestCount,
    executed: input.expectedTestCount,
  });
}

/** Limitadores SEM teto (o teto é do scheduler — aqui só mede passagem). */
function semaforosFalsos(): RateLimiters {
  const fazer = (): RateLimiter => ({ acquire: async () => () => {} });
  return { llm: fazer(), exec: fazer(), cpu: fazer() };
}

/** Revisor COMPLACENTE: nunca aponta nada — todo mutante vira falso-passe. */
const revisorComplacente: DepsDeCalibracao['revisor'] = async () => ({
  rodada: 1,
  artefato: 'desafio',
  hash_artefato: 'hash',
  resumo: 'nenhum achado',
  apontamentos: [],
  predicados: PREDICADOS_DA_AULA.map((p) => ({
    id: p.id as 'E1' | 'E2' | 'E3' | 'E4' | 'E5',
    pergunta: p.pergunta,
    justificativa: 'nada a apontar',
    veredito: 'sim' as const,
  })),
});

/** A régua da calibração (artefato válido + os 4 mutantes do P-20). */
function amostrasDeCalibracaoDeFato(): { valido: ReturnType<typeof desafioValidoExemplo>; mutantes: ReturnType<typeof gerarMutantes> } {
  const valido = desafioValidoExemplo();
  return { valido, mutantes: gerarMutantes(valido) };
}

// ---------------------------------------------------------------------------
// A TRILHA DE BRINQUEDO — grafo, plano e orçamento sintéticos (nunca uma
// trilha real: nunca nodejs-do-zero)
// ---------------------------------------------------------------------------

function conceito(id: string, desbloqueadoPor: string[] = []): Concept {
  return { id: conceptId(id), desbloqueadoPor: desbloqueadoPor.map((p) => conceptId(p)), usa: [] };
}

/**
 * O grafo de brinquedo da SELEÇÃO: a cadeia c1→c2→c3→c4 + raiz r1, com a
 * aula armadilhada introduzindo [c4, r1] (introduces 2 + profundidade 3 =
 * risco 5 — e o fecho-para-baixo de ambos está nas aulas ANTERIORES, então
 * a derivação F4 aceita); a aula tardia introduz a raiz zz (a ÚLTIMA da
 * ordem porém rasa — a armadilhada vence por COMPOSIÇÃO, não por posição).
 */
function grafoDeBrinquedo(): ConceptGraph {
  return {
    conceitos: [
      conceito('c1'),
      conceito('c2', ['c1']),
      conceito('c3', ['c2']),
      conceito('c4', ['c3']),
      conceito('r1'),
      conceito('zz'),
    ],
  };
}

function aulasPlanoDeBrinquedo(): { ref: string; introduz: ConceptId[] }[] {
  return [
    { ref: 'm1/a-raiz', introduz: [conceptId('c1')] },
    { ref: 'm1/a-meio', introduz: [conceptId('c2')] },
    { ref: 'm1/a-meio2', introduz: [conceptId('c3')] },
    { ref: 'm1/a-armadilhada', introduz: [conceptId('c4'), conceptId('r1')] },
    { ref: 'm1/a-tardia', introduz: [conceptId('zz')] },
  ];
}

function orcamentoDeBrinquedo(): BudgetF4 {
  const { budget } = deriveBudgetDoGrafo({
    grafo: grafoDeBrinquedo(),
    entryConstructs: [],
    aulas: aulasPlanoDeBrinquedo(),
  });
  return budget;
}

/** A ordem topológica lexicográfica do grafo de brinquedo (determinística). */
function ordemDeBrinquedo(): ConceptId[] {
  return ['c1', 'c2', 'c3', 'c4', 'r1', 'zz'].map((id) => conceptId(id));
}

function metricasDeExemplo(): AprovacaoMetricas {
  return {
    selecao: selecionarAulasDoPiloto(orcamentoDeBrinquedo(), grafoDeBrinquedo()),
    ruidoDoRevisor: {
      amostras: 5,
      frenteAMutantes: 4,
      taxaGeral: 1,
      porClasse: CLASSES_DE_DEFEITO.map((classe) => ({
        classe,
        totalMutantes: 1,
        detectados: 0,
        falsosPasses: 1,
        taxaDeFalsoPasse: 1,
        razaoDeAcerto: 0,
      })),
      achadosNoValido: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers de IO (diretórios temporários — convenção do repositório)
// ---------------------------------------------------------------------------

async function dirTemp(prefixo = 'engine-pilot-'): Promise<string> {
  return fsp.mkdtemp(path.join(os.tmpdir(), prefixo));
}

async function limpar(dir: string): Promise<void> {
  await fsp.rm(dir, { recursive: true, force: true });
}

const escreverNoDisco: EscreverArquivoFn = async (caminho, conteudo) => {
  await fsp.mkdir(path.dirname(caminho), { recursive: true });
  await fsp.writeFile(caminho, conteudo, 'utf8');
};

/** As dependências da ONDA CHEIA com os fakes (escrita em tmp). */
function depsDaOndaCheia(falso: FalsoLlm, baseDir: string) {
  return {
    llm: falso.llm,
    prover: fakeProver(),
    limiters: semaforosFalsos(),
    escreverArquivo: escreverNoDisco,
    baseDir,
  };
}

// ---------------------------------------------------------------------------
// 1. A ONDA CHEIA NÃO RODA SEM A APROVAÇÃO DO PORTÃO
// ---------------------------------------------------------------------------

describe('F6 — a onda cheia exige o portão humano (aprovacao-f6.json)', () => {
  it('rodarOndasCheias RECUSA sem o marker — F6_NAO_APROVADO e ZERO chamadas LLM', async (t) => {
    const dir = await dirTemp();
    t.after(() => limpar(dir));
    const falso = criarFalsoLlm();

    await assert.rejects(
      rodarOndasCheias(dir, depsDaOndaCheia(falso, dir), [dossieDeAulaDe('m1/a-raiz')]),
      (erro: unknown) => erro instanceof F6Error && erro.code === 'F6_NAO_APROVADO',
    );
    assert.equal(falso.chamadas.length, 0, 'sem o marker, NENHUMA chamada LLM roda');
  });

  it('lerAprovacaoF6 ausente → erro estruturado F6_NAO_APROVADO (fail-closed)', async (t) => {
    const dir = await dirTemp();
    t.after(() => limpar(dir));
    await assert.rejects(lerAprovacaoF6(dir), (erro: unknown) => erro instanceof F6Error && erro.code === 'F6_NAO_APROVADO');
  });

  it('com o marker criado pelo fluxo INTERATIVO, a onda cheia roda', async (t) => {
    const dir = await dirTemp();
    t.after(() => limpar(dir));
    const metricas = metricasDeExemplo();
    const marker = await confirmarF6Interativo({
      dir,
      aulas: metricas.selecao.aulas,
      metricas,
      lerLinha: async () => APROVACAO_F6_FRASE,
    });
    assert.ok(marker !== null, 'a frase EXATA cria o marker');
    await garantirAprovacaoF6(dir); // não lança

    const falso = criarFalsoLlm();
    const resultado = await rodarOndasCheias(dir, depsDaOndaCheia(falso, dir), [dossieDeAulaDe('m1/a-raiz')]);
    assert.ok(falso.chamadas.length > 0, 'com o portão aberto, a autoria roda');
    assert.equal(resultado.estados.length, 1);
    assert.equal(resultado.estados[0].status, 'validado');
  });
});

// ---------------------------------------------------------------------------
// 2. A SELEÇÃO É DETERMINÍSTICA E JUSTIFICADA (A-P25-2)
// ---------------------------------------------------------------------------

describe('F6 — seleção determinística e justificada das 3 aulas', () => {
  it('raiz + mais armadilhada + tardia, na ordem, com justificativas presentes', () => {
    const selecao = selecionarAulasDoPiloto(orcamentoDeBrinquedo(), grafoDeBrinquedo());

    assert.deepEqual(
      selecao.aulas,
      ['m1/a-raiz', 'm1/a-armadilhada', 'm1/a-tardia'],
      'raiz = primeira da ordem; armadilhada = maior carga de risco; tardia = última da ordem',
    );
    assert.equal(selecao.justificativas.length, TAMANHO_DO_PILOTO);
    assert.deepEqual(
      selecao.justificativas.map((j) => j.papel),
      ['raiz', 'mais_armadilhada', 'tardia'],
    );
    for (const justificativa of selecao.justificativas) {
      assert.ok(justificativa.aula.length > 0, 'o papel carrega a aula');
      assert.ok(justificativa.regra.length > 0, 'o papel carrega a REGRA que decidiu');
      assert.ok(justificativa.criterio.length > 0, 'o papel carrega o CRITÉRIO determinístico');
    }
    // a justificativa da armadilhada expõe a conta: introduces 2 + profundidade 3 = 5.
    assert.match(selecao.justificativas[1].criterio, /introduces=2 \+ profundidade=3 = 5/);
  });

  it('DUAS execuções produzem EXATAMENTE o mesmo resultado (determinismo)', () => {
    const primeira = selecionarAulasDoPiloto(orcamentoDeBrinquedo(), grafoDeBrinquedo());
    const segunda = selecionarAulasDoPiloto(orcamentoDeBrinquedo(), grafoDeBrinquedo());
    assert.deepEqual(primeira, segunda);
  });

  it('aceita a ORDEM já linearizada (F3) — mesmo resultado, profundidade posicional', () => {
    const peloGrafo = selecionarAulasDoPiloto(orcamentoDeBrinquedo(), grafoDeBrinquedo());
    const pelaOrdem = selecionarAulasDoPiloto(orcamentoDeBrinquedo(), ordemDeBrinquedo());
    assert.deepEqual(pelaOrdem.aulas, peloGrafo.aulas, 'grafo e ordem convergem para a MESMA seleção');
    assert.equal(pelaOrdem.justificativas.length, 3);
    // determinismo: duas execuções com a MESMA ordem → mesmo resultado.
    assert.deepEqual(pelaOrdem, selecionarAulasDoPiloto(orcamentoDeBrinquedo(), ordemDeBrinquedo()));
  });

  it('fail-closed: orçamento pequeno demais não tem piloto (menos de 3 papéis distintos)', () => {
    const { budget } = deriveBudgetDoGrafo({
      grafo: { conceitos: [conceito('c1'), conceito('c2', ['c1'])] },
      entryConstructs: [],
      aulas: [
        { ref: 'm1/a1', introduz: [conceptId('c1')] },
        { ref: 'm1/a2', introduz: [conceptId('c2')] },
      ],
    });
    assert.throws(
      () => selecionarAulasDoPiloto(budget, { conceitos: [conceito('c1'), conceito('c2', ['c1'])] }),
      (erro: unknown) => erro instanceof F6Error && erro.code === 'PILOTO_INVALIDO',
    );
  });
});

// ---------------------------------------------------------------------------
// 3. O RESULTADO DO PILOTO É PERSISTIDO E ALIMENTA AS ONDAS SEGUINTES
// ---------------------------------------------------------------------------

describe('F6 — piloto executado, persistido e consumido como contexto (A-P25-3)', () => {
  it('rodarPiloto autoriza as 3 aulas, mede o ruído (geração 1) e PERSISTE piloto-f6.json', async (t) => {
    const dir = await dirTemp();
    t.after(() => limpar(dir));
    const falso = criarFalsoLlm();
    const provador = fakeProver();
    const orcamento = orcamentoDeBrinquedo();
    const selecao = selecionarAulasDoPiloto(orcamento, grafoDeBrinquedo());
    const dossies = new Map<string, Dossier>(selecao.aulas.map((ref) => [ref, dossieDe(ref)]));

    const piloto = await rodarPiloto(
      {
        llm: falso.llm,
        prover: provador,
        limiters: semaforosFalsos(),
        escreverArquivo: escreverNoDisco,
        baseDir: dir,
        raizDoResultado: dir,
        dossies,
        revisor: revisorComplacente,
        amostrasDeCalibracao: amostrasDeCalibracaoDeFato(),
        grafoOuOrdem: grafoDeBrinquedo(),
      },
      orcamento,
      selecao.aulas,
    );

    // PERSISTIDO em piloto-f6.json (raiz injetável) — A-P25-3.
    const persistido = JSON.parse(await fsp.readFile(path.join(dir, PILOTO_F6_FILENAME), 'utf8'));
    assert.equal(persistido.versao, '1');
    assert.equal(persistido.hash, piloto.hash);
    assert.deepEqual(persistido.selecao.aulas, selecao.aulas);

    // O resultado: seleção justificada + 3 aulas aprovadas + ruído na geração 1.
    assert.deepEqual(piloto.selecao.aulas, selecao.aulas);
    assert.equal(piloto.autoria.estados.length, 3);
    assert.deepEqual([...aulasAprovadasDoPiloto(piloto)].sort(), [...selecao.aulas].sort());
    assert.equal(piloto.historicoDeCalibracao.length, 1);
    assert.equal(piloto.historicoDeCalibracao[0].geracao, 1, 'o ruído do piloto é a GERAÇÃO 1 do histórico');
    assert.equal(piloto.ruidoDoRevisor.taxaGeral, 1, 'revisor complacente → 100% de falso-passe reportado');

    // ALIMENTA os prompts seguintes — o resumo está presente e preenchido.
    const resumo = resumoParaOndasSeguintes(piloto);
    assert.match(resumo, /PILOTO F6 — CONTEXTO PARA AS ONDAS SEGUINTES/);
    for (const aula of selecao.aulas) assert.ok(resumo.includes(aula), `o resumo cita a aula ${aula}`);
    assert.match(resumo, /geração 1/);
    assert.match(resumo, /falsos-passantes|falso-passe/);
    assert.match(resumo, /DESLIGADO/, 'revisor complacente → o laço das ondas cheias fica DESLIGADO no resumo');
  });

  it('fail-closed: aula fora da seleção determinística → PILOTO_INVALIDO', async (t) => {
    const dir = await dirTemp();
    t.after(() => limpar(dir));
    const falso = criarFalsoLlm();
    const orcamento = orcamentoDeBrinquedo();
    const dossies = new Map<string, Dossier>([
      ['m1/a-raiz', dossieDe('m1/a-raiz')],
      ['m1/a-meio', dossieDe('m1/a-meio')],
      ['m1/a-zb', dossieDe('m1/a-zb')],
    ]);
    await assert.rejects(
      rodarPiloto(
        {
          llm: falso.llm,
          prover: fakeProver(),
          limiters: semaforosFalsos(),
          escreverArquivo: escreverNoDisco,
          dossies,
          revisor: revisorComplacente,
          amostrasDeCalibracao: amostrasDeCalibracaoDeFato(),
          grafoOuOrdem: grafoDeBrinquedo(),
        },
        orcamento,
        ['m1/a-raiz', 'm1/a-meio', 'm1/a-zb'], // NÃO é a seleção determinística
      ),
      (erro: unknown) => erro instanceof F6Error && erro.code === 'PILOTO_INVALIDO',
    );
  });
});

// ---------------------------------------------------------------------------
// 4. O PORTÃO É INTRANSPONÍVEL POR FLAG
// ---------------------------------------------------------------------------

describe('F6 — portão humano intransponível por flag', () => {
  it('nenhum caminho aceita flag force — nem em tempo de compilação nem em runtime', async (t) => {
    const dir = await dirTemp();
    const dir2 = await dirTemp('engine-pilot-force-');
    t.after(() => Promise.all([limpar(dir), limpar(dir2)]));

    // COMPILE-TIME: a assinatura de lerAprovacaoF6 NÃO tem parâmetro de bypass —
    // passar { force: true } é ERRO de tipo (o @ts-expect-error consome).
    // @ts-expect-error — o portão NUNCA aceita flag force: a assinatura de lerAprovacaoF6 não tem parâmetro de bypass
    const promessaInvalida = lerAprovacaoF6(dir, { force: true });
    await assert.rejects(promessaInvalida, (erro: unknown) => erro instanceof F6Error && erro.code === 'F6_NAO_APROVADO');

    // COMPILE-TIME: DadosDaAprovacao também não tem force — fora do contrato.
    // A entrada é invalidada ANTES de qualquer escrita — nada é gravado.
    // @ts-expect-error — criarAprovacaoF6 não aceita 'force' no objeto de dados
    const promessaComForca = criarAprovacaoF6(dir2, { aulas: ['m1/a-raiz'], metricas: {} as AprovacaoMetricas, force: true });
    await assert.rejects(
      promessaComForca,
      (erro: unknown) => erro instanceof F6Error && erro.code === 'PILOTO_INVALIDO',
      'entrada com força não existe: o portão rejeita e NÃO abre',
    );
    await assert.rejects(fsp.access(path.join(dir2, APROVACAO_F6_FILENAME)), (erro: unknown) =>
      (erro as NodeJS.ErrnoException).code === 'ENOENT',
    );

    // RUNTIME: mesmo que alguém contrabandeie a chave via any, o portão IGNORA
    // a opção — o fail-closed continua valendo com o diretório vazio.
    const contrabando = { force: true, skip: true } as unknown as OpcoesDaAprovacao;
    await assert.rejects(
      lerAprovacaoF6(dir, contrabando),
      (erro: unknown) => erro instanceof F6Error && erro.code === 'F6_NAO_APROVADO',
      'flag contrabandeada via any não abre o portão',
    );
  });

  it('string errada no stdin → NENHUM marker é escrito (nem o arquivo existe)', async (t) => {
    const dir = await dirTemp();
    t.after(() => limpar(dir));
    const metricas = metricasDeExemplo();

    const resultado = await confirmarF6Interativo({
      dir,
      aulas: metricas.selecao.aulas,
      metricas,
      lerLinha: async () => 'aprovado!',
    });
    assert.equal(resultado, null, 'qualquer coisa que não a frase EXATA não aprova');
    await assert.rejects(fsp.access(path.join(dir, APROVACAO_F6_FILENAME)), (erro: unknown) =>
      (erro as NodeJS.ErrnoException).code === 'ENOENT',
    );
  });

  it('a frase EXATA cria o marker com hash; ler devolve o mesmo conteúdo; re-aprovar o MESMO é NO-OP', async (t) => {
    const dir = await dirTemp();
    t.after(() => limpar(dir));
    const metricas = metricasDeExemplo();

    const criado = await confirmarF6Interativo({
      dir,
      aulas: metricas.selecao.aulas,
      metricas,
      lerLinha: async () => APROVACAO_F6_FRASE,
    });
    assert.ok(criado !== null);
    assert.match(criado.hash, /^[0-9a-f]{64}$/, 'hash do conteúdo é sha256 em hex (64)');

    const lido = await lerAprovacaoF6(dir);
    assert.equal(lido.hash, criado.hash);
    assert.deepEqual(lido.aulas, metricas.selecao.aulas);

    // idempotente: re-aprovar o MESMO conteúdo não sobrescreve nem erra.
    const deNovo = await confirmarF6Interativo({
      dir,
      aulas: metricas.selecao.aulas,
      metricas,
      lerLinha: async () => APROVACAO_F6_FRASE,
    });
    assert.equal(deNovo?.hash, criado.hash);
  });

  it('hash do conteúdo divergente (adulteração) → F6_NAO_APROVADO', async (t) => {
    const dir = await dirTemp();
    t.after(() => limpar(dir));
    const metricas = metricasDeExemplo();
    await confirmarF6Interativo({ dir, aulas: metricas.selecao.aulas, metricas, lerLinha: async () => APROVACAO_F6_FRASE });

    const caminho = path.join(dir, APROVACAO_F6_FILENAME);
    const adulterado = JSON.parse(await fsp.readFile(caminho, 'utf8'));
    adulterado.hash = '0'.repeat(64); // mexeu no hash SEM recalcular o conteúdo
    await fsp.writeFile(caminho, `${JSON.stringify(adulterado, null, 2)}\n`, 'utf8');

    await assert.rejects(
      lerAprovacaoF6(dir),
      (erro: unknown) => erro instanceof F6Error && erro.code === 'F6_NAO_APROVADO',
      'hash divergente = portão NÃO aprovado (fail-closed)',
    );
  });

  it('re-aprovar conteúdo DIFERENTE → F6_APROVACAO_DIVERGENTE; JSON corrompido → F6_NAO_APROVADO e re-aprovar é RECUSADO', async (t) => {
    const dir = await dirTemp();
    t.after(() => limpar(dir));
    const metricas = metricasDeExemplo();
    await confirmarF6Interativo({ dir, aulas: metricas.selecao.aulas, metricas, lerLinha: async () => APROVACAO_F6_FRASE });

    // re-aprovar com OUTRAS aulas — NUNCA uma aprovação humana é sobrescrita
    // por outra em silêncio (mesmo com a frase EXATA no stdin).
    await assert.rejects(
      confirmarF6Interativo({
        dir,
        aulas: ['m1/outra'],
        metricas: { ...metricas, selecao: { ...metricas.selecao, aulas: ['m1/outra'] } },
        lerLinha: async () => APROVACAO_F6_FRASE,
      }),
      (erro: unknown) => erro instanceof F6Error && erro.code === 'F6_APROVACAO_DIVERGENTE',
    );

    // corrompido: grava lixo por cima e a leitura falha fechada...
    await fsp.writeFile(path.join(dir, APROVACAO_F6_FILENAME), '{lixo', 'utf8');
    await assert.rejects(lerAprovacaoF6(dir), (erro: unknown) => erro instanceof F6Error && erro.code === 'F6_NAO_APROVADO');
    // ...e re-aprovar por cima TAMBÉM é recusado (fail-closed: um portão
    // corrompido NÃO é consertado escrevendo outra aprovação por cima).
    await assert.rejects(
      confirmarF6Interativo({ dir, aulas: metricas.selecao.aulas, metricas, lerLinha: async () => APROVACAO_F6_FRASE }),
      (erro: unknown) => erro instanceof F6Error && erro.code === 'F6_APROVACAO_DIVERGENTE',
    );
  });
});

// ---------------------------------------------------------------------------
// 5. O EXPERIMENTO 10×10 COM FAKES (A-P25-4)
// ---------------------------------------------------------------------------

describe('F6 — experimento 10 paralelas × 10 sequenciais (trilha de brinquedo)', () => {
  it('produz o comparativo TIPADO com fakes; paralelo 1 onda vs sequencial 10; telemetria e ledger anexam 1 linha por regime', async (t) => {
    const dir = await dirTemp();
    t.after(() => limpar(dir));

    // A trilha NOVA DE BRINQUEDO: 10 conceitos em cadeia, 10 aulas, dossiê por aula.
    const cadeia: Concept[] = [];
    for (let i = 1; i <= 10; i += 1) {
      cadeia.push(conceito(`c${i}`, i > 1 ? [`c${i - 1}`] : []));
    }
    const dezAulas = Array.from({ length: 10 }, (_, i) => `m2/a${String(i + 1).padStart(2, '0')}`);
    const { budget } = deriveBudgetDoGrafo({
      grafo: { conceitos: cadeia },
      entryConstructs: [],
      aulas: dezAulas.map((ref, i) => ({ ref, introduz: [conceptId(`c${i + 1}`)] })),
    });
    const dossies = new Map<string, Dossier>(dezAulas.map((ref) => [ref, dossieDe(ref)]));

    const deps: DepsDe10x10 = {
      criarLlm: () => criarFalsoLlm().llm,
      prover: fakeProver(),
      limiters: semaforosFalsos(),
      escreverArquivo: escreverNoDisco,
      baseDir: dir,
      dossies,
      telemetria: new TelemetriaFile(dir),
      ledger: new Ledger(dir),
      runId: 'run-10x10-test',
    };

    const comparativo: Comparativo10x10 = await medir10x10(deps, budget, dezAulas);
    assert.equal(comparativo.versao, '1');
    assert.deepEqual(comparativo.aulas, dezAulas);

    assert.equal(comparativo.paralelo.modo, 'paralelo');
    assert.equal(comparativo.paralelo.ondas, 1, '10 tarefas = UMA onda do scheduler');
    assert.equal(comparativo.paralelo.aulasAutoradas, 10);
    assert.equal(comparativo.paralelo.estados.length, 10);
    assert.ok(comparativo.paralelo.estados.every((e) => e.status === 'validado'));
    assert.equal(comparativo.paralelo.violacoesDeOrcamento, 0, 'auditoria da trilha de brinquedo limpa');
    assert.equal(comparativo.paralelo.duplicatasSemanticas.total, 45, '10 aulas → 45 pares; script determinístico → todos duplicados');
    assert.equal(comparativo.paralelo.chamadasLlm, 30, '10 aulas × 3 etapas');
    assert.equal(comparativo.paralelo.tokensEntrada, 300, '30 chamadas × 10 tokens de entrada');
    assert.equal(comparativo.paralelo.tokensSaida, 150, '30 chamadas × 5 tokens de saída');

    assert.equal(comparativo.sequencial.modo, 'sequencial');
    assert.equal(comparativo.sequencial.ondas, 10, 'serial = UMA aula por vez');
    assert.equal(comparativo.sequencial.aulasAutoradas, 10);
    assert.equal(comparativo.sequencial.violacoesDeOrcamento, 0);
    assert.equal(comparativo.sequencial.duplicatasSemanticas.total, 45);
    assert.equal(comparativo.sequencial.chamadasLlm, 30);
    assert.equal(comparativo.sequencial.tokensEntrada, comparativo.paralelo.tokensEntrada, 'mesmo conteúdo → mesmos tokens');
    assert.equal(comparativo.sequencial.tokensSaida, comparativo.paralelo.tokensSaida);

    // telemetria + ledger (dados do experimento) — UMA linha por regime.
    const telemetria = await new TelemetriaFile(dir).ler();
    assert.equal(telemetria.length, 2);
    assert.deepEqual(
      telemetria.map((l) => l.etapa).sort(),
      ['F6-10x10-paralelo', 'F6-10x10-sequencial'],
    );
    assert.ok(telemetria.every((l) => l.tarefa === 'piloto-10x10' && l.tokensEntrada === 300 && l.tokensSaida === 150));

    const verificacao = await new Ledger(dir).verificarCadeiaEmDisco();
    assert.equal(verificacao.ok, true, 'o ledger do experimento mantém a cadeia íntegra');
    const linhas = await new Ledger(dir).ler();
    assert.equal(linhas.length, 2);
    assert.ok(linhas.every((l) => l.runId === 'run-10x10-test' && l.tipo === 'checkpoint'));
  });

  it('fail-closed: menos de 10 aulas → PILOTO_INVALIDO', async (t) => {
    const dir = await dirTemp();
    t.after(() => limpar(dir));
    const { budget } = deriveBudgetDoGrafo({
      grafo: { conceitos: [conceito('c1'), conceito('c2', ['c1'])] },
      entryConstructs: [],
      aulas: [
        { ref: 'm2/a01', introduz: [conceptId('c1')] },
        { ref: 'm2/a02', introduz: [conceptId('c2')] },
      ],
    });
    await assert.rejects(
      medir10x10(
        {
          criarLlm: () => criarFalsoLlm().llm,
          prover: fakeProver(),
          limiters: semaforosFalsos(),
          escreverArquivo: escreverNoDisco,
          baseDir: dir,
          dossies: new Map([
            ['m2/a01', dossieDe('m2/a01')],
            ['m2/a02', dossieDe('m2/a02')],
          ]),
        },
        budget,
        ['m2/a01', 'm2/a02'],
      ),
      (erro: unknown) => erro instanceof F6Error && erro.code === 'PILOTO_INVALIDO',
    );
  });

  it('auditarTrilhaDeBrinquedo e paresDuplicadosSemanticamente são funções PURAS e exportadas', () => {
    const auditoria = auditarTrilhaDeBrinquedo([]);
    assert.deepEqual(auditoria, { aulasAuditadas: 0, violacoes: [] });
    const pares = paresDuplicadosSemanticamente([
      { aula: 'a', conteudo: 'x y' },
      { aula: 'b', conteudo: 'x y' },
    ]);
    assert.equal(pares.total, 1);
    assert.equal(pares.pares[0].jaccard, 1);
  });
});

// ---------------------------------------------------------------------------
// 6. RUÍDO MEDIDO — ANTES DE LIGAR O LAÇO (contrato P-20/P-22)
// ---------------------------------------------------------------------------

describe('F6 — ruído do revisor medido antes de ligar o laço (geração 1)', () => {
  it('revisor COMPLACENTE → taxa geral 1.0 reportada; decisão reprova; laço DESLIGADO', async () => {
    const amostras = amostrasDeCalibracaoDeFato();
    const medicao: MedicaoDeFalsoPasse = await medirRuidoDoRevisor({ revisor: revisorComplacente }, amostras);

    assert.equal(medicao.frenteAMutantes, 4);
    assert.equal(medicao.taxaGeral, 1, 'revisor que nunca aponta → TODO mutante vira falso-passe');
    assert.ok(medicao.porClasse.every((c) => c.taxaDeFalsoPasse === 1));

    const decisao = decisaoDeCalibracao(medicao);
    assert.equal(decisao.aprovado, false);
    assert.equal(decisao.motivo, 'LIMIAR_FALSO_PASSE');
    assert.match(decisao.mensagem, /PARE o laço/);

    // CONTRATO DOCUMENTADO: histórico vazio ⇒ laço DESLIGADO (P-22 não liga);
    // medição reprovada no histórico ⇒ continua desligado.
    assert.equal(calibracaoNecessariaAntesDeLigar([]), true, 'histórico vazio ⇒ laço desligado');
    assert.equal(calibracaoNecessariaAntesDeLigar([medicao]), true, 'última medição reprovada ⇒ laço desligado');

    // A medição vira a GERAÇÃO 1 do histórico de calibração.
    const geracao = medicaoComoGeracao(medicao, 1);
    assert.equal(geracao.geracao, 1);
    assert.equal(geracao.medicao.taxaGeral, 1);
  });
});