/**
 * tests/engineSolvable.test.ts — P-19 "Solubilidade: o aluno simulado"
 * (cláusula J3 de `docs/16-engine-de-trilha.md` §9.1).
 *
 * O que este pacote prova (critérios de aceitação A-P19-1/2/3/4):
 *
 *   1. desafio que exige construção fora do orçamento resulta em 0% de acerto
 *      e NOMEIA a construção faltante — nos DOIS modos: aluno que devolve
 *      bloqueado/precisoDe e aluno que TENTA usando a construção proibida;
 *   2. desafio dentro do orçamento passa em pass^3 (k=3 default, 3 tentativas
 *      independentes, todas executadas pelo prover);
 *   3. UMA tentativa que falha entre três DERRUBA o pass^k (2 passam, 1 falha
 *      → a medição falha; nunca a semântica pass-at-k — a notação da métrica
 *      concorrente não aparece em lugar nenhum do pacote, grep gate A-P19-2);
 *   4. o contexto do aluno simulado é o orçamento e NADA além: teste de string
 *      no prompt — sem a solução de referência, sem os testes, sem a teoria
 *      (A-P19-4), mais o probe de tipo que quebra se o builder do prompt ganhar
 *      campo novo;
 *   5. (bônus) bloqueado com precisoDe vira a primeiraConstrucaoFaltante
 *      (primeiro item FORA do orçamento, ordem de necessidade do aluno);
 *      bloqueio que pede só o que JÁ é permitido → null (aluno confuso);
 *      resposta inválida → 0% com aviso de tarefa quebrada e construção null;
 *      falha de infra (LLM/prover lançando, veredito com execError, k inválido)
 *      → erro ESTRUTURADO da medição (SolubilidadeError), nunca veredito falso.
 *
 * Fakes (sem rede, sem processo — A-P19-1): LLM fake que responde por índice
 * de chamada e registra os prompts; prover fake que julga a tentativa pelo
 * MESMO diff determinístico que a produção usaria (extractAtoms × orçamento).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { extractAtoms } from '../electron/main/engine/extract';
import type { ChallengeProofsInput, ChallengeProofsVerdict } from '../electron/main/engine/exec/proofs';
import type { EngineLlm, LlmCallRequest, LlmCallResult } from '../electron/main/engine/runtime/callLlm';
import {
  DEFAULT_K,
  medirSolubilidade,
  type DadosDoPromptDoAluno,
  type ProverDeDesafio,
  type SolubilidadeCtx,
} from '../electron/main/engine/quality/solvable';
import { SolubilidadeError } from '../electron/main/engine/quality/solvable';

// ---------------------------------------------------------------------------
// Fixtures — código mínimo de exemplo (regra 3: nenhum conteúdo didático)
// ---------------------------------------------------------------------------

const STARTER = 'export function soma(array) { throw new Error("não implementado"); }\n';

/** Solução que SÓ usa construções básicas (dentro de qualquer orçamento honesto). */
function codigoDentro(): string {
  return [
    'export function soma(array) {',
    '  let total = 0;',
    '  for (let i = 0; i < array.length; i += 1) {',
    '    total += array[i];',
    '  }',
    '  return total;',
    '}',
    '',
  ].join('\n');
}

/** Solução cujo `for...of` é a construção que o orçamento do teste NÃO libera. */
function codigoFora(): string {
  return [
    'export function soma(array) {',
    '  let total = 0;',
    '  for (const item of array) {',
    '    total += item;',
    '  }',
    '  return total;',
    '}',
    '',
  ].join('\n');
}

/**
 * Orçamento = TODOS os átomos extraídos do código (determinístico, via o mesmo
 * parser da produção), menos as chaves a excluir. Simula o "orçamento da aula"
 * com a construção-alvo bloqueada sem digitar chave à mão.
 */
