/**
 * tests/dockState.test.ts — contrato da máquina de estados do dock (sem jsdom).
 *
 * Escritos para MORDER. Os quatro contratos do módulo têm cada um o seu teste
 * que só passa se a implementação for a certa:
 *   1. RECOLHIDO ≠ DESTRUÍDO — `mountedTabs` é varrido ao longo de uma sequência
 *      longa de ações e checado como SUPERCONJUNTO a cada passo; se qualquer
 *      transição tirar uma aba de lá, a varredura acusa.
 *   2. ALTURA PRESERVADA — a altura ajustada é comparada com o valor EXATO
 *      depois de recolher/reabrir; um "volta ao default" reprova.
 *   3. AUTO-FOCO NOMEADO — `dockActionForSignal` é verificado sinal a sinal, e a
 *      diferença entre `reveal` forçado e não forçado é testada nos dois estados.
 *   4. LIXO NO STORAGE — toda forma de corrupção é lida com `doesNotThrow` e
 *      comparada ao default.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import en from '../src/i18n/locales/en/translation.json';
import { SPATIAL_ALLOWED_PROPERTIES, SPATIAL_FORBIDDEN_PROPERTIES } from '../src/lib/designTokens';
import {
  clampDockHeight,
  clearDockPersistedState,
  createDockState,
  DEFAULT_DOCK_PERSISTED,
  DOCK_ARIA_I18N_KEY,
  DOCK_COLLAPSE_I18N_KEY,
  DOCK_DIVIDER_ID,
  DOCK_DIVIDER_KEYS,
  DOCK_EXPAND_I18N_KEY,
  DOCK_GEOMETRY,
  DOCK_MOTION,
  DOCK_PANE_ID,
  DOCK_SIGNALS,
  DOCK_STORAGE_KEY,
  DOCK_STORAGE_VERSION,
  DOCK_TAB_IDS,
  DOCK_TABLIST_ID,
  DOCK_TABS,
  dockActionForKey,
  dockActionForSignal,
  dockAriaValues,
  dockHeightBounds,
  dockHeightFromPointer,
  dockReducer,
  dockRenderedHeightPx,
  dockTabElementId,
  dockTabPanelId,
  hasUnseen,
  INITIAL_DOCK_STATE,
  isDockTabId,
  isTabVisible,
  readDockPersistedState,
  shouldRenderTab,
  toDockPersistedState,
  writeDockPersistedState,
  type DockAction,
  type DockState,
  type DockTabId,
  type StorageLike,
} from '../src/lib/dockState';

const G = DOCK_GEOMETRY;
/** Contêiner de referência: 800 px de altura ⇒ teto do dock em 560 px. */
const CONTAINER = 800;

/* ── helpers ──────────────────────────────────────────────────────────────── */

interface FakeStorage extends StorageLike {
  readonly map: Map<string, string>;
}

function makeStorage(seed?: Record<string, string>): FakeStorage {
  const map = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    map,
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

function makeThrowingStorage(): StorageLike {
  return {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => {
      throw new Error('SecurityError');
    },
  };
}

/** Aplica uma sequência de ações a partir de um estado. */
function run(state: DockState, ...actions: DockAction[]): DockState {
  return actions.reduce(dockReducer, state);
}

function lookup(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (typeof acc !== 'object' || acc === null) return undefined;
    return (acc as Record<string, unknown>)[part];
  }, source);
}

/* ── abas ─────────────────────────────────────────────────────────────────── */

describe('DOCK_TABS: Saída / Testes / Feedback', () => {
  it('tem exatamente as três abas do redesign, na ordem do fluxo', () => {
    assert.deepEqual(DOCK_TAB_IDS, ['output', 'tests', 'feedback']);
    assert.equal(DOCK_TABS.length, 3);
  });

  it('as chaves i18n das abas existem NOS DOIS locales', () => {
    const keys = [
      ...DOCK_TABS.map((t) => t.i18nKey),
      DOCK_ARIA_I18N_KEY,
      DOCK_COLLAPSE_I18N_KEY,
      DOCK_EXPAND_I18N_KEY,
    ];
    for (const key of keys) {
      const path = key.replace('translation:', '');
      assert.equal(typeof lookup(ptBR, path), 'string', `pt-BR sem ${path}`);
      assert.equal(typeof lookup(en, path), 'string', `en sem ${path}`);
      assert.ok((lookup(ptBR, path) as string).length > 0, `pt-BR vazio em ${path}`);
      assert.ok((lookup(en, path) as string).length > 0, `en vazio em ${path}`);
    }
  });

  it('os ids ARIA são únicos entre abas, painéis e a região', () => {
    const ids = [
      DOCK_PANE_ID,
      DOCK_TABLIST_ID,
      DOCK_DIVIDER_ID,
      ...DOCK_TAB_IDS.map(dockTabElementId),
      ...DOCK_TAB_IDS.map(dockTabPanelId),
    ];
    assert.equal(new Set(ids).size, ids.length, 'id ARIA duplicado');
    for (const id of ids) assert.match(id, /^[a-z][\w-]*$/);
  });

  it('isDockTabId recusa qualquer coisa que não seja aba', () => {
    for (const good of DOCK_TAB_IDS) assert.equal(isDockTabId(good), true);
    for (const bad of ['', 'Output', 'terminal', 0, null, undefined, {}, ['tests']]) {
      assert.equal(isDockTabId(bad), false, `aceitou ${JSON.stringify(bad)}`);
    }
  });
});

