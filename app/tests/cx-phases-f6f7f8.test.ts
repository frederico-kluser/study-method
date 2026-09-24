/**
 * tests/cx-phases-f6f7f8.test.ts — CARACTERIZAÇÃO (golden master) das fases
 * F6 (`phases/f6Pilot.ts`), F7 (`phases/f7Theory.ts`) e F8
 * (`phases/f8Challenges.ts`).
 *
 * PINA F6: os marcadores/constantes do portão humano (a frase EXATA "APROVO
 * F6", piloto de 3 aulas, 10×10, limiar de duplicata 0,9), a seleção
 * determinística e JUSTIFICADA (raiz/mais_armadilhada/tardia), o hash da
 * aprovação (canonical, sem carimbo) e o fail-closed do rodarPiloto.
 *
 * PINA F7: caminhos dos drafts (1 arquivo por aula), aviso de checksum (R18 —
 * reportado, nunca bloqueante), a higiene de blocos de código da teoria (tag =
 * código; crase inline = prosa), o resumo da teoria (o que o autor de desafio
 * recebe) e o gate A4 (teoria ⊆ faixa RECEPTIVA).
 *
 * PINA F8: o portão do dossiê de desafio (A-P11-2: spawn recusado com o campo
 * nomeado), a saída do autor (raciocínio ANTES da decisão — INV-04), as
 * construções permitidas (união deduplicada), o input literal das provas e o
 * gate por faixas (solution→produtivo, starter→receptivo, tests→teste) + A6
 * (direção puxada).
 *
 * Sem LLM, sem rede: funções puras + fixtures em memória.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  APROVACAO_F6_FILENAME,
  APROVACAO_F6_FRASE,
  DUPLICATA_SEMANTICA_LIMIAR,
  F6Error,
  PILOTO_F6_FILENAME,
  TAMANHO_DO_EXPERIMENTO_10X10,
  TAMANHO_DO_PILOTO,
  aulasAprovadasDoPiloto,
  hashDaAprovacao,
  profundidadesDeComposicao,
  rodarPiloto,
  selecionarAulasDoPiloto,
} from '../electron/main/engine/phases/f6Pilot';
import type { BudgetF4 } from '../electron/main/engine/phases/f4Budget';
import type { ConceptId } from '../electron/main/engine/graph/model';

/** ordem de conceitos a partir de chaves cruas (o tipo real é brandido). */
function cids(xs: string[]): ConceptId[] {
  return xs as unknown as ConceptId[];
}
import {
  ETAPA_ESQUELETO,
  ETAPA_FECHAMENTO,
  ETAPAS_AUTORIA,
  TIMEOUT_AUTORIA_MS,
  TETO_ONDA_AUTORIA,
  avisoDeChecksum,
  blocosDeCodigoDaTeoria,
  caminhoDraftAula,
  caminhoDraftDesafio,
  dividirEmBatches,
  ofensasDeOrcamentoDaTeoria,
  resumoDaTeoria,
  type TeoriaEscrita,
} from '../electron/main/engine/phases/f7Theory';
import {
  DesafioAuthorOutputSchema,
  ErroDossieDeDesafioIncompleto,
  ETAPA_DESAFIO,
  STAGE_VERSION_DESAFIO,
  TIMEOUT_DESAFIO_MS,
  construcoesPermitidasDoDesafio,
  gerarPromptAutorDeDesafio,
  montarDossieDeDesafio,
  montarInputDasProvas,
  ofensasDeOrcamentoDoDesafio,
  type DossieDeDesafio,
  type SaidaDesafio,
} from '../electron/main/engine/phases/f8Challenges';
import { extractAtoms } from '../electron/main/engine/extract';
import type { ConceptGraph } from '../electron/main/engine/graph/model';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function aulaCom(ref: string, introduz: string[]): Record<string, unknown> {
  return {
    ref,
    entryConstructs: [],
    budget_entrada: { receptive: [], productive: [] },
    budget_saida: { receptive: [...introduz], productive: [...introduz] },
    introduces: { receptive: [], productive: [...introduz] },
    matrix: introduz.map((c) => ({ construcao: c, estado: 'nova' })),
    element_count: introduz.length,
    tetos: { construcoes_produtivas_novas: 2, elementos_interagindo: 4, elementos_nao_interativos: 7, tempo_resolucao_s: 120 },
  };
}

