/**
 * app/electron/main/engine/modes/curriculumGap.ts — O SUB-FLUXO v2: A LACUNA
 * DE CURRÍCULO VIRA AULA.
 *
 * O QUE ESTE MÓDULO FAZ, E POR QUE ELE PRECISAVA EXISTIR
 * ------------------------------------------------------
 * A DETECÇÃO da lacuna já existe e é completa (`audit.ts`: uma violação com
 * `primeiraAulaQueEnsina === null` é LACUNA DE CURRÍCULO, não erro de
 * redação). A CLASSIFICAÇÃO da ação certa também existe e é enforced em TIPO
 * (`review/actionCatalog.ts`: `AcaoDeLacuna = INSERT_INTERMEDIATE |
 * MOVE_CONCEPT_TO_ENTRY_BUDGET`, e o tipo EXCLUI `REWRITE_IN_BUDGET`, porque
 * reescrever o desafio para caber num currículo furado é o laço que nunca
 * termina — §5.5). O que NÃO existia é o EXECUTOR: quem CRIA a aula atômica
 * que falta. O `--help` do `repair` declara o buraco com todas as letras:
 *
 *   "LIMITE v1 DECLARADO: lacuna de curriculo (nenhuma aula ensina a
 *    construcao) NUNCA e consertada reescrevendo desafio — vira BLOQUEIO no
 *    relatorio (criar aula e o sub-fluxo v2)."
 *
 * Este arquivo É o sub-fluxo v2.
 *
 * O QUE ESTE MÓDULO NÃO FAZ
 * -------------------------
 *   - NÃO reescreve desafio. Nunca. A polaridade vem de `planoDeAcao` do P-13
 *     e o tipo `AcaoDeLacuna` torna `REWRITE_IN_BUDGET` inexprimível aqui.
 *   - NÃO reordena a trilha existente: ele INSERE a aula nova numa âncora
 *     ESTÁVEL (`inserirAntesDe: <ref>`) e nunca move aula que já existe. A
 *     reordenação é o outro executor (`modes/reorder.ts`), e as duas coisas
 *     são deliberadamente separadas porque uma lacuna se fecha ACRESCENTANDO
 *     conhecimento e uma violação de ordem se fecha MOVENDO conhecimento.
 *   - NÃO decide nada de pedagógico por LLM. P1 do §2 ("nada decidível por
 *     código é decidido por LLM"): a POSIÇÃO da aula, o ORÇAMENTO literal, os
 *     TETOS do §3.6, o slug, o `role` do §3.7, o `budgetHash` e o veredito
 *     final são DETERMINÍSTICOS. A LLM escreve prosa e exemplo — só isso.
 *   - NÃO cria transporte de LLM: usa `runtime/callLlm` (INV-01), injetado.
 *   - NÃO escreve desafio para a aula nova (F8 é outra fase). A aula de lacuna
 *     nasce com `challenges: []`, que o validador de produto aceita
 *     (`validateLessonSource` só exige `Array.isArray`) e que o audit não pune
 *     (A6 é POR DESAFIO: sem desafio, sem A6). Limitação DECLARADA.
 *
 * O PASSO A PASSO — o que é máquina e o que é modelo
 * --------------------------------------------------
 *   1. EXTRAIR (puro) — `lacunasDoAudit(report)`: as violações com
 *      `primeiraAulaQueEnsina === null` e `construcao !== null`, EXCLUÍDAS as
 *      construções proibidas SEMPRE (`isForbiddenAlways` / regra `DEC`): criar
 *      aula que ensine `eval` seria ensinar a quebrar o próprio gate (§5.3).
 *   2. PLANEJAR (puro) — `planejarAulasDeLacuna`: agrupa as construções
 *      faltantes por CO-OCORRÊNCIA (mesmo arquivo, mesma superfície, mesmo
 *      `trechoOfensor` ⇒ mesmo nó de sintaxe: `typeof v` falta como
 *      `node:TypeOfExpression` E como `op:unary:typeof`, porque o audit emite
 *      uma chave por EIXO, §3.1 — e os dois eixos do mesmo nó NÃO podem ir
 *      para aulas diferentes: a primeira teria de escrever `typeof` para
 *      demonstrar o seu eixo, e aí usaria o eixo da segunda), empacota os
 *      grupos em aulas de no máximo `TETO_CONSTRUCOES_PRODUTIVAS_NOVAS` (§3.6:
 *      "≤ 2, nunca 3") sem NUNCA partir um grupo, e decide ONDE cada aula
 *      entra:
 *        - ela vem ANTES do desafio que a cobra: o índice de inserção é o
 *          índice da aula que hospeda o desafio (inserir NAQUELE índice empurra
 *          a aula-alvo para depois);
 *        - ela vem DEPOIS de tudo que ela própria pressupõe: os pressupostos
 *          saem da SEMENTE do `revise` (`atoms` do `minimalCode`) menos as
 *          construções da própria aula; cada pressuposto ensinado na aula de
 *          índice k impõe `minimo ≥ k+1`; pressuposto que está no AXIOMA de
 *          entrada não impõe nada;
 *        - `minimo > maximo` ⇒ BLOQUEIO `POSICAO_IMPOSSIVEL` (isso é problema
 *          de ORDEM do currículo existente, do outro executor, não de lacuna);
 *        - pressuposto que NENHUMA aula ensina e que não está sendo criado
 *          nesta mesma leva ⇒ BLOQUEIO `PRESSUPOSTO_NAO_ENSINADO` (lacuna
 *          encadeada: feche a de baixo primeiro; fail-closed, nunca chute).
 *      A inserção é sempre no `maximo` (imediatamente antes do desafio que
 *      cobra) porque é a posição que MAXIMIZA o orçamento disponível para a
 *      aula nova e que MENOS mexe no que já está escrito. A `faixa` legal
 *      [minimo, maximo] vai no plano para quem reordena.
 *   3. AUTORAR (LLM) — `autorarAulaDeLacuna`: monta o DOSSIÊ de 13 campos
 *      (`prompts/dossier.montarDossie` recusa o spawn se faltar um),
 *      DETERMINISTICAMENTE, a partir do orçamento cumulativo na posição
 *      planejada; renderiza o prompt canônico do §7.1 (`gerarPromptAutor` —
 *      as 18 regras duras); chama o transporte único; aceita `blocked` como
 *      resultado LEGÍTIMO (§7.1 R3) e não como falha.
 *   4. VERIFICAR ANTES DE ENTREGAR (puro) — `verificarAulaNova`: recalcula o
 *      orçamento cumulativo COM a aula inserida e só aceita se
 *        (a) a lacuna FECHA: a construção passa a ter `firstTaughtIn` na aula
 *            nova, e a aula nova vem ANTES do desafio que a cobrava;
 *        (b) NENHUMA lacuna nova abre: todo átomo dos blocos de código da
 *            teoria está no orçamento receptivo de SAÍDA da aula nova (§3.3);
 *            fora dele, se ninguém ensina ⇒ lacuna nova, se alguém ensina
 *            depois ⇒ ordem nova — as duas REPROVAM;
 *        (c) os tetos do §3.6 cabem: `introduces.productive` ≤ 2 e IGUAL ao
 *            planejado (o autor não escolhe o que introduzir), elementos novos
 *            que interagem ≤ 4, e o teste 1 de atomicidade (DEMONSTRÁVEL: a
 *            construção-alvo aparece de fato no código da teoria).
 *      Inserir uma aula NUNCA tira orçamento de quem vem depois (a derivação é
 *      monotônica: `saida(N) = entrada(N) ∪ introduces(N)`), então o único
 *      lugar onde uma lacuna nova pode nascer é a teoria da própria aula nova
 *      — é por isso que (b) olha só para ela.
 *   5. MATERIALIZAR (puro) — `arquivosDaAulaNova`: o `lesson.json` da aula nova
 *      e o `module.json` do módulo com o slug inserido na âncora. Dois
 *      arquivos, conteúdo determinístico, nada de disco aqui.
 *   6. GRAVAR — só no modo `aplicar`, e só as aulas ACEITAS.
 *
 * DRY-RUN POR DEFAULT — a convenção do repo (`repair` já faz assim): sem
 * `modo: 'aplicar'` não há UMA escrita e não há UMA chamada de LLM; sai o
 * plano e o delta esperado. É o que permite auditar antes de gastar chave.
 *
 * FAIL-CLOSED (§9.3), com a distinção que importa:
 *   - INDISPONIBILIDADE / uso incorreto (sem LLM, sem dep de escrita, etapa
 *     que estourou timeout, provedor fora do ar) ⇒ `ErroDeLacuna` LANÇADO:
 *     nada é julgado e nada é escrito;
 *   - CONTEÚDO recusado (blocked, JSON inválido, schema violado, acima do
 *     teto, lacuna que persiste, lacuna nova, teto do §3.6 estourado) ⇒ a aula
 *     entra em `recusadas` com o motivo estruturado e NÃO é gravada. Uma aula
 *     inventada nunca chega ao disco.
 *
 * PREMISSAS DECLARADAS (v2):
 *   - `introduces.receptive` da aula nova É IGUAL a `introduces.productive`.
 *     Deixar o autor declarar receptivo extra seria deixá-lo INFLAR o orçamento
 *     de toda a trilha adiante com uma linha de JSON — fraude silenciosa. Quem
 *     precisa de mais orçamento responde `blocked` (R3), não se serve sozinho.
 *   - `research: []` e `sources: []`: a F1 (pesquisa) não roda no sub-fluxo de
 *     lacuna. Item de `research` que não seja URL http(s) REPROVA o draft (a
 *     mesma regra da F12), em vez de virar fonte inventada.
 *   - `concepts: []` e `prerequisites: []`: conteúdo LEGADO não tem
 *     `ConceptGraph` (F3), e §3.4 manda preferir NENHUMA aresta a uma aresta
 *     errada ("uma aresta errada corrompe o orçamento de todos os descendentes,
 *     em silêncio").
 *   - Testes 2 (EXERCITÁVEL) e 4 (CRONOMETRÁVEL) de atomicidade (§3.6) exigem
 *     o desafio da aula, que a F8 escreve: ficam DECLARADOS como não medidos
 *     aqui, nunca aprovados por omissão.
 *
 * Referência normativa: `docs/16-engine-de-trilha.md` §2 (P1), §3.3, §3.5,
 * §3.6, §3.7, §5.5, §7.1, §9.3.
 */

import { z } from 'zod';

import type { LoadedTrack } from '../../content/trackLoader';
import {
  SLUG_RE,
  TRACK_SCHEMA_VERSION,
  type TrackLessonSource,
  type TrackModuleSource,
  type TrackSourceLink,
  type TrackTheorySection,
} from '../../content/trackTypes';
import { auditTrack, type AuditReport } from '../audit';
import { isForbiddenAlways, isAtomKey, humanLabel, axisOf, type AtomKey } from '../atomKeys';
import { deriveTrackBudget, entryAxiom, type DeriveOptions, type TrackBudget } from '../budget';
import { extractAtoms } from '../extract';
import { classifyTheoryTag, DEFAULT_ADAPTER_ID, type LanguageId } from '../lang/registry';
import { blocosDeCodigoDaTeoria } from '../phases/f7Theory';
import {
  compararChecksum,
  construcoesPermitidas,
  gerarPromptAutor,
  isBlocked,
  rejeitarAcimaDoTeto,
  AuthorOutputSchema,
  MAX_TOKENS_SAIDA_AUTOR,
  type ResultadoChecksum,
  type SaidaAutor,
} from '../prompts/author';
import { montarDossie, type ConcepcaoARefutar, type Dossier, type EiClass } from '../prompts/dossier';
import { ACOES_DE_LACUNA, planoDeAcao, type AcaoDeLacuna, type ApontamentoParaPlano } from '../review/actionCatalog';
import type { EngineLlm, LlmCallRequest } from '../runtime/callLlm';
import { canonicalizarJson, sha256Hex } from '../runtime/ledger';

