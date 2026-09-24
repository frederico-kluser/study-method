/**
 * app/electron/main/engine/audit.ts — o GATE que hoje não existe.
 *
 * Problema real: `track:validate` prova FORMA (schema válido, slug íntegro,
 * solução passa, starter falha) e passa verde numa trilha em que 43 dos 136
 * desafios cobram construção que nenhuma aula ensinou. Este arquivo é o gate
 * que faltava: ele confronta cada superfície de cada desafio contra o orçamento
 * cumulativo da aula (`budget.ts`) e devolve toda violação com arquivo, linha,
 * coluna e trecho ofensor.
 *
 * A ASSIMETRIA DAS QUATRO SUPERFÍCIES é a regra mais fácil de errar, e aplicar
 * o mesmo orçamento às quatro é exatamente o que deixa passar o desafio da
 * aula 1:
 *
 *   testsCode                        ⊆ entrada.receptivo   (o aluno LÊ o teste
 *                                                           ANTES de aprender)
 *   starterCode · statement · teoria ⊆ saida.receptivo
 *   solutionCode                     ⊆ saida.produtivo
 *
 * E existe uma quarta verificação, na direção OPOSTA, que é a mais esquecida:
 * o desafio precisa EXERCITAR o que a aula acabou de ensinar. Sem ela o gate
 * aceita uma trilha inteira de desafios que só repetem o que o aluno já sabia.
 *
 * Este módulo NÃO conserta nada e NÃO escreve aula: ele aponta. Quem corrige é
 * o autor-LLM, com o orçamento na mão, no modo `repair` da engine. Um gate que
 * também escreve o conteúdo perde a independência que o torna confiável.
 *
 * PURO/DI: recebe a trilha já carregada, não abre arquivo, não vai à rede, não
 * chama LLM nenhuma — roda sem chave de API.
 *
 * A BARRA PEDAGÓGICA A17–A23 RODA AQUI (2026-09-22), e é o que faz este gate
 * parar de dizer "0 violações" num curso com penhasco. O que estava medido
 * ANTES desta fiação, na trilha que motivou tudo (registro DATADO: o
 * `rust-iniciante` está sendo corrigido em paralelo e o número cai a cada aula
 * quebrada — o que se reproduz hoje é a IGUALDADE das duas medidas, não o 20):
 *
 *   npm run engine -- audit rust-iniciante --limite 0  -> 0 violacoes · 0 avisos · exit 0
 *   npm run engine -- barra rust-iniciante --limite 0  -> 20 erros em 15 aulas · 64 avisos
 *
 * As duas medidas eram sobre O MESMO conteúdo, no mesmo instante. O gate de orçamento (A1–A6,
 * DEC, I12–I17) confere o desafio contra o orçamento CUMULATIVO, e esse
 * orçamento é DECLARADO pela própria aula: `saida = entrada ∪ introduces`
 * (`budget.ts:281`). Declarar 11 construções novas em UMA seção de teoria é,
 * para essa régua, legal — a aula legaliza o seu próprio penhasco. Faltava a
 * régua do TAMANHO DO PASSO e da EXISTÊNCIA DA DEMONSTRAÇÃO, que é
 * `quality/barra.ts`: pura, offline e AGNÓSTICA DE LINGUAGEM (é o que a
 * A13–A16 não pode ser). Ela entra com a MESMA disciplina da A13–A16: os
 * achados são mesclados em `violations`, erro conta no placar, aviso não
 * reprova — e, como a A13–A16, ela tem um ESCOPO declarado. O dela não é a
 * linguagem: é o MODO DO ORÇAMENTO. A barra vale em `declared` e é declarada
 * como limitação em `inferred` (`barraValePara` tem o argumento medido; a
 * entrada é `A17-A23-NAO-RODOU-EM-INFERRED`). As três trilhas do produto
 * declaram `introduces` e auditam em `declared`.
 *
 * SOBREPOSIÇÃO DECLARADA (trilha JavaScript): A13 aceita a demonstração em
 * aula ANTERIOR (∪ A13d), A19 exige demonstração NESTA aula. Nas trilhas de
 * JavaScript as duas baterias rodam e o mesmo defeito pode sair com dois ids —
 * é sobreposição de réguas, declarada aqui, não contagem dupla acidental. Em
 * Python/Rust/C só a barra roda, e é ela que responde pelo passo.
 *
 * Referência: `docs/16-engine-de-trilha.md` §5.1, §5.2 e §5.5.
 */

import type { LoadedTrack } from '../content/trackLoader';
import type { TrackChallengeSource } from '../content/trackTypes';
import { AtomKey, axisOf, humanLabel, isForbiddenAlways } from './atomKeys';
import { LessonBudget, TrackBudget, deriveTrackBudget, DeriveOptions } from './budget';
import { extractAtoms } from './extract';
import { DEFAULT_ADAPTER_ID, type LanguageId } from './lang/registry';
import { collectLessonCode } from './theoryCode';
import {
  REGRAS_DA_BARRA,
  auditarBarra,
  type AchadoDaBarra,
  type RegraDaBarra,
} from './quality/barra';
import {
  auditarProgressao,
  type ProgressaoLessonInput,
  type ProgressaoResult,
  type ProgressaoRule,
  type Severidade,
} from './quality/progressao';

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

/** Superfícies de código de um desafio, já achatando o formato multi-arquivo. */
function challengeSurfaces(challenge: TrackChallengeSource): Array<{ surface: Surface; code: string; label: string }> {
  const out: Array<{ surface: Surface; code: string; label: string }> = [];
  if (Array.isArray(challenge.files) && challenge.files.length > 0) {
    for (const file of challenge.files) {
      out.push({ surface: 'starterCode', code: file.starterCode ?? '', label: `files[${file.path}].starterCode` });
      out.push({ surface: 'solutionCode', code: file.solutionCode ?? '', label: `files[${file.path}].solutionCode` });
    }
  } else {
    out.push({ surface: 'starterCode', code: challenge.starterCode ?? '', label: 'starterCode' });
    out.push({ surface: 'solutionCode', code: challenge.solutionCode ?? '', label: 'solutionCode' });
  }
  out.push({ surface: 'testsCode', code: challenge.testsCode ?? '', label: 'testsCode' });
  return out;
}

/** O orçamento que vale para cada superfície (a assimetria do cabeçalho). */
function allowedFor(
  surface: Surface,
  budget: LessonBudget,
): { set: ReadonlySet<AtomKey>; faixa: 'receptive' | 'productive'; rule: BudgetRule } {
  switch (surface) {
    case 'solutionCode':
      return { set: budget.saida.productive, faixa: 'productive', rule: 'A2' };
    case 'testsCode':
      return { set: budget.entrada.receptive, faixa: 'receptive', rule: 'A3' };
    case 'theory':
      return { set: budget.saida.receptive, faixa: 'receptive', rule: 'A4' };
    default:
      return { set: budget.saida.receptive, faixa: 'receptive', rule: 'A1' };
  }
}

