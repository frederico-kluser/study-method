/**
 * tests/areaViewsSsr.test.ts — as VIEWS PURAS das áreas Roadmap/Início/
 * Definições renderizam A PARTIR DE PROPS (STORY-SPEC §5), sem IPC, sem
 * `window.api`, sem jsdom: SSR real (`react-dom/server`) com o tema e o i18n
 * reais (padrão `tests/lessonSidebarHeader.test.ts` — import dinâmico por URL
 * porque os componentes são `.tsx`, o tsconfig de tests/ não liga `jsx` e o
 * projeto composite só lista módulos PUROS).
 *
 * O que cada bloco prova: que o ESTADO desenhado é o que as props dizem
 * (lista/vazio/erro/carregando/detalhe), que os landmarks e `data-testid` que
 * os e2e procuram continuam lá, e que a copy vem do i18n real (pt-BR).
 *
 * O que NÃO se prova aqui (sem DOM não há clique nem layout): interações e
 * geometria — a lógica pura é coberta em `settingsPanelsState.test.ts` e
 * `startupGatePhase.test.ts`; o visual, no Storybook.
 *
 * Reprodução: `bash tools/t.sh tests/areaViewsSsr.test.ts`
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from '@mui/material/styles';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { theme } from '../src/theme';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import type { KeysStatus, TrackLessonEntry, TrackModuleEntry, TrackDetailPayload, TrackOrphanEntry } from '@shared/ipc-contract';

/* ═══════ Contratos de props, declarados LOCALMENTE ══════════════════════════
 * (os tipos exportados pelos componentes são .tsx e não podem ser importados
 * num teste — ver cabeçalho de tests/lessonSidebarHeader.test.ts). */

interface RoadmapProps {
  track: TrackDetailPayload | null;
  loading: boolean;
  loadError: string | null;
  selected: string | null;
  tracks: Array<{ slug: string; title: string; doneCount: number; lessonCount: number }> | null;
  noTracks: boolean;
  justUnlocked: ReadonlySet<string>;
  unlockedTitles: string[];
  openLesson: (lesson: TrackLessonEntry) => void;
  openTrack: (slug: string) => void;
  goBackToList: () => void;
  openProficiency: () => void;
  openModuleChallenge: (mod: TrackModuleEntry) => void;
  loadTrack: (slug: string) => void;
  loadTracks: () => void;
}

interface HomeProps {
  keyStatus: KeysStatus | null;
  keyStatusFailed: boolean;
  refreshKeys: () => void;
  ready: boolean;
  lastLesson: { trackSlug: string; lessonId: string } | null;
  primaryLabel: string;
  primaryAction: () => void;
  openTrack: (slug: string) => void;
  orphanCount: number;
  navigate: (key: string) => void;
  handlePick: (pick: { subject: string; domain: string }) => void;
  visibleTopics: Array<{
    id: string;
    name: string;
    slug: string;
    domain: 'programming' | 'math';
    lessonCount: number;
    answeredCount: number;
  }>;
  hasSubjects: boolean;
  tracks: Array<{
    slug: string;
    title: string;
    description: string;
    doneCount: number;
    lessonCount: number;
  }> | null;
  tracksError: string | null;
  loadTracks: () => void;
}

interface KeysProps {
  providers: Record<
    'openrouter' | 'brave',
    {
      value: string;
      visible: boolean;
      message: string;
      uiState: 'idle' | 'validating' | 'valid' | 'invalid';
      saving: boolean;
    }
  >;
  initialStatus: KeysStatus | null;
  statusError: boolean;
  keysConfigured: boolean;
  patch: (provider: 'openrouter' | 'brave', fn: (s: unknown) => unknown) => void;
  handleSave: (provider: 'openrouter' | 'brave') => Promise<void>;
  handleValidate: (provider: 'openrouter' | 'brave', useSavedKey?: boolean) => Promise<void>;
  setReloadToken: (n: number) => void;
}

interface OrphansProps {
  orphans: TrackOrphanEntry[] | null;
  list: TrackOrphanEntry[];
  loadError: { message: string; detail?: string } | null;
  confirmOpen: boolean;
  busy: boolean;
  feedback:
    | { kind: 'done' }
    | { kind: 'error'; message: string; detail?: string }
    | null;
  load: () => void;
  handleRemove: () => Promise<void>;
  setConfirmOpen: (open: boolean) => void;
}

interface ProgressProps {
  confirmOpen: boolean;
  busy: boolean;
  feedback:
    | { kind: 'done' }
    | { kind: 'error'; message: string; detail?: string }
    | null;
  onConfirmOpen: () => void;
  onConfirmClose: () => void;
  onClear: () => Promise<void>;
}

/* ═══════ Carregamento dinâmico (.tsx por URL) ═════════════════════════════ */

