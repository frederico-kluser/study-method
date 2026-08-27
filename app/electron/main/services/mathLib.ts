/**
 * electron/main/services/mathLib.ts — biblioteca JS PURA de problemas de
 * matemática com verificação POR EXECUÇÃO (regra DES-6 do tutor study-method:
 * o valor esperado de matemática NUNCA é número calculado de cabeça — vem de
 * EXECUTAR a referência; aqui a referência É esta biblioteca determinística).
 *
 * Propriedades:
 *  - Sem DOM, sem IO, sem eletron, sem Date.now/Math.random — o PRNG é
 *    mulberry32 semeado; `generateMathProblem(family, seed)` é uma função pura:
 *    mesma (family, seed) ⇒ EXATAMENTE o mesmo problema (prompt + esperado).
 *  - O esperado é COMPUTADO pelo código da família com aritmética RACIONAL
 *    EXATA ({num, den} canônica: den > 0, reduzida por mdc). Nunca constantes
 *    fixas: os números saem do PRNG a cada seed.
 *  - `verifyAnswer(family, seed, answerText)` aceita formas equivalentes:
 *    fração normalizada ('1/2' ≡ '2/4' ≡ '0.5' ≡ '0,5' — vírgula pt-BR),
 *    decimais com tolerância 1e-9, espaços/caixa normalizados. Rejeita
 *    erradas com exatidão (comparação racional exata).
 *
 * Famílias (>= 4):
 *   arithmetic        — 4 operações com inteiros pequenos (÷ sempre exata).
 *   fractions         — soma/subtração de frações próprias, denominadores 2..9.
 *   percentages       — percentual de X, aumento e desconto (esperado racional exato).
 *   linear-equations  — ax + b = c, a != 0, solução inteira OU fração.
 */

// ─── PRNG determinístico (mulberry32) ─────────────────────────────────────────
/** Gera uma função PRNG determinística a partir do seed (0..2^32-1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit — deriva um seed estável de um texto (ex.: assunto da aula). */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ─── Racionais exatos ─────────────────────────────────────────────────────────
/** Número racional em forma canônica: den > 0 e reduzido por mdc. */
export interface Rational {
  num: number;
  den: number;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a || 1;
}