/**
 * O rótulo HUMANO da linguagem para a mensagem de parse (A2), POR LINGUAGEM.
 *
 * A mensagem antiga cravava "JavaScript" — e numa trilha C isso é diagnóstico
 * ENGANOSO: o testsCode da convenção counter_protocol não parseia como C (a
 * macro `SM_TEST` só é declarada pelo harness), o clang é quem reprovou, e
 * dizer "não parseia como JavaScript" manda o autor consertar a linguagem
 * errada. O `PARSE_ERROR` já carrega o adapterId da trilha — a mensagem usa-o
 * em vez de cravar o default.
 *
 * ESCOPO EXATO DO QUE MUDOU, POR LINGUAGEM (revisão da onda 3):
 *
 *   - JavaScript: byte a byte a mensagem de antes ("`testsCode` não parseia
 *     como JavaScript: …") — o default continuou default, e o teste trava o
 *     formato antigo.
 *   - Python e TypeScript: MUDANÇA INTENCIONAL, declarada. A base cravava
 *     "JavaScript" para TODAS as linguagens não-C, e estas duas herdavam o
 *     rótulo errado — o mesmo defeito enganoso do C. Agora leem "não parseia
 *     como Python" / "… como TypeScript": melhoria de diagnóstico, não efeito
 *     incidental (o registro abaixo já mapeava as duas; a função passou a
 *     lê-lo).
 *   - C: o A2 NÃO MONTA FRASE NENHUMA — a mensagem é o próprio DETALHE do
 *     erro, verbatim. Quando o clang reprovou, o detalhe JÁ abre com o
 *     prefixo canônico "clang reprovou o fonte (l:c): …" (no referencial do
 *     testsCode — a ante-sala de `extract.ts` rebaseia) e prefixar de novo
 *     duplicaria o diagnóstico; quando o detalhe NÃO abre com esse prefixo, a
 *     falha é de tooling ("extrator C ausente", "clang ausente", timeout) e
 *     inventar "clang reprovou" mentiria sobre quem falhou.
 */
const ROTULO_DE_LINGUAGEM: Readonly<Record<string, string>> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
};

function mensagemDeParse(label: string, adapterId: LanguageId, erro: { message: string }): string {
  if (adapterId === 'c') {
    // DEDUPE + HONESTIDADE DE ORIGEM (revisão da onda 3): o detalhe do
    // adaptador já diz a origem real — "clang reprovou o fonte (l:c): …"
    // quando o clang reprovou, e a própria causa ("extrator C ausente…",
    // "clang ausente…", timeout) quando a falha é de tooling. O prefixo antigo
    // "clang reprovou o `${label}` da trilha C" DUPLICAVA o diagnóstico do
    // clang e MENTIA na falha de tooling. O A2 de C é então o detalhe
    // verbatim — a superfície segue nos campos `campo` e `trechoOfensor` da
    // violação.
    return erro.message;
  }
  const rotulo = ROTULO_DE_LINGUAGEM[adapterId] ?? adapterId;
  return `\`${label}\` não parseia como ${rotulo}: ${erro.message}`;
}

function messageFor(key: AtomKey, taughtIn: string | null, ref: string, surface: Surface): string {
  const label = humanLabel(key);
  if (taughtIn === null) {
    return `${label} não é ensinado em NENHUMA aula desta trilha — isto é lacuna de currículo, não erro de redação: falta criar a aula atômica que o introduz`;
  }
  if (taughtIn === ref) {
    // O arquivo de teste é a única superfície medida contra o orçamento de
    // ENTRADA, porque o aluno lê o teste ANTES de estudar a aula. Uma
    // construção introduzida por ESTA aula é, para o teste, futuro.
    return surface === 'testsCode'
      ? `${label} é ensinado nesta mesma aula — mas o arquivo de teste é lido ANTES da aula, e por isso só pode usar o orçamento de ENTRADA`
      : `${label} é ensinado nesta mesma aula, e mesmo assim está fora do orçamento desta superfície`;
  }
  return `${label} só é ensinado em \`${taughtIn}\`, que vem DEPOIS de \`${ref}\` — reescreva sem essa construção, ou mova a aula que a ensina para antes`;
}

/**
 * Achata a trilha carregada na entrada da bateria A13–A16. Desafios
 * MULTI-ARQUIVO viram N entradas `files` (com os próprios starter/solution);
 * o arquivo único vira uma entrada `solution.mjs`.
 */
function entradaDeProgressao(track: LoadedTrack): ProgressaoLessonInput[] {
  const out: ProgressaoLessonInput[] = [];
  for (const mod of track.modules) {
    for (const lesson of mod.lessons) {
      const baseDir = `modules/${mod.meta.slug}/lessons/${lesson.meta.slug}`;
      const ref = `${mod.meta.slug}/${lesson.meta.slug}`;
      out.push({
        ref,
        baseDir,
        theory: lesson.meta.theory ?? [],
        declared: (lesson.meta as { introduces?: unknown }).introduces as ProgressaoLessonInput['declared'],
        challenges: lesson.challenges.map((challenge) => {
          const desafioFile = `${baseDir}/challenges/${challenge.slug}/challenge.json`;
          const files =
            Array.isArray(challenge.files) && challenge.files.length > 0
              ? challenge.files.map((f) => ({ path: f.path, starter: f.starterCode ?? '', solution: f.solutionCode ?? '' }))
              : [{ path: 'solution.mjs', starter: challenge.starterCode ?? '', solution: challenge.solutionCode ?? '' }];
          return { slug: challenge.slug, desafioFile, files, tests: challenge.testsCode ?? '' };
        }),
      });
    }
  }
  return out;
}

/**
 * A bateria A13–A16 vale para esta linguagem?
 *
 * É a MESMA pergunta que `quality/progressao.ts` responde com uma exceção
 * (`exigirAdaptadorJavascript`) — feita aqui ANTES de chamar, para que a
 * auditoria de uma trilha de outra linguagem perca a bateria em vez de perder
 * a auditoria inteira. Não afrouxa nada: a bateria continua javascript-only, e
 * chamá-la com outra linguagem continua LANÇANDO.
 */
function bateriaDeProgressaoValePara(adapterId: LanguageId): boolean {
  return adapterId === DEFAULT_ADAPTER_ID;
}

/**
 * A BARRA A17–A23 vale para este ORÇAMENTO?
 *
 * Vale em `declared`, e NÃO vale em `inferred` — e a razão é a mesma classe de
 * razão que faz a bateria A13–A16 ser javascript-only: rodá-la no modo errado
 * não daria erro, daria VEREDITO ERRADO E SILENCIOSO. Medido em 2026-09-22:
 *
 *   1. A19 ("declarar não é demonstrar") é VAZIA por construção em `inferred`:
 *      ali o conjunto de chaves novas SAI dos blocos de teoria da própria aula
 *      (`budget.ts:253-278`), então toda chave nova está, por definição,
 *      demonstrada. A regra nunca dispararia — e quem lê o placar concluiria
 *      "toda declaração tem demonstração".
 *   2. A23 (a regra do par) é INDECLARÁVEL em `inferred`: declarar
 *      `introduces.derived` na aula faz `deriveTrackBudget` mudar o modo para
 *      `declared` (`budget.ts:225` — `anyDeclared` testa a PRESENÇA do campo
 *      `introduces`, não o seu conteúdo). Sem o colapso da regra do par,
 *      A17/A18/A21 contam chave por chave.
 *   3. E contar chave por chave reprova TUDO, sem reescrita que aprove: UMA
 *      linha de JavaScript introduz 4 construções fora do axioma estrutural —
 *      `const tipo = typeof 10;` → `decl:const`, `node:NumericLiteral`,
 *      `node:TypeOfExpression`, `op:unary:typeof` (reproduz com
 *      `extractAtoms` + `structuralAlwaysAllowed('javascript')`). O teto da
 *      aula 1 (A18) é 1: nenhuma aula 1 de trilha inferida passaria, nem a
 *      perfeita.
 *
 * As TRÊS trilhas do produto declaram `introduces` e auditam em `declared` (é o
 * que o contrato A5/A7 exige do autor), então a barra roda onde ela mede
 * conteúdo de verdade: `npm run engine -- audit python-iniciante --limite 0
 * --json` → `budgetSource: "declared"`, `totals.errosDaBarra: 0`. Quem quiser a
 * barra numa trilha sem declaração força o modo: `--modo declared`.
 */
