/**
 * src/components/shell/SplitDivider.stories.helpers.tsx — apoio das histórias
 * da SplitDivider. NÃO é história (o glob do catálogo só apanha
 * `*.stories.tsx`) e NÃO é produto: nada daqui é importado pelo app.
 *
 * Duas peças:
 *
 *   1. `SplitDemo` — o arranjo REAL em que a divisória vive no app (App.tsx):
 *      painel líder (barra lateral) ⟷ divisória ⟷ painel principal, com o
 *      contêiner medido por ResizeObserver (o `ratioFromPointer` precisa da
 *      largura do eixo em px), as restrições do SHELL (`SHELL_SPLIT_CONSTRAINTS`)
 *      e as chaves i18n PRÓPRIAS do shell (`shell.sidebar.splitAria` /
 *      `shell.sidebar.splitHint`). A persistência NÃO entra: é do shell, não
 *      da divisória (o `SplitDivider` só devolve razões).
 *
 *   2. `installPointerCaptureShim` — a única licença de ambiente destas
 *      histórias, no mesmo espírito do `installMockApi` do catálogo.
 *
 *      PORQUÊ: `SplitDivider.handlePointerDown` chama
 *      `setPointerCapture(pointerId)` e a especificação do DOM lança
 *      `NotFoundError` quando o `pointerId` não corresponde a um ponteiro
 *      ATIVO do navegador. Os eventos dos `play` são SINTÉTICOS (o
 *      `userEvent` do `storybook/test` despacha `new PointerEvent(...)`) e
 *      nunca registam ponteiro ativo — medido com Chromium: ponteiro real →
 *      capture ok; evento sintético → `NotFoundError` e o handler morre a
 *      meio (sem `data-dragging`, sem `onDragStart`, sem arraste). O shim
 *      substitui SÓ os três métodos de captura por um registo equivalente —
 *      com ponteiro de verdade (um humano a arrastar no browser) o método
 *      original é chamado primeiro e o comportamento é o de produção.
 */
import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

import {
  DEFAULT_SHELL_SPLIT_RATIO,
  SHELL_SIDEBAR_PANE_ID,
  SHELL_SPLIT_ARIA_I18N_KEY,
  SHELL_SPLIT_CONSTRAINTS,
  SHELL_SPLIT_DIVIDER_ID,
  SHELL_SPLIT_HINT_I18N_KEY,
  ratioToPx,
} from '../../lib/splitRatio';
import SplitDivider from './SplitDivider';

/** Id do painel principal do DEMO (o segundo id do `aria-controls`). */
export const SPLIT_DEMO_MAIN_PANE_ID = 'shell-split-demo-main';

/** Id da dica do demo — o mesmo papel do `SHELL_SPLIT_HINT_ID` do App. */
const SPLIT_DEMO_HINT_ID = 'shell-split-demo-hint';

/** Geometria crua que o shim regista por elemento (o capture do DOM). */
interface CaptureMethods {
  setPointerCapture(pointerId: number): void;
  releasePointerCapture(pointerId: number): void;
  hasPointerCapture(pointerId: number): boolean;
}

/**
 * Shim de captura de ponteiro para as histórias (ver o cabeçalho do ficheiro).
 * Devolve a função de DESINSTALAR — chamada na desmontagem do demo, para que
 * nenhuma história deixe o `Element.prototype` mexido para a seguinte.
 */
export function installPointerCaptureShim(): () => void {
  const proto = Element.prototype as unknown as CaptureMethods;
  const originalSet = proto.setPointerCapture;
  const originalRelease = proto.releasePointerCapture;
  const originalHas = proto.hasPointerCapture;
  const captured = new Map<Element, number>();

  proto.setPointerCapture = function setPointerCapture(this: Element, pointerId: number): void {
    try {
      originalSet.call(this, pointerId);
    } catch {
      /* sem ponteiro ativo (eventos sintéticos dos play) — o registo chega */
    }
    captured.set(this, pointerId);
  };
  proto.releasePointerCapture = function releasePointerCapture(this: Element, pointerId: number): void {
    try {
      originalRelease.call(this, pointerId);
    } catch {
      /* idem */
    }
    if (captured.get(this) === pointerId) captured.delete(this);
  };
  proto.hasPointerCapture = function hasPointerCapture(this: Element, pointerId: number): boolean {
    return captured.get(this) === pointerId || originalHas.call(this, pointerId);
  };

  return function uninstallPointerCaptureShim(): void {
    captured.clear();
    proto.setPointerCapture = originalSet;
    proto.releasePointerCapture = originalRelease;
    proto.hasPointerCapture = originalHas;
  };
}

