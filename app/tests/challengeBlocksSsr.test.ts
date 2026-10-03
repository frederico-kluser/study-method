/**
 * tests/challengeBlocksSsr.test.ts — os BLOCOS de VIEW da área do Desafio
 * (`src/views/ChallengeView/blocks/*`) RENDERIZADOS com o renderizador real,
 * o tema real e os textos REAIS de pt-BR (o padrão de
 * `tests/lessonSidebarHeader.test.ts` — sem jsdom: `react-dom/server`).
 *
 * O que prova (e o que NÃO prova, com honestidade): sem DOM não há clique nem
 * layout — o que mede interação real é o Storybook (play functions) e o e2e.
 * Aqui fixa-se o que o SSR EMITE e é contrato: landmarks/nomes acessíveis
 * (região de status, estrelas `role="img"`, relógio `role="timer"`), a copy
 * interpolada (estrelas, contagens, truncagem), os GATES de render (vazio,
 * erro, retry, disclosure `aria-expanded`/`aria-controls`) e o CSS que o
 * design system cobra (sr-only em px — auditoria §5; barra sticky na camada
 * `Z_INDEX.stickyBar` — §12).
 *
 * Os blocos são `.tsx`: import DINÂMICO por URL com specifier computado (o
 * projeto dos testes não liga `jsx` — ver a doc de lessonSidebarHeader).
 *
 * Reprodução: `cd app && bash tools/t.sh tests/challengeBlocksSsr.test.ts`
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
import en from '../src/i18n/locales/en/translation.json';
import type { TrackModuleMasteryReport, TrackSubmitResult } from '../shared/ipc-contract';

const M = (rel: string): string => new URL(`../src/views/ChallengeView/blocks/${rel}`, import.meta.url).href;

/* ─── Contratos de props declarados LOCALMENTE (o tipo do .tsx não é alcançável) ── */

interface StatementError {
  text: string;
  severity: 'warning' | 'error';
}
interface StreamBlock {
  kind: 'thinking' | 'text' | 'tool' | 'error';
  text: string;
}
interface StarsTimerProps {
  starsLeft: number;
  totalStars: number;
  timedOut: boolean;
  clockText: string;
}
interface ListStatesProps {
  listing: 'idle' | 'loading' | 'error' | 'empty';
  listError: string;
  hasActive: boolean;
  onRetry: () => void;
  onGoToLesson: () => void;
}
interface StatementPanelProps {
  title: string;
  language: string;
  statement: string;
  statementError: StatementError | null;
  onRetry: () => void;
}
interface SubmitBarProps {
  canTest: boolean;
  busy: boolean;
  testSignal: string;
  onTest: () => void;
  onAbort: () => void;
}
interface VerdictBlockProps {
  severity: 'success' | 'warning' | 'error';
  markdown: string;
}
interface StreamBlocksProps {
  blocks: StreamBlock[];
  showThinking: boolean;
}
interface FeedbackPanelProps {
  terminal: unknown;
  testRunning: boolean;
  testError: string | null;
  onRetryTests: () => void;
  providerLabel: string | null;
  piRunning: boolean;
  piAborted: boolean;
  requestingFeedback: boolean;
  showThinking: boolean;
  onToggleThinking: () => void;
  blocks: StreamBlock[];
  verdict: { severity: 'success' | 'warning' | 'error'; markdown: string } | null;
  piError: { text: string; kind: 'key' | 'other' } | null;
  onRetryPi: () => void;
}
interface ViewHeaderProps {
  showPicker: boolean;
  picker: {
    value: string;
    loading: boolean;
    disabled: boolean;
    options: { challengeId: string; title: string; language: string }[];
    onSelect: (id: string) => void;
  };
}
interface TrackLoadErrorProps {
  loadError: string | null;
  onRetry: () => void;
}
interface TrackHeaderProps {
  title: string;
  difficultyLabel: string;
  testsLabel: string;
  generated: boolean;
  starsLeft: number;
  timerText: string;
  onBack: () => void;
}
interface TrackStatementProps {
  statement: string;
  started: boolean;
  onStart: () => void;
}
interface TrackPassedProps {
  starsLeft: number;
  showLessonActions: boolean;
  regenerating: boolean;
  generateRunning: boolean;
  onAdvance: () => void;
  onRegenerate: () => void;
}
interface TrackTimeoutProps {
  timedOut: boolean;
  resultArrived: boolean;
}
interface TrackResultProps {
  result: TrackSubmitResult;
}
interface TrackMasteryProps {
  mastery: TrackModuleMasteryReport | null;
}

