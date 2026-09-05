/**
 * app/electron/main/engine/modes/reorder.ts — o EXECUTOR DO "MOVA A AULA PARA
 * ANTES" que a engine mandava fazer e ninguém implementava.
 *
 * PROBLEMA REAL, MEDIDO NESTE REPOSITÓRIO. A semântica da reordenação já está
 * escrita em três lugares e nenhum deles a executa:
 *
 *   - `engine/audit.ts:179` (`messageFor`) manda, com todas as letras,
 *     "reescreva sem essa construção, **ou mova a aula que a ensina para
 *     antes**";
 *   - `docs/16-engine-de-trilha.md` §5.5 põe "reordenar o grafo" ao lado de
 *     "reescrever o artefato" como as DUAS saídas da violação de ORDEM;
 *   - `engine/review/actionCatalog.ts` declara a polaridade de ORDEM como
 *     "reescrita/movimentação/**reordenação**".
 *
 * E, mesmo assim, NENHUM código reescrevia `module.order` nem reordenava o
 * array `lessons`. O `modes/repair.ts` executa só a metade "reescrever": o laço
 * manda a LLM corretora apagar a construção do artefato. Quando a construção é
 * o PONTO do desafio, apagá-la é destruir o desafio — a resposta certa era
 * mover a aula, e ela não existia. Este arquivo é essa metade que faltava.
 *
 * ZERO LLM, E ISSO É UMA REGRA, NÃO UM DETALHE DE IMPLEMENTAÇÃO. P1 do §2 do
 * `docs/16`: "nada decidível por código é decidido por LLM". Posição de aula é
 * decidível por código — a ordem pedagógica é um inteiro por módulo mais um
 * índice de array, o orçamento cumulativo é uma dobra determinística sobre essa
 * sequência (`budget.ts::deriveTrackBudget`) e "a violação sumiu?" é uma
 * diferença de conjuntos. Um LLM aqui só poderia ADIVINHAR o que a aritmética
 * já responde. Este módulo não importa `prompts/`, não importa `runtime/llm*`
 * e não tem transporte de rede nenhum.
 *
 * ONDE A ORDEM VIVE — TRÊS NÍVEIS, e confundi-los é o erro que corrompe tudo:
 *
 *   1. `module.json` → campo `order` (inteiro 1..999, ÚNICO — invariante I14,
 *      `engine/audit.ts:296-315`; formato validado em `content/trackTypes.ts`
 *      `validateModuleSource`). É a ordem ENTRE módulos.
 *   2. dentro do módulo, a ordem das aulas é a ORDEM DO ARRAY `lessons` do
 *      `module.json` — implícita, sem campo. Mover uma aula dentro do módulo é
 *      permutar esse array (e o array `lessons` da trilha CARREGADA junto — os
 *      dois têm de andar em par, ver `aplicarMovimentos`).
 *   3. `pedagogicalOrder(track)` (`budget.ts:153-164`) é a linearização
 *      canônica das duas anteriores: módulos por `order`, aulas na ordem do
 *      array. É a MESMA sequência que `services/challengeContextValidator.
 *      buildChallengeContext` usa (`challengeContextValidator.ts:171`) — se as
 *      duas divergirem, o gate semântico passa a julgar contra um currículo que
 *      não existe. Por isso este módulo NUNCA inventa uma ordem própria: ele
 *      permuta os dois níveis de baixo e deixa `pedagogicalOrder` derivar.
 *
 * O QUE A ORDEM DETERMINA. `deriveTrackBudget` deriva o orçamento CUMULATIVO da
 * ordem: `entrada(N) = saida(N-1)`. Mover uma aula muda o orçamento de TODAS as
 * aulas entre a origem e o destino — inclusive as que ninguém pediu para mexer.
 * É exatamente por isso que a verificação deste módulo é uma RE-DERIVAÇÃO
 * inteira, e não um remendo local. (`lesson.prerequisites` é DERIVADO na F12 do
 * índice reverso do orçamento — `phases/f12Materialize.ts:63-70`: não é fonte
 * da ordem, é consequência dela. Este módulo o LÊ como grafo declarado, jamais
 * o reescreve.)
 *
 * AS TRÊS FUNÇÕES, e a separação entre elas é o contrato:
 *
 *   1. `planejarReordenacao(track, report)` — PURA. Lê as violações de ORDEM do
 *      audit e calcula o MOVIMENTO MÍNIMO que as resolve, respeitando o grafo
 *      de pré-requisitos. Não escreve, não verifica, não julga.
 *   2. `verificarReordenacao(track, plano)` — PURA. Aplica o plano EM MEMÓRIA,
 *      re-deriva o orçamento sobre a ordem NOVA e prova as três coisas que
 *      importam: (a) a violação alvo sumiu, (b) NENHUMA violação nova apareceu,
 *      (c) I4/I8/I11/I14 continuam válidas. Qualquer uma falhando, o plano é
 *      RECUSADO com `RecusaDeReordenacao` estruturada. FAIL-CLOSED.
 *   3. `reordenarTrilha(deps, { slug, modo })` — o modo completo. `dry-run` é o
 *      DEFAULT (zero escrita, como o `repair`); `aplicar` só grava DEPOIS de a
 *      verificação passar, e fecha rodando `auditTrack` de novo e comparando o
 *      placar com o inicial — o mesmo fecho do `repair --aplicar`.
 *
 * POR QUE A VERIFICAÇÃO É DIFERENCIAL. O critério de (b) é "nenhuma violação
 * NOVA", não "zero violações". Uma trilha legada tem dívida estrutural que a
 * reordenação não criou e não é dela consertar; exigir zero recusaria todo
 * movimento em todo conteúdo real e o módulo seria decorativo. O critério
 * honesto é: **a reordenação não pode piorar nada**. O mesmo vale para I4/I8/I11
 * — só recusa a violação que APARECEU com o movimento.
 *
 * O QUE ESTE MÓDULO NÃO FAZ, e cada "não" é deliberado:
 *
 *   - NÃO cria aula. Violação com `primeiraAulaQueEnsina === null` é LACUNA DE
 *     CURRÍCULO (§5.5) e sai daqui em `foraDeEscopo` com o motivo declarado —
 *     nunca vira movimento. A polaridade não é opinião deste arquivo: ela é
 *     decidida por `review/actionCatalog.planoDeAcao`, o MESMO primitivo que o
 *     `repair` usa, e uma violação cujo plano diz `lacuna: true` é recusada
 *     como movimento por construção.
 *   - NÃO reescreve prosa, código de desafio, teoria ou `lesson.json`. As
 *     únicas escritas são o array `lessons` e o `order` do `module.json` — mais
 *     o array `modules` do `track.json` QUANDO um módulo se move, porque a
 *     ordem dos módulos também tem duas representações e elas não podem
 *     divergir (ver `aplicarMovimentos`).
 *   - NÃO move arquivos no disco. Mover uma aula para OUTRO módulo exigiria
 *     mover o diretório da aula (e reescrever dois `module.json`); a
 *     movimentação entre módulos é feita movendo o MÓDULO INTEIRO (renumerando
 *     `order`), que é o movimento que os dois níveis de ordem expressam sem
 *     tocar em caminho de arquivo.
 *   - NÃO usa `checkInvariants` (`graph/invariants.ts`) diretamente. Aquele
 *     módulo consome uma `VisaoDeEnsino` de CONCEITOS (ConceptId snake_case,
 *     `formasApresentadas`, `teoriaExemplos`, `orcamentoVigente`) que só existe
 *     numa trilha gerada pela F3 com `ConceptGraph`. Fabricar essa visão a
 *     partir de conteúdo sem grafo seria INVENTAR dado — o pecado que o §11
 *     proíbe. O que este arquivo verifica é a LEITURA DE AULA das mesmas
 *     invariantes, sobre o dado que existe no disco, e cada uma diz de onde
 *     vem (ver `verificarInvariantesDeOrdem`). O que É reusado do grafo é a
 *     máquina que importa: `graph/dag.ts::toposort` (Kahn com critério de
 *     desempate declarado e ciclo reportado COM O CAMINHO) detecta o ciclo de
 *     pré-requisito, com os refs de aula mapeados para ids sintéticos.
 *
 * ESCRITA ATÔMICA: `runtime/runState.escreverAtomico` (tmp + fsync + rename —
 * D-WRITE), a MESMA primitiva que a F12 e o `repair` do CLI usam. Não há
 * segunda implementação de escrita neste arquivo; `deps.gravarArquivo` é o
 * seam para os testes gravarem em memória.
 *
 * LIMITE HONESTO, MEDIDO: a trilha `python` de hoje tem ZERO violações de ordem
 * (`npm run engine -- audit python` → `20 passou · 0 falhou · 0 pendente`).
 * Este módulo não conserta nada que exista hoje — ele é a garantia para os
 * cursos que ainda vão ser gerados. Por isso a suíte roda sobre FIXTURES, nunca
 * sobre a trilha de produção.
 *
 * Referência: `docs/16-engine-de-trilha.md` §3.5 (orçamento), §5.5 (ORDEM ×
 * LACUNA), §6.7 (catálogo fechado) e §9.3 (fail-closed).
 */

import { promises as fsp } from 'node:fs';
import * as path from 'node:path';

import type { LoadedTrack } from '../../content/trackLoader';
import { MODULE_FILE } from '../../content/trackTypes';
import { auditTrack, type AuditReport, type Violation } from '../audit';
import type { AtomKey } from '../atomKeys';
import { deriveTrackBudget, pedagogicalOrder, type DeriveOptions, type TrackBudget } from '../budget';
import { toposort } from '../graph/dag';
import { conceptId, type ConceptGraph, type ConceptId } from '../graph/model';
import { planoDeAcao, type ApontamentoParaPlano } from '../review/actionCatalog';
import { escreverAtomico } from '../runtime/runState';

// ---------------------------------------------------------------------------
// Erro ESTRUTURADO — fail-closed (§9.3)
// ---------------------------------------------------------------------------

export type ReordenacaoErrorCode =
  /** nem `deps.track` nem `deps.carregarTrilha` entregaram a trilha. */
  | 'REORDER_TRILHA_INDISPONIVEL'
  /** o movimento aponta para um módulo que não existe na trilha carregada. */
  | 'REORDER_MODULO_NAO_ENCONTRADO'
  /**
   * dois movimentos do MESMO módulo não compõem: o `lessonsNovas` do segundo
   * não é o array que o primeiro deixa com UMA aula relocada — aplicá-lo
   * APAGARIA o movimento anterior por inteiro. Ver `composicaoDaCadeia`.
   */
  | 'REORDER_COMPOSICAO_INCOERENTE'
  /** a gravação de um `module.json` falhou (escrita parcial possível entre arquivos). */
  | 'REORDER_ESCRITA_FALHOU';

export interface ErroDeReordenacaoOptions {
  codigo: ReordenacaoErrorCode;
  etapa: string;
  mensagem: string;
  causa?: unknown;
}

