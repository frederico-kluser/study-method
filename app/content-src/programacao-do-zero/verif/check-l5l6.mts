/**
 * VERIFICAÇÃO L5 + L6 (programacao-do-zero) — os QUATRO checks obrigatórios:
 *
 *   CHECK 1 — schemas: LessonDraftSchema + ChallengeDraftSchema nos 4 drafts
 *             (2 aulas × lesson+challenge) → 0 erros.
 *   CHECK 2 — extractAllOccurrences ⊆ conjuntos do curriculo (cumulativo até
 *             L6): teoria L5/L6, starter/solution/tests de fixar+esticar de
 *             L5/L6. Fora do conjunto → erro. Exclui da régua apenas os átomos
 *             estruturais/harness (AX ⊆ H13) e, para o arquivo de TESTE, a
 *             semente receptiva do harness (o teste é lido, não escrito).
 *             Extra: zero ocorrências de operador (`op:*`, node:BinaryExpression)
 *             em QUALQUER superfície (operador binário só entra no receptivo
 *             da L7).
 *   CHECK 3 — auditarProgressao (assinatura real, engine/quality/progressao.ts)
 *             sobre L1–L6: L1–L4 são fixtures-contexto derivadas do
 *             curriculo.json (mesmo formato dos fixtures validados em
 *             tests/engineProgressao.test.ts — L1–L3 byte a byte); L5 e L6
 *             entram com a TEORIA dos meus lesson-drafts e o desafio fixar dos
 *             challenge-drafts (declared = avancos do curriculo). → 0 ERROS.
 *             Obs. registrada: A15a (intra-aula) tem off-by-one na engine
 *             (anteriorAcumulado vazio em k=1 — até solução IDÊNTICA do 1º
 *             desafio viola); por isso o esticar entra no CHECK 2 e no CHECK 4,
 *             mas não como 2º desafio do audit A15a (false positive garantido).
 *   CHECK 4 — provas de execução (criarProverDeDesafio, f9Verifier): bateria
 *             P1–P4 nos 4 desafios (fixar+esticar de L5 e L6) → valid=true,
 *             declared=expectedTestCount, executed=expectedTestCount; mais:
 *             solutionAlternates passam e wrongSolutions FALHAM (J5/DES-8).
 *
 * Rodar:  cd app && ./node_modules/.bin/tsx content-src/programacao-do-zero/verif/check-l5l6.mts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LessonDraftSchema, ChallengeDraftSchema } from '../../../electron/main/engine/schemas/artifacts';
import { extractAllOccurrences } from '../../../electron/main/engine/extract';
import { HARNESS_RECEPTIVE_SEED, STRUCTURAL_ALWAYS_ALLOWED } from '../../../electron/main/engine/atomKeys';
import { H13, auditarProgressao, type ProgressaoDesafioInput, type ProgressaoLessonInput } from '../../../electron/main/engine/quality/progressao';
import { extractFencedBlocks } from '../../../electron/main/engine/theoryCode';
import { criarProverDeDesafio } from '../../../electron/main/engine/phases/f9Verifier';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..'); // app/
const trilha = path.join(root, 'content-src', 'programacao-do-zero');
const drafts = path.join(trilha, 'drafts');

let falhas = 0;
function exige(cond: boolean, msg: string): void {
  if (!cond) {
    falhas += 1;
    console.log(`  ✗ ${msg}`);
  } else {
    console.log(`  ✓ ${msg}`);
  }
}

const lerJson = (p: string): unknown => JSON.parse(fs.readFileSync(p, 'utf8'));

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 1 — schemas
// ─────────────────────────────────────────────────────────────────────────────
console.log('=== CHECK 1 — SCHEMAS DOS DRAFTS (L5 + L6) ===');
const duplas: Array<[string, string]> = [
  ['parametro-e-argumento', 'L5'],
  ['return', 'L6'],
];
type Drawn = {
  aula: string;
  lesson: Record<string, unknown>;
  challenge: Record<string, unknown>;
  lessonRes: { success: boolean };
  challengeRes: { success: boolean };
};
const desenhos: Drawn[] = [];
for (const [slug, tag] of duplas) {
  const lessonRaw = lerJson(path.join(drafts, slug, 'lesson-draft.json')) as Record<string, unknown>;
  const challengeRaw = lerJson(path.join(drafts, slug, 'challenge-draft.json')) as Record<string, unknown>;
  const lessonRes = LessonDraftSchema.safeParse(lessonRaw);
  const challengeRes = ChallengeDraftSchema.safeParse(challengeRaw);
  console.log(`[${tag}] ${slug}/lesson-draft.json    → ${lessonRes.success ? 'OK' : 'FALHOU'}`);
  console.log(`[${tag}] ${slug}/challenge-draft.json → ${challengeRes.success ? 'OK' : 'FALHOU'}`);
  if (!lessonRes.success) console.log(JSON.stringify(lessonRes.error.flatten(), null, 2));
  if (!challengeRes.success) console.log(JSON.stringify(challengeRes.error.flatten(), null, 2));
  desenhos.push({ aula: slug, lesson: lessonRaw, challenge: challengeRaw, lessonRes, challengeRes });
}
const erroSchema = desenhos.filter((d) => !d.lessonRes.success || !d.challengeRes.success).length;
exige(erroSchema === 0, `CHECK 1: 0 erros de schema (falhas=${erroSchema})`);
console.log('');

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 2 — extração ⊆ conjuntos do curriculo (cumulativo até L6)
// ─────────────────────────────────────────────────────────────────────────────
console.log('=== CHECK 2 — extractAllOccurrences ⊆ conjuntos do curriculo (cumulativo até L6) ===');
const curriculo = lerJson(path.join(trilha, 'curriculo.json')) as Array<Record<string, unknown>>;
const porSlug = new Map(curriculo.map((l) => [l.slug as string, l]));
const L5c = porSlug.get('parametro-e-argumento')!;
const L6c = porSlug.get('return')!;

const cumulativo = new Set<string>();
for (const l of curriculo) {
  for (const a of (l.demonstrado_na_teoria as string[])) cumulativo.add(a);
}
const H13_SET = new Set<string>(H13);
const SEED = new Set<string>(HARNESS_RECEPTIVE_SEED);
const AX = new Set<string>(STRUCTURAL_ALWAYS_ALLOWED);

/** extrai as chaves dos blocos js FENCEADOS de um markdown de teoria. */
function chavesDaTeoria(markdown: string): Set<string> {
  const saida = new Set<string>();
  const fenced = extractFencedBlocks(markdown);
  for (const b of fenced.blocks) {
    if (!b.isJavaScript) continue;
    const r = extractAllOccurrences(b.code);
    if (!r.ok) {
      console.log(`  (bloco de teoria não parseia: ${b.code.slice(0, 40)}…)`);
      continue;
    }
    for (const occ of r.occurrences) saida.add(occ.key);
  }
  return saida;
}

