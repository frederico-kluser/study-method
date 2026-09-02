#!/usr/bin/env -S npx tsx
/**
 * tools/track-cli.ts — CLI de AUTORIA de trilhas (rodada 8).
 *
 * Quem cria aula é o ADMIN, via CLI. O aluno abre a trilha e escolhe a aula —
 * ele nunca gera conteúdo. Este script é a ferramenta do criador:
 *
 *   npm run track -- <comando> [args...]
 *
 * Comandos:
 *   track:new <slug> --title "Node.js do Zero" --description "..." [--domain programming|math] [--criteria "a; b; c"]
 *   track:module:new <slug> <moduleSlug> --title "Fundamentos" --order 1
 *   track:lesson:new <slug> <moduleSlug> <lessonSlug> --title "..." --summary "..." [--difficulty N]
 *   track:challenge:new <slug> <moduleSlug> <lessonSlug> <challengeSlug> --title "..." --concept <id> [--difficulty N]
 *   track:module:challenge:new <slug> <moduleSlug> <challengeSlug> --title "..." --concept <id> [--difficulty N] [--files "lib/a.mjs,lib/b.mjs"]
 *   track:proficiency:new <slug> --title "..." --concept <id>   (desafio que cobre TUDO)
 *   track:challenge:verify <slug> <moduleSlug> <lessonSlug> <challengeSlug>   (multi-arquivo OK)
 *   track:challenge:context <slug> <moduleSlug> <lessonSlug> <challengeSlug> (validação SEMÂNTICA via LLM — exige OPENROUTER_API_KEY)
 *   track:validate <slug>          — valida a trilha inteira (loader completo)
 *   track:list                     — lista as trilhas disponíveis
 *
 * O scaffold já nasce VÁLIDO (o loader do app é o mesmo que o CLI usa para
 * validar). Desafios scaffoldados têm código TODO — o autor preenche
 * statement/starter/tests/solution e roda track:challenge:verify para provar
 * que os testes passam na referência e FALHAM no stub.
 *
 * ONDA 2 (autoria): track:new aceita --criteria (entryCriteria da trilha — o
 * que o aluno já sabia ANTES de começar; separados por ';') e
 * track:challenge:context valida um desafio contra o CONTEXTO ENSINADO
 * (critérios de entrada + aulas anteriores + a aula atual) com a LLM
 * (cliente de LLM; a chave vem de OPENROUTER_API_KEY) — o veredito é POR TESTE
 * (✔/✖ + motivo) e o exit code espelha o veredito (0 aprovado, 1 reprovado ou
 * não verificado). É a porta de AUDITORIA do fluxo de autoria.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  challengePairFromSource,
  countTestDeclarations,
  pairIsValid,
  verifyChallengePair,
} from '../electron/main/services/challengeExec';
import {
  CHALLENGE_FILE,
  DEFAULT_MIN_FIRST_STAR_MS,
  LESSON_FILE,
  MODULE_FILE,
  PROFICIENCY_FILE,
  TRACK_FILE,
  TRACK_SCHEMA_VERSION,
  TrackChallengeSource,
  TrackLessonSource,
  TrackModuleSource,
  TrackSource,
} from '../electron/main/content/trackTypes';
import {
  TrackLoadError,
  listTrackSlugs,
  loadTrack,
  type LoadedTrack,
} from '../electron/main/content/trackLoader';
import {
  buildChallengeContext,
  verifyChallengeAgainstContext,
  type ChallengeContext,
  type ChallengeToValidate,
  type ContextValidatorLlm,
} from '../electron/main/services/challengeContextValidator';
import { createLlmClient } from '../electron/main/services/llmClient';
import { OPENROUTER_ENV_KEY } from '../shared/llm/constants';

// ─── raiz do conteúdo ────────────────────────────────────────────────────────
const CLI_ROOT = path.resolve(__dirname, '..');
export const TRACKS_DIR = path.join(CLI_ROOT, 'resources', 'tracks');

const USAGE = `uso: npm run track -- <comando> [args...]

comandos:
  track:new <slug> --title "..." --description "..." [--domain programming|math] [--criteria "a; b; c"]
  track:module:new <slug> <moduleSlug> --title "..." --order N
  track:lesson:new <slug> <moduleSlug> <lessonSlug> --title "..." --summary "..." [--difficulty N]
  track:challenge:new <slug> <moduleSlug> <lessonSlug> <challengeSlug> --title "..." --concept <id> [--difficulty N]
  track:module:challenge:new <slug> <moduleSlug> <challengeSlug> --title "..." --concept <id> [--difficulty N] [--files "lib/a.mjs,lib/b.mjs"]
  track:proficiency:new <slug> --title "..." --concept <id>
  track:challenge:verify <slug> <moduleSlug> <lessonSlug> <challengeSlug>
  track:challenge:context <slug> <moduleSlug> <lessonSlug> <challengeSlug>   (validação semântica do desafio contra o contexto ensinado — exige OPENROUTER_API_KEY)
  track:validate <slug>
  track:list`;

function fail(msg: string): never {
  console.error(`erro: ${msg}`);
  console.error(USAGE);
  process.exit(2);
}

function needFlag(flags: Record<string, string>, name: string): string {
  const v = flags[name];
  if (!v) fail(`flag --${name} obrigatória`);
  return v;
}

/** parseia flags --nome valor / --flag (bool) após os posicionais. */
function parseArgs(argv: string[]): { pos: string[]; flags: Record<string, string>; bools: Set<string> } {
  const pos: string[] = [];
  const flags: Record<string, string> = {};
  const bools = new Set<string>();
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const name = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[name] = next;
        i += 2;
      } else {
        bools.add(name);
        i += 1;
      }
    } else {
      pos.push(a);
      i += 1;
    }
  }
  return { pos, flags, bools };
}

