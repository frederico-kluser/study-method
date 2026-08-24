/**
 * tests/llmProxyService.test.ts — LlmProxyService com um `fork` injetável fake.
 * SEM rede/binários/electron: prova os dois bugs da onda2-llm-local.
 *
 *  - BUG 1 (BLOCK): teto de crash-respawn de 1 retry é imposto — 1º crash
 *    respawna UMA vez; 2º crash rejeita LLM_ENGINE_CRASHED e NÃO spawna de novo;
 *    `ensureChild` sem child e já respawnado → erro, nunca fork novo.
 *  - BUG 2 (WARNING): `status()` em processo fresco responde "não carregado"
 *    ({ loaded: null, contextSize: null }) SEM criar processo.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  LlmProxyService,
  type ForkFn,
  type UtilityProcessLike,
} from '../electron/main/services/embeddedLlm/LlmProxyService';

/** Child fake controlável: emite 'exit'/'message' sob demanda. */
interface FakeChild extends UtilityProcessLike {
  postCalls: unknown[];
  emitExit(code: number): void;
  emitResponse(data: unknown): void;
}

function makeFakeChild(id: number): FakeChild {
  const listeners: Record<string, Array<(...a: unknown[]) => void>> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const child: FakeChild = {
    postCalls: [],
    pid: 1000 + id,
    stdout: null,
    stderr: null,
    kill() {
      return true;
    },
    postMessage(message: unknown) {
      child.postCalls.push(message);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(event: string, listener: (...a: any[]) => void): unknown {
      (listeners[event] ??= []).push(listener);
      return child;
    },
    emitExit(code: number) {
      for (const l of listeners['exit'] ?? []) l(code);
    },
    emitResponse(data: unknown) {
      const msg = { type: 'response', ok: true, data };
      for (const l of listeners['message'] ?? []) l(msg);
    },
  };
  return child;
}

/** Flush de microtasks/timers: spawnChild roda via a fila do proxy (async). */
function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

/** Tipo do payload de uma mensagem do protocolo (EngineRequest). */
function msgType(call: unknown): string | undefined {
  return (call as { type?: string } | null | undefined)?.type;
}

/** Harness: fork fake que conta spawns e guarda os children criados. */
function makeHarness() {
  let spawnCount = 0;
  const children: FakeChild[] = [];
  const fork: ForkFn = () => {
    spawnCount += 1;
    const c = makeFakeChild(spawnCount);
    children.push(c);
    return c;
  };
  const proxy = new LlmProxyService({ fork, engineEntryPath: '/none' });
  return {
    proxy,
    children: children as FakeChild[],
    spawnCount: () => spawnCount,
  };
}

const CHAT = { modelId: 'm', modelPath: '/models/x', prompt: 'oi' };

describe('LlmProxyService — respawn (BUG 1)', () => {
  it('1º crash respawna UMA vez; 2º crash rejeita LLM_ENGINE_CRASHED e NÃO spawna de novo', async () => {
    const h = makeHarness();

    // 1º load → spawn #1.
    const loadP = h.proxy.load('m', '/models/x');
    await flush();
    assert.equal(h.spawnCount(), 1);
    h.children[0].emitResponse({ modelId: 'm' });
    await loadP;

    // 1º crash (sem request pendente) → respawn (spawn #2).
    h.children[0].emitExit(1);
    assert.equal(h.spawnCount(), 2, 'após o 1º crash deve respawnar 1 vez');

    // O child respawnado está vivo e responde a um chat.
    const chatP = h.proxy.chat(CHAT);
    await flush();
    assert.equal(msgType(h.children[1].postCalls[0]), 'chat');
    h.children[1].emitResponse({ text: 'oi' });
    assert.deepEqual(await chatP, { text: 'oi' });

    // 2º crash (do child respawnado, com request pendente) → desiste.
    const pendingP = h.proxy.chat({ ...CHAT, prompt: 'de novo' });
    await flush();
    h.children[1].emitExit(1);
    await assert.rejects(pendingP, /LLM_ENGINE_CRASHED/);
    assert.equal(h.spawnCount(), 2, 'após o 2º crash NÃO deve spawnar de novo');

    // Pedido posterior com child morto: teto respeitado — erro, nunca fork novo.
    await assert.rejects(
      h.proxy.chat({ ...CHAT, prompt: 'depois' }),
      /LLM_ENGINE_CRASHED/,
    );
    assert.equal(h.spawnCount(), 2, 'ensureChild sem child já respawnado não deve forkar');
  });

  it('após o respawn, um load novo no child vivo responde normalmente', async () => {
    const h = makeHarness();

    const loadP = h.proxy.load('m', '/models/x');
    await flush();
    h.children[0].emitResponse({ modelId: 'm' });
    await loadP;

    h.children[0].emitExit(1);
    assert.equal(h.spawnCount(), 2);

    const load2 = h.proxy.load('m', '/models/x');
    await flush();
    h.children[1].emitResponse({ modelId: 'm' });
    await load2;
    assert.equal(h.spawnCount(), 2);
  });
});

describe('LlmProxyService — status (BUG 2)', () => {
  it('status() sem child devolve "não carregado" SEM criar processo', async () => {
    const h = makeHarness();
    const st = await h.proxy.status();
    assert.deepEqual(st, { loaded: null, contextSize: null });
    assert.equal(h.spawnCount(), 0, 'status() fresco não deve spawnar');
  });

  it('status() com child vivo faz request normal ao processo', async () => {
    const h = makeHarness();

    const loadP = h.proxy.load('m', '/models/x');
    await flush();
    h.children[0].emitResponse({ modelId: 'm' });
    await loadP;

    const stP = h.proxy.status();
    await flush();
    assert.equal(msgType(h.children[0].postCalls.at(-1)), 'status');
    h.children[0].emitResponse({ loaded: 'm', contextSize: 4096 });
    assert.deepEqual(await stP, { loaded: 'm', contextSize: 4096 });
  });
});

describe('LlmProxyService — chat sem load prévio (tudo fake)', () => {
  it('chat sem load prévio spawna o processo e responde', async () => {
    const h = makeHarness();
    const chatP = h.proxy.chat(CHAT);
    await flush();
    assert.equal(h.spawnCount(), 1, 'chat sem load spawna via ensureChild');
    assert.equal(msgType(h.children[0].postCalls[0]), 'chat');
    h.children[0].emitResponse({ text: 'olá' });
    assert.deepEqual(await chatP, { text: 'olá' });
  });
});