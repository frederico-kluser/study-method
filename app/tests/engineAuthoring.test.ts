/**
 * tests/engineAuthoring.test.ts — o pacote P-17: F7 (autoria de teoria) e F8
 * (autoria de desafios) — a ORDEM INTERNA DE UMA AULA do
 * `docs/16-engine-de-trilha.md` §4.3.
 *
 * O que morde aqui (critérios A-P17):
 *
 *   1. cada agente escreve SOMENTE os drafts únicos da sua aula e a posse é
 *      validada ANTES da onda — colisão de arquivo = erro estruturado do
 *      escalonador (ownership-collision), nada roda;
 *   2. o desafio é gerado ANTES do fechamento da teoria — a ordem das
 *      chamadas LLM é verificada por etapa (esqueleto → desafio → fechamento),
 *      e a ordem é IMPOSTA PELO CÓDIGO (etapas sequenciais, jamais paralelas —
 *      §4.1);
 *   3. resposta `blocked` do autor NÃO produz aula parcial: nenhum arquivo de
 *      draft, estado `blocked` registrado (em qualquer etapa da §4.3);
 *   4. o resumo da teoria efetivamente escrita chega ao autor de desafio (o
 *      prompt da 2ª chamada contém `resumoDaTeoria`) junto da anti-repetição;
 *   5. ondas > 15 são DIVIDIDAS em batches de 15, nunca truncadas;
 *   6. todo draft nasce com o hash do orçamento que o gerou (budgetHash do
 *      snapshot do freeze no draft — A-P17-3);
 *   7. (bônus) draft com construção fora do orçamento do snapshot é REJEITADO
 *      NOMEANDO a construção — e as QUATRO PROVAS (§5.4) rodam na validação
 *      (prover fake registrando chamadas);
 *   8. o orçamento é validado POR FAIXAS (§3.3): testsCode ⊆ budget_teste (o
 *      aluno lê o teste ANTES da aula — A3), starterCode ⊆ budget_receptivo
 *      (A1), solutionCode ⊆ budget_produtivo (A2) + A6 (a solução puxa ≥1
 *      construção do introduces.productive); a teoria ⊆ budget_receptivo (A4)
 *      — a união das três listas NÃO vale para nenhuma superfície;
 *   9. a posse é validada GLOBALMENTE sobre a UNIÃO dos batches — duplicata de
 *      aula_slug entre o batch 1 e o batch 2 rejeita o run INTEIRO antes de
 *      qualquer escrita (a validação por onda do scheduler não alcança
 *      colisões cruzadas);
 *  10. a CAUDA DE CHECKSUM do §7.1 R18: o prompt que as três etapas usam manda
 *      o modelo repetir a lista de construções permitidas DEPOIS do JSON —
 *      então a resposta de um modelo OBEDIENTE não é JSON puro. O fake de LLM
 *      desta suíte devolve a cauda (extraída do próprio prompt, como o modelo
 *      faria), e a suíte cobre também o modelo que NÃO a devolve: os dois têm
 *      de funcionar. A cauda é CONFERIDA e REPORTADA (aviso da onda), nunca
 *      reprova o draft — quem reprova é o orçamento sobre o código escrito.
 *
 * HIGIENE: LLM e provador são FAKES injetados (sem rede, sem processo, sem
 * chave); escrita de drafts em memória; sem scheduler real nos testes de
 * estado interno (o `execute` injetável é o que os testes usam — quem roda o
 * scheduler de verdade é o runOndaDeAutoria testado via limiters fake).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { EngineLlm, LlmCallRequest, LlmCallResult } from '../electron/main/engine/runtime/callLlm';
import { SchedulerError, type RateLimiter, type RateLimiters } from '../electron/main/engine/runtime/scheduler';
import type { EscreverArquivoFn } from '../electron/main/engine/runtime/runState';
import type { ChallengeProofsInput, ChallengeProofsVerdict } from '../electron/main/engine/exec/proofs';
import { extractAtoms } from '../electron/main/engine/extract';
import { LessonDraftSchema } from '../electron/main/engine/schemas/artifacts';
import { montarDossie } from '../electron/main/engine/prompts/dossier';
import { MAX_TOKENS_SAIDA_AUTOR } from '../electron/main/engine/prompts/author';
import type { SnapshotAula } from '../electron/main/engine/phases/f5Freeze';
import {
  TETO_ONDA_AUTORIA,
  autorizarAula,
  caminhoDraftAula,
  caminhoDraftDesafio,
  dividirEmBatches,
  resumoDaTeoria,
  runOndaDeAutoria,
  type DepsDaOndaAutoria,
  type DossieDeAula,
  type EtapaAutoria,
} from '../electron/main/engine/phases/f7Theory';
import type { ProverDeDesafio } from '../electron/main/engine/phases/f8Challenges';

// ---------------------------------------------------------------------------
// Fixtures de CÓDIGO (as superfícies dos drafts) — os orçamentos do dossiê
// são DERIVADOS DELAS via `extractAtoms` (o mesmo parser do gate): a fixture
// nunca dessincroniza do orçamento que a valida.
// ---------------------------------------------------------------------------

const CODIGO_TEORIA = 'function dobra(n) {\n  return n * 2;\n}\n';
const CODIGO_STARTER = 'function dobra(n) {\n}\n';
const CODIGO_SOLUCAO = 'function dobra(n) {\n  return n * 2;\n}\n';
const CODIGO_TESTES =
  "import { test } from 'node:test';\n" +
  "import assert from 'node:assert/strict';\n" +
  "import { dobra } from './solution.mjs';\n" +
  "test('dobro de 2', () => { assert.equal(dobra(2), 4); });\n";

// Probe do revisor (HIGH): um TESTE que usa `node:ForStatement` — construção
// que o aluno já leu em aula anterior (está na faixa produtiva, NÃO no
// budget_teste) — passava como validado sob a validação por UNIÃO; por faixas
// (§3.3 A3) o teste só pode usar o budget_teste.
const CODIGO_TESTES_COM_LACO =
  "import { test } from 'node:test';\n" +
  "import assert from 'node:assert/strict';\n" +
  "import { dobra } from './solution.mjs';\n" +
  "test('dobro de 2', () => { for (let i = 0; i < 3; i++) { assert.equal(dobra(2), 4); } });\n";

// Probe do revisor (HIGH, espelhado no starter): um STARTER usando
// `node:ForStatement` (construção só-produtiva — fora do budget_receptivo) —
// por faixas (§3.3 A1) o starter só pode usar o que o aluno pode LER.
const CODIGO_STARTER_COM_LACO =
  'function contar(n) {\n' +
  '  for (let i = 0; i < n; i++) {\n' +
  '    console.log(i);\n' +
  '  }\n' +
  '}\n';

// Probe do revisor (HIGH, A6): uma SOLUÇÃO que não usa NENHUMA construção que
// a aula introduz produtivamente (não puxa o `node:FunctionDeclaration`) —
// mesmo dentro do budget_produtivo, o desafio não exige o que a aula ensina.
const CODIGO_SOLUCAO_SEM_PRODUTIVA_NOVA = 'const x = 2;\n';

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

/** O HASH do orçamento do snapshot (sha256 em hex, 64) — o default dos testes. */
const HASH_SISTEMA = 'b'.repeat(64);

