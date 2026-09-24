/**
 * tests/cx-views-gap-lesson-view.test.ts — o QUE A LessonView ENTREGA À TELA
 * (`src/views/LessonView/LessonView.tsx`), renderizada DE VERDADE.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O GAP QUE ESTE ARQUIVO FECHA
 * ══════════════════════════════════════════════════════════════════════════
 * A bateria cx-views importa este módulo (cx-views-lesson-helpers.test.ts
 * exercita as funções PURAS dele) e nunca o RENDERIZA: o refator que trocar a
 * árvore JSX passa com a suíte verde. Este arquivo mede o HTML — estado
 * inicial e estados derivados — com `react-dom/server`, o TEMA REAL e os
 * textos REAIS de pt-BR (o padrão de cx-views-views-ssr.test.ts).
 *
 * ─── POR QUE HÁ UM SEEDING DE ESTADO (e o que ele NÃO faz) ────────────────
 * `renderToStaticMarkup` não roda efeitos: em produção quem preenche
 * `trackLesson`/`lesson`/`chat` é o IPC (`track:lesson`) no `.then` do efeito
 * de montagem. Sem seeding, SSR só alcança o estado VAZIO — e o gap de render
 * é justamente o que as telas COM AULA mostram. O seeding injeta, na fronteira
 * do `useState` e SÓ durante a execução da função do componente, os valores
 * que o IPC entregaria (construídos com as funções REAIS do
 * `src/lib/trackLessonState` e do payload REAL `TrackLessonPayload`). O que é
 * REAL e não muda: o renderizador, o tema, os textos, os componentes e toda a
 * derivação (lessonActionStep, cardDecision, quiz cards). Os efeitos continuam
 * fora do alcance do SSR por definição — nada aqui mede efeito.
 *
 * Duas outras peças de infraestrutura vivem aqui, ambas de TESTE:
 *   1. `useSyncExternalStore` ganha o fallback `getServerSnapshot ->
 *      getSnapshot` — exatamente a semântica que o `QuizOverlayHost` já
 *      adota para stores de MÓDULO ("não existe 'estado do servidor' diferente
 *      do do cliente"). Sem ela o React RECUSA renderizar fora do navegador
 *      ("Missing getServerSnapshot"): os call sites de 2 argumentos desta view
 *      (`subscribeChallengeGenerate`, `subscribeQuizOverlay`) são herança de
 *      quando nada aqui era SSR-ado;
 *   2. o SEEDING acima, com GUARDA DE ASSINATURA: a sequência de
 *      inicializadores de `useState` do render do alvo é fixada abaixo, e a
 *      CONTAGEM total de slots consumidos ao fim do render é exigida igual ao
 *      tamanho dela — se a refatoração reordenar, inserir, remover (mesmo no
 *      RABO) ou condicionar hooks, o teste FALHA com mensagem clara. Ele nunca
 *      mede ficção silenciosa.
 *
 * Bloqueio DECLARADO (fora deste arquivo): `OnboardingOverlay` e `ChallengeView`
 * não são importáveis sob `node --import tsx` (bloqueio de CSS loader —
 * `@xterm/xterm/css/xterm.css` transitivo) e ficam para quando a base tiver
 * loader de CSS nos testes.
 *
 * Reprodução: `cd app && npm test -- tests/cx-views-gap-lesson-view.test.ts`
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
import { applyTutorReply, createTrackLessonState, type TrackLessonUiState } from '../src/lib/trackLessonState';
import { openQuizOverlay, __resetQuizOverlayForTests } from '../src/lib/quizOverlayState';
import type { TrackLessonPayload } from '../shared/ipc-contract';

/* ─── Assinatura pública observada (o import do .tsx é dinâmico) ─────────── */

interface LessonViewProps {
  setupsDir?: string;
  onNavigate?: (key: string) => void;
}

type LessonViewFn = (props: LessonViewProps) => ReactElement;

const VIEW_MODULE = new URL('../src/views/LessonView/LessonView.tsx', import.meta.url).href;

let LessonView: LessonViewFn;

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

// (1) o snapshot de servidor dos stores de MÓDULO é o próprio snapshot — a
// mesma regra documentada no QuizOverlayHost (ver o cabeçalho).
REACT.useSyncExternalStore = (subscribe, getSnapshot, getServerSnapshot) =>
  useSyncExternalStoreReal(subscribe, getSnapshot, getServerSnapshot ?? getSnapshot);

