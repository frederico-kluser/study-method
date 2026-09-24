/**
 * app/electron/main/engine/quality/minimalPythonLiterais.ts — a "outra tabela
 * de literais": o `repr()` do Python decodificado para valor (fail-closed) e a
 * serialização determinística de string como literal de Python.
 *
 * A prosa normativa vive na fachada `minimalPython.ts`. Refatoração L04:
 * arquivo ≤500 linhas e toda função com CC≤8, sem mudança de comportamento.
 */

/**
 * Os escapes de barra invertida da gramática estreita do `repr()` do Python 3
 * (`vocab/py/extract_ast.py:622` escreve `attrs["value"]` com `repr(node.value)`).
 * Map (e não objeto) de propósito: `Object.prototype` não participa da busca,
 * e um escape fora da tabela é `null` — nunca um valor inventado.
 */
const ESCAPES_SIMPLES_DE_REPR: ReadonlyMap<string, string> = new Map([
  ['\\', '\\'],
  ['n', '\n'],
  ['r', '\r'],
  ['t', '\t'],
  ['b', '\b'],
  ['f', '\f'],
  ['v', '\v'],
  ["'", "'"],
  ['"', '"'],
]);

/** A largura (em hex dígitos) dos escapes `\x`/`\u`/`\U`. */
const LARGURAS_HEX_DE_REPR: ReadonlyMap<string, number> = new Map([
  ['x', 2],
  ['u', 4],
  ['U', 8],
]);

/** Um escape decodificado: o texto e quantos caracteres do corpo ele consome. */
interface EscapeDecodificado {
  texto: string;
  avanco: number;
}

/** `\xNN`/`\uNNNN`/`\UNNNNNNNN` → o code point; fora da gramática é null. */
function decodificarHexDeRepr(corpo: string, i: number, largura: number): EscapeDecodificado | null {
  const hex = corpo.slice(i + 2, i + 2 + largura);
  if (hex.length !== largura || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  const ponto = Number.parseInt(hex, 16);
  if (!Number.isFinite(ponto) || ponto > 0x10ffff) return null;
  return { texto: String.fromCodePoint(ponto), avanco: 2 + largura };
}

/** UM escape `\…` a partir de `corpo[i]` (que é `\\`); null fora da tabela. */
function decodificarEscapeDeRepr(corpo: string, i: number): EscapeDecodificado | null {
  const p = corpo[i + 1];
  if (p === undefined) return null;
  const simples = ESCAPES_SIMPLES_DE_REPR.get(p);
  if (simples !== undefined) return { texto: simples, avanco: 2 };
  const largura = LARGURAS_HEX_DE_REPR.get(p);
  if (largura === undefined) return null;
  return decodificarHexDeRepr(corpo, i, largura);
}

/** A borda de um `repr()` de string (`'…'` ou `"…"`); null = não é um repr. */
function bordasDeRepr(repr: string): { aspa: string; corpo: string } | null {
  if (repr.length < 2) return null;
  const aspa = repr[0];
  if ((aspa !== "'" && aspa !== '"') || repr[repr.length - 1] !== aspa) return null;
  return { aspa, corpo: repr.slice(1, -1) };
}

/**
 * Decodifica o `repr()` de uma STRING do Python para o valor.
 *
 * A entrada nunca é texto arbitrário: é o `attrs["value"]` que o extrator
 * (`vocab/py/extract_ast.py:622`) escreve com `repr(node.value)`, cuja
 * gramática é estreita — aspa simples (ou dupla quando a string contém aspa
 * simples e não contém aspa dupla) e os escapes de barra invertida da tabela
 * abaixo. Caractere não-ASCII imprimível o `repr` do Python 3 NÃO escapa —
 * vem literal.
 *
 * FAIL-CLOSED: qualquer coisa fora dessa gramática devolve `null` (inclusive
 * os escapes raros que a tabela não lista, como `\a` e `\N{...}`), e o
 * chamador simplesmente não gera aquele candidato — nunca inventa um valor.
 */
export function decodificarReprDeStringPython(repr: string): string | null {
  const borda = bordasDeRepr(repr);
  if (borda === null) return null;
  const { aspa, corpo } = borda;
  let out = '';
  let i = 0;
  while (i < corpo.length) {
    const c = corpo[i];
    if (c !== '\\') {
      // Aspa delimitadora NÃO escapada dentro do corpo: não é um repr válido.
      if (c === aspa) return null;
      out += c;
      i += 1;
      continue;
    }
    const escape = decodificarEscapeDeRepr(corpo, i);
    if (escape === null) return null;
    out += escape.texto;
    i += escape.avanco;
  }
  return out;
}

/** O escape de UM caractere no literal de Python; sem escape especial, ele mesmo. */
function escaparLiteralPy(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  if (ch === '\\') return '\\\\';
  if (ch === '"') return '\\"';
  if (ch === '\n') return '\\n';
  if (ch === '\r') return '\\r';
  if (ch === '\t') return '\\t';
  if (ehControlePy(cp)) return '\\x' + cp.toString(16).padStart(2, '0');
  return ch;
}

/** Caractere de controle (incluso DEL) — sai como `\xNN`. */
function ehControlePy(cp: number): boolean {
  return cp < 0x20 || cp === 0x7f;
}

/**
 * Serializa uma string como LITERAL de Python — sempre com aspas duplas, o
 * mínimo de escapes e nenhuma dependência da grafia do teste.
 *
 * Determinístico por construção: o mesmo valor sempre produz o mesmo texto,
 * porque o código mínimo é comparado (por hash e por olho) entre execuções.
 */
export function literalPythonDeString(valor: string): string {
  let out = '"';
  for (const ch of valor) {
    out += escaparLiteralPy(ch);
  }
  return out + '"';
}