function teoria(sections: { id: string; secao: string; markdown: string; tag: string }[], termos: string[] = []): TeoriaEscrita {
  return { theory: sections, introducesTerms: termos } as unknown as TeoriaEscrita;
}

function dossieDesafio(over: Partial<DossieDeDesafio> = {}): DossieDeDesafio {
  return {
    aula_slug: 'm1/a1',
    objetivo: { verbo: 'implementar', objeto: 'função soma', contexto: 'programas simples', criterio: 'testes passam' },
    kc_type: 'regra',
    // o enum EI_CLASS_VALUES do dossiê de desafio são os valores de KC
    // ('fato'..'integrativo') — vocabulário herdado do Dossier do P-11.
    ei_class: 'fato',
    budget_produtivo: [],
    budget_receptivo: [],
    budget_teste: [],
    subgoals: ['soma dois números'],
    terms: ['parâmetro'],
    resumo_da_teoria: 'a aula apresentou declaração e retorno.',
    desafios_anteriores: [],
    ...over,
  } as DossieDeDesafio;
}

function saidaDesafio(over: Partial<SaidaDesafio> = {}): SaidaDesafio {
  return {
    raciocinio_de_projeto: 'exercita o introduzido da aula',
    slug: 'soma',
    conceito: 'variaveis',
    statement: 'implemente soma',
    starterCode: 'export function soma() {}',
    solutionCode: 'export function soma(a, b) { return a + b; }',
    testsCode: "test('soma', () => {});",
    expectedTestCount: 1,
    outputChannel: 'retorno',
    requires: [],
    notRequired: [],
    subgoals: [],
    scenarios: [],
    taskSkill: 'implementar função',
    supportLevel: 'sem_andaime',
    surfaceDomain: 'números',
    solutionAlternates: [],
    wrongSolutions: [],
    requirements: [],
    justificativa: 'exercita o introduzido',
    aprovado: false,
    ...over,
  } as SaidaDesafio;
}

/** allowlist = todas as chaves que o código emite (menos as sob teste). */
function chavesDe(codigo: string): Set<string> {
  const r = extractAtoms(codigo, { fileName: 'teste.mjs' });
  assert.ok(r.ok, 'a fixture precisa parsear');
  return r.ok ? new Set(r.keys) : new Set();
}

// ---------------------------------------------------------------------------
// 1. F6 — portão humano e seleção determinística
// ---------------------------------------------------------------------------

describe('F6-piloto — portão humano e constantes', () => {
  it('fixa os artefatos do portão e a frase EXATA que aprova (nada além dela)', () => {
    assert.equal(APROVACAO_F6_FILENAME, 'aprovacao-f6.json');
    assert.equal(PILOTO_F6_FILENAME, 'piloto-f6.json');
    assert.equal(APROVACAO_F6_FRASE, 'APROVO F6');
    assert.equal(TAMANHO_DO_PILOTO, 3);
    assert.equal(TAMANHO_DO_EXPERIMENTO_10X10, 10);
    assert.equal(DUPLICATA_SEMANTICA_LIMIAR, 0.9);
  });

  it('hashDaAprovacao cobre versão+aulas+métricas, SEM carimbo (re-aprovar o mesmo conteúdo é no-op)', () => {
    const conteudo = { versao: '1' as const, aulas: ['a', 'b', 'c'], metricas: { z: 1, a: [{ x: 2 }] } };
    const h1 = hashDaAprovacao(conteudo as never);
    const reordenado = { metricas: { a: [{ x: 2 }], z: 1 }, aulas: ['a', 'b', 'c'], versao: '1' as const };
    assert.equal(hashDaAprovacao(reordenado as never), h1, 'canonical: ordem de chaves irrelevante');
    assert.match(h1, /^[0-9a-f]{64}$/);
    assert.notEqual(hashDaAprovacao({ ...conteudo, aulas: ['a', 'b'] } as never), h1);
  });

  it('aulasAprovadasDoPiloto: só status "validado", em ordem estável', () => {
    const piloto = {
      autoria: {
        estados: [
          { aula_slug: 'm1/b', status: 'validado' },
          { aula_slug: 'm1/a', status: 'bloqueado', motivo: 'faltou orçamento' },
          { aula_slug: 'm1/c', status: 'validado' },
        ],
      },
    };
    assert.deepEqual(aulasAprovadasDoPiloto(piloto as never), ['m1/b', 'm1/c']);
  });
});