export class ErroDeReordenacao extends Error {
  readonly codigo: ReordenacaoErrorCode;
  readonly etapa: string;
  readonly causa?: unknown;

  constructor(opts: ErroDeReordenacaoOptions) {
    super(opts.mensagem);
    this.name = 'ErroDeReordenacao';
    this.codigo = opts.codigo;
    this.etapa = opts.etapa;
    if (opts.causa !== undefined) this.causa = opts.causa;
  }
}

function erroDeReordenacao(
  codigo: ReordenacaoErrorCode,
  etapa: string,
  mensagem: string,
  causa?: unknown,
): ErroDeReordenacao {
  return new ErroDeReordenacao({ codigo, etapa, mensagem, causa });
}

// ---------------------------------------------------------------------------
// Recusa ESTRUTURADA — o "não" sempre diz por quê, e sobre quem
// ---------------------------------------------------------------------------

/**
 * Por que um movimento foi recusado, ou por que uma violação de ordem não vira
 * movimento. Catálogo FECHADO: um motivo novo é uma decisão de contrato, não
 * uma string improvisada no meio do código.
 */
export type MotivoDeRecusa =
  /** o grafo de `lesson.prerequisites` tem ciclo — nenhuma ordem o satisfaz. */
  | 'CICLO_DE_PREREQUISITO'
  /** mover a aula para antes do alvo a poria antes dos PRÓPRIOS pré-requisitos dela. */
  | 'PISO_DE_PREREQUISITO'
  /** I4: um `prerequisites` passou a vir DEPOIS da aula que o declara. */
  | 'I4_PREREQUISITO_DEPOIS'
  /** I8: o movimento criou 3 aulas consecutivas da mesma família (interleaving). */
  | 'I8_INTERLEAVING'
  /** I11: o movimento pôs a mudança de FORMA numa aula que não é dedicada a ela. */
  | 'I11_MUDANCA_DE_FORMA'
  /** I14: `module.order` deixaria de ser único / inteiro / 1..999. */
  | 'I14_ORDER_INVALIDO'
  /** a violação que o movimento se propunha a resolver continua no audit. */
  | 'VIOLACAO_ALVO_PERSISTE'
  /** apareceu violação que NÃO existia antes do movimento. */
  | 'VIOLACAO_NOVA'
  /** o movimento é malformado (não é permutação, módulo inexistente, etc.). */
  | 'MOVIMENTO_INVALIDO'
  /**
   * dois ou mais movimentos do MESMO módulo não COMPÕEM: ou o segundo foi
   * calculado contra um array que o primeiro já não deixa (e aplicá-lo apagaria
   * o primeiro por inteiro), ou os dois exigem ordens OPOSTAS entre as mesmas
   * aulas. É a causa CERTA — o sintoma seria `VIOLACAO_ALVO_PERSISTE`, que
   * culparia o plano por "não entregar o que promete" quando cada movimento,
   * sozinho, entrega.
   */
  | 'CONFLITO_DE_COMPOSICAO'
  /** §5.5: `primeiraAulaQueEnsina === null` — é lacuna de currículo, CRIAR AULA. */
  | 'LACUNA_DE_CURRICULO'
  /** a construção é ensinada pela PRÓPRIA aula — mover não muda nada. */
  | 'ALVO_NA_MESMA_AULA'
  /** a aula de origem JÁ vem antes: o defeito não é de ordem (ex.: A3 contra a entrada). */
  | 'ORIGEM_JA_ESTA_ANTES'
  /** violação sem construção (A6, estruturais I*) — não há aula a mover. */
  | 'SEM_CONSTRUCAO';

/** Um "não" com endereço: o motivo, a prosa e quem está envolvido. */
export interface RecusaDeReordenacao {
  motivo: MotivoDeRecusa;
  mensagem: string;
  /** aulas (`<modulo>/<aula>`) e/ou módulos envolvidos, na ordem em que importam. */
  refs: readonly string[];
  /**
   * o CAMINHO do ciclo, fechado (`a → b → a`), quando o motivo é
   * `CICLO_DE_PREREQUISITO`. Vazio nos demais — nunca `undefined`: campo
   * ausente é campo que o consumidor esquece de olhar.
   */
  caminho: readonly string[];
}

function recusa(
  motivo: MotivoDeRecusa,
  mensagem: string,
  refs: readonly string[],
  caminho: readonly string[] = [],
): RecusaDeReordenacao {
  return { motivo, mensagem, refs, caminho };
}

// ---------------------------------------------------------------------------
// Posição de uma aula nos DOIS níveis de ordem
// ---------------------------------------------------------------------------

/** Onde uma aula está, nos dois níveis que a `pedagogicalOrder` combina. */
export interface PosicaoDaAula {
  /** `<moduleSlug>/<lessonSlug>` — a chave de aula em todo o resto da engine. */
  ref: string;
  moduleSlug: string;
  lessonSlug: string;
  /** posição na ordem pedagógica global (0-based) — a que o orçamento consome. */
  indiceGlobal: number;
  /** posição no array `lessons` do `module.json` (0-based). */
  indiceNoModulo: number;
  /** `module.json.order` do módulo desta aula. */
  moduleOrder: number;
}

/** Indexa a trilha por ref, nos dois níveis. PURA. */
export function posicoesDaTrilha(track: LoadedTrack): Map<string, PosicaoDaAula> {
  const ordenados = pedagogicalOrder(track);
  const indiceNoModulo = new Map<string, number>();
  const moduleOrder = new Map<string, number>();
  for (const mod of track.modules) {
    moduleOrder.set(mod.meta.slug, mod.meta.order);
    mod.lessons.forEach((lesson, i) => indiceNoModulo.set(`${mod.meta.slug}/${lesson.meta.slug}`, i));
  }
  const saida = new Map<string, PosicaoDaAula>();
  ordenados.forEach(({ moduleSlug, lessonSlug }, indiceGlobal) => {
    const ref = `${moduleSlug}/${lessonSlug}`;
    saida.set(ref, {
      ref,
      moduleSlug,
      lessonSlug,
      indiceGlobal,
      indiceNoModulo: indiceNoModulo.get(ref) ?? 0,
      moduleOrder: moduleOrder.get(moduleSlug) ?? 0,
    });
  });
  return saida;
}

// ---------------------------------------------------------------------------
// O grafo de pré-requisitos de AULA — e o ciclo, via toposort do dag.ts
// ---------------------------------------------------------------------------

/**
 * O grafo declarado de pré-requisitos entre AULAS. As arestas vêm de
 * `lesson.prerequisites`, que a F12 deriva do índice reverso do orçamento
 * (`f12Materialize.ts:63-70`) — ou seja, é a MESMA informação do orçamento,
 * já materializada no disco, e o loader garante que todo slug citado existe
 * (`trackLoader.ts`, passo 2 de integridade).
 *
 * `prerequisites` guarda slug de AULA (chave global, I12), não `<modulo>/<aula>`;
 * a resolução para ref é feita aqui, uma vez.
 */
interface GrafoDeAulas {
  /** ref → refs dos pré-requisitos DIRETOS declarados. */
  prerequisitos: Map<string, string[]>;
  /** ordem em que as aulas foram vistas (a ordem pedagógica atual). */
  refs: string[];
}

function grafoDeAulas(track: LoadedTrack): GrafoDeAulas {
  const refPorSlug = new Map<string, string>();
  for (const mod of track.modules) {
    for (const lesson of mod.lessons) refPorSlug.set(lesson.meta.slug, `${mod.meta.slug}/${lesson.meta.slug}`);
  }
  const prerequisitos = new Map<string, string[]>();
  const refs: string[] = [];
  for (const { moduleSlug, lessonSlug, lesson } of pedagogicalOrder(track)) {
    const ref = `${moduleSlug}/${lessonSlug}`;
    refs.push(ref);
    const diretos: string[] = [];
    for (const pre of lesson.meta.prerequisites ?? []) {
      const alvo = refPorSlug.get(pre);
      // slug inexistente é impossível numa trilha carregada (o loader reprova);
      // ignorar aqui é defesa muda, nunca silêncio sobre dado válido.
      if (alvo !== undefined && alvo !== ref) diretos.push(alvo);
    }
    prerequisitos.set(ref, diretos);
  }
  return { prerequisitos, refs };
}

/**
 * Detecta ciclo no grafo de pré-requisitos REUSANDO `graph/dag.ts::toposort` —
 * o Kahn com critério de desempate DECLARADO e ciclo reportado COM O CAMINHO.
 *
 * A ponte é um mapeamento de nomes, e ele é obrigatório: `ConceptId` é um tipo
 * BRANDED validado em runtime como snake_case (`graph/model.ts::conceptId`), e
 * um ref de aula é kebab com barra (`m01/a03`) — passá-lo direto LANÇA, e é
 * assim que o modelo se defende de confundir aula com conceito. Cada ref ganha
 * um id sintético estável (`aula_<índice>`), e o caminho do ciclo volta
 * traduzido para refs, que é o que a mensagem de erro precisa mostrar.
 *
 * Devolve `null` quando não há ciclo.
 */
function cicloDePrerequisitos(grafo: GrafoDeAulas): RecusaDeReordenacao | null {
  const idPorRef = new Map<string, ConceptId>();
  const refPorId = new Map<ConceptId, string>();
  grafo.refs.forEach((ref, i) => {
    const id = conceptId(`aula_${String(i).padStart(4, '0')}`);
    idPorRef.set(ref, id);
    refPorId.set(id, ref);
  });

  const conceitos: ConceptGraph['conceitos'] = grafo.refs.map((ref) => ({
    id: idPorRef.get(ref) as ConceptId,
    desbloqueadoPor: (grafo.prerequisitos.get(ref) ?? [])
      .map((pre) => idPorRef.get(pre))
      .filter((id): id is ConceptId => id !== undefined),
    usa: [],
  }));

  // `ordem-declarada` = a ordem pedagógica ATUAL: o desempate preserva a
  // sequência que já existe em vez de inventar uma nova (determinismo + mínimo
  // estranhamento). O que nos interessa aqui é só a falha `ciclo`.
  const resultado = toposort({ conceitos }, { criterio: 'ordem-declarada' });
  if (resultado.ok || resultado.falha !== 'ciclo') return null;

  const caminho = resultado.ciclo.map((id) => refPorId.get(id) ?? String(id));
  return recusa(
    'CICLO_DE_PREREQUISITO',
    `o grafo de pré-requisitos de aula tem um ciclo: ${caminho.join(' → ')} ` +
      `(${caminho.length - 1} aresta(s) fechando o ciclo) — NENHUMA ordem satisfaz o grafo, ` +
      'e reordenar sobre um grafo cíclico produziria uma trilha que só parece consertada',
    caminho,
    caminho,
  );
}

