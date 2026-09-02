/**
 * tests/engineLacoPapeis.test.ts — os TRÊS PAPÉIS LLM do laço, cabeados no
 * transporte de produção (`fiacao/geraTrilha.criarPapeisDoLacoLlm`).
 *
 * POR QUE ESTE ARQUIVO EXISTE: até esta onda, `review/loop.ts` recebia
 * `{ revisar, planejar, corrigir }` apenas de FAKES nos testes — em produção
 * NINGUÉM os construía, e por isso nem a F10 (`deps.revisao` do generate) nem
 * o `repair --aplicar` podiam rodar. O cabeamento agora existe; sem teste ele
 * apodrece de novo. Aqui o `EngineLlm` é FAKE (zero rede, zero chave): o que
 * se prova é o CONTRATO — prompt canônico entra, schema fechado sai, e toda
 * resposta inválida vira erro estruturado (§9.3 fail-closed), nunca veredito
 * por omissão.
 *
 * O que cada bloco fixa:
 *   ROTEAMENTO — o revisor vai no `modeloRevisor` e planejador/corretor no
 *     `modeloAutor` (§6.2: `model(AUTOR) !== model(REVISOR)`; a autopreferência
 *     se estende à família do modelo).
 *   ETAPAS SEPARADAS — cada papel tem etapa própria no transporte: o teto de
 *     tokens por execução soma a telemetria POR etapa (§4.1/§9.2) e uma etapa
 *     única apagaria a conta.
 *   H-1 (revisor sem campo de patch) — chave de código na resposta CRUA é
 *     rejeitada ANTES do parse (o zod em strip-mode a apagaria em silêncio, e
 *     §11 proíbe dar ao revisor um campo de patch: "se o campo existe, ele usa").
 *   CATÁLOGO FECHADO — ação fora de `ACAO_CATALOGO` é rejeitada aqui, nunca
 *     improvisada (§6.7).
 *   DIREITO DE REJEITAR — a rejeição do corretor é resultado TIPADO e a
 *     justificativa curta demais é recusada (§7.4/§6.7: o ledger exige ≥40).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  criarPapeisDoLacoLlm,
  ETAPA_LACO_CORRETOR,
  ETAPA_LACO_PLANEJADOR,
  ETAPA_LACO_REVISOR,
} from '../electron/main/engine/fiacao/geraTrilha';
import type { EngineLlm, LlmCallRequest, LlmCallResult, StageUsage } from '../electron/main/engine/runtime/callLlm';
import type { EntradaDeRevisao, EntradaDoCorretor, EntradaDoPlanejador } from '../electron/main/engine/review/loop';
import type { Apontamento } from '../electron/main/engine/review/actionCatalog';

// ---------------------------------------------------------------------------
// O transporte FAKE — grava (etapa, request) e devolve um conteúdo programado
// ---------------------------------------------------------------------------

interface ChamadaGravada {
  etapa: string;
  req: LlmCallRequest;
}

const USO_ZERO: StageUsage = { promptTokens: 0, completionTokens: 0, llmCalls: 0, cachedHits: 0, retries: 0 };

function llmFake(respostas: string[]): { llm: EngineLlm; chamadas: ChamadaGravada[] } {
  const chamadas: ChamadaGravada[] = [];
  let i = 0;
  const llm: EngineLlm = {
    async callLlm(etapa: string, req: LlmCallRequest): Promise<LlmCallResult> {
      chamadas.push({ etapa, req });
      const content = respostas[Math.min(i, respostas.length - 1)] ?? '';
      i += 1;
      return {
        content,
        model: req.modelId ?? '(default)',
        cached: false,
        stageUsage: USO_ZERO,
        attempts: 1,
        elapsedMs: 1,
      };
    },
    getStageUsage: () => undefined,
    getAllStageUsage: () => ({}),
  };
  return { llm, chamadas };
}

const ROTEAMENTO = { modeloAutor: 'fake/autor', modeloRevisor: 'fake/revisor' } as const;

// ---------------------------------------------------------------------------
// Fixtures das entradas que o LAÇO entrega a cada papel
// ---------------------------------------------------------------------------

const entradaDeRevisao: EntradaDeRevisao = {
  instrumento: 'constituicao',
  artefatoNormalizado: 'Artefato: desafio.json\n\n{ "solutionCode": "export function f() { return 1; }" }',
  regras: [{ id: 'C1', texto: 'nada fora do orçamento.' }],
  verificadores: '',
  rodada: 1,
  hashCode: 'abc123',
};

function apontamentoFixture(): Apontamento {
  return {
    id: 'MEC-0001',
    rodada: 1,
    artefato: 'desafio',
    alvo: { caminho: 'desafio.json#solutionCode', linha: 2, span: [10, 20], no_ast: 'VariableDeclaration', token: 'const' },
    evidencia: {
      tipo: 'orcamento',
      prova: 'token `const` fora do orçamento de m1/a1',
      introduzido_em: 'm1/a2',
      reproduzivel_por: 'npm run engine -- audit m1/a1',
    },
    defeito: 'O desafio usa `const` antes da aula que o ensina.',
    regra_violada: 'C1',
    categoria: 'construcao_nao_ensinada',
    severity: 'bloqueante',
    acao_sugerida: 'reescrever dentro do orçamento',
    confianca: 0.95,
  };
}

const entradaDoPlanejador: EntradaDoPlanejador = {
  trilha: 'fixture',
  rodada: 1,
  apontamentos: [apontamentoFixture()],
  excluidosComoExcecao: [],
  ledgerDeRejeicoes: '',
};

const entradaDoCorretor: EntradaDoCorretor = {
  trilha: 'fixture',
  rodada: 1,
  decisao: {
    apontamento: apontamentoFixture(),
    acao: 'REWRITE_IN_BUDGET',
    alvo: { arquivo: 'desafio.json#solutionCode', span: [10, 20] },
    resultado_esperado: 'a construção `const` some da superfície',
  },
  pins: ['PIN mecânico de `const`'],
};

/** Uma resposta VÁLIDA do revisor (schema estrito, sem `severity`, 5 predicados). */
function revisaoValida(): string {
  const predicados = (['E1', 'E2', 'E3', 'E4', 'E5'] as const).map((id) => ({
    id,
    pergunta: `pergunta ${id}`,
    justificativa: 'justificativa em prosa, sem código.',
    veredito: 'sim' as const,
  }));
  return JSON.stringify({
    artefato: 'desafio',
    hash_artefato: 'abc123',
    rodada: 1,
    apontamentos: [],
    resumo: 'nenhum defeito semântico encontrado nesta rodada.',
    predicados,
  });
}