let StatusRegion: ComponentType<Record<string, never>>;
let StarsTimer: ComponentType<StarsTimerProps>;
let ListStates: ComponentType<ListStatesProps>;
let StatementPanel: ComponentType<StatementPanelProps>;
let SubmitBar: ComponentType<SubmitBarProps>;
let VerdictBlock: ComponentType<VerdictBlockProps>;
let StreamBlocks: ComponentType<StreamBlocksProps>;
let FeedbackPanel: ComponentType<FeedbackPanelProps>;
let ViewHeader: ComponentType<ViewHeaderProps>;
let TrackLoading: ComponentType<Record<string, never>>;
let TrackLoadError: ComponentType<TrackLoadErrorProps>;
let TrackHeader: ComponentType<TrackHeaderProps>;
let TrackStatement: ComponentType<TrackStatementProps>;
let TrackPassed: ComponentType<TrackPassedProps>;
let TrackTimeout: ComponentType<TrackTimeoutProps>;
let TrackResult: ComponentType<TrackResultProps>;
let TrackMastery: ComponentType<TrackMasteryProps>;

before(async () => {
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
  await i18next.use(initReactI18next).init({
    lng: 'pt-BR',
    interpolation: { escapeValue: false },
    resources: { 'pt-BR': { translation: ptBR }, en: { translation: en } },
  });
  StatusRegion = (await import(M('ChallengeStatusRegion.tsx'))).ChallengeStatusRegion;
  StarsTimer = (await import(M('ChallengeStarsTimer.tsx'))).ChallengeStarsTimer;
  ListStates = (await import(M('ChallengeListStates.tsx'))).ChallengeListStates;
  StatementPanel = (await import(M('ChallengeStatementPanel.tsx'))).ChallengeStatementPanel;
  SubmitBar = (await import(M('ChallengeSubmitBar.tsx'))).ChallengeSubmitBar;
  VerdictBlock = (await import(M('ChallengeVerdictBlock.tsx'))).ChallengeVerdictBlock;
  StreamBlocks = (await import(M('ChallengeStreamBlocks.tsx'))).ChallengeStreamBlocks;
  FeedbackPanel = (await import(M('ChallengeFeedbackPanel.tsx'))).ChallengeFeedbackPanel;
  ViewHeader = (await import(M('ChallengeViewHeader.tsx'))).ChallengeViewHeader;
  TrackLoading = (await import(M('TrackChallengeLoading.tsx'))).TrackChallengeLoading;
  TrackLoadError = (await import(M('TrackChallengeLoadError.tsx'))).TrackChallengeLoadError;
  TrackHeader = (await import(M('TrackChallengeHeader.tsx'))).TrackChallengeHeader;
  TrackStatement = (await import(M('TrackChallengeStatement.tsx'))).TrackChallengeStatement;
  TrackPassed = (await import(M('TrackChallengePassedVerdict.tsx'))).TrackChallengePassedVerdict;
  TrackTimeout = (await import(M('TrackChallengeTimeoutNotices.tsx'))).TrackChallengeTimeoutNotices;
  TrackResult = (await import(M('TrackChallengeResult.tsx'))).TrackChallengeResult;
  TrackMastery = (await import(M('TrackChallengeMastery.tsx'))).TrackChallengeMastery;
});

/** SSR com o tema real — a técnica da casa. */
function render(el: unknown): string {
  return renderToStaticMarkup(createElement(ThemeProvider, { theme }, el as never));
}

/** O texto do ecrã: HTML sem folhas nem tags (entidades do SSR descodificadas).
 *  As entidades são montadas com o `&` por `String.fromCharCode(38)` para não
 *  dependerem de literais que qualquer caminho de texto pode decodificar. */
