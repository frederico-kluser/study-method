/**
 * tests/cx-views-gap-track-panel.test.ts — O PAINEL DE DESAFIO DE TRILHA
 * (`src/views/ChallengeView/TrackChallengePanel.tsx`) RENDERIZADO NA BATERIA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O GAP QUE ESTE ARQUIVO FECHA
 * ══════════════════════════════════════════════════════════════════════════
 * A bateria cx-views importa este módulo (cx-views-lesson-helpers.test.ts
 * exercita as funções PURAS dele) e nunca o RENDERIZA. Aqui ele é montado com
 * `react-dom/server`, o TEMA REAL e os textos REAIS de pt-BR (o padrão de
 * cx-views-views-ssr.test.ts), no estado inicial (a spec ainda não chegou) e
 * nos estados derivados que o IPC entrega — seleção real
 * (`TrackChallengeNavSelection`) e spec real (`TrackChallengeSpec`).
 *
 * ─── O SEEDING DE ESTADO (só de teste), e o que ele NÃO faz ────────────────
 * `renderToStaticMarkup` não roda efeitos: em produção quem preenche
 * `loading`/`spec`/`started`/`code` é o IPC (`track:challenge`) e o aluno, via
 * `useState`. Sem seeding, SSR só alcança o spinner — e o gap de render é
 * justamente o que os ATOS do painel mostram. O seeding injeta, na fronteira
 * do `useState` e SÓ durante a execução da função do componente, os valores
 * que o IPC e o aluno preencheriam (construídos dos TIPOS reais). O que é REAL
 * e não muda: o renderizador, o tema, os textos, os componentes e toda a
 * derivação (canSubmit, clock, multiFile, os gates de target). Nada aqui mede
 * efeito — os efeitos continuam fora do alcance do SSR por definição.
 *
 * A ASSINATURA dos `useState` do alvo está fixada abaixo (inicializador por
 * posição) e a CONTAGEM total de slots consumidos ao fim do render é exigida
 * igual ao tamanho dela: se a refatoração reordenar, inserir, remover (mesmo
 * no RABO) ou condicionar hooks, o teste FALHA com mensagem clara em vez de
 * medir ficção silenciosa. O `useSyncExternalStore`
 * ganha o fallback `getServerSnapshot -> getSnapshot` (a MESMA semântica que o
 * QuizOverlayHost já adota para stores de MÓDULO) porque os call sites de 2
 * argumentos desta base não foram escritos para SSR.
 *
 * Bloqueio DECLARADO (fora deste arquivo): `OnboardingOverlay` e `ChallengeView`
 * não são importáveis sob `node --import tsx` (bloqueio de CSS loader —
 * `@xterm/xterm/css/xterm.css` transitivo) e ficam para quando a base tiver
 * loader de CSS nos testes.
 *
 * Reprodução: `cd app && npm test -- tests/cx-views-gap-track-panel.test.ts`
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from '@mui/material/styles';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { theme } from '../src/theme';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import type { TrackChallengeNavSelection } from '../src/lib/challengeNav';
import type { TrackChallengeSpec } from '../shared/ipc-contract';

/* ─── Assinatura pública observada (o import do .tsx é dinâmico) ─────────── */

interface TrackChallengePanelProps {
  selection: TrackChallengeNavSelection;
  onNavigate?: (key: string) => void;
}

type TrackChallengePanelFn = (props: TrackChallengePanelProps) => ReactElement;

const PANEL_MODULE = new URL('../src/views/ChallengeView/TrackChallengePanel.tsx', import.meta.url).href;

let TrackChallengePanel: TrackChallengePanelFn;

/* ─── Infraestrutura de render (shim do useSyncExternalStore + seeding) ───── */

interface ReactHooks {
  useState: (initializer: unknown) => [unknown, (value: unknown) => void];
  useSyncExternalStore: (
    subscribe: (onStoreChange: () => void) => () => void,
    getSnapshot: () => unknown,
    getServerSnapshot?: () => unknown,
  ) => unknown;
}

