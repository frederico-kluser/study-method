/**
 * tests/engineBarraQuiz.test.ts — A24: o quiz não pode ser acertado pelo
 * COMPRIMENTO das opções.
 *
 * O DEFEITO QUE ESTE ARQUIVO TRAVA, medido em 2026-09-22 nos três cursos do
 * disco (a contagem é de afirmações em que a opção CORRETA é a mais longa das
 * quatro, sozinha):
 *
 *     python-iniciante   58/320 = 18%   ← ABAIXO do acaso
 *     c-iniciante        36/138 = 26%   ← no acaso
 *     rust-iniciante    173/235 = 73%   ← TRÊS VEZES o acaso
 *
 * O acaso é 25%: com quatro opções de comprimentos quaisquer, a correta é a
 * mais longa em uma de cada quatro. Um quiz em que ela é a mais longa em 73%
 * das afirmações é acertável SEM LER — "clique na maior" leva a estrela, e o
 * gate de maestria da aula vira decoração. O produto já de-vaza a POSIÇÃO (o
 * `src/lib/quizOptionOrder.ts` permuta a ordem de exibição, e é por isso que
 * `answerIndex: 0` em todo o corpus não é defeito); ninguém de-vazava o
 * COMPRIMENTO.
 *
 * Este arquivo é irmão de `tests/engineBarra.test.ts` e mora separado de
 * propósito: A24 é a única regra da barra que não olha átomo nenhum — ela lê
 * `assertions[].options`, não código —, e por isso não precisa de toolchain de
 * linguagem nenhuma para rodar. Fixtures em memória; nenhum arquivo do disco.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { auditarBarra, FOLGA_DE_COMPRIMENTO_DO_QUIZ } from '../electron/main/engine/quality/barra';
import type { LoadedTrack } from '../electron/main/content/trackLoader';

const TRACKS = path.resolve(__dirname, '..', 'resources', 'tracks');

/** Uma afirmação de quiz com os comprimentos que o teste quer. */
function afirmacao(id: string, correta: string, distratores: readonly string[]): unknown {
  return {
    id,
    statement: `afirmação ${id}`,
    question: `pergunta ${id}`,
    options: [correta, ...distratores],
    answerIndex: 0,
    feedback: 'feedback',
    sectionId: 'sec',
  };
}

/** Trilha de UMA aula, com a teoria mínima que fecha A19/A21 e o quiz sob teste. */
function trilhaDeUmaAula(assertions: readonly unknown[]): LoadedTrack {
  const lesson = {
    schemaVersion: 1,
    slug: 'a-aula',
    title: 'A aula',
    summary: 'resumo',
    difficulty: 1,
    role: 'regular',
    targetAtom: 'global:print',
    concepts: ['c'],
    prerequisites: [],
    introduces: {
      productive: ['global:print', 'node:Call', 'node:StrLiteral'],
      receptive: [],
      derived: [
        { chave: 'node:Call', de: 'global:print' },
        { chave: 'node:StrLiteral', de: 'global:print' },
      ],
    },
    theory: [
      {
        id: 'sec',
        title: 'Primeira',
        markdown: 'A ordem que mostra:\n\n```python\nprint("bom dia")\n```\n',
      },
      {
        id: 'sec2',
        title: 'Segunda',
        markdown: 'De novo, com outro texto:\n\n```python\nprint("boa noite")\n```\n',
      },
    ],
    assertions,
    sources: [],
    challenges: ['d'],
  };
  return {
    root: {
      schemaVersion: 1,
      slug: 'trilha-de-teste',
      title: 'T',
      description: 'd',
      language: 'pt-BR',
      domain: 'programming',
      programmingLanguage: 'python',
      modules: ['modulo-1'],
    },
    modules: [
      {
        meta: { schemaVersion: 1, slug: 'modulo-1', title: 'M', order: 1, lessons: ['a-aula'] },
        lessons: [{ meta: lesson, challenges: [{ slug: 'd' }] }],
        challenge: null,
      },
    ],
    proficiency: null,
    dir: '/nao-existe',
  } as unknown as LoadedTrack;
}

