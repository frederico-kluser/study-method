/**
 * tests/onboardingSignals.test.ts — ACHADO-5 (não obrigar a redigitar chaves
 * já configuradas).
 *
 * O passo `settings-keys-filled` era satisfeito apenas lendo o `value` dos
 * inputs da KeysPanel. Com chaves JÁ configuradas (gate/status `configured`),
 * os inputs ficam vazios e o passo travava. A correção soma ao `keysFilled` o
 * sinal `keys-configured` (vindo do status do KeysPanel).
 *
 * Sem jsdom (node:test + tsx); o `document` mínimo é injetado via globalThis.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { buildRuntimeContext, type SignalElement } from '../src/features/onboarding/logic/onboardingSignals';

interface DocLike {
  querySelector(selector: string): SignalElement | null;
  querySelectorAll(selector: string): SignalElement[] | ArrayLike<SignalElement>;
}

/** Nó mínimo com `getAttribute` (+ opcional value/text/filhos). */
function node(spec: {
  attrs?: Record<string, string>;
  value?: string;
  text?: string;
  children?: Record<string, SignalElement>;
}): SignalElement {
  const n: SignalElement = {
    getAttribute: (name: string) => spec.attrs?.[name] ?? null,
  };
  if (spec.value !== undefined) n.value = spec.value;
  if (spec.text !== undefined) n.textContent = spec.text;
  if (spec.children) {
    (n as unknown as { querySelector: (s: string) => SignalElement | null }).querySelector =
      (s: string) => spec.children?.[s] ?? null;
  }
  return n;
}

interface DocSpec {
  /** data-onboarding-signal "name:value" presentes. */
  signals?: Record<string, string>;
  /** inputs da KeysPanel dentro de settings-keys-section (índice → valor). */
  keysInputs?: string[];
  /** value do input de assunto (lesson-subject). */
  subjectValue?: string;
  /** texto do editor (challenge-editor .cm-content). */
  editorText?: string;
}

function installDocument(spec: DocSpec): void {
  // Nós de sinais (para querySelectorAll por prefixo).
  const signalNodes: SignalElement[] = [];
  if (spec.signals) {
    for (const [name, value] of Object.entries(spec.signals)) {
      signalNodes.push(node({ attrs: { 'data-onboarding-signal': `${name}:${value}` } }));
    }
  }

  const keysSection = node({
    attrs: { 'data-onboarding-target': 'settings-keys-section' },
    children: {
      input: node({ value: spec.keysInputs?.[0] ?? '' }),
      textarea: node({ value: '' }),
    },
  });
  (keysSection as unknown as { querySelectorAll: (s: string) => SignalElement[] }).querySelectorAll =
    (s: string) => (s === 'input' ? (spec.keysInputs ?? []).map((v) => node({ value: v })) : []);

  const doc: DocLike = {
    querySelector: (selector: string) => {
      if (selector.includes('settings-keys-section')) return keysSection;
      if (selector.includes('lesson-subject')) {
        return node({ attrs: { 'data-onboarding-target': 'lesson-subject' }, value: spec.subjectValue ?? '' });
      }
      if (selector.includes('challenge-editor')) {
        return node({
          attrs: { 'data-onboarding-target': 'challenge-editor' },
          text: spec.editorText ?? '',
          children: { '.cm-content': node({ text: spec.editorText ?? '' }) },
        });
      }
      return null;
    },
    querySelectorAll: (selector: string) => {
      const m = /data-onboarding-signal\^="([^"]+)"/.exec(selector);
      if (m) {
        const prefix = m[1];
        return signalNodes.filter(
          (n) => n.getAttribute('data-onboarding-signal')?.startsWith(prefix) ?? false,
        );
      }
      return signalNodes;
    },
  };
  (globalThis as unknown as { document: DocLike }).document = doc;
}

function removeDocument(): void {
  delete (globalThis as unknown as { document?: DocLike }).document;
}

describe('buildRuntimeContext: keysFilled', () => {
  beforeEach(removeDocument);
  afterEach(removeDocument);

  it('satisfaz quando os inputs têm as duas chaves (valor digitado)', () => {
    installDocument({ keysInputs: ['sk-a', 'bs-b'] });
    const ctx = buildRuntimeContext('settings');
    assert.equal(ctx.keysFilled, true);
  });

  it('NÃO satisfaz com inputs vazios e sem sinal de configurado', () => {
    installDocument({ keysInputs: ['', ''] });
    const ctx = buildRuntimeContext('settings');
    assert.equal(ctx.keysFilled, false);
  });

  it('satisfaz via sinal keys-configured=true MESMO com inputs vazios (chaves já no store)', () => {
    installDocument({ keysInputs: ['', ''], signals: { 'keys-configured': 'true' } });
    const ctx = buildRuntimeContext('settings');
    assert.equal(ctx.keysFilled, true, 'não deve obrigar a redigitar chaves salvas');
  });

  it('mantém NÃO satisfeito quando o sinal é false e inputs vazios', () => {
    installDocument({ keysInputs: ['', ''], signals: { 'keys-configured': 'false' } });
    const ctx = buildRuntimeContext('settings');
    assert.equal(ctx.keysFilled, false);
  });

  it('espelha sinais de lesson/test e o sinal de chaves', () => {
    installDocument({
      keysInputs: ['', ''],
      signals: {
        'lesson-status': 'done',
        'test-status': 'running',
        'keys-configured': 'true',
      },
    });
    const ctx = buildRuntimeContext('challenge');
    assert.equal(ctx.lessonRunningOrDone, true);
    assert.equal(ctx.testAnswerTriggered, true);
    assert.equal(ctx.keysFilled, true);
  });

  it('sem document → estado zero', () => {
    removeDocument();
    const ctx = buildRuntimeContext('home');
    assert.equal(ctx.keysFilled, false);
    assert.equal(ctx.lessonRunningOrDone, false);
  });
});