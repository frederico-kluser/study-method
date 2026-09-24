/**
 * app/electron/main/engine/auditTypes.ts — os TIPOS do gate de auditoria
 * (`audit.ts`). Extraído do módulo original na refatoração do lote L05 sem
 * NENHUMA mudança de comportamento: os docstrings são os mesmos de antes, e a
 * fachada `audit.ts` re-exporta tudo isto pelos MESMOS nomes.
 */

import type { AtomKey } from './atomKeys';
import type { TrackBudget } from './budget';
import type { RegraDaBarra } from './quality/barra';
import type { ProgressaoRule, Severidade } from './quality/progressao';

/** As regras da bateria de orçamento (`docs/16-engine-de-trilha.md` §5.1). */
export type BudgetRule =
  | 'A1' // starterCode fora do orçamento receptivo de saída
  | 'A2' // solutionCode fora do orçamento produtivo de saída
  | 'A3' // testsCode fora do orçamento receptivo de ENTRADA
  | 'A4' // teoria fora do orçamento receptivo de saída
  | 'A6' // o desafio não exercita nada do que a aula ensinou (direção puxada)
  | 'A11' // cenário de erro exigido sem `throw`/`assert.throws` no orçamento
  | 'DEC'; // construção que quebra a decidibilidade da análise

/** Invariantes de estrutura (`docs/16-engine-de-trilha.md` §5.2). */
export type StructureRule = 'I12' | 'I14' | 'I15' | 'I16' | 'I17';

/**
 * Toda regra que este gate sabe reprovar.
 *
 * `ProgressaoRule` é a bateria A13–A16 (ensino-efetivo, micro-avanço,
 * progressividade, primeira-atividade), javascript-only. `RegraDaBarra` é a
 * barra A17–A23 (teto do passo, primeira aula, declarar-não-é-demonstrar, aula
 * sem prova, carga de novidade, duas formas, regra do par), AGNÓSTICA de
 * linguagem — `quality/barra.ts`.
 */
export type AuditRule = BudgetRule | StructureRule | ProgressaoRule | RegraDaBarra;

/** Superfície do artefato em que a violação foi encontrada. */
export type Surface = 'starterCode' | 'solutionCode' | 'testsCode' | 'statement' | 'theory';

export interface Violation {
  regra: AuditRule;
  /** caminho relativo à raiz da trilha. */
  arquivo: string;
  /** `<moduleSlug>/<lessonSlug>` da aula responsável pelo orçamento. */
  ref: string;
  campo: Surface | 'lesson' | 'module' | 'track';
  linha: number;
  coluna: number;
  construcao: AtomKey | null;
  eixo: string | null;
  faixa: 'receptive' | 'productive' | null;
  trechoOfensor: string;
  /**
   * Aula que introduz a construção, em qualquer ponto da trilha.
   *
   * `null` significa LACUNA DE CURRÍCULO — falta uma aula. Diferente de
   * violação de ORDEM, que se conserta reescrevendo o artefato ou movendo a
   * aula. É a distinção que faz o laço de correção terminar.
   */
  primeiraAulaQueEnsina: string | null;
  mensagem: string;
  /**
   * ADITIVO (rodada 12): `'aviso'` para a bateria A13–A16 nas regras que a
   * spec calibra como aviso até D4 (valores/termos possivelmente explicados em
   * prosa — `AVISO13` — e aula com zero construções novas no A14a). Ausente =
   * erro, o contrato histórico do placar (o placar só conta erros).
   */
  severidade?: Severidade;
}

export interface LessonMetrics {
  ref: string;
  index: number;
  /** construções que esta aula acrescenta ao orçamento. */
  novas: number;
  /**
   * ADITIVO (rodada 12): `Novo(i)` da bateria A14a — demo/introduzido ∖
   * cumulativo ∖ boilerplate.
   *
   * ONDA 10 — AUSENTE SIGNIFICA NÃO MEDIDO, E ANTES SIGNIFICAVA OUTRA COISA.
   * Até `main@26dbc19` este campo caía num fallback (`?? introduces.productive.
   * length`) quando a bateria A13–A16 não rodava. Consequência MEDIDA na única
   * trilha do produto: nas 20 aulas de `python` a 2ª coluna do histograma do
   * CLI saía IDÊNTICA à 1ª — o que se lê como "toda construção declarada é
   * verdadeiramente nova", uma afirmação POSITIVA que ninguém verificou. O
   * fallback saiu: quando a bateria não roda, o campo fica AUSENTE — e
   * `AuditReport.limitacoes` diz por quê, com o id `A13-A16-NAO-RODOU`.
   */
  novosVerdadeiros?: number;
  /** conceitos declarados no `lesson.json`. */
  conceitosDeclarados: number;
  desafios: number;
  violacoes: number;
  /**
   * ADITIVO (2026-09-22): as colunas que a BARRA A17–A23 mede nesta aula — o
   * insumo do histograma que denuncia penhasco em QUALQUER linguagem.
   *
   * Por que num campo só, e não oito campos soltos: são as métricas de UMA
   * bateria, e quem imprime precisa saber se ela mediu. Ausente significa NÃO
   * MEDIDO — nunca "zero": relatório montado à mão num fixture, de antes desta
   * onda, ou auditoria cujo orçamento é `inferred` (ali a barra não roda e
   * `limitacoes` diz por quê — ver `barraValePara`).
   */
  barra?: MetricasDaBarraNaAula;
}

