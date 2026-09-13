/**
 * src/App.tsx — shell do Study Method em Material UI v9.
 *
 * ─── O QUE MUDOU NA ONDA-SIDEBAR (pedido do dono, verbatim) ────────────────
 * *"quero que ajuste nosso header para ser uma coluna ali lado da aula, que
 * nem o vscode tem a área dos arquivos e a área do código, assim tenho mais
 * espaço vertical e essa área que quero movimentar para aumentar ou diminuir
 * o espaço de texto horizontal será esse sidebar"*.
 *
 * O quadro de estado da sessão saiu do TOPO (AppBar horizontal roubando uma
 * fileira de altura do conteúdo) e virou COLUNA LATERAL entre o rail e o main
 * — o arranjo do VSCode (área de arquivos ⟷ área de código):
 *
 *   ┌──────┬─────────┬─┬──────────────────────────────────────────────┐
 *   │ RAIL │ SESSION │÷│  view ativa (role=tabpanel)                  │
 *   │(vert)│ SIDEBAR │÷│                                               │
 *   └──────┴─────────┴─┴──────────────────────────────────────────────┘
 *
 * A largura da sidebar é controlada pela DIVISÓRIA ARRASTÁVEL (SplitDivider):
 * ponteiro com setPointerCapture, teclado APG completo (nextRatioForKey),
 * `role="separator"` com fronteiras ARIA efetivas e razão persistida em
 * `localStorage` (SHELL_SPLIT_RATIO_STORAGE_KEY — chave PRÓPRIA, distinta da
 * do Desafio, para as duas divisórias não brigarem pela mesma memória). Toda a
 * aritmética é a de src/lib/splitRatio.ts (pura e testada), com as constantes
 * SHELL_SPLIT_CONSTRAINTS (piso em px por painel — nem a sidebar nem o main
 * somem).
 *
 * ─── O QUE **NÃO** MUDOU (e é de propósito) ────────────────────────────────
 * A navegação continua por ESTADO (`useState`, sem router); os papéis ARIA
 * continuam `tablist`/`tab`/`tabpanel`; a SessionSidebar CONTINUA SENDO o
 * `<AppBar>` (`role="banner"` implícito em `<header>`) — 13 specs e2e usam
 * `getByRole('tab')` e 7 usam `getByRole('banner')`. O `main` continua
 * `role="tabpanel"` com o id/aria-labelledby de navPanelId/navTabId. Só a
 * GEOMETRIA mudou.
 *
 * ─── RAIL CONTINUA FORA DO SPLIT ───────────────────────────────────────────
 * O Material 3 documenta *"Navigation bar if the width or height is compact…
 * Navigation rail for everything else"* e uma janela Electron de desktop é
 * sempre "everything else" (docs/ux-redesign.md §7.2). O rail é chrome de
 * largura FIXA (104px): a razão da divisória é sobre o espaço REDISTRIBUÍVEL
 * (sidebar + divisória + main), não sobre a janela inteira.
 *
 * ─── O SLOT DA VIEW ATIVA NO SIDEBAR (onda1-sidebar-slot) ───────────────────
 * Queixa do dono sobre a coluna, verbatim: *"a informação dele nunca muda"*.
 * A coluna ganhou um CONTÊINER-SLOT (no SessionFrame) onde a view ativa
 * publica o próprio conteúdo por portal (src/components/shell/ShellSidebarSlot
 * — o cabeçalho de cada aula é o primeiro inquilino). O shell é só o
 * CARTEIRO: guarda o nó DOM do slot em estado (`sidebarSlotEl`, alimentado
 * pelo callback ref `slotRef`) e o publica em `ShellSidebarSlotContext`. O
 * Provider envolve o SessionFrame E o `main` — a view ativa, que mora no
 * `main`, é quem lê. Nenhuma prop de aula atravessa o App, e trocar de aba
 * desmonta a view e esvazia o slot sozinho.
 *
 * ─── POR QUE O `SessionStateProvider` ENVOLVE TUDO ─────────────────────────
 * O shell monta SÓ a view ativa. Enquanto `subject`/`phase` viviam em `useState`
 * local da LessonView, sair da aba Aula desmontava a view e APAGAVA o assunto e
 * a fase — o quadro nasceria vazio. O estado de sessão sobe para um
 * contexto acima das views (`src/lib/sessionState.ts`); a LessonView publica
 * nele via `publishSession` (onda 3).
 */