function orcamentoDe(codigo: string, excluir: readonly string[] = []): string[] {
  const extraido = extractAtoms(codigo);
  if (!extraido.ok) {
    throw new Error(`fixture quebrada — não parseia: ${extraido.error.message}`);
  }
  const excluidos = new Set(excluir);
  return extraido.keys.filter((chave) => !excluidos.has(chave));
}

/**
 * Orçamento que cobre o vocabulário das DUAS soluções (a dentro e a de fora),
 * com `node:ForOfStatement` como a ÚNICA construção bloqueada — é o cenário dos
 * testes que misturam as duas: qualquer tentativa dentro passa no prover; a que
 * usa for...of falha SÓ por causa da construção proibida.
 */
function orcamentoSemForOf(): string[] {
  const todos = new Set([...orcamentoDe(codigoDentro()), ...orcamentoDe(codigoFora())]);
  todos.delete('node:ForOfStatement');
  return [...todos];
}

/** Contexto base: desafio de soma simples; orçamento = átomos da solução dentro. */
function ctxBase(over: Partial<SolubilidadeCtx> = {}): SolubilidadeCtx {
  const codigo = codigoDentro();
  return {
    orcamento: orcamentoDe(codigo),
    enunciado: 'Escreva a função soma(array), que soma todos os números do array e devolve o total.',
    prova: {
      // A solução de REFERÊNCIA e os testes carregam marcadores: o teste de
      // vazamento (A-P19-4) garante que eles NUNCA chegam ao prompt do aluno.
      solutionCode: `SOLUCAO_REFERENCIA_SECRETA_123\n${codigo}`,
      starterCode: STARTER,
      testsCode: [
        'TESTES_SECRETO_456',
        "import { test } from 'node:test';",
        "import assert from 'node:assert/strict';",
        "import { soma } from './solution.mjs';",
        "test('caso 1', () => { assert.equal(soma([1, 2]), 3); });",
      ].join('\n'),
      expectedTestCount: 1,
    },
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Fakes: LLM (por índice de chamada + registro do prompt) e prover (diff real)
// ---------------------------------------------------------------------------

function vereditoValido(): ChallengeProofsVerdict {
  return { valid: true, failures: [], declared: 1, executed: 1 };
}

function vereditoInvalido(reason = 'a tentativa não passou'): ChallengeProofsVerdict {
  return { valid: false, failures: [{ proof: 'solutionPasses', passed: false, reason }], declared: 1, executed: 1 };
}

/** LLM fake: responde por índice de chamada e registra TODOS os req (prompt). */
function llmFake(responder: (req: LlmCallRequest, indice: number) => string | Promise<string>) {
  const chamadas: LlmCallRequest[] = [];
  const llm: Pick<EngineLlm, 'callLlm'> = {
    async callLlm(_etapa: string, req: LlmCallRequest): Promise<LlmCallResult> {
      chamadas.push(req);
      const content = await responder(req, chamadas.length - 1);
      return {
        content,
        model: 'fake-aluno',
        cached: false,
        stageUsage: { promptTokens: 0, completionTokens: 0, llmCalls: 1, cachedHits: 0, retries: 0 },
        attempts: 1,
        elapsedMs: 0,
      };
    },
  };
  return { llm, chamadas };
}

/**
 * Prover fake (A-P19-1 — veredito por execução real, aqui determinístico):
 * reprova a tentativa quando o código usa construções fora do orçamento — o
 * MESMO diff que a produção usa para nomear a construção faltante.
 */
function proverFake(orcamento: readonly string[]): ProverDeDesafio {
  return async (input) => {
    const extraido = extractAtoms(input.solutionCode);
    if (extraido.ok && extraido.keys.some((chave) => !orcamento.includes(chave))) {
      return vereditoInvalido('a tentativa usa construção fora do orçamento');
    }
    return vereditoValido();
  };
}

// ---------------------------------------------------------------------------
// 1. Construção fora do orçamento → 0% e a construção é NOMEADA
// ---------------------------------------------------------------------------

describe('engine/quality/solvable (J3 — aluno simulado, método pass^k)', () => {
  it('desafio que exige construção fora do orçamento: 0% de acerto e NOMEIA a construção faltante', async () => {
    // (a) aluno fake devolve bloqueado/precisoDe apontando a construção.
    const ctxA = { ...ctxBase(), orcamento: orcamentoSemForOf() };
    const { llm: llmA } = llmFake(() => JSON.stringify({ bloqueado: true, precisoDe: ['node:ForOfStatement'] }));
    const medA = await medirSolubilidade({ llm: llmA, prover: proverFake(ctxA.orcamento) }, ctxA, 3);
    assert.equal(medA.passou, false);
    assert.equal(medA.taxaDeAcerto, 0);
    assert.equal(medA.avisoTarefaQuebrada, true); // 0% = sinal de tarefa QUEBRADA
    assert.equal(medA.primeiraConstrucaoFaltante, 'node:ForOfStatement');
    assert.ok(medA.tentativasRealizadas.every((t) => t.tipo === 'bloqueado' && !t.passou));

    // (b) aluno fake TENTA e o código usa a construção fora do orçamento.
    const ctxB = { ...ctxBase(), orcamento: orcamentoSemForOf() };
    const { llm: llmB } = llmFake(() => JSON.stringify({ codigo: codigoFora() }));
    const medB = await medirSolubilidade({ llm: llmB, prover: proverFake(ctxB.orcamento) }, ctxB, 3);
    assert.equal(medB.passou, false);
    assert.equal(medB.taxaDeAcerto, 0);
    assert.equal(medB.avisoTarefaQuebrada, true);
    assert.equal(medB.primeiraConstrucaoFaltante, 'node:ForOfStatement');
    assert.ok(medB.tentativasRealizadas.every((t) => t.tipo === 'tentativa' && !t.passou));
  });

  // -------------------------------------------------------------------------
  // 2. Dentro do orçamento → pass^3
  // -------------------------------------------------------------------------

  it('desafio dentro do orçamento passa em pass^3 (k=3 default)', async () => {
    const ctx = ctxBase(); // orçamento = TODOS os átomos da solução
    const { llm, chamadas } = llmFake(() => JSON.stringify({ codigo: codigoDentro() }));
    const med = await medirSolubilidade({ llm, prover: proverFake(ctx.orcamento) }, ctx);

    assert.equal(med.passou, true); // pass^k: TODAS as tentativas passaram
    assert.equal(med.tentativas, DEFAULT_K);
    assert.equal(med.taxaDeAcerto, 1);
    assert.equal(med.avisoTarefaQuebrada, false);
    assert.equal(med.primeiraConstrucaoFaltante, null);
    assert.equal(med.tentativasRealizadas.length, 3);
    assert.ok(med.tentativasRealizadas.every((t) => t.passou));
    assert.equal(chamadas.length, 3, 'k tentativas independentes = k chamadas de LLM');
  });

  // -------------------------------------------------------------------------
  // 3. UMA falha entre três DERROTA o pass^k
  // -------------------------------------------------------------------------

  it('uma tentativa que falha entre três derruba o pass^k (2 passam, 1 falha → falhou)', async () => {
    const ctx = { ...ctxBase(), orcamento: orcamentoSemForOf() };
    const { llm } = llmFake((_req, indice) =>
      // a TERCEIRA tentativa usa a construção proibida → o prover reprova.
      indice < 2 ? JSON.stringify({ codigo: codigoDentro() }) : JSON.stringify({ codigo: codigoFora() }),
    );
    const med = await medirSolubilidade({ llm, prover: proverFake(ctx.orcamento) }, ctx, 3);

    assert.equal(med.passou, false); // pass^k é ESTRITO: uma falha derruba
    assert.equal(med.taxaDeAcerto, 2 / 3);
    // 2/3 ≠ 0 → flakiness, não tarefa estruturalmente quebrada (sem aviso).
    assert.equal(med.avisoTarefaQuebrada, false);
    assert.equal(med.primeiraConstrucaoFaltante, 'node:ForOfStatement');
    assert.deepEqual(
      med.tentativasRealizadas.map((t) => t.passou),
      [true, true, false],
    );
  });

  // -------------------------------------------------------------------------
  // 4. O contexto do aluno é o orçamento e NADA além (teste de string, A-P19-4)
  // -------------------------------------------------------------------------

  it('o contexto do aluno simulado não vaza nada além do orçamento (sem solução, sem testes, sem teoria)', async () => {
    const MARKER_SOLUCAO = 'SOLUCAO_REFERENCIA_SECRETA_123';
    const MARKER_TESTES = 'TESTES_SECRETO_456';
    const MARKER_TEORIA = 'TEORIA_SECRETA_789';
    // A teoria existe no MUNDO do autor — mas o tipo do contexto nem a aceita.
    const teoria = `# Teoria da aula\nconst ${MARKER_TEORIA} = true;\n`;

    const prova: ChallengeProofsInput = {
      solutionCode: `${MARKER_SOLUCAO}\n${codigoDentro()}`,
      starterCode: STARTER,
      testsCode: [
        MARKER_TESTES,
        "import { test } from 'node:test';",
        "test('caso 1', () => { assert.ok(true); });",
      ].join('\n'),
      expectedTestCount: 1,
    };
    const ctx = { ...ctxBase(), prova };
    const { llm, chamadas } = llmFake(() => JSON.stringify({ codigo: codigoDentro() }));
    await medirSolubilidade({ llm, prover: proverFake(ctx.orcamento) }, ctx, 1);

    assert.equal(chamadas.length, 1);
    const prompt = chamadas[0].prompt;

    // O aluno vê o seu contexto: enunciado, starter e a lista literal do orçamento.
    assert.ok(prompt.includes(ctx.enunciado), 'prompt deve conter o enunciado');
    assert.ok(prompt.includes(STARTER), 'prompt deve conter o starter');
    for (const chave of ctx.orcamento) {
      assert.ok(prompt.includes(chave), `prompt deve conter a chave do orçamento ${chave}`);
    }

    // E NADA além: sem solução de referência, sem testes, sem teoria.
    assert.ok(!prompt.includes(MARKER_SOLUCAO), 'não pode vazar a solução de referência');
    assert.ok(!prompt.includes(MARKER_TESTES), 'não pode vazar os testes');
    assert.ok(!prompt.includes(MARKER_TEORIA), 'não pode vazar a teoria');
    assert.ok(!prompt.includes(teoria), 'não pode vazar o texto da teoria');
    // Defesa extra: construção que está fora do orçamento não aparece no prompt
    // (senão seria prova de vazamento do código de referência).
    assert.ok(!prompt.includes('node:ForOfStatement'));

    void teoria;
  });

  // PROBE DE TIPO (A-P19-4): o builder do prompt NÃO aceita solução/testes/
  // teoria — se alguém adicionar campo, o probe deixa de compilar.
  type _ChavesDoPrompt = Exclude<keyof DadosDoPromptDoAluno, 'enunciado' | 'starter' | 'orcamento'>;
  const _provaDeTipo: _ChavesDoPrompt extends never ? true : false = true;
  void _provaDeTipo;

  // -------------------------------------------------------------------------
  // 5. (bônus) precisoDe, resposta inválida e falha de infra = erro estruturado
  // -------------------------------------------------------------------------

  it('(bônus) bloqueado/precisoDe nomeia o PRIMEIRO item fora do orçamento; bloqueio vazio → null', async () => {
    // O primeiro item da lista do aluno (IfStatement) JÁ está no orçamento →
    // pula; o primeiro FORA (ForOfStatement) é o nomeado (a mais requisitada).
    const ctx = { ...ctxBase(), orcamento: [...orcamentoDe(codigoDentro()), 'node:IfStatement'] };
    const { llm } = llmFake(() =>
      JSON.stringify({ bloqueado: true, precisoDe: ['node:IfStatement', 'node:ForOfStatement', 'op:binary:==='] }),
    );
    const med = await medirSolubilidade({ llm, prover: proverFake(ctx.orcamento) }, ctx, 1);

    assert.equal(med.passou, false);
    assert.equal(med.primeiraConstrucaoFaltante, 'node:ForOfStatement');

    // Aluno que bloqueia pedindo só o que JÁ é permitido = aluno confuso: a
    // medição falha, mas não dá para nomear construção faltante → null.
    const ctxVazio = ctxBase();
    const { llm: llmVazio } = llmFake(() => JSON.stringify({ bloqueado: true, precisoDe: ['node:ForStatement'] }));
    const medVazio = await medirSolubilidade({ llm: llmVazio, prover: proverFake(ctxVazio.orcamento) }, ctxVazio, 1);
    assert.equal(medVazio.passou, false);
    assert.equal(medVazio.primeiraConstrucaoFaltante, null);
    assert.equal(medVazio.avisoTarefaQuebrada, true);
  });

  it('(bônus) resposta inválida do aluno: 0% com aviso e construção faltante null', async () => {
    const ctx = ctxBase();
    const { llm } = llmFake(() => 'isto não é JSON — o aluno respondeu com prosa');
    const med = await medirSolubilidade({ llm, prover: proverFake(ctx.orcamento) }, ctx, 3);

    assert.equal(med.passou, false);
    assert.equal(med.taxaDeAcerto, 0);
    assert.equal(med.avisoTarefaQuebrada, true);
    assert.equal(med.primeiraConstrucaoFaltante, null); // não dá para nomear construção
    assert.ok(med.tentativasRealizadas.every((t) => t.tipo === 'resposta_invalida' && !t.passou));
  });

  it('(bônus) falha de infraestrutura = erro ESTRUTURADO da medição (fail-closed)', async () => {
    // prover LANÇANDO → SolubilidadeError PROVER.
    const ctx = ctxBase();
    const { llm } = llmFake(() => JSON.stringify({ codigo: codigoDentro() }));
    await assert.rejects(
      medirSolubilidade({ llm, prover: async () => { throw new Error('disco cheio'); } }, ctx, 1),
      (erro: unknown) => erro instanceof SolubilidadeError && erro.code === 'SOLUBILIDADE_PROVER_FALHOU',
    );

    // LLM LANÇANDO → SolubilidadeError LLM.
    const llmQuebrado: Pick<EngineLlm, 'callLlm'> = {
      callLlm: async () => { throw new Error('chave de API ausente'); },
    };
    await assert.rejects(
      medirSolubilidade({ llm: llmQuebrado, prover: proverFake(ctx.orcamento) }, ctx, 1),
      (erro: unknown) => erro instanceof SolubilidadeError && erro.code === 'SOLUBILIDADE_LLM_FALHOU',
    );

    // PROVER devolvendo veredito com execError (infra das provas) → PROVER.
    const proverComExecError: ProverDeDesafio = async () => ({
      valid: false,
      failures: [{ proof: 'execError', passed: false, reason: 'falha de infraestrutura nas provas' }],
      declared: 1,
      executed: 0,
      execError: 'mkdtemp falhou',
    });
    await assert.rejects(
      medirSolubilidade({ llm, prover: proverComExecError }, ctx, 1),
      (erro: unknown) => erro instanceof SolubilidadeError && erro.code === 'SOLUBILIDADE_PROVER_FALHOU',
    );

    // k inválido → SolubilidadeError ARGUMENTO.
    await assert.rejects(
      medirSolubilidade({ llm, prover: proverFake(ctx.orcamento) }, ctx, 0),
      (erro: unknown) => erro instanceof SolubilidadeError && erro.code === 'SOLUBILIDADE_ARGUMENTO_INVALIDO',
    );
  });
});