function relataConjunto(titulo: string, chaves: Set<string>, permitidas: Set<string>): void {
  const fora = [...chaves].filter((k) => !permitidas.has(k)).sort();
  console.log(`[${titulo}] ${chaves.size} chaves únicas, fora do conjunto: ${fora.length}`);
  const op = [...chaves].filter((k) => k.startsWith('op:') || k === 'node:BinaryExpression');
  if (op.length > 0) console.log(`  ⚠ operador encontrado: ${op.join(', ')}`);
  if (fora.length > 0) console.log(`  fora: ${fora.join(', ')}`);
  return; // o veredito de cada superfície é agregado abaixo
}

function checaSuperficie(titulo: string, codigo: string, permitidas: Set<string>, extras: string[]): void {
  const r = extractAllOccurrences(codigo);
  if (!r.ok) {
    console.log(`[${titulo}] NÃO PARSEIA: ${r.error.message}`);
    exige(false, `${titulo} parseia`);
    return;
  }
  const fora = r.keys.filter((k) => !permitidas.has(k)).sort();
  const op = r.keys.filter((k) => k.startsWith('op:') || k === 'node:BinaryExpression');
  console.log(`[${titulo}] ${r.keys.length} chaves únicas; fora=${fora.length}${extras.length ? ` (incluindo fora da semente: ${{}})` : ''}`);
  if (fora.length) console.log(`  fora: ${fora.join(', ')}`);
  if (op.length) console.log(`  ⚠ operador: ${op.join(', ')}`);
  exige(fora.length === 0, `${titulo}: 0 chaves fora do conjunto permitido`);
  exige(op.length === 0, `${titulo}: 0 operadores (sem BinaryExpression/op:*)`);
}

