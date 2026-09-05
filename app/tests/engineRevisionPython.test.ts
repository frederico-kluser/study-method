/**
 * tests/engineRevisionPython.test.ts — a REVISÃO PROGRESSIVA enxerga a
 * LINGUAGEM DA TRILHA (`engine/revision/progressiva.ts`).
 *
 * O DEFEITO QUE ESTA SUÍTE TRAVA. Até `main@26dbc19`, `revisarDesafio` chamava
 * `sintetizarCodigoMinimo` DIRETO — o sintetizador javascript-only — sem
 * `language`. Medido na única trilha do produto:
 *
 *     cd app && npx tsx tools/track-engine/cli.ts revise python --limite 1
 *     → [ 1] a-tela/a-primeira-linha   NAO-REVISAVEL (fail-closed) · exit 1
 *
 * Fechado do jeito certo (nunca aprovou por omissão) e ainda assim cego: o
 * veredito era sobre o parser errado, não sobre o conteúdo. Depois do conserto
 * o mesmo comando sai `COBERTA · exit 0`, e a trilha inteira mede
 * `20 aulas · 20 cobertas · 0 lacunas · 0 nao-revisaveis · 17 com-excesso`.
 *
 * O prover é FAKE e SÍNCRONO (nenhum `python3` roda aqui, nenhum IO): ele
 * aceita o candidato que imprime exatamente a saída esperada. É o suficiente
 * para provar o que importa — QUAL sintetizador foi escolhido —, porque o
 * sintetizador de JavaScript nunca geraria um `print(...)`.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { LoadedLesson, LoadedModule, LoadedTrack } from '../electron/main/content/trackLoader';
import type { TrackChallengeSource, TrackTheorySection } from '../electron/main/content/trackTypes';
import type { ChallengeProofsInput, ChallengeProofsVerdict } from '../electron/main/engine/exec/proofs';
import type { ProverDeDesafio } from '../electron/main/engine/phases/f9Verifier';
import { revisarCurso, type OrcamentoDeAula } from '../electron/main/engine/revision/progressiva';

// ---------------------------------------------------------------------------
// Fixture de trilha PYTHON (em memória — nenhuma trilha real, nenhum IO)
// ---------------------------------------------------------------------------

const TESTS_PY = [
  'import contextlib',
  'import io',
  'import runpy',
  'import unittest',
  '',
  '',
  'def rodar():',
  '    saida = io.StringIO()',
  '    with contextlib.redirect_stdout(saida):',
  '        runpy.run_path("solucao.py")',
  '    return saida.getvalue()',
  '',
  '',
  'class TestOi(unittest.TestCase):',
  '    def test_imprime_oi(self):',
  '        self.assertEqual(rodar(), "oi\\n")',
  '',
].join('\n');

function theory(id: string, code: string): TrackTheorySection {
  return { id, title: id, markdown: 'teoria', code: { language: 'python', code } };
}

function lesson(slug: string, challenges: TrackChallengeSource[]): LoadedLesson {
  return {
    meta: {
      schemaVersion: 1,
      slug,
      title: slug,
      summary: slug,
      difficulty: 1,
      concepts: ['conceito'],
      prerequisites: [],
      theory: [theory('t', 'print("oi")\n')],
      sources: [],
      challenges: challenges.map((c) => c.slug),
    },
    challenges,
  };
}

function moduleOf(slug: string, lessons: LoadedLesson[]): LoadedModule {
  return {
    meta: { schemaVersion: 1, slug, title: slug, order: 1, lessons: lessons.map((l) => l.meta.slug) },
    lessons,
    challenge: null,
  };
}

function trilhaPython(): LoadedTrack {
  const desafio: TrackChallengeSource = {
    schemaVersion: 1,
    slug: 'escreva-oi',
    title: 'escreva oi',
    concept: 'conceito',
    difficulty: 1,
    language: 'python',
    statement: '# escreva oi',
    starterCode: '# escreva aqui\n',
    testsCode: TESTS_PY,
    solutionCode: 'print("oi")\n',
    expectedTestCount: 1,
  };
  return {
    root: {
      schemaVersion: 1,
      slug: 'fixture-python',
      title: 'fixture',
      description: 'fixture',
      language: 'pt-BR',
      domain: 'programming',
      programmingLanguage: 'python',
      modules: ['a-tela'],
    },
    modules: [moduleOf('a-tela', [lesson('a-primeira-linha', [desafio])])],
    proficiency: null,
    dir: '/tmp/fixture-python',
  };
}

// ---------------------------------------------------------------------------
// Prover FAKE: aceita o programa que imprime exatamente "oi\n"
// ---------------------------------------------------------------------------

interface ChamadaDoProver {
  language: string | undefined;
  solutionCode: string;
}

function criarProverFake(chamadas: ChamadaDoProver[]): ProverDeDesafio {
  return async (input: ChallengeProofsInput): Promise<ChallengeProofsVerdict> => {
    chamadas.push({ language: input.language, solutionCode: input.solutionCode });
    const valid = input.solutionCode === 'print("oi")\n';
    return {
      valid,
      failures: valid ? [] : [{ proof: 'solutionPasses', passed: false, reason: 'nao imprime oi' }],
      declared: 1,
      executed: 1,
    };
  };
}

/** O orçamento injetado: a aula ensina `print` e o literal de texto. */
const ORCAMENTO: OrcamentoDeAula = {
  productive: new Set(['global:print', 'node:Call', 'node:Expr', 'node:Load', 'node:Name', 'node:StrLiteral']),
  receptive: new Set(['global:print', 'node:Call', 'node:Expr', 'node:Load', 'node:Name', 'node:StrLiteral']),
  introducesProductive: ['global:print', 'node:StrLiteral'],
  ref: 'a-tela/a-primeira-linha',
};

