/**
 * tests/cx-phases-f4f5.test.ts — CARACTERIZAÇÃO (golden master) das fases
 * F4 (`phases/f4Budget.ts`) e F5 (`phases/f5Freeze.ts`).
 *
 * PINA F4: os 4 tetos default do §3.6, o hash de CONTEÚDO canonicalizado
 * (reordenar chaves não muda), G-MONO (as 4 violações nomeadas), a
 * imutabilidade em profundidade, o ciclo materializar/ler do
 * `budget.generated.json` (fail-closed por hash — adulteração é
 * ARTEFATO_CORROMPIDO) e a guarda A-P10-3 (FREEZE congela a escrita).
 *
 * PINA F5: hash do grafo, derivação determinística de snapshots (caminho/
 * budgetHash/hash), invalidação POR SNAPSHOT (só os afetados voltam à fila),
 * criação do freeze congelado em profundidade, validação refinada (budgetHash
 * sha256), re-verificação de conteúdo na leitura (W-2) e o pedido de bloqueio
 * ao planejador (fail-closed, autor NUNCA escreve no orçamento).
 *
 * Sem LLM, sem rede: tmpdirs próprios (mkdtemp).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  BUDGET_FILENAME,
  BUDGET_VERSION,
  F4Error,
  FREEZE_FILENAME,
  TETOS_DEFAULT,
  checarGMonotonicidade,
  congelarProfundamente,
  freezeExiste,
  hashDoOrcamento,
  lerOrcamento,
  materializarBudget,
  orcamentoMonotonico,
  seriarBudget,
  type BudgetAula,
  type BudgetF4,
} from '../electron/main/engine/phases/f4Budget';
import {
  FREEZE_ANTERIOR_FILENAME,
  FreezeError,
  caminhoDoSnapshot,
  congelar,
  criarFreeze,
  derivarSnapshots,
  garantirOrcamentoEscritivel,
  hashDoGrafo,
  lerFreeze,
  pedidoDeBloqueio,
  snapshotsInvalidados,
  validarFreeze,
  type Freeze,
} from '../electron/main/engine/phases/f5Freeze';
import type { ConceptGraph, ConceptId } from '../electron/main/engine/graph/model';

/** conceitos a partir de chaves cruas (o tipo real é brandido). */
function cids(xs: string[]): ConceptId[] {
  return xs as unknown as ConceptId[];
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function aulaBudget(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ref: 'm1/a1',
    entryConstructs: ['decl:let'],
    budget_entrada: { receptive: ['decl:let'], productive: ['decl:let'] },
    budget_saida: { receptive: ['decl:let'], productive: ['decl:let', 'op:binary:+'] },
    introduces: { receptive: [], productive: ['op:binary:+'] },
    matrix: [
      { construcao: 'decl:let', estado: 'disponivel' },
      { construcao: 'op:binary:+', estado: 'nova' },
    ],
    element_count: 1,
    tetos: { ...TETOS_DEFAULT },
    ...over,
  };
}

function budget(over: Record<string, unknown> = {}): BudgetF4 {
  const semHash = {
    aulas: [aulaBudget()],
    fonte: 'declared' as const,
    politica_de_harness: 'receptive-seed' as const,
    ...over,
  };
  const b = { ...semHash, hash: hashDoOrcamento(semHash) };
  return b as unknown as BudgetF4;
}

function grafo(): ConceptGraph {
  return {
    conceitos: [
      { id: 'decl_let', familiaSintatica: 'sintaxe', desbloqueadoPor: [], usa: [] },
      { id: 'op_soma', familiaSintatica: 'sintaxe', desbloqueadoPor: ['decl_let'], usa: ['decl_let'] },
    ],
  } as unknown as ConceptGraph;
}

async function tmpDir(): Promise<string> {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'do-cxph-f45-'));
}

// ---------------------------------------------------------------------------
// 1. F4 — hash, G-MONO, imutabilidade, materialização
// ---------------------------------------------------------------------------