/** Fecho transitivo dos pré-requisitos de uma aula (memoizado, à prova de ciclo). */
function fechoDePrerequisitos(grafo: GrafoDeAulas, ref: string, memo: Map<string, Set<string>>): Set<string> {
  const pronto = memo.get(ref);
  if (pronto !== undefined) return pronto;
  const acumulado = new Set<string>();
  // marca ANTES de descer: um ciclo (já recusado em outro ponto) não pode
  // travar esta função em recursão infinita.
  memo.set(ref, acumulado);
  for (const pre of grafo.prerequisitos.get(ref) ?? []) {
    acumulado.add(pre);
    for (const avo of fechoDePrerequisitos(grafo, pre, memo)) acumulado.add(avo);
  }
  return acumulado;
}

// ---------------------------------------------------------------------------
// Identidade ESTÁVEL de uma violação (o diferencial antes × depois)
// ---------------------------------------------------------------------------

/**
 * A chave que identifica uma violação ATRAVÉS de uma reordenação.
 *
 * `linha`/`coluna` ficam DE FORA de propósito: o movimento não muda o texto do
 * artefato, mas muda o orçamento, e comparar por posição faria a mesma violação
 * parecer "nova" a cada execução. Consequência declarada: duas ocorrências da
 * MESMA construção na MESMA superfície colapsam numa chave — o que é correto
 * para uma diferença de CONJUNTOS (só interessa presença/ausência).
 */
export function chaveDaViolacao(v: Violation): string {
  return [v.regra, v.arquivo, String(v.campo), v.construcao ?? ''].join('\u0000');
}

function chavesDeErro(report: AuditReport): Set<string> {
  const saida = new Set<string>();
  for (const v of report.violations) {
    if ((v.severidade ?? 'erro') === 'aviso') continue;
    saida.add(chaveDaViolacao(v));
  }
  return saida;
}

// ---------------------------------------------------------------------------
// O PLANO — movimentos e alvos
// ---------------------------------------------------------------------------

/** Uma violação de ORDEM que o plano se propõe a resolver movendo uma aula. */
export interface AlvoDeReordenacao {
  /** `chaveDaViolacao` — a identidade estável usada no diferencial. */
  chave: string;
  regra: Violation['regra'];
  arquivo: string;
  campo: string;
  /** aula em cujo orçamento a construção falta (a que COBRA). */
  ref: string;
  /** aula que ENSINA a construção e vem depois (a que se move). */
  ensinadaEm: string;
  construcao: AtomKey;
}

/** O `order` que um `module.json` passa a ter — o plano diz o que grava. */
export interface OrdemNovaDeModulo {
  moduleSlug: string;
  antes: number;
  depois: number;
}

/**
 * Mover uma aula DENTRO do módulo dela: permuta o array `lessons`.
 *
 * `lessonsNovas` é o array LITERAL que vai para o `module.json` — o plano
 * declara o que escreve em vez de deixar o aplicador recalcular. Isso é o que
 * torna a verificação honesta: um plano montado à mão (pelo `repair`, por um
 * teste, por um humano) é conferido contra o mesmo gate, e uma permutação
 * inválida vira `MOVIMENTO_INVALIDO` em vez de corromper o arquivo.
 */
export interface MovimentoDeAula {
  tipo: 'MOVER_AULA_NO_MODULO';
  moduleSlug: string;
  /** a aula que se move. */
  lessonSlug: string;
  /** a aula (do mesmo módulo) antes da qual ela passa a ficar. */
  antesDe: string;
  deIndice: number;
  paraIndice: number;
  /** o array `lessons` a GRAVAR, na íntegra. */
  lessonsNovas: readonly string[];
}

/**
 * Mover um MÓDULO inteiro para antes de outro: reescreve `order`.
 *
 * Por que o módulo inteiro, e não a aula: mover uma aula para outro módulo
 * exigiria mover o DIRETÓRIO dela no disco (`modules/<m>/lessons/<a>/`) e
 * reescrever dois `module.json`. Os dois níveis de ordem expressam a
 * movimentação entre módulos sem tocar em caminho de arquivo — e é por isso que
 * o movimento é grosso: a verificação é que decide se ele é aceitável.
 *
 * `ordensNovas` REUSA os valores de `order` que já existem na trilha,
 * reatribuídos à sequência nova em ordem crescente. Consequência deliberada: os
 * "buracos" que o autor deixou (10, 20, 30) são preservados, e a unicidade de
 * I14 é preservada por construção — o que não dispensa a verificação, porque um
 * plano montado à mão pode trazer qualquer coisa.
 *
 * ESTE MOVIMENTO TAMBÉM REESCREVE `track.json`: a ordem do array
 * `track.json.modules` é a que o `loadTrack` usa para montar `track.modules`, e
 * a bateria A13–A16 do audit a percorre CRUA (`audit.ts::entradaDeProgressao`).
 * Mexer só no `order` deixaria o gate de orçamento e a bateria de progressão
 * julgando ordens diferentes. Ver `aplicarMovimentos`.
 */
export interface MovimentoDeModulo {
  tipo: 'MOVER_MODULO';
  /** o módulo que se move. */
  moduleSlug: string;
  /** o módulo antes do qual ele passa a ficar. */
  antesDe: string;
  /** os `order` a GRAVAR, módulo a módulo (só os que MUDAM). */
  ordensNovas: readonly OrdemNovaDeModulo[];
}

export type MovimentoDeReordenacao = MovimentoDeAula | MovimentoDeModulo;

// ---------------------------------------------------------------------------
// COMPOSIÇÃO — dois movimentos no MESMO módulo formam uma CADEIA
// ---------------------------------------------------------------------------

/**
 * Os movimentos de aula de um módulo formam uma CADEIA: o `lessonsNovas` do
 * movimento N é calculado contra o array que o movimento N-1 deixou, e não
 * contra o array original. É o que torna `mod.meta.lessons = [...lessonsNovas]`
 * uma COMPOSIÇÃO em vez de uma sobrescrita — sem a cadeia, o segundo movimento
 * apaga o primeiro por inteiro (o array é substituído INTEIRO, não remendado).
 *
 * Esta é a prova de que um elo pertence à cadeia: um `MOVER_AULA_NO_MODULO`
 * move UMA aula — a que ele nomeia. Tirando essa aula dos dois arrays, o que
 * sobra tem de ser IDÊNTICO. Qualquer outra diferença significa que o
 * `lessonsNovas` foi calculado contra outro estado, e aplicá-lo desfaria o
 * movimento anterior.
 *
 * PURA. Usada pelas TRÊS pontas (planejamento, gate e aplicação) para que as
 * três concordem sobre o que "compor" quer dizer.
 */
function soRelocouALicao(base: readonly string[], novas: readonly string[], lessonSlug: string): boolean {
  const semA = base.filter((s) => s !== lessonSlug);
  const semB = novas.filter((s) => s !== lessonSlug);
  return semA.length === semB.length && semA.every((s, i) => s === semB[i]);
}

/** Índice de `slug` no array, ou `-1`. Açúcar para as comparações de direção. */
function ordemRelativa(lessons: readonly string[], a: string, b: string): number {
  return lessons.indexOf(a) - lessons.indexOf(b);
}

/** Os movimentos de aula agrupados por módulo, na ordem em que aparecem no plano. */
function movimentosDeAulaPorModulo(
  movimentos: readonly MovimentoDeReordenacao[],
): Map<string, MovimentoDeAula[]> {
  const saida = new Map<string, MovimentoDeAula[]>();
  for (const mov of movimentos) {
    if (mov.tipo !== 'MOVER_AULA_NO_MODULO') continue;
    const lista = saida.get(mov.moduleSlug);
    if (lista === undefined) saida.set(mov.moduleSlug, [mov]);
    else lista.push(mov);
  }
  return saida;
}

/** O plano — puro, determinístico, zero IO. */
export interface PlanoDeReordenacao {
  trackSlug: string;
  /** violações de ORDEM que este plano tenta resolver. */
  alvos: readonly AlvoDeReordenacao[];
  /** os movimentos, em ordem determinística de aplicação. */
  movimentos: readonly MovimentoDeReordenacao[];
  /** alvos que a ordem exigiria mover mas o grafo de pré-requisitos proíbe. */
  impossiveis: readonly RecusaDeReordenacao[];
  /** violações que NÃO são problema de ordem — cada uma com o motivo. */
  foraDeEscopo: readonly RecusaDeReordenacao[];
  declaracoes: readonly string[];
}

/**
 * O pseudo-apontamento que `review/actionCatalog.planoDeAcao` consome: ele lê
 * SÓ `evidencia.introduzido_em` — a distinção §5.5. O cast é o mesmo que o
 * `repair` faz (`modes/repair.ts`, `apontamentoParaPlanoDe`) e pelo mesmo
 * motivo: a classificação é função pura da violação, e o P-13 não toca nenhum
 * outro campo do apontamento.
 */
function apontamentoDe(v: Violation): ApontamentoParaPlano {
  return { evidencia: { introduzido_em: v.primeiraAulaQueEnsina } } as ApontamentoParaPlano;
}

/**
 * Classifica UMA violação: ou vira alvo de movimento, ou sai com o motivo.
 *
 * A POLARIDADE não é decidida aqui: `planoDeAcao` do catálogo fechado é quem
 * diz se a violação é LACUNA (CRIAR AULA — nunca movimento) ou ORDEM
 * (reescrita/movimentação/reordenação). Este arquivo só executa a metade
 * "movimentação" da polaridade de ORDEM.
 */
function classificar(
  v: Violation,
  posicoes: ReadonlyMap<string, PosicaoDaAula>,
): { alvo: AlvoDeReordenacao } | { fora: RecusaDeReordenacao } {
  if (planoDeAcao(apontamentoDe(v)).lacuna) {
    return {
      fora: recusa(
        'LACUNA_DE_CURRICULO',
        `\`${v.construcao ?? v.trechoOfensor}\` não é ensinada em NENHUMA aula (${v.arquivo}) — ` +
          'isto é LACUNA DE CURRÍCULO (§5.5): a ação é CRIAR A AULA, e nenhuma reordenação resolve ' +
          'porque não existe aula a mover',
        [v.ref],
      ),
    };
  }
  if (v.construcao === null) {
    return {
      fora: recusa(
        'SEM_CONSTRUCAO',
        `${v.regra} em ${v.arquivo} não aponta construção nenhuma — não há aula de origem a mover`,
        [v.ref],
      ),
    };
  }
  const ensinadaEm = v.primeiraAulaQueEnsina as string;
  if (ensinadaEm === v.ref) {
    return {
      fora: recusa(
        'ALVO_NA_MESMA_AULA',
        `\`${v.construcao}\` é ensinada pela PRÓPRIA aula \`${v.ref}\` — mover a aula para antes dela mesma ` +
          'não muda orçamento nenhum (é o caso do testsCode, medido contra a ENTRADA da aula: a correção é ' +
          'reescrever o teste, não reordenar)',
        [v.ref],
      ),
    };
  }
  const posCobra = posicoes.get(v.ref);
  const posEnsina = posicoes.get(ensinadaEm);
  if (posCobra === undefined || posEnsina === undefined) {
    return {
      fora: recusa(
        'MOVIMENTO_INVALIDO',
        `a violação cita \`${v.ref}\` e \`${ensinadaEm}\`, e ao menos uma delas não está na ordem pedagógica ` +
          'da trilha carregada (fail-closed: não se move o que não se sabe onde está)',
        [v.ref, ensinadaEm],
      ),
    };
  }
  if (posEnsina.indiceGlobal < posCobra.indiceGlobal) {
    return {
      fora: recusa(
        'ORIGEM_JA_ESTA_ANTES',
        `\`${v.construcao}\` é ensinada em \`${ensinadaEm}\`, que JÁ vem antes de \`${v.ref}\` — ` +
          'o defeito não é de ordem (a superfície é medida contra um orçamento mais restrito) e mover ' +
          'a aula não o resolve',
        [v.ref, ensinadaEm],
      ),
    };
  }
  return {
    alvo: {
      chave: chaveDaViolacao(v),
      regra: v.regra,
      arquivo: v.arquivo,
      campo: String(v.campo),
      ref: v.ref,
      ensinadaEm,
      construcao: v.construcao,
    },
  };
}

