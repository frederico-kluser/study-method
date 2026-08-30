/**
 * app/electron/main/engine/phases/f3Graph.ts — F3 · GRAFO DE PRÉ-REQUISITOS
 * (pacote P-16, `docs/16-engine-de-trilha.md` §3.4, §3.5 e §4).
 *
 * Contrato normativo:
 *   - §3.4 — as DUAS arestas semanticamente distintas (`desbloqueado_por`:
 *     dura, alimenta ordem/anti-salto; `usa`: linha da Q-matrix, alimenta o
 *     orçamento cumulativo). Type check duro: todo item das duas arestas é um
 *     `concept.id`, jamais `lesson.slug`. Poda por fecho transitivo é VISÃO DE
 *     RENDERIZAÇÃO, nunca armazenamento: as arestas redundantes FICAM no grafo
 *     armazenado, cada uma com justificativa. Empate → NENHUMA aresta; precisão
 *     vale mais que cobertura.
 *   - §3.5 — o orçamento deriva do GRAFO, zero LLM. A derivação é da F4/P-10
 *     (`deriveBudgetDoGrafo`); esta fase CONSUME a F4 (monta a VisaoDeEnsino
 *     com orcamentoVigente = budget_saida.receptive ∪ budget_saida.productive),
 *     NUNCA re-deriva.
 *   - §4 — F3 é `▮ + ⇉` : o DESIGN do sílabo é de UM agente (escritor único
 *     serial) — "não paralelize o design do sílabo. O grafo é escrito por um
 *     agente só; o que paraleliza é o julgamento de arestas candidatas e a
 *     validação". Neste código, a montagem (`montarGrafoDeNos`), a candidatura
 *     (`montarCandidatos`), a escrita (`escreverGrafo`) e a validação são
 *     funções PURAS SEQUENCIAIS (escritor único); o JULGAMENTO
 *     (`julgarArestas`) é o único fan-out — promessas paralelas sob o SEM_LLM
 *     injetável (runtime/semaphore.ts), cada pará vira UMA chamada ao juiz.
 *
 * O QUE ESTE ARQUIVO É (fluxo):
 *
 *   a. MONTAGEM — `montarGrafoDeNos(nos)`: NoAtomico[] (F2) → vértices do
 *      grafo (conceptId(chave_conceito); `desbloqueadoPor`/`usa` inicialmente
 *      vazios; `familiaSintatica` de `no.familia`; formas ausentes — o NoAtomico
 *      do F2 não as carrega, documentado; `role` exposto em `roles` para a
 *      P-21 marcar nós integrativos). Duplicata de chave = erro estruturado
 *      (fail-closed; o merge do F2 já deduplica — defesa em profundidade).
 *   b. CANDIDATOS — `montarCandidatos(montagem, candidatos, raio)`: os pares
 *      do escritor serial, restritos a DISTÂNCIA CURTA (caminho de até `raio`
 *      saltos no próprio draft; default 1 = o draft como veio), deduplicados e
 *      validados (G-TYPE: endpoints existem no grafo; auto-aresta rejeitada);
 *      PODA por fecho transitivo (dag.ts::fechoTransitivoRedundante, do P-08)
 *      ANTES do despacho — reporta `evitadas` (quantas perguntas o julgamento
 *      deixou de fazer). A poda é visão de renderização: as arestas podadas
 *      NÃO são julgadas e FICAM no grafo armazenado com justificativa.
 *   c. JULGAMENTO — `julgarArestas`: fan-out com semáforo injetável (SEM_LLM).
 *      Cada pará = UMA chamada ao `JuizDeAresta` injetado (produção:
 *      `criarJuizDeArestaLlm` = callLlm + prompts/edgeJudge.ts; fakes nos
 *      testes). O juiz recebe APENAS a fatia CONGELADA — dois conceitos
 *      (subconjunto do NoAtomico) + a fatia do orçamento do snapshot (nunca o
 *      estado vivo do grafo).
 *   d. VOTO — `decidirVoto`: default 1 julgamento por par; MULTI-JUIZ quando
 *      configurado (`julgamentosPorPar > 1`): maioria ESTRITA com 'não sei'
 *      EXCLUÍDO; EMPATE → NENHUMA aresta; 'não sei' nunca conta como 'sim';
 *      precisão > cobertura.
 *   e. ESCRITA — `escreverGrafo`: arestas `desbloqueado_por` confirmadas;
 *      `usa[]` (Q-matrix) por mapeamento simples DOCUMENTADO (ver
 *      `derivarLinhaDaQMatrix`, premissa); arestas redundantes permanecem COM
 *      justificativa (visão de renderização).
 *   f. VALIDAÇÃO — `validarGrafo`: checkInvariants (P-08, I1–I11) sobre o
 *      grafo + a VisaoDeEnsino montada via F4; ENTREGA a lista de violações
 *      (NÃO lança — a F3 reporta e o laço/planejador decide).
 *
 * ERROS: tudo que viola o CONTRATO (conceito desconhecido, auto-aresta,
 * parâmetro inválido) é `F3Error` estruturado (fail-closed). A DERIVAÇÃO do
 * orçamento (F4) pode falhar (grafo com ciclo aponta G-DAG reprovado): o
 * `ResultadoF3` carrega `falhaDerivacaoBudget` e as violações de I1 chegam via
 * `checkInvariants` — nunca um throw silencioso, nunca um grafo "quase certo".
 *
 * PURO/DI: nada aqui escreve em disco, lê rede ou toca LLM diretamente —
 * montagem/candidatura/voto/escrita/validação/visão são puras; o único IO é o
 * `JuizDeAresta` INJETADO dentro do fan-out (fakes nos testes).
 */