const REACT = createRequire(import.meta.url)('react') as ReactHooks;
const useStateReal = REACT.useState;
const useSyncExternalStoreReal = REACT.useSyncExternalStore;

REACT.useSyncExternalStore = (subscribe, getSnapshot, getServerSnapshot) =>
  useSyncExternalStoreReal(subscribe, getSnapshot, getServerSnapshot ?? getSnapshot);

/** Um `useState` semeado: posição, inicializador esperado e o valor do IPC/aluno. */
interface Seed {
  slot: number;
  esperado: string;
  valor: unknown;
}

let seedsAtivos: readonly Seed[] | null = null;
let assinaturaAtiva: readonly string[] | null = null;
let slotCorrente = 0;

function rotulo(initializer: unknown): string {
  return typeof initializer === 'function' ? 'fn' : (JSON.stringify(initializer) ?? 'undefined');
}

REACT.useState = (initializer) => {
  const par = useStateReal(initializer);
  if (seedsAtivos === null || assinaturaAtiva === null) return par;
  const i = slotCorrente++;
  const veio = rotulo(initializer);
  assert.equal(
    veio,
    assinaturaAtiva[i],
    `slot de estado ${i} divergiu da assinatura fixada (era ${String(assinaturaAtiva[i])}, veio ${veio}) — ` +
      'a refatoração mexeu nos hooks do alvo; atualize a assinatura/seed deste teste',
  );
  const alvo = seedsAtivos.find((s) => s.slot === i);
  if (alvo === undefined) return par;
  // O `esperado` do seed é LIDO aqui: cada seed declara o inicializador que se
  // propõe a substituir — trocar o inicializador do slot alvo reprova o seed
  // mesmo que a assinatura tenha sido atualizada junto.
  assert.equal(
    veio,
    alvo.esperado,
    `seed do slot ${i} declara o inicializador ${alvo.esperado}, mas o alvo renderizou ${veio}`,
  );
  return [alvo.valor, par[1]];
};

/**
 * A ASSINATURA dos `useState` do render do painel, por posição (o slot 0 é
 * interno — do `useTranslation`/harness do react-i18next). Medida no render
 * real; os slots próprios seguem a ordem do fonte: spec(1), loadError(2),
 * loading(3), started(4), elapsedMs(5), starsLeft(6), concluded(7), code(8),
 * filesCode(9), activeFile(10), running(11), result(12), submissionError(13),
 * regenerating(14).
 */
const ASSINATURA_ESTADO = [
  '0', 'null', 'null', 'true', 'false', '0', '3', 'null', '""', '{}', 'null', 'false', 'null', 'null', 'false',
] as const;

function renderComSeeds(alvo: TrackChallengePanelFn, props: TrackChallengePanelProps, seeds: readonly Seed[]): string {
  function ComSeeds(): ReactElement {
    seedsAtivos = seeds;
    assinaturaAtiva = ASSINATURA_ESTADO;
    slotCorrente = 0;
    try {
      const elemento = alvo(props);
      // CONTAGEM TOTAL ao fim do render: slots consumidos == assinatura inteira.
      // É esta asserção que fecha a classe que a comparação por posição não via
      // (revisão HIGH): hook REMOVIDO — ou condicional — no RABO renderiza MENOS
      // slots sem nunca acusar nas comparações 1-a-1, e a UI dele sumiria com a
      // suíte verde. Inserção também cai aqui (mais slots que a assinatura),
      // então remoção E inserção fecham com uma frase só.
      assert.equal(
        slotCorrente,
        ASSINATURA_ESTADO.length,
        `o render do alvo consumiu ${slotCorrente} slots de useState, e a assinatura fixada tem ${ASSINATURA_ESTADO.length} — ` +
          'hook removido/inserido/condicional no alvo; atualize a assinatura/seed deste teste',
      );
      return elemento;
    } finally {
      seedsAtivos = null;
      assinaturaAtiva = null;
    }
  }
  return renderToStaticMarkup(createElement(ThemeProvider, { theme }, createElement(ComSeeds)));
}

