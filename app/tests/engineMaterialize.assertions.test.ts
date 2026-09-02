/**
 * tests/engineMaterialize.assertions.test.ts — REGRESSÃO da propagação
 * F7→produto das AFIRMAÇÕES (onda 1 schema-quiz, §10 do
 * docs/16-engine-de-trilha.md): o integrador F12 (`montarAulaDeProduto` em
 * f12Materialize.ts) copia `draft.assertions` VERBATIM para o lesson.json de
 * produto, e o `LessonDraftSchema` materializa a AUSÊNCIA como `[]` explícito
 * (z.preprocess undefined→[], INV-05 — nada opcional).
 *
 * O que este arquivo PROVA:
 *   1. draft COM assertions (3 itens, o teto do produto) → o lesson.json
 *      materializado contém o campo VERBATIM (deep-equal) e o loader
 *      (`loadTrack`) carrega sem NENHUMA issue expondo o campo via
 *      `meta.assertions` (o loader faz cast, não pick — docs §10);
 *   2. draft SEM o campo `assertions` → (a) o `LessonDraftSchema.parse`
 *      materializa `[]` (comportamento do z.preprocess — a fiação da F12
 *      entrega `aulaOk.data`, já parseado, ver geraTrilha.lerDraftsDaAula);
 *      (b) o lesson.json de produto carrega `"assertions": []` (aula sem
 *      quiz é VÁLIDA no produto — trilhas antigas continuam passando com
 *      0 issues) e o `loadTrack` fica OK.
 *
 * Sem rede, sem LLM, ZERO processos; o único IO é em diretórios TEMPORÁRIOS
 * criados e limpos pelo próprio teste — nunca resources/tracks real.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

import type { z } from 'zod';
import { conceptId, type Concept, type ConceptGraph } from '../electron/main/engine/graph/model';
import { deriveBudgetDoGrafo, type AulaPlano, type BudgetF4 } from '../electron/main/engine/phases/f4Budget';
import { derivarSnapshots } from '../electron/main/engine/phases/f5Freeze';
import { LessonDraftSchema, type AssertionDraftSchema } from '../electron/main/engine/schemas/artifacts';
import { loadTrack } from '../electron/main/content/trackLoader';
import { LESSON_FILE } from '../electron/main/content/trackTypes';
import { mkTempDir, rmrf } from './_helpers/fs';
import {
  type ChallengeDraft,
  type DossieDeTrilha,
  type LessonDraft,
  materializarTrilha,
} from '../electron/main/engine/phases/f12Materialize';

// ---------------------------------------------------------------------------
// Fixtures PURAS (nenhum IO) — uma trilha de 1 módulo × 1 aula × 1 desafio
// ---------------------------------------------------------------------------

type AssertionDraft = z.infer<typeof AssertionDraftSchema>;

function conc(id: string, over: Partial<Concept> = {}): Concept {
  return { id: conceptId(id), desbloqueadoPor: [], usa: [], ...over };
}

/** 1 conceito → 1 aula: o dossiê mínimo que a F12 exige. */
function orcamentoDaFixture(): BudgetF4 {
  const variaveis = conceptId('variaveis');
  const grafo: ConceptGraph = { conceitos: [conc('variaveis')] };
  const aulas: AulaPlano[] = [{ ref: 'modulo-1/variaveis', introduz: [variaveis] }];
  const { budget } = deriveBudgetDoGrafo({ grafo, aulas, entryConstructs: [] });
  return budget;
}

/** 3 afirmações válidas (o teto do produto) — shape AssertionDraftSchema. */
function tresAssertions(): AssertionDraft[] {
  return [
    {
      id: 'afirmacao-variavel',
      // REPLAN A1: a assertion de DRAFT carrega a âncora (sectionId) — o
      // AssertionDraftSchema exige não-vazio; 'o-que-e-variavel' é o id da
      // teoria do fixture. O teste 1 prova que o sectionId PROPAGA verbatim.
      sectionId: 'o-que-e-variavel',
      statement: 'Uma variável guarda um valor em memória.',
      question: 'O que uma variável guarda?',
      options: ['Um valor em memória', 'Uma conta no terminal', 'Um arquivo', 'Uma palavra-chave'],
      answerIndex: 0,
      feedback: 'A variável é uma caixa nomeada que guarda um valor.',
    },
    {
      id: 'afirmacao-atribuicao',
      sectionId: 'o-que-e-variavel',
      statement: 'Atribuir é escolher o valor que a variável guarda.',
      question: 'O que faz o `=` em `let total = 1`?',
      options: ['Compara dois valores', 'Atribui o 1 à variável total', 'Declara uma função', 'Imprime na tela'],
      answerIndex: 1,
      feedback: 'O `=` atribui: guarda o valor 1 na caixa total.',
    },
    {
      id: 'afirmacao-declaracao',
      sectionId: 'o-que-e-variavel',
      statement: 'Declarar é escolher o nome da caixa antes de usá-la.',
      question: 'Em `let total = 1`, o que é o `let total`?',
      options: ['A declaração da variável', 'A chamada da função', 'O teste', 'A saída'],
      answerIndex: 0,
      feedback: '`let total` declara a caixa; o `= 1` atribui o valor.',
    },
  ];
}

