/**
 * src/App.tsx — shell do Study Method em Material UI v9.
 *
 * ─── O QUE MUDOU NA ONDA 2 DO REDESIGN ─────────────────────────────────────
 * O shell era `AppBar` + `Tabs` HORIZONTAIS. Agora é:
 *
 *   ┌──────────────────────────────────────────────────────┐
 *   │  QUADRO DE ESTADO DA SESSÃO  (AppBar = role=banner)   │  ← SessionFrame
 *   ├────────┬─────────────────────────────────────────────┤
 *   │  RAIL  │  view ativa (role=tabpanel)                  │  ← NavigationRail
 *   │ (vert.)│                                              │
 *   └────────┴─────────────────────────────────────────────┘
 *
 * Os dois porquês, com a fonte:
 *   - RAIL: o Material 3 documenta *"Navigation bar if the width or height is
 *     compact… Navigation rail for everything else"*, e uma janela Electron de
 *     desktop é sempre "everything else" (docs/ux-redesign.md §7.2).
 *   - QUADRO SUPERIOR: padrão do HOME Menu do 3DS — estado transitório e global
 *     num quadro à parte ACIMA do conteúdo, chamável sem derrubar o trabalho de
 *     baixo (§1).
 *
 * ─── O QUE **NÃO** MUDOU (e é de propósito) ────────────────────────────────
 * A navegação continua por ESTADO (`useState`, sem router) e os papéis ARIA
 * continuam `tablist`/`tab`/`tabpanel`. Isso não é herança preguiçosa: para um
 * seletor de view sem rota, é o papel correto — e mantém verdes as 13 specs e2e
 * que usam `getByRole('tab')` e as 7 que usam `getByRole('banner')`.
 *
 * ─── POR QUE O `SessionStateProvider` ENVOLVE TUDO ─────────────────────────
 * O shell monta SÓ a view ativa. Enquanto `subject`/`phase` viviam em `useState`
 * local da LessonView, sair da aba Aula desmontava a view e APAGAVA o assunto e
 * a fase — o quadro superior nasceria vazio. O estado de sessão sobe para um
 * contexto acima das views (`src/lib/sessionState.ts`); a LessonView publica
 * nele via `publishSession` (onda 3).
 */
import { useState, type ComponentType, type ReactElement } from 'react';
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
import SessionFrame from './components/shell/SessionFrame';
import { navPanelId, navTabId, type NavKey } from './lib/shellNav';
import { OnboardingHost } from './features/onboarding/OnboardingHost';
import { useStartup } from './gate/AppGate';
// ONDA3 (generate-flow): modal GLOBAL de etapas do "Gerar novo desafio" —
// montado no shell (junto ao OnboardingHost) para sobreviver à navegação.
import { ChallengeGenerateModal } from './components/challenge/ChallengeGenerateModal';

const VIEWS: Record<NavKey, ComponentType<ViewProps>> = {
  home: HomeView,
  settings: SettingsView,
  lesson: LessonView,
  roadmap: RoadmapView,
  challenge: ChallengeView,
};

function Shell({
  active,
  setActive,
}: {
  active: NavKey;
  setActive: (k: NavKey) => void;
}): ReactElement {
  const View = VIEWS[active];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <SessionFrame />

      <Box sx={{ display: 'flex', flexDirection: 'row', flexGrow: 1, minHeight: 0 }}>
        <NavigationRail active={active} onChange={setActive} />

        <Box
          component="main"
          role="tabpanel"
          id={navPanelId(active)}
          aria-labelledby={navTabId(active)}
          sx={{
            // ONDA 1 (layout+a11y): o main vira flex COLUMN para a LessonView
            // poder ocupar 100% da altura (cabeçalho fixo no topo, chat com
            // scroll interno, entrada fixa embaixo). As demais views
            // (Home/Settings/Roadmap/Challenge) seguem com altura de conteúdo:
            // sem flexGrow, o comportamento é idêntico ao do layout de bloco —
            // o `overflow: 'auto'` abaixo continua cobrindo conteúdo mais alto
            // que o painel.
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
      </ChallengeNavProvider>
    </SessionStateProvider>
  );
}
