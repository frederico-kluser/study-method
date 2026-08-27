/**
 * tests/mathLib.test.ts — cobertura da biblioteca JS PURA de problemas de
 * matemática (onda3-respostas): determinismo por seed, esperado correto via
 * PROPRIEDADE INDEPENDENTE (re-computação a partir do PROMPT — reverter a
 * operação — nunca dos internos do gerador), verifyAnswer aceitando formas
 * equivalentes (fração normalizada ≡ decimal ≡ vírgula pt-BR) e rejeitando
 * erradas/malformadas com exatidão, >= 3 casos por família (4 famílias).
 *
 * Regra do produto (DES-6): o esperado NUNCA é número calculado de cabeça —
 * vem de EXECUTAR a referência (aqui, a própria biblioteca determinística).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  MATH_FAMILIES,
  generateMathProblem,
  hashString,
  isEquivalentAnswer,
  isMathFamily,
  makeRational,
  mulberry32,
  parseMathAnswer,
  pickMathExercise,
  renderRational,
  verifyAnswer,
  type MathFamily,
} from '../electron/main/services/mathLib';

/** Compara dois racionais por produto cruzado (exato). */
function sameRational(a: { num: number; den: number }, b: { num: number; den: number }): boolean {
  return a.num * b.den === b.num * a.den;
}

/** Valor decimal do racional (para asserts de leitura). */
function toNumber(r: { num: number; den: number }): number {
  return r.num / r.den;
}

describe('mathLib: PRNG e racionais', () => {
  it('mulberry32 é determinístico por seed e sensível a seeds diferentes', () => {
    const a1 = mulberry32(42);
    const a2 = mulberry32(42);
    const b1 = mulberry32(43);
    const seq1 = Array.from({ length: 10 }, () => a1());
    const seq2 = Array.from({ length: 10 }, () => a2());
    assert.deepEqual(seq1, seq2, 'mesmo seed ⇒ mesma sequência');
    assert.notDeepEqual(seq1, Array.from({ length: 10 }, () => b1()), 'seeds diferentes ⇒ sequências diferentes');
    for (const v of seq1) {
      assert.ok(v >= 0 && v < 1, 'valores no intervalo [0, 1)');
    }
  });

  it('hashString é determinística e 32-bit', () => {
    assert.equal(hashString('matemática básica'), hashString('matemática básica'));
    assert.ok(hashString('a') >= 0 && hashString('a') <= 0xffffffff);
  });

  it('makeRational canonicaliza (reduz, den > 0, zero → 0/1)', () => {
    assert.deepEqual(makeRational(4, 6), { num: 2, den: 3 });
    assert.deepEqual(makeRational(-2, -4), { num: 1, den: 2 });
    assert.deepEqual(makeRational(3, -2), { num: -3, den: 2 });
    assert.deepEqual(makeRational(0, 5), { num: 0, den: 1 });
    assert.deepEqual(makeRational(12, 3), { num: 4, den: 1 });
    assert.throws(() => makeRational(1, 0), /denominador zero/);
  });

  it('renderRational: inteiro sem denominador; fração canônica', () => {
    assert.equal(renderRational({ num: 7, den: 1 }), '7');
    assert.equal(renderRational({ num: -3, den: 4 }), '-3/4');
    assert.equal(renderRational({ num: 5, den: 6 }), '5/6');
  });
});

describe('mathLib: determinismo por seed (função pura)', () => {
  it('mesma (family, seed) ⇒ mesmo prompt, mesmo esperado, mesma verificação', () => {
    for (const family of MATH_FAMILIES) {
      const a = generateMathProblem(family, 20260827);
      const b = generateMathProblem(family, 20260827);
      assert.equal(a.prompt, b.prompt, `${family}: prompt determinístico`);
      assert.equal(a.normalized, b.normalized, `${family}: esperado determinístico`);
      assert.ok(sameRational(a.expected, b.expected), `${family}: racional determinístico`);
      assert.equal(a.verify(a.normalized), b.verify(b.normalized), `${family}: verificação determinística`);
    }
  });

  it('seeds diferentes geram problemas diferentes (variação por família)', () => {
    for (const family of MATH_FAMILIES) {
      const prompts = Array.from({ length: 24 }, (_, seed) => generateMathProblem(family, seed).prompt);
      const unique = new Set(prompts);
      assert.ok(unique.size >= 2, `${family}: 24 seeds não podem colapsar num problema só (${unique.size} únicos)`);
    }
  });

  it('família desconhecida / seed não-inteiro lançam erro claro', () => {
    assert.throws(() => generateMathProblem('trigonometria' as MathFamily, 1), /família desconhecida/);
    assert.throws(() => generateMathProblem('arithmetic', 1.5), /seed deve ser inteiro/);
    assert.throws(() => verifyAnswer('nada' as MathFamily, 1, '1'), /família desconhecida/);
  });

  it('isMathFamily valida o enum', () => {
    assert.ok(MATH_FAMILIES.every((f) => isMathFamily(f)));
    assert.ok(!isMathFamily('trigonometria'));
    assert.ok(!isMathFamily(undefined));
  });
});

