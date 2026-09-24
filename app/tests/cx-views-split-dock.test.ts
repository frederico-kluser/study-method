/**
 * tests/cx-views-split-dock.test.ts — GOLDEN MASTER de `src/lib/splitRatio.ts`
 * e `src/lib/dockState.ts` para as ondas de refatoração.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO É
 * ══════════════════════════════════════════════════════════════════════════
 * Caracterização das MÁQUINAS de layout do Desafio: a aritmética do split-pane
 * (razão ⟷ px, fronteiras efetivas, teclado, ARIA, persistência das DUAS
 * divisórias) e o reducer/seletores do dock inferior. tests/splitRatio.test.ts
 * e tests/dockState.test.ts provam os contratos de produto; ESTE arquivo fixa
 * as SAÍDAS EXATAS — inclusive os caminhos de erro e limite (contêiner
 * degenerado, NaN, lixo no storage, tecla não tratada, ação em estado
 * proibido) — para que a refatoração não deslize um centímetro sem que a suíte
 * reprove.
 *
 * Reprodução: `cd app && npm test -- tests/cx-views-split-dock.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  clampSplitRatio,
  clearShellSplitRatio,
  clearSplitRatio,
  DEFAULT_SHELL_SPLIT_RATIO,
  DEFAULT_SPLIT_RATIO,
  nextRatioForKey,
  pxToRatio,
  ratioFromPointer,
  ratioToPx,
  readShellSplitRatio,
  readSplitRatio,
  roundSplitRatio,
  SHELL_SPLIT_CONSTRAINTS,
  SHELL_SPLIT_RATIO_STORAGE_KEY,
  SHELL_SPLIT_CONSTRAINTS as SHELL_C,
  SPLIT_CONSTRAINTS,
  SPLIT_KEYS,
  SPLIT_MOTION,
  SPLIT_RATIO_PRECISION,
  SPLIT_RATIO_STORAGE_KEY,
  SPLIT_RATIO_STORAGE_VERSION,
  splitAriaValues,
  splitBounds,
  writeShellSplitRatio,
  writeSplitRatio,
  type StorageLike,
} from '../src/lib/splitRatio';
import {
  clampDockHeight,
  clearDockPersistedState,
  createDockState,
  DEFAULT_DOCK_PERSISTED,
  DOCK_DIVIDER_KEYS,
  DOCK_GEOMETRY,
  DOCK_STORAGE_KEY,
  DOCK_STORAGE_VERSION,
  DOCK_TAB_IDS,
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
  type DockState,
  type DockTabId,
} from '../src/lib/dockState';
import { SPATIAL_ALLOWED_PROPERTIES } from '../src/lib/designTokens';

/* ─── Um storage de memória que registra e pode FALHAR (as duas direções) ── */

