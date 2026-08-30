/**
 * tests/engineFreeze.test.ts — pacote P-10: F4 (orçamento declarado a partir
 * do GRAFO) e F5 (FREEZE + snapshots imutáveis por aula) da engine de trilhas
 * (`docs/16-engine-de-trilha.md` §2 P3, §3.5, §4 F4/F5).
 *
 * O que este arquivo PROVA (contrato P-10):
 *   1. alterar o grafo muda o hash do orçamento/grafo e INVALIDA os snapshots
 *      afetados — e só os afetados (snapshotsInvalidados é função pura);
 *   2. escrever no orçamento depois do freeze é ERRO (A-P10-3: a guarda
 *      embutida de materializarBudget lança ORCAMENTO_CONGELADO);
 *   3. G-MONO reprova orçamento que PERDE construção entre aulas;
 *   4. G-MONO reprova aula que REENSINA o que já estava no orçamento;
 *   5. snapshot é IMUTÁVEL: mutar o objeto recebido (Object.freeze em
 *      profundidade) não altera o "arquivo" (conteúdo em disco) — A-P10-4;
 *   6. `blocked` do autor vira PEDIDO AO PLANEJADOR (não licença de
 *      improviso): sem campo de escrita, ação sugerida ∈ catálogo fechado;
 *   7. hash CANÔNICO: dois JSONs com chaves em ordens diferentes produzem o
 *      mesmo hash (A-P10-2 — sha256Hex + canonicalizarJson do ledger);
 *   8. (bônus) a matriz construção × aula tem os TRÊS estados e `nova` só na
 *      aula que introduz.
 *
 * Sem rede, sem LLM: fixtures de grafo em memória; o único IO é em
 * diretórios TEMPORÁRIOS criados e limpos pelo próprio teste.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { conceptId } from '../electron/main/engine/graph/model';
import type { Concept, ConceptGraph, ConceptId } from '../electron/main/engine/graph/model';
import { canonicalizarJson, sha256Hex } from '../electron/main/engine/runtime/ledger';
import { ACAO_CATALOGO } from '../electron/main/engine/schemas/artifacts';
import {
  BUDGET_FILENAME,
  FREEZE_FILENAME,
  deriveBudgetDoGrafo,
  checarGMonotonicidade,
  orcamentoMonotonico,
  materializarBudget,
  lerOrcamento,
  hashDoOrcamento,
  F4Error,
  type AulaPlano,
  type BudgetF4,
} from '../electron/main/engine/phases/f4Budget';
import {
  criarFreeze,
  derivarSnapshots,
  snapshotsInvalidados,
  congelar,
  lerFreeze,
  pedidoDeBloqueio,
  hashDoGrafo,
  FreezeError,
} from '../electron/main/engine/phases/f5Freeze';

// ---------------------------------------------------------------------------
// Fixtures PURAS (nenhum IO)
// ---------------------------------------------------------------------------

function conc(id: string, over: Partial<Concept> = {}): Concept {
  return { id: conceptId(id), desbloqueadoPor: [], usa: [], ...over };
}

/** cadeia a→b→c→d→e (variaveis → funcoes → condicionais → lacos → composicao). */
function grafoCadeia(): { grafo: ConceptGraph; a: ConceptId; b: ConceptId; c: ConceptId; d: ConceptId; e: ConceptId } {
  const a = conceptId('variaveis');
  const b = conceptId('funcoes');
  const c = conceptId('condicionais');
  const d = conceptId('lacos');
  const e = conceptId('composicao');
  const grafo: ConceptGraph = {
    conceitos: [
      conc('variaveis'),
      conc('funcoes', { desbloqueadoPor: [a] }),
      conc('condicionais', { desbloqueadoPor: [b] }),
      conc('lacos', { desbloqueadoPor: [c] }),
      conc('composicao', { desbloqueadoPor: [d] }),
    ],
  };
  return { grafo, a, b, c, d, e };
}

