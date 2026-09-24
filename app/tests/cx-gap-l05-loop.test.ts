/**
 * tests/cx-gap-l05-loop.test.ts — TESTES DE GAP do lote L05 sobre
 * `engine/review/loop.ts` (a rodada interna do laço F11), escritos ANTES da
 * refatoração. Caracterização do PLANEJADOR→CORRETOR nos trechos que os testes
 * existentes não fixam: os TRÊS motivos de `correcoesInvalidas` (verbatim), o
 * defeito do catálogo do plano órfão e a rejeição por pin verde quebrado.
 * SEM LLM/rede: revisor/planejador/corretor são fakes; verificadores injetados.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Apontamento } from '../electron/main/engine/review/actionCatalog';
import type { PinDeRegressao, ProverDeDesafio } from '../electron/main/engine/review/prover';
import {
  ErroEstruturadoDoLaco,
  criarSessaoDeRevisao,
  rodarRodadaDeRevisao,
  type AcaoDoPlano,
  type ContextoDoLaco,
} from '../electron/main/engine/review/loop';

const CONTEUDO = 'const abc = 1;\n';

function apontamentoSobrevivente(): Apontamento {
  return {
    id: 'A1',
    rodada: 1,
    artefato: 'solutionCode',
    alvo: { caminho: 'a.json', linha: 1, span: [0, 13], no_ast: 'decl:const', token: 'const abc' },
    evidencia: {
      tipo: 'orcamento',
      prova: 'viola o orçamento declarado.',
      introduzido_em: 'm1/l1',
      reproduzivel_por: 'mecanico: verificado pelo verificador determinístico nesta rodada',
    },
    defeito: 'o artefato usa const fora do orçamento declarado.',
    regra_violada: 'C1',
    categoria: 'construcao_nao_ensinada',
    severity: 'bloqueante',
    acao_sugerida: 'reescrever o artefato sem a construção',
    confianca: 1,
  } as unknown as Apontamento;
}

function ctxCom(over: Record<string, unknown>): ContextoDoLaco {
  return {
    trilha: 'trilha-gap',
    artefatos: [{ caminho: 'a.json', nome: 'desafio', conteudo: CONTEUDO, ultimaEdicao: -1 }],
    verificadorDeOrcamento: async () => [],
    verificadorDeProvas: async () => [],
    proverDesafio: (async () => ({ valid: true, failures: [] })) as unknown as ProverDeDesafio,
    llm: {
      revisar: async () => ({ apontamentos: [apontamentoSobrevivente()] }),
      planejar: async () => ({ acoes: [] }),
      corrigir: async () => ({ rejeitado: false as const, delta: [] }),
    },
    modeloAutor: 'autor-model',
    modeloRevisor: 'revisor-model',
    ...over,
  } as unknown as ContextoDoLaco;
}

function acao(over: Partial<AcaoDoPlano>): AcaoDoPlano {
  return {
    posicao: 1,
    apontamento_id: 'A1',
    alvo: { arquivo: 'a.json', span: [0, 13] },
    motivo: 'motivo',
    acao: 'REWRITE_IN_BUDGET',
    resultado_esperado: 'resultado',
    ...over,
  } as unknown as AcaoDoPlano;
}

describe('cx-gap/l05/loop: correcoesInvalidas — os três motivos do gate do corretor', () => {
  it('alvo de arquivo que não existe no laço é correção INVÁLIDA nomeando o arquivo', async () => {
    const resultado = await rodarRodadaDeRevisao(
      ctxCom({
        llm: {
          revisar: async () => ({ apontamentos: [apontamentoSobrevivente()] }),
          planejar: async () => ({ acoes: [acao({ alvo: { arquivo: 'ghost.json', span: [0, 5] } })] }),
          corrigir: async () => ({ rejeitado: false as const, delta: [{ inicio: 0, fim: 5, substituicao: 'XXXXX' }] }),
        },
      }),
    );
    assert.deepEqual(resultado.correcoes, []);
    assert.deepEqual(resultado.correcoesInvalidas, [
      { apontamento_id: 'A1', motivo: 'arquivo "ghost.json" não existe no laço' },
    ]);
  });

  it('diff FORA do span é rejeitado pelo gate §7.4 (fail-closed) com o motivo verbatim', async () => {
    const resultado = await rodarRodadaDeRevisao(
      ctxCom({
        llm: {
          revisar: async () => ({ apontamentos: [apontamentoSobrevivente()] }),
          planejar: async () => ({ acoes: [acao({ alvo: { arquivo: 'a.json', span: [0, 5] } })] }),
          corrigir: async () => ({ rejeitado: false as const, delta: [{ inicio: 6, fim: 13, substituicao: 'x' }] }),
        },
      }),
    );
    assert.deepEqual(resultado.correcoes, []);
    assert.deepEqual(resultado.correcoesInvalidas, [
      { apontamento_id: 'A1', motivo: 'diff fora do span ou malformado — gate §7.4 (fail-closed)' },
    ]);
  });

  it('delta que passa no gate mas NÃO muda o conteúdo é inválido (nunca correção fantasma)', async () => {
    const resultado = await rodarRodadaDeRevisao(
      ctxCom({
        llm: {
          revisar: async () => ({ apontamentos: [apontamentoSobrevivente()] }),
          planejar: async () => ({ acoes: [acao({ alvo: { arquivo: 'a.json', span: [0, 13] } })] }),
          corrigir: async () => ({
            rejeitado: false as const,
            delta: [{ inicio: 0, fim: 13, substituicao: 'const abc = 1' }],
          }),
        },
      }),
    );
    assert.deepEqual(resultado.correcoes, []);
    assert.deepEqual(resultado.correcoesInvalidas, [
      { apontamento_id: 'A1', motivo: 'corretor devolveu delta que não muda nada' },
    ]);
  });
});

describe('cx-gap/l05/loop: plano órfão vira DEFEITO do catálogo, nunca ação improvisada', () => {
  it('plano que referencia apontamento inexistente produz FALHA_DE_MAPEAMENTO com o detalhe verbatim', async () => {
    const resultado = await rodarRodadaDeRevisao(
      ctxCom({
        llm: {
          revisar: async () => ({ apontamentos: [apontamentoSobrevivente()] }),
          planejar: async () => ({ acoes: [acao({ apontamento_id: 'nao-existe' })] }),
          corrigir: async () => {
            throw new Error('corretor não deve ser chamado para plano órfão');
          },
        },
      }),
    );
    // a ação entra registrada no plano, mas NUNCA vira correção improvisada.
    assert.deepEqual(resultado.plano, [acao({ apontamento_id: 'nao-existe' })]);
    assert.deepEqual(resultado.correcoes, []);
    assert.deepEqual(resultado.defeitosDoCatalogo, [
      {
        tipo: 'FALHA_DE_MAPEAMENTO',
        apontamento_id: 'nao-existe',
        acao_informada: '',
        motivo: 'SEM_MAPEAMENTO',
        detalhe:
          'plano referencia apontamento inexistente "nao-existe" — o apontamento morreu no provador ou foi excluído',
      },
    ]);
  });
});

describe('cx-gap/l05/loop: correção que quebra pin VERDE é rejeitada (§6.7)', () => {
  it('o artefato volta ao estado anterior e a rejeição nomeia apontamento e pin', async () => {
    const apPin = apontamentoSobrevivente();
    const pinSemeado: PinDeRegressao = {
      id: 'pin-semeado',
      apontamento: apPin,
      descricao: 'o token xyzzy não pode voltar',
      alvo: { caminho: 'a.json' },
      afericao: { tipo: 'ast', trecho: 'xyzzy' },
      criado_na_rodada: 0,
    };
    const sessao = criarSessaoDeRevisao(ctxCom({}));
    sessao.pins.adicionarPin(pinSemeado);

    const resultado = await rodarRodadaDeRevisao(
      ctxCom({
        llm: {
          revisar: async () => ({ apontamentos: [apontamentoSobrevivente()] }),
          planejar: async () => ({ acoes: [acao({ alvo: { arquivo: 'a.json', span: [0, 13] } })] }),
          // o corretor INTRODUZ o token proibido pelo pin verde.
          corrigir: async () => ({
            rejeitado: false as const,
            delta: [{ inicio: 0, fim: 13, substituicao: 'const xyzzy = 2' }],
          }),
        },
      }),
      sessao,
    );
    assert.deepEqual(resultado.correcoes, [], 'a correção que quebra pin verde não é aplicada');
    assert.deepEqual(resultado.rejeicoesPorPinQuebrado, [{ apontamento_id: 'A1', pin_id: 'pin-semeado' }]);
    // o artefato VOLTA ao estado anterior (a regressão não entra no conteúdo).
    assert.equal(sessao.artefatos.get('a.json')!.conteudo, CONTEUDO);
  });
});

describe('cx-gap/l05/loop: chamarSeguro — throw que NÃO é Error vira erro estruturado', () => {
  it('mensagem String(throw) e código LACO_ETAPA_FALHOU (fail-closed, nunca aprovação)', async () => {
    const ctx = ctxCom({
      llm: {
        revisar: async () => {
          // eslint-disable-next-line no-throw-literal
          throw 'boom-string';
        },
        planejar: async () => ({ acoes: [] }),
        corrigir: async () => ({ rejeitado: false as const, delta: [] }),
      },
    });
    await assert.rejects(
      () => rodarRodadaDeRevisao(ctx),
      (e: unknown) => {
        assert.ok(e instanceof ErroEstruturadoDoLaco);
        assert.equal(e.codigo, 'LACO_ETAPA_FALHOU');
        assert.equal(e.etapa, 'revisor:unico');
        assert.equal(e.message, 'boom-string');
        assert.equal(e.causa, 'boom-string');
        return true;
      },
    );
  });
});