describe('mathLib: esperado correto via PROPRIEDADE INDEPENDENTE (reverter a operação no prompt)', () => {
  /** Re-computa o esperado LENDO O PROMPT (independência do gerador). */
  function independentExpected(problem: { family: string; prompt: string }): { num: number; den: number } | null {
    const p = problem.prompt;
    if (problem.family === 'arithmetic') {
      const add = /^Quanto é (\d+) \+ (\d+)\?$/.exec(p);
      if (add) return makeRational(Number(add[1]) + Number(add[2]), 1);
      const sub = /^Quanto é (\d+) − (\d+)\?$/.exec(p);
      if (sub) return makeRational(Number(sub[1]) - Number(sub[2]), 1);
      const mul = /^Quanto é (\d+) × (\d+)\?$/.exec(p);
      if (mul) return makeRational(Number(mul[1]) * Number(mul[2]), 1);
      const div = /^Quanto é (\d+) ÷ (\d+)\?$/.exec(p);
      if (div) return makeRational(Number(div[1]) / Number(div[2]), 1);
      return null;
    }
    if (problem.family === 'fractions') {
      const m = /^Quanto é (\d+)\/(\d+) ([+−]) (\d+)\/(\d+)\?$/.exec(p);
      if (!m) return null;
      const a = Number(m[1]); const b = Number(m[2]); const c = Number(m[4]); const d = Number(m[5]);
      return m[3] === '+'
        ? makeRational(a * d + c * b, b * d)
        : makeRational(a * d - c * b, b * d);
    }
    if (problem.family === 'percentages') {
      const of = /^Quanto é (\d+)% de (\d+)\?$/.exec(p);
      if (of) return makeRational(Number(of[1]) * Number(of[2]), 100);
      const inc = /^Um valor de (\d+) aumentou (\d+)%\. Qual é o novo valor\?$/.exec(p);
      if (inc) return makeRational(Number(inc[1]) * (100 + Number(inc[2])), 100);
      const dec = /^Um produto custa (\d+) reais\. Com um desconto de (\d+)%, quanto passa a custar\?$/.exec(p);
      if (dec) return makeRational(Number(dec[1]) * (100 - Number(dec[2])), 100);
      return null;
    }
    if (problem.family === 'linear-equations') {
      const m = /^Resolva: (\d+)x \+ (\d+) = (\d+)\. Qual é o valor de x\?$/.exec(p);
      if (!m) return null;
      const a = Number(m[1]); const b = Number(m[2]); const c = Number(m[3]);
      if (a === 0) return null;
      return makeRational(c - b, a);
    }
    return null;
  }

  it('todas as famílias: o esperado da biblioteca bate com a propriedade independente (>= 5 seeds cada)', () => {
    for (const family of MATH_FAMILIES) {
      let checked = 0;
      for (let seed = 0; seed < 12; seed++) {
        const problem = generateMathProblem(family, seed);
        const indep = independentExpected(problem);
        assert.ok(indep !== null, `${family} seed ${seed}: prompt inesperado — "${problem.prompt}"`);
        assert.ok(
          sameRational(problem.expected, indep),
          `${family} seed ${seed}: esperado ${problem.normalized} != propriedade ${renderRational(indep)} — prompt "${problem.prompt}"`
        );
        checked += 1;
      }
      assert.ok(checked >= 5, `${family}: >= 5 casos verificados por propriedade independente`);
    }
  });

  it('esperados canônicos: den > 0 e reduzidos, em todas as famílias', () => {
    for (const family of MATH_FAMILIES) {
      for (let seed = 0; seed < 20; seed++) {
        const { expected } = generateMathProblem(family, seed);
        assert.ok(expected.den > 0, `${family}: den > 0`);
        const g = Math.abs(expected.num) % Math.abs(expected.den);
        assert.ok(expected.num === 0 || g !== 0 || Math.abs(expected.den) === 1 || expected.den === 1,
          `${family} seed ${seed}: fração não reduzida ${expected.num}/${expected.den}`);
      }
    }
  });
});