/**
 * `planejarReordenacao(track, report)` — PURA, determinística, zero IO, zero LLM.
 *
 * O MOVIMENTO MÍNIMO. Para cada aula E que ensina construções cobradas cedo
 * demais, o destino é imediatamente ANTES da PRIMEIRA aula que a cobra (o
 * menor `indiceGlobal` entre os alvos de E) — mover mais para trás do que isso
 * mexeria no orçamento de aulas que ninguém reclamou.
 *
 * O PISO. E não pode passar à frente dos PRÓPRIOS pré-requisitos: o piso é
 * `1 + max(indiceGlobal)` sobre o fecho transitivo de `E.prerequisites`. Se o
 * piso já é maior que o destino, o movimento mínimo é IMPOSSÍVEL e vira
 * `impossiveis` — este módulo NÃO cascateia (mover também os pré-requisitos
 * seria um movimento grande travestido de mínimo, e o pedido é o mínimo).
 *
 * DETERMINISMO: os movimentos saem ordenados por (destino global CRESCENTE,
 * desempate pelo ref da aula que se move) — mesma trilha e mesmo report
 * produzem o mesmo plano, sempre. O critério de desempate é DECLARADO, como o
 * `graph/dag.ts::toposort` exige de qualquer ordenação deste repositório.
 *
 * COMPOSIÇÃO — e essa MESMA ordem é a ordem de composição. Dentro de um módulo
 * cada movimento é calculado contra o array que os anteriores deixaram
 * (`lessonsAcumuladas`), nunca contra `mod.meta.lessons`. Sem isso, dois
 * movimentos no mesmo módulo produzem duas permutações que se ignoram e, como
 * `aplicarMovimentos` grava o array INTEIRO, o segundo apaga o primeiro — que é
 * justamente o cenário para o qual este módulo foi escrito (mais de uma
 * violação de ordem no mesmo módulo).
 *
 * POR QUE A ORDEM CRESCENTE DE DESTINO TORNA A COMPOSIÇÃO MONÓTONA (nenhum
 * movimento desfaz o pedido de um anterior), e por que o planejador não precisa
 * de detector de conflito próprio:
 *
 *   - toda intenção é "E vem antes de C" com `pos(E) > pos(C)` na ordem
 *     ORIGINAL (`classificar` manda o resto para `ORIGEM_JA_ESTA_ANTES`), ou
 *     seja: TODA aresta aponta de uma aula mais tarde para uma mais cedo — a
 *     relação é ACÍCLICA por construção, e "A antes de B" + "B antes de A"
 *     exigiria `pos(A) > pos(B)` e `pos(B) > pos(A)` ao mesmo tempo;
 *   - o movimento j só pode quebrar a intenção i (i<j) se mover a aula `E_i`
 *     (impossível: `destinoPorAula` guarda UMA intenção por aula que ensina) ou
 *     a aula `C_i` (isto é, `E_j == C_i`). Nesse caso
 *     `destino_j = pos(C_j) < pos(E_j) = pos(C_i) = destino_i`, então j vem
 *     ANTES de i nesta ordenação — nunca depois.
 *
 * Um plano montado à mão não tem essa garantia, e é por isso que o conflito de
 * composição é recusado no GATE (`verificarComposicaoDosMovimentos`) e não aqui:
 * o gate não confia no planejador, e vale para os dois.
 */
export function planejarReordenacao(track: LoadedTrack, report: AuditReport): PlanoDeReordenacao {
  const posicoes = posicoesDaTrilha(track);
  const alvos: AlvoDeReordenacao[] = [];
  const foraDeEscopo: RecusaDeReordenacao[] = [];
  const impossiveis: RecusaDeReordenacao[] = [];
  const declaracoes: string[] = [
    'ZERO LLM: posição de aula é decidível por código (P1 do §2) — este plano é aritmética sobre a ordem pedagógica.',
    'polaridade §5.5 aplicada pelo catálogo fechado (review/actionCatalog.planoDeAcao): lacuna de currículo NUNCA vira movimento.',
    'ordem de composição DECLARADA: destino global crescente, desempate pelo ref da aula que se move — cada movimento é calculado contra o array que os anteriores do MESMO módulo deixaram.',
  ];

  const vistas = new Set<string>();
  for (const v of report.violations) {
    if ((v.severidade ?? 'erro') === 'aviso') continue;
    const chave = chaveDaViolacao(v);
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    const r = classificar(v, posicoes);
    if ('alvo' in r) alvos.push(r.alvo);
    else foraDeEscopo.push(r.fora);
  }

  const grafo = grafoDeAulas(track);
  const ciclo = cicloDePrerequisitos(grafo);
  if (ciclo !== null) {
    // FAIL-CLOSED: com ciclo, NENHUM movimento é planejado. Reordenar sobre um
    // grafo que nenhuma ordem satisfaz produz uma trilha que só parece
    // consertada — e o `verificarReordenacao` recusa igual, para um plano
    // montado à mão.
    return {
      trackSlug: track.root.slug,
      alvos,
      movimentos: [],
      impossiveis: [ciclo],
      foraDeEscopo,
      declaracoes: [
        ...declaracoes,
        'ciclo de pré-requisito detectado: nenhum movimento planejado (fail-closed) — o caminho do ciclo está em impossiveis[].caminho.',
      ],
    };
  }

  // destino de cada aula que ENSINA: antes da PRIMEIRA aula que a cobra.
  const destinoPorAula = new Map<string, number>();
  for (const alvo of alvos) {
    const pos = posicoes.get(alvo.ref);
    if (pos === undefined) continue;
    const atual = destinoPorAula.get(alvo.ensinadaEm);
    if (atual === undefined || pos.indiceGlobal < atual) destinoPorAula.set(alvo.ensinadaEm, pos.indiceGlobal);
  }

  const memoFecho = new Map<string, Set<string>>();
  const porDestino = [...destinoPorAula.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));

  const movimentos: MovimentoDeReordenacao[] = [];
  const modulosJaMovidos = new Set<string>();
  /**
   * O ESTADO ACUMULADO, e é ele que faz os movimentos COMPOREM. Cada
   * `MOVER_AULA_NO_MODULO` é calculado contra o array que os movimentos
   * ANTERIORES deste mesmo plano deixaram — não contra `mod.meta.lessons`. Com
   * o array original, dois movimentos no mesmo módulo produzem duas
   * permutações que se ignoram, e como `aplicarMovimentos` grava o array
   * INTEIRO, o segundo apaga o primeiro.
   */
  const lessonsAcumuladas = new Map<string, string[]>();

  for (const [refQueEnsina, destinoGlobal] of porDestino) {
    const posEnsina = posicoes.get(refQueEnsina);
    if (posEnsina === undefined) continue;

    // PISO: o fecho transitivo dos pré-requisitos de E.
    let piso = 0;
    let refDoPiso: string | null = null;
    for (const pre of fechoDePrerequisitos(grafo, refQueEnsina, memoFecho)) {
      const p = posicoes.get(pre);
      if (p === undefined) continue;
      if (p.indiceGlobal + 1 > piso) {
        piso = p.indiceGlobal + 1;
        refDoPiso = pre;
      }
    }
    if (piso > destinoGlobal) {
      impossiveis.push(
        recusa(
          'PISO_DE_PREREQUISITO',
          `\`${refQueEnsina}\` teria de ir para a posição ${destinoGlobal} da ordem pedagógica, mas o ` +
            `pré-requisito \`${refDoPiso ?? '?'}\` está na posição ${piso - 1} — o movimento mínimo poria a aula ` +
            'ANTES do próprio pré-requisito. Este módulo não cascateia (mover o pré-requisito junto não é ' +
            'movimento mínimo): a saída é reescrever o artefato (REWRITE_IN_BUDGET) ou revisar o grafo.',
          [refQueEnsina, ...(refDoPiso === null ? [] : [refDoPiso])],
        ),
      );
      continue;
    }

    const refDestino = [...posicoes.values()].find((p) => p.indiceGlobal === destinoGlobal);
    if (refDestino === undefined) continue;

    if (refDestino.moduleSlug === posEnsina.moduleSlug) {
      const mod = track.modules.find((m) => m.meta.slug === posEnsina.moduleSlug);
      if (mod === undefined) continue;
      // O array ACUMULADO deste módulo (o original, na primeira vez).
      const atual = lessonsAcumuladas.get(mod.meta.slug) ?? [...mod.meta.lessons];
      const de = atual.indexOf(posEnsina.lessonSlug);
      const paraOriginal = atual.indexOf(refDestino.lessonSlug);
      if (de < 0 || paraOriginal < 0 || de === paraOriginal) continue;
      if (de < paraOriginal) {
        // Um movimento ANTERIOR deste mesmo plano já pôs a aula antes do
        // destino. Mover de novo a empurraria para FRENTE (para junto do
        // destino), mexendo no orçamento de quem ninguém reclamou — o oposto do
        // movimento mínimo. O alvo continua coberto, e o gate diferencial é
        // quem confere isso.
        declaracoes.push(
          `\`${refQueEnsina}\` já ficou antes de \`${refDestino.ref}\` por um movimento anterior deste plano: ` +
            'nenhum movimento novo é emitido (movê-la de novo seria empurrá-la para frente).',
        );
        continue;
      }
      const semAula = atual.filter((s) => s !== posEnsina.lessonSlug);
      const insercao = semAula.indexOf(refDestino.lessonSlug);
      const lessonsNovas = [...semAula.slice(0, insercao), posEnsina.lessonSlug, ...semAula.slice(insercao)];
      lessonsAcumuladas.set(mod.meta.slug, lessonsNovas);
      movimentos.push({
        tipo: 'MOVER_AULA_NO_MODULO',
        moduleSlug: posEnsina.moduleSlug,
        lessonSlug: posEnsina.lessonSlug,
        antesDe: refDestino.lessonSlug,
        deIndice: de,
        paraIndice: paraOriginal,
        lessonsNovas,
      });
      continue;
    }

    // módulos diferentes: move o MÓDULO de E para antes do módulo do destino.
    if (modulosJaMovidos.has(posEnsina.moduleSlug)) continue;
    modulosJaMovidos.add(posEnsina.moduleSlug);
    const ordensNovas = renumerarModulos(track, posEnsina.moduleSlug, refDestino.moduleSlug);
    if (ordensNovas.length === 0) continue;
    movimentos.push({
      tipo: 'MOVER_MODULO',
      moduleSlug: posEnsina.moduleSlug,
      antesDe: refDestino.moduleSlug,
      ordensNovas,
    });
    declaracoes.push(
      `\`${refQueEnsina}\` e \`${refDestino.ref}\` estão em MÓDULOS diferentes: o movimento é do MÓDULO inteiro ` +
        `(\`${posEnsina.moduleSlug}\` para antes de \`${refDestino.moduleSlug}\`) — mover a aula entre módulos exigiria ` +
        'mover o diretório dela no disco, o que este módulo não faz.',
    );
  }

  return { trackSlug: track.root.slug, alvos, movimentos, impossiveis, foraDeEscopo, declaracoes };
}

