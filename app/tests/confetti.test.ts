/**
 * tests/confetti.test.ts — rajada de confete (Canvas 2D puro) + anúncio
 * role="status". Sem jsdom e SEM tipos DOM (src/lib compila sob
 * tsconfig.node.json, lib ES2022): DOM fake mínimo injetado em globalThis para
 * exercitar os caminhos; `prefers-reduced-motion: reduce` DESLIGA a animação
 * (SC 2.3.3); ausência de DOM/canvas nunca lança.
 */
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  announceStatus,
  fireConfetti,
  prefersReducedMotion,
  type ConfettiCanvasLike,
  type ConfettiElementLike,
} from '../src/lib/confetti';

// ─── DOM fake mínimo (estrutura Confetti*Like) ──────────────────────────────
interface FakeElement {
  tagName: string;
  attrs: Record<string, string>;
  style: Record<string, string>;
  textContent: string;
  parentNode: FakeElement | null;
  isConnected: boolean;
  children: FakeElement[];
  width?: number;
  height?: number;
  ops?: string[];
  setAttribute(k: string, v: string): void;
  appendChild(c: FakeElement): FakeElement;
  removeChild(c: FakeElement): FakeElement;
  getContext?(type: string): unknown;
}

function makeFakeElement(tag: string): FakeElement {
  const el: FakeElement = {
    tagName: tag.toUpperCase(),
    attrs: {},
    style: {},
    textContent: '',
    parentNode: null,
    isConnected: false,
    children: [],
    setAttribute(k: string, v: string) {
      this.attrs[k] = v;
    },
    appendChild(c: FakeElement) {
      c.parentNode = this;
      c.isConnected = true;
      this.children.push(c);
      return c;
    },
    removeChild(c: FakeElement) {
      const i = this.children.indexOf(c);
      if (i >= 0) this.children.splice(i, 1);
      c.parentNode = null;
      c.isConnected = false;
      return c;
    },
  };
  return el;
}

interface FakeDoc {
  body: FakeElement;
  documentElement: FakeElement;
  createElement(tag: string): FakeElement;
  querySelector(sel: string): FakeElement | null;
}

const STASH: Array<() => void> = [];

function stash<T>(key: string, value: T): void {
  const prev = (globalThis as Record<string, unknown>)[key];
  (globalThis as Record<string, unknown>)[key] = value;
  STASH.push(() => {
    (globalThis as Record<string, unknown>)[key] = prev;
  });
}

function installFakeDocument(): FakeDoc {
  const body = makeFakeElement('body');
  const doc: FakeDoc = {
    body,
    documentElement: body,
    // 'canvas' criado via createElement tem getContext (como no DOM real).
    createElement: (tag: string) =>
      (tag === 'canvas' ? makeFakeCanvasElement().canvas : makeFakeElement(tag)) as FakeElement,
    querySelector: (sel: string) => {
      const stack = [...body.children];
      while (stack.length > 0) {
        const el = stack.shift() as FakeElement;
        if (sel === '[role="status"]' && el.attrs.role === 'status') return el;
        stack.push(...el.children);
      }
      return null;
    },
  };
  stash('document', doc);
  return doc;
}

function makeFakeCanvasElement(): { canvas: ConfettiCanvasLike; ops: string[] } {
  const ops: string[] = [];
  const ctx = {
    save: () => ops.push('save'),
    restore: () => ops.push('restore'),
    translate: () => ops.push('translate'),
    rotate: () => ops.push('rotate'),
    fillRect: () => ops.push('fillRect'),
    clearRect: () => ops.push('clearRect'),
    fillStyle: '',
    globalAlpha: 1,
  };
  const canvas = makeFakeElement('canvas');
  canvas.width = 0;
  canvas.height = 0;
  canvas.getContext = (type: string) => (type === '2d' ? ctx : null);
  (canvas as FakeElement & { ops: string[] }).ops = ops;
  return { canvas: canvas as unknown as ConfettiCanvasLike, ops };
}

function installFakeCanvas(): { canvas: ConfettiCanvasLike; ops: string[] } {
  return makeFakeCanvasElement();
}

function installFakeWindow(opts: { reducedMotion?: boolean; innerWidth?: number; innerHeight?: number } = {}): void {
  stash('window', {
    matchMedia: () => ({ matches: opts.reducedMotion === true }),
    innerWidth: opts.innerWidth ?? 0,
    innerHeight: opts.innerHeight ?? 0,
  });
}