const AMP = String.fromCharCode(38);
function onScreen(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]*>/g, ' ')
    .split(AMP + 'quot;').join('"')
    .split(AMP + '#x27;').join("'")
    .split(AMP + 'lt;').join('<')
    .split(AMP + 'gt;').join('>')
    .split(AMP + 'amp;').join(AMP)
    .replace(/\s+/g, ' ')
    .trim();
}

const noOp = (): void => {};

/* ═══ Blocos da ChallengeView ═══════════════════════════════════════════════ */

describe('ChallengeStatusRegion — sr-only SEM o bug latente (§5)', () => {
  it('role=status + aria-live, sempre no DOM', () => {
    const html = render(createElement(StatusRegion, {}));
    assert.match(html, /role="status"/);
    assert.match(html, /aria-live="polite"/);
  });

  it('o sr-only usa medidas ABSOLUTAS em px (1px, não 1 → 100%; -1px, não -8px)', () => {
    const html = render(createElement(StatusRegion, {}));
    assert.match(html, /width:1px/, 'a cópia local tinha o bug `width: 1` → 100%');
    assert.doesNotMatch(html, /width:100%/);
    assert.match(html, /height:1px/);
  });
});

describe('ChallengeViewHeader — título + picker', () => {
  const picker = {
    value: 'c1',
    loading: false,
    disabled: false,
    options: [
      { challengeId: 'c1', title: 'Desafio: funções reutilizáveis', language: 'python' },
    ],
    onSelect: noOp,
  };

  it('h1 da página + opções do picker (título e linguagem)', () => {
    const html = render(createElement(ViewHeader, { showPicker: true, picker }));
    assert.ok(html.includes('<h1'), 'o título da página tem de ser o h1');
    assert.ok(onScreen(html).includes('Desafio: funções reutilizáveis (python)'));
    assert.ok(html.includes('id="challenge-picker"'));
  });

  it('sem picker (seleção do contexto) o seletor não renderiza', () => {
    const html = render(createElement(ViewHeader, { showPicker: false, picker }));
    assert.ok(!html.includes('challenge-picker'));
  });

  it('o picker SEMPRE tem rótulo; a carregar/desativado fica disabled', () => {
    // As OPÇÕES do Select vivem no Menu (popover — não existem no SSR); o que
    // o SSR prova é o rótulo e o gate `disabled` (loading ou corrida em voo).
    const vazio = render(
      createElement(ViewHeader, { showPicker: true, picker: { ...picker, value: '', options: [] } }),
    );
    assert.ok(vazio.includes(ptBR.challenge.openChallenge), 'o rótulo do picker sumiu');
    const loading = render(
      createElement(ViewHeader, {
        showPicker: true,
        picker: { ...picker, value: '', options: [], loading: true },
      }),
    );
    assert.ok(loading.includes('Mui-disabled'), 'a carregar o picker tem de ficar disabled');
    const corrida = render(
      createElement(ViewHeader, { showPicker: true, picker: { ...picker, disabled: true } }),
    );
    assert.ok(corrida.includes('Mui-disabled'), 'em corrida o picker tem de ficar disabled');
  });
});

describe('ChallengeStarsTimer — estrelas + relógio', () => {
  it('estrelas com nome acessível interpolado ({{current}} de {{total}})', () => {
    const html = render(
      createElement(StarsTimer, { starsLeft: 2, totalStars: 3, timedOut: false, clockText: '02:14' }),
    );
    const aria = ptBR.challenge.starsAria.replace('{{current}}', '2').replace('{{total}}', '3');
    assert.ok(html.includes(`aria-label="${aria}"`), `faltou o aria "${aria}"`);
    assert.ok(html.includes('role="img"'));
  });

  it('relógio com rótulo próprio ({{time}}) e texto mm:ss', () => {
    const html = render(
      createElement(StarsTimer, { starsLeft: 3, totalStars: 3, timedOut: false, clockText: '03:30' }),
    );
    const aria = ptBR.challenge.timerAria.replace('{{time}}', '03:30');
    assert.ok(html.includes(`aria-label="${aria}"`));
    assert.ok(onScreen(html).includes('03:30'));
  });

  it('tempo esgotado → chip "Tempo esgotado"', () => {
    const html = render(
      createElement(StarsTimer, { starsLeft: 0, totalStars: 3, timedOut: true, clockText: '00:00' }),
    );
    assert.ok(onScreen(html).includes(ptBR.challenge.timedOut));
  });
});