/* ── contrato 2: altura preservada ────────────────────────────────────────── */

describe('CONTRATO: recolher preserva a altura, reabrir volta para ela', () => {
  it('reabrir devolve a altura AJUSTADA, não o default', () => {
    const resized = run(INITIAL_DOCK_STATE, { type: 'resize', heightPx: 420, containerPx: CONTAINER });
    assert.equal(resized.heightPx, 420);

    const collapsed = dockReducer(resized, { type: 'collapse' });
    assert.equal(collapsed.collapsed, true);
    assert.equal(collapsed.heightPx, 420, 'recolher não pode tocar a altura guardada');
    assert.equal(dockRenderedHeightPx(collapsed, CONTAINER), G.collapsedHeightPx);

    const reopened = dockReducer(collapsed, { type: 'expand' });
    assert.equal(reopened.heightPx, 420);
    assert.equal(dockRenderedHeightPx(reopened, CONTAINER), 420);
    assert.notEqual(dockRenderedHeightPx(reopened, CONTAINER), G.defaultHeightPx);
  });

  it('sobrevive a toggle, troca de aba e revelações no meio do caminho', () => {
    const state = run(
      INITIAL_DOCK_STATE,
      { type: 'resize', heightPx: 333, containerPx: CONTAINER },
      { type: 'toggle' },
      { type: 'notify', tab: 'feedback' },
      { type: 'reveal', tab: 'tests' },
      { type: 'toggle' },
      { type: 'select', tab: 'feedback' },
    );
    assert.equal(state.collapsed, false);
    assert.equal(state.heightPx, 333);
    assert.equal(dockRenderedHeightPx(state, CONTAINER), 333);
  });

  it('resize com o dock RECOLHIDO é ignorado (não sequestra a altura de restauração)', () => {
    const base = run(
      INITIAL_DOCK_STATE,
      { type: 'resize', heightPx: 480, containerPx: CONTAINER },
      { type: 'collapse' },
    );
    const after = dockReducer(base, { type: 'resize', heightPx: 141, containerPx: CONTAINER });
    assert.equal(after, base, 'resize recolhido deveria ser identidade');
    assert.equal(after.heightPx, 480);
    assert.equal(dockReducer(after, { type: 'expand' }).heightPx, 480);
  });

  it('a altura gravada é clampada nas fronteiras do contêiner', () => {
    const tall = dockReducer(INITIAL_DOCK_STATE, {
      type: 'resize',
      heightPx: 99999,
      containerPx: CONTAINER,
    });
    assert.equal(tall.heightPx, Math.floor(CONTAINER * G.maxHeightRatio));
    const short = dockReducer(INITIAL_DOCK_STATE, {
      type: 'resize',
      heightPx: 1,
      containerPx: CONTAINER,
    });
    assert.equal(short.heightPx, G.minHeightPx);
  });
});

/* ── contrato 1: buffer preservado ────────────────────────────────────────── */

