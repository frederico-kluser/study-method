/**
 * app/electron/main/engine/review/actionCatalog.ts — o CATÁLOGO FECHADO de
 * ações do PLANEJADOR + a REGRA DE DISTINÇÃO que faz o laço de revisão
 * terminar (pacote P-13, onda 2 do plano de execução v1).
 *
 * Contrato normativo: `docs/16-engine-de-trilha.md` §6.7 (as 14 ações do
 * catálogo fechado), §5.5 (formato da violação e a distinção lacuna × ordem),
 * §7.3 (o planejador: ação DO CATÁLOGO, ordenada, nomeando arquivo + span +
 * resultado esperado; apontamento que não mapeia devolvido como DEFEITO DO
 * CATÁLOGO, nunca convertido em ação improvisada).
 *
 * REUSO (A-P13-2 — compatibilidade com o P-04): o catálogo NÃO é duplicado.
 * A constante `ACAO_CATALOGO` (`as const`) é a fonte única e vive no P-04
 * (`schemas/artifacts.ts`; `ActionsSchema` já deriva de
 * `z.enum([...ACAO_CATALOGO])`). Este módulo RE-EXPORTA a mesma constante e
 * deriva `AcaoCatalogo` dela — o TIPO da ação nunca é string solta, e qualquer
 * edição futura no catálogo acompanha o tipo em todo o código. Nada do que
 * este pacote adiciona (subconjuntos, defeitos, plano) copia os nomes à mão:
 * tudo deriva da fonte única em tempo de compilação.
 *
 * A REGRA DE DISTINÇÃO (o coração do pacote — §5.5, "a distinção que faz o
 * laço convergir"):
 *   - `evidencia.introduzido_em === null` (≡ `primeiraAulaQueEnsina === null`
 *     no formato da violação do §5.5) → LACUNA DE CURRÍCULO. A ação é CRIAR
 *     AULA — `INSERT_INTERMEDIATE` | `MOVE_CONCEPT_TO_ENTRY_BUDGET` — e NUNCA
 *     `REWRITE_IN_BUDGET`: reescrever o desafio para caber num currículo
 *     furado é exatamente o laço que nunca termina;
 *   - `evidencia.introduzido_em !== null` → violação de ORDEM. A ação é
 *     reescrever / movimentar / reordenar — e NUNCA criar aula.
 *
 * Quem consome: `prompts/planner.ts` (embute o catálogo e a regra no prompt),
 * `prompts/fixer.ts` (a decisão prescrita e `validarDiffNoSpan` do gate F11) e
 * o laço F11 (P-18): `validarAcaoNoCatalogo` / `validarAcaoParaApontamento`
 * são os primitivos PURos que transformam "plano do LLM" em "defeito do
 * catálogo estruturado" quando o modelo sai da linha.
 *
 * Zero dependências novas; zero IO; zero LLM; funções puras.
 */

import { z } from 'zod';
import { ACAO_CATALOGO, ApontamentoSchema } from '../schemas/artifacts';

// ---------------------------------------------------------------------------
// O catálogo — REUSO do P-04, tipo DERIVADO (A-P13-2)
// ---------------------------------------------------------------------------

/** O catálogo fechado do §6.7 — re-exportado da fonte única do P-04. */
export { ACAO_CATALOGO } from '../schemas/artifacts';

/** O TIPO da ação: derivado do `as const` do P-04 — nunca string solta. */
export type AcaoCatalogo = (typeof ACAO_CATALOGO)[number];

/** O span de um alvo: intervalo FECHADO [inicio, fim] (§6.3 — ex.: [122, 149]). */
export type SpanDeArquivo = readonly [inicio: number, fim: number];

/**
 * Significado de cada ação (um linha cada) — o glossário que o prompt do
 * planejador embute para o modelo mapear apontamento → ação §7.3. O tipo
 * `Record<AcaoCatalogo, string>` É exaustivo em tempo de compilação: uma ação
 * nova no catálogo do P-04 QUEBRA este mapa até ganhar significado (mais um
 * pin de que catálogo e semântica não divergem em silêncio).
 */
