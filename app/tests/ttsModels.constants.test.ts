/**
 * tests/ttsModels.constants.test.ts — catálogo de TTS local (onda 8).
 *
 * Cobre `defaultVoiceFor` (função pura), os ids/idioma/sampleRate das DUAS
 * vozes Piper e a resolução de modelo por locale. Sem engine, sem GPU.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  TTS_MODEL_CATALOG,
  TTS_DEFAULT_VOICES,
  DEFAULT_TTS_MODEL,
  defaultVoiceFor,
  resolveTtsModelForLocale,
  getTtsModelById,
} from '../src/shared/constants/ttsModels.constants';

describe('catalogo de TTS local (Piper)', () => {
  it('idota as DUAS vozes esperadas com sampleRate 22050', () => {
    const ids = TTS_MODEL_CATALOG.map((m) => m.id).sort();
    assert.deepEqual(ids, ['piper-en-amy', 'piper-pt-br-faber']);
    for (const entry of TTS_MODEL_CATALOG) {
      assert.equal(entry.sampleRate, 22050, `${entry.id} deveria ser 22.05 kHz`);
      assert.equal(entry.family, 'vits', `${entry.id} deveria ser VITS`);
    }
  });

  it('resolve por id', () => {
    assert.ok(getTtsModelById('piper-pt-br-faber'), 'faber existe');
    assert.equal(getTtsModelById('nope'), undefined);
  });

  it('vozes default: Amy (en) e Faber (pt-BR)', () => {
    const byId = (id: string) => TTS_DEFAULT_VOICES.find((v) => v.id === id);
    assert.equal(byId('amy')?.modelId, 'piper-en-amy');
    assert.equal(byId('faber')?.modelId, 'piper-pt-br-faber');
    for (const v of TTS_DEFAULT_VOICES) assert.equal(v.sid, 0, 'Piper é single-speaker');
  });
});

describe('defaultVoiceFor(lng) — função pura', () => {
  it('pt-BR/pt → faber', () => {
    assert.equal(defaultVoiceFor('pt-BR'), 'faber');
    assert.equal(defaultVoiceFor('pt'), 'faber');
  });

  it('en/en-US → amy', () => {
    assert.equal(defaultVoiceFor('en'), 'amy');
    assert.equal(defaultVoiceFor('en-US'), 'amy');
  });

  it('locales desconhecidos/ausentes caem no default (amy)', () => {
    assert.equal(defaultVoiceFor('fr'), 'amy');
    assert.equal(defaultVoiceFor(undefined), 'amy');
  });
});

describe('resolveTtsModelForLocale', () => {
  it('pt-BR → piper-pt-br-faber; en → piper-en-amy', () => {
    assert.equal(resolveTtsModelForLocale('pt-BR').id, 'piper-pt-br-faber');
    assert.equal(resolveTtsModelForLocale('en').id, 'piper-en-amy');
  });

  it('desconhecido → default (en)', () => {
    assert.equal(resolveTtsModelForLocale('de').id, DEFAULT_TTS_MODEL.id);
  });
});