function lessonDraft(over: Partial<LessonDraft>): LessonDraft {
  const base: LessonDraft = {
    slug: 'variaveis',
    title: 'Variáveis',
    objective: {
      verbo: 'declarar',
      enunciado: 'Declarar uma variável com let e atribuir um valor.',
      contexto: 'o aluno já entende o que é um programa (axioma)',
      criterio: 'a variável declarada é usada no desafio sem erro',
    },
    introduces: {
      receptive: ['decl:let', 'node:VariableDeclaration', 'op:assign:=', 'node:NumericLiteral'],
      productive: ['op:assign:=', 'node:NumericLiteral'],
    },
    introducesTerms: ['atribuição'],
    foraDeEscopo: ['constantes', 'escopo de bloco'],
    eiClass: 'regra',
    targetAtom: 'decl:let',
    notionalMachineDelta: 'a máquina ganha uma caixa nomeada que guarda um valor',
    budgetHash: '',
    budgetVersion: '1',
    research: [],
    theory: [
      {
        id: 'o-que-e-variavel',
        secao: 'teoria',
        markdown: 'Uma variável guarda um valor em memória.\n\nDeclarar é escolher o nome da caixa.',
        tag: '',
      },
    ],
    // ADITIVO (onda 1 schema-quiz): SEMPRE presente no literal; o teste "sem
    // assertions" DELETA a chave para exercitar o z.preprocess (undefined→[]).
    assertions: [],
    justificativa: 'aula mínima que introduz a declaração com atribuição',
    role: 'regular',
    status: 'aprovado',
    aprovado: true,
  };
  return { ...base, ...over };
}

function challengeDraft(over: Partial<ChallengeDraft>): ChallengeDraft {
  const base: ChallengeDraft = {
    slug: 'declarar-variavel',
    conceito: 'variaveis',
    language: 'nodejs',
    statement: 'Declare uma variável chamada total com o valor 1.',
    starterCode: 'export let total;',
    solutionCode: 'export let total = 1;',
    testsCode: "import { total } from './solution.mjs';\ntest('total existe', () => { assert.equal(total, 1); });",
    expectedTestCount: 1,
    outputChannel: 'retorno',
    requires: ['op:assign:='],
    notRequired: ['constantes'],
    subgoals: ['declarar', 'atribuir'],
    scenarios: [{ tipo: 'exemplo', derivado_de: 'op:assign:=', descricao: 'uma atribuição com literal' }],
    taskSkill: 'declarar-e-atribuir',
    supportLevel: 'com_andaime',
    surfaceDomain: 'ordem-de-execucao',
    solutionAlternates: [],
    wrongSolutions: [],
    requirements: [{ id: 'R1', descricao: 'a variável existe', teste: 'total existe' }],
    justificativa: 'desafio mínimo da aula de variáveis',
    aprovado: true,
  };
  return { ...base, ...over };
}

/** preenche os budgetHash dos drafts com a fatia congelada (fórmula do f5Freeze). */
function carimbarBudgetHash(drafts: DossieDeTrilha, orcamento: BudgetF4): void {
  const snapshots = derivarSnapshots(orcamento);
  const porRef = new Map(snapshots.map((s) => [s.aula_slug, s.budgetHash]));
  for (const aula of drafts.aulas) {
    const ref = `${aula.modulo}/${aula.draft.slug}`;
    aula.draft = { ...aula.draft, budgetHash: porRef.get(ref) ?? '' };
  }
}