export const ACAO_SIGNIFICADOS: Readonly<Record<AcaoCatalogo, string>> = {
  SPLIT_NODE: 'divide um nó de currículo grande demais em dois nós atômicos (§3.6)',
  MERGE_NODES: 'funde dois nós que só fazem sentido juntos (composição, §3.7)',
  INSERT_INTERMEDIATE: 'insere a aula atômica intermediária que ensina o conceito faltante',
  DECLARE_INTEGRATIVE: 'marca o nó como integrativo (§3.7) — exige explicação própria, exemplo só não basta',
  ADD_EDGE: 'adiciona aresta de pré-requisito ou de uso no grafo (§3.4)',
  REMOVE_EDGE: 'remove aresta sem justificativa — precisão vale mais que cobertura',
  BREAK_CYCLE_WITH_STUB: 'quebra ciclo de pré-requisito com nó-ponte declarado como stub',
  BREAK_CYCLE_WITH_MINIMAL_INTRO: 'quebra ciclo ensinando a introdução mínima do conceito',
  DEFER_COMPLEXITY: 'adia uma complexidade para aula posterior, com fora_de_escopo declarado',
  MARK_WIP: 'marca o artefato como trabalho em andamento em vez de prometer conteúdo',
  MOVE_CONCEPT_TO_ENTRY_BUDGET: 'declara o conceito como critério de entrada em vez de aula própria',
  REWRITE_IN_BUDGET: 'reescreve o artefato dentro do orçamento vigente (violação de ordem)',
  ADD_TEST: 'acrescenta o teste que cobre o cenário faltante do desafio',
  SPLIT_LESSON: 'divide a aula quando o orçamento estoura a unidade atômica',
};

// ---------------------------------------------------------------------------
// Subconjuntos DERIVADOS — sem segunda cópia literal do catálogo
// ---------------------------------------------------------------------------

/**
 * As ações de LACUNA DE CURRÍCULO (§5.5): criar a aula que falta. A única
 * duplicação literal deste arquivo é ESTA dupla de nomes (a distinção que o
 * §5.5 exige) — o complemento é derivado por exclusão em tempo de compilação.
 */
export const ACOES_DE_LACUNA = ['INSERT_INTERMEDIATE', 'MOVE_CONCEPT_TO_ENTRY_BUDGET'] as const;
export type AcaoDeLacuna = (typeof ACOES_DE_LACUNA)[number];

/** Exclui do catálogo as ações de lacuna — usado para derivar `AcaoDeOrdem`. */
type ExcluiLacuna<A> = A extends AcaoDeLacuna ? never : A;

/**
 * As ações de violação de ORDEM: reescrita/movimentação/reordenação — sem
 * criação de aula. Derivado por exclusão: uma ação nova no catálogo cai
 * automaticamente em um dos dois lados.
 */
export type AcaoDeOrdem = ExcluiLacuna<AcaoCatalogo>;

const ACOES_DE_LACUNA_SET: ReadonlySet<string> = new Set<string>(ACOES_DE_LACUNA);

/** Versão de runtime de `AcaoDeOrdem` — o complemento fechado de `ACOES_DE_LACUNA`. */
export const ACOES_DE_ORDEM: readonly AcaoDeOrdem[] = ACAO_CATALOGO.filter(
  (acao): acao is AcaoDeOrdem => !ACOES_DE_LACUNA_SET.has(acao),
);

// ---------------------------------------------------------------------------
// Defeito DO CATÁLOGO — falha de mapeamento estruturada (§7.3)
// ---------------------------------------------------------------------------

/** Por que o apontamento não virou ação: três motivos possíveis e fechados. */
export type MotivoDeFalhaDeMapeamento = 'FORA_DO_CATALOGO' | 'POLARIDADE_VIOLADA' | 'SEM_MAPEAMENTO';

/**
 * A falha de mapeamento ESTRUTURADA (§7.3): apontamento que não mapeia para
 * nenhuma ação (SEM_MAPEAMENTO), ação que não existe no catálogo
 * (FORA_DO_CATALOGO — o planejador não pode improvisar) ou ação do catálogo
 * porém proibida para aquele apontamento (POLARIDADE_VIOLADA — §5.5). O laço
 * P-18 devolve isto ao planejador na rodada seguinte; nunca vira patch.
 */