describe('ChallengeListStates — erro/vazio/convite', () => {
  it('erro de listagem com "Tentar de novo" (a saída é obrigatória — W11)', () => {
    const html = render(
      createElement(ListStates, {
        listing: 'error',
        listError: 'Não consegui listar os desafios: boom',
        hasActive: false,
        onRetry: noOp,
        onGoToLesson: noOp,
      }),
    );
    const txt = onScreen(html);
    assert.ok(txt.includes('Não consegui listar os desafios: boom'));
    assert.ok(txt.includes(ptBR.common.tryAgain));
  });

  it('vazio legítimo: informativo + CTA para a Aula (ONDA-UX-VAZIO)', () => {
    const html = render(
      createElement(ListStates, {
        listing: 'empty',
        listError: '',
        hasActive: false,
        onRetry: noOp,
        onGoToLesson: noOp,
      }),
    );
    const txt = onScreen(html);
    assert.ok(txt.includes(ptBR.challenge.noChallengesEmpty));
    assert.ok(txt.includes(ptBR.challenge.emptyGoToLesson));
  });

  it('com desafio ativo NENHUM destes estados renderiza', () => {
    const html = render(
      createElement(ListStates, {
        listing: 'error',
        listError: 'x',
        hasActive: true,
        onRetry: noOp,
        onGoToLesson: noOp,
      }),
    );
    assert.equal(onScreen(html), '');
  });

  it('idle sem desafio → o convite a escolher', () => {
    const html = render(
      createElement(ListStates, {
        listing: 'idle',
        listError: '',
        hasActive: false,
        onRetry: noOp,
        onGoToLesson: noOp,
      }),
    );
    assert.ok(onScreen(html).includes(ptBR.challenge.selectPrompt));
  });
});

describe('ChallengeStatementPanel — enunciado', () => {
  it('título + chip de linguagem + markdown', () => {
    const html = render(
      createElement(StatementPanel, {
        title: 'Desafio: funções reutilizáveis',
        language: 'python',
        statement: '# Enunciado\n\nEscreva `dobro(n)`.\n',
        statementError: null,
        onRetry: noOp,
      }),
    );
    const txt = onScreen(html);
    assert.ok(txt.includes('Desafio: funções reutilizáveis'));
    assert.ok(txt.includes('python'));
    assert.ok(txt.includes('dobro(n)'));
  });

  it('erro de workspace é VISÍVEL com retry (nunca texto morto — W11)', () => {
    const html = render(
      createElement(StatementPanel, {
        title: 'T',
        language: 'python',
        statement: '',
        statementError: { text: 'O enunciado não está disponível.', severity: 'warning' },
        onRetry: noOp,
      }),
    );
    const txt = onScreen(html);
    assert.ok(txt.includes('O enunciado não está disponível.'));
    assert.ok(txt.includes(ptBR.common.tryAgain));
  });

  it('sem enunciado e sem erro → o estado de carregamento', () => {
    const html = render(
      createElement(StatementPanel, {
        title: 'T',
        language: 'python',
        statement: '',
        statementError: null,
        onRetry: noOp,
      }),
    );
    assert.ok(onScreen(html).includes(ptBR.challenge.statementLoading));
  });
});

describe('ChallengeSubmitBar — a barra pegajosa (W13/§12)', () => {
  it('"Testar resposta" + "Abortar"; a barra é sticky na camada nomeada', () => {
    const html = render(
      createElement(SubmitBar, {
        canTest: true,
        busy: false,
        testSignal: 'idle',
        onTest: noOp,
        onAbort: noOp,
      }),
    );
    const txt = onScreen(html);
    assert.ok(txt.includes(ptBR.challenge.testAnswer));
    assert.ok(txt.includes(ptBR.challenge.abort));
    assert.match(html, /position:sticky/, 'a barra deixou de ser pegajosa (W13)');
    assert.match(html, /z-index:10/, 'a camada da barra sticky é Z_INDEX.stickyBar = 10 (§12)');
  });

  it('sem corrida o "Abortar" está desligado', () => {
    const parado = render(
      createElement(SubmitBar, { canTest: true, busy: false, testSignal: 'idle', onTest: noOp, onAbort: noOp }),
    );
    const tag = /<button[^>]*>(?:(?!<\/button>)[\s\S])*?Abortar/.exec(parado)?.[0] ?? '';
    assert.ok(tag.includes('disabled'), 'o "Abortar" só vale durante uma corrida');
  });
});

