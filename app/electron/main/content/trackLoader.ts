/**
 * electron/main/content/trackLoader.ts — carrega e valida as TRILHAS (rodada 8).
 *
 * O conteúdo das trilhas vive em `resources/tracks/<slug>/` (dev:
 * app.getAppPath()/resources; empacotado: process.resourcesPath — mesmo
 * padrão dos assets de voz). O loader é a ÚNICA porta de entrada do conteúdo:
 * o CLI de autoria escreve no MESMO formato e o app consome o mesmo loader —
 * assim a validação que o CLI aplica ao gerar é a mesma que o runtime aplica.
 *
 * Princípios:
 *   - PURE/DI: `tracksDir` injetável (tests usam dir fake); nenhum import de
 *     Electron aqui — o diretório é resolvido pelo chamador (ipc/study-handlers
 *     resolve app.getAppPath()/resources/tracks).
 *   - TODA leitura valida; arquivo inválido vira erro estruturado com issues —
 *     nunca um objeto parcial voando.
 *   - Integridade de referências: prerequisites/challenges/modules só apontam
 *     para slugs que existem (falha = trilha corrompida).
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  CHALLENGE_FILE,
  LESSON_FILE,
  MODULE_FILE,
  PROFICIENCY_FILE,
  TRACK_FILE,
  TrackChallengeSource,
  TrackLessonSource,
  TrackModuleSource,
  TrackSource,
  TrackValidationIssue,
  trackProgrammingLanguage,
  validateChallengeSource,
  validateLessonSource,
  validateModuleSource,
  validateTrackSource,
} from './trackTypes';
import { adapterIdForChallengeLanguage } from '../engine/lang/registry';

/** Uma trilha CARREGADA e VALIDADA (a fonte de verdade que o runtime consome). */
export interface LoadedTrack {
  root: TrackSource;
  modules: LoadedModule[];
  /** desafio de proficiência (cobre tudo) — null quando a trilha não tem um. */
  proficiency: TrackChallengeSource | null;
  /** path absoluto da pasta da trilha. */
  dir: string;
}

export interface LoadedModule {
  meta: TrackModuleSource;
  lessons: LoadedLesson[];
  /**
   * ADITIVO (rodada 9): DESAFIO DO MÓDULO (fim do módulo) — desafio próprio do
   * módulo em challenges/<slug>/challenge.json. null quando o módulo não declara
   * um (module.json sem campo challenge).
   */
  challenge: TrackChallengeSource | null;
}

export interface LoadedLesson {
  /**
   * fonte CARREGADA e VALIDADA da aula — o loader faz CAST, não pick (§10 do
   * docs/16-engine-de-trilha.md): campos ADITIVOS como `assertions` (onda 1
   * schema-quiz) chegam aqui AUTOMATICAMENTE via meta, sem derrubar trilhas
   * antigas que não os declaram (ausência = aula sem quiz, válida).
   */
  meta: TrackLessonSource;
  /** desafios da aula, na ordem declarada (slugs validados contra o disco). */
  challenges: TrackChallengeSource[];
}

export class TrackLoadError extends Error {
  constructor(
    message: string,
    readonly issues: TrackValidationIssue[],
  ) {
    super(message);
    this.name = 'TrackLoadError';
  }
}

async function readJson(file: string): Promise<unknown> {
  const text = await fs.readFile(file, 'utf8');
  return JSON.parse(text);
}

/** Concatena issues de múltiplos validadores num array único. */
function concat(...groups: TrackValidationIssue[][]): TrackValidationIssue[] {
  return groups.flat();
}