describe('F4-orçamento — tetos, hash de conteúdo e imutabilidade', () => {
  it('fixa os 4 tetos default do §3.6 e o formato do artefato', () => {
    assert.deepEqual(TETOS_DEFAULT, {
      construcoes_produtivas_novas: 2,
      elementos_interagindo: 4,
      elementos_nao_interativos: 7,
      tempo_resolucao_s: 120,
    });
    assert.equal(BUDGET_FILENAME, 'budget.generated.json');
    assert.equal(FREEZE_FILENAME, 'FREEZE.json');
    assert.equal(BUDGET_VERSION, '1');
    assert.equal(FREEZE_ANTERIOR_FILENAME, 'FREEZE.previous.json');
  });

  it('hashDoOrcamento: canonicalizado SEM o campo hash — ordem de chaves irrelevante', () => {
    const b = budget();
    assert.match(b.hash, /^[0-9a-f]{64}$/);
    assert.equal(hashDoOrcamento(b), b.hash, 'auto-coerente');
    const reordenado = { hash: b.hash, politica_de_harness: b.politica_de_harness, fonte: b.fonte, aulas: b.aulas };
    assert.equal(hashDoOrcamento(reordenado), b.hash, 'reordenar chaves NÃO muda o hash (A-P10-2)');
    assert.notEqual(hashDoOrcamento({ ...b, fonte: 'inferred' }), b.hash);
    assert.throws(() => hashDoOrcamento(null), (erro: unknown) => erro instanceof F4Error && erro.code === 'ARTEFATO_INVALIDO');
  });

  it('congelarProfundamente congela em PROFUNDIDADE (arrays e objetos internos)', () => {
    const congelado = congelarProfundamente({ lista: [{ x: 1 }] });
    assert.ok(Object.isFrozen(congelado));
    assert.ok(Object.isFrozen(congelado.lista));
    assert.ok(Object.isFrozen(congelado.lista[0]));
    assert.equal(congelarProfundamente(7), 7, 'primitivo volta cru');
  });

  it('derivação devolve o budget CONGELADO (mutar o recebido não altera nada)', async () => {
    // o contrato de congelamento é observável também na leitura em disco:
    const dir = await tmpDir();
    const b = budget();
    await materializarBudget(dir, b);
    const lido = await lerOrcamento(dir);
    assert.ok(Object.isFrozen(lido), 'lerOrcamento devolve snapshot congelado');
    assert.equal(lido.hash, b.hash);
  });
});

describe('F4-orçamento — G-MONO (as violações nomeadas)', () => {
  it('orçamento monotônico passa (toda aula introduz ≥1, axioma exato nas DUAS faixas, nada regred/reensina)', () => {
    assert.deepEqual(checarGMonotonicidade(budget()), []);
    assert.equal(orcamentoMonotonico(budget()), true);
  });

  it('aula sem construção nova e orçamento sem aula são AULA_SEM_CONSTRUCAO_NOVA', () => {
    const semNova = budget({
      aulas: [aulaBudget({ introduces: { receptive: [], productive: [] }, budget_saida: { receptive: ['decl:let'], productive: ['decl:let'] }, matrix: [{ construcao: 'decl:let', estado: 'disponivel' }] })],
    });
    const v = checarGMonotonicidade(semNova);
    assert.equal(v[0].codigo, 'AULA_SEM_CONSTRUCAO_NOVA');
    assert.equal(v[0].aula, 'm1/a1');
    assert.match(v[0].mensagem, /não introduz NENHUMA construção/);
    assert.equal(checarGMonotonicidade({ ...budget(), aulas: [] })[0].codigo, 'AULA_SEM_CONSTRUCAO_NOVA');
  });

  it('aula 0: entrada tem de ser EXATAMENTE o axioma, nas duas faixas (HIGH-2)', () => {
    const comSobra = budget({ aulas: [aulaBudget({ budget_entrada: { receptive: ['decl:let'], productive: ['decl:let', 'op:binary:+'] } })] });
    const vs = checarGMonotonicidade(comSobra);
    assert.equal(vs[0].codigo, 'ENTRADA_DIVERGENTE_DO_AXIOMA');
    assert.match(vs[0].mensagem, /sobra: op:binary:\+/);

    const semReceptiva = budget({ aulas: [aulaBudget({ budget_entrada: { receptive: [], productive: ['decl:let'] } })] });
    const vr = checarGMonotonicidade(semReceptiva);
    assert.equal(vr[0].codigo, 'ENTRADA_DIVERGENTE_DO_AXIOMA');
    assert.match(vr[0].mensagem, /faixa RECEPTIVA/);
  });

  it('linha do tempo: PERDA_DE_CONSTRUCAO ao regredir; REENSINO ao repetir nova', () => {
    const duasAulas = (estados: [string, string], ref2 = 'm1/a2') => ({
      aulas: [
        aulaBudget(),
        aulaBudget({
          ref: ref2,
          entryConstructs: ['decl:let'],
          budget_entrada: { receptive: ['decl:let', 'op:binary:+'], productive: ['decl:let', 'op:binary:+'] },
          budget_saida: { receptive: ['decl:let', 'op:binary:+'], productive: ['decl:let', 'op:binary:+'] },
          introduces: { receptive: [], productive: ['node:IfStatement'] },
          matrix: [
            { construcao: 'decl:let', estado: 'disponivel' },
            { construcao: 'op:binary:+', estado: estados[0] as 'disponivel' },
            { construcao: 'node:IfStatement', estado: estados[1] as 'nova' },
          ],
        }),
      ],
    });

    const perda = checarGMonotonicidade(budget(duasAulas(['nao_disponivel', 'nova'])));
    assert.equal(perda.find((v) => v.codigo === 'PERDA_DE_CONSTRUCAO')?.construcao, 'op:binary:+');

    const reensino = checarGMonotonicidade(budget(duasAulas(['nova', 'nova'])));
    assert.equal(reensino.find((v) => v.codigo === 'REENSINO')?.aula, 'm1/a2');
    assert.match(reensino.find((v) => v.codigo === 'REENSINO')?.mensagem ?? '', /unicidade de origem violada/);
  });
});

