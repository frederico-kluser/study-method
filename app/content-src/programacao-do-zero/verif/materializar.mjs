#!/usr/bin/env node
/**
 * MATERIALIZAÇÃO da trilha `programacao-do-zero` (m3-materializa).
 *
 * Transforma os 14 pares drafts/ lesson-draft.json + challenge-draft.json na
 * árvore final de produto em `../trilha/`, seguindo a TABELA DE DERIVAÇÃO da
 * F12 (app/electron/main/engine/phases/f12Materialize.ts) e o precedente da
 * rodada 11 (a04 → content-src/let-e-atribuicao/trilha/):
 *
 *   lesson.summary            ← draft.objective.enunciado
 *   theory[].title            ← primeira linha elegível do markdown (prosa) ou
 *                                o id humanizado (código/marcadores)
 *   challenge.title           ← humanizarId(draft.slug)   (precedente a04)
 *   challenge.concept         ← draft.conceito em snake_case (precedente a04)
 *   lesson.concepts           ← conceitos dos desafios da aula (snake_case)
 *   lesson.sources            ← draft.research[]: item "URL — anotação" vira
 *                                {title, url, description} (precedente a04)
 *   difficulty (lesson/challenge) ← rampa linear 1..5 pela posição global no
 *                                orçamento (14 aulas)
 *   lesson.prerequisites      ← índice reverso introduces×aula (f12): aulas
 *                                ANTERIORES que introduziram construções do
 *                                orçamento de ENTRADA (carry cumulativo)
 *   campos §10                ← cópia VERBATIM do draft como EXTRAS
 *
 * Formato canônico: JSON com 2 espaços, LF, newline final — o mesmo dos
 * arquivos atuais de resources/tracks.
 *
 * Rodar (cwd app/):  node content-src/programacao-do-zero/verif/materializar.mjs
 * Zero dependências; determinístico; nada além de drafts + curriculo entra.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(here, '..'); // content-src/programacao-do-zero
const draftsDir = path.join(raiz, 'drafts');
const trilhaDir = path.join(raiz, 'trilha');
const curriculo = JSON.parse(fs.readFileSync(path.join(raiz, 'curriculo.json'), 'utf8'));

// ── derivações ──────────────────────────────────────────────────────────────
function humanizarId(id) {
  const palavra = id.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (palavra === '') return id;
  return palavra.charAt(0).toUpperCase() + palavra.slice(1);
}

function snakeCase(id) {
  return id.replace(/-/g, '_');
}

/** dificuldade PROVISÓRIA 1..5: rampa linear pela posição global (f12). */
function dificuldadeProvisoria(posicaoGlobal, totalAulas) {
  const total = Math.max(totalAulas, 1);
  const d = Math.ceil(((posicaoGlobal + 1) * 5) / total);
  return Math.min(5, Math.max(1, d));
}

/** título de seção de teoria (f12): primeira linha prosa elegível ou id humanizado. */
function tituloDaSecao(secao) {
  if (secao.tag && secao.tag !== '') return humanizarId(secao.id);
  const primeiraLinha = secao.markdown
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (
    primeiraLinha !== undefined &&
    primeiraLinha.length <= 100 &&
    !/^#{1,6}\s/.test(primeiraLinha) &&
    !/^(`{3,}|~{3,})/.test(primeiraLinha) &&
    !/^[-*+]\s/.test(primeiraLinha) &&
    !/^\d+[.)]\s/.test(primeiraLinha)
  ) {
    return primeiraLinha;
  }
  return humanizarId(secao.id);
}

/** fonte: item "URL — anotação" (precedente a04); sem anotação → description=url. */
function fonteDePesquisa(item) {
  const sep = item.indexOf(' — ');
  const urlPart = (sep >= 0 ? item.slice(0, sep) : item).trim();
  const anotacao = sep >= 0 ? item.slice(sep + 3).trim() : '';
  let url;
  try {
    url = new URL(urlPart);
  } catch {
    throw new Error(`research item não começa com URL absoluta: ${JSON.stringify(item)}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`research item não é http(s): ${JSON.stringify(item)}`);
  }
  const ultimoSegmento = url.pathname.split('/').filter(Boolean).pop() ?? '';
  const base = ultimoSegmento.replace(/\.(html?|md)$/i, '');
  const title = (base !== '' ? humanizarId(base) : url.hostname).replace(/\./g, ' ');
  return { title, url: urlPart, description: anotacao !== '' ? anotacao : urlPart };
}

// ── leitura dos drafts na ORDEM DO CURRICULO ────────────────────────────────
const ordem = curriculo.map((c) => c.slug);
const slugsNoDisco = fs.readdirSync(draftsDir).filter((s) => fs.statSync(path.join(draftsDir, s)).isDirectory());
const faltando = ordem.filter((s) => !slugsNoDisco.includes(s));
if (faltando.length > 0) throw new Error(`drafts ausentes: ${faltando.join(', ')}`);
const extras = slugsNoDisco.filter((s) => !ordem.includes(s));
if (extras.length > 0) throw new Error(`drafts fora do curriculo: ${extras.join(', ')}`);