describe('CONTRATO: recolhido ≠ destruído (mountedTabs só cresce)', () => {
  it('a Saída nasce montada — o terminal precisa existir antes do primeiro teste', () => {
    assert.equal(shouldRenderTab(INITIAL_DOCK_STATE, 'output'), true);
    assert.equal(isTabVisible(INITIAL_DOCK_STATE, 'output'), true);
  });

  it('trocar de aba NÃO desmonta a anterior', () => {
    const state = run(
      INITIAL_DOCK_STATE,
      { type: 'select', tab: 'tests' },
      { type: 'select', tab: 'feedback' },
    );
    assert.deepEqual(state.mountedTabs, ['output', 'tests', 'feedback']);
    assert.equal(shouldRenderTab(state, 'output'), true);
    assert.equal(isTabVisible(state, 'output'), false, 'montada, porém escondida');
  });

  it('recolher NÃO desmonta nada', () => {
    const state = run(
      INITIAL_DOCK_STATE,
      { type: 'select', tab: 'tests' },
      { type: 'collapse' },
    );
    for (const tab of ['output', 'tests'] as DockTabId[]) {
      assert.equal(shouldRenderTab(state, tab), true, `${tab} foi desmontada ao recolher`);
      assert.equal(isTabVisible(state, tab), false);
    }
  });

  it('PROPRIEDADE: nenhuma ação, em nenhuma ordem, encolhe mountedTabs', () => {
    const script: DockAction[] = [
      { type: 'notify', tab: 'feedback' },
      { type: 'collapse' },
      { type: 'reveal', tab: 'tests' },
      { type: 'resize', heightPx: 500, containerPx: CONTAINER },
      { type: 'expand' },
      { type: 'select', tab: 'output' },
      { type: 'toggle' },
      { type: 'reveal', tab: 'feedback', force: true },
      { type: 'seen' },
      { type: 'collapse' },
      { type: 'notify', tab: 'tests' },
      { type: 'hydrate', persisted: { activeTab: 'output', collapsed: false, heightPx: 200 } },
      { type: 'toggle' },
      { type: 'select', tab: 'feedback' },
      { type: 'seen', tab: 'output' },
      { type: 'resize', heightPx: 150, containerPx: CONTAINER },
    ];
    let state = INITIAL_DOCK_STATE;
    let seen = new Set<DockTabId>(state.mountedTabs);
    for (let round = 0; round < 4; round += 1) {
      for (const action of script) {
        const next = dockReducer(state, action);
        for (const tab of seen) {
          assert.ok(
            next.mountedTabs.includes(tab),
            `${action.type} desmontou "${tab}" (rodada ${round})`,
          );
        }
        seen = new Set([...seen, ...next.mountedTabs]);
        state = next;
      }
    }
    assert.deepEqual([...state.mountedTabs].sort(), ['feedback', 'output', 'tests']);
  });

  it('notify monta a aba que recebeu conteúdo, mesmo escondida', () => {
    const state = dockReducer(INITIAL_DOCK_STATE, { type: 'notify', tab: 'feedback' });
    assert.equal(shouldRenderTab(state, 'feedback'), true);
    assert.equal(isTabVisible(state, 'feedback'), false);
  });
});

/* ── contrato 3: auto-foco como transição nomeada ─────────────────────────── */

describe('reveal: auto-foco com duas intensidades', () => {
  it('dock ABERTO: reveal traz a aba para a frente e limpa a novidade', () => {
    const state = run(
      INITIAL_DOCK_STATE,
      { type: 'notify', tab: 'tests' },
      { type: 'reveal', tab: 'tests' },
    );
    assert.equal(state.activeTab, 'tests');
    assert.equal(state.collapsed, false);
    assert.equal(hasUnseen(state, 'tests'), false);
    assert.equal(isTabVisible(state, 'tests'), true);
  });

  it('dock RECOLHIDO sem force: respeita quem fechou, acende o marcador', () => {
    const state = run(
      INITIAL_DOCK_STATE,
      { type: 'collapse' },
      { type: 'reveal', tab: 'tests' },
    );
    assert.equal(state.collapsed, true, 'reveal sem force não pode abrir o dock');
    assert.equal(hasUnseen(state, 'tests'), true);
    assert.equal(state.activeTab, 'tests', 'ao reabrir, o usuário cai na aba revelada');
    assert.equal(shouldRenderTab(state, 'tests'), true);
  });

  it('dock RECOLHIDO com force: abre e não deixa marcador', () => {
    const state = run(
      INITIAL_DOCK_STATE,
      { type: 'collapse' },
      { type: 'reveal', tab: 'output', force: true },
    );
    assert.equal(state.collapsed, false);
    assert.equal(hasUnseen(state, 'output'), false);
    assert.equal(isTabVisible(state, 'output'), true);
  });

  it('expandir depois de um reveal recolhido limpa a novidade da aba ativa', () => {
    const state = run(
      INITIAL_DOCK_STATE,
      { type: 'collapse' },
      { type: 'reveal', tab: 'feedback' },
      { type: 'expand' },
    );
    assert.equal(hasUnseen(state, 'feedback'), false);
    assert.equal(isTabVisible(state, 'feedback'), true);
  });
});