describe('revisão progressiva — a LINGUAGEM DA TRILHA escolhe o sintetizador', () => {
  it('a trilha `python` é REVISÁVEL: o mínimo é um `print`, não JavaScript', async () => {
    const chamadas: ChamadaDoProver[] = [];
    const relatorio = await revisarCurso({
      track: trilhaPython(),
      prover: criarProverFake(chamadas),
      orcamentoPorAula: () => ORCAMENTO,
      orcamentoFonte: 'declared',
    });

    assert.equal(relatorio.linguagem, 'python', 'o relatório DECLARA a linguagem que mediu');
    const aula = relatorio.aulas[0];
    assert.equal(aula.naoRevisavel, undefined, aula.naoRevisavelMotivo ?? '');
    assert.equal(aula.precisaQuebrar, false);
    assert.equal(aula.desafios[0].minimalCode, 'print("oi")\n');
    assert.equal(relatorio.placar.naoRevisaveis, 0);
    assert.equal(relatorio.placar.cobertas, 1);
  });

  it('o prover recebe `language: python` — a prova de que o despacho aconteceu', async () => {
    const chamadas: ChamadaDoProver[] = [];
    await revisarCurso({
      track: trilhaPython(),
      prover: criarProverFake(chamadas),
      orcamentoPorAula: () => ORCAMENTO,
      orcamentoFonte: 'declared',
    });
    assert.ok(chamadas.length > 0, 'o sintetizador precisa ter chamado o prover');
    for (const c of chamadas) {
      assert.equal(c.language, 'python');
      assert.ok(
        !c.solutionCode.includes('export function'),
        `candidato de JavaScript numa trilha de Python: ${JSON.stringify(c.solutionCode)}`,
      );
    }
  });

  it('sem `language` explícito a linguagem sai da TRILHA (trackAdapterId), nunca do default', async () => {
    // `orcamentoPorAula` injetado é o caminho do CLI: ali não há budget para
    // consultar, e antes disso a revisão caía silenciosamente em `javascript`.
    const chamadas: ChamadaDoProver[] = [];
    const relatorio = await revisarCurso({
      track: trilhaPython(),
      prover: criarProverFake(chamadas),
      orcamentoPorAula: () => ORCAMENTO,
    });
    assert.equal(relatorio.linguagem, 'python');
  });
});
