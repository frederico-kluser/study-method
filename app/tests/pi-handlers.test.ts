/**
 * tests/pi-handlers.test.ts — complemento unitário dos handlers do Pi coding
 * agent (onda 3 / sub-onda pi): cobre validatePiExecuteRequest (todas as
 * validações de shape), pi:get-status com checkPiSdk injetado e com o default
 * (importa @mariozechner/pi-*) e registerPiHandlers com ipc fake injetado.
 * O caminho pi:execute/abort já é coberto em study-wiring.test.ts.
 */
import { afterEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { PI_CHANNELS } from '../shared/ipc-contract';
import {
  buildPiHandlers,
  registerPiHandlers,
  validatePiExecuteRequest,
} from '../electron/main/ipc/pi-handlers';

let fetchMock: ReturnType<typeof mock.method> | undefined;

describe('validatePiExecuteRequest', () => {
  it('valida cada campo do shape PiExecuteRequest', () => {
    // null/não-objeto.
    assert.match(validatePiExecuteRequest(null) ?? '', /objeto/);
    assert.match(validatePiExecuteRequest(undefined) ?? '', /objeto/);
    assert.match(validatePiExecuteRequest('x') ?? '', /objeto/);
    assert.match(validatePiExecuteRequest(42) ?? '', /objeto/);
    // prompt ausente/vazio.
    assert.match(validatePiExecuteRequest({ modelConfig: { provider: 'p', model: 'm' } }) ?? '', /prompt/);
    assert.match(validatePiExecuteRequest({ prompt: '', modelConfig: {} }) ?? '', /prompt/);
    assert.match(validatePiExecuteRequest({ prompt: '   ', modelConfig: {} }) ?? '', /prompt/);
    // modelConfig ausente.
    assert.match(validatePiExecuteRequest({ prompt: 'x' }) ?? '', /modelConfig/);
    assert.match(validatePiExecuteRequest({ prompt: 'x', modelConfig: null }) ?? '', /modelConfig/);
    // provider ausente/vazio.
    assert.match(validatePiExecuteRequest({ prompt: 'x', modelConfig: {} }) ?? '', /provider/);
    assert.match(validatePiExecuteRequest({ prompt: 'x', modelConfig: { provider: ' ' } }) ?? '', /provider/);
    // model ausente/vazio.
    assert.match(validatePiExecuteRequest({ prompt: 'x', modelConfig: { provider: 'p' } }) ?? '', /model/);
    assert.match(validatePiExecuteRequest({ prompt: 'x', modelConfig: { provider: 'p', model: '' } }) ?? '', /model/);
    // válido → null.
    assert.equal(validatePiExecuteRequest({ prompt: 'x', modelConfig: { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' } }), null);
    // O provider LEGADO continua passando na validação de shape (o
    // redirecionamento para 'openrouter' é do piProviderMapper, não daqui).
    assert.equal(validatePiExecuteRequest({ prompt: 'x', modelConfig: { provider: 'deepseek', model: 'm' } }), null);
  });
});

describe('buildPiHandlers — pi:get-status', () => {
  it('checkPiSdk injetado true → available sem message; false → available com message', async () => {
    const ok = buildPiHandlers({ getService: async () => ({ execute: async () => ({ success: true, output: '', executionTimeMs: 0 }), abort: () => {} }), emit: () => {}, checkPiSdk: async () => true });
    const r1 = await ok.get(PI_CHANNELS.GET_STATUS)!() as { available: boolean; message?: string };
    assert.equal(r1.available, true);
    assert.equal(r1.message, undefined);

    const no = buildPiHandlers({ getService: async () => ({ execute: async () => ({ success: false, output: '', executionTimeMs: 0 }), abort: () => {} }), emit: () => {}, checkPiSdk: async () => false });
    const r2 = await no.get(PI_CHANNELS.GET_STATUS)!() as { available: boolean; message?: string };
    assert.equal(r2.available, false);
    assert.match(r2.message ?? '', /Pi SDK não disponível/);
  });

  it('sem checkPiSdk usa o default (importa @mariozechner/pi-*) → available true', async () => {
    const handlers = buildPiHandlers({
      getService: async () => ({ execute: async () => ({ success: true, output: '', executionTimeMs: 0 }), abort: () => {} }),
      emit: () => {},
    });
    const r = await handlers.get(PI_CHANNELS.GET_STATUS)!() as { available: boolean };
    assert.equal(r.available, true);
  });
});

describe('buildPiHandlers — pi:execute validation via validatePiExecuteRequest', () => {
  afterEach(() => {
    fetchMock?.mock.restore();
    fetchMock = undefined;
  });

  it('prompt vazio → PiExecuteResult de erro estruturado (não chama serviço)', async () => {
    let executed = false;
    const handlers = buildPiHandlers({
      getService: async () => ({ execute: async () => { executed = true; return { success: true, output: '', executionTimeMs: 0 }; }, abort: () => {} }),
      emit: () => {},
    });
    const res = await handlers.get(PI_CHANNELS.EXECUTE)!(undefined, { prompt: '', modelConfig: { provider: 'p', model: 'm' } }) as { success: boolean; error?: string; output: string; executionTimeMs: number };
    assert.equal(res.success, false);
    assert.match(res.error ?? '', /prompt/);
    assert.equal(res.output, '');
    assert.equal(res.executionTimeMs, 0);
    assert.equal(executed, false, 'shape inválido não toca o serviço');
  });
});

describe('registerPiHandlers (ipc injetado)', () => {
  it('liga o map via safeHandleMap num ipc fake', async () => {
    const map = new Map<string, (...a: unknown[]) => unknown>();
    const ipc = {
      handlers: map,
      removeHandler: (c: string) => map.delete(c),
      handle: (c: string, fn: (...a: unknown[]) => unknown) => map.set(c, fn),
    };
    await registerPiHandlers({
      getService: async () => ({ execute: async () => ({ success: true, output: '', executionTimeMs: 0 }), abort: () => {} }),
      emit: () => {},
    }, ipc as never);
    assert.ok(map.has(PI_CHANNELS.EXECUTE));
    assert.ok(map.has(PI_CHANNELS.ABORT));
    assert.ok(map.has(PI_CHANNELS.GET_STATUS));
  });
});