describe('notify: marcador sem roubar a frente', () => {
  it('aba ativa E visível não ganha marcador', () => {
    const state = dockReducer(INITIAL_DOCK_STATE, { type: 'notify', tab: 'output' });
    assert.equal(hasUnseen(state, 'output'), false);
    assert.equal(state, INITIAL_DOCK_STATE, 'nada mudou: deveria ser identidade');
  });

  it('aba ativa mas com o dock RECOLHIDO ganha marcador (ninguém viu nada)', () => {
    const state = run(INITIAL_DOCK_STATE, { type: 'collapse' }, { type: 'notify', tab: 'output' });
    assert.equal(hasUnseen(state, 'output'), true);
  });

  it('aba inativa ganha marcador e o dock não se mexe', () => {
    const state = dockReducer(INITIAL_DOCK_STATE, { type: 'notify', tab: 'tests' });
    assert.equal(hasUnseen(state, 'tests'), true);
    assert.equal(state.activeTab, 'output');
    assert.equal(state.collapsed, false);
  });

  it('select e seen limpam o marcador', () => {
    const marked = dockReducer(INITIAL_DOCK_STATE, { type: 'notify', tab: 'tests' });
    assert.equal(hasUnseen(dockReducer(marked, { type: 'select', tab: 'tests' }), 'tests'), false);
    assert.equal(hasUnseen(dockReducer(marked, { type: 'seen', tab: 'tests' }), 'tests'), false);
    const all = run(
      marked,
      { type: 'notify', tab: 'feedback' },
      { type: 'seen' },
    );
    assert.deepEqual(all.unseen, []);
  });

  it('o marcador guarda as abas na ordem canônica', () => {
    const state = run(
      INITIAL_DOCK_STATE,
      { type: 'notify', tab: 'feedback' },
      { type: 'notify', tab: 'tests' },
    );
    assert.deepEqual(state.unseen, ['tests', 'feedback']);
  });
});

describe('dockActionForSignal: o mapa evento → ação vive num lugar só', () => {
  it('mapeia cada sinal para a transição documentada', () => {
    assert.deepEqual(dockActionForSignal('test:started'), {
      type: 'reveal',
      tab: 'output',
      force: true,
    });
    assert.deepEqual(dockActionForSignal('test:passed'), { type: 'reveal', tab: 'tests' });
    assert.deepEqual(dockActionForSignal('test:failed'), { type: 'reveal', tab: 'tests' });
    assert.deepEqual(dockActionForSignal('feedback:started'), {
      type: 'notify',
      tab: 'feedback',
    });
    assert.deepEqual(dockActionForSignal('feedback:done'), { type: 'reveal', tab: 'feedback' });
    assert.deepEqual(dockActionForSignal('output:appended'), { type: 'notify', tab: 'output' });
  });

  it('todo sinal declarado tem ação, e sinal desconhecido devolve null', () => {
    for (const signal of DOCK_SIGNALS) {
      assert.notEqual(dockActionForSignal(signal), null, `sinal ${signal} sem ação`);
    }
    for (const bad of ['', 'test', 'test:done', 'nope']) {
      assert.equal(dockActionForSignal(bad), null, `inventou ação para "${bad}"`);
    }
  });

  it('o ciclo completo do desafio termina no Feedback com o dock aberto', () => {
    let state = INITIAL_DOCK_STATE;
    for (const signal of ['test:started', 'test:failed', 'feedback:started', 'feedback:done'] as const) {
      const action = dockActionForSignal(signal);
      assert.notEqual(action, null);
      state = dockReducer(state, action as DockAction);
    }
    assert.equal(state.activeTab, 'feedback');
    assert.equal(state.collapsed, false);
    // E o terminal continua montado o tempo todo — o buffer do teste sobrevive.
    assert.equal(shouldRenderTab(state, 'output'), true);
    assert.equal(shouldRenderTab(state, 'tests'), true);
  });

  it('com o dock fechado de propósito, só o teste que o usuário pediu abre a gaveta', () => {
    const closed = dockReducer(INITIAL_DOCK_STATE, { type: 'collapse' });
    const started = dockReducer(closed, dockActionForSignal('test:started') as DockAction);
    assert.equal(started.collapsed, false, 'clicar em testar deve abrir a saída');

    const passed = dockReducer(closed, dockActionForSignal('test:passed') as DockAction);
    assert.equal(passed.collapsed, true, 'um evento de fundo não reabre o dock fechado');
    assert.equal(hasUnseen(passed, 'tests'), true);
  });
});

/* ── geometria ────────────────────────────────────────────────────────────── */