describe('F6-piloto — seleção determinística justificada (A-P25-2)', () => {
  it('profundidadesDeComposicao: cadeia de pré-requisitos vira profundidade (folha 0)', () => {
    const grafo = {
      conceitos: [
        { id: 'a', familiaSintatica: 'sintaxe', desbloqueadoPor: [], usa: [] },
        { id: 'b', familiaSintatica: 'sintaxe', desbloqueadoPor: ['a'], usa: [] },
        { id: 'c', familiaSintatica: 'sintaxe', desbloqueadoPor: ['b'], usa: [] },
      ],
    } as unknown as ConceptGraph;
    const p = profundidadesDeComposicao(grafo);
    assert.deepEqual([...p.entries()].sort(), [['a', 0], ['b', 1], ['c', 2]]);
  });

  it('3 papéis DISTINTOS na ordem [raiz, mais_armadilhada, tardia], cada um com regra e critério', () => {
    // ordem c0..c8; raiz introduz [c0,c1] (max 1), meio [c2..c5] (max 5, MAIOR
    // risco = 4 introduces + extensão 3), tardia [c6..c8] (max 8).
    const ordem = cids(['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']);
    const orcamento = {
      aulas: [aulaCom('m1/raiz', ['c0', 'c1']), aulaCom('m1/tardia', ['c6', 'c7', 'c8']), aulaCom('m1/meio', ['c2', 'c3', 'c4', 'c5'])],
      fonte: 'declared',
      politica_de_harness: 'receptive-seed',
      hash: 'f'.repeat(64),
    } as unknown as BudgetF4;
    const sel = selecionarAulasDoPiloto(orcamento, ordem);

    assert.equal(sel.aulas.length, TAMANHO_DO_PILOTO);
    assert.equal(new Set(sel.aulas).size, 3, 'EXATAMENTE 3 aulas distintas');
    assert.deepEqual(sel.justificativas.map((j) => j.papel), ['raiz', 'mais_armadilhada', 'tardia']);
    assert.deepEqual(sel.justificativas.map((j) => j.aula), sel.aulas, 'justificativas ALINHADAS com as aulas');
    for (const j of sel.justificativas) {
      assert.ok(j.regra.length > 0 && j.criterio.length > 0, 'toda escolha é JUSTIFICADA (regra + critério)');
    }
    assert.equal(sel.aulas[0], 'm1/raiz');
    assert.equal(sel.aulas[1], 'm1/meio', 'mais_armadilhada = maior carga de risco (4 introduces + extensão 3)');
    assert.equal(sel.aulas[2], 'm1/tardia');
    assert.deepEqual(selecionarAulasDoPiloto(orcamento, ordem), sel, 'determinística: mesma entrada, mesma seleção');

    // CARACTERIZAÇÃO de um desvio nomeado: o critério da raiz DIZ "min(posição
    // do introduces)" mas imprime a posição MÁXIMA (ver BUG abaixo).
    assert.match(sel.justificativas[0].criterio, /min\(posição do introduces\) = 1/);
  });

  it.skip('BUG: minPosicaoDaAula calcula MAX em vez de MIN — f6Pilot.ts:245 — o critério da raiz deveria citar a MENOR posição do introduces (documentado em "ordem da DAG (min-posição do introduces)" e no texto da regra)', () => {
    const ordem = cids(['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']);
    const orcamento = {
      aulas: [aulaCom('m1/raiz', ['c0', 'c1']), aulaCom('m1/tardia', ['c6', 'c7', 'c8']), aulaCom('m1/meio', ['c2', 'c3', 'c4', 'c5'])],
      fonte: 'declared',
      politica_de_harness: 'receptive-seed',
      hash: 'f'.repeat(64),
    } as unknown as BudgetF4;
    const sel = selecionarAulasDoPiloto(orcamento, ordem);
    // comportamento CORRETO (documentado): min de [c0,c1] = 0, não 1 (= max).
    assert.match(sel.justificativas[0].criterio, /min\(posição do introduces\) = 0/);
  });

  it('fail-closed: orçamento sem aulas, ordem vazia e piloto pequeno demais são PILOTO_INVALIDO', () => {
    const vazio = { aulas: [], fonte: 'declared', politica_de_harness: 'receptive-seed', hash: 'f'.repeat(64) } as unknown as BudgetF4;
    assert.throws(() => selecionarAulasDoPiloto(vazio, cids(['a'])), (erro: unknown) => erro instanceof F6Error && erro.code === 'PILOTO_INVALIDO');
    const dois = { aulas: [aulaCom('m1/x1', ['a']), aulaCom('m1/x2', ['b'])], fonte: 'declared', politica_de_harness: 'receptive-seed', hash: 'f'.repeat(64) } as unknown as BudgetF4;
    assert.throws(() => selecionarAulasDoPiloto(dois, cids([])), (erro: unknown) => erro instanceof F6Error && /ordem.*vazia/.test(erro.message));
    assert.throws(() => selecionarAulasDoPiloto(dois, cids(['a', 'b'])), (erro: unknown) => erro instanceof F6Error && erro.code === 'PILOTO_INVALIDO');
  });

  it('rodarPiloto: EXATAMENTE 3 aulas distintas — validação ANTES de qualquer trabalho', async () => {
    const orcamento = { aulas: [aulaCom('m1/x1', ['a'])], fonte: 'declared', politica_de_harness: 'receptive-seed', hash: 'f'.repeat(64) } as unknown as BudgetF4;
    await assert.rejects(
      rodarPiloto({} as never, orcamento, ['a', 'b']),
      (erro: unknown) => erro instanceof F6Error && erro.code === 'PILOTO_INVALIDO' && /EXATAMENTE 3 aulas/.test(erro.message),
    );
    await assert.rejects(
      rodarPiloto({} as never, orcamento, ['a', 'a', 'b']),
      (erro: unknown) => erro instanceof F6Error && /precisam ser distintas/.test(erro.message),
    );
  });
});