function snapshotDeAula(ref: string, budgetHash = HASH_SISTEMA): SnapshotAula {
  return { aula_slug: ref, caminho: `snapshots/${ref.replace(/\//g, '__')}.json`, budgetHash, hash: 'a'.repeat(64) };
}

// ---------------------------------------------------------------------------
// Fixtures de DOSSIE (P-11) — orçamentos derivados do código acima
// ---------------------------------------------------------------------------

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

function dossieDeAula(ref: string, sobre: Partial<DossieDeAula> = {}): DossieDeAula {
  return {
    aula_slug: ref,
    snapshot: snapshotDeAula(ref),
    dossie: montarDossie(dossieBase()),
    desafios_anteriores: [],
    ...sobre,
  };
}

// ---------------------------------------------------------------------------
// Fixtures de DRAFTS (a saída do autor de teoria e do autor de desafio)
// ---------------------------------------------------------------------------

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

/** As respostas default de sucesso: um draft por etapa da §4.3. */
function respostasDeSucesso(): Partial<Record<EtapaAutoria, unknown>> {
  return {
    'f7-teoria-esqueleto': draftAula(),
    'f8-desafio': draftDesafio(),
    'f7-teoria-fechamento': draftAula(),
  };
}

/** Um `blocked` bem formado (contrato do §7.1 R3). */
const BLOQUEIO = { blocked: true, missing: ['op:unary:typeof'], motivo: 'o orçamento vigente não permite typeof' };

// ---------------------------------------------------------------------------
// Fakes injetados — LLM por etapa, provador por chamada, escrita em memória
// ---------------------------------------------------------------------------

interface FalsoLlm {
  llm: EngineLlm;
  /** as etapas chamadas, NA ORDEM (teste 2). */
  chamadas: string[];
  /** as requisições por etapa (teste 4 lê o prompt da 2ª chamada). */
  requisicoes: Map<string, LlmCallRequest[]>;
}

/**
 * A CAUDA DE CHECKSUM que um modelo OBEDIENTE devolve (§7.1 R18): o prompt
 * canônico TERMINA com "A lista de construções permitidas é:" seguida da lista
 * — o modelo repete essa lista DEPOIS do JSON. O fake a extrai do PRÓPRIO
 * prompt que recebeu, que é literalmente o que a regra manda repetir: assim o
 * fake não pode dessincronizar da fixture, e vale para as três etapas (o prompt
 * do autor de aula e a variante do autor de desafio terminam com a mesma seção).
 */
function caudaObedienteDoPrompt(prompt: string): string {
  const linhas = prompt.split('\n');
  const marco = linhas.findIndex((linha) => linha.endsWith('A lista de construções permitidas é:'));
  assert.ok(marco >= 0, 'o prompt precisa terminar pedindo a repetição da lista (§7.1 R18)');
  const itens = linhas.slice(marco + 1).filter((linha) => linha.trim().length > 0);
  assert.ok(itens.length > 0, 'a lista de construções permitidas do prompt não pode ser vazia');
  return itens.join('\n');
}

/**
 * Como o fake termina a resposta:
 *   - `obediente` (DEFAULT): JSON + a cauda de checksum que a R18 exige — é o
 *     que um modelo real que obedece ao prompt devolve, e é o caso que o
 *     `JSON.parse` do conteúdo inteiro quebrava;
 *   - `sem_cauda`: JSON puro — a R18 PEDE a cauda, mas um modelo pode não
 *     obedecer, e a fase não pode quebrar por isso;
 *   - função: a cauda arbitrária (repetição DIVERGENTE, por exemplo).
 */
type ModoDeCauda = 'obediente' | 'sem_cauda' | ((prompt: string) => string);