const aulas = ordem.map((slug, pos) => {
  const lesson = JSON.parse(fs.readFileSync(path.join(draftsDir, slug, 'lesson-draft.json'), 'utf8'));
  const challenge = JSON.parse(fs.readFileSync(path.join(draftsDir, slug, 'challenge-draft.json'), 'utf8'));
  return { slug, pos, lesson, challenge };
});

const total = aulas.length;

// ── índice reverso introduces×aula (primeira origem vence — I3) ─────────────
const origemDosConceitos = new Map();
for (const a of aulas) {
  for (const construcao of [...(a.lesson.introduces?.receptive ?? []), ...(a.lesson.introduces?.productive ?? [])]) {
    if (!origemDosConceitos.has(construcao)) origemDosConceitos.set(construcao, a.slug);
  }
}

// ── montagem ────────────────────────────────────────────────────────────────
const pushJson = (relativo, objeto) => {
  const alvo = path.join(trilhaDir, relativo);
  fs.mkdirSync(path.dirname(alvo), { recursive: true });
  fs.writeFileSync(alvo, `${JSON.stringify(objeto, null, 2)}\n`);
};

pushJson('track.json', {
  schemaVersion: 1,
  slug: 'programacao-do-zero',
  title: 'Programação do Zero',
  description:
    'Do absoluto zero (nenhuma experiência de programação) até montar um programa inteiro seu — export, function, return, variáveis, const e string — em 14 aulas micro, cada uma com um único avanço e uma única lacuna a preencher, com a máquina que confere explicada como leitura desde a primeira aula.',
  language: 'pt-BR',
  domain: 'programming',
  modules: ['fundamentos-js'],
});

pushJson(path.join('modules', 'fundamentos-js', 'module.json'), {
  schemaVersion: 1,
  slug: 'fundamentos-js',
  title: 'Fundamentos de JavaScript',
  order: 1,
  lessons: aulas.map((a) => a.slug),
});

for (const a of aulas) {
  const dificuldade = dificuldadeProvisoria(a.pos, total);

  // prerequisitos (f12): aulas ANTERIORES que introduzem construção do carry.
  const prereqRefs = new Set();
  for (const construcao of origemDosConceitos.keys()) {
    const origem = origemDosConceitos.get(construcao);
    if (origem !== undefined && origem !== a.slug && aulas.findIndex((x) => x.slug === origem) < a.pos) {
      prereqRefs.add(origem);
    }
  }
  const prerequisitos = [...prereqRefs].sort(
    (x, y) => aulas.findIndex((q) => q.slug === x) - aulas.findIndex((q) => q.slug === y),
  );

  const conceitoProduto = snakeCase(a.challenge.conceito);
  const theory = a.lesson.theory.map((s) => ({ id: s.id, title: tituloDaSecao(s), markdown: s.markdown }));
  const sources = a.lesson.research.map(fonteDePesquisa);

  const lessonRel = path.join('modules', 'fundamentos-js', 'lessons', a.slug);
  pushJson(path.join(lessonRel, 'lesson.json'), {
    schemaVersion: 1,
    slug: a.slug,
    title: a.lesson.title,
    summary: a.lesson.objective.enunciado,
    difficulty: dificuldade,
    concepts: [conceitoProduto],
    prerequisites: prerequisitos,
    theory,
    sources,
    challenges: [a.challenge.slug],
    // campos §10 — cópia VERBATIM do draft (o loader faz cast, não pick)
    objective: a.lesson.objective,
    introduces: a.lesson.introduces,
    introducesTerms: a.lesson.introducesTerms,
    foraDeEscopo: a.lesson.foraDeEscopo,
    eiClass: a.lesson.eiClass,
    role: a.lesson.role,
    targetAtom: a.lesson.targetAtom,
    notionalMachineDelta: a.lesson.notionalMachineDelta,
    budgetHash: a.lesson.budgetHash,
    budgetVersion: a.lesson.budgetVersion,
    status: a.lesson.status,
    research: a.lesson.research,
  });

  pushJson(path.join(lessonRel, 'challenges', a.challenge.slug, 'challenge.json'), {
    schemaVersion: 1,
    slug: a.challenge.slug,
    title: humanizarId(a.challenge.slug),
    concept: conceitoProduto,
    difficulty: dificuldade,
    language: 'nodejs',
    statement: a.challenge.statement,
    starterCode: a.challenge.starterCode,
    testsCode: a.challenge.testsCode,
    solutionCode: a.challenge.solutionCode,
    expectedTestCount: a.challenge.expectedTestCount,
    outputChannel: a.challenge.outputChannel,
    requires: a.challenge.requires,
    requirements: a.challenge.requirements,
    notRequired: a.challenge.notRequired,
    subgoals: a.challenge.subgoals,
    scenarios: a.challenge.scenarios,
    taskSkill: a.challenge.taskSkill,
    supportLevel: a.challenge.supportLevel,
    surfaceDomain: a.challenge.surfaceDomain,
    solutionAlternates: a.challenge.solutionAlternates,
    wrongSolutions: a.challenge.wrongSolutions,
  });
}

console.log(`Materializadas ${aulas.length} aulas em ${trilhaDir}`);
for (const a of aulas) {
  console.log(
    `${String(a.pos + 1).padStart(2)} ${a.slug.padEnd(32)} diff=${dificuldadeProvisoria(a.pos, total)} desafio=${a.challenge.slug}`,
  );
}