// teoria L5/L6 vs o demonstrado DECLARADO no curriculo da própria aula (+ AX)
for (const [slug, tag, decl] of [
  ['parametro-e-argumento', 'L5', L5c],
  ['return', 'L6', L6c],
] as Array<[string, string, Record<string, unknown>]>) {
  const lesson = desenhos.find((d) => d.aula === slug)!;
  const markdown = (lesson.lesson.theory as Array<Record<string, unknown>>).map((s) => s.markdown as string).join('\n\n');
  const chaves = chavesDaTeoria(markdown);
  const permitidas = new Set<string>([...(decl.demonstrado_na_teoria as string[]), ...AX]);
  const fora = [...chaves].filter((k) => !permitidas.has(k)).sort();
  const faltando = (decl.demonstrado_na_teoria as string[]).filter((k) => !chaves.has(k) && !AX.has(k)).sort();
  console.log(`[teoria ${tag}] ${chaves.size} chaves únicas nos blocos js; fora=${fora.length}; faltando=${faltando.length}`);
  if (fora.length) console.log(`  fora: ${fora.join(', ')}`);
  if (faltando.length) console.log(`  faltando (declarado mas não demonstrado): ${faltando.join(', ')}`);
  exige(fora.length === 0 && faltando.length === 0, `teoria ${tag}: bloco js demonstra EXATAMENTE o conjunto declarado no curriculo`);
}

// superfícies de código (à exceção dos átomos estruturais do harness)
const permitidoAluno = new Set<string>([...cumulativo, ...H13_SET]);
const permitidoTeste = new Set<string>([...cumulativo, ...H13_SET, ...SEED]);

interface ChaveDeSuperficie {
  titulo: string;
  codigo: string;
  permitido: Set<string>;
}
const superficies: ChaveDeSuperficie[] = [];
for (const [slug, tag, extra] of [
  ['parametro-e-argumento', 'L5', 'fixar'],
  ['return', 'L6', 'fixar'],
] as Array<[string, string, string]>) {
  const ch = desenhos.find((d) => d.aula === slug)!.challenge as {
    starterCode: string;
    solutionCode: string;
    testsCode: string;
  };
  superficies.push({ titulo: `starter ${tag} (${extra})`, codigo: ch.starterCode, permitido: permitidoAluno });
  superficies.push({ titulo: `solution ${tag} (${extra})`, codigo: ch.solutionCode, permitido: permitidoAluno });
  superficies.push({ titulo: `tests ${tag} (${extra})`, codigo: ch.testsCode, permitido: permitidoTeste });
}
// esticar (fixture embutida — espelho byte a byte da seção 'drill' da teoria)
const esticares: Array<{ tag: string; starter: string; solution: string; tests: string }> = [
  {
    tag: 'L5',
    starter: 'export function dupla(/* LACUNA: escreva os dois nomes, separados por vírgula */) {\n  return a;\n}\n',
    solution: 'export function dupla(a, b) {\n  return a;\n}\n',
    tests:
      "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { dupla } from './solution.mjs';\n\ntest('dupla devolve o primeiro valor recebido', () => {\n  assert.equal(dupla(3, 4), 3);\n});\n",
  },
  {
    tag: 'L6',
    starter: 'export function tres() {\n  /* LACUNA: devolva o número 3 */\n}\n',
    solution: 'export function tres() {\n  return 3;\n}\n',
    tests:
      "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { tres } from './solution.mjs';\n\ntest('tres devolve o número 3', () => {\n  assert.equal(tres(), 3);\n});\n",
  },
];
for (const e of esticares) {
  superficies.push({ titulo: `starter ${e.tag} (esticar)`, codigo: e.starter, permitido: permitidoAluno });
  superficies.push({ titulo: `solution ${e.tag} (esticar)`, codigo: e.solution, permitido: permitidoAluno });
  superficies.push({ titulo: `tests ${e.tag} (esticar)`, codigo: e.tests, permitido: permitidoTeste });
}