function achadosA24(assertions: readonly unknown[]): { erros: number; avisos: number } {
  const r = auditarBarra(trilhaDeUmaAula(assertions));
  const a24 = r.achados.filter((a) => a.regra === 'A24');
  return {
    erros: a24.filter((a) => a.severidade === 'erro').length,
    avisos: a24.filter((a) => a.severidade === 'aviso').length,
  };
}

describe('A24 — o quiz não pode ser acertado pelo COMPRIMENTO', () => {
  it('a correta mais longa em TODAS as afirmações, com folga, é ERRO', () => {
    const longa = 'A resposta certa, explicada com todas as palavras que ela precisa.';
    const curta = 'Uma alternativa curta.';
    const r = achadosA24([
      afirmacao('a1', longa, [curta, 'Outra curta.', 'Terceira curta.']),
      afirmacao('a2', longa, [curta, 'Outra curta.', 'Terceira curta.']),
    ]);
    assert.equal(r.erros, 1, 'as duas afirmações vazam: a aula inteira é gameável');
    assert.equal(r.avisos, 0, 'o erro SUBSTITUI o aviso — não se conta o mesmo defeito duas vezes');
  });

  it('a correta mais longa em UMA afirmação de duas é AVISO, nunca erro', () => {
    const longa = 'A resposta certa, explicada com todas as palavras que ela precisa.';
    const r = achadosA24([
      afirmacao('a1', longa, ['Curta.', 'Outra.', 'Terceira.']),
      afirmacao('a2', 'Certa e curta.', [
        'Um distrator bem mais longo do que a alternativa correta desta linha.',
        'Outro distrator.',
        'Terceiro distrator.',
      ]),
    ]);
    assert.equal(r.erros, 0, 'coincidência em uma afirmação não é sistema');
    assert.equal(r.avisos, 1);
  });

  it('a folga é o que separa coincidência de vazamento: 8 caracteres não bastam', () => {
    // correta com 8 caracteres A MAIS que o segundo maior → dentro da folga.
    const correta = 'x'.repeat(40);
    const segunda = 'y'.repeat(40 - FOLGA_DE_COMPRIMENTO_DO_QUIZ);
    const r = achadosA24([
      afirmacao('a1', correta, [segunda, 'curta', 'curta2']),
      afirmacao('a2', correta, [segunda, 'curta', 'curta2']),
    ]);
    assert.equal(r.erros, 0, `folga de exatamente ${FOLGA_DE_COMPRIMENTO_DO_QUIZ} chars não é erro`);
    assert.equal(r.avisos, 2, 'mas as duas continuam sendo aviso: ela é a mais longa');
  });

  it('empate no comprimento não vaza: a correta não é a mais longa SOZINHA', () => {
    const mesmoTamanho = 'quatro opções com exatamente o mesmo comprimento aqui';
    const r = achadosA24([
      afirmacao('a1', mesmoTamanho, [mesmoTamanho, mesmoTamanho, mesmoTamanho]),
      afirmacao('a2', mesmoTamanho, [mesmoTamanho, mesmoTamanho, mesmoTamanho]),
    ]);
    assert.equal(r.erros, 0);
    assert.equal(r.avisos, 0);
  });

  it('UMA afirmação só nunca é erro — a regra exige >= 2 para falar de sistema', () => {
    const longa = 'A resposta certa, explicada com todas as palavras que ela precisa.';
    const r = achadosA24([afirmacao('a1', longa, ['Curta.', 'Outra.', 'Terceira.'])]);
    assert.equal(r.erros, 0);
    assert.equal(r.avisos, 1);
  });

  it('afirmação sem 4 opções não é medida (o schema é que cobra as 4)', () => {
    const r = achadosA24([
      { id: 'x', options: ['só', 'duas'], answerIndex: 0 },
      { id: 'y', options: ['a', 'b', 'c'], answerIndex: 0 },
    ]);
    assert.equal(r.erros, 0);
    assert.equal(r.avisos, 0);
  });

  it('as MÉTRICAS contam as afirmações medidas e as que vazam', () => {
    const longa = 'A resposta certa, explicada com todas as palavras que ela precisa.';
    const r = auditarBarra(
      trilhaDeUmaAula([
        afirmacao('a1', longa, ['Curta.', 'Outra.', 'Terceira.']),
        afirmacao('a2', 'Certa curta.', ['Distrator bem mais longo do que a correta.', 'b', 'c']),
      ]),
    );
    assert.equal(r.metricas.length, 1);
    assert.equal(r.metricas[0].afirmacoesMedidas, 2);
    assert.equal(r.metricas[0].afirmacoesQueVazamPorTamanho, 1);
  });
});