/**
 * O que a barra A17–A23 mede numa aula (`quality/barra.ts` → `MetricaDaBarra`).
 *
 * `produtivasNovas` × `produtivasColapsadas` é a diferença que a REGRA DO PAR
 * faz: a segunda já desconta as derivadas declaradas em `introduces.derived` e
 * PROVADAS por co-ocorrência de linha (A23). Ler só a primeira superestima o
 * passo; ler só a segunda esconde o que foi colapsado.
 */
export interface MetricasDaBarraNaAula {
  /** produtivas novas antes do colapso da regra do par. */
  produtivasNovas: number;
  /** produtivas novas DEPOIS do colapso (o número que A17/A18 medem). */
  produtivasColapsadas: number;
  /** novas totais (produtivas ∪ receptivas) colapsadas (o número de A21). */
  novasTotais: number;
  secoesDeTeoria: number;
  /** blocos de teoria na linguagem da trilha (os que demonstram). */
  blocosDeCodigo: number;
  /** chaves novas sem NENHUMA demonstração nesta aula (A19/A18). */
  chavesSemDemonstracao: number;
  /** chaves produtivas novas com uma forma sintática só (A22, aviso). */
  chavesComUmaFormaSo: number;
  /**
   * quantos GRUPOS de co-ocorrência de linha a aula tem — componentes conexas
   * de "ocorre na mesma linha de um bloco desta aula" sobre as chaves novas.
   * É o piso de aulas em que o conteúdo pode ser QUEBRADO: um grupo nunca se
   * parte. A composição de cada grupo sai em
   * `npm run engine -- barra <slug> --json` (campo `metricas[].grupos`).
   */
  gruposDaRegraDoPar: number;
}

/**
 * Uma CHECAGEM QUE NÃO RODOU, declarada na saída.
 *
 * `CONTRIBUTING.md`: "Cada gate imprime as suas [limitações] no resumo —
 * limitação conhecida é melhor que escondida". `docs/16` §9.2: "Toda limitação
 * (sem chave, sem rede, checagem não executada) é declarada na saída, nunca
 * omitida".
 *
 * ─── A PROVA POR MUTAÇÃO QUE OBRIGOU ISTO (docs/19-auditoria-da-aula.md) ───
 *
 * Apagando TODOS os blocos de código da teoria da aula 1 da trilha `python`, o
 * `audit` continuava reportando `0 violações · 0 avisos · exit 0`. A bateria
 * A13–A16 (ensino-efetivo/micro-avanço/progressividade/primeira-atividade) é
 * javascript-only por decisão BEM ARGUMENTADA (`engine/audit.ts:220-222`,
 * `quality/progressao.ts:432`) — o defeito nunca foi ela não rodar; foi o
 * placar não DIZER que ela não rodou. A linha `avisos (bateria A13-A16) .. 0`
 * lê-se como "está tudo certo" quando significa "não rodou".
 *
 * Esta lista é o canal por onde isso passa a ser dito. Ela é SEMPRE preenchida
 * (nunca `undefined`): um relatório sem limitações declara uma lista vazia, e
 * isso é uma afirmação — "nada deixou de rodar" —, não uma omissão.
 */
export interface LimitacaoDeclarada {
  /** id estável da limitação (`A13-A16-NAO-RODOU`). */
  id: string;
  /** o que NÃO foi executado, em uma linha. */
  checagem: string;
  /** por que não rodou — sempre a causa REAL, com o arquivo que decide. */
  motivo: string;
  /** o que no placar NÃO fala por essa checagem (o zero que não é zero). */
  consequencia: string;
}

/**
 * O PLACAR DA BARRA A17–A23 dentro do relatório do gate (`docs/16` §9.2).
 *
 * Existe porque um total sozinho não diz o que consertar: "20 erros" manda o
 * autor ler 20 achados, e "A17 12 · A18 2 · A19 3 · A21 3" diz que o defeito é
 * TAMANHO DE PASSO em 12 aulas. Medido em 2026-09-22 (o `rust-iniciante` está
 * sendo corrigido em paralelo — o seu número cai; o do curso de referência é o
 * que fica de pé):
 *
 *   npm run engine -- barra rust-iniciante --limite 0
 *   -> 20 erros (A17 12 · A18 2 · A19 3 · A21 3) em 15 aulas · 64 avisos A22
 *   npm run engine -- barra python-iniciante --limite 0
 *   -> 0 erros · 88 avisos · 112 aulas   (o curso de referência; os avisos são
 *      30 de A22 "duas formas" + 58 de A24 "vazamento do quiz por comprimento",
 *      a regra que entrou no catálogo no mesmo dia)
 *
 * O `audit` e a `barra` reportam o MESMO número de erros sobre a mesma trilha
 * — é a igualdade que prova que a fiação não perdeu nem inventou achado:
 *
 *   npm run engine -- audit <slug> --limite 0 --json | ... totals.errosDaBarra
 *   npm run engine -- barra <slug> --limite 0          -> ERROS (A17-A21, A23-A24)
 *
 * `porRegra` traz TODA regra do catálogo, inclusive as que deram zero: aqui o
 * zero é informação, porque a SEÇÃO SÓ EXISTE quando a barra rodou — quando ela
 * não roda (orçamento `inferred`), `AuditReport.barra` fica AUSENTE e
 * `limitacoes` diz por quê. É a mesma disciplina do `avisos` da A13–A16, cujo
 * zero só é informação quando `checagensNaoExecutadas == 0` (§9.2), com a
 * ausência fazendo o trabalho no lugar do zero.
 */
