/**
 * app/electron/main/engine/budget.ts — o ORÇAMENTO CUMULATIVO DE CONHECIMENTO.
 *
 * Problema real: a frase "um desafio só pode cobrar o que já foi ensinado" é
 * inverificável enquanto "o que já foi ensinado" for prosa. Este arquivo
 * transforma essa frase num CONJUNTO por aula, derivado por código, de modo que
 * a proibição vire uma diferença de conjuntos com poder de veto.
 *
 * A derivação, na ordem pedagógica (módulos por `order`, aulas na ordem do
 * array `lessons` — a mesma sequência que `challengeContextValidator` usa):
 *
 *   entrada(0) = axioma de entrada (estruturas inevitáveis + harness de teste)
 *   entrada(N) = saida(N-1)
 *   saida(N)   = entrada(N) ∪ introduces(N)
 *
 * DUAS FAIXAS, e a distinção é o que torna o gate utilizável:
 *
 *   receptivo  — o que o aluno pode LER: prosa, exemplo, starter, teste.
 *   produtivo  — o que se pode EXIGIR que ele ESCREVA: o solutionCode.
 *
 * Invariante: produtivo ⊆ receptivo. Sem essa separação o gate só tem duas
 * saídas ruins — proibir o próprio runner `node:test` (inviável, todo desafio
 * usa) ou liberar tudo (inútil). A necessidade está medida: 45 das 60 violações
 * dos módulos 1–3 da trilha atual são as 5 construções do harness, que o aluno
 * lê em todo desafio e nunca escreve.
 *
 * DOIS MODOS DE ORIGEM, e a diferença entre eles é honestidade, não capricho:
 *
 *   'declared' — a aula declara `introduces` (campo aditivo). É o modo da
 *                engine geradora, e é o único à prova de fraude: colar a solução
 *                dentro da teoria NÃO muda o orçamento declarado. (Esse golpe
 *                já aconteceu neste repositório: a "reparação" da aula 1 colou
 *                o solutionCode inteiro numa seção chamada "Exemplo completo".)
 *   'inferred' — o orçamento é lido do código que a teoria mostra. É o único
 *                modo possível sobre conteúdo LEGADO, que não tem `introduces`.
 *                É deliberadamente PERMISSIVO: tudo que a teoria exibe conta
 *                como ensinado. Logo, toda violação encontrada em modo inferido
 *                é um piso — o número real é maior, nunca menor.
 *
 * O que este arquivo NÃO faz: não parseia (é `extract.ts`), não lê disco (o
 * chamador passa a trilha carregada) e não chama LLM nenhuma — nunca.
 *
 * Referência: `docs/16-engine-de-trilha.md` §3.2, §3.5 e §5.1.
 */

import type { LoadedTrack } from '../content/trackLoader';
import { trackProgrammingLanguage } from '../content/trackTypes';
import {
  AtomKey,
  harnessReceptiveSeed,
  isAtomKey,
  structuralAlwaysAllowed,
} from './atomKeys';
import { extractAtoms } from './extract';
import {
  DEFAULT_ADAPTER_ID,
  LanguageRegistryError,
  adapterIdForChallengeLanguage,
  type LanguageId,
} from './lang/registry';
import { collectLessonCode, TheoryHygieneIssue } from './theoryCode';

/** Como o orçamento de uma aula foi obtido. */
export type BudgetSource = 'declared' | 'inferred';

/** Política de semeadura do harness de teste (`docs/16-engine-de-trilha.md` D1). */
export type HarnessPolicy = 'receptive-seed' | 'none';

/** As duas faixas de um orçamento. */
export interface BudgetBands {
  receptive: ReadonlySet<AtomKey>;
  productive: ReadonlySet<AtomKey>;
}

export interface LessonBudget {
  /** posição na ordem pedagógica global da trilha (0-based). */
  index: number;
  moduleSlug: string;
  lessonSlug: string;
  /** `<moduleSlug>/<lessonSlug>` — a chave usada nos relatórios. */
  ref: string;
  /** o que o aluno sabia ANTES desta aula. É o orçamento do testsCode. */
  entrada: BudgetBands;
  /** entrada ∪ o que esta aula introduz. É o orçamento do solutionCode. */
  saida: BudgetBands;
  /** o que ESTA aula acrescenta, por faixa. */
  introduces: { receptive: AtomKey[]; productive: AtomKey[] };
  source: BudgetSource;
}