function fakeLlm(
  respostas: Partial<Record<EtapaAutoria, unknown>>,
  cauda: ModoDeCauda = 'obediente',
): FalsoLlm {
  const chamadas: string[] = [];
  const requisicoes = new Map<string, LlmCallRequest[]>();
  const llm: EngineLlm = {
    async callLlm(etapa: string, req: LlmCallRequest): Promise<LlmCallResult> {
      chamadas.push(etapa);
      const lista = requisicoes.get(etapa) ?? [];
      lista.push(req);
      requisicoes.set(etapa, lista);
      const resposta = respostas[etapa as EtapaAutoria];
      assert.ok(resposta !== undefined, `fakeLlm: nenhuma resposta registrada para a etapa "${etapa}"`);
      const corpo = JSON.stringify(resposta);
      const rabo =
        cauda === 'sem_cauda' ? '' : cauda === 'obediente' ? caudaObedienteDoPrompt(req.prompt) : cauda(req.prompt);
      return {
        content: rabo === '' ? corpo : `${corpo}\n\n${rabo}\n`,
        model: 'fake-llm',
        cached: false,
        usage: { promptTokens: 10, completionTokens: 5 },
        stageUsage: { promptTokens: 10, completionTokens: 5, llmCalls: 1, cachedHits: 0, retries: 0 },
        attempts: 1,
        elapsedMs: 0,
      };
    },
    getStageUsage: () => undefined,
    getAllStageUsage: () => ({}),
  };
  return { llm, chamadas, requisicoes };
}

interface FalsoProver {
  prover: ProverDeDesafio;
  /** as entradas das provas, NA ORDEM (teste 7: as QUATRO PROVAS rodaram). */
  entradas: ChallengeProofsInput[];
}

function fakeProver(veredito?: Partial<ChallengeProofsVerdict>): FalsoProver {
  const entradas: ChallengeProofsInput[] = [];
  return {
    entradas,
    prover: async (input: ChallengeProofsInput): Promise<ChallengeProofsVerdict> => {
      entradas.push(input);
      return {
        valid: true,
        failures: [],
        declared: input.expectedTestCount,
        executed: input.expectedTestCount,
        ...veredito,
      };
    },
  };
}

function fsEmMemoria(): { arquivos: Map<string, string>; escreverArquivo: EscreverArquivoFn } {
  const arquivos = new Map<string, string>();
  return {
    arquivos,
    escreverArquivo: async (caminho: string, conteudo: string) => {
      arquivos.set(caminho, conteudo);
    },
  };
}

/** Pools de concorrência que só MEDEM o pico (sem teto — o teto é do scheduler). */
function poolsComPico(): {
  limiters: RateLimiters;
  picoLlm: () => number;
  picoExec: () => number;
} {
  const fazer = (): { pico: () => number; limiter: RateLimiter } => {
    let ativos = 0;
    let pico = 0;
    return {
      pico: () => pico,
      limiter: {
        acquire: async () => {
          ativos += 1;
          if (ativos > pico) pico = ativos;
          return () => {
            ativos -= 1;
          };
        },
      },
    };
  };
  const llm = fazer();
  const exec = fazer();
  const cpu = fazer();
  return { limiters: { llm: llm.limiter, exec: exec.limiter, cpu: cpu.limiter }, picoLlm: llm.pico, picoExec: exec.pico };
}

/** As dependências da onda com os fakes e a escrita em memória. */
function depsDaOnda(falso: FalsoLlm, provador: FalsoProver, fs: ReturnType<typeof fsEmMemoria>): DepsDaOndaAutoria {
  return {
    llm: falso.llm,
    prover: provador.prover,
    limiters: poolsComPico().limiters,
    escreverArquivo: fs.escreverArquivo,
    baseDir: '',
  };
}

// ---------------------------------------------------------------------------
// 1. Posse validada ANTES da onda — e só arquivos de draft únicos
// ---------------------------------------------------------------------------

describe('F7/F8 — posse de arquivo validada pelo escalonador (PAR-02, §4.1)', () => {
  it('duas aulas declarando o MESMO arquivo de draft → ownership-collision ANTES de rodar; nada roda', async () => {
    const falso = fakeLlm(respostasDeSucesso());
    const provador = fakeProver();
    const fs = fsEmMemoria();
    // MESMA aula_slug → mesmos outputs declarados → a onda é REJEITADA antes de rodar.
    const aulas = [dossieDeAula('m1/a1'), dossieDeAula('m1/a1')];

    await assert.rejects(
      runOndaDeAutoria(depsDaOnda(falso, provador, fs), aulas),
      (erro: unknown) => erro instanceof SchedulerError && erro.code === 'ownership-collision',
    );

    assert.equal(falso.chamadas.length, 0, 'nenhuma chamada de LLM antes da validação de posse');
    assert.equal(provador.entradas.length, 0, 'nenhuma prova rodou');
    assert.equal(fs.arquivos.size, 0, 'nenhum draft gravado');
  });

  it('cada agente grava SOMENTE os drafts da sua aula — 2 arquivos únicos por aula, nenhum índice', async () => {
    const falso = fakeLlm(respostasDeSucesso());
    const provador = fakeProver();
    const fs = fsEmMemoria();

    const resultado = await runOndaDeAutoria(depsDaOnda(falso, provador, fs), [
      dossieDeAula('m1/a1'),
      dossieDeAula('m1/a2'),
    ]);

    const caminhos = [...fs.arquivos.keys()].sort();
    assert.deepEqual(
      caminhos,
      [
        caminhoDraftAula('m1/a1'),
        caminhoDraftDesafio('m1/a1'),
        caminhoDraftAula('m1/a2'),
        caminhoDraftDesafio('m1/a2'),
      ].sort(),
      'os únicos arquivos produzidos são os drafts exclusivos de cada aula',
    );
    assert.equal(caminhos.length, 4);
    for (const caminho of caminhos) {
      assert.ok(!/index|indice|trilha\.json/i.test(caminho), `nenhum índice/shared file: ${caminho}`);
    }
    assert.deepEqual(
      resultado.estados.map((e) => e.status),
      ['validado', 'validado'],
    );
  });

  it('duplicata de aula_slug ENTRE o batch 1 e o batch 2 → o run INTEIRO é rejeitado ANTES de qualquer escrita', async () => {
    // 17 aulas: batch 1 = aulas 1..15, batch 2 = aula 16 + DUPLICATA da aula 1.
    // A validação por ONDA do scheduler só enxerga uma onda por vez — sem a
    // posse GLOBAL (PAR-02, §4.1) a 2ª onda SOBRESCREVERIA os drafts da 1ª por
    // escrita. A posse sobre a UNIÃO dos batches rejeita o run inteiro antes
    // de rodar QUALQUER aula.
    const aulas = Array.from({ length: 16 }, (_, i) => dossieDeAula(`m1/a${i + 1}`));
    aulas.push(dossieDeAula('m1/a1')); // colisão cruzada: mesma aula no batch 2
    const falso = fakeLlm(respostasDeSucesso());
    const provador = fakeProver();
    const fs = fsEmMemoria();

    await assert.rejects(
      runOndaDeAutoria(depsDaOnda(falso, provador, fs), aulas),
      (erro: unknown) =>
        erro instanceof SchedulerError &&
        erro.code === 'ownership-collision' &&
        typeof erro.message === 'string' &&
        erro.message.includes('m1/a1'), // o erro nomeia as aulas colidentes
    );

    assert.equal(falso.chamadas.length, 0, 'nenhuma chamada de LLM antes da posse GLOBAL');
    assert.equal(provador.entradas.length, 0, 'nenhuma prova rodou');
    assert.equal(fs.arquivos.size, 0, 'nada foi escrito — nem o batch 1 (a 2ª onda sobrescreveria)');
  });
});