describe('dockHeightBounds / clampDockHeight', () => {
  it('contêiner medido: teto é a fração declarada, piso é a altura mínima', () => {
    const b = dockHeightBounds(CONTAINER);
    assert.equal(b.measured, true);
    assert.equal(b.feasible, true);
    assert.equal(b.min, G.minHeightPx);
    assert.equal(b.max, Math.floor(CONTAINER * G.maxHeightRatio));
    assert.ok(b.max < CONTAINER, 'o dock nunca pode tomar a tela inteira');
  });

  it('contêiner NÃO medido usa a faixa provisória', () => {
    for (const bad of [undefined, 0, -5, Number.NaN]) {
      const b = dockHeightBounds(bad as number | undefined);
      assert.equal(b.measured, false);
      assert.equal(b.min, G.minHeightPx);
      assert.equal(b.max, G.unmeasuredMaxPx);
    }
  });

  it('contêiner apertado colapsa as fronteiras sem inverter', () => {
    const b = dockHeightBounds(150);
    assert.equal(b.feasible, false);
    assert.equal(b.min, b.max);
    assert.ok(b.min >= G.collapsedHeightPx);
  });

  it('min <= max em toda altura de contêiner de 1 a 2000 px', () => {
    for (let container = 1; container <= 2000; container += 1) {
      const b = dockHeightBounds(container);
      assert.ok(b.min <= b.max, `min>max em ${container}px`);
      assert.ok(b.max <= container, `teto acima do contêiner em ${container}px`);
    }
  });

  it('clampDockHeight nunca devolve NaN e sempre respeita a faixa', () => {
    assert.equal(clampDockHeight(9999, CONTAINER), 560);
    assert.equal(clampDockHeight(-10, CONTAINER), G.minHeightPx);
    assert.equal(clampDockHeight(300.6, CONTAINER), 301);
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const v = clampDockHeight(bad, CONTAINER);
      assert.ok(Number.isFinite(v), `NaN vazou para ${bad}`);
      assert.equal(v, G.defaultHeightPx);
    }
  });

  it('dockHeightFromPointer converte o arraste (a divisória fica ACIMA do dock)', () => {
    // Contêiner termina em y=900; ponteiro em y=600 ⇒ dock com 300 px.
    assert.equal(dockHeightFromPointer(600, 900, CONTAINER), 300);
    // Arrastar para fora encosta nas fronteiras, sem sumir.
    assert.equal(dockHeightFromPointer(-9999, 900, CONTAINER), 560);
    assert.equal(dockHeightFromPointer(9999, 900, CONTAINER), G.minHeightPx);
    assert.ok(Number.isFinite(dockHeightFromPointer(Number.NaN, 900, CONTAINER)));
  });
});

/* ── teclado da divisória ─────────────────────────────────────────────────── */

describe('dockActionForKey: a divisória do dock é operável só com o teclado', () => {
  it('setas movem EXATAMENTE um passo (e ArrowUp faz o dock CRESCER)', () => {
    const base = dockReducer(INITIAL_DOCK_STATE, {
      type: 'resize',
      heightPx: 300,
      containerPx: CONTAINER,
    });
    const up = dockReducer(base, dockActionForKey('ArrowUp', base, CONTAINER) as DockAction);
    const down = dockReducer(base, dockActionForKey('ArrowDown', base, CONTAINER) as DockAction);
    assert.equal(up.heightPx, 300 + G.stepPx);
    assert.equal(down.heightPx, 300 - G.stepPx);
    assert.equal(up.heightPx - base.heightPx, G.stepPx);
  });

  it('PageUp/PageDown usam o passo grosso', () => {
    const base = dockReducer(INITIAL_DOCK_STATE, {
      type: 'resize',
      heightPx: 300,
      containerPx: CONTAINER,
    });
    assert.equal(
      dockReducer(base, dockActionForKey('PageUp', base, CONTAINER) as DockAction).heightPx,
      300 + G.coarseStepPx,
    );
    assert.equal(
      dockReducer(base, dockActionForKey('PageDown', base, CONTAINER) as DockAction).heightPx,
      300 - G.coarseStepPx,
    );
  });

  it('Home e End vão para as fronteiras (APG: menor e maior tamanho do líder)', () => {
    const b = dockHeightBounds(CONTAINER);
    const home = dockReducer(
      INITIAL_DOCK_STATE,
      dockActionForKey('Home', INITIAL_DOCK_STATE, CONTAINER) as DockAction,
    );
    const end = dockReducer(
      INITIAL_DOCK_STATE,
      dockActionForKey('End', INITIAL_DOCK_STATE, CONTAINER) as DockAction,
    );
    assert.equal(home.heightPx, b.min);
    assert.equal(end.heightPx, b.max);
  });

  it('Enter é o Enter da APG: colapsa e restaura a POSIÇÃO ANTERIOR', () => {
    const base = dockReducer(INITIAL_DOCK_STATE, {
      type: 'resize',
      heightPx: 512,
      containerPx: CONTAINER,
    });
    const closed = dockReducer(base, dockActionForKey('Enter', base, CONTAINER) as DockAction);
    assert.equal(closed.collapsed, true);
    const reopened = dockReducer(
      closed,
      dockActionForKey('Enter', closed, CONTAINER) as DockAction,
    );
    assert.equal(reopened.collapsed, false);
    assert.equal(reopened.heightPx, 512, 'Enter tem que restaurar a posição anterior');
  });

  it('com o dock recolhido, qualquer tecla de movimento reabre (nunca fica inerte)', () => {
    const closed = dockReducer(INITIAL_DOCK_STATE, { type: 'collapse' });
    for (const key of ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']) {
      const action = dockActionForKey(key, closed, CONTAINER);
      assert.deepEqual(action, { type: 'expand' }, `tecla ${key} inerte com o dock fechado`);
    }
  });

  it('devolve null para tudo que não trata (a onda 3 não sequestra a tecla)', () => {
    for (const key of ['ArrowLeft', 'ArrowRight', 'Tab', ' ', 'Escape', 'a', '']) {
      assert.equal(
        dockActionForKey(key, INITIAL_DOCK_STATE, CONTAINER),
        null,
        `tratou "${key}" indevidamente`,
      );
    }
  });

  it('DOCK_DIVIDER_KEYS declara exatamente as teclas tratadas', () => {
    for (const key of DOCK_DIVIDER_KEYS) {
      assert.notEqual(
        dockActionForKey(key, INITIAL_DOCK_STATE, CONTAINER),
        null,
        `${key} declarada mas não tratada`,
      );
    }
  });

  it('martelar a seta encosta na fronteira e para lá', () => {
    const b = dockHeightBounds(CONTAINER);
    let state = INITIAL_DOCK_STATE;
    for (let i = 0; i < 60; i += 1) {
      state = dockReducer(state, dockActionForKey('ArrowDown', state, CONTAINER) as DockAction);
      assert.ok(state.heightPx >= b.min, `passou do piso na iteração ${i}`);
      assert.equal(state.collapsed, false, 'a seta não pode colapsar o dock — isso é o Enter');
    }
    assert.equal(state.heightPx, b.min);
    for (let i = 0; i < 60; i += 1) {
      state = dockReducer(state, dockActionForKey('ArrowUp', state, CONTAINER) as DockAction);
      assert.ok(state.heightPx <= b.max, `passou do teto na iteração ${i}`);
    }
    assert.equal(state.heightPx, b.max);
  });
});