/** Um `useState` semeado: posição, inicializador esperado e o valor do IPC. */
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

// (2) o seeding — inerte quando `seedsAtivos` é null (todo o resto da suíte
// roda com o React intacto; os patches só existem dentro do render alvo).
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
 * A ASSINATURA dos `useState` do render da LessonView, por posição (o slot 0
 * é interno — do `useTranslation`/harness do react-i18next). Medida no render
 * real; é a guarda de refatoração descrita no cabeçalho.
 */
const ASSINATURA_ESTADO = [
  '0', 'null', 'null', 'fn', 'false', 'null', '""', 'null', 'false', 'null', 'null', 'null',
  '"cabecalho"', 'false', 'null', 'null', 'fn', 'null', 'false', '""', 'undefined',
] as const;

/**
 * Renderiza o alvo COM seeding. O wrapper chama a função do componente
 * diretamente — os hooks do alvo correm dentro do wrapper (escopo do seed) e
 * os filhos (MUI etc.) renderizam DEPOIS, já sem seed (pass-through).
 */
function renderComSeeds(alvo: LessonViewFn, props: LessonViewProps, seeds: readonly Seed[]): string {
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

function renderizar(props: LessonViewProps = {}): string {
  return renderToStaticMarkup(createElement(ThemeProvider, { theme }, createElement(LessonView, props)));
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

/* ─── Entradas realistas (TIPOS reais, conteúdo da aula real do acervo) ───── */

const AULA: TrackLessonPayload = {
  slug: 'a-primeira-linha',
  moduleSlug: 'a-tela',
  title: 'A primeira linha',
  summary: 'Você escreve uma linha, manda rodar, e ela aparece na tela.',
  difficulty: 1,
  concepts: ['imprimir'],
  prerequisites: [],
  theory: [
    {
      id: 'uma-linha-e-so',
      title: 'Uma linha, e só',
      markdown: 'Programar é escrever ordens que o computador segue, uma por linha, de cima para baixo.',
    },
  ],
  assertions: [
    {
      id: 'print-mostra-na-tela',
      statement: 'print mostra na tela o que estiver entre as aspas.',
      question: 'O que aparece na tela quando se roda print("bom dia")?',
      options: ['bom dia', 'print', 'nada', 'uma linha em branco'],
      answerIndex: 0,
      feedback: 'O que está entre as aspas é o que aparece.',
      sectionId: 'uma-linha-e-so',
    },
  ],
  sources: [{ title: 'Docs de Python', url: 'https://docs.python.org/3/', description: 'A documentação oficial.' }],
  challenges: [
    {
      slug: 'mostre-seu-nome',
      title: 'Mostre o seu nome',
      concept: 'imprimir',
      difficulty: 1,
      lastVerdict: null,
      stars: 0,
      failedCount: 0,
      generated: false,
    },
  ],
  locked: false,
  done: false,
  nextLesson: null,
};

const SELECAO_AULA = { trackSlug: 'python-iniciante', lessonId: 'a-primeira-linha' };

/** Aula EM CURSO: a seção 1 já foi apresentada — construída pelo módulo REAL. */
function chatEmCurso(): TrackLessonUiState {
  return applyTutorReply(createTrackLessonState(), {
    ok: true,
    message: 'Programar é escrever ordens que o computador segue, uma por linha, de cima para baixo.',
    sectionId: 'uma-linha-e-so',
    sectionTitle: 'Uma linha, e só',
    done: false,
  });
}

before(async () => {
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
  // Os textos REAIS de pt-BR, com a MESMA interpolação da produção
  // (`escapeValue: false` — ver tests/quizOverlayRender.test.ts).
  await i18next.use(initReactI18next).init({
    lng: 'pt-BR',
    interpolation: { escapeValue: false },
    resources: { 'pt-BR': { translation: ptBR } },
  });
  const mod = (await import(VIEW_MODULE)) as unknown as { LessonView: LessonViewFn };
  LessonView = mod.LessonView;
});

/* ══════════════════════════════════════════════════════════════════════════
 * 1. ESTADO INICIAL — a aba Aula sem aula selecionada
 * ══════════════════════════════════════════════════════════════════════════ */

describe('LessonView — estado inicial (vazio): o que a aba Aula mostra sem aula', () => {
  it('renderiza com os DOIS formatos de props (sem nada; com setupsDir + onNavigate) — nunca quebra', () => {
    assert.doesNotThrow(() => renderizar());
    assert.doesNotThrow(() => renderizar({ setupsDir: '/tmp/setup', onNavigate: () => {} }));
  });

  it('o copy do vazio está todo na tela: título, descrição e o CTA "Ver trilhas"', () => {
    const tela = onScreen(renderizar());
    assert.ok(tela.includes(ptBR.lesson.emptyTitle), 'o título do vazio está na tela');
    assert.ok(tela.includes(ptBR.lesson.emptyDescription), 'a orientação de onde procurar está na tela');
    assert.ok(tela.includes(ptBR.lesson.emptyCta), 'o CTA leva para a trilha');
  });

  it('nada da aula vaza na tela vazia: sem conversa, sem entrada, sem card de desafio', () => {
    const tela = onScreen(renderizar());
    assert.equal(tela.includes(ptBR.lesson.chatStart), false, 'o convite do chat é da aula carregada');
    assert.equal(tela.includes(ptBR.lesson.startButton), false, 'sem aula não há o que começar');
    assert.equal(tela.includes(ptBR.lesson.askInput), false, 'sem aula não há composer');
    assert.equal(tela.includes(ptBR.lesson.challengeIntroCardTitle), false, 'sem aula não há card de desafio');
  });

  it('a tela vazia é INVARIANTE às entradas vivas (overlay do quiz aberto): nada de estado global vaza', () => {
    __resetQuizOverlayForTests();
    const semOverlay = onScreen(renderizar());
    openQuizOverlay({
      quizKey: 'uma-linha-e-so::print-mostra-na-tela',
      assertionId: 'print-mostra-na-tela',
      generation: 0,
      sectionId: 'uma-linha-e-so',
      anchorIndex: 0,
    });
    try {
      assert.equal(onScreen(renderizar()), semOverlay, 'o estado vazio não desenha nada do overlay');
    } finally {
      __resetQuizOverlayForTests();
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 2. ESTADOS DERIVADOS — a aula que o IPC entrega (semeada no useState)
 * ══════════════════════════════════════════════════════════════════════════ */

describe('LessonView — estado derivado: a aula carregada (payload real, semeado como o IPC faria)', () => {
  it("ainda não começada: o convite do chat, o botão e o CARD do desafio inicial", () => {
    const html = renderComSeeds(
      LessonView,
      { onNavigate: () => {} },
      [
        { slot: 1, esperado: 'null', valor: SELECAO_AULA },
        { slot: 2, esperado: 'null', valor: AULA },
      ],
    );
    const tela = onScreen(html);
    assert.ok(tela.includes(ptBR.lesson.chatStart), 'o convite diz que a aula é um chat');
    assert.ok(tela.includes(ptBR.lesson.startButton), 'o "Começar aula" dispara a primeira seção');
    assert.ok(tela.includes(ptBR.lesson.challengeIntroCardTitle), 'o desafio da aula nasce abaixo do convite');
    assert.ok(tela.includes('Mostre o seu nome'), 'o card nomeia o desafio');
    assert.equal(tela.includes(ptBR.lesson.emptyTitle), false, 'a tela vazia saiu de cena');
  });

  it('em curso: a seção apresentada está na conversa e a entrada do chat assume o comando', () => {
    const html = renderComSeeds(
      LessonView,
      { onNavigate: () => {} },
      [
        { slot: 1, esperado: 'null', valor: SELECAO_AULA },
        { slot: 2, esperado: 'null', valor: AULA },
        { slot: 3, esperado: 'fn', valor: chatEmCurso() },
      ],
    );
    const tela = onScreen(html);
    assert.ok(
      tela.includes('Programar é escrever ordens que o computador segue'),
      'a bolha da seção apresentada está na conversa',
    );
    // A entrada do chat é medida no MARCADO BRUTO: placeholder/aria-label são
    // atributos, e o `onScreen` (texto puro) os descarta junto com as tags.
    assert.ok(
      html.includes(`placeholder="${ptBR.lesson.askInput}"`),
      'o composer está pronto para a dúvida do aluno',
    );
    assert.ok(
      html.includes(`>${ptBR.lesson.advanceButton}</button>`),
      'o avanço da teoria mora no fim da linha do composer',
    );
    assert.equal(tela.includes(ptBR.lesson.chatStart), false, 'o convite inicial não fica junto da aula em curso');
    assert.equal(tela.includes(ptBR.lesson.startButton), false, 'o "Começar aula" já foi');
  });
});
