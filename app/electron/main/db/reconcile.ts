/**
 * electron/main/db/reconcile.ts — RECONCILIAÇÃO entre o estado PERSISTIDO e as
 * trilhas que existem NO DISCO (onda9-cache-reconcilia).
 *
 * ─── O defeito que este módulo conserta ────────────────────────────────────
 * O progresso do aluno vive no SQLite (`~/.config/study-method-gui/study.db`)
 * e o CONTEÚDO vive em arquivos (`resources/tracks/<slug>/`). Até aqui o banco
 * NUNCA era confrontado com o disco: apagada a trilha, o banco continuava
 * apontando para ela e a Home mostrava o cartão de um curso que não existe
 * mais (o "cache do nodejs" que o dono viu depois de apagar as trilhas).
 *
 * Não é um incômodo pontual: o ciclo NORMAL deste projeto é "apaga e regera"
 * (a materialização F12 se RECUSA a sobrescrever destino existente), então
 * toda renomeação/remoção/substituição de trilha produzia estado órfão.
 *
 * ─── A regra ───────────────────────────────────────────────────────────────
 * A verdade sobre EXISTÊNCIA é o disco; a verdade sobre o QUE O ALUNO FEZ é o
 * banco. Um slug com estado no banco e sem trilha no disco é ÓRFÃO — e órfão
 * NÃO é apresentado como se existisse. Mas também NÃO é apagado: o progresso é
 * do aluno, e como o ciclo do projeto regenera a trilha COM O MESMO SLUG,
 * apagar em silêncio destruiria o progresso a cada regeração. Órfão sai do
 * caminho (some das listagens navegáveis), é REPORTADO explicitamente, e só
 * some de verdade quando o dono manda (CLI `track:reset-orphans` ou o botão
 * das Configurações).
 *
 * ─── Reachability, não adivinhação de proveniência ─────────────────────────
 * O módulo não tenta adivinhar se um `subjects` nasceu de uma trilha ou do
 * fluxo livre de geração de aula (impossível com o dado de hoje: o fluxo de
 * trilha faz `upsertSubject(trackSlug)` e o livre faz `upsertSubject(nome)`).
 * A pergunta é outra e é decidível: **existe algo para abrir?**
 *   - trilha instalada com esse slug  → alcançável (seção Trilhas);
 *   - `lessons` próprias no banco     → alcançável (fluxo de aula persistida);
 *   - nenhum dos dois                 → ÓRFÃO (todo clique é link morto).
 *
 * Módulo PURO: sem fs, sem electron, sem SQL. Recebe os slugs instalados e as
 * linhas de estado; devolve o veredito. Testável direto por node:test.
 */

/** Estado do aluno preso a UM slug (a unidade que a reconciliação enxerga). */
export interface TrackScopedState {
  /** o slug: `subjects.slug` e/ou `track_*.track_slug` (a chave estável). */
  slug: string;
  /** `subjects.id` quando existe uma matéria com este slug; null quando o
   *  estado só existe nas tabelas de trilha (progresso sem matéria). */
  subjectId: string | null;
  /** `subjects.name` (o rótulo que o aluno vê no cartão); null sem matéria. */
  subjectName: string | null;
  /** domínio da matéria ('programming' por default); null sem matéria. */
  domain: 'programming' | 'math' | null;
  /**
   * true quando a matéria tem `lessons` PRÓPRIAS no banco. É a válvula de
   * escape do fluxo livre: com aula persistida há o que abrir, então o slug
   * NUNCA é órfão — mesmo sem trilha no disco.
   */
  hasOwnLessons: boolean;
  /** linhas de `challenge_attempts` da matéria. */
  attemptCount: number;
  /** linhas de `track_progress` (aulas concluídas da trilha). */
  lessonsDoneCount: number;
  /** existe linha em `track_proficiency` para o slug. */
  hasProficiency: boolean;
  /** linhas de `generated_challenges` (desafios regenerados) do slug. */
  generatedChallengeCount: number;
}

/** Um slug ÓRFÃO: o mesmo estado + o motivo, já pronto para exibir. */
export interface OrphanTrackState extends TrackScopedState {
  /** total de linhas que uma remoção apagaria (0 = nada a remover). */
  rowCount: number;
}

/** Normaliza um slug para comparação (trim; o disco e o banco usam o mesmo caso). */
function normalizeSlug(slug: string): string {
  return slug.trim();
}

/** Soma das linhas que a remoção deste slug apagaria. */
export function orphanRowCount(row: TrackScopedState): number {
  return (
    (row.subjectId ? 1 : 0) +
    row.attemptCount +
    row.lessonsDoneCount +
    (row.hasProficiency ? 1 : 0) +
    row.generatedChallengeCount
  );
}