const ROADMAP_VIEW = new URL('../src/views/RoadmapView/RoadmapView.tsx', import.meta.url).href;
const HOME_VIEW = new URL('../src/views/placeholders.tsx', import.meta.url).href;
const KEYS_VIEW = new URL('../src/views/SettingsView/KeysPanelView.tsx', import.meta.url).href;
const ORPHANS_VIEW = new URL(
  '../src/views/SettingsView/OrphanTracksPanelView.tsx',
  import.meta.url,
).href;
const PROGRESS_VIEW = new URL(
  '../src/views/SettingsView/ProgressPanelView.tsx',
  import.meta.url,
).href;

let RoadmapViewView: ComponentType<RoadmapProps>;
let HomeViewView: ComponentType<HomeProps>;
let KeysPanelView: ComponentType<KeysProps>;
let OrphanTracksPanelView: ComponentType<OrphansProps>;
let ProgressPanelView: ComponentType<ProgressProps>;

before(async () => {
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
  await i18next.use(initReactI18next).init({
    lng: 'pt-BR',
    interpolation: { escapeValue: false },
    resources: { 'pt-BR': { translation: ptBR } },
    returnEmptyString: false,
  });
  ({ RoadmapViewView } = (await import(ROADMAP_VIEW)) as {
    RoadmapViewView: ComponentType<RoadmapProps>;
  });
  ({ HomeViewView } = (await import(HOME_VIEW)) as { HomeViewView: ComponentType<HomeProps> });
  ({ KeysPanelView } = (await import(KEYS_VIEW)) as { KeysPanelView: ComponentType<KeysProps> });
  ({ OrphanTracksPanelView } = (await import(ORPHANS_VIEW)) as {
    OrphanTracksPanelView: ComponentType<OrphansProps>;
  });
  ({ ProgressPanelView } = (await import(PROGRESS_VIEW)) as {
    ProgressPanelView: ComponentType<ProgressProps>;
  });
});

function render(view: unknown, props: object): string {
  const componente = createElement(
    view as ComponentType<Record<string, unknown>>,
    props as Record<string, unknown>,
  );
  return renderToStaticMarkup(createElement(ThemeProvider, { theme }, componente));
}

/** O markup com as entidades descodificadas (o SSR escapa `<`, `"`, `&`…). */
function unescapeHtml(html: string): string {
  const AMP = '&';
  return html
    .split(AMP + 'lt;').join('<')
    .split(AMP + 'gt;').join('>')
    .split(AMP + 'quot;').join('"')
    .split(AMP + '#x27;').join("'")
    .split(AMP + 'amp;').join(AMP);
}

/** Presença de copy (substring — as frases do produto têm `()`, `…`, etc.). */
function contains(html: string, trecho: string): void {
  assert.ok(unescapeHtml(html).includes(trecho), `falta no HTML: ${trecho}`);
}

const noop = (): void => {};
const noopAsync = async (): Promise<void> => {};

/* ═══════ Fixtures locais ══════════════════════════════════════════════════ */

const aula = (over: Partial<TrackLessonEntry>): TrackLessonEntry => ({
  slug: 'aula-1',
  moduleSlug: 'fundamentos',
  title: 'Aula',
  summary: 'Resumo',
  difficulty: 2,
  locked: false,
  done: false,
  current: false,
  ...over,
});

const trilhasResumo = [
  { slug: 'python-iniciante', title: 'Python do Zero', doneCount: 1, lessonCount: 3 },
  { slug: 'c-iniciante', title: 'C do Zero', doneCount: 0, lessonCount: 3 },
];

const trilhaDetalhe: TrackDetailPayload = {
  slug: 'python-iniciante',
  title: 'Python do Zero',
  description: 'Primeiros passos em Python.',
  domain: 'programming',
  proficiencyAvailable: true,
  proficient: false,
  doneCount: 1,
  lessonCount: 3,
  modules: [
    {
      slug: 'fundamentos',
      title: 'Fundamentos',
      order: 1,
      challengeAvailable: true,
      challenge: { slug: 'desafio-modulo', title: 'Desafio do módulo' },
      challengeLastVerdict: 'passed',
      challengeStars: 2,
      lessons: [
        aula({ slug: 'aula-1', title: 'Primeira aula', done: true }),
        aula({ slug: 'aula-2', title: 'Segunda aula', current: true }),
        aula({ slug: 'aula-3', title: 'Terceira aula', locked: true }),
      ],
    },
  ],
};

const roadmapBase: RoadmapProps = {
  track: null,
  loading: false,
  loadError: null,
  selected: null,
  tracks: trilhasResumo,
  noTracks: false,
  justUnlocked: new Set<string>(),
  unlockedTitles: [],
  openLesson: noop,
  openTrack: noop,
  goBackToList: noop,
  openProficiency: noop,
  openModuleChallenge: noop,
  loadTrack: noop,
  loadTracks: noop,
};

