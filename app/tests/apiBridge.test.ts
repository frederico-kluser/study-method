/**
 * tests/apiBridge.test.ts — bridge de API testável sem jsdom.
 *
 * `getApi()` devolve a API exposta no global (window.api no renderer) por
 * padrão; `__setApiForTests` injeta um fake e `__resetApiForTests()` restaura.
 * Nenhum componente é montado aqui — só a lógica de troca do slot.
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { ApiSchema } from '../electron/preload/api-schema';
import {
  getApi,
  __setApiForTests,
  __resetApiForTests,
} from '../src/lib/apiBridge';

type AnyRecord = Record<string, unknown>;
type GlobalRef = AnyRecord & { window?: AnyRecord };

/** Cria um fake com a hierarquia grupo->metodo, cada método uma promise. */
function makeFakeApi(tag: string): ApiSchema {
  const method = (name: string) => (..._args: unknown[]) =>
    Promise.resolve(`${tag}:${name}`);
  const scope: AnyRecord = {
    keys: {
      getStatus: method('keys.getStatus'),
      setKey: method('keys.setKey'),
      validateLlm: method('keys.validateLlm'),
      validateBrave: method('keys.validateBrave'),
    },
    localAi: {
      detectHardware: method('localAi.detectHardware'),
      recommend: method('localAi.recommend'),
      list: method('localAi.list'),
      download: method('localAi.download'),
      delete: method('localAi.delete'),
      getActive: method('localAi.getActive'),
      setActive: method('localAi.setActive'),
      onDownloadProgress: method('localAi.onDownloadProgress'),
    },
    study: {
      generateLesson: method('study.generateLesson'),
      onLessonProgress: method('study.onLessonProgress'),
    },
  };
  return scope as unknown as ApiSchema;
}

function saveWindowApi(globalRef: GlobalRef): unknown {
  return globalRef.window?.api;
}

describe('apiBridge', () => {
  afterEach(() => {
    __resetApiForTests();
    const g = globalThis as unknown as GlobalRef;
    delete g.api;
    if (g.window) delete g.window.api;
  });

  it('getApi() devolve a API do global (default) quando nenhum fake é injetado', () => {
    const windowApi = { keys: { getStatus: () => Promise.resolve('real') } };
    (globalThis as unknown as GlobalRef).window = { api: windowApi } as AnyRecord;
    __resetApiForTests();
    assert.equal(getApi(), windowApi);
  });

  it('__setApiForTests injeta um fake e getApi() retorna ele', () => {
    const fake = makeFakeApi('fake');
    __setApiForTests(fake);
    assert.equal(getApi(), fake);
  });

  it('__resetApiForTests cancela o fake e volta ao global', () => {
    const windowApi = { keys: {} };
    const saved = saveWindowApi(globalThis as unknown as GlobalRef);
    void saved;
    (globalThis as unknown as GlobalRef).window = { api: windowApi } as AnyRecord;
    const fake = makeFakeApi('fake');
    __setApiForTests(fake);
    assert.equal(getApi(), fake);
    __resetApiForTests();
    assert.equal(getApi(), windowApi);
  });

  it('methods chamados como promises (invoke-backed)', async () => {
    __setApiForTests(makeFakeApi('fake'));
    const api = getApi();
    const result = await api.keys.validateLlm('sk-test');
    assert.equal(result, 'fake:keys.validateLlm');
    assert.equal(await api.localAi.list(), 'fake:localAi.list');
  });

  it('getApi() lança erro claro sem API global', () => {
    __resetApiForTests();
    const g = globalThis as unknown as GlobalRef;
    delete g.api;
    if (g.window) delete g.window.api;
    assert.throws(() => getApi(), /window.api não está disponível/);
  });
});