import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import {
  HomeView,
  SettingsView,
  LessonView,
  RoadmapView,
  ChallengeView,
  type ViewProps,
} from './views';
import { ChallengeNavProvider } from './components/challengeNav/ChallengeNavProvider';
import { SessionStateProvider } from './components/sessionState/SessionStateProvider';
import NavigationRail from './components/shell/NavigationRail';
// ONDA-SIDEBAR: o quadro de sessão virou COLUNA (SessionFrame) e a largura
// dele é controlada pela divisória arrastável (SplitDivider), com toda a
// matemática vinda de src/lib/splitRatio.ts.
import SessionFrame from './components/shell/SessionFrame';
import SplitDivider from './components/shell/SplitDivider';
// ONDA1-SIDEBAR-SLOT: o contexto que carrega o nó DOM do slot da view ativa
// (o contêiner vive no SessionFrame; a view publica nele por portal).
import { ShellSidebarSlotContext } from './components/shell/ShellSidebarSlot';
import {
  readShellSplitRatio,
  ratioToPx,
  SHELL_SIDEBAR_PANE_ID,
  SHELL_SPLIT_ARIA_I18N_KEY,
  SHELL_SPLIT_CONSTRAINTS,
  SHELL_SPLIT_DIVIDER_ID,
  writeShellSplitRatio,
} from './lib/splitRatio';
import { navPanelId, navTabId, type NavKey } from './lib/shellNav';
import { OnboardingHost } from './features/onboarding/OnboardingHost';
import { useStartup } from './gate/AppGate';
// ONDA3 (generate-flow): modal GLOBAL de etapas do "Gerar novo desafio" —
// montado no shell (junto ao OnboardingHost) para sobreviver à navegação.
import { ChallengeGenerateModal } from './components/challenge/ChallengeGenerateModal';
// ONDA2-QUIZ-OVERLAY (pedido do dono: "o layout do quiz deve ser sobre a tela e
// respondendo ele minimiza para ficar no chat"): o overlay do quiz é montado
// no shell pelo MESMO motivo do modal acima — o shell monta só a view ativa, e
// um quiz minimizado precisa sobreviver à troca de aba. A fase vive em
// src/lib/quizOverlayState.ts (módulo) e o conteúdo é publicado pela
// LessonView em src/components/quiz/quizOverlayContent.ts.
import { QuizOverlayHost } from './components/quiz/QuizOverlayHost';
// ONDA2-LOADER-GLOBAL (pedido do dono: "quero um loader global fácil de ver e
// entender"): a pílula fixa de ocupação, SEMPRE montada no shell — sobrevive à
// navegação de abas e flutua acima do overlay do quiz (zIndex 1400 > 1300).
// O estado chega pelo MESMO canal de contexto que alimenta a SessionSidebar
// (src/lib/sessionState.ts, campo `busy`), publicado pela LessonView.
import GlobalBusyIndicator from './components/shell/GlobalBusyIndicator';

const VIEWS: Record<NavKey, ComponentType<ViewProps>> = {
  home: HomeView,
  settings: SettingsView,
  lesson: LessonView,
  roadmap: RoadmapView,
  challenge: ChallengeView,
};

/**
 * Largura inicial da sidebar ANTES de o contêiner ser medido (px). É o desejo
 * do dono (~240-266px de coluna em janelas de desktop comuns); no primeiro
 * frame do ResizeObserver ela passa a ser `razão × contêiner` clampado.
 */