export interface TrackBudget {
  /** aulas na ordem pedagógica. */
  lessons: LessonBudget[];
  /** busca por `<moduleSlug>/<lessonSlug>`. */
  byRef: Map<string, LessonBudget>;
  /**
   * PRIMEIRA aula que introduz cada construção, em toda a trilha.
   *
   * É o campo que faz o laço de correção convergir: uma violação cuja chave
   * TEM origem é problema de ORDEM (reescrever o artefato ou mover a aula);
   * uma violação cuja chave NÃO tem origem em lugar nenhum é LACUNA DE
   * CURRÍCULO (falta criar a aula). Sem separar as duas, o laço reescreve
   * desafios eternamente para caber num currículo furado e nunca termina.
   */
  firstTaughtIn: Map<AtomKey, string>;
  /** defeitos de formato encontrados ao ler a teoria. */
  hygiene: Array<TheoryHygieneIssue & { ref: string }>;
  /** blocos com tag `js` que não parseiam — erro, nunca silêncio. */
  parseErrors: Array<{ ref: string; line: number; message: string }>;
  source: BudgetSource;
  /**
   * ADITIVO (onda 5): o ADAPTADOR desta trilha (`trackAdapterId`). Fica no
   * orçamento porque quem consome o orçamento (o `audit.ts`, a bateria
   * A13–A16) precisa da MESMA resposta — recomputá-la em cada consumidor é
   * como duas cópias de uma constante começam a divergir.
   */
  adapterId: LanguageId;
}

export interface DeriveOptions {
  /** default: `receptive-seed`. */
  harnessPolicy?: HarnessPolicy;
  /**
   * força o modo. Ausente = automático: usa `declared` quando ao menos uma aula
   * declara `introduces`, senão `inferred`.
   */
  mode?: BudgetSource;
}

/** Formato do campo aditivo `introduces` em `lesson.json`. */
interface DeclaredIntroduces {
  productive?: unknown;
  receptive?: unknown;
}

function readDeclared(meta: unknown): DeclaredIntroduces | null {
  if (typeof meta !== 'object' || meta === null) return null;
  const value = (meta as Record<string, unknown>).introduces;
  if (typeof value !== 'object' || value === null) return null;
  return value as DeclaredIntroduces;
}

function asAtomKeys(value: unknown): AtomKey[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isAtomKey);
}

/**
 * Aulas na ORDEM PEDAGÓGICA: módulos ordenados por `order` (a ordem do array
 * `modules` é a do disco; a pedagógica é o `order` de cada `module.json`), e
 * dentro do módulo as aulas na ordem do array `lessons`.
 */
export function pedagogicalOrder(
  track: LoadedTrack,
): Array<{ moduleSlug: string; lessonSlug: string; lesson: LoadedTrack['modules'][number]['lessons'][number] }> {
  const modules = [...track.modules].sort((a, b) => a.meta.order - b.meta.order);
  const out: Array<{ moduleSlug: string; lessonSlug: string; lesson: LoadedTrack['modules'][number]['lessons'][number] }> = [];
  for (const mod of modules) {
    for (const lesson of mod.lessons) {
      out.push({ moduleSlug: mod.meta.slug, lessonSlug: lesson.meta.slug, lesson });
    }
  }
  return out;
}

/**
 * O ADAPTADOR DA TRILHA — a linguagem que ela ensina (§6 linhas 918-940).
 *
 * FAIL-CLOSED de propósito. O default vive em `trackProgrammingLanguage`
 * (trilha sem o campo = a linguagem default), então chegar aqui com `null`
 * significa que a trilha DECLARA um token que nenhum adaptador registrado
 * aceita — auditar isso com o adaptador default seria medir Python com a régua
 * de JavaScript e aprovar qualquer coisa.
 */
export function trackAdapterId(track: LoadedTrack): LanguageId {
  const token = trackProgrammingLanguage(track.root);
  const id = adapterIdForChallengeLanguage(token);
  if (id === null) {
    throw new LanguageRegistryError(
      'ADAPTADOR_DESCONHECIDO',
      `trilha ${JSON.stringify(track.root.slug)}: programmingLanguage ${JSON.stringify(token)} não ` +
        `resolve para nenhum adaptador registrado — o orçamento não sabe qual parser aplicar`,
      { pedido: String(token), conhecidos: [DEFAULT_ADAPTER_ID] },
    );
  }
  return id;
}

/**
 * O axioma de entrada: o que o aluno pode encontrar já na aula 1.
 *
 * As duas tabelas vêm de `atomKeys.ts` por FUNÇÃO (e não mais por constante):
 * elas são conteúdo de LINGUAGEM (nomes de nó e a API do runner de teste) e as
 * funções são fail-closed — pedir a semente de uma linguagem que não a declara
 * LANÇA, em vez de semear o orçamento com o harness do Node.
 */
export function entryAxiom(
  policy: HarnessPolicy,
  language: LanguageId = DEFAULT_ADAPTER_ID,
): { receptive: Set<AtomKey>; productive: Set<AtomKey> } {
  const estruturais = structuralAlwaysAllowed(language);
  const productive = new Set<AtomKey>(estruturais);
  const receptive = new Set<AtomKey>(estruturais);
  if (policy === 'receptive-seed') {
    for (const key of harnessReceptiveSeed(language)) receptive.add(key);
  }
  return { receptive, productive };
}

