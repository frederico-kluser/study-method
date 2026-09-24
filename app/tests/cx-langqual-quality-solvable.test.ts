/**
 * tests/cx-langqual-quality-solvable.test.ts — CARACTERIZAÇÃO (golden master)
 * do ALUNO SIMULADO e da medição de solubilidade pass^k
 * (`engine/quality/solvable.ts`). Rede de segurança para a refatoração.
 *
 * Contratos que mordem aqui:
 *   1. `montarPromptDoAluno` tem assinatura que IMPEDE vazar a solução: só
 *      enunciado + starter + orçamento literal (lista `- chave`); orçamento
 *      vazio é `- (vazio)`;
 *   2. `simularAluno` é FAIL-CLOSED estruturado: LLM lançando ⇒
 *      `SolubilidadeError` SOLUBILIDADE_LLM_FALHOU; prover lançando ou
 *      devolvendo execError ⇒ SOLUBILIDADE_PROVER_FALHOU (infra NUNCA é falha
 *      do aluno); resposta fora do shape {"codigo"} | {"bloqueado",…} ⇒
 *      `resposta_invalida` (não culpa construção);
 *   3. o prover recebe o código do ALUNO com `solutionFiles: undefined` (a
 *      referência NUNCA vaza para a execução);
 *   4. `medirSolubilidade` é pass^k ESTRITO (todas as k passam; uma falha
 *      derruba — nunca pass-at-k), executa SEMPRE as k tentativas (a taxa tem
 *      de ser honesta), `avisoTarefaQuebrada` só em 0% e k fora de [1,∞) ⇒
 *      SOLUBILIDADE_ARGUMENTO_INVALIDO;
 *   5. `primeiraConstrucaoFaltante`: (i) bloqueio ⇒ a 1ª de `precisoDe` fora do
 *      orçamento (todas dentro ⇒ null); (ii) tentativa reprovada ⇒ diff por
 *      FREQUÊNCIA (desempate alfabético); (iii) nada analisável ⇒ null.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { EngineLinguagemError } from '../electron/main/engine/extract';
import type { ChallengeProofsVerdict } from '../electron/main/engine/exec/proofs';

import {
  ETAPA_ALUNO_SIMULADO,
  ALUNO_STAGE_VERSION,
  ALUNO_TIMEOUT_MS,
  DEFAULT_K,
  SOLUBILIDADE_CODES,
  SolubilidadeError,
  montarPromptDoAluno,
  simularAluno,
  medirSolubilidade,
  type SolubilidadeCtx,
  type SolubilidadeDeps,
} from '../electron/main/engine/quality/solvable';

type VerdictFake = ChallengeProofsVerdict;

function llmFake(...respostas: string[]) {
  let i = 0;
  return {
    callLlm: async () => ({ content: respostas[Math.min(i++, respostas.length - 1)] }),
  } as unknown as SolubilidadeDeps['llm'];
}

function llmQueLanca() {
  return {
    callLlm: async () => {
      throw new Error('transporte morreu');
    },
  } as unknown as SolubilidadeDeps['llm'];
}

function proverFake(valid: boolean) {
  return async (): Promise<VerdictFake> =>
    (valid ? { valid: true, failures: [] } : { valid: false, failures: [{ proof: 'proof1', reason: 'errado' }] }) as unknown as VerdictFake;
}

const CTX: SolubilidadeCtx = {
  orcamento: ['node:ReturnStatement'],
  enunciado: 'devolva 7',
  prova: {
    starterCode: 'export function resposta() {\n  /* lacuna */\n}\n',
    solutionCode: 'export function resposta() {\n  return 7;\n}\n',
    testsCode: "test('a', () => {});",
    expectedTestCount: 1,
  },
};

