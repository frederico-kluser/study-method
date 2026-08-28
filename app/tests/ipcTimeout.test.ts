/**
 * tests/ipcTimeout.test.ts — helper withTimeout (sem jsdom; módulo puro em
 * src/lib, coberto pelo tsconfig.node.json como os demais).
 *
 * O contrato: (a) chamada rápida resolve; (b) chamada muda REJEITA com
 * IpcTimeoutError identificável; (c) rejeição original propaga quando chega
 * antes do prazo; (d) resolução/rejeição TARDIA da chamada não vira unhandled
 * rejection (o race a consome) e o timer é limpo.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  IPC_TIMEOUT_MS,
  IpcTimeoutError,
  isTimeoutError,
  withTimeout,
} from '../src/lib/ipcTimeout';

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('withTimeout', () => {
  it('resolve com o valor quando a chamada chega antes do prazo', async () => {
    const value = await withTimeout(Promise.resolve(42), 200, 'canal.rapido');
    assert.equal(value, 42);
  });

  it('rejeita com IpcTimeoutError quando a chamada nunca resolve no prazo', async () => {
    const slow = delay(150).then(() => 'tarde demais');
    await assert.rejects(withTimeout(slow, 20, 'canal.lento'), (err: unknown) => {
      return isTimeoutError(err) && err.label === 'canal.lento';
    });
  });

  it('a mensagem do erro identifica canal e prazo', async () => {
    const slow = delay(150).then(() => 'tarde demais');
    await assert.rejects(
      withTimeout(slow, 20, 'canal.lento'),
      /"canal\.lento" não respondeu em 20ms/,
    );
  });

  it('propaga a rejeição ORIGINAL quando a chamada falha antes do prazo', async () => {
    const boom = Promise.reject(new Error('canal quebrou'));
    await assert.rejects(withTimeout(boom, 200, 'canal.erro'), /canal quebrou/);
    await delay(20); // deixa o timer do race limpar (sem timer pendurado)
  });

  it('resolução tardia da chamada não vira unhandled rejection', async () => {
    const late = delay(60).then(() => 'atrasada');
    await assert.rejects(withTimeout(late, 10, 'canal.lenta'), isTimeoutError);
    await delay(120); // a chamada original resolve DEPOIS do timeout — precisa existir pós-teste
  });

  it('rejeição tardia da chamada não vira unhandled rejection', async () => {
    const late = delay(60).then(() => {
      throw new Error('falhou depois do prazo');
    });
    await assert.rejects(withTimeout(late, 10, 'canal.lenta'), isTimeoutError);
    await delay(120); // a rejeição original é consumida pelo race, não pelo processo
  });
});

describe('isTimeoutError', () => {
  it('distingue timeout de erro comum', () => {
    assert.equal(isTimeoutError(new IpcTimeoutError('x', 10)), true);
    assert.equal(isTimeoutError(new Error('comum')), false);
    assert.equal(isTimeoutError('string'), false);
    assert.equal(isTimeoutError(undefined), false);
    assert.equal(isTimeoutError(null), false);
    assert.equal(isTimeoutError({}), false);
  });
});

describe('IPC_TIMEOUT_MS', () => {
  it('10s — folgado para chamadas legítimas (<100ms hoje)', () => {
    assert.equal(IPC_TIMEOUT_MS, 10_000);
  });
});
