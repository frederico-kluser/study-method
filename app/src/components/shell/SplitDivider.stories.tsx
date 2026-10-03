/**
 * src/components/shell/SplitDivider.stories.tsx — Componentes/Shell/SplitDivider.
 *
 * A divisória arrastável do shell (barra lateral ⟷ `main`): o contrato APG
 * "Window Splitter" inteiro, no arranjo REAL em que vive (o `SplitDemo` de
 * `SplitDivider.stories.helpers.tsx` é o split do App.tsx — painéis medidos,
 * restrições do shell, chaves i18n próprias — com a persistência de fora,
 * porque a divisória não persiste nada: só devolve razões).
 *
 * POR QUE `render` AQUI (STORY-SPEC §3): a SplitDivider é CONTROLADA
 * (`ratio` + `onRatioChange`) e mede o contêiner pelo elemento pai — `args`
 * sozinhos não a sustentam num canvas com dimensões. O `render` é composição
 * (a mesma do app), nunca maquilhagem: sem layout decorativo à volta, os
 * painéis são os papéis reais (`role="separator"` controla os dois).
 *
 * ESTADOS DOCUMENTADOS:
 *   · `Normal` — repouso, razão default do shell (`DEFAULT_SHELL_SPLIT_RATIO`).
 *   · `Hover` — o grip (os três pontinhos) ganha a tinta do preenchimento e a
 *     alça `::after` estendida não muda o layout.
 *   · `Foco` — o anel de foco grande do app (`focusRingStyles`).
 *   · `Arrastando` — `data-dragging`, a razão segue o ponteiro e o shell
 *     desliga a transição (via `onDragStart`/`onDragEnd`).
 *   · `Teclado` — o APG completo: setas (passo fino), PageUp/PageDown (passo
 *     grosso), Home/End (fronteiras efetivas); teclas não tratadas NÃO são
 *     sequestradas (`preventDefault` só em tecla tratada).
 *   · `FronteirasEmPx` — o piso de `minPanePx` SOBE a `aria-valuemin`: o
 *     separador anuncia as fronteiras EFETIVAS, nunca as constantes cruas.
 *   · `SemMedida` — primeiro frame, antes da medição (`containerPx = 0`):
 *     as fronteiras anunciadas são as cruas e nada rebenta.
 *
 * SOBRE O ARRASTE NOS `play` (ver o shim em
 * `SplitDivider.stories.helpers.tsx`): os eventos dos plays são sintéticos e
 * `setPointerCapture` lança `NotFoundError` sem ponteiro ativo do navegador.
 * O shim de captura do helper (instalado pelo `SplitDemo`) só substitui esse
 * método — o `handlePointerDown` que corre é o do PRODUTO.
 */