describe('ChallengeVerdictBlock — o veredito (S1)', () => {
  it('rótulo + corpo em markdown', () => {
    const html = render(
      createElement(VerdictBlock, { severity: 'success', markdown: '## Veredito\n\nTudo certo com `dobro`.\n' }),
    );
    const txt = onScreen(html);
    assert.ok(txt.includes(ptBR.challenge.verdictLabel));
    assert.ok(txt.includes('Tudo certo com'));
  });
});

describe('ChallengeStreamBlocks — os blocos do stream', () => {
  const blocos: StreamBlock[] = [
    { kind: 'thinking', text: 'pensar alto' },
    { kind: 'text', text: 'o problema é o sinal' },
    { kind: 'tool', text: '⚙ edit' },
    { kind: 'error', text: 'rate limit' },
  ];

  it('fechado esconde o pensamento; aberto revela (disclosure)', () => {
    const fechado = onScreen(render(createElement(StreamBlocks, { blocks: blocos, showThinking: false })));
    assert.ok(!fechado.includes('pensar alto'));
    assert.ok(fechado.includes('o problema é o sinal'));
    const aberto = onScreen(render(createElement(StreamBlocks, { blocks: blocos, showThinking: true })));
    assert.ok(aberto.includes('pensar alto'));
  });

  it('sem blocos de saída devolve null (a caixa não renderiza)', () => {
    assert.equal(onScreen(render(createElement(StreamBlocks, { blocks: [], showThinking: false }))), '');
    assert.equal(
      onScreen(
        render(createElement(StreamBlocks, { blocks: [{ kind: 'thinking', text: 'x' }], showThinking: false })),
      ),
      '',
    );
  });
});

describe('ChallengeFeedbackPanel — saída + feedback', () => {
  const base: FeedbackPanelProps = {
    terminal: createElement('div', { 'data-fake-terminal': '1' }),
    testRunning: false,
    testError: null,
    onRetryTests: noOp,
    providerLabel: null,
    piRunning: false,
    piAborted: false,
    requestingFeedback: false,
    showThinking: false,
    onToggleThinking: noOp,
    blocks: [],
    verdict: null,
    piError: null,
    onRetryPi: noOp,
  };

  it('disclosure acessível: aria-expanded + a região controlada existe', () => {
    const html = render(createElement(FeedbackPanel, base));
    assert.match(html, /aria-expanded="false"/);
    assert.match(html, /aria-controls="challenge-thinking-panel"/);
    assert.match(html, /id="challenge-thinking-panel"/, 'a região controlada tem de existir no DOM');
  });

  it('erro de infra com retry (C3); o veredito entra no painel', () => {
    const html = render(
      createElement(FeedbackPanel, {
        ...base,
        testError: 'Não consegui rodar os testes (falha de infraestrutura). Tente de novo.',
        verdict: { severity: 'warning', markdown: 'Quase.' },
      }),
    );
    const txt = onScreen(html);
    assert.ok(txt.includes(ptBR.common.tryAgain));
    assert.ok(txt.includes(ptBR.challenge.verdictLabel));
  });

  it('erro de CHAVE: SEM retry e COM a dica (W10)', () => {
    const html = render(
      createElement(FeedbackPanel, {
        ...base,
        piError: { text: ptBR.challenge.piMissingKey, kind: 'key' },
      }),
    );
    const txt = onScreen(html);
    assert.ok(txt.includes(ptBR.challenge.keyHint), 'a dica da chave sumiu do ramo de chave');
    assert.ok(txt.includes(ptBR.challenge.piMissingKey));
    assert.ok(!txt.includes(ptBR.common.tryAgain), 'erro de chave não pode ganhar retry');
  });

  it('erro comum do pi: COM retry e SEM a dica da chave', () => {
    const html = render(
      createElement(FeedbackPanel, {
        ...base,
        piError: { text: 'Falha ao chamar o pi: HTTP 502', kind: 'other' },
      }),
    );
    const txt = onScreen(html);
    assert.ok(txt.includes(ptBR.common.tryAgain));
    assert.ok(!txt.includes(ptBR.challenge.keyHint), 'a dica da chave era ruído nos erros comuns');
  });

  it('S2: o interstício "a pedir avaliação" só com o pedido em voo', () => {
    const emVoo = render(createElement(FeedbackPanel, { ...base, piRunning: true, requestingFeedback: true }));
    assert.ok(onScreen(emVoo).includes(ptBR.challenge.requestingFeedback));
    const parado = render(createElement(FeedbackPanel, base));
    assert.ok(!onScreen(parado).includes(ptBR.challenge.requestingFeedback));
  });
});

