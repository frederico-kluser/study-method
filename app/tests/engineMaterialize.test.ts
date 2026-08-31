/**
 * tests/engineMaterialize.test.ts — pacote P-21: F12 · INTEGRADOR ÚNICO +
 * G-FINAL da engine de trilhas (`docs/16-engine-de-trilha.md` §4 F12 ▮, §5.2,
 * §5.4, §10, §11).
 *
 * O que este arquivo PROVA (contrato P-21, critérios A-P21-1/A-P21-2):
 *   1. round-trip: a árvore escrita carrega no loader SEM nenhuma issue
 *      (loadTrack) e a TABELA DE DERIVAÇÃO está correta (summary ←
 *      objective.enunciado, título de seção ← primeira linha do markdown,
 *      challenge.title ← conceito humanizado, difficulty PROVISÓRIO na rampa
 *      1..5, prerequisites ← índice reverso introduces×aula do orçamento,
 *      sources ← research[], extras §10 sobrevivem ao cast do loader);
 *   2. os ÍNDICES são reconstruídos dos DIRETÓRIOS (INV-07): track.json/
 *      module.json/lesson.json casam com o disco; NENHUM draft carrega índice;
 *   3. formato de bytes: 2 espaços de indentação, newline final, UTF-8, LF —
 *      em TODOS os arquivos da árvore;
 *   4. escrita CONCORRENTE simulatA: a escrita é serial por construção (spy
 *      prova in-flight máximo 1 — a API não expõe paralelismo interno) e
 *      DUAS chamadas concorrentes de `materializarTrilha` sobre o MESMO
 *      destino não perdem arquivo (integridade final = árvore completa);
 *   5. G-FINAL REPROVA quando o audit encontra QUALQUER violação (fixture com
 *      `console` no solutionCode → falha nomeando, mesmo com o verificador de
 *      provas fake passando);
 *   6. (bônus) trilha com slug COLIDENTE → erro (DESTINO_COLIDE); dossiê com
 *      schemaVersion bumpado → erro (INV-08 — o integrador nunca escreve um
 *      schemaVersion diferente do trackTypes);
 *   7. (bônus) G-FINAL reprova quando a QUARTA prova falha (verificador fake
 *      devolvendo inválido → falha nomeando o ref do desafio);
 *   8. (bônus) G-FINAL repassa desafios MULTI-ARQUIVO (files[], rodada 9) às
 *      provas com os arquivos intactos (solutionFiles/starterFiles);
 *   9. (fail-closed, revisão) `raizDeTrilhas` com erro de IO NÃO-ENOENT de
 *      listTrackSlugs (EACCES) → PROPAGA e NADA é escrito; raiz AUSENTE
 *      (ENOENT) → fluxo normal segue (sem trilhas ainda = sem colisão); a
 *      colisão com trilha EXISTENTE na raiz continua DESTINO_COLIDE.
 *
 * Sem rede, sem LLM, ZERO processos: o verificador das provas é FAKE (a
 * suíte nunca roda `node --test`); o único IO é em diretórios TEMPORÁRIOS
 * criados e limpos pelo próprio teste — nunca resources/tracks real.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

import { conceptId, type Concept, type ConceptGraph } from '../electron/main/engine/graph/model';
import { deriveBudgetDoGrafo, type AulaPlano, type BudgetF4 } from '../electron/main/engine/phases/f4Budget';
import { derivarSnapshots } from '../electron/main/engine/phases/f5Freeze';
import { loadTrack } from '../electron/main/content/trackLoader';
import { CHALLENGE_FILE, LESSON_FILE, MODULE_FILE, PROFICIENCY_FILE, TRACK_FILE } from '../electron/main/content/trackTypes';
import { mkTempDir, rmrf, writeFile } from './_helpers/fs';
import {
  MaterializeError,
  type ChallengeDraft,
  type DesafioAProvar,
  type DossieDeTrilha,
  type LessonDraft,
  type VerificarDesafioFn,
  escreverArvore,
  gFinal,
  materializarTrilha,
  montarArvoreDeProduto,
} from '../electron/main/engine/phases/f12Materialize';

// ---------------------------------------------------------------------------
// Fixtures PURAS (nenhum IO) — a trilha de draft em memória
// ---------------------------------------------------------------------------

function conc(id: string, over: Partial<Concept> = {}): Concept {
  return { id: conceptId(id), desbloqueadoPor: [], usa: [], ...over };
}

function grafoDoisConceitos(): { grafo: ConceptGraph; variaveis: ReturnType<typeof conceptId>; constantes: ReturnType<typeof conceptId> } {
  const variaveis = conceptId('variaveis');
  const constantes = conceptId('constantes');
  const grafo: ConceptGraph = {
    conceitos: [conc('variaveis'), conc('constantes', { desbloqueadoPor: [variaveis] })],
  };
  return { grafo, variaveis, constantes };
}

/**
 * O orçamento F4 CONGELADO da fixture (derivado do grafo, como a F4 faz):
 * m1/variaveis introduz 'variaveis'; m2/constantes introduz 'constantes'
 * (desbloqueado por variaveis). Usado pelo integrador para a ordem canônica,
 * os pré-requisitos e o budgetHash dos drafts.
 */
