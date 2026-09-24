/**
 * app/electron/main/engine/quality/barra.ts — a BARRA PEDAGÓGICA A17–A23,
 * agnóstica de linguagem.
 *
 * POR QUE ELA EXISTE. A bateria A13–A16 (`quality/progressao.ts`) mede
 * ensino-efetivo, micro-avanço, progressividade e primeira-atividade — e é
 * **javascript-only** por construção (`H13`/`AX` são tabelas de
 * `ts.SyntaxKind` e do runner `node:test`; os spans S13 saem de
 * `ts.createSourceFile`). O `audit.ts` a PULA e DECLARA a limitação
 * (`A13-A16-NAO-RODOU`) em toda trilha que não seja JavaScript, e o próprio
 * relatório traz a prova por mutação: *apagar TODOS os blocos de código da
 * teoria da aula 1 de uma trilha de Rust não muda o placar — 0 violações, 0
 * avisos, exit 0.*
 *
 * A consequência foi medida em 2026-09-22, e é o defeito que esta bateria
 * conserta: a aula 1 do `rust-iniciante` declara **11 construções novas** (6
 * produtivas + 5 receptivas) em **UMA** seção de teoria, para um aluno cujo
 * `entryCriteria` é "zero absoluto — nunca programou", e sai do gate com **0
 * violações**. O curso de referência (`python-iniciante`) tem, nas suas 112
 * aulas: no máximo 3 chaves novas por aula, no mínimo 2 seções de teoria por
 * aula, e ZERO chave declarada sem demonstração em bloco de código.
 *
 * O MECANISMO que deixava passar (medido, `budget.ts:281`):
 * `saida = entrada ∪ introduces`. Declarar uma chave em `introduces` a torna
 * LEGAL na própria aula — a aula LEGALIZA o seu próprio penhasco declarando-o.
 * O orçamento A1–A4 continua certo e continua necessário; o que faltava era
 * uma régua sobre o TAMANHO DO PASSO e sobre a EXISTÊNCIA DA DEMONSTRAÇÃO, e
 * é essa régua que mora aqui.
 *
 * AS SETE REGRAS (ids estáveis; `docs/16-engine-de-trilha.md` §5.1):
 *
 *   A17  TETO DO PASSO (erro)      — |novas produtivas colapsadas| ≤ 2
 *   A18  PRIMEIRA AULA (erro)      — na aula 1 da trilha: ≤ 1 produtiva nova, e
 *                                    toda chave que o aluno LÊ (teoria, starter,
 *                                    testes) fora do axioma de entrada tem
 *                                    demonstração NESTA aula
 *   A19  DECLARAR NÃO É DEMONSTRAR — toda chave nova (produtiva ou receptiva)
 *        (erro)                      aparece em bloco cercado com tag da
 *                                    linguagem da trilha, NESTA aula
 *   A20  AULA SEM PROVA (erro)     — aula `regular` sem desafio, ou sem nenhuma
 *                                    construção produtiva nova, não é aula
 *   A21  CARGA DE NOVIDADE (erro)  — |novas colapsadas| ≤ 4 e
 *                                    seções de teoria ≥ max(2, ⌈novas/2⌉)
 *   A22  DUAS FORMAS (aviso)       — cada chave produtiva nova aparece em ≥2
 *                                    ocorrências sintaticamente distintas
 *   A23  DERIVADA MAL DECLARADA    — `introduces.derived` só vale com pai
 *        (erro)                      declarado e CO-OCORRÊNCIA NA MESMA LINHA
 *                                    de um bloco da aula
 *
 * A REGRA DO PAR, FINALMENTE MECÂNICA (A23). O contrato de conteúdo diz que "a
 * chave que distingue + as derivadas que a mesma construção produz
 * inevitavelmente contam como UM item" — e até aqui isso era PROSA: quem
 * contava 2 era o parágrafo do documento, e o único código que contava
 * (`progressao.ts:516`) contava 6 cru e não rodava. Esta bateria faz o
 * colapso, mas exige que ele seja DECLARADO na própria aula e PROVADO pelo
 * disco:
 *
 *     "introduces": {
 *       "productive": ["global:print", "node:Call", "node:StrLiteral"],
 *       "derived": [
 *         { "chave": "node:Call", "de": "global:print" },
 *         { "chave": "node:StrLiteral", "de": "global:print" }
 *       ]
 *     }
 *
 * Uma derivada só é aceita quando existe, em algum bloco de código da teoria
 * DESTA aula, uma LINHA em que a chave e o pai ocorrem juntos — que é
 * exatamente o que "a mesma construção produz inevitavelmente" quer dizer
 * (`print("bom dia")` emite as três na mesma linha). Declaração sem
 * co-ocorrência é A23, e A17/A21 contam a chave cheia. Sem isso, `derived`
 * seria uma porta para calar o gate declarando tudo como derivada.
 *
 * PURO: não abre arquivo, não vai à rede, não chama LLM — nunca. Recebe a
 * trilha já carregada e devolve achados no formato do `audit.ts`.
 */

import type { LoadedTrack } from '../../content/trackLoader';
import type { TrackLessonSource, TrackTheorySection } from '../../content/trackTypes';
import { AtomKey, harnessReceptiveSeed, humanLabel, isAtomKey, structuralAlwaysAllowed } from '../atomKeys';
import { deriveTrackBudget, type BudgetSource, type LessonBudget } from '../budget';
import { extractAllOccurrences, type AtomOccurrence } from '../extract';
import type { LanguageId } from '../lang/registry';
import { collectLessonCode } from '../theoryCode';

