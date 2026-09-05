/**
 * tests/engineDiscriminacao.test.ts — a cláusula J5 (Discriminação) de
 * `docs/16-engine-de-trilha.md` §9.1, implementada em
 * `engine/quality/discriminacao.ts`.
 *
 * O QUE ESTA SUÍTE PROVA, e por que cada prova existe:
 *
 *   1. O CASO REAL, reproduzido em fixture: a aula ensina `**` (potência), a
 *      solução usa `**`, o teste compara stdout por igualdade e o menor código
 *      que passa é `print("1048576")`. Veredito: NAO-DISCRIMINA. É o defeito
 *      MEDIDO na trilha `python` (17 dos 20 desafios de aula, 29 de 34 alvos).
 *   2. A DIFERENÇA ENTRE J5 E A6: o `audit` (regra A6) fica VERDE no mesmo
 *      desafio, porque ele olha a SOLUÇÃO e a solução usa `**` mesmo. As duas
 *      perguntas são diferentes e esta suíte prova a diferença no mesmo dado.
 *   3. A DIFERENÇA ENTRE J5 E O `excesso` DO COVERAGE: `naoDiscriminados` exige
 *      que o alvo esteja NA SOLUÇÃO; o excesso não. Alvo que nem a solução usa
 *      sai em `alvosForaDaSolucao` e NÃO conta como falta de discriminação.
 *   4. FAIL-CLOSED: veredito mínimo não-ok ⇒ `nao-medido`, nunca `discrimina`.
 *   5. CLASSIFICAÇÃO CONGELADA: `classificacao === 'aviso'` — o módulo mede e
 *      declara, não reprova. Não existe exit code aqui.
 *   6. LIMITAÇÕES DECLARADAS: a saída sempre diz o que ela NÃO faz.
 *
 * PURA: fixtures em memória, zero IO, zero prover, zero LLM. O único trecho
 * que exige `python3` é o que extrai átomos de Python de verdade — e ele é
 * pulado com motivo quando o interpretador não existe.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  avaliarDiscriminacao,
  avaliarDiscriminacaoDeDesafio,
  linhasDeDiscriminacao,
  type DesafioParaDiscriminacao,
} from '../electron/main/engine/quality/discriminacao';
import { pythonAdapter } from '../electron/main/engine/lang/python';
import type { MinimalVerdict } from '../electron/main/engine/quality/minimal';

const TEM_PYTHON = pythonAdapter.detect().version !== null;

/** Um veredito mínimo ok com os átomos dados (o que o sintetizador devolve). */
function minimoOk(minimalCode: string, atoms: string[]): MinimalVerdict {
  return {
    ok: true,
    minimalCode,
    atoms: atoms as MinimalVerdict extends { ok: true; atoms: infer A } ? A : never,
    atomsDoTeste: [],
    lines: minimalCode.split('\n').length,
    proofsValid: true,
  } as MinimalVerdict;
}

// ---------------------------------------------------------------------------
// 1 + 2 + 3 — o caso real (JavaScript nos átomos, para manter a prova pura)
// ---------------------------------------------------------------------------

