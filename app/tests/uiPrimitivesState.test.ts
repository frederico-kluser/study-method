/**
 * tests/uiPrimitivesState.test.ts — o ESTADO dos primitivos de
 * `components/ui/`, sem jsdom.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO PROVA
 * ══════════════════════════════════════════════════════════════════════════
 * O contrato state/view da onda de consolidação: as views de
 * `components/ui/*.tsx` são só props e todo o raciocínio vive nos módulos
 * puros `*.state.ts` (listados à mão em tsconfig.node.json — este projeto
 * compila SEM DOM, e esta é a prova mecânica de que continuam puros).
 *
 *   BLOCO 1 — Pressable.state: o bloco de press copiado 15× (§2) — escala do
 *     token, hover opcional, `tabIndex={-1}` obrigatório e gesto DESLIGADO em
 *     movimento reduzido.
 *   BLOCO 2 — ActionButton.state: o estado ocupado (desliga, `aria-busy`,
 *     spinner) — a regra que estava implícita em dezenas de botões.
 *   BLOCO 3 — ModalScrim.state: o shell do §6 (fixed + scrim + blur +
 *     centrado seguro) com os valores das cópias, as variantes do cartão e a
 *     regra do clique de dispensa.
 *   BLOCO 4 — SectionHeader.state: nível → (variante, componente) — o
 *     outline do documento deixa de saltar.
 *   BLOCO 5 — ConfirmDialog.state: ids ARIA derivados + o travamento do
 *     estado ocupado (as 4 cópias espalhavam estas regras por quatro sítios).
 *   BLOCO 6 — InfoCard.state: informativo/acionável/selecionado com ARIA
 *     honesta e superfícies de paleta (nunca hex).
 *   BLOCO 7 — RetryAlert.state: quando há botão de retry (`action`/`onRetry`:
 *     o erro sem retentativa — ex.: chave inválida — não mostra "Tentar de
 *     novo").
 *
 * Reprodução: `bash tools/t.sh tests/uiPrimitivesState.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { reducedFadeVariants, springs, windowVariants } from '../src/lib/animationTokens';
import { PRESS, Z_INDEX } from '../src/lib/designTokens';
import { actionButtonBusyState } from '../src/components/ui/ActionButton.state';
import {
  MODAL_CARD_PADDING,
  MODAL_SCRIM_BLUR_PX,
  MODAL_SCRIM_PADDING,
  isScrimBackdropClick,
  scrimCardStyle,
  scrimCardVariants,
  scrimShellStyle,
} from '../src/components/ui/ModalScrim.state';
import { pressableMotionState } from '../src/components/ui/Pressable.state';
import { sectionHeadingStyle } from '../src/components/ui/SectionHeader.state';
import {
  confirmDialogActionsState,
  confirmDialogIds,
} from '../src/components/ui/ConfirmDialog.state';
import { infoCardState } from '../src/components/ui/InfoCard.state';
import { retryAlertState } from '../src/components/ui/RetryAlert.state';

describe('ui/Pressable.state — BLOCO 1: o feedback de press (§2)', () => {
  it('o default é a casca das 15 cópias: scale do token, springs.snappy, tabIndex -1', () => {
    const estado = pressableMotionState();
    assert.deepEqual(estado.whileTap, { scale: PRESS.scale });
    assert.equal(estado.whileTap?.scale, 0.98);
    assert.equal(estado.transition, springs.snappy);
    // O fix do framer-motion: a casca nunca é parada de Tab.
    assert.equal(estado.tabIndex, -1);
    assert.deepEqual(estado.style, { display: 'inline-block' });
  });

  it('hover opcional: lift espacial do token (a variante do QuizChatCard)', () => {
    assert.equal(pressableMotionState().whileHover, undefined);
    assert.deepEqual(pressableMotionState({ hover: true }).whileHover, {
      y: -PRESS.hoverLiftPx,
    });
  });

  it('movimento reduzido desliga o GESTO (sem escala, sem lift) — a casca fica', () => {
    const estado = pressableMotionState({ hover: true, reducedMotion: true });
    assert.equal(estado.whileTap, undefined);
    assert.equal(estado.whileHover, undefined);
    assert.equal(estado.tabIndex, -1);
  });
});

describe('ui/ActionButton.state — BLOCO 2: o estado ocupado', () => {
  it('ocioso: nem desligado nem aria-busy', () => {
    const estado = actionButtonBusyState(false, false);
    assert.deepEqual(estado, { disabled: false, busy: undefined, showSpinner: false });
  });

  it('ocupado: desliga, anuncia (aria-busy) e mostra spinner', () => {
    const estado = actionButtonBusyState(true, false);
    assert.equal(estado.disabled, true);
    assert.equal(estado.busy, true);
    assert.equal(estado.showSpinner, true);
  });

  it('o disabled do chamador também desliga (sem spinner, sem anúncio)', () => {
    const estado = actionButtonBusyState(false, true);
    assert.equal(estado.disabled, true);
    assert.equal(estado.busy, undefined);
    assert.equal(estado.showSpinner, false);
  });
});

describe('ui/ModalScrim.state — BLOCO 3: o shell do overlay (§6)', () => {
  it('o shell é fixed + scrim + blur + centrado SEGURO + scroll (a receita copiada)', () => {
    const estilo = scrimShellStyle(Z_INDEX.modal, 'var(--mui-palette-scrim)');
    assert.equal(estilo.position, 'fixed');
    assert.equal(estilo.inset, 0);
    assert.equal(estilo.zIndex, 1300);
    // Centrado seguro: flex-start + margin auto no cartão (§6, ONDA-UX-SCROLL).
    assert.equal(estilo.alignItems, 'flex-start');
    assert.equal(estilo.justifyContent, 'center');
    assert.equal(estilo.overflowY, 'auto');
    assert.equal(estilo.padding, MODAL_SCRIM_PADDING);
    assert.equal(estilo.padding, 16);
    assert.equal(estilo.background, 'var(--mui-palette-scrim)');
    assert.equal(estilo.backdropFilter, `blur(${MODAL_SCRIM_BLUR_PX}px)`);
    assert.equal(estilo.backdropFilter, 'blur(6px)');
    // O MESMO blur no prefixo webkit (as cópias juravam que eram iguais).
    assert.equal(estilo.WebkitBackdropFilter, estilo.backdropFilter);
  });

  it('o cartão: largura total até ao teto, centrado com margin auto', () => {
    assert.deepEqual(scrimCardStyle(520), { width: '100%', maxWidth: 520, margin: 'auto' });
  });

  it('movimento reduzido → fade puro; normal → o ciclo de janela', () => {
    assert.equal(scrimCardVariants(true), reducedFadeVariants);
    assert.equal(scrimCardVariants(false), windowVariants);
  });

  it('o clique dispensa SÓ quando é no próprio scrim (target === currentTarget)', () => {
    const scrim = {};
    const cartao = {};
    assert.equal(isScrimBackdropClick(scrim, scrim), true);
    assert.equal(isScrimBackdropClick(cartao, scrim), false);
    assert.equal(isScrimBackdropClick(null, null), true);
  });

  it('o padding do cartão é o do exemplar (xs 2.5 / sm 3)', () => {
    assert.deepEqual(MODAL_CARD_PADDING, { xs: 2.5, sm: 3 });
  });
});

describe('ui/SectionHeader.state — BLOCO 4: nível → tipografia', () => {
  it('os quatro níveis casam variante (talhe) e componente (semântica)', () => {
    assert.deepEqual(sectionHeadingStyle(1), { variant: 'h4', component: 'h1' });
    assert.deepEqual(sectionHeadingStyle(2), { variant: 'h6', component: 'h2' });
    assert.deepEqual(sectionHeadingStyle(3), { variant: 'subtitle1', component: 'h3' });
    assert.deepEqual(sectionHeadingStyle(4), { variant: 'subtitle2', component: 'h4' });
  });

  it('sem nível, o default é o das cópias (h6 como h2)', () => {
    assert.deepEqual(sectionHeadingStyle(), sectionHeadingStyle(2));
  });

  it('o override de TALHE nunca muda a semântica (o h5/h1 do TrackChallengeHeader)', () => {
    assert.deepEqual(sectionHeadingStyle(1, 'h5'), { variant: 'h5', component: 'h1' });
    assert.deepEqual(sectionHeadingStyle(2, 'h6'), { variant: 'h6', component: 'h2' });
  });
});

describe('ui/ConfirmDialog.state — BLOCO 5: ids ARIA e ocupado (§9)', () => {
  it('os ids derivam da base e casam sempre com o aria-labelledby', () => {
    const ids = confirmDialogIds('r0');
    assert.deepEqual(ids, { titleId: 'r0-title', descriptionId: 'r0-description' });
  });

  it('ocupado trava fechar/cancelar/confirmar — as 4 cópias espalhavam isto', () => {
    assert.deepEqual(confirmDialogActionsState(true), {
      cancelDisabled: true,
      confirmDisabled: true,
      canDismiss: false,
    });
    assert.deepEqual(confirmDialogActionsState(false), {
      cancelDisabled: false,
      confirmDisabled: false,
      canDismiss: true,
    });
  });
});

describe('ui/InfoCard.state — BLOCO 6: informativo/acionável/selecionado (§10)', () => {
  it('informativo: não é acionável, sem aria-pressed, sem hover', () => {
    const estado = infoCardState();
    assert.equal(estado.interactive, false);
    assert.equal(estado.selected, undefined);
    assert.deepEqual(estado.surfaceSx, {});
  });

  it('acionável: botão real com hover de paleta (nunca hex)', () => {
    const estado = infoCardState({ selectable: true });
    assert.equal(estado.interactive, true);
    assert.deepEqual(estado.surfaceSx, { '&:hover': { bgcolor: 'action.hover' } });
  });

  it('selecionado só significa alguma coisa com selectable (aria-pressed honesto)', () => {
    const selecionado = infoCardState({ selectable: true, selected: true });
    assert.equal(selecionado.selected, true);
    assert.deepEqual(selecionado.surfaceSx, { bgcolor: 'action.selected' });

    const mentiroso = infoCardState({ selected: true });
    assert.equal(mentiroso.interactive, false);
    assert.equal(mentiroso.selected, undefined, 'cartão informativo não anuncia pressed');
    assert.deepEqual(mentiroso.surfaceSx, {});
  });

  it('acionável não selecionado anuncia pressed=false (toggle, não botão comum)', () => {
    assert.equal(infoCardState({ selectable: true, selected: false }).selected, false);
  });
});

describe('ui/RetryAlert.state — BLOCO 7: há retry? há descarte? (extensão action/onRetry/onClose)', () => {
  it('default preserva o comportamento original: com onRetry há botão', () => {
    assert.equal(retryAlertState({ onRetry: () => {} }).showRetry, true);
    assert.equal(retryAlertState({ action: true, onRetry: () => {} }).showRetry, true);
  });

  it('action: false NUNCA mostra o botão (o erro de chave não tem retentativa)', () => {
    assert.equal(retryAlertState({ action: false, onRetry: () => {} }).showRetry, false);
    assert.equal(retryAlertState({ action: false }).showRetry, false);
  });

  it('sem onRetry não há botão — um retry que não faz nada é mentira', () => {
    assert.equal(retryAlertState({}).showRetry, false);
    assert.equal(retryAlertState({ action: true }).showRetry, false);
  });

  it('EXTENSÃO: sem onClose não há × — um descarte que não descarta é mentira', () => {
    assert.equal(retryAlertState({}).showDismiss, false);
    assert.equal(retryAlertState({ onRetry: () => {} }).showDismiss, false);
    assert.equal(retryAlertState({ onClose: () => {} }).showDismiss, true);
  });

  it('EXTENSÃO: retry e × são MUTUAMENTE EXCLUSIVOS (regra do MUI v9, preservada)', () => {
    // `Alert.js`: `action == null && onClose` — com ação em cena o × não é
    // desenhado. É o comportamento de HOJE dos três Alerts da aula (a cópia do
    // erro do tutor dizia-o: "sem receita, só o fechar de sempre") e esta
    // decisão expõe a regra em vez de entregar um `onClose` morto ao MUI.
    assert.deepEqual(retryAlertState({ onRetry: () => {}, onClose: () => {} }), {
      showRetry: true,
      showDismiss: false,
    });
    // `action: false` desliga o retry e o × volta a ser possível.
    assert.deepEqual(retryAlertState({ action: false, onRetry: () => {}, onClose: () => {} }), {
      showRetry: false,
      showDismiss: true,
    });
  });
});