let foraTotal = 0;
let opTotal = 0;
for (const s of superficies) {
  const r = extractAllOccurrences(s.codigo);
  if (!r.ok) {
    exige(false, `${s.titulo} parseia`);
    continue;
  }
  const fora = r.keys.filter((k) => !s.permitido.has(k));
  const op = r.keys.filter((k) => k.startsWith('op:') || k === 'node:BinaryExpression');
  foraTotal += fora.length;
  opTotal += op.length;
  if (fora.length) console.log(`[${s.titulo}] fora: ${fora.join(', ')}`);
  if (op.length) console.log(`[${s.titulo}] ⚠ operador: ${op.join(', ')}`);
}
exige(foraTotal === 0, `CHECK 2: ${superficies.length} superfícies de código — 0 chaves fora do conjunto cumulativo até L6 (foraTotal=${foraTotal})`);
exige(opTotal === 0, `CHECK 2: 0 ocorrências de operador em qualquer superfície (opTotal=${opTotal})`);
console.log('');

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 3 — auditarProgressao (assinatura real) sobre L1–L6
// ─────────────────────────────────────────────────────────────────────────────
console.log('=== CHECK 3 — auditarProgressao (L1–L6; L1–L4 = fixtures-contexto do curriculo) ===');

const desafio = (slug: string, file: string, starter: string, solution: string, tests: string): ProgressaoDesafioInput => ({
  slug,
  desafioFile: file,
  files: [{ path: 'solution.mjs', starter, solution }],
  tests,
});

// Fixture L4 — export-entrega (derivado do curriculo: o aluno digita 'export')
const l4: ProgressaoLessonInput = {
  ref: 'programacao-do-zero/export-entrega',
  baseDir: 'content-src/programacao-do-zero',
  theory: [
    {
      id: 'export-entrega',
      title: 'Export: a entrega ao conferidor',
      markdown:
        'Uma palavra deixa a sua caixa visível para o conferidor.\n\n```js\nfunction resposta() {\n  return 5;\n}\n```\n\nCom a palavra mágica:\n\n```js\nexport function resposta() {\n  return 5;\n}\n```',
    },
  ],
  challenges: [
    desafio(
      'entrega-a-caixa',
      'content-src/programacao-do-zero/drafts/_fixture/export-entrega/challenge.json',
      'function resposta() {\n  return 5;\n}\n',
      'export function resposta() {\n  return 5;\n}\n',
      "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { resposta } from './solution.mjs';\n\ntest('resposta devolve 5', () => {\n  assert.equal(resposta(), 5);\n});\n",
    ),
  ],
};

