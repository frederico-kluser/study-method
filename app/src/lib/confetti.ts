/**
 * src/lib/confetti.ts — rajada curta de partículas em Canvas 2D puro (ZERO
 * dependências novas, ZERO eval/new Function — o renderer roda com CSP sem
 * unsafe-eval) + anúncio acessível via role="status".
 *
 * Contrato normativo de docs/ux-redesign.md §8 (teste passou):
 *   - rajada < 5 s (SC 2.2.2) → duração máxima 4 s, fade contínuo, NUNCA
 *     alternância liga/desliga (SC 2.3.1 — sem strobe; paleta sem vermelho
 *     dominante);
 *   - `prefers-reduced-motion: reduce` DESLIGA a animação (SC 2.3.3) — a
 *     informação passou/falhou NUNCA depende do movimento (o anúncio em
 *     role="status" acontece independentemente, chamado pela UI);
 *   - anúncio em elemento role="status" presente no DOM ANTES da atualização
 *     (SC 4.1.3) — a UI mantém um div role="status" sempre montado e esta
 *     função reutiliza um existente antes de criar;
 *   - som é opt-in e fica OMITIDO aqui (nunca toca sem consentimento).
 *
 * NOTA DE TIPAGEM: src/lib compila sob tsconfig.node.json (lib ES2022, SEM
 * DOM) e sob tsconfig.json (com DOM). Por isso este módulo NÃO referencia
 * tipos DOM (window/document/HTMLCanvasElement); usa tipos estruturais
 * mínimos (`Confetti*Like`) que o DOM real do renderer satisfaz, e acessa
 * globais via `globalThis`. Tudo é defensivo para rodar em ambiente de teste
 * sem DOM: qualquer ausência (window/document/canvas 2d) vira no-op
 * silencioso — nunca lança.
 */

// ─── Tipos estruturais mínimos (compatíveis com o DOM real) ─────────────────
export interface ConfettiStyleLike {
  position?: string;
  inset?: string;
  width?: string;
  height?: string;
  pointerEvents?: string;
  zIndex?: string;
  margin?: string;
  padding?: string;
  overflow?: string;
  clip?: string;
  whiteSpace?: string;
  border?: string;
}

export interface ConfettiContextLike {
  globalAlpha: number;
  fillStyle: unknown;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
}

export interface ConfettiParentLike {
  removeChild(child: unknown): unknown;
}

export interface ConfettiElementLike {
  setAttribute(k: string, v: string): void;
  textContent: string;
  style: ConfettiStyleLike | null;
  parentNode: ConfettiParentLike | null;
  appendChild(child: ConfettiElementLike): ConfettiElementLike;
}

export interface ConfettiCanvasLike extends ConfettiElementLike {
  width: number;
  height: number;
  getContext(kind: string): unknown;
}

interface ConfettiDocLike {
  body: ConfettiElementLike | null;
  documentElement: ConfettiElementLike | null;
  createElement(tag: string): ConfettiElementLike;
  querySelector(sel: string): ConfettiElementLike | null;
}

interface ConfettiWindowLike {
  matchMedia?(q: string): { matches: boolean };
  innerWidth?: number;
  innerHeight?: number;
}

/** Globais acessados de forma segura sob qualquer lib do TS. */
function globals(): {
  document?: unknown;
  window?: ConfettiWindowLike;
  requestAnimationFrame?: (cb: (ts: number) => void) => number;
  cancelAnimationFrame?: (id: number) => void;
} {
  return globalThis as unknown as {
    document?: unknown;
    window?: ConfettiWindowLike;
    requestAnimationFrame?: (cb: (ts: number) => void) => number;
    cancelAnimationFrame?: (id: number) => void;
  };
}

/** Opções da rajada. `canvas` fornecido é usado como está (não é removido no
 * fim nem estilizado); sem `canvas`, um overlay fixed full-screen é criado e
 * removido ao terminar. */