/**
 * §6 (linhas 934-940) de `docs/research/08-multilingua-trava-deterministica.md`:
 *
 *     "language": "python",   // deriva de track.programmingLanguage;
 *                             //  o loader confere igualdade
 *
 * A igualdade é conferida sobre o ADAPTADOR RESOLVIDO, não sobre a string
 * crua, e o motivo é o disco de hoje: o default de trilha é a LINGUAGEM
 * (`javascript`) e o dos desafios é o RUNTIME (`nodejs`) — §6: "`nodejs` não é
 * uma linguagem, é um runtime". Comparar as strings reprovaria 112 desafios
 * por escreverem a mesma coisa com dois nomes; comparar os adaptadores pega o
 * erro que importa (um desafio Python numa trilha JavaScript seria auditado
 * pelo parser errado).
 *
 * FAIL-CLOSED: divergência é `TrackLoadError`, e a mensagem NOMEIA OS DOIS
 * valores divergentes — quem for consertar o arquivo precisa saber qual dos
 * dois lados mudar.
 *
 * EXPORTADA de propósito: com UM adaptador registrado (o estado de hoje), a
 * divergência é INALCANÇÁVEL por dado válido — todo token legítimo resolve
 * para `javascript`. A função é exportada para (a) ser testável diretamente
 * enquanto isso e (b) a onda 5 poder aplicá-la também na materialização (F12),
 * onde o desafio nasce, e não só na leitura.
 */
export function issuesDeLinguagemDoDesafio(
  challenge: TrackChallengeSource,
  file: string,
  esperado: { adapterId: string; declarado: string },
): TrackValidationIssue[] {
  const doDesafio = adapterIdForChallengeLanguage(challenge.language);
  if (doDesafio === esperado.adapterId) return [];
  return [
    {
      file,
      message:
        `language do desafio (${JSON.stringify(challenge.language)}` +
        `${doDesafio === null ? ', sem adaptador' : ` → adaptador '${doDesafio}'`}) ` +
        `diverge da linguagem da trilha (track.programmingLanguage = ${JSON.stringify(esperado.declarado)} ` +
        `→ adaptador '${esperado.adapterId}') — o desafio seria auditado pelo parser errado`,
    },
  ];
}

/**
 * Carrega e valida UMA trilha inteira (track.json + módulos + aulas + desafios
 * + proficiência). Lança TrackLoadError quando qualquer arquivo é inválido ou
 * uma referência quebra — o CLI usa o mesmo para rejeitar conteúdo ruim.
 */