// ---------------------------------------------------------------------------
// Os tetos — um lugar só, e cada número com a medição que o justifica
// ---------------------------------------------------------------------------

/**
 * Os limiares da barra. Medidos contra o `python-iniciante` (112 aulas, o
 * curso que o dono considera bom) e contra o `rust-iniciante` (101 aulas, o
 * curso que motivou esta bateria) em 2026-09-22:
 *
 *   |produtivas novas| por aula:     python 1/1/3 (min/mediana/max) · rust 1/1/6
 *   |novas| (prod ∪ recept) máximo:  python 3                      · rust 11
 *   seções de teoria:                python 2/3/5                  · rust 1/3/3
 *   chave declarada sem demo:        python 0                      · rust 3
 *
 * Os tetos são o que o curso de referência cumpre com folga e o curso ruim
 * viola: 2 produtivas (o A7/I2 do contrato), 4 novas no total, 2 seções.
 */
export const TETO_PRODUTIVAS_NOVAS = 2;
export const TETO_PRODUTIVAS_NOVAS_AULA_1 = 1;
export const TETO_NOVAS_TOTAL = 4;
export const MINIMO_SECOES_DE_TEORIA = 2;
export const MINIMO_FORMAS_POR_CHAVE = 2;
/**
 * A24 — a folga de comprimento que separa "coincidência" de VAZAMENTO no quiz.
 *
 * MEDIDO em 2026-09-22 nos três cursos, contando as afirmações em que a opção
 * CORRETA é a mais longa das quatro, sozinha:
 *
 *   python-iniciante  58/320 = 18%   ← ABAIXO do acaso
 *   c-iniciante       36/138 = 26%   ← no acaso
 *   rust-iniciante   173/235 = 73%   ← TRÊS VEZES o acaso
 *
 * O acaso é 25%: com quatro opções de comprimentos quaisquer, a correta é a mais
 * longa em uma de cada quatro. Um quiz em que ela é a mais longa em 73% das
 * afirmações é acertável SEM LER — "clique na maior" leva a estrela, e o gate de
 * maestria da aula vira decoração. (O produto já de-vaza a POSIÇÃO: o
 * `quizOptionOrder.ts` permuta a ordem de exibição, e é por isso que
 * `answerIndex: 0` no corpus inteiro não é defeito. Ninguém de-vaza o
 * COMPRIMENTO.)
 *
 * O teto de 8 caracteres é o que separa a aula que vaza por sistema da que vaza
 * por coincidência: com a regra "TODA afirmação da aula vaza, e por mais de 8
 * caracteres", o curso de referência tem 1 aula em 112 e o rust tem 27 em 103.
 *
 * A24 É A TERCEIRA PORTA DA MESMA SALA, e as duas primeiras estão no repositório
 * com o mesmo diagnóstico escrito à mão:
 *
 *   - a ONDA 10 fechou o vazamento por PIXEL (`optionVisualState` devolve o
 *     neutro sem sequer LER `answerIndex` antes da resposta);
 *   - a ONDA 12 fechou o vazamento por POSIÇÃO (`src/lib/quizOptionOrder.ts`
 *     permuta a ordem de exibição — `tests/quizOptionLeak.test.ts` renderiza o
 *     card de verdade para provar que a TELA usa a permutação), e o texto dela
 *     termina exatamente nesta frase: "clicar sempre na primeira pílula dominava
 *     o curso inteiro sem ler nada, e o gate de maestria — que só abre com
 *     ACERTO — virava decoração";
 *   - A24 fecha a terceira, o COMPRIMENTO, que nenhuma das duas via: as quatro
 *     pílulas podem estar neutras e em ordem sorteada, e a mais comprida ainda
 *     entrega a resposta.
 */
export const FOLGA_DE_COMPRIMENTO_DO_QUIZ = 8;

/** As regras desta bateria, na ordem em que reprovam. */
export const REGRAS_DA_BARRA = ['A17', 'A18', 'A19', 'A20', 'A21', 'A22', 'A23', 'A24'] as const;
export type RegraDaBarra = (typeof REGRAS_DA_BARRA)[number];

export interface AchadoDaBarra {
  /** a regra violada — id estável, do catálogo acima. */
  regra: RegraDaBarra;
  /** `<moduleSlug>/<lessonSlug>`. */
  ref: string;
  /** a chave de átomo envolvida, quando a regra é sobre uma chave. */
  chave: AtomKey | null;
  /** o que o disco mostra (a evidência vem ANTES do veredito — §6.3). */
  evidencia: string;
  /** a frase em pt-BR que o autor lê. */
  mensagem: string;
  /** a ação prescrita do catálogo fechado (§6.7). */
  acao: 'SPLIT_LESSON' | 'REWRITE_IN_BUDGET' | 'ADD_TEST' | 'INSERT_INTERMEDIATE' | 'DECLARE_INTEGRATIVE';
  severidade: 'erro' | 'aviso';
}

