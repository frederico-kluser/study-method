/**
 * app/electron/main/engine/quality/mutantsValidacao.ts — a validação
 * FAIL-CLOSED do gerador de mutantes (P-20): schema válido, diferença
 * EXATAMENTE nos campos da classe e a propriedade da classe verificada por
 * parser (`extractAtoms`).
 *
 * A prosa normativa vive na fachada `mutants.ts`. Refatoração L04: arquivo
 * ≤500 linhas e toda função com CC≤8, sem mudança de comportamento observável.
 */

import { ChallengeDraftSchema } from '../schemas/artifacts';
import { type Desafio, type DesafioParaMutacao, type Mutante } from './mutantsTipos';
import { chavesDe, exigirJsDoDesafio } from './mutantsSuporte';
import { ATOMS_DO_CANAL_DE_IMPRESSAO } from './mutantsMutacoes';

/** Os campos do desafio — a régua do "UM defeito por mutante". */
const CAMPOS_DO_DESAFIO: readonly (keyof Desafio)[] = [
  'slug',
  'conceito',
  'statement',
  'starterCode',
  'solutionCode',
  'testsCode',
  'expectedTestCount',
  'outputChannel',
  'requires',
  'notRequired',
  'subgoals',
  'scenarios',
  'taskSkill',
  'supportLevel',
  'surfaceDomain',
  'solutionAlternates',
  'wrongSolutions',
  'requirements',
  'justificativa',
  'aprovado',
];

/** Quais campos do desafio DIFEREM entre base e mutação (comparação por JSON). */
function camposDiferentes(base: Desafio, mutado: Desafio): string[] {
  return CAMPOS_DO_DESAFIO.filter((campo) => JSON.stringify(base[campo]) !== JSON.stringify(mutado[campo]));
}

/** (a) — só `solutionCode` muda e a construção proibida entra, fora de `requires`. */
function validarForaDoOrcamento(
  base: DesafioParaMutacao,
  mutado: DesafioParaMutacao,
  camposMutados: string[],
  erros: string[],
): void {
  if (JSON.stringify(camposMutados) !== JSON.stringify(['solutionCode'])) {
    erros.push(`mexeu em campos além de solutionCode: [${camposMutados.join(', ')}]`);
  }
  const proibida = 'api:Number.isFinite';
  const chavesMutado = chavesDe(mutado.desafio.solutionCode);
  if (!chavesMutado.includes(proibida)) erros.push('a solução mutada não contém a construção proibida');
  if (base.desafio.requires.includes(proibida)) erros.push('a construção "proibida" já está no orçamento');
}

/** (b) — só `testsCode` muda, a divergência (par → false) entra e o resto segue. */
function validarTesteDivergente(mutado: DesafioParaMutacao, camposMutados: string[], erros: string[]): void {
  if (JSON.stringify(camposMutados) !== JSON.stringify(['testsCode'])) {
    erros.push(`mexeu em campos além de testsCode: [${camposMutados.join(', ')}]`);
  }
  if (!mutado.desafio.testsCode.includes('ehPar(4), false')) erros.push('a divergência (par → false) não está nos testes');
  if (!mutado.desafio.testsCode.includes('ehPar(5), false')) erros.push('o resto do teste não seguiu o enunciado');
}

/** (c) — `solutionCode`+`outputChannel`+`requires` mudam; o canal é declarado; nada vaza. */
function validarImpressao(mutado: DesafioParaMutacao, camposMutados: string[], erros: string[]): void {
  if (JSON.stringify(camposMutados) !== JSON.stringify(['solutionCode', 'outputChannel', 'requires'])) {
    erros.push(`mexeu em campos além de solutionCode/outputChannel/requires: [${camposMutados.join(', ')}]`);
  }
  if (mutado.desafio.outputChannel !== 'impressao') erros.push('outputChannel não foi para impressao');
  if (!mutado.desafio.solutionCode.includes('console.log')) erros.push('a solução mutada não imprime');
  if (mutado.desafio.solutionCode.includes('return')) erros.push('a solução mutada ainda retorna');
  const chavesMutado = chavesDe(mutado.desafio.solutionCode);
  const foraDoOrcamento = chavesMutado.filter((chave) => !mutado.desafio.requires.includes(chave));
  if (foraDoOrcamento.length > 0) {
    erros.push(`a solução mutada vazou do orçamento do mutante: [${foraDoOrcamento.join(', ')}]`);
  }
  const canalNaoDeclarado = ATOMS_DO_CANAL_DE_IMPRESSAO.filter((chave) => !mutado.desafio.requires.includes(chave));
  if (canalNaoDeclarado.length > 0) {
    erros.push(`os átomos do canal não foram declarados no orçamento do mutante: [${canalNaoDeclarado.join(', ')}]`);
  }
}

/** (d) — só `solutionCode` muda; a solução não exercita a aula nem vaza do orçamento. */
function validarNaoExercita(mutado: DesafioParaMutacao, camposMutados: string[], erros: string[]): void {
  if (JSON.stringify(camposMutados) !== JSON.stringify(['solutionCode'])) {
    erros.push(`mexeu em campos além de solutionCode: [${camposMutados.join(', ')}]`);
  }
  const chavesMutado = chavesDe(mutado.desafio.solutionCode);
  const exercita = chavesMutado.filter((chave) => mutado.introducesProductive.includes(chave));
  const foraDoOrcamento = chavesMutado.filter((chave) => !mutado.desafio.requires.includes(chave));
  if (exercita.length > 0) erros.push(`a solução mutada ainda usa construção da aula: [${exercita.join(', ')}]`);
  if (foraDoOrcamento.length > 0) erros.push(`a solução mutada vazou do orçamento: [${foraDoOrcamento.join(', ')}]`);
}

/**
 * A validação de um mutante gerado: schema válido, diferença EXATAMENTE nos
 * campos da classe e a propriedade da classe verificada por parser
 * (`extractAtoms`). Qualquer desvio é erro do gerador — inclusive um mutante
 * (c) cuja solução vaze do orçamento declarado (mutante de classe dupla,
 * rejeitado fail-closed). Exportada para os testes de rejeição provarem que
 * um mutante (c) artificial e vazado NUNCA passa pela porta do gerador.
 */
export function validarMutante(base: DesafioParaMutacao, mutante: Mutante, mutado: DesafioParaMutacao): void {
  exigirJsDoDesafio(base, 'validarMutante');
  ChallengeDraftSchema.parse(mutado.desafio);

  const camposMutados = camposDiferentes(base.desafio, mutado.desafio);
  const erros: string[] = [];

  switch (mutante.classe) {
    case 'fora_do_orcamento': {
      validarForaDoOrcamento(base, mutado, camposMutados, erros);
      break;
    }
    case 'teste_divergente_do_enunciado': {
      validarTesteDivergente(mutado, camposMutados, erros);
      break;
    }
    case 'imprime_em_vez_de_retornar': {
      validarImpressao(mutado, camposMutados, erros);
      break;
    }
    case 'nao_exercita_a_aula': {
      validarNaoExercita(mutado, camposMutados, erros);
      break;
    }
  }

  if (erros.length > 0) {
    throw new Error(`mutants: o mutante ${mutante.id} (${mutante.classe}) falhou a validação do gerador: ${erros.join('; ')}`);
  }
}
