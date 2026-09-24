/**
 * tests/cx-phases-f12.test.ts — CARACTERIZAÇÃO (golden master) de
 * `phases/f12Materialize.ts` (o integrador/materializador da trilha).
 *
 * PINA: a ÁRVORE DE PRODUTO exata (track.json / module.json / lesson.json /
 * challenge.json nos caminhos canônicos, JSON 2 espaços + newline), as
 * validações de integridade do dossiê (INV-08 schemaVersion, hash do
 * orçamento, bijeção drafts↔orçamento, budgetHash por aula, refs de desafio,
 * duplicatas, research URL, tags de teoria) com o MaterializeError estruturado
 * (ARVORE_INVALIDA carrega as issues do validador de produto), a escrita em
 * disco (escreverArvore) e o ciclo materializarTrilha (SLUG_INVALIDO,
 * DESTINO_COLIDE).
 *
 * Sem LLM: tmpdirs próprios; orçamento F4 derivado dos próprios helpers de F5.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  MaterializeError,
  escreverArvore,
  materializarTrilha,
  montarArvoreDeProduto,
  type DossieDeTrilha,
} from '../electron/main/engine/phases/f12Materialize';
import { hashDoOrcamento, type BudgetF4 } from '../electron/main/engine/phases/f4Budget';
import { derivarSnapshots } from '../electron/main/engine/phases/f5Freeze';

// ---------------------------------------------------------------------------
// Fixtures (o dossiê completo, com o budgetHash real da fatia da aula)
// ---------------------------------------------------------------------------

function orcamentoDeTrilha(): BudgetF4 {
  const semHash = {
    aulas: [
      {
        ref: 'm1/a1',
        entryConstructs: ['decl:let'],
        budget_entrada: { receptive: ['decl:let'], productive: ['decl:let'] },
        budget_saida: { receptive: ['decl:let'], productive: ['decl:let', 'op:binary:+'] },
        introduces: { receptive: [], productive: ['op:binary:+'] },
        matrix: [{ construcao: 'op:binary:+', estado: 'nova' }],
        element_count: 1,
        tetos: { construcoes_produtivas_novas: 2, elementos_interagindo: 4, elementos_nao_interativos: 7, tempo_resolucao_s: 120 },
      },
    ],
    fonte: 'declared' as const,
    politica_de_harness: 'receptive-seed' as const,
  };
  return { ...semHash, hash: hashDoOrcamento(semHash) } as unknown as BudgetF4;
}

function lessonDraft(over: Record<string, unknown> = {}): Record<string, unknown> {
  const orcamento = orcamentoDeTrilha();
  const snapshot = derivarSnapshots(orcamento)[0];
  return {
    slug: 'a1',
    title: 'Aula 1',
    objective: { verbo: 'declarar', enunciado: 'variáveis', contexto: 'programas simples', criterio: 'compila' },
    introduces: { receptive: ['decl:let'], productive: ['op:binary:+'] },
    introducesTerms: [],
    foraDeEscopo: ['closures'],
    eiClass: 'fato',
    targetAtom: 'decl:let',
    notionalMachineDelta: 'o binding passa a existir',
    budgetHash: snapshot.budgetHash,
    budgetVersion: '1',
    research: ['https://exemplo.com/fonte'],
    theory: [{ id: 'teoria-1', secao: 'teoria', markdown: 'let x = 1;', tag: '' }],
    justificativa: 'primeira unidade de estado',
    role: 'regular',
    status: 'rascunho',
    aprovado: false,
    ...over,
  };
}

function challengeDraft(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug: 'soma',
    conceito: 'variaveis',
    language: 'javascript',
    statement: 'implemente soma',
    starterCode: 'export function soma() {}',
    solutionCode: 'export function soma(a, b) { return a + b; }',
    testsCode: "test('soma', () => {});",
    expectedTestCount: 1,
    outputChannel: 'retorno',
    requires: [],
    notRequired: [],
    subgoals: [],
    scenarios: [{ tipo: 'exemplo', derivado_de: 'op:binary:+', descricao: 'soma simples' }],
    taskSkill: 'implementar função',
    supportLevel: 'sem_andaime',
    surfaceDomain: 'números',
    solutionAlternates: [],
    wrongSolutions: [],
    requirements: [{ id: 'r1', descricao: 'soma correta', teste: 'soma' }],
    justificativa: 'exercita o introduzido',
    aprovado: false,
    ...over,
  };
}

function dossie(over: Record<string, unknown> = {}): DossieDeTrilha {
  return {
    slug: 'js-do-zero',
    title: 'JS do zero',
    description: 'primeira trilha',
    language: 'pt-BR',
    domain: 'programming',
    modulos: [{ slug: 'm1', title: 'Módulo 1', order: 1 }],
    aulas: [{ modulo: 'm1', draft: lessonDraft() as never }],
    desafios: [{ ref: 'm1/a1', draft: challengeDraft() as never }],
    orcamento: orcamentoDeTrilha() as never,
    ...over,
  } as DossieDeTrilha;
}

async function tmpDir(): Promise<string> {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'do-cxph-f12-'));
}

// ---------------------------------------------------------------------------
// 1. A árvore de produto (pura, em memória)
// ---------------------------------------------------------------------------

describe('F12 — montarArvoreDeProduto (a árvore canônica)', () => {
  it('gera EXATAMENTE os 4 arquivos canônicos, caminho absoluto sob o destino', () => {
    const destino = '/destino/js-do-zero';
    const arquivos = montarArvoreDeProduto(dossie(), destino);
    assert.deepEqual(
      arquivos.map((a) => a.caminho),
      [
        '/destino/js-do-zero/track.json',
        '/destino/js-do-zero/modules/m1/module.json',
        '/destino/js-do-zero/modules/m1/lessons/a1/lesson.json',
        '/destino/js-do-zero/modules/m1/lessons/a1/challenges/soma/challenge.json',
      ],
    );
    for (const a of arquivos) {
      assert.ok(a.conteudo.endsWith('}\n'), 'JSON pretty (2 espaços) + newline final');
      assert.doesNotThrow(() => JSON.parse(a.conteudo));
    }
  });

  it('o produto derivado carrega identidade + orçamento (lesson.json observável)', () => {
    const arquivos = montarArvoreDeProduto(dossie(), '/destino/js-do-zero');
    const lesson = JSON.parse(arquivos[2].conteudo) as Record<string, unknown>;
    assert.equal(lesson.slug, 'a1');
    assert.equal(lesson.title, 'Aula 1');
    const theory = lesson.theory as Array<Record<string, unknown>>;
    assert.equal(theory[0].id, 'teoria-1');
    assert.ok('title' in theory[0] && 'markdown' in theory[0]);
    const challenge = JSON.parse(arquivos[3].conteudo) as Record<string, unknown>;
    assert.equal(challenge.slug, 'soma');
    assert.equal(challenge.language, 'javascript');
  });

  it('INV-08: schemaVersion do dossiê é comparado por IGUALDADE ESTRITA (≠1 nunca é escrito)', () => {
    assert.throws(
      () => montarArvoreDeProduto(dossie({ schemaVersion: 2 }), '/d/x'),
      (erro: unknown) => erro instanceof MaterializeError && erro.code === 'SCHEMA_VERSION_BUMP' && /INV-08/.test(erro.message),
    );
    assert.doesNotThrow(() => montarArvoreDeProduto(dossie({ schemaVersion: 1 }), '/d/x'));
  });

  it('orçamento: ausente ou com hash adulterado NÃO materializa', () => {
    const semAulas = dossie({ orcamento: { ...orcamentoDeTrilha(), aulas: [] } });
    assert.throws(
      () => montarArvoreDeProduto(semAulas, '/d/x'),
      (erro: unknown) => erro instanceof MaterializeError && erro.code === 'ORCAMENTO_AUSENTE',
    );
    const adulterado = dossie({ orcamento: { ...orcamentoDeTrilha(), hash: 'a'.repeat(64) } });
    assert.throws(
      () => montarArvoreDeProduto(adulterado, '/d/x'),
      (erro: unknown) => erro instanceof MaterializeError && erro.code === 'ORCAMENTO_INVALIDO' && /adulterado/.test(erro.message),
    );
  });

  it('drafts fora do contrato P-04 são ARVORE_INVALIDA com as issues do validador de PRODUTO anexadas', () => {
    const quebrado = dossie({ aulas: [{ modulo: 'm1', draft: lessonDraft({ foraDeEscopo: [] }) }] });
    assert.throws(
      () => montarArvoreDeProduto(quebrado, '/d/x'),
      (erro: unknown) => {
        assert.ok(erro instanceof MaterializeError);
        assert.equal(erro.code, 'ARVORE_INVALIDA');
        assert.ok(erro.issues.length > 0, 'issues anexadas (nunca só uma mensagem)');
        assert.match(erro.issues.map((i) => i.message).join('\n'), /LessonDraftSchema|foraDeEscopo/);
        return true;
      },
    );
  });

  it('bijection drafts ↔ orçamento e budgetHash por aula são verificados (fail-closed)', () => {
    const semOrcamentoDaAula = dossie({ orcamento: { ...orcamentoDeTrilha(), aulas: [] as never } });
    assert.throws(
      () => montarArvoreDeProduto(semOrcamentoDaAula, '/d/x'),
      (erro: unknown) => erro instanceof MaterializeError && ['ORCAMENTO_AUSENTE', 'AULA_SEM_ORCAMENTO'].includes(erro.code),
    );
    const orcamentoSemAula = dossie({
      aulas: [],
      desafios: [],
      orcamento: orcamentoDeTrilha(),
    });
    assert.throws(
      () => montarArvoreDeProduto(orcamentoSemAula, '/d/x'),
      (erro: unknown) => erro instanceof MaterializeError && ['ORCAMENTO_SEM_AULA', 'ARVORE_INVALIDA'].includes(erro.code),
    );
    const hashErrado = dossie({ aulas: [{ modulo: 'm1', draft: lessonDraft({ budgetHash: 'b'.repeat(64) }) }] });
    assert.throws(
      () => montarArvoreDeProduto(hashErrado, '/d/x'),
      (erro: unknown) => erro instanceof MaterializeError && erro.code === 'BUDGET_HASH_DIVERGENTE',
    );
  });

  it('refs de desafio, duplicatas, research e tags de teoria têm erro NOMEADO', () => {
    assert.throws(
      () => montarArvoreDeProduto(dossie({ desafios: [{ ref: 'modulo/fantasma', draft: challengeDraft() }] }), '/d/x'),
      (erro: unknown) => erro instanceof MaterializeError && ['REF_INVALIDA', 'ARVORE_INVALIDA'].includes(erro.code),
    );
    const duplicada = dossie({
      aulas: [
        { modulo: 'm1', draft: lessonDraft() },
        { modulo: 'm1', draft: lessonDraft() },
      ],
    });
    assert.throws(
      () => montarArvoreDeProduto(duplicada, '/d/x'),
      (erro: unknown) => erro instanceof MaterializeError && ['DUPLICADO', 'ARVORE_INVALIDA'].includes(erro.code),
    );
    const researchRuim = dossie({ aulas: [{ modulo: 'm1', draft: lessonDraft({ research: ['apenas texto'] }) }] });
    assert.throws(
      () => montarArvoreDeProduto(researchRuim, '/d/x'),
      (erro: unknown) => erro instanceof MaterializeError && ['RESEARCH_NAO_URL', 'ARVORE_INVALIDA'].includes(erro.code),
    );
    const tagRuim = dossie({
      aulas: [{ modulo: 'm1', draft: lessonDraft({ theory: [{ id: 't', secao: 'teoria', markdown: 'x', tag: 'linguagem-inventada' }] }) }],
    });
    assert.throws(
      () => montarArvoreDeProduto(tagRuim, '/d/x'),
      (erro: unknown) =>
        erro instanceof MaterializeError && ['TAG_DE_TEORIA_DESCONHECIDA', 'ARVORE_INVALIDA'].includes(erro.code),
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Escrita em disco e o ciclo materializarTrilha
// ---------------------------------------------------------------------------

describe('F12 — escreverArvore e materializarTrilha', () => {
  it('escreverArvore materializa cada arquivo (mkdir + conteúdo byte a byte)', async () => {
    const dir = await tmpDir();
    const arquivos = montarArvoreDeProduto(dossie(), dir);
    await escreverArvore(dir, arquivos);
    for (const a of arquivos) {
      const emDisco = await fsp.readFile(a.caminho, 'utf8');
      assert.equal(emDisco, a.conteudo);
    }
    assert.ok((await fsp.stat(path.join(dir, 'track.json'))).isFile());
  });

  it('materializarTrilha: cria a trilha completa e devolve o placar de arquivos', async () => {
    const dir = await tmpDir();
    const destino = path.join(dir, 'js-do-zero');
    const r = await materializarTrilha({} as never, dossie(), destino);
    assert.deepEqual(r, { slug: 'js-do-zero', destino, arquivos: 4 });
    assert.ok((await fsp.stat(path.join(destino, 'track.json'))).isFile());
  });

  it('slug inválido e destino que JÁ é trilha são recusados antes de qualquer escrita', async () => {
    const dir = await tmpDir();
    await assert.rejects(
      materializarTrilha({} as never, dossie({ slug: 'Slug Inválido' }), path.join(dir, 'x')),
      (erro: unknown) => erro instanceof MaterializeError && erro.code === 'SLUG_INVALIDO' && /kebab-case/.test(erro.message),
    );

    const destino = path.join(dir, 'js-do-zero');
    await materializarTrilha({} as never, dossie(), destino);
    await assert.rejects(
      materializarTrilha({} as never, dossie(), destino),
      (erro: unknown) => erro instanceof MaterializeError && erro.code === 'DESTINO_COLIDE' && /escrever por cima é proibido/.test(erro.message),
    );
  });
});
