/**
 * app/electron/main/engine/review/constituicao.ts — A CONSTITUIÇÃO C1–C8 como
 * CONSTANTES NOMEADAS (pacote P-18, onda 3 do plano de execução v1 — o laço
 * F11). AJUSTE DO REPLAN: materializar C1–C8 fora do prompt (prompts/* é
 * leitura) e fazer o FILTRO R6 validar `regra_violada` CONTRA estas
 * constantes — regra que não existe aqui é descartada mecanicamente, nunca
 * chega ao planejador.
 *
 * Contrato normativo: `docs/16-engine-de-trilha.md` §6.7 — "Constituição com
 * as DUAS polaridades na mesma rodada. Eixo restritivo: C1 nada fora do
 * orçamento · C2 desafio resolvível só com o ensinado · C3 testes legíveis
 * com o orçamento de entrada · C4 uma unidade nova por aula. Eixo
 * construtivo: C5 o desafio exercita o conceito NOVO · C6 não é resolvível
 * por `return` constante · C7 a teoria ensina tudo o que o desafio cobra ·
 * C8 nenhum conceito órfão. Sem o eixo construtivo o laço produz aulas
 * triviais — é o mesmo efeito medido em Constitutional AI, onde a inocuidade
 * sobe monotonicamente enquanto a utilidade cai."
 *
 * A forma dos artigos é a `RegraDoCatalogo` do prompt do revisor (P-12):
 * `{ id, texto }` — o catálogo de regras que o REVISOR recebe é ESTE array
 * (via `regrasDaConstituicao()`), nunca uma cópia digitada à mão: prompt e
 * gate compartilham a fonte única, e uma emenda na constituição vale para os
 * dois de uma vez. `eixo` é campo aditivo estrutural (o artigo continua
 * atribuível a `RegraDoCatalogo`, que só exige id+texto).
 *
 * Zero dependências novas; zero IO; zero LLM; funções puras.
 */

import type { RegraDoCatalogo } from '../prompts/reviewer';

// ---------------------------------------------------------------------------
// O eixo de cada artigo
// ---------------------------------------------------------------------------

/**
 * Polaridade do artigo (§6.7). RESTRITIVO = o que a aula NÃO pode fazer
 * (limites); CONSTRUTIVO = o que a aula TEM de fazer (utilidade — sem ele o
 * laço converge para aulas triviais). O laço F11 pode particionar os
 * instrumentos de revisão por eixo: categorias DISJUNTAS por instrumento, e
 * a barreira garante que nenhum artigo fica de fora.
 */
export type EixoDaConstituicao = 'restritivo' | 'construtivo';

// ---------------------------------------------------------------------------
// Os artigos — constates nomeadas, uma por artigo (A-P18)
// ---------------------------------------------------------------------------

/** C1 (restritivo): nada fora do orçamento — a regra dura do §7.1 regra 3. */
export const C1: RegraDoCatalogo & { eixo: EixoDaConstituicao } = {
  id: 'C1',
  eixo: 'restritivo',
  texto:
    'Nada fora do orçamento: nenhuma construção, palavra-chave, operador, API ou forma sintática de ' +
    'qualquer superfície (prosa, teoria, starter, solução, teste) pode estar fora das listas do orçamento ' +
    'congelado — em código o limiar é 100%, não uma porcentagem tolerada (§5.1/§7.1 regra 3).',
};

/** C2 (restritivo): o desafio é resolvível SÓ com o que já foi ensinado. */
export const C2: RegraDoCatalogo & { eixo: EixoDaConstituicao } = {
  id: 'C2',
  eixo: 'restritivo',
  texto:
    'Desafio resolvível só com o ensinado: o desafio precisa ser resolvível usando exclusivamente o ' +
    'orçamento de entrada vigente — exigir construção ainda não ensinada é violação de ordem (§5.5) ou ' +
    'lacuna de currículo, nunca licença para usar o que não foi ensinado.',
};

/** C3 (restritivo): o teste é lido ANTES da aula — só o orçamento de entrada. */
export const C3: RegraDoCatalogo & { eixo: EixoDaConstituicao } = {
  id: 'C3',
  eixo: 'restritivo',
  texto:
    'Testes legíveis com o orçamento de entrada: o arquivo de teste é lido antes da aula e por isso só ' +
    'pode usar construções do orçamento receptivo de ENTRADA — o que a própria aula introduz é, para o ' +
    'teste, futuro (§5.1 regra A3).',
};

/** C4 (restritivo): uma unidade nova por aula — incremento mínimo. */
export const C4: RegraDoCatalogo & { eixo: EixoDaConstituicao } = {
  id: 'C4',
  eixo: 'restritivo',
  texto:
    'Uma unidade nova por aula: a aula introduz no máximo duas construções produtivas (A7) e o ' +
    'incremento é mínimo sobre o conhecimento prévio — adicionar mais é granularidade ilegal (§3.6).',
};