/**
 * Renumera `module.order` movendo `moduleSlug` para imediatamente antes de
 * `antesDe`, REUSANDO os valores de `order` que já existem (ordenados) — os
 * buracos deixados pelo autor sobrevivem e a unicidade de I14 sai por
 * construção. Devolve só os módulos cujo `order` MUDA.
 */
function renumerarModulos(track: LoadedTrack, moduleSlug: string, antesDe: string): OrdemNovaDeModulo[] {
  const sequencia = [...track.modules].sort((a, b) => a.meta.order - b.meta.order).map((m) => m.meta.slug);
  const valores = [...track.modules].map((m) => m.meta.order).sort((a, b) => a - b);
  const sem = sequencia.filter((s) => s !== moduleSlug);
  const alvo = sem.indexOf(antesDe);
  if (alvo < 0 || !sequencia.includes(moduleSlug)) return [];
  const nova = [...sem.slice(0, alvo), moduleSlug, ...sem.slice(alvo)];

  const antesPorSlug = new Map(track.modules.map((m) => [m.meta.slug, m.meta.order]));
  const saida: OrdemNovaDeModulo[] = [];
  nova.forEach((slug, i) => {
    const antes = antesPorSlug.get(slug) ?? 0;
    const depois = valores[i] ?? antes;
    if (antes !== depois) saida.push({ moduleSlug: slug, antes, depois });
  });
  return saida;
}

// ---------------------------------------------------------------------------
// APLICAÇÃO EM MEMÓRIA — a base da verificação E da gravação
// ---------------------------------------------------------------------------

/** O que uma aplicação produziu: a trilha nova e os `module.json` que mudaram. */
export interface AplicacaoEmMemoria {
  trilha: LoadedTrack;
  /** caminho relativo à raiz da trilha → conteúdo JSON a gravar. */
  arquivos: Map<string, string>;
}

/**
 * Aplica os movimentos sobre um CLONE da trilha. PURA em relação à entrada
 * (`structuredClone`, o mesmo recurso que o `repair` usa para re-auditar).
 *
 * O DETALHE QUE FAZ TODA A DIFERENÇA: uma aula tem DUAS representações da mesma
 * ordem — `mod.meta.lessons` (os slugs do `module.json`, o que vai para o
 * disco) e `mod.lessons` (os objetos carregados, o que `pedagogicalOrder` LÊ).
 * Reordenar só uma delas produz uma trilha em que o arquivo diz uma coisa e o
 * orçamento calcula outra — o modo de falha silencioso que esta engine existe
 * para eliminar. As duas andam juntas aqui.
 *
 * COMPOSIÇÃO, NÃO SOBRESCRITA. `mod.meta.lessons = [...mov.lessonsNovas]`
 * substitui o array INTEIRO — o que só é composição porque os movimentos de um
 * módulo formam uma CADEIA (o `lessonsNovas` de cada um é calculado contra o
 * array que o anterior deixou; ver `soRelocouALicao` e `planejarReordenacao`).
 * Um plano cujos movimentos NÃO formam cadeia gravaria só o último, apagando os
 * outros em silêncio: aqui isso vira `REORDER_COMPOSICAO_INCOERENTE`, e no gate
 * vira a recusa `CONFLITO_DE_COMPOSICAO` — bem antes de qualquer escrita.
 */
export function aplicarMovimentos(
  track: LoadedTrack,
  movimentos: readonly MovimentoDeReordenacao[],
): AplicacaoEmMemoria {
  const trilha = structuredClone(track) as LoadedTrack;
  const arquivos = new Map<string, string>();
  const tocados = new Set<string>();
  let ordemDeModuloMudou = false;
  /** array deixado pelo ÚLTIMO movimento de cada módulo (a base do próximo elo). */
  const cadeiaPorModulo = new Map<string, string[]>();

  for (const mov of movimentos) {
    if (mov.tipo === 'MOVER_AULA_NO_MODULO') {
      const mod = trilha.modules.find((m) => m.meta.slug === mov.moduleSlug);
      if (mod === undefined) {
        throw erroDeReordenacao(
          'REORDER_MODULO_NAO_ENCONTRADO',
          'aplicar-movimentos',
          `o movimento cita o módulo "${mov.moduleSlug}", que não existe na trilha carregada (fail-closed).`,
        );
      }
      // A CADEIA (só a partir do SEGUNDO movimento do módulo — antes disso não
      // há nada com que compor). `lessonsNovas` continua sendo a autoridade
      // sobre o que se grava: o que se confere aqui é se ele foi calculado
      // contra o array que o movimento anterior deixou. Se não foi, gravá-lo
      // APAGARIA o movimento anterior por inteiro, e este módulo não apaga
      // trabalho em silêncio — recusa, e diz por quê (fail-closed, §9.3).
      const base = cadeiaPorModulo.get(mod.meta.slug);
      if (base !== undefined && !soRelocouALicao(base, mov.lessonsNovas, mov.lessonSlug)) {
        throw erroDeReordenacao(
          'REORDER_COMPOSICAO_INCOERENTE',
          'aplicar-movimentos',
          `o movimento de "${mov.lessonSlug}" no módulo "${mov.moduleSlug}" declara ` +
            `[${mov.lessonsNovas.join(', ')}], que NÃO é [${base.join(', ')}] (o que o movimento anterior ` +
            `deste módulo deixou) com apenas "${mov.lessonSlug}" relocada — gravá-lo apagaria o movimento ` +
            'anterior por inteiro. Movimentos do mesmo módulo formam uma CADEIA: cada `lessonsNovas` é ' +
            'calculado contra o array que o anterior deixou (fail-closed).',
        );
      }
      const porSlug = new Map(mod.lessons.map((l) => [l.meta.slug, l]));
      mod.meta.lessons = [...mov.lessonsNovas];
      cadeiaPorModulo.set(mod.meta.slug, [...mov.lessonsNovas]);
      mod.lessons = mov.lessonsNovas
        .map((slug) => porSlug.get(slug))
        .filter((l): l is (typeof mod.lessons)[number] => l !== undefined);
      tocados.add(mod.meta.slug);
      continue;
    }
    for (const nova of mov.ordensNovas) {
      const mod = trilha.modules.find((m) => m.meta.slug === nova.moduleSlug);
      if (mod === undefined) {
        throw erroDeReordenacao(
          'REORDER_MODULO_NAO_ENCONTRADO',
          'aplicar-movimentos',
          `o movimento cita o módulo "${nova.moduleSlug}", que não existe na trilha carregada (fail-closed).`,
        );
      }
      mod.meta.order = nova.depois;
      tocados.add(mod.meta.slug);
      ordemDeModuloMudou = true;
    }
  }

  // O TERCEIRO PAR QUE TEM DE ANDAR JUNTO — e este custou um teste vermelho
  // para aparecer. A ordem dos MÓDULOS também tem duas representações:
  // `module.json.order` (que `pedagogicalOrder` e o orçamento leem, ordenando)
  // e a ORDEM DO ARRAY `track.json.modules` (que o `loadTrack` usa para montar
  // `track.modules`, e que a bateria A13–A16 do audit percorre CRUA — ver
  // `audit.ts::entradaDeProgressao`, `for (const mod of track.modules)`, sem
  // ordenar). Mexer só no `order` deixa as duas discordando: o gate de
  // orçamento (A1–A4) enxerga a ordem nova e a bateria de progressão continua
  // vendo a velha, e a MESMA violação some de um relatório e fica no outro.
  // Por isso a permutação de módulo reescreve `track.json` também — a mesma
  // doutrina de `mod.meta.lessons` ↔ `mod.lessons`, um nível acima.
  if (ordemDeModuloMudou) {
    trilha.modules.sort((a, b) => a.meta.order - b.meta.order);
    trilha.root.modules = trilha.modules.map((m) => m.meta.slug);
    arquivos.set('track.json', `${JSON.stringify(trilha.root, null, 2)}\n`);
  }

  for (const slug of [...tocados].sort()) {
    const mod = trilha.modules.find((m) => m.meta.slug === slug);
    if (mod === undefined) continue;
    arquivos.set(`modules/${slug}/${MODULE_FILE}`, `${JSON.stringify(mod.meta, null, 2)}\n`);
  }
  return { trilha, arquivos };
}

// ---------------------------------------------------------------------------
// VERIFICAÇÃO — o gate, antes de qualquer escrita
// ---------------------------------------------------------------------------

/** O placar comparável, o mesmo recorte que o `repair` publica. */
export interface PlacarDeReordenacao {
  violacoes: number;
  desafiosComViolacao: number;
  lacunas: number;
  aulas: number;
  desafios: number;
}

/**
 * Extrai o placar de um report.
 *
 * NÃO importado de `modes/repair.ts` de propósito: a fiação prevista é
 * `repair` → `reorder` (o repair passa a chamar este módulo na metade
 * "movimentação" da polaridade de ORDEM), e importar de volta fecharia um ciclo
 * de módulos entre os dois. A duplicação é de CINCO campos derivados de
 * `AuditReport.totals`, e o teste de placar prova que os dois concordam.
 */
export function placarDeReordenacao(report: AuditReport): PlacarDeReordenacao {
  return {
    violacoes: report.totals.violacoes,
    desafiosComViolacao: report.totals.desafiosComViolacao,
    lacunas: report.totals.lacunasDeCurriculo,
    aulas: report.totals.aulas,
    desafios: report.totals.desafios,
  };
}

