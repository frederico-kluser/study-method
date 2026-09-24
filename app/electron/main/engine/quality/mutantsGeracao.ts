/**
 * app/electron/main/engine/quality/mutantsGeracao.ts — o GERADOR (UM mutante
 * por classe, todos validados) e o aplicador — a porta única de aplicação
 * usada pela calibração (`medirTaxaDeFalsoPasse` em `judgeCalibration.ts`).
 *
 * A prosa normativa vive na fachada `mutants.ts`. Refatoração L04: arquivo
 * ≤500 linhas e toda função com CC≤8, sem mudança de comportamento observável.
 */

import { ChallengeDraftSchema } from '../schemas/artifacts';
import { type DesafioParaMutacao, type Mutante } from './mutantsTipos';
import { exigirJsDoDesafio } from './mutantsSuporte';
import {
  mutarConstrucaoForaDoOrcamento,
  mutarImpressaoEmVezDeRetorno,
  mutarNaoExercitaAAula,
  mutarTesteDivergenteDoEnunciado,
} from './mutantsMutacoes';
import { validarMutante } from './mutantsValidacao';

/** Os QUATRO mutantes da geração (M1..M4), um por classe de defeito. */
function mutantesDaGeracao(): Mutante[] {
  return [
    {
      id: 'M1',
      classe: 'fora_do_orcamento',
      defeito:
        'a solutionCode usa `api:Number.isFinite`, construção fora de `requires` — construção usada sem ter sido ensinada (orçamento da aula violado)',
      marcador: 'Number.isFinite(v)',
      aplicar: mutarConstrucaoForaDoOrcamento,
    },
    {
      id: 'M2',
      classe: 'teste_divergente_do_enunciado',
      defeito:
        'o teste "numero par" assere `ehPar(4) === false`, contradizendo o enunciado, que exige `true` para par (bijeção enunciado ↔ teste, J4)',
      marcador: 'ehPar(4), false',
      aplicar: mutarTesteDivergenteDoEnunciado,
    },
    {
      id: 'M3',
      classe: 'imprime_em_vez_de_retornar',
      defeito:
        'a solução imprime no console em vez de retornar o valor (modo de falha nº 1, §10); `outputChannel` foi para `impressao`, o teste espera o retorno, e o orçamento do mutante declara os átomos do canal (`global:console`, `api:console.log`, `node:ExpressionStatement`) — o defeito é UNO',
      marcador: 'console.log',
      aplicar: mutarImpressaoEmVezDeRetorno,
    },
    {
      id: 'M4',
      classe: 'nao_exercita_a_aula',
      defeito:
        'a solução não usa a construção nova da aula (`op:binary:%` dos introduces) — o desafio pode ser resolvido sem exercitar a aula (A6/C5)',
      marcador: 'Math.round(n / 2)',
      aplicar: mutarNaoExercitaAAula,
    },
  ];
}

/**
 * Gera UM mutante por classe de defeito sobre um artefato VÁLIDO. Cada
 * mutante carrega a classe e o defeito exato; `rodaMutante` aplica a mutação
 * devolvendo o artefato mutado. FAIL-CLOSED: base inválida (schema) ou
 * mutante que não passe na validação lançam — o gerador nunca entrega um
 * mutante que não mude nada nem um que quebre o desafio.
 */
export function gerarMutantes(artefatoValido: DesafioParaMutacao): Mutante[] {
  exigirJsDoDesafio(artefatoValido, 'gerarMutantes');
  ChallengeDraftSchema.parse(artefatoValido.desafio);

  const mutantes = mutantesDaGeracao();
  for (const mutante of mutantes) {
    const mutado = rodaMutante(mutante, artefatoValido);
    validarMutante(artefatoValido, mutante, mutado);
  }
  return mutantes;
}

/**
 * Aplica a mutação de um mutante sobre uma base, devolvendo o artefato
 * MUTADO — a porta única de aplicação usada pela calibração
 * (`medirTaxaDeFalsoPasse` em `judgeCalibration.ts`).
 */
export function rodaMutante(mutante: Mutante, artefato: DesafioParaMutacao): DesafioParaMutacao {
  exigirJsDoDesafio(artefato, 'rodaMutante');
  return mutante.aplicar(artefato);
}
