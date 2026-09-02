/**
 * tests/engineGenerate.test.ts — P-22 (onda 3/4): o MODO GENERATE da engine de
 * trilhas — a FIAÇÃO F0..F12 (`engine/fiacao/geraTrilha.ts`) — testada OFFLINE
 * com FAKES (LLM/busca/prover) e com fases REAIS determinísticas (F4/F5/F8/F9/
 * F11/F12) sobre fixtures mínimas. O P-33 (registro dos schemas de saída do
 * autor) também é preso aqui, além do pin de 14 em `engineSchemas.test.ts`.
 *
 * Contratos que mordem aqui (docs/16-engine-de-trilha.md §8 e decisões do
 * replan onda 3/4):
 *   - a máquina de fases é a do runState: ordem FIXA, nenhuma barreira é
 *     pulada, fase que falha ABORTA com checkpoint e fica retomável;
 *   - retomada (`--from`) VALIDA contra `primeiraFasePendente(run.json)` e
 *     continua da fase pendente — interromper e retomar produz o MESMO
 *     resultado de uma execução limpa;
 *   - teto de tokens POR EXECUÇÃO: acumulador = telemetria existente do run,
 *     checado na entrada de cada fase; aborto estruturado + checkpoint, NUNCA
 *     perda (a retomada herda o consumo já registrado e não o duplica);
 *   - sem chave, a execução falha DECLARANDO a limitação (run criado e
 *     retomável);
 *   - `--from F7+` EXIGE o marker do portão humano da F6 (F6_NAO_APROVADO
 *     quando ausente);
 *   - P-33: `SCHEMA_REGISTRY` com 14 entradas e lint verde.
 *
 * Sem rede e sem chave: todo LLM/busca/prover é fake; as fases LLM pesadas
 * (F0/F1/F2/F3/F6/F7) são sobrescritas com execuções determinísticas.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  gerarTrilha,
  ErroGeracao,
  atomosDeHarnessReceptivo,
  ARQUIVO_APROVACAO_F6,
  ARTEFATO_BRIEF,
  ARTEFATO_NOTIONAL,
  ARTEFATO_F1,
  ARTEFATO_NOS,
  ARTEFATO_F3,
  ARTEFATO_F4,
  type ComandosGeracao,
  type DepsGeracao,
  type ContextoDeFase,
} from '../electron/main/engine/fiacao/geraTrilha';

import {
  FASES_ORDEM,
  criarRun,
  iniciarFase,
  concluirFase,
  primeiraFasePendente,
  lerRun,
  salvarRun,
  type FaseId,
  type RunState,
} from '../electron/main/engine/runtime/runState';
import { Ledger, TelemetriaFile, sha256Hex } from '../electron/main/engine/runtime/ledger';
import { LlmStageError, type EngineLlm, type LlmCallRequest, type LlmCallResult, type StageUsage } from '../electron/main/engine/runtime/callLlm';
import { LLM_ERROR_CODES } from '../electron/main/services/llmClient';
import type { ProverDeDesafio } from '../electron/main/engine/phases/f8Challenges';
import type { ChallengeProofsInput, ChallengeProofsVerdict } from '../electron/main/engine/exec/proofs';
import { caminhoDraftAula, caminhoDraftDesafio } from '../electron/main/engine/phases/f7Theory';
import { derivarSnapshots } from '../electron/main/engine/phases/f5Freeze';
import { extractAtoms } from '../electron/main/engine/extract';
import { SCHEMA_REGISTRY } from '../electron/main/engine/schemas/artifacts';
import { lintSchemasDaEngine } from '../electron/main/engine/schemas/fieldOrder';
import { conceptId } from '../electron/main/engine/graph/model';
import type { NoAtomico } from '../electron/main/engine/phases/f2Decompose';
import type { Brief } from '../electron/main/engine/phases/f0Brief';
import type { LessonDraft } from '../electron/main/engine/phases/f12Materialize';
import type { SaidaDesafio } from '../electron/main/engine/phases/f8Challenges';

// ---------------------------------------------------------------------------
// Infra dos testes (diretórios temporários — NUNCA tocam content-src)
// ---------------------------------------------------------------------------

async function dirTemp(prefixo: string): Promise<string> {
  return fsp.mkdtemp(path.join(os.tmpdir(), `p22-${prefixo}-`));
}

async function limpar(caminho: string): Promise<void> {
  await fsp.rm(caminho, { recursive: true, force: true });
}

async function listaArvore(raiz: string): Promise<Record<string, string>> {
  const saida: Record<string, string> = {};
  const walk = async (atual: string): Promise<void> => {
    for (const e of await fsp.readdir(atual, { withFileTypes: true })) {
      const p = path.join(atual, e.name);
      if (e.isDirectory()) await walk(p);
      else saida[path.relative(raiz, p)] = await fsp.readFile(p, 'utf8');
    }
  };
  await walk(raiz);
  return saida;
}

async function artefatoExiste(dir: string, nome: string): Promise<boolean> {
  try {
    await fsp.access(path.join(dir, 'artefatos', nome));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// FAKES (A-P22-2 — offline, sem rede e sem chave)
// ---------------------------------------------------------------------------

/** Transporte LLM fake: acumula usage por etapa e pode falhar num código. */
class FakeLlm implements EngineLlm {
  readonly calls: Array<{ etapa: string; req: LlmCallRequest }> = [];
  /** Quando setado, TODA chamada lança LlmStageError com este código. */
  falha: { code: string; message: string } | null = null;
  private readonly porEtapa = new Map<string, StageUsage>();