// ---------------------------------------------------------------------------

describe('criarPapeisDoLacoLlm — o cabeamento de PRODUÇÃO dos papéis do laço', () => {
  it('REVISOR: roteia no modeloRevisor, em etapa própria, e devolve a revisão parseada', async () => {
    const { llm, chamadas } = llmFake([revisaoValida()]);
    const papeis = criarPapeisDoLacoLlm(llm, ROTEAMENTO);

    const revisao = await papeis.revisar(entradaDeRevisao);

    assert.equal(chamadas.length, 1);
    assert.equal(chamadas[0].etapa, `${ETAPA_LACO_REVISOR}:constituicao`, 'a etapa do revisor carrega o instrumento');
    assert.equal(chamadas[0].req.modelId, ROTEAMENTO.modeloRevisor, '§6.2: o revisor NUNCA vai no modelo do autor');
    assert.ok(chamadas[0].req.prompt.includes('Você é o REVISOR'), 'o prompt canônico do P-12 é o que sobe');
    assert.ok(chamadas[0].req.prompt.includes('C1:'), 'o catálogo de regras entra no prompt');
    assert.ok(chamadas[0].req.prompt.includes('Rodada: 1'), 'rodada ecoada no cabeçalho do artefato normalizado');
    assert.ok(chamadas[0].req.prompt.includes('Hash: abc123'), 'hash ecoado no cabeçalho do artefato normalizado');
    assert.equal(revisao.apontamentos.length, 0);
    assert.equal(revisao.predicados.length, 5);
  });

  it('REVISOR: chave de código na resposta CRUA é REJEITADA antes do parse (H-1, §11)', async () => {
    const comPatch = JSON.parse(revisaoValida()) as Record<string, unknown>;
    comPatch.patch = 'export function f() { return 2; }';
    const { llm } = llmFake([JSON.stringify(comPatch)]);
    const papeis = criarPapeisDoLacoLlm(llm, ROTEAMENTO);

    await assert.rejects(
      () => papeis.revisar(entradaDeRevisao),
      (erro: unknown) => {
        assert.ok(erro instanceof Error);
        assert.match(erro.message, /chave\(s\) de código/i, 'a proibição é estrutural — a chave derruba a resposta');
        return true;
      },
    );
  });

  it('REVISOR: resposta fora do RevisaoSchema vira erro estruturado (fail-closed)', async () => {
    const { llm } = llmFake([JSON.stringify({ artefato: 'desafio' })]);
    const papeis = criarPapeisDoLacoLlm(llm, ROTEAMENTO);

    await assert.rejects(
      () => papeis.revisar(entradaDeRevisao),
      (erro: unknown) => {
        assert.ok(erro instanceof Error);
        assert.equal((erro as { code?: string }).code, 'LACO_PAPEL_INVALIDO');
        assert.match(erro.message, /RevisaoSchema/);
        return true;
      },
    );
  });

  it('REVISOR: saída que não é JSON vira erro estruturado, nunca silêncio', async () => {
    const { llm } = llmFake(['desculpe, não consegui revisar.']);
    const papeis = criarPapeisDoLacoLlm(llm, ROTEAMENTO);

    await assert.rejects(
      () => papeis.revisar(entradaDeRevisao),
      (erro: unknown) => {
        assert.ok(erro instanceof Error);
        assert.equal((erro as { code?: string }).code, 'LACO_PAPEL_INVALIDO');
        assert.match(erro.message, /não é JSON/);
        return true;
      },
    );
  });

  it('PLANEJADOR: roteia no modeloAutor e devolve as ações do catálogo FECHADO', async () => {
    const plano = {
      acoes: [
        {
          posicao: 1,
          apontamento_id: 'MEC-0001',
          alvo: { arquivo: 'desafio.json#solutionCode', span: [10, 20] },
          motivo: 'a construção está fora do orçamento da aula.',
          acao: 'REWRITE_IN_BUDGET',
          resultado_esperado: 'a construção some da superfície.',
        },
      ],
    };
    const { llm, chamadas } = llmFake([JSON.stringify(plano)]);
    const papeis = criarPapeisDoLacoLlm(llm, ROTEAMENTO);

    const saida = await papeis.planejar(entradaDoPlanejador);

    assert.equal(chamadas[0].etapa, ETAPA_LACO_PLANEJADOR);
    assert.equal(chamadas[0].req.modelId, ROTEAMENTO.modeloAutor);
    assert.ok(chamadas[0].req.prompt.includes('Você é o PLANEJADOR'), 'o prompt canônico do P-13 é o que sobe');
    assert.equal(saida.acoes.length, 1);
    assert.equal(saida.acoes[0].acao, 'REWRITE_IN_BUDGET');
  });

  it('PLANEJADOR: ação FORA do catálogo fechado é rejeitada, nunca improvisada (§6.7)', async () => {
    const plano = {
      acoes: [
        {
          posicao: 1,
          apontamento_id: 'MEC-0001',
          alvo: { arquivo: 'desafio.json#solutionCode', span: [10, 20] },
          motivo: 'inventei uma ação.',
          acao: 'REESCREVER_TUDO',
          resultado_esperado: 'nada verificável.',
        },
      ],
    };
    const { llm } = llmFake([JSON.stringify(plano)]);
    const papeis = criarPapeisDoLacoLlm(llm, ROTEAMENTO);

    await assert.rejects(
      () => papeis.planejar(entradaDoPlanejador),
      (erro: unknown) => {
        assert.ok(erro instanceof Error);
        assert.equal((erro as { code?: string }).code, 'LACO_PAPEL_INVALIDO');
        assert.match(erro.message, /catálogo FECHADO/);
        return true;
      },
    );
  });

  it('CORRETOR: roteia no modeloAutor e devolve o delta de trechos', async () => {
    const { llm, chamadas } = llmFake([
      JSON.stringify({ rejeitado: false, delta: [{ inicio: 10, fim: 20, substituicao: 'return 2;' }] }),
    ]);
    const papeis = criarPapeisDoLacoLlm(llm, ROTEAMENTO);

    const saida = await papeis.corrigir(entradaDoCorretor);

    assert.equal(chamadas[0].etapa, ETAPA_LACO_CORRETOR);
    assert.equal(chamadas[0].req.modelId, ROTEAMENTO.modeloAutor);
    assert.ok(chamadas[0].req.prompt.includes('Você é o CORRETOR'), 'o prompt canônico do P-13 é o que sobe');
    assert.ok(chamadas[0].req.prompt.includes('O SPAN É LEI'), 'o span prescrito viaja no prompt');
    assert.equal(saida.rejeitado, false);
    assert.deepEqual((saida as { delta: readonly unknown[] }).delta, [{ inicio: 10, fim: 20, substituicao: 'return 2;' }]);
  });

  it('CORRETOR: a rejeição é resultado TIPADO e atravessa intacta (§7.4)', async () => {
    const justificativa = 'a evidência não se confirma: o token citado não existe no artefato nesta posição.';
    const { llm } = llmFake([JSON.stringify({ rejeitado: true, justificativa })]);
    const papeis = criarPapeisDoLacoLlm(llm, ROTEAMENTO);

    const saida = await papeis.corrigir(entradaDoCorretor);

    assert.equal(saida.rejeitado, true);
    assert.equal((saida as { justificativa: string }).justificativa, justificativa);
  });

  it('CORRETOR: rejeição com justificativa curta demais é RECUSADA (o ledger exige ≥40)', async () => {
    const { llm } = llmFake([JSON.stringify({ rejeitado: true, justificativa: 'não gostei' })]);
    const papeis = criarPapeisDoLacoLlm(llm, ROTEAMENTO);

    await assert.rejects(
      () => papeis.corrigir(entradaDoCorretor),
      (erro: unknown) => {
        assert.ok(erro instanceof Error);
        assert.equal((erro as { code?: string }).code, 'LACO_PAPEL_INVALIDO');
        assert.match(erro.message, /justificativa curta/);
        return true;
      },
    );
  });

  it('CORRETOR: aceitação sem delta (ou com trecho malformado) é erro estruturado', async () => {
    const semDelta = llmFake([JSON.stringify({ rejeitado: false })]);
    const papeisSemDelta = criarPapeisDoLacoLlm(semDelta.llm, ROTEAMENTO);
    await assert.rejects(() => papeisSemDelta.corrigir(entradaDoCorretor), /delta/);

    const trechoRuim = llmFake([JSON.stringify({ rejeitado: false, delta: [{ inicio: '10', fim: 20, substituicao: 'x' }] })]);
    const papeisTrechoRuim = criarPapeisDoLacoLlm(trechoRuim.llm, ROTEAMENTO);
    await assert.rejects(() => papeisTrechoRuim.corrigir(entradaDoCorretor), /trecho do delta/);
  });

  it('os três papéis usam etapas DISTINTAS do transporte (telemetria por etapa, §9.2)', () => {
    const etapas = new Set([ETAPA_LACO_REVISOR, ETAPA_LACO_PLANEJADOR, ETAPA_LACO_CORRETOR]);
    assert.equal(etapas.size, 3, 'etapa compartilhada apagaria a conta de tokens por papel');
  });

  it('toda chamada leva TIMEOUT e teto de saída (§7: 2.000 tokens; §4.1: etapa travada nunca segura a onda)', async () => {
    const { llm, chamadas } = llmFake([revisaoValida()]);
    const papeis = criarPapeisDoLacoLlm(llm, ROTEAMENTO);
    await papeis.revisar(entradaDeRevisao);

    assert.ok(chamadas[0].req.timeoutMs > 0, 'o transporte EXIGE timeout por etapa');
    assert.equal(chamadas[0].req.maxTokens, 2000, 'o teto de saída do §7');
    assert.ok(typeof chamadas[0].req.stageVersion === 'string' && chamadas[0].req.stageVersion.length > 0);
  });
});
