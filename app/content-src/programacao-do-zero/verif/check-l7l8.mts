/**
 * VERIFICAÇÃO — aulas L7–L8 da trilha micro programacao-do-zero
 * (let-e-atribuicao · string-como-valor).
 *
 * Quatro baterias determinísticas, zero LLM:
 *
 *   V1 — SCHEMAS: LessonDraftSchema/ChallengeDraftSchema nos 4 drafts → 0 erros.
 *   V2 — EXTRATOR ⊆ CURRÍCULO: toda ocorrência extraída de solutionCode,
 *        starterCode, testsCode e blocos js da teoria está no universo cumulativo
 *        do curriculo (L1–L8) ∪ HARNESS_RECEPTIVE_SEED ∪ STRUCTURAL_ALWAYS_ALLOWED
 *        (a semente receptiva do harness e os estruturais são licitados pelo
 *        próprio curriculo.md — 'Nota do invólucro'); testes têm isenção extra
 *        dos spans mecânicos S13. Esperado: 0 fora (efetivo). O número BRUTO
 *        (sem desconto) também é reportado, com a lista do que sobrou.
 *   V3 — auditarProgressao (bateria A13–A16, modo declared) sobre as aulas
 *        1–8 (aulas 1–6 sintetizadas a partir do curriculo + aulas 7–8 reais
 *        dos drafts) → 0 ERROS nas 2 aulas; o AVISO A14a esperado na L8
 *        (Novo=0: StringLiteral ∈ H13 e decl:let é reuso — aula de prática,
 *        calibração idêntica à L2).
 *   V4 — QUATRO PROVAS de execução (criarProverDeDesafio/f9Verifier, runner
 *        oficial endurecido) por desafio → valid=true; bônus: solutionAlternates
 *        passam e wrongSolutions falham, por execução real.
 *
 * Saída: números + veredito; exit 1 se qualquer bateria falhar.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LessonDraftSchema, ChallengeDraftSchema } from '../../../electron/main/engine/schemas/artifacts';
import { extractAllOccurrences, countTestDeclarations } from '../../../electron/main/engine/extract';
import { HARNESS_RECEPTIVE_SEED, STRUCTURAL_ALWAYS_ALLOWED } from '../../../electron/main/engine/atomKeys';
import { extractFencedBlocks } from '../../../electron/main/engine/theoryCode';
import { auditarProgressao, spansMecanicosDeTeste, type ProgressaoLessonInput } from '../../../electron/main/engine/quality/progressao';
import { criarProverDeDesafio } from '../../../electron/main/engine/phases/f9Verifier';
import type { TrackTheorySection } from '../../../electron/main/content/trackTypes';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..'); // app/
const trilhaDir = path.join(root, 'content-src', 'programacao-do-zero');
const draftsDir = path.join(trilhaDir, 'drafts');

const SLUGS = ['let-e-atribuicao', 'string-como-valor'];
const MEUS_REFS = new Set(SLUGS.map((s) => `fundamentos-js/${s}`));

interface CurriculoAula {
  slug: string;
  avancos: { produtivo: string[]; receptivo: string[] };
  demonstrado_na_teoria: string[];
  primeira_secao_demonstra: string[];
  congelado: string[];
  atividade: Record<string, { atoms_usados?: string[] }>;
}

function parseJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

async function main(): Promise<void> {
  const falhas: string[] = [];
  const curriculo = parseJson<CurriculoAula[]>(path.join(trilhaDir, 'curriculo.json'));
  const aulas1A8 = curriculo.slice(0, 8);

  // ── conjunto-universo do curriculo (cumulativo L1–L8) ────────────────────
  const universo = new Set<string>();
  for (const a of aulas1A8) {
    for (const k of [...a.avancos.produtivo, ...a.avancos.receptivo, ...a.demonstrado_na_teoria, ...a.primeira_secao_demonstra, ...a.congelado]) universo.add(k);
    for (const at of Object.values(a.atividade)) for (const k of at.atoms_usados ?? []) universo.add(k);
  }
  const universoLicitado = new Set<string>([...universo, ...HARNESS_RECEPTIVE_SEED, ...STRUCTURAL_ALWAYS_ALLOWED]);

  // ══════════════════════════════════════════════════════════════════════════
  // V1 — SCHEMAS
  // ══════════════════════════════════════════════════════════════════════════
  console.log('=== V1 — SCHEMAS DOS DRAFTS ===');
  let errosSchema = 0;
  const drafts: { slug: string; lesson: any; challenge: any }[] = [];
  for (const slug of SLUGS) {
    const lesson = parseJson(path.join(draftsDir, slug, 'lesson-draft.json'));
    const challenge = parseJson(path.join(draftsDir, slug, 'challenge-draft.json'));
    drafts.push({ slug, lesson, challenge });
    const lr = LessonDraftSchema.safeParse(lesson);
    const cr = ChallengeDraftSchema.safeParse(challenge);
    const e = (lr.success ? 0 : 1) + (cr.success ? 0 : 1);
    errosSchema += e;
    console.log(`lesson-draft   ${slug.padEnd(28)} → ${lr.success ? 'OK' : 'FALHOU'}`);
    if (!lr.success) console.log(JSON.stringify(lr.error.flatten(), null, 2));
    console.log(`challenge-draft ${slug.padEnd(28)} → ${cr.success ? 'OK' : 'FALHOU'}`);
    if (!cr.success) console.log(JSON.stringify(cr.error.flatten(), null, 2));
  }
  console.log(`TOTAL DE ERROS DE SCHEMA: ${errosSchema}`);
  if (errosSchema !== 0) falhas.push(`V1: ${errosSchema} erro(s) de schema`);
  console.log('');

  // ══════════════════════════════════════════════════════════════════════════
  // V2 — EXTRATOR ⊆ universo do curriculo (cumulativo L1–L8)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('=== V2 — EXTRATOR ⊆ UNIVERSO DO CURRICULO (L1–L8) ===');
  const foraEfetivoSet = new Map<string, string[]>();
  const foraBrutoSet = new Map<string, string[]>();
  const relatar = (onde: string, code: string, isTests: boolean): void => {
    const r = extractAllOccurrences(code);
    if (!r.ok) {
      console.log(`  [parse error em ${onde}] — ${r.error.message} (linha ${r.error.line})`);
      falhas.push(`V2: ${onde} não parseia (${r.error.message})`);
      return;
    }
    const spans = isTests ? spansMecanicosDeTeste(code) : [];
    for (const occ of r.occurrences) {
      if (!foraBrutoSet.has(occ.key)) foraBrutoSet.set(occ.key, []);
      foraBrutoSet.get(occ.key)!.push(`${onde}:${occ.line}`);
      if (universoLicitado.has(occ.key)) continue;
      if (isTests && spans.some((s) => occ.start >= s.inicio && occ.start < s.fim)) continue;
      if (!foraEfetivoSet.has(occ.key)) foraEfetivoSet.set(occ.key, []);
      foraEfetivoSet.get(occ.key)!.push(`${onde}:${occ.line}`);
    }
  };
  for (const { slug, lesson, challenge } of drafts) {
    relatar(`${slug}/solution`, challenge.solutionCode, false);
    relatar(`${slug}/starter`, challenge.starterCode, false);
    relatar(`${slug}/tests`, challenge.testsCode, true);
    for (const secao of lesson.theory) {
      const blocos = extractFencedBlocks(secao.markdown);
      for (const b of blocos.blocks) {
        if (b.isJavaScript) relatar(`${slug}/teoria:${secao.id}`, b.code, false);
      }
    }
  }
  console.log(`chaves FORA — bruto (inclui harness/estrutural/S13 indescontáveis): ${foraBrutoSet.size}`);
  if (foraBrutoSet.size > 0) {
    for (const [k, onde] of foraBrutoSet) console.log(`  bruto: ${k} ${onde.join(', ')}`);
  }
  console.log(`chaves FORA — efetivo (desconta harness/estrutural/S13 licitados): ${foraEfetivoSet.size}`);
  if (foraEfetivoSet.size > 0) {
    for (const [k, onde] of foraEfetivoSet) console.log(`  FORA: ${k} ${onde.join(', ')}`);
  }
  if (foraEfetivoSet.size !== 0) falhas.push(`V2: ${foraEfetivoSet.size} chave(s) fora do universo`);
  console.log('');

  // ══════════════════════════════════════════════════════════════════════════
  // V3 — auditarProgressao (A13–A16) sobre L1–L8 (6 sintéticas + 2 reais)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('=== V3 — auditarProgressao (A13–A16, modo declared) ===');
  // Teoria sintética das aulas 1–6 conforme o contrato do curriculo (os átomos
  // que cada aula promete demonstrar), idêntica aos blocos usados na verificação
  // das aulas 9–11 (padrão da onda: L1–L8 sintéticas + aulas-alvo reais).
  const demosSinteticos: Record<string, string[]> = {
    'como-o-site-confere-seu-codigo': [
      'export function resposta() {\n  return 7;\n}',
      'assert.equal(resposta(), 7);',
      'export function eco(texto) {\n  return texto;\n}',
    ],
    'valor-e-instrucao': [
      'export function resposta() {\n  return 42;\n}',
      'assert.equal(resposta(), 42);',
    ],
    'funcao-e-chamada': [
      'export function resposta() {\n  return 5;\n}\nresposta();',
      'assert.equal(resposta(), 5);',
    ],
    'export-entrega': ['export function resposta() {\n  return 5;\n}'],
    'parametro-e-argumento': ['export function eco(x) {\n  return x;\n}'],
    return: ['export function eco(x) {\n  return x;\n}'],
  };
  const aulasInput: ProgressaoLessonInput[] = [];
  for (const a of curriculo.slice(0, 6)) {
    const blocos = demosSinteticos[a.slug] ?? [];
    const md = blocos.map((b) => '```js\n' + b + '\n```').join('\n\n');
    aulasInput.push({
      ref: `fundamentos-js/${a.slug}`,
      baseDir: `modules/fundamentos-js/lessons/${a.slug}`,
      theory: [{ id: 'demo', title: 'demo', markdown: md }],
      challenges: [],
      declared: { productive: [], receptive: [] },
    });
  }
  for (const { slug, lesson, challenge } of drafts) {
    const theory: TrackTheorySection[] = lesson.theory.map((s: any) => ({
      id: s.id,
      title: s.secao,
      markdown: s.markdown,
    }));
    const aulaCur = aulas1A8.find((a) => a.slug === slug)!;
    aulasInput.push({
      ref: `fundamentos-js/${slug}`,
      baseDir: `modules/fundamentos-js/lessons/${slug}`,
      theory,
      challenges: [
        {
          slug: challenge.slug,
          desafioFile: `drafts/${slug}/challenge-draft.json`,
          files: [{ path: 'solution.mjs', starter: challenge.starterCode, solution: challenge.solutionCode }],
          tests: challenge.testsCode,
        },
      ],
      declared: { productive: aulaCur.avancos.produtivo, receptive: aulaCur.avancos.receptivo },
    });
  }
  const prog = auditarProgressao(aulasInput, { mode: 'declared' });
  const minhas = prog.violations.filter((v) => MEUS_REFS.has(v.ref));
  const erros = minhas.filter((v) => v.severidade === 'erro');
  const avisos = minhas.filter((v) => v.severidade === 'aviso');
  console.log(`violações nas 2 aulas: ${minhas.length} (erros=${erros.length}, avisos=${avisos.length})`);
  for (const v of minhas) {
    console.log(
      `  [${v.severidade.toUpperCase()}] ${v.regra} ${v.ref} campo=${v.campo} construcao=${v.construcao ?? '-'} trecho="${v.trechoOfensor.slice(0, 64)}" — ${v.mensagem.split('—')[1] ?? v.mensagem.slice(0, 60)}`,
    );
  }
  for (const [ref, n] of prog.novosPorAula) {
    if (MEUS_REFS.has(ref)) console.log(`  Novo(${ref}) = ${n}`);
  }
  console.log('  ERROS fora de L7–L8 (contexto das sintéticas — não são desta verificação, listados para leitura):');
  for (const v of prog.violations) {
    if (v.severidade === 'erro' && !MEUS_REFS.has(v.ref)) console.log(`    [erro] ${v.ref}: ${v.regra} — ${v.mensagem.slice(0, 110)}`);
  }
  const avisoA14aL7 = avisos.some((v) => v.regra === 'A14a' && v.ref === 'fundamentos-js/let-e-atribuicao');
  const avisoA14aL8 = avisos.some((v) => v.regra === 'A14a' && v.ref === 'fundamentos-js/string-como-valor');
  const novoNome = prog.novosPorAula.get('fundamentos-js/let-e-atribuicao') ?? -1;
  if (novoNome > 4) falhas.push(`V3: L7 introduz ${novoNome} construções — acima do teto de 4`);
  console.log(`L7 Novo=${novoNome} (teto 4) → ${novoNome <= 4 ? 'ok' : 'ACIMA DO TETO'}; aviso A14a L7: ${avisoA14aL7 ? 'presente' : 'ausente (bom)'}; aviso A14a L8: ${avisoA14aL8 ? 'presente (esperado)' : 'ausente (ok)'}`);
  if (erros.length !== 0) falhas.push(`V3: ${erros.length} erro(s) nas aulas L7–L8`);
  console.log('');

  // ══════════════════════════════════════════════════════════════════════════
  // V4 — QUATRO PROVAS de execução por desafio (+ alternates e wrongSolutions)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('=== V4 — QUATRO PROVAS DE EXECUÇÃO ===');
  const prover = criarProverDeDesafio();
  const formasEsticar: Array<{ nome: string; starter: string; solution: string; tests: string; expected: number }> = [
    {
      nome: 'L7 esticar (mesmo starter, outro valor inicial)',
      starter: 'export function iniciar() {\n  // LACUNA: declare a variável `contador` com `let`, com um valor inicial\n  contador = 5;\n  return contador;\n}\n',
      solution: 'export function iniciar() {\n  let contador = 7;\n  contador = 5;\n  return contador;\n}\n',
      tests: "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { iniciar } from './solution.mjs';\n\ntest('declara com let; a atribuição decide o valor final', () => {\n  assert.equal(iniciar(), 5);\n});\n",
      expected: 1,
    },
    {
      nome: 'L8 esticar (outro nome e outro texto)',
      starter: 'export function texto() {\n  // LACUNA: declare a variável `texto` com `let`, guardando "olá"\n  return texto;\n}\n',
      solution: 'export function texto() {\n  let texto = "olá";\n  return texto;\n}\n',
      tests: "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { texto } from './solution.mjs';\n\ntest('texto também é valor: a string', () => {\n  assert.equal(texto(), 'olá');\n});\n",
      expected: 1,
    },
  ];
  for (const { slug, challenge } of drafts) {
    const input = {
      solutionCode: challenge.solutionCode,
      starterCode: challenge.starterCode,
      testsCode: challenge.testsCode,
      expectedTestCount: challenge.expectedTestCount,
      emptyStubCode: '',
    };
    const v = await prover(input);
    const declarado = countTestDeclarations(challenge.testsCode);
    console.log(`desafio ${slug}`);
    console.log(`  valid=${v.valid} declared=${declarado} expected=${challenge.expectedTestCount} executed=${v.executed}`);
    for (const f of v.failures ?? []) console.log(`  FALHA [${f.proof}]: ${f.reason ?? ''}`);
    if (!v.valid) falhas.push(`V4: ${slug} — provas inválidas`);
    const alternatesFail = [];
    for (const alt of challenge.solutionAlternates ?? []) {
      const r = await prover({ ...input, solutionCode: alt });
      if (!r.valid) alternatesFail.push(`alternate: ${alt.slice(0, 60)}`);
    }
    const wrongsPass = [];
    for (const w of challenge.wrongSolutions ?? []) {
      const r = await prover({ ...input, solutionCode: w });
      if (r.valid) wrongsPass.push(`wrong: ${w.slice(0, 60)}`);
    }
    console.log(`  solutionAlternates: ${(challenge.solutionAlternates ?? []).length} — ${alternatesFail.length === 0 ? 'todas passam' : 'ALGUMA FALHOU: ' + alternatesFail.join(' | ')}`);
    console.log(`  wrongSolutions: ${(challenge.wrongSolutions ?? []).length} — ${wrongsPass.length === 0 ? 'todas falham' : 'ALGUMA PASSOU: ' + wrongsPass.join(' | ')}`);
    if (alternatesFail.length > 0) falhas.push(`V4: ${slug} — alternate falhou`);
    if (wrongsPass.length > 0) falhas.push(`V4: ${slug} — wrongSolution passou`);
  }
  // esticar (reuso A15a — drill da teoria): 4 provas também valem para o degrau
  for (const f of formasEsticar) {
    const v = await prover({ solutionCode: f.solution, starterCode: f.starter, testsCode: f.tests, expectedTestCount: f.expected, emptyStubCode: '' });
    console.log(`desafio ${f.nome}`);
    console.log(`  valid=${v.valid} declared=${v.declared}/${f.expected} executed=${v.executed}`);
    for (const fl of v.failures ?? []) console.log(`  FALHA [${fl.proof}]: ${fl.reason ?? ''}`);
    if (!v.valid) falhas.push(`V4: ${f.nome} — provas inválidas`);
  }
  console.log('');

  // ── veredito ───────────────────────────────────────────────────────────────
  console.log(`VEREDITO: ${falhas.length === 0 ? 'PASSOU — todas as baterias' : 'NÃO PASSOU'}`);
  for (const f of falhas) console.log(`  FALHA: ${f}`);
  if (falhas.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error('FALHA DE INFRAESTRUTURA:', err);
  process.exit(1);
});