describe('A24 — o corpus do disco: o curso de referência não vaza por sistema', () => {
  /**
   * O PIN DE PRODUÇÃO. Ele não roda a barra (que precisaria do extrator e da
   * toolchain de cada linguagem): lê os `lesson.json` e aplica a MESMA
   * aritmética de A24. É o número que o dono lê no relatório desta execução, e
   * ele fica travado aqui para não voltar em silêncio.
   */
  function taxaDeVazamento(slug: string): { medidas: number; vazam: number; aulasQueVazamTodas: number } {
    const dir = path.join(TRACKS, slug);
    if (!fs.existsSync(dir)) return { medidas: 0, vazam: 0, aulasQueVazamTodas: 0 };
    const track = JSON.parse(fs.readFileSync(path.join(dir, 'track.json'), 'utf8')) as { modules: string[] };
    let medidas = 0;
    let vazam = 0;
    let aulasQueVazamTodas = 0;
    for (const mod of track.modules) {
      const modJson = path.join(dir, 'modules', mod, 'module.json');
      if (!fs.existsSync(modJson)) continue;
      const meta = JSON.parse(fs.readFileSync(modJson, 'utf8')) as { lessons: string[] };
      for (const slugAula of meta.lessons) {
        const arquivo = path.join(dir, 'modules', mod, 'lessons', slugAula, 'lesson.json');
        if (!fs.existsSync(arquivo)) continue;
        const L = JSON.parse(fs.readFileSync(arquivo, 'utf8')) as {
          assertions?: Array<{ options?: unknown[]; answerIndex?: number }>;
        };
        const lista = L.assertions ?? [];
        let naAula = 0;
        let vazamNaAula = 0;
        for (const a of lista) {
          const ops = a.options;
          if (!Array.isArray(ops) || ops.length !== 4) continue;
          const tam = ops.map((o) => (typeof o === 'string' ? o.length : 0));
          const i = typeof a.answerIndex === 'number' ? a.answerIndex : -1;
          if (i < 0 || i > 3) continue;
          naAula += 1;
          medidas += 1;
          const ordenado = [...tam].sort((x, y) => y - x);
          if (tam[i] === ordenado[0] && ordenado[0] > ordenado[1] + FOLGA_DE_COMPRIMENTO_DO_QUIZ) {
            vazam += 1;
            vazamNaAula += 1;
          }
        }
        if (naAula >= 2 && vazamNaAula === naAula) aulasQueVazamTodas += 1;
      }
    }
    return { medidas, vazam, aulasQueVazamTodas };
  }

  it('python-iniciante: nenhuma aula vaza em TODAS as suas afirmações', () => {
    const r = taxaDeVazamento('python-iniciante');
    assert.ok(r.medidas > 200, `esperava o corpus inteiro, medi ${r.medidas} afirmações`);
    assert.equal(
      r.aulasQueVazamTodas,
      0,
      `aulas em que TODA afirmação vaza por mais de ${FOLGA_DE_COMPRIMENTO_DO_QUIZ} chars: ${r.aulasQueVazamTodas}`,
    );
  });

  it('c-iniciante: nenhuma aula vaza em TODAS as suas afirmações', () => {
    const r = taxaDeVazamento('c-iniciante');
    assert.equal(r.aulasQueVazamTodas, 0);
  });

  it('rust-iniciante: nenhuma aula vaza em TODAS as suas afirmações', () => {
    const r = taxaDeVazamento('rust-iniciante');
    assert.equal(r.aulasQueVazamTodas, 0);
  });
});
