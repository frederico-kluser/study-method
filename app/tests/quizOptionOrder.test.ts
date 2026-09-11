/**
 * tests/quizOptionOrder.test.ts — a PERMUTAÇÃO DE EXIBIÇÃO das alternativas.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O DEFEITO QUE ESTE MÓDULO EXISTE PARA MATAR (medido no repositório)
 * ══════════════════════════════════════════════════════════════════════════
 *
 *     $ grep -rho '"answerIndex": *[0-9]*' resources/tracks --include='*.json' \
 *         | sort | uniq -c
 *          44 "answerIndex": 0
 *     $ grep -rniE 'shuffle|embaralh|sortear|randomi[sz]' src electron shared tools
 *       (nenhuma saída)
 *
 * 44 de 44 afirmações do curso real de Python com a resposta no índice 0, e
 * nada no pipeline reordenando nada: a alternativa CERTA era sempre a PRIMEIRA
 * pílula da tela. Clicar sempre na primeira dominava o curso inteiro sem ler.
 *
 * O QUE ESTA SUÍTE TRAVA (e o que ela recusa a medir):
 *   1. DETERMINISMO — a mesma (chave, geração) devolve a MESMA ordem, sempre.
 *      Sem isso a pílula troca de texto entre o mousedown e o mouseup;
 *   2. DIFERENÇA POR PERGUNTA — chaves vizinhas e gerações vizinhas não
 *      compartilham ordem;
 *   3. NÃO DEGENERAÇÃO — a DISTRIBUIÇÃO da posição da resposta certa, medida
 *      nas chaves REAIS (as 44 de então; as 119 de hoje) e em 20 000 chaves
 *      sintéticas. Um teste que só
 *      verificasse "a ordem mudou" passaria com uma permutação fixa (por
 *      exemplo "sempre inverta"), que apenas muda o atalho de "clique na
 *      primeira" para "clique na última" — por isso aqui se mede FREQUÊNCIA,
 *      não desigualdade;
 *   4. BIJEÇÃO — display → original e original → display, com a composição
 *      igual à identidade nos DOIS sentidos.
 *
 * Reprodução: `bash tools/t.sh tests/quizOptionOrder.test.ts`
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import {
  displayPositionOf,
  invertOptionOrder,
  quizOptionOrder,
  quizOptionSeed,
} from '../src/lib/quizOptionOrder';
import type { TrackAssertionDto } from '../shared/ipc-contract';

const HERE = dirname(fileURLToPath(import.meta.url));
const TRACKS = resolve(HERE, '../resources/tracks');

/**
 * A chave canônica do quiz — `sectionId::assertionId`, o MESMO formato que
 * `quizKeyFor` (src/lib/trackLessonState.ts) produz. Reproduzida aqui, e não
 * importada, para que este arquivo continue medindo o MÓDULO NOVO mesmo que a
 * chave mude de dono: se as duas divergirem, a suíte de coerência de chave
 * (tests/lessonQuizKeyCoherence.test.ts) é quem acusa.
 */
function keyOf(a: TrackAssertionDto): string {
  return a.sectionId === undefined ? a.id : `${a.sectionId}::${a.id}`;
}

/** TODAS as afirmações reais das trilhas do disco (as 119 atuais de
 * python-iniciante: a-tela 44 + decisao 36 + repeticao 39; 44 à época do
 * conserto, quando a trilha tinha só o módulo a-tela). */
function realAssertions(): TrackAssertionDto[] {
  const out: TrackAssertionDto[] = [];
  for (const entry of readdirSync(TRACKS, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || entry.name !== 'lesson.json') continue;
    const lesson = JSON.parse(readFileSync(join(entry.parentPath, entry.name), 'utf8')) as {
      assertions?: TrackAssertionDto[];
    };
    for (const a of lesson.assertions ?? []) out.push(a);
  }
  return out;
}

const REAL = realAssertions();