/** O veredicto: `ok: false` ⇒ NADA é gravado. */
export interface VeredictoDeReordenacao {
  ok: boolean;
  /** por que não. Vazio quando `ok`. */
  recusas: readonly RecusaDeReordenacao[];
  /** a ordem pedagógica (refs) antes e depois — o delta legível do movimento. */
  ordemAntes: readonly string[];
  ordemDepois: readonly string[];
  placarAntes: PlacarDeReordenacao;
  placarDepois: PlacarDeReordenacao;
  /** chaves dos alvos que o movimento REALMENTE resolveu. */
  alvosResolvidos: readonly string[];
  /** chaves dos alvos que continuaram lá (recusa `VIOLACAO_ALVO_PERSISTE`). */
  alvosPersistentes: readonly string[];
  /** chaves das violações que NÃO existiam antes (recusa `VIOLACAO_NOVA`). */
  violacoesNovas: readonly string[];
  declaracoes: readonly string[];
}

/** I14 sobre a trilha resultante: `order` inteiro, 1..999 e ÚNICO. */
function verificarI14(trilha: LoadedTrack): RecusaDeReordenacao[] {
  const saida: RecusaDeReordenacao[] = [];
  const visto = new Map<number, string>();
  for (const mod of trilha.modules) {
    const order = mod.meta.order;
    if (!Number.isInteger(order) || order < 1 || order > 999) {
      saida.push(
        recusa(
          'I14_ORDER_INVALIDO',
          `\`order\` ${JSON.stringify(order)} do módulo \`${mod.meta.slug}\` não é inteiro em 1..999 ` +
            '(content/trackTypes.ts::validateModuleSource) — a trilha nem carregaria depois de gravada',
          [mod.meta.slug],
        ),
      );
      continue;
    }
    const anterior = visto.get(order);
    if (anterior !== undefined) {
      saida.push(
        recusa(
          'I14_ORDER_INVALIDO',
          `\`order\` ${order} ficaria duplicado entre \`${anterior}\` e \`${mod.meta.slug}\` — I14 ` +
            '(audit.ts:296-315): com `order` repetido a ordem pedagógica fica indefinida e o orçamento ' +
            'cumulativo passa a depender da ordem do DISCO',
          [anterior, mod.meta.slug],
        ),
      );
      continue;
    }
    visto.set(order, mod.meta.slug);
  }
  return saida;
}

/**
 * I4 na LEITURA DE AULA: todo `lesson.prerequisites` vem ESTRITAMENTE ANTES da
 * aula que o declara.
 *
 * É a mesma invariante de `graph/invariants.ts::checkI4` ("toda construção
 * usada tem aula de origem, e ela NÃO vem depois"), aplicada ao grafo que
 * EXISTE no disco: a F12 deriva `prerequisites` do índice reverso do orçamento
 * (`f12Materialize.ts:63-70`), então uma aresta invertida aqui é literalmente
 * uma construção usada antes de ser ensinada — só que já materializada.
 */
function violacoesI4(trilha: LoadedTrack): Map<string, RecusaDeReordenacao> {
  const posicoes = posicoesDaTrilha(trilha);
  const grafo = grafoDeAulas(trilha);
  const saida = new Map<string, RecusaDeReordenacao>();
  for (const [ref, pres] of grafo.prerequisitos) {
    const pos = posicoes.get(ref);
    if (pos === undefined) continue;
    for (const pre of pres) {
      const posPre = posicoes.get(pre);
      if (posPre === undefined || posPre.indiceGlobal < pos.indiceGlobal) continue;
      saida.set(
        `${ref}\u0000${pre}`,
        recusa(
          'I4_PREREQUISITO_DEPOIS',
          `\`${ref}\` declara \`${pre}\` como pré-requisito, e nesta ordem \`${pre}\` vem DEPOIS ` +
            `(posição ${posPre.indiceGlobal} contra ${pos.indiceGlobal}) — I4`,
          [ref, pre],
        ),
      );
    }
  }
  return saida;
}

/**
 * I8 (interleaving) na leitura de aula: nunca 3 aulas consecutivas da mesma
 * família sintática.
 *
 * A família é `lesson.concepts[0]` — exatamente o que
 * `graph/invariants.ts::AulaNaVisao.familiaSintatica` documenta ("resolvida
 * pelo builder a partir do conceito principal"). Aula sem `concepts` não tem
 * família e é PULADA, como o `checkI8` original faz com `familia == null`:
 * fail-closed aqui recusaria toda reordenação em conteúdo sem conceitos
 * declarados, o que é reprovar o mensageiro.
 */
function violacoesI8(trilha: LoadedTrack): Map<string, RecusaDeReordenacao> {
  const ordem = pedagogicalOrder(trilha);
  const saida = new Map<string, RecusaDeReordenacao>();
  for (let i = 0; i + 2 < ordem.length; i++) {
    const familia = ordem[i].lesson.meta.concepts[0] ?? null;
    if (familia === null) continue;
    if (ordem[i + 1].lesson.meta.concepts[0] !== familia) continue;
    if (ordem[i + 2].lesson.meta.concepts[0] !== familia) continue;
    const refs = [0, 1, 2].map((k) => `${ordem[i + k].moduleSlug}/${ordem[i + k].lessonSlug}`);
    // A chave é o CONJUNTO das três aulas (ordenado), não a sequência delas.
    // Permutar três aulas que JÁ formavam um bloco proibido não cria violação
    // nova — só a reescreve em outra ordem; chavear pela sequência faria toda
    // permutação parecer um interleaving inédito, e o gate reprovaria um
    // movimento inocente.
    saida.set(
      [...refs].sort().join('\u0000'),
      recusa(
        'I8_INTERLEAVING',
        `3 aulas consecutivas da família \`${familia}\`: ${refs.join(', ')} — I8 (interleaving)`,
        refs,
      ),
    );
  }
  return saida;
}

/**
 * I11 (mudar a FORMA de construção já ensinada exige aula dedicada) na leitura
 * de orçamento.
 *
 * A FORMA vive no eixo `form:` das chaves de átomo, e as regras que o emitem
 * são a bateria declarativa de `engine/form/rules.ts` (CINCO de JavaScript,
 * CATORZE de TypeScript). A CONSTRUÇÃO é a base da chave — o nome antes do `[`
 * ou do `>`. Uma aula que introduz uma forma NOVA de uma construção cuja OUTRA
 * forma já foi ensinada por uma aula ANTERIOR, e que introduz mais de uma forma
 * ao mesmo tempo, não é a "aula dedicada" que I11 exige — o mesmo critério do
 * `graph/invariants.ts::checkI11` (`mudancaDeForma && pares.length !== 1`,
 * comparando só com aulas de índice menor).
 *
 * ALCANCE, MEDIDO E DECLARADO. Em JAVASCRIPT esta verificação é vacuosa, e não
 * por preguiça: as cinco formas do dialeto têm BASES DISTINTAS entre si
 * (`VariableDeclaration>FunctionExpression`, `IfStatement[alternate=null]`,
 * `ArrowFunction[body!=Block]`, `Parameter[initializer!=null]`,
 * `ObjectLiteralExpression>MethodDeclaration`), então "duas formas da mesma
 * construção" não existe lá. Em TYPESCRIPT existe — `IfStatement[alternate=null]`
 * contra `IfStatement[expression=BinaryExpression]` — e é onde o teste R14 a
 * exercita. Duas das formas de JavaScript (`ArrowFunction[body!=Block]` e
 * `Parameter[initializer!=null]`) ainda são semeadas no axioma receptivo pelo
 * harness (`atomKeys.ts::HARNESS_RECEPTIVE_SEED`), então nunca aparecem em
 * `introduces` — mais um motivo para o alcance ser o que é.
 *
 * O que NÃO se faz aqui: inventar formas a partir de outros eixos. Dizer que
 * `node:ArrowFunction` é "outra forma de" `node:FunctionDeclaration` exigiria
 * uma tabela que o alfabeto não declara, e fabricá-la seria dado inventado.
 */
function violacoesI11(budget: TrackBudget): Map<string, RecusaDeReordenacao> {
  const formasPorAula = budget.lessons.map((aula) => ({
    ref: aula.ref,
    formas: aula.introduces.receptive.filter((k) => k.startsWith('form:')),
  }));
  const baseDe = (forma: string): string => forma.slice('form:'.length).split('[')[0];

  const saida = new Map<string, RecusaDeReordenacao>();
  formasPorAula.forEach((aula, indice) => {
    for (const forma of aula.formas) {
      const base = baseDe(forma);
      // "Já ensinada" é o que veio de aula ANTERIOR. Mudar a forma DENTRO da
      // mesma aula não é mudar o que já foi ensinado — a mesma leitura do
      // `graph/invariants.ts::checkI11` (`p.indice < indice`).
      const anterior = formasPorAula
        .slice(0, indice)
        .flatMap((a) => a.formas.map((f) => ({ forma: f, ref: a.ref })))
        .find((a) => baseDe(a.forma) === base && a.forma !== forma);
      if (anterior === undefined) continue;
      const jaConhecida = formasPorAula
        .slice(0, indice)
        .some((a) => a.formas.includes(forma));
      // Aula DEDICADA = apresenta uma forma só. Com mais de uma, a mudança
      // entra de carona numa aula que ensina outra coisa (I11).
      if (jaConhecida || aula.formas.length === 1) continue;
      saida.set(
        `${aula.ref}\u0000${forma}`,
        recusa(
          'I11_MUDANCA_DE_FORMA',
          `\`${aula.ref}\` muda a forma de \`${base}\` (de \`${anterior.forma}\`, ensinada em ` +
            `\`${anterior.ref}\`, para \`${forma}\`) numa aula que apresenta ${aula.formas.length} formas — ` +
            'mudança de forma exige AULA DEDICADA (I11)',
          [aula.ref, anterior.ref],
        ),
      );
    }
  });
  return saida;
}

/** As três invariantes diferenciais (I4/I8/I11), medidas antes e depois. */
function verificarInvariantesDeOrdem(
  antes: LoadedTrack,
  depois: LoadedTrack,
  budgetAntes: TrackBudget,
  budgetDepois: TrackBudget,
): RecusaDeReordenacao[] {
  const saida: RecusaDeReordenacao[] = [];
  const pares: Array<[Map<string, RecusaDeReordenacao>, Map<string, RecusaDeReordenacao>]> = [
    [violacoesI4(antes), violacoesI4(depois)],
    [violacoesI8(antes), violacoesI8(depois)],
    [violacoesI11(budgetAntes), violacoesI11(budgetDepois)],
  ];
  for (const [mapaAntes, mapaDepois] of pares) {
    for (const [chave, r] of mapaDepois) {
      if (mapaAntes.has(chave)) continue;
      saida.push(r);
    }
  }
  return saida;
}