const SIDEBAR_PREMEASURE_PX = 240;

/** Id do span da dica da divisória (consumido por `aria-describedby`). */
const SHELL_SPLIT_HINT_ID = 'shell-split-divider-hint';

function Shell({
  active,
  setActive,
}: {
  active: NavKey;
  setActive: (k: NavKey) => void;
}): ReactElement {
  const { t } = useTranslation();
  const View = VIEWS[active];

  // ── Divisória sidebar ⟷ main ────────────────────────────────────────────
  // A razão é do painel LÍDER (a sidebar) e é PERSISTIDA COMO RAZÃO, nunca em
  // px (decisão 2 de splitRatio.ts: janela muda de tamanho entre sessões, px
  // guardado volta errado). A leitura é tolerante a lixo e cai no default.
  const [ratio, setRatio] = useState<number>(() => readShellSplitRatio());
  const [containerPx, setContainerPx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Medição do contêiner (sidebar + divisória + main) — a matemática do split
  // precisa do eixo INTEIRO em px para os pisos por painel. ResizeObserver, e
  // não `window.resize`: a largura do contêiner muda sempre que o flex
  // rearranja, não só quando a janela muda.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (typeof width === 'number' && Number.isFinite(width) && width > 0) {
        setContainerPx(width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Persistência com uma ÚNICA porta de saída: gravamos quando NÃO estamos
  // arrastando (passo de teclado grava na hora; arraste grava quando o
  // `dragging` volta a false, com o valor FINAL da razão). O
  // writeShellSplitRatio é silencioso por desenho — quota/modo privado nunca
  // derrubam o arraste.
  useEffect(() => {
    if (dragging) return;
    writeShellSplitRatio(ratio);
  }, [ratio, dragging]);

  const handleRatioChange = useCallback((next: number) => {
    setRatio(next);
  }, []);

  const handleDragStart = useCallback(() => setDragging(true), []);
  const handleDragEnd = useCallback(() => setDragging(false), []);

  // ── Slot da view ativa no sidebar (onda1-sidebar-slot) ──────────────────
  // O nó DOM do contêiner-slot do SessionFrame, entregue pelo callback ref.
  // ESTADO (e não useRef) de propósito: quando o nó chega, o Provider abaixo
  // precisa re-renderizar para a view ativa enxergar o slot e o portal dela
  // pintar na coluna. O setter do useState é estável — serve de callback ref
  // sem re-disparar a cada render. `null` no primeiro render e no SSR (o
  // portal então não renderiza nada).
  const [sidebarSlotEl, setSidebarSlotEl] = useState<HTMLElement | null>(null);

  const px = ratioToPx(ratio, containerPx, SHELL_SPLIT_CONSTRAINTS);
  // Contêiner ainda não medido: a sidebar nasce com o px de desejo em vez de
  // 0 (ratioToPx devolve 0 quando não há medida — e uma coluna de 0px
  // piscaria no primeiro frame).
  const sidebarBasisPx = containerPx > 0 ? px.primaryPx : SIDEBAR_PREMEASURE_PX;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'row', height: '100%', minHeight: 0 }}>
      <NavigationRail active={active} onChange={setActive} />

      {/* Contêiner do SPLIT: a matemática de splitRatio mede ESTE box (sidebar
          + divisória + main). O rail fica FORA — é largura fixa de chrome, e a
          razão é sobre o espaço redistribuível. */}
      <Box
        ref={containerRef}
        sx={{ display: 'flex', flexDirection: 'row', flexGrow: 1, minWidth: 0 }}
      >
        {/* ONDA1-SIDEBAR-SLOT: o Provider do slot envolve a coluna E o `main`
            (a view ativa lê o contexto de dentro do `main`). Contexto não
            renderiza DOM — o flex do split continua vendo exatamente
            sidebar + divisória + main como filhos. */}
        <ShellSidebarSlotContext.Provider value={sidebarSlotEl}>
          <SessionFrame
            basisPx={sidebarBasisPx}
            animateBasis={!dragging}
            slotRef={setSidebarSlotEl}
          />

          <SplitDivider
            ratio={ratio}
            containerPx={containerPx}
            constraints={SHELL_SPLIT_CONSTRAINTS}
            onRatioChange={handleRatioChange}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            ariaLabel={t(SHELL_SPLIT_ARIA_I18N_KEY)}
            hint={t('translation:challenge.split.hint')}
            hintId={SHELL_SPLIT_HINT_ID}
            controlsIds={[SHELL_SIDEBAR_PANE_ID, navPanelId(active)]}
            dividerId={SHELL_SPLIT_DIVIDER_ID}
          />

          <Box
            component="main"
            role="tabpanel"
            id={navPanelId(active)}
            aria-labelledby={navTabId(active)}
            sx={{
              // ONDA 1 (layout+a11y): o main vira flex COLUMN para a LessonView
              // poder ocupar 100% da altura: chat com scroll interno e entrada
              // fixa embaixo. O cabeçalho da aula mora no sidebar do shell,
              // publicado pela LessonView por portal. As demais views
              // (Home/Settings/Roadmap/Challenge) seguem com altura de conteúdo:
              // sem flexGrow, o comportamento é idêntico ao do layout de bloco —
              // o `overflow: 'auto'` abaixo continua cobrindo conteúdo mais alto
              // que o painel. ONDA-SIDEBAR: a LARGURA agora é variável (a
              // geometria horizontal é da divisória); `minWidth: 0` deixa a
              // coluna encolher até o piso efetivo sem estourar o flex — as
              // views são flexíveis e nenhum conteúdo trunca (SC 1.4.12).
              display: 'flex',
              flexDirection: 'column',
              flexGrow: 1,
              minWidth: 0,
              overflow: 'auto',
              p: { xs: 2, sm: 3, md: 4 },
            }}
          >
            <View onNavigate={setActive} />
          </Box>
        </ShellSidebarSlotContext.Provider>
      </Box>
    </Box>
  );
}