/** o dossiê completo (1 módulo, 1 aula, 1 desafio) com o draft de aula DADO. */
function dossieCom(draftDaAula: LessonDraft): DossieDeTrilha {
  const orcamento = orcamentoDaFixture();
  const dossie: DossieDeTrilha = {
    slug: 'trilha-assertions',
    title: 'Trilha Assertions',
    description: 'Trilha de regressão da propagação F7→produto das afirmações.',
    language: 'pt-BR',
    domain: 'programming',
    modulos: [{ slug: 'modulo-1', title: 'Módulo Um', order: 1 }],
    aulas: [{ modulo: 'modulo-1', draft: draftDaAula }],
    desafios: [{ ref: 'modulo-1/variaveis', draft: challengeDraft({}) }],
    orcamento,
  };
  carimbarBudgetHash(dossie, orcamento);
  return dossie;
}

/** caminho do lesson.json materializado no destino. */
function lessonJsonPath(destino: string): string {
  return path.join(destino, 'modules', 'modulo-1', 'lessons', 'variaveis', LESSON_FILE);
}

describe('F12 — propagação das ASSERTIONS (onda 1 schema-quiz)', () => {
  it('1. draft COM assertions → lesson.json de produto contém o campo VERBATIM + loadTrack OK', async () => {
    const tmp = await mkTempDir('p21-assert-');
    try {
      const destino = path.join(tmp, 'trilha-assertions');
      const tres = tresAssertions();
      const drafts = dossieCom(lessonDraft({ assertions: tres }));

      await materializarTrilha({}, drafts, destino);

      // o JSON materializado carrega o campo VERBATIM (deep-equal, ordem dos itens).
      const lessonJson = JSON.parse(await fsp.readFile(lessonJsonPath(destino), 'utf8')) as Record<string, unknown>;
      assert.deepEqual(lessonJson['assertions'], tres, 'assertions verbatim no lesson.json de produto');
      assert.equal((lessonJson['assertions'] as unknown[]).length, 3, 'as 3 afirmações do draft');

      // o loader carrega sem NENHUMA issue e expõe o campo via meta (cast, não pick).
      const track = await loadTrack(destino);
      assert.equal(track.root.slug, 'trilha-assertions');
      const meta = track.modules[0].lessons[0].meta as unknown as Record<string, unknown>;
      assert.deepEqual(meta['assertions'], tres, 'meta.assertions exposto pelo loader');
    } finally {
      await rmrf(tmp);
    }
  });

  it('2. draft SEM assertions → LessonDraftSchema materializa [] (z.preprocess) e o produto carrega "assertions": [] com loadTrack OK', async () => {
    const tmp = await mkTempDir('p21-assert-');
    try {
      // (a) o draft cru SEM a chave `assertions` — como a fiação da F12
      //     entrega, o draft é PARSEADO pelo schema antes de materializar
      //     (geraTrilha.faseF12 usa `aulaOk.data`): o z.preprocess mapeia a
      //     ausência para o valor vazio EXPLÍCITO [] (INV-05). O draft precisa
      //     de um budgetHash não-vazio para o schema (a F7 escreve o hash
      //     congelado real; o placeholder aqui é só para o parse — o
      //     `carimbarBudgetHash` do dossiê o substitui pelo correto depois).
      const semQuiz = lessonDraft({ budgetHash: 'pre-parse-placeholder' }) as Partial<LessonDraft>;
      delete semQuiz.assertions;
      const parsed = LessonDraftSchema.parse(semQuiz as z.input<typeof LessonDraftSchema>);
      assert.deepEqual(parsed.assertions, [], 'z.preprocess: ausência no draft → [] explícito');

      const destino = path.join(tmp, 'trilha-assertions');
      const drafts = dossieCom(parsed);
      await materializarTrilha({}, drafts, destino);

      // (b) o lesson.json de produto tem a CHAVE presente com valor [] —
      //     aula sem quiz é válida no produto (docs §10).
      const lessonJson = JSON.parse(await fsp.readFile(lessonJsonPath(destino), 'utf8')) as Record<string, unknown>;
      assert.ok('assertions' in lessonJson, 'a chave assertions está PRESENTE no lesson.json (nunca omitida)');
      assert.deepEqual(lessonJson['assertions'], [], 'materializa como [] — mesmo comportamento do z.preprocess');

      // (c) loadTrack OK — trilha antiga/sem quiz carrega com 0 issues.
      const track = await loadTrack(destino);
      assert.equal(track.root.slug, 'trilha-assertions');
      const meta = track.modules[0].lessons[0].meta as unknown as Record<string, unknown>;
      assert.deepEqual(meta['assertions'], [], 'meta.assertions = [] via loader');
    } finally {
      await rmrf(tmp);
    }
  });
});