/** Um movimento é bem formado? (permutação exata, módulos existentes.) */
function verificarFormaDosMovimentos(
  track: LoadedTrack,
  movimentos: readonly MovimentoDeReordenacao[],
): RecusaDeReordenacao[] {
  const saida: RecusaDeReordenacao[] = [];
  for (const mov of movimentos) {
    if (mov.tipo === 'MOVER_AULA_NO_MODULO') {
      const mod = track.modules.find((m) => m.meta.slug === mov.moduleSlug);
      if (mod === undefined) {
        saida.push(
          recusa('MOVIMENTO_INVALIDO', `o movimento cita o módulo \`${mov.moduleSlug}\`, que não existe na trilha`, [mov.moduleSlug]),
        );
        continue;
      }
      const antes = [...mod.meta.lessons].sort();
      const depois = [...mov.lessonsNovas].sort();
      if (antes.length !== depois.length || antes.some((s, i) => s !== depois[i])) {
        saida.push(
          recusa(
            'MOVIMENTO_INVALIDO',
            `\`lessonsNovas\` do módulo \`${mov.moduleSlug}\` NÃO é uma permutação de \`lessons\` — ` +
              `gravar isso perderia ou duplicaria aula (antes: ${antes.join(', ')}; depois: ${depois.join(', ')})`,
            [mov.moduleSlug],
          ),
        );
      }
      continue;
    }
    for (const nova of mov.ordensNovas) {
      if (track.modules.some((m) => m.meta.slug === nova.moduleSlug)) continue;
      saida.push(
        recusa('MOVIMENTO_INVALIDO', `o movimento cita o módulo \`${nova.moduleSlug}\`, que não existe na trilha`, [nova.moduleSlug]),
      );
    }
  }
  return saida;
}

/**
 * Os movimentos do MESMO módulo COMPÕEM? — o gate da composição, ANTES de
 * aplicar qualquer coisa.
 *
 * Só entra em cena com DOIS OU MAIS `MOVER_AULA_NO_MODULO` no mesmo módulo:
 * com um só não há nada com que compor, e por isso nenhum plano de movimento
 * único muda de comportamento por causa deste bloco.
 *
 * As duas maneiras de não compor, e elas são diferentes:
 *
 *   (A) CADEIA QUEBRADA — o `lessonsNovas` do movimento N foi calculado contra
 *       um array que o movimento N-1 já não deixa. Cada um, sozinho, é uma
 *       permutação válida de `lessons` (o `verificarFormaDosMovimentos` os
 *       aprova); em sequência, como a aplicação grava o array INTEIRO, o
 *       segundo APAGA o primeiro. É o defeito que o plano montado à mão — ou um
 *       planejador sem estado acumulado — produz sem perceber.
 *   (B) ORDENS OPOSTAS — cada movimento é um elo válido da cadeia, e mesmo
 *       assim o pedido não fecha: um põe `a` antes de `b` e o outro põe `b`
 *       antes de `a`, então o segundo DESFAZ o primeiro. A direção de cada
 *       movimento é lida do `lessonsNovas` DELE (nunca do `antesDe`, que é
 *       prosa descritiva e pode não bater com o array — ver o R10 da suíte).
 *
 * Nos dois casos a causa é `CONFLITO_DE_COMPOSICAO`. O sintoma seria
 * `VIOLACAO_ALVO_PERSISTE` ("o plano não entrega o que promete"), que culparia
 * o movimento individual — e cada um deles, sozinho, entrega.
 */
function verificarComposicaoDosMovimentos(
  track: LoadedTrack,
  movimentos: readonly MovimentoDeReordenacao[],
): RecusaDeReordenacao[] {
  const saida: RecusaDeReordenacao[] = [];
  for (const [moduleSlug, lista] of movimentosDeAulaPorModulo(movimentos)) {
    if (lista.length < 2) continue;
    const mod = track.modules.find((m) => m.meta.slug === moduleSlug);
    // módulo inexistente já é `MOVIMENTO_INVALIDO` — não se acusa duas vezes.
    if (mod === undefined) continue;

    // (A) a cadeia.
    let base: readonly string[] = [...mod.meta.lessons];
    let cadeiaIntacta = true;
    for (const [i, mov] of lista.entries()) {
      if (!soRelocouALicao(base, mov.lessonsNovas, mov.lessonSlug)) {
        cadeiaIntacta = false;
        const anterior = i === 0 ? '`lessons` do módulo' : `o movimento de \`${lista[i - 1].lessonSlug}\``;
        saida.push(
          recusa(
            'CONFLITO_DE_COMPOSICAO',
            `no módulo \`${moduleSlug}\`, o movimento ${i + 1} de ${lista.length} (aula \`${mov.lessonSlug}\`) ` +
              `declara [${mov.lessonsNovas.join(', ')}], que não é [${base.join(', ')}] — o que ${anterior} ` +
              `deixa — com apenas \`${mov.lessonSlug}\` relocada. Os movimentos foram calculados contra estados ` +
              'DIFERENTES do mesmo array, e como a aplicação grava o array INTEIRO, este movimento apagaria o ' +
              'anterior por inteiro. Movimentos do mesmo módulo formam uma CADEIA.',
            [`${moduleSlug}/${mov.lessonSlug}`, ...(i === 0 ? [moduleSlug] : [`${moduleSlug}/${lista[i - 1].lessonSlug}`])],
          ),
        );
      }
      base = mov.lessonsNovas;
    }
    if (!cadeiaIntacta) continue;

    // (B) as direções. `base` é agora o array FINAL da cadeia.
    for (const mov of lista) {
      if (!mov.lessonsNovas.includes(mov.antesDe) || mov.lessonSlug === mov.antesDe) continue;
      const noMovimento = ordemRelativa(mov.lessonsNovas, mov.lessonSlug, mov.antesDe);
      const noFinal = ordemRelativa(base, mov.lessonSlug, mov.antesDe);
      if (noMovimento === 0 || noFinal === 0 || noMovimento < 0 === noFinal < 0) continue;
      saida.push(
        recusa(
          'CONFLITO_DE_COMPOSICAO',
          `no módulo \`${moduleSlug}\`, o movimento de \`${mov.lessonSlug}\` a põe ` +
            `${noMovimento < 0 ? 'ANTES' : 'DEPOIS'} de \`${mov.antesDe}\`, e depois de compor todos os ` +
            `${lista.length} movimentos do módulo ela está ${noFinal < 0 ? 'ANTES' : 'DEPOIS'}: dois movimentos ` +
            'exigem ordens OPOSTAS entre as mesmas aulas e um desfaz o outro. Este módulo não escolhe qual dos ' +
            'dois pedidos honrar — a saída é reescrever o artefato (REWRITE_IN_BUDGET) ou revisar o currículo.',
          [`${moduleSlug}/${mov.lessonSlug}`, `${moduleSlug}/${mov.antesDe}`],
        ),
      );
    }
  }
  return saida;
}

/**
 * `verificarReordenacao(track, plano)` — PURA. O GATE, antes de qualquer escrita.
 *
 * Prova, sobre a ordem NOVA, as quatro coisas que o pedido exige:
 *
 *   (a) toda violação alvo SUMIU (senão `VIOLACAO_ALVO_PERSISTE`);
 *   (b) NENHUMA violação nova apareceu — mover uma aula para antes muda o
 *       orçamento de tudo que estava entre as duas (senão `VIOLACAO_NOVA`);
 *   (c) I4, I8 e I11 continuam válidas — diferencialmente: só recusa a violação
 *       que o MOVIMENTO criou;
 *   (d) I14 continua válida — absolutamente, porque `order` duplicado torna a
 *       ordem pedagógica indefinida e a trilha não carrega.
 *   (e) os movimentos do MESMO módulo COMPÕEM (senão `CONFLITO_DE_COMPOSICAO`).
 *       Vem junto de (a)-(d) e antes de aplicar: dois movimentos que não
 *       compõem gravariam só o último, e o audit acusaria o SINTOMA (o alvo do
 *       movimento apagado persiste) no lugar da causa.
 *
 * Aceita plano montado à mão (pelo `repair`, por um teste, por um humano): a
 * forma dos movimentos é conferida ANTES de aplicar, e é por isso que a
 * verificação de I14 não é decorativa mesmo com o planejador renumerando por
 * construção.
 *
 * FAIL-CLOSED: qualquer recusa ⇒ `ok: false` ⇒ `reordenarTrilha` não grava.
 */
