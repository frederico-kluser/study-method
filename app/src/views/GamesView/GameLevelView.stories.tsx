/**
 * Vistas/GameLevelView — a TELA 2 da secção Games: o NÍVEL
 * (mockup canónico `.recon/games-research/jogo-na-pratica.html` §03).
 *
 * A história cobre o conteúdo do nível já com dados (`GameLevelPanel`:
 * enunciado + editor + casos de teste), o ciclo do runner (a executar,
 * passed/failed com recordes, erro de infraestrutura), o contrato SEM SPOILERS
 * (casos hidden aparecem só ✓/✗ — o payload nunca os traz), as TRÊS linguagens
 * do contrato (C/Python/Rust — o starter troca com a linguagem) e o CONTENTOR
 * real (`GameLevelView`) dirigido pela API falsa (`installMockApi` de
 * `src/storybook/mockApi.ts` — `games.loadLevel`/`games.run`).
 *
 * DECISÕES:
 *   - `GameLevelPanel` é a view PURA (só props — STORY-SPEC §5): cada estado do
 *     runner é uma story com `args`; o estado do editor/runner que o contentor
 *     gere vive na máquina pura `gameLevelState.ts` (testada em
 *     `tests/gamesLevelState.test.ts`).
 *   - "sem spoilers": `fixtureGameRunWithHidden` mostra a MISTURA de casos
 *     visíveis e ocultos sem vazar `expected`/`actual` ocultos (a regra é
 *     `gamesUi.isHiddenCase` — ausência dos dois campos).
 *   - As stories do contentor só sobrescrevem os métodos `games.*` de que
 *     precisam; o resto fica com o mock do catálogo. O estado "a executar" do
 *     contentor é REAL (o `games.run` nunca resolve e a play clica em "Testar
 *     resposta").
 */
import type { Meta, StoryObj } from '@storybook/react';
import type { ReactElement } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import GameLevelView, { GameLangSelector, GameLevelPanel } from './GameLevelView';
import type { GameLang, GameLevelPayload, GameRunResult } from '../../types/games';
import { installMockApi } from '../../storybook/mockApi';
import {
  fixtureGameLevelLongText,
  fixtureGameLevelPayloadFor,
  fixtureGameRunFailed,
  fixtureGameRunFirstPass,
  fixtureGameRunPassedWithRecords,
  fixtureGameRunWithHidden,
  fixtureGameStarters,
} from '../../storybook/fixtures.games';

/** O payload base das stories do painel (Python — a linguagem por omissão). */
const PAYLOAD_PY: GameLevelPayload = fixtureGameLevelPayloadFor('python');

const meta = {
  title: 'Vistas/GameLevelView',
  component: GameLevelPanel,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  args: {
    worldTitle: 'O Eco das Variáveis',
    levelTitle: PAYLOAD_PY.title,
    levelIndex: 2,
    boss: false,
    lang: 'python',
    onLangChange: fn(),
    enunciado: PAYLOAD_PY.enunciado,
    code: PAYLOAD_PY.starter,
    onCodeChange: fn(),
    optimize: PAYLOAD_PY.optimize,
    busy: false,
    runResult: null,
    runError: null,
    nextLevelId: 'nivel-3',
    onBack: fn(),
    onTest: fn(),
    onAdvance: fn(),
    locale: 'pt-BR',
  },
  argTypes: {
    lang: { control: 'select', options: ['c', 'python', 'rust'] },
    busy: { control: 'boolean' },
    boss: { control: 'boolean' },
    locale: { control: 'select', options: ['pt-BR', 'en'] },
  },
} satisfies Meta<typeof GameLevelPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ═══════════════════════════════════════════════════════════════════════════
 * GameLevelPanel — o ciclo do nível (view pura, dirigida por args)
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Nível carregado, antes do primeiro teste: enunciado + editor + dica. */
export const NivelCarregado: Story = {
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    expect(tela.getByRole('button', { name: '‹ Voltar ao mapa' })).toBeTruthy();
    expect(tela.getByRole('heading', { level: 1 }).textContent).toBe(PAYLOAD_PY.title);
    expect(tela.getByRole('heading', { name: 'Enunciado' })).toBeTruthy();
    expect(tela.getByRole('button', { name: 'Testar resposta' })).toBeTruthy();
    expect(
      tela.getByText('Ainda sem resultados: escreve a tua solução e usa o botão "Testar resposta".'),
    ).toBeTruthy();
  },
};