export interface PlacarDaBarra {
  /** uma linha por regra do catálogo A17–A23, na ordem em que reprovam. */
  porRegra: Array<{ regra: RegraDaBarra; erros: number; avisos: number }>;
  erros: number;
  avisos: number;
  aulasComErro: number;
  /** blocos de teoria que o parser recusou — não medido nunca conta como verde. */
  blocosQueNaoParseiam: number;
}

export interface AuditReport {
  trackSlug: string;
  /** de onde veio o orçamento — ver `budget.ts`. */
  budgetSource: TrackBudget['source'];
  violations: Violation[];
  metrics: LessonMetrics[];
  totals: {
    aulas: number;
    desafios: number;
    /**
     * ADITIVO (2026-09-22): desafios de MÓDULO medidos contra o orçamento de
     * saída da última aula do módulo. Separado de `desafios` (que conta os de
     * AULA) para não mudar, em silêncio, o significado de um número que já
     * existia. Ausente ⇒ relatório de antes desta onda, NUNCA "zero desafio de
     * módulo".
     */
    desafiosDeModulo?: number;
    desafiosComViolacao: number;
    violacoes: number;
    /**
     * ADITIVO (rodada 12): avisos da bateria A13–A16 (D4, A14a-zero) — fora do
     * placar de erros.
     *
     * LEIA JUNTO COM `checagensNaoExecutadas`: `avisos: 0` só significa "nenhum
     * aviso" quando `checagensNaoExecutadas === 0`. Com a bateria pulada, este
     * zero significa "não rodou" — ver `AuditReport.limitacoes`.
     */
    avisos?: number;
    /**
     * ADITIVO (onda 10): quantas checagens do gate NÃO foram executadas nesta
     * auditoria (= `limitacoes.length`). É o número que transforma um placar de
     * zeros em uma afirmação verificável: zeros sobre 0 checagens não executadas
     * são zeros medidos; zeros sobre N > 0 não falam pelas N.
     *
     * OPCIONAL pela MESMA razão que `avisos` é: o campo é aditivo e os fixtures
     * de teste que montam um `AuditReport` à mão não o conhecem. Ausente ⇒
     * relatório de antes da onda 10, não "zero checagens não executadas".
     */
    checagensNaoExecutadas?: number;
    lacunasDeCurriculo: number;
    aulasSemConstrucaoNova: number;
    /**
     * ADITIVO (2026-09-22): a parte de `violacoes` e de `avisos` que veio da
     * BARRA A17–A23.
     *
     * Os dois totais de cima continuam sendo os TOTAIS (o contrato do placar
     * não muda: `violacoes` conta todo erro, `avisos` conta todo aviso). Estes
     * dois separam a barra do resto porque, sem eles, `avisos` passaria a somar
     * A13–A16 (D4/A14a-0) com A22 (duas formas) numa linha só e ninguém
     * conseguiria dizer de onde o número veio.
     *
     * OPCIONAIS pela mesma razão que `avisos` é: são aditivos, e os fixtures de
     * teste que montam um `AuditReport` à mão não os conhecem. Ausente ⇒
     * relatório de antes desta onda, NUNCA "zero erro de barra".
     */
    errosDaBarra?: number;
    avisosDaBarra?: number;
  };
  /** defeitos de formato da teoria (não são violações de orçamento). */
  hygiene: TrackBudget['hygiene'];
  parseErrors: TrackBudget['parseErrors'];
  /**
   * AS CHECAGENS QUE NÃO RODARAM, e por quê (`docs/16` §9.2). Sempre presente;
   * lista vazia é a afirmação "nada deixou de rodar", nunca uma omissão.
   */
  limitacoes: LimitacaoDeclarada[];
  /**
   * O placar da barra A17–A23 desta trilha (ADITIVO, 2026-09-22). Presente
   * quando a barra RODOU (orçamento `declared`); ausente quando ela não rodou
   * (orçamento `inferred` — com a entrada `A17-A23-NAO-RODOU-EM-INFERRED` em
   * `limitacoes`) e em relatório montado à mão. No ausente,
   * `linhasDoPlacarDaBarra` devolve `[]` em vez de imprimir zeros que ninguém
   * mediu.
   */
  barra?: PlacarDaBarra;
}