const resquicio: TrackOrphanEntry = {
  slug: 'sql-basico',
  subjectName: 'SQL básico',
  domain: 'programming',
  attemptCount: 3,
  lessonsDoneCount: 2,
  hasProficiency: false,
  generatedChallengeCount: 1,
  rowCount: 7,
};

/* ═══════ Vistas/RoadmapView ═══════════════════════════════════════════════ */

describe('RoadmapViewView (SSR — só props)', () => {
  it('lista de trilhas: título + contagem de cada trilha instalada', () => {
    const html = render(RoadmapViewView, roadmapBase);
    contains(html, ptBR.roadmap.pickTitle);
    for (const t of trilhasResumo) contains(html, t.title);
  });

  it('sem trilhas instaladas é estado LEGÍTIMO (info + pista), não erro', () => {
    const html = render(RoadmapViewView, { ...roadmapBase, tracks: [], noTracks: true });
    assert.match(html, /data-testid="roadmap-no-tracks"/);
    contains(html, ptBR.roadmap.noTracks);
    contains(html, ptBR.roadmap.noTracksHint);
  });

  it('erro de carga → retentativa + voltar (sem conteúdo)', () => {
    const html = render(RoadmapViewView, {
      ...roadmapBase,
      tracks: null,
      selected: 'python-iniciante',
      loadError: 'Não foi possível carregar a trilha.',
    });
    contains(html, 'Não foi possível carregar a trilha.');
    contains(html, ptBR.common.tryAgain);
    contains(html, ptBR.roadmap.backButton);
  });

  it('carregando → barra de progresso com nome acessível (SC 4.1.2)', () => {
    const html = render(RoadmapViewView, { ...roadmapBase, tracks: null, loading: true });
    assert.match(html, /role="progressbar"/);
  });

  it('detalhe: aulas concluída/em progresso/bloqueada com estado por extenso', () => {
    const html = render(RoadmapViewView, {
      ...roadmapBase,
      selected: 'python-iniciante',
      track: trilhaDetalhe,
    });
    contains(html, ptBR.roadmap.proficiencyTitle);
    contains(html, ptBR.roadmap.moduleChallengeDone);
    for (const nome of ['Primeira aula', 'Segunda aula', 'Terceira aula']) {
      contains(html, nome);
    }
    // Estado da aula por extenso (span escondido do aria-describedby):
    contains(html, ptBR.roadmap.done);
    contains(html, ptBR.roadmap.current);
    contains(html, ptBR.roadmap.locked);
    contains(html, ptBR.roadmap.sequentialHint);
  });

  it('aula recém-destravada leva o selo E o anúncio (informação ≠ animação)', () => {
    const html = render(RoadmapViewView, {
      ...roadmapBase,
      selected: 'python-iniciante',
      track: trilhaDetalhe,
      justUnlocked: new Set(['aula-2']),
      unlockedTitles: ['Segunda aula'],
    });
    contains(html, ptBR.roadmap.justUnlockedBadge);
    assert.match(html, /role="status"/);
    contains(html, 'Segunda aula');
  });
});

/* ═══════ Vistas/HomeView ══════════════════════════════════════════════════ */

const homeBase: HomeProps = {
  keyStatus: { llmConfigured: true, braveConfigured: true, llmValidated: true, braveValidated: true },
  keyStatusFailed: false,
  refreshKeys: noop,
  ready: true,
  lastLesson: null,
  primaryLabel: 'Escolher uma trilha',
  primaryAction: noop,
  openTrack: noop,
  orphanCount: 0,
  navigate: noop,
  handlePick: noop,
  visibleTopics: [],
  hasSubjects: false,
  tracks: trilhasResumo.map((t) => ({ ...t, description: 'Descrição da trilha.' })),
  tracksError: null,
  loadTracks: noop,
};

describe('HomeViewView (SSR — só props)', () => {
  it('boas-vindas: copy do produto + trilhas com distintivo de progresso', () => {
    const html = render(HomeViewView, homeBase);
    contains(html, ptBR.home.title);
    contains(html, ptBR.home.description);
    for (const t of trilhasResumo) contains(html, t.title);
  });

  it('sem nada instalado (onboarding): estado vazio NOMEADO dos trilhas', () => {
    const html = render(HomeViewView, { ...homeBase, ready: false, tracks: [] });
    assert.match(html, /data-testid="home-tracks-empty"/);
    contains(html, ptBR.home.tracksEmptyTitle);
  });

  it('falha do canal das chaves ≠ "não configurado" (W2) e tem retentativa', () => {
    const html = render(HomeViewView, { ...homeBase, keyStatus: null, keyStatusFailed: true });
    contains(html, ptBR.home.setup.checkFailed);
    contains(html, ptBR.common.tryAgain);
    assert.ok(!unescapeHtml(html).includes(ptBR.home.setup.missing), `não devia ter: ${ptBR.home.setup.missing}`);
  });

  it('resquícios: o aviso diz quantos são e nunca some em silêncio', () => {
    const html = render(HomeViewView, { ...homeBase, orphanCount: 2 });
    assert.match(html, /data-testid="home-orphans-notice"/);
    contains(html, '2');
    contains(html, ptBR.home.orphansAction);
  });
});

