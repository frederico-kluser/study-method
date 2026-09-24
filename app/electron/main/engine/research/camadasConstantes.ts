/**
 * app/electron/main/engine/research/camadasConstantes.ts — as constantes da
 * pesquisa em camadas (`camadas.ts`). Extraídas do módulo original na
 * refatoração do lote L05 (para que `camadasAnalise.ts` as use sem ciclo de
 * import) sem NENHUMA mudança de comportamento — a fachada `camadas.ts`
 * re-exporta tudo isto pelos MESMOS nomes.
 */

/** Identidade do artefato produzido por este módulo. */
export const SCHEMA_PESQUISA_EM_CAMADAS = 'pesquisa-em-camadas' as const;

/**
 * Teto de camadas. Não é gosto: cada camada é no mínimo uma chamada de busca
 * mais uma de LLM, e o custo cresce linear. 4 é o teto declarado; quem quiser
 * mais muda aqui e assume a conta.
 */
export const TETO_CAMADAS = 4;
/** Teto de lacunas atacadas por camada — o mesmo raciocínio de custo. */
export const TETO_LACUNAS_POR_CAMADA = 5;