/** C5 (construtivo): a direção puxada — o desafio exercita o conceito novo. */
export const C5: RegraDoCatalogo & { eixo: EixoDaConstituicao } = {
  id: 'C5',
  eixo: 'construtivo',
  texto:
    'O desafio exercita o conceito novo: a solução deve conter ao menos uma construção introduzida por ' +
    'esta aula (A6 — a direção puxada); sem isso a aula só repete o que o aluno já sabia (§5.1 A6).',
};

/** C6 (construtivo): nada de `return` constante — o desafio exige pensar. */
export const C6: RegraDoCatalogo & { eixo: EixoDaConstituicao } = {
  id: 'C6',
  eixo: 'construtivo',
  texto:
    'Não é resolvível por `return` constante: o desafio não pode ser satisfeito por uma resposta fixa ' +
    '(literal, vazio, recusa); a solução mínima tem de exercitar o conceito-alvo (§9.1 J5).',
};

/** C7 (construtivo): a teoria ensina tudo o que o desafio cobra. */
export const C7: RegraDoCatalogo & { eixo: EixoDaConstituicao } = {
  id: 'C7',
  eixo: 'construtivo',
  texto:
    'A teoria ensina tudo o que o desafio cobra: toda construção exigida no desafio aparece ensinada na ' +
    'teoria desta aula ou em aula anterior declarada como pré-requisito — cobrar o que a própria teoria ' +
    'não mostra é ambiguidade ou lacuna (§7.1 regra 3).',
};

/** C8 (construtivo): nenhum conceito órfão — ensinado tem de ser exigido. */
export const C8: RegraDoCatalogo & { eixo: EixoDaConstituicao } = {
  id: 'C8',
  eixo: 'construtivo',
  texto:
    'Nenhum conceito órfão: toda construção ensinada aparece exigida em algum desafio posterior — ' +
    'ensinar sem exercitar é conceito órfão (I6), e o inverso — exigir sem ensinar — é C7/C2.',
};

// ---------------------------------------------------------------------------
// A constituição COMPLETA e as famílias derivadas
// ---------------------------------------------------------------------------

/**
 * A constituição C1–C8 na ordem normativa do §6.7. `as const` para o tipo:
 * o laço, o filtro R6, a partição por eixo e o catálogo de regras do revisor
 * derivam TUDO daqui.
 */
export const CONSTITUICAO = [C1, C2, C3, C4, C5, C6, C7, C8] as const;

/** O tipo do artigo derivado do `as const`. */
export type ArtigoDaConstituicao = (typeof CONSTITUICAO)[number];

/** Os ids C1–C8 — o domínio fechado do filtro R6. */
export const IDS_DA_CONSTITUICAO: readonly string[] = CONSTITUICAO.map((a) => a.id);

/** Conjunto fechado dos ids — o predicado R6 olha AQUI. */
const IDS_DA_CONSTITUICAO_SET: ReadonlySet<string> = new Set<string>(IDS_DA_CONSTITUICAO);

/**
 * R6 — `regra_violada` existe no catálogo? FUNÇÃO PURA (A-P18): uma regra que
 * não está em C1–C8 não existe; o apontamento que a invoca é descartado antes
 * de chegar ao planejador (§6.4). O catálogo é FECHADO: inventar regra é
 * descartado, nunca tratado como regra nova — emendar a constituição é mudar
 * ESTE arquivo.
 */
export function regraExisteNaConstituicao(regra: string): boolean {
  return IDS_DA_CONSTITUICAO_SET.has(regra);
}

/**
 * O catálogo de regras no formato que o PROMPT do revisor (P-12) consome —
 * `readonly RegraDoCatalogo[]` (id+texto). O `eixo` é campo ADITIVO: a lista
 * é estruturalmente atribuível ao tipo do prompt sem cópia. Fonte única:
 * o revisor e o filtro R6 leem os MESMOS artigos.
 */
export function regrasDaConstituicao(): readonly RegraDoCatalogo[] {
  return CONSTITUICAO;
}

/**
 * Partição da constituição por eixo — "categorias disjuntas por instrumento"
 * (§6.1/§6.7, as DUAS polaridades na mesma rodada). Sem os artigos
 * construtivos o laço converge para aulas triviais; a partição garante por
 * construção que NENHUM artigo fica de fora: todo id de `CONSTITUICAO`
 * pertence a exatamente um dos dois conjuntos (verificado em teste).
 */
export function artigosPorEixo(eixo: EixoDaConstituicao): readonly RegraDoCatalogo[] {
  return CONSTITUICAO.filter((a) => a.eixo === eixo);
}