// Fixtures L1–L3 — byte a byte os do teste validado tests/engineProgressao.test.ts
const l1: ProgressaoLessonInput = {
  ref: 'programacao-do-zero/como-o-site-confere-seu-codigo',
  baseDir: 'content-src/programacao-do-zero',
  theory: [
    {
      id: 'como-ler-o-desafio',
      title: 'Como ler o desafio',
      markdown: 'A caixa inteira já está pronta; muda só o número.\n\n```js\nexport function conferidor() {\n  return 7;\n}\n```',
    },
    {
      id: 'a-maquina-que-confere',
      title: 'A máquina que confere',
      markdown: 'O site importa a caixa e confere o que ela devolve.\n\n```js\nassert.equal(conferidor(), 7);\n```',
    },
  ],
  challenges: [],
};
const l2: ProgressaoLessonInput = {
  ref: 'programacao-do-zero/valor-e-instrucao',
  baseDir: 'content-src/programacao-do-zero',
  theory: [
    {
      id: 'valor-e-instrucao',
      title: 'Valor e instrução',
      markdown: 'Número é um VALOR; a linha congelada é a INSTRUÇÃO que entrega o número ao conferidor.',
    },
  ],
  challenges: [
    desafio(
      'digitar-o-numero',
      'content-src/programacao-do-zero/drafts/_fixture/valor-e-instrucao/challenge.json',
      'export function conferidor() {\n  return 0;\n}\n',
      'export function conferidor() {\n  return 7;\n}\n',
      "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { conferidor } from './solution.mjs';\ntest('o número conferido é 7', () => {\n  assert.equal(conferidor(), 7);\n});\n",
    ),
  ],
};
const l3: ProgressaoLessonInput = {
  ref: 'programacao-do-zero/funcao-e-chamada',
  baseDir: 'content-src/programacao-do-zero',
  theory: [
    {
      id: 'chamar',
      title: 'Chamar',
      markdown: 'Chamar é escrever o nome da caixa com parênteses: a caixa roda e devolve o número.',
    },
  ],
  challenges: [
    desafio(
      'chama-a-caixa',
      'content-src/programacao-do-zero/drafts/_fixture/funcao-e-chamada/challenge.json',
      'export function conferidor() {\n  return 0;\n}\nfunction resposta() {\n  return 5;\n}\n',
      'export function conferidor() {\n  return resposta();\n}\nfunction resposta() {\n  return 5;\n}\n',
      "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { conferidor } from './solution.mjs';\ntest('conferidor devolve a resposta', () => {\n  assert.equal(conferidor(), 5);\n});\n",
    ),
  ],
};

function aulaDosDrafts(slug: string, tag: string, baseDir: string): ProgressaoLessonInput {
  const d = desenhos.find((x) => x.aula === slug)!;
  const lesson = d.lesson as { title: string; theory: Array<{ id: string; secao: string; markdown: string }>; introduces: { receptive: string[]; productive: string[] } };
  const challenge = d.challenge as { starterCode: string; solutionCode: string; testsCode: string };
  return {
    ref: `programacao-do-zero/${slug}`,
    baseDir,
    theory: lesson.theory.map((s) => ({ id: s.id, title: s.id, markdown: s.markdown })),
    challenges: [
      desafio(
        `${slug}-fixar`,
        `content-src/programacao-do-zero/drafts/${slug}/challenge-draft.json`,
        challenge.starterCode,
        challenge.solutionCode,
        challenge.testsCode,
      ),
    ],
    declared: { productive: lesson.introduces.productive, receptive: lesson.introduces.receptive },
  };
}

const aulas: ProgressaoLessonInput[] = [l1, l2, l3, l4, aulaDosDrafts('parametro-e-argumento', 'L5', 'content-src/programacao-do-zero'), aulaDosDrafts('return', 'L6', 'content-src/programacao-do-zero')];

const result = auditarProgressao(aulas);
const erros = result.violations.filter((v) => v.severidade === 'erro');
const avisos = result.violations.filter((v) => v.severidade === 'aviso');
console.log(`violações totais: ${result.violations.length} (erros=${erros.length}, avisos=${avisos.length})`);
console.log(`Novo(i) por aula: ${[...result.novosPorAula.entries()].map(([r, n]) => `${r}=${n}`).join(' · ')}`);
for (const v of erros) console.log(`  ERRO  ${v.regra} ${v.ref} [${v.campo}] ${v.trechoOfensor.slice(0, 60)} — ${v.mensagem.slice(0, 120)}`);
for (const v of avisos) console.log(`  aviso ${v.regra} ${v.ref} — ${v.mensagem.slice(0, 90)}`);
exige(erros.length === 0, `CHECK 3: auditarProgressao → 0 ERROS (${erros.length}); ${avisos.length} avisos calibrados (aulas de prática)`);
console.log('');

