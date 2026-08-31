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
 * Referência: `docs/16-engine-de-trilha.md` §5.1, §5.2 e §5.5.
 */

import type { LoadedTrack } from '../content/trackLoader';
import type { TrackChallengeSource } from '../content/trackTypes';
import { AtomKey, axisOf, humanLabel, isForbiddenAlways } from './atomKeys';
import { LessonBudget, TrackBudget, deriveTrackBudget, DeriveOptions } from './budget';
import { extractAtoms } from './extract';
import { collectLessonCode } from './theoryCode';
import {
  auditarProgressao,
  type ProgressaoLessonInput,
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

/** Bateria A13–A16 (ensino-efetivo, micro-avanço, progressividade, primeira-atividade). */
export type AuditRule = BudgetRule | StructureRule | ProgressaoRule;

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
  /** ADITIVO (rodada 12): `Novo(i)` da bateria A14a — demo/introduzido ∖ cumulativo ∖ boilerplate. */
  novosVerdadeiros?: number;
  /** conceitos declarados no `lesson.json`. */
  conceitosDeclarados: number;
  desafios: number;
  violacoes: number;
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
    desafiosComViolacao: number;
    violacoes: number;
    /** ADITIVO (rodada 12): avisos da bateria A13–A16 (D4, A14a-zero) — fora do placar de erros. */
    avisos?: number;
    lacunasDeCurriculo: number;
    aulasSemConstrucaoNova: number;
  };
  /** defeitos de formato da teoria (não são violações de orçamento). */
  hygiene: TrackBudget['hygiene'];
  parseErrors: TrackBudget['parseErrors'];
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

function severidadeDe(v: Violation): 'erro' | 'aviso' {
  return v.severidade ?? 'erro';
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
  const violations: Violation[] = [];
  const metrics: LessonMetrics[] = [];

  let desafios = 0;
  const desafiosComViolacao = new Set<string>();

  // ── bateria A13–A16 ──────────────────────────────────────────────────────
  // PURO, roda em memória; as violações são mescladas no loop por aula abaixo
  // (mesmo padrão dos estruturais), e as de desafio alimentam o
  // `desafiosComViolacao` com o MESMO critério dos erros (aviso não reprova).
  const progressao = auditarProgressao(entradaDeProgressao(track), { mode: budget.source });
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

    // A4 — a teoria também está sujeita ao orçamento de saída.
    const theory = collectLessonCode(lesson.meta.theory ?? []);
    if (budget.source === 'declared') {
      for (const block of theory.blocks) {
        if (!block.isJavaScript) continue;
        const result = extractAtoms(block.code, { fileName: `${lessonDir}/lesson.json#theory` });
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
        const r = extractAtoms(s.code, { fileName: `${challengeFile}#${s.label}` });
        if (r.ok) for (const key of r.keys) starterKeys.add(key);
      }

      for (const { surface, code, label } of surfaces) {
        if (code.trim().length === 0) continue;
        const result = extractAtoms(code, { fileName: `${challengeFile}#${label}` });
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
            mensagem: `\`${label}\` não parseia como JavaScript: ${result.error.message}`,
          });
          continue;
        }

        if (surface === 'solutionCode') {
          for (const key of result.keys) solutionKeys.add(key);
        }

        const { set, faixa, rule } = allowedFor(surface, lessonBudget);
        for (const occ of result.occurrences) {
          if (isForbiddenAlways(occ.key)) {
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

    metrics.push({
      ref: lessonBudget.ref,
      index: lessonBudget.index,
      novas: lessonBudget.introduces.productive.length,
      novosVerdadeiros: progressao.novosPorAula.get(lessonBudget.ref) ?? lessonBudget.introduces.productive.length,
      conceitosDeclarados: lesson.meta.concepts.length,
      desafios: lesson.challenges.length,
      violacoes: violacoesDaAula,
    });
  }

  return {
    trackSlug: track.root.slug,
    budgetSource: budget.source,
    violations,
    metrics,
    totals: {
      aulas: budget.lessons.length,
      desafios,
      desafiosComViolacao: desafiosComViolacao.size,
      violacoes: violations.filter((v) => severidadeDe(v) !== 'aviso').length,
      avisos: violations.filter((v) => severidadeDe(v) === 'aviso').length,
      lacunasDeCurriculo: violations.filter(
        (v) => severidadeDe(v) !== 'aviso' && v.construcao !== null && v.primeiraAulaQueEnsina === null,
      ).length,
      aulasSemConstrucaoNova: metrics.filter((m) => m.novas === 0).length,
    },
    hygiene: budget.hygiene,
    parseErrors: budget.parseErrors,
  };
}