export interface DefeitoDoCatalogo {
  tipo: 'FALHA_DE_MAPEAMENTO';
  apontamento_id: string;
  /** a ação que o modelo tentou usar; `''` quando ele não mapeou nada. */
  acao_informada: string;
  motivo: MotivoDeFalhaDeMapeamento;
  /** por que não mapeia — evidência legível para o laço. */
  detalhe: string;
}

/** Guarda de runtime do tipo derivado (os tipos não existem em runtime). */
export function isAcaoDoCatalogo(valor: unknown): valor is AcaoCatalogo {
  return typeof valor === 'string' && (ACAO_CATALOGO as readonly string[]).includes(valor);
}

export type ResultadoDeValidacaoNoCatalogo =
  | { ok: true; acao: AcaoCatalogo }
  | { ok: false; defeito: DefeitoDoCatalogo };

/**
 * Valida uma ação do planejador contra o catálogo FECHADO. Fora do catálogo →
 * defeito DO CATÁLOGO estruturado (nunca ação improvisada, §7.3). FAIL-CLOSED:
 * valor não-string também é falha, não passa em silêncio.
 */
export function validarAcaoNoCatalogo(acao: unknown, apontamento_id: string): ResultadoDeValidacaoNoCatalogo {
  if (isAcaoDoCatalogo(acao)) return { ok: true, acao };
  const acaoInformada = typeof acao === 'string' ? acao : JSON.stringify(acao);
  return {
    ok: false,
    defeito: {
      tipo: 'FALHA_DE_MAPEAMENTO',
      apontamento_id,
      acao_informada: acaoInformada,
      motivo: 'FORA_DO_CATALOGO',
      detalhe: `a ação "${acaoInformada}" não pertence ao catálogo fechado (§6.7) — o apontamento é devolvido como defeito do catálogo, nunca convertido em ação improvisada (§7.3).`,
    },
  };
}

/**
 * O defeito do catálogo para apontamento que NÃO mapeou para NENHUMA ação
 * (§7.3): o modelo não improvisou uma ação inexistente — deixou o apontamento
 * de fora do plano, e o laço materializa o defeito aqui. A ação informada é
 * vazia por construção.
 */
export function defeitoSemMapeamento(apontamento_id: string, detalhe: string): DefeitoDoCatalogo {
  return { tipo: 'FALHA_DE_MAPEAMENTO', apontamento_id, acao_informada: '', motivo: 'SEM_MAPEAMENTO', detalhe };
}

// ---------------------------------------------------------------------------
// A REGRA DE DISTINÇÃO — planoDeAcao (§5.5)
// ---------------------------------------------------------------------------

/** O apontamento VALIDADO (schema do P-04 — a entrada canônica no laço). */
export type Apontamento = z.infer<typeof ApontamentoSchema>;

/** Alias de leitura: o que `planoDeAcao` espera é o apontamento já validado. */
export type ApontamentoParaPlano = Apontamento;

export interface PlanoDeAcaoLacuna {
  lacuna: true;
  /** ação CRIAR AULA — o tipo restringe ao par de criação (nunca REWRITE_IN_BUDGET). */
  acao: 'INSERT_INTERMEDIATE';
  /** todas as ações permitidas para apontamento-lacuna (o par do §5.5). */
  acoes_permitidas: readonly AcaoDeLacuna[];
  motivo: string;
}

export interface PlanoDeAcaoOrdem {
  lacuna: false;
  /** reescrita dentro do orçamento — o movimento default da violação de ordem. */
  acao: 'REWRITE_IN_BUDGET';
  /** todas as ações permitidas para violação de ordem (sem criação de aula). */
  acoes_permitidas: readonly AcaoDeOrdem[];
  motivo: string;
}

export type PlanoDeAcao = PlanoDeAcaoLacuna | PlanoDeAcaoOrdem;

const ACAO_PADRAO_LACUNA = 'INSERT_INTERMEDIATE' as const;
const ACAO_PADRAO_ORDEM = 'REWRITE_IN_BUDGET' as const;

