/**
 * tests/globalBusyIndicator.test.ts — o LOADER GLOBAL de ocupação do shell
 * (ONDA2-LOADER-GLOBAL, pedido do dono: *"quero um loader global fácil de ver
 * e entender"*).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO PROVA
 * ══════════════════════════════════════════════════════════════════════════
 * Sem jsdom (técnica da casa: `react-dom/server` — precedentes
 * tests/shellSidebar.test.ts, tests/quizOverlayRender.test.ts):
 *
 *   BLOCO 1 — GUARDAS DE FONTE (regex no .tsx):
 *     · o App monta o indicador FORA do Shell (sobrevive à troca de aba), no
 *       mesmo nível dos outros globais (QuizOverlayHost, modal de geração);
 *     · a pílula é `position: 'fixed'` com zIndex ACIMA dos overlays (1300 →
 *       1400), e o texto quebra, nunca trunca (SC 1.4.12);
 *     · `role="status"` + `aria-live="polite"` quando há ocupação, e
 *       reduced-motion suprime só o GIRO (movimento), nunca o texto (riscos
 *       1 e 3 do revisor);
 *     · o canal nasce do CONTEXTO de sessão (useSessionState) — nunca de um
 *       segundo store, e NUNCA de `challengeBadgeCount` (risco 2);
 *     · a LessonView publica via a derivação PURA lessonBusyReasonFor e limpa
 *       o canal na desmontagem;
 *     · a chave i18n da divisória do shell é a PRÓPRIA (fim do TEMPORÁRIO da
 *       onda sidebar — contrato cruzado com src/lib/splitRatio.ts).
 *
 *   BLOCO 2 — O COMPONENTE REAL, renderizado com `renderToStaticMarkup`
 *     (ThemeProvider + SessionStateProvider com snapshot inicial REAL):
 *       · com ocupação publicada → presente, `role="status"`, `aria-live`, a
 *         razão canônica em data-attribute e o TEXTO certo, em i18n REAL
 *         (pt-BR e en);
 *       · ociosa → renderiza NADA (string vazia) — some, sem pílula órfã
 *         (FQ10: zero spinner eterno).
 *
 * Reprodução: `bash tools/t.sh tests/globalBusyIndicator.test.ts`
 */
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createElement, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThemeProvider } from '@mui/material/styles';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { theme } from '../src/theme';
import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import en from '../src/i18n/locales/en/translation.json';
import {
  INITIAL_SESSION,
  type SessionBusyReason,
  type SessionSnapshot,
} from '../src/lib/sessionState';
import { SHELL_SPLIT_ARIA_I18N_KEY } from '../src/lib/splitRatio';

// ATENÇÃO ao padrão da casa: componentes .tsx são importados DINAMICAMENTE por
// URL (o tsconfig de tests/ não liga `jsx` — ver shellSidebar.test.ts).
const INDICATOR_MODULE = new URL(
  '../src/components/shell/GlobalBusyIndicator.tsx',
  import.meta.url,
).href;
const PROVIDER_MODULE = new URL(
  '../src/components/sessionState/SessionStateProvider.tsx',
  import.meta.url,
).href;

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_PATH = resolve(HERE, '../src/App.tsx');
const INDICATOR_PATH = resolve(HERE, '../src/components/shell/GlobalBusyIndicator.tsx');
const LESSON_VIEW_PATH = resolve(HERE, '../src/views/LessonView/LessonView.tsx');
const SESSION_STATE_PATH = resolve(HERE, '../src/lib/sessionState.ts');

/** Fonte sem comentários — só o código que realmente roda. */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

type ProviderProps = { children?: ReactNode; initial?: SessionSnapshot };
let GlobalBusyIndicator: ComponentType<Record<string, never>>;
let SessionStateProvider: ComponentType<ProviderProps>;

/** Snapshot com uma ocupação publicada (o resto vazio). */
function snapshotWith(reason: SessionBusyReason): SessionSnapshot {
  return { ...INITIAL_SESSION, busy: { reason } };
}

/**
 * O componente REAL com o provider REAL (o mesmo que o App usa), sob o tema
 * da casa. `lng` troca o idioma do i18next global (restaurado pelo chamador).
 */
function renderIndicator(reason: SessionBusyReason | null): string {
  const initial = reason === null ? { ...INITIAL_SESSION } : snapshotWith(reason);
  return renderToStaticMarkup(
    createElement(
      ThemeProvider,
      { theme },
      createElement(
        SessionStateProvider,
        { initial },
        createElement(GlobalBusyIndicator, {}),
      ),
    ),
  );
}