function barraValePara(source: TrackBudget['source']): boolean {
  return source === 'declared';
}

function severidadeDe(v: Violation): 'erro' | 'aviso' {
  return v.severidade ?? 'erro';
}

/**
 * A SUPERFÍCIE de um achado da barra, por regra — tabela explícita, sem
 * adivinhação.
 *
 * A barra mede a AULA (o `lesson.json`), não um desafio: `campo` diz em qual
 * parte do arquivo está a evidência, e é o que o CLI imprime antes da linha:coluna.
 *
 *   A19, A22            → `theory`  (o que falta é DEMONSTRAÇÃO em bloco de código)
 *   A18 com chave       → `theory`  (a mesma falta, na aula 1: "o aluno só copia")
 *   A17, A18, A20, A21, → `lesson`  (o que está errado é o `introduces`, o
 *   A23                             `theory[]` como um todo ou o `challenges[]`)
 */
function campoDoAchadoDaBarra(achado: AchadoDaBarra): Surface | 'lesson' {
  if (achado.regra === 'A19' || achado.regra === 'A22') return 'theory';
  if (achado.regra === 'A18' && achado.chave !== null) return 'theory';
  return 'lesson';
}

/**
 * A TRADUÇÃO `AchadoDaBarra` → `Violation`, campo por campo, sem inventar campo
 * nenhum. Escrita explícita (e não por spread) porque os dois formatos NÃO são
 * o mesmo objeto: a barra fala de aula e ação prescrita, a violação fala de
 * arquivo, ponto no arquivo e origem da construção.
 *
 *   regra                 ← achado.regra (A17…A23; ids estáveis do catálogo)
 *   arquivo               ← o `lesson.json` da aula (a barra dá a `ref`)
 *   ref, construcao       ← achado.ref, achado.chave
 *   campo                 ← `campoDoAchadoDaBarra` (tabela acima)
 *   linha, coluna         ← 1:1 — A BARRA NÃO MEDE PONTO NO ARQUIVO. Ela mede a
 *                           aula inteira (quantas construções novas, quantas
 *                           seções, se existe desafio), e 1:1 é a MESMA
 *                           convenção que os estruturais I12/I14/I15/I16 já
 *                           usam para o defeito que é do arquivo, não de um
 *                           trecho dele. Cravar a linha de um bloco daria uma
 *                           precisão falsa.
 *   eixo                  ← `axisOf(chave)` quando há chave
 *   faixa                 ← `null` SEMPRE: a barra não confronta superfície
 *                           contra faixa de orçamento (é o que A1–A4 fazem);
 *                           ela mede o TAMANHO DO PASSO. Dizer `productive`
 *                           aqui misturaria o achado da barra com o agrupamento
 *                           por faixa do relatório (§9.2) e mentiria sobre a
 *                           régua que reprovou.
 *   trechoOfensor         ← achado.evidencia (a evidência vem ANTES do veredito,
 *                           §6.3 — é o que o disco mostra)
 *   primeiraAulaQueEnsina ← `firstTaughtIn` da chave, com a PRÓPRIA aula como
 *                           piso. NUNCA `null` quando há chave: `null` significa
 *                           LACUNA DE CURRÍCULO no placar
 *                           (`totals.lacunasDeCurriculo` — "nenhuma aula ensina
 *                           isto, falta criar a aula"), e toda chave de achado
 *                           da barra está declarada no `introduces` DESTA aula,
 *                           por construção (A19/A18/A22 percorrem as novas da
 *                           aula; A23, as derivadas declaradas). O piso é
 *                           necessário e foi MEDIDO: `budget.ts:290` só registra
 *                           `firstTaughtIn` a partir de `introduces.productive`,
 *                           então uma chave nova só RECEPTIVA não está no mapa —
 *                           sem o piso, o `audit` do `rust-iniciante` passava a
 *                           reportar 1 lacuna de currículo que não existe
 *                           (`npm run engine -- audit rust-iniciante --limite 0
 *                           --json` → `totals.lacunasDeCurriculo`: 1 com `null`,
 *                           0 com o piso). Com `chave` nula (A17/A20/A21 e o
 *                           A18 do teto) o campo é `null`, que é a MESMA
 *                           convenção dos estruturais I12/I14/I15/I16/I17 —
 *                           sem construção não existe aula que a ensine, e
 *                           `totals.lacunasDeCurriculo` não conta esses casos
 *                           (ele exige `construcao !== null`). Atenção ao
 *                           imprimir: a saída humana do CLI rotula
 *                           `primeiraAulaQueEnsina === null` como "LACUNA DE
 *                           CURRICULO" (`cli.ts`, na linha do achado), e esse
 *                           rótulo já era impreciso para os estruturais —
 *                           passa a ser também para a barra.
 *   mensagem              ← achado.mensagem + a AÇÃO PRESCRITA do catálogo
 *                           fechado (§6.7). A ação não tem campo em `Violation`,
 *                           e perdê-la seria perder a única parte do achado que
 *                           diz o que FAZER — então ela entra na frase, nomeada.
 *   severidade            ← achado.severidade (A22 é aviso; o resto é erro)
 */
function violacaoDaBarra(
  achado: AchadoDaBarra,
  lessonDir: string,
  firstTaughtIn: ReadonlyMap<AtomKey, string>,
): Violation {
  return {
    regra: achado.regra,
    arquivo: `${lessonDir}/lesson.json`,
    ref: achado.ref,
    campo: campoDoAchadoDaBarra(achado),
    linha: 1,
    coluna: 1,
    construcao: achado.chave,
    eixo: achado.chave === null ? null : axisOf(achado.chave),
    faixa: null,
    trechoOfensor: achado.evidencia,
    primeiraAulaQueEnsina: achado.chave === null ? null : firstTaughtIn.get(achado.chave) ?? achado.ref,
    mensagem: `${achado.mensagem} — acao prescrita: ${achado.acao}`,
    severidade: achado.severidade,
  };
}

/**
 * Audita uma trilha inteira contra o orçamento cumulativo.
 *
 * Determinístico e offline. Roda em qualquer máquina, sem chave, e é o teste de
 * aceitação da engine: se ele não reprovar o conteúdo que sabidamente está
 * quebrado, a engine não está funcionando.
 *
 * A bateria A13–A16 roda junto (rodada 12): ensino-efetivo, micro-avanço,
 * progressividade e primeira-atividade — no MESMO modo/orçamento do resto do
 * gate (`budget.source`), com as mensagens e contadores por aula da spec.
 */