export function verificarReordenacao(
  track: LoadedTrack,
  plano: PlanoDeReordenacao,
  opcoes: DeriveOptions = {},
): VeredictoDeReordenacao {
  const auditAntes = auditTrack(track, opcoes);
  const budgetAntes = deriveTrackBudget(track, opcoes);
  const ordemAntes = pedagogicalOrder(track).map((a) => `${a.moduleSlug}/${a.lessonSlug}`);
  const placarAntes = placarDeReordenacao(auditAntes);
  const declaracoes: string[] = [
    'verificação DIFERENCIAL: o critério é "a reordenação não piora nada", não "a trilha fica limpa" — dívida pré-existente não é do movimento.',
    'chave de violação sem linha/coluna (chaveDaViolacao): o texto não muda no movimento, a posição sim.',
  ];

  const recusas: RecusaDeReordenacao[] = [];

  // Ciclo no grafo de pré-requisitos: recusa ANTES de tudo (nenhuma ordem o
  // satisfaz), inclusive para plano montado à mão.
  const ciclo = cicloDePrerequisitos(grafoDeAulas(track));
  if (ciclo !== null) recusas.push(ciclo);

  recusas.push(...verificarFormaDosMovimentos(track, plano.movimentos));
  // A COMPOSIÇÃO vem junto da FORMA, e pelo mesmo motivo: as duas são sobre o
  // que o plano DIZ, não sobre o que a trilha vira — e as duas têm de recusar
  // ANTES de aplicar, senão a aplicação já apagou o movimento anterior e o
  // audit acusaria o sintoma (`VIOLACAO_ALVO_PERSISTE`) no lugar da causa.
  recusas.push(...verificarComposicaoDosMovimentos(track, plano.movimentos));

  if (recusas.length > 0 || plano.movimentos.length === 0) {
    return {
      ok: recusas.length === 0,
      recusas,
      ordemAntes,
      ordemDepois: ordemAntes,
      placarAntes,
      placarDepois: placarAntes,
      alvosResolvidos: [],
      // Nada foi movido ⇒ nada foi resolvido: TODO alvo continua de pé (é o
      // caso do piso de pré-requisito e do ciclo — o plano é válido, só não
      // conserta nada). Reportar [] aqui faria o chamador ler "resolvido".
      alvosPersistentes: plano.alvos.map((a) => a.chave),
      violacoesNovas: [],
      declaracoes: [
        ...declaracoes,
        ...(plano.movimentos.length === 0
          ? ['plano sem movimentos: nada a verificar e nada a gravar (não é falha — é a trilha já ordenada, ou toda violação fora de escopo).']
          : []),
      ],
    };
  }

  const { trilha } = aplicarMovimentos(track, plano.movimentos);
  const auditDepois = auditTrack(trilha, opcoes);
  const budgetDepois = deriveTrackBudget(trilha, opcoes);
  const ordemDepois = pedagogicalOrder(trilha).map((a) => `${a.moduleSlug}/${a.lessonSlug}`);
  const placarDepois = placarDeReordenacao(auditDepois);

  const antes = chavesDeErro(auditAntes);
  const depois = chavesDeErro(auditDepois);

  const alvosResolvidos: string[] = [];
  const alvosPersistentes: string[] = [];
  for (const alvo of plano.alvos) {
    if (depois.has(alvo.chave)) alvosPersistentes.push(alvo.chave);
    else alvosResolvidos.push(alvo.chave);
  }
  // Só os alvos com movimento planejado são cobrados: um alvo cuja aula caiu em
  // `impossiveis` (piso de pré-requisito) nunca teve movimento e não pode
  // reprovar o movimento dos outros.
  const aulasMovidas = new Set<string>();
  for (const mov of plano.movimentos) {
    if (mov.tipo === 'MOVER_AULA_NO_MODULO') aulasMovidas.add(`${mov.moduleSlug}/${mov.lessonSlug}`);
    else for (const nova of mov.ordensNovas) aulasMovidas.add(nova.moduleSlug);
  }
  for (const alvo of plano.alvos) {
    if (!depois.has(alvo.chave)) continue;
    const moduloQueEnsina = alvo.ensinadaEm.split('/')[0];
    if (!aulasMovidas.has(alvo.ensinadaEm) && !aulasMovidas.has(moduloQueEnsina)) continue;
    recusas.push(
      recusa(
        'VIOLACAO_ALVO_PERSISTE',
        `o movimento de \`${alvo.ensinadaEm}\` deveria resolver \`${alvo.construcao}\` em ${alvo.arquivo} ` +
          `(${alvo.campo}), e a violação continua no audit — o plano não entrega o que promete`,
        [alvo.ref, alvo.ensinadaEm],
      ),
    );
  }

  const violacoesNovas: string[] = [];
  for (const v of auditDepois.violations) {
    if ((v.severidade ?? 'erro') === 'aviso') continue;
    const chave = chaveDaViolacao(v);
    if (antes.has(chave) || violacoesNovas.includes(chave)) continue;
    violacoesNovas.push(chave);
    recusas.push(
      recusa(
        'VIOLACAO_NOVA',
        `mover a aula CRIOU uma violação que não existia: ${v.regra} em ${v.arquivo} (${String(v.campo)})` +
          `${v.construcao === null ? '' : `, construção \`${v.construcao}\``} — ${v.mensagem}`,
        [v.ref, ...(v.primeiraAulaQueEnsina === null ? [] : [v.primeiraAulaQueEnsina])],
      ),
    );
  }

  recusas.push(...verificarInvariantesDeOrdem(track, trilha, budgetAntes, budgetDepois));
  recusas.push(...verificarI14(trilha));

  return {
    ok: recusas.length === 0,
    recusas,
    ordemAntes,
    ordemDepois,
    placarAntes,
    placarDepois,
    alvosResolvidos,
    alvosPersistentes,
    violacoesNovas,
    declaracoes,
  };
}

// ---------------------------------------------------------------------------
// O modo completo — dry-run (default) | aplicar
// ---------------------------------------------------------------------------

export type ModoDeReordenacao = 'dry-run' | 'aplicar';

/** Tudo que cruza o mundo é INJETADO — o mesmo padrão do `repair`. */
export interface DepsDaReordenacao {
  /** trilha já carregada (testes: fixture; produção: o CLI carrega). */
  track?: LoadedTrack;
  /** fallback de carga por slug (usado quando `track` está ausente). */
  carregarTrilha?: (slug: string) => Promise<LoadedTrack>;
  /** o audit (default `auditTrack`) — o MESMO caminho do G-AUDIT. */
  auditar?: (track: LoadedTrack) => AuditReport;
  /**
   * a escrita de UM `module.json` (caminho relativo à raiz da trilha).
   * AUSENTE: o default grava sob `track.dir` com
   * `runtime/runState.escreverAtomico` (tmp + fsync + rename — D-WRITE), a
   * MESMA primitiva da F12 e do `repair` do CLI. O `dry-run` NUNCA chama.
   */
  gravarArquivo?: (arquivo: string, conteudo: string) => Promise<void> | void;
  /** opções do orçamento (modo declared/inferred, política de harness). */
  opcoes?: DeriveOptions;
}

export interface EntradaDaReordenacao {
  slug: string;
  modo: ModoDeReordenacao;
}

interface BaseDoResultado {
  slug: string;
  modo: ModoDeReordenacao;
  plano: PlanoDeReordenacao;
  veredicto: VeredictoDeReordenacao;
  auditInicial: AuditReport;
  placarInicial: PlacarDeReordenacao;
  declaracoes: readonly string[];
}

export type ResultadoDeReordenacao =
  | (BaseDoResultado & {
      modo: 'dry-run';
      /** dry-run NUNCA grava: a dep de escrita não é chamada. */
      escritos: readonly string[];
      aplicado: false;
    })
  | (BaseDoResultado & {
      modo: 'aplicar';
      /** false quando o veredicto recusou (ou não havia movimento): nada foi gravado. */
      aplicado: boolean;
      escritos: readonly string[];
      auditFinal: AuditReport;
      placarFinal: PlacarDeReordenacao;
      /** `placarFinal.violacoes < placarInicial.violacoes`. */
      melhorou: boolean;
    });

/** O gravador default: `escreverAtomico` sob a raiz da trilha (D-WRITE). */
function gravadorAtomicoEm(dirDaTrilha: string): (arquivo: string, conteudo: string) => Promise<void> {
  return async (arquivo, conteudo) => {
    const destino = path.join(dirDaTrilha, arquivo);
    await fsp.mkdir(path.dirname(destino), { recursive: true });
    await escreverAtomico(destino, conteudo.endsWith('\n') ? conteudo : `${conteudo}\n`);
  };
}

/**
 * `reordenarTrilha(deps, { slug, modo })` — o modo completo.
 *
 * `dry-run` (o DEFAULT do CLI, como no `repair`): plano + veredicto + o delta
 * esperado da ordem. ZERO escrita — a dep de gravação não é chamada nem quando
 * está injetada. É a convenção do repositório e é o que permite auditar antes
 * de mexer em conteúdo versionado.
 *
 * `aplicar`: só grava DEPOIS de `verificarReordenacao` devolver `ok`. Recusa é
 * um resultado legítimo, não uma exceção: volta com `aplicado: false`,
 * `escritos: []` e as recusas estruturadas — quem chama não tem como confundir
 * "recusado" com "aplicado". Fecha rodando `auditTrack` de novo sobre a trilha
 * já movida e comparando o placar com o inicial, exatamente como o
 * `repair --aplicar`.
 */
export async function reordenarTrilha(
  deps: DepsDaReordenacao,
  entrada: EntradaDaReordenacao,
): Promise<ResultadoDeReordenacao> {
  const track =
    deps.track ?? (deps.carregarTrilha !== undefined ? await deps.carregarTrilha(entrada.slug) : undefined);
  if (track === undefined) {
    throw erroDeReordenacao(
      'REORDER_TRILHA_INDISPONIVEL',
      'entrada',
      `nenhuma trilha "${entrada.slug}" disponível: injete deps.track ou deps.carregarTrilha (fail-closed).`,
    );
  }

  const opcoes = deps.opcoes ?? {};
  const auditar = deps.auditar ?? ((t: LoadedTrack) => auditTrack(t, opcoes));
  const auditInicial = auditar(track);
  const placarInicial = placarDeReordenacao(auditInicial);
  const plano = planejarReordenacao(track, auditInicial);
  const veredicto = verificarReordenacao(track, plano, opcoes);

  const declaracoes: string[] = [
    ...plano.declaracoes,
    ...veredicto.declaracoes,
    `movimentos planejados: ${plano.movimentos.length}; alvos de ordem: ${plano.alvos.length}; ` +
      `impossíveis (piso/ciclo): ${plano.impossiveis.length}; fora de escopo: ${plano.foraDeEscopo.length}.`,
  ];

  if (entrada.modo === 'dry-run') {
    return {
      slug: entrada.slug,
      modo: 'dry-run',
      plano,
      veredicto,
      auditInicial,
      placarInicial,
      declaracoes: [
        ...declaracoes,
        'dry-run: NADA é gravado (a dep de escrita não é chamada) — o plano, o veredicto e o delta da ordem seguem no resultado.',
      ],
      escritos: [],
      aplicado: false,
    };
  }

  if (!veredicto.ok || plano.movimentos.length === 0) {
    return {
      slug: entrada.slug,
      modo: 'aplicar',
      plano,
      veredicto,
      auditInicial,
      placarInicial,
      declaracoes: [
        ...declaracoes,
        veredicto.ok
          ? 'nada a reordenar: o plano não tem movimento — nenhuma escrita (não é falha).'
          : `plano RECUSADO por ${veredicto.recusas.length} motivo(s): NADA foi gravado (fail-closed, §9.3).`,
      ],
      aplicado: false,
      escritos: [],
      auditFinal: auditInicial,
      placarFinal: placarInicial,
      melhorou: false,
    };
  }

  const { trilha, arquivos } = aplicarMovimentos(track, plano.movimentos);
  const gravar = deps.gravarArquivo ?? gravadorAtomicoEm(track.dir);
  const escritos: string[] = [];
  for (const [arquivo, conteudo] of arquivos) {
    try {
      await gravar(arquivo, conteudo);
    } catch (erro) {
      throw erroDeReordenacao(
        'REORDER_ESCRITA_FALHOU',
        'gravar-modulos',
        `não foi possível gravar "${arquivo}" (escrita parcial entre arquivos é possível — cada arquivo ` +
          'individualmente é atômico; fail-closed).',
        erro,
      );
    }
    escritos.push(arquivo);
  }

  const auditFinal = auditar(trilha);
  const placarFinal = placarDeReordenacao(auditFinal);

  return {
    slug: entrada.slug,
    modo: 'aplicar',
    plano,
    veredicto,
    auditInicial,
    placarInicial,
    declaracoes: [
      ...declaracoes,
      `gravação: ${deps.gravarArquivo === undefined ? 'escreverAtomico (tmp + fsync + rename) sob ' + track.dir : 'deps.gravarArquivo injetada'}.`,
      `placar: ${placarInicial.violacoes} → ${placarFinal.violacoes} violações; ` +
        `${placarInicial.desafiosComViolacao} → ${placarFinal.desafiosComViolacao} desafios com violação.`,
    ],
    aplicado: true,
    escritos,
    auditFinal,
    placarFinal,
    melhorou: placarFinal.violacoes < placarInicial.violacoes,
  };
}