describe('F4-orçamento — materialização e leitura (fail-closed por hash)', () => {
  it('ciclo materializar→ler é auto-coerente; adulteração ingênua é ARTEFATO_CORROMPIDO', async () => {
    const dir = await tmpDir();
    const b = budget();
    await materializarBudget(dir, b);
    const emDisco = await fsp.readFile(path.join(dir, BUDGET_FILENAME), 'utf8');
    assert.ok(emDisco.endsWith('}\n'), 'JSON pretty + nova linha');
    assert.equal((await lerOrcamento(dir)).hash, b.hash);

    const adulterado = JSON.parse(emDisco) as BudgetF4;
    adulterado.aulas[0].element_count = 99;
    await fsp.writeFile(path.join(dir, BUDGET_FILENAME), JSON.stringify(adulterado, null, 2), 'utf8');
    await assert.rejects(
      lerOrcamento(dir),
      (erro: unknown) => erro instanceof F4Error && erro.code === 'ARTEFATO_CORROMPIDO' && /adulterado/.test(erro.message),
    );
  });

  it('seriarBudget valida no BudgetSchema antes de virar bytes; orçamento inexistente/quebrado é erro nomeado', async () => {
    assert.throws(
      () => seriarBudget({ ...budget(), politica_de_harness: 'none-none' as never }),
      (erro: unknown) => erro instanceof F4Error && erro.code === 'ARTEFATO_INVALIDO',
    );
    const dir = await tmpDir();
    await assert.rejects(lerOrcamento(dir), (erro: unknown) => erro instanceof F4Error && erro.code === 'ARTEFATO_INVALIDO' && /não existe/.test(erro.message));
    await fsp.writeFile(path.join(dir, BUDGET_FILENAME), '{quebrado', 'utf8');
    await assert.rejects(lerOrcamento(dir), (erro: unknown) => erro instanceof F4Error && /não é JSON válido/.test(erro.message));
  });

  it('guarda A-P10-3: com FREEZE.json presente, escrever orçamento é erro (freezeExiste/G-FREEZE)', async () => {
    const dir = await tmpDir();
    assert.equal(await freezeExiste(dir), false);
    await materializarBudget(dir, budget());
    await fsp.writeFile(path.join(dir, FREEZE_FILENAME), '{}', 'utf8');
    assert.equal(await freezeExiste(dir), true);
    await assert.rejects(
      materializarBudget(dir, budget()),
      (erro: unknown) => erro instanceof F4Error && erro.code === 'ORCAMENTO_CONGELADO' && /A-P10-3/.test(erro.message),
    );
    await assert.rejects(
      garantirOrcamentoEscritivel(dir),
      (erro: unknown) => erro instanceof FreezeError && erro.code === 'ORCAMENTO_CONGELADO',
    );
  });
});

// ---------------------------------------------------------------------------
// 2. F5 — snapshots, freeze e pedido ao planejador
// ---------------------------------------------------------------------------