// ---------------------------------------------------------------------------
// 0. Constantes normativas (§3.6) e da chamada
// ---------------------------------------------------------------------------

/** §3.6: "Construções produtivas novas por aula: ≤ 2, nunca 3". Teto DURO. */
export const TETO_CONSTRUCOES_PRODUTIVAS_NOVAS = 2;

/**
 * O default de construções por aula É o teto do §3.6, e a razão é MEDIDA, não
 * preguiça: o audit emite UMA chave por EIXO (§3.1), então um único nó de
 * sintaxe produz DUAS lacunas — `typeof v` vira `node:TypeOfExpression` E
 * `op:unary:typeof`, com o MESMO `trechoOfensor`. Espalhar os dois eixos do
 * mesmo nó em duas aulas é impossível por construção: a aula do primeiro eixo
 * teria de escrever `typeof` para demonstrá-lo, e aí usaria o segundo eixo,
 * que ainda não foi ensinado — a aula abriria a lacuna que ela veio fechar.
 * Por isso o planejamento agrupa por CO-OCORRÊNCIA antes de empacotar.
 */
export const CONSTRUCOES_POR_AULA_DEFAULT = TETO_CONSTRUCOES_PRODUTIVAS_NOVAS;

/** §3.6: "Elementos novos que INTERAGEM entre si: ≤ 4". */
export const TETO_ELEMENTOS_NOVOS_QUE_INTERAGEM = 4;

/** A etapa do transporte único — nome estável (telemetria e cache por etapa). */
export const ETAPA_LACUNA = 'v2-lacuna-autoria-de-aula';

/** stageVersion — identidade de artefato no cache do transporte (bump invalida). */
export const STAGE_VERSION_LACUNA = 'v2-lacuna-autoria-de-aula-v1';

/** Timeout declarado da chamada: uma etapa travada nunca segura a leva. */
export const TIMEOUT_LACUNA_MS = 120_000;

/** `budgetVersion` carimbado nas aulas nascidas do sub-fluxo de lacuna. */
export const BUDGET_VERSION_LACUNA = 'lacuna-v2';

/** Prefixo do slug de toda aula criada por este sub-fluxo (rastreabilidade). */
export const PREFIXO_SLUG_LACUNA = 'lacuna';

// ---------------------------------------------------------------------------
// 1. O modelo REDUZIDO da ordem pedagógica — puro, sem `LoadedTrack`
// ---------------------------------------------------------------------------

/**
 * Uma aula na ordem pedagógica, reduzida ao que o ORÇAMENTO precisa saber
 * dela. Trabalhar sobre este modelo (e não sobre `LoadedTrack`) é o que torna
 * a inserção de uma aula HIPOTÉTICA barata e testável: recalcular o orçamento
 * com a aula nova é mapear uma lista, não montar uma trilha de mentira.
 */
export interface AulaNaOrdem {
  /** `<moduleSlug>/<lessonSlug>`. */
  ref: string;
  /** o que a aula acrescenta à faixa PRODUTIVA (a fonte do `firstTaughtIn`). */
  introduzProdutivo: readonly AtomKey[];
  /** o que a aula acrescenta à faixa RECEPTIVA (⊇ produtivo, §3.2). */
  introduzReceptivo: readonly AtomKey[];
}

/** As duas faixas de um orçamento (§3.2) — `productive ⊆ receptive`. */
export interface BandasDeOrcamento {
  receptive: ReadonlySet<AtomKey>;
  productive: ReadonlySet<AtomKey>;
}

/** A ordem pedagógica COMPLETA: o axioma de entrada + as aulas em ordem. */
export interface OrdemPedagogica {
  /** o que o aluno encontra já na aula 1 (`budget.entryAxiom`). */
  axioma: BandasDeOrcamento;
  aulas: readonly AulaNaOrdem[];
  /** o adaptador que parseia o código desta trilha (§6 do registro). */
  adapterId: LanguageId;
}

/** O orçamento de UMA aula na ordem — entrada (antes) e saída (depois). */
export interface OrcamentoDeAulaNaOrdem {
  ref: string;
  index: number;
  entrada: BandasDeOrcamento;
  saida: BandasDeOrcamento;
}

/** A derivação inteira: por aula, por ref, e a origem de cada construção. */
export interface OrcamentoDerivado {
  aulas: readonly OrcamentoDeAulaNaOrdem[];
  porRef: ReadonlyMap<string, OrcamentoDeAulaNaOrdem>;
  /** PRIMEIRA aula que introduz cada construção — `null` ⇒ lacuna (§5.5). */
  firstTaughtIn: ReadonlyMap<AtomKey, string>;
  /** índice de cada ref na ordem (0-based). */
  indicePorRef: ReadonlyMap<string, number>;
}

/**
 * `budget_entrada(N) = saida(N-1)`, `budget_saida(N) = entrada(N) ∪
 * introduces(N)` — a MESMA derivação do §3.5 que `budget.ts` faz sobre a
 * trilha carregada, aqui sobre o modelo reduzido. PURA e monotônica: inserir
 * uma aula só pode ACRESCENTAR orçamento a quem vem depois, nunca tirar.
 */
export function derivarOrcamentoNaOrdem(ordem: OrdemPedagogica): OrcamentoDerivado {
  const aulas: OrcamentoDeAulaNaOrdem[] = [];
  const porRef = new Map<string, OrcamentoDeAulaNaOrdem>();
  const firstTaughtIn = new Map<AtomKey, string>();
  const indicePorRef = new Map<string, number>();

  let carryReceptive = new Set<AtomKey>(ordem.axioma.receptive);
  let carryProductive = new Set<AtomKey>(ordem.axioma.productive);

  ordem.aulas.forEach((aula, index) => {
    const entrada: BandasDeOrcamento = {
      receptive: new Set(carryReceptive),
      productive: new Set(carryProductive),
    };
    // O receptivo declarado é ADITIVO ao produtivo (§3.2: o que o aluno
    // escreve, ele obviamente também pode ler) — a mesma regra de `budget.ts`.
    const introduzReceptivo = new Set<AtomKey>([...aula.introduzProdutivo, ...aula.introduzReceptivo]);
    const saidaReceptive = new Set(entrada.receptive);
    for (const key of introduzReceptivo) saidaReceptive.add(key);
    const saidaProductive = new Set(entrada.productive);
    for (const key of aula.introduzProdutivo) saidaProductive.add(key);

    for (const key of aula.introduzProdutivo) {
      if (!firstTaughtIn.has(key)) firstTaughtIn.set(key, aula.ref);
    }

    const registro: OrcamentoDeAulaNaOrdem = {
      ref: aula.ref,
      index,
      entrada,
      saida: { receptive: saidaReceptive, productive: saidaProductive },
    };
    aulas.push(registro);
    porRef.set(aula.ref, registro);
    indicePorRef.set(aula.ref, index);
    carryReceptive = saidaReceptive;
    carryProductive = saidaProductive;
  });

  return { aulas, porRef, firstTaughtIn, indicePorRef };
}

/**
 * A ordem pedagógica DA TRILHA REAL, extraída do orçamento já derivado por
 * `budget.ts` — zero recomputação e zero divergência: o axioma é a ENTRADA da
 * primeira aula (exato, qualquer que tenha sido a `harnessPolicy`), com
 * fallback para `entryAxiom` quando a trilha não tem aula nenhuma.
 */
export function ordemDaTrilha(budget: TrackBudget): OrdemPedagogica {
  const primeira = budget.lessons[0];
  const axioma: BandasDeOrcamento = primeira
    ? { receptive: new Set(primeira.entrada.receptive), productive: new Set(primeira.entrada.productive) }
    : entryAxiom('receptive-seed', budget.adapterId);
  return {
    axioma,
    adapterId: budget.adapterId,
    aulas: budget.lessons.map((l) => ({
      ref: l.ref,
      introduzProdutivo: [...l.introduces.productive],
      introduzReceptivo: [...l.introduces.receptive],
    })),
  };
}

/** Insere uma aula na ordem, no índice dado. PURA: devolve ordem NOVA. */
export function inserirNaOrdem(ordem: OrdemPedagogica, index: number, aula: AulaNaOrdem): OrdemPedagogica {
  const alvo = Math.min(Math.max(index, 0), ordem.aulas.length);
  const aulas = [...ordem.aulas.slice(0, alvo), aula, ...ordem.aulas.slice(alvo)];
  return { axioma: ordem.axioma, adapterId: ordem.adapterId, aulas };
}

// ---------------------------------------------------------------------------
// 2. A LACUNA e a SEMENTE do `revise`
// ---------------------------------------------------------------------------

/** UMA lacuna de currículo: a construção que ninguém ensina, e quem a cobra. */
export interface LacunaDeCurriculo {
  /** a construção que NENHUMA aula da trilha introduz. */
  construcao: AtomKey;
  /** `<moduleSlug>/<lessonSlug>` da aula que hospeda o desafio que a cobra. */
  refDoDesafio: string;
  /** caminho do arquivo onde a lacuna se manifesta (rastreabilidade). */
  arquivo: string;
  /** superfície do artefato (`solutionCode`, `testsCode`, `theory`, …). */
  campo: string;
  /** o trecho ofensor — evidência citável (§6.3). */
  trechoOfensor: string;
}

/**
 * As lacunas do relatório do audit — FUNÇÃO PURA (§5.5): violação com
 * `primeiraAulaQueEnsina === null` E `construcao !== null`.
 *
 * EXCLUSÃO DELIBERADA: `DEC` / `isForbiddenAlways` (`eval`, `new Function`,
 * `obj[expr]` com chave calculada…). Elas também chegam com origem `null`,
 * porque nenhuma aula as ensina — e nenhuma deve. Criar aula para elas seria
 * ensinar a construção que faz o gate mentir (§5.3). Vão para `bloqueios`,
 * nunca para o plano.
 *
 * Ordem ESTÁVEL: a do relatório, deduplicada por (construção, ref) — a mesma
 * construção cobrada em três superfícies da mesma aula é UMA lacuna.
 */
