/**
 * src/lib/copyToClipboard.ts — copiar texto para a área de transferência com
 * cadeia de fallback, testável SEM jsdom.
 *
 * ─── ONDA-CODIGO-EDITOR (finding-2 da auditoria uxui do bloco de código) ───
 * A remediation, verbatim: *"Botão 'Copiar' no cabeçalho do bloco (ícone →
 * 'Copiado ✓' por ~2s), copiando o texto SEM os números de linha (o gutter já é
 * aria-hidden/user-select:none)"*. O bloco de código passou a parecer um
 * editor, e toda a superfície editor-like (GitHub, VS Code, Stack Overflow,
 * Gist) oferece cópia em 1 clique — sem ela o aluno seleciona à mão, e a
 * seleção num bloco com gutter e rolagem horizontal apanha o que não interessa.
 *
 * ─── POR QUE UM HELPER, E NÃO `navigator.clipboard.writeText` NO COMPONENTE ─
 *  1. O renderer do Electron em PRODUÇÃO carrega de `file://` e a Clipboard API
 *     pode não existir ou rejeitar (permissão/contexto) — daí a cadeia:
 *     `navigator.clipboard.writeText` → textarea oculta + `execCommand('copy')`
 *     → `false` (o consumidor decide o que mostrar; nunca lança).
 *  2. A lógica vira testável em `node:test` puro com dependências injetadas —
 *     o mesmo molde dos outros módulos de `src/lib` (sem jsdom, listado no
 *     tsconfig.node.json).
 *  3. O que se copia é SEMPRE o texto que o chamador dá (o `code` cru do bloco,
 *     sem números de linha nem o prompt decorativo) — a "cópia limpa" é
 *     contrato, não acidente.
 */

/** O pedaço de `navigator` que este módulo usa. */
export interface ClipboardLike {
  writeText?: (text: string) => Promise<void> | void;
}

/** O pedaço de `document` que este módulo usa (o fallback textarea+execCommand). */
export interface CopyDocumentLike {
  body: { appendChild(node: unknown): void; removeChild(node: unknown): void };
  createElement(tag: string): {
    value: string;
    setAttribute?(name: string, value: string): void;
    style: Record<string, string>;
    focus?(): void;
    select?(): void;
  };
  execCommand?(command: string): boolean;
}

/** Dependências injetáveis — em produção caem nos globais. */
export interface CopyEnv {
  navigator?: { clipboard?: ClipboardLike } | undefined;
  document?: CopyDocumentLike | undefined;
}

function globalEnv(): CopyEnv {
  // Padrão da casa (idêntico a lib/confetti.ts): `globalThis` tipado, nunca os
  // globais DOM crus — o tsconfig.node.json compila `src/lib` SEM lib.dom e o
  // módulo tem de continuar puro/testável em node:test.
  const g = globalThis as unknown as {
    navigator?: CopyEnv['navigator'];
    document?: CopyDocumentLike;
  };
  return { navigator: g.navigator, document: g.document };
}

/** Fallback clássico: textarea oculta + execCommand('copy'). false se não der. */
function copyViaTextArea(text: string, doc: CopyDocumentLike): boolean {
  let node: ReturnType<CopyDocumentLike['createElement']> | null = null;
  try {
    node = doc.createElement('textarea');
    node.value = text;
    node.setAttribute?.('readonly', '');
    node.setAttribute?.('aria-hidden', 'true');
    node.style.position = 'fixed';
    node.style.top = '0';
    node.style.left = '0';
    node.style.opacity = '0';
    doc.body.appendChild(node);
    node.focus?.();
    node.select?.();
    return doc.execCommand?.('copy') === true;
  } catch {
    return false;
  } finally {
    if (node !== null) {
      try {
        doc.body.removeChild(node);
      } catch {
        // já removido — nunca deixa o textarea para trás nem lança
      }
    }
  }
}

/**
 * Copia `text` para a área de transferência. NUNCA lança: resolve `true` quando
 * alguma via teve sucesso, `false` quando nenhuma (sem clipboard E sem DOM).
 * O texto sai EXATAMENTE como entrou — quem chama decide o que copiar.
 */
export async function copyTextToClipboard(text: string, env?: CopyEnv): Promise<boolean> {
  const e = env ?? globalEnv();
  const clip = e.navigator?.clipboard;
  if (clip?.writeText !== undefined) {
    try {
      await clip.writeText(text);
      return true;
    } catch {
      // rejeição da API (permissão/contexto) → tenta o fallback clássico
    }
  }
  if (e.document !== undefined) return copyViaTextArea(text, e.document);
  return false;
}