export function auditTrack(track: LoadedTrack, options: DeriveOptions = {}): AuditReport {
  const budget = deriveTrackBudget(track, options);
  // O ADAPTADOR DA TRILHA, resolvido uma vez pelo orçamento (§6 linhas
  // 918-940). É ele que decide qual bloco de teoria entra no gate, com que
  // parser cada superfície é lida e quais construções quebram a decidibilidade
  // NESTA linguagem.
  const adapterId = budget.adapterId;
  const violations: Violation[] = [];
  const metrics: LessonMetrics[] = [];

  let desafios = 0;
  /**
   * Desafios de MÓDULO medidos contra o orçamento (bloco no fim desta função).
   * Contador SEPARADO de `desafios` de propósito: `totals.desafios` significa
   * "desafios de aula" desde a primeira rodada e mudar o significado dele faria
   * todo número histórico do placar passar a medir coisa diferente sem aviso.
   */
  let desafiosDeModulo = 0;
  const desafiosComViolacao = new Set<string>();

  // ── bateria A13–A16 ──────────────────────────────────────────────────────
  // PURO, roda em memória; as violações são mescladas no loop por aula abaixo
  // (mesmo padrão dos estruturais), e as de desafio alimentam o
  // `desafiosComViolacao` com o MESMO critério dos erros (aviso não reprova).
  //
  // ONDA 7 — ELA NÃO VALE PARA TODA LINGUAGEM, E POR ISSO É CONDICIONAL.
  // `quality/progressao.ts:432` LANÇA `EngineLinguagemError` para qualquer
  // adaptador que não seja o default, e a razão está escrita lá: `H13`/`AX` são
  // tabelas de chaves do `ts.SyntaxKind` e do runner `node:test`, e os spans
  // mecânicos S13 saem de `ts.createSourceFile`. Rodar essa bateria numa trilha
  // de Python não daria erro — daria um veredito ERRADO E SILENCIOSO (tudo
  // "não demonstrado", todo desafio reprovado).
  //
  // Até a onda 6 esta chamada era incondicional, e a consequência era pior que
  // o veredito errado: `auditTrack` de uma trilha de Python ou de TypeScript
  // MORRIA com a exceção, e nenhuma das outras 20 regras (A1–A6, DEC, I12–I17)
  // chegava a rodar — regras que são agnósticas de linguagem por construção. O
  // gate de ORÇAMENTO não depende da bateria; a bateria é aditiva. Quando ela
  // não vale para a linguagem da trilha, ela é PULADA e o resto audita.
  //
  // A guarda é o mesmo id que a própria bateria aceita — uma linguagem entra
  // aqui no dia em que `quality/progressao.ts` deixar de reprová-la, sem tocar
  // neste arquivo.
  const bateriaRodou = bateriaDeProgressaoValePara(budget.adapterId);
  const progressao: ProgressaoResult = bateriaRodou
    ? auditarProgressao(entradaDeProgressao(track), {
        mode: budget.source,
        adapterId: budget.adapterId,
      })
    : { violations: [], novosPorAula: new Map<string, number>() };

  // ── barra pedagógica A17–A23 (`quality/barra.ts`) ────────────────────────
  // AGNÓSTICA DE LINGUAGEM: roda em trilha de Python, Rust, C ou JavaScript sem
  // distinção. É a diferença que ela tem em relação à A13–A16 e a razão de ela
  // existir — o penhasco da aula 1 do `rust-iniciante` (11 construções novas
  // numa seção de teoria, para um aluno "zero absoluto") saía deste gate com 0
  // violações porque a única régua de PASSO que o gate tinha era
  // javascript-only.
  //
  // SEM try/catch, de propósito: a barra recebe a MESMA trilha e re-deriva o
  // MESMO orçamento que `deriveTrackBudget` acabou de derivar com sucesso, e o
  // resto dela é aritmética de conjuntos e contagem de seções. Um lançamento
  // aqui é BUG do gate, não indisponibilidade de ambiente — e bug de gate tem
  // de ser ALTO. Engolir isso numa "limitação declarada" é exatamente a
  // aprovação por omissão que o §9.3 proíbe.
  //
  // `modo: budget.source` passa o modo JÁ RESOLVIDO: `options.mode` pode vir
  // ausente (e aí quem escolhe declared/inferred é a trilha), e as duas réguas
  // têm de medir UM orçamento, nunca dois.
  //
  // ELA VALE NO MODO `declared`, E O MODO `inferred` É DECLARADO COMO LIMITAÇÃO
  // (`barraValePara` abaixo tem o argumento inteiro, medido).
  const barraRodou = barraValePara(budget.source);
  const barra = barraRodou ? auditarBarra(track, { modo: budget.source }) : null;
  const barraPorRef = new Map<string, AchadoDaBarra[]>();
  for (const achado of barra?.achados ?? []) {
    const lista = barraPorRef.get(achado.ref) ?? [];
    lista.push(achado);
    barraPorRef.set(achado.ref, lista);
  }
  const metricaDaBarraPorRef = new Map((barra?.metricas ?? []).map((m) => [m.ref, m]));

  // ONDA 10 — O PLACAR PASSA A DIZER O QUE NÃO RODOU (ver `LimitacaoDeclarada`).
  // A bateria continua javascript-only; o que muda é que a saída para de deixar
  // o leitor concluir "0 avisos ⇒ está tudo certo" quando o certo é "não medido".
  const limitacoes: LimitacaoDeclarada[] = [];
  if (!bateriaRodou) {
    limitacoes.push(
        {
          id: 'A13-A16-NAO-RODOU',
          checagem:
            'bateria A13–A16 (A13 ensino-efetivo, A13d, A14a micro-avanço, A14b, A15a/A15b ' +
            'progressividade, A16 primeira-atividade) — as partes que dependem de `ts.SyntaxKind`, ' +
            'das tabelas H13/AX do runner `node:test` e dos spans mecânicos S13',
          motivo:
            `a trilha é \`${budget.adapterId}\` e a bateria é javascript-only: ` +
            '`quality/progressao.ts:432` LANÇA `EngineLinguagemError` para adaptador não-default ' +
            'porque `H13`/`AX` são tabelas de chaves do `ts.SyntaxKind` e do runner `node:test`, e os ' +
            'spans mecânicos S13 saem de `ts.createSourceFile`. Rodá-la aqui não daria erro: daria ' +
            'veredito ERRADO E SILENCIOSO (tudo "não demonstrado", todo desafio reprovado).',
          consequencia:
            // ESTE TEXTO MUDOU EM 2026-09-22, E A HISTÓRIA FICOU. Até aqui ele dizia que o
            // contador `avisos` não falava por nada e citava a prova por mutação ("apagar todos
            // os blocos de código da teoria da aula 1 não muda o placar"). A prova ERA verdadeira
            // e deixou de ser: a barra A17–A23 roda nesta trilha e A19/A18 reprovam exatamente
            // essa mutação. Uma limitação que continuasse afirmando isso seria o mesmo defeito
            // que ela nasceu para consertar — o placar dizendo o que não é.
            (barraRodou
              ? 'A BARRA A17–A23 (`quality/barra.ts`) COBRE PARTE DESTE BURACO NESTA TRILHA, porque é ' +
                'agnóstica de linguagem e RODOU aqui: teto do passo (A17, ≤2 produtivas novas ' +
                'colapsadas), primeira aula do curso (A18), declarar-não-é-demonstrar (A19), aula sem ' +
                'prova (A20), carga de novidade e seções que a sustentem (A21), duas formas (A22, ' +
                'aviso) e a regra do par medida no disco (A23). Por isso a PROVA POR MUTAÇÃO que esta ' +
                'entrada citava (docs/19: "apagar TODOS os blocos de código da teoria da aula 1 não ' +
                'muda o placar — 0 violações · 0 avisos · exit 0") JÁ NÃO VALE: A19/A18 reprovam ' +
                'exatamente isso, e `totals.violacoes`/`totals.errosDaBarra` mudam. '
              : 'E A BARRA A17–A23 TAMBÉM NÃO RODOU nesta auditoria (o orçamento é `inferred` — ver a ' +
                'entrada `A17-A23-NAO-RODOU-EM-INFERRED`), então NADA nesta auditoria mede o TAMANHO ' +
                'DO PASSO: a PROVA POR MUTAÇÃO que esta entrada cita (docs/19: "apagar TODOS os blocos ' +
                'de código da teoria da aula 1 não muda o placar") CONTINUA VALENDO aqui. ') +
            'O QUE CONTINUA NÃO MEDIDO nesta trilha, porque a barra NÃO cobre: A14b (≤1 construção ' +
            'nova por LINHA do solutionCode — a lacuna única); A15a/A15b (progressividade ' +
            'intra-aula entre os desafios e inter-aula, o reuso obrigatório do que veio antes); ' +
            'A16b (a primeira atividade resolvível com a PRIMEIRA SEÇÃO da teoria — a barra CONTA ' +
            'seções, não mede a seção 1); e os spans mecânicos S13 do arquivo de teste (import ' +
            'inteiro, assinatura) com as tabelas H13/AX do runner. ' +
            'NO PLACAR: o contador `avisos` soma as duas baterias, e a parte A13–A16 dele continua ' +
            'significando "não rodou", não "sem aviso" — `totals.avisosDaBarra` é a parte que FOI ' +
            'medida (A22); `metrics[].novosVerdadeiros` (a 2ª coluna do histograma, ' +
            '"verdadeiramente novas") continua AUSENTE em todas as aulas, e é `metrics[].barra` ' +
            'que traz as colunas medidas para esta trilha.',
        },
    );
  }
  // A BARRA A17–A23 no modo `inferred` — o argumento inteiro está em
  // `barraValePara`. O que esta entrada faz é o que o §9.2 exige: dizer que a
  // checagem não rodou, por quê, e QUAL comando a faz rodar.
  if (!barraRodou) {
    limitacoes.push({
      id: 'A17-A23-NAO-RODOU-EM-INFERRED',
      checagem:
        'barra pedagógica A17–A23 (A17 teto do passo, A18 primeira aula, A19 declarar-não-é-' +
        'demonstrar, A20 aula sem prova, A21 carga de novidade, A22 duas formas, A23 regra do par, ' +
        'A24 vazamento do quiz por comprimento)',
      motivo:
        `o orçamento desta auditoria é \`${budget.source}\`: nenhuma aula declara \`introduces\` e o ` +
        'que a aula "introduz" é DERIVADO da própria teoria (`budget.ts:253-278`). Nesse modo a barra ' +
        'mediria ARTEFATO DA INFERÊNCIA e não o passo — (a) A19 é VAZIA por construção, porque as ' +
        'chaves novas SAEM dos blocos de teoria da aula; (b) A23 é INDECLARÁVEL, porque declarar ' +
        '`introduces.derived` muda o modo para `declared` (`budget.ts:225`: `anyDeclared` testa a ' +
        'PRESENÇA do campo `introduces`); (c) sem o colapso da regra do par, A17/A18/A21 contam chave ' +
        'por chave, e UMA linha de JavaScript introduz 4 construções fora do axioma estrutural ' +
        '(`const tipo = typeof 10;` → `decl:const`, `node:NumericLiteral`, `node:TypeOfExpression`, ' +
        '`op:unary:typeof`), de modo que NENHUMA aula 1 passaria no teto de 1 do A18 — nem a ' +
        'perfeita. Rodar assim não daria erro: daria veredito ERRADO E SILENCIOSO.',
      consequencia:
        'nada em `violations` fala pelo TAMANHO DO PASSO nem pela EXISTÊNCIA DA DEMONSTRAÇÃO nesta ' +
        'auditoria: `totals.errosDaBarra`, `totals.avisosDaBarra`, `AuditReport.barra` e ' +
        '`metrics[].barra` ficam AUSENTES (ausente = NÃO MEDIDO, nunca zero) e ' +
        '`linhasDoPlacarDaBarra` devolve []. PARA MEDIR: declare `introduces` nas aulas (o contrato ' +
        'A5/A7 já exige isso do autor) — ou force o modo: `npm run engine -- audit <slug> --limite 0 ' +
        '--modo declared`, `npm run engine -- barra <slug> --limite 0 --modo declared`. Nas três ' +
        'trilhas do produto o orçamento é DECLARADO e a barra roda: `npm run engine -- audit ' +
        'python-iniciante --limite 0 --json` → `budgetSource: "declared"`, `totals.errosDaBarra: 0`, ' +
        '`totals.avisosDaBarra: 88` (30 de A22 + 58 de A24 — medido em 2026-09-22).',
    });
  }
  const progressaoPorRef = new Map<string, ReturnType<typeof auditarProgressao>['violations']>();
  for (const pv of progressao.violations) {
    const lista = progressaoPorRef.get(pv.ref) ?? [];
    lista.push(pv);
    progressaoPorRef.set(pv.ref, lista);
  }
  const desafiosProgressao = new Set<string>();
  for (const pv of progressao.violations) {
    if (pv.desafioFile && pv.severidade === 'erro') desafiosProgressao.add(pv.desafioFile);
  }

  // ── invariantes de estrutura que o loader não cobre ───────────────────────
  const slugSeen = new Map<string, string>();
  const orderSeen = new Map<number, string>();
  for (const mod of track.modules) {
    const prevOrder = orderSeen.get(mod.meta.order);
    if (prevOrder !== undefined) {
      violations.push({
        regra: 'I14',
        arquivo: `modules/${mod.meta.slug}/module.json`,
        ref: mod.meta.slug,
        campo: 'module',
        linha: 1,
        coluna: 1,
        construcao: null,
        eixo: null,
        faixa: null,
        trechoOfensor: `order: ${mod.meta.order}`,
        primeiraAulaQueEnsina: null,
        mensagem: `\`order\` ${mod.meta.order} está duplicado com o módulo \`${prevOrder}\` — a ordem pedagógica fica indefinida e o orçamento cumulativo passa a depender da ordem do disco`,
      });
    } else {
      orderSeen.set(mod.meta.order, mod.meta.slug);
    }

    for (const lesson of mod.lessons) {
      const prev = slugSeen.get(lesson.meta.slug);
      if (prev !== undefined) {
        violations.push({
          regra: 'I12',
          arquivo: `modules/${mod.meta.slug}/lessons/${lesson.meta.slug}/lesson.json`,
          ref: `${mod.meta.slug}/${lesson.meta.slug}`,
          campo: 'lesson',
          linha: 1,
          coluna: 1,
          construcao: null,
          eixo: null,
          faixa: null,
          trechoOfensor: lesson.meta.slug,
          primeiraAulaQueEnsina: null,
          mensagem: `slug de aula duplicado (também existe em \`${prev}\`) — o slug é chave GLOBAL de progresso do aluno: as duas aulas compartilhariam o registro de conclusão`,
        });
      } else {
        slugSeen.set(lesson.meta.slug, `${mod.meta.slug}/${lesson.meta.slug}`);
      }

      const idsSeen = new Set<string>();
      for (const section of lesson.meta.theory ?? []) {
        if (idsSeen.has(section.id)) {
          violations.push({
            regra: 'I15',
            arquivo: `modules/${mod.meta.slug}/lessons/${lesson.meta.slug}/lesson.json`,
            ref: `${mod.meta.slug}/${lesson.meta.slug}`,
            campo: 'theory',
            linha: 1,
            coluna: 1,
            construcao: null,
            eixo: null,
            faixa: null,
            trechoOfensor: section.id,
            primeiraAulaQueEnsina: null,
            mensagem: `\`theory[].id\` duplicado (\`${section.id}\`) — a segunda seção com esse id nunca é apresentada e a aula "termina" mais cedo`,
          });
        }
        idsSeen.add(section.id);
      }
    }
  }

  // ── orçamento, aula por aula ──────────────────────────────────────────────
  for (const lessonBudget of budget.lessons) {
    const mod = track.modules.find((m) => m.meta.slug === lessonBudget.moduleSlug);
    const lesson = mod?.lessons.find((l) => l.meta.slug === lessonBudget.lessonSlug);
    if (!mod || !lesson) continue;

    const lessonDir = `modules/${mod.meta.slug}/lessons/${lesson.meta.slug}`;
    let violacoesDaAula = 0;

    const push = (v: Violation): void => {
      violations.push(v);
      if (severidadeDe(v) === 'erro') violacoesDaAula += 1;
    };

    // A13–A16 desta aula — mescladas aqui (mesmo padrão dos estruturais), para
    // o `metrics.violacoes` e o placar contarem a bateria nova como as demais.
    for (const pv of progressaoPorRef.get(lessonBudget.ref) ?? []) {
      push({
        regra: pv.regra,
        arquivo: pv.arquivo,
        ref: pv.ref,
        campo: pv.campo,
        linha: pv.linha,
        coluna: pv.coluna,
        construcao: pv.construcao,
        eixo: pv.eixo,
        faixa: pv.faixa,
        trechoOfensor: pv.trechoOfensor,
        primeiraAulaQueEnsina: pv.primeiraAulaQueEnsina,
        mensagem: pv.mensagem,
        severidade: pv.severidade,
      });
    }

    // A barra A17–A23 desta aula — MESMA disciplina da A13–A16: o achado entra
    // em `violations`, erro conta em `violacoesDaAula` e no placar, aviso (A22)
    // não reprova.
    //
    // NÃO alimenta `desafiosComViolacao`: o achado da barra é da AULA, e
    // `desafiosComViolacao / desafios` é a razão que mede DESAFIO — A20 ("aula
    // sem desafio é aula sem prova") é justamente o caso em que não existe
    // desafio a marcar. O que a barra move é `totals.violacoes`,
    // `totals.errosDaBarra` e `metrics[].violacoes`.
    for (const achado of barraPorRef.get(lessonBudget.ref) ?? []) {
      push(violacaoDaBarra(achado, lessonDir, budget.firstTaughtIn));
    }

    // A4 — a teoria também está sujeita ao orçamento de saída.
    const theory = collectLessonCode(lesson.meta.theory ?? []);
    if (budget.source === 'declared') {
      for (const block of theory.blocks) {
        // Só a teoria NA LINGUAGEM QUE A TRILHA ENSINA entra no gate de A4.
        // Era `if (!block.isJavaScript) continue;` — a pergunta certa é sobre o
        // adaptador DA TRILHA, não sobre uma linguagem cravada no código.
        if (block.adapterId !== adapterId) continue;
        const result = extractAtoms(block.code, {
          fileName: `${lessonDir}/lesson.json#theory`,
          language: adapterId,
        });
        if (!result.ok) continue;
        for (const occ of result.occurrences) {
          if (lessonBudget.saida.receptive.has(occ.key)) continue;
          const taughtIn = budget.firstTaughtIn.get(occ.key) ?? null;
          push({
            regra: 'A4',
            arquivo: `${lessonDir}/lesson.json`,
            ref: lessonBudget.ref,
            campo: 'theory',
            linha: block.line + occ.line - 1,
            coluna: occ.column,
            construcao: occ.key,
            eixo: axisOf(occ.key),
            faixa: 'receptive',
            trechoOfensor: occ.snippet,
            primeiraAulaQueEnsina: taughtIn,
            mensagem: messageFor(occ.key, taughtIn, lessonBudget.ref, 'theory'),
          });
        }
      }
    }

    for (const challenge of lesson.challenges) {
      desafios += 1;
      const challengeFile = `${lessonDir}/challenges/${challenge.slug}/challenge.json`;
      const before = violations.length;

      // I16 — o conceito do desafio existe na aula?
      if (!lesson.meta.concepts.includes(challenge.concept)) {
        push({
          regra: 'I16',
          arquivo: challengeFile,
          ref: lessonBudget.ref,
          campo: 'lesson',
          linha: 1,
          coluna: 1,
          construcao: null,
          eixo: null,
          faixa: null,
          trechoOfensor: challenge.concept,
          primeiraAulaQueEnsina: null,
          mensagem: `o desafio exercita o conceito \`${challenge.concept}\`, que a aula não declara em \`concepts\` — conceito sem aula dona não entra em nenhum orçamento`,
        });
      }

      // I17 — arquivo do aluno com nome reservado pelo runner.
      for (const file of challenge.files ?? []) {
        if (file.path === 'test.mjs' || file.path === 'package.json') {
          push({
            regra: 'I17',
            arquivo: challengeFile,
            ref: lessonBudget.ref,
            campo: 'starterCode',
            linha: 1,
            coluna: 1,
            construcao: null,
            eixo: null,
            faixa: null,
            trechoOfensor: file.path,
            primeiraAulaQueEnsina: null,
            mensagem: `\`files[].path\` = \`${file.path}\` é sobrescrito pelo runner em silêncio — o que o aluno escrever nesse arquivo desaparece`,
          });
        }
      }

      const solutionKeys = new Set<AtomKey>();
      const surfaces = challengeSurfaces(challenge);

      /**
       * O que o aluno tem de ESCREVER é o DIFF starter → solução, não o arquivo
       * inteiro. O `starterCode` já vem pronto com a assinatura (`export function
       * cumprimentar(nome) {`) e o aluno só preenche o corpo; cobrar dele o
       * `export` que ele nunca digita é violação inventada.
       *
       * Nada se perde ao subtrair: o que o starter mostra continua sendo
       * checado — pela regra A1, contra o orçamento RECEPTIVO. Muda a atribuição
       * do defeito, não a sua detecção.
       */
      const starterKeys = new Set<AtomKey>();
      for (const s of surfaces) {
        if (s.surface !== 'starterCode' || s.code.trim().length === 0) continue;
        const r = extractAtoms(s.code, { fileName: `${challengeFile}#${s.label}`, language: adapterId });
        if (r.ok) for (const key of r.keys) starterKeys.add(key);
      }

      for (const { surface, code, label } of surfaces) {
        if (code.trim().length === 0) continue;
        // `surface` vai ao extrator porque É o call-site que sabe o que está
        // passando: o testsCode de C não parseia verbatim (a macro SM_TEST
        // da convenção) e a ante-sala vive num ponto único — extract.ts
        // (onda 3). O gate não prepende nada aqui.
        const result = extractAtoms(code, {
          fileName: `${challengeFile}#${label}`,
          language: adapterId,
          surface,
        });
        if (!result.ok) {
          push({
            regra: 'A2',
            arquivo: challengeFile,
            ref: lessonBudget.ref,
            campo: surface,
            linha: result.error.line,
            coluna: result.error.column,
            construcao: null,
            eixo: null,
            faixa: null,
            trechoOfensor: label,
            primeiraAulaQueEnsina: null,
            mensagem: mensagemDeParse(label, adapterId, result.error),
          });
          continue;
        }

        if (surface === 'solutionCode') {
          for (const key of result.keys) solutionKeys.add(key);
        }

        const { set, faixa, rule } = allowedFor(surface, lessonBudget);
        for (const occ of result.occurrences) {
          if (isForbiddenAlways(occ.key, adapterId)) {
            push({
              regra: 'DEC',
              arquivo: challengeFile,
              ref: lessonBudget.ref,
              campo: surface,
              linha: occ.line,
              coluna: occ.column,
              construcao: occ.key,
              eixo: axisOf(occ.key),
              faixa,
              trechoOfensor: occ.snippet,
              primeiraAulaQueEnsina: null,
              mensagem: `${humanLabel(occ.key)} quebra a decidibilidade da análise: com ele o código monta nomes em tempo de execução e nenhuma promessa de orçamento se sustenta`,
            });
            continue;
          }
          if (set.has(occ.key)) continue;
          // Ver `starterKeys` acima: na solução, só conta o que o aluno acrescenta.
          if (surface === 'solutionCode' && starterKeys.has(occ.key)) continue;
          const taughtIn = budget.firstTaughtIn.get(occ.key) ?? null;
          const isErrorScenario = occ.key === 'api:assert.throws' || occ.key === 'node:ThrowStatement';
          push({
            regra: isErrorScenario ? 'A11' : rule,
            arquivo: challengeFile,
            ref: lessonBudget.ref,
            campo: surface,
            linha: occ.line,
            coluna: occ.column,
            construcao: occ.key,
            eixo: axisOf(occ.key),
            faixa,
            trechoOfensor: occ.snippet,
            primeiraAulaQueEnsina: taughtIn,
            mensagem: isErrorScenario
              ? `${humanLabel(occ.key)} cobra tratamento de erro, e o orçamento desta aula não tem \`throw\` nem \`assert.throws\` — cenário de erro é DERIVADO do orçamento, nunca obrigatório por padrão`
              : messageFor(occ.key, taughtIn, lessonBudget.ref, surface),
          });
        }
      }

      // A6 — direção PUXADA: o desafio exercita o que a aula ensinou?
      const novas = new Set(lessonBudget.introduces.productive);
      const exercita = [...solutionKeys].some((key) => novas.has(key));
      if (novas.size > 0 && solutionKeys.size > 0 && !exercita) {
        push({
          regra: 'A6',
          arquivo: challengeFile,
          ref: lessonBudget.ref,
          campo: 'solutionCode',
          linha: 1,
          coluna: 1,
          construcao: null,
          eixo: null,
          faixa: 'productive',
          trechoOfensor: [...novas].slice(0, 5).join(', '),
          primeiraAulaQueEnsina: lessonBudget.ref,
          mensagem: `o desafio não usa NADA do que esta aula introduziu — ele só repete o que o aluno já sabia, e portanto não exercita a aula`,
        });
      }

      if (violations.length > before) desafiosComViolacao.add(challengeFile);
      // bateria A13–A16 (A13/A14b/A15a/A16): o desafio também reprova por ela —
      // aviso não derruba (o placar conta erros; ver severidadeDe).
      if (desafiosProgressao.has(challengeFile)) desafiosComViolacao.add(challengeFile);
    }

    // `novosVerdadeiros` SÓ existe quando a bateria A14a o mediu. O fallback
    // `?? introduces.productive.length` que morava aqui fazia a 2ª coluna do
    // histograma sair idêntica à 1ª nas 20 aulas de `python` — uma afirmação
    // positiva ("toda construção declarada é verdadeiramente nova") derivada de
    // uma checagem que não rodou. Ausente = não medido, e `limitacoes` diz por quê.
    const medido = bateriaRodou ? progressao.novosPorAula.get(lessonBudget.ref) : undefined;
    // As colunas da BARRA nesta aula. A barra roda em toda trilha, então o
    // `undefined` aqui só acontece se a aula não estiver no orçamento que a
    // barra percorreu — e nesse caso o campo fica AUSENTE (não medido), pela
    // mesma regra do `novosVerdadeiros`: nunca um zero que ninguém mediu.
    const daBarra = metricaDaBarraPorRef.get(lessonBudget.ref);
    metrics.push({
      ref: lessonBudget.ref,
      index: lessonBudget.index,
      novas: lessonBudget.introduces.productive.length,
      ...(medido !== undefined ? { novosVerdadeiros: medido } : {}),
      conceitosDeclarados: lesson.meta.concepts.length,
      desafios: lesson.challenges.length,
      violacoes: violacoesDaAula,
      ...(daBarra !== undefined
        ? {
            barra: {
              produtivasNovas: daBarra.produtivasNovas,
              produtivasColapsadas: daBarra.produtivasColapsadas,
              novasTotais: daBarra.novasTotais,
              secoesDeTeoria: daBarra.secoesDeTeoria,
              blocosDeCodigo: daBarra.blocosDeCodigo,
              chavesSemDemonstracao: daBarra.chavesSemDemonstracao,
              chavesComUmaFormaSo: daBarra.chavesComUmaFormaSo,
              gruposDaRegraDoPar: daBarra.grupos.length,
            },
          }
        : {}),
    });
  }

  // ── o DESAFIO DE MÓDULO, contra o orçamento da ÚLTIMA aula do módulo ───────
  //
  // O BURACO QUE ISTO FECHA, medido em 2026-09-22. O `track:validate` PROVA o
  // desafio de módulo por execução desde a rodada 9 (`tools/track-cli.ts`, o
  // ramo `if (mod.challenge)`), mas este audit NUNCA o mediu contra o orçamento:
  // a caminhada de cima é `budget.lessons` → `lesson.challenges`, e o desafio do
  // módulo não pertence a aula nenhuma. Resultado medido nos três cursos: o
  // `c-iniciante` tinha 4 dos 6 desafios de módulo cobrando construção fora do
  // orçamento — `op:binary:>` (que o curso ensina RECEPTIVA e nunca autoriza a
  // escrever), `op:binary:!=` e `op:unary:-` (ensinadas no módulo SEGUINTE) —
  // enquanto o placar dizia 0 violações. É o defeito central do produto ("nunca
  // cobrar o que não foi ensinado") na MAIOR prova de cada módulo.
  //
  // O ORÇAMENTO QUE VALE é o de SAÍDA da última aula do módulo, e é o único
  // defensável: é exatamente o que o aluno tem na mão quando chega no desafio
  // de módulo. O desafio de módulo não tem `introduces` (não é aula), logo não
  // legaliza nada por conta própria — o `saida = entrada ∪ introduces` do
  // `budget.ts:281` não tem onde agir aqui, e é por isso que este gate não
  // podia ser dispensado.
  //
  // A ASSIMETRIA DAS SUPERFÍCIES é a mesma do §5.1 (A1 starter ⊆ receptivo,
  // A2 solução ⊆ produtivo, A3 testes ⊆ receptivo de ENTRADA), com a MESMA
  // subtração do diff starter → solução: o que o starter já traz não se cobra
  // do aluno. Um módulo sem aula nenhuma não é medido (não há orçamento) e sai
  // em `limitacoes` pela via normal do loader.
  for (const mod of track.modules) {
    if (!mod.challenge) continue;
    desafiosDeModulo += 1;
    const doModulo = budget.lessons.filter((l) => l.moduleSlug === mod.meta.slug);
    const ultima = doModulo[doModulo.length - 1];
    if (ultima === undefined) continue;
    const challengeFile = `modules/${mod.meta.slug}/challenges/${mod.challenge.slug}/challenge.json`;
    const antes = violations.length;
    const superficies = challengeSurfaces(mod.challenge);

    const doStarter = new Set<AtomKey>();
    for (const s of superficies) {
      if (s.surface !== 'starterCode' || s.code.trim().length === 0) continue;
      const r = extractAtoms(s.code, { fileName: `${challengeFile}#${s.label}`, language: adapterId });
      if (r.ok) for (const k of r.keys) doStarter.add(k);
    }

    for (const { surface, code, label } of superficies) {
      if (code.trim().length === 0) continue;
      const result = extractAtoms(code, {
        fileName: `${challengeFile}#${label}`,
        language: adapterId,
        surface,
      });
      if (!result.ok) {
        violations.push({
          regra: 'A2',
          arquivo: challengeFile,
          ref: `${mod.meta.slug}/module`,
          campo: surface,
          linha: result.error.line,
          coluna: result.error.column,
          construcao: null,
          eixo: null,
          faixa: null,
          trechoOfensor: label,
          primeiraAulaQueEnsina: null,
          mensagem: mensagemDeParse(label, adapterId, result.error),
        });
        continue;
      }
      const { set, faixa, rule } = allowedFor(surface, ultima);
      for (const occ of result.occurrences) {
        if (set.has(occ.key)) continue;
        if (surface === 'solutionCode' && doStarter.has(occ.key)) continue;
        const taughtIn = budget.firstTaughtIn.get(occ.key) ?? null;
        violations.push({
          regra: rule,
          arquivo: challengeFile,
          ref: `${mod.meta.slug}/module`,
          campo: surface,
          linha: occ.line,
          coluna: occ.column,
          construcao: occ.key,
          eixo: axisOf(occ.key),
          faixa,
          trechoOfensor: occ.snippet,
          primeiraAulaQueEnsina: taughtIn,
          mensagem: `${messageFor(occ.key, taughtIn, ultima.ref, surface)} — e este é o DESAFIO DE MÓDULO, cujo orçamento é o de saída de \`${ultima.ref}\`, a última aula do módulo`,
        });
      }
    }
    if (violations.length > antes) desafiosComViolacao.add(challengeFile);
  }

  // O placar da barra, regra por regra — inclusive as que deram ZERO. Aqui o
  // zero é MEDIDO (a barra rodou); quando ela não roda, a seção inteira fica
  // AUSENTE e `limitacoes` diz por quê — nunca um zero que ninguém mediu.
  const placarDaBarra: PlacarDaBarra | undefined =
    barra === null
      ? undefined
      : {
          porRegra: REGRAS_DA_BARRA.map((regra) => ({
            regra,
            erros: barra.achados.filter((a) => a.regra === regra && a.severidade === 'erro').length,
            avisos: barra.achados.filter((a) => a.regra === regra && a.severidade === 'aviso').length,
          })),
          erros: barra.totais.erros,
          avisos: barra.totais.avisos,
          aulasComErro: barra.totais.aulasComErro,
          blocosQueNaoParseiam: barra.totais.blocosQueNaoParseiam,
        };

  return {
    trackSlug: track.root.slug,
    budgetSource: budget.source,
    violations,
    metrics,
    totals: {
      aulas: budget.lessons.length,
      desafios,
      desafiosDeModulo,
      desafiosComViolacao: desafiosComViolacao.size,
      violacoes: violations.filter((v) => severidadeDe(v) !== 'aviso').length,
      avisos: violations.filter((v) => severidadeDe(v) === 'aviso').length,
      checagensNaoExecutadas: limitacoes.length,
      lacunasDeCurriculo: violations.filter(
        (v) => severidadeDe(v) !== 'aviso' && v.construcao !== null && v.primeiraAulaQueEnsina === null,
      ).length,
      aulasSemConstrucaoNova: metrics.filter((m) => m.novas === 0).length,
      ...(barra !== null ? { errosDaBarra: barra.totais.erros, avisosDaBarra: barra.totais.avisos } : {}),
    },
    hygiene: budget.hygiene,
    parseErrors: budget.parseErrors,
    limitacoes,
    ...(placarDaBarra !== undefined ? { barra: placarDaBarra } : {}),
  };
}