export interface MetricaDaBarra {
  ref: string;
  index: number;
  /** produtivas novas (fora da entrada), antes do colapso. */
  produtivasNovas: number;
  /** produtivas novas depois do colapso pela regra do par (A23). */
  produtivasColapsadas: number;
  /** novas totais (produtivas ∪ receptivas, fora da entrada) colapsadas. */
  novasTotais: number;
  secoesDeTeoria: number;
  blocosDeCodigo: number;
  /** chaves novas sem NENHUMA demonstração nos blocos desta aula. */
  chavesSemDemonstracao: number;
  /** chaves produtivas novas com menos de 2 formas distintas. */
  chavesComUmaFormaSo: number;
  desafios: number;
  /** afirmações do quiz com exatamente 4 opções (as que A24 mede). */
  afirmacoesMedidas: number;
  /** afirmações em que a opção correta é a mais longa, sozinha (A24, aviso). */
  afirmacoesQueVazamPorTamanho: number;
  /**
   * OS GRUPOS DA REGRA DO PAR, medidos no disco: componentes conexas da relação
   * "ocorre na MESMA LINHA de um bloco de código desta aula" sobre as chaves
   * novas. Cada grupo é UMA construção do ponto de vista do aluno — é o que a
   * prosa do contrato chama de "a chave que distingue + as derivadas que a mesma
   * construção produz inevitavelmente".
   *
   * Existe para o PLANEJADOR DA QUEBRA (`modes/convergencia.ts`): quebrar uma
   * aula é distribuir estes grupos por N aulas, e um grupo NUNCA se parte — se
   * `printf("oi")` emite três chaves na mesma linha, não existe aula que ensine
   * duas delas e não a terceira.
   *
   * Chave nova SEM demonstração nenhuma (A19) fica num grupo só dela: ela não
   * tem linha para co-ocorrer, e o planejador precisa vê-la.
   */
  grupos: AtomKey[][];
}

export interface RelatorioDaBarra {
  trackSlug: string;
  adapterId: LanguageId;
  budgetSource: BudgetSource;
  achados: AchadoDaBarra[];
  metricas: MetricaDaBarra[];
  totais: {
    aulas: number;
    erros: number;
    avisos: number;
    aulasComErro: number;
    /** blocos de teoria que não parseiam — não medido nunca conta como verde. */
    blocosQueNaoParseiam: number;
  };
}

// ---------------------------------------------------------------------------
// Leitura dos campos aditivos
// ---------------------------------------------------------------------------

/** Uma derivada declarada: a chave e o pai que a produz inevitavelmente. */
interface DerivadaDeclarada {
  chave: AtomKey;
  de: AtomKey;
}

/**
 * Lê `introduces.derived` — campo ADITIVO (§10): ausente = nenhuma derivada
 * declarada, e o colapso é a identidade. Entrada malformada é DESCARTADA aqui
 * e reprovada em A23 (nunca ignorada em silêncio).
 */
function lerDerivadas(meta: TrackLessonSource): { validasNaForma: DerivadaDeclarada[]; malformadas: unknown[] } {
  const bruto = (meta as unknown as Record<string, unknown>).introduces;
  if (typeof bruto !== 'object' || bruto === null) return { validasNaForma: [], malformadas: [] };
  const lista = (bruto as Record<string, unknown>).derived;
  if (lista === undefined) return { validasNaForma: [], malformadas: [] };
  if (!Array.isArray(lista)) return { validasNaForma: [], malformadas: [lista] };
  const validasNaForma: DerivadaDeclarada[] = [];
  const malformadas: unknown[] = [];
  for (const item of lista) {
    if (typeof item !== 'object' || item === null) {
      malformadas.push(item);
      continue;
    }
    const chave = (item as Record<string, unknown>).chave;
    const de = (item as Record<string, unknown>).de;
    if (typeof chave !== 'string' || typeof de !== 'string' || !isAtomKey(chave) || !isAtomKey(de)) {
      malformadas.push(item);
      continue;
    }
    validasNaForma.push({ chave, de });
  }
  return { validasNaForma, malformadas };
}

/** O `role` declarado da aula (ausente = `regular`). */
function papelDa(meta: TrackLessonSource): string {
  const bruto = (meta as unknown as Record<string, unknown>).role;
  return typeof bruto === 'string' && bruto.length > 0 ? bruto : 'regular';
}

// ---------------------------------------------------------------------------
// As ocorrências dos blocos de teoria da aula
// ---------------------------------------------------------------------------

interface DemonstracaoDaAula {
  /** por chave: os snippets DISTINTOS que a demonstram (A19/A22). */
  formasPorChave: Map<AtomKey, Set<string>>;
  /** por chave: as linhas (globais, por bloco) em que ela ocorre (A23). */
  linhasPorChave: Map<AtomKey, Set<string>>;
  /** quantos blocos da linguagem da trilha a aula tem. */
  blocos: number;
  /** blocos que não parseiam — fail-closed: não medido nunca é verde. */
  naoParseados: Array<{ linha: number; mensagem: string }>;
}

/**
 * Extrai as demonstrações da teoria da aula, bloco por bloco, com o ADAPTADOR
 * DA TRILHA.
 *
 * `surface: 'theory'` não é decoração: é o que liga o ENVELOPE DE FRAGMENTO do
 * extrator (`extract.ts`), sem o qual a teoria de C — que demonstra em
 * fragmento, como a pedagogia manda (a aula 1 não pode mostrar `main`) — não
 * parseia e a bateria veria ZERO demonstração em toda aula de C.
 */
