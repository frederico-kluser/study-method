/**
 * app/electron/main/engine/quality/requirementsDespacho.ts — o DESPACHANTE por
 * linguagem da derivação de requirements (a mesma forma de
 * `quality/minimalPorLinguagem.ts`): uma TABELA EXPLÍCITA, fail-closed.
 *
 * A prosa normativa vive na fachada `requirements.ts`. Refatoração L04:
 * arquivo ≤500 linhas e toda função com CC≤8, sem mudança de comportamento.
 */

import { EngineLinguagemError } from '../extract';
import { DEFAULT_ADAPTER_ID, getAdapter, type LanguageId } from '../lang/registry';
import {
  type RequirementDeclarado,
  type RequirementsDerivados,
  type ValidacaoRequirements,
} from './requirementsTipos';
import { derivarRequirementsJs, validarRequirementsJs } from './requirementsJs';
import { derivarRequirementsPython, validarRequirementsPython } from './requirementsPy';
import { derivarRequirementsC, validarRequirementsC } from './requirementsC';
import { derivarRequirementsRust, validarRequirementsRust } from './requirementsRust';

/** Quem deriva requirements de cada linguagem. */
export type DerivadorDeRequirements = (
  testsCode: string,
  solutionCode: string,
  starterCode: string,
  language: LanguageId,
) => RequirementsDerivados;

/** Quem valida a bijeção de cada linguagem. */
export type ValidadorDeRequirements = (
  testsCode: string,
  requirementsDeclarados: RequirementDeclarado[],
  language: LanguageId,
) => ValidacaoRequirements;

/**
 * A TABELA. Uma linha por linguagem que tem derivação ESCRITA — nunca derivada
 * do registro de adaptadores, porque ter adaptador (parser, layout, runner) não
 * é o mesmo que ter derivação de requirements.
 */
const DERIVACAO_POR_LINGUAGEM: Readonly<
  Record<string, { derivar: DerivadorDeRequirements; validar: ValidadorDeRequirements }>
> = {
  javascript: {
    derivar: (t, s, st, lang) => derivarRequirementsJs(t, s, st, lang),
    validar: (t, d, lang) => validarRequirementsJs(t, d, lang),
  },
  python: {
    derivar: (t, s, st) => derivarRequirementsPython(t, s, st),
    validar: (t, d) => validarRequirementsPython(t, d),
  },
  c: {
    derivar: (t, s, st, lang) => derivarRequirementsC(t, s, st, lang),
    validar: (t, d, lang) => validarRequirementsC(t, d, lang),
  },
  rust: {
    derivar: (t, s, st) => derivarRequirementsRust(t, s, st),
    validar: (t, d) => validarRequirementsRust(t, d),
  },
};


/** As linguagens que TÊM derivação de requirements, em ordem estável. */
export const LINGUAGENS_COM_REQUIREMENTS: readonly LanguageId[] = Object.keys(
  DERIVACAO_POR_LINGUAGEM,
).sort() as LanguageId[];

/**
 * Resolve a derivação de uma linguagem. LANÇA `LanguageRegistryError` para id
 * desconhecido (no `getAdapter`) e `EngineLinguagemError` para linguagem
 * registrada cuja derivação ninguém escreveu.
 */
function exigirDerivacao(language: string): {
  derivar: DerivadorDeRequirements;
  validar: ValidadorDeRequirements;
} {
  const adapter = getAdapter(language);
  const par = DERIVACAO_POR_LINGUAGEM[adapter.id];
  if (par === undefined) {
    throw new EngineLinguagemError({
      modulo: 'engine/quality/requirements.ts',
      pedido: language,
      suportado: LINGUAGENS_COM_REQUIREMENTS,
      motivo:
        'a derivação LÊ a estrutura de teste da linguagem alvo (um `test(nome, …)` do node:test não ' +
        'é um `def test_…(self)` do unittest): acrescente a derivação e a linha correspondente nesta ' +
        'tabela — ler o teste com o parser de outra linguagem produziria ZERO testes reconhecidos e ' +
        'uma violação de CONTEÚDO inventada por defeito de FERRAMENTA',
    });
  }
  return par;
}

/**
 * Deriva requirements do arquivo de teste NA LINGUAGEM DO DESAFIO: um por
 * teste declarado, com descrição em pt-BR derivada dos asserts REAIS e a
 * cobertura de átomos que a linguagem consegue apurar.
 *
 * `language` ausente cai no adaptador default (`javascript`) — o contrato
 * histórico. Quem chama por uma trilha REAL deve passar `budget.adapterId`:
 * até `main@26dbc19` o CLI não passava, e os 21 desafios de Python saíam
 * `parse-falhou`.
 *
 * Lança `RequirementsParseError` se o teste não parseia (fail-closed — nunca um
 * conjunto vazio silencioso).
 */
export function derivarRequirements(
  testsCode: string,
  solutionCode: string,
  starterCode: string,
  language: LanguageId = DEFAULT_ADAPTER_ID,
): RequirementsDerivados {
  return exigirDerivacao(language).derivar(testsCode, solutionCode, starterCode, language);
}

/**
 * Valida a BIJEÇÃO requirements declarados × testes do arquivo de teste NA
 * LINGUAGEM DO DESAFIO. Todo requirement declarado precisa de um teste
 * correspondente (por nome normalizado) e todo teste precisa de um requirement
 * declarado. Determinístico, zero LLM.
 *
 * Lança `RequirementsParseError` se o teste não parseia.
 */
export function validarRequirements(
  testsCode: string,
  requirementsDeclarados: RequirementDeclarado[],
  language: LanguageId = DEFAULT_ADAPTER_ID,
): ValidacaoRequirements {
  return exigirDerivacao(language).validar(testsCode, requirementsDeclarados, language);
}