/* ═══ Blocos do TrackChallengePanel ═════════════════════════════════════════ */

describe('TrackChallengeLoading / TrackChallengeLoadError', () => {
  it('o spinner anuncia a espera (role=status + common.loading)', () => {
    const html = render(createElement(TrackLoading, {}));
    assert.match(html, /role="status"/);
    assert.ok(html.includes(`aria-label="${ptBR.common.loading}"`));
  });

  it('erro com retry; sem mensagem cai no fallback W3', () => {
    const html = render(createElement(TrackLoadError, { loadError: 'canal mudo', onRetry: noOp }));
    const txt = onScreen(html);
    assert.ok(txt.includes('canal mudo'));
    assert.ok(txt.includes(ptBR.common.tryAgain));
    const fallback = onScreen(render(createElement(TrackLoadError, { loadError: null, onRetry: noOp })));
    assert.ok(fallback.includes(ptBR.challenge.trackNotFound));
  });
});

describe('TrackChallengeHeader — cabeçalho do desafio', () => {
  const base: TrackHeaderProps = {
    title: 'Desafio: converter temperatura',
    difficultyLabel: ptBR.challenge.difficulty.replace('{{n}}', '2'),
    testsLabel: ptBR.challenge.testsCount.replace('{{n}}', '3'),
    generated: false,
    starsLeft: 2,
    timerText: '03:30',
    onBack: noOp,
  };

  it('voltar + h1 + chips + estrelas (role=img) + relógio (role=timer)', () => {
    const html = render(createElement(TrackHeader, base));
    const txt = onScreen(html);
    assert.ok(txt.includes(ptBR.common.back));
    assert.ok(html.includes('<h1'), 'o título do desafio é o h1 da vista');
    assert.ok(txt.includes('dificuldade 2'));
    assert.ok(txt.includes('3 teste(s)'));
    assert.match(html, /role="img"/, 'as estrelas são role="img" com contagem');
    assert.match(html, /role="timer"/, 'o relógio é role="timer" com rótulo próprio');
    const aria = ptBR.challenge.timerAria.replace('{{time}}', '03:30');
    assert.ok(html.includes(`aria-label="${aria}"`));
  });

  it('badge "novo desafio" só em desafio gerado', () => {
    const gerado = render(createElement(TrackHeader, { ...base, generated: true }));
    assert.ok(gerado.includes(ptBR.challenge.generatedBadge));
    const sem = render(createElement(TrackHeader, base));
    assert.ok(!sem.includes(ptBR.challenge.generatedBadge));
  });
});

describe('TrackChallengeStatement — ato 1', () => {
  it('"Começar" só antes de começar; o enunciado vem em markdown', () => {
    const antes = render(
      createElement(TrackStatement, { statement: '# Converter temperatura\n', started: false, onStart: noOp }),
    );
    assert.ok(onScreen(antes).includes(ptBR.challenge.startButton));
    const depois = render(
      createElement(TrackStatement, { statement: '# Converter temperatura\n', started: true, onStart: noOp }),
    );
    assert.ok(!onScreen(depois).includes(ptBR.challenge.startButton));
  });
});