export async function loadTrack(trackDir: string): Promise<LoadedTrack> {
  const issues: TrackValidationIssue[] = [];

  const trackPath = path.join(trackDir, TRACK_FILE);
  const trackRaw = await readJson(trackPath);
  issues.push(...validateTrackSource(trackRaw, trackPath));
  if (issues.length > 0) {
    throw new TrackLoadError(`trilha inválida em ${trackDir}`, issues);
  }
  const track = trackRaw as TrackSource;

  // §6 linhas 934-940: a linguagem que TODO desafio da trilha tem de resolver.
  // `validateTrackSource` já reprovou um `programmingLanguage` sem adaptador,
  // então aqui o valor é sempre resolvível; o `?? ''` é defesa muda contra um
  // futuro caminho que chame `loadTrack` sem validar (nunca casaria com
  // adaptador nenhum → fail-closed, jamais default silencioso).
  const linguagemDaTrilha = trackProgrammingLanguage(track);
  const esperadoDeLinguagem = {
    adapterId: adapterIdForChallengeLanguage(linguagemDaTrilha) ?? '',
    declarado: linguagemDaTrilha,
  };

  const modules: LoadedModule[] = [];
  const knownChallengeSlugs = new Set<string>();

  // Passo 1: carrega módulos e aulas (coleta slugs conhecidos para o passo 2).
  for (const moduleSlug of track.modules) {
    const moduleDir = path.join(trackDir, 'modules', moduleSlug);
    const modulePath = path.join(moduleDir, MODULE_FILE);
    let moduleRaw: unknown;
    try {
      moduleRaw = await readJson(modulePath);
    } catch {
      throw new TrackLoadError(`trilha inválida em ${trackDir}`, [
        { file: modulePath, message: `módulo ${moduleSlug} declarado em track.json mas arquivo ausente/ilegível` },
      ]);
    }
    issues.push(...validateModuleSource(moduleRaw, modulePath));
    if (issues.length > 0) {
      throw new TrackLoadError(`trilha inválida em ${trackDir}`, issues);
    }
    const module = moduleRaw as TrackModuleSource;

    const lessons: LoadedLesson[] = [];
    for (const lessonSlug of module.lessons) {
      const lessonDir = path.join(moduleDir, 'lessons', lessonSlug);
      const lessonPath = path.join(lessonDir, LESSON_FILE);
      let lessonRaw: unknown;
      try {
        lessonRaw = await readJson(lessonPath);
      } catch {
        throw new TrackLoadError(`trilha inválida em ${trackDir}`, [
          { file: lessonPath, message: `aula ${lessonSlug} declarada no módulo ${moduleSlug} mas arquivo ausente/ilegível` },
        ]);
      }
      issues.push(...validateLessonSource(lessonRaw, lessonPath));
      if (issues.length > 0) {
        throw new TrackLoadError(`trilha inválida em ${trackDir}`, issues);
      }
      const lesson = lessonRaw as TrackLessonSource;

      const challenges: TrackChallengeSource[] = [];
      for (const challengeSlug of lesson.challenges) {
        const challengePath = path.join(lessonDir, 'challenges', challengeSlug, CHALLENGE_FILE);
        let challengeRaw: unknown;
        try {
          challengeRaw = await readJson(challengePath);
        } catch {
          throw new TrackLoadError(`trilha inválida em ${trackDir}`, [
            { file: challengePath, message: `desafio ${challengeSlug} declarado na aula ${lessonSlug} mas arquivo ausente/ilegível` },
          ]);
        }
        issues.push(...validateChallengeSource(challengeRaw, challengePath));
        if (issues.length > 0) {
          throw new TrackLoadError(`trilha inválida em ${trackDir}`, issues);
        }
        const challenge = challengeRaw as TrackChallengeSource;
        issues.push(...issuesDeLinguagemDoDesafio(challenge, challengePath, esperadoDeLinguagem));
        if (issues.length > 0) {
          throw new TrackLoadError(`trilha inválida em ${trackDir}`, issues);
        }
        knownChallengeSlugs.add(`${moduleSlug}/${lessonSlug}/${challengeSlug}`);
        challenges.push(challenge);
      }

      lessons.push({ meta: lesson, challenges });
    }

    // ADITIVO (rodada 9): desafio do MÓDULO — módulo declarou challenge? O
    // arquivo PRECISA existir e validar (integridade de referência, mesmo
    // padrão dos desafios de aula). Módulo sem challenge → null (válido).
    let moduleChallenge: TrackChallengeSource | null = null;
    if (typeof module.challenge === 'string') {
      const moduleChallengePath = path.join(moduleDir, 'challenges', module.challenge, CHALLENGE_FILE);
      let challengeRaw: unknown;
      try {
        challengeRaw = await readJson(moduleChallengePath);
      } catch {
        throw new TrackLoadError(`trilha inválida em ${trackDir}`, [
          { file: moduleChallengePath, message: `desafio do módulo '${module.challenge}' declarado no módulo ${moduleSlug} mas arquivo ausente/ilegível` },
        ]);
      }
      issues.push(...validateChallengeSource(challengeRaw, moduleChallengePath));
      if (issues.length > 0) {
        throw new TrackLoadError(`trilha inválida em ${trackDir}`, issues);
      }
      moduleChallenge = challengeRaw as TrackChallengeSource;
      issues.push(...issuesDeLinguagemDoDesafio(moduleChallenge, moduleChallengePath, esperadoDeLinguagem));
      if (issues.length > 0) {
        throw new TrackLoadError(`trilha inválida em ${trackDir}`, issues);
      }
    }
    modules.push({ meta: module, lessons, challenge: moduleChallenge });
  }

  // Passo 2: integridade de referências (só depois que TODOS os slugs são conhecidos).
  for (const mod of modules) {
    for (const lesson of mod.lessons) {
      const lessonPath = path.join(trackDir, 'modules', mod.meta.slug, 'lessons', lesson.meta.slug, LESSON_FILE);
      for (const pre of lesson.meta.prerequisites) {
        // pré-requisito pode estar em QUALQUER módulo (aulas anteriores da trilha)
        if (!lessonExistsAnywhere(modules, pre)) {
          issues.push({ file: lessonPath, message: `prerequisite '${pre}' não existe em nenhum módulo da trilha` });
        }
      }
      for (const ch of lesson.meta.challenges) {
        if (!knownChallengeSlugs.has(`${mod.meta.slug}/${lesson.meta.slug}/${ch}`)) {
          issues.push({ file: lessonPath, message: `challenge '${ch}' não existe na aula (challenges/${ch}/challenge.json ausente)` });
        }
      }
    }
  }

  if (issues.length > 0) {
    throw new TrackLoadError(`trilha inválida em ${trackDir}`, issues);
  }

  // Passo 3: proficiência (opcional, arquivo raiz).
  let proficiency: TrackChallengeSource | null = null;
  const profPath = path.join(trackDir, PROFICIENCY_FILE);
  try {
    const profRaw = await readJson(profPath);
    const profIssues = validateChallengeSource(profRaw, profPath);
    // A checagem de linguagem só roda quando o arquivo já é um desafio válido
    // (o validador acima é quem garante que `profRaw` é objeto).
    if (profIssues.length === 0) {
      profIssues.push(
        ...issuesDeLinguagemDoDesafio(profRaw as TrackChallengeSource, profPath, esperadoDeLinguagem),
      );
    }
    if (profIssues.length > 0) {
      throw new TrackLoadError(`trilha inválida em ${trackDir}`, profIssues);
    }
    proficiency = profRaw as TrackChallengeSource;
  } catch (err) {
    if (err instanceof TrackLoadError) throw err;
    // arquivo não existe — trilha sem teste de proficiência (válido).
    proficiency = null;
  }

  return { root: track, modules, proficiency, dir: trackDir };
}