export function lacunasDoAudit(report: AuditReport, language: LanguageId = DEFAULT_ADAPTER_ID): LacunaDeCurriculo[] {
  const vistas = new Set<string>();
  const out: LacunaDeCurriculo[] = [];
  for (const v of report.violations) {
    if (v.primeiraAulaQueEnsina !== null) continue;
    if (v.construcao === null) continue;
    if (v.regra === 'DEC' || isForbiddenAlways(v.construcao, language)) continue;
    const chave = `${v.ref} ${v.construcao}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    out.push({
      construcao: v.construcao,
      refDoDesafio: v.ref,
      arquivo: v.arquivo,
      campo: String(v.campo),
      trechoOfensor: v.trechoOfensor,
    });
  }
  return out;
}

/**
 * A SEMENTE do `revise` — o insumo que a revisão progressiva já grava em
 * `content-src/<slug>/revisao-progressiva/splits/<aula>--<desafio>.seed.json`
 * (ver `revision/progressiva.ts`: "a aula NOVA sai de sub-agente LLM com o
 * minimalCode como SEMENTE"). A aula nova nasce dela, não do zero.
 */
export interface SementeDeSplit {
  /** `<moduleSlug>/<lessonSlug>` da aula revisada. */
  aula: string;
  /** slug do desafio cujo mínimo foi sintetizado. */
  desafio: string;
  /** o código MÍNIMO que passa no teste — o que o desafio REALMENTE cobra. */
  minimalCode: string;
  /** todas as construções do mínimo. */
  atoms: AtomKey[];
  /** as construções do mínimo que estavam fora do orçamento da aula. */
  foraDoOrcamento: AtomKey[];
}

/** O schema do `.seed.json` gravado por `revision/progressiva.gravarRelatorio`. */
export const SementeDeSplitSchema = z.object({
  aula: z.string().min(1),
  desafio: z.string().min(1),
  atoms: z.array(z.string()),
  foraDoOrcamento: z.array(z.string()),
  minimalCode: z.string(),
});

/** O subdiretório em que a revisão progressiva grava as sementes de SPLIT. */
export const DIR_DE_SEMENTES = 'splits';

/**
 * O leitor REAL das sementes: lê `<dir>/splits/*.seed.json` — exatamente o que
 * `revision/progressiva.gravarRelatorio` escreve. É a ÚNICA função deste
 * módulo que toca o disco, e por isso ela é uma DEP injetável
 * (`DepsDeLacuna.lerSementes`), nunca uma chamada embutida: o planejamento e a
 * verificação continuam puros e testáveis sem sistema de arquivos.
 *
 * Semente com JSON quebrado ou fora do schema é IGNORADA em silêncio? Não: ela
 * é DESCARTADA e o arquivo entra em `ignorados`, porque semente é CONTEXTO do
 * autor (melhora o exemplo) e não gate — derrubar o sub-fluxo inteiro por um
 * `.seed.json` corrompido seria trocar uma limitação por uma parada.
 */
export function criarLeitorDeSementes(dir: string): () => Promise<SementeDeSplit[]> {
  return async () => {
    const fsp = await import('node:fs/promises');
    const path = await import('node:path');
    const raiz = path.join(dir, DIR_DE_SEMENTES);
    let nomes: string[];
    try {
      nomes = (await fsp.readdir(raiz)).filter((n) => n.endsWith('.seed.json')).sort();
    } catch {
      return [];
    }
    const out: SementeDeSplit[] = [];
    for (const nome of nomes) {
      try {
        const bruto: unknown = JSON.parse(await fsp.readFile(path.join(raiz, nome), 'utf8'));
        const parseado = SementeDeSplitSchema.safeParse(bruto);
        if (parseado.success) out.push(parseado.data);
      } catch {
        // arquivo ilegível/corrompido — ver o comentário acima.
      }
    }
    return out;
  };
}

/** Extrai o slug do desafio do caminho `.../challenges/<slug>/challenge.json`. */
export function slugDoDesafioDoArquivo(arquivo: string): string | null {
  const partes = arquivo.split('/');
  const i = partes.lastIndexOf('challenges');
  if (i < 0 || i + 1 >= partes.length) return null;
  const slug = partes[i + 1];
  return slug !== undefined && slug !== '' && slug !== 'challenge.json' ? slug : null;
}

/**
 * A semente que melhor casa com uma lacuna, por especificidade decrescente:
 * mesma aula + mesmo desafio + a construção no `foraDoOrcamento` → mesma aula
 * + a construção nos `atoms` → mesma aula + mesmo desafio → mesma aula.
 * Determinístico: entre empatados, o PRIMEIRO da lista recebida.
 */
export function sementeParaLacuna(
  sementes: readonly SementeDeSplit[],
  lacuna: LacunaDeCurriculo,
): SementeDeSplit | null {
  const daAula = sementes.filter((s) => s.aula === lacuna.refDoDesafio);
  if (daAula.length === 0) return null;
  const desafio = slugDoDesafioDoArquivo(lacuna.arquivo);
  const candidatos: Array<(s: SementeDeSplit) => boolean> = [
    (s) => s.desafio === desafio && s.foraDoOrcamento.includes(lacuna.construcao),
    (s) => s.foraDoOrcamento.includes(lacuna.construcao),
    (s) => s.desafio === desafio && s.atoms.includes(lacuna.construcao),
    (s) => s.atoms.includes(lacuna.construcao),
    (s) => s.desafio === desafio,
    () => true,
  ];
  for (const filtro of candidatos) {
    const achado = daAula.find(filtro);
    if (achado !== undefined) return achado;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 3. O PLANO — puro, determinístico, zero LLM, zero IO
// ---------------------------------------------------------------------------

/** Por que uma lacuna NÃO virou aula (fail-closed: nunca silêncio). */
export type MotivoDeBloqueio =
  /** a construção é proibida SEMPRE (§5.3) — ensinar seria quebrar o gate. */
  | 'CONSTRUCAO_PROIBIDA_SEMPRE'
  /** a aula que hospeda o desafio não está na ordem pedagógica. */
  | 'AULA_DO_DESAFIO_DESCONHECIDA'
  /** algum pressuposto só é ensinado DEPOIS do desafio: é problema de ORDEM. */
  | 'POSICAO_IMPOSSIVEL'
  /** um pressuposto da aula nova também não é ensinado: lacuna encadeada. */
  | 'PRESSUPOSTO_NAO_ENSINADO'
  /** o slug derivado colidiria com uma aula existente (I12 — chave global). */
  | 'SLUG_EM_USO'
  /** um único nó de sintaxe faltante já estoura o teto do §3.6 sozinho. */
  | 'GRUPO_ACIMA_DO_TETO';

export interface BloqueioDeLacuna {
  motivo: MotivoDeBloqueio;
  /** a aula que hospeda o desafio que cobra. */
  ref: string;
  construcoes: readonly AtomKey[];
  detalhe: string;
}

/** UMA aula nova planejada — tudo decidido por código (P1). */
export interface AulaNovaPlanejada {
  /** slug kebab-case DERIVADO das construções (estável, sem colisão). */
  slug: string;
  /** módulo em que a aula entra: o do desafio que cobra. */
  moduloSlug: string;
  /** `<moduloSlug>/<slug>`. */
  ref: string;
  /** as construções que esta aula introduz (≤ TETO_CONSTRUCOES_…). */
  construcoes: readonly AtomKey[];
  /** ÂNCORA ESTÁVEL: a ref antes da qual a aula entra (nunca um índice cru). */
  inserirAntesDe: string;
  /** índice de inserção na ordem pedagógica ORIGINAL (0-based). */
  indiceDeInsercao: number;
  /** faixa LEGAL de índices [minimo, maximo] — insumo de quem reordena. */
  faixa: { minimo: number; maximo: number };
  /** a ref da última aula que a aula nova pressupõe (`null` = só o axioma). */
  depoisDe: string | null;
  /** os pressupostos efetivos (átomos do mínimo ∖ construções desta aula). */
  pressupostos: readonly AtomKey[];
  /** §3.7: composição é nó próprio — mais de uma construção ⇒ integração. */
  role: 'regular' | 'integration';
  /** os arquivos de desafio que cobravam a construção (rastreabilidade). */
  cobradaEm: readonly string[];
  /** a semente do `revise`, quando existe (contexto do autor). */
  semente: SementeDeSplit | null;
  /** ação do catálogo FECHADO — o TIPO exclui `REWRITE_IN_BUDGET` (§5.5). */
  acao: AcaoDeLacuna;
  acoes_permitidas: readonly AcaoDeLacuna[];
  motivo: string;
}

/** O delta esperado de UMA aula nova — o que o dry-run imprime. */
export interface DeltaDeLacuna {
  ref: string;
  inserirAntesDe: string;
  construcoes: readonly AtomKey[];
  acao: AcaoDeLacuna;
  antes: string;
  depois: string;
  /** os caminhos relativos que o modo `aplicar` gravaria. */
  arquivos: readonly string[];
}

export interface PlanoDeLacuna {
  trackSlug: string;
  lacunas: readonly LacunaDeCurriculo[];
  aulasNovas: readonly AulaNovaPlanejada[];
  bloqueios: readonly BloqueioDeLacuna[];
  deltasEsperados: readonly DeltaDeLacuna[];
}

export interface EntradaDoPlanoDeLacuna {
  trackSlug: string;
  ordem: OrdemPedagogica;
  lacunas: readonly LacunaDeCurriculo[];
  /** sementes do `revise` (contexto). Default: nenhuma. */
  sementes?: readonly SementeDeSplit[];
  /** ≤ `TETO_CONSTRUCOES_PRODUTIVAS_NOVAS`. Default `CONSTRUCOES_POR_AULA_DEFAULT`. */
  construcoesPorAula?: number;
}

/** Normaliza uma chave de átomo para um pedaço de slug kebab-case. */
function sanitizarParaSlug(valor: string): string {
  return valor
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * O SLUG da aula nova — DETERMINÍSTICO e livre de colisão. O corpo legível vem
 * das construções (`op:binary:!==` → `op-binary`), e o sufixo é o sha256 das
 * construções: chaves de átomo carregam caracteres que nenhum slug aceita
 * (`!==`, `.`, `:`), e duas chaves diferentes sanitizam para o mesmo corpo com
 * facilidade. O slug de aula é CHAVE GLOBAL de progresso do aluno (I12): duas
 * aulas com o mesmo slug compartilhariam o registro de conclusão.
 */
export function slugDaAulaDeLacuna(construcoes: readonly AtomKey[]): string {
  const corpo = construcoes
    .map(sanitizarParaSlug)
    .filter((p) => p.length > 0)
    .join('-')
    .slice(0, 48)
    .replace(/-+$/, '');
  const hash = sha256Hex(construcoes.join('|')).slice(0, 8);
  const candidato = corpo.length > 0 ? `${PREFIXO_SLUG_LACUNA}-${corpo}-${hash}` : `${PREFIXO_SLUG_LACUNA}-${hash}`;
  return SLUG_RE.test(candidato) ? candidato : `${PREFIXO_SLUG_LACUNA}-${hash}`;
}

/**
 * GRUPOS DE CO-OCORRÊNCIA: lacunas que saem do MESMO nó de sintaxe. O audit
 * emite uma chave por EIXO (§3.1), com o MESMO `trechoOfensor`, no mesmo
 * arquivo e na mesma superfície — `typeof v` produz `node:TypeOfExpression` e
 * `op:unary:typeof` com o snippet `typeof v`. Separá-las em duas aulas é
 * impossível (ver `CONSTRUCOES_POR_AULA_DEFAULT`), então elas viajam JUNTAS.
 * Ordem estável: a de chegada dos grupos e, dentro do grupo, a do audit.
 */
export function agruparPorCoOcorrencia(lacunas: readonly LacunaDeCurriculo[]): LacunaDeCurriculo[][] {
  const grupos = new Map<string, LacunaDeCurriculo[]>();
  for (const l of lacunas) {
    const chave = `${l.arquivo} ${l.campo} ${l.trechoOfensor}`;
    const lista = grupos.get(chave) ?? [];
    lista.push(l);
    grupos.set(chave, lista);
  }
  return [...grupos.values()];
}

/**
 * Empacota GRUPOS em aulas, sem NUNCA partir um grupo, respeitando o teto de
 * construções por aula. Grupo maior que o teto sai em `acimaDoTeto`: um único
 * nó que já estoura o §3.6 sozinho não é atômico e não se resolve empurrando
 * — ele precisa da decomposição da F2, e este módulo declara em vez de chutar.
 */
export function empacotarGrupos(
  grupos: readonly LacunaDeCurriculo[][],
  teto: number,
): { aulas: LacunaDeCurriculo[][]; acimaDoTeto: LacunaDeCurriculo[][] } {
  const aulas: LacunaDeCurriculo[][] = [];
  const acimaDoTeto: LacunaDeCurriculo[][] = [];
  let corrente: LacunaDeCurriculo[] = [];
  for (const grupo of grupos) {
    if (grupo.length > teto) {
      acimaDoTeto.push(grupo);
      continue;
    }
    if (corrente.length + grupo.length > teto) {
      if (corrente.length > 0) aulas.push(corrente);
      corrente = [];
    }
    corrente.push(...grupo);
  }
  if (corrente.length > 0) aulas.push(corrente);
  return { aulas, acimaDoTeto };
}

/**
 * O PLANEJAMENTO POSICIONAL — função PURA (P1: a posição de uma aula é
 * decidível por código, e por isso NÃO é decidida por LLM).
 *
 * Determinístico: mesma entrada → mesmo plano, byte a byte (a ordem é a do
 * relatório do audit; nada de `Set` iterado sem ordenação prévia).
 */
export function planejarAulasDeLacuna(entrada: EntradaDoPlanoDeLacuna): PlanoDeLacuna {
  const teto = Math.min(
    Math.max(1, entrada.construcoesPorAula ?? CONSTRUCOES_POR_AULA_DEFAULT),
    TETO_CONSTRUCOES_PRODUTIVAS_NOVAS,
  );
  const sementes = entrada.sementes ?? [];
  const derivado = derivarOrcamentoNaOrdem(entrada.ordem);
  const slugsExistentes = new Set(entrada.ordem.aulas.map((a) => a.ref.split('/')[1] ?? a.ref));

  // Todas as construções faltantes deste plano — usadas para decidir se um
  // pressuposto ausente é "lacuna encadeada" (bloqueio) ou "a leva resolve".
  const construcoesDaLeva = new Set<AtomKey>(entrada.lacunas.map((l) => l.construcao));

  // Agrupamento por aula-que-cobra, preservando a ordem do audit.
  const porRef = new Map<string, LacunaDeCurriculo[]>();
  for (const lacuna of entrada.lacunas) {
    const lista = porRef.get(lacuna.refDoDesafio) ?? [];
    lista.push(lacuna);
    porRef.set(lacuna.refDoDesafio, lista);
  }

  const aulasNovas: AulaNovaPlanejada[] = [];
  const bloqueios: BloqueioDeLacuna[] = [];
  const slugsPlanejados = new Set<string>();

  for (const [refDoDesafio, lacunasDaAula] of porRef) {
    const indiceAlvo = derivado.indicePorRef.get(refDoDesafio);
    if (indiceAlvo === undefined) {
      bloqueios.push({
        motivo: 'AULA_DO_DESAFIO_DESCONHECIDA',
        ref: refDoDesafio,
        construcoes: lacunasDaAula.map((l) => l.construcao),
        detalhe:
          `a aula \`${refDoDesafio}\` não está na ordem pedagógica recebida — sem a posição do desafio que cobra, ` +
          'não há como decidir ONDE a aula nova entra (§3.5). Fail-closed: nenhuma aula é planejada às cegas.',
      });
      continue;
    }
    const moduloSlug = refDoDesafio.split('/')[0] ?? refDoDesafio;

    const empacotado = empacotarGrupos(agruparPorCoOcorrencia(lacunasDaAula), teto);
    for (const grupo of empacotado.acimaDoTeto) {
      bloqueios.push({
        motivo: 'GRUPO_ACIMA_DO_TETO',
        ref: refDoDesafio,
        construcoes: grupo.map((l) => l.construcao),
        detalhe:
          `o trecho ${JSON.stringify(grupo[0]?.trechoOfensor ?? '')} falta em ${grupo.length} eixos de átomo de uma ` +
          `vez, acima do teto de ${teto} construções produtivas novas por aula (§3.6). Um único nó que já estoura o ` +
          'teto sozinho não é atômico: quem resolve é a decomposição (F2), não a criação mecânica de uma aula grande.',
      });
    }
    for (const grupo of empacotado.aulas) {
      const construcoes = grupo.map((l) => l.construcao);
      const gruposDistintos = new Set(grupo.map((l) => `${l.arquivo} ${l.campo} ${l.trechoOfensor}`)).size;
      const semente = sementeParaLacuna(sementes, grupo[0]);

      // PRESSUPOSTOS: o que o código mínimo usa ALÉM do que esta aula ensina.
      // Sem semente não há pressuposto DECLARADO — e o planejador não inventa
      // um: a posição default (imediatamente antes do desafio) já entrega o
      // maior orçamento possível, e a verificação (§6) é quem banca o veredito.
      const pressupostos = semente
        ? [...new Set(semente.atoms)].filter((a) => !construcoes.includes(a)).sort()
        : [];

      let minimo = 0;
      let depoisDe: string | null = null;
      let bloqueado: BloqueioDeLacuna | null = null;
      for (const p of pressupostos) {
        if (entrada.ordem.axioma.receptive.has(p)) continue; // axioma não impõe posição
        const dono = derivado.firstTaughtIn.get(p);
        if (dono === undefined) {
          if (construcoesDaLeva.has(p)) continue; // outra aula desta mesma leva
          bloqueado = {
            motivo: 'PRESSUPOSTO_NAO_ENSINADO',
            ref: refDoDesafio,
            construcoes,
            detalhe:
              `a aula nova pressupõe ${humanLabel(p)} (\`${p}\`, do código mínimo do desafio), e NENHUMA aula da ` +
              'trilha o ensina — isto é uma lacuna ENCADEADA: feche a de baixo primeiro e rode de novo. ' +
              'Criar a aula de cima sobre um pressuposto que não existe seria abrir outra lacuna (§5.5).',
          };
          break;
        }
        const indiceDono = derivado.indicePorRef.get(dono);
        if (indiceDono === undefined) continue;
        if (indiceDono + 1 > minimo) {
          minimo = indiceDono + 1;
          depoisDe = dono;
        }
      }
      if (bloqueado !== null) {
        bloqueios.push(bloqueado);
        continue;
      }

      const maximo = indiceAlvo; // inserir AQUI empurra a aula-alvo para depois
      if (minimo > maximo) {
        bloqueios.push({
          motivo: 'POSICAO_IMPOSSIVEL',
          ref: refDoDesafio,
          construcoes,
          detalhe:
            `a aula nova teria de vir depois de \`${depoisDe ?? '?'}\` (índice ${minimo - 1}) e antes de ` +
            `\`${refDoDesafio}\` (índice ${maximo}) — a faixa é vazia. Isso é violação de ORDEM do currículo ` +
            'que já existe, não lacuna: quem conserta é a reordenação, não a criação de aula (§5.5).',
        });
        continue;
      }

      const slug = slugDaAulaDeLacuna(construcoes);
      if (slugsExistentes.has(slug) || slugsPlanejados.has(slug)) {
        bloqueios.push({
          motivo: 'SLUG_EM_USO',
          ref: refDoDesafio,
          construcoes,
          detalhe:
            `o slug derivado \`${slug}\` já existe nesta trilha — o slug de aula é CHAVE GLOBAL de progresso ` +
            'do aluno (I12): duas aulas com o mesmo slug compartilhariam o registro de conclusão.',
        });
        continue;
      }
      slugsPlanejados.add(slug);

      // A POLARIDADE vem do P-13, não de uma string escrita aqui: o tipo
      // `AcaoDeLacuna` exclui `REWRITE_IN_BUDGET` em tempo de compilação.
      const plano = planoDeAcao({ evidencia: { introduzido_em: null } } as ApontamentoParaPlano);
      const acao: AcaoDeLacuna = plano.lacuna ? plano.acao : ACOES_DE_LACUNA[0];

      aulasNovas.push({
        slug,
        moduloSlug,
        ref: `${moduloSlug}/${slug}`,
        construcoes,
        inserirAntesDe: refDoDesafio,
        indiceDeInsercao: maximo,
        faixa: { minimo, maximo },
        depoisDe,
        pressupostos,
        // §3.7 — composição é nó PRÓPRIO, marcado `integration`. Dois EIXOS do
        // mesmo nó (`node:TypeOfExpression` + `op:unary:typeof`) NÃO são
        // composição: são a mesma construção vista de dois ângulos. Composição
        // é a aula que carrega mais de um GRUPO de co-ocorrência.
        role: gruposDistintos > 1 ? 'integration' : 'regular',
        cobradaEm: [...new Set(grupo.map((l) => l.arquivo))],
        semente,
        acao,
        acoes_permitidas: [...ACOES_DE_LACUNA],
        motivo:
          `LACUNA DE CURRÍCULO: ${construcoes.map(humanLabel).join(', ')} não ${construcoes.length > 1 ? 'são ensinadas' : 'é ensinada'} ` +
          `em NENHUMA aula, e o desafio de \`${refDoDesafio}\` ${construcoes.length > 1 ? 'as' : 'a'} cobra — ` +
          `a ação é CRIAR A AULA (${acao}), inserida imediatamente ANTES de \`${refDoDesafio}\` ` +
          `(faixa legal [${minimo}, ${maximo}]), e NUNCA reescrever o desafio (§5.5).`,
      });
    }
  }

  const deltasEsperados: DeltaDeLacuna[] = aulasNovas.map((a) => ({
    ref: a.ref,
    inserirAntesDe: a.inserirAntesDe,
    construcoes: a.construcoes,
    acao: a.acao,
    antes: `${a.construcoes.join(', ')} sem aula dona (primeiraAulaQueEnsina === null) e cobrada em ${a.inserirAntesDe}`,
    depois: `${a.construcoes.join(', ')} ensinada em \`${a.ref}\`, imediatamente antes de \`${a.inserirAntesDe}\``,
    arquivos: caminhosDaAulaNova(a),
  }));

  return {
    trackSlug: entrada.trackSlug,
    lacunas: entrada.lacunas,
    aulasNovas,
    bloqueios,
    deltasEsperados,
  };
}

// ---------------------------------------------------------------------------
// 4. O DOSSIÊ — determinístico (P1: a LLM recebe o estado, não o escolhe)
// ---------------------------------------------------------------------------

/**
 * A construção que carrega o SIGNIFICADO do grupo. §3.1: "o ESTree modela
 * metade da didática como ATRIBUTO, não como tipo de nó" — entre
 * `node:TypeOfExpression` e `op:unary:typeof`, quem tem nome que o aluno lê é
 * o operador. Os eixos `decl`/`op`/`api`/`global`/`term`/`form` vêm antes do
 * eixo `node`; sem nenhum deles, a primeira chave do grupo.
 */
export function construcaoSignificativa(construcoes: readonly AtomKey[]): AtomKey | undefined {
  return construcoes.find((k) => axisOf(k) !== 'node') ?? construcoes[0];
}

/**
 * `ei_class` do §7.1 R4 DERIVADA do eixo da construção — decisão de código,
 * não de modelo: aula que carrega mais de um GRUPO de co-ocorrência é
 * COMPOSIÇÃO e portanto INTEGRATIVA (§3.7 — e composição exige explicação, o
 * exemplo sozinho não basta); nome de API ou global é FATO (não há o que
 * explicar, é enunciado direto e drill); termo de prosa é CATEGORIA (exemplos
 * contrastantes); sintaxe é REGRA (worked example e prática).
 *
 * Dois EIXOS do MESMO nó não são composição: `node:TypeOfExpression` +
 * `op:unary:typeof` é UMA construção vista de dois ângulos, e classificá-la
 * como integrativa faria o autor escrever a explicação de uma composição que
 * não existe.
 */
export function eiClassDaConstrucao(
  construcoes: readonly AtomKey[],
  role: 'regular' | 'integration' = 'regular',
): EiClass {
  if (role === 'integration') return 'integrativo';
  const chave = construcaoSignificativa(construcoes);
  if (chave === undefined) return 'regra';
  switch (axisOf(chave)) {
    case 'api':
    case 'global':
      return 'fato';
    case 'term':
      return 'categoria';
    default:
      return 'regra';
  }
}

/** O `budgetHash` da aula nova: sha256 canônico das três listas do dossiê. */
export function hashDoOrcamentoDoDossie(dossie: Dossier): string {
  return sha256Hex(
    canonicalizarJson({
      produtivo: [...dossie.budget_produtivo].sort(),
      receptivo: [...dossie.budget_receptivo].sort(),
      teste: [...dossie.budget_teste].sort(),
      introduces: [...dossie.introduces_productive].sort(),
    }),
  );
}

export interface EntradaDoDossieDeLacuna {
  aula: AulaNovaPlanejada;
  /** o orçamento de ENTRADA na posição planejada (o que o aluno já sabe). */
  entrada: BandasDeOrcamento;
  /** concepções a refutar, quando o chamador tem âncora na spec. Default: []. */
  misconceptions?: readonly ConcepcaoARefutar[];
}

/**
 * O DOSSIÊ DE 13 CAMPOS (§7.1) da aula de lacuna, montado por CÓDIGO.
 *
 * As três listas de orçamento são LITERAIS E COMPLETAS (§7.1, A-P11-2b) e
 * respeitam a assimetria do §3.3:
 *   budget_teste     = ENTRADA.receptive  (o aluno lê o teste antes da aula)
 *   budget_receptivo = SAÍDA.receptive    (o que a teoria pode exibir)
 *   budget_produtivo = SAÍDA.productive   (o que se pode exigir que escreva)
 *
 * `montarDossie` é o PORTÃO do spawn: campo faltante recusa com
 * `ErroDossieIncompleto` nomeando o campo — o autor nunca chega a ser chamado.
 */
export function montarDossieDaLacuna(e: EntradaDoDossieDeLacuna): Dossier {
  const construcoes = [...e.aula.construcoes];
  const alvo = construcaoSignificativa(construcoes);
  const rotulo = alvo === undefined ? '(nenhuma)' : humanLabel(alvo);
  const entradaReceptivo = [...e.entrada.receptive].sort();
  const entradaProdutivo = [...e.entrada.productive].sort();
  const saidaReceptivo = [...new Set([...entradaReceptivo, ...construcoes])].sort();
  const saidaProdutivo = [...new Set([...entradaProdutivo, ...construcoes])].sort();

  // `terms` = os termos de prosa JÁ definidos antes desta aula (eixo `term:`
  // do orçamento de entrada): "reutilizar, nunca redefinir" (§7.1).
  const termos = entradaReceptivo.filter((k) => axisOf(k) === 'term').map((k) => k.slice('term:'.length));

  // `fora_de_escopo` com MOTIVO por item (§7.1). Os pressupostos que a semente
  // mostra e que esta aula NÃO ensina são o material honesto para isso; a
  // última linha existe sempre, porque o campo não pode nascer vazio no draft.
  const foraDeEscopo = e.aula.pressupostos
    .filter((p) => !saidaReceptivo.includes(p))
    .map((p) => ({
      item: p,
      motivo: 'aparece no código mínimo do desafio, mas não é o alvo desta aula e não está no orçamento vigente',
    }));
  foraDeEscopo.push({
    item: 'qualquer construção fora das listas de orçamento acima',
    motivo: 'não foi ensinada até aqui — usá-la é defeito do grafo, não licença (§7.1 R3): responda blocked',
  });

  return montarDossie({
    objetivo: {
      verbo: 'usar',
      objeto: rotulo,
      contexto: `a aula entra imediatamente antes de \`${e.aula.inserirAntesDe}\`, cujo desafio já cobra ${rotulo}`,
      criterio: `o aluno lê e escreve ${rotulo} sem nenhuma construção fora do orçamento listado`,
    },
    introduces_productive: construcoes,
    budget_produtivo: saidaProdutivo,
    budget_receptivo: saidaReceptivo,
    budget_teste: entradaReceptivo,
    kc_type: alvo ?? '',
    ei_class: eiClassDaConstrucao(construcoes, e.aula.role),
    subgoals: [`reconhecer ${rotulo} em código que já roda`, `escrever ${rotulo} num programa próprio`],
    terms: termos,
    notional_machine_delta: `a máquina nocional do aluno passa a executar ${rotulo} (${construcoes.join(', ')}); nada mais muda nesta aula`,
    fora_de_escopo: foraDeEscopo,
    misconceptions_a_refutar: [...(e.misconceptions ?? [])],
    // A F8 escreve o desafio DESTA aula depois; a aula de lacuna nasce
    // teórica, e o autor precisa saber que não há desafio a habilitar.
    desafios_ja_escritos: [],
  });
}

/**
 * O CONTEXTO DA SEMENTE — vai no `system` da chamada, nunca no dossiê: o
 * dossiê é o estado CONGELADO (§7.1) e a semente é evidência de execução
 * (o código MÍNIMO que passa no teste do desafio que cobra a construção).
 * Função PURA. Sem semente, devolve `undefined` (o transporte omite o campo).
 */
export function contextoDaSemente(aula: AulaNovaPlanejada): string | undefined {
  const s = aula.semente;
  if (s === null) return undefined;
  return [
    '=== SEMENTE (evidência de execução — o código MÍNIMO que passa no teste do desafio) ===',
    `desafio: ${s.aula}/${s.desafio}`,
    `construções do mínimo: ${[...s.atoms].sort().join(', ') || '(nenhuma)'}`,
    `fora do orçamento da aula que cobra: ${[...s.foraDoOrcamento].sort().join(', ') || '(nenhuma)'}`,
    'código mínimo:',
    s.minimalCode,
    '',
    'Use esta evidência para escolher o EXEMPLO da teoria: ela mostra a forma exata em que a construção é',
    'cobrada adiante. Ela NÃO amplia o orçamento — o que não estiver nas listas do dossiê continua proibido.',
    'Responda com `research: []`: a fase de pesquisa não roda nesta aula, e fonte inventada é rejeitada.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// 5. A AUTORIA — a única parte com LLM, injetada
// ---------------------------------------------------------------------------

export type LacunaErrorCode =
  /** `aplicar` sem transporte de LLM — a correção aborta DECLARANDO (§9.3). */
  | 'LACUNA_SEM_LLM'
  /** `aplicar` sem a dep de gravação. */
  | 'LACUNA_SEM_ESCRITA'
  /** o transporte falhou (timeout, 429 esgotado, chave ausente…). */
  | 'LACUNA_LLM_INDISPONIVEL'
  /** a trilha não foi entregue nem carregada. */
  | 'LACUNA_TRILHA_INDISPONIVEL'
  /** a gravação de um arquivo falhou (escrita parcial possível). */
  | 'LACUNA_ESCRITA_FALHOU';

export interface ErroDeLacunaOptions {
  codigo: LacunaErrorCode;
  etapa: string;
  mensagem: string;
  causa?: unknown;
}

/** Erro ESTRUTURADO do sub-fluxo — nunca um veredito falso (§9.3). */
export class ErroDeLacuna extends Error {
  readonly codigo: LacunaErrorCode;
  readonly etapa: string;
  readonly causa?: unknown;

  constructor(opts: ErroDeLacunaOptions) {
    super(opts.mensagem);
    this.name = 'ErroDeLacuna';
    this.codigo = opts.codigo;
    this.etapa = opts.etapa;
    if (opts.causa !== undefined) this.causa = opts.causa;
  }
}

/** Por que uma aula autorada foi RECUSADA — nada é gravado nesses casos. */
export type MotivoDeRecusa =
  /** o autor devolveu `{"blocked": true, …}` (§7.1 R3 — resultado legítimo). */
  | 'BLOQUEADO'
  /** a saída não é JSON. */
  | 'SAIDA_NAO_JSON'
  /** a saída viola o `AuthorOutputSchema`. */
  | 'SCHEMA_INVALIDO'
  /** a saída estourou o teto de tokens (o transporte não trunca — §7). */
  | 'ACIMA_DO_TETO'
  /** `introduces` diverge do planejado (o autor não escolhe o que introduzir). */
  | 'INTRODUCES_DIVERGE'
  /** mais de `TETO_CONSTRUCOES_PRODUTIVAS_NOVAS` construções novas (§3.6). */
  | 'TETO_CONSTRUCOES'
  /** chave de átomo malformada em `introduces`. */
  | 'CHAVE_INVALIDA'
  /** construção proibida SEMPRE em `introduces` (§5.3). */
  | 'CONSTRUCAO_PROIBIDA'
  /** bloco de código da teoria não parseia (§5.3: bloco com tag é código). */
  | 'TEORIA_NAO_PARSEIA'
  /** tag de bloco que o registro não reconhece — nenhum parser a recebe. */
  | 'TAG_DESCONHECIDA'
  /** a teoria usa construção que NINGUÉM ensina: a aula ABRE lacuna nova. */
  | 'LACUNA_NOVA'
  /** a teoria usa construção ensinada DEPOIS: a aula abre violação de ordem. */
  | 'ORDEM_NOVA'
  /** a lacuna NÃO fechou com a aula nova (o teste que dá sentido a tudo). */
  | 'LACUNA_PERSISTE'
  /** a construção-alvo não aparece no código da teoria (§3.6 DEMONSTRÁVEL). */
  | 'NAO_DEMONSTRA'
  /** elementos novos que interagem acima do teto do §3.6. */
  | 'ESTOURA_ELEMENTOS'
  /** item de `research` que não é URL http(s) — fonte inventada não entra. */
  | 'RESEARCH_NAO_URL';

export interface RecusaDeAula {
  motivo: MotivoDeRecusa;
  /** a ref planejada da aula recusada. */
  ref: string;
  construcao: AtomKey | null;
  detalhe: string;
}

export interface AulaRecusada {
  aula: AulaNovaPlanejada;
  recusas: readonly RecusaDeAula[];
}

/** Um arquivo a gravar: caminho RELATIVO à raiz da trilha + conteúdo. */
export interface ArquivoDaAulaNova {
  caminho: string;
  conteudo: string;
}

export interface AulaAceita {
  aula: AulaNovaPlanejada;
  /** o draft já CARIMBADO com os campos determinísticos (P1). */
  draft: SaidaAutor;
  /** o `lesson.json` da aula nova (o `module.json` sai por módulo, no fim). */
  arquivos: readonly ArquivoDaAulaNova[];
  /** conferência do checksum de cauda (A-P11-5) — reportada, não bloqueante. */
  checksum: ResultadoChecksum | null;
}

/**
 * Extrai o objeto JSON da resposta do autor. O prompt canônico do §7.1 TERMINA
 * pedindo o checksum de cauda (a repetição da lista de construções permitidas)
 * DEPOIS do JSON — então `JSON.parse` do conteúdo inteiro falha por
 * construção. Esta função devolve o primeiro objeto de topo BALANCEADO e a
 * cauda que sobrou, sem nunca "consertar" JSON: se não há objeto balanceado,
 * devolve `null` e o chamador recusa.
 */
export function separarJsonECauda(conteudo: string): { json: string; cauda: string } | null {
  const inicio = conteudo.indexOf('{');
  if (inicio < 0) return null;
  let profundidade = 0;
  let emString = false;
  let escapado = false;
  for (let i = inicio; i < conteudo.length; i += 1) {
    const c = conteudo[i];
    if (emString) {
      if (escapado) escapado = false;
      else if (c === '\\') escapado = true;
      else if (c === '"') emString = false;
      continue;
    }
    if (c === '"') emString = true;
    else if (c === '{') profundidade += 1;
    else if (c === '}') {
      profundidade -= 1;
      if (profundidade === 0) {
        return { json: conteudo.slice(inicio, i + 1), cauda: conteudo.slice(i + 1) };
      }
    }
  }
  return null;
}

export interface DepsDeAutoriaDeLacuna {
  /** o transporte ÚNICO da engine (INV-01) — fake nos testes, sem rede. */
  llm: EngineLlm;
}

/** A resposta CRUA de uma autoria, antes da verificação de orçamento. */
export type RespostaDaAutoria =
  | { status: 'ok'; draft: SaidaAutor; checksum: ResultadoChecksum | null }
  | { status: 'recusado'; recusas: RecusaDeAula[] };

/**
 * UMA chamada de autoria de aula de lacuna: prompt canônico do §7.1 + a
 * semente como `system`, teto e timeout EXPLÍCITOS, saída acima do teto
 * REJEITADA (nunca truncada), `blocked` tratado como resultado LEGÍTIMO.
 *
 * `LlmStageError` do transporte NÃO vira recusa de conteúdo: ele sobe como
 * `ErroDeLacuna('LACUNA_LLM_INDISPONIVEL')` — indisponibilidade produz erro
 * estruturado, jamais veredito (§9.3).
 */
export async function autorarAulaDeLacuna(
  deps: DepsDeAutoriaDeLacuna,
  aula: AulaNovaPlanejada,
  dossie: Dossier,
): Promise<RespostaDaAutoria> {
  const system = contextoDaSemente(aula);
  const req: LlmCallRequest = {
    prompt: gerarPromptAutor(dossie),
    ...(system !== undefined ? { system } : {}),
    stageVersion: STAGE_VERSION_LACUNA,
    timeoutMs: TIMEOUT_LACUNA_MS,
    maxTokens: MAX_TOKENS_SAIDA_AUTOR,
    // `reasoningEffort` OMITIDO de propósito: o transporte não envia o campo e
    // o cliente aplica o esforço MÁXIMO (`OPENROUTER_MAX_EFFORT`).
  };

  let conteudo: string;
  try {
    const resposta = await deps.llm.callLlm(ETAPA_LACUNA, req);
    conteudo = resposta.content;
  } catch (erro) {
    throw new ErroDeLacuna({
      codigo: 'LACUNA_LLM_INDISPONIVEL',
      etapa: ETAPA_LACUNA,
      mensagem:
        `a autoria da aula \`${aula.ref}\` não pôde ser feita: ${erro instanceof Error ? erro.message : String(erro)} ` +
        '— indisponibilidade produz erro estruturado, nunca aula inventada gravada em disco (§9.3).',
      causa: erro,
    });
  }

  const recusa = (motivo: MotivoDeRecusa, detalhe: string): RespostaDaAutoria => ({
    status: 'recusado',
    recusas: [{ motivo, ref: aula.ref, construcao: aula.construcoes[0] ?? null, detalhe }],
  });

  try {
    rejeitarAcimaDoTeto(conteudo);
  } catch (erro) {
    return recusa('ACIMA_DO_TETO', erro instanceof Error ? erro.message : String(erro));
  }

  const partido = separarJsonECauda(conteudo);
  if (partido === null) {
    return recusa('SAIDA_NAO_JSON', 'a saída do autor não contém nenhum objeto JSON balanceado');
  }
  let cru: unknown;
  try {
    cru = JSON.parse(partido.json);
  } catch (erro) {
    return recusa('SAIDA_NAO_JSON', `a saída do autor não é JSON: ${erro instanceof Error ? erro.message : String(erro)}`);
  }

  if (isBlocked(cru)) {
    const bloco = cru as { missing: string[]; motivo: string };
    return recusa(
      'BLOQUEADO',
      `o autor devolveu blocked (§7.1 R3 — resultado legítimo): falta ${bloco.missing.join(', ') || '(nada declarado)'} — ${bloco.motivo}. ` +
        'Isso é defeito do GRAFO, não licença: o orçamento na posição planejada não sustenta a aula.',
    );
  }

  const parseado = AuthorOutputSchema.safeParse(cru);
  if (!parseado.success) {
    return recusa(
      'SCHEMA_INVALIDO',
      `a saída do autor viola o AuthorOutputSchema: ${parseado.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }

  // A conferência do checksum de cauda (A-P11-5) é REPORTADA, não bloqueante:
  // o enquadramento exato da cauda não é fixado por máquina, e o gate DURO
  // deste módulo é a verificação de orçamento, que lê o CÓDIGO da teoria em
  // vez da repetição do modelo — evidência forte no lugar de eco.
  const cauda = partido.cauda.trim();
  const checksum = cauda.length > 0 ? compararChecksum(construcoesPermitidas(dossie), cauda) : null;

  return { status: 'ok', draft: parseado.data, checksum };
}

// ---------------------------------------------------------------------------
// 6. A VERIFICAÇÃO — pura, e é ela que decide (P1)
// ---------------------------------------------------------------------------

export interface EntradaDaVerificacao {
  ordem: OrdemPedagogica;
  aula: AulaNovaPlanejada;
  draft: SaidaAutor;
}

export type ResultadoDaVerificacao =
  | { ok: true; ordemNova: OrdemPedagogica; novosElementos: number }
  | { ok: false; recusas: RecusaDeAula[] };

/**
 * O VEREDITO — determinístico e fail-closed. Recalcula o orçamento cumulativo
 * COM a aula inserida e só aceita se a lacuna FECHA e nenhuma outra ABRE.
 *
 * Por que basta olhar a teoria da aula nova para (b): a derivação do §3.5 é
 * MONOTÔNICA — `saida(N) = entrada(N) ∪ introduces(N)`. Inserir uma aula só
 * ACRESCENTA orçamento a tudo que vem depois; nenhuma aula existente pode
 * PERDER construção, e nenhuma violação existente pode piorar. O único lugar
 * onde uma lacuna nova pode nascer é o código que a aula nova exibe.
 */
export function verificarAulaNova(e: EntradaDaVerificacao): ResultadoDaVerificacao {
  const recusas: RecusaDeAula[] = [];
  const push = (motivo: MotivoDeRecusa, construcao: AtomKey | null, detalhe: string): void => {
    recusas.push({ motivo, ref: e.aula.ref, construcao, detalhe });
  };

  const planejadas = [...e.aula.construcoes].sort();
  const declaradas = [...new Set(e.draft.introduces.productive)].sort();

  // (c1) TETO do §3.6 — "≤ 2, nunca 3".
  if (declaradas.length > TETO_CONSTRUCOES_PRODUTIVAS_NOVAS) {
    push(
      'TETO_CONSTRUCOES',
      null,
      `a aula declara ${declaradas.length} construções produtivas novas; o teto do §3.6 é ${TETO_CONSTRUCOES_PRODUTIVAS_NOVAS} ` +
        '(contagem direta do Exercism JS: 21 exercícios ensinam 1, 8 ensinam 2, ZERO ensinam 3+).',
    );
  }

  // (c2) O autor não escolhe O QUE introduzir — isso é decisão de código (P1).
  if (declaradas.join('|') !== planejadas.join('|')) {
    push(
      'INTRODUCES_DIVERGE',
      null,
      `introduces.productive declarado [${declaradas.join(', ')}] ≠ planejado [${planejadas.join(', ')}] — ` +
        'o que a aula de lacuna introduz é decidido pelo plano, não pelo autor.',
    );
  }
  const receptivoDeclarado = [...new Set(e.draft.introduces.receptive)].sort();
  if (receptivoDeclarado.length > 0 && receptivoDeclarado.join('|') !== declaradas.join('|')) {
    push(
      'INTRODUCES_DIVERGE',
      null,
      `introduces.receptive [${receptivoDeclarado.join(', ')}] ≠ introduces.productive [${declaradas.join(', ')}] — ` +
        'receptivo extra INFLARIA o orçamento de toda a trilha adiante com uma linha de JSON. Quem precisa de mais ' +
        'orçamento responde blocked (§7.1 R3), não se serve sozinho.',
    );
  }

  for (const chave of declaradas) {
    if (!isAtomKey(chave)) {
      push('CHAVE_INVALIDA', chave, `\`${chave}\` não é uma chave de átomo válida (${'`<eixo>:<resto>`'}).`);
      continue;
    }
    if (isForbiddenAlways(chave, e.ordem.adapterId)) {
      push(
        'CONSTRUCAO_PROIBIDA',
        chave,
        `${humanLabel(chave)} é proibida SEMPRE (§5.3): ela quebra a decidibilidade da análise, e uma aula que a ` +
          'ensine faz o gate mentir em toda a trilha.',
      );
    }
  }

  if (recusas.length > 0) return { ok: false, recusas };

  // A ordem HIPOTÉTICA, com a aula nova no índice planejado.
  const aulaNova: AulaNaOrdem = {
    ref: e.aula.ref,
    introduzProdutivo: declaradas,
    introduzReceptivo: declaradas,
  };
  const ordemNova = inserirNaOrdem(e.ordem, e.aula.indiceDeInsercao, aulaNova);
  const derivado = derivarOrcamentoNaOrdem(ordemNova);
  const orcamentoDaNova = derivado.porRef.get(e.aula.ref);
  if (orcamentoDaNova === undefined) {
    return {
      ok: false,
      recusas: [
        {
          motivo: 'LACUNA_PERSISTE',
          ref: e.aula.ref,
          construcao: null,
          detalhe: 'a aula nova não apareceu na ordem recalculada — inserção inconsistente, nada é gravado.',
        },
      ],
    };
  }

  // (a) A LACUNA FECHOU? A construção tem dona, é ESTA aula, e ela vem ANTES
  //     do desafio que a cobrava.
  const indiceDoAlvo = derivado.indicePorRef.get(e.aula.inserirAntesDe);
  for (const chave of planejadas) {
    const dona = derivado.firstTaughtIn.get(chave);
    if (dona === undefined) {
      push('LACUNA_PERSISTE', chave, `${humanLabel(chave)} continua sem aula dona depois da inserção.`);
      continue;
    }
    if (dona !== e.aula.ref) {
      push(
        'LACUNA_PERSISTE',
        chave,
        `${humanLabel(chave)} passou a ser ensinada em \`${dona}\`, não na aula nova — a inserção não fechou a lacuna planejada.`,
      );
      continue;
    }
    if (indiceDoAlvo !== undefined && orcamentoDaNova.index >= indiceDoAlvo) {
      push(
        'LACUNA_PERSISTE',
        chave,
        `a aula nova ficou no índice ${orcamentoDaNova.index}, e o desafio que cobra ${humanLabel(chave)} está em ` +
          `\`${e.aula.inserirAntesDe}\` (índice ${indiceDoAlvo}): ensinar DEPOIS de cobrar não fecha lacuna nenhuma.`,
      );
    }
  }

  // (b0) TAG do bloco: uma tag que o registro não reconhece produz um bloco que
  //      NENHUM parser recebe e que o orçamento ignora em silêncio — é o modo
  //      exato de um gate mentir. Fail-closed, como na F12.
  for (const secao of e.draft.theory) {
    if (classifyTheoryTag(secao.tag).kind === 'desconhecida') {
      push(
        'TAG_DESCONHECIDA',
        null,
        `a seção \`${secao.id}\` declara a tag ${JSON.stringify(secao.tag)}, que não é linguagem com adaptador nem ` +
          'tag declarada de não-código: o bloco não iria a parser nenhum e o orçamento passaria a valer sobre menos ' +
          'código do que a aula mostra.',
      );
    }
  }

  // (b) A AULA ABRIU OUTRA LACUNA? Todo átomo do CÓDIGO da teoria tem de caber
  //     no orçamento receptivo de SAÍDA da aula nova (§3.3, regra A4).
  const permitidas = orcamentoDaNova.saida.receptive;
  const novosElementosSet = new Set<AtomKey>();
  for (const bloco of blocosDeCodigoDaTeoria(e.draft)) {
    const extraido = extractAtoms(bloco.codigo, {
      fileName: `${e.aula.ref}#teoria`,
      language: e.ordem.adapterId,
    });
    if (!extraido.ok) {
      push(
        'TEORIA_NAO_PARSEIA',
        null,
        `o bloco de código da seção \`${bloco.secao}\` não parseia: ${extraido.error.message} ` +
          '(§5.3: bloco cercado com tag É código e precisa parsear — prosa re-tagueada como código é defeito de build).',
      );
      continue;
    }
    for (const occ of extraido.occurrences) {
      if (!orcamentoDaNova.entrada.receptive.has(occ.key)) novosElementosSet.add(occ.key);
      if (permitidas.has(occ.key)) continue;
      const dona = derivado.firstTaughtIn.get(occ.key);
      if (dona === undefined) {
        push(
          'LACUNA_NOVA',
          occ.key,
          `a teoria da aula nova usa ${humanLabel(occ.key)}, que NENHUMA aula ensina — fechar uma lacuna abrindo ` +
            `outra é o laço que não termina (§5.5). Trecho: "${occ.snippet}" (seção \`${bloco.secao}\`).`,
        );
      } else {
        push(
          'ORDEM_NOVA',
          occ.key,
          `a teoria da aula nova usa ${humanLabel(occ.key)}, ensinada só em \`${dona}\`, que vem DEPOIS — ` +
            `a aula nova abriria violação de ORDEM. Trecho: "${occ.snippet}" (seção \`${bloco.secao}\`).`,
        );
      }
    }
  }

  // (c3) §3.6, teste 1 — DEMONSTRÁVEL: a construção-alvo aparece de fato no
  //      código da teoria. Aula que "ensina" sem mostrar não fecha lacuna: o
  //      orçamento diria que sim e o aluno diria que não.
  const demonstradas = new Set<AtomKey>();
  for (const bloco of blocosDeCodigoDaTeoria(e.draft)) {
    const extraido = extractAtoms(bloco.codigo, {
      fileName: `${e.aula.ref}#teoria`,
      language: e.ordem.adapterId,
    });
    if (extraido.ok) for (const chave of extraido.keys) demonstradas.add(chave);
  }
  for (const chave of planejadas) {
    if (!demonstradas.has(chave)) {
      push(
        'NAO_DEMONSTRA',
        chave,
        `${humanLabel(chave)} não aparece em NENHUM bloco de código da teoria — o teste 1 de atomicidade (§3.6, ` +
          'DEMONSTRÁVEL) exige que a construção nova caiba num worked example completo, e um exemplo que não a mostra ' +
          'não a ensina.',
      );
    }
  }

  // (c4) §3.6 — elementos novos que INTERAGEM: ≤ 4.
  if (novosElementosSet.size > TETO_ELEMENTOS_NOVOS_QUE_INTERAGEM) {
    push(
      'ESTOURA_ELEMENTOS',
      null,
      `a teoria apresenta ${novosElementosSet.size} elementos novos (${[...novosElementosSet].sort().join(', ')}); ` +
        `o teto do §3.6 para elementos que interagem é ${TETO_ELEMENTOS_NOVOS_QUE_INTERAGEM}.`,
    );
  }

  // Fonte inventada não entra no produto: a MESMA regra da F12
  // (`RESEARCH_NAO_URL`), aqui como recusa em vez de erro de materialização.
  for (const [i, item] of e.draft.research.entries()) {
    if (!eUrlHttp(item)) {
      push(
        'RESEARCH_NAO_URL',
        null,
        `research[${i}] não é uma URL http(s): ${JSON.stringify(item)} — \`sources[]\` exige title+url, e este ` +
          'sub-fluxo não roda a fase de pesquisa: a aula de lacuna nasce com research vazio.',
      );
    }
  }

  if (recusas.length > 0) return { ok: false, recusas };
  return { ok: true, ordemNova, novosElementos: novosElementosSet.size };
}

function eUrlHttp(valor: string): boolean {
  try {
    const url = new URL(valor);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 7. A MATERIALIZAÇÃO — pura (caminho + conteúdo), nada de disco
// ---------------------------------------------------------------------------

/** Os caminhos RELATIVOS que a aula nova toca: o `lesson.json` e o `module.json`. */
export function caminhosDaAulaNova(aula: AulaNovaPlanejada): string[] {
  return [
    `modules/${aula.moduloSlug}/lessons/${aula.slug}/lesson.json`,
    `modules/${aula.moduloSlug}/module.json`,
  ];
}

/** `id-com-hifens` → `Id com hifens` (título legível de seção/aula). */
function humanizarId(id: string): string {
  const texto = id.replace(/[-_]+/g, ' ').trim();
  return texto.length === 0 ? id : texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** O título de uma seção de teoria — a mesma tabela de derivação da F12. */
function tituloDaSecao(secao: { id: string; markdown: string; tag: string }): string {
  if (secao.tag.trim() !== '') return humanizarId(secao.id);
  const primeira = secao.markdown
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (
    primeira !== undefined &&
    primeira.length <= 100 &&
    !/^#{1,6}\s/.test(primeira) &&
    !/^(`{3,}|~{3,})/.test(primeira)
  ) {
    return primeira;
  }
  return humanizarId(secao.id);
}

/** Uma fonte de produto a partir de uma URL de pesquisa (title derivado). */
function fonteDePesquisa(item: string): TrackSourceLink {
  const url = new URL(item);
  const ultimo = url.pathname.split('/').filter(Boolean).pop() ?? '';
  const base = ultimo.replace(/\.(html?|md)$/i, '');
  return { title: base !== '' ? humanizarId(base) : url.hostname, url: item, description: item };
}

export interface EntradaDaMaterializacao {
  aula: AulaNovaPlanejada;
  draft: SaidaAutor;
  /** dificuldade da aula-âncora (1..5) — a aula nova é o degrau anterior. */
  dificuldadeDaAncora: number;
}

/**
 * O `lesson.json` da aula nova. Os campos §10 entram como EXTRAS (o loader faz
 * CAST, não pick) — a mesma tabela de derivação da F12, sem `challenges` (a
 * F8 escreve o desafio desta aula depois; `challenges: []` é aceito pelo
 * validador de produto e não dispara A6, que é POR desafio).
 *
 * `concepts` e `prerequisites` nascem VAZIOS: conteúdo legado não tem
 * `ConceptGraph` e o §3.4 manda preferir nenhuma aresta a uma aresta errada
 * ("uma aresta errada corrompe o orçamento de todos os descendentes, em
 * silêncio"). A dificuldade herda a da aula-âncora: a aula nova é o degrau
 * imediatamente anterior a ela, e um pré-requisito nunca é mais difícil.
 */
export function lessonJsonDaAulaNova(e: EntradaDaMaterializacao): TrackLessonSource & Record<string, unknown> {
  const theory: TrackTheorySection[] = e.draft.theory.map((secao) => {
    const base = { id: secao.id, title: tituloDaSecao(secao), markdown: secao.markdown };
    const classificacao = classifyTheoryTag(secao.tag);
    if (classificacao.kind === 'ausente' || classificacao.kind === 'desconhecida') return base;
    return { ...base, code: { language: classificacao.tag, code: secao.markdown } };
  });
  return {
    schemaVersion: TRACK_SCHEMA_VERSION,
    slug: e.aula.slug,
    title: e.draft.title,
    summary: e.draft.objective.enunciado,
    difficulty: Math.min(5, Math.max(1, e.dificuldadeDaAncora)),
    concepts: [],
    prerequisites: [],
    theory,
    sources: e.draft.research.map(fonteDePesquisa),
    challenges: [],
    // Campos §10 como EXTRAS — o loader faz cast, não pick.
    objective: e.draft.objective,
    introduces: e.draft.introduces,
    introducesTerms: e.draft.introducesTerms,
    foraDeEscopo: e.draft.foraDeEscopo,
    eiClass: e.draft.eiClass,
    role: e.draft.role,
    targetAtom: e.draft.targetAtom,
    notionalMachineDelta: e.draft.notionalMachineDelta,
    budgetHash: e.draft.budgetHash,
    budgetVersion: e.draft.budgetVersion,
    status: e.draft.status,
    research: e.draft.research,
    assertions: e.draft.assertions,
    /** de onde esta aula veio — o sub-fluxo v2 deixa rastro no produto. */
    origem: {
      subfluxo: 'curriculum-gap-v2',
      acao: e.aula.acao,
      construcoes: [...e.aula.construcoes],
      inserirAntesDe: e.aula.inserirAntesDe,
      cobradaEm: [...e.aula.cobradaEm],
    },
  };
}

/**
 * O `module.json` com os slugs novos inseridos nas suas âncoras. PURA: recebe
 * o meta ORIGINAL e devolve outro objeto. Aulas novas cuja âncora não existe
 * na lista vão para o FIM (nunca somem — perder a aula recém-escrita seria o
 * pior desfecho possível).
 */
export function moduleJsonComAulasNovas(
  meta: TrackModuleSource,
  novas: readonly AulaNovaPlanejada[],
): TrackModuleSource {
  const lessons = [...meta.lessons];
  for (const aula of novas) {
    const ancora = aula.inserirAntesDe.split('/')[1] ?? '';
    const i = lessons.indexOf(ancora);
    if (i < 0) lessons.push(aula.slug);
    else lessons.splice(i, 0, aula.slug);
  }
  return { ...meta, lessons };
}

/** Serializa um objeto no formato do repositório (2 espaços + newline final). */
function serializar(objeto: unknown): string {
  return `${JSON.stringify(objeto, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// 8. O MODO — `dry-run` por default, `aplicar` sob pedido
// ---------------------------------------------------------------------------

export type ModoDeLacuna = 'dry-run' | 'aplicar';

export interface DepsDeLacuna {
  /** transporte único (INV-01). Obrigatório em `aplicar`, ignorado em dry-run. */
  llm?: EngineLlm;
  /** gravação de UM arquivo relativo à raiz da trilha. Obrigatória em `aplicar`. */
  gravarArquivo?: (arquivo: string, conteudo: string) => Promise<void>;
  /** carrega a trilha quando `entrada.track` não vem pronta. */
  carregarTrilha?: (slug: string) => Promise<LoadedTrack>;
  /** lê as sementes do `revise` (o `splits/` da revisão progressiva). */
  lerSementes?: () => Promise<readonly SementeDeSplit[]>;
}

export interface EntradaDeLacuna {
  slug: string;
  /** DEFAULT do repo: sem `aplicar`, zero escrita e zero LLM. */
  modo?: ModoDeLacuna;
  /** a trilha carregada; ausente ⇒ `deps.carregarTrilha(slug)`. */
  track?: LoadedTrack;
  /** o relatório do audit; ausente ⇒ `auditTrack(track, opcoesDeAudit)`. */
  report?: AuditReport;
  opcoesDeAudit?: DeriveOptions;
  /** sementes já em memória (têm precedência sobre `deps.lerSementes`). */
  sementes?: readonly SementeDeSplit[];
  construcoesPorAula?: number;
  misconceptions?: readonly ConcepcaoARefutar[];
}

export interface ResultadoDeLacuna {
  slug: string;
  modo: ModoDeLacuna;
  plano: PlanoDeLacuna;
  /** aulas autoradas, verificadas e (em `aplicar`) gravadas. */
  aceitas: readonly AulaAceita[];
  /** aulas recusadas — nada delas foi gravado. */
  recusadas: readonly AulaRecusada[];
  /** lacunas que nem chegaram a virar plano, com o motivo. */
  bloqueios: readonly BloqueioDeLacuna[];
  /** caminhos efetivamente gravados (vazio em dry-run, sempre). */
  escritos: readonly string[];
  /** limitações DECLARADAS — §9.2: nunca omitidas. */
  declaracoes: readonly string[];
}

const DECLARACOES_FIXAS: readonly string[] = [
  'A aula de lacuna nasce SEM desafio (`challenges: []`): a F8 é quem escreve desafio, e um desafio inventado aqui não passaria pelas QUATRO PROVAS do §5.4.',
  'Os testes 2 (EXERCITÁVEL) e 4 (CRONOMETRÁVEL) de atomicidade (§3.6) exigem o desafio da aula: NÃO são medidos por este sub-fluxo, e não são aprovados por omissão.',
  '`concepts` e `prerequisites` da aula nova nascem VAZIOS: conteúdo legado não tem ConceptGraph (F3) e o §3.4 manda preferir NENHUMA aresta a uma aresta errada.',
  '`introduces.receptive` é forçado a ser IGUAL a `introduces.productive`: receptivo extra inflaria o orçamento de toda a trilha adiante, e quem precisa de mais orçamento responde blocked (§7.1 R3).',
  'O checksum de cauda (A-P11-5) é CONFERIDO e REPORTADO, não bloqueante: o gate duro é a verificação de orçamento, que lê o código da teoria em vez da repetição do modelo.',
];

/**
 * O SUB-FLUXO v2 completo. `dry-run` (default) é PURO do ponto de vista de
 * efeitos: nenhuma escrita, nenhuma chamada de LLM, funciona sem chave — só o
 * plano e o delta esperado. `aplicar` autora, VERIFICA e grava só o que passou.
 */
export async function fecharLacunasDeCurriculo(
  deps: DepsDeLacuna,
  entrada: EntradaDeLacuna,
): Promise<ResultadoDeLacuna> {
  const modo: ModoDeLacuna = entrada.modo ?? 'dry-run';

  let track = entrada.track;
  if (track === undefined) {
    if (deps.carregarTrilha === undefined) {
      throw new ErroDeLacuna({
        codigo: 'LACUNA_TRILHA_INDISPONIVEL',
        etapa: 'carga',
        mensagem: `nem \`entrada.track\` nem \`deps.carregarTrilha\` entregaram a trilha \`${entrada.slug}\``,
      });
    }
    try {
      track = await deps.carregarTrilha(entrada.slug);
    } catch (erro) {
      throw new ErroDeLacuna({
        codigo: 'LACUNA_TRILHA_INDISPONIVEL',
        etapa: 'carga',
        mensagem: `a trilha \`${entrada.slug}\` não pôde ser carregada: ${erro instanceof Error ? erro.message : String(erro)}`,
        causa: erro,
      });
    }
  }

  const opcoesDeAudit = entrada.opcoesDeAudit ?? {};
  const budget = deriveTrackBudget(track, opcoesDeAudit);
  const report = entrada.report ?? auditTrack(track, opcoesDeAudit);
  const ordem = ordemDaTrilha(budget);

  // As sementes: as de memória têm precedência; o leitor só é chamado quando
  // ele existe. FAIL-SOFT deliberado: semente é CONTEXTO do autor, não gate —
  // um `splits/` ausente não pode derrubar o planejamento.
  let sementes: readonly SementeDeSplit[] = entrada.sementes ?? [];
  if (entrada.sementes === undefined && deps.lerSementes !== undefined) {
    try {
      sementes = await deps.lerSementes();
    } catch {
      sementes = [];
    }
  }

  const lacunas = lacunasDoAudit(report, ordem.adapterId);
  const plano = planejarAulasDeLacuna({
    trackSlug: entrada.slug,
    ordem,
    lacunas,
    sementes,
    ...(entrada.construcoesPorAula !== undefined ? { construcoesPorAula: entrada.construcoesPorAula } : {}),
  });

  // As construções proibidas SEMPRE que o audit reportou como sem-dona são
  // BLOQUEIO declarado, nunca aula: elas nunca chegaram a `lacunasDoAudit`.
  const bloqueiosProibidas: BloqueioDeLacuna[] = [];
  const vistas = new Set<string>();
  for (const v of report.violations) {
    if (v.primeiraAulaQueEnsina !== null || v.construcao === null) continue;
    if (v.regra !== 'DEC' && !isForbiddenAlways(v.construcao, ordem.adapterId)) continue;
    const chave = `${v.ref} ${v.construcao}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    bloqueiosProibidas.push({
      motivo: 'CONSTRUCAO_PROIBIDA_SEMPRE',
      ref: v.ref,
      construcoes: [v.construcao],
      detalhe:
        `${humanLabel(v.construcao)} é proibida em QUALQUER nível da trilha (§5.3): ela quebra a decidibilidade ` +
        'da análise. Criar aula que a ensine faria o gate mentir — a ação é remover a construção do artefato ' +
        '(ORDEM), não criar aula (§5.5).',
    });
  }
  const bloqueios = [...plano.bloqueios, ...bloqueiosProibidas];

  if (modo === 'dry-run') {
    return {
      slug: entrada.slug,
      modo,
      plano,
      aceitas: [],
      recusadas: [],
      bloqueios,
      escritos: [],
      declaracoes: [
        'DRY-RUN: zero escrita, zero chamada de LLM, funciona sem chave de API. Rode com `aplicar` para autorar e gravar.',
        ...DECLARACOES_FIXAS,
      ],
    };
  }

  // ── modo `aplicar`: as guardas ANTES de qualquer chamada (fail-closed) ────
  if (deps.llm === undefined) {
    throw new ErroDeLacuna({
      codigo: 'LACUNA_SEM_LLM',
      etapa: 'deps',
      mensagem:
        'o modo `aplicar` exige o transporte de LLM (`deps.llm`) — sem ele a aula não pode ser escrita, e a engine ' +
        'falha FECHADA em vez de gravar aula inventada (§9.3). O dry-run roda sem chave.',
    });
  }
  if (deps.gravarArquivo === undefined) {
    throw new ErroDeLacuna({
      codigo: 'LACUNA_SEM_ESCRITA',
      etapa: 'deps',
      mensagem: 'o modo `aplicar` exige `deps.gravarArquivo` — sem a dep de escrita nada pode ser materializado.',
    });
  }
  const llm = deps.llm;
  const gravar = deps.gravarArquivo;

  // ── autoria + verificação, aula a aula, sobre a ordem que vai crescendo ───
  const aceitas: AulaAceita[] = [];
  const recusadas: AulaRecusada[] = [];
  let ordemCorrente = ordem;
  const derivadoInicial = derivarOrcamentoNaOrdem(ordem);
  const dificuldadePorRef = new Map<string, number>();
  for (const mod of track.modules) {
    for (const lesson of mod.lessons) {
      dificuldadePorRef.set(`${mod.meta.slug}/${lesson.meta.slug}`, lesson.meta.difficulty);
    }
  }

  for (const aula of plano.aulasNovas) {
    // O orçamento de ENTRADA na posição planejada, medido na ordem CORRENTE
    // (que já contém as aulas aceitas antes desta): a aula i+1 pode e deve
    // contar com o que a aula i acabou de ensinar.
    const derivadoCorrente = derivarOrcamentoNaOrdem(ordemCorrente);
    const indiceCorrente = derivadoCorrente.indicePorRef.get(aula.inserirAntesDe) ?? aula.indiceDeInsercao;
    const anterior = derivadoCorrente.aulas[indiceCorrente - 1];
    const entradaNaPosicao: BandasDeOrcamento = anterior
      ? { receptive: anterior.saida.receptive, productive: anterior.saida.productive }
      : { receptive: ordem.axioma.receptive, productive: ordem.axioma.productive };

    const aulaCorrigida: AulaNovaPlanejada = { ...aula, indiceDeInsercao: indiceCorrente };
    const dossie = montarDossieDaLacuna({
      aula: aulaCorrigida,
      entrada: entradaNaPosicao,
      ...(entrada.misconceptions !== undefined ? { misconceptions: entrada.misconceptions } : {}),
    });

    const resposta = await autorarAulaDeLacuna({ llm }, aulaCorrigida, dossie);
    if (resposta.status === 'recusado') {
      recusadas.push({ aula: aulaCorrigida, recusas: resposta.recusas });
      continue;
    }

    // CARIMBO dos campos DETERMINÍSTICOS (P1): o autor não escolhe slug,
    // posição, hash de orçamento, papel do nó (§3.7) nem estado do artefato.
    const draft: SaidaAutor = {
      ...resposta.draft,
      slug: aulaCorrigida.slug,
      introduces: {
        receptive: [...aulaCorrigida.construcoes],
        productive: [...resposta.draft.introduces.productive],
      },
      targetAtom: construcaoSignificativa(aulaCorrigida.construcoes) ?? resposta.draft.targetAtom,
      role: aulaCorrigida.role,
      eiClass: dossie.ei_class,
      budgetHash: hashDoOrcamentoDoDossie(dossie),
      budgetVersion: BUDGET_VERSION_LACUNA,
      status: 'pronto_para_revisao',
      aprovado: false,
    };

    const veredito = verificarAulaNova({ ordem: ordemCorrente, aula: aulaCorrigida, draft });
    if (!veredito.ok) {
      recusadas.push({ aula: aulaCorrigida, recusas: veredito.recusas });
      continue;
    }

    const dificuldadeDaAncora =
      dificuldadePorRef.get(aulaCorrigida.inserirAntesDe) ??
      dificuldadePorRef.get(derivadoInicial.aulas[aulaCorrigida.indiceDeInsercao]?.ref ?? '') ??
      1;

    aceitas.push({
      aula: aulaCorrigida,
      draft,
      arquivos: [
        {
          caminho: `modules/${aulaCorrigida.moduloSlug}/lessons/${aulaCorrigida.slug}/lesson.json`,
          conteudo: serializar(lessonJsonDaAulaNova({ aula: aulaCorrigida, draft, dificuldadeDaAncora })),
        },
      ],
      checksum: resposta.checksum,
    });
    ordemCorrente = veredito.ordemNova;
  }

  // ── gravação: só as ACEITAS, e o `module.json` UMA vez por módulo ─────────
  const escritos: string[] = [];
  const porModulo = new Map<string, AulaNovaPlanejada[]>();
  for (const aceita of aceitas) {
    const lista = porModulo.get(aceita.aula.moduloSlug) ?? [];
    lista.push(aceita.aula);
    porModulo.set(aceita.aula.moduloSlug, lista);
  }

  const arquivos: ArquivoDaAulaNova[] = aceitas.flatMap((a) => [...a.arquivos]);
  for (const [moduloSlug, novas] of porModulo) {
    const mod = track.modules.find((m) => m.meta.slug === moduloSlug);
    if (mod === undefined) continue;
    arquivos.push({
      caminho: `modules/${moduloSlug}/module.json`,
      conteudo: serializar(moduleJsonComAulasNovas(mod.meta, novas)),
    });
  }

  for (const arquivo of arquivos) {
    try {
      await gravar(arquivo.caminho, arquivo.conteudo);
      escritos.push(arquivo.caminho);
    } catch (erro) {
      throw new ErroDeLacuna({
        codigo: 'LACUNA_ESCRITA_FALHOU',
        etapa: 'gravacao',
        mensagem:
          `falha ao gravar \`${arquivo.caminho}\`: ${erro instanceof Error ? erro.message : String(erro)} — ` +
          `${escritos.length} arquivo(s) já gravado(s); a trilha pode estar em estado parcial.`,
        causa: erro,
      });
    }
  }

  return {
    slug: entrada.slug,
    modo,
    plano,
    aceitas,
    recusadas,
    bloqueios,
    escritos,
    declaracoes: [
      `APLICAR: ${aceitas.length} aula(s) aceita(s), ${recusadas.length} recusada(s), ${bloqueios.length} bloqueio(s).`,
      'Aula recusada NÃO é gravada — nem parcialmente. O audit precisa rodar DE NOVO depois desta operação: o gate é ele, não este módulo.',
      ...DECLARACOES_FIXAS,
    ],
  };
}