// ─────────────────────────────────────────────────────────────────────────────
// CHECK 4 — provas de execução (4 desafios × bateria P1–P4)
// ─────────────────────────────────────────────────────────────────────────────
console.log('=== CHECK 4 — provas de execução (criarProverDeDesafio) ===');
const prover = criarProverDeDesafio();

function pegaFixar(slug: string): { solutionCode: string; starterCode: string; testsCode: string; expectedTestCount: number } {
  const ch = desenhos.find((d) => d.aula === slug)!.challenge as { solutionCode: string; starterCode: string; testsCode: string; expectedTestCount: number };
  return ch;
}

const formas: Array<{ nome: string; solutionCode: string; starterCode: string; testsCode: string; expectedTestCount: number }> = [
  { nome: 'L5 fixar', ...pegaFixar('parametro-e-argumento') },
  { nome: 'L5 esticar', solutionCode: esticares[0].solution, starterCode: esticares[0].starter, testsCode: esticares[0].tests, expectedTestCount: 1 },
  { nome: 'L6 fixar', ...pegaFixar('return') },
  { nome: 'L6 esticar', solutionCode: esticares[1].solution, starterCode: esticares[1].starter, testsCode: esticares[1].tests, expectedTestCount: 1 },
];

for (const f of formas) {
  const v = await prover({
    solutionCode: f.solutionCode,
    starterCode: f.starterCode,
    testsCode: f.testsCode,
    expectedTestCount: f.expectedTestCount,
    emptyStubCode: '',
  });
  console.log(
    `[${f.nome}] valid=${v.valid} declared=${v.declared}/${f.expectedTestCount} executed=${v.executed}/${f.expectedTestCount}${v.execError ? ` execError=${String(v.execError).slice(0, 120)}` : ''}`,
  );
  exige(v.valid === true && v.declared === f.expectedTestCount && v.executed === f.expectedTestCount, `provas ${f.nome} → valid=true, declared=${f.expectedTestCount}, executed=${f.expectedTestCount}`);
}

// extras: alternates passam; wrongSolutions falham (J5 / DES-8)
console.log('— extras: solutionAlternates passam, wrongSolutions falham —');
for (const [slug, tag] of duplas) {
  const ch = desenhos.find((d) => d.aula === slug)!.challenge as { solutionAlternates: string[]; wrongSolutions: string[]; testsCode: string; expectedTestCount: number };
  const fixar = pegaFixar(slug);
  for (const [i, alt] of ch.solutionAlternates.entries()) {
    const v = await prover({ solutionCode: alt, starterCode: fixar.starterCode, testsCode: fixar.testsCode, expectedTestCount: fixar.expectedTestCount, emptyStubCode: '' });
    exige(v.valid === true && v.executed === fixar.expectedTestCount, `${tag} alternate ${i + 1} passa (valid=${v.valid})`);
  }
  for (const [i, wrong] of ch.wrongSolutions.entries()) {
    const v = await prover({ solutionCode: wrong, starterCode: fixar.starterCode, testsCode: fixar.testsCode, expectedTestCount: fixar.expectedTestCount, emptyStubCode: '' });
    exige(v.valid === false, `${tag} wrongSolution ${i + 1} FALHA (valid deve ser false; foi ${v.valid})`);
  }
}

// raw: zero 'console.' em qualquer superfície de código dos drafts
const rawConsole = [...desenhos.flatMap((d) => [d.challenge.starterCode, d.challenge.solutionCode, d.challenge.testsCode] as string[])].filter((c) => /console\./.test(c)).length;
exige(rawConsole === 0, `CHECK 4/2: 0 ocorrências de 'console.' nas superfícies de código (encontradas=${rawConsole})`);

console.log('');
console.log(`RESULTADO FINAL: ${falhas === 0 ? 'TODOS OS CHECKS PASSARAM (0 falhas)' : `${falhas} FALHA(S)`}`);
if (falhas !== 0) process.exit(1);