describe('solvable — (1) constantes e o prompt do aluno (nada além do orçamento)', () => {
  it('constantes da etapa são as pinadas (etapa, versão, timeout, k, códigos)', () => {
    assert.equal(ETAPA_ALUNO_SIMULADO, 'solubilidade:aluno-simulado');
    assert.equal(ALUNO_STAGE_VERSION, '1.0.0');
    assert.equal(ALUNO_TIMEOUT_MS, 60_000);
    assert.equal(DEFAULT_K, 3);
    assert.deepEqual(SOLUBILIDADE_CODES, {
      LLM: 'SOLUBILIDADE_LLM_FALHOU',
      PROVER: 'SOLUBILIDADE_PROVER_FALHOU',
      ARGUMENTO: 'SOLUBILIDADE_ARGUMENTO_INVALIDO',
    });
    const e = new SolubilidadeError({ code: SOLUBILIDADE_CODES.LLM, message: 'x', etapa: 'e', detail: 'd', cause: 'c' });
    assert.equal(e.name, 'SolubilidadeError');
    assert.equal(e.code, 'SOLUBILIDADE_LLM_FALHOU');
    assert.equal(e.etapa, 'e');
    assert.equal(e.detail, 'd');
  });

  it('o prompt leva enunciado + starter + a lista literal `- chave`; vazio é `- (vazio)`', () => {
    const p = montarPromptDoAluno({
      enunciado: 'devolva 7',
      starter: 'export function resposta() {}',
      orcamento: ['node:ReturnStatement', 'node:NumericLiteral'],
    });
    assert.match(p, /ORÇAMENTO — construções permitidas/);
    assert.match(p, /- node:ReturnStatement\n- node:NumericLiteral/);
    assert.match(p, /ENUNCIADO DO DESAFIO:\ndevolva 7/);
    assert.match(p, /CÓDIGO INICIAL \(starter\):\n```js\nexport function resposta\(\) \{\}\n```/);
    assert.match(p, /"bloqueado": true, "precisoDe": \["chave1", "chave2"\]/);
    assert.match(p, /você NÃO vê os testes/i);

    const vazio = montarPromptDoAluno({ enunciado: 'e', starter: 's', orcamento: [] });
    assert.ok(vazio.includes('- (vazio)'));
  });
});