/**
 * Deriva o orçamento cumulativo de uma trilha inteira.
 *
 * PURO: mesma trilha carregada e mesmas opções produzem o mesmo orçamento.
 * Não abre arquivo, não vai à rede, não chama LLM.
 */
export function deriveTrackBudget(track: LoadedTrack, options: DeriveOptions = {}): TrackBudget {
  const policy = options.harnessPolicy ?? 'receptive-seed';
  const adapterId = trackAdapterId(track);
  const ordered = pedagogicalOrder(track);

  const anyDeclared = ordered.some(({ lesson }) => readDeclared(lesson.meta) !== null);
  const mode: BudgetSource = options.mode ?? (anyDeclared ? 'declared' : 'inferred');

  const axiom = entryAxiom(policy, adapterId);
  let carryReceptive = new Set<AtomKey>(axiom.receptive);
  let carryProductive = new Set<AtomKey>(axiom.productive);

  const lessons: LessonBudget[] = [];
  const byRef = new Map<string, LessonBudget>();
  const firstTaughtIn = new Map<AtomKey, string>();
  const hygiene: TrackBudget['hygiene'] = [];
  const parseErrors: TrackBudget['parseErrors'] = [];

  ordered.forEach(({ moduleSlug, lessonSlug, lesson }, index) => {
    const ref = `${moduleSlug}/${lessonSlug}`;

    const entrada: BudgetBands = {
      receptive: new Set(carryReceptive),
      productive: new Set(carryProductive),
    };

    let introducesReceptive: AtomKey[] = [];
    let introducesProductive: AtomKey[] = [];

    if (mode === 'declared') {
      const declared = readDeclared(lesson.meta);
      introducesProductive = asAtomKeys(declared?.productive);
      // Receptivo declarado é ADITIVO ao produtivo: o que o aluno escreve, ele
      // obviamente também pode ler. Declarar só o receptivo nunca libera escrita.
      introducesReceptive = [...new Set([...introducesProductive, ...asAtomKeys(declared?.receptive)])];
    } else {
      // Modo inferido: o que a TEORIA desta aula demonstra e ainda não estava
      // no orçamento. Permissivo por construção — ver cabeçalho.
      const collected = collectLessonCode(lesson.meta.theory ?? []);
      for (const issue of collected.hygiene) hygiene.push({ ...issue, ref });

      const found = new Set<AtomKey>();
      for (const block of collected.blocks) {
        // O bloco só entra no orçamento quando é da LINGUAGEM QUE A TRILHA
        // ENSINA. Era `if (!block.isJavaScript) continue;` — que numa trilha de
        // Python teria descartado todos os blocos certos e medido os errados.
        if (block.adapterId !== adapterId) continue;
        const result = extractAtoms(block.code, { fileName: `${ref}#teoria`, language: adapterId });
        if (!result.ok) {
          parseErrors.push({ ref, line: block.line, message: result.error.message });
          continue;
        }
        for (const key of result.keys) found.add(key);
      }
      // Cada faixa é medida contra a SUA PRÓPRIA entrada. Medir as duas contra
      // a receptiva tem uma consequência que passou despercebida na primeira
      // versão e que fabricava violação falsa: tudo que o axioma semeia só no
      // receptivo (o harness, e literais como `'texto'` que todo `test('…')`
      // usa) jamais poderia ser "introduzido" — e então qualquer solutionCode
      // que usasse uma string era reportado como LACUNA DE CURRÍCULO, com a
      // mensagem errada. Uma construção pode entrar no produtivo depois de já
      // estar no receptivo: é exatamente o caminho `lê antes de escrever`.
      introducesReceptive = [...found].filter((key) => !entrada.receptive.has(key)).sort();
      introducesProductive = [...found].filter((key) => !entrada.productive.has(key)).sort();
    }

    const saidaReceptive = new Set(entrada.receptive);
    for (const key of introducesReceptive) saidaReceptive.add(key);
    const saidaProductive = new Set(entrada.productive);
    for (const key of introducesProductive) saidaProductive.add(key);

    // `introducesProductive` é sempre superconjunto de `introducesReceptive`
    // (o axioma produtivo está contido no receptivo), então é ele que registra
    // a origem de TODA construção — inclusive as que a aula libera só para leitura.
    for (const key of introducesProductive) {
      if (!firstTaughtIn.has(key)) firstTaughtIn.set(key, ref);
    }

    const budget: LessonBudget = {
      index,
      moduleSlug,
      lessonSlug,
      ref,
      entrada,
      saida: { receptive: saidaReceptive, productive: saidaProductive },
      introduces: { receptive: introducesReceptive, productive: introducesProductive },
      source: mode,
    };

    lessons.push(budget);
    byRef.set(ref, budget);
    carryReceptive = saidaReceptive;
    carryProductive = saidaProductive;
  });

  return { lessons, byRef, firstTaughtIn, hygiene, parseErrors, source: mode, adapterId };
}