  async callLlm(etapa: string, req: LlmCallRequest): Promise<LlmCallResult> {
    this.calls.push({ etapa, req });
    const anterior = this.porEtapa.get(etapa) ?? {
      promptTokens: 0,
      completionTokens: 0,
      llmCalls: 0,
      cachedHits: 0,
      retries: 0,
    };
    this.porEtapa.set(etapa, {
      promptTokens: anterior.promptTokens + 10,
      completionTokens: anterior.completionTokens + 5,
      llmCalls: anterior.llmCalls + 1,
      cachedHits: anterior.cachedHits,
      retries: anterior.retries,
    });
    if (this.falha) {
      throw new LlmStageError({
        code: this.falha.code as never,
        etapa,
        message: this.falha.message,
        attempts: 1,
        retried: 0,
      });
    }
    const snapshot = this.porEtapa.get(etapa) as StageUsage;
    return {
      content: '{}',
      model: 'fake-model',
      cached: false,
      usage: { promptTokens: 10, completionTokens: 5 },
      stageUsage: { ...snapshot },
      attempts: 1,
      elapsedMs: 1,
    };
  }

  getStageUsage(etapa: string): Readonly<StageUsage> | undefined {
    const uso = this.porEtapa.get(etapa);
    return uso ? { ...uso } : undefined;
  }

  getAllStageUsage(): Readonly<Record<string, StageUsage>> {
    return Object.fromEntries([...this.porEtapa.entries()].map(([k, v]) => [k, { ...v }]));
  }
}

/** Provador fake: as quatro provas sempre passam (zero processos). */
function proverSempreValido(): ProverDeDesafio {
  return async (_input: ChallengeProofsInput): Promise<ChallengeProofsVerdict> => ({
    valid: true,
    failures: [],
    declared: 1,
    executed: 1,
  });
}

/** Base dos deps com o conjunto padrão de fakes. */
function depsBase(dir: string, dirProduto: string, llm: FakeLlm, fases: Partial<Record<FaseId, (ctx: ContextoDeFase) => Promise<void>>> = {}): {
  deps: DepsGeracao;
  llm: FakeLlm;
} {
  return {
    deps: {
      dir,
      dirProduto,
      llm,
      prover: proverSempreValido(),
      faseOverride: fases,
    },
    llm,
  };
}

/** Overrides que APENAS registram a ordem + gravam um marcador determinístico. */
function overridesRegistrador(ordem: string[], sobre: Partial<Record<FaseId, (ctx: ContextoDeFase) => Promise<void>>> = {}): Partial<Record<FaseId, (ctx: ContextoDeFase) => Promise<void>>> {
  const out: Partial<Record<FaseId, (ctx: ContextoDeFase) => Promise<void>>> = {};
  for (const fase of FASES_ORDEM) {
    out[fase] = async (ctx) => {
      ordem.push(fase);
      // n determinístico (índice da fase na ordem fixa) — retomar ou rodar
      // limpo produz o MESMO conteúdo de marcador (comparação byte a byte).
      await ctx.gravarArtefato(`marcador-${fase}.json`, { fase, n: FASES_ORDEM.indexOf(fase) + 1 });
      await sobre[fase]?.(ctx);
    };
  }
  return out;
}

/** Consome tokens do transporte fake (para o test do teto). */
function consumoDaLlm(llm: FakeLlm): (ctx: ContextoDeFase) => Promise<void> {
  return async (ctx) => {
    await llm.callLlm(`fake-${ctx.run.faseAtual}`, { prompt: 'x', stageVersion: 'v1', timeoutMs: 1 });
  };
}

// ---------------------------------------------------------------------------
// 1. A máquina percorre as fases na ordem e NÃO pula barreira
// ---------------------------------------------------------------------------