function demonstracoesDa(
  meta: TrackLessonSource,
  adapterId: LanguageId,
): DemonstracaoDaAula {
  const formasPorChave = new Map<AtomKey, Set<string>>();
  const linhasPorChave = new Map<AtomKey, Set<string>>();
  const naoParseados: Array<{ linha: number; mensagem: string }> = [];
  const colhidos = collectLessonCode((meta.theory ?? []) as readonly TrackTheorySection[]);
  let blocos = 0;
  let indiceDoBloco = 0;
  for (const bloco of colhidos.blocks) {
    indiceDoBloco += 1;
    if (bloco.adapterId !== adapterId) continue;
    blocos += 1;
    const resultado = extractAllOccurrences(bloco.code, {
      language: adapterId,
      surface: 'theory',
      fileName: `${meta.slug}#teoria`,
    });
    if (!resultado.ok) {
      naoParseados.push({ linha: bloco.line, mensagem: resultado.error.message });
      continue;
    }
    for (const ocorrencia of resultado.occurrences as readonly AtomOccurrence[]) {
      const chave = ocorrencia.key;
      if (!formasPorChave.has(chave)) formasPorChave.set(chave, new Set());
      formasPorChave.get(chave)!.add(formaNormalizada(ocorrencia.snippet));
      if (!linhasPorChave.has(chave)) linhasPorChave.set(chave, new Set());
      linhasPorChave.get(chave)!.add(`${indiceDoBloco}:${ocorrencia.line}`);
    }
  }
  return { formasPorChave, linhasPorChave, blocos, naoParseados };
}

/**
 * A FORMA SINTÁTICA de uma ocorrência, normalizada — o que A22 compara.
 *
 * A primeira versão comparava o `snippet` cru do extrator, e um provador
 * adversarial mostrou, medindo, que isso deixava A22 ser satisfeito por NADA:
 *
 *   - por ESPAÇO EM BRANCO: em `a-tela/somar` (rust) as "duas formas" de
 *     `op:binary:+` eram `"+ b"` e `"+b"` — a MESMA forma, e a própria aula diz
 *     em prosa que o espaço é decoração;
 *   - por NOME DE VARIÁVEL: as formas de `node:Parameter` saíam como
 *     `"x: i32) -> i32 {"` e `"numero: i32) -> i32 {"` — só o nome mudou.
 *
 * A normalização mata os dois: o espaço colapsa, e todo identificador vira
 * `ID`. O que SOBREVIVE à normalização é o que muda de verdade — literal contra
 * expressão (`ID + 10` × `ID + ID`), operando de cada lado (`ID * 2` × `3 * ID`),
 * uma chamada contra duas.
 *
 * ⚑ LIMITE QUE FICA DECLARADO: o `snippet` do extrator é o SUFIXO DA LINHA a
 * partir do nó, não o texto do nó. Por isso a MESMA construção escrita em uma
 * linha e em várias ainda rende duas "formas" (`ID { 2 }` × `ID {`). Fechar isso
 * exigiria o texto do nó por `[start, end)` — que existe na ocorrência —, mas
 * para os eixos `op:` esse texto é só o token do operador, e aí A22 nunca
 * passaria. A escolha é declarada: A22 é AVISO, e um aviso que erra para o lado
 * de não acusar é melhor que um erro que acusa errado.
 */
function formaNormalizada(snippet: string): string {
  return snippet
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[A-Za-z_][A-Za-z0-9_]*/g, 'ID');
}

/**
 * A24 — o vazamento do quiz pelo COMPRIMENTO das opções.
 *
 * PURA. Mede só as afirmações com EXATAMENTE 4 opções (o schema exige 4; uma
 * afirmação malformada é problema do loader, não desta bateria).
 */
function medirVazamentoDoQuiz(meta: TrackLessonSource): {
  medidas: number;
  vazamFraco: number;
  vazamForte: number;
  excessos: number[];
  avisos: Array<{ id: string; correta: number; segunda: number }>;
} {
  const bruto = (meta as unknown as Record<string, unknown>).assertions;
  const lista = Array.isArray(bruto) ? bruto : [];
  let medidas = 0;
  let vazamFraco = 0;
  let vazamForte = 0;
  const excessos: number[] = [];
  const avisos: Array<{ id: string; correta: number; segunda: number }> = [];
  for (const item of lista) {
    if (typeof item !== 'object' || item === null) continue;
    const a = item as Record<string, unknown>;
    const ops = a.options;
    if (!Array.isArray(ops) || ops.length !== 4) continue;
    const tamanhos = ops.map((o) => (typeof o === 'string' ? o.length : 0));
    const indice = typeof a.answerIndex === 'number' ? a.answerIndex : -1;
    if (indice < 0 || indice > 3) continue;
    medidas += 1;
    const correta = tamanhos[indice];
    const ordenados = [...tamanhos].sort((x, y) => y - x);
    const maior = ordenados[0];
    const segunda = ordenados[1];
    if (correta !== maior || maior === segunda) continue;
    vazamFraco += 1;
    const id = typeof a.id === 'string' ? a.id : `#${medidas}`;
    avisos.push({ id, correta, segunda });
    if (correta > segunda + FOLGA_DE_COMPRIMENTO_DO_QUIZ) {
      vazamForte += 1;
      excessos.push(correta - segunda);
    }
  }
  return { medidas, vazamFraco, vazamForte, excessos, avisos };
}

/** O que a aula acrescenta de fato: o declarado MENOS o que já estava na entrada. */
function novasDa(orcamento: LessonBudget): { produtivas: AtomKey[]; todas: AtomKey[] } {
  const produtivas = orcamento.introduces.productive.filter((k) => !orcamento.entrada.productive.has(k));
  const receptivas = orcamento.introduces.receptive.filter((k) => !orcamento.entrada.receptive.has(k));
  const todas = [...new Set([...produtivas, ...receptivas])].sort();
  return { produtivas, todas };
}