describe('F5-freeze — snapshots imutáveis por aula', () => {
  it('caminhoDoSnapshot é determinístico; derivarSnapshots carimba fatia entrada/saída/introduces', () => {
    assert.equal(caminhoDoSnapshot('m1/a1'), 'snapshots/m1__a1.json');
    const snapshots = derivarSnapshots(budget());
    assert.equal(snapshots.length, 1);
    assert.deepEqual(Object.keys(snapshots[0]).sort(), ['aula_slug', 'budgetHash', 'caminho', 'hash']);
    assert.equal(snapshots[0].aula_slug, 'm1/a1');
    assert.equal(snapshots[0].caminho, 'snapshots/m1__a1.json');
    assert.match(snapshots[0].budgetHash, /^[0-9a-f]{64}$/);
    assert.ok(Object.isFrozen(snapshots), 'a derivação sai CONGELADA');
    // mudar a FATIA da aula muda o budgetHash (é o que invalida o snapshot)…
    const mudou = derivarSnapshots(budget({ aulas: [aulaBudget({ introduces: { receptive: [], productive: ['node:IfStatement'] } })] }));
    assert.notEqual(mudou[0].budgetHash, snapshots[0].budgetHash);
    // …e mudar o hash decorativo do artefato NÃO.
    assert.equal(derivarSnapshots({ ...budget(), hash: 'f'.repeat(64) })[0].budgetHash, snapshots[0].budgetHash);
  });

  it('snapshotsInvalidados: SÓ os afetados voltam à fila; sumidos/ novos são separados', () => {
    const base = derivarSnapshots(budget());
    const anterior = { snapshots: [...base, { ...derivarSnapshots(budget({ aulas: [aulaBudget({ ref: 'm1/antiga' })] }))[0], aula_slug: 'm1/antiga' }] };
    const novo = {
      snapshots: [
        { ...base[0], budgetHash: 'a'.repeat(64) }, // fatia mudou → invalidado
        ...derivarSnapshots(budget({ aulas: [aulaBudget({ ref: 'm1/nova' })] })),
      ],
    };
    const r = snapshotsInvalidados(anterior as unknown as Freeze, novo as unknown as Freeze);
    assert.deepEqual(r, { invalidados: ['m1/a1'], removidos: ['m1/antiga'], novos: ['m1/nova'] });

    const intacto = snapshotsInvalidados(anterior as unknown as Freeze, { snapshots: anterior.snapshots } as unknown as Freeze);
    assert.deepEqual(intacto, { invalidados: [], removidos: [], novos: [] }, 'fatia igual mantém o snapshot');
  });
});

