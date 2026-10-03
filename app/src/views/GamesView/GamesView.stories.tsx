/**
 * Vistas/GamesView — a TELA 1 da secção Games: o MAPA do mundo
 * (mockup canónico `.recon/games-research/jogo-na-pratica.html` §02).
 *
 * A história cobre os quatro estados da tela (`GamesScreen`: ok, loading,
 * empty, erro+retentativa), o PROGRESSO do aluno (mapa com níveis concluídos e
 * recordes), os blocos visuais exportados (`GamesMap`, `GameLevelNodeRow`) e o
 * CONTENTOR real (`GamesView`) dirigido pela API falsa do catálogo
 * (`installMockApi` de `src/storybook/mockApi.ts`, com as fixtures partilhadas
 * `fixtureGameWorlds` de `src/storybook/fixtures.ts` e as variantes de
 * `src/storybook/fixtures.games.ts`).
 *
 * DECISÕES:
 *   - `GamesScreen` é a view PURA (só props — STORY-SPEC §5): os estados
 *     entram por `args` e os controls permitem percorrê-los; a lógica de
 *     seleção que os alimenta vive em `gamesSelection.ts` (pura, testada).
 *   - As stories do contentor NÃO inventam dados: sobrescrevem só o método do
 *     mock que precisam (`installMockApi({ games: { listWorlds: … } })`) e
 *     mostram o que o app mostra — incluindo o estado "carregando" real (a
 *     promise nunca resolve) e o erro de IPC com retentativa.
 *   - Zero hex, zero layout copiado: os `sx` repetidos desta view já migraram
 *     para `lib/layoutSx`/`lib/a11yStyles` (`wrappingActionSx`, `SR_ONLY_SX`)
 *     e o teto de leitura é `LAYOUT.readingColumnPx`.
 */
import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, within } from 'storybook/test';
import GamesView, { GameLevelNodeRow, GamesMap, GamesScreen } from './GamesView';
import type { GameWorldSummary } from '../../types/games';
import {
  fixtureGameLevelPayload,
  fixtureGameWorlds,
} from '../../storybook/fixtures';
import {
  fixtureGameLevelPayloadFor,
  fixtureGameWorldsWithProgress,
} from '../../storybook/fixtures.games';
import { installMockApi } from '../../storybook/mockApi';

/** O mundo com progresso (fixado: o index access não traz `!` sob strict). */
const MUNDO_COM_PROGRESSO: GameWorldSummary = fixtureGameWorldsWithProgress[0];

/** Pré-cargas do cartão do nível atual (a mesma chave de `gamesUi.previewKey`). */
const PREVIEWS_PADRAO = {
  'mundo-eco::nivel-3': fixtureGameLevelPayloadFor('python'),
  'mundo-labirinto::nivel-1': fixtureGameLevelPayload,
};

const meta = {
  title: 'Vistas/GamesView',
  component: GamesScreen,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    status: 'ok',
    errorText: null,
    onRetry: fn(),
    worlds: fixtureGameWorlds,
    lang: 'python',
    onLangChange: fn(),
    previews: PREVIEWS_PADRAO,
    onPlay: fn(),
    locale: 'pt-BR',
  },
  argTypes: {
    status: { control: 'select', options: ['loading', 'error', 'empty', 'ok'] },
    lang: { control: 'select', options: ['c', 'python', 'rust'] },
    locale: { control: 'select', options: ['pt-BR', 'en'] },
  },
} satisfies Meta<typeof GamesScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ═══════════════════════════════════════════════════════════════════════════
 * GamesScreen — os quatro estados da tela (view pura, dirigida por args)
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Mundo/níveis: dois mundos, o mapa de cada um e o cartão do nível atual. */
export const MundosENiveis: Story = {
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    expect(tela.getByRole('heading', { level: 1 }).textContent).toBe('Jogos');
    // Os dois mundos e o cartão do nível atual com o botão "Jogar nível N".
    expect(tela.getByRole('heading', { name: 'O Eco das Variáveis' })).toBeTruthy();
    expect(tela.getByRole('heading', { name: 'O Labirinto dos Arrays' })).toBeTruthy();
    expect(tela.getByRole('button', { name: /Jogar nível/ })).toBeTruthy();
  },
};

/** Progresso do aluno: níveis concluídos, recordes e um mundo por concluir. */
export const ProgressoDoAluno: Story = {
  args: {
    worlds: fixtureGameWorldsWithProgress,
    previews: {
      'mundo-eco::nivel-3': fixtureGameLevelPayloadFor('python'),
      'mundo-labirinto::nivel-2': fixtureGameLevelPayloadFor('python'),
      'mundo-torres::nivel-1': fixtureGameLevelPayloadFor('python'),
    },
  },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    // Recordes formatados do locale (6 linhas · 420 ms do nível concluído).
    expect(tela.getAllByText(/6 linhas/).length).toBeGreaterThan(0);
  },
};