describe('a trilha REAL é o motivo desta onda existir (a premissa, medida)', () => {
  it('as afirmações do curso têm answerIndex 0 em 100% dos casos', () => {
    assert.ok(
      REAL.length >= 119,
      `a trilha python-iniciante tem 119 afirmações hoje (a-tela 44 + decisao 36 + repeticao 39), veio ${REAL.length} — o conteúdo mudou: revalide esta suíte`,
    );
    const zeros = REAL.filter((a) => a.answerIndex === 0).length;
    assert.equal(zeros, REAL.length, 'a premissa do defeito: a resposta é SEMPRE a opção 0 no JSON');
    for (const a of REAL) {
      assert.equal(a.options.length, 4, `${keyOf(a)} tem 4 alternativas`);
    }
  });
});

describe('DETERMINISMO — a ordem não muda embaixo do dedo do aluno', () => {
  it('a mesma (chave, geração) devolve a mesma ordem em chamadas repetidas', () => {
    for (const a of REAL) {
      const key = keyOf(a);
      const primeira = quizOptionOrder(key, 0, 4);
      for (let repeticao = 0; repeticao < 5; repeticao++) {
        assert.deepEqual(quizOptionOrder(key, 0, 4), primeira, `${key} mudou entre renders`);
      }
    }
  });

  it('a ordem é um ARRAY NOVO por chamada (nenhum chamador contamina outro)', () => {
    const a = quizOptionOrder('s::a', 0, 4);
    const b = quizOptionOrder('s::a', 0, 4);
    assert.notEqual(a, b, 'objetos distintos');
    assert.deepEqual(a, b, 'com o mesmo conteúdo');
    a[0] = 99;
    assert.notDeepEqual(a, quizOptionOrder('s::a', 0, 4), 'mutar a cópia não muda a fonte');
  });

  it('nenhuma fonte de entropia: o módulo não usa Math.random nem Date', () => {
    const src = readFileSync(resolve(HERE, '../src/lib/quizOptionOrder.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    assert.ok(!src.includes('Math.random'), 'Math.random tornaria a ordem instável entre renders');
    assert.ok(!src.includes('Date.now'), 'o relógio tornaria a ordem irreproduzível');
    assert.ok(!src.includes('crypto'), 'nada de entropia do sistema');
  });
});

describe('DIFERENTE POR PERGUNTA — a semente sai da chave + geração', () => {
  it('as chaves reais NÃO compartilham uma ordem só', () => {
    const ordens = new Set(REAL.map((a) => quizOptionOrder(keyOf(a), 0, 4).join('')));
    assert.ok(
      ordens.size >= 8,
      `${REAL.length} chaves produziram só ${ordens.size} ordens distintas — a semente não está separando as perguntas`,
    );
  });

  it('duas afirmações da MESMA seção recebem ordens próprias', () => {
    // Caso REAL: `as-tres-partes-da-linha` demonstra duas afirmações.
    const mesmaSecao = REAL.filter((a) => a.sectionId === 'as-tres-partes-da-linha');
    assert.ok(mesmaSecao.length >= 2, 'a aula 1 tem 2 afirmações na mesma seção');
    const ordens = mesmaSecao.map((a) => quizOptionOrder(keyOf(a), 0, 4).join(''));
    assert.equal(new Set(ordens).size, ordens.length, 'a seção não pode ditar a ordem sozinha');
  });

  it('a GERAÇÃO entra na semente (o quiz remediador não repete a ordem)', () => {
    let iguais = 0;
    for (const a of REAL) {
      const key = keyOf(a);
      if (quizOptionOrder(key, 0, 4).join('') === quizOptionOrder(key, 1, 4).join('')) iguais++;
    }
    // Colidir em ~1/24 das chaves é o ACASO, não um defeito: exigir "nunca
    // igual" seria exigir um gerador enviesado. O teto escala com a amostra
    // (≈3,3× o acaso): 44 chaves → 6, 119 → 15.
    const teto = Math.ceil((REAL.length / 24) * 3);
    assert.ok(iguais <= teto, `${iguais} de ${REAL.length} chaves repetiram a ordem entre gerações (teto ${teto})`);
  });

  it('a semente é estável e distinta por (chave, geração)', () => {
    assert.equal(quizOptionSeed('s::a', 0), quizOptionSeed('s::a', 0));
    assert.notEqual(quizOptionSeed('s::a', 0), quizOptionSeed('s::a', 1));
    assert.notEqual(quizOptionSeed('s::a', 0), quizOptionSeed('s::b', 0));
    // Geração inválida normaliza para 0 — a função é TOTAL (uma exceção aqui
    // apagaria as alternativas da tela).
    assert.equal(quizOptionSeed('s::a', Number.NaN), quizOptionSeed('s::a', 0));
    assert.equal(quizOptionSeed('s::a', -3), quizOptionSeed('s::a', 0));
  });
});

describe('NÃO DEGENERADA — a DISTRIBUIÇÃO da resposta certa, medida', () => {
  /** Quantas vezes a alternativa `answerIndex` cai em cada posição da tela. */
  function distribution(assertions: readonly TrackAssertionDto[], generation: number): number[] {
    const dist = [0, 0, 0, 0];
    for (const a of assertions) {
      const order = quizOptionOrder(keyOf(a), generation, a.options.length);
      const pos = displayPositionOf(order, a.answerIndex);
      assert.ok(pos >= 0, 'a resposta certa tem de estar em alguma pílula');
      dist[pos] += 1;
    }
    return dist;
  }

  it('nas chaves REAIS a certa não fica presa à primeira pílula', () => {
    const dist = distribution(REAL, 0);
    assert.equal(
      dist.reduce((s, n) => s + n, 0),
      REAL.length,
      'toda afirmação foi contada',
    );
    // O ACASO é 25% (11 de 44 à época do conserto; hoje ~30 de 119). O teto de
    // 40% (17 de 44 → 45 de 119) é generoso de propósito: com amostras assim o
    // desvio amostral é grande, e o que este teste precisa recusar é a
    // DEGENERAÇÃO (o 44/44 de antes, o 119/119 de hoje), não uma flutuação. A
    // medição atual de 44 era [10, 11, 14, 9]; a de 119 é [30, 29, 36, 24].
    const acaso = Math.round(REAL.length / 4);
    const teto = Math.floor(REAL.length * 0.3864); // 17 de 44 — os mesmos 40%
    const piso = Math.floor(REAL.length * 0.1136); // 5 de 44 — os mesmos 11%
    for (let pos = 0; pos < 4; pos++) {
      assert.ok(
        dist[pos] <= teto,
        `a posição ${pos} concentrou ${dist[pos]} de ${REAL.length} respostas certas (acaso = ${acaso})`,
      );
      assert.ok(
        dist[pos] >= piso,
        `a posição ${pos} recebeu só ${dist[pos]} de ${REAL.length} respostas certas (acaso = ${acaso})`,
      );
    }
    // E o defeito, na sua forma exata: a primeira pílula deixou de ser a certa
    // em 44 de 44 (hoje: em 119 de 119).
    assert.ok(dist[0] < REAL.length, 'a certa NÃO pode ser sempre a primeira');
  });

  it('as quatro primeiras gerações do ciclo também não degeneram', () => {
    const acaso = Math.round(REAL.length / 4);
    const teto = Math.floor(REAL.length * 0.3864);
    const piso = Math.floor(REAL.length * 0.1136);
    for (const generation of [1, 2, 3]) {
      const dist = distribution(REAL, generation);
      for (let pos = 0; pos < 4; pos++) {
        assert.ok(
          dist[pos] <= teto && dist[pos] >= piso,
          `geração ${generation}, posição ${pos}: ${dist[pos]} de ${REAL.length} (acaso = ${acaso})`,
        );
      }
    }
  });

  it('em 20 000 chaves sintéticas a posição da certa é UNIFORME (±1,5 p.p.)', () => {
    const N = 20000;
    const dist = [0, 0, 0, 0];
    const permutacoes = new Map<string, number>();
    for (let i = 0; i < N; i++) {
      const order = quizOptionOrder(`secao-${i}::afirmacao-${i}`, i % 5, 4);
      dist[displayPositionOf(order, 0)] += 1;
      const chave = order.join('');
      permutacoes.set(chave, (permutacoes.get(chave) ?? 0) + 1);
    }
    for (let pos = 0; pos < 4; pos++) {
      const pct = (100 * dist[pos]) / N;
      assert.ok(
        Math.abs(pct - 25) <= 1.5,
        `posição ${pos} ficou em ${pct.toFixed(2)}% (o acaso é 25%)`,
      );
    }
    // O Fisher-Yates tem de alcançar as 24 permutações de 4 elementos — um
    // gerador que só rotacionasse alcançaria 4 e ainda assim passaria no
    // teste de posição acima.
    assert.equal(permutacoes.size, 24, 'as 24 permutações de 4 elementos aparecem');
    for (const [perm, vezes] of permutacoes) {
      const pct = (100 * vezes) / N;
      assert.ok(
        Math.abs(pct - 100 / 24) <= 1,
        `a permutação ${perm} saiu em ${pct.toFixed(2)}% (o acaso é ${(100 / 24).toFixed(2)}%)`,
      );
    }
  });
});

describe('BIJEÇÃO — display ⇄ original, sem perder nem inventar alternativa', () => {
  it('a ordem é uma PERMUTAÇÃO de 0..n-1 (total, sem repetição nem buraco)', () => {
    for (const n of [1, 2, 3, 4, 5, 8]) {
      for (let i = 0; i < 200; i++) {
        const order = quizOptionOrder(`k${i}`, i % 3, n);
        assert.equal(order.length, n);
        assert.deepEqual(
          [...order].sort((x, y) => x - y),
          Array.from({ length: n }, (_, k) => k),
          `n=${n}, i=${i}: a ordem não é uma permutação`,
        );
      }
    }
  });

  it('a composição das duas direções é a IDENTIDADE, nos dois sentidos', () => {
    for (const a of REAL) {
      const n = a.options.length;
      const order = quizOptionOrder(keyOf(a), 0, n);
      const inverse = invertOptionOrder(order);
      for (let d = 0; d < n; d++) {
        assert.equal(inverse[order[d]], d, `display→original→display quebrou em ${keyOf(a)}`);
      }
      for (let o = 0; o < n; o++) {
        assert.equal(order[inverse[o]], o, `original→display→original quebrou em ${keyOf(a)}`);
      }
    }
  });

  it('displayPositionOf concorda com invertOptionOrder', () => {
    const order = quizOptionOrder('s::a', 0, 4);
    const inverse = invertOptionOrder(order);
    for (let o = 0; o < 4; o++) assert.equal(displayPositionOf(order, o), inverse[o]);
    assert.equal(displayPositionOf(order, 99), -1, 'índice fora da permutação não existe na tela');
  });

  it('TOTAL: contagem degenerada ou lixo devolve a identidade em vez de lançar', () => {
    assert.deepEqual(quizOptionOrder('s::a', 0, 1), [0], 'uma alternativa só');
    assert.deepEqual(quizOptionOrder('s::a', 0, 0), [], 'nenhuma alternativa');
    assert.deepEqual(quizOptionOrder('s::a', 0, -4), [], 'contagem negativa');
    assert.deepEqual(quizOptionOrder('s::a', 0, Number.NaN), [], 'contagem não numérica');
    assert.deepEqual(quizOptionOrder('', 0, 4).length, 4, 'chave vazia continua funcionando');
  });
});
