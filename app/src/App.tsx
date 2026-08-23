/**
 * src/App.tsx — shell do Study Method: sidebar com navegação (Início, Settings,
 * Aula, Desafio) e conteúdo por estado (useState), SEM router. Cada view é um
 * componente do registry src/views/index.ts; as ondas seguintes as preenchem.
 */
import { useState, type ComponentType, type ReactElement } from 'react';
import { HomeView, SettingsView, LessonView, ChallengeView, type ViewProps } from './views';

type NavKey = 'home' | 'settings' | 'lesson' | 'challenge';

const NAV: ReadonlyArray<{ key: NavKey; label: string }> = [
  { key: 'home', label: 'Início' },
  { key: 'settings', label: 'Settings' },
  { key: 'lesson', label: 'Aula' },
  { key: 'challenge', label: 'Desafio' },
];

const VIEWS: Record<NavKey, ComponentType<ViewProps>> = {
  home: HomeView,
  settings: SettingsView,
  lesson: LessonView,
  challenge: ChallengeView,
};

export default function App(): ReactElement {
  const [active, setActive] = useState<NavKey>('home');

  const View = VIEWS[active];

  return (
    <div className="app-shell">
      <nav className="app-shell__sidebar">
        <div className="app-shell__brand">Study Method — Tutor</div>
        {NAV.map((item) => (
          <button
            key={item.key}
            type="button"
            className={
              'app-shell__nav-item' + (active === item.key ? ' is-active' : '')
            }
            aria-current={active === item.key ? 'page' : undefined}
            onClick={() => setActive(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <main className="app-shell__content">
        <View />
      </main>
    </div>
  );
}