/**
 * O rótulo humano de cada regra da barra, para a linha do placar. Curto de
 * propósito: quem precisa da regra inteira tem `docs/16` §5.1 e o cabeçalho de
 * `quality/barra.ts`; quem lê o placar precisa saber QUAL defeito são 12 erros.
 */
const ROTULO_DA_REGRA_DA_BARRA: Readonly<Record<RegraDaBarra, string>> = {
  A17: 'teto do passo (<=2 produtivas novas)',
  A18: 'primeira aula do curso',
  A19: 'declarar nao e demonstrar',
  A20: 'aula sem prova',
  A21: 'carga de novidade e secoes',
  A22: 'duas formas sintaticas (AVISO)',
  A23: 'derivada mal declarada (regra do par)',
  A24: 'vazamento do quiz por comprimento',
};

/**
 * O PLACAR DA BARRA A17–A23 como LINHAS de texto, prontas para o resumo.
 *
 * Está aqui pelos mesmos dois motivos que `linhasDeLimitacoes`: quem MEDIU é
 * `auditTrack`, não quem imprime; e uma função que devolve linhas é testável
 * sem capturar stdout.
 *
 * Devolve `[]` quando o relatório não tem a seção (`report.barra` ausente = a
 * barra não rodou, ou relatório montado à mão) — imprimir zeros que ninguém
 * mediu é justamente o defeito que o §9.2 proíbe. Quando ela não rodou, quem
 * fala é `linhasDeLimitacoes`.
 *
 * Os erros listados aqui JÁ ESTÃO em `totals.violacoes`: esta seção não soma
 * nada ao placar, ela diz de QUE REGRA o número veio (`totals.errosDaBarra` é o
 * subtotal).
 */
