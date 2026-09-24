/**
 * tests/cx-gap-l06-dossier-validacao.test.ts — GAP de cobertura do lote L06
 * sobre `engine/prompts/dossier.ts`: o contrato `EI_CLASS_VALUES` (CONTRATO —
 * outro agente conserta o seam que o alimenta) e os CAMINHOS de recusa de
 * `montarDossie` que `enginePromptAuthor.test.ts` não pinava: precedência do
 * PRIMEIRO campo faltante quando vários faltam, e o nome do campo RAIZ quando o
 * valor inválido é ANINHADO (desafios_ja_escritos).
 *
 * Sem rede, sem LLM, sem chave: função pura sobre objeto.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CAMPOS_DO_DOSSIE,
  EI_CLASS_VALUES,
  ErroDossieIncompleto,
  montarDossie,
} from '../electron/main/engine/prompts/dossier';

/** O dossiê bruto mínimo válido — todos os 13 campos do §7.1. */
function dossieBase(): Record<string, unknown> {
  return {
    objetivo: {
      verbo: 'declarar',
      objeto: 'uma variável mutável',
      contexto: 'num programa de console',
      criterio: 'declara com let e reatribui sem erro',
    },
    introduces_productive: ['decl:let'],
    budget_produtivo: ['decl:let'],
    budget_receptivo: ['decl:let'],
    budget_teste: ['api:assert.equal'],
    kc_type: 'decl',
    ei_class: 'regra',
    subgoals: ['declarar com let'],
    terms: ['variável'],
    notional_machine_delta: 'a célula da variável muda de valor na reatribuição',
    fora_de_escopo: [{ item: 'const', motivo: 'é construção de aula posterior no grafo' }],
    misconceptions_a_refutar: [{ concepcao: 'let declara constante', ancora_na_spec: 'ECMA-262 §13.3.2' }],
    desafios_ja_escritos: [
      {
        slug: 'desafio-let',
        conceito: 'decl:let',
        language: 'nodejs',
        statement: 'declare e reatribua',
        starterCode: 'export {};',
        solutionCode: 'export {};',
        testsCode: 'test("t", () => {});',
        expectedTestCount: 1,
        outputChannel: 'retorno',
        requires: [],
        notRequired: [],
        subgoals: [],
        scenarios: [],
        taskSkill: 'escrever declaração',
        supportLevel: 'sem_andaime',
        surfaceDomain: 'console',
        solutionAlternates: [],
        wrongSolutions: [],
        requirements: [],
        justificativa: 'exercita a construção nova da aula',
        aprovado: true,
      },
    ],
  };
}

describe('dossier — contrato EI_CLASS_VALUES (CONTRATO fixo; o seam que o alimenta é de outro agente)', () => {
  it('EI_CLASS_VALUES é exatamente [fato, categoria, regra, principio, integrativo]', () => {
    assert.deepEqual([...EI_CLASS_VALUES], ['fato', 'categoria', 'regra', 'principio', 'integrativo']);
  });

  it('ei_class fora do enum fechado recusa nomeando o campo', () => {
    const bruto = { ...dossieBase(), ei_class: 'fakt' };
    assert.throws(
      () => montarDossie(bruto),
      (erro: unknown) => erro instanceof ErroDossieIncompleto && erro.campoFaltante === 'ei_class',
    );
  });
});

describe('dossier — montarDossie: precedência e nome do campo na recusa estruturada', () => {
  it('com VÁRIOS campos faltando, o erro nomeia o PRIMEIRO da ordem canônica', () => {
    const bruto = dossieBase();
    delete bruto['kc_type'];
    delete bruto['objetivo'];
    delete bruto['terms'];
    assert.throws(
      () => montarDossie(bruto),
      (erro: unknown) => {
        assert.ok(erro instanceof ErroDossieIncompleto);
        assert.equal(erro.campoFaltante, 'objetivo', 'o primeiro faltante da ordem canônica é que é nomeado');
        return true;
      },
    );
  });

  it('campo presente com valor UNDEFINED conta como ausente (recusa nomeando o campo)', () => {
    const bruto = { ...dossieBase(), subgoals: undefined };
    assert.throws(
      () => montarDossie(bruto),
      (erro: unknown) => erro instanceof ErroDossieIncompleto && erro.campoFaltante === 'subgoals',
    );
  });

  it('valor inválido ANINHADO (desafio malformado) nomeia a RAIZ do campo no campoFaltante', () => {
    const bruto = dossieBase();
    bruto['desafios_ja_escritos'] = [{ slug: 'so-slug' }];
    assert.throws(
      () => montarDossie(bruto),
      (erro: unknown) => {
        assert.ok(erro instanceof ErroDossieIncompleto);
        assert.equal(erro.campoFaltante, 'desafios_ja_escritos');
        assert.match(erro.message, /desafios_ja_escritos/);
        return true;
      },
    );
  });

  it('array no lugar do objeto raiz recusa com campoFaltante null (nunca run vazio)', () => {
    assert.throws(
      () => montarDossie([]),
      (erro: unknown) => erro instanceof ErroDossieIncompleto && erro.campoFaltante === null,
    );
  });

  it('dossiê VÁLIDO passa e preserva os 13 campos na saída do portão', () => {
    const dossie = montarDossie(dossieBase());
    for (const campo of CAMPOS_DO_DOSSIE) {
      assert.ok(campo in dossie, `campo "${campo}" presente na saída`);
    }
    assert.equal(dossie.desafios_ja_escritos[0].slug, 'desafio-let');
    assert.equal(dossie.ei_class, 'regra');
  });
});