describe('discriminacao — a prova estática de J5', () => {
  /**
   * A aula de POTÊNCIA. Reproduz o formato exato do que foi medido: a solução
   * usa a construção-alvo e o mínimo que passa no teste é um `print` do
   * literal. Os átomos são passados prontos para a prova ser PURA — os do
   * mínimo vêm do veredito, os da solução saem do extrator.
   */
  const SOLUCAO_POTENCIA = 'print(2 ** 20)\n';
  const MINIMO_POTENCIA = 'print("1048576")\n';

  it('o teste que compara stdout NÃO DISCRIMINA a construção da aula', {
    skip: !TEM_PYTHON ? 'python3 ausente' : false,
  }, () => {
    const d: DesafioParaDiscriminacao = {
      ref: 'a-tela/potencia/dois-elevado-a-vinte',
      lessonRef: 'a-tela/potencia',
      solutionCode: SOLUCAO_POTENCIA,
      alvos: ['op:binary:**'],
      minimal: minimoOk(MINIMO_POTENCIA, ['global:print', 'node:Call', 'node:Expr', 'node:StrLiteral']),
    };
    const r = avaliarDiscriminacaoDeDesafio(d, { language: 'python' });

    assert.equal(r.status, 'nao-discrimina');
    assert.deepEqual(r.alvosNaSolucao, ['op:binary:**'], 'a solução USA `**` — é o que A6/J2 exige');
    assert.deepEqual(r.naoDiscriminados, ['op:binary:**'], 'e o mínimo que passa NÃO usa');
    assert.deepEqual(r.discriminados, []);
    assert.equal(r.minimalCode, MINIMO_POTENCIA);
    assert.match(r.motivo, /um aluno que não a use passa mesmo assim/);
  });

  it('quando o teste FORÇA a construção, o veredito é `discrimina`', {
    skip: !TEM_PYTHON ? 'python3 ausente' : false,
  }, () => {
    // O mesmo desafio com um teste que obrigasse `**`: o mínimo conteria a
    // construção. É o contrafactual — sem ele, "nao-discrimina" poderia ser um
    // veredito que a função devolve sempre.
    const r = avaliarDiscriminacaoDeDesafio(
      {
        ref: 'a-tela/potencia/dois-elevado-a-vinte',
        lessonRef: 'a-tela/potencia',
        solutionCode: SOLUCAO_POTENCIA,
        alvos: ['op:binary:**'],
        minimal: minimoOk('print(2 ** 20)\n', ['op:binary:**', 'global:print', 'node:BinOp']),
      },
      { language: 'python' },
    );
    assert.equal(r.status, 'discrimina');
    assert.deepEqual(r.naoDiscriminados, []);
    assert.deepEqual(r.discriminados, ['op:binary:**']);
  });

  it('alvo que NEM A SOLUÇÃO usa não é falta de discriminação (é sinal de A6/J2)', {
    skip: !TEM_PYTHON ? 'python3 ausente' : false,
  }, () => {
    const r = avaliarDiscriminacaoDeDesafio(
      {
        ref: 'a-tela/potencia/dois-elevado-a-vinte',
        lessonRef: 'a-tela/potencia',
        solutionCode: 'print("1048576")\n', // a solução NÃO usa `**`
        alvos: ['op:binary:**'],
        minimal: minimoOk(MINIMO_POTENCIA, ['global:print', 'node:StrLiteral']),
      },
      { language: 'python' },
    );
    // O `excesso` do coverage marcaria isto (introduces ∖ atoms(minimal));
    // J5 não, e a diferença é exatamente a interseção com a solução.
    assert.equal(r.status, 'discrimina');
    assert.deepEqual(r.alvosForaDaSolucao, ['op:binary:**']);
    assert.deepEqual(r.naoDiscriminados, []);
    assert.match(r.motivo, /A6\/J2/);
  });
});

// ---------------------------------------------------------------------------
// 4 — fail-closed
// ---------------------------------------------------------------------------

describe('discriminacao — fail-closed (docs/16 §9.3)', () => {
  it('mínimo NÃO provado ⇒ `nao-medido`, NUNCA `discrimina`', () => {
    const r = avaliarDiscriminacaoDeDesafio({
      ref: 'm/a/d',
      lessonRef: 'm/a',
      solutionCode: 'export function f() {\n  return 1;\n}\n',
      alvos: ['node:ReturnStatement'],
      minimal: { ok: false, reason: 'SEM_SOLUCAO_ACESSIVEL', detail: 'nenhum candidato passou' },
    });
    assert.equal(r.status, 'nao-medido');
    assert.deepEqual(r.naoDiscriminados, []);
    assert.deepEqual(r.discriminados, []);
    assert.match(r.motivo, /SEM_SOLUCAO_ACESSIVEL/);
  });

  it('solução que NÃO parseia na linguagem da trilha ⇒ `nao-medido` com o motivo', () => {
    const r = avaliarDiscriminacaoDeDesafio({
      ref: 'm/a/d',
      lessonRef: 'm/a',
      solutionCode: 'export function {{{ (',
      alvos: ['node:ReturnStatement'],
      minimal: minimoOk('export function f() {\n  return 1;\n}\n', ['node:ReturnStatement']),
    });
    assert.equal(r.status, 'nao-medido');
    assert.match(r.motivo, /não parseia/);
  });

  it('desafio sem aula dona (módulo/proficiência) ⇒ `sem-alvo`, fora de qualquer conclusão', () => {
    const r = avaliarDiscriminacaoDeDesafio({
      ref: 'm/challenges/final',
      lessonRef: null,
      solutionCode: 'export function f() {\n  return 1;\n}\n',
      alvos: [],
      minimal: minimoOk('export function f() {\n  return 1;\n}\n', ['node:ReturnStatement']),
    });
    assert.equal(r.status, 'sem-alvo');
    assert.match(r.motivo, /sem aula dona/);
  });
});