/**
 * planoDeAcao(apontamentoValidado) — o tradutor apontamento → polaridade de
 * ação, FUNÇÃO PURA e determinística (§5.5):
 *
 *   - `evidencia.introduzido_em === null` → LACUNA DE CURRÍCULO: CRIAR AULA
 *     (INSERT_INTERMEDIATE default; MOVE_CONCEPT_TO_ENTRY_BUDGET é a
 *     alternativa quando o conceito pertence aos critérios de entrada). NUNCA
 *     REWRITE_IN_BUDGET — essa proibição é de TIPO (AcaoDeLacuna) e de runtime
 *     (acoes_permitidas).
 *   - `evidencia.introduzido_em !== null` → violação de ORDEM: reescrita/
 *     movimentação/reordenação (REWRITE_IN_BUDGET default). NUNCA criar aula —
 *     também de tipo (AcaoDeOrdem) e de runtime.
 *
 * É ela que faz o laço terminar: lacuna não é reescrita em loop infinito.
 */
export function planoDeAcao(apontamento: ApontamentoParaPlano): PlanoDeAcao {
  if (apontamento.evidencia.introduzido_em === null) {
    return {
      lacuna: true,
      acao: ACAO_PADRAO_LACUNA,
      acoes_permitidas: [...ACOES_DE_LACUNA],
      motivo:
        'LACUNA DE CURRÍCULO: primeiraAulaQueEnsina === null — falta a aula que ensina o conceito; ' +
        `a ação é CRIAR AULA (${ACOES_DE_LACUNA.join(' | ')}) e NUNCA reescrever o artefato ` +
        '(REWRITE_IN_BUDGET reescreveria o desafio para caber num currículo furado e o laço nunca terminaria, §5.5).',
    };
  }
  return {
    lacuna: false,
    acao: ACAO_PADRAO_ORDEM,
    acoes_permitidas: [...ACOES_DE_ORDEM],
    motivo:
      `violação de ORDEM: primeiraAulaQueEnsina === "${apontamento.evidencia.introduzido_em}" — o conceito ` +
      'é ensinado, mas fora da ordem; a ação é reescrever/movimentar/reordenar e NUNCA criar aula (§5.5).',
  };
}

// ---------------------------------------------------------------------------
// O gate do laço F11 — plano do LLM × catálogo × polaridade
// ---------------------------------------------------------------------------

export type ResultadoDeAcaoParaApontamento =
  | { ok: true; plano: PlanoDeAcao }
  | { ok: false; defeito: DefeitoDoCatalogo };

/**
 * A validação COMPLETA da ação que o planejador (LLM) atribuiu a um
 * apontamento: (1) existe no catálogo fechado? senão → FALHA_DE_MAPEAMENTO
 * FORA_DO_CATALOGO; (2) respeita a polaridade da distinção §5.5? senão →
 * FALHA_DE_MAPEAMENTO POLARIDADE_VIOLADA. É o primitivo FAIL-CLOSED do gate do
 * laço F11 (P-18): plano que sair da linha vira defeito do catálogo, nunca
 * patch.
 */
export function validarAcaoParaApontamento(
  apontamento: ApontamentoParaPlano,
  acao: unknown,
): ResultadoDeAcaoParaApontamento {
  const noCatalogo = validarAcaoNoCatalogo(acao, apontamento.id);
  if (!noCatalogo.ok) return { ok: false, defeito: noCatalogo.defeito };

  const plano = planoDeAcao(apontamento);
  const permitidas: readonly AcaoCatalogo[] = plano.acoes_permitidas;
  if (!permitidas.includes(noCatalogo.acao)) {
    const eixo = plano.lacuna ? 'lacuna de currículo' : 'violação de ordem';
    const proibicao = plano.lacuna
      ? 'lacuna NUNCA é reescrita — REWRITE_IN_BUDGET proibido; só CRIAR AULA'
      : 'ordem NUNCA cria aula — INSERT_INTERMEDIATE proibido; só reescrita/movimentação';
    return {
      ok: false,
      defeito: {
        tipo: 'FALHA_DE_MAPEAMENTO',
        apontamento_id: apontamento.id,
        acao_informada: noCatalogo.acao,
        motivo: 'POLARIDADE_VIOLADA',
        detalhe: `ação do catálogo porém proibida para ${eixo} (§5.5): ${proibicao}. Permitidas: ${permitidas.join(' | ')}.`,
      },
    };
  }
  return { ok: true, plano };
}