before(async () => {
  process.env.I18NEXT_NO_SUPPORT_NOTICE = '1';
  await i18next.use(initReactI18next).init({
    lng: 'pt-BR',
    interpolation: { escapeValue: false },
    resources: { 'pt-BR': { translation: ptBR }, en: { translation: en } },
  });
  const indicator = (await import(INDICATOR_MODULE)) as {
    default: ComponentType<Record<string, never>>;
  };
  GlobalBusyIndicator = indicator.default;
  const provider = (await import(PROVIDER_MODULE)) as {
    SessionStateProvider: ComponentType<ProviderProps>;
  };
  SessionStateProvider = provider.SessionStateProvider;
});

/* ═════════════════════════ BLOCO 1 — GUARDAS DE FONTE ═══════════════════ */

describe('1. guardas de fonte — o loader global no shell', () => {
  it('o App monta o indicador FORA do Shell (global — sobrevive à troca de aba)', () => {
    const code = codeOf(readFileSync(APP_PATH, 'utf8'));
    const appPart = code.slice(code.indexOf('export default function App'));
    assert.ok(
      appPart.includes('<GlobalBusyIndicator />'),
      'a montagem precisa estar no App, junto ao QuizOverlayHost e ao modal de geração',
    );
    // E nunca dentro do Shell: os globais da casa (OnboardingHost,
    // ChallengeGenerateModal, QuizOverlayHost) moram todos no App.
    const shellPart = code.slice(0, code.indexOf('export default function App'));
    assert.ok(!shellPart.includes('<GlobalBusyIndicator'), 'o indicador é global, não do Shell');
  });

  it('a pílula é fixa, acima dos overlays e o texto quebra (FQ10 / SC 1.4.12)', () => {
    const code = codeOf(readFileSync(INDICATOR_PATH, 'utf8'));
    assert.match(code, /position:\s*'fixed'/, 'fixa — fora do fluxo de scroll do chat');
    assert.match(code, /zIndex:\s*1400/, 'acima do overlay do quiz e do modal (1300)');
    // FIX DO REVISOR: a pílula mora no canto onde fica o botão ENVIAR do
    // composer (habilitado durante o streaming) — ela é um anúncio, nunca um
    // alvo de ponteiro: pointerEvents 'none' garante que não come cliques.
    assert.match(code, /pointerEvents:\s*'none'/, 'a pílula não intercepta o ponteiro');
    assert.match(code, /overflowWrap/, 'o texto quebra, nunca trunca');
    assert.ok(!code.includes('noWrap'), 'sem nowrap: o texto quebra, nunca recorta');
    assert.match(code, /role="status"/);
    assert.match(code, /aria-live="polite"/);
  });

  it('reduced-motion suprime só o GIRO — a informação (texto) fica (riscos 1 e 3)', () => {
    const code = codeOf(readFileSync(INDICATOR_PATH, 'utf8'));
    assert.match(code, /prefers-reduced-motion/, 'a pílula tem bloco reduced-motion');
    assert.match(code, /animation:\s*'none'/, 'o giro é suprimido');
    assert.ok(
      /role="status"/.test(code) && /overflowWrap/.test(code),
      'o texto do status permanece com o movimento suprimido',
    );
  });

  it('o estado vem do CONTEXTO de sessão — e nunca do badge de desafios (risco 2)', () => {
    const code = codeOf(readFileSync(INDICATOR_PATH, 'utf8'));
    assert.match(code, /useSessionState\(\)/, 'o canal é o de sessão (sessionState.ts)');
    assert.ok(
      !code.includes('challengeBadgeCount'),
      'challengeBadgeCount é GATING DE BADGE, nunca sinal de ocupação',
    );
    const lib = codeOf(readFileSync(SESSION_STATE_PATH, 'utf8'));
    assert.ok(
      !lib.includes('challengeBadgeCount'),
      'a derivação pura também não lê o badge de desafios',
    );
  });

  it('a LessonView publica pela derivação PURA e limpa na desmontagem', () => {
    const view = codeOf(readFileSync(LESSON_VIEW_PATH, 'utf8'));
    assert.match(view, /lessonBusyReasonFor\(/, 'a tabela de prioridade é a função pura');
    assert.match(view, /publishSession\(\{ busy: null \}\)/, 'o cleanup publica null (troca de aba)');
    // O canal de ocupação da LessonView não deriva de gating de badge: o
    // trecho de publicação usa só quizStatus/busy/pendingAction/streaming.
    const publication = view.slice(view.indexOf('lessonBusyReasonFor({'));
    assert.ok(
      !publication.slice(0, publication.indexOf('publishSession({ busy: sessionBusyReason')).includes('challengeBadgeCount'),
      'a publicação não consulta o badge de desafios',
    );
    // FIX DO REVISOR: a regeneração de desafio (generateRunning) É entrada da
    // derivação — sem ela, busy sem pendingAction durante a geração derivava
    // 'concluindo' e o loader global mentia "Concluindo a aula" por minutos.
    assert.match(
      publication.slice(0, publication.indexOf('publishSession({ busy: sessionBusyReason')),
      /regenerating:\s*generateRunning/,
      'a derivação da view distingue regeneração de desafio de conclusão de aula',
    );
  });

  it('a divisória do shell usa a chave i18n PRÓPRIA (fim do rótulo TEMPORÁRIO)', () => {
    const app = codeOf(readFileSync(APP_PATH, 'utf8'));
    assert.match(app, /SHELL_SPLIT_ARIA_I18N_KEY/, 'App.tsx importa a chave própria do splitRatio');
    assert.ok(
      !app.includes("t('translation:shell.session.aria')"),
      'a divisória não deve mais reusar o rótulo do poço de sessão',
    );
    // E a constante aponta para a chave nova (contrato cruzado com os locales).
    assert.equal(SHELL_SPLIT_ARIA_I18N_KEY, 'translation:shell.sidebar.splitAria');
  });
});

/* ═══════════════ BLOCO 2 — O COMPONENTE REAL (SSR) ═══════════════════════ */

describe('2. GlobalBusyIndicator renderizado (o componente real, com tema e i18n)', () => {
  it('ociosa NÃO renderiza a pílula — o indicador some quando nada está em voo', () => {
    const html = renderIndicator(null);
    // O ThemeProvider emite os estilos globais no SSR; o que importa é a
    // PÍLULA não existir no DOM (nem região, nem spinner, nem texto).
    assert.ok(!html.includes('role="status"'), 'sem ocupação, não há região de status');
    assert.ok(!html.includes('data-busy-reason'), 'sem ocupação, não há âncora de razão');
  });

  it('com ocupação: presente, role="status", aria-live e a razão canônica no DOM', () => {
    const html = renderIndicator('responder');
    assert.match(html, /role="status"/);
    assert.match(html, /aria-live="polite"/);
    assert.match(html, /data-busy-reason="responder"/);
  });

  it('cada razão da FQ11 diz O QUE acontece — texto certo, em i18n real (pt-BR)', () => {
    const cases: ReadonlyArray<[SessionBusyReason, string]> = [
      ['responder', ptBR.lesson.busy.responder],
      ['proximaSecao', ptBR.lesson.busy.proximaSecao],
      ['digitando', ptBR.lesson.busy.digitando],
      ['explicando', ptBR.lesson.busy.explicando],
      ['gerando', ptBR.lesson.busy.gerando],
      ['aguardandoVez', ptBR.lesson.busy.aguardandoVez],
      ['concluindo', ptBR.lesson.busy.concluindo],
    ];
    for (const [reason, texto] of cases) {
      const html = renderIndicator(reason);
      assert.ok(
        html.includes(texto),
        `razão ${reason} deve mostrar "${texto}" (recebido: ${html.slice(0, 200)})`,
      );
      // O data-attribute acompanha o texto (âncora estável para e2e).
      assert.ok(
        html.includes(`data-busy-reason="${reason}"`),
        `razão ${reason} deve estar no data-busy-reason`,
      );
    }
  });

  it('o MESMO contrato no locale en (paridade real, não só de chaves)', () => {
    i18next.changeLanguage('en');
    try {
      const html = renderIndicator('aguardandoVez');
      assert.match(html, /role="status"/);
      assert.ok(html.includes(en.lesson.busy.aguardandoVez), 'o texto vem do locale en');
      assert.ok(!html.includes(ptBR.lesson.busy.aguardandoVez), 'não é o texto pt-BR');
      // E a âncora canônica não muda com o idioma.
      assert.match(html, /data-busy-reason="aguardandoVez"/);
    } finally {
      void i18next.changeLanguage('pt-BR');
    }
  });

  it('o giro é ícone aria-hidden — a informação é o texto (nada de "loading" lido)', () => {
    const html = renderIndicator('gerando');
    assert.match(html, /aria-hidden="true"/);
  });
});