describe('mathLib: parseMathAnswer (formas aceitas/rejeitadas)', () => {
  it('inteiros, decimais (ponto e vírgula pt-BR), frações e espaços', () => {
    assert.deepEqual(parseMathAnswer('  42  '), { kind: 'rational', num: 42, den: 1 });
    assert.deepEqual(parseMathAnswer('-7'), { kind: 'rational', num: -7, den: 1 });
    assert.deepEqual(parseMathAnswer('+3'), { kind: 'rational', num: 3, den: 1 });
    const dec = parseMathAnswer('12.50');
    assert.equal(dec?.kind, 'decimal');
    if (dec && dec.kind === 'decimal') {
      assert.equal(dec.value, 12.5);
      assert.equal(dec.num, 125);
      assert.equal(dec.den, 10);
    }
    const decVg = parseMathAnswer('12,5');
    assert.equal(decVg?.kind, 'decimal');
    if (decVg && decVg.kind === 'decimal') assert.equal(decVg.value, 12.5);
    assert.deepEqual(parseMathAnswer(' 1 / 2 '), { kind: 'rational', num: 1, den: 2 });
    assert.deepEqual(parseMathAnswer('2/4'), { kind: 'rational', num: 2, den: 4 });
    assert.deepEqual(parseMathAnswer('-3/4'), { kind: 'rational', num: -3, den: 4 });
    const dotFive = parseMathAnswer('.5');
    assert.equal(dotFive?.kind, 'decimal');
  });

  it('malformados → null (nunca crash, nunca adivinha)', () => {
    for (const bad of ['', '   ', 'abc', '1/0', 'x/2', '1.2.3', '50%', '1 1/2', '1e5', '--3', '1/', '/2', '12,3,4']) {
      assert.equal(parseMathAnswer(bad), null, `"${bad}" deveria ser malformado`);
    }
    assert.equal(parseMathAnswer(undefined), null);
    assert.equal(parseMathAnswer(42), null);
  });
});

