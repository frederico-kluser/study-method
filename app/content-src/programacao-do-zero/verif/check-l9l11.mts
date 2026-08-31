/**
 * VERIFICAÇÃO — aulas L9–L11 da trilha micro programacao-do-zero
 * (estado-ler-depois-de-escrever · const · erro-sintaxe-vs-erro-valor).
 *
 * Quatro baterias determinísticas, zero LLM:
 *
 *   V1 — SCHEMAS: LessonDraftSchema/ChallengeDraftSchema nos 6 drafts → 0 erros.
 *   V2 — EXTRATOR ⊆ CURRÍCULO: toda ocorrência extraída de solutionCode,
 *        starterCode, testsCode e blocos js da teoria está no universo cumulativo
 *        do curriculo (L1–L11) ∪ HARNESS_RECEPTIVE_SEED ∪
 *        STRUCTURAL_ALWAYS_ALLOWED (a semente receptiva do harness e os
 *        estruturais são licitados pelo próprio curriculo.md §65 — 'Nota do
 *        invólucro'); testes têm isenção extra dos spans mecânicos S13.
 *        Esperado: 0 fora (efetivo). O número BRUTO (sem desconto de harness/
 *        estrutural/S13) também é reportado, com a lista do que sobrou.
 *   V3 — auditarProgressao (bateria A13–A16, modo declared) sobre as aulas
 *        1–11 (aulas 1–8 sintetizadas a partir de demonstrado_na_teoria do
 *        curriculo + aulas 9–11 reais dos drafts) → 0 ERROS nas 3 aulas;
 *        os AVISOS A14a esperados de L9 e L11 (aulas de leitura, Novo=0).
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

const SLUGS = ['estado-ler-depois-de-escrever', 'const', 'erro-sintaxe-vs-erro-valor'];
const AULAS_9_11_REF = new Set(SLUGS.map((s) => `fundamentos-js/${s}`));

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
  const aulas1A11 = curriculo.slice(0, 11);

  // ── conjunto-universo do curriculo (cumulativo L1–L11) ────────────────────
  const universo = new Set<string>();
  for (const a of aulas1A11) {
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
  // V2 — EXTRATOR ⊆ universo do curriculo (cumulativo L1–L11)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('=== V2 — EXTRATOR ⊆ UNIVERSO DO CURRICULO (L1–L11) ===');
  let foraEfetivo = 0;
  const foraBruto = new Map<string, string[]>();
  const parseDeStarter = new Map<string, boolean>();
  const relatar = (onde: string, code: string, isTests: boolean): void => {
    const r = extractAllOccurrences(code);
    if (!r.ok) {
      console.log(`  [parse error em ${onde}] — ocorrência ignorada (esperado só para starter/teoria proposital)`);
      return;
    }
    const spans = isTests ? spansMecanicosDeTeste(code) : [];
    for (const occ of r.occurrences) {
      if (universoLicitado.has(occ.key)) continue;
      if (isTests && spans.some((s) => occ.start >= s.inicio && occ.start < s.fim)) continue;
      if (!foraBruto.has(occ.key)) foraBruto.set(occ.key, []);
      foraBruto.get(occ.key)!.push(`${onde}:${occ.line}`);
    }
  };
  for (const { slug, lesson, challenge } of drafts) {
    relatar(`${slug}/solution`, challenge.solutionCode, false);
    const rs = extractAllOccurrences(challenge.starterCode);
    parseDeStarter.set(slug, rs.ok);
    if (rs.ok) relatar(`${slug}/starter`, challenge.starterCode, false);
    relatar(`${slug}/tests`, challenge.testsCode, true);
    for (const secao of lesson.theory) {
      const blocos = extractFencedBlocks(secao.markdown);
      for (const b of blocos.blocks) {
        if (b.isJavaScript) relatar(`${slug}/teoria:${secao.id}`, b.code, false);
      }
    }
  }
  foraEfetivo = foraBruto.size;
  console.log(`chaves FORA (efetivo, desconto harness/estrutural/S13): ${foraEfetivo}`);
  if (foraEfetivo > 0) {
    for (const [k, onde] of foraBruto) console.log(`  FORA: ${k} ${onde.join(', ')}`);
  }
  for (const { slug } of drafts) {
    console.log(`starter ${slug}: ${parseDeStarter.get(slug) ? 'parseia' : 'NÃO parseia (esperado na falha da prova 2)'}`);
  }
  if (foraEfetivo !== 0) falhas.push(`V2: ${foraEfetivo} chave(s) fora do universo`);
  console.log('');

  // ══════════════════════════════════════════════════════════════════════════
  // V3 — auditarProgressao (A13–A16) sobre L1–L11 (8 sintéticas + 3 reais)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('=== V3 — auditarProgressao (A13–A16, modo declared) ===');
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
    'export-entrega': [
      'export function resposta() {\n  return 5;\n}',
    ],
    'parametro-e-argumento': [
      'export function eco(x) {\n  return x;\n}',
    ],
    return: [
      'export function eco(x) {\n  return x;\n}',
    ],
    'let-e-atribuicao': [
      'export function marcar() {\n  let contador = 0;\n  contador = 5;\n  return contador;\n}',
    ],
    'string-como-valor': [
      'export function saudacao() {\n  let mensagem = "oi";\n  return mensagem;\n}',
    ],
  };
  const aulasInput: ProgressaoLessonInput[] = [];
  for (const a of curriculo.slice(0, 8)) {
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
    const aulaCur = aulas1A11.find((a) => a.slug === slug)!;
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
  const minhas = prog.violations.filter((v) => AULAS_9_11_REF.has(v.ref));
  const erros = minhas.filter((v) => v.severidade === 'erro');
  const avisos = minhas.filter((v) => v.severidade === 'aviso');
  console.log(`violações nas 3 aulas: ${minhas.length} (erros=${erros.length}, avisos=${avisos.length})`);
  for (const v of minhas) {
    console.log(
      `  [${v.severidade.toUpperCase()}] ${v.regra} ${v.ref} campo=${v.campo} construcao=${v.construcao ?? '-'} trecho="${v.trechoOfensor.slice(0, 64)}"`,
    );
  }
  for (const [ref, n] of prog.novosPorAula) {
    if (AULAS_9_11_REF.has(ref)) console.log(`  Novo(${ref}) = ${n}`);
  }
  const avisoA14aL9 = avisos.some((v) => v.regra === 'A14a' && v.ref === 'fundamentos-js/estado-ler-depois-de-escrever');
  const avisoA14aL11 = avisos.some((v) => v.regra === 'A14a' && v.ref === 'fundamentos-js/erro-sintaxe-vs-erro-valor');
  console.log(`averso esperado A14a L9: ${avisoA14aL9 ? 'SIM' : 'NÃO'}; A14a L11: ${avisoA14aL11 ? 'SIM' : 'NÃO'}`);
  if (erros.length !== 0) falhas.push(`V3: ${erros.length} erro(s) na bateria A13–A16`);
  if (!avisoA14aL9 || !avisoA14aL11) falhas.push('V3: avisos A14a esperados de L9/L11 ausentes');
  console.log('');

  // ══════════════════════════════════════════════════════════════════════════
  // V4 — QUATRO PROVAS de execução por desafio (+ alternates e wrongSolutions)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('=== V4 — QUATRO PROVAS DE EXECUÇÃO ===');
  const prover = criarProverDeDesafio();
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
      if (!r.valid) alternatesFail.push('alternate não passou');
    }
    const wrongsPass = [];
    for (const w of challenge.wrongSolutions ?? []) {
      const r = await prover({ ...input, solutionCode: w });
      if (r.valid) wrongsPass.push('wrongSolution passou');
    }
    console.log(`  solutionAlternates: ${(challenge.solutionAlternates ?? []).length} — ${alternatesFail.length === 0 ? 'todas passam' : 'ALGUMA FALHOU: ' + alternatesFail.join(', ')}`);
    console.log(`  wrongSolutions: ${(challenge.wrongSolutions ?? []).length} — ${wrongsPass.length === 0 ? 'todas falham' : 'ALGUMA PASSOU: ' + wrongsPass.join(', ')}`);
    if (alternatesFail.length > 0) falhas.push(`V4: ${slug} — alternate falhou`);
    if (wrongsPass.length > 0) falhas.push(`V4: ${slug} — wrongSolution passou`);
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