function installFakeRaf(): void {
  stash('requestAnimationFrame', (cb: (ts: number) => void) =>
    setTimeout(() => cb(Date.now()), 1) as unknown as number,
  );
  stash('cancelAnimationFrame', () => undefined);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeEach(() => {
  STASH.length = 0;
});

afterEach(() => {
  for (let i = STASH.length - 1; i >= 0; i -= 1) STASH[i]();
  STASH.length = 0;
  // Rede de segurança: se o teste de animação com mock.timers falhar antes do
  // próprio finally, os timers reais voltam para os testes seguintes.
  try {
    mock.timers.reset();
  } catch {
    // timers não habilitados neste teste — no-op.
  }
});

describe('prefersReducedMotion', () => {
  it('sem window (node:test puro) → false (nunca bloqueia o anúncio)', () => {
    assert.equal(prefersReducedMotion(), false);
  });

  it('window.matchMedia reduzido → true', () => {
    installFakeWindow({ reducedMotion: true });
    assert.equal(prefersReducedMotion(), true);
  });

  it('window.matchMedia sem reduce → false', () => {
    installFakeWindow({ reducedMotion: false });
    assert.equal(prefersReducedMotion(), false);
  });
});

describe('fireConfetti — caminhos defensivos', () => {
  it('sem document (node:test puro) → false, sem lançar', () => {
    assert.equal(fireConfetti(), false);
  });

  it('reduced motion DESLIGA a animação e não toca no DOM (SC 2.3.3)', () => {
    installFakeWindow({ reducedMotion: true });
    const doc = installFakeDocument();
    installFakeRaf();
    assert.equal(fireConfetti({ particleCount: 20, durationMs: 30 }), false);
    assert.equal(doc.body.children.length, 0, 'nenhum canvas criado');
  });

  it('canvas fornecido sem contexto 2d → false, sem lançar', () => {
    installFakeWindow({});
    installFakeDocument();
    const { canvas } = installFakeCanvas();
    (canvas as unknown as { getContext: (t: string) => unknown }).getContext = () => null;
    assert.equal(fireConfetti({ canvas }), false);
  });
});

describe('fireConfetti — animação', () => {
  it('com canvas fornecido: anima (fillRect/clearRect) e não remove o canvas', () => {
    installFakeWindow({ innerWidth: 800, innerHeight: 600 });
    installFakeDocument();
    installFakeRaf();
    const { canvas, ops } = installFakeCanvas();
    // Fake timers tornam o teste determinístico sob carga: a rajada inteira é
    // atravessada com tick() — o tempo NUNCA avança sozinho, então o primeiro
    // frame não pode chegar "atrasado" além da duração. (A corrida original: o
    // rAF fake é `setTimeout(cb, 1)`; sob carga esse timer pode disparar depois
    // de durationMs=40 e o 1º frame cai no ramo terminal — só clearRect, NENHUM
    // fillRect chega a desenhar e a rajada morre antes de começar:
    // ops=['clearRect']. Esperar mais tempo não ajuda: o burst já acabou.)
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    try {
      const started = fireConfetti({ canvas, particleCount: 20, durationMs: 40 });
      assert.equal(started, true);
      // 40ms de rajada em passos de 1ms → ~39 quadros de desenho (fillRect) +
      // quadro terminal (elapsed ≥ duração → clearRect + cancel). Sem sleep:
      // nenhum tempo real passa entre os frames.
      mock.timers.tick(60);
      assert.ok(ops.includes('fillRect'), `fillRect deveria ter desenhado (ops: ${ops.join(',')})`);
      assert.ok(ops.includes('clearRect'));
      assert.ok(ops.filter((o) => o === 'fillRect').length > 10, 'múltiplos quadros animados');
    } finally {
      mock.timers.reset();
    }
  });

  it('sem canvas: cria overlay no body e o REMOVE ao fim da rajada', async () => {
    installFakeWindow({ innerWidth: 800, innerHeight: 600 });
    const doc = installFakeDocument();
    installFakeRaf();
    const started = fireConfetti({ particleCount: 20, durationMs: 40 });
    assert.equal(started, true);
    assert.equal(doc.body.children.length, 1, 'overlay criado e anexado ao body');
    const created = doc.body.children[0];
    assert.equal(created.tagName, 'CANVAS');
    assert.equal(created.style.position, 'fixed');
    assert.equal(created.style.pointerEvents, 'none');
    await sleep(150);
    assert.equal(doc.body.children.length, 0, 'overlay removido ao terminar');
    assert.equal(created.isConnected, false);
  });

  it('duração é limitada pela spec (< 5s): durationMs 10_000 → clamp 4s', async () => {
    installFakeWindow({ innerWidth: 800, innerHeight: 600 });
    installFakeDocument();
    installFakeRaf();
    const { canvas, ops } = installFakeCanvas();
    const t0 = Date.now();
    fireConfetti({ canvas, particleCount: 10, durationMs: 10_000 });
    await sleep(4_600);
    assert.ok(ops.includes('fillRect'));
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 5_200, `rajada não deve exceder 5s (levou ${elapsed}ms)`);
  });
});

describe('announceStatus — role="status" (SC 4.1.3)', () => {
  it('sem document → no-op, sem lançar', () => {
    assert.doesNotThrow(() => announceStatus('oi'));
  });

  it('cria elemento role="status" visually-hidden e seta o texto', () => {
    const doc = installFakeDocument();
    announceStatus('Os testes passaram.');
    assert.equal(doc.body.children.length, 1);
    const el = doc.body.children[0];
    assert.equal(el.attrs.role, 'status');
    assert.equal(el.attrs['aria-live'], 'polite');
    assert.equal(el.style.position, 'absolute');
    assert.equal(el.textContent, 'Os testes passaram.');
  });

  it('reutiliza elemento role="status" existente (presente no DOM antes da atualização)', () => {
    const doc = installFakeDocument();
    // A ChallengeView mantém um div role="status" sempre montado.
    const existing: ConfettiElementLike = makeFakeElement('div');
    existing.setAttribute('role', 'status');
    doc.body.appendChild(existing as FakeElement);
    announceStatus('primeiro');
    announceStatus('segundo');
    assert.equal(doc.body.children.length, 1, 'não cria duplicata');
    assert.equal(existing.textContent, 'segundo');
  });

  it('texto vazio é ignorado (não cria elemento)', () => {
    const doc = installFakeDocument();
    announceStatus('');
    announceStatus('   ');
    assert.equal(doc.body.children.length, 0);
  });
});