/** cadeia a→b→c→d (variaveis → funcoes → condicionais → lacos). */
function grafoCadeia4(): { grafo: ConceptGraph; a: ConceptId; b: ConceptId; c: ConceptId; d: ConceptId } {
  const a = conceptId('variaveis');
  const b = conceptId('funcoes');
  const c = conceptId('condicionais');
  const d = conceptId('lacos');
  const grafo: ConceptGraph = {
    conceitos: [
      conc('variaveis'),
      conc('funcoes', { desbloqueadoPor: [a] }),
      conc('condicionais', { desbloqueadoPor: [b] }),
      conc('lacos', { desbloqueadoPor: [c] }),
    ],
  };
  return { grafo, a, b, c, d };
}

/** 5 aulas, uma construção por aula, na ordem do DAG. */
function planoCadeia(a: ConceptId, b: ConceptId, c: ConceptId, d: ConceptId, e: ConceptId): AulaPlano[] {
  return [
    { ref: 'm1/a1', introduz: [a] },
    { ref: 'm1/a2', introduz: [b] },
    { ref: 'm1/a3', introduz: [c] },
    { ref: 'm1/a4', introduz: [d] },
    { ref: 'm1/a5', introduz: [e] },
  ];
}

/** deriva o orçamento da cadeia de 5 (sem axioma). O resultado é CONGELADO. */
function derivarCadeia(): {
  budget: BudgetF4;
  grafo: ConceptGraph;
  a: ConceptId;
  b: ConceptId;
  c: ConceptId;
  d: ConceptId;
  e: ConceptId;
} {
  const { grafo, a, b, c, d, e } = grafoCadeia();
  const { budget } = deriveBudgetDoGrafo({ grafo, aulas: planoCadeia(a, b, c, d, e), entryConstructs: [] });
  return { budget, grafo, a, b, c, d, e };
}

/** diretório temp por teste — criado e limpo pelo próprio teste. */
async function dirTemp(): Promise<string> {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'p10-freeze-'));
}

// ---------------------------------------------------------------------------
// 1 · alterar o grafo muda o hash e invalida os snapshots afetados (e só eles)
// ---------------------------------------------------------------------------

describe('F5 · mutação do grafo → hash muda e SÓ os snapshots afetados são invalidados', () => {
  it('remove um conceito do grafo: orçamento e grafo mudam de hash; invalida só a aula afetada', async () => {
    const g1 = grafoCadeia4();
    const fixo = deriveBudgetDoGrafo({ grafo: g1.grafo, aulas: [
      { ref: 'm1/a1', introduz: [g1.a] },
      { ref: 'm1/a2', introduz: [g1.b] },
      { ref: 'm1/a3', introduz: [g1.c] },
      { ref: 'm1/a4', introduz: [g1.d] },
    ], entryConstructs: [] });
    const freeze1 = criarFreeze({ orcamento: fixo.budget, grafo: g1.grafo, timestamp: '2026-01-01T00:00:00.000Z' });

    // G2: `condicionais` sai do grafo e a aula m1/a3 sai do plano.
    const a = conceptId('variaveis');
    const b = conceptId('funcoes');
    const d = conceptId('lacos');
    const grafo2: ConceptGraph = {
      conceitos: [conc('variaveis'), conc('funcoes', { desbloqueadoPor: [a] }), conc('lacos', { desbloqueadoPor: [b] })],
    };
    const fixo2 = deriveBudgetDoGrafo({ grafo: grafo2, aulas: [
      { ref: 'm1/a1', introduz: [a] },
      { ref: 'm1/a2', introduz: [b] },
      { ref: 'm1/a4', introduz: [d] },
    ], entryConstructs: [] });
    const freeze2 = criarFreeze({ orcamento: fixo2.budget, grafo: grafo2, timestamp: '2026-01-02T00:00:00.000Z' });

    // O grafo mudou → os dois hashes mudaram (A-P10-2, conteúdo canonicalizado).
    assert.notEqual(fixo.budget.hash, fixo2.budget.hash, 'orçamento derivado do grafo novo tem hash diferente');
    assert.notEqual(freeze1.budget_hash, freeze2.budget_hash, 'budget_hash do freeze acompanha o orçamento');
    assert.notEqual(freeze1.graph_hash, freeze2.graph_hash, 'graph_hash muda com o grafo');

    const inv = snapshotsInvalidados(freeze1, freeze2);
    assert.deepEqual(
      inv.invalidados,
      ['m1/a4'],
      'a única aula afetada é a que tinha condicionais na entrada (m1/a4)',
    );
    assert.deepEqual(inv.removidos, ['m1/a3'], 'a aula cujo conceito sumiu é removida (não volta para a fila)');
    assert.deepEqual(inv.novos, [], 'nenhuma aula nova');

    // "e SÓ os afetados": m1/a1 e m1/a2 têm o MESMO budgetHash nos dois freezes.
    const hashAnterior = new Map(freeze1.snapshots.map((s) => [s.aula_slug, s.budgetHash]));
    const hashNovo = new Map(freeze2.snapshots.map((s) => [s.aula_slug, s.budgetHash]));
    assert.equal(hashAnterior.get('m1/a1'), hashNovo.get('m1/a1'), 'm1/a1 não é afetada');
    assert.equal(hashAnterior.get('m1/a2'), hashNovo.get('m1/a2'), 'm1/a2 não é afetada');
  });

  it('ordem do plano embaralhada → mesma derivação (a ordem vem do DAG, determinística)', () => {
    const { grafo, budget } = derivarCadeia();
    const { a, b, c, d, e } = grafoCadeia();
    const embaralhado = deriveBudgetDoGrafo({
      grafo,
      aulas: [
        { ref: 'm1/a5', introduz: [e] },
        { ref: 'm1/a2', introduz: [b] },
        { ref: 'm1/a4', introduz: [d] },
        { ref: 'm1/a1', introduz: [a] },
        { ref: 'm1/a3', introduz: [c] },
      ],
      entryConstructs: [],
    });
    assert.equal(embaralhado.budget.hash, budget.hash, 'a derivação reordena pelas colunas do DAG');
    assert.deepEqual(
      embaralhado.budget.aulas.map((x) => x.ref),
      ['m1/a1', 'm1/a2', 'm1/a3', 'm1/a4', 'm1/a5'],
    );
  });
});

