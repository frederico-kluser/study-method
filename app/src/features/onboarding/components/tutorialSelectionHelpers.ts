/**
 * src/features/onboarding/components/tutorialSelectionHelpers.ts
 *
 * Helpers PUROS do TutorialSelectionModal — testáveis sem jsdom/DOM.
 *
 * ACHADO-2: o CTA "Configurar chaves" vivia DENTRO de um `<Button disabled>`,
 * que SUPRIME clicks dos descendentes. Além de mover o CTA para fora do botão
 * desabilitado, o callback de navegação foi extraído para esta função pura,
 * coberta por teste unitário.
 */

/** Fecha o modal e navega para a aba Settings (callback do CTA "Configurar chaves"). */
export function createOpenSettingsHandler(
  onClose: () => void,
  onOpenSettings: () => void,
): () => void {
  return () => {
    onClose();
    onOpenSettings();
  };
}