export interface ConfettiOptions {
  canvas?: ConfettiCanvasLike | null;
  /** Quantidade de partículas (default 120; clamp 1..300). */
  particleCount?: number;
  /** Duração da rajada (default 3000 ms; clamp 100..4000 — spec: < 5 s). */
  durationMs?: number;
}

export const CONFETTI_DEFAULT_PARTICLES = 120;
export const CONFETTI_DEFAULT_DURATION_MS = 3_000;
export const CONFETTI_MAX_DURATION_MS = 4_000;

/** Paleta da rajada — matizes quentes/frios suaves, SEM vermelho dominante
 * (nenhum R/(R+G+B) ≥ 0,8 — regra de red-flash do SC 2.3.1). */
const PALETTE = [
  '#ffd54f', // âmbar
  '#ffb74d', // laranja claro
  '#fff176', // amarelo
  '#f48fb1', // rosa
  '#4fc3f7', // azul claro
  '#81c784', // verde claro
  '#ce93d8', // lilás
  '#ff8a65', // coral
] as const;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
}

type RafFn = (cb: (ts: number) => void) => number;
type CancelFn = (id: number) => void;

function rafImpl(): { raf: RafFn; cancel: CancelFn } {
  const rafFn = globals().requestAnimationFrame;
  const cancelFn = globals().cancelAnimationFrame;
  if (typeof rafFn === 'function' && typeof cancelFn === 'function') {
    return { raf: rafFn as RafFn, cancel: cancelFn as CancelFn };
  }
  // Fallback determinístico (node:test, runtimes sem rAF).
  return {
    raf: (cb) => setTimeout(() => cb(Date.now()), 16) as unknown as number,
    cancel: (id) => clearTimeout(id),
  };
}

/** true quando o usuário pede menos movimento (SC 2.3.3). Defensivo: sem
 * matchMedia (ou falha), devolve false — o anúncio em role="status" nunca é
 * bloqueado por esta função, só a animação. */