/* ── ARIA ─────────────────────────────────────────────────────────────────── */

describe('dockAriaValues: o que vai no role="separator" do dock', () => {
  it('valueMin <= valueNow <= valueMax em toda combinação varrida', () => {
    let checked = 0;
    for (let container = 120; container <= 2000; container += 17) {
      for (const height of [0, 100, 140, 260, 400, 900, 5000]) {
        for (const collapsed of [false, true]) {
          const state: DockState = {
            ...INITIAL_DOCK_STATE,
            collapsed,
            heightPx: clampDockHeight(height, container),
          };
          const a = dockAriaValues(state, container);
          assert.ok(
            Number.isInteger(a.valueNow) &&
              Number.isInteger(a.valueMin) &&
              Number.isInteger(a.valueMax),
            `valor não inteiro em container=${container}`,
          );
          assert.ok(
            a.valueMin <= a.valueNow && a.valueNow <= a.valueMax,
            `fora da faixa: ${a.valueMin} <= ${a.valueNow} <= ${a.valueMax} (container=${container}, h=${height}, collapsed=${collapsed})`,
          );
          checked += 1;
        }
      }
    }
    assert.ok(checked > 1000, `varredura fraca demais (${checked} casos)`);
  });

  it('recolhido, a posição anunciada é o MÍNIMO', () => {
    const closed = dockReducer(INITIAL_DOCK_STATE, { type: 'collapse' });
    const a = dockAriaValues(closed, CONTAINER);
    assert.equal(a.valueNow, a.valueMin);
    assert.equal(a.valueNow, Math.round((G.collapsedHeightPx / CONTAINER) * 100));
  });

  it('o traço do dock é horizontal, e o contêiner não medido não vira NaN', () => {
    assert.equal(dockAriaValues(INITIAL_DOCK_STATE, CONTAINER).orientation, 'horizontal');
    const a = dockAriaValues(INITIAL_DOCK_STATE);
    assert.ok(Number.isInteger(a.valueNow) && a.valueNow >= 0 && a.valueNow <= 100);
    assert.equal(a.valueMin, 0);
    assert.equal(a.valueMax, 100);
  });
});

/* ── identidade referencial ───────────────────────────────────────────────── */

