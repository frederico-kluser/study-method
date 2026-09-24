/**
 * tests/cx-gap-l05-prover.test.ts — TESTES DE GAP do lote L05 sobre
 * `engine/review/prover.ts`, escritos ANTES da refatoração. Caracterização dos
 * trechos que nenhum teste existente fixa: a cadeia de fallback de
 * `trechoOfensorDoAchado` (span → fragmento citado → token), as mensagens de
 * detalhe de `PinsDeRegressao.aferir` (execução, AST, artefato sumido,
 * fail-closed) e os bordas de `extrairProvasDoArtefato`. PURO: sem disco.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Apontamento } from '../electron/main/engine/review/actionCatalog';
import {
  PinsDeRegressao,
  extrairProvasDoArtefato,
  trechoOfensorDoAchado,
  type PinDeRegressao,
  type ProverDeDesafio,
} from '../electron/main/engine/review/prover';

function ap(over: Partial<Apontamento>): Apontamento {
  return {
    id: 'A1',
    rodada: 1,
    artefato: 'solutionCode',
    alvo: { caminho: 'a.json', linha: 1, span: [0, 5], no_ast: 'decl:const', token: 'const abc' },
    evidencia: {
      tipo: 'orcamento',
      prova: 'viola o orçamento declarado.',
      introduzido_em: null,
      reproduzivel_por: 'mecanico: x',
    },
    defeito: 'o artefato usa const fora do orçamento declarado.',
    regra_violada: 'C1',
    categoria: 'construcao_nao_ensinada',
    severity: 'bloqueante',
    acao_sugerida: 'reescrever o artefato sem a construção',
    confianca: 1,
    ...over,
  } as Apontamento;
}

// ─── trechoOfensorDoAchado — a cadeia span → fragmento → token ───────────────

describe('cx-gap/l05/prover: trechoOfensorDoAchado — fallback span → fragmento citado → token', () => {
  const conteudo = 'const abc = 1;\n';

  it('span com slice ≥ 3 caracteres vence sempre (é a evidência medida)', () => {
    const a = ap({
      alvo: { caminho: 'a.json', linha: 1, span: [0, 10], no_ast: 'x', token: 'token-grande' },
      evidencia: { tipo: 'orcamento', prova: 'usa `outro fragmento`', introduzido_em: null, reproduzivel_por: 'mecanico: x' },
    });
    assert.equal(trechoOfensorDoAchado(a, conteudo), 'const abc');
  });

  it('span que resolve curto (< 3) cai no PRIMEIRO fragmento entre crases da prova', () => {
    const a = ap({
      alvo: { caminho: 'a.json', linha: 1, span: [0, 1], no_ast: 'x', token: 'token-curto' },
      evidencia: { tipo: 'orcamento', prova: 'o trecho `const abc` é o ofensor', introduzido_em: null, reproduzivel_por: 'mecanico: x' },
    });
    assert.equal(trechoOfensorDoAchado(a, conteudo), 'const abc');
  });

  it('sem crases na prova cai no token do alvo (≥ 3); token curto devolve null (morre em silêncio)', () => {
    const a = ap({
      alvo: { caminho: 'a.json', linha: 1, span: [0, 1], no_ast: 'x', token: 'typeof' },
      evidencia: { tipo: 'orcamento', prova: 'sem crases nenhuma', introduzido_em: null, reproduzivel_por: 'mecanico: x' },
    });
    assert.equal(trechoOfensorDoAchado(a, conteudo), 'typeof');

    const curto = ap({
      alvo: { caminho: 'a.json', linha: 1, span: [0, 1], no_ast: 'x', token: 'ab' },
      evidencia: { tipo: 'orcamento', prova: 'sem crases nenhuma', introduzido_em: null, reproduzivel_por: 'mecanico: x' },
    });
    assert.equal(trechoOfensorDoAchado(curto, conteudo), null);
  });

  it('span invertido/fora do conteúdo não resolve; fragmento citado curto (< 3) também não vale', () => {
    const a = ap({
      alvo: { caminho: 'a.json', linha: 1, span: [10, 2], no_ast: 'x', token: 'ab' },
      evidencia: { tipo: 'orcamento', prova: 'citando `xy`', introduzido_em: null, reproduzivel_por: 'mecanico: x' },
    });
    assert.equal(trechoOfensorDoAchado(a, conteudo), null);
  });
});

// ─── PinsDeRegressao.aferir — os vereditos e suas mensagens ──────────────────

describe('cx-gap/l05/prover: PinsDeRegressao.aferir — veredito por aferição', () => {
  function pinDe(over: Partial<PinDeRegressao>): PinDeRegressao {
    return {
      id: 'pin-A1',
      apontamento: ap({}),
      descricao: 'descricao',
      alvo: { caminho: 'a.json' },
      criado_na_rodada: 1,
      ...over,
    } as PinDeRegressao;
  }

  it('pin de AST: ofensa presente ⇒ vermelho com a mensagem do trecho; ausente ⇒ verde', async () => {
    const colecao = new PinsDeRegressao({
      proverDesafio: (async () => ({ valid: true, executed: 0, failures: [] })) as unknown as ProverDeDesafio,
      obterArquivo: async () => 'const abc = 1;\n',
    });
    colecao.adicionarPin(pinDe({ id: 'pin-red', afericao: { tipo: 'ast', trecho: 'const abc' } }));
    let [veredito] = await colecao.todosRodam();
    assert.equal(veredito.verde, false);
    assert.equal(veredito.detalhe, 'o artefato ainda contém a construção ofensora do trecho "..."');

    const verde = new PinsDeRegressao({
      proverDesafio: (async () => ({ valid: true, executed: 0, failures: [] })) as unknown as ProverDeDesafio,
      obterArquivo: async () => 'const abc = 1;\n',
    });
    verde.adicionarPin(pinDe({ id: 'pin-green', afericao: { tipo: 'ast', trecho: 'xyzzy' } }));
    [veredito] = await verde.todosRodam();
    assert.equal(veredito.verde, true);
    assert.equal(veredito.detalhe, 'ofensa ausente do artefato');
  });

  it('pin de AST com artefato SUMIDO ou leitura que lança é fail-closed (vermelho + mensagem)', async () => {
    const sumido = new PinsDeRegressao({
      proverDesafio: (async () => ({ valid: true, executed: 0, failures: [] })) as unknown as ProverDeDesafio,
      obterArquivo: async () => null,
    });
    sumido.adicionarPin(pinDe({ id: 'pin-sumiu', afericao: { tipo: 'ast', trecho: 'const abc' } }));
    const [v1] = await sumido.todosRodam();
    assert.equal(v1.verde, false);
    assert.equal(v1.detalhe, 'artefato "a.json" sumiu — pin não verificável (fail-closed)');

    const lancou = new PinsDeRegressao({
      proverDesafio: (async () => ({ valid: true, executed: 0, failures: [] })) as unknown as ProverDeDesafio,
      obterArquivo: async () => {
        throw new Error('io caiu');
      },
    });
    lancou.adicionarPin(pinDe({ id: 'pin-io', afericao: { tipo: 'ast', trecho: 'const abc' } }));
    const [v2] = await lancou.todosRodam();
    assert.equal(v2.verde, false);
    assert.equal(v2.detalhe, 'pin de AST não pôde ser aferido: io caiu (fail-closed)');
  });

  it('pin de execução: verdeQuando decide a cor; falha de execução é fail-closed com a mensagem', async () => {
    const validas = new PinsDeRegressao({
      proverDesafio: (async () => ({ valid: true, executed: 3, failures: [] })) as unknown as ProverDeDesafio,
      obterArquivo: async () => '{}',
    });
    validas.adicionarPin(
      pinDe({
        id: 'pin-exec-ok',
        afericao: { tipo: 'execucao', verdeQuando: 'provas_validas', construirEntrada: async () => ({}) as never },
      }),
    );
    let [v] = await validas.todosRodam();
    assert.equal(v.verde, true);
    assert.equal(v.detalhe, 'provas válidas (3 testes)');

    const invalidas = new PinsDeRegressao({
      proverDesafio: (async () => ({
        valid: false,
        executed: 1,
        failures: [{ proof: 'solutionPasses', reason: 'gabarito quebra' }],
      })) as unknown as ProverDeDesafio,
      obterArquivo: async () => '{}',
    });
    invalidas.adicionarPin(
      pinDe({
        id: 'pin-exec-falhou',
        afericao: { tipo: 'execucao', verdeQuando: 'provas_validas', construirEntrada: async () => ({}) as never },
      }),
    );
    [v] = await invalidas.todosRodam();
    assert.equal(v.verde, false);
    assert.equal(v.detalhe, 'provas inválidas: gabarito quebra');

    const esperandoFalha = new PinsDeRegressao({
      proverDesafio: (async () => ({
        valid: false,
        executed: 1,
        failures: [{ proof: 'starterFails', reason: 'starter passa' }],
      })) as unknown as ProverDeDesafio,
      obterArquivo: async () => '{}',
    });
    esperandoFalha.adicionarPin(
      pinDe({
        id: 'pin-exec-invertido',
        afericao: { tipo: 'execucao', verdeQuando: 'provas_invalidas', construirEntrada: async () => ({}) as never },
      }),
    );
    [v] = await esperandoFalha.todosRodam();
    assert.equal(v.verde, true, 'provas_invalidas é o estado que verdeia este pin');
    assert.equal(v.detalhe, 'provas inválidas: starter passa');

    const quebrou = new PinsDeRegressao({
      proverDesafio: (async () => ({ valid: true, executed: 0, failures: [] })) as unknown as ProverDeDesafio,
      obterArquivo: async () => '{}',
    });
    quebrou.adicionarPin(
      pinDe({
        id: 'pin-exec-lancou',
        afericao: {
          tipo: 'execucao',
          verdeQuando: 'provas_validas',
          construirEntrada: async () => {
            throw new Error('artefato sumiu durante o pin de execução');
          },
        },
      }),
    );
    [v] = await quebrou.todosRodam();
    assert.equal(v.verde, false);
    assert.equal(
      v.detalhe,
      'pin de execução não pôde rodar: artefato sumiu durante o pin de execução (fail-closed)',
    );
  });
});

// ─── extrairProvasDoArtefato — os quatro campos e os bordas numéricos ────────

describe('cx-gap/l05/prover: extrairProvasDoArtefato — só desafio executável vira provas', () => {
  const cheio = {
    solutionCode: 's',
    starterCode: 'k',
    testsCode: 't',
    expectedTestCount: 2,
  };

  it('JSON íntegro com os quatro campos devolve as provas; qualquer lacuna devolve null', () => {
    assert.deepEqual(extrairProvasDoArtefato(JSON.stringify(cheio)), cheio);
    assert.equal(extrairProvasDoArtefato(JSON.stringify({ ...cheio, testsCode: undefined })), null);
    assert.equal(extrairProvasDoArtefato(JSON.stringify({ ...cheio, solutionCode: 7 })), null);
    assert.equal(extrairProvasDoArtefato('não é json'), null);
    assert.equal(extrairProvasDoArtefato('null'), null);
    assert.equal(extrairProvasDoArtefato('42'), null);
  });

  it('expectedTestCount tem de ser inteiro ≥ 1 — 0, fracionário ou string devolvem null', () => {
    assert.equal(extrairProvasDoArtefato(JSON.stringify({ ...cheio, expectedTestCount: 0 })), null);
    assert.equal(extrairProvasDoArtefato(JSON.stringify({ ...cheio, expectedTestCount: 1.5 })), null);
    assert.equal(extrairProvasDoArtefato(JSON.stringify({ ...cheio, expectedTestCount: '2' })), null);
    assert.equal(extrairProvasDoArtefato(JSON.stringify({ ...cheio, expectedTestCount: -1 })), null);
  });
});
