/**
 * tests/copyToClipboard.test.ts — a cadeia de cópia do bloco de código, sem jsdom.
 *
 * ONDA-CODIGO-EDITOR (finding-2 da auditoria uxui do bloco de código): a
 * superfície editor-like ganhou botão "Copiar" e a regra é "1 clique para
 * copiar" — a MESMA cópia em qualquer ambiente. Este teste cobre a cadeia
 * inteira com dependências falsas (o módulo é puro, sem DOM real):
 *
 *   navigator.clipboard.writeText → textarea oculta + execCommand('copy') → false
 *
 * e a propriedade mais importante: o texto sai EXATAMENTE como entrou (o que o
 * botão copia é o `code` cru — sem números de linha, sem o prompt decorativo).
 *
 * Reprodução:
 *   cd app && bash tools/t.sh tests/copyToClipboard.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  copyTextToClipboard,
  type CopyDocumentLike,
  type CopyEnv,
} from '../src/lib/copyToClipboard';

/** `document` falso que regista o que lhe foi pedido (e o remove a sério). */
function fakeDoc(over: { execResult?: boolean; throws?: boolean } = {}): {
  env: CopyEnv;
  calls: { appended: string[]; removed: string[]; commands: string[] };
} {
  const calls = { appended: [] as string[], removed: [] as string[], commands: [] as string[] };
  const doc: CopyDocumentLike = {
    body: {
      appendChild: (node: unknown) => calls.appended.push(String((node as { value: string }).value)),
      removeChild: (node: unknown) => calls.removed.push(String((node as { value: string }).value)),
    },
    createElement: () => ({
      value: '',
      setAttribute: () => {},
      style: {} as Record<string, string>,
      focus: () => {},
      select: () => {},
    }),
    execCommand: (command: string) => {
      calls.commands.push(command);
      if (over.throws) throw new Error('execCommand morreu');
      return over.execResult === true;
    },
  };
  return { env: { document: doc }, calls };
}

describe('copyTextToClipboard — a cadeia de cópia, em qualquer ambiente', () => {
  it('via principal: navigator.clipboard.writeText recebe o texto EXATO e resolve true', async () => {
    const recebido: string[] = [];
    const env: CopyEnv = {
      navigator: { clipboard: { writeText: (t: string) => void recebido.push(t) } },
    };
    const codigo = 'printf("ola, tela!\\n");\n  linha com espaços  ';
    assert.equal(await copyTextToClipboard(codigo, env), true);
    assert.deepEqual(recebido, [codigo], 'o texto sai byte a byte — sem trim, sem números de linha');
  });

  it('writeText rejeitado → cai no fallback textarea+execCommand e ainda resolve true', async () => {
    const { env, calls } = fakeDoc({ execResult: true });
    const completo: CopyEnv = {
      navigator: { clipboard: { writeText: () => Promise.reject(new Error('permissão negada')) } },
      document: env.document,
    };
    assert.equal(await copyTextToClipboard('a = 1', completo), true);
    assert.deepEqual(calls.commands, ['copy'], 'o fallback usa execCommand("copy")');
    assert.deepEqual(calls.appended, ['a = 1'], 'o textarea leva o texto');
    assert.deepEqual(calls.removed, ['a = 1'], 'o textarea é REMOVIDO (nada fica no DOM)');
  });

  it('sem Clipboard API (ex.: file://) → usa direto o fallback', async () => {
    const { env, calls } = fakeDoc({ execResult: true });
    assert.equal(await copyTextToClipboard('int a;', env), true);
    assert.deepEqual(calls.commands, ['copy']);
  });

  it('execCommand devolve false ou LANÇA → resolve false, sem nunca lançar', async () => {
    const falso = fakeDoc({ execResult: false });
    assert.equal(await copyTextToClipboard('x', falso.env), false);
    const quebra = fakeDoc({ throws: true });
    assert.equal(await copyTextToClipboard('x', quebra.env), false);
  });

  it('sem navigator nem document (SSR/worker) → false calmo, sem exceção', async () => {
    assert.equal(await copyTextToClipboard('x', {}), false);
    assert.equal(await copyTextToClipboard('x', { navigator: {} }), false);
  });
});