describe('dockReducer: ação que não muda nada devolve o MESMO objeto', () => {
  it('não força re-render (nem repintura do terminal) à toa', () => {
    const s = INITIAL_DOCK_STATE;
    const noops: DockAction[] = [
      { type: 'select', tab: 'output' },
      { type: 'expand' },
      { type: 'seen' },
      { type: 'seen', tab: 'tests' },
      { type: 'notify', tab: 'output' },
      { type: 'resize', heightPx: G.defaultHeightPx },
      { type: 'hydrate', persisted: toDockPersistedState(s) },
      { type: 'nao-existe' } as unknown as DockAction,
    ];
    for (const action of noops) {
      assert.equal(dockReducer(s, action), s, `ação ${action.type} criou objeto novo à toa`);
    }
    const closed = dockReducer(s, { type: 'collapse' });
    assert.equal(dockReducer(closed, { type: 'collapse' }), closed);
  });
});

/* ── persistência ─────────────────────────────────────────────────────────── */

describe('readDockPersistedState / writeDockPersistedState: tolerância a lixo', () => {
  it('faz round-trip pela chave versionada', () => {
    const ls = makeStorage();
    const state = run(
      INITIAL_DOCK_STATE,
      { type: 'select', tab: 'feedback' },
      { type: 'resize', heightPx: 410, containerPx: CONTAINER },
      { type: 'collapse' },
    );
    writeDockPersistedState(state, ls);
    assert.deepEqual(readDockPersistedState(ls), {
      activeTab: 'feedback',
      collapsed: true,
      heightPx: 410,
    });
    assert.deepEqual(JSON.parse(ls.map.get(DOCK_STORAGE_KEY) as string), {
      version: DOCK_STORAGE_VERSION,
      activeTab: 'feedback',
      collapsed: true,
      heightPx: 410,
    });
  });

  it('sem nada guardado devolve o default', () => {
    assert.deepEqual(readDockPersistedState(makeStorage()), DEFAULT_DOCK_PERSISTED);
  });

  it('LIXO em todas as formas cai no default e NUNCA lança', () => {
    const garbage = [
      '',
      'null',
      'nope',
      '{',
      '[]',
      '"string"',
      '7',
      '{}',
      JSON.stringify({ version: 2, activeTab: 'tests', collapsed: true, heightPx: 400 }),
      JSON.stringify({ activeTab: 'tests', collapsed: true, heightPx: 400 }),
      JSON.stringify({ version: '1', activeTab: 'tests' }),
    ];
    for (const raw of garbage) {
      const ls = makeStorage({ [DOCK_STORAGE_KEY]: raw });
      let value = null as unknown;
      assert.doesNotThrow(() => {
        value = readDockPersistedState(ls);
      }, `lançou em ${JSON.stringify(raw)}`);
      assert.deepEqual(value, DEFAULT_DOCK_PERSISTED, `não caiu no default em ${raw}`);
    }
  });

  it('tolerância é por CAMPO: uma aba desconhecida não custa a altura ajustada', () => {
    const ls = makeStorage({
      [DOCK_STORAGE_KEY]: JSON.stringify({
        version: DOCK_STORAGE_VERSION,
        activeTab: 'terminal-antigo',
        collapsed: 'sim',
        heightPx: 380,
      }),
    });
    assert.deepEqual(readDockPersistedState(ls), {
      activeTab: DEFAULT_DOCK_PERSISTED.activeTab,
      collapsed: false,
      heightPx: 380,
    });
  });

  it('altura fora de faixa é clampada; altura sem sentido cai no default', () => {
    const clamped = makeStorage({
      [DOCK_STORAGE_KEY]: JSON.stringify({ version: 1, activeTab: 'tests', collapsed: false, heightPx: 99999 }),
    });
    assert.equal(readDockPersistedState(clamped).heightPx, G.unmeasuredMaxPx);
    const nonsense = makeStorage({
      [DOCK_STORAGE_KEY]: JSON.stringify({ version: 1, activeTab: 'tests', collapsed: false, heightPx: 'alto' }),
    });
    assert.equal(readDockPersistedState(nonsense).heightPx, G.defaultHeightPx);
  });

  it('storage que EXPLODE não derruba leitura, escrita nem limpeza', () => {
    const boom = makeThrowingStorage();
    let value = null as unknown;
    assert.doesNotThrow(() => {
      value = readDockPersistedState(boom);
    });
    assert.deepEqual(value, DEFAULT_DOCK_PERSISTED);
    assert.doesNotThrow(() => writeDockPersistedState(INITIAL_DOCK_STATE, boom));
    assert.doesNotThrow(() => clearDockPersistedState(boom));
  });

  it('sem storage nenhum (null explícito) devolve o default sem escrever', () => {
    assert.deepEqual(readDockPersistedState(null), DEFAULT_DOCK_PERSISTED);
    assert.doesNotThrow(() => writeDockPersistedState(INITIAL_DOCK_STATE, null));
  });

  it('clearDockPersistedState faz o próximo boot voltar ao default', () => {
    const ls = makeStorage();
    writeDockPersistedState({ activeTab: 'tests', collapsed: true, heightPx: 300 }, ls);
    clearDockPersistedState(ls);
    assert.deepEqual(readDockPersistedState(ls), DEFAULT_DOCK_PERSISTED);
  });
});