// ---------------------------------------------------------------------------
// 2. A ORDEM INTERNA da §4.3 — esqueleto → DESAFIO → fechamento, sequencial
// ---------------------------------------------------------------------------

describe('F7/F8 — a ordem interna de uma aula é SEQUENCIAL (§4.3, §4.1)', () => {
  it('as chamadas LLM seguem esqueleto → desafio → fechamento, nessa ordem', async () => {
    const falso = fakeLlm(respostasDeSucesso());
    const provador = fakeProver();
    const fs = fsEmMemoria();

    await runOndaDeAutoria(depsDaOnda(falso, provador, fs), [dossieDeAula('m1/a1')]);

    // O CÓDIGO impõe a ordem: o desafio (F8) é gerado ANTES do fechamento da
    // teoria — itens de avaliação antes dos materiais (backward design).
    assert.deepEqual(falso.chamadas, ['f7-teoria-esqueleto', 'f8-desafio', 'f7-teoria-fechamento']);
    // Toda chamada LLM com maxTokens E timeoutMs EXPLÍCITOS (teto §7, item 5).
    for (const etapa of falso.chamadas) {
      const req = falso.requisicoes.get(etapa)?.[0];
      assert.ok(req !== undefined);
      assert.equal(req.maxTokens, 2000, `${etapa}: maxTokens explícito (teto de 2.000 tokens)`);
      assert.ok(Number.isInteger(req.timeoutMs) && (req.timeoutMs as number) > 0, `${etapa}: timeoutMs explícito`);
    }
    // O desafio recebeu o resumo da teoria no PROMPT (2ª chamada) — ver teste 4.
    assert.ok(falso.requisicoes.get('f8-desafio')?.length === 1);
    // O fechamento recebe o desafio VALIDADO no system — a teoria fecha sabendo o que habilitar.
    const fechamento = falso.requisicoes.get('f7-teoria-fechamento')?.[0];
    assert.ok(fechamento !== undefined);
    assert.match(fechamento.system ?? '', /DESAFIO FINAL DA AULA/);
  });

  it('blocked na 1ª etapa ENCERRA a aula: nenhuma chamada seguinte', async () => {
    const falso = fakeLlm({ 'f7-teoria-esqueleto': BLOQUEIO });
    const provador = fakeProver();
    const fs = fsEmMemoria();

    await runOndaDeAutoria(depsDaOnda(falso, provador, fs), [dossieDeAula('m1/a1')]);

    assert.deepEqual(falso.chamadas, ['f7-teoria-esqueleto'], 'nada roda depois do blocked');
    assert.equal(provador.entradas.length, 0);
    assert.equal(fs.arquivos.size, 0);
  });
});

// ---------------------------------------------------------------------------
// 3. `blocked` NÃO produz aula parcial — estado blocked registrado, nada gravado
// ---------------------------------------------------------------------------

describe('F7/F8 — blocked é resultado VÁLIDO, nunca aula parcial (§7.1 R3)', () => {
  it('blocked no esqueleto de teoria: zero arquivos de draft e o estado blocked registrado', async () => {
    const falso = fakeLlm({ 'f7-teoria-esqueleto': BLOQUEIO });
    const provador = fakeProver();
    const fs = fsEmMemoria();

    const resultado = await runOndaDeAutoria(depsDaOnda(falso, provador, fs), [dossieDeAula('m1/a1')]);

    assert.equal(fs.arquivos.size, 0, 'a aula inteira fica bloqueada — nenhum arquivo de draft');
    assert.equal(resultado.estados.length, 1);
    const estado = resultado.estados[0];
    assert.equal(estado.status, 'blocked');
    assert.equal(estado.etapa, 'f7-teoria-esqueleto');
    assert.deepEqual(estado.faltantes, ['op:unary:typeof']);
    assert.ok(estado.motivo !== undefined && estado.motivo.length > 0);
    assert.equal(resultado.executadas.length, 1, 'a tarefa CONCLUIU (blocked é resultado válido, não falha)');
  });

  it('blocked na etapa do DESAFIO: o esqueleto já existia mas a AULA não vira parcial', async () => {
    const falso = fakeLlm({
      'f7-teoria-esqueleto': draftAula(),
      'f8-desafio': BLOQUEIO,
    });
    const provador = fakeProver();
    const fs = fsEmMemoria();

    const resultado = await runOndaDeAutoria(depsDaOnda(falso, provador, fs), [dossieDeAula('m1/a1')]);

    assert.equal(fs.arquivos.size, 0, 'nem o esqueleto nem o desafio viram arquivo — sem aula parcial');
    assert.equal(resultado.estados[0].status, 'blocked');
    assert.equal(resultado.estados[0].etapa, 'f8-desafio');
    assert.deepEqual(falso.chamadas, ['f7-teoria-esqueleto', 'f8-desafio'], 'o fechamento não roda após blocked');
  });
});