import type { ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import {
  DEFAULT_SHELL_SPLIT_RATIO,
  SHELL_SPLIT_CONSTRAINTS,
} from '../../lib/splitRatio';
import ptBR from '../../i18n/locales/pt-BR/translation.json';
import SplitDivider, { type SplitDividerProps } from './SplitDivider';
import { SplitDemo, type SplitDemoProps } from './SplitDivider.stories.helpers';
import { shellDecorators, withFixedCanvas } from '../../storybook/decorators';

/**
 * O demo envolve as props da divisória num arranjo medido. As histórias
 * variam só o que é variável no app: a razão, a medição e o tamanho do eixo.
 */
function demoFor(args: Partial<SplitDividerProps>, extra?: Partial<SplitDemoProps>): ReactElement {
  return (
    <SplitDemo
      initialRatio={args.ratio}
      onRatioChange={args.onRatioChange}
      onDragStart={args.onDragStart}
      onDragEnd={args.onDragEnd}
      ariaLabel={args.ariaLabel}
      hint={args.hint}
      {...extra}
    />
  );
}

const meta = {
  title: 'Componentes/Shell/SplitDivider',
  component: SplitDivider,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  // Canvas FIXO: a divisória mede o pai — num contentor 0px o arraste não
  // anda e o `role="separator"` anuncia fronteiras de contêiner não medido.
  decorators: shellDecorators({ canvas: { width: 960, height: 560 } }),
  args: {
    ratio: DEFAULT_SHELL_SPLIT_RATIO,
    containerPx: 0,
    constraints: SHELL_SPLIT_CONSTRAINTS,
    onRatioChange: fn(),
    onDragStart: fn(),
    onDragEnd: fn(),
    // Copy REAL do produto (as mesmas chaves que o App.tsx traduz para a
    // divisória — `shell.sidebar.*`): o argumento é o que os controles editam.
    ariaLabel: ptBR.shell.sidebar.splitAria,
    hint: ptBR.shell.sidebar.splitHint,
    hintId: 'shell-split-divider-hint',
    controlsIds: ['shell-session-sidebar', 'shell-split-demo-main'],
    dividerId: 'shell-split-divider',
  },
  argTypes: {
    ratio: {
      control: { type: 'range', min: SHELL_SPLIT_CONSTRAINTS.minRatio, max: SHELL_SPLIT_CONSTRAINTS.maxRatio, step: 0.01 },
      description: 'Razão do painel líder (a barra lateral) — o demo segue o controle ao vivo.',
    },
  },
  render: (args) => demoFor(args),
} satisfies Meta<typeof SplitDivider>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Repouso — a razão default do shell, com a dica ligada por aria-describedby. */
export const Normal: Story = {};

/** Hover — o grip diz "agarre aqui"; a alça estendida não desloca o layout. */
export const Hover: Story = {
  play: async ({ canvasElement }) => {
    const divider = within(canvasElement).getByRole('separator');
    await userEvent.hover(divider);
  },
};

/** Foco de teclado — o anel grande do app, igual ao do NavigationRail. */
export const Foco: Story = {
  play: async ({ canvasElement }) => {
    const divider = within(canvasElement).getByRole('separator');
    await userEvent.tab();
    expect(canvasElement.ownerDocument.activeElement).toBe(divider);
  },
};

/**
 * Arraste — `data-dragging` ativo enquanto o botão está pressionado, a razão
 * segue o ponteiro (o painel líder cresce com o movimento para a direita) e o
 * ciclo `onDragStart`/`onDragEnd` fecha como o shell precisa para desligar e
 * religar a transição do flex-basis.
 */
export const Arrastando: Story = {
  args: {
    onRatioChange: fn(),
    onDragStart: fn(),
    onDragEnd: fn(),
  },
  play: async ({ canvasElement, args }) => {
    // Instância ÚNICA de userEvent: o pressionar/soltar do botão é estado do
    // ponteiro da instância — chamadas avulsas de `userEvent.pointer` não
    // "lembram" o botão em baixo e o release não sairia.
    const user = userEvent.setup();
    const divider = within(canvasElement).getByRole('separator');
    const before = Number(divider.getAttribute('aria-valuenow'));
    const box = divider.getBoundingClientRect();
    const startX = box.left + box.width / 2;
    const y = box.top + box.height / 2;

    await user.pointer([
      { keys: '[MouseLeft>]', target: divider, coords: { x: startX, y } },
      { target: divider, coords: { x: startX + 160, y } },
    ]);

    // Enquanto o botão está pressionado: âncora do estado de arraste. (O DOM
    // do React 19 não sincroniza dentro do próprio dispatch — `waitFor`.)
    await waitFor(() => {
      expect(divider.getAttribute('data-dragging')).toBe('true');
    });
    expect(args.onDragStart).toHaveBeenCalled();
    await waitFor(() => {
      expect(Number(divider.getAttribute('aria-valuenow'))).toBeGreaterThan(before);
    });

    await user.pointer([
      { keys: '[/MouseLeft]', target: divider, coords: { x: startX + 160, y } },
    ]);

    // Soltou: o estado de arraste some (o atributo não fica órfão).
    await waitFor(() => {
      expect(divider.getAttribute('data-dragging')).toBeNull();
    });
    expect(args.onDragEnd).toHaveBeenCalled();
  },
};

/**
 * Teclado (APG "Window Splitter") — setas movem um passo, PageUp/PageDown o
 * passo grosso, Home/End saltam para as fronteiras EFETIVAS; e o contrato
 * negativo que protege o resto do app: `preventDefault` SÓ em tecla tratada —
 * Tab e atalhos passam intactos.
 */
export const Teclado: Story = {
  args: { onRatioChange: fn() },
  play: async ({ canvasElement, args }) => {
    const user = userEvent.setup();
    const divider = within(canvasElement).getByRole('separator');
    // O foco entra pelo TECLADO do próprio userEvent (o caminho do app: Tab) —
    // o `keyboard` do userEvent só entrega teclas ao alvo que a sua sessão viu
    // focar.
    await user.tab();
    expect(canvasElement.ownerDocument.activeElement).toBe(divider);

    const prevented: boolean[] = [];
    const win = canvasElement.ownerDocument.defaultView;
    const recordPrevented = (event: Event): void => {
      prevented.push(event.defaultPrevented);
    };
    win?.addEventListener('keydown', recordPrevented);

    const valuenow = (): number => Number(divider.getAttribute('aria-valuenow'));
    const valuemin = (): number => Number(divider.getAttribute('aria-valuemin'));
    const valuemax = (): number => Number(divider.getAttribute('aria-valuemax'));

    // Seta: passo fino para a direita — e a tecla É sequestrada (tratada).
    // A DECISÃO do handler é síncrona (o mock regista a razão nova); o DOM do
    // React 19 commita a seguir — daí o `waitFor` nas leituras.
    const start = valuenow();
    await user.keyboard('{ArrowRight}');
    expect(args.onRatioChange).toHaveBeenCalled();
    await waitFor(() => {
      expect(valuenow()).toBeGreaterThan(start);
    });
    expect(prevented.at(-1)).toBe(true);

    // PageDown: passo grosso — mais longe que uma seta.
    const afterArrow = valuenow();
    await user.keyboard('{PageDown}');
    await waitFor(() => {
      expect(valuenow()).toBeGreaterThan(afterArrow);
    });

    // Home/End: as fronteiras EFETIVAS (as mesmas de aria-valuemin/max).
    await user.keyboard('{Home}');
    await waitFor(() => {
      expect(valuenow()).toBe(valuemin());
    });
    await user.keyboard('{End}');
    await waitFor(() => {
      expect(valuenow()).toBe(valuemax());
    });

    // Tecla não tratada: NENHUM preventDefault (Tab/atalhos seguem viagem).
    await user.keyboard('{Tab}');
    expect(prevented.at(-1)).toBe(false);

    win?.removeEventListener('keydown', recordPrevented);
    expect(args.onRatioChange).toHaveBeenCalled();
  },
};

/**
 * Fronteiras em px — com o eixo estreito, o piso de `minPanePx` (180px por
 * painel) sobe a `aria-valuemin` acima da `minRatio` crua: o separador nunca
 * anuncia uma fronteira que a geometria não permite (APG: valueMin = posição
 * em que o painel líder tem o seu tamanho MÍNIMO).
 */
export const FronteirasEmPx: Story = {
  decorators: [withFixedCanvas(400, 320)],
  play: async ({ canvasElement }) => {
    const divider = within(canvasElement).getByRole('separator');
    // O piso em px só aparece DEPOIS do ResizeObserver medir o eixo — as
    // fronteiras anunciadas começam cruas (primeiro frame) e sobem.
    await waitFor(() => {
      expect(Number(divider.getAttribute('aria-valuemin'))).toBeGreaterThan(
        Math.round(SHELL_SPLIT_CONSTRAINTS.minRatio * 100),
      );
    });
    const valuemin = Number(divider.getAttribute('aria-valuemin'));
    const valuemax = Number(divider.getAttribute('aria-valuemax'));
    const valuenow = Number(divider.getAttribute('aria-valuenow'));
    expect(valuemin).toBeLessThanOrEqual(valuenow);
    expect(valuenow).toBeLessThanOrEqual(valuemax);
  },
};

/**
 * Sem medida — o primeiro frame, antes do ResizeObserver: o contêiner vale 0
 * e as fronteiras anunciadas são as cruas (`minRatio`/`maxRatio`). Nada rebenta
 * e o arraste é inerte até haver largura de verdade.
 */
export const SemMedida: Story = {
  render: (args) => demoFor(args, { measure: false }),
  play: async ({ canvasElement }) => {
    const divider = within(canvasElement).getByRole('separator');
    expect(Number(divider.getAttribute('aria-valuemin'))).toBe(
      Math.round(SHELL_SPLIT_CONSTRAINTS.minRatio * 100),
    );
    expect(Number(divider.getAttribute('aria-valuemax'))).toBe(
      Math.round(SHELL_SPLIT_CONSTRAINTS.maxRatio * 100),
    );
  },
};