function renderizar(props: TrackChallengePanelProps): string {
  return renderToStaticMarkup(createElement(ThemeProvider, { theme }, createElement(TrackChallengePanel, props)));
}

/** O TEXTO que chega à tela: HTML sem folhas de estilo nem tags. */
function onScreen(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A tag de abertura do <button> cujo rótulo contém `rotulo` (ou null). */
function aberturaDeBotao(html: string, rotulo: string): string | null {
  const m = new RegExp(`<button[^>]*>(?:(?!<\\/button>)[\\s\\S])*?${rotulo}`).exec(html);
  return m === null ? null : m[0].slice(0, m[0].indexOf('>') + 1);
}

/* ─── Entradas realistas (TIPOS reais) ────────────────────────────────────── */

const SELECAO_AULA: TrackChallengeNavSelection = {
  trackSlug: 'python-iniciante',
  target: 'lesson',
  lessonId: 'a-primeira-linha',
  challengeId: 'mostre-seu-nome',
  title: 'Mostre o seu nome',
  attemptedBeforeLesson: true,
};

const SELECAO_PROFICIENCIA: TrackChallengeNavSelection = {
  trackSlug: 'python-iniciante',
  target: 'proficiency',
  challengeId: 'prof-1',
};

const SELECAO_MODULO: TrackChallengeNavSelection = {
  trackSlug: 'python-iniciante',
  target: 'module',
  moduleSlug: 'a-tela',
  challengeId: 'mod-1',
};

const SPEC: TrackChallengeSpec = {
  slug: 'mostre-seu-nome',
  title: 'Mostre o seu nome',
  concept: 'imprimir',
  difficulty: 2,
  statement: 'Faça a tela mostrar exatamente o seu nome.',
  starterCode: 'print("")',
  expectedTestCount: 2,
  minFirstStarMs: 20_000,
  timeLimitMs: 210_000,
  source: 'track',
  lastVerdict: null,
  stars: 0,
  failedCount: 0,
};

/** O que o IPC entregaria + o loading desligado (o `.then` do loadSpec). */
const SEEDS_SPEC: readonly Seed[] = [
  { slot: 1, esperado: 'null', valor: SPEC },
  { slot: 3, esperado: 'true', valor: false },
];

before(async () => {
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
  await i18next.use(initReactI18next).init({
    lng: 'pt-BR',
    interpolation: { escapeValue: false },
    resources: { 'pt-BR': { translation: ptBR } },
  });
  const mod = (await import(PANEL_MODULE)) as unknown as { TrackChallengePanel: TrackChallengePanelFn };
  TrackChallengePanel = mod.TrackChallengePanel;
});

/* ══════════════════════════════════════════════════════════════════════════
 * 1. ESTADO INICIAL — a spec ainda não chegou
 * ══════════════════════════════════════════════════════════════════════════ */

describe('TrackChallengePanel — estado inicial (loading): antes de a spec chegar', () => {
  it('renderiza com seleções realistas dos TRÊS targets (lesson/proficiency/module) — nunca quebra', () => {
    for (const selection of [SELECAO_AULA, SELECAO_PROFICIENCIA, SELECAO_MODULO]) {
      assert.doesNotThrow(() => renderizar({ selection }));
      assert.doesNotThrow(() => renderizar({ selection, onNavigate: () => {} }));
    }
  });

  it('só o indicador de progresso: NENHUM conteúdo do desafio vaza antes da spec', () => {
    const html = renderizar({ selection: SELECAO_AULA });
    assert.ok(html.includes('MuiCircularProgress'), 'o loading é visível');
    const tela = onScreen(html);
    assert.equal(tela.includes(SPEC.title), false, 'sem título antes da spec');
    assert.equal(tela.includes(SPEC.statement), false, 'sem enunciado antes da spec');
    assert.equal(tela.includes(ptBR.challenge.startButton), false, 'sem "Começar" antes da spec');
    assert.ok(!html.includes('role="timer"'), 'sem cronômetro antes da spec');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 2. ESTADOS DERIVADOS — o que o IPC e o aluno preenchem (semeado no useState)
 * ══════════════════════════════════════════════════════════════════════════ */

describe('TrackChallengePanel — estados derivados: spec carregada (semeada como o IPC faria)', () => {
  it('Ato 1 (não começado): cabeçalho completo + enunciado + "Começar" + 3 estrelas', () => {
    const html = renderComSeeds(TrackChallengePanel, { selection: SELECAO_AULA }, SEEDS_SPEC);
    const tela = onScreen(html);

    assert.ok(tela.includes(SPEC.title), 'o título do desafio é o da spec');
    assert.ok(
      tela.includes(ptBR.challenge.difficulty.replace('{{n}}', String(SPEC.difficulty))),
      'o chip de dificuldade vem da spec',
    );
    assert.ok(
      tela.includes(ptBR.challenge.testsCount.replace('{{n}}', String(SPEC.expectedTestCount))),
      'o chip de contagem de testes vem da spec',
    );
    assert.ok(html.includes('role="timer"'), 'o cronômetro está no cabeçalho');
    assert.ok(tela.includes(SPEC.statement), 'o enunciado está na tela');
    assert.ok(tela.includes(ptBR.challenge.startButton), 'o ato 1 termina no "Começar"');
    assert.equal(tela.includes(ptBR.challenge.testButton), false, 'sem "Testar resposta" antes de começar');
    assert.equal(
      (html.match(/data-testid="StarIcon"/g) ?? []).length,
      3,
      'as 3 estrelas nascem cheias (starsLeft = 3)',
    );
  });

  it("erro de carga (fail-closed): o aviso do canal + 'Tentar de novo' — '' também é erro válido", () => {
    // W3 (falsy-proof): o loadError é semeado com '' — a string VAZIA é erro
    // VÁLIDA (só null significa "sem erro") e a TELA de erro assume mesmo
    // assim: o aluno lê o aviso vazio e tem como repetir.
    const html = renderComSeeds(
      TrackChallengePanel,
      { selection: SELECAO_PROFICIENCIA },
      [
        { slot: 2, esperado: 'null', valor: '' },
        { slot: 3, esperado: 'true', valor: false },
      ],
    );
    const tela = onScreen(html);
    assert.ok(tela.includes(ptBR.common.tryAgain), 'o aluno tem como repetir');
    assert.equal(tela.includes(ptBR.challenge.startButton), false, 'nada de "Começar" num erro de carga');
    assert.match(html, /MuiAlert-[A-Za-z]*Error/, 'é a tela de erro (Alert severity="error")');
  });

  it('Ato 2 (começado, com código): editor + "Testar resposta" habilitado', () => {
    const html = renderComSeeds(
      TrackChallengePanel,
      { selection: SELECAO_AULA },
      [
        ...SEEDS_SPEC,
        { slot: 4, esperado: 'false', valor: true },
        { slot: 8, esperado: '""', valor: 'print("bom dia")' },
      ],
    );
    const tela = onScreen(html);
    assert.ok(tela.includes(ptBR.challenge.editorLabel), 'o editor está na tela');
    // O VALOR do editor não materializa em SSR: o CodeMirror desenha o código
    // só no cliente. O que dá para medir aqui é a moldura do ato 2 e o gate de
    // submit derivado do valor (`canSubmit` — com código pronto ele abre).
    const botao = aberturaDeBotao(html, ptBR.challenge.testButton);
    assert.ok(botao !== null, 'o "Testar resposta" está em cena');
    assert.ok(!botao!.includes('disabled=""'), 'com código pronto, o botão está habilitado');
  });
});