describe('solvable — (2) simularAluno: fail-closed estruturado, nunca veredito falso', () => {
  it('tentativa passa pelo prover REAL com o código do ALUNO e solutionFiles descartado', async () => {
    const capturado: { input?: Record<string, unknown> } = {};
    const deps: SolubilidadeDeps = {
      llm: llmFake('{"codigo": "export function resposta() { return 7; }"}'),
      prover: async (input) => {
        capturado.input = { ...input } as unknown as Record<string, unknown>;
        return { valid: true, failures: [] } as unknown as VerdictFake;
      },
    };
    const r = await simularAluno(deps, CTX);
    assert.equal(r.resposta.tipo, 'tentativa');
    assert.equal(r.passou, true);
    assert.ok(r.veredito !== undefined);
    assert.equal(capturado.input?.solutionCode, 'export function resposta() { return 7; }');
    assert.equal(capturado.input?.solutionFiles, undefined, 'a referência NUNCA vaza para a execução');
    assert.equal(capturado.input?.testsCode, CTX.prova.testsCode);
  });

  it('veredito inválido do prover ⇒ passou false com a razão da PRIMEIRA prova que falhou', async () => {
    const r = await simularAluno(
      { llm: llmFake('{"codigo": "x = 1;"}'), prover: proverFake(false) },
      CTX,
    );
    assert.equal(r.passou, false);
    assert.equal(r.razao, 'errado');
  });

  it('bloqueio legítimo e respostas FORA do shape são classificados (resposta_invalida nunca culpa construção)', async () => {
    const bloqueado = await simularAluno(
      { llm: llmFake('{"bloqueado": true, "precisoDe": ["node:While"]}'), prover: proverFake(true) },
      CTX,
    );
    assert.deepEqual(bloqueado.resposta, { tipo: 'bloqueado', precisoDe: ['node:While'] });
    assert.equal(bloqueado.passou, false);
    assert.match(bloqueado.razao ?? '', /aluno reportou bloqueio/);

    const naoJson = await simularAluno({ llm: llmFake('não é json'), prover: proverFake(true) }, CTX);
    assert.deepEqual(naoJson.resposta, { tipo: 'resposta_invalida', razao: 'resposta não é JSON válido' });

    const naoObjeto = await simularAluno({ llm: llmFake('42'), prover: proverFake(true) }, CTX);
    assert.equal(naoObjeto.resposta.tipo, 'resposta_invalida');

    const codigoVazio = await simularAluno({ llm: llmFake('{"codigo": "   "}'), prover: proverFake(true) }, CTX);
    assert.equal(codigoVazio.resposta.tipo, 'resposta_invalida', 'código em branco não é tentativa');

    const bloqueioSemLista = await simularAluno({ llm: llmFake('{"bloqueado": true}'), prover: proverFake(true) }, CTX);
    assert.match(
      (bloqueioSemLista.resposta as { razao: string }).razao,
      /bloqueado sem precisoDe válido/,
    );
  });

  it('LLM lançando ⇒ SolubilidadeError LLM; prover lançando ⇒ PROVER (fail-closed, nunca veredito)', async () => {
    await assert.rejects(
      () => simularAluno({ llm: llmQueLanca(), prover: proverFake(true) }, CTX),
      (e: unknown) => {
        assert.ok(e instanceof SolubilidadeError);
        assert.equal(e.code, SOLUBILIDADE_CODES.LLM);
        assert.equal(e.etapa, ETAPA_ALUNO_SIMULADO);
        return true;
      },
    );
    await assert.rejects(
      () =>
        simularAluno(
          {
            llm: llmFake('{"codigo": "x = 1;"}'),
            prover: async () => {
              throw new Error('spawn morreu');
            },
          },
          CTX,
        ),
      (e: unknown) => {
        assert.ok(e instanceof SolubilidadeError);
        assert.equal(e.code, SOLUBILIDADE_CODES.PROVER);
        return true;
      },
    );
  });

  it('veredito com execError (ou failures.proof === "execError") é INFRA do prover, não falha do aluno', async () => {
    const comExecError = async (): Promise<VerdictFake> =>
      ({ valid: false, execError: 'timeout no spawn', failures: [] }) as unknown as VerdictFake;
    await assert.rejects(
      () => simularAluno({ llm: llmFake('{"codigo": "x = 1;"}'), prover: comExecError }, CTX),
      (e: unknown) => {
        assert.ok(e instanceof SolubilidadeError);
        assert.equal(e.code, SOLUBILIDADE_CODES.PROVER);
        assert.match(e.message, /infraestrutura/);
        return true;
      },
    );
  });
});

