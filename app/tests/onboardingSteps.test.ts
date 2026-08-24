/**
 * tests/onboardingSteps.test.ts — validação dos steps e alvos do tutorial.
 *
 * Sem jsdom (node:test + tsx). Guarda o CONTRATO da onda 12:
 *   1. i18n: todo `titleKey`/`descriptionKey`/`chapter.titleKey` dos steps
 *      existe em pt-BR E en (paridade exata — strictKeyChecks);
 *   2. Alvos: todo id do `ONBOARDING_TARGET_CATALOG` aparece como
 *      `data-onboarding-target="<id>"` em ALGUM arquivo .tsx de src (grep);
 *   3. Steps: cada `targetSelector` referencia um id do catálogo; ids únicos;
 *      capítulos declarados; chaves i18n são todas `translation:tutorial.*`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import ptBR from '../src/i18n/locales/pt-BR/translation.json';
import en from '../src/i18n/locales/en/translation.json';
import {
  ONBOARDING_STEPS,
  FIRST_ONBOARDING_STEP_ID,
  ONBOARDING_CHAPTERS,
} from '../src/features/onboarding/constants/onboardingSteps';
import { ONBOARDING_TARGET_CATALOG } from '../src/features/onboarding/constants/onboardingTargets';

/* ─── helpers ─────────────────────────────────────────────────────── */

type JsonRecord = Record<string, unknown>;

function flattenKeys(obj: JsonRecord, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return flattenKeys(value as JsonRecord, path);
    }
    return [path];
  });
}

function valueAt(obj: JsonRecord, dotted: string): unknown {
  return dotted
    .split('.')
    .reduce<unknown>((acc, part) => (acc as JsonRecord | undefined)?.[part], obj);
}

/** Varre src/ recursivamente por arquivos .tsx (grep do marcador de alvo). */
function srcTsxFiles(): string[] {
  const root = join(__dirname, '..', 'src');
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.tsx')) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
}

const PT_KEYS = flattenKeys(ptBR as JsonRecord);
const EN_KEYS = flattenKeys(en as JsonRecord);

/* ─── 1. i18n: chaves dos steps existem (paridade) ────────────────── */

describe('onboarding steps: chaves i18n existem em pt-BR e en', () => {
  const usedKeys = [
    ...ONBOARDING_STEPS.flatMap((s) => [s.titleKey, s.descriptionKey]),
    ...ONBOARDING_CHAPTERS.map((c) => c.titleKey),
  ].map((k) => k.replace(/^translation:/, ''));

  it('cada chave de step/capítulo existe nos DOIS resources', () => {
    for (const key of usedKeys) {
      assert.ok(PT_KEYS.includes(key), `pt-BR falta a chave "${key}"`);
      assert.ok(EN_KEYS.includes(key), `en falta a chave "${key}"`);
    }
  });

  it('pt-BR e en têm PARIDADE EXATA (mesmo conjunto achatado)', () => {
    assert.deepEqual(
      [...EN_KEYS].sort(),
      [...PT_KEYS].sort(),
      'pt-BR e en devem compartilhar as MESMAS chaves',
    );
  });

  it('cada valor de step/capítulo é string não-vazia em ambos', () => {
    for (const key of usedKeys) {
      const p = valueAt(ptBR as JsonRecord, key);
      const e = valueAt(en as JsonRecord, key);
      assert.equal(typeof p, 'string', `pt-BR["${key}"] deve ser string`);
      assert.equal(typeof e, 'string', `en["${key}"] deve ser string`);
      assert.ok((p as string).trim().length > 0, `pt-BR["${key}"] não pode ser vazio`);
      assert.ok((e as string).trim().length > 0, `en["${key}"] não pode ser vazio`);
    }
  });

  it('toda chave dos steps usa o prefixo tutorial.* (strictKeyChecks)', () => {
    const allUsed = usedKeys.filter((k) => !k.startsWith('tutorial.'));
    assert.deepEqual(allUsed, [], `chaves fora de tutorial.* nos steps: ${allUsed.join(', ')}`);
  });
});

/* ─── 2. Alvos: catálogo ↔ data-onboarding-target no código ────────── */

describe('onboarding targets: catálogo sincronizado com o JSX', () => {
  const sources = srcTsxFiles().map((f) => readFileSync(f, 'utf8'));
  const allSource = sources.join('\n');

  it('todo id do catálogo existe como data-onboarding-target no código', () => {
    for (const id of Object.keys(ONBOARDING_TARGET_CATALOG)) {
      // Aceita tanto o atributo JSX literal (`data-onboarding-target="id"`)
      // quanto a forma de prop de objeto MUI (`'data-onboarding-target': 'id'`),
      // usada em slotProps.htmlInput (ex.: TextField da LessonView).
      assert.ok(
        allSource.includes(`data-onboarding-target="${id}"`) ||
          allSource.includes(`'data-onboarding-target': '${id}'`),
        `faltou data-onboarding-target="${id}" em algum .tsx`,
      );
    }
  });

  it('todo step referencia um alvo do catálogo no targetSelector', () => {
    const knownIds = Object.keys(ONBOARDING_TARGET_CATALOG);
    for (const step of ONBOARDING_STEPS) {
      const match = /data-onboarding-target="([^"]+)"/.exec(step.targetSelector);
      assert.ok(match, `step ${step.id} precisa de um data-onboarding-target no seletor`);
      assert.ok(
        knownIds.includes(match[1]),
        `step ${step.id} referencia alvo desconhecido "${match[1]}"`,
      );
    }
  });

  it('steps apontam para a aba correta (view consistente com o catálogo)', () => {
    for (const step of ONBOARDING_STEPS) {
      const match = /data-onboarding-target="([^"]+)"/.exec(step.targetSelector);
      const meta = ONBOARDING_TARGET_CATALOG[match?.[1] ?? ''];
      if (meta?.everywhere) continue;
      if (!meta?.view) continue;
      // Steps de shell podem ser everywhere; steps view-específicos batem com o
      // catálogo OU ficam undefined quando o alvo existe em qualquer aba.
      assert.equal(
        step.view ?? meta.view,
        meta.view,
        `step ${step.id} view deve bater com o alvo (${meta.view})`,
      );
    }
  });
});

/* ─── 3. Steps: integridade estrutural ─────────────────────────────── */

describe('onboarding steps: integridade', () => {
  it('ids são únicos', () => {
    const ids = ONBOARDING_STEPS.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, 'ids de steps duplicados');
  });

  it('FIRST_ONBOARDING_STEP_ID é o primeiro step', () => {
    assert.equal(ONBOARDING_STEPS[0]?.id, FIRST_ONBOARDING_STEP_ID);
  });

  it('todo capítulo usado pelos steps existe em ONBOARDING_CHAPTERS', () => {
    const chapterIds = new Set(ONBOARDING_CHAPTERS.map((c) => c.id));
    for (const step of ONBOARDING_STEPS) {
      assert.ok(chapterIds.has(step.chapterId), `capítulo "${step.chapterId}" não declarado`);
    }
  });

  it('exatamente um step final (isLast) e ele é o último', () => {
    const last = ONBOARDING_STEPS.filter((s) => s.isLast);
    assert.equal(last.length, 1, 'esperado exatamente 1 step final');
    assert.equal(ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1]?.id, last[0]?.id);
  });

  it('capítulos declarados também têm chave i18n existente', () => {
    for (const c of ONBOARDING_CHAPTERS) {
      assert.ok(PT_KEYS.includes(c.titleKey.replace(/^translation:/, '')));
    }
  });
});