/** A executar: o botão de teste no estado carregando (busy). */
export const AExecutar: Story = {
  args: { busy: true },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    expect(tela.getByRole('button', { name: /Testar resposta/ })).toBeTruthy();
  },
};

/** Passado COM recordes: casos verdes, painel de otimização e "Avançar ›". */
export const PassadoComRecordes: Story = {
  args: { runResult: fixtureGameRunPassedWithRecords },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    expect(tela.getByText('3 de 3 testes passaram')).toBeTruthy();
    expect(tela.getByRole('heading', { name: 'Otimização' })).toBeTruthy();
    // Recordes já batidos (6 linhas · 380 ms) e as duas ações do painel.
    expect(tela.getAllByText(/recorde: 6 linhas/).length).toBeGreaterThan(0);
    expect(tela.getByRole('button', { name: 'Otimizar' })).toBeTruthy();
    expect(tela.getByRole('button', { name: /Avançar/ })).toBeTruthy();
  },
};

/** Passado mas SEM recordes ainda (a métrica diz "sem recorde ainda"). */
export const PassadoSemRecordes: Story = {
  args: { runResult: fixtureGameRunFirstPass },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    expect(tela.getAllByText('sem recorde ainda').length).toBe(2);
  },
};

/** Falhado: casos visíveis com esperado/obtido (mono, quebra por palavra). */
export const FalhadoComCasos: Story = {
  args: { runResult: fixtureGameRunFailed },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    expect(tela.getByText('1 de 3 testes passaram')).toBeTruthy();
    expect(tela.getAllByText('esperado').length).toBeGreaterThan(0);
    expect(tela.getAllByText('obtido').length).toBeGreaterThan(0);
    // Falhou NÃO abre o painel de otimização (só `ok`).
    expect(tela.queryByRole('heading', { name: 'Otimização' })).toBeNull();
  },
};

/**
 * SEM SPOILERS (contrato "sem casos hidden"): os casos ocultos aparecem só
 * como "caso escondido" + ✓/✗ — nunca com esperado/obtido.
 */
export const SemSpoilersCasosOcultos: Story = {
  args: { runResult: fixtureGameRunWithHidden },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    expect(tela.getAllByText('caso escondido').length).toBe(2);
    // O caso visível mostra esperado/obtido; os ocultos, NUNCA.
    const ocultos = tela.getAllByText('caso escondido');
    for (const oculto of ocultos) {
      const linha = oculto.closest('li');
      expect(linha?.textContent?.includes('esperado')).toBe(false);
      expect(linha?.textContent?.includes('obtido')).toBe(false);
    }
    // As marcas ✓/✗ dos ocultos têm nome acessível (role="img").
    expect(tela.getAllByRole('img', { name: 'passou' }).length + tela.getAllByRole('img', { name: 'falhou' }).length).toBeGreaterThan(0);
  },
};

/** Erro de INFRAESTRUTURA do runner: Alert próprio, casos intactos. */
export const ComErroDeRunner: Story = {
  args: {
    runResult: fixtureGameRunFailed,
    runError: 'Não foi possível correr os testes (falha de infraestrutura). Tente de novo.',
  },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    expect(
      tela.getByText('Não foi possível correr os testes (falha de infraestrutura). Tente de novo.'),
    ).toBeTruthy();
    // A lista de casos fica COMO ESTAVA (regra do contentor).
    expect(tela.getByText('1 de 3 testes passaram')).toBeTruthy();
  },
};

/** Chefe: título com o badge "chefe" (fill de acento). */
export const NivelChefe: Story = {
  args: { boss: true, levelTitle: fixtureGameLevelLongText.title },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    expect(tela.getByText('chefe')).toBeTruthy();
  },
};

/** Enunciado LONGO (teste de estouro): quebra por palavra, nunca recorta. */
export const EnunciadoLongo: Story = {
  args: {
    levelTitle: fixtureGameLevelLongText.title,
    enunciado: fixtureGameLevelLongText.enunciado,
    boss: true,
  },
};

/* ─── Linguagens do contrato (C/Python/Rust) ──────────────────────────────── */

/** Nível em C: o starter vem da linguagem escolhida (realce `solution.c`). */
export const EmC: Story = {
  args: { lang: 'c', code: fixtureGameStarters.c },
};

/** Nível em Python (a linguagem por omissão do app). */
export const EmPython: Story = {
  args: { lang: 'python', code: fixtureGameStarters.python },
};