describe('solvable — (3) medirSolubilidade: pass^k ESTRITO com k sempre executado', () => {
  it('TODAS as k passam ⇒ passou; uma falha derruba (nunca pass-at-k)', async () => {
    const todasPassam = await medirSolubilidade(
      { llm: llmFake('{"codigo": "ok"}'), prover: proverFake(true) },
      CTX,
    );
    assert.equal(todasPassam.passou, true);
    assert.equal(todasPassam.tentativas, DEFAULT_K);
    assert.equal(todasPassam.taxaDeAcerto, 1);
    assert.equal(todasPassam.avisoTarefaQuebrada, false);
    assert.equal(todasPassam.tentativasRealizadas.length, 3);
    assert.deepEqual(todasPassam.tentativasRealizadas.map((t) => t.ordem), [1, 2, 3]);

    // 2 de 3: LLM devolve tentativa válida 2× e bloqueio 1×.
    const duasDeTres = await medirSolubilidade(
      {
        llm: llmFake('{"codigo": "ok"}', '{"bloqueado": true, "precisoDe": []}', '{"codigo": "ok"}'),
        prover: proverFake(true),
      },
      CTX,
    );
    assert.equal(duasDeTres.passou, false, 'pass^k: uma falha derruba');
    assert.equal(duasDeTres.taxaDeAcerto, 2 / 3);
  });

  it('as k tentativas SEMPRE rodam (a taxa de acerto tem de ser honesta) e 0% ⇒ avisoTarefaQuebrada', async () => {
    let chamadas = 0;
    const deps: SolubilidadeDeps = {
      llm: {
        callLlm: async () => {
          chamadas += 1;
          return { content: '{"codigo": "x = 1;"}' };
        },
      } as unknown as SolubilidadeDeps['llm'],
      prover: proverFake(false),
    };
    const m = await medirSolubilidade(deps, CTX);
    assert.equal(chamadas, 3, 'a 1ª falha NÃO aborta a medição');
    assert.equal(m.taxaDeAcerto, 0);
    assert.equal(m.avisoTarefaQuebrada, true);
  });

  it('primeiraConstrucaoFaltante: (i) bloqueio ⇒ 1ª de precisoDe FORA do orçamento; todas dentro ⇒ null', async () => {
    const m = await medirSolubilidade(
      {
        llm: llmFake('{"bloqueado": true, "precisoDe": ["node:ReturnStatement", "node:While"]}', '{"bloqueado": true, "precisoDe": ["node:While"]}', '{"bloqueado": true, "precisoDe": ["node:While"]}'),
        prover: proverFake(true),
      },
      CTX,
    );
    assert.equal(m.primeiraConstrucaoFaltante, 'node:While');

    const confuso = await medirSolubilidade(
      {
        llm: llmFake('{"bloqueado": true, "precisoDe": ["node:ReturnStatement"]}'),
        prover: proverFake(true),
      },
      CTX,
    );
    assert.equal(confuso.primeiraConstrucaoFaltante, null, 'pedir só o que já é permitido = aluno confuso');
  });

  it('primeiraConstrucaoFaltante: (ii) diff por FREQUÊNCIA das tentativas reprovadas; (iii) nada analisável ⇒ null', async () => {
    // tentativa reprovada com `x = 1;` e orçamento só com EndOfFileToken: a
    // primeira (alfabética, frequências iguais) é node:BinaryExpression.
    const ctx: SolubilidadeCtx = { ...CTX, orcamento: ['node:EndOfFileToken'] };
    const m = await medirSolubilidade(
      { llm: llmFake('{"codigo": "x = 1;"}'), prover: proverFake(false) },
      ctx,
    );
    assert.equal(m.primeiraConstrucaoFaltante, 'node:BinaryExpression');

    const soInvalidas = await medirSolubilidade(
      { llm: llmFake('não é json'), prover: proverFake(false) },
      CTX,
    );
    assert.equal(soInvalidas.primeiraConstrucaoFaltante, null, 'resposta inválida não culpa construção');
  });

  it('k fora de [1,∞) ⇒ SolubilidadeError ARGUMENTO (fail-closed de argumento)', async () => {
    for (const k of [0, -1, 1.5, Number.NaN]) {
      await assert.rejects(
        () => medirSolubilidade({ llm: llmFake('{}'), prover: proverFake(true) }, CTX, k),
        (e: unknown) => {
          assert.ok(e instanceof SolubilidadeError);
          assert.equal(e.code, SOLUBILIDADE_CODES.ARGUMENTO);
          assert.match(e.message, /inteiro ≥ 1/);
          return true;
        },
      );
    }
  });

  it('a medição é JAVASCRIPT-ONLY com guarda explícita (outra linguagem LANÇA)', async () => {
    await assert.rejects(
      () => medirSolubilidade({ llm: llmFake('{}'), prover: proverFake(true) }, { ...CTX, language: 'python' }),
      (e: unknown) => e instanceof EngineLinguagemError,
    );
    await assert.rejects(
      () => simularAluno({ llm: llmFake('{}'), prover: proverFake(true) }, { ...CTX, language: 'rust' }),
      (e: unknown) => e instanceof EngineLinguagemError,
    );
  });
});