/** Constrói um racional canônico (den > 0, reduzido). Nunca den === 0. */
export function makeRational(num: number, den: number): Rational {
  if (den === 0) throw new Error(`mathLib: denominador zero (${num}/0).`);
  if (den < 0) {
    num = -num;
    den = -den;
  }
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

/** Renderização canônica pt-BR do racional: '7' | '-3/4'. */
export function renderRational(r: Rational): string {
  return r.den === 1 ? String(r.num) : `${r.num}/${r.den}`;
}

/** Soma de racionais exatos. */
export function addRational(a: Rational, b: Rational): Rational {
  return makeRational(a.num * b.den + b.num * a.den, a.den * b.den);
}

/** Subtração de racionais exatos. */
export function subRational(a: Rational, b: Rational): Rational {
  return makeRational(a.num * b.den - b.num * a.den, a.den * b.den);
}

/** Multiplicação de racionais exatos. */
export function mulRational(a: Rational, b: Rational): Rational {
  return makeRational(a.num * b.num, a.den * b.den);
}

// ─── Parse da resposta digitada ───────────────────────────────────────────────
export type ParsedMathAnswer =
  | { kind: 'rational'; num: number; den: number }
  /**
   * Decimal com valor float (para a tolerância) E fração exata dos dígitos
   * (para a comparação exata primeiro) — '12.50' → { value: 12.5, num: 125, den: 10 }.
   */
  | { kind: 'decimal'; value: number; num: number; den: number };

/**
 * Normaliza e interpreta a resposta digitada. Devolve null para malformado
 * (não é um número, divisão por zero, etc.). Aceita:
 *   - inteiro:      '-12', '+12', '12'
 *   - decimal:      '12.5', '12,5' (vírgula pt-BR), '.5', '0.5000'
 *   - fração:       '1/2', '-3/4', ' 1 / 2 ' (espaços são removidos)
 * Não aceita (documentado): números mistos ('1 1/2'), notação científica,
 * sufixo '%' — formas fora do vocabulário são malformadas, nunca adivinhadas.
 */
export function parseMathAnswer(text: unknown): ParsedMathAnswer | null {
  if (typeof text !== 'string') return null;
  // Espaços nas bordas são ignorados; espaços SÓ em volta da barra de fração
  // são normalizados (' 1 / 2 ' → '1/2'); qualquer outro espaço interno
  // (ex.: número misto '1 1/2') torna a resposta MALFORMADA — nunca
  // reinterpretar '1 1/2' como '11/2' em silêncio.
  const trimmed = text.trim();
  const aroundSlash = trimmed.replace(/\s*\/\s*/g, '/');
  if (/\s/.test(aroundSlash)) return null;
  const s = aroundSlash.replace(',', '.');
  if (!s) return null;

  const intRe = /^[+-]?\d+$/;
  const decRe = /^[+-]?(\d*\.\d+)$/;
  const fracRe = /^([+-]?\d+)\/(\d+)$/;

  if (intRe.test(s)) {
    return { kind: 'rational', num: Number(s), den: 1 };
  }
  if (decRe.test(s)) {
    const value = Number(s);
    if (!Number.isFinite(value)) return null;
    // Fração exata a partir dos dígitos (evita ponto flutuante na comparação).
    const [intPart, fracPart] = s.split('.');
    const sign = intPart.startsWith('-') ? -1 : 1;
    const intAbs = Number(intPart.replace(/^[+-]/, '')) || 0;
    const digits = fracPart.replace(/0+$/, '');
    if (digits.length === 0) {
      return { kind: 'rational', num: intAbs * sign, den: 1 };
    }
    const den = Math.pow(10, digits.length);
    const num = (intAbs * den + Number(digits)) * sign;
    return { kind: 'decimal', value, num, den };
  }
  if (fracRe.test(s)) {
    const m = fracRe.exec(s)!;
    const den = Number(m[2]);
    if (den === 0) return null; // divisão por zero ⇒ malformado
    return { kind: 'rational', num: Number(m[1]), den };
  }
  return null;
}

/** Tolerância relativa/absoluta de decimais truncados (spec: 1e-9). */
const DECIMAL_TOLERANCE = 1e-9;

/**
 * Compara o esperado (racional exato) com a resposta parseada.
 * - resposta racional ⇒ igualdade EXATA por produto cruzado (1/2 ≡ 2/4 ≡ 0.5).
 * - resposta decimal  ⇒ igualdade exata dos dígitos primeiro; senão tolerância
 *   1e-9 (cobre decimais truncados, ex.: '0.333' ≈ 1/3? NÃO — 0.333 difere
 *   3.3e-4 de 1/3 — a tolerância é 1e-9 e o esperado é comparado por exatidão;
 *   decimais com dígitos suficientes passam: '0.833333' ≈ 5/6).
 */
export function isEquivalentAnswer(expected: Rational, parsed: ParsedMathAnswer): boolean {
  if (parsed.kind === 'rational') {
    return expected.num * parsed.den === parsed.num * expected.den;
  }
  // Igualdade exata dos dígitos primeiro ('0.5' ≡ 1/2 sem tolerância).
  if (expected.num * parsed.den === parsed.num * expected.den) return true;
  const expValue = expected.num / expected.den;
  return Math.abs(expValue - parsed.value) <= DECIMAL_TOLERANCE * Math.max(1, Math.abs(expValue));
}

// ─── Problemas por família ────────────────────────────────────────────────────
export type MathFamily = 'arithmetic' | 'fractions' | 'percentages' | 'linear-equations';

/** Famílias suportadas (ordem fixa — usada no pick determinístico por assunto). */
export const MATH_FAMILIES: readonly MathFamily[] = [
  'arithmetic',
  'fractions',
  'percentages',
  'linear-equations',
] as const;

export function isMathFamily(v: unknown): v is MathFamily {
  return typeof v === 'string' && (MATH_FAMILIES as readonly string[]).includes(v);
}

/** Um problema gerado: prompt + esperado EXATO + verificação por resposta. */
export interface GeneratedMathProblem {
  family: MathFamily;
  seed: number;
  /** Enunciado em pt-BR (o que o aluno lê). */
  prompt: string;
  /** Valor esperado EXATO computado pelo código da família (racional canônico). */
  expected: Rational;
  /** Renderização canônica do esperado ('7' | '5/6') — o que a lição carrega. */
  normalized: string;
  /** Verifica uma resposta digitada contra ESTE problema. */
  verify: (answerText: string) => boolean;
}

function intFrom(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Núcleo gerado por família: prompt + esperado (o normalized é derivado). */
type FamilyCore = Omit<GeneratedMathProblem, 'family' | 'seed' | 'verify' | 'normalized'>;

/** arithmetic — 4 operações com inteiros pequenos; ÷ sempre exata. */
function generateArithmetic(seed: number): FamilyCore {
  const rng = mulberry32(seed);
  const op = intFrom(rng, 0, 3); // 0 '+', 1 '−', 2 '×', 3 '÷'
  let prompt: string;
  let expected: Rational;
  if (op === 0) {
    const a = intFrom(rng, 2, 98);
    const b = intFrom(rng, 2, 98);
    prompt = `Quanto é ${a} + ${b}?`;
    expected = makeRational(a + b, 1);
  } else if (op === 1) {
    const delta = intFrom(rng, 0, 96);
    const b = intFrom(rng, 2, 98);
    const a = b + delta; // resultado nunca negativo (a >= b)
    prompt = `Quanto é ${a} − ${b}?`;
    expected = makeRational(a - b, 1);
  } else if (op === 2) {
    const a = intFrom(rng, 2, 12);
    const b = intFrom(rng, 2, 12);
    prompt = `Quanto é ${a} × ${b}?`;
    expected = makeRational(a * b, 1);
  } else {
    const q = intFrom(rng, 2, 12);
    const d = intFrom(rng, 2, 12);
    const a = q * d; // divisão exata por construção
    prompt = `Quanto é ${a} ÷ ${d}?`;
    expected = makeRational(q, 1);
  }
  return { prompt, expected };
}

/** fractions — soma/subtração de frações próprias, denominadores 2..9. */
function generateFractions(seed: number): FamilyCore {
  const rng = mulberry32(seed);
  let b = intFrom(rng, 2, 9);
  let a = intFrom(rng, 1, b - 1); // própria: 1..b-1
  let d = intFrom(rng, 2, 9);
  let c = intFrom(rng, 1, d - 1);
  const subtract = rng() < 0.5;
  if (subtract && a * d < c * b) {
    // evita resultado negativo: troca os dois pares (a/b ⇄ c/d) — o resultado
    // passa a ser (c*d... não: (c/d − a/b) = (cb − ad)/bd > 0.
    const tmpA = a; const tmpB = b;
    a = c; b = d; c = tmpA; d = tmpB;
  }
  const op = subtract ? '−' : '+';
  const expected = subtract
    ? makeRational(a * d - c * b, b * d)
    : makeRational(a * d + c * b, b * d);
  return { prompt: `Quanto é ${a}/${b} ${op} ${c}/${d}?`, expected };
}

/** percentages — X% de Y | aumento de X% | desconto de X%. */
function generatePercentages(seed: number): FamilyCore {
  const rng = mulberry32(seed);
  const kind = intFrom(rng, 0, 2); // 0 'of', 1 'increase', 2 'decrease'
  const pct = intFrom(rng, 1, 10) * 5; // 5..50
  const base = intFrom(rng, 20, 200);
  if (kind === 0) {
    return {
      prompt: `Quanto é ${pct}% de ${base}?`,
      expected: makeRational(pct * base, 100),
    };
  }
  if (kind === 1) {
    return {
      prompt: `Um valor de ${base} aumentou ${pct}%. Qual é o novo valor?`,
      expected: makeRational(base * (100 + pct), 100),
    };
  }
  return {
    prompt: `Um produto custa ${base} reais. Com um desconto de ${pct}%, quanto passa a custar?`,
    expected: makeRational(base * (100 - pct), 100),
  };
}

/** linear-equations — ax + b = c (a != 0); solução inteira OU fração. */
function generateLinearEquations(seed: number): FamilyCore {
  const rng = mulberry32(seed);
  const a = intFrom(rng, 2, 9);
  const b = intFrom(rng, 1, 9);
  const integerSolution = rng() < 0.5;
  let c: number;
  let expected: Rational;
  if (integerSolution) {
    const x = intFrom(rng, 1, 9);
    c = a * x + b;
    expected = makeRational(x, 1);
  } else {
    // solução fracionária: (c − b) % a != 0, com c − b > 0.
    let diff = 0;
    for (let i = 0; i < 8; i++) {
      diff = intFrom(rng, 1, 99 - b);
      if (diff % a !== 0) break;
    }
    if (diff % a === 0) diff += 1; // garantia determinística do resto != 0
    c = b + diff;
    expected = makeRational(diff, a);
  }
  return { prompt: `Resolva: ${a}x + ${b} = ${c}. Qual é o valor de x?`, expected };
}

// ─── API pública ──────────────────────────────────────────────────────────────
/**
 * Gera UM problema determinístico da família com o seed dado. Função pura:
 * mesma (family, seed) ⇒ mesmo prompt e mesmo esperado (o esperado é COMPUTADO
 * aqui — nunca constante fixa).
 */
export function generateMathProblem(family: MathFamily, seed: number): GeneratedMathProblem {
  if (!isMathFamily(family)) {
    throw new Error(
      `mathLib: família desconhecida "${String(family)}" (esperado: ${MATH_FAMILIES.join(' | ')}).`
    );
  }
  if (!Number.isInteger(seed)) {
    throw new Error(`mathLib: seed deve ser inteiro (recebi ${String(seed)}).`);
  }
  const base =
    family === 'arithmetic'
      ? generateArithmetic(seed)
      : family === 'fractions'
        ? generateFractions(seed)
        : family === 'percentages'
          ? generatePercentages(seed)
          : generateLinearEquations(seed);
  const problem = {
    family,
    seed,
    prompt: base.prompt,
    expected: base.expected,
    normalized: renderRational(base.expected),
  };
  return {
    ...problem,
    verify: (answerText: string): boolean => verifyAnswer(family, seed, answerText),
  };
}

/**
 * Verifica a resposta digitada contra o esperado COMPUTADO de (family, seed).
 * Devolve false para respostas erradas E para respostas malformadas (o caller
 * distingue via parseMathAnswer quando precisar do motivo).
 */
export function verifyAnswer(family: MathFamily, seed: number, answerText: string): boolean {
  const problem = generateMathProblem(family, seed);
  const parsed = parseMathAnswer(answerText);
  if (!parsed) return false;
  return isEquivalentAnswer(problem.expected, parsed);
}

/**
 * Escolha DETERMINÍSTICA de (family, seed) a partir do assunto — usada pelo
 * lesson-orchestrator no caminho 'math': o mesmo assunto (e o mesmo salt) gera
 * sempre o mesmo exercício (e o esperado é conferido pela biblioteca ANTES de
 * gerar a aula).
 *
 * ONDA4 (nunca-repetir): `salt` opcional mistura o seed — o orquestrador passa
 * `${subject}#<n>` (n = tentativas já registradas do subject), então CADA
 * tentativa nova (certa ou errada) muda o problema ("errou → outro problema").
 * Salt ausente = comportamento atual (seed = hash do assunto).
 */
export function pickMathExercise(subject: string, salt?: string): { family: MathFamily; seed: number } {
  const seed = hashString(`${subject}:${salt ?? ''}`);
  return { family: MATH_FAMILIES[seed % MATH_FAMILIES.length], seed };
}