import {
  checkInvariants,
  type AulaNaVisao,
  type ViolacaoEstrutural,
  type VisaoDeEnsino,
} from '../graph/invariants';
import { type Concept, type ConceptGraph, type ConceptId, conceptId } from '../graph/model';
import {
  fechoTransitivoRedundante,
  toposort,
  type ArestaRedundante,
  type ResultadoToposort,
} from '../graph/dag';
import { type EngineLlm } from '../runtime/callLlm';
import { createLlmSemaphore, type Semaphore } from '../runtime/semaphore';
import {
  EDGE_VOTE_JSON_SCHEMA,
  parseRespostaDeJuiz,
  promptDeJuizDeAresta,
  type FatiaDeConceito,
  type VotoAresta,
} from '../prompts/edgeJudge';
import { type NoAtomico, type PapelNo } from './f2Decompose';
import {
  congelarProfundamente,
  deriveBudgetDoGrafo,
  F4Error,
  type AulaPlano,
  type BudgetF4,
} from './f4Budget';

// ---------------------------------------------------------------------------
// Erros estruturados (fail-closed — INV-03)
// ---------------------------------------------------------------------------

export type F3ErrorCode =
  /** candidato/plano referencia conceito fora do grafo montado (G-TYPE). */
  | 'CONCEITO_DESCONHECIDO'
  /** auto-aresta (A→A) — a pergunta canônica do §3.4 não se aplica. */
  | 'CANDIDATO_INVALIDO'
  /** parâmetro inválido (ex.: julgamentosPorPar < 1). */
  | 'CONFIGURACAO_INVALIDA'
  /** duas chaves de conceito iguais na entrada — o merge do F2 deveria ter deduplicado. */
  | 'MONTAGEM_INVALIDA';

export class F3Error extends Error {
  readonly code: F3ErrorCode;