export default function App(): ReactElement {
  const [active, setActive] = useState<NavKey>('home');
  // O App roda DENTRO do StartupCtx.Provider (ver AppGate). Só liberamos o
  // onboarding quando o gate está 'ready' (app destravado, não 'offline').
  const startup = useStartup();
  const isReady = startup.status?.phase === 'ready';
  return (
    <SessionStateProvider>
      <ChallengeNavProvider
        onNavigateChallenge={() => setActive('challenge')}
        // ONDA2 (error-flow): o desafio de aula que FALHOU fecha e o chat da
        // aula reabre com a bolha de erro — o painel navega de volta à aba Aula.
        onNavigateLesson={() => setActive('lesson')}
      >
        <Shell active={active} setActive={setActive} />
        <OnboardingHost isReady={isReady} activeView={active} onNavigateView={setActive} />
        {/* ONDA3 (generate-flow): SEMPRE montado — o processo de geração
            sobrevive à navegação (store module-level + listener no modal). */}
        <ChallengeGenerateModal />
        {/* ONDA2-QUIZ-OVERLAY: SEMPRE montado — o AnimatePresence com a
            condicional DENTRO do componente (se ele retornasse null, o exit
            do "minimizar" não animaria). */}
        <QuizOverlayHost />
        {/* ONDA2-LOADER-GLOBAL: SEMPRE montado — o indicador é GLOBAL
            (sobrevive à troca de abas, mora FORA do Shell) e flutua acima do
            overlay do quiz. O canal `busy` vem do contexto de sessão, que
            envolve tudo (SessionStateProvider acima). */}
        <GlobalBusyIndicator />
      </ChallengeNavProvider>
    </SessionStateProvider>
  );
}