/** Nível em Rust: o starter vem da linguagem escolhida (realce `solution.rs`). */
export const EmRust: Story = {
  args: { lang: 'rust', code: fixtureGameStarters.rust },
};

/* ─── Blocos visuais exportados ───────────────────────────────────────────── */

/** `GameLangSelector` — o seletor exclusivo C/Python/Rust (controle por args). */
export const SeletorDeLinguagem: Story = {
  render: function SeletorControlado(args): ReactElement {
    return <GameLangSelector value={args.lang as GameLang} onChange={args.onLangChange} />;
  },
  args: { lang: 'python' },
  argTypes: { lang: { control: 'select', options: ['c', 'python', 'rust'] } },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    expect(tela.getByRole('group', { name: 'Linguagem do jogo' })).toBeTruthy();
    expect(tela.getByRole('button', { name: 'C' })).toBeTruthy();
    expect(tela.getByRole('button', { name: 'Python' })).toBeTruthy();
    expect(tela.getByRole('button', { name: 'Rust' })).toBeTruthy();
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
 * Contentor real (GameLevelView) — a API falsa do catálogo dirige o runner
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Props mínimas do contentor (o contrato `GameLevelViewProps`). */
const CONTENTOR_ARGS = {
  worldId: 'mundo-eco',
  worldTitle: 'O Eco das Variáveis',
  levelId: 'nivel-2',
  levelTitle: 'Eco em laço',
  levelIndex: 2,
  boss: false,
  lang: 'python' as GameLang,
  onLangChange: fn(),
  nextLevelId: 'nivel-3',
  onBack: fn(),
  onAdvance: fn(),
};

/**
 * O contentor COMPLETO: carrega o payload pelo mock e, na play, corre a
 * submissão real do mock (`games.run` devolve o veredito com recordes) — o
 * painel de otimização aparece sem sair da história.
 */
export const ContentorDoNivel: Story = {
  render: () => <GameLevelView {...CONTENTOR_ARGS} />,
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await tela.findByRole('heading', { name: 'Enunciado' });
    const testar = tela.getByRole('button', { name: /Testar resposta/ });
    await userEvent.click(testar);
    await tela.findByRole('heading', { name: 'Otimização' });
    expect(tela.getByText('3 de 3 testes passaram')).toBeTruthy();
  },
};

/** O contentor A EXECUTAR: o `games.run` nunca resolve — o busy é real. */
export const ContentorAExecutar: Story = {
  render: () => <GameLevelView {...CONTENTOR_ARGS} />,
  beforeEach: () => {
    installMockApi({
      games: {
        ...mockLoadLevel(),
        run: (): Promise<GameRunResult> => new Promise(() => undefined),
      },
    });
  },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await tela.findByRole('heading', { name: 'Enunciado' });
    await userEvent.click(tela.getByRole('button', { name: /Testar resposta/ }));
    await tela.findByRole('progressbar');
  },
};

/** O contentor em ERRO de carga: Alert + "Tentar de novo" (§3 da auditoria). */
export const ContentorEmErro: Story = {
  render: () => <GameLevelView {...CONTENTOR_ARGS} />,
  beforeEach: () => {
    installMockApi({
      games: {
        loadLevel: (): Promise<GameLevelPayload> => Promise.reject(new Error('ipc down')),
      },
    });
  },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    await tela.findByRole('button', { name: 'Tentar de novo' });
  },
};

/** O contentor EM CARREGAMENTO (o payload nunca chega — o estado é real). */
export const ContentorACarregar: Story = {
  render: () => <GameLevelView {...CONTENTOR_ARGS} />,
  beforeEach: () => {
    installMockApi({
      games: {
        loadLevel: (): Promise<GameLevelPayload> => new Promise(() => undefined),
      },
    });
  },
  play: async ({ canvasElement }) => {
    const tela = within(canvasElement);
    expect(tela.getByRole('progressbar')).toBeTruthy();
    // Título ESTÁVEL vindo do mapa: a tela não muda de identidade.
    expect(tela.getByRole('heading', { level: 1 }).textContent).toBe('Eco em laço');
  },
};

/** `games.loadLevel` do mock por omissão (para compor com outros overrides). */
function mockLoadLevel(): {
  loadLevel: (worldId: string, levelId: string, lang: GameLang) => Promise<GameLevelPayload>;
} {
  return {
    loadLevel: (): Promise<GameLevelPayload> =>
      Promise.resolve(fixtureGameLevelPayloadFor('python')),
  };
}