describe('TrackChallengePassedVerdict — veredito aprovado', () => {
  const base: TrackPassedProps = {
    starsLeft: 2,
    showLessonActions: true,
    regenerating: false,
    generateRunning: false,
    onAdvance: noOp,
    onRegenerate: noOp,
  };

  it('anúncio interpolado das estrelas + as duas saídas do desafio de aula', () => {
    const txt = onScreen(render(createElement(TrackPassed, base)));
    assert.ok(txt.includes(ptBR.challenge.passedAnnounce.replace('{{stars}}', '2')));
    assert.ok(txt.includes(ptBR.challenge.nextLessonButton));
    assert.ok(txt.includes(ptBR.challenge.generateNewAfterPass));
  });

  it('sem ações de aula (module/proficiency) só fica o anúncio', () => {
    const txt = onScreen(render(createElement(TrackPassed, { ...base, showLessonActions: false })));
    assert.ok(!txt.includes(ptBR.challenge.nextLessonButton));
  });

  it('regeneração em curso desliga o "Gerar outro desafio"', () => {
    const html = render(createElement(TrackPassed, { ...base, regenerating: true }));
    assert.match(html, /disabled/);
  });
});

describe('TrackChallengeTimeoutNotices — S9', () => {
  it('timeout avisa; com resultado em voo avisa DA DUPLA (o veredito nunca some)', () => {
    const so = onScreen(render(createElement(TrackTimeout, { timedOut: true, resultArrived: false })));
    assert.ok(so.includes(ptBR.challenge.timedOutAnnounce));
    const dupla = onScreen(render(createElement(TrackTimeout, { timedOut: true, resultArrived: true })));
    assert.ok(dupla.includes(ptBR.challenge.timedOutAnnounce));
    assert.ok(dupla.includes(ptBR.challenge.timeoutDuringSubmit));
    assert.equal(onScreen(render(createElement(TrackTimeout, { timedOut: false, resultArrived: false }))), '');
  });
});

describe('TrackChallengeResult — checklist + saída (S10/ONDA 1)', () => {
  const resultado: TrackSubmitResult = {
    ok: true,
    passed: false,
    testsRun: 3,
    expectedTests: 3,
    output: 'linha\n'.repeat(900),
    checks: [
      { name: 'para_celsius(32) devolve 0.0', passed: true },
      { name: 'para_celsius(212) devolve 100.0', passed: false },
    ],
    passedCount: 1,
    totalCount: 2,
  };

  it('razão PARCIAL interpolada + os nomes dos checks', () => {
    const txt = onScreen(render(createElement(TrackResult, { result: resultado })));
    assert.ok(txt.includes(ptBR.challenge.partialCount.replace('{{passed}}', '1').replace('{{total}}', '2')));
    assert.ok(txt.includes('para_celsius(32) devolve 0.0'));
    assert.ok(txt.includes(ptBR.challenge.checksTitle));
  });

  it('a truncagem da saída é AVISADA (nunca em silêncio)', () => {
    const html = render(createElement(TrackResult, { result: resultado }));
    const aviso = ptBR.challenge.outputTruncated.replace('{{n}}', '4000');
    assert.ok(onScreen(html).includes(aviso));
  });
});

describe('TrackChallengeMastery — análise de domínio do módulo', () => {
  const relatorio: TrackModuleMasteryReport = {
    marcadas: ['aula-1'],
    refazer: ['aula-3'],
    lessons: [
      { lessonId: 'aula-1', title: 'Variáveis e tipos', dominada: true, alreadyDone: false, motivo: 'ok' },
      { lessonId: 'aula-2', title: 'Condicionais', dominada: true, alreadyDone: true, motivo: 'já feita' },
      { lessonId: 'aula-3', title: 'Laços', dominada: false, alreadyDone: false, motivo: 'sem evidência' },
    ],
  };

  it('demonstradas × refazer, com os títulos das aulas', () => {
    const txt = onScreen(render(createElement(TrackMastery, { mastery: relatorio })));
    assert.ok(txt.includes(ptBR.challenge.masteryTitle));
    assert.ok(txt.includes('Variáveis e tipos'), 'a aula demonstrada sumiu');
    assert.ok(txt.includes('Laços'), 'a aula a refazer sumiu');
    assert.ok(!txt.includes('Condicionais'), 'a alreadyDone não é mérito desta tentativa');
  });

  it('sem relatório nada renderiza (o veredito é o do runner)', () => {
    assert.equal(onScreen(render(createElement(TrackMastery, { mastery: null }))), '');
  });
});