export function linhasDoPlacarDaBarra(report: AuditReport): string[] {
  const barra = report.barra;
  if (barra === undefined) return [];
  const l: string[] = [];
  // A faixa sai do CATÁLOGO, nunca de uma string cravada: a barra ganhou A24
  // (vazamento do quiz por comprimento) em 2026-09-22, e um título fixo em
  // "A17-A23" passaria a mentir sobre o que as linhas abaixo contam.
  const faixa = `${REGRAS_DA_BARRA[0]}-${REGRAS_DA_BARRA[REGRAS_DA_BARRA.length - 1]}`;
  l.push(`BARRA PEDAGOGICA ${faixa} (agnostica de linguagem — quality/barra.ts)`);
  l.push(`  erros (ja contados em violacoes) ..... ${barra.erros}`);
  l.push(`  aulas com erro de barra .............. ${barra.aulasComErro}`);
  l.push(`  avisos (A22 formas · A24 quiz) ....... ${barra.avisos}`);
  l.push(
    `  blocos de teoria que nao parseiam .... ${barra.blocosQueNaoParseiam}` +
      (barra.blocosQueNaoParseiam > 0
        ? '  <- bloco que o parser recusa nao demonstra nada: entra como erro A19 (fail-closed)'
        : ''),
  );
  for (const linha of barra.porRegra) {
    const rotulo = `    ${linha.regra} ${ROTULO_DA_REGRA_DA_BARRA[linha.regra]} `;
    l.push(`${rotulo.padEnd(56, '.')} ${linha.erros} erro(s) · ${linha.avisos} aviso(s)`);
  }
  l.push(`  reproduz: npm run engine -- barra ${report.trackSlug} --limite 0`);
  l.push('');
  return l;
}

/**
 * As limitações do relatório como LINHAS de texto, prontas para o resumo.
 *
 * Está aqui, e não no CLI, por dois motivos. Primeiro, a frase que explica uma
 * checagem não executada é parte da MEDIÇÃO — quem sabe que a bateria não rodou
 * é `auditTrack`, não quem imprime. Segundo, uma função que devolve linhas é
 * testável sem capturar stdout.
 *
 * Devolve `[]` quando nada deixou de rodar, para que o chamador possa imprimir
 * incondicionalmente.
 */
export function linhasDeLimitacoes(report: AuditReport): string[] {
  if (report.limitacoes.length === 0) return [];
  const l: string[] = [];
  l.push(
    `LIMITACOES DECLARADAS: ${report.limitacoes.length} checagem(ns) NAO EXECUTADA(S) ` +
      '(CONTRIBUTING.md · docs/16 §9.2 — o placar abaixo NAO fala por elas)',
  );
  for (const lim of report.limitacoes) {
    l.push(`  [${lim.id}] ${lim.checagem}`);
    l.push(`     NAO RODOU porque: ${lim.motivo}`);
    l.push(`     no placar isso significa: ${lim.consequencia}`);
  }
  l.push('');
  return l;
}