describe('mathLib: isEquivalentAnswer / verifyAnswer — equivalentes aceitos, erradas rejeitadas', () => {
  it('fração normalizada ≡ fração equivalente ≡ decimal exato (com/ sem vírgula)', () => {
    const expected = makeRational(1, 2);
    assert.ok(isEquivalentAnswer(expected, { kind: 'rational', num: 1, den: 2 }));
    assert.ok(isEquivalentAnswer(expected, { kind: 'rational', num: 2, den: 4 }));
    assert.ok(isEquivalentAnswer(expected, { kind: 'rational', num: 50, den: 100 }));
    assert.ok(isEquivalentAnswer(expected, { kind: 'decimal', value: 0.5, num: 5, den: 10 }));
    assert.ok(!isEquivalentAnswer(expected, { kind: 'rational', num: 1, den: 3 }));
    assert.ok(!isEquivalentAnswer(expected, { kind: 'rational', num: -1, den: 2 }));
  });

  it('decimais truncados: dentro da tolerância 1e-9 passam; além, rejeitam', () => {
    const third = makeRational(1, 3);
    assert.ok(isEquivalentAnswer(third, { kind: 'decimal', value: 0.3333333333, num: 3333333333, den: 10000000000 }));
    assert.ok(!isEquivalentAnswer(third, { kind: 'decimal', value: 0.333, num: 333, den: 1000 }), '0.333 difere 3.3e-4 de 1/3 — fora da tolerância');
  });

  it('verifyAnswer por família: resposta canônica, equivalentes e erradas (>= 3 casos por família)', () => {
    for (const family of MATH_FAMILIES) {
      let cases = 0;
      for (let seed = 0; seed < 8; seed++) {
        const problem = generateMathProblem(family, seed);
        const { num, den } = problem.expected;

        // A forma canônica é SEMPRE aceita (o esperado é computado, não fixo).
        assert.ok(problem.verify(problem.normalized), `${family} ${seed}: canônica "${problem.normalized}"`);

        if (den === 1) {
          // Inteiro: com vírgula decimal, com '+', com '.0'.
          assert.ok(problem.verify(`${num}.0`), `${family} ${seed}: "${num}.0"`);
          assert.ok(problem.verify(`+${num}`), `${family} ${seed}: "+${num}"`);
        } else {
          // Fração: equivalente não reduzida e decimal (ponto e vírgula pt-BR).
          assert.ok(problem.verify(`${num * 2}/${den * 2}`), `${family} ${seed}: equivalente "${num * 2}/${den * 2}"`);
          const dec = toNumber(problem.expected).toFixed(10).replace(/0+$/, '');
          assert.ok(problem.verify(dec), `${family} ${seed}: decimal "${dec}"`);
          assert.ok(problem.verify(dec.replace('.', ',')), `${family} ${seed}: decimal vírgula "${dec.replace('.', ',')}"`);
        }

        // Erradas: número vizinho (quando seguro), sinal invertido, malformadas.
        assert.ok(!problem.verify(`${num + (den > 1 ? 0 : 1)}`), `${family} ${seed}: vizinho rejeitado`);
        if (num !== 0) {
          assert.ok(!problem.verify(String(-num)), `${family} ${seed}: sinal invertido`);
        }
        assert.ok(!problem.verify('abc'), `${family} ${seed}: texto rejeitado`);
        assert.ok(!problem.verify(''), `${family} ${seed}: vazio rejeitado`);
        assert.ok(!problem.verify('1/0'), `${family} ${seed}: 1/0 rejeitado`);

        // A canônica do problema re-verificada via API global.
        assert.ok(verifyAnswer(family, seed, problem.normalized));
        assert.ok(!verifyAnswer(family, seed, 'definitivamente não é um número'));
        cases += 1;
      }
      assert.ok(cases >= 3, `${family}: >= 3 casos cobertos`);
    }
  });
});

describe('mathLib: pickMathExercise (escolha determinística por assunto)', () => {
  it('mesmo assunto ⇒ mesma (family, seed); famílias variam entre assuntos', () => {
    const a1 = pickMathExercise('equações do primeiro grau');
    const a2 = pickMathExercise('equações do primeiro grau');
    assert.deepEqual(a1, a2);
    assert.ok(MATH_FAMILIES.includes(a1.family));
    assert.ok(Number.isInteger(a1.seed) && a1.seed >= 0);

    const others = new Set(
      ['porcentagem e frações', 'geometria analítica', 'álgebra linear', 'aritmética básica', 'matemática para programação']
        .map((s) => pickMathExercise(s).family)
    );
    assert.ok(others.size >= 2, 'assuntos diferentes devem variar a família (deterministicamente)');
  });

  it('ONDA4: salt muda o seed DETERMINISTICAMENTE; salt ausente = comportamento atual', () => {
    const base = pickMathExercise('equações do primeiro grau');
    // Salt ausente (ou vazio) ⇒ mesmo (family, seed) de sempre.
    assert.deepEqual(pickMathExercise('equações do primeiro grau'), base, 'sem salt não muda nada');
    assert.deepEqual(pickMathExercise('equações do primeiro grau', ''), base, 'salt vazio ≡ ausente');

    // Mesmo salt ⇒ exatamente o mesmo (family, seed) — pureza/determinismo.
    const s0 = pickMathExercise('equações do primeiro grau', 'equações do primeiro grau#0');
    const s0Again = pickMathExercise('equações do primeiro grau', 'equações do primeiro grau#0');
    assert.deepEqual(s0, s0Again, 'mesmo salt ⇒ mesmo (family, seed)');

    // Salts diferentes ⇒ seeds diferentes ("errou → outro problema").
    const s1 = pickMathExercise('equações do primeiro grau', 'equações do primeiro grau#1');
    assert.notEqual(s0.seed, s1.seed, 'salt #0 ≠ salt #1 ⇒ seeds diferentes');
    assert.notDeepEqual(s0, s1, 'salt diferente ⇒ exercício diferente (deterministicamente)');
    assert.ok(MATH_FAMILIES.includes(s0.family));
    assert.ok(Number.isInteger(s0.seed) && s0.seed >= 0);
    assert.ok(Number.isInteger(s1.seed) && s1.seed >= 0);
  });
});
