/**
 * tests/engineFreeze.test.ts — pacote P-10: F4 (orçamento declarado a partir
 * do GRAFO) e F5 (FREEZE + snapshots imutáveis por aula) da engine de trilhas
 * (`docs/16-engine-de-trilha.md` §2 P3, §3.5, §4 F4/F5).
 *
 * O que este arquivo PROVA (contrato P-10, ondas 1 e 2):
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
 *      aula que introduz;
 *   -- onda 2 (fixes da revisão) --
 *   9. HIGH-1: FREEZE.json obedece o FreezeSchema do P-04 (nomes do schema:
 *      hash_orcamento/hash_grafo/carimbo/dossies/snapshots) e o safeParse
 *      passa no artefato em memória E no arquivo gravado;
 *  10. HIGH-2: G-MONO confere o axioma nas DUAS faixas da aula 0 (receptiva
 *      inclusa) e reprova conceito do axioma marcado 'nova' na coluna 0;
 *  11. W-1: conceito semeado SÓ receptivamente (seedsReceptivos) pode ser
 *      introduzido produtivamente depois ('lê antes de escrever') — a
 *      derivação não lança REENSINO_NA_DERIVACAO e a matriz registra 'nova';
 *      G-MONO idem (a faixa receptiva prévia não impede 'nova' produtiva);
 *  12. W-2: lerFreeze REVERIFICA o conteúdo (não só o shape) — hash de
 *      snapshot ou hash_orcamento adulterados → ARTEFATO_CORROMPIDO;
 *  13. W-3: ordem fornecida (F3) → critério gravado 'fornecido' (honesto);
 *      a topo-sort só é re-derivada para reportar órfãos;
 *  14. W-4: validarPlano fail-closed — entryConstructs fora do grafo (erro
 *      NOMEANDO o id) e conceito do grafo sem aula de origem (erro com a
 *      lista de órfãos; não linha muda);
 *  15. W-5: congelar re-executado NUNCA sobrescreve em silêncio — idempotente
 *      quando o conteúdo bate; divergente sem flag = FREEZE_EXISTENTE_DIVERGENTE;
 *      com flag, arquiva FREEZE.previous.json antes de substituir.
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
import { ACAO_CATALOGO, FreezeSchema } from '../electron/main/engine/schemas/artifacts';
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
  validarFreeze,
  FREEZE_ANTERIOR_FILENAME,
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

/** lê o FREEZE.json como objeto (para adulterar nos testes do W-2/W-5). */
async function lerFreezeCru(dir: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fsp.readFile(path.join(dir, FREEZE_FILENAME), 'utf8')) as Record<string, unknown>;
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
    assert.notEqual(freeze1.hash_orcamento, freeze2.hash_orcamento, 'hash_orcamento do freeze acompanha o orçamento');
    assert.notEqual(freeze1.hash_grafo, freeze2.hash_grafo, 'hash_grafo muda com o grafo');

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
      assert.equal(freeze.hash_orcamento, budget.hash, 'hash_orcamento do freeze === hash do orçamento');
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
      assert.equal(relido.hash_orcamento, freeze.hash_orcamento);
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

  it('G-MONO REPROVA aula que REENSINA o que já estava no orçamento produtivo', () => {
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
// 9 · HIGH-1 — o artefato FREEZE obedece o FreezeSchema do P-04
// ---------------------------------------------------------------------------

describe('F5 · HIGH-1: FREEZE.json usa o FreezeSchema do P-04 (nomes + safeParse)', () => {
  it('o artefato em memória usa os NOMES do schema e o safeParse passa', () => {
    const { budget, grafo } = derivarCadeia();
    const freeze = criarFreeze({ orcamento: budget, grafo, timestamp: '2026-01-01T00:00:00.000Z' });

    const prova = FreezeSchema.safeParse(freeze);
    assert.equal(prova.success, true, `o freeze DEVE passar no FreezeSchema (P-04)`);
    if (!prova.success) return;

    // Os NOMES são os do schema — nada de shape próprio do P-10.
    assert.deepEqual(
      Object.keys(freeze).sort(),
      ['carimbo', 'dossies', 'hash_grafo', 'hash_orcamento', 'snapshots'],
      'os campos do freeze são exatamente os do FreezeSchema',
    );
    assert.equal(freeze.hash_orcamento, budget.hash, 'hash_orcamento = hash do orçamento canonicalizado');
    assert.equal(prova.data.hash_orcamento, budget.hash, 'o parse do schema preserva o hash_orcamento');
    assert.equal(freeze.carimbo, '2026-01-01T00:00:00.000Z', 'carimbo = timestamp ISO do freeze');
    assert.equal(prova.data.carimbo, '2026-01-01T00:00:00.000Z');
    assert.deepEqual(freeze.dossies, [], 'dossies vazio na F5 (dossiês derivados por aula na autoria F7)');
    assert.equal(freeze.snapshots.length, budget.aulas.length, 'um snapshot por aula');
    for (const s of freeze.snapshots) {
      // trio do SnapshotSchema presente em cada snapshot + campo aditivo P-10.
      assert.equal(typeof s.aula_slug, 'string');
      assert.equal(typeof s.caminho, 'string');
      assert.match(s.hash, /^[0-9a-f]{64}$/);
      assert.match(s.budgetHash, /^[0-9a-f]{64}$/);
    }
  });

  it('o FREEZE.json GRAVADO em disco também passa no schema (parse do arquivo real)', async () => {
    const dir = await dirTemp();
    try {
      const { budget, grafo } = derivarCadeia();
      await congelar(dir, { orcamento: budget, grafo, timestamp: '2026-01-01T00:00:00.000Z' });
      const cru = JSON.parse(await fsp.readFile(path.join(dir, FREEZE_FILENAME), 'utf8')) as unknown;
      assert.equal(FreezeSchema.safeParse(cru).success, true, 'o arquivo em disco passa no FreezeSchema');
      // e o lerFreeze valida e reverifica o conteúdo (W-2) sem erro.
      const lido = await lerFreeze(dir);
      assert.equal(lido.hash_orcamento, budget.hash);
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it('o shape antigo do P-10 (budget_version/budget_hash/graph_hash/timestamp) é REJEITADO', () => {
    const { budget, grafo } = derivarCadeia();
    const freeze = criarFreeze({ orcamento: budget, grafo, timestamp: '2026-01-01T00:00:00.000Z' });
    const comNomesAntigos = {
      budget_version: '1',
      budget_hash: freeze.hash_orcamento,
      graph_hash: freeze.hash_grafo,
      timestamp: freeze.carimbo,
      snapshots: freeze.snapshots,
    };
    assert.equal(
      FreezeSchema.safeParse(comNomesAntigos).success,
      false,
      'nome antigo não existe no FreezeSchema (HIGH-1: o contrato quebrado volta a quebrar)',
    );
    assert.throws(
      () => validarFreeze(comNomesAntigos),
      (erro: unknown) => erro instanceof FreezeError && erro.code === 'FREEZE_INVALIDO',
    );
  });
});

// ---------------------------------------------------------------------------
// 10 · HIGH-2 — G-MONO: axioma nas duas faixas da aula 0 + 'nova' no axioma
// ---------------------------------------------------------------------------

describe('F4 · HIGH-2: G-MONO fecha o axioma nas DUAS faixas da aula 0', () => {
  /** orçamento com axioma [a]: aulas introduzem b..e (a nunca é reensinado). */
  function derivarComAxioma(): { budget: BudgetF4; a: ConceptId } {
    const { grafo, a, b, c, d, e } = grafoCadeia();
    const { budget } = deriveBudgetDoGrafo({
      grafo,
      aulas: [
        { ref: 'm1/a2', introduz: [b] },
        { ref: 'm1/a3', introduz: [c] },
        { ref: 'm1/a4', introduz: [d] },
        { ref: 'm1/a5', introduz: [e] },
      ],
      entryConstructs: [a],
    });
    return { budget, a };
  }

  it('G-MONO REPROVA o axioma ausente na faixa RECEPTIVA da aula 0 (HIGH-2a)', () => {
    const { budget, a } = derivarComAxioma();
    const mutado = structuredClone(budget) as BudgetF4;

    // 'variaveis' (o axioma) some da entrada receptiva da aula 0 — continua
    // na produtiva, então o check ANTIGO (só produtiva) deixaria passar.
    mutado.aulas[0].budget_entrada.receptive = [];

    const violacoes = checarGMonotonicidade(mutado);
    const receptiva = violacoes.find(
      (v) => v.codigo === 'ENTRADA_DIVERGENTE_DO_AXIOMA' && /RECEPTIVA/.test(v.mensagem),
    );
    assert.ok(receptiva, `axioma ausente na receptiva = violação (recebido: ${JSON.stringify(violacoes)})`);
    assert.equal(receptiva.aula, mutado.aulas[0].ref);
    assert.ok(receptiva.mensagem.includes(a), 'a mensagem nomeia o conceito do axioma faltante');
    assert.equal(orcamentoMonotonico(mutado), false);
  });

  it('G-MONO REPROVA conceito do axioma (entryConstructs) marcado `nova` na coluna 0 (HIGH-2b)', () => {
    const { budget, a } = derivarComAxioma();
    const mutado = structuredClone(budget) as BudgetF4;

    const celula = mutado.aulas[0].matrix.find((x) => x.construcao === a);
    assert.ok(celula, 'a matriz da coluna 0 tem a linha do axioma');
    celula.estado = 'nova'; // a aula 0 "ensina" o que o aluno já domina ao entrar

    const violacoes = checarGMonotonicidade(mutado);
    const reensino = violacoes.find(
      (v) => v.codigo === 'REENSINO' && v.construcao === a && v.aula === mutado.aulas[0].ref,
    );
    assert.ok(reensino, `axioma marcado \'nova\' na coluna 0 = REENSINO (recebido: ${JSON.stringify(violacoes)})`);
    assert.equal(orcamentoMonotonico(mutado), false);
  });
});

// ---------------------------------------------------------------------------
// 11 · W-1 — 'lê antes de escrever': seed receptiva pode entrar produtivamente
// ---------------------------------------------------------------------------

describe('F4 · W-1: seed SÓ receptiva não é reensino (lê antes de escrever)', () => {
  it('seedsReceptivos:[testes] + aula introduz testes → deriva OK, matriz `nova` na produtiva, G-MONO aprova', () => {
    const a = conceptId('variaveis');
    const t = conceptId('testes');
    const grafo: ConceptGraph = {
      conceitos: [conc('variaveis'), conc('testes', { desbloqueadoPor: [a] })],
    };
    const resultado = deriveBudgetDoGrafo({
      grafo,
      aulas: [
        { ref: 'm1/a1', introduz: [a] },
        { ref: 'm1/a2', introduz: [t] },
      ],
      entryConstructs: [],
      seedsReceptivos: [t],
    });
    const budget = resultado.budget;

    const aula1 = budget.aulas.find((x) => x.ref === 'm1/a1');
    const aula2 = budget.aulas.find((x) => x.ref === 'm1/a2');
    assert.ok(aula1 && aula2);

    // A faixa receptiva prévia NÃO impede: antes da aula 2, 'testes' é SÓ receptivo.
    assert.ok(aula1.budget_saida.receptive.includes(t), 'a seed é receptiva desde a aula 1');
    assert.ok(!aula1.budget_saida.productive.includes(t), 'a seed NÃO é produtiva antes da introdução');
    assert.ok(aula1.budget_saida.productive.includes(a), 'variaveis é produtiva (introduzida na aula 1)');

    // A derivação NÃO lançou REENSINO_NA_DERIVACAO e a matriz registra a
    // disponibilidade produtiva NOVA na coluna da introdução.
    const celula = aula2.matrix.find((x) => x.construcao === t);
    assert.equal(celula?.estado, 'nova', 'a matriz registra \'nova\' na PRODUTIVA');
    assert.ok(aula2.budget_saida.productive.includes(t), 'aula 2 torna testes exigível produtivamente');
    assert.equal(aula2.introduces.productive.includes(t), true, 'introduces.productive lista testes');

    // G-MONO idem: a faixa receptiva prévia ('disponivel' nas colunas 1) não
    // impede o 'nova' produtivo da coluna 2 — não é reensino.
    assert.deepEqual(checarGMonotonicidade(budget), [], 'G-MONO aprova o orçamento com seed receptiva');
    assert.equal(orcamentoMonotonico(budget), true);
  });

  it('a derivação AINDA reprova quando o conceito já é PRODUTIVO (REENSINO_NA_DERIVACAO na faixa produtiva)', () => {
    const a = conceptId('variaveis');
    const t = conceptId('testes');
    const grafo: ConceptGraph = {
      conceitos: [conc('variaveis'), conc('testes', { desbloqueadoPor: [a] })],
    };
    assert.throws(
      () =>
        deriveBudgetDoGrafo({
          grafo,
          aulas: [
            { ref: 'm1/a1', introduz: [a] },
            { ref: 'm1/a2', introduz: [t] },
          ],
          entryConstructs: [t], // testes JÁ é exigível produtivamente no axioma
        }),
      (erro: unknown) => erro instanceof F4Error && erro.code === 'REENSINO_NA_DERIVACAO',
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
      const hashOrcamentoOriginal = freeze.hash_orcamento;
      (freeze as { hash_orcamento: string }).hash_orcamento = 'f'.repeat(64);
      assert.equal(freeze.hash_orcamento, hashOrcamentoOriginal, 'a mutação do freeze recebido não vazou');

      // O "arquivo" só muda pelo caminho da autoridade: congelar com o MESMO
      // conteúdo é NO-OP idempotente (W-5) — a mutação tentada não vazou.
      await congelar(dir, { orcamento: budget, grafo, timestamp: '2026-01-01T00:00:00.000Z' });
      const relido = await lerFreeze(dir);
      assert.equal(relido.snapshots[0].budgetHash, freeze.snapshots[0].budgetHash, 'arquivo idêntico ao snapshot congelado');
      assert.equal(relido.hash_orcamento, freeze.hash_orcamento);
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// 12 · W-2 — lerFreeze reverifica o CONTEÚDO (não só o shape)
// ---------------------------------------------------------------------------

describe('F5 · W-2: lerFreeze reverifica o conteúdo — adulteração = ARTEFATO_CORROMPIDO', () => {
  async function montarFreeze(): Promise<string> {
    const dir = await dirTemp();
    const { budget, grafo } = derivarCadeia();
    await congelar(dir, { orcamento: budget, grafo, timestamp: '2026-01-01T00:00:00.000Z' });
    return dir;
  }

  it('adulterar o hash de um snapshot no arquivo → ARTEFATO_CORROMPIDO', async () => {
    const dir = await montarFreeze();
    try {
      const cru = await lerFreezeCru(dir);
      const snapshots = cru['snapshots'] as Array<{ hash: string }>;
      snapshots[0].hash = 'f'.repeat(64); // hash de FORMATO válido, conteúdo NÃO recomputado
      await fsp.writeFile(path.join(dir, FREEZE_FILENAME), `${JSON.stringify(cru, null, 2)}\n`, 'utf8');

      await assert.rejects(
        () => lerFreeze(dir),
        (erro: unknown) => erro instanceof FreezeError && erro.code === 'ARTEFATO_CORROMPIDO',
      );
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it('adulterar o hash_orcamento no arquivo → ARTEFATO_CORROMPIDO (cross-check com o orçamento em disco)', async () => {
    const dir = await montarFreeze();
    try {
      const cru = await lerFreezeCru(dir);
      cru['hash_orcamento'] = 'c'.repeat(64); // formato válido de sha256, valor trocado
      await fsp.writeFile(path.join(dir, FREEZE_FILENAME), `${JSON.stringify(cru, null, 2)}\n`, 'utf8');

      await assert.rejects(
        () => lerFreeze(dir),
        (erro: unknown) => erro instanceof FreezeError && erro.code === 'ARTEFATO_CORROMPIDO',
      );
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it('um freeze íntegro continua legível (a reverificação não é ruído)', async () => {
    const dir = await montarFreeze();
    try {
      const lido = await lerFreeze(dir);
      assert.equal(lido.snapshots.length, 5);
      assert.match(lido.carimbo, /^2026-01-01/);
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
// 13 · W-3 — ordem fornecida (F3) grava critério 'fornecido'
// ---------------------------------------------------------------------------

describe('F4 · W-3: ordem fornecida → critério GRAVADO é \'fornecido\' (honesto)', () => {
  it('com ordem pronta, o topo registra criterio \'fornecido\' e os órfãos vêm da re-derivação', () => {
    const a = conceptId('a');
    const z = conceptId('z'); // sem arestas — órfão LEGÍTIMO porque está no axioma
    const grafo: ConceptGraph = { conceitos: [conc('a'), conc('z')] };
    const resultado = deriveBudgetDoGrafo({
      grafo,
      aulas: [{ ref: 'm1/a1', introduz: [a] }],
      entryConstructs: [z],
      ordem: [a, z],
    });

    assert.equal(resultado.topo.criterio, 'fornecido', 'a ordem veio pronta — nenhum critério a derivou aqui');
    assert.deepEqual(resultado.topo.ordem, [a, z], 'a linearização usada é a fornecida');
    assert.deepEqual(
      resultado.topo.orfaos,
      [a, z],
      'a topo-sort é re-derivada SÓ para reportar os órfãos do grafo (ambos sem arestas)',
    );
    assert.deepEqual(
      resultado.budget.aulas.map((x) => x.ref),
      ['m1/a1'],
      'a derivação do orçamento continua funcionando com a ordem fornecida',
    );
  });

  it('ordem INEXISTENTE → segue o critério do dag (default lexicográfico, gravado)', () => {
    const { grafo, a, b, c, d } = grafoCadeia4();
    const resultado = deriveBudgetDoGrafo({
      grafo,
      aulas: [
        { ref: 'm1/a1', introduz: [a] },
        { ref: 'm1/a2', introduz: [b] },
        { ref: 'm1/a3', introduz: [c] },
        { ref: 'm1/a4', introduz: [d] },
      ],
      entryConstructs: [],
    });
    assert.equal(resultado.topo.criterio, 'ordem-lexicografica-por-id');
  });
});

// ---------------------------------------------------------------------------
// 14 · W-4 — validarPlano fail-closed: axioma fantasma e órfãos do currículo
// ---------------------------------------------------------------------------

describe('F4 · W-4: validarPlano fecha axioma e órfãos (fail-closed; não linha muda)', () => {
  it('entryConstructs com id fora do grafo → PLANO_INVALIDO NOMEANDO o id', () => {
    const { grafo, a } = grafoCadeia();
    assert.throws(
      () => deriveBudgetDoGrafo({ grafo, aulas: [{ ref: 'm1/a1', introduz: [a] }], entryConstructs: [conceptId('fantasma')] }),
      (erro: unknown) =>
        erro instanceof F4Error && erro.code === 'PLANO_INVALIDO' && erro.message.includes('fantasma'),
    );
  });

  it('seedsReceptivos com id fora do grafo → PLANO_INVALIDO NOMEANDO o id', () => {
    const { grafo, a } = grafoCadeia();
    assert.throws(
      () =>
        deriveBudgetDoGrafo({
          grafo,
          aulas: [{ ref: 'm1/a1', introduz: [a] }],
          entryConstructs: [],
          seedsReceptivos: [conceptId('ectoplasma')],
        }),
      (erro: unknown) =>
        erro instanceof F4Error && erro.code === 'PLANO_INVALIDO' && erro.message.includes('ectoplasma'),
    );
  });

  it('conceito do grafo que nenhuma aula introduz (e fora do axioma) → PLANO_INVALIDO com a lista de órfãos', () => {
    const { grafo, a, c } = grafoCadeia(); // a→b→c→d→e
    assert.throws(
      () =>
        deriveBudgetDoGrafo({
          grafo,
          aulas: [
            { ref: 'm1/a1', introduz: [a] },
            { ref: 'm1/a2', introduz: [c] },
          ],
          entryConstructs: [],
        }),
      (erro: unknown) => {
        if (!(erro instanceof F4Error) || erro.code !== 'PLANO_INVALIDO') return false;
        // funcoes, lacos e composicao não têm aula de origem e não pertencem ao axioma.
        return (
          erro.message.includes('funcoes') && erro.message.includes('lacos') && erro.message.includes('composicao')
        );
      },
    );
  });
});

// ---------------------------------------------------------------------------
// 15 · W-5 — congelar re-executado NUNCA sobrescreve em silêncio
// ---------------------------------------------------------------------------

describe('F5 · W-5: re-congelamento idempotente/divergente com arquivo do anterior', () => {
  /** freeze 1 (grafo com condicionais) e freeze 2 (sem condicionais) prontos. */
  function doisFreezes(): {
    budget1: BudgetF4;
    grafo1: ConceptGraph;
    budget2: BudgetF4;
    grafo2: ConceptGraph;
  } {
    const g1 = grafoCadeia4();
    const fixo1 = deriveBudgetDoGrafo({
      grafo: g1.grafo,
      aulas: [
        { ref: 'm1/a1', introduz: [g1.a] },
        { ref: 'm1/a2', introduz: [g1.b] },
        { ref: 'm1/a3', introduz: [g1.c] },
        { ref: 'm1/a4', introduz: [g1.d] },
      ],
      entryConstructs: [],
    });
    const a = conceptId('variaveis');
    const b = conceptId('funcoes');
    const d = conceptId('lacos');
    const grafo2: ConceptGraph = {
      conceitos: [conc('variaveis'), conc('funcoes', { desbloqueadoPor: [a] }), conc('lacos', { desbloqueadoPor: [b] })],
    };
    const fixo2 = deriveBudgetDoGrafo({
      grafo: grafo2,
      aulas: [
        { ref: 'm1/a1', introduz: [a] },
        { ref: 'm1/a2', introduz: [b] },
        { ref: 'm1/a4', introduz: [d] },
      ],
      entryConstructs: [],
    });
    return { budget1: fixo1.budget, grafo1: g1.grafo, budget2: fixo2.budget, grafo2 };
  }

  it('(a) idempotente: mesmo conteúdo congelado → no-op total (carimbo original preservado)', async () => {
    const dir = await dirTemp();
    try {
      const { budget, grafo } = derivarCadeia();
      const primeiro = await congelar(dir, { orcamento: budget, grafo, timestamp: '2026-01-01T00:00:00.000Z' });
      const antes = await fsp.readFile(path.join(dir, FREEZE_FILENAME), 'utf8');

      // re-executa com carimbo DIFERENTE — o CONTEÚDO congelado é o mesmo → no-op.
      const segundo = await congelar(dir, { orcamento: budget, grafo, timestamp: '2026-09-09T00:00:00.000Z' });

      const depois = await fsp.readFile(path.join(dir, FREEZE_FILENAME), 'utf8');
      assert.equal(antes, depois, 'arquivo intacto: no-op total (nem o orçamento foi reescrito)');
      assert.equal(segundo.hash_orcamento, primeiro.hash_orcamento);
      assert.equal(segundo.carimbo, '2026-01-01T00:00:00.000Z', 'no-op devolve o freeze EXISTENTE, com o carimbo dele');
      // O orçamento em disco continua o do primeiro freeze.
      const orc = await lerOrcamento(dir);
      assert.equal(orc.hash, budget.hash);
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it('(b) conteúdo DIFERENTE sem a flag → FREEZE_EXISTENTE_DIVERGENTE; nada muda', async () => {
    const dir = await dirTemp();
    try {
      const { budget1, grafo1, budget2, grafo2 } = doisFreezes();
      await congelar(dir, { orcamento: budget1, grafo: grafo1, timestamp: '2026-01-01T00:00:00.000Z' });
      const antes = await fsp.readFile(path.join(dir, FREEZE_FILENAME), 'utf8');

      await assert.rejects(
        () => congelar(dir, { orcamento: budget2, grafo: grafo2, timestamp: '2026-01-02T00:00:00.000Z' }),
        (erro: unknown) => erro instanceof FreezeError && erro.code === 'FREEZE_EXISTENTE_DIVERGENTE',
        're-congelar divergente sem flag é erro estruturado',
      );

      // Nada mudou: nem o FREEZE.json, nem o orçamento, nem arquivo do anterior.
      const depois = await fsp.readFile(path.join(dir, FREEZE_FILENAME), 'utf8');
      assert.equal(antes, depois, 'o FREEZE.json continua o original');
      const orc = await lerOrcamento(dir);
      assert.equal(orc.hash, budget1.hash, 'o orçamento em disco continua o do primeiro freeze');
      await assert.rejects(
        () => fsp.access(path.join(dir, FREEZE_ANTERIOR_FILENAME)),
        (erro: unknown) => (erro as NodeJS.ErrnoException).code === 'ENOENT',
        'sem flag não há arquivo do freeze anterior',
      );
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it('(c) com a flag permitirRecongelar → arquiva FREEZE.previous.json antes de substituir', async () => {
    const dir = await dirTemp();
    try {
      const { budget1, grafo1, budget2, grafo2 } = doisFreezes();
      const primeiro = await congelar(dir, { orcamento: budget1, grafo: grafo1, timestamp: '2026-01-01T00:00:00.000Z' });

      const segundo = await congelar(
        dir,
        { orcamento: budget2, grafo: grafo2, timestamp: '2026-01-02T00:00:00.000Z' },
        { permitirRecongelar: true },
      );

      // O anterior foi arquivado ANTES da substituição (recuperável).
      const anteriorArquivado = JSON.parse(
        await fsp.readFile(path.join(dir, FREEZE_ANTERIOR_FILENAME), 'utf8'),
      ) as Record<string, unknown>;
      assert.equal(anteriorArquivado['hash_orcamento'], budget1.hash, 'FREEZE.previous.json = o freeze 1');
      assert.equal(anteriorArquivado['carimbo'], '2026-01-01T00:00:00.000Z');
      assert.equal(primeiro.hash_orcamento, budget1.hash);

      // FREEZE.json agora é o freeze 2 e o orçamento em disco acompanha.
      const relido = await lerFreeze(dir);
      assert.equal(relido.hash_orcamento, budget2.hash, 'FREEZE.json agora é o freeze 2');
      assert.equal(segundo.hash_orcamento, budget2.hash);
      const orc = await lerOrcamento(dir);
      assert.equal(orc.hash, budget2.hash, 'o orçamento em disco é o do freeze 2 (A-P10-1)');

      // Re-congelamento é ciclo novo: m1/a4 (que tinha condicionais na entrada
      // no freeze 1) volta para a fila — snapshotsInvalidados decide.
      const inv = snapshotsInvalidados(primeiro, segundo);
      assert.deepEqual(inv.invalidados, ['m1/a4']);
      assert.deepEqual(inv.removidos, ['m1/a3']);
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
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

  it('aula introduz conceito cujo pré-requisito não está disponível NA ENTRADA dela → PREREQUISITO_AUSENTE', () => {
    // a→p→d. A aula a1 introduz a (posição 0) E d (posição 2) — o menor índice
    // topológico de a1 é 0, então a1 vem ANTES da aula que introduz o
    // pré-requisito p (posição 1): na entrada de a1, p ainda não existe.
    const a = conceptId('a');
    const p = conceptId('p');
    const d = conceptId('d');
    const grafo: ConceptGraph = {
      conceitos: [conc('a'), conc('p'), conc('d', { desbloqueadoPor: [p] })],
    };
    assert.throws(
      () =>
        deriveBudgetDoGrafo({
          grafo,
          aulas: [
            { ref: 'm1/a1', introduz: [a, d] },
            { ref: 'm1/a2', introduz: [p] },
          ],
          entryConstructs: [],
        }),
      (erro: unknown) => erro instanceof F4Error && erro.code === 'PREREQUISITO_AUSENTE',
    );
  });

  it('aula reensina o axioma (já produtivo) → REENSINO_NA_DERIVACAO', () => {
    // grafo a→b; 'b' é do axioma (produtivo) e a aula tenta introduzi-lo de novo.
    const a = conceptId('variaveis');
    const b = conceptId('funcoes');
    const grafo: ConceptGraph = {
      conceitos: [conc('variaveis'), conc('funcoes', { desbloqueadoPor: [a] })],
    };
    assert.throws(
      () =>
        deriveBudgetDoGrafo({
          grafo,
          aulas: [{ ref: 'm1/a2', introduz: [b] }],
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