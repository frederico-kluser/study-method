/**
 * src/views/placeholders.tsx — implementação JSX das views do shell.
 * Vive num arquivo .tsx (JSX exige extensão .tsx); o registry `views/index.ts`
 * reexporta estes componentes para o shell.
 */
import type { ReactElement } from 'react';

export interface ViewProps {
  /** Caminho do setup de estudo ativo (quando houver), vazio caso contrário. */
  setupsDir?: string;
}

function PlaceholderCard({ title }: { title: string }): ReactElement {
  return (
    <section className="placeholder" data-testid={`view-${title.toLowerCase()}`}>
      <span className="placeholder__badge">onda 1 — scaffold</span>
      <h2 className="placeholder__title">{title}</h2>
      <p className="placeholder__body">Em construção — chega na onda 3.</p>
    </section>
  );
}

/** View inicial (Início) — resumo do tutor. */
export function HomeView(props: ViewProps): ReactElement {
  return (
    <section className="home">
      <h1 className="home__title">Study Method — Tutor</h1>
      <p className="home__body">
        Aprenda programação e a matemática que aparece nela por meio de código executável, com
        aula, analogia, visualização e desafio validado por teste. A GUI chega por ondas; navegue
        pelas abas à esquerda.
      </p>
      {props.setupsDir ? (
        <p className="home__hint">Setup ativo: {props.setupsDir}</p>
      ) : (
        <p className="home__hint">Nenhum setup configurado ainda.</p>
      )}
    </section>
  );
}

export function SettingsView(props: ViewProps): ReactElement {
  return <PlaceholderCard title="Settings" />;
}

export function LessonView(props: ViewProps): ReactElement {
  return <PlaceholderCard title="Aula" />;
}

export function ChallengeView(props: ViewProps): ReactElement {
  return <PlaceholderCard title="Desafio" />;
}