describe('readDockPersistedState: fronteira com globalThis.localStorage', () => {
  let previous: unknown;

  beforeEach(() => {
    previous = (globalThis as { localStorage?: unknown }).localStorage;
  });

  afterEach(() => {
    if (previous === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
    else (globalThis as { localStorage?: unknown }).localStorage = previous;
  });

  it('usa globalThis.localStorage quando o argumento é omitido', () => {
    (globalThis as { localStorage?: unknown }).localStorage = makeStorage();
    writeDockPersistedState({ activeTab: 'tests', collapsed: true, heightPx: 300 });
    assert.deepEqual(readDockPersistedState(), {
      activeTab: 'tests',
      collapsed: true,
      heightPx: 300,
    });
  });

  it('sem localStorage no ambiente (node puro) devolve o default', () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    assert.doesNotThrow(() => readDockPersistedState());
    assert.deepEqual(readDockPersistedState(), DEFAULT_DOCK_PERSISTED);
  });
});

describe('createDockState: hidratação', () => {
  it('sem nada persistido devolve o estado inicial', () => {
    assert.equal(createDockState(), INITIAL_DOCK_STATE);
    assert.equal(createDockState(null), INITIAL_DOCK_STATE);
  });

  it('hidrata aba, recolhimento e altura — e monta a Saída junto', () => {
    const state = createDockState({ activeTab: 'feedback', collapsed: true, heightPx: 350 });
    assert.equal(state.activeTab, 'feedback');
    assert.equal(state.collapsed, true);
    assert.equal(state.heightPx, 350);
    assert.equal(shouldRenderTab(state, 'output'), true, 'a Saída tem que nascer montada');
    assert.equal(shouldRenderTab(state, 'feedback'), true);
    assert.deepEqual(state.unseen, []);
  });

  it('a altura persistida absurda é clampada na hidratação', () => {
    assert.equal(
      createDockState({ activeTab: 'output', collapsed: false, heightPx: 99999 }).heightPx,
      G.unmeasuredMaxPx,
    );
    assert.equal(
      createDockState({ activeTab: 'output', collapsed: false, heightPx: 1 }).heightPx,
      G.minHeightPx,
    );
  });

  it('sobrevive ao ciclo completo storage → estado → storage', () => {
    const ls = makeStorage();
    const live = run(
      INITIAL_DOCK_STATE,
      { type: 'select', tab: 'tests' },
      { type: 'resize', heightPx: 400, containerPx: CONTAINER },
      { type: 'collapse' },
    );
    writeDockPersistedState(live, ls);
    const restored = createDockState(readDockPersistedState(ls));
    assert.equal(restored.activeTab, 'tests');
    assert.equal(restored.collapsed, true);
    assert.equal(restored.heightPx, 400);
    assert.equal(dockReducer(restored, { type: 'expand' }).heightPx, 400);
  });
});

/* ── contratos cruzados ───────────────────────────────────────────────────── */

describe('contratos cruzados do dock', () => {
  it('DOCK_MOTION anima uma propriedade que o nível spatial PODE animar', () => {
    assert.ok(
      (SPATIAL_ALLOWED_PROPERTIES as readonly string[]).includes(DOCK_MOTION.property),
      `${DOCK_MOTION.property} não está em SPATIAL_ALLOWED_PROPERTIES`,
    );
    assert.ok(!(SPATIAL_FORBIDDEN_PROPERTIES as readonly string[]).includes(DOCK_MOTION.property));
    assert.ok(DOCK_MOTION.durationMs > 0);
  });

  it('a geometria é coerente: recolhido < mínimo < default < teto provisório', () => {
    assert.ok(G.collapsedHeightPx < G.minHeightPx);
    assert.ok(G.minHeightPx <= G.defaultHeightPx);
    assert.ok(G.defaultHeightPx <= G.unmeasuredMaxPx);
    assert.ok(G.maxHeightRatio > 0 && G.maxHeightRatio < 1);
    assert.ok(G.stepPx > 0 && G.stepPx < G.coarseStepPx);
  });

  it('o default persistido é ele mesmo um estado válido', () => {
    assert.equal(isDockTabId(DEFAULT_DOCK_PERSISTED.activeTab), true);
    assert.equal(clampDockHeight(DEFAULT_DOCK_PERSISTED.heightPx), DEFAULT_DOCK_PERSISTED.heightPx);
  });
});