/**
 * O COLAPSO pela regra do par: remove do conjunto as chaves declaradas como
 * derivadas VÁLIDAS (A23 já reprovou as inválidas, e elas seguem contando).
 */
function colapsar(chaves: readonly AtomKey[], derivadasValidas: ReadonlySet<AtomKey>): AtomKey[] {
  return chaves.filter((k) => !derivadasValidas.has(k));
}

/**
 * Agrupa as chaves novas por CO-OCORRÊNCIA DE LINHA — a regra do par medida no
 * disco, sem declaração nenhuma (ver `MetricaDaBarra.grupos`).
 *
 * É união-find sobre "existe uma linha de bloco desta aula em que as duas
 * ocorrem": duas chaves que sempre aparecem juntas na mesma linha são a MESMA
 * construção para quem está aprendendo. Chave sem demonstração vira grupo
 * unitário (A19 já a reprovou; o planejador da quebra precisa dela na conta).
 *
 * PURA e determinística: a ordem de saída é a das chaves ordenadas.
 */
export function agruparPorLinha(
  chaves: readonly AtomKey[],
  linhasPorChave: ReadonlyMap<AtomKey, ReadonlySet<string>>,
): AtomKey[][] {
  const pai = new Map<AtomKey, AtomKey>();
  const raiz = (k: AtomKey): AtomKey => {
    let atual = k;
    while (pai.get(atual) !== atual) atual = pai.get(atual)!;
    return atual;
  };
  for (const k of chaves) pai.set(k, k);
  const ordenadas = [...chaves].sort();
  for (let i = 0; i < ordenadas.length; i += 1) {
    for (let j = i + 1; j < ordenadas.length; j += 1) {
      const a = ordenadas[i];
      const b = ordenadas[j];
      const la = linhasPorChave.get(a);
      const lb = linhasPorChave.get(b);
      if (la === undefined || lb === undefined) continue;
      if (![...la].some((linha) => lb.has(linha))) continue;
      const ra = raiz(a);
      const rb = raiz(b);
      if (ra !== rb) pai.set(ra, rb);
    }
  }
  const porRaiz = new Map<AtomKey, AtomKey[]>();
  for (const k of ordenadas) {
    const r = raiz(k);
    if (!porRaiz.has(r)) porRaiz.set(r, []);
    porRaiz.get(r)!.push(k);
  }
  return [...porRaiz.values()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

// ---------------------------------------------------------------------------
// A bateria
// ---------------------------------------------------------------------------

export interface OpcoesDaBarra {
  /** força o modo do orçamento (default: automático, como o `audit`). */
  modo?: BudgetSource;
  /**
   * O RECORTE: as `ref`s (`<modulo>/<aula>`) a MEDIR. Ausente = a trilha toda.
   *
   * Existe por CUSTO, e o custo foi medido (2026-09-22, autoria do
   * `c-iniciante`): a demonstração de uma aula sai de `extractAllOccurrences`
   * sobre cada bloco de teoria, e em C cada chamada spawna `clang` + `python3`.
   * Medir as 115 aulas para relatar UMA (o que o `--aula` do CLI fazia,
   * filtrando só na impressão) custava minutos por verificação, e o autor roda
   * essa verificação depois de cada aula que escreve.
   *
   * O recorte é SEGURO porque a pergunta de cada regra desta bateria é LOCAL à
   * aula: A19/A22/A23 olham os blocos DELA, A17/A18/A21 contam o `introduces`
   * DELA contra a entrada — e a ENTRADA continua vindo do orçamento cumulativo
   * da trilha INTEIRA (`deriveTrackBudget`, que lê JSON e não spawna parser).
   * O que o recorte muda é só quantas aulas têm a demonstração extraída; o
   * orçamento, que é o que depende das outras aulas, nunca é recortado.
   *
   * O PLACAR de um relatório recortado fala só do recorte — quem publica roda
   * sem ele.
   */
  apenas?: readonly string[];
}

/**
 * Roda a barra pedagógica sobre a trilha inteira.
 *
 * DETERMINÍSTICA e OFFLINE: a mesma trilha produz o mesmo relatório. O
 * veredito de cada regra é aritmética sobre conjuntos de átomos e contagem de
 * seções — nunca leitura humana, nunca opinião de modelo.
 */
export function auditarBarra(track: LoadedTrack, opcoes: OpcoesDaBarra = {}): RelatorioDaBarra {
  const orcamentoDaTrilha = deriveTrackBudget(track, { mode: opcoes.modo });
  const adapterId = orcamentoDaTrilha.adapterId;
  const achados: AchadoDaBarra[] = [];
  const metricas: MetricaDaBarra[] = [];
  let blocosQueNaoParseiam = 0;

  // O axioma de entrada da trilha — o que a aula 1 pode encontrar sem ensinar
  // (estruturais + semente receptiva do harness). A18 mede contra ele.
  const axioma = new Set<AtomKey>([
    ...structuralAlwaysAllowed(adapterId),
    ...harnessReceptiveSeed(adapterId),
  ]);

  const porRef = new Map<string, { meta: TrackLessonSource; desafios: number }>();
  for (const mod of track.modules) {
    for (const aula of mod.lessons) {
      porRef.set(`${mod.meta.slug}/${aula.meta.slug}`, {
        meta: aula.meta,
        desafios: aula.challenges.length,
      });
    }
  }

  const recorte = opcoes.apenas === undefined ? null : new Set(opcoes.apenas);
  for (const orcamento of orcamentoDaTrilha.lessons) {
    const doDisco = porRef.get(orcamento.ref);
    if (doDisco === undefined) continue;
    // O recorte entra DEPOIS de o orçamento cumulativo estar derivado: a
    // entrada desta aula depende de todas as anteriores, e é ela que A17/A21
    // medem contra. Pular a aula aqui pula a EXTRAÇÃO, nunca o orçamento.
    if (recorte !== null && !recorte.has(orcamento.ref)) continue;
    const meta = doDisco.meta;
    const papel = papelDa(meta);
    const secoes = (meta.theory ?? []).length;
    const demo = demonstracoesDa(meta, adapterId);
    blocosQueNaoParseiam += demo.naoParseados.length;

    const { produtivas, todas } = novasDa(orcamento);
    const { validasNaForma, malformadas } = lerDerivadas(meta);
    // A REGRA DO PAR VALE NAS DUAS FAIXAS. A primeira versão desta bateria só
    // aceitava derivada entre chaves PRODUTIVAS, e a consequência apareceu na
    // primeira aula de Rust que tentou cumprir A18: `todo!()` numa linha emite
    // `api:todo!` + `node:MacroInvocation` + `node:TokenTree` — três chaves
    // RECEPTIVAS que são UMA construção para quem lê ("a macro que marca o
    // buraco"), e contá-las cheias estourava A21 numa aula que ensina uma coisa
    // só. O que a regra exige é o mesmo nas duas faixas: pai declarado e
    // co-ocorrência na mesma linha de um bloco desta aula.
    const declaradas = new Set<AtomKey>([
      ...orcamento.introduces.productive,
      ...orcamento.introduces.receptive,
    ]);
    const chavesDerivadasDeclaradas = new Set<AtomKey>(validasNaForma.map((d) => d.chave));

    // ── A23 — a derivada só vale com pai declarado e co-ocorrência de LINHA ──
    const derivadasValidas = new Set<AtomKey>();
    for (const bruto of malformadas) {
      achados.push({
        regra: 'A23',
        ref: orcamento.ref,
        chave: null,
        evidencia: `introduces.derived tem entrada malformada: ${JSON.stringify(bruto).slice(0, 120)}`,
        mensagem:
          'cada item de `introduces.derived` é um objeto `{ "chave": "<atomo>", "de": "<atomo>" }` com as duas chaves no formato de átomo',
        acao: 'REWRITE_IN_BUDGET',
        severidade: 'erro',
      });
    }
    for (const derivada of validasNaForma) {
      if (!declaradas.has(derivada.chave) || !declaradas.has(derivada.de)) {
        achados.push({
          regra: 'A23',
          ref: orcamento.ref,
          chave: derivada.chave,
          evidencia: `derivada ${derivada.chave} declarada com pai ${derivada.de}; productive = [${orcamento.introduces.productive.join(', ')}]; receptive = [${orcamento.introduces.receptive.join(', ')}]`,
          mensagem:
            'derivada e pai precisam estar os DOIS declarados em `introduces` (produtiva ou receptiva) — a regra do par colapsa itens do mesmo declarado, não importa de fora',
          acao: 'REWRITE_IN_BUDGET',
          severidade: 'erro',
        });
        continue;
      }
      if (chavesDerivadasDeclaradas.has(derivada.de)) {
        achados.push({
          regra: 'A23',
          ref: orcamento.ref,
          chave: derivada.chave,
          evidencia: `${derivada.chave} deriva de ${derivada.de}, que também está declarada como derivada`,
          mensagem:
            'cadeia de derivadas é proibida: toda derivada aponta DIRETO para a chave que distingue a construção',
          acao: 'REWRITE_IN_BUDGET',
          severidade: 'erro',
        });
        continue;
      }
      const linhasDaChave = demo.linhasPorChave.get(derivada.chave);
      const linhasDoPai = demo.linhasPorChave.get(derivada.de);
      const coocorre =
        linhasDaChave !== undefined &&
        linhasDoPai !== undefined &&
        [...linhasDaChave].some((l) => linhasDoPai.has(l));
      if (!coocorre) {
        achados.push({
          regra: 'A23',
          ref: orcamento.ref,
          chave: derivada.chave,
          evidencia: `nenhuma linha de bloco desta aula tem ${derivada.chave} e ${derivada.de} juntas`,
          mensagem:
            '"derivada inevitável" é medida no disco: a chave e o pai ocorrem na MESMA linha de um bloco de código desta aula. Sem co-ocorrência, ela conta cheia no teto',
          acao: 'REWRITE_IN_BUDGET',
          severidade: 'erro',
        });
        continue;
      }
      derivadasValidas.add(derivada.chave);
    }

    const produtivasColapsadas = colapsar(produtivas, derivadasValidas);
    const todasColapsadas = colapsar(todas, derivadasValidas);
    const primeiraAula = orcamento.index === 0;

    // ── A17 — o teto do passo ────────────────────────────────────────────────
    if (produtivasColapsadas.length > TETO_PRODUTIVAS_NOVAS) {
      achados.push({
        regra: 'A17',
        ref: orcamento.ref,
        chave: null,
        evidencia: `${produtivasColapsadas.length} construções produtivas novas depois do colapso: [${produtivasColapsadas.join(', ')}]`,
        mensagem: `no máximo ${TETO_PRODUTIVAS_NOVAS} construções produtivas novas por aula (regra do par já aplicada) — o excedente é aula própria`,
        acao: 'SPLIT_LESSON',
        severidade: 'erro',
      });
    }

    // ── A18 — a primeira aula do curso ───────────────────────────────────────
    if (primeiraAula) {
      if (produtivasColapsadas.length > TETO_PRODUTIVAS_NOVAS_AULA_1) {
        achados.push({
          regra: 'A18',
          ref: orcamento.ref,
          chave: null,
          evidencia: `aula 1 da trilha com ${produtivasColapsadas.length} produtivas novas: [${produtivasColapsadas.join(', ')}]`,
          mensagem: `a PRIMEIRA aula do curso ensina no máximo ${TETO_PRODUTIVAS_NOVAS_AULA_1} construção produtiva nova — na aula 1 o aluno não tem orçamento nenhum para amortecer o passo`,
          acao: 'SPLIT_LESSON',
          severidade: 'erro',
        });
      }
      for (const chave of todas) {
        if (axioma.has(chave)) continue;
        if ((demo.formasPorChave.get(chave)?.size ?? 0) > 0) continue;
        achados.push({
          regra: 'A18',
          ref: orcamento.ref,
          chave,
          evidencia: `${chave} está em introduces da aula 1 e não aparece em nenhum bloco de código da aula`,
          mensagem: `na aula 1 não existe "o aluno só copia": ${humanLabel(chave)} precisa de demonstração própria nesta aula, ou sai da aula`,
          acao: 'SPLIT_LESSON',
          severidade: 'erro',
        });
      }
    }

    // ── A19 — declarar não é demonstrar ──────────────────────────────────────
    let semDemonstracao = 0;
    for (const chave of todas) {
      const formas = demo.formasPorChave.get(chave)?.size ?? 0;
      if (formas > 0) continue;
      semDemonstracao += 1;
      if (primeiraAula && !axioma.has(chave)) continue; // já reportada por A18
      achados.push({
        regra: 'A19',
        ref: orcamento.ref,
        chave,
        evidencia: `${chave} está em introduces e não aparece em nenhum dos ${demo.blocos} bloco(s) \`${adapterId}\` da teoria desta aula`,
        mensagem: `declarar não é demonstrar: ${humanLabel(chave)} precisa aparecer em bloco cercado com tag de linguagem na teoria desta aula`,
        acao: 'REWRITE_IN_BUDGET',
        severidade: 'erro',
      });
    }

    // ── A20 — aula sem prova não é aula ──────────────────────────────────────
    //
    // O DESAFIO É EXIGIDO DE TODA AULA, qualquer que seja o `role`. A primeira
    // versão desta regra só olhava `role: regular`, e a consequência foi medida
    // na hora: das 113 aulas-esqueleto do `c-iniciante`, as que o contrato marca
    // como consolidação escapavam do gate — 70 aulas sem desafio nenhum saindo
    // como verdes. Consolidação muda o que a aula INTRODUZ (nada), nunca o fato
    // de que aula sem desafio é aula sem prova: nas duas trilhas autoradas a
    // razão é 1 desafio por aula (python 112/113, rust 101/101).
    if (doDisco.desafios === 0) {
      achados.push({
        regra: 'A20',
        ref: orcamento.ref,
        chave: null,
        evidencia: `aula \`role: ${papel}\` com \`challenges[]\` vazio`,
        mensagem:
          'aula sem desafio é aula sem prova: o aluno não tem como exercitar nem como ser conferido por execução',
        acao: 'ADD_TEST',
        severidade: 'erro',
      });
    }
    // A SEGUNDA METADE DE A20 é sobre NOVIDADE, e ela conta as DUAS FAIXAS.
    //
    // A primeira versão exigia construção PRODUTIVA nova em toda aula
    // `regular`, e a autoria do M1 de C mostrou, na aula 3, por que isso é
    // estreito demais: `devolver-zero` ensina o `return 0;` do `main` do harness
    // como LEITURA — a escrita nasce quatro módulos depois —, e "ler antes de
    // escrever" é o primeiro princípio da pedagogia deste produto
    // (`qualidade-aula.md` §1), não uma exceção. Uma aula cuja única novidade é
    // RECEPTIVA é uma aula legítima; o que não é aula é a que não acrescenta
    // NADA — nem para escrever, nem para ler.
    if (papel === 'regular' && todas.length === 0) {
      achados.push({
        regra: 'A20',
        ref: orcamento.ref,
        chave: null,
        evidencia: `aula \`role: regular\` sem construção nova nenhuma (introduces.productive = [${orcamento.introduces.productive.join(', ')}], receptive = [${orcamento.introduces.receptive.join(', ')}])`,
        mensagem:
          'aula regular que não introduz construção nenhuma — nem para escrever, nem para ler — é reforço, e reforço se declara: `role: "consolidation"` com o degrau nomeado, ou a aula ganha o seu passo',
        acao: 'DECLARE_INTEGRATIVE',
        severidade: 'erro',
      });
    }

    // ── A21 — a carga de novidade e as seções que a sustentam ────────────────
    if (todasColapsadas.length > TETO_NOVAS_TOTAL) {
      achados.push({
        regra: 'A21',
        ref: orcamento.ref,
        chave: null,
        evidencia: `${todasColapsadas.length} chaves novas (produtivas + receptivas, colapsadas): [${todasColapsadas.join(', ')}]`,
        mensagem: `no máximo ${TETO_NOVAS_TOTAL} construções novas por aula, somando o que o aluno escreve e o que ele só lê — acima disso a aula é penhasco e se quebra`,
        acao: 'SPLIT_LESSON',
        severidade: 'erro',
      });
    }
    if (todas.length > 0) {
      const minimo = Math.max(MINIMO_SECOES_DE_TEORIA, Math.ceil(todasColapsadas.length / 2));
      if (secoes < minimo) {
        achados.push({
          regra: 'A21',
          ref: orcamento.ref,
          chave: null,
          evidencia: `${secoes} seção(ões) de teoria para ${todasColapsadas.length} construção(ões) nova(s)`,
          mensagem: `são necessárias ao menos ${minimo} seções de teoria nesta aula (mínimo ${MINIMO_SECOES_DE_TEORIA}, e uma a cada duas construções novas) — uma seção só não ensina duas coisas`,
          acao: 'SPLIT_LESSON',
          severidade: 'erro',
        });
      }
    }

    // ── A22 — duas formas sintáticas (aviso com contagem) ───────────────────
    let comUmaFormaSo = 0;
    for (const chave of produtivas) {
      const formas = demo.formasPorChave.get(chave)?.size ?? 0;
      if (formas === 0) continue; // é A19, não A22
      if (formas >= MINIMO_FORMAS_POR_CHAVE) continue;
      comUmaFormaSo += 1;
      achados.push({
        regra: 'A22',
        ref: orcamento.ref,
        chave,
        evidencia: `${chave} aparece em 1 forma sintática só nos blocos desta aula`,
        mensagem: `mostre ${humanLabel(chave)} em ao menos ${MINIMO_FORMAS_POR_CHAVE} formas sintaticamente distintas (argumento literal E expressão composta; condição comparada E booleano pronto) — uma forma só faz o aluno induzir regra restrita demais`,
        acao: 'REWRITE_IN_BUDGET',
        severidade: 'aviso',
      });
    }

    // ── A24 — o quiz não pode ser acertado pelo COMPRIMENTO ────────────────
    const quiz = medirVazamentoDoQuiz(meta);
    if (quiz.medidas >= 2 && quiz.vazamForte === quiz.medidas) {
      achados.push({
        regra: 'A24',
        ref: orcamento.ref,
        chave: null,
        evidencia: `nas ${quiz.medidas} afirmações desta aula a opção correta é a MAIS LONGA, sozinha, e por mais de ${FOLGA_DE_COMPRIMENTO_DO_QUIZ} caracteres (excessos: ${quiz.excessos.join(', ')})`,
        mensagem:
          '"clique na maior" acerta o quiz inteiro desta aula sem ler nada — reescreva os distratores para que o comprimento não denuncie a resposta (o produto de-vaza a POSIÇÃO, nunca o COMPRIMENTO)',
        acao: 'REWRITE_IN_BUDGET',
        severidade: 'erro',
      });
    } else {
      for (const excesso of quiz.avisos) {
        achados.push({
          regra: 'A24',
          ref: orcamento.ref,
          chave: null,
          evidencia: `afirmação "${excesso.id}": a opção correta é a mais longa das 4, sozinha (${excesso.correta} chars contra ${excesso.segunda} da segunda)`,
          mensagem:
            'a opção correta ser a mais longa é coincidência em uma afirmação e sistema em todas — equilibre os comprimentos (o acaso é 25% das afirmações; medido, o rust-iniciante estava em 73%)',
          acao: 'REWRITE_IN_BUDGET',
          severidade: 'aviso',
        });
      }
    }

    for (const falha of demo.naoParseados) {
      achados.push({
        regra: 'A19',
        ref: orcamento.ref,
        chave: null,
        evidencia: `bloco de código na linha ${falha.linha} não parseia: ${falha.mensagem}`,
        mensagem:
          'bloco de código da teoria que não parseia não demonstra nada — o gate não pode medir o que o parser recusa (fail-closed)',
        acao: 'REWRITE_IN_BUDGET',
        severidade: 'erro',
      });
    }

    metricas.push({
      ref: orcamento.ref,
      index: orcamento.index,
      produtivasNovas: produtivas.length,
      produtivasColapsadas: produtivasColapsadas.length,
      novasTotais: todasColapsadas.length,
      secoesDeTeoria: secoes,
      blocosDeCodigo: demo.blocos,
      chavesSemDemonstracao: semDemonstracao,
      chavesComUmaFormaSo: comUmaFormaSo,
      desafios: doDisco.desafios,
      afirmacoesMedidas: quiz.medidas,
      afirmacoesQueVazamPorTamanho: quiz.vazamFraco,
      grupos: agruparPorLinha(todas, demo.linhasPorChave),
    });
  }

  const erros = achados.filter((a) => a.severidade === 'erro');
  const aulasComErro = new Set(erros.map((a) => a.ref));

  return {
    trackSlug: track.root.slug,
    adapterId,
    budgetSource: orcamentoDaTrilha.source,
    achados,
    metricas,
    totais: {
      aulas: metricas.length,
      erros: erros.length,
      avisos: achados.length - erros.length,
      aulasComErro: aulasComErro.size,
      blocosQueNaoParseiam,
    },
  };
}