describe('P-22 generate — a máquina de fases (runState dirigido)', () => {
  it('1. fases na ORDEM fixa; fase que falha ABORTA na fase certa com checkpoint e run retomável', async () => {
    const dir = await dirTemp('t1');
    const dirProduto = await dirTemp('t1-out');
    const ordem: string[] = [];
    try {
      const fases = overridesRegistrador(ordem, {
        F3: async () => {
          throw new Error('falha fake da F3');
        },
      });
      const { deps } = depsBase(dir, dirProduto, new FakeLlm(), fases);

      await assert.rejects(
        gerarTrilha(deps, { slug: 'trilha-t1', assunto: 'assunto t1' }),
        (erro: unknown) => {
          assert.ok(erro instanceof ErroGeracao, `esperado ErroGeracao, veio ${String(erro)}`);
          assert.equal(erro.code, 'FASE_FALHOU');
          assert.equal(erro.fase, 'F3');
          return true;
        },
      );

      assert.deepEqual(ordem, ['F0', 'F1', 'F2', 'F3'], 'ordem fixa — não pula barreira');
      // F4 NUNCA executou (a barreira F3 abortou o run).
      assert.equal(await artefatoExiste(dir, 'marcador-F4.json'), false, 'a fase F4 não rodou');

      const run = await lerRun(dir);
      assert.deepEqual(
        FASES_ORDEM.map((f) => run.fases[f]),
        ['done', 'done', 'done', 'em_andamento', 'pendente', 'pendente', 'pendente', 'pendente', 'pendente', 'pendente', 'pendente', 'pendente', 'pendente'],
        'preixo done + a fase que falhou em_andamento + resto pendente',
      );

      const ledger = new Ledger(dir);
      const linhas = await ledger.ler();
      assert.deepEqual(
        linhas.filter((l) => l.tipo === 'fase_iniciada').map((l) => (l as { fase: FaseId }).fase),
        ['F0', 'F1', 'F2', 'F3'],
      );
      assert.deepEqual(
        linhas.filter((l) => l.tipo === 'fase_concluida').map((l) => (l as { fase: FaseId }).fase),
        ['F0', 'F1', 'F2'],
      );
      assert.ok(
        linhas.some((l) => l.tipo === 'checkpoint' && l.descricao.includes('F3')),
        'checkpoint OBRIGATÓRIO na falha',
      );
      const cadeia = await ledger.verificarCadeiaEmDisco();
      assert.equal(cadeia.ok, true, 'a cadeia do ledger permanece íntegra após o aborto');
    } finally {
      await limpar(dir);
      await limpar(dirProduto);
    }
  });

  it('2. interromper e retomar (--from) produz o MESMO resultado de uma execução limpa', async () => {
    const dir = await dirTemp('t2');
    const dirProduto = await dirTemp('t2-out');
    const dirLimpo = await dirTemp('t2-limpo');
    const dirLimpoOut = await dirTemp('t2-limpo-out');
    const crashMarker = path.join(dir, 'crash-f5.marker');
    try {
      // Execução 1: a F5 "crasha" (uma vez — o marker vira sinal de já-crashou).
      const comCrash = overridesRegistrador([], {
        F5: async (ctx) => {
          if (!fs.existsSync(crashMarker)) {
            await fsp.writeFile(crashMarker, '1');
            throw new Error('crash simulado na F5');
          }
        },
      });
      const { deps } = depsBase(dir, dirProduto, new FakeLlm(), comCrash);
      await assert.rejects(
        gerarTrilha(deps, { slug: 'trilha-t2', assunto: 'assunto t2' }),
        (erro: unknown) => erro instanceof ErroGeracao && erro.code === 'FASE_FALHOU' && erro.fase === 'F5',
        'a primeira execução aborta na F5 (interrupção simulada)',
      );

      // --from inválido é REJEITADO (a retomada nunca salta fases).
      await assert.rejects(
        gerarTrilha(deps, { slug: 'trilha-t2', assunto: 'assunto t2', from: 'F3' }),
        (erro: unknown) => erro instanceof ErroGeracao && erro.code === 'RETOMADA_INCOMPATIVEL',
      );

      // Execução 2: retoma de F5 (a fase pendente) até o fim.
      const semCrash = overridesRegistrador([]);
      const { deps: deps2 } = depsBase(dir, dirProduto, new FakeLlm(), semCrash);
      const resultado = await gerarTrilha(deps2, { slug: 'trilha-t2', assunto: 'assunto t2', from: 'F5' });
      assert.equal(resultado.concluido, true, 'a retomada CONCLUI a geração');
      assert.equal(resultado.faseAtual, 'F12');
      assert.equal(await lerRun(dir).then((r) => primeiraFasePendente(r)), null, 'todas as fases done');

      // Execução LIMPA em outro diretório — a árvore de artefatos deve ser IDÊNTICA.
      const { deps: depsLimpo } = depsBase(dirLimpo, dirLimpoOut, new FakeLlm(), semCrash);
      const limpo = await gerarTrilha(depsLimpo, { slug: 'trilha-t2', assunto: 'assunto t2' });
      assert.equal(limpo.concluido, true);

      const arvoreRetomada = await listaArvore(path.join(dir, 'artefatos'));
      const arvoreLimpa = await listaArvore(path.join(dirLimpo, 'artefatos'));
      assert.deepEqual(arvoreRetomada, arvoreLimpa, 'retomar produz o MESMO resultado final (árvore de artefatos idêntica)');
    } finally {
      await limpar(dir);
      await limpar(dirProduto);
      await limpar(dirLimpo);
      await limpar(dirLimpoOut);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Teto de tokens: aborto estruturado + checkpoint, sem perda
// ---------------------------------------------------------------------------

describe('P-22 generate — teto de tokens por execução', () => {
  it('3. teto estoura na ENTRADA da fase → aborto estruturado + checkpoint; a retomada com teto maior herda o consumo sem duplicar', async () => {
    const dir = await dirTemp('t3');
    const dirProduto = await dirTemp('t3-out');
    const llm = new FakeLlm();
    try {
      // Cada fase consome 15 tokens do transporte fake (10 entrada + 5 saída).
      const fases: Partial<Record<FaseId, (ctx: ContextoDeFase) => Promise<void>>> = {};
      for (const fase of FASES_ORDEM) fases[fase] = consumoDaLlm(llm);
      const { deps } = depsBase(dir, dirProduto, llm, fases);

      await assert.rejects(
        gerarTrilha(deps, { slug: 'trilha-t3', assunto: 'assunto t3', tetoTokens: 60 }),
        (erro: unknown) => {
          assert.ok(erro instanceof ErroGeracao);
          assert.equal(erro.code, 'TOKENS_ESGOTADOS');
          return true;
        },
        'F4 não inicia: 4 fases × 15 = 60 já consumidos',
      );

      // O run NÃO perdeu nada: F0-F3 done, F4 PENDENTE (nem iniciou).
      const run = await lerRun(dir);
      assert.equal(run.fases.F0, 'done');
      assert.equal(run.fases.F3, 'done');
      assert.equal(run.fases.F4, 'pendente', 'a fase do aborto nem começou — retomável sem reexecutar nada');
      assert.equal(await artefatoExiste(dir, 'marcador-F4.json'), false);

      // Checkpoint do teto no ledger.
      const ledger = new Ledger(dir);
      const linhas = await ledger.ler();
      assert.ok(
        linhas.some((l) => l.tipo === 'checkpoint' && /TOKENS_ESGOTADOS/.test(l.descricao)),
        'checkpoint TOKENS_ESGOTADOS registrado',
      );

      // Telemetria: exatamente 4 linhas (F0..F3), 15 tokens cada — 60 no total.
      const tel1 = await new TelemetriaFile(dir).ler();
      assert.equal(tel1.length, 4, 'uma linha de telemetria POR fase executada');
      assert.equal(tel1.reduce((s, l) => s + l.tokensEntrada + l.tokensSaida, 0), 60);

      // RETOMADA com teto maior: continua de F4 e CONCLUI.
      const resultado = await gerarTrilha(deps, { slug: 'trilha-t3', assunto: 'assunto t3', tetoTokens: 9999 });
      assert.equal(resultado.concluido, true);

      // O consumo já registrado NÃO conta de novo: F0-F3 aparecem UMA vez cada.
      const tel2 = await new TelemetriaFile(dir).ler();
      const porEtapa = new Map<string, number>();
      for (const l of tel2) porEtapa.set(l.etapa, (porEtapa.get(l.etapa) ?? 0) + 1);
      for (const fase of FASES_ORDEM) {
        assert.equal(porEtapa.get(fase), 1, `telemetria de ${fase} exatamente 1 vez (nada duplicado)`);
      }
      assert.equal(tel2.length, 13, '13 fases executadas NO TOTAL (4 antes do teto + 9 depois)');
      assert.equal(tel2.reduce((s, l) => s + l.tokensEntrada + l.tokensSaida, 0), 13 * 15);
      assert.equal(llm.calls.length, 13, 'o transporte foi chamado 13 vezes — nenhuma chamada repetida');
    } finally {
      await limpar(dir);
      await limpar(dirProduto);
    }
  });
});

/**
 * O teto pelo DEP (`deps.tetoTokensPorExecucao`), sem `comandos.tetoTokens`.
 *
 * POR QUE ESTE TESTE EXISTE: o CLI de produção resolvia `--teto-tokens` e
 * deixava `tetoTokensPorExecucao: undefined` na fiação; só o caminho do
 * comando estava provado. Um teto que não limita nada é PIOR que nenhum —
 * promete controle de custo que não existe. Agora a fiação de produção
 * preenche o dep, e este teste prende o comportamento: sem `tetoTokens` no
 * comando, o dep sozinho aborta com `TOKENS_ESGOTADOS` na ENTRADA da fase.
 */
describe('P-22 generate — teto de tokens pelo DEP (fiação de produção)', () => {
  it('3b. deps.tetoTokensPorExecucao sozinho (sem comandos.tetoTokens) aborta com TOKENS_ESGOTADOS', async () => {
    const dir = await dirTemp('t3b');
    const dirProduto = await dirTemp('t3b-out');
    const llm = new FakeLlm();
    try {
      // Cada fase consome 15 tokens do transporte fake (10 entrada + 5 saída).
      const fases: Partial<Record<FaseId, (ctx: ContextoDeFase) => Promise<void>>> = {};
      for (const fase of FASES_ORDEM) fases[fase] = consumoDaLlm(llm);
      const { deps } = depsBase(dir, dirProduto, llm, fases);
      deps.tetoTokensPorExecucao = 30;

      await assert.rejects(
        // NOTA: `tetoTokens` AUSENTE do comando — só o dep governa.
        gerarTrilha(deps, { slug: 'trilha-t3b', assunto: 'assunto t3b' }),
        (erro: unknown) => {
          assert.ok(erro instanceof ErroGeracao);
          assert.equal(erro.code, 'TOKENS_ESGOTADOS');
          return true;
        },
        'F2 não inicia: 2 fases × 15 = 30 já consumidos',
      );

      const run = await lerRun(dir);
      assert.equal(run.fases.F1, 'done');
      assert.equal(run.fases.F2, 'pendente', 'a fase do aborto nem começou — retomável sem reexecutar nada');
    } finally {
      await limpar(dir);
      await limpar(dirProduto);
    }
  });

  it('3c. o teto do COMANDO tem precedência sobre o do dep (o operador manda na execução)', async () => {
    const dir = await dirTemp('t3c');
    const dirProduto = await dirTemp('t3c-out');
    const llm = new FakeLlm();
    try {
      const fases: Partial<Record<FaseId, (ctx: ContextoDeFase) => Promise<void>>> = {};
      for (const fase of FASES_ORDEM) fases[fase] = consumoDaLlm(llm);
      const { deps } = depsBase(dir, dirProduto, llm, fases);
      // Dep apertado, comando folgado: quem vale é o comando.
      deps.tetoTokensPorExecucao = 30;

      const resultado = await gerarTrilha(deps, { slug: 'trilha-t3c', assunto: 'assunto t3c', tetoTokens: 9999 });
      assert.equal(resultado.concluido, true, 'o teto do comando (9999) governa — o dep (30) não aborta');
    } finally {
      await limpar(dir);
      await limpar(dirProduto);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Sem chave: erro estruturado DECLARANDO a limitação, run criado e retomável
// ---------------------------------------------------------------------------

describe('P-22 generate — sem chave de API', () => {
  it('4. a F0 real falha com SEM_CHAVE declarando a limitação; o run foi criado e fica retomável', async () => {
    const dir = await dirTemp('t4');
    const dirProduto = await dirTemp('t4-out');
    const llm = new FakeLlm();
    llm.falha = { code: LLM_ERROR_CODES.KEY_MISSING, message: 'chave não configurada' };
    try {
      const { deps } = depsBase(dir, dirProduto, llm);
      await assert.rejects(
        gerarTrilha(deps, { slug: 'trilha-t4', assunto: 'assunto t4' }),
        (erro: unknown) => {
          assert.ok(erro instanceof ErroGeracao);
          assert.equal(erro.code, 'SEM_CHAVE');
          assert.match(erro.message, /LIMITAÇÃO/, 'a limitação é DECLARADA na mensagem');
          assert.match(erro.message, /RETOMÁVEL|retomável|retomar/i, 'a retomada é apontada');
          return true;
        },
      );

      const run = await lerRun(dir);
      assert.equal(run.fases.F0, 'em_andamento', 'o run foi CRIADO e a fase ficou em_andamento (retomável)');
      const ledger = new Ledger(dir);
      const linhas = await ledger.ler();
      assert.ok(linhas.some((l) => l.tipo === 'run_criado'), 'evento run_criado no ledger');
      assert.ok(linhas.some((l) => l.tipo === 'checkpoint'), 'checkpoint da falha no ledger');
    } finally {
      await limpar(dir);
      await limpar(dirProduto);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Fiação completa OFFLINE: fases reais determinísticas + fakes
// ---------------------------------------------------------------------------

/** Atómos de um trecho (fail-closed: código de fixture que não parseia = falha do teste). */
function atomosDe(codigo: string): string[] {
  const extraido = extractAtoms(codigo, { fileName: 'fixture.mjs' });
  assert.equal(extraido.ok, true, `código da fixture não parseia:\n${codigo}`);
  return extraido.ok ? extraido.keys : [];
}

function dedupDe(lista: readonly string[]): string[] {
  const vistos: string[] = [];
  for (const item of lista) if (!vistos.includes(item)) vistos.push(item);
  return vistos;
}

describe('P-22 generate — fiação completa offline (fases reais + fakes)', () => {
  it('5. F0..F12 de ponta a ponta com LLM/busca/prover fakes: freezes, drafts, provas, revisão injetada e G-FINAL', async () => {
    const dir = await dirTemp('t5');
    const dirProduto = await dirTemp('t5-out');
    const llm = new FakeLlm();
    let revisaoChamadas = 0;
    const CONCEITO = 'variaveis';
    const id = conceptId(CONCEITO);
    const ref = `m1/${CONCEITO}`;

    // O código da ÚNICA aula (o MESMO corpus validado pela suíte do F12/P-21).
    const SOLUTION = 'export let total = 1;\n';
    const STARTER = 'export let total;\n';
    const TESTS =
      "import { total } from './solution.mjs';\n" +
      "test('total existe', () => { assert.equal(total, 1); });\n";

    // Produtivo = o DIFF (§5.3: "o que o aluno escreve é o DIFF") — 1..2 átomos
    // (I2/A7: teto de 2 construtivas por aula); receptivo = união das superfícies.
    const atomosSolucao = atomosDe(SOLUTION);
    const atomosStarter = atomosDe(STARTER);
    const atomosProducoes = atomosSolucao.filter((a) => !atomosStarter.includes(a));
    const atomosReceptivos = dedupDe([...atomosStarter, ...atomosSolucao]);
    assert.ok(
      atomosProducoes.length >= 1 && atomosProducoes.length <= 2,
      `o DIFF produtivo precisa ter 1-2 átomos; veio: ${atomosProducoes.join(', ')}`,
    );

    const no: NoAtomico = {
      chave_conceito: CONCEITO,
      nome: 'declarar e atribuir variável',
      familia: 'sintaxe',
      introduces: { receptive: atomosReceptivos, productive: atomosProducoes },
      kc_type: 'regra',
      ei_class: 'isolado',
      justificativa: 'aula mínima de declaração com atribuição',
      erklarung: '',
      role: 'isolado',
      eventos_de_avaliacao: [
        {
          id: 'e1',
          tipo: 'completion-uma-lacuna',
          descricao: 'declara a variável total',
          atomo_alvo: 'decl:let',
          lacuna: { span: 'let total = 1', contem_atomo_alvo: true },
        },
      ],
    };

    const brief: Brief = {
      tema: 'JavaScript do zero',
      objetivo_geral: 'ler e escrever os primeiros programas',
      publico_alvo: 'iniciante absoluto',
      criterios_de_entrada: [],
      construcoes_alvo: ['decl:let', 'op:assign:='],
      politica_de_harness: 'receptive-seed',
      restricoes: [],
      justificativa: 'fixture de teste offline',
      aprovado: true,
    };

    const fases: Partial<Record<FaseId, (ctx: ContextoDeFase) => Promise<void>>> = {
      F0: async (ctx) => {
        await ctx.gravarArtefato(ARTEFATO_BRIEF, brief);
        await ctx.gravarArtefato(ARTEFATO_NOTIONAL, {
          nome: 'caixas nomeadas',
          descricao: 'a máquina nocional mínima da fixture',
          componentes: [{ nome: 'caixa', funcao: 'guarda um valor' }],
          estados: [{ nome: 'vazia', descricao: 'ainda sem valor' }],
          transicoes: [{ de: 'vazia', para: 'cheia', condicao: 'atribuição' }],
          limites: [],
          analogia: 'caixas nomeadas',
          fonte: 'ECMA-262',
        });
      },
      F1: async (ctx) => {
        await ctx.gravarArtefato(ARTEFATO_F1, {
          schema: 'f1-pesquisa',
          tema: brief.tema,
          relatorios: [],
          inventarioConstrucoes: [],
          inventarioConcepcoes: [],
          cobertura: [{ subTopicoId: 's1', comFonte: true }],
          gCoverPesqAprovado: true,
          declaracaoInsubstituivel: 'a revisão humana do piloto (F6) é insubstituível',
          limitacoes: [],
          geradoEm: new Date().toISOString(),
        });
      },
      F2: async (ctx) => {
        await ctx.gravarArtefato(ARTEFATO_NOS, [no]);
      },
      F3: async (ctx) => {
        await ctx.gravarArtefato(ARTEFATO_F3, {
          grafo: { conceitos: [{ id, familiaSintatica: 'sintaxe', desbloqueadoPor: [], usa: [] }] },
          confirmadas: [],
          rejeitadas: [],
          justificativas: [],
          roles: { [CONCEITO]: 'isolado' },
          ordem: { ok: true, ordem: [id], criterio: 'fornecido', orfaos: [] },
          violacoes: [],
          budget: null,
          falhaDerivacaoBudget: null,
        });
      },
      // F6 injetada: o portão humano já vem aprovado (marker escrito).
      F6: async (ctx) => {
        await fsp.writeFile(path.join(ctx.dir, ARQUIVO_APROVACAO_F6), JSON.stringify({ aprovado: true }));
        await ctx.anexarEvento({ tipo: 'checkpoint', runId: ctx.run.runId, descricao: 'portao_f6_fixture_aplicado' });
      },
      // F7 injetada: escreve os drafts da aula com o budgetHash do freeze REAL.
      F7: async (ctx) => {
        const { budget: budgetReal } = await ctx.lerArtefato<{ budget: import('../electron/main/engine/phases/f4Budget').BudgetF4 }>(ARTEFATO_F4);
        const snapshots = derivarSnapshots(budgetReal);
        const snapshot = snapshots.find((s) => s.aula_slug === ref);
        assert.ok(snapshot, `snapshot de ${ref} derivado do orçamento`);

        const draftAula: LessonDraft = {
          slug: CONCEITO,
          title: 'Declarar e atribuir variável',
          objective: {
            verbo: 'declarar',
            enunciado: 'Declarar uma variável com let e atribuir um valor.',
            contexto: 'o aluno já entende o que é um programa (axioma)',
            criterio: 'a variável declarada é usada no desafio sem erro',
          },
          introduces: { receptive: atomosReceptivos, productive: atomosProducoes },
          introducesTerms: ['atribuição'],
          foraDeEscopo: ['constantes', 'escopo de bloco'],
          eiClass: 'regra',
          targetAtom: 'decl:let',
          notionalMachineDelta: 'a máquina ganha uma caixa nomeada que guarda um valor',
          budgetHash: snapshot.budgetHash,
          budgetVersion: '1',
          research: [],
          // Teoria COM bloco de demonstração (rodada 12): a bateria A13–A16
          // exige que a trilha gerada DEMONSTRE em js o que declara em
          // introduces (A13d) e que a aula não introduza mais de 4 construções
          // verdadeiramente novas (A14a — `export let total = 1;` = decl:let +
          // a maquinaria Variable* = 4; ExportKeyword/NumericLiteral são H13).
          // No draft, seção com `tag` não-vazia vira `theory[].code`
          // (o markdown É o código — ver materializarTrilha §f12).
          theory: [
            {
              id: 'o-que-e-variavel',
              secao: 'teoria',
              markdown: 'export let total = 1;\n',
              tag: 'js',
            },
          ],
          // ADITIVO (onda 1 schema-quiz): o LessonDraftSchema SEMPRE
          // materializa assertions (ausência → [] explícito, INV-05).
          assertions: [],
          justificativa: 'aula mínima que introduz a declaração com atribuição',
          role: 'regular',
          status: 'aprovado',
          aprovado: true,
        };
        const draftDesafio: SaidaDesafio = {
          raciocinio_de_projeto: 'desafio mínimo: declarar e atribuir',
          slug: 'declarar-variavel',
          conceito: CONCEITO,
          statement: 'Declare uma variável chamada total com o valor 1.',
          starterCode: STARTER.trim(),
          solutionCode: SOLUTION.trim(),
          testsCode: TESTS.trim(),
          expectedTestCount: 1,
          outputChannel: 'retorno',
          requires: ['op:assign:='],
          notRequired: [],
          subgoals: ['declarar', 'atribuir'],
          scenarios: [{ tipo: 'exemplo', derivado_de: 'op:assign:=', descricao: 'uma atribuição com literal' }],
          taskSkill: 'declarar-e-atribuir',
          supportLevel: 'com_andaime',
          surfaceDomain: 'ordem-de-execucao',
          solutionAlternates: [],
          wrongSolutions: [],
          requirements: [{ id: 'R1', descricao: 'a variável existe', teste: 'total existe' }],
          justificativa: 'desafio mínimo da aula de variáveis',
          aprovado: true,
        };
        await fsp.mkdir(path.join(ctx.dir, 'drafts'), { recursive: true });
        await fsp.writeFile(path.join(ctx.dir, caminhoDraftAula(ref)), `${JSON.stringify(draftAula, null, 2)}\n`);
        await fsp.writeFile(path.join(ctx.dir, caminhoDraftDesafio(ref)), `${JSON.stringify(draftDesafio, null, 2)}\n`);
      },
    };

    const { deps } = depsBase(dir, dirProduto, llm, fases);
    deps.revisao = {
      rodar: async () => {
        revisaoChamadas += 1;
        return { rodadas: 1 };
      },
      rodadasMaximas: 1,
    };
    deps.gFinalDeps = {
      verificarDesafio: async () => ({ valid: true, falhas: [] }),
    };

    try {
      const resultado = await gerarTrilha(deps, { slug: 'trilha-t5', assunto: brief.tema });
      assert.equal(resultado.concluido, true, 'a fiação completa conclui F0..F12');
      assert.equal(resultado.faseAtual, 'F12');
      assert.equal(revisaoChamadas, 1, 'o laço de revisão INJETADO rodou 1 vez (F10)');

      // Hashes REAIS gravados no run.json (a F5 substituiu os placeholders).
      const run = await lerRun(dir);
      assert.notEqual(run.budgetHash, sha256Hex(''), 'budgetHash real no run.json');
      assert.notEqual(run.graphHash, sha256Hex(''), 'graphHash real no run.json');

      // A trilha materializou e o G-FINAL aprovou — sob a bateria A13–A16 do
      // rodada 12, o mock F7 proveu a demonstração que a trilha merece
      // (bloco js cobrindo o introduces declarado), então o gate agressivo
      // passa: é o contrato que a F7 real terá de cumprir.
      const relatorio = JSON.parse(await fsp.readFile(path.join(dir, 'artefatos', 'report.json'), 'utf8')) as {
        materializacao: { arquivos: number };
        gFinal: { ok: boolean };
      };
      assert.equal(relatorio.gFinal.ok, true, 'G-FINAL aprovado (bateria A13–A16 inclusa)');
      assert.ok(relatorio.materializacao.arquivos > 0, 'árvore materializada');

      const produto = JSON.parse(await fsp.readFile(path.join(dirProduto, 'track.json'), 'utf8')) as { slug: string };
      assert.equal(produto.slug, 'trilha-t5');

      // A verificação F9 (provas + orçamento) passou e foi persistida.
      const f9 = JSON.parse(await fsp.readFile(path.join(dir, 'artefatos', 'f9.json'), 'utf8')) as { ok: boolean };
      assert.equal(f9.ok, true);

      // Ledger: as 13 fases concluídas em ordem.
      const ledger = new Ledger(dir);
      const linhas = await ledger.ler();
      assert.deepEqual(
        linhas.filter((l) => l.tipo === 'fase_concluida').map((l) => (l as { fase: FaseId }).fase),
        [...FASES_ORDEM],
        'F0..F12 concluídas na ordem fixa',
      );
      const cadeia = await ledger.verificarCadeiaEmDisco();
      assert.equal(cadeia.ok, true);

      // ARTEFATOS da fiação presentes.
      for (const nome of ['brief.json', 'f1.json', 'nos.json', 'f3.json', 'f4.json', 'f5.json', 'f9.json', 'report.json']) {
        assert.equal(await artefatoExiste(dir, nome), true, `artefato ${nome} gravado`);
      }
    } finally {
      await limpar(dir);
      await limpar(dirProduto);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. P-33: registro com 14 entradas e lint verde
// ---------------------------------------------------------------------------

describe('P-22 generate — P-33 (schemas de saída do autor no registro)', () => {
  it('6. SCHEMA_REGISTRY tem 14 entradas (author-output e desafio-author-output) e o lint passa', () => {
    const nomes = SCHEMA_REGISTRY.map((s) => s.nome).sort();
    assert.equal(SCHEMA_REGISTRY.length, 14, 'exatamente 14 registros');
    assert.equal(nomes.filter((n) => n === 'author-output').length, 1);
    assert.equal(nomes.filter((n) => n === 'desafio-author-output').length, 1);

    const lint = lintSchemasDaEngine(SCHEMA_REGISTRY);
    assert.deepEqual(lint.ordem, [], 'INV-04: toda justificativa antes da decisão');
    assert.deepEqual(lint.camposOpcionais, [], 'INV-05: todo campo obrigatório');
  });
});

// ---------------------------------------------------------------------------
// 7. --from F7+ sem o marker da F6 → F6_NAO_APROVADO (o portão é revalidado)
// ---------------------------------------------------------------------------

async function runComF0Ate(dir: string, slug: string, ate: FaseId): Promise<RunState> {
  let run = criarRun({
    slug,
    budgetHash: sha256Hex(''),
    graphHash: sha256Hex(''),
    modelosPorEtapa: {},
    promptVersao: '1.0.0',
    catalogoVersao: '1.0.0',
  });
  let pendente = primeiraFasePendente(run);
  while (pendente !== null && FASES_ORDEM.indexOf(pendente) <= FASES_ORDEM.indexOf(ate)) {
    run = iniciarFase(run, pendente);
    run = concluirFase(run, pendente);
    pendente = primeiraFasePendente(run);
  }
  await salvarRun(dir, run);
  return run;
}

describe('P-22 generate — portão humano da F6 (--from F7+)', () => {
  it('7. sem o marker, --from F7 aborta com F6_NAO_APROVADO ANTES de qualquer autoria', async () => {
    const dir = await dirTemp('t7');
    const dirProduto = await dirTemp('t7-out');
    let f7Rodou = false;
    try {
      await runComF0Ate(dir, 'trilha-t7', 'F6');

      const fases: Partial<Record<FaseId, (ctx: ContextoDeFase) => Promise<void>>> = {};
      for (const fase of FASES_ORDEM) {
        fases[fase] = async (ctx) => {
          await ctx.gravarArtefato(`marcador-${fase}.json`, { fase });
        };
      }
      fases.F7 = async (ctx) => {
        f7Rodou = true;
        await ctx.gravarArtefato('marcador-F7.json', { fase: 'F7' });
      };
      const { deps } = depsBase(dir, dirProduto, new FakeLlm(), fases);

      await assert.rejects(
        gerarTrilha(deps, { slug: 'trilha-t7', assunto: 'assunto t7', from: 'F7' }),
        (erro: unknown) => {
          assert.ok(erro instanceof ErroGeracao);
          assert.equal(erro.code, 'F6_NAO_APROVADO');
          return true;
        },
      );
      assert.equal(f7Rodou, false, 'a autoria NÃO roda sem o marker');
      assert.equal(await lerRun(dir).then((r) => r.fases.F7), 'pendente', 'o run fica intacto');

      // Com o portão INJETADO aprovando, a retomada segue e CONCLUI.
      const { deps: deps2 } = depsBase(dir, dirProduto, new FakeLlm(), fases);
      deps2.lerAprovacaoF6 = async () => ({ aprovado: true, parecer: 'teste injetado' });
      const resultado = await gerarTrilha(deps2, { slug: 'trilha-t7', assunto: 'assunto t7', from: 'F7' });
      assert.equal(resultado.concluido, true);
      assert.equal(f7Rodou, true);
    } finally {
      await limpar(dir);
      await limpar(dirProduto);
    }
  });
});