/** Sem mundos instalados: empty-state legítimo (não é erro). */
export const SemMundos: Story = {
  args: { status: 'empty', worlds: [], previews: {} },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    expect(tela.getByRole('heading', { name: 'Nenhum mundo instalado ainda' })).toBeTruthy();
  },
};

/** A carregar: LinearProgress + título ESTÁVEL ("Jogos" não muda de identidade). */
export const Carregando: Story = {
  args: { status: 'loading', worlds: [], previews: {} },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    expect(tela.getByRole('heading', { level: 1 }).textContent).toBe('Jogos');
    expect(tela.getByRole('progressbar')).toBeTruthy();
  },
};

/** Erro de carga: Alert + "Tentar de novo" (o padrão erro+retry da base). */
export const ErroComRetentativa: Story = {
  args: {
    status: 'error',
    worlds: [],
    previews: {},
    errorText: 'Não foi possível carregar os mundos.',
  },
  play: async ({ canvasElement, args }) => {
    const tela = within(canvasElement);
    await tela.findByText('Não foi possível carregar os mundos.');
    const retry = tela.getByRole('button', { name: 'Tentar de novo' });
    expect(retry).toBeTruthy();
    retry.click();
    expect(args.onRetry).toHaveBeenCalledTimes(1);
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
 * Blocos visuais exportados (uma história por componente)
 * ═══════════════════════════════════════════════════════════════════════════ */

/** `GamesMap` — o mapa de UM mundo (cabeçalho, nós, cartão do nível atual). */
export const MapaDoMundo: Story = {
  render: () => (
    <GamesMap
      world={MUNDO_COM_PROGRESSO}
      previews={PREVIEWS_PADRAO}
      onPlay={() => undefined}
      locale="pt-BR"
    />
  ),
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    expect(tela.getByRole('heading', { name: 'O Eco das Variáveis' })).toBeTruthy();
  },
};

/**
 * `GameLevelNodeRow` — a linha de nós com os TRÊS estados (concluído, atual,
 * bloqueado) e o chefe (círculo de acento). Os estados vivem em
 * `data-game-node-state` (o nó mostra só o número; a semântica vai na etiqueta
 * sr-only).
 */
export const LinhaDeNiveis: Story = {
  render: () => (
    <GameLevelNodeRow
      levels={MUNDO_COM_PROGRESSO.levels}
      openIndex={2}
      worldTitle="O Eco das Variáveis"
    />
  ),
  play: async ({ canvasElement }) => {
    const raiz = canvasElement as HTMLElement;
    expect(raiz.querySelector('[data-game-node-state="done"]')).toBeTruthy();
    expect(raiz.querySelector('[data-game-node-state="current"]')).toBeTruthy();
    expect(raiz.querySelector('[data-game-node-boss="true"]')).toBeTruthy();
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
 * Contentor real (GamesView) — a API falsa do catálogo dirige os estados
 * ═══════════════════════════════════════════════════════════════════════════ */

/** O contentor com o mock por OMISSÃO (mundos reais + pré-cargas). */
export const ContentorComMundos: Story = {
  render: () => <GamesView />,
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await tela.findByRole('heading', { name: 'O Eco das Variáveis' });
  },
};

/** O contentor com o mock a devolver PROGRESSO do aluno. */
export const ContentorComProgresso: Story = {
  render: () => <GamesView />,
  beforeEach: () => {
    installMockApi({
      games: { listWorlds: async (): Promise<GameWorldSummary[]> => fixtureGameWorldsWithProgress },
    });
  },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await tela.findByRole('heading', { name: 'As Torres de Recursão' });
    expect(tela.getAllByText(/11 linhas/).length).toBeGreaterThan(0);
  },
};

/** O contentor SEM mundos (a API devolve lista vazia). */
export const ContentorSemMundos: Story = {
  render: () => <GamesView />,
  beforeEach: () => {
    installMockApi({ games: { listWorlds: async (): Promise<GameWorldSummary[]> => [] } });
  },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await tela.findByRole('heading', { name: 'Nenhum mundo instalado ainda' });
  },
};

/** O contentor A CARREGAR (a chamada nunca resolve — o estado é real). */
export const ContentorACarregar: Story = {
  render: () => <GamesView />,
  beforeEach: () => {
    installMockApi({
      games: { listWorlds: (): Promise<GameWorldSummary[]> => new Promise(() => undefined) },
    });
  },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    expect(tela.getByRole('progressbar')).toBeTruthy();
  },
};

/** O contentor em ERRO de IPC (a chamada rejeita → Alert + retentativa). */
export const ContentorEmErro: Story = {
  render: () => <GamesView />,
  beforeEach: () => {
    installMockApi({
      games: {
        listWorlds: (): Promise<GameWorldSummary[]> => Promise.reject(new Error('ipc down')),
      },
    });
  },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await tela.findByRole('button', { name: 'Tentar de novo' });
  },
};