// ---------------------------------------------------------------------------
// 4. O RESUMO da teoria escrita chega ao autor de desafio (§4.3)
// ---------------------------------------------------------------------------

describe('F7/F8 — o autor de desafio recebe o resumo da teoria + anti-repetição (§4.3)', () => {
  it('o prompt da 2ª chamada (f8-desafio) contém o resumo gerado da teoria efetivamente escrita', async () => {
    const falso = fakeLlm(respostasDeSucesso());
    const provador = fakeProver();
    const fs = fsEmMemoria();

    const aula = dossieDeAula('m1/a2', {
      desafios_anteriores: [
        { slug: 'm1/a1/desafio-dobro', titulo: 'desafio do dobro', requisitos: ['retorna o dobro'] },
      ],
    });
    await runOndaDeAutoria(depsDaOnda(falso, provador, fs), [aula]);

    const promptDoDesafio = falso.requisicoes.get('f8-desafio')?.[0]?.prompt;
    assert.ok(promptDoDesafio !== undefined, 'a 2ª chamada é a do desafio');
    // O bloco do resumo da teoria, na forma INDENTADA com que o dossiê o embute.
    assert.ok(
      promptDoDesafio.includes('  === RESUMO DA TEORIA ESCRITA (esqueleto da aula) ==='),
      'o prompt do desafio embute o resumo da teoria',
    );
    // A lista de construções apresentadas no código da teoria (mesmo parser do gate).
    assert.ok(
      promptDoDesafio.includes('    - node:FunctionDeclaration'),
      'o resumo lista as construções apresentadas no código da teoria',
    );
    // ANTI-REPETIÇÃO: títulos e requisitos dos desafios anteriores da MESMA trilha.
    assert.ok(promptDoDesafio.includes('titulo: desafio do dobro'), 'a anti-repetição entra no prompt do desafio');
    assert.ok(promptDoDesafio.includes('requisitos: [retorna o dobro]'), 'os requisitos anteriores entram no prompt');
  });

  it('resumoDaTeoria é função PURA: mesma teoria → mesmo resumo byte a byte', () => {
    const a = resumoDaTeoria(draftAula() as never);
    const b = resumoDaTeoria(draftAula() as never);
    assert.equal(a, b);
    assert.ok(a.startsWith('=== RESUMO DA TEORIA ESCRITA'));
  });
});

// ---------------------------------------------------------------------------
// 5. Ondas > 15 são DIVIDIDAS em batches de ≤15 — nunca truncadas (§4.1)
// ---------------------------------------------------------------------------

describe('F7/F8 — escalonamento real: batches de ≤15, sem truncar (§4.1)', () => {
  it('16 aulas → 2 ondas (15 + 1); o pico de concorrência nunca passa de 15 e nenhuma aula fica de fora', async () => {
    const total = 16;
    const aulas = Array.from({ length: total }, (_, i) => dossieDeAula(`m1/a${i + 1}`));
    const falso = fakeLlm(respostasDeSucesso());
    const provador = fakeProver();
    const fs = fsEmMemoria();
    const pool = poolsComPico();

    const resultado = await runOndaDeAutoria(
      { ...depsDaOnda(falso, provador, fs), limiters: pool.limiters },
      aulas,
    );

    assert.deepEqual(
      dividirEmBatches(aulas, TETO_ONDA_AUTORIA).map((lote) => lote.length),
      [15, 1],
      'o divisor parte em batches de ≤15, não trunca',
    );
    assert.equal(TETO_ONDA_AUTORIA, 15);
    assert.equal(resultado.ondas, 2, 'duas ondas: 15 + 1');
    assert.equal(resultado.executadas.length, total, 'nenhuma aula truncada');
    assert.deepEqual(resultado.estados.map((e) => e.status), Array(total).fill('validado'));
    assert.equal(pool.picoLlm(), 15, 'o pico do pool llm nunca passou de 15 — a onda foi dividida em batches');
    assert.equal(pool.picoExec(), 15, 'o pool exec (provador) também respeitou o batch');
    assert.equal(fs.arquivos.size, total * 2, 'todos os drafts gravados (2 por aula)');
  });
});

// ---------------------------------------------------------------------------
// 6. Drafts nascem com o hash do orçamento que os gerou (A-P17-3)
// ---------------------------------------------------------------------------

