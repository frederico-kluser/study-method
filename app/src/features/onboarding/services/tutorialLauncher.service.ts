/**
 * src/features/onboarding/services/tutorialLauncher.service.ts
 *
 * LANÇADOR GLOBAL do tutorial — a ponte entre o botão de ajuda do shell e o
 * dono do estado do tutorial.
 *
 * ─── POR QUE UM SERVIÇO DE MÓDULO (e não contexto React) ───────────────────
 * O `OnboardingHost` (dono do estado: `useOnboarding`, oferta first-run, modal
 * de seleção) é IRMÃO do `Shell` na árvore do App — o provider dele não
 * alcança a `SessionFrame`, onde o botão de ajuda vive. O
 * `useOnboardingController` (contexto) continua existindo para quem estiver
 * DENTRO do host, mas ele tem fallback silencioso (`openFromHelp` vira no-op
 * fora do provider) e um botão de ajuda que não faz nada seria a promessa
 * quebrada outra vez. Em vez de subir o provider até o App (refactor que
 * tocava toda a árvore e as specs de render), o host REGISTA aqui a função de
 * abertura e qualquer componente chama `tutorialLauncherService.openSelection()`.
 * É o mesmo padrão store-de-módulo já usado neste projeto
 * (challengeGenerateStore, quizOverlayState).
 *
 * ─── SEMÂNTICA ─────────────────────────────────────────────────────────────
 * `openSelection()` abre o MODAL DE SELEÇÃO (Quick Start ⟷ Tutorial Completo) —
 * o mesmo da primeira execução — em vez de recomeçar o tutorial completo às
 * cegas: quem reabre pelo botão de ajuda pode estar atrás do tour curto. O
 * `openFromHelp()` (recomeço do zero) fica registrado à parte para quem quiser
 * o reset total. Sem host montado (fora do App, testes), os dois devolvem
 * `false` e NÃO lançam — o botão nunca quebra a UI por falta de registro.
 *
 * Testado em tests/tutorialLauncher.test.ts (node:test, sem jsdom).
 */

/** Abre o modal de seleção de tutorial. */
export type TutorialSelectionOpener = () => void;
/** Recomeça o tutorial do zero (reset total do progresso). */
export type TutorialRestartOpener = () => void;

interface TutorialOpeners {
  openSelection: TutorialSelectionOpener;
  restart: TutorialRestartOpener;
}

let registered: TutorialOpeners | null = null;

export const tutorialLauncherService = {
  /**
   * Regista os abridores do host. Sobrescreve o registo anterior (última
   * montagem do host vence — em StrictMode/dupla montagem o cleanup devolve o
   * estado a `null` antes do re-registo).
   */
  register(openers: TutorialOpeners): void {
    registered = openers;
  },

  /** Remove o registo (cleanup de efeito). Só remove o registo atual. */
  unregister(openers?: TutorialOpeners): void {
    if (!openers || registered === openers) {
      registered = null;
    }
  },

  /** True quando há um host montado a servir o tutorial. */
  isRegistered(): boolean {
    return registered !== null;
  },

  /** Abre o modal de seleção. Devolve `false` (sem lançar) sem host montado. */
  openSelection(): boolean {
    if (!registered) return false;
    registered.openSelection();
    return true;
  },

  /** Recomeça o tutorial completo do zero. `false` sem host montado. */
  restart(): boolean {
    if (!registered) return false;
    registered.restart();
    return true;
  },
};