function orcamentoDaFixture(): BudgetF4 {
  const { grafo, variaveis, constantes } = grafoDoisConceitos();
  const aulas: AulaPlano[] = [
    { ref: 'modulo-1/variaveis', introduz: [variaveis] },
    { ref: 'modulo-2/constantes', introduz: [constantes] },
  ];
  const { budget } = deriveBudgetDoGrafo({ grafo, aulas, entryConstructs: [] });
  return budget;
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
      // receptive é o orçamento de LEITURA (A1: o starter mostra `export let total;`
      // e toda superfície receptiva precisa caber aqui); productive ≤ 2 (I2/A7).
      receptive: [
        'decl:let',
        'node:VariableDeclaration',
        'node:VariableDeclarationList',
        'node:VariableStatement',
        'op:assign:=',
        'node:NumericLiteral',
      ],
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
    statement: 'Declare uma variável chamada total com o valor 1.',
    starterCode: 'export let total;',
    solutionCode: 'export let total = 1;',
    testsCode: "import { total } from './solution.mjs';\ntest('total existe', () => { assert.equal(total, 1); });",
    expectedTestCount: 1,
    outputChannel: 'retorno',
    requires: ['op:assign:='],
    notRequired: ['constantes'],
    subgoals: ['declarar', 'atribuir'],
    scenarios: [
      { tipo: 'exemplo', derivado_de: 'op:assign:=', descricao: 'uma atribuição com literal' },
    ],
    taskSkill: 'declarar-e-atribuir',
    supportLevel: 'com_andaime',
    surfaceDomain: 'ordem-de-execucao',
    solutionAlternates: [],
    wrongSolutions: [],
    requirements: [
      { id: 'R1', descricao: 'a variável existe', teste: 'total existe' },
    ],
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

/** O DOSSIÊ COMPLETO da trilha limpa (2 módulos, 2 aulas, 1 desafio por aula, desafio do módulo e proficiência). */
function dossieCompleto(): DossieDeTrilha {
  const orcamento = orcamentoDaFixture();
  const drafts: DossieDeTrilha = {
    slug: 'trilha-p21',
    title: 'Trilha P-21',
    description: 'Trilha de teste do integrador F12.',
    language: 'pt-BR',
    domain: 'programming',
    entryCriteria: ['somar dois números de cabeça'],
    modulos: [
      { slug: 'modulo-1', title: 'Módulo Um', order: 1 },
      { slug: 'modulo-2', title: 'Módulo Dois', order: 2 },
    ],
    aulas: [
      {
        modulo: 'modulo-1',
        draft: lessonDraft({
          slug: 'variaveis',
          budgetHash: '',
          research: ['https://example.com/guia/variaveis'],
        }),
      },
      {
        modulo: 'modulo-2',
        draft: lessonDraft({
          slug: 'constantes',
          title: 'Constantes',
          objective: {
            verbo: 'declarar',
            enunciado: 'Declarar uma constante com const e entender que ela não muda.',
            contexto: 'o aluno já declara variáveis com let',
            criterio: 'a constante é usada no desafio sem erro',
          },
          introduces: { receptive: ['decl:const', 'op:assign:='], productive: ['decl:const', 'op:assign:='] },
          foraDeEscopo: ['variaveis'],
          targetAtom: 'decl:const',
          notionalMachineDelta: 'a caixa nomeada ganha a trava de não-reatribuição',
          theory: [
            { id: 'o-que-e-constante', secao: 'teoria', markdown: 'Uma constante guarda um valor que nunca muda.', tag: '' },
          ],
        }),
      },
    ],
    desafios: [
      { ref: 'modulo-1', draft: challengeDraft({ slug: 'desafio-modulo-um', conceito: 'variaveis' }) },
      { ref: 'modulo-1/variaveis', draft: challengeDraft({}) },
      {
        ref: 'modulo-2/constantes',
        draft: challengeDraft({
          slug: 'declarar-constante',
          conceito: 'constantes',
          statement: 'Declare uma constante chamada total com o valor 2.',
          solutionCode: 'export const total = 2;',
          subgoals: ['declarar'],
        }),
      },
    ],
    proficiencia: challengeDraft({ slug: 'proficiencia-trilha', conceito: 'dominio_da_trilha' }),
    orcamento,
  };
  const d2: DossieDeTrilha = {
    ...drafts,
    desafios: drafts.desafios.map((d) => ({ ...d, draft: { ...d.draft } })),
    aulas: drafts.aulas.map((a) => ({ ...a, draft: { ...a.draft } })),
  };
  carimbarBudgetHash(d2, orcamento);
  return d2;
}

/** o verificador FAKE das quatro provas — a suíte nunca gera processo. */
const verificadorSempreValido: VerificarDesafioFn = async () => ({ valid: true, falhas: [] });

/** lista os arquivos .json da árvore (para as provas de bytes e integridade). */
async function arquivosJsonDaArvore(destino: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.name.endsWith('.json')) out.push(p);
    }
  };
  await walk(destino);
  return out.sort();
}