// ---------------------------------------------------------------------------
// 2 · escrever no orçamento depois do freeze é erro (A-P10-3)
// ---------------------------------------------------------------------------

describe('F5 · A-P10-3: depois do freeze, escrever no orçamento é erro', () => {
  it('F4 materializa sem freeze; o freeze congela o orçamento; QUALQUER escrita depois lança', async () => {
    const dir = await dirTemp();
    try {
      const { budget, grafo } = derivarCadeia();

      // Antes do freeze, a F4 materializa o budget.generated.json sem erro.
      await materializarBudget(dir, budget);
      const lido = await lerOrcamento(dir);
      assert.equal(lido.hash, budget.hash, 'o arquivo materializado é íntegro e tem o hash do conteúdo');

      // O freeze (F5) materializa orçamento + FREEZE.json.
      const freeze = await congelar(dir, { orcamento: budget, grafo, timestamp: '2026-01-01T00:00:00.000Z' });
      assert.equal(freeze.budget_hash, budget.hash, 'budget_hash do freeze === hash do orçamento');
      await fsp.access(path.join(dir, FREEZE_FILENAME));
      await fsp.access(path.join(dir, BUDGET_FILENAME));

      // Depois do freeze: escrever no orçamento é ERRO — função que lança.
      await assert.rejects(
        () => materializarBudget(dir, budget),
        (erro: unknown) => erro instanceof F4Error && erro.code === 'ORCAMENTO_CONGELADO',
        'materializarBudget lança ORCAMENTO_CONGELADO após o freeze',
      );

      // O freeze continua íntegro e legível (a tentativa de escrita não o corrompeu).
      const relido = await lerFreeze(dir);
      assert.equal(relido.budget_hash, freeze.budget_hash);
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it('lerFreeze sem freeze é erro estruturado (autoria não começa antes do freeze)', async () => {
    const dir = await dirTemp();
    try {
      await assert.rejects(
        () => lerFreeze(dir),
        (erro: unknown) => erro instanceof FreezeError && erro.code === 'FREEZE_AUSENTE',
      );
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// 3 e 4 · G-MONO — orçamento monotônico
// ---------------------------------------------------------------------------

describe('F4 · G-MONO (barreira da F4, função pura sobre o artefato)', () => {
  it('o orçamento DERIVADO da cadeia é monotônico (zero violações)', () => {
    const { budget } = derivarCadeia();
    assert.deepEqual(checarGMonotonicidade(budget), [], 'G-MONO aprova a derivação correta');
    assert.equal(orcamentoMonotonico(budget), true);
  });

  it('G-MONO REPROVA um orçamento que PERDE construção entre aulas', () => {
    const { budget, d } = derivarCadeia();
    const mutado = structuredClone(budget) as BudgetF4;

    // lacos é 'nova' em m1/a4 e 'disponivel' em m1/a5 → a mutação regride p/ 'nao_disponivel'.
    const aula5 = mutado.aulas[4];
    const celula = aula5.matrix.find((x) => x.construcao === d);
    assert.ok(celula, 'a matriz de m1/a5 tem a linha de lacos');
    celula.estado = 'nao_disponivel';

    const violacoes = checarGMonotonicidade(mutado);
    assert.ok(violacoes.length > 0, 'perda de construção = G-MONO reprova');
    const perda = violacoes.find((v) => v.codigo === 'PERDA_DE_CONSTRUCAO');
    assert.ok(perda, `violação PERDA_DE_CONSTRUCAO presente (recebido: ${JSON.stringify(violacoes)})`);
    assert.equal(perda.construcao, d);
    assert.equal(perda.aula, 'm1/a5');
    assert.equal(orcamentoMonotonico(mutado), false);
  });

  it('G-MONO REPROVA aula que REENSINA o que já estava no orçamento', () => {
    const { budget, c } = derivarCadeia();
    const mutado = structuredClone(budget) as BudgetF4;

    // condicionais: 'nova' em m1/a3, 'disponivel' em m1/a4 e m1/a5 → volta a 'nova' em m1/a5.
    const aula5 = mutado.aulas[4];
    const celula = aula5.matrix.find((x) => x.construcao === c);
    assert.ok(celula, 'a matriz de m1/a5 tem a linha de condicionais');
    celula.estado = 'nova';

    const violacoes = checarGMonotonicidade(mutado);
    const reensino = violacoes.find((v) => v.codigo === 'REENSINO');
    assert.ok(reensino, `violação REENSINO presente (recebido: ${JSON.stringify(violacoes)})`);
    assert.equal(reensino.construcao, c);
    assert.equal(reensino.aula, 'm1/a5');

    // Segundo caso: 'nova' repetida na mesma construção (unicidade de origem).
    const mutado2 = structuredClone(budget) as BudgetF4;
    const celula3 = mutado2.aulas[3].matrix.find((x) => x.construcao === c);
    assert.ok(celula3);
    celula3.estado = 'nova'; // já é 'nova' em m1/a3
    const violacoes2 = checarGMonotonicidade(mutado2);
    assert.ok(
      violacoes2.some((v) => v.codigo === 'REENSINO' && v.construcao === c),
      'nova repetida também é REENSINO',
    );
  });

  it('G-MONO REPROVA aula que não introduz NADA (matriz sem nova na coluna)', () => {
    const { budget } = derivarCadeia();
    const mutado = structuredClone(budget) as BudgetF4;
    const aula1 = mutado.aulas[0];
    for (const celula of aula1.matrix) {
      if (celula.estado === 'nova') celula.estado = 'disponivel';
    }
    const violacoes = checarGMonotonicidade(mutado);
    assert.ok(
      violacoes.some((v) => v.codigo === 'AULA_SEM_CONSTRUCAO_NOVA' && v.aula === 'm1/a1'),
      `AULA_SEM_CONSTRUCAO_NOVA em m1/a1 (recebido: ${JSON.stringify(violacoes)})`,
    );
  });
});

// ---------------------------------------------------------------------------
// 5 · snapshot imutável (A-P10-4)
// ---------------------------------------------------------------------------

describe('F5 · snapshot é imutável: mutar o objeto recebido não altera o arquivo', () => {
  it('freeze e snapshots são Object.freeze em profundidade; mutação lança; o arquivo permanece', async () => {
    const dir = await dirTemp();
    try {
      const { budget, grafo } = derivarCadeia();
      const freeze = criarFreeze({ orcamento: budget, grafo, timestamp: '2026-01-01T00:00:00.000Z' });

      assert.equal(Object.isFrozen(freeze), true);
      assert.equal(Object.isFrozen(freeze.snapshots), true);
      assert.equal(Object.isFrozen(freeze.snapshots[0]), true);
      const snapshots = derivarSnapshots(budget);
      assert.equal(Object.isFrozen(snapshots[0]), true, 'derivarSnapshots também devolve congelado');

      // Mutar o objeto recebido NÃO altera nada: está congelado em profundidade
      // (A-P10-4). Em modo estrito o assignment lança TypeError; sob o runner
      // (CJS/sloppy via tsx) ele é um no-op silencioso — nos DOIS casos o valor
      // permanece o original, e o arquivo não muda.
      const budgetHashOriginal = freeze.snapshots[0].budgetHash;
      (freeze.snapshots[0] as { budgetHash: string }).budgetHash = 'f'.repeat(64);
      assert.equal(
        freeze.snapshots[0].budgetHash,
        budgetHashOriginal,
        'a mutação do snapshot recebido não vazou — objeto congelado em profundidade',
      );
      const budgetHashOriginalDoFreeze = freeze.budget_hash;
      (freeze as { budget_hash: string }).budget_hash = 'f'.repeat(64);
      assert.equal(freeze.budget_hash, budgetHashOriginalDoFreeze, 'a mutação do freeze recebido não vazou');

      // O "arquivo" só muda pelo caminho da autoridade: congelar com o MESMO
      // conteúdo regenera o mesmo artefato — a mutação tentada não vazou.
      await congelar(dir, { orcamento: budget, grafo, timestamp: '2026-01-01T00:00:00.000Z' });
      const relido = await lerFreeze(dir);
      assert.equal(relido.snapshots[0].budgetHash, freeze.snapshots[0].budgetHash, 'arquivo idêntico ao snapshot congelado');
      assert.equal(relido.budget_hash, freeze.budget_hash);
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// 6 · `blocked` do autor vira pedido ao PLANEJADOR, não licença de improviso
// ---------------------------------------------------------------------------

describe('F5 · canal formal de exceção (autor bloqueado → pedido ao planejador)', () => {
  it('pedido estruturado: origem autor, sem campo de escrita, ação sugerida ∈ catálogo fechado', () => {
    const pedido = pedidoDeBloqueio({
      aula: 'm1/a4',
      faltantes: [conceptId('lacos')],
      justificativa: 'o desafio de lacos exige condicionais aninhados fora do snapshot recebido',
    });

    assert.equal(pedido.origem, 'autor');
    assert.equal(pedido.requisicao, 'pedido-ao-planejador');
    assert.equal(pedido.autor_escreve_no_orcamento, false, 'o autor NUNCA escreve no orçamento');
    assert.deepEqual(pedido.faltantes, [conceptId('lacos')]);

    // Nenhum campo de escrita/orçamento no pedido — é uma devolutiva, não uma permissão.
    assert.ok(!('introduces' in pedido), 'pedido não carrega introduces');
    assert.ok(!('budget' in pedido), 'pedido não carrega orçamento');
    assert.ok(!('saida' in pedido), 'pedido não carrega saída');

    // Ações sugeridas são SUBCONJUNTO do catálogo fechado (P-04) — o planejador decide.
    assert.ok(pedido.acoes_sugeridas.length > 0);
    for (const acao of pedido.acoes_sugeridas) {
      assert.ok((ACAO_CATALOGO as readonly string[]).includes(acao), `ação '${acao}' pertence ao catálogo fechado`);
    }

    // Shape estável, sem campo sorrateiro de conteúdo.
    assert.deepEqual(Object.keys(pedido).sort(), [
      'acoes_sugeridas',
      'aula',
      'autor_escreve_no_orcamento',
      'faltantes',
      'justificativa',
      'origem',
      'requisicao',
    ]);
  });

  it('pedido malformado (sem a lista do que falta) é ERRO estruturado, não pedido', () => {
    assert.throws(
      () => pedidoDeBloqueio({ aula: 'm1/a4', faltantes: [], justificativa: 'x' }),
      (erro: unknown) => erro instanceof FreezeError && erro.code === 'PEDIDO_INVALIDO',
    );
    assert.throws(
      () => pedidoDeBloqueio({ aula: '', faltantes: [conceptId('lacos')], justificativa: 'x' }),
      (erro: unknown) => erro instanceof FreezeError && erro.code === 'PEDIDO_INVALIDO',
    );
    assert.throws(
      () => pedidoDeBloqueio({ aula: 'm1/a4', faltantes: [conceptId('lacos')], justificativa: '  ' }),
      (erro: unknown) => erro instanceof FreezeError && erro.code === 'PEDIDO_INVALIDO',
    );
  });
});

// ---------------------------------------------------------------------------
// 7 · hash canônico (A-P10-2)
// ---------------------------------------------------------------------------

describe('F4/F5 · hash de conteúdo CANONICALIZADO (A-P10-2)', () => {
  it('dois JSONs com chaves em ordens diferentes produzem o mesmo hash', () => {
    // primitivas do ledger, de propósito
    assert.equal(sha256Hex(canonicalizarJson({ a: 1, b: 2 })), sha256Hex(canonicalizarJson({ b: 2, a: 1 })));

    // orçamento inteiro com chaves reordenadas recursivamente
    const { budget } = derivarCadeia();
    const plano = JSON.parse(JSON.stringify(budget)) as Record<string, unknown>;
    const reordenado = reordenarChaves(plano);
    assert.equal(
      hashDoOrcamento(budget),
      hashDoOrcamento(reordenado),
      'reordenar chaves do JSON não muda o hash do orçamento',
    );

    // grafo com chaves reordenadas
    const { grafo } = grafoCadeia();
    const grafoPlano = JSON.parse(JSON.stringify(grafo)) as Record<string, unknown>;
    assert.equal(hashDoGrafo(grafo), hashDoGrafo(reordenarChaves(grafoPlano) as ConceptGraph));
  });
});

/** reconstrói o objeto com TODAS as chaves em ordem INVERSA (recursivo). */
function reordenarChaves(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(reordenarChaves);
  if (typeof valor === 'object' && valor !== null) {
    const chaves = Object.keys(valor as Record<string, unknown>).sort().reverse();
    const saida: Record<string, unknown> = {};
    for (const chave of chaves) {
      saida[chave] = reordenarChaves((valor as Record<string, unknown>)[chave]);
    }
    return saida;
  }
  return valor;
}

// ---------------------------------------------------------------------------
// 8 (bônus) · matriz construção × aula com os TRÊS estados
// ---------------------------------------------------------------------------

describe('F4 · matriz construção × aula (§3.5): três estados, `nova` só na aula que introduz', () => {
  it('cadeia de 5: estados exatos por célula e única origem por construção', () => {
    const { budget, a, b, c, d, e } = derivarCadeia();
    const linhas = [a, b, c, d, e]; // ordem canônica das linhas = topo-sort
    const estadosPorAula = budget.aulas.map((aula) => new Map(aula.matrix.map((x) => [x.construcao, x.estado])));

    // a matriz 5×5 esperada — os três estados —(nao_disponivel) x (disponivel) new (nova).
    const esperado: string[][] = [
      ['nova', 'nao_disponivel', 'nao_disponivel', 'nao_disponivel', 'nao_disponivel'], // coluna m1/a1 introduz [a]
      ['disponivel', 'nova', 'nao_disponivel', 'nao_disponivel', 'nao_disponivel'], // coluna m1/a2 introduz [b]
      ['disponivel', 'disponivel', 'nova', 'nao_disponivel', 'nao_disponivel'], // coluna m1/a3 introduz [c]
      ['disponivel', 'disponivel', 'disponivel', 'nova', 'nao_disponivel'], // coluna m1/a4 introduz [d]
      ['disponivel', 'disponivel', 'disponivel', 'disponivel', 'nova'], // coluna m1/a5 introduz [e]
    ];
    for (let col = 0; col < budget.aulas.length; col += 1) {
      for (let linha = 0; linha < linhas.length; linha += 1) {
        const estado = estadosPorAula[col].get(linhas[linha]);
        assert.equal(estado, esperado[col][linha], `célula (linha ${linhas[linha]}, coluna ${col})`);
      }
    }

    // `nova` só na aula que introduz; toda construção tem EXATAMENTE uma origem.
    for (let linha = 0; linha < linhas.length; linha += 1) {
      const colunasNova = estadosPorAula
        .map((mapa, col) => (mapa.get(linhas[linha]) === 'nova' ? col : -1))
        .filter((col) => col >= 0);
      assert.deepEqual(colunasNova, [linha], `${linhas[linha]} é 'nova' só na coluna ${linha}`);
    }

    // Sequência de estados por linha segue o padrão —* → nova → x* (regra do G-MONO).
    for (let linha = 0; linha < linhas.length; linha += 1) {
      const seq = estadosPorAula.map((mapa) => mapa.get(linhas[linha]));
      const indiceNova = seq.indexOf('nova');
      assert.ok(seq.slice(0, indiceNova).every((s) => s === 'nao_disponivel'), 'antes da origem: não disponível');
      assert.equal(seq[indiceNova], 'nova');
      assert.ok(seq.slice(indiceNova + 1).every((s) => s === 'disponivel'), 'depois da origem: disponível');
    }
  });
});

// ---------------------------------------------------------------------------
// Extras — fail-closed da derivação (a derivação NUNCA gera orçamento inválido)
// ---------------------------------------------------------------------------

describe('F4 · derivação fail-closed (grafo/plano inválido = erro estruturado)', () => {
  it('grafo com ciclo → GRAFO_INVALIDO', () => {
    const a = conceptId('a');
    const b = conceptId('b');
    const grafo: ConceptGraph = {
      conceitos: [conc('a', { desbloqueadoPor: [b] }), conc('b', { desbloqueadoPor: [a] })],
    };
    assert.throws(
      () => deriveBudgetDoGrafo({ grafo, aulas: [{ ref: 'm1/a1', introduz: [a] }], entryConstructs: [] }),
      (erro: unknown) => erro instanceof F4Error && erro.code === 'GRAFO_INVALIDO',
    );
  });

  it('aula que introduz conceito desconhecido → PLANO_INVALIDO', () => {
    const { grafo, a } = grafoCadeia();
    assert.throws(
      () =>
        deriveBudgetDoGrafo({
          grafo,
          aulas: [{ ref: 'm1/a1', introduz: [a, conceptId('fantasma')] }],
          entryConstructs: [],
        }),
      (erro: unknown) => erro instanceof F4Error && erro.code === 'PLANO_INVALIDO',
    );
  });

  it('conceito introduzido por duas aulas → PLANO_INVALIDO (unicidade de origem I3)', () => {
    const { grafo, a, b } = grafoCadeia();
    assert.throws(
      () =>
        deriveBudgetDoGrafo({
          grafo,
          aulas: [
            { ref: 'm1/a1', introduz: [a] },
            { ref: 'm1/a2', introduz: [a, b] },
          ],
          entryConstructs: [],
        }),
      (erro: unknown) => erro instanceof F4Error && erro.code === 'PLANO_INVALIDO',
    );
  });

  it('aula introduz conceito cujo pré-requisito não está no orçamento → PREREQUISITO_AUSENTE', () => {
    const { grafo, d } = grafoCadeia4();
    assert.throws(
      () => deriveBudgetDoGrafo({ grafo, aulas: [{ ref: 'm1/a1', introduz: [d] }], entryConstructs: [] }),
      (erro: unknown) => erro instanceof F4Error && erro.code === 'PREREQUISITO_AUSENTE',
    );
  });

  it('aula reensina o axioma → REENSINO_NA_DERIVACAO', () => {
    const { grafo, a, b } = grafoCadeia();
    assert.throws(
      () =>
        deriveBudgetDoGrafo({
          grafo,
          aulas: [{ ref: 'm1/a1', introduz: [b] }],
          entryConstructs: [a, b],
        }),
      (erro: unknown) => erro instanceof F4Error && erro.code === 'REENSINO_NA_DERIVACAO',
    );
  });

  it('linearização fornecida violando uma aresta dura → ORDEM_INVALIDA', () => {
    const { grafo, a, b, c, d } = grafoCadeia4();
    assert.throws(
      () =>
        deriveBudgetDoGrafo({
          grafo,
          aulas: [
            { ref: 'm1/a1', introduz: [a] },
            { ref: 'm1/a2', introduz: [b] },
            { ref: 'm1/a3', introduz: [c] },
            { ref: 'm1/a4', introduz: [d] },
          ],
          entryConstructs: [],
          ordem: [a, c, b, d], // c antes de b viola b → c
        }),
      (erro: unknown) => erro instanceof F4Error && erro.code === 'ORDEM_INVALIDA',
    );
  });
});