async function ensureTracksDir(): Promise<void> {
  await fs.mkdir(TRACKS_DIR, { recursive: true });
}

function trackDir(slug: string): string {
  return path.join(TRACKS_DIR, slug);
}

function moduleDir(track: string, moduleSlug: string): string {
  return path.join(trackDir(track), 'modules', moduleSlug);
}

function lessonDir(track: string, moduleSlug: string, lessonSlug: string): string {
  return path.join(moduleDir(track, moduleSlug), 'lessons', lessonSlug);
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

// ─── scaffolds ───────────────────────────────────────────────────────────────

async function cmdTrackNew(pos: string[], flags: Record<string, string>): Promise<void> {
  const slug = pos[0];
  if (!slug) fail('track:new <slug>');
  const title = needFlag(flags, 'title');
  const description = needFlag(flags, 'description');
  const domain = flags.domain === 'math' ? 'math' : 'programming';
  const dir = trackDir(slug);
  if (await fs.stat(dir).then(() => true).catch(() => false)) {
    fail(`trilha '${slug}' já existe em ${dir}`);
  }
  // ONDA 2 (autoria): --criteria "a; b; c" → entryCriteria no track.json (o
  // que o aluno já sabia antes de começar). Split por ';', trim, filtra
  // vazios; sem flag (ou tudo vazio) → CAMPO AUSENTE (trilha de senso
  // iniciante — o validador pedagógico trata ausência e [] como o mesmo).
  const criteriaRaw = flags.criteria;
  const entryCriteria =
    criteriaRaw !== undefined
      ? criteriaRaw.split(';').map((s) => s.trim()).filter((s) => s.length > 0)
      : undefined;
  const track: TrackSource = {
    schemaVersion: TRACK_SCHEMA_VERSION,
    slug,
    title,
    description,
    language: 'pt-BR',
    domain,
    ...(entryCriteria !== undefined && entryCriteria.length > 0 ? { entryCriteria } : {}),
    modules: [],
  };
  await writeJson(path.join(dir, TRACK_FILE), track);
  console.log(`✓ trilha '${slug}' criada em ${dir}`);
  if (entryCriteria !== undefined && entryCriteria.length > 0) {
    console.log(`  critérios de entrada: ${entryCriteria.join('; ')}`);
  }
  console.log(`  próximo: npm run track -- track:module:new ${slug} <moduleSlug> --title "..." --order 1`);
}

async function cmdModuleNew(pos: string[], flags: Record<string, string>): Promise<void> {
  const [track, moduleSlug] = pos;
  if (!track || !moduleSlug) fail('track:module:new <slug> <moduleSlug>');
  const title = needFlag(flags, 'title');
  const order = Number(flags.order ?? '');
  if (!Number.isInteger(order) || order < 1) fail('--order deve ser inteiro >= 1');

  const dir = moduleDir(track, moduleSlug);
  if (await fs.stat(dir).then(() => true).catch(() => false)) {
    fail(`módulo '${moduleSlug}' já existe em ${dir}`);
  }
  const meta: TrackModuleSource = {
    schemaVersion: TRACK_SCHEMA_VERSION,
    slug: moduleSlug,
    title,
    order,
    lessons: [],
  };
  await writeJson(path.join(dir, MODULE_FILE), meta);

  // registra no track.json
  const trackPath = path.join(trackDir(track), TRACK_FILE);
  const trackMeta = JSON.parse(await fs.readFile(trackPath, 'utf8')) as TrackSource;
  if (trackMeta.modules.includes(moduleSlug)) fail(`módulo '${moduleSlug}' já declarado no track.json`);
  trackMeta.modules.push(moduleSlug);
  await writeJson(trackPath, trackMeta);
  console.log(`✓ módulo '${moduleSlug}' criado e declarado na trilha '${track}'.`);
}

async function cmdLessonNew(pos: string[], flags: Record<string, string>): Promise<void> {
  const [track, moduleSlug, lessonSlug] = pos;
  if (!track || !moduleSlug || !lessonSlug) fail('track:lesson:new <slug> <moduleSlug> <lessonSlug>');
  const title = needFlag(flags, 'title');
  const summary = needFlag(flags, 'summary');
  const difficulty = Number(flags.difficulty ?? '1');

  const dir = lessonDir(track, moduleSlug, lessonSlug);
  if (await fs.stat(dir).then(() => true).catch(() => false)) {
    fail(`aula '${lessonSlug}' já existe em ${dir}`);
  }
  const lesson: TrackLessonSource = {
    schemaVersion: TRACK_SCHEMA_VERSION,
    slug: lessonSlug,
    title,
    summary,
    difficulty,
    concepts: [],
    prerequisites: [],
    theory: [
      {
        id: 'introducao',
        title: 'Introdução',
        markdown: 'TODO: escreva aqui a base teórica desta aula, em linguagem simples.',
      },
    ],
    sources: [],
    challenges: [],
  };
  await writeJson(path.join(dir, LESSON_FILE), lesson);

  const modulePath = path.join(moduleDir(track, moduleSlug), MODULE_FILE);
  const meta = JSON.parse(await fs.readFile(modulePath, 'utf8')) as TrackModuleSource;
  if (meta.lessons.includes(lessonSlug)) fail(`aula '${lessonSlug}' já declarada no módulo`);
  meta.lessons.push(lessonSlug);
  await writeJson(modulePath, meta);
  console.log(`✓ aula '${lessonSlug}' criada no módulo '${moduleSlug}'.`);
  console.log(`  preencha a teoria e rode: npm run track -- track:validate ${track}`);
}

/**
 * Converte slug kebab-case em identificador camelCase VÁLIDO de JS:
 * 'desafio-1' → 'desafio1', 'fibonacci-recursivo' → 'fibonacciRecursivo'.
 */
export function slugToFunctionName(slug: string): string {
  const camel = slug.replace(/-([a-z0-9])/gi, (_m, c: string) => c.toUpperCase());
  return /^[a-zA-Z_$]/.test(camel) ? camel : `f_${camel}`;
}

/** Template de desafio nodejs (ESM): solução exporta função(s), testes importam. */
function challengeTemplate(slug: string, title: string, concept: string, difficulty: number): TrackChallengeSource {
  const fnName = slugToFunctionName(slug);
  return {
    schemaVersion: TRACK_SCHEMA_VERSION,
    slug,
    title,
    concept,
    difficulty,
    language: 'nodejs',
    statement: `# ${title}\n\nTODO: escreva o enunciado (o que o aluno deve fazer, em pt-BR, linguagem simples).\n\n**Importante:** leia o enunciado com calma e clique em **Começar** para iniciar o cronômetro.`,
    starterCode: `export function ${fnName}(x) {\n  // TODO: implemente a função\n  throw new Error('não implementado');\n}\n`,
    testsCode: `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { ${fnName} } from './solution.mjs';\n\ntest('caso 1', () => {\n  assert.equal(${fnName}(1), 1);\n});\n`,
    solutionCode: `export function ${fnName}(x) {\n  return x;\n}\n`,
    expectedTestCount: 1,
    minFirstStarMs: DEFAULT_MIN_FIRST_STAR_MS,
  };
}

async function cmdChallengeNew(pos: string[], flags: Record<string, string>): Promise<void> {
  const [track, moduleSlug, lessonSlug, challengeSlug] = pos;
  if (!track || !moduleSlug || !lessonSlug || !challengeSlug) fail('track:challenge:new <slug> <moduleSlug> <lessonSlug> <challengeSlug>');
  const title = needFlag(flags, 'title');
  const concept = needFlag(flags, 'concept');
  const difficulty = Number(flags.difficulty ?? '2');

  const challenge = challengeTemplate(challengeSlug, title, concept, difficulty);
  const dir = path.join(lessonDir(track, moduleSlug, lessonSlug), 'challenges', challengeSlug);
  await writeJson(path.join(dir, CHALLENGE_FILE), challenge);

  const lessonPath = path.join(lessonDir(track, moduleSlug, lessonSlug), LESSON_FILE);
  const lesson = JSON.parse(await fs.readFile(lessonPath, 'utf8')) as TrackLessonSource;
  if (!lesson.challenges.includes(challengeSlug)) {
    lesson.challenges.push(challengeSlug);
    await writeJson(lessonPath, lesson);
  }
  console.log(`✓ desafio '${challengeSlug}' criado na aula '${lessonSlug}'.`);
  console.log(`  preencha statement/starter/tests/solution e verifique:`);
  console.log(`  npm run track -- track:challenge:verify ${track} ${moduleSlug} ${lessonSlug} ${challengeSlug}`);
}

/**
 * ADITIVO (rodada 9): template de desafio MULTI-ARQUIVO — N arquivos, cada um
 * com starter (TODO) e solução próprios; os testes importam de TODOS. O scaffold
 * nasce VÁLIDO para o loader (files presente → starter/solution de topo não são
 * exigidos); o autor preenche o código e verifica com track:validate.
 */
function multiFileChallengeTemplate(
  slug: string,
  title: string,
  concept: string,
  difficulty: number,
  filePaths: string[],
): TrackChallengeSource {
  const names = filePaths.map((p) => slugToFunctionName(path.basename(p, '.mjs')));
  const files = filePaths.map((p, i) => ({
    path: p,
    starterCode: `export function ${names[i]}(x) {\n  // TODO: implemente a função\n  throw new Error('não implementado');\n}\n`,
    solutionCode: `export function ${names[i]}(x) {\n  return x;\n}\n`,
  }));
  const imports = files.map((f, i) => `import { ${names[i]} } from './${f.path}';`).join('\n');
  const tests = files.map((f, i) => `test('${names[i]} caso 1', () => {\n  assert.equal(${names[i]}(1), 1);\n});`).join('\n');
  return {
    schemaVersion: TRACK_SCHEMA_VERSION,
    slug,
    title,
    concept,
    difficulty,
    language: 'nodejs',
    statement: `# ${title}\n\nTODO: escreva o enunciado (o que o aluno deve fazer, em pt-BR, linguagem simples).\n\n**Importante:** leia o enunciado com calma e clique em **Começar** para iniciar o cronômetro.`,
    files,
    testsCode: `import { test } from 'node:test';\nimport assert from 'node:assert/strict';\n${imports}\n${tests}\n`,
    expectedTestCount: files.length,
    minFirstStarMs: DEFAULT_MIN_FIRST_STAR_MS,
  };
}

async function cmdModuleChallengeNew(pos: string[], flags: Record<string, string>): Promise<void> {
  const [track, moduleSlug, challengeSlug] = pos;
  if (!track || !moduleSlug || !challengeSlug) fail('track:module:challenge:new <slug> <moduleSlug> <challengeSlug>');
  const title = needFlag(flags, 'title');
  const concept = needFlag(flags, 'concept');
  const difficulty = Number(flags.difficulty ?? '2');

  // --files "lib/soma.mjs,lib/multiplica.mjs" → desafio MULTI-ARQUIVO.
  const filePaths = (flags.files ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const challenge =
    filePaths.length > 0
      ? multiFileChallengeTemplate(challengeSlug, title, concept, difficulty, filePaths)
      : challengeTemplate(challengeSlug, title, concept, difficulty);

  const dir = path.join(moduleDir(track, moduleSlug), 'challenges', challengeSlug);
  await writeJson(path.join(dir, CHALLENGE_FILE), challenge);

  // declara no module.json (campo challenge — ADITIVO rodada 9).
  const modulePath = path.join(moduleDir(track, moduleSlug), MODULE_FILE);
  const meta = JSON.parse(await fs.readFile(modulePath, 'utf8')) as TrackModuleSource;
  meta.challenge = challengeSlug;
  await writeJson(modulePath, meta);
  console.log(`✓ desafio do módulo '${challengeSlug}' criado em ${path.dirname(dir)} e declarado no module.json.`);
  console.log(`  preencha statement/starter/tests/solution e verifique:`);
  console.log(`  npm run track -- track:validate ${track}`);
}

async function cmdProficiencyNew(pos: string[], flags: Record<string, string>): Promise<void> {
  const [track] = pos;
  if (!track) fail('track:proficiency:new <slug>');
  const title = needFlag(flags, 'title');
  const concept = needFlag(flags, 'concept');
  const challenge = challengeTemplate('proficiencia', title, concept, 5);
  challenge.minFirstStarMs = 120_000; // proficiência: carência maior da 1ª estrela
  await writeJson(path.join(trackDir(track), PROFICIENCY_FILE), challenge);
  console.log(`✓ teste de proficiência criado na trilha '${track}'.`);
  console.log(`  este desafio deve cobrir TODOS os módulos da trilha.`);
}

// ─── verificação de desafio (provas 1 e 2 do protocolo, por execução) ────────
// Implementação ÚNICA em electron/main/services/challengeExec.ts — o CLI e o
// main usam o MESMO runner (um comportamento, dois chamadores). A conversão
// files[] → solutionFiles/starterFiles (challengePairFromSource) também vive
// lá — extraída para o módulo puro testado (guarda do track:validate).

/** Provas de execução de UM desafio (multi-arquivo OK) + log. Retorna ok. */
async function verifyAndLogChallenge(slug: string, title: string, challenge: TrackChallengeSource): Promise<boolean> {
  const result = await verifyChallengePair(challengePairFromSource(challenge));
  const tests = countTestDeclarations(challenge.testsCode);
  const ok = result.solutionPasses && result.starterFails && tests === challenge.expectedTestCount;
  console.log(`desafio '${slug}' (${title})`);
  if (challenge.files && challenge.files.length > 0) {
    console.log(`  arquivos:                 ${challenge.files.map((f) => f.path).join(', ')}`);
  }
  console.log(`  testes declarados:        ${challenge.expectedTestCount}`);
  console.log(`  testes no arquivo:        ${tests}`);
  console.log(`  solução de referência:    ${result.solutionPasses ? 'PASSA ✓' : 'FALHA ✗'}`);
  console.log(`  starter (aluno):          ${result.starterFails ? 'FALHA (ok) ✓' : 'PASSA (problema!) ✗'}`);
  if (!ok) {
    console.error('\n--- saída ---');
    console.error(result.output.slice(0, 4000));
  }
  return ok;
}

async function cmdChallengeVerify(pos: string[]): Promise<void> {
  const [track, moduleSlug, lessonSlug, challengeSlug] = pos;
  if (!track || !moduleSlug || !lessonSlug || !challengeSlug) {
    fail('track:challenge:verify <slug> <moduleSlug> <lessonSlug> <challengeSlug>');
  }
  const dir = path.join(lessonDir(track, moduleSlug, lessonSlug), 'challenges', challengeSlug);
  const challengePath = path.join(dir, CHALLENGE_FILE);
  const challenge = JSON.parse(await fs.readFile(challengePath, 'utf8')) as TrackChallengeSource;
  const ok = await verifyAndLogChallenge(challengeSlug, challenge.title, challenge);
  if (!ok) process.exit(1);
  console.log(`✓ desafio aprovado pelas provas de execução.`);
}

// ─── validação SEMÂNTICA de desafio (onda 2 — autoria) ───────────────────────
// O desafio só pode cobrar conhecimento JÁ ENSINADO (premissa do produto):
// critérios de entrada da trilha + aulas anteriores + a aula atual. A LLM
// julga cada test('...') do testsCode contra esse contexto (THINKING MÁXIMO) e
// devolve o veredito POR TESTE. A chave vem do ambiente (OPENROUTER_API_KEY) —
// nunca de settings: este CLI roda FORA do electron.

/** Adapta o cliente de LLM one-shot à assinatura de llm do validador. */
function makeContextLlm(apiKey: string): ContextValidatorLlm {
  const llm = createLlmClient({ apiKey: async () => apiKey });
  return async (req) => {
    const res = await llm.chatCompletion(req);
    return { content: res.content };
  };
}

async function cmdChallengeContext(pos: string[]): Promise<void> {
  const [track, moduleSlug, lessonSlug, challengeSlug] = pos;
  if (!track || !moduleSlug || !lessonSlug || !challengeSlug) {
    fail('track:challenge:context <slug> <moduleSlug> <lessonSlug> <challengeSlug>');
  }
  const apiKey = (process.env[OPENROUTER_ENV_KEY] ?? '').trim();
  if (!apiKey) {
    console.error('erro: OPENROUTER_API_KEY não definida — defina a variável de ambiente para validar o desafio semanticamente.');
    process.exit(1);
  }

  let loaded: LoadedTrack;
  try {
    loaded = await loadTrack(trackDir(track));
  } catch (err) {
    if (err instanceof TrackLoadError) {
      console.error(`✗ trilha '${track}' inválida (${err.issues.length} problema(s)):`);
      for (const issue of err.issues) {
        console.error(`  - ${issue.file}: ${issue.message}`);
      }
      process.exit(1);
    }
    throw err;
  }
  // Montagem do contexto + leitura/parse do challenge.json: QUALQUER falha
  // (aula/módulo/desafio inexistente — buildChallengeContext lança Error
  // plain; arquivo ausente/corrompido — readFile/JSON.parse) vira mensagem
  // LIMPA e acionável com exit 1, NUNCA stack trace do main().catch.
  let context: ChallengeContext;
  let challengeToValidate: ChallengeToValidate;
  try {
    context = buildChallengeContext(loaded, moduleSlug, lessonSlug);
    const challengePath = path.join(lessonDir(track, moduleSlug, lessonSlug), 'challenges', challengeSlug, CHALLENGE_FILE);
    const challenge = JSON.parse(await fs.readFile(challengePath, 'utf8')) as TrackChallengeSource;
    // Desafio multi-arquivo: as soluções vivem nos arquivos — concatena para o
    // validador julgar a implementabilidade com o que foi ensinado.
    challengeToValidate = {
      title: challenge.title,
      statement: challenge.statement,
      testsCode: challenge.testsCode,
      solutionCode:
        challenge.files && challenge.files.length > 0
          ? challenge.files.map((f) => f.solutionCode).join('\n')
          : (challenge.solutionCode ?? ''),
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(
      `✗ não foi possível montar a validação do desafio '${challengeSlug}' (módulo '${moduleSlug}' / aula '${lessonSlug}'): ${detail}`,
    );
    console.error(`  confira os slugs com: npm run track -- track:validate ${track}`);
    process.exit(1);
  }

  const verdict = await verifyChallengeAgainstContext({
    context,
    challenge: challengeToValidate,
    llm: makeContextLlm(apiKey),
  });
  if (!verdict.ok) {
    console.error(`✗ desafio '${challengeSlug}' NÃO VERIFICADO (${verdict.error.code}): ${verdict.error.message}`);
    process.exit(1);
  }

  console.log(`validação semântica do desafio '${challengeSlug}' (${challengeToValidate.title}):`);
  console.log(`  trilha: ${context.trackTitle}`);
  console.log(`  critérios de entrada: ${context.entryCriteria.length > 0 ? context.entryCriteria.join('; ') : '(nenhum — trilha de senso iniciante)'}`);
  console.log(`  aulas anteriores: ${context.previousLessons.length > 0 ? context.previousLessons.map((l) => l.slug).join(', ') : '(nenhuma — primeira aula da trilha)'}`);
  console.log(`  aula atual: ${context.currentLesson.slug} — ${context.currentLesson.title}`);
  console.log('');
  for (const t of verdict.testes) {
    console.log(`  ${t.aprovado ? '✔' : '✖'} ${t.nome} — ${t.motivo}`);
  }
  console.log('');
  if (verdict.aprovado) {
    console.log(`✓ desafio APROVADO pela validação semântica (${verdict.testes.length} teste(s) — só cobra o que foi ensinado).`);
  } else {
    console.error(
      `✗ desafio REPROVADO pela validação semântica (${verdict.testes.filter((t) => !t.aprovado).length} teste(s) cobram conhecimento não ensinado).`,
    );
    process.exit(1);
  }
}

// ─── validação / listagem ────────────────────────────────────────────────────

async function cmdValidate(pos: string[]): Promise<void> {
  const [slug] = pos;
  if (!slug) fail('track:validate <slug>');
  const dir = trackDir(slug);
  try {
    const track = await loadTrack(dir);
    const lessonCount = track.modules.reduce((n, m) => n + m.lessons.length, 0);
    const challengeCount = track.modules.reduce(
      (n, m) => n + m.lessons.reduce((c, l) => c + l.challenges.length, 0),
      0,
    );
    const moduleChallengeCount = track.modules.filter((m) => m.challenge !== null).length;
    console.log(`✓ trilha '${slug}' — ${track.root.title}`);
    console.log(`  módulos: ${track.modules.length}`);
    console.log(`  aulas:   ${lessonCount}`);
    console.log(`  desafios: ${challengeCount}`);
    console.log(`  desafios de módulo: ${moduleChallengeCount}`);
    console.log(`  proficiência: ${track.proficiency ? `${track.proficiency.title} ✓` : 'ausente'}`);
    if (track.proficiency) {
      const v = await verifyChallengePair(challengePairFromSource(track.proficiency));
      const tests = countTestDeclarations(track.proficiency.testsCode);
      const ok = pairIsValid(v) && tests === track.proficiency.expectedTestCount;
      console.log(`    provas de execução: ${ok ? 'ok ✓' : 'FALHOU ✗ (rode track:challenge:verify)'}`);
    }
    for (const mod of track.modules) {
      // ADITIVO (rodada 9): desafio do MÓDULO também passa pelas provas.
      if (mod.challenge) {
        const ok = await verifyAndLogChallenge(mod.challenge.slug, mod.challenge.title, mod.challenge);
        console.log(`  [${mod.meta.slug}/module] ${mod.challenge.slug}: ${ok ? 'verificado ✓' : 'NÃO VERIFICADO ✗'}`);
      }
      for (const lesson of mod.lessons) {
        for (const ch of lesson.challenges) {
          const v = await verifyChallengePair(challengePairFromSource(ch));
          const tests = countTestDeclarations(ch.testsCode);
          const ok = pairIsValid(v) && tests === ch.expectedTestCount;
          console.log(`  [${mod.meta.slug}/${lesson.meta.slug}] ${ch.slug}: ${ok ? 'verificado ✓' : 'NÃO VERIFICADO ✗'}`);
        }
      }
    }
  } catch (err) {
    if (err instanceof TrackLoadError) {
      console.error(`✗ trilha '${slug}' inválida (${err.issues.length} problema(s)):`);
      for (const issue of err.issues) {
        console.error(`  - ${issue.file}: ${issue.message}`);
      }
      process.exit(1);
    }
    throw err;
  }
}

async function cmdList(): Promise<void> {
  await ensureTracksDir();
  const slugs = await listTrackSlugs(TRACKS_DIR);
  if (slugs.length === 0) {
    console.log('nenhuma trilha ainda — crie a primeira com track:new');
    return;
  }
  for (const slug of slugs) {
    try {
      const t = await loadTrack(trackDir(slug));
      const lessons = t.modules.reduce((n, m) => n + m.lessons.length, 0);
      console.log(`- ${slug}: ${t.root.title} (${t.modules.length} módulos, ${lessons} aulas${t.proficiency ? ', proficiência' : ''})`);
    } catch (err) {
      if (err instanceof TrackLoadError) {
        console.log(`- ${slug}: INVALIDA (${err.issues.length} problema(s))`);
      } else {
        throw err;
      }
    }
  }
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { pos, flags } = parseArgs(argv);
  const [cmd, ...rest] = pos;
  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log(USAGE);
    return;
  }
  await ensureTracksDir();
  switch (cmd) {
    case 'track:new':
      await cmdTrackNew(rest, flags);
      break;
    case 'track:module:new':
      await cmdModuleNew(rest, flags);
      break;
    case 'track:lesson:new':
      await cmdLessonNew(rest, flags);
      break;
    case 'track:challenge:new':
      await cmdChallengeNew(rest, flags);
      break;
    case 'track:module:challenge:new':
      await cmdModuleChallengeNew(rest, flags);
      break;
    case 'track:proficiency:new':
      await cmdProficiencyNew(rest, flags);
      break;
    case 'track:challenge:verify':
      await cmdChallengeVerify(rest);
      break;
    case 'track:challenge:context':
      await cmdChallengeContext(rest);
      break;
    case 'track:validate':
      await cmdValidate(rest);
      break;
    case 'track:list':
      await cmdList();
      break;
    default:
      fail(`comando desconhecido: ${cmd}`);
  }
}

main().catch((err) => {
  console.error(`erro inesperado:`, err);
  process.exit(1);
});