describe('F5-freeze — criação, validação e leitura (W-2)', () => {
  it('criarFreeze: hashes coerentes com F4/hashDoGrafo, dossies vazios, CONGELADO em profundidade', () => {
    const b = budget();
    const g = grafo();
    const freeze = criarFreeze({ orcamento: b, grafo: g, timestamp: '2026-01-01T00:00:00.000Z' });
    assert.equal(freeze.hash_orcamento, b.hash);
    assert.equal(freeze.hash_grafo, hashDoGrafo(g));
    assert.match(hashDoGrafo(g), /^[0-9a-f]{64}$/);
    assert.equal(freeze.carimbo, '2026-01-01T00:00:00.000Z');
    assert.deepEqual(freeze.dossies, [], 'dossiês vazios na F5 — valor vazio EXPLÍCITO (INV-05)');
    assert.deepEqual(freeze.snapshots.map((s) => s.aula_slug), ['m1/a1']);
    assert.ok(Object.isFrozen(freeze) && Object.isFrozen(freeze.snapshots[0]), 'A-P10-4');
  });

  it('orçamento adulterado NÃO congela (ORCAMENTO_DIVERGENTE); grafo com ciclo é GRAFO_INVALIDO', () => {
    const b = budget();
    assert.throws(
      () => criarFreeze({ orcamento: { ...b, hash: 'e'.repeat(64) }, grafo: grafo() }),
      (erro: unknown) => erro instanceof FreezeError && erro.code === 'ORCAMENTO_DIVERGENTE',
    );
    const comCiclo = {
      conceitos: [
        { id: 'a', familiaSintatica: 'sintaxe', desbloqueadoPor: ['b'], usa: [] },
        { id: 'b', familiaSintatica: 'sintaxe', desbloqueadoPor: ['a'], usa: [] },
      ],
    } as unknown as ConceptGraph;
    assert.throws(
      () => criarFreeze({ orcamento: b, grafo: comCiclo }),
      (erro: unknown) => erro instanceof FreezeError && erro.code === 'GRAFO_INVALIDO' && /ciclo/.test(erro.message),
    );
  });

  it('validarFreeze refina o schema P-04: campos nomeados no erro, budgetHash sha256 obrigatório nos snapshots', () => {
    const freeze = criarFreeze({ orcamento: budget(), grafo: grafo() });
    assert.deepEqual(validarFreeze(JSON.parse(JSON.stringify(freeze))), freeze);

    const semBudgetHash = JSON.parse(JSON.stringify(freeze)) as Record<string, unknown>;
    ((semBudgetHash.snapshots as Record<string, unknown>[])[0]).budgetHash = 'curto';
    assert.throws(
      () => validarFreeze(semBudgetHash),
      (erro: unknown) =>
        erro instanceof FreezeError && erro.code === 'FREEZE_INVALIDO' && erro.campo === 'snapshots[0].budgetHash',
    );
    assert.throws(
      () => validarFreeze({ ...JSON.parse(JSON.stringify(freeze)), carimbo: 'ontem' }),
      (erro: unknown) => erro instanceof FreezeError && erro.campo === 'carimbo' && /ISO-8601/.test(erro.message),
    );
  });

  it('ciclo em disco: congelar→lerFreeze; conteúdo adulterado é ARTEFATO_CORROMPIDO (W-2); sem freeze é FREEZE_AUSENTE', async () => {
    const dir = await tmpDir();
    const b = budget();
    await materializarBudget(dir, b);
    await assert.rejects(lerFreeze(dir), (erro: unknown) => erro instanceof FreezeError && erro.code === 'FREEZE_AUSENTE' && /autoria exige o freeze/.test(erro.message));

    const freeze = await congelar(dir, { orcamento: b, grafo: grafo(), timestamp: '2026-01-01T00:00:00.000Z' });
    const lido = await lerFreeze(dir);
    assert.deepEqual(lido, freeze);
    assert.equal(lido.hash_orcamento, b.hash, 'o freeze é a âncora do orçamento congelado');
    await assert.rejects(
      materializarBudget(dir, b),
      (erro: unknown) => erro instanceof F4Error && erro.code === 'ORCAMENTO_CONGELADO',
    );

    const emDisco = JSON.parse(await fsp.readFile(path.join(dir, FREEZE_FILENAME), 'utf8')) as Freeze;
    emDisco.snapshots[0].budgetHash = 'a'.repeat(64); // adulteração sem recalcular o hash
    await fsp.writeFile(path.join(dir, FREEZE_FILENAME), JSON.stringify(emDisco, null, 2), 'utf8');
    await assert.rejects(
      lerFreeze(dir),
      (erro: unknown) => erro instanceof FreezeError && erro.code === 'ARTEFATO_CORROMPIDO' && /adulterado/.test(erro.message),
    );
  });

  it('pedidoDeBloqueio: fail-closed nas três entradas; sai CONGELADO e o autor NUNCA escreve no orçamento', () => {
    const pedido = pedidoDeBloqueio({ aula: 'm1/a2', faltantes: cids(['op:binary:+', 'decl:let']), justificativa: 'o teste cobra soma e a aula não ensina' });
    assert.deepEqual(pedido.faltantes, ['decl:let', 'op:binary:+'], 'faltantes ordenados');
    assert.equal(pedido.origem, 'autor');
    assert.equal(pedido.requisicao, 'pedido-ao-planejador');
    assert.equal(pedido.autor_escreve_no_orcamento, false);
    assert.ok(pedido.acoes_sugeridas.length > 0, 'sugestões vêm do catálogo fechado');
    assert.ok(Object.isFrozen(pedido));

    for (const entrada of [
      { aula: ' ', faltantes: cids(['x']), justificativa: 'y' },
      { aula: 'm1/a2', faltantes: cids([]), justificativa: 'y' },
      { aula: 'm1/a2', faltantes: cids(['x']), justificativa: ' ' },
    ]) {
      assert.throws(
        () => pedidoDeBloqueio(entrada),
        (erro: unknown) => erro instanceof FreezeError && erro.code === 'PEDIDO_INVALIDO',
        JSON.stringify(entrada),
      );
    }
  });
});
