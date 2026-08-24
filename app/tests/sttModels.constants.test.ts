/**
 * tests/sttModels.constants.test.ts — catálogo de STT local (onda 8).
 *
 * Cobre o catálogo on-device (languages pt-BR/en, arquivos do modelo Nemotron,
 * hint de língua) e o teste de PRESENÇA dos 5 arquivos no disco
 * (`resources/stt-models/`) — leitura, não inferência. Sem GPU, sem sherpa.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import * as fs from 'node:fs';

import {
  STT_MODEL_CATALOG,
  STT_SUPPORTED_LOCALES,
  DEFAULT_STT_MODEL,
  sttLanguageHint,
  sttAssetName,
} from '../electron/main/services/localStt/sttModels.constants';

describe('catálogo de STT local (Nemotron streaming)', () => {
  it('um modelo default, streaming, multilingual pt-BR + en', () => {
    assert.equal(STT_MODEL_CATALOG.length, 1);
    const m = STT_MODEL_CATALOG[0];
    assert.equal(m.id, 'nemotron-3.5-asr-streaming-0.6b-560ms-int8');
    assert.equal(m.mode, 'streaming');
    assert.deepEqual([...m.languages].sort(), ['en', 'pt-BR']);
    assert.ok(m.supportsLanguageHint);
  });

  it('SUPPORTED_LOCALES = pt-BR, en', () => {
    assert.deepEqual(STT_SUPPORTED_LOCALES, ['pt-BR', 'en']);
  });

  it('arquivos do catálogo: encoder/decoder/joiner/tokens (+ opcional VAD)', () => {
    const m = DEFAULT_STT_MODEL;
    const names = m.files.map((f) => f.name).sort();
    // O VAD silero é opcional; o obrigatório são as 3 peças + tokens.
    for (const required of ['encoder.int8.onnx', 'decoder.int8.onnx', 'joiner.int8.onnx', 'tokens.txt']) {
      assert.ok(names.includes(required), `faltou ${required}`);
    }
    assert.equal(m.modelFiles.tokens, 'tokens.txt');
    assert.ok(m.totalSizeBytes > 0);
  });

  it('sttAssetName prefixa com o modelId (namespace flat do mirror)', () => {
    assert.equal(sttAssetName('m1', 'tokens.txt'), 'm1__tokens.txt');
  });

  it('hint de língua: pt→pt, en→en, desconhecido→auto', () => {
    assert.equal(sttLanguageHint('pt-BR'), 'pt');
    assert.equal(sttLanguageHint('pt'), 'pt');
    assert.equal(sttLanguageHint('en'), 'en');
    assert.equal(sttLanguageHint('fr'), 'auto');
    assert.equal(sttLanguageHint(undefined), 'auto');
  });
});

/**
 * TESTE DE PRESENÇA (leitura de disco — os 5 arquivos do modelo devem existir
 * em resources/stt-models/<id>/). Estágio real desta wave; não roda inferência.
 */
describe('modelo de STT estagiado em resources/', () => {
  /**
   * CONDICIONAL ao disco: num snapshot de integração sem os modelos estagiados
   * (gitignored), o diretório NÃO existe — este teste deve PASSAR mesmo assim
   * (não é gate de presença no build/válid; o app degrada com gracefully).
   * Quando o dir existe, confere os 5 arquivos.
   */
  it('se estagiado, contém os 5 arquivos do modelo (passa sem o dir)', () => {
    const root = path.resolve(__dirname, '../resources/stt-models');
    const m = DEFAULT_STT_MODEL;
    const dir = path.join(root, m.id);
    if (!fs.existsSync(dir)) {
      // Snapshot sem modelos → degradação; nada a conferir, não é falha.
      assert.ok(true, 'modelo ausente no snapshot — teste de presença tolera');
      return;
    }
    const present = fs.readdirSync(dir).sort();
    for (const f of m.files.map((x) => x.name)) {
      assert.ok(present.includes(f), `faltou ${f} em ${dir}`);
    }
  });

  /**
   * DEGRADAÇÃO GRACIOSA (a pedido do orquestrador, gate sem modelos): se o
   * diretório embutido não existe, o catálogo NÃO crasha — o status de
   * instalação é simplesmente `false` (nunca lança). Nenhuma escrita em disco
   * acontece (índice vazio, modelo embutido ausente).
   */
  it('catálogo lida com modelo não-estagiado sem lançar (installed:false)', async () => {
    const { createSttModelStore } = await import(
      '../electron/main/services/localStt/sttModelStore'
    );
    const store = createSttModelStore({
      // Caminho inexistente: o índice não existe e o embedded também não —
      // o store degrada sem escrever nada (índice vazio + embedded ausente).
      userDataPath: '/definitely/not/staged/userdata',
      embeddedModelsPath: '/definitely/not/staged/resources',
    });
    const status = await store.getCatalogWithStatus();
    assert.equal(status.length, 1);
    assert.equal(status[0].installed, false, 'não-estagiado ⇒ installed:false');
    const dir = await store.getModelDirForLoad(status[0].id);
    assert.equal(dir, null, 'sem modelo → dir null, nunca lança');
  });
});