describe('F7/F8 — todo draft nasce com o budgetHash do snapshot (A-P17-3)', () => {
  it('o budgetHash do SNAPSHOT (F5) é carimbado no draft de aula e no envelope do desafio — nunca o do autor', async () => {
    const hash = 'c'.repeat(64);
    const falso = fakeLlm(respostasDeSucesso());
    const provador = fakeProver();
    const fs = fsEmMemoria();
    const aula = dossieDeAula('m1/a1', { snapshot: snapshotDeAula('m1/a1', hash) });

    const resultado = await runOndaDeAutoria(depsDaOnda(falso, provador, fs), [aula]);
    assert.equal(resultado.estados[0].budgetHash, hash);

    const conteudoAula = JSON.parse(fs.arquivos.get(caminhoDraftAula('m1/a1')) ?? '') as Record<string, unknown>;
    assert.equal(
      conteudoAula['budgetHash'],
      hash,
      'o draft de aula carrega o hash do orçamento que o gerou, não o placeholder que o autor escreveu',
    );
    // O draft parseia no schema do artefato P-04 com o hash legitimado.
    assert.doesNotThrow(() => LessonDraftSchema.parse(conteudoAula));

    // Direto na autorização: o envelope do DESAFIO também nasce com o hash
    // (o ChallengeDraftSchema NÃO tem o campo — o hash vive no envelope da F8).
    const direto = await autorizarAula({ llm: falso.llm, prover: provador.prover }, aula);
    assert.equal(direto.status, 'validado');
    if (direto.status === 'validado') {
      assert.equal(direto.budgetHash, hash);
      assert.equal(direto.draftAula.budgetHash, hash);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. (bônus) Fora do orçamento → REJEITADO nomeando a construção; as QUATRO
//    PROVAS rodam na validação do draft (prover fake registrando chamadas)
// ---------------------------------------------------------------------------

describe('F7/F8 — gates determinísticos na autoria (§6.1: drafts nascem validados)', () => {
  it('desafio com construção fora do orçamento do snapshot é REJEITADO NOMEANDO a construção; as QUATRO PROVAS rodaram antes', async () => {
    // A solução usa `lista.forEach(...)` — `api:.forEach` (e a função de seta)
    // NÃO estão no orçamento derivado das superfícies do fixture.
    const solucaoComFora =
      'function somarLista(lista) {\n  let total = 0;\n  lista.forEach((n) => { total = total + n; });\n  return total;\n}\n';
    const falso = fakeLlm({
      'f7-teoria-esqueleto': draftAula(),
      'f8-desafio': draftDesafio({ solutionCode: solucaoComFora }),
    });
    const provador = fakeProver();
    const fs = fsEmMemoria();

    const resultado = await runOndaDeAutoria(depsDaOnda(falso, provador, fs), [dossieDeAula('m1/a1')]);

    assert.equal(resultado.estados[0].status, 'falhou');
    assert.match(resultado.estados[0].erro ?? '', /api:\.forEach/, 'a violação NOMEIA a construção ofensora (§5.5)');
    assert.equal(provador.entradas.length, 1, 'as QUATRO PROVAS rodaram na validação do draft (prover fake registrando)');
    assert.equal(provador.entradas[0].solutionCode, solucaoComFora, 'o provador recebeu o draft do desafio');
    assert.equal(fs.arquivos.size, 0, 'draft rejeitado não vai a disco');
    assert.deepEqual(falso.chamadas, ['f7-teoria-esqueleto', 'f8-desafio'], 'o fechamento não roda com o desafio rejeitado');
  });

  it('a TEORIA (fechamento) com construção fora do orçamento é REJEITADA nomeando a construção', async () => {
    // A teoria final importa node:fs e usa readFileSync — fora do orçamento.
    const teoriaComFora = 'import fs from "node:fs";\nconst texto = fs.readFileSync("x", "utf8");\nconsole.log(texto);\n';
    const falso = fakeLlm({
      'f7-teoria-esqueleto': draftAula(),
      'f8-desafio': draftDesafio(),
      'f7-teoria-fechamento': draftAula({
        theory: [{ id: 't1', secao: 'teoria', markdown: teoriaComFora, tag: 'js' }],
      }),
    });
    const provador = fakeProver();
    const fs = fsEmMemoria();

    const resultado = await runOndaDeAutoria(depsDaOnda(falso, provador, fs), [dossieDeAula('m1/a1')]);

    assert.equal(resultado.estados[0].status, 'falhou');
    assert.match(resultado.estados[0].erro ?? '', /api:node:fs/, 'a violação da teoria nomeia a construção fora do orçamento');
    assert.equal(fs.arquivos.size, 0);
  });

  it('saída do autor ACIMA do teto é REJEITADA (nunca truncada) — a aula falha estruturado', async () => {
    // 2001 tokens × 4 caracteres — acima do teto de 2.000 tokens (§7).
    const estourada = `{"raciocinio_de_projeto":"${'x'.repeat(MAX_TOKENS_SAIDA_AUTOR * 4 + 1)}"}`;
    const falso = fakeLlm({ 'f7-teoria-esqueleto': estourada });
    const provador = fakeProver();
    const fs = fsEmMemoria();

    const resultado = await runOndaDeAutoria(depsDaOnda(falso, provador, fs), [dossieDeAula('m1/a1')]);

    assert.equal(resultado.estados[0].status, 'falhou');
    assert.match(resultado.estados[0].erro ?? '', /acima do teto/, 'a rejeição nomeia o teto');
    assert.equal(fs.arquivos.size, 0);
  });

  // -------------------------------------------------------------------------
  // 7b. O orçamento é validado POR FAIXAS (§3.3/§5.1) — a união das três
  //     listas NÃO vale para nenhuma superfície (HIGH da revisão adversarial)
  // -------------------------------------------------------------------------

  it('testsCode com construção SÓ-PRODUTIVA é REJEITADO (A3 — testsCode ⊆ budget_teste; o aluno lê o teste ANTES da aula)', async () => {
    // Probe do revisor: `node:ForStatement` foi ensinado em aula anterior (está
    // no budget_produtivo, NÃO no budget_teste). Sob a validação por UNIÃO o
    // teste passava; por faixas (§3.3) o teste só pode usar o budget_teste.
    const dossie = montarDossie({
      ...dossieBase(),
      budget_produtivo: [...atomosDo(CODIGO_SOLUCAO), 'node:ForStatement'],
    });
    const falso = fakeLlm({
      'f7-teoria-esqueleto': draftAula(),
      'f8-desafio': draftDesafio({ testsCode: CODIGO_TESTES_COM_LACO }),
    });
    const provador = fakeProver();
    const fs = fsEmMemoria();

    const resultado = await runOndaDeAutoria(depsDaOnda(falso, provador, fs), [dossieDeAula('m1/a1', { dossie })]);

    assert.equal(resultado.estados[0].status, 'falhou');
    assert.match(resultado.estados[0].erro ?? '', /fora do orçamento/, 'a violação é de orçamento');
    assert.match(
      resultado.estados[0].erro ?? '',
      /node:ForStatement/,
      'a violação nomeia a construção só-produtiva que não pode entrar no teste (o aluno ainda não sabe a aula)',
    );
    assert.equal(fs.arquivos.size, 0, 'draft rejeitado não vai a disco');
  });

  it('solução usando SÓ a faixa receptiva é REJEITADA (A2 — solutionCode ⊆ budget_produtivo)', async () => {
    // A solução só repete o que o aluno JÁ LIA (retorno, multiplicação,
    // literais — tudo no receptivo) e NADA do que ele deve ESCREVER nesta
    // aula: o dossiê declara o produtivo como SÓ `node:FunctionDeclaration`.
    // Sob a validação por UNIÃO isso passava; por faixas (§3.3 A2) viola.
    const dossie = montarDossie({ ...dossieBase(), budget_produtivo: ['node:FunctionDeclaration'] });
    const falso = fakeLlm(respostasDeSucesso());
    const provador = fakeProver();
    const fs = fsEmMemoria();

    const resultado = await runOndaDeAutoria(depsDaOnda(falso, provador, fs), [dossieDeAula('m1/a1', { dossie })]);

    assert.equal(resultado.estados[0].status, 'falhou');
    assert.match(resultado.estados[0].erro ?? '', /fora do orçamento/, 'a violação é de orçamento');
    assert.match(
      resultado.estados[0].erro ?? '',
      /node:BinaryExpression/,
      'a solução fora do produtivo é rejeitada mesmo quando a construção é LÍCITA no receptivo',
    );
    assert.equal(fs.arquivos.size, 0);
  });

  it('solução que NÃO puxa nenhuma construção do introduces.productive é REJEITADA (A6 — a direção puxada)', async () => {
    // A solução fica DENTRO do budget_produtivo (A2 passa), mas não usa NENHUMA
    // construção que a aula INTRODUZ produtivamente (`node:FunctionDeclaration`):
    // o desafio só repete o que o aluno já sabia — A6 (§5.1) exige
    // atomos(solutionCode) ∩ introduces.productive ≠ ∅.
    const dossie = montarDossie({
      ...dossieBase(),
      budget_produtivo: uniaoDosAtomos(CODIGO_SOLUCAO, CODIGO_SOLUCAO_SEM_PRODUTIVA_NOVA),
    });
    const falso = fakeLlm({
      'f7-teoria-esqueleto': draftAula(),
      'f8-desafio': draftDesafio({ solutionCode: CODIGO_SOLUCAO_SEM_PRODUTIVA_NOVA }),
    });
    const provador = fakeProver();
    const fs = fsEmMemoria();

    const resultado = await runOndaDeAutoria(depsDaOnda(falso, provador, fs), [dossieDeAula('m1/a1', { dossie })]);

    assert.equal(resultado.estados[0].status, 'falhou');
    assert.match(
      resultado.estados[0].erro ?? '',
      /introduces\.productive/,
      'A6 nomeia a direção puxada: a solução precisa exigir o que a aula introduz',
    );
    assert.equal(fs.arquivos.size, 0);
  });

  it('starterCode com construção SÓ-PRODUTIVA é REJEITADO (A1 — starterCode ⊆ budget_receptivo; o aluno LÊ o starter)', async () => {
    // O starter usa `node:ForStatement`, declarado SÓ no budget_produtivo: o
    // aluno não pode ser obrigado a ler no starter o que ainda não leu na
    // teoria. Sob a união passava; por faixas (§3.3 A1) viola.
    const dossie = montarDossie({
      ...dossieBase(),
      budget_produtivo: [...atomosDo(CODIGO_SOLUCAO), 'node:ForStatement'],
    });
    const falso = fakeLlm({
      'f7-teoria-esqueleto': draftAula(),
      'f8-desafio': draftDesafio({ starterCode: CODIGO_STARTER_COM_LACO }),
    });
    const provador = fakeProver();
    const fs = fsEmMemoria();

    const resultado = await runOndaDeAutoria(depsDaOnda(falso, provador, fs), [dossieDeAula('m1/a1', { dossie })]);

    assert.equal(resultado.estados[0].status, 'falhou');
    assert.match(resultado.estados[0].erro ?? '', /fora do orçamento/, 'a violação é de orçamento');
    assert.match(
      resultado.estados[0].erro ?? '',
      /node:ForStatement/,
      'a violação nomeia a construção só-produtiva que não pode entrar no starter (o aluno ainda não pode lê-la)',
    );
    assert.equal(fs.arquivos.size, 0);
  });
});
// ---------------------------------------------------------------------------
// 8. O CHECKSUM DE CAUDA (§7.1 R18) — o modelo obediente escreve a lista DEPOIS
//    do JSON; a fase tolera, CONFERE e REPORTA (nunca reprova por isso)
// ---------------------------------------------------------------------------

describe('F7/F8 — a cauda de checksum do §7.1 R18 (o prompt manda escrever DEPOIS do JSON)', () => {
  it('o modelo que OBEDECE a R18 (JSON + a lista repetida) é aceito nas TRÊS etapas, e a cauda CONFERE', async () => {
    // O prompt que esta fase usa TERMINA mandando repetir a lista de construções
    // permitidas — então a resposta de um modelo obediente NÃO é JSON puro. O
    // fake devolve exatamente isso (a cauda extraída do próprio prompt).
    const falso = fakeLlm(respostasDeSucesso()); // 'obediente' é o default
    const provador = fakeProver();
    const fs = fsEmMemoria();

    const resultado = await runOndaDeAutoria(depsDaOnda(falso, provador, fs), [dossieDeAula('m1/a1')]);

    assert.equal(
      resultado.estados[0].status,
      'validado',
      `a cauda de checksum não pode derrubar a aula: ${resultado.estados[0].erro ?? ''}`,
    );
    assert.deepEqual(falso.chamadas, ['f7-teoria-esqueleto', 'f8-desafio', 'f7-teoria-fechamento']);
    assert.equal(fs.arquivos.size, 2, 'os dois drafts foram gravados');

    // A cauda é CONFERIDA — uma conferência por etapa LLM, na ordem da §4.3.
    const checksums = resultado.estados[0].checksums ?? [];
    assert.deepEqual(
      checksums.map((c) => c.etapa),
      ['f7-teoria-esqueleto', 'f8-desafio', 'f7-teoria-fechamento'],
    );
    for (const c of checksums) {
      assert.ok(c.resultado !== null, `${c.etapa}: a cauda existe e foi conferida`);
      assert.deepEqual(
        c.resultado,
        { ok: true, faltando: [], extras: [] },
        `${c.etapa}: a repetição fiel da lista do prompt CONFERE`,
      );
    }
    assert.deepEqual(resultado.warnings, [], 'repetição fiel não gera aviso nenhum');
  });

  it('o modelo que NÃO devolve cauda (desobedece a R18) também é aceito — a fase não quebra por isso', async () => {
    const falso = fakeLlm(respostasDeSucesso(), 'sem_cauda');
    const provador = fakeProver();
    const fs = fsEmMemoria();

    const resultado = await runOndaDeAutoria(depsDaOnda(falso, provador, fs), [dossieDeAula('m1/a1')]);

    assert.equal(resultado.estados[0].status, 'validado', resultado.estados[0].erro ?? '');
    assert.equal(fs.arquivos.size, 2);
    // Sem cauda = sem sinal: `null` é o registro honesto (nunca um "ok" forjado).
    assert.deepEqual(
      (resultado.estados[0].checksums ?? []).map((c) => c.resultado),
      [null, null, null],
    );
    assert.deepEqual(resultado.warnings, [], 'cauda ausente não é veredito — não vira aviso de divergência');
  });

  it('cauda DIVERGENTE é DETECTADA e REPORTADA, e ainda assim NÃO reprova o draft', async () => {
    // O modelo repete a lista pela metade e inventa um item: a máquina detecta
    // (faltando + extras), reporta como aviso da onda, e o veredito continua
    // sendo o do orçamento sobre o código escrito (§9.3: nem aprovação por
    // omissão, nem veredito falso por enquadramento de texto).
    const falso = fakeLlm(respostasDeSucesso(), (prompt) => {
      const itens = caudaObedienteDoPrompt(prompt).split('\n');
      return [...itens.slice(1), '  - op:fabricado'].join('\n');
    });
    const provador = fakeProver();
    const fs = fsEmMemoria();

    const resultado = await runOndaDeAutoria(depsDaOnda(falso, provador, fs), [dossieDeAula('m1/a1')]);

    assert.equal(resultado.estados[0].status, 'validado', 'divergência de cauda NÃO reprova o draft');
    assert.equal(fs.arquivos.size, 2, 'os drafts continuam sendo gravados');

    const checksums = resultado.estados[0].checksums ?? [];
    assert.equal(checksums.length, 3);
    for (const c of checksums) {
      assert.equal(c.resultado?.ok, false, `${c.etapa}: a divergência é detectada`);
      assert.ok((c.resultado?.faltando.length ?? 0) > 0, `${c.etapa}: o item não repetido é nomeado`);
      assert.deepEqual(c.resultado?.extras, ['op:fabricado'], `${c.etapa}: o item inventado é nomeado`);
    }
    assert.equal(resultado.warnings.length, 3, 'uma divergência reportada por etapa LLM');
    for (const aviso of resultado.warnings) {
      assert.match(aviso, /checksum de cauda divergente/);
      assert.match(aviso, /op:fabricado/, 'o aviso nomeia o item inventado');
      assert.match(aviso, /não bloqueante/, 'o aviso declara que reporta, não reprova');
    }
  });

  it('resposta sem NENHUM objeto JSON balanceado continua sendo falha estruturada (fail-closed)', async () => {
    const falso = fakeLlm({ 'f7-teoria-esqueleto': draftAula() }, () => '');
    // Substitui a resposta da 1ª etapa por prosa pura (nenhum objeto de topo).
    const llmSemJson: EngineLlm = {
      ...falso.llm,
      async callLlm(etapa: string, req: LlmCallRequest): Promise<LlmCallResult> {
        const base = await falso.llm.callLlm(etapa, req);
        return { ...base, content: 'desculpe, não consigo escrever esta aula' };
      },
    };
    const provador = fakeProver();
    const fs = fsEmMemoria();

    const resultado = await runOndaDeAutoria(
      { ...depsDaOnda(falso, provador, fs), llm: llmSemJson },
      [dossieDeAula('m1/a1')],
    );

    assert.equal(resultado.estados[0].status, 'falhou');
    assert.match(resultado.estados[0].erro ?? '', /JSON/, 'a saída sem objeto balanceado é recusada, nunca "consertada"');
    assert.equal(fs.arquivos.size, 0);
  });
});
