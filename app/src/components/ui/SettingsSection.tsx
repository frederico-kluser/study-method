/**
 * components/ui/SettingsSection.tsx — o bloco de secção de Configurações
 * (auditoria de layout §8): `<section aria-labelledby>` + título `h6` +
 * descrição.
 *
 * Estava copiado 5× só em Settings (SettingsView ×3, ProgressPanel,
 * OrphanTracksPanel), sempre com a mesma estrutura e a mesma descrição
 * `body2` secundária. O `data-onboarding-target` de três das cópias (o alvo
 * que o tutorial usa para apontar) é prop aqui, para a migração o manter.
 *
 * VIEW PURA: só props (o `useId` é determinístico, sem estado). O cabeçalho é
 * o primitivo `SectionHeader`; o `aria-labelledby` aponta para o id do título,
 * que este componente gera quando o chamador não o dá.
 */
import { useId, type ReactElement, ReactNode } from 'react';

import { SectionHeader } from './SectionHeader';
import type { SectionHeadingLevel } from './SectionHeader.state';

export interface SettingsSectionProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly children?: ReactNode;
  /** Nível semântico do título — 2 por omissão (o das cópias de Settings). */
  readonly level?: SectionHeadingLevel;
  /** Id do `<section>` (ancoragem/testes) — gerado se omitido. */
  readonly id?: string;
  /** Alvo do tutorial (`data-onboarding-target` das cópias de Settings). */
  readonly onboardingTarget?: string;
}

export function SettingsSection({
  title,
  description,
  children,
  level = 2,
  id,
  onboardingTarget,
}: SettingsSectionProps): ReactElement {
  const gerado = useId();
  const sectionId = id ?? `settings-section-${gerado}`;
  const titleId = `${sectionId}-title`;

  return (
    <section aria-labelledby={titleId} id={sectionId} data-onboarding-target={onboardingTarget}>
      <SectionHeader title={title} description={description} level={level} titleId={titleId} />
      {children}
    </section>
  );
}