export interface SplitDemoProps {
  /** Razão inicial do painel líder (a barra lateral do shell). */
  initialRatio?: number;
  /** Regista cada razão produzida (arraste/teclado) — as histórias usam `fn()`. */
  onRatioChange?: (ratio: number) => void;
  /** O arraste começou — as histórias registam em `fn()`. */
  onDragStart?: () => void;
  /** O arraste acabou. */
  onDragEnd?: () => void;
  /** Rótulo/dica — por omissão as chaves PRÓPRIAS do shell (as do App.tsx). */
  ariaLabel?: string;
  hint?: string;
  /**
   * Medir o contêiner (ResizeObserver, como o app). `false` congela o estado
   * de PRIMEIRO FRAME (`containerPx = 0`), que é o que a divisória mostra
   * antes da primeira medição.
   */
  measure?: boolean;
  /** Conteúdo do painel principal (à direita da divisória). */
  children?: ReactNode;
}

/**
 * O arranjo de split do shell, redimensionável pela divisória real. A barra
 * (esquerda) e o `main` (direita) são painéis de demonstração com os MESMOS
 * papéis/ids do app — o que se documenta é a divisória, não as views.
 */
export function SplitDemo({
  initialRatio = DEFAULT_SHELL_SPLIT_RATIO,
  onRatioChange,
  onDragStart,
  onDragEnd,
  ariaLabel,
  hint,
  measure = true,
  children,
}: SplitDemoProps): ReactElement {
  const { t } = useTranslation();
  const [ratio, setRatio] = useState(initialRatio);
  const [containerPx, setContainerPx] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // O controle `ratio` da história mexe na razão ao vivo (args → estado); o
  // arraste/teclado continuam donos dela enquanto o argumento não muda.
  useEffect(() => {
    setRatio(initialRatio);
  }, [initialRatio]);

  // Medição do eixo inteiro (sidebar + divisória + main) — a MESMA receita do
  // App.tsx: sem ela o `ratioFromPointer` mapeia contra 0px e o arraste não
  // anda.
  useEffect(() => {
    if (!measure) return;
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
  }, [measure]);

  // O shim de captura (só para os `play` — ver o cabeçalho do ficheiro).
  useEffect(() => installPointerCaptureShim(), []);

  const handleRatioChange = useCallback(
    (next: number) => {
      setRatio(next);
      onRatioChange?.(next);
    },
    [onRatioChange],
  );

  const px = ratioToPx(ratio, containerPx, SHELL_SPLIT_CONSTRAINTS);
  // Antes da primeira medição a barra nasce com o px de desejo (mesma regra do
  // App.tsx: `ratioToPx` devolve 0 sem medida e a coluna piscaria).
  const sidebarBasisPx = containerPx > 0 ? px.primaryPx : 240;

  return (
    <Box
      ref={containerRef}
      sx={{
        display: 'flex',
        flexDirection: 'row',
        width: '100%',
        height: '100%',
        minWidth: 0,
      }}
    >
      <Box
        id={SHELL_SIDEBAR_PANE_ID}
        sx={(theme) => ({
          flex: `0 0 ${sidebarBasisPx}px`,
          width: sidebarBasisPx,
          minWidth: 0,
          overflow: 'hidden',
          padding: theme.spacing(1.5),
          backgroundColor: theme.vars.palette.surface.level3,
          color: theme.vars.palette.text.secondary,
          borderRight: `1px solid ${theme.vars.palette.divider}`,
        })}
      >
        <Typography variant="caption">Barra lateral do shell</Typography>
      </Box>

      <SplitDivider
        ratio={ratio}
        containerPx={containerPx}
        constraints={SHELL_SPLIT_CONSTRAINTS}
        onRatioChange={handleRatioChange}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        ariaLabel={ariaLabel ?? t(SHELL_SPLIT_ARIA_I18N_KEY)}
        hint={hint ?? t(SHELL_SPLIT_HINT_I18N_KEY)}
        hintId={SPLIT_DEMO_HINT_ID}
        controlsIds={[SHELL_SIDEBAR_PANE_ID, SPLIT_DEMO_MAIN_PANE_ID]}
        dividerId={SHELL_SPLIT_DIVIDER_ID}
      />

      <Box
        id={SPLIT_DEMO_MAIN_PANE_ID}
        sx={(theme) => ({
          flexGrow: 1,
          minWidth: 0,
          padding: theme.spacing(2),
          backgroundColor: theme.vars.palette.background.paper,
          color: theme.vars.palette.text.primary,
        })}
      >
        {children ?? (
          <Typography variant="body2">
            Área principal (o `main` do shell) — cresce/encolhe com a divisória.
          </Typography>
        )}
      </Box>
    </Box>
  );
}