/* ═══════ Vistas/SettingsView — painéis ════════════════════════════════════ */

const chavesBase: KeysProps = {
  providers: {
    openrouter: { value: '', visible: false, message: '', uiState: 'idle', saving: false },
    brave: { value: '', visible: false, message: '', uiState: 'idle', saving: false },
  },
  initialStatus: { llmConfigured: true, braveConfigured: true, llmValidated: true, braveValidated: true },
  statusError: false,
  keysConfigured: true,
  patch: () => {},
  handleSave: noopAsync,
  handleValidate: noopAsync,
  setReloadToken: () => {},
};

describe('KeysPanelView (SSR — só props)', () => {
  it('chaves configuradas e validadas → chips no commit em curso', () => {
    const html = render(KeysPanelView, chavesBase);
    contains(html, ptBR.keys.configured);
    contains(html, ptBR.keys.valid);
  });

  it('falha do CANAL é o terceiro estado honesto (W2), com retentativa', () => {
    const html = render(KeysPanelView, { ...chavesBase, statusError: true });
    contains(html, ptBR.keys.statusUnknown);
    contains(html, ptBR.common.tryAgain);
    assert.ok(!unescapeHtml(html).includes(ptBR.keys.notConfigured), `não devia ter: ${ptBR.keys.notConfigured}`);
  });

  it('validação em curso anuncia o estado', () => {
    const html = render(KeysPanelView, {
      ...chavesBase,
      providers: {
        ...chavesBase.providers,
        openrouter: {
          value: 'sk-or-v1-exemplo',
          visible: true,
          message: 'Validando…',
          uiState: 'validating',
          saving: false,
        },
      },
    });
    contains(html, ptBR.keys.validating);
  });
});

const orphansBase: OrphansProps = {
  orphans: [resquicio],
  list: [resquicio],
  loadError: null,
  confirmOpen: false,
  busy: false,
  feedback: null,
  load: noop,
  handleRemove: noopAsync,
  setConfirmOpen: () => {},
};

describe('OrphanTracksPanelView (SSR — só props)', () => {
  it('resquícios listados com o inventário do que seria removido', () => {
    const html = render(OrphanTracksPanelView, orphansBase);
    assert.match(html, /data-testid="settings-orphans-list"/);
    contains(html, 'sql-basico');
  });

  it('nada órfão é o estado BOM — dito com todas as letras', () => {
    const html = render(OrphanTracksPanelView, { ...orphansBase, orphans: [], list: [] });
    assert.match(html, /data-testid="settings-orphans-empty"/);
    contains(html, ptBR.settings.orphansEmpty);
  });

  it('erro de carga → retentativa (§3) sem esconder a secção', () => {
    const html = render(OrphanTracksPanelView, {
      ...orphansBase,
      loadError: { message: 'Não foi possível verificar os resquícios.', detail: 'ipc mudo' },
    });
    contains(html, 'Não foi possível verificar os resquícios.');
    contains(html, 'ipc mudo');
    contains(html, ptBR.common.tryAgain);
  });
});

describe('ProgressPanelView (SSR — só props)', () => {
  const progresso: ProgressProps = {
    confirmOpen: false,
    busy: false,
    feedback: null,
    onConfirmOpen: noop,
    onConfirmClose: noop,
    onClear: noopAsync,
  };

  it('a ação destrutiva existe mas só abre a confirmação (§9 ConfirmDialog)', () => {
    const html = render(ProgressPanelView, progresso);
    contains(html, ptBR.settings.clearProgressTitle);
    contains(html, ptBR.settings.clearProgress);
  });

  it('sucesso e erro (W19: frase + detalhe em legenda) saem como Alert', () => {
    const ok = render(ProgressPanelView, { ...progresso, feedback: { kind: 'done' } });
    contains(ok, ptBR.settings.clearProgressDone);

    const erro = render(ProgressPanelView, {
      ...progresso,
      feedback: {
        kind: 'error',
        message: 'Não foi possível limpar os dados de avanço.',
        detail: 'Error: ipc mudo',
      },
    });
    contains(erro, 'Não foi possível limpar os dados de avanço.');
    contains(erro, 'Error: ipc mudo');
  });
});