// ---------------------------------------------------------------------------
describe('F12 — materializarTrilha (integrador único)', () => {
  it('1. round-trip: a árvore escrita carrega no loader sem issue e a TABELA DE DERIVAÇÃO bate', async () => {
    const tmp = await mkTempDir('p21-mat-');
    try {
      const destino = path.join(tmp, 'trilha-p21');
      const drafts = dossieCompleto();
      const resultado = await materializarTrilha({}, drafts, destino);
      assert.equal(resultado.slug, 'trilha-p21');
      assert.equal(resultado.arquivos, 9, '2 module.json + 2 lesson.json + 1 track.json + 3 desafios de aula + 1 módulo + 1 proficiencia');

      // (a) loadTrack sem NENHUMA issue.
      const track = await loadTrack(destino);
      assert.equal(track.root.slug, 'trilha-p21');
      assert.equal(track.root.title, 'Trilha P-21');
      assert.deepEqual(track.root.modules, ['modulo-1', 'modulo-2']);
      assert.equal(track.modules.length, 2);
      assert.deepEqual(track.modules[0].meta.lessons, ['variaveis']);
      assert.deepEqual(track.modules[1].meta.lessons, ['constantes']);
      assert.equal(track.modules[1].meta.order, 2);
      assert.ok(track.proficiency !== null, 'proficiency.json carregada');
      assert.equal(track.proficiency?.slug, 'proficiencia-trilha');

      // desafio do MÓDULO (rodada 9) e desafios de aula.
      assert.equal(track.modules[0].challenge?.slug, 'desafio-modulo-um');
      assert.deepEqual(
        track.modules[0].lessons[0].challenges.map((c) => c.slug),
        ['declarar-variavel'],
      );
      assert.deepEqual(
        track.modules[1].lessons[0].challenges.map((c) => c.slug),
        ['declarar-constante'],
      );

      // ── TABELA DE DERIVAÇÃO ────────────────────────────────────────────────
      const a1 = track.modules[0].lessons[0].meta;
      const a2 = track.modules[1].lessons[0].meta;

      // summary ← objective.enunciado
      assert.equal(a1.summary, 'Declarar uma variável com let e atribuir um valor.');
      assert.equal(a2.summary, 'Declarar uma constante com const e entender que ela não muda.');

      // título de seção de teoria ← primeira linha elegível do markdown
      assert.equal(a1.theory[0].title, 'Uma variável guarda um valor em memória.');
      assert.equal(a1.theory[0].markdown, 'Uma variável guarda um valor em memória.\n\nDeclarar é escolher o nome da caixa.');

      // challenge.title ← conceito humanizado (aula); prefixos para módulo/proficiência
      assert.equal(track.modules[0].lessons[0].challenges[0].title, 'Variaveis');
      assert.equal(track.modules[0].challenge?.title, 'Desafio do módulo — Variaveis');
      assert.equal(track.proficiency?.title, 'Proficiência — Dominio da trilha');

      // difficulty PROVISÓRIO (rampa 1..5; nenhum gate lê): pos0→3, pos1→5
      assert.equal(a1.difficulty, 3);
      assert.equal(a2.difficulty, 5);
      assert.equal(track.modules[0].lessons[0].challenges[0].difficulty, 3, 'desafio herda a dificuldade da aula');
      assert.equal(track.modules[0].challenge?.difficulty, 3, 'desafio do módulo herda a última aula do módulo');
      assert.equal(track.proficiency?.difficulty, 5, 'proficiência cobre tudo → 5');

      // prerequisites ← índice reverso introduces×aula do ORÇAMENTO
      assert.deepEqual(a1.prerequisites, [], 'aula 1 não tem pré-requisito (entrada = axioma, sem origem)');
      assert.deepEqual(a2.prerequisites, ['variaveis'], 'aula 2: entrada traz "variaveis", cuja origem é a aula 1');

      // concepts ← conceitos dos desafios da aula (I16 por construção)
      assert.deepEqual(a1.concepts, ['variaveis']);
      assert.deepEqual(a2.concepts, ['constantes']);

      // sources ← research[] (URL → {title, url, description})
      assert.deepEqual(a1.sources, [
        { title: 'Variaveis', url: 'https://example.com/guia/variaveis', description: 'https://example.com/guia/variaveis' },
      ]);
      assert.deepEqual(a2.sources, []);

      // ── extras §10 sobrevivem ao cast do loader ────────────────────────────
      const a1Cru = a1 as unknown as Record<string, unknown>;
      assert.deepEqual(a1Cru['objective'], (drafts.aulas[0].draft as LessonDraft).objective);
      assert.deepEqual(a1Cru['introduces'], {
        receptive: [
          'decl:let',
          'node:VariableDeclaration',
          'node:VariableDeclarationList',
          'node:VariableStatement',
          'op:assign:=',
          'node:NumericLiteral',
        ],
        productive: ['op:assign:=', 'node:NumericLiteral'],
      });
      assert.deepEqual(a1Cru['foraDeEscopo'], ['constantes', 'escopo de bloco']);
      assert.equal(a1Cru['budgetVersion'], '1');
      assert.equal(a1Cru['budgetHash'], (drafts.aulas[0].draft as LessonDraft).budgetHash);
      assert.deepEqual(a1Cru['research'], ['https://example.com/guia/variaveis']);
      const chCru = track.modules[0].lessons[0].challenges[0] as unknown as Record<string, unknown>;
      assert.equal(chCru['outputChannel'], 'retorno');
      assert.equal(chCru['supportLevel'], 'com_andaime');
      assert.deepEqual(chCru['scenarios'], [{ tipo: 'exemplo', derivado_de: 'op:assign:=', descricao: 'uma atribuição com literal' }]);
    } finally {
      await rmrf(tmp);
    }
  });

  it('2. índices reconstruídos dos DIRETÓRIOS (INV-07); nenhum draft carrega índice', async () => {
    const tmp = await mkTempDir('p21-mat-');
    try {
      const destino = path.join(tmp, 'trilha-p21');
      const drafts = dossieCompleto();
      await materializarTrilha({}, drafts, destino);

      const track = JSON.parse(await fsp.readFile(path.join(destino, TRACK_FILE), 'utf8')) as { modules: string[] };
      const modulosNoDisco = (await fsp.readdir(path.join(destino, 'modules'))).sort();
      assert.deepEqual(track.modules, modulosNoDisco, 'track.json.modules casa com os diretórios');

      for (const mod of modulosNoDisco) {
        const moduleJson = JSON.parse(
          await fsp.readFile(path.join(destino, 'modules', mod, MODULE_FILE), 'utf8'),
        ) as { lessons: string[] };
        const aulasNoDisco = (await fsp.readdir(path.join(destino, 'modules', mod, 'lessons'))).sort();
        assert.deepEqual(moduleJson.lessons, aulasNoDisco, `module.json.lessons casa com os diretórios (${mod})`);

        for (const aula of moduleJson.lessons) {
          const lessonJson = JSON.parse(
            await fsp.readFile(path.join(destino, 'modules', mod, 'lessons', aula, LESSON_FILE), 'utf8'),
          ) as { challenges: string[] };
          const desafiosNoDisco = (await fsp.readdir(path.join(destino, 'modules', mod, 'lessons', aula, 'challenges'))).sort();
          assert.deepEqual(lessonJson.challenges, desafiosNoDisco, `lesson.json.challenges casa com os diretórios (${mod}/${aula})`);
        }
      }

      // drafts NÃO carregam índice: o dossiê não tem 'modules'/'lessons'/'challenges' agregados.
      const dossieCru = drafts as unknown as Record<string, unknown>;
      assert.equal('modules' in dossieCru, false, 'o dossiê não tem campo índice de módulos');
      for (const aula of drafts.aulas) {
        const aulaCru = aula.draft as unknown as Record<string, unknown>;
        assert.equal('lessons' in aulaCru, false, 'draft de aula não tem índice de aulas');
        assert.equal('challenges' in aulaCru, false, 'draft de aula não tem índice de desafios');
      }
    } finally {
      await rmrf(tmp);
    }
  });

  it('3. formato de bytes em TODOS os arquivos: 2 espaços, newline final, UTF-8, LF', async () => {
    const tmp = await mkTempDir('p21-mat-');
    try {
      const destino = path.join(tmp, 'trilha-p21');
      await materializarTrilha({}, dossieCompleto(), destino);

      const arquivos = await arquivosJsonDaArvore(destino);
      assert.ok(arquivos.length >= 8, 'árvore com os arquivos esperados');
      for (const arquivo of arquivos) {
        const bytes = await fsp.readFile(arquivo);
        assert.ok(!bytes.includes(0x0d), `${path.relative(destino, arquivo)}: contém CR (esperado LF puro)`);
        assert.equal(bytes[bytes.length - 1], 0x0a, `${path.relative(destino, arquivo)}: sem newline final`);
        const conteudo = bytes.toString('utf8');
        assert.ok(!conteudo.endsWith('\n\n'), `${path.relative(destino, arquivo)}: newline final duplicado`);
        assert.ok(conteudo.includes('\n  "schemaVersion":'), `${path.relative(destino, arquivo)}: indentação de 2 espaços`);
        JSON.parse(conteudo); // válido
      }
    } finally {
      await rmrf(tmp);
    }
  });

  it('4. escrita serial por construção + duas chamadas concorrentes não perdem arquivo', async () => {
    const tmp = await mkTempDir('p21-mat-');
    try {
      const destino = path.join(tmp, 'trilha-p21');
      const drafts = dossieCompleto();

      // (a) a API NÃO expõe escrita paralela: spy nas escrita de arquivo prova
      //     in-flight máximo 1 dentro de uma materialização inteira.
      let inflight = 0;
      let maxInflight = 0;
      const spy: (p: string, c: string) => Promise<void> = async (p, c) => {
        inflight += 1;
        maxInflight = Math.max(maxInflight, inflight);
        try {
          await fsp.writeFile(p, c, 'utf8');
        } finally {
          inflight -= 1;
        }
      };
      await materializarTrilha({ escreverArquivo: spy }, drafts, destino);
      assert.equal(maxInflight, 1, 'a escrita da árvore é ESTRITAMENTE sequencial (for…await, nunca Promise.all)');

      // referência: a MESMA árvore montada em memória (sem tocar em disco),
      // apontando para o destino da escrita concorrente.
      const alvo = path.join(tmp, 'alvo-concorrente');
      const arquivos = montarArvoreDeProduto(dossieCompleto(), alvo);
      const esperados = arquivos.map((a) => path.basename(a.caminho)).sort();

      // (b) DOIS integradores chamando `escreverArvore` (a MESMA função) sobre o
      //     MESMO destino: cada arquivo é atômico e o conteúdo é determinístico —
      //     a integridade final é a da árvore completa, nenhum arquivo se perde.
      await Promise.all([
        escreverArvore(alvo, arquivos, spy),
        escreverArvore(alvo, arquivos, spy),
      ]);

      const tree = await loadTrack(alvo); // ainda carrega sem issue
      assert.equal(tree.root.slug, 'trilha-p21');
      const finais = (await arquivosJsonDaArvore(alvo)).map((p) => path.basename(p));
      assert.deepEqual(finais.sort(), esperados, 'nenhum arquivo se perdeu na escrita concorrente');
    } finally {
      await rmrf(tmp);
    }
  });

  it('5. G-FINAL reprova quando o audit encontra QUALQUER violação (nomeando)', async () => {
    const tmp = await mkTempDir('p21-mat-');
    try {
      const destino = path.join(tmp, 'trilha-p21');
      const drafts = dossieCompleto();
      // violação introduzida: `console` nunca é ensinado em nenhuma aula.
      drafts.desafios = drafts.desafios.map((d) =>
        d.ref === 'modulo-1/variaveis'
          ? { ...d, draft: { ...d.draft, solutionCode: 'export let total = 1;\nconsole.log(total);' } }
          : d,
      );
      await materializarTrilha({}, drafts, destino);

      const veredito = await gFinal({ verificarDesafio: verificadorSempreValido }, destino);

      assert.equal(veredito.ok, false, 'o gate reprova a trilha com violação');
      assert.equal(veredito.load.ok, true, 'a forma carrega (a violação é de orçamento, não de schema)');
      assert.equal(veredito.provas.ok, true, 'o verificador fake passou — a reprovação vem do AUDIT');
      assert.equal(veredito.audit.ok, false);
      assert.ok(
        veredito.audit.violacoes.some((v) => v.includes('console')),
        `falha nomeando a construção: ${veredito.audit.violacoes.join(' | ')}`,
      );
      assert.ok(
        veredito.audit.violacoes.some((v) => v.includes('desafio_1') || v.includes('challenges')),
        `falha nomeando o arquivo: ${veredito.audit.violacoes.join(' | ')}`,
      );
    } finally {
      await rmrf(tmp);
    }
  });

  it('6. slug colidente → erro; schemaVersion bumpado → erro (INV-08)', async () => {
    const tmp = await mkTempDir('p21-mat-');
    try {
      const drafts = dossieCompleto();

      // (a) destino já é uma trilha.
      const destino = path.join(tmp, 'trilha-p21');
      await writeFile(path.join(destino, TRACK_FILE), '{}');
      await assert.rejects(
        () => materializarTrilha({}, drafts, destino),
        (erro: unknown) => erro instanceof MaterializeError && erro.code === 'DESTINO_COLIDE',
      );

      // (b) raizDeTrilhas declara o slug como existente → colisão (mesmo com destino novo).
      await writeFile(path.join(tmp, 'raiz', 'trilha-p21', TRACK_FILE), '{}');
      await assert.rejects(
        () => materializarTrilha({ raizDeTrilhas: path.join(tmp, 'raiz') }, drafts, path.join(tmp, 'outro', 'trilha-p21')),
        (erro: unknown) => erro instanceof MaterializeError && erro.code === 'DESTINO_COLIDE',
      );

      // (c) INV-08: schemaVersion do dossiê bumpado → o integrador recusa.
      const bumpado: DossieDeTrilha = { ...drafts, schemaVersion: 2, aulas: drafts.aulas, desafios: drafts.desafios };
      await assert.rejects(
        () => materializarTrilha({}, bumpado, path.join(tmp, 'outro', 'trilha-nova')),
        (erro: unknown) =>
          erro instanceof MaterializeError &&
          erro.code === 'SCHEMA_VERSION_BUMP' &&
          erro.message.includes('INV-08'),
      );
    } finally {
      await rmrf(tmp);
    }
  });

  it('7. G-FINAL reprova quando UMA das quatro provas falha (nomeando o desafio)', async () => {
    const tmp = await mkTempDir('p21-mat-');
    try {
      const destino = path.join(tmp, 'trilha-p21');
      await materializarTrilha({}, dossieCompleto(), destino);

      const verificadorQueFalhaUmaProva: VerificarDesafioFn = async (desafio) =>
        desafio.ref === 'modulo-2/constantes'
          ? { valid: false, falhas: [`solutionPasses: solução de referência não passou`] }
          : { valid: true, falhas: [] };

      const veredito = await gFinal({ verificarDesafio: verificadorQueFalhaUmaProva }, destino);

      assert.equal(veredito.ok, false);
      // A fixture do dossiê (teoria SÓ prosa, introduces declarado sem
      // demonstração) fura a bateria A13–A16 — rodada 12: o G-FINAL agora
      // exige que a trilha GERADA demonstre em bloco js o que declara
      // (A13d "declarar não é demonstrar" + A14a teto). Quem nos interessa
      // AQUI é o isolamento das PROVAS: elas reprovam nomeando o desafio.
      assert.equal(veredito.audit.ok, false, 'o audit flagia o dossiê sem demo (A13d/A14a)');
      assert.ok(
        veredito.audit.violacoes.some((v) => v.includes('A13d')),
        `a reprovação do audit precisa incluir A13d (declarar sem demonstrar): ${veredito.audit.violacoes.join(' | ')}`,
      );
      assert.equal(veredito.provas.ok, false);
      assert.ok(
        veredito.provas.falhas.some((f) => f.includes('modulo-2/constantes')),
        `falha nomeando o ref do desafio: ${veredito.provas.falhas.join(' | ')}`,
      );
    } finally {
      await rmrf(tmp);
    }
  });

  it('8. (bônus) G-FINAL repassa desafios MULTI-ARQUIVO às provas (files[] intactos)', async () => {
    const tmp = await mkTempDir('p21-mat-');
    try {
      const destino = path.join(tmp, 'trilha-p21');
      await materializarTrilha({}, dossieCompleto(), destino);

      // converte 'declarar-variavel' para o formato MULTI-ARQUIVO (rodada 9):
      // top-level starter/solution saem, os arquivos carregam o conteúdo.
      const alvo = path.join(destino, 'modules', 'modulo-1', 'lessons', 'variaveis', 'challenges', 'declarar-variavel', CHALLENGE_FILE);
      const cru = JSON.parse(await fsp.readFile(alvo, 'utf8')) as Record<string, unknown>;
      delete cru['starterCode'];
      delete cru['solutionCode'];
      cru['files'] = [{ path: 'lib/total.mjs', starterCode: 'export let total;', solutionCode: 'export let total = 1;' }];
      await fsp.writeFile(alvo, `${JSON.stringify(cru, null, 2)}\n`, 'utf8');

      const recebidos: DesafioAProvar[] = [];
      const capturador: VerificarDesafioFn = async (d) => {
        recebidos.push(d);
        return { valid: true, falhas: [] };
      };
      await gFinal({ verificarDesafio: capturador }, destino);

      const multi = recebidos.find((d) => d.ref === 'modulo-1/variaveis');
      assert.ok(multi !== undefined, 'o verificador recebeu o desafio multi-arquivo');
      assert.deepEqual(multi?.solutionFiles, [{ path: 'lib/total.mjs', code: 'export let total = 1;' }]);
      assert.deepEqual(multi?.starterFiles, [{ path: 'lib/total.mjs', code: 'export let total;' }]);
    } finally {
      await rmrf(tmp);
    }
  });

  it('9. (fail-closed) raizDeTrilhas com EACCES de listTrackSlugs → PROPAGA e NADA é escrito', async () => {
    const tmp = await mkTempDir('p21-mat-');
    try {
      const destino = path.join(tmp, 'trilha-p21');
      const raiz = path.join(tmp, 'raiz');
      await fsp.mkdir(raiz);
      await fsp.chmod(raiz, 0o000); // readdir → EACCES (falha transitória de leitura)

      try {
        await assert.rejects(
          () => materializarTrilha({ raizDeTrilhas: raiz }, dossieCompleto(), destino),
          (erro: unknown) => {
            assert.ok(
              !(erro instanceof MaterializeError),
              `erro de IO não pode ser engolido nem virado MaterializeError: ${String(erro)}`,
            );
            return (erro as NodeJS.ErrnoException).code === 'EACCES';
          },
        );
        // a materialização NÃO aconteceu: o destino nem existe (nenhum arquivo escrito).
        await assert.rejects(
          () => fsp.access(path.join(destino, TRACK_FILE)),
          (e: unknown) => (e as NodeJS.ErrnoException).code === 'ENOENT',
          'nenhum arquivo da árvore foi escrito no destino',
        );
      } finally {
        await fsp.chmod(raiz, 0o755); // libera a leitura para o rmrf do bloco externo
      }
    } finally {
      await rmrf(tmp);
    }
  });

  it('10. raizDeTrilhas AUSENTE (ENOENT) → fluxo normal segue (sem trilhas ainda = sem colisão)', async () => {
    const tmp = await mkTempDir('p21-mat-');
    try {
      const destino = path.join(tmp, 'trilha-p21');
      const resultado = await materializarTrilha(
        { raizDeTrilhas: path.join(tmp, 'raiz-inexistente') },
        dossieCompleto(),
        destino,
      );
      assert.equal(resultado.slug, 'trilha-p21');
      assert.equal(resultado.arquivos, 9);
      // a árvore foi escrita normalmente e carrega sem issue.
      const track = await loadTrack(destino);
      assert.equal(track.root.slug, 'trilha-p21');
    } finally {
      await rmrf(tmp);
    }
  });
});