  constructor(code: F3ErrorCode, mensagem: string) {
    super(`f3: ${mensagem}`);
    this.name = 'F3Error';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Tipos do domínio da fase
// ---------------------------------------------------------------------------

/** Um pará candidato de aresta DURA — A→B ("B.desbloqueadoPor ∋ A"). */
export interface ParCandidato {
  /** o conceito A (origem — o pré-requisito candidato). */
  de: ConceptId;
  /** o conceito B (destino — quem precisaria de A). */
  para: ConceptId;
}

function chaveDePar(par: { de: ConceptId; para: ConceptId }): string {
  return `${par.de}\u0000${par.para}`;
}

function compararPares(a: { de: ConceptId; para: ConceptId }, b: { de: ConceptId; para: ConceptId }): number {
  if (a.de !== b.de) return a.de < b.de ? -1 : 1;
  if (a.para !== b.para) return a.para < b.para ? -1 : 1;
  return 0;
}

// ---------------------------------------------------------------------------
// a · MONTAGEM DO GRAFO — escritor único, função PURA sequencial
// ---------------------------------------------------------------------------

/** A montagem da F3: o grafo (arestas VAZIAS) + os mapas auxiliares. */
export interface MontagemF3 {
  /** vértices montados; `desbloqueadoPor`/`usa` iniciais VAZIOS (a fase os preenche). */
  grafo: ConceptGraph;
  /** conceito → papel do nó F2 ('isolado' | 'integration') — a P-21 marca nós integrativos (§3.7). */
  roles: Readonly<Record<string, PapelNo>>;
  /** as FATIAS CONGELADAS por conceito (subconjunto do NoAtomico) — o juiz recebe só isto. */
  porId: ReadonlyMap<ConceptId, FatiaDeConceito>;
}

/**
 * MONTAGEM (a): `NoAtomico[]` → vértices do `ConceptGraph`. Serial e PURA —
 * é a materialização, em código, do "o grafo é escrito por um agente só"
 * (§4.1): a entrada é o artefato já mergeado do F2, e nada aqui escreve no
 * meio do julgamento.
 *
 * Type check duro (§3.4): o id do vértice nasce de `conceptId(chave_conceito)`
 * (marca de tipo + validação de formato snake_case em runtime); um slug de
 * aula (kebab/`/`) NUNCA entra. `familiaSintatica` vem de `no.familia`.
 * `formas` ficam AUSENTES: o NoAtomico do F2 não carrega o eixo form: (o
 * conceito tem uma forma só — nenhuma regra de forma dispara, documentado em
 * graph/model.ts). `desbloqueadoPor`/`usa` começam vazios.
 */
export function montarGrafoDeNos(nos: readonly NoAtomico[]): MontagemF3 {
  const vistos = new Set<string>();
  const conceitos: Concept[] = [];
  const roles: Record<string, PapelNo> = {};
  const porId = new Map<ConceptId, FatiaDeConceito>();

  for (const no of nos) {
    if (vistos.has(no.chave_conceito)) {
      throw new F3Error(
        'MONTAGEM_INVALIDA',
        `chave de conceito duplicada na entrada: "${no.chave_conceito}" — o merge do F2 deveria ter deduplicado por chave`,
      );
    }
    vistos.add(no.chave_conceito);
    const id = conceptId(no.chave_conceito);
    conceitos.push({
      id,
      familiaSintatica: no.familia,
      desbloqueadoPor: [],
      usa: [],
    });
    roles[id] = no.role;
    porId.set(
      id,
      congelarProfundamente({
        id,
        nome: no.nome,
        familiaSintatica: no.familia,
        introduces: {
          receptive: [...no.introduces.receptive],
          productive: [...no.introduces.productive],
        },
        role: no.role,
      }),
    );
  }

  return { grafo: { conceitos }, roles, porId };
}

// ---------------------------------------------------------------------------
// b · CANDIDATOS DE ARESTA — função PURA (distância curta + poda por fecho)
// ---------------------------------------------------------------------------

/** Os candidatos prontos para o julgamento + o que a poda evitou. */
export interface CandidatosF3 {
  /** candidatos que IRÃO ao juiz (distância curta, NÃO redundantes). */
  julgar: readonly ParCandidato[];
  /**
   * arestas redundantes por fecho transitivo (dag.ts) — podadas DO
   * JULGAMENTO mas MANTIDAS no grafo armazenado COM justificativa (a poda é
   * visão de renderização, §3.4: no track JS da Exercism, 44 de 90 arestas
   * declaradas são redundantes e cada uma tem justificativa própria).
   */
  redundantes: readonly ArestaRedundante[];
  /** quantas perguntas de julgamento a poda evitou (= redundantes.length). */
  evitadas: number;
  /** todos os candidatos após a restrição de distância curta (julgar ∪ redundantes). */
  todos: readonly ParCandidato[];
}

/**
 * Valida (G-TYPE) e deduplica os candidatos do escritor serial: endpoints
 * precisam EXISTIR no grafo (conceito desconhecido = F3Error, nunca aresta
 * órfã), auto-aresta é rejeitada e duplicata é colapsada. Ordenação
 * determinística por (de, para).
 */
function validarEDeduplicar(montagem: MontagemF3, candidatos: readonly ParCandidato[]): ParCandidato[] {
  const vistos = new Set<string>();
  const resultado: ParCandidato[] = [];
  for (const par of candidatos) {
    if (!montagem.porId.has(par.de)) {
      throw new F3Error('CONCEITO_DESCONHECIDO', `candidato referencia conceito desconhecido: "${String(par.de)}"`);
    }
    if (!montagem.porId.has(par.para)) {
      throw new F3Error('CONCEITO_DESCONHECIDO', `candidato referencia conceito desconhecido: "${String(par.para)}"`);
    }
    if (par.de === par.para) {
      throw new F3Error('CANDIDATO_INVALIDO', `candidato é auto-aresta: "${String(par.de)}" → "${String(par.de)}" — a pergunta canônica do §3.4 não se aplica a A=B`);
    }
    const chave = chaveDePar(par);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    resultado.push(par);
  }
  return [...resultado].sort(compararPares);
}

/**
 * DISTÂNCIA CURTA (b): restringe os pares a caminhos de até `raio` saltos no
 * próprio draft. `raio = 1` (default) = o draft como veio do escritor serial
 * (um bom draft JÁ é curto: a redação candidata é de pares vizinhos);
 * `raio ≥ 2` EXPANDE a candidatura para pares por caminho alternativo curto
 * (avô→neto etc.) — a rede de segurança da cobertura (G-COVER), que o juiz
 * paralelo decide. Determinístico (BFS por menor distância, saída ordenada).
 */
export function expandirDistanciaCurta(
  montagem: MontagemF3,
  candidatos: readonly ParCandidato[],
  raio = 1,
): ParCandidato[] {
  const base = validarEDeduplicar(montagem, candidatos);
  if (raio <= 1) return base;

  const saida = new Map<ConceptId, ConceptId[]>();
  for (const id of montagem.porId.keys()) saida.set(id, []);
  for (const par of base) saida.get(par.de)?.push(par.para);

  const resultado = new Map<string, ParCandidato>();
  for (const origem of montagem.porId.keys()) {
    const distancias = new Map<ConceptId, number>([[origem, 0]]);
    const fila: ConceptId[] = [origem];
    while (fila.length > 0) {
      const atual = fila.shift() as ConceptId;
      const dist = distancias.get(atual) ?? 0;
      if (dist >= raio) continue;
      for (const vizinho of saida.get(atual) ?? []) {
        if (distancias.has(vizinho)) continue;
        distancias.set(vizinho, dist + 1);
        fila.push(vizinho);
      }
    }
    for (const [destino, dist] of distancias) {
      if (destino === origem || dist < 1 || dist > raio) continue;
      resultado.set(chaveDePar({ de: origem, para: destino }), { de: origem, para: destino });
    }
  }
  return [...resultado.values()].sort(compararPares);
}

/**
 * CANDIDATURA (b): deduplica/valida → distância curta → PODA por fecho
 * transitivo do P-08 (dag.ts::fechoTransitivoRedundante) ANTES do despacho.
 * O fecho é calculado sobre o DRAFT (grafo temporário com os candidatos como
 * arestas — nada é mutado no grafo da montagem). Reporta `evitadas`: quantas
 * perguntas de julgamento a poda evitou. AS PODADAS continuam no grafo
 * armazenado (visão de renderização) — ver `escreverGrafo`.
 */
export function montarCandidatos(
  montagem: MontagemF3,
  candidatos: readonly ParCandidato[],
  raio = 1,
): CandidatosF3 {
  const todos = expandirDistanciaCurta(montagem, candidatos, raio);

  const draft: ConceptGraph = {
    conceitos: montagem.grafo.conceitos.map((c) => ({ ...c, desbloqueadoPor: [], usa: [] })),
  };
  const porDestino = new Map<ConceptId, ConceptId[]>();
  for (const par of todos) {
    const lista = porDestino.get(par.para) ?? [];
    lista.push(par.de);
    porDestino.set(par.para, lista);
  }
  for (const c of draft.conceitos) {
    const de = porDestino.get(c.id);
    if (de) c.desbloqueadoPor = [...new Set(de)].sort();
  }

  const redundantes = fechoTransitivoRedundante(draft);
  const chavesRedundantes = new Set(redundantes.map((r) => chaveDePar({ de: r.origem, para: r.destino })));
  const julgar = todos.filter((par) => !chavesRedundantes.has(chaveDePar(par)));

  return { julgar, redundantes, evitadas: redundantes.length, todos };
}

// ---------------------------------------------------------------------------
// c · JULGAMENTO — fan-out com semáforo injetável (o ÚNICO paralelismo da F3)
// ---------------------------------------------------------------------------

/** A fatia do orçamento do SNAPSHOT (contexto do juiz) — congelada, nunca o estado vivo. */
export interface FatiaOrcamento {
  receptive: readonly ConceptId[];
  productive: readonly ConceptId[];
}

/** O que o juiz recebe: os DOIS conceitos (fatias congeladas) + a fatia do orçamento. */
export interface ArestaRequest {
  /** o conceito A (origem da aresta A→B) — CONGELADO. */
  de: FatiaDeConceito;
  /** o conceito B (destino; "se o aluno acabou de errar B, erraria A?") — CONGELADO. */
  para: FatiaDeConceito;
  /** fatia do orçamento do snapshot; `null` = orçamento não informado. */
  orcamentoFatia: FatiaOrcamento | null;
}

/**
 * O JUIZ DE ARESTAS — interface INJETADA. Produção:
 * `criarJuizDeArestaLlm` (callLlm + prompts/edgeJudge.ts). Fakes nos testes
 * (puros/offline). UMA chamada por par (MULTI-JUIZ = mais chamadas, ver
 * `julgamentosPorPar`).
 */
export interface JuizDeAresta {
  julgar(req: ArestaRequest): Promise<VotoAresta>;
}

/** Dependências do julgamento (semáforo e política injetáveis). */
export interface DepsJulgamento {
  juiz: JuizDeAresta;
  /** SEM_LLM injetável (runtime/semaphore.ts); default: limite do plano (§4.1). */
  semaforo?: Semaphore;
  /**
   * julgamentos por par: 1 (default — política de voto simples);
   * > 1 = MULTI-JUIZ (maioria estrita com 'não sei' excluído; empate → nada).
   */
  julgamentosPorPar?: number;
}

/** O resultado do julgamento de UM par: os votos + a decisão já aplicada. */
export interface JulgamentoDePar {
  de: ConceptId;
  para: ConceptId;
  votos: readonly VotoAresta[];
  /** `decidirVoto(votos)` — 'sim' confirma a aresta; 'nao' = nada (inclui empate/não-sei). */
  decisao: 'sim' | 'nao';
}

function montarRequest(
  montagem: MontagemF3,
  orcamentoPorPar: ReadonlyMap<string, FatiaOrcamento> | null,
  par: ParCandidato,
): ArestaRequest {
  const de = montagem.porId.get(par.de);
  const para = montagem.porId.get(par.para);
  if (!de || !para) {
    throw new F3Error('CONCEITO_DESCONHECIDO', `candidato referencia conceito fora da montagem: ${String(par.de)} → ${String(par.para)}`);
  }
  const fatia = orcamentoPorPar?.get(chaveDePar(par)) ?? null;
  return Object.freeze({
    de,
    para,
    orcamentoFatia: fatia === null ? null : congelarProfundamente(fatia),
  });
}

/**
 * JULGAMENTO (c): fan-out com semáforo injetável. Cada par vira
 * `julgamentosPorPar` chamadas ao juiz (default 1), cada chamada dentro de
 * UM slot do SEM_LLM (release no finally — timeout nunca segura a onda,
 * mesmo protocolo do callLlm). O juiz recebe APENAS a fatia congelada.
 * Saída ordenada por (de, para) — determinística.
 */
export async function julgarArestas(
  pares: readonly ParCandidato[],
  montagem: MontagemF3,
  orcamentoPorPar: ReadonlyMap<string, FatiaOrcamento> | null,
  deps: DepsJulgamento,
): Promise<JulgamentoDePar[]> {
  const julgamentosPorPar = deps.julgamentosPorPar ?? 1;
  if (!Number.isInteger(julgamentosPorPar) || julgamentosPorPar < 1) {
    throw new F3Error('CONFIGURACAO_INVALIDA', `julgamentosPorPar precisa ser inteiro ≥ 1 (recebido ${julgamentosPorPar})`);
  }
  const semaforo = deps.semaforo ?? createLlmSemaphore();

  const resultados = await Promise.all(
    pares.map(async (par) => {
      const request = montarRequest(montagem, orcamentoPorPar, par);
      const votos: VotoAresta[] = [];
      for (let i = 0; i < julgamentosPorPar; i += 1) {
        const release = await semaforo.acquire();
        try {
          votos.push(await deps.juiz.julgar(request));
        } finally {
          release();
        }
      }
      return { de: par.de, para: par.para, votos, decisao: decidirVoto(votos) };
    }),
  );
  resultados.sort((a, b) => compararPares(a, b));
  return resultados;
}

// ---------------------------------------------------------------------------
// d · REGRA DE VOTO — precisão > cobertura (empate → NENHUMA aresta)
// ---------------------------------------------------------------------------

/**
 * VOTO (d): 1 voto → 'sim' confirma, 'nao'/'nao-sei' não; MULTI-JUIZ →
 * maioria ESTRITA com 'não sei' EXCLUÍDO; 'não sei' NUNCA conta como 'sim';
 * EMPATE (incl. zero votos ou só 'não sei') → 'nao' = NENHUMA aresta.
 * Uma aresta errada corrompe o orçamento de todos os descendentes, em
 * silêncio (§3.4) — por isso o 'nao' é o desfecho padrão. PURO.
 */
export function decidirVoto(votos: readonly VotoAresta[]): 'sim' | 'nao' {
  if (votos.length === 0) return 'nao';
  const relevantes = votos.filter((v) => v !== 'nao-sei');
  const sim = relevantes.filter((v) => v === 'sim').length;
  const nao = relevantes.filter((v) => v === 'nao').length;
  return sim > nao ? 'sim' : 'nao';
}

// ---------------------------------------------------------------------------
// e · ESCRITA DO GRAFO — serial, com a Q-matrix e a visão de renderização
// ---------------------------------------------------------------------------

/**
 * PREMISSA — mapeamento da Q-matrix (`usa[]`, §3.4/§3.5), DOCUMENTADA:
 *
 * O NoAtomico do F2 não carrega lista explícita de "usos" cruzados (o único
 * sinal de avaliação é `evento_de_avaliacao.atomo_alvo`, que por validação do
 * F2 pertence ao introduces do MESMO nó). O mapeamento simples adotado, a
 * partir dos introduces dos nós + do DAG julgado:
 *
 *   `B.usa = desbloqueadoPor(B) ∪ { B }`
 *
 * ou seja, a aula de B exercita (1) as construções que o desafio de B usa
 * para existir — os pré-requisitos CONFIRMADOS (construção introduzida por A
 * que o problema de completar a lacuna de B referencia) — e (2) o PRÓPRIO B:
 * o `atomo_alvo` do nó é introduzido pelo mesmo nó, e exercitar o que se
 * introduz é a linha da própria aula (a I4 permite origem na mesma aula).
 * Espelha o padrão de `trilhaExemplar` em tests/engineGraph.test.ts (a aula
 * usa = pré-requisitos + a si mesma). Derivação ZERO LLM e determinística;
 * o `usa[]` alimenta o orçamento (F4 conta disponibilidade), NUNCA a ordem.
 */
function derivarLinhaDaQMatrix(id: ConceptId, desbloqueadoPor: readonly ConceptId[]): ConceptId[] {
  return [...new Set([...desbloqueadoPor, id])].sort();
}

/** Uma aresta PRESENTE no grafo armazenado, com a justificativa (visão de renderização). */
export interface ArestaComJustificativa {
  de: ConceptId;
  para: ConceptId;
  /** Por que esta aresta está no grafo armazenado. */
  justificativa: string;
  /** verdadeiro = podada do julgamento e mantida por política de renderização (§3.4). */
  redundantePorFechoTransitivo: boolean;
  /** o caminho alternativo que a torna redundante (prova da justificativa) — só quando redundante. */
  caminhoAlternativo?: readonly ConceptId[];
}

/** O grafo ESCRITO + o registro de justificativas (dados para a visão de renderização). */
export interface GrafoEscrito {
  grafo: ConceptGraph;
  justificativas: readonly ArestaComJustificativa[];
}

/**
 * ESCRITA (e): constrói o grafo FINAL — `desbloqueado_por` = confirmadas
 * (voto sim) ∪ redundantes (podadas do julgamento, MANTIDAS — a poda por
 * fecho é visão de renderização, nunca armazenamento, §3.4); `usa[]` pela
 * premissa documentada em `derivarLinhaDaQMatrix`. `justificativas` guarda o
 * porquê de CADA aresta armazenada (caminho alternativo nas redundantes;
 * votos nas confirmadas). PURA — não toca o grafo da montagem.
 */
export function escreverGrafo(
  montagem: MontagemF3,
  julgamentos: readonly JulgamentoDePar[],
  redundantes: readonly ArestaRedundante[],
): GrafoEscrito {
  const confirmadas = julgamentos.filter((j) => j.decisao === 'sim');

  const porDestino = new Map<ConceptId, ConceptId[]>();
  for (const j of confirmadas) {
    const lista = porDestino.get(j.para) ?? [];
    lista.push(j.de);
    porDestino.set(j.para, lista);
  }
  for (const r of redundantes) {
    const lista = porDestino.get(r.destino) ?? [];
    if (!lista.includes(r.origem)) lista.push(r.origem);
    porDestino.set(r.destino, lista);
  }

  const conceitos = montagem.grafo.conceitos.map((c) => {
    const desbloqueadoPor = [...new Set(porDestino.get(c.id) ?? [])].sort();
    return { ...c, desbloqueadoPor, usa: derivarLinhaDaQMatrix(c.id, desbloqueadoPor) };
  });

  const justMap = new Map<string, ArestaComJustificativa>();
  for (const r of redundantes) {
    justMap.set(chaveDePar({ de: r.origem, para: r.destino }), {
      de: r.origem,
      para: r.destino,
      redundantePorFechoTransitivo: true,
      caminhoAlternativo: r.caminho,
      justificativa:
        `redundante por fecho transitivo (caminho alternativo ${r.caminho.join(' → ')}); ` +
        `mantida por política de renderização — a poda é visão, nunca armazenamento (§3.4)`,
    });
  }
  for (const j of confirmadas) {
    justMap.set(chaveDePar({ de: j.de, para: j.para }), {
      de: j.de,
      para: j.para,
      redundantePorFechoTransitivo: false,
      justificativa: `confirmada pelo juiz (voto(s): ${j.votos.join(', ')})`,
    });
  }
  const justificativas = [...justMap.values()].sort(compararPares);

  return { grafo: { conceitos }, justificativas };
}

// ---------------------------------------------------------------------------
// 3 · A VISÃO DE ENSINO — montada CONSUM INDO o orçamento da F4 (nunca re-deriva)
// ---------------------------------------------------------------------------

/** Opções da montagem da visão (extras que NÃO passam pela derivação do F4). */
export interface OpcoesVisaoF3 {
  /**
   * Aulas EXTRA na visão — fora do plano da F3/F4. A I7 (construção
   * introduzida reaparece em ≥3 artefatos POSTERIORES) é insatisfazível para
   * as últimas aulas introduzidas: o F4 exige `introduz ≥ 1` em toda aula
   * (G-MONO), então o fim do currículo PRODUTIVO não tem aulas posteriores.
   * O pipeline de validação inclui a sequência de revisão/fixação aqui.
   */
  aulasExtras?: readonly AulaNaVisao[];
}

/**
 * MONTAGEM DA VISÃO (do ajuste do REPLAN): `{ aulas, construcoesDeEntrada }`
 * a partir do ORÇAMENTO F4 JÁ DERIVADO (`deriveBudgetDoGrafo` — a F3 CONSUME
 * a F4/P-10, nunca re-deriva a matemática do §3.5). Por aula:
 *
 *   - `introduces` = `budget.aula.introduces.productive` (os CONCEITOS que a
 *     aula introduz);
 *   - `usa` = união sobre os introduzidos da linha da Q-matrix de cada
 *     conceito (a premissa de `derivarLinhaDaQMatrix`);
 *   - `orcamentoVigente` = `budget_saida.receptive ∪ budget_saida.productive`
 *     (a regra exata do ajuste; a I10 o consome);
 *   - `familiaSintatica` = a do primeiro conceito introduzido (I8);
 *   - `teoriaExemplos`/`desafios`/`artefatos` = DEFAULTS DERIVADOS (I5: cada
 *     introduzido em exemplo próprio; I6/I10: um desafio exigindo os
 *     introduzidos; I7: um artefato por aula — a cobertura de I7 para a cauda
 *     do currículo é responsabilidade das `aulasExtras`, ver acima).
 *
 * PURA e determinística.
 */
export function montarVisaoDeEnsino(
  grafo: ConceptGraph,
  budget: BudgetF4,
  opcoes: OpcoesVisaoF3 = {},
): VisaoDeEnsino {
  const conceitoPorId = new Map(grafo.conceitos.map((c) => [c.id, c]));
  const aulas: AulaNaVisao[] = budget.aulas.map((aula) => {
    const introduces = [...aula.introduces.productive];
    const usa = new Set<ConceptId>();
    for (const c of introduces) {
      for (const alvo of conceitoPorId.get(c)?.usa ?? []) usa.add(alvo);
      usa.add(c);
    }
    const familiaSintatica = introduces[0] !== undefined
      ? (conceitoPorId.get(introduces[0])?.familiaSintatica ?? null)
      : null;
    return {
      ref: aula.ref,
      familiaSintatica,
      introduces,
      usa: [...usa].sort(),
      teoriaExemplos: introduces.map((c) => [c]),
      desafios: [introduces],
      artefatos: [[...new Set([...introduces, ...usa])].sort()],
      orcamentoVigente: [...new Set([...aula.budget_saida.receptive, ...aula.budget_saida.productive])].sort(),
    };
  });
  aulas.push(...(opcoes.aulasExtras ?? []));
  return {
    aulas,
    construcoesDeEntrada: [...new Set(budget.aulas[0]?.entryConstructs ?? [])].sort(),
  };
}

// ---------------------------------------------------------------------------
// f · VALIDAÇÃO — checkInvariants (P-08) ENTREGA violações, não lança
// ---------------------------------------------------------------------------

/**
 * VALIDAÇÃO (f): roda TODAS as invariantes I1–I11 (graph/invariants.ts, do
 * P-08) sobre o grafo + a visão montada. ENTREGA a lista de violações — NÃO
 * LANÇA: a F3 reporta e o laço/planejador decide (G-DAG/G-TYPE/G-COVER são
 * gates do orquestrador). Sem visão (orçamento não derivável), roda sobre uma
 * visão mínima — I1 (ciclo/ref/dup) continua reportado (fail-closed).
 */
export function validarGrafo(grafo: ConceptGraph, visao: VisaoDeEnsino): ViolacaoEstrutural[] {
  return checkInvariants(grafo, visao);
}

export function validarGrafoSemVisao(grafo: ConceptGraph): ViolacaoEstrutural[] {
  return checkInvariants(grafo, { aulas: [] });
}

// ---------------------------------------------------------------------------
// O JUIZ DE PRODUÇÃO — callLlm + prompts/edgeJudge.ts
// ---------------------------------------------------------------------------

export const F3_ETAPA_JULGAMENTO = 'f3-julgamento-aresta';
export const F3_JULGAMENTO_STAGE_VERSION = 'f3-edge-judge-v1';
export const F3_JULGAMENTO_TIMEOUT_MS = 30_000;

const F3_SYSTEM_JUIZ =
  'Você é o juiz de arestas da fase F3 da engine de trilhas. ' +
  'Você julga UMA aresta dura de pré-requisito por chamada e responde ' +
  'EXCLUSIVAMENTE com o JSON do schema informado (nenhuma prosa, nenhum fence).';

export interface OpcoesJuizDeArestaLlm {
  /** identidade da etapa (invalidação do cache do callLlm). Default: F3_ETAPA_JULGAMENTO. */
  etapa?: string;
  /** versão da lógica da etapa (chave do cache). Default: F3_JULGAMENTO_STAGE_VERSION. */
  stageVersion?: string;
  /** deadline da chamada. Default: F3_JULGAMENTO_TIMEOUT_MS (30 s — julgamento barato). */
  timeoutMs?: number;
}

/**
 * O JUIZ EM PRODUÇÃO: envolve o transporte único (`callLlm`) com o prompt do
 * edgeJudge.ts e o parse FAIL-CLOSED da saída (resposta fora do
 * EdgeVoteSchema ou eco de par errado é erro estruturado do transporte,
 * nunca veredito falso). UMA chamada por julgamento, sempre com
 * stageVersion + timeoutMs obrigatórios (contrato do callLlm).
 */
export function criarJuizDeArestaLlm(llm: EngineLlm, opcoes: OpcoesJuizDeArestaLlm = {}): JuizDeAresta {
  const etapa = opcoes.etapa ?? F3_ETAPA_JULGAMENTO;
  const stageVersion = opcoes.stageVersion ?? F3_JULGAMENTO_STAGE_VERSION;
  const timeoutMs = opcoes.timeoutMs ?? F3_JULGAMENTO_TIMEOUT_MS;
  return {
    async julgar(req: ArestaRequest): Promise<VotoAresta> {
      const resposta = await llm.callLlm(etapa, {
        prompt: promptDeJuizDeAresta({ de: req.de, para: req.para, orcamentoFatia: req.orcamentoFatia }),
        system: F3_SYSTEM_JUIZ,
        schema: EDGE_VOTE_JSON_SCHEMA,
        stageVersion,
        timeoutMs,
      });
      return parseRespostaDeJuiz(resposta.content, { de: req.de.id, para: req.para.id });
    },
  };
}

// ---------------------------------------------------------------------------
// O ORQUESTRADOR — rodarF3 (montagem → candidatos → julgamento → escrita →
// F4 → visão → validação)
// ---------------------------------------------------------------------------

/** O plano de aulas default quem monta a F3 quando o escritor serial não o forneceu. */
function planoPadrao(montagem: MontagemF3): AulaPlano[] {
  return [...montagem.porId.keys()].sort().map((id) => ({ ref: `m1/${id}`, introduz: [id] }));
}

/**
 * A fatia do orçamento do SNAPSHOT por par (contexto do juiz): deriva o
 * orçamento do DRAFT (grafo dos candidatos, com o MESMO plano/axioma da
 * derivação final) e captura `budget_saida` da aula que introduz B. Quando o
 * draft não deriva (ciclo, plano inválido) devolve `null` — documento: o
 * juiz então julga só pelos dois conceitos (o prompt declara "orçamento não
 * informado").
 */
function derivarOrcamentoPorPar(
  montagem: MontagemF3,
  pares: readonly ParCandidato[],
  plano: readonly AulaPlano[],
  entryConstructs: readonly ConceptId[],
  seedsReceptivos: readonly ConceptId[],
): Map<string, FatiaOrcamento> | null {
  if (pares.length === 0) return new Map();
  const draft: ConceptGraph = {
    conceitos: montagem.grafo.conceitos.map((c) => ({ ...c, desbloqueadoPor: [], usa: [] })),
  };
  const porDestino = new Map<ConceptId, ConceptId[]>();
  for (const par of pares) {
    const lista = porDestino.get(par.para) ?? [];
    lista.push(par.de);
    porDestino.set(par.para, lista);
  }
  for (const c of draft.conceitos) {
    const de = porDestino.get(c.id);
    if (de) c.desbloqueadoPor = [...new Set(de)].sort();
  }
  try {
    const { budget } = deriveBudgetDoGrafo({
      grafo: draft,
      aulas: [...plano],
      entryConstructs: [...entryConstructs],
      seedsReceptivos: seedsReceptivos.length > 0 ? [...seedsReceptivos] : undefined,
    });
    const porPar = new Map<string, FatiaOrcamento>();
    for (const par of pares) {
      const aula = budget.aulas.find((a) => a.introduces.productive.includes(par.para));
      if (!aula) continue;
      porPar.set(chaveDePar(par), {
        receptive: [...aula.budget_saida.receptive],
        productive: [...aula.budget_saida.productive],
      });
    }
    return porPar;
  } catch {
    return null; // draft cíclico/plano inválido → sem fatia; não derruba o julgamento
  }
}

/** A ENTRADA da fase F3: tudo que o escritor serial + a configuração entregam. */
export interface EntradaF3 {
  /** os nós atômicos mergeados do F2 (a matéria-prima dos vértices). */
  nos: readonly NoAtomico[];
  /** os pares candidatos de aresta DURA do escritor serial (distância curta). */
  candidatos: readonly ParCandidato[];
  /**
   * o plano de aulas do escritor serial (ref + conceitos que introduz) — a F4
   * o consome. Ausente = default UM conceito por aula (`m1/<conceito>`).
   */
  planoDeAulas?: readonly AulaPlano[];
  /** axioma de entrada da trilha (F0) — passado À F4, nunca re-derivado. */
  entryConstructs?: readonly ConceptId[];
  /** conceitos SÓ-RECEPTIVOS do axioma (política de harness) — repassados à F4. */
  seedsReceptivos?: readonly ConceptId[];
  /** distância curta: caminhos de até `raio` saltos no draft (default 1 = o draft). */
  raio?: number;
  /** o juiz de arestas (produção: criarJuizDeArestaLlm; testes: fake). */
  juiz: JuizDeAresta;
  /** SEM_LLM injetável para o fan-out de julgamento (default do §4.1). */
  semaforo?: Semaphore;
  /** 1 por default; > 1 = MULTI-JUIZ (maioria estrita, 'não sei' excluído). */
  julgamentosPorPar?: number;
  /** aulas extra na VISÃO (revisão/fixação — a F4 não as deriva; a I7 as consome). */
  aulasExtrasNaVisao?: readonly AulaNaVisao[];
}

/** O RELATÓRIO da F3 — o contrato com a próxima fase (F4/F5) e com o laço. */
export interface ResultadoF3 {
  montagem: MontagemF3;
  candidatos: CandidatosF3;
  /** o julgamento de CADA par (votos + decisão) — determinístico. */
  julgamentos: readonly JulgamentoDePar[];
  /** pares confirmados (voto sim) — viram `desbloqueado_por`. */
  confirmadas: readonly ParCandidato[];
  /** pares rejeitados (voto nao — inclui empate e 'não sei') — NENHUMA aresta. */
  rejeitadas: readonly ParCandidato[];
  /** o grafo ESCRITO (desbloqueado_por + usa + redundantes mantidas). */
  grafo: ConceptGraph;
  /** por que cada aresta armazenada está lá (visão de renderização). */
  justificativas: readonly ArestaComJustificativa[];
  /** conceito → papel do nó (P-21: marca nós integrativos). */
  roles: Readonly<Record<string, PapelNo>>;
  /** a topo-sort do grafo final (falha → ciclo com caminho; G-DAG decidirá). */
  ordem: ResultadoToposort;
  /** o orçamento DERIVADO pela F4 (deriveBudgetDoGrafo — consumido, nunca re-derivado). */
  budget: BudgetF4 | null;
  /** quando a F4 não derivou (grafo cíclico/plano inválido) — o motivo, estruturado. */
  falhaDerivacaoBudget: { codigo: string; mensagem: string } | null;
  /** a VisaoDeEnsino montada via F4 (null quando o orçamento não derivou). */
  visao: VisaoDeEnsino | null;
  /** I1–I11 (checkInvariants do P-08) — NÃO lança; o laço/planejador decide. */
  violacoes: readonly ViolacaoEstrutural[];
}

/**
 * RODA a fase F3 de ponta a ponta. Escrita serial (funções puras) + ÚNICO
 * fan-out no julgamento (semáforo injetável). Consome a F4/P-10 para o
 * orçamento e a visão. Nunca lança por defeito do GRAFO (ciclo/violação):
 * tudo vira relatório; parámetros inválidos do CONTRATO (conceito
 * desconhecido, auto-aresta) continuam F3Error (falha de configuração).
 */
export async function rodarF3(entrada: EntradaF3): Promise<ResultadoF3> {
  const montagem = montarGrafoDeNos(entrada.nos);
  const candidatos = montarCandidatos(montagem, entrada.candidatos, entrada.raio ?? 1);

  const plano = entrada.planoDeAulas !== undefined && entrada.planoDeAulas.length > 0
    ? entrada.planoDeAulas
    : planoPadrao(montagem);
  const entryConstructs = entrada.entryConstructs ?? [];
  const seedsReceptivos = entrada.seedsReceptivos ?? [];

  const orcamentoPorPar = derivarOrcamentoPorPar(
    montagem,
    candidatos.todos,
    plano,
    entryConstructs,
    seedsReceptivos,
  );
  const julgamentos = await julgarArestas(candidatos.julgar, montagem, orcamentoPorPar, {
    juiz: entrada.juiz,
    semaforo: entrada.semaforo,
    julgamentosPorPar: entrada.julgamentosPorPar,
  });

  const escrito = escreverGrafo(montagem, julgamentos, candidatos.redundantes);
  const confirmadas = julgamentos.filter((j) => j.decisao === 'sim').map((j) => ({ de: j.de, para: j.para }));
  const rejeitadas = julgamentos.filter((j) => j.decisao === 'nao').map((j) => ({ de: j.de, para: j.para }));
  const ordem = toposort(escrito.grafo);

  let budget: BudgetF4 | null = null;
  let falhaDerivacaoBudget: { codigo: string; mensagem: string } | null = null;
  try {
    const derivado = deriveBudgetDoGrafo({
      grafo: escrito.grafo,
      aulas: [...plano],
      entryConstructs: [...entryConstructs],
      seedsReceptivos: seedsReceptivos.length > 0 ? [...seedsReceptivos] : undefined,
    });
    budget = derivado.budget;
  } catch (erro) {
    falhaDerivacaoBudget = {
      codigo: erro instanceof F4Error ? erro.code : 'DESCONHECIDO',
      mensagem: erro instanceof Error ? erro.message : String(erro),
    };
  }

  const visao = budget
    ? montarVisaoDeEnsino(escrito.grafo, budget, { aulasExtras: entrada.aulasExtrasNaVisao })
    : null;
  const violacoes = visao ? validarGrafo(escrito.grafo, visao) : validarGrafoSemVisao(escrito.grafo);

  return {
    montagem,
    candidatos,
    julgamentos,
    confirmadas,
    rejeitadas,
    grafo: escrito.grafo,
    justificativas: escrito.justificativas,
    roles: montagem.roles,
    ordem,
    budget,
    falhaDerivacaoBudget,
    visao,
    violacoes,
  };
}