class FakeStorage implements StorageLike {
  dados = new Map<string, string>();
  leituras = 0;
  gravacoes: Array<[string, string]> = [];
  remocoes: string[] = [];
  constructor(
    private readonly falhaGet = false,
    private readonly falhaSet = false,
    private readonly falhaRemove = false,
  ) {}
  getItem(key: string): string | null {
    this.leituras += 1;
    if (this.falhaGet) throw new Error('storage privado');
    return this.dados.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.falhaSet) throw new Error('quota estourou');
    this.dados.set(key, value);
    this.gravacoes.push([key, value]);
  }
  removeItem(key: string): void {
    if (this.falhaRemove) throw new Error('sem permissão');
    this.dados.delete(key);
    this.remocoes.push(key);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * 1. SPLIT — aritmética pura da divisória enunciado ⟷ editor
 * ══════════════════════════════════════════════════════════════════════════ */

describe('roundSplitRatio / splitBounds', () => {
  it('a razão é arredondada em SPLIT_RATIO_PRECISION casas (corta a deriva do arraste)', () => {
    assert.equal(SPLIT_RATIO_PRECISION, 4);
    assert.equal(roundSplitRatio(0.45678), 0.4568);
    assert.equal(roundSplitRatio(0.99999), 1);
    assert.equal(roundSplitRatio(0.12344), 0.1234);
  });

  it('contêiner NÃO medido (0, negativo, NaN, Infinity) → fronteiras de razão cruas', () => {
    for (const container of [0, -1, NaN, Infinity, -Infinity]) {
      assert.deepEqual(
        { ...splitBounds(container) },
        { min: SPLIT_CONSTRAINTS.minRatio, max: SPLIT_CONSTRAINTS.maxRatio, measured: false, feasible: false, usablePx: 0 },
        `container=${container}`,
      );
    }
  });

  it('contêiner medido e VIÁVEL: o piso de px por painel entra nas fronteiras efetivas', () => {
    // 2000 − 8 = 1992 úteis; piso 280/1992 ≈ 0,1406 < minRatio 0,2 ⇒ faixa crua.
    assert.deepEqual(
      { ...splitBounds(2000) },
      { min: 0.2, max: 0.8, measured: true, feasible: true, usablePx: 1992 },
    );
    // 1000 − 8 = 992 úteis; piso 280/992 ≈ 0,2823 ⇒ o piso REAL é o de px.
    const apertado = splitBounds(1000);
    assert.ok(Math.abs(apertado.min - 280 / 992) < 1e-12);
    assert.ok(Math.abs(apertado.max - (1 - 280 / 992)) < 1e-12);
    assert.equal(apertado.feasible, true);
  });

  it('contêiner INVIÁVEL (não cabe minPanePx dos dois lados): as fronteiras colapsam no MEIO', () => {
    // 500 − 8 = 492; piso 280/492 ≈ 0,569 > 1 − 0,569 ⇒ min > max ⇒ meia-meia.
    assert.deepEqual(
      { ...splitBounds(500) },
      { min: 0.5, max: 0.5, measured: true, feasible: false, usablePx: 492 },
    );
  });

  it('contêiner menor que a própria divisória: usablePx zera e o MEIO ainda fecha a faixa', () => {
    assert.deepEqual(
      { ...splitBounds(8) },
      { min: 0.5, max: 0.5, measured: true, feasible: false, usablePx: 0 },
    );
  });

  it('min <= max vale em QUALQUER contêiner (o que impede aria-valuenow de sair da faixa)', () => {
    for (let px = -10; px <= 3000; px += 7) {
      const b = splitBounds(px);
      assert.ok(b.min <= b.max, `min ${b.min} > max ${b.max} em ${px}px`);
    }
  });
});

describe('clampSplitRatio / ratioToPx / pxToRatio / ratioFromPointer', () => {
  it('clamp usa as fronteiras EFETIVAS e entrada não-finita cai no default clampado', () => {
    assert.equal(clampSplitRatio(0.99, 2000), 0.8);
    assert.equal(clampSplitRatio(0.01, 2000), 0.2);
    assert.equal(clampSplitRatio(NaN, 2000), DEFAULT_SPLIT_RATIO);
    assert.equal(clampSplitRatio(Infinity, 2000), DEFAULT_SPLIT_RATIO);
    assert.equal(clampSplitRatio(0.45678, 2000), 0.4568, 'arredonda antes de clampar');
  });

  it('ratioToPx: primaryPx arredonda e secondaryPx sai por SUBTRAÇÃO (a soma fecha EXATA)', () => {
    for (const [ratio, px] of [[0.5, 2000], [0.45, 1000], [0.2, 377]] as const) {
      const out = ratioToPx(ratio, px);
      assert.equal(out.primaryPx + out.secondaryPx + out.dividerPx, px, `soma em ${px}px`);
      assert.equal(out.dividerPx, SPLIT_CONSTRAINTS.dividerPx);
    }
  });

  it('ratioToPx sem contêiner medido devolve zeros (nada de px inventado)', () => {
    assert.deepEqual(
      { ...ratioToPx(0.5, 0) },
      { ratio: 0.5, primaryPx: 0, secondaryPx: 0, dividerPx: SPLIT_CONSTRAINTS.dividerPx },
    );
    // razão não-finita cai no default — aí sim aparece o DEFAULT_SPLIT_RATIO.
    assert.deepEqual(
      { ...ratioToPx(NaN, 0) },
      { ratio: DEFAULT_SPLIT_RATIO, primaryPx: 0, secondaryPx: 0, dividerPx: SPLIT_CONSTRAINTS.dividerPx },
    );
  });

  it('pxToRatio converte pelo usable e cai no default quando não há o que converter', () => {
    assert.ok(Math.abs(pxToRatio(498, 1000) - 0.502) < 1e-9);
    assert.equal(pxToRatio(99999, 1000), clampSplitRatio(0.99999, 1000), 'fora da faixa é clampado');
    assert.equal(pxToRatio(100, 0), DEFAULT_SPLIT_RATIO, 'contêiner não medido');
    assert.equal(pxToRatio(NaN, 1000), DEFAULT_SPLIT_RATIO, 'px não-finito');
  });

  it('ratioFromPointer desconta o CENTRO da divisória (meia espessura)', () => {
    // ponteiro 508 num contêiner de 1000 com divisória 8 ⇒ painel líder termina em 504.
    assert.ok(Math.abs(ratioFromPointer(508, 0, 1000) - roundSplitRatio(504 / 992)) < 1e-12);
    assert.equal(ratioFromPointer(NaN, 0, 1000), DEFAULT_SPLIT_RATIO);
    assert.equal(ratioFromPointer(500, NaN, 1000), DEFAULT_SPLIT_RATIO, 'origem não-finita também');
  });
});

describe('nextRatioForKey — teclado APG (null = tecla não tratada)', () => {
  it('setas movem UM PASSO, na direção da orientação do TRAÇO', () => {
    // vertical (traço vertical, painéis lado a lado): ← diminui, → aumenta.
    assert.equal(nextRatioForKey('ArrowLeft', 0.5, 2000), 0.48);
    assert.equal(nextRatioForKey('ArrowRight', 0.5, 2000), 0.52);
    // horizontal (traço horizontal, painel líder em cima): ↑ diminui, ↓ aumenta.
    assert.equal(nextRatioForKey('ArrowUp', 0.5, 2000, { orientation: 'horizontal' }), 0.48);
    assert.equal(nextRatioForKey('ArrowDown', 0.5, 2000, { orientation: 'horizontal' }), 0.52);
    assert.deepEqual({ ...SPLIT_KEYS.vertical }, { decrease: 'ArrowLeft', increase: 'ArrowRight' });
    assert.deepEqual({ ...SPLIT_KEYS.horizontal }, { decrease: 'ArrowUp', increase: 'ArrowDown' });
  });

  it('PageUp/PageDown movem o passo GROSSO (adição fora da APG), Home/End vão às fronteiras', () => {
    assert.equal(nextRatioForKey('PageUp', 0.5, 2000), 0.4);
    assert.equal(nextRatioForKey('PageDown', 0.5, 2000), 0.6);
    assert.equal(nextRatioForKey('Home', 0.5, 2000), splitBounds(2000).min);
    assert.equal(nextRatioForKey('End', 0.5, 2000), splitBounds(2000).max);
  });

  it('tecla estranha (e o Enter — que aqui NÃO colapsa) devolve null', () => {
    for (const tecla of ['Enter', 'Tab', 'Escape', 'a', '', 'ArrowUp']) {
      // ArrowUp SÓ não é tratada na orientação vertical — cai no null aqui.
      assert.equal(nextRatioForKey(tecla, 0.5, 2000), null, `tecla "${tecla}" no split vertical`);
    }
  });

  it('nas fronteiras a tecla continua tratada e a razão não escapa da faixa', () => {
    const min = splitBounds(2000).min;
    const max = splitBounds(2000).max;
    assert.equal(nextRatioForKey('ArrowLeft', min, 2000), min);
    assert.equal(nextRatioForKey('ArrowRight', max, 2000), max);
  });
});

describe('splitAriaValues', () => {
  it('em % inteira: min/max vêm das fronteiras EFETIVAS e now é clampado antes do arredondamento', () => {
    assert.deepEqual({ ...splitAriaValues(0.45, 2000) }, { valueNow: 45, valueMin: 20, valueMax: 80, orientation: 'vertical' });
    assert.equal(splitAriaValues(0.45, 2000, 'horizontal').orientation, 'horizontal');
    const apertado = splitAriaValues(0.45, 1000);
    assert.equal(apertado.valueMin, Math.round((280 / 992) * 100), 'o piso ANUNCIADO é o real (px), não 20');
  });

  it('valueMin <= valueNow <= valueMax varrendo contêineres × razões', () => {
    for (const px of [0, 8, 500, 1000, 1400, 2000, 5000]) {
      for (const ratio of [-1, 0, 0.2, 0.5, 0.9, 1, NaN]) {
        const a = splitAriaValues(ratio, px);
        assert.ok(a.valueMin <= a.valueNow, `min ${a.valueMin} > now ${a.valueNow} (${px}/${ratio})`);
        assert.ok(a.valueNow <= a.valueMax, `now ${a.valueNow} > max ${a.valueMax} (${px}/${ratio})`);
      }
    }
  });
});

describe('persistência do split — a do Desafio e a do SHELL não brigam', () => {
  it('leitura tolerante a lixo: ausente, JSON quebrado, versão errada, tipo errado, fora de faixa ⇒ default', () => {
    const casos: Array<[string, unknown]> = [
      ['vazio', ''],
      ['JSON quebrado', '{ops'],
      ['não-objeto', '42'],
      ['versão errada', JSON.stringify({ version: SPLIT_RATIO_STORAGE_VERSION + 1, ratio: 0.5 })],
      ['ratio string', JSON.stringify({ version: 1, ratio: '0.5' })],
      ['ratio fora de faixa (baixo)', JSON.stringify({ version: 1, ratio: 0.05 })],
      ['ratio fora de faixa (alto)', JSON.stringify({ version: 1, ratio: 0.95 })],
    ];
    for (const [rotulo, raw] of casos) {
      const st = new FakeStorage();
      st.dados.set(SPLIT_RATIO_STORAGE_KEY, raw as string);
      assert.equal(readSplitRatio(st), DEFAULT_SPLIT_RATIO, rotulo);
    }
    assert.equal(readSplitRatio(new FakeStorage()), DEFAULT_SPLIT_RATIO, 'chave ausente');
    assert.equal(readSplitRatio(null), DEFAULT_SPLIT_RATIO, 'sem storage nenhum');
  });

  it('leitura com storage que LANÇA também cai no default (modo privado)', () => {
    assert.equal(readSplitRatio(new FakeStorage(true)), DEFAULT_SPLIT_RATIO);
  });

  it('payload válido volta ARREDONDADO na faixa', () => {
    const st = new FakeStorage();
    st.dados.set(SPLIT_RATIO_STORAGE_KEY, JSON.stringify({ version: 1, ratio: 0.55555 }));
    assert.equal(readSplitRatio(st), 0.5556);
  });

  it('gravação clampa e arredonda; não-finito NÃO grava; falha de quota é silenciosa', () => {
    const st = new FakeStorage();
    writeSplitRatio(0.99999, st);
    assert.deepEqual(JSON.parse(st.dados.get(SPLIT_RATIO_STORAGE_KEY)!), { version: 1, ratio: 0.8 });
    writeSplitRatio(0.56789, st);
    assert.equal(readSplitRatio(st), 0.5679);
    writeSplitRatio(NaN, st);
    writeSplitRatio(Infinity, st);
    assert.equal(st.gravacoes.length, 2, 'valor não-finito não é gravado');
    assert.doesNotThrow(() => writeSplitRatio(0.5, new FakeStorage(false, true)));
  });

  it('clear remove a chave e também é silencioso com storage quebrado', () => {
    const st = new FakeStorage();
    st.dados.set(SPLIT_RATIO_STORAGE_KEY, 'x');
    clearSplitRatio(st);
    assert.deepEqual(st.remocoes, [SPLIT_RATIO_STORAGE_KEY]);
    assert.doesNotThrow(() => clearSplitRatio(new FakeStorage(false, true, true)));
    assert.doesNotThrow(() => clearSplitRatio(null));
  });

  it('a divisória do SHELL tem chave, faixa e default PRÓPRIOS', () => {
    assert.notEqual(SHELL_SPLIT_RATIO_STORAGE_KEY, SPLIT_RATIO_STORAGE_KEY, 'chaves distintas');
    assert.equal(DEFAULT_SHELL_SPLIT_RATIO, 0.2);
    assert.deepEqual({ ...SHELL_SPLIT_CONSTRAINTS }, {
      minRatio: 0.14, maxRatio: 0.5, minPanePx: 180, dividerPx: 6, stepRatio: 0.02, coarseStepRatio: 0.1,
    });
    const st = new FakeStorage();
    assert.equal(readShellSplitRatio(st), DEFAULT_SHELL_SPLIT_RATIO);
    writeShellSplitRatio(0.3, st);
    assert.equal(readShellSplitRatio(st), 0.3);
    // as DUAS divisórias guardam cada uma a sua — gravar uma não toca a outra.
    assert.equal(readSplitRatio(st), DEFAULT_SPLIT_RATIO);
    clearShellSplitRatio(st);
    assert.equal(readShellSplitRatio(st), DEFAULT_SHELL_SPLIT_RATIO);
  });

  it('a leitura do shell rejeita fora da FAIXA DO SHELL (0.5 é o teto dele, não 0.8)', () => {
    const st = new FakeStorage();
    st.dados.set(SHELL_SPLIT_RATIO_STORAGE_KEY, JSON.stringify({ version: 1, ratio: 0.6 }));
    assert.equal(readShellSplitRatio(st), DEFAULT_SHELL_SPLIT_RATIO);
    writeShellSplitRatio(0.9, st);
    assert.equal(readShellSplitRatio(st), SHELL_C.maxRatio, 'a gravação clampa no teto do shell');
  });

  it('constantes de movimento: o split anima flex-basis com a curva SPATIAL', () => {
    assert.deepEqual({ ...SPLIT_MOTION }, {
      property: 'flex-basis',
      durationMs: 105,
      easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    });
    assert.ok(
      (SPATIAL_ALLOWED_PROPERTIES as readonly string[]).includes(SPLIT_MOTION.property),
      'flex-basis é a única propriedade que este movimento pode animar',
    );
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 2. DOCK — a máquina de estados da gaveta Saída/Testes/Feedback
 * ══════════════════════════════════════════════════════════════════════════ */

describe('dockHeightBounds / clampDockHeight', () => {
  it('contêiner não medido ⇒ faixa provisória [140, 640]', () => {
    for (const px of [undefined, 0, -3, NaN, Infinity, '800']) {
      assert.deepEqual(
        { ...dockHeightBounds(px as never) },
        { min: DOCK_GEOMETRY.minHeightPx, max: DOCK_GEOMETRY.unmeasuredMaxPx, measured: false, feasible: false },
        `container=${String(px)}`,
      );
    }
  });

  it('contêiner normal: min fixo, max = 70% da altura, feasible', () => {
    assert.deepEqual({ ...dockHeightBounds(1000) }, { min: 140, max: 700, measured: true, feasible: true });
  });

  it('contêiner apertado: as duas fronteiras colapsam no teto possível (sem sair do contêiner)', () => {
    // 100px de contêiner: rawMax = 70 < 140 ⇒ única altura possível é 70.
    assert.deepEqual({ ...dockHeightBounds(100) }, { min: 70, max: 70, measured: true, feasible: false });
    // layout degenerado (menor que a barra recolhida): nunca acima do contêiner.
    assert.deepEqual({ ...dockHeightBounds(30) }, { min: 30, max: 30, measured: true, feasible: false });
  });

  it('clamp: não-finito cai no default; tudo arredonda e nunca sai de [min, max]', () => {
    assert.equal(clampDockHeight(NaN, 1000), DOCK_GEOMETRY.defaultHeightPx);
    assert.equal(clampDockHeight(5000, 1000), 700);
    assert.equal(clampDockHeight(50, 1000), 140);
    assert.equal(clampDockHeight(260.4, 1000), 260);
    assert.equal(clampDockHeight(260.6, 1000), 261);
  });
});

describe('dockReducer — as transições, uma a uma', () => {
  const base: DockState = { ...INITIAL_DOCK_STATE };

  it('estado inicial: aba "output" já montada (o terminal precisa existir antes do 1º teste)', () => {
    assert.deepEqual({ ...INITIAL_DOCK_STATE }, {
      activeTab: 'output',
      collapsed: false,
      heightPx: DOCK_GEOMETRY.defaultHeightPx,
      mountedTabs: ['output'],
      unseen: [],
    });
  });

  it('select: SEMPRE abre a gaveta, monta a aba e limpa o marcador dela', () => {
    const recolhido = dockReducer(base, { type: 'collapse' });
    const s = dockReducer(recolhido, { type: 'select', tab: 'tests' });
    assert.equal(s.collapsed, false);
    assert.equal(s.activeTab, 'tests');
    assert.deepEqual([...s.mountedTabs], ['output', 'tests'], 'ordem canônica, recolhido ≠ destruído');
    assert.deepEqual([...s.unseen], []);
  });

  it('reveal: force abre o recolhido; sem force respeita o recolhido e só ACENDE o marcador', () => {
    const recolhido = dockReducer(base, { type: 'collapse' });
    const forçado = dockReducer(recolhido, { type: 'reveal', tab: 'feedback', force: true });
    assert.equal(forçado.collapsed, false);
    assert.equal(forçado.activeTab, 'feedback');

    const educado = dockReducer(recolhido, { type: 'reveal', tab: 'feedback' });
    assert.equal(educado.collapsed, true, 'o usuário fechou de propósito — o programa avisa, não desobedece');
    assert.deepEqual([...educado.unseen], ['feedback']);
    assert.deepEqual([...educado.mountedTabs], ['output', 'feedback']);

    const aberto = dockReducer(base, { type: 'reveal', tab: 'output' });
    assert.deepEqual([...aberto.unseen], [], 'aba já à vista não carrega marcador');
  });

  it('notify: conteúdo chegando monta a aba; visível NÃO marca, invisível marca', () => {
    const visivel = dockReducer(base, { type: 'notify', tab: 'output' });
    assert.deepEqual([...visivel.unseen], [], 'a aba ativa e aberta já está sendo vista');
    const invisivel = dockReducer(base, { type: 'notify', tab: 'tests' });
    assert.deepEqual([...invisivel.unseen], ['tests']);
    assert.deepEqual([...invisivel.mountedTabs], ['output', 'tests']);
  });

  it('seen limpa uma aba ou todas; expand limpa a ativa; collapse PRESERVA a altura', () => {
    let s = dockReducer(base, { type: 'reveal', tab: 'tests' });
    s = dockReducer(s, { type: 'notify', tab: 'feedback' });
    assert.deepEqual([...s.unseen], ['feedback']);
    s = dockReducer(s, { type: 'seen' });
    assert.deepEqual([...s.unseen], []);

    s = dockReducer(s, { type: 'notify', tab: 'tests' });
    s = dockReducer(s, { type: 'notify', tab: 'feedback' });
    s = dockReducer(s, { type: 'seen', tab: 'tests' });
    assert.deepEqual([...s.unseen], ['feedback'], 'limpa só a aba dita');

    const altura = 400;
    s = dockReducer(s, { type: 'resize', heightPx: altura, containerPx: 1000 });
    const fechado = dockReducer(s, { type: 'collapse' });
    assert.equal(fechado.heightPx, altura, 'a altura de restauração é intocável');
    const reaberto = dockReducer(fechado, { type: 'expand' });
    assert.equal(reaberto.heightPx, altura, 'reabrir volta para ONDE ESTAVA, não para o default');
  });

  it('toggle alterna; resize recolhido é IGNORADO (mesma referência); resize aberto clampa', () => {
    const aberto = dockReducer(base, { type: 'toggle' });
    assert.equal(aberto.collapsed, true);
    assert.equal(dockReducer(aberto, { type: 'toggle' }).collapsed, false);

    const recolhido = dockReducer(base, { type: 'collapse' });
    assert.equal(dockReducer(recolhido, { type: 'resize', heightPx: 500, containerPx: 1000 }), recolhido);

    const redimensionado = dockReducer(base, { type: 'resize', heightPx: 500, containerPx: 1000 });
    assert.equal(redimensionado.heightPx, 500);
    assert.equal(dockReducer(base, { type: 'resize', heightPx: 99999, containerPx: 1000 }).heightPx, 700);
  });

  it('ações repetidas devolvem a MESMA referência (o terminal não repinta à toa)', () => {
    const s = dockReducer(base, { type: 'select', tab: 'output' });
    assert.equal(s, base, 'já estava na aba output e aberto');
    assert.equal(dockReducer(base, { type: 'seen' }), base, 'sem marcador não há o que limpar');
    assert.equal(dockReducer(base, { type: 'expand' }), base, 'já estava aberto');
    const recolhido = dockReducer(base, { type: 'collapse' });
    assert.equal(dockReducer(recolhido, { type: 'collapse' }), recolhido, 'já estava recolhido');
  });

  it('hydrate: monta output + aba ativa, aplica o que veio e clampa a altura', () => {
    const s = dockReducer(base, {
      type: 'hydrate',
      persisted: { activeTab: 'feedback', collapsed: true, heightPx: 99999 },
    });
    assert.equal(s.activeTab, 'feedback');
    assert.equal(s.collapsed, true);
    assert.equal(s.heightPx, 640, 'a altura persistida passa pelo clamp');
    assert.deepEqual([...s.mountedTabs], ['output', 'feedback']);
  });

  it('RECOLHIDO ≠ DESTRUÍDO: nenhuma sequência de ações tira uma aba de mountedTabs', () => {
    const acoes = [
      { type: 'select', tab: 'tests' },
      { type: 'notify', tab: 'feedback' },
      { type: 'collapse' },
      { type: 'reveal', tab: 'output' },
      { type: 'toggle' },
      { type: 'seen' },
      { type: 'resize', heightPx: 10 },
      { type: 'expand' },
      { type: 'select', tab: 'feedback' },
    ] as const;
    let s: DockState = base;
    const montadas: DockTabId[] = [];
    for (const a of acoes) {
      s = dockReducer(s, a as never);
      for (const tab of s.mountedTabs) if (!montadas.includes(tab)) montadas.push(tab);
      for (const tab of montadas) {
        assert.equal(shouldRenderTab(s, tab), true, `aba ${tab} sumiu do DOM após ${a.type}`);
      }
    }
  });
});

describe('seletores e altura renderizada', () => {
  it('shouldRenderTab/isTabVisible/hasUnseen dizem coisas DIFERENTES e certas', () => {
    const s: DockState = {
      activeTab: 'tests',
      collapsed: true,
      heightPx: 300,
      mountedTabs: ['output', 'tests'],
      unseen: ['feedback'],
    };
    assert.equal(shouldRenderTab(s, 'output'), true, 'montada, mesmo invisível');
    assert.equal(shouldRenderTab(s, 'feedback'), false);
    assert.equal(isTabVisible(s, 'tests'), false, 'recolhido: nada está "à vista"');
    assert.equal(isTabVisible({ ...s, collapsed: false }, 'tests'), true);
    assert.equal(isTabVisible({ ...s, collapsed: false }, 'output'), false, 'não é a aba da frente');
    assert.equal(hasUnseen(s, 'feedback'), true);
  });

  it('dockRenderedHeightPx: recolhido mostra a barra (limitada ao contêiner); aberto, a altura viva', () => {
    assert.equal(dockRenderedHeightPx({ ...INITIAL_DOCK_STATE, collapsed: true }), DOCK_GEOMETRY.collapsedHeightPx);
    assert.equal(dockRenderedHeightPx({ ...INITIAL_DOCK_STATE, collapsed: true }, 20), 20);
    assert.equal(dockRenderedHeightPx({ ...INITIAL_DOCK_STATE, heightPx: 400 }, 1000), 400);
    assert.equal(dockRenderedHeightPx({ ...INITIAL_DOCK_STATE, heightPx: 4000 }, 1000), 700, 'clampa no teto');
  });

  it('os ids ARIA são estáveis e derivam do id da aba', () => {
    for (const tab of DOCK_TAB_IDS) {
      assert.equal(dockTabElementId(tab), `challenge-dock-tab-${tab}`);
      assert.equal(dockTabPanelId(tab), `challenge-dock-panel-${tab}`);
    }
    assert.deepEqual([...DOCK_TAB_IDS], ['output', 'tests', 'feedback'], 'ordem canônica do fluxo');
    assert.equal(isDockTabId('output'), true);
    assert.equal(isDockTabId('tests'), true);
    assert.equal(isDockTabId('feedback'), true);
    for (const ruim of ['saída', '', null, undefined, 3, {}, 'output ']) {
      assert.equal(isDockTabId(ruim), false, `${String(ruim)} não é aba`);
    }
  });
});

describe('dockActionForKey / dockHeightFromPointer — a divisória do dock (painel líder EMBAIXO)', () => {
  const aberto: DockState = { ...INITIAL_DOCK_STATE, heightPx: 260 };

  it('Enter é o da APG: toggle (colapsa/estava colapsado restaura)', () => {
    assert.deepEqual({ ...dockActionForKey('Enter', aberto)! }, { type: 'toggle' });
    assert.deepEqual({ ...dockActionForKey('Enter', { ...aberto, collapsed: true })! }, { type: 'toggle' });
  });

  it('tecla não tratada → null (o chamador só faz preventDefault quando há ação)', () => {
    for (const tecla of ['Tab', 'Escape', 'x', '']) {
      assert.equal(dockActionForKey(tecla, aberto), null, `tecla "${tecla}"`);
    }
    assert.deepEqual([...DOCK_DIVIDER_KEYS], ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Enter']);
  });

  it('RECOLHIDO, qualquer tecla de movimento vira expand (a divisória nunca fica inerte)', () => {
    const recolhido = { ...aberto, collapsed: true };
    for (const tecla of ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']) {
      assert.deepEqual({ ...dockActionForKey(tecla, recolhido)! }, { type: 'expand' }, tecla);
    }
  });

  it('aberto, ↑ FAZ CRESCER o dock e ↓ encolhe (a inversão do painel líder embaixo)', () => {
    const cima = dockActionForKey('ArrowUp', aberto, 1000)!;
    const baixo = dockActionForKey('ArrowDown', aberto, 1000)!;
    assert.equal((cima as { heightPx: number }).heightPx, 260 + DOCK_GEOMETRY.stepPx);
    assert.equal((baixo as { heightPx: number }).heightPx, 260 - DOCK_GEOMETRY.stepPx);
    const grossoCima = dockActionForKey('PageUp', aberto, 1000)! as { heightPx: number };
    const grossoBaixo = dockActionForKey('PageDown', aberto, 1000)! as { heightPx: number };
    assert.equal(grossoCima.heightPx, 260 + DOCK_GEOMETRY.coarseStepPx);
    assert.equal(grossoBaixo.heightPx, 260 - DOCK_GEOMETRY.coarseStepPx);
  });

  it('Home/End vão às fronteiras efetivas (min/max de altura)', () => {
    const home = dockActionForKey('Home', aberto, 1000)! as { heightPx: number };
    const end = dockActionForKey('End', aberto, 1000)! as { heightPx: number };
    assert.equal(home.heightPx, 140);
    assert.equal(end.heightPx, 700);
  });

  it('dockHeightFromPointer: a altura é a distância até a base do contêiner, clamped', () => {
    assert.equal(dockHeightFromPointer(900, 1200, 1000), 300);
    assert.equal(dockHeightFromPointer(0, 1200, 1000), 700, 'clampa no teto do contêiner');
    assert.equal(dockHeightFromPointer(NaN, 1200, 1000), DOCK_GEOMETRY.defaultHeightPx, 'ponteiro não-finito → default');
    assert.equal(dockHeightFromPointer(900, NaN, 1000), DOCK_GEOMETRY.defaultHeightPx);
  });
});

describe('dockAriaValues', () => {
  it('horizontal, em % do contêiner — piso e teto CONTÊM a posição atual', () => {
    assert.deepEqual(
      { ...dockAriaValues({ ...INITIAL_DOCK_STATE, heightPx: 260 }, 1000) },
      { valueNow: 26, valueMin: 4, valueMax: 70, orientation: 'horizontal' },
    );
  });

  it('sem contêiner medido: faixa nominal 0–100 e agora clampado dentro dela', () => {
    const a = dockAriaValues({ ...INITIAL_DOCK_STATE, heightPx: 260 });
    assert.equal(a.valueMin, 0);
    assert.equal(a.valueMax, 100);
    assert.equal(a.orientation, 'horizontal');
    assert.ok(a.valueMin <= a.valueNow && a.valueNow <= a.valueMax);
  });

  it('em QUALQUER contêiner (inclusive degenerado): valueMin <= valueNow <= valueMax', () => {
    for (const px of [10, 30, 100, 400, 1000, 3000]) {
      for (const heightPx of [0, 40, 140, 500, 9999]) {
        for (const collapsed of [true, false]) {
          const a = dockAriaValues({ ...INITIAL_DOCK_STATE, heightPx, collapsed }, px);
          assert.ok(a.valueMin <= a.valueNow, `min ${a.valueMin} > now ${a.valueNow} (${px}/${heightPx})`);
          assert.ok(a.valueNow <= a.valueMax, `now ${a.valueNow} > max ${a.valueMax} (${px}/${heightPx})`);
        }
      }
    }
  });
});

describe('dockActionForSignal — o auto-foco é transição NOMEADA', () => {
  it('cada sinal do ciclo do desafio mapeia para a ação do contrato', () => {
    assert.deepEqual({ ...dockActionForSignal('test:started')! }, { type: 'reveal', tab: 'output', force: true });
    assert.deepEqual({ ...dockActionForSignal('test:passed')! }, { type: 'reveal', tab: 'tests' });
    assert.deepEqual({ ...dockActionForSignal('test:failed')! }, { type: 'reveal', tab: 'tests' });
    assert.deepEqual({ ...dockActionForSignal('feedback:started')! }, { type: 'notify', tab: 'feedback' });
    assert.deepEqual({ ...dockActionForSignal('feedback:done')! }, { type: 'reveal', tab: 'feedback' });
    assert.deepEqual({ ...dockActionForSignal('output:appended')! }, { type: 'notify', tab: 'output' });
  });

  it('sinal desconhecido (ou vazio, ou não-string) → null', () => {
    for (const sinal of ['', 'test:started ', 'foo', 'TEST:STARTED', null, undefined, 42]) {
      assert.equal(dockActionForSignal(sinal as never), null, String(sinal));
    }
  });
});

describe('persistência do dock — tolerante a lixo, campo a campo', () => {
  it('ausente, JSON quebrado e versão errada ⇒ default SÃO', () => {
    assert.deepEqual({ ...readDockPersistedState(new FakeStorage()) }, DEFAULT_DOCK_PERSISTED);
    const quebrado = new FakeStorage();
    quebrado.dados.set(DOCK_STORAGE_KEY, '{ops');
    assert.deepEqual({ ...readDockPersistedState(quebrado) }, DEFAULT_DOCK_PERSISTED);
    const versao = new FakeStorage();
    versao.dados.set(DOCK_STORAGE_KEY, JSON.stringify({ version: DOCK_STORAGE_VERSION + 1, activeTab: 'tests', heightPx: 400 }));
    assert.deepEqual({ ...readDockPersistedState(versao) }, DEFAULT_DOCK_PERSISTED, 'mudou a FORMA ⇒ descarta tudo');
    assert.deepEqual({ ...readDockPersistedState(new FakeStorage(true)) }, DEFAULT_DOCK_PERSISTED, 'getItem que lançou');
    assert.deepEqual({ ...readDockPersistedState(null) }, DEFAULT_DOCK_PERSISTED);
  });

  it('tolerância por CAMPO: aba desconhecida não faz o aluno perder a altura ajustada', () => {
    const st = new FakeStorage();
    st.dados.set(DOCK_STORAGE_KEY, JSON.stringify({
      version: 1,
      activeTab: 'saída-inventada',
      collapsed: 'sim',
      heightPx: 431,
    }));
    assert.deepEqual({ ...readDockPersistedState(st) }, {
      activeTab: 'output',
      collapsed: false,
      heightPx: 431, // a altura SOBREVIVE ao campo trocado
    });
  });

  it('altura fora de faixa é clampada na leitura; não-numérica vira default', () => {
    const st = new FakeStorage();
    st.dados.set(DOCK_STORAGE_KEY, JSON.stringify({ version: 1, heightPx: 99999 }));
    assert.equal(readDockPersistedState(st).heightPx, 640);
    st.dados.set(DOCK_STORAGE_KEY, JSON.stringify({ version: 1, heightPx: -5 }));
    assert.equal(readDockPersistedState(st).heightPx, 140);
    st.dados.set(DOCK_STORAGE_KEY, JSON.stringify({ version: 1, heightPx: 'duzentos' }));
    assert.equal(readDockPersistedState(st).heightPx, DEFAULT_DOCK_PERSISTED.heightPx);
  });

  it('gravação sanitiza (aba inválida → output, collapsed booleano, altura clamped) e é silenciosa', () => {
    const st = new FakeStorage();
    writeDockPersistedState({ activeTab: 'oops' as DockTabId, collapsed: 1 as never, heightPx: 99999 }, st);
    assert.deepEqual(JSON.parse(st.dados.get(DOCK_STORAGE_KEY)!), {
      version: 1,
      activeTab: 'output',
      collapsed: false,
      heightPx: 640,
    });
    assert.doesNotThrow(() => writeDockPersistedState(INITIAL_DOCK_STATE, new FakeStorage(false, true)));
    assert.doesNotThrow(() => clearDockPersistedState(new FakeStorage(false, true, true)));
  });

  it('toDockPersistedState é o recorte vivo (runtime não persiste) e createDockState hidrata', () => {
    const vivo: DockState = {
      activeTab: 'tests',
      collapsed: true,
      heightPx: 333.7,
      mountedTabs: ['output', 'tests', 'feedback'],
      unseen: ['feedback'],
    };
    assert.deepEqual({ ...toDockPersistedState(vivo) }, { activeTab: 'tests', collapsed: true, heightPx: 334 });

    // POR VALOR, e não por referência: sem storage persistido o estado nasce
    // IGUAL ao inicial — `return INITIAL_DOCK_STATE` e
    // `return { ...INITIAL_DOCK_STATE }` são o mesmo comportamento, e exigir a
    // identidade reprovaria a segunda sem mudar nada observável. A identidade
    // SÓ é contrato no NO-OP do `dockReducer` ("Devolve o MESMO objeto quando a
    // ação não muda nada", dockState.ts — o useReducer não força re-render):
    // nas asserções de lá, ela continua exigida.
    assert.deepEqual(createDockState(), INITIAL_DOCK_STATE);
    assert.deepEqual(createDockState(null), INITIAL_DOCK_STATE);
    const hidratado = createDockState({ activeTab: 'feedback', collapsed: true, heightPx: 500 });
    assert.equal(hidratado.activeTab, 'feedback');
    assert.equal(hidratado.collapsed, true);
    assert.equal(hidratado.heightPx, 500);
    assert.deepEqual([...hidratado.mountedTabs], ['output', 'feedback']);
    assert.deepEqual([...hidratado.unseen], [], 'unseen é de runtime, não volta do storage');
  });
});