// ---------------------------------------------------------------------------
// 2. F7 — teoria: higiene de blocos, resumo e gate A4
// ---------------------------------------------------------------------------

describe('F7-teoria — drafts, checksum (R18) e blocos de código', () => {
  it('1 arquivo por aula (e por desafio) — caminhos determinísticos', () => {
    assert.equal(caminhoDraftAula('m1/a1'), 'drafts/m1__a1.lesson-draft.json');
    assert.equal(caminhoDraftDesafio('m1/a1'), 'drafts/m1__a1.challenge-draft.json');
  });

  it('aviso de checksum: só a DIVERGÊNCIA vira texto (reportado, nunca bloqueante)', () => {
    assert.equal(avisoDeChecksum('m1/a1', { etapa: ETAPA_ESQUELETO, resultado: null } as never), null, 'cauda ausente não gera aviso');
    assert.equal(avisoDeChecksum('m1/a1', { etapa: ETAPA_ESQUELETO, resultado: { ok: true, faltando: [], extras: [] } } as never), null);
    const aviso = avisoDeChecksum('m1/a1', {
      etapa: ETAPA_FECHAMENTO,
      resultado: { ok: false, faltando: ['decl:let'], extras: ['node:IfStatement'] },
    } as never);
    assert.match(aviso ?? '', /checksum de cauda divergente em "m1\/a1" \(etapa f7-teoria-fechamento, §7\.1 R18\)/);
    assert.match(aviso ?? '', /não repetiu: decl:let/);
    assert.match(aviso ?? '', /repetiu fora da lista: node:IfStatement/);
    assert.match(aviso ?? '', /REPORTADO, não bloqueante/);
  });

  it('blocosDeCodigoDaTeoria: seção com TAG é código inteiro; prosa só conta cerca COM tag; crase inline é prosa', () => {
    const draft = teoria([
      { id: 'codificada', secao: 'teoria', markdown: 'let x = 1;', tag: 'javascript' },
      {
        id: 'prosa',
        secao: 'referencia',
        markdown: 'use `total: 3` com cuidado.\n```js\nreturn 1;\n```\n```\ncode sem tag não conta\n```',
        tag: '',
      },
    ]);
    assert.deepEqual(blocosDeCodigoDaTeoria(draft), [
      { secao: 'codificada', codigo: 'let x = 1;' },
      { secao: 'prosa', codigo: 'return 1;\n' },
    ]);
  });

  it('resumoDaTeoria: o que o autor de desafio recebe — seções, construções (via extrator) e termos, determinístico', () => {
    const draft = teoria([{ id: 't1', secao: 'teoria', markdown: 'let total = 1;', tag: 'javascript' }], ['parâmetro', 'função']);
    const resumo = resumoDaTeoria(draft);
    assert.match(resumo, /=== RESUMO DA TEORIA ESCRITA \(esqueleto da aula\) ===/);
    assert.match(resumo, /- \[teoria\] t1/);
    assert.match(resumo, /- decl:let/);
    assert.match(resumo, /- função\n {2}- parâmetro/, 'termos em ordem estável');
    assert.equal(resumoDaTeoria(draft), resumo, 'determinístico');
    const vazio = resumoDaTeoria(teoria([]));
    assert.match(vazio, /\(nenhuma seção no esqueleto\)/);
    assert.match(vazio, /\(nenhuma construção em blocos de código\)/);
    assert.match(vazio, /\(nenhum termo novo\)/);
  });

  it('gate A4: teoria é LIDA — só a faixa RECEPTIVA vale; ofensas saem em ordem estável', () => {
    const codigo = 'let t = a + b + 1;';
    const draft = teoria([{ id: 't1', secao: 'teoria', markdown: codigo, tag: 'javascript' }]);
    const todas = chavesDe(codigo);
    assert.deepEqual(ofensasDeOrcamentoDaTeoria(draft, todas), { ofensas: [], falhaDeParse: null });

    const semOp = new Set([...todas].filter((k) => k !== 'op:binary:+'));
    const r = ofensasDeOrcamentoDaTeoria(draft, semOp);
    assert.equal(r.falhaDeParse, null);
    assert.equal(r.ofensas.length, 1);
    assert.equal(r.ofensas[0].construcao, 'op:binary:+');
  });

  it('bloco que não parseia é FALHA declarada (fail-closed: prosa re-tagueada como código é defeito de build)', () => {
    const draft = teoria([{ id: 't1', secao: 'drill', markdown: 'function (', tag: 'javascript' }]);
    const r = ofensasDeOrcamentoDaTeoria(draft, new Set());
    assert.deepEqual(r.ofensas, []);
    assert.equal(r.falhaDeParse?.secao, 't1', 'o bloco carrega o ID da seção (rastreabilidade)');
    assert.match(r.falhaDeParse?.mensagem ?? '', /Identifier expected/);
  });

  it('dividirEmBatches e a identidade das chamadas de autoria', () => {
    assert.deepEqual(dividirEmBatches([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
    assert.deepEqual(dividirEmBatches([1, 2], 5), [[1, 2]]);
    assert.deepEqual(dividirEmBatches([], 3), []);
    assert.deepEqual([...ETAPAS_AUTORIA], ['f7-teoria-esqueleto', 'f8-desafio', 'f7-teoria-fechamento'], 'ordem fixa §4.3');
    assert.equal(TETO_ONDA_AUTORIA, 15);
    assert.equal(TIMEOUT_AUTORIA_MS, 120_000);
  });
});

// ---------------------------------------------------------------------------
// 3. F8 — desafio: portão do dossiê, gates por faixa e A6
// ---------------------------------------------------------------------------

describe('F8-desafio — portão do dossiê (A-P11-2)', () => {
  it('dossiê completo passa normalizado; campo ausente RECUSA o spawn nomeando o campo', () => {
    assert.deepEqual(montarDossieDeDesafio(dossieDesafio()), dossieDesafio());
    for (const campo of ['aula_slug', 'objetivo', 'kc_type', 'ei_class', 'budget_produtivo', 'resumo_da_teoria', 'desafios_anteriores']) {
      const parcial = { ...dossieDesafio() } as Record<string, unknown>;
      delete parcial[campo];
      assert.throws(
        () => montarDossieDeDesafio(parcial),
        (erro: unknown) =>
          erro instanceof ErroDossieDeDesafioIncompleto && erro.campoFaltante === campo && /spawn do autor de desafio é recusado/.test(erro.message),
        `campo ${campo} deveria recusar o spawn`,
      );
    }
    assert.throws(
      () => montarDossieDeDesafio('não-objeto'),
      (erro: unknown) => erro instanceof ErroDossieDeDesafioIncompleto && erro.campoFaltante === null,
    );
    assert.throws(
      () => montarDossieDeDesafio(dossieDesafio({ ei_class: 'medio' as never })),
      (erro: unknown) => erro instanceof ErroDossieDeDesafioIncompleto && erro.campoFaltante === 'ei_class',
      'shape inválido também nomeia o campo',
    );
  });

  it('a saída do autor tem raciocínio ANTES da decisão (INV-04) e é schema FECHADO', () => {
    assert.deepEqual(Object.keys(DesafioAuthorOutputSchema.shape)[0], 'raciocinio_de_projeto', 'raciocínio no índice 0');
    assert.equal(DesafioAuthorOutputSchema.safeParse(saidaDesafio()).success, true);
    const semRaciocinio = { ...saidaDesafio() } as Record<string, unknown>;
    delete semRaciocinio.raciocinio_de_projeto;
    assert.equal(DesafioAuthorOutputSchema.safeParse(semRaciocinio).success, false);
    assert.equal(DesafioAuthorOutputSchema.safeParse(saidaDesafio({ expectedTestCount: 0 } as never)).success, false);
    assert.equal(ETAPA_DESAFIO, 'f8-desafio');
    assert.equal(STAGE_VERSION_DESAFIO, 'f8-desafio-v1');
    assert.equal(TIMEOUT_DESAFIO_MS, 120_000);
  });
});

describe('F8-desafio — construções permitidas, provas e gates por faixa (§3.3)', () => {
  it('construcoesPermitidasDoDesafio = união das três faixas, deduplicada em ordem de 1ª aparição', () => {
    const d = dossieDesafio({
      budget_receptivo: ['decl:let', 'node:Block'],
      budget_produtivo: ['op:binary:+', 'decl:let'],
      budget_teste: ['api:node:test'],
    });
    assert.deepEqual(construcoesPermitidasDoDesafio(d), ['decl:let', 'node:Block', 'op:binary:+', 'api:node:test']);
  });

  it('montarInputDasProvas é literal: os 3 códigos do draft + expectedTestCount', () => {
    const draft = saidaDesafio();
    assert.deepEqual(montarInputDasProvas(draft), {
      solutionCode: draft.solutionCode,
      starterCode: draft.starterCode,
      testsCode: draft.testsCode,
      expectedTestCount: 1,
    });
  });

  it('cada superfície valida contra a faixa PRÓPRIA (solution→produtivo, starter→receptivo, tests→teste)', () => {
    const draft = saidaDesafio();
    const todas = {
      solucao: chavesDe(draft.solutionCode),
      starter: chavesDe(draft.starterCode),
      testes: chavesDe(draft.testsCode),
    };
    // starter tem 'op:binary:+' FORA do receptivo mas DENTRO do produtivo: a
    // ofensa existe mesmo assim — starter valida contra o RECEPTIVO.
    const comOp = saidaDesafio({ starterCode: 'export function soma(a, b) { return a + b; }' });
    const r = ofensasDeOrcamentoDoDesafio(
      comOp,
      {
        receptivo: new Set([...chavesDe(comOp.starterCode)].filter((k) => k !== 'op:binary:+')),
        produtivo: chavesDe(comOp.solutionCode),
        teste: todas.testes,
      },
      new Set(['op:binary:+']),
    );
    assert.deepEqual(r.ofensas.map((o) => o.construcao), ['op:binary:+'], 'starter × receptivo, não × produtivo');
    assert.equal(r.falhaDeParse, null);

    // solução sem nenhuma construção INTRODUZIDA é A6 (direção não puxada).
    const r2 = ofensasDeOrcamentoDoDesafio(
      draft,
      { receptivo: todas.starter, produtivo: todas.solucao, teste: todas.testes },
      new Set(['node:IfStatement']),
    );
    assert.deepEqual(r2.ofensas, [], 'dentro das faixas não há ofensa');
    assert.equal(r2.solucaoSemProducao, true, 'A6: a solução não cobra o introduzido');
    const r3 = ofensasDeOrcamentoDoDesafio(
      draft,
      { receptivo: todas.starter, produtivo: todas.solucao, teste: todas.testes },
      new Set(['op:binary:+']),
    );
    assert.equal(r3.solucaoSemProducao, false, 'direção puxada: a solução usa o introduzido');
  });

  it('superfície que não parseia é falha declarada nomeando o CAMPO (fail-closed)', () => {
    const draft = saidaDesafio({ testsCode: 'function (' });
    const r = ofensasDeOrcamentoDoDesafio(draft, { receptivo: new Set(), produtivo: new Set(), teste: new Set() }, new Set());
    assert.equal(r.falhaDeParse?.campo, 'testsCode');
    assert.match(r.falhaDeParse?.mensagem ?? '', /Identifier expected/);
  });

  it('o prompt do autor embebe o dossiê congelado e a anti-repetição (A-P11-3)', () => {
    const prompt = gerarPromptAutorDeDesafio(
      dossieDesafio({
        budget_receptivo: ['decl:let'],
        desafios_anteriores: [{ slug: 'soma-1', titulo: 'Soma 1', requisitos: ['soma simples'] }],
      }),
    );
    assert.match(prompt, /=== DOSSIE DE DESAFIO \(entrada congelada\) ===/);
    assert.match(prompt, /objetivo\.verbo: implementar/);
    assert.match(prompt, /resumo da teoria|resumo_da_teoria|a aula apresentou declaração e retorno\./);
    assert.match(prompt, /- soma-1|Soma 1/);
    assert.match(prompt, /\n$/);
    assert.match(gerarPromptAutorDeDesafio(dossieDesafio()), /\(nenhum desafio anterior na trilha — este é o primeiro\)/);
  });
});