function lessonExistsAnywhere(modules: LoadedModule[], slug: string): boolean {
  return modules.some((m) => m.lessons.some((l) => l.meta.slug === slug));
}

/** Lista os slugs das trilhas no diretório (dirs com track.json). */
export async function listTrackSlugs(tracksDir: string): Promise<string[]> {
  const entries = await fs.readdir(tracksDir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      await fs.access(path.join(tracksDir, e.name, TRACK_FILE));
      out.push(e.name);
    } catch {
      // sem track.json — não é trilha
    }
  }
  return out.sort();
}

/** Carrega TODAS as trilhas do diretório; inválida é pulada com issues coletadas. */
export async function loadAllTracks(tracksDir: string): Promise<{ tracks: LoadedTrack[]; issues: TrackValidationIssue[] }> {
  const slugs = await listTrackSlugs(tracksDir);
  const tracks: LoadedTrack[] = [];
  const issues: TrackValidationIssue[] = [];
  for (const slug of slugs) {
    try {
      tracks.push(await loadTrack(path.join(tracksDir, slug)));
    } catch (err) {
      if (err instanceof TrackLoadError) {
        issues.push(...err.issues);
      } else {
        issues.push({ file: path.join(tracksDir, slug), message: `erro ao carregar trilha: ${String(err)}` });
      }
    }
  }
  return { tracks, issues };
}

/** Aula pelo slug do módulo + slug da aula (para IPC e tutor). */
export function findLesson(track: LoadedTrack, moduleSlug: string, lessonSlug: string): LoadedLesson | null {
  const mod = track.modules.find((m) => m.meta.slug === moduleSlug);
  if (!mod) return null;
  const lesson = mod.lessons.find((l) => l.meta.slug === lessonSlug);
  return lesson ?? null;
}

/** Busca a PRIMEIRA ocorrência de uma aula pelo slug, em qualquer módulo. */
export function findLessonAnywhere(track: LoadedTrack, lessonSlug: string): { moduleSlug: string; lesson: LoadedLesson } | null {
  for (const mod of track.modules) {
    const lesson = mod.lessons.find((l) => l.meta.slug === lessonSlug);
    if (lesson) return { moduleSlug: mod.meta.slug, lesson };
  }
  return null;
}

/** Desafio de uma aula pelo slug. */
export function findChallenge(lesson: LoadedLesson, challengeSlug: string): TrackChallengeSource | null {
  return lesson.challenges.find((c) => c.slug === challengeSlug) ?? null;
}