export function prefersReducedMotion(): boolean {
  const win = globals().window;
  if (!win || typeof win.matchMedia !== 'function') return false;
  try {
    return win.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

/**
 * Dispara a rajada de confete. Aceita um canvas (usado como está) OU opções
 * (`fireConfetti()` sem argumento cria o overlay). Com
 * `prefers-reduced-motion: reduce` — ou sem DOM/canvas 2d disponível — NÃO
 * anima: no-op silencioso.
 *
 * @returns true se a animação começou; false se foi suprimida (reduced motion)
 *          ou não havia ambiente (teste/node).
 */
export function fireConfetti(arg?: ConfettiOptions | ConfettiCanvasLike | null): boolean {
  if (prefersReducedMotion()) return false;

  let options: ConfettiOptions;
  if (arg && typeof arg === 'object' && 'getContext' in arg) {
    options = { canvas: arg as ConfettiCanvasLike };
  } else {
    options = (arg as ConfettiOptions | undefined) ?? {};
  }

  const doc = globals().document as ConfettiDocLike | null | undefined;
  if (!doc) return false;

  let canvas = options.canvas ?? null;
  let ownsCanvas = false;
  if (!canvas) {
    const created = doc.createElement('canvas');
    canvas = created as unknown as ConfettiCanvasLike;
    ownsCanvas = true;
    const style = created.style;
    if (style) {
      style.position = 'fixed';
      style.inset = '0';
      style.width = '100%';
      style.height = '100%';
      style.pointerEvents = 'none';
      style.zIndex = '2147483647';
    }
    // Em DOM real document.body sempre existe; defensivo para fakes/testes.
    (doc.body ?? doc.documentElement)?.appendChild(created);
  }

  // Defensivo: DOM fake/tests pode criar elemento 'canvas' sem getContext —
  // neste caso trata como canvas indisponível (nunca lança).
  const ctx =
    typeof canvas.getContext === 'function'
      ? (canvas.getContext('2d') as ConfettiContextLike | null)
      : null;
  if (!ctx) {
    if (ownsCanvas && canvas.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }
    return false;
  }

  // Dimensões: usa as do canvas se já definidas; senão a viewport (fallback
  // 640×480 para ambiente sem window — testes).
  let width = canvas.width;
  let height = canvas.height;
  if (!width || !height) {
    const win = globals().window;
    width = win && win.innerWidth && win.innerWidth > 0 ? win.innerWidth : 640;
    height = win && win.innerHeight && win.innerHeight > 0 ? win.innerHeight : 480;
    canvas.width = width;
    canvas.height = height;
  }

  const particleCount = Math.max(
    1,
    Math.min(300, Math.floor(options.particleCount ?? CONFETTI_DEFAULT_PARTICLES)),
  );
  const durationMs = Math.max(
    100,
    Math.min(CONFETTI_MAX_DURATION_MS, options.durationMs ?? CONFETTI_DEFAULT_DURATION_MS),
  );

  const particles: Particle[] = [];
  for (let i = 0; i < particleCount; i += 1) {
    const speed = 3 + Math.random() * 7;
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * (Math.PI / 1.6);
    particles.push({
      x: width / 2 + (Math.random() - 0.5) * 40,
      y: height / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: 0.12 + Math.random() * 0.08,
      size: 3 + Math.random() * 5,
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.2,
    });
  }

  const { raf, cancel } = rafImpl();
  const startTs = Date.now();
  let rafId = 0;

  const removeCanvas = (): void => {
    if (ownsCanvas && canvas?.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }
  };

  const frame = (): void => {
    const elapsed = Date.now() - startTs;
    const t = elapsed / durationMs;
    if (t >= 1) {
      ctx.clearRect(0, 0, width, height);
      cancel(rafId);
      removeCanvas();
      return;
    }
    // Fade contínuo no fim (1 - t⁴) — NUNCA alternância liga/desliga (sem
    // strobe). Ao fim de ~80% da rajada a opacidade já caiu bastante; a rajada
    // some suave, não pisca.
    ctx.globalAlpha = 1 - t * t * t * t;
    ctx.clearRect(0, 0, width, height);
    for (const p of particles) {
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
    rafId = raf(frame);
  };

  rafId = raf(frame);
  return true;
}

/**
 * Anuncia texto via role="status" (SC 4.1.3 / docs §8): reutiliza um elemento
 * `[role="status"]` já presente no DOM (a ChallengeView mantém um sempre
 * montado) ou cria um visually-hidden antes de setar o texto. No-op silencioso
 * sem `document`.
 */
export function announceStatus(text: string): void {
  if (typeof text !== 'string' || text.trim().length === 0) return;
  const doc = globals().document as ConfettiDocLike | null | undefined;
  if (!doc) return;
  const el = findOrCreateStatusElement(doc);
  if (el) el.textContent = text;
}

function findOrCreateStatusElement(doc: ConfettiDocLike | null | undefined): ConfettiElementLike | null {
  if (!doc) return null;
  try {
    const existing = doc.querySelector('[role="status"]');
    // Check estrutural (o instanceof HTMLElement não existe no node:test e o
    // DOM fake dos testes satisfaz a forma mínima).
    if (existing && typeof existing.setAttribute === 'function') return existing;
  } catch {
    // querySelector indisponível (DOM fake mínimo) → cai para criação.
  }
  try {
    const el = doc.createElement('div');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    const style = el.style;
    if (style) {
      style.position = 'absolute';
      style.width = '1px';
      style.height = '1px';
      style.margin = '-1px';
      style.padding = '0';
      style.overflow = 'hidden';
      style.clip = 'rect(0 0 0 0)';
      style.whiteSpace = 'nowrap';
      style.border = '0';
    }
    (doc.body ?? doc.documentElement)?.appendChild(el);
    return el;
  } catch {
    return null;
  }
}