// ---------------------------------------------------------------------------
// 5 + 6 — o relatório: classificação congelada, placar e limitações
// ---------------------------------------------------------------------------

describe('discriminacao — o relatório MEDE e DECLARA (aviso, nunca violação)', () => {
  function relatorioDeExemplo() {
    return avaliarDiscriminacao('fixture', [
      {
        ref: 'm/a1/d1',
        lessonRef: 'm/a1',
        solutionCode: 'export function f(x) {\n  return x ** 2;\n}\n',
        alvos: ['op:binary:**'],
        minimal: minimoOk('export function f() {\n  return 4;\n}\n', ['node:ReturnStatement']),
      },
      {
        ref: 'm/a2/d2',
        lessonRef: 'm/a2',
        solutionCode: 'export function g(x) {\n  return x ** 2;\n}\n',
        alvos: ['op:binary:**'],
        minimal: minimoOk('export function g(x) {\n  return x ** 2;\n}\n', ['op:binary:**']),
      },
      {
        ref: 'm/challenges/final',
        lessonRef: null,
        solutionCode: 'export function h() {\n  return 1;\n}\n',
        alvos: [],
        minimal: minimoOk('export function h() {\n  return 1;\n}\n', ['node:ReturnStatement']),
      },
      {
        ref: 'm/a3/d3',
        lessonRef: 'm/a3',
        solutionCode: 'export function i() {\n  return 1;\n}\n',
        alvos: ['node:ReturnStatement'],
        minimal: { ok: false, reason: 'PROVER_FALHOU', detail: 'infra' },
      },
    ]);
  }

  it('a classificação é AVISO e ela é CONGELADA no relatório', () => {
    assert.equal(relatorioDeExemplo().classificacao, 'aviso');
  });

  it('o placar conta medidos, não-medidos e sem-alvo em SEPARADO', () => {
    const p = relatorioDeExemplo().placar;
    assert.equal(p.desafios, 4);
    assert.equal(p.medidos, 2, 'só os dois com alvo E mínimo provado');
    assert.equal(p.naoMedidos, 1);
    assert.equal(p.semAlvo, 1);
    assert.equal(p.discriminam, 1);
    assert.equal(p.naoDiscriminam, 1);
    assert.equal(p.alvosMedidos, 2);
    assert.equal(p.alvosDiscriminados, 1);
    assert.equal(p.alvosNaoDiscriminados, 1);
    assert.equal(p.aulasComAlvoNaoDiscriminado, 1);
    assert.equal(p.aulasMedidas, 2);
  });

  it('as LIMITAÇÕES são declaradas na saída, nunca omitidas (docs/16 §9.2)', () => {
    const r = relatorioDeExemplo();
    assert.ok(r.limitacoes.length >= 3, r.limitacoes.join(' | '));
    assert.ok(r.limitacoes.some((l) => /PROVA ESTÁTICA/.test(l)), 'a parte executável de J5 é de mutants.ts');
    assert.ok(r.limitacoes.some((l) => /AVISO com contagem, nunca violação/.test(l)));
    assert.ok(r.limitacoes.some((l) => /NÃO MEDIDO/.test(l)), 'o não-medido é declarado, não escondido');
  });

  it('o formatador imprime o placar, o AVISO e as limitações — e nunca a palavra REPROVADO', () => {
    const linhas = linhasDeDiscriminacao(relatorioDeExemplo());
    const texto = linhas.join('\n');
    assert.match(texto, /DISCRIMINACAO \(J5/);
    assert.match(texto, /classificacao: AVISO/);
    assert.match(texto, /AVISO: alvos NAO forcados pelo teste \.+ 1/);
    assert.match(texto, /LIMITACOES DECLARADAS/);
    assert.match(texto, /1 passou · 0 falhou · 2 pendente/, 'a convenção do placar do repositório');
    assert.ok(!/REPROVADO/.test(texto), 'este módulo mede e declara — quem reprova é o dono do produto');
  });

  it('é PURA: a mesma entrada devolve o MESMO relatório', () => {
    assert.deepEqual(relatorioDeExemplo(), relatorioDeExemplo());
  });
});