/**
 * Confronta o estado persistido com as trilhas instaladas.
 *
 * Órfão = slug SEM trilha instalada E SEM aulas próprias no banco. A ordem é
 * estável (alfabética por slug) para a UI e o CLI listarem igual em toda
 * chamada — a idempotência do comando de limpeza depende disso.
 */
export function computeOrphanState(
  installedSlugs: readonly string[],
  rows: readonly TrackScopedState[],
): OrphanTrackState[] {
  const installed = new Set(installedSlugs.map(normalizeSlug));
  return rows
    .filter((row) => {
      const slug = normalizeSlug(row.slug);
      if (slug === '') return false;
      if (installed.has(slug)) return false;
      return !row.hasOwnLessons;
    })
    .map((row) => ({ ...row, rowCount: orphanRowCount(row) }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * Os slugs que a UI deve ESCONDER das listagens navegáveis. Derivado de
 * `computeOrphanState` — existe para o renderer não reimplementar a regra.
 */
export function orphanSlugs(orphans: readonly OrphanTrackState[]): string[] {
  return orphans.map((o) => o.slug);
}

/**
 * Relatório do que está órfão, em linhas prontas para o terminal — o "mostrar
 * O QUE será removido ANTES de remover" do comando de limpeza. PURO (devolve
 * linhas, não imprime) para o teste conferir o texto exato.
 */
export function formatOrphanReport(
  orphans: readonly OrphanTrackState[],
  ctx: { dbPath: string; installedSlugs: readonly string[] },
): string[] {
  const lines: string[] = [];
  lines.push(`banco:    ${ctx.dbPath}`);
  lines.push(
    ctx.installedSlugs.length === 0
      ? 'trilhas:  nenhuma instalada'
      : `trilhas:  ${ctx.installedSlugs.length} instalada(s) — ${ctx.installedSlugs.join(', ')}`,
  );
  if (orphans.length === 0) {
    lines.push('');
    lines.push('nada órfão: todo o progresso guardado tem trilha instalada ou aula própria.');
    return lines;
  }
  lines.push('');
  lines.push(`${orphans.length} resquício(s) — progresso de trilha que NÃO está mais no disco:`);
  for (const o of orphans) {
    lines.push('');
    lines.push(`  ${o.slug}${o.subjectName && o.subjectName !== o.slug ? `  ("${o.subjectName}")` : ''}`);
    lines.push(`    matéria persistida ......... ${o.subjectId ? 'sim' : 'não'}`);
    lines.push(`    tentativas de desafio ...... ${o.attemptCount}`);
    lines.push(`    aulas concluídas ........... ${o.lessonsDoneCount}`);
    lines.push(`    proficiência ............... ${o.hasProficiency ? 'sim' : 'não'}`);
    lines.push(`    desafios regenerados ....... ${o.generatedChallengeCount}`);
    lines.push(`    linhas que seriam apagadas . ${o.rowCount}`);
  }
  return lines;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Onde vive o banco do usuário (para o CLI achar o MESMO arquivo que o app)
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Entradas de `resolveUserDataDir` — tudo injetável (puro/testável). */
export interface UserDataDirInput {
  /** process.platform. */
  platform: NodeJS.Platform | string;
  /** process.env (lido: XDG_CONFIG_HOME, APPDATA). */
  env: Record<string, string | undefined>;
  /** os.homedir(). */
  home: string;
  /** nome do app — `app.getName()` do Electron = `name` do package.json. */
  appName: string;
  /** join injetável (default: path.posix-agnóstico via template) — ver nota. */
  join?: (...parts: string[]) => string;
}

/** join default do módulo (evita importar node:path no caminho puro do teste). */
function defaultJoin(...parts: string[]): string {
  return parts.filter((p) => p !== '').join('/');
}

/**
 * Diretório `userData` do Electron, replicado SEM electron — é assim que o CLI
 * acha o MESMO `study.db` que o app usa:
 *   - darwin  → ~/Library/Application Support/<appName>
 *   - win32   → %APPDATA%/<appName>
 *   - demais  → $XDG_CONFIG_HOME/<appName> ou ~/.config/<appName>
 *
 * Medido nesta máquina: `~/.config/study-method-gui/study.db` (Linux, appName
 * = `name` do package.json — não há `productName`).
 */
export function resolveUserDataDir(input: UserDataDirInput): string {
  const join = input.join ?? defaultJoin;
  if (input.platform === 'darwin') {
    return join(input.home, 'Library', 'Application Support', input.appName);
  }
  if (input.platform === 'win32') {
    const appData = input.env.APPDATA;
    return join(appData && appData !== '' ? appData : join(input.home, 'AppData', 'Roaming'), input.appName);
  }
  const xdg = input.env.XDG_CONFIG_HOME;
  return join(xdg && xdg !== '' ? xdg : join(input.home, '.config'), input.appName);
}

/** Nome do banco do aluno (o mesmo literal do main — index.ts). */
export const STUDY_DB_FILENAME = 'study.db';
