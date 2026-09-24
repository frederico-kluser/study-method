/**
 * app/electron/main/engine/auditAula.ts — a caminhada por AULA do gate de
 * auditoria (`audit.ts`): A4 (teoria), as quatro superfícies do desafio
 * (A1/A2/A3/A11/DEC, com a subtração do diff starter → solução), A6 (direção
 * puxada) e as métricas por aula. Extraído do módulo original na refatoração do
 * lote L05 sem NENHUMA mudança de comportamento — a ordem dos pushes em
 * `violations` é a mesma de antes, byte a byte.
 */

import type { LoadedLesson } from '../content/trackLoader';
import { axisOf, humanLabel, isForbiddenAlways, type AtomKey } from './atomKeys';
import type { LessonBudget, TrackBudget } from './budget';
import { extractAtoms } from './extract';
import type { LanguageId } from './lang/registry';
import { collectLessonCode, type TheoryCodeResult } from './theoryCode';
import { messageFor, mensagemDeParse, converterViolacaoDeProgressao, violacaoDaBarra } from './auditMensagens';
import {
  allowedFor,
  challengeSurfaces,
  chavesDeStarter,
  severidadeDe,
  type BarraDaAuditoria,
  type BateriaDeProgressao,
} from './auditSuperficies';
import { auditarEstruturaisDoDesafio } from './auditEstruturais';
import type { BudgetRule, LessonMetrics, Surface, Violation } from './auditTypes';

/** O estado vivo de UMA auditoria — contadores e índices compartilhados. */
export interface EstadoDaAuditoria {
  budget: TrackBudget;
  adapterId: LanguageId;
  violations: Violation[];
  metrics: LessonMetrics[];
  /** desafios de AULA (o significado histórico de `totals.desafios`). */
  desafios: number;
  /** desafios de MÓDULO (contador SEPARADO de propósito — ver `AuditReport`). */
  desafiosDeModulo: number;
  desafiosComViolacao: Set<string>;
  progressao: BateriaDeProgressao;
  barra: BarraDaAuditoria;
}

type EmpurrarViolacao = (v: Violation) => void;

/** A caminhada de UMA aula: baterias mescladas, teoria, desafios, métricas. */
export function auditarAula(
  estado: EstadoDaAuditoria,
  lessonBudget: LessonBudget,
  modSlug: string,
  lesson: LoadedLesson,
): void {
  const lessonDir = `modules/${modSlug}/lessons/${lesson.meta.slug}`;
  let violacoesDaAula = 0;

  const push: EmpurrarViolacao = (v) => {
    estado.violations.push(v);
    if (severidadeDe(v) === 'erro') violacoesDaAula += 1;
  };

  // A13–A16 desta aula — mescladas aqui (mesmo padrão dos estruturais), para
  // o `metrics.violacoes` e o placar contarem a bateria nova como as demais.
  for (const pv of estado.progressao.progressaoPorRef.get(lessonBudget.ref) ?? []) {
    push(converterViolacaoDeProgressao(pv));
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
  for (const achado of estado.barra.barraPorRef.get(lessonBudget.ref) ?? []) {
    push(violacaoDaBarra(achado, lessonDir, estado.budget.firstTaughtIn));
  }

  const theory = collectLessonCode(lesson.meta.theory ?? []);
  auditarTeoriaDaAula(estado, lessonBudget, lessonDir, theory, push);

  for (const challenge of lesson.challenges) {
    auditarDesafioDeAula(estado, lessonBudget, lesson, lessonDir, challenge, push);
  }

  estado.metrics.push(montarMetricasDaAula(estado, lessonBudget, lesson, violacoesDaAula));
}

/**
 * A4 — a teoria também está sujeita ao orçamento de saída (só no modo
 * `declared`: em `inferred` a teoria É a fonte do orçamento).
 */
function auditarTeoriaDaAula(
  estado: EstadoDaAuditoria,
  lessonBudget: LessonBudget,
  lessonDir: string,
  theory: TheoryCodeResult,
  push: EmpurrarViolacao,
): void {
  if (estado.budget.source !== 'declared') return;
  for (const block of theory.blocks) {
    // Só a teoria NA LINGUAGEM QUE A TRILHA ENSINA entra no gate de A4.
    // Era `if (!block.isJavaScript) continue;` — a pergunta certa é sobre o
    // adaptador DA TRILHA, não sobre uma linguagem cravada no código.
    if (block.adapterId !== estado.adapterId) continue;
    const result = extractAtoms(block.code, {
      fileName: `${lessonDir}/lesson.json#theory`,
      language: estado.adapterId,
    });
    if (!result.ok) continue;
    for (const occ of result.occurrences) {
      if (lessonBudget.saida.receptive.has(occ.key)) continue;
      const taughtIn = estado.budget.firstTaughtIn.get(occ.key) ?? null;
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

/** Um desafio de AULA: estruturais, superfícios (com o diff starter→solução) e A6. */
function auditarDesafioDeAula(
  estado: EstadoDaAuditoria,
  lessonBudget: LessonBudget,
  lesson: LoadedLesson,
  lessonDir: string,
  challenge: LoadedLesson['challenges'][number],
  push: EmpurrarViolacao,
): void {
  estado.desafios += 1;
  const challengeFile = `${lessonDir}/challenges/${challenge.slug}/challenge.json`;
  const antes = estado.violations.length;

  auditarEstruturaisDoDesafio(challenge, challengeFile, lessonBudget.ref, lesson.meta.concepts, push);

  const surfaces = challengeSurfaces(challenge);
  const starterKeys = chavesDeStarter(surfaces, challengeFile, estado.adapterId);
  const solutionKeys = new Set<AtomKey>();
  for (const spec of surfaces) {
    auditarSuperficieDaAula(estado, lessonBudget, challengeFile, spec, starterKeys, solutionKeys, push);
  }

  auditarA6(lessonBudget, challengeFile, solutionKeys, push);

  if (estado.violations.length > antes) estado.desafiosComViolacao.add(challengeFile);
  // bateria A13–A16 (A13/A14b/A15a/A16): o desafio também reprova por ela —
  // aviso não derruba (o placar conta erros; ver severidadeDe).
  if (estado.progressao.desafiosProgressao.has(challengeFile)) estado.desafiosComViolacao.add(challengeFile);
}

/** Uma superfície do desafio: parse (A2) e as ocorrências contra o orçamento. */
function auditarSuperficieDaAula(
  estado: EstadoDaAuditoria,
  lessonBudget: LessonBudget,
  challengeFile: string,
  spec: { surface: Surface; code: string; label: string },
  starterKeys: ReadonlySet<AtomKey>,
  solutionKeys: Set<AtomKey>,
  push: EmpurrarViolacao,
): void {
  const { surface, code, label } = spec;
  if (code.trim().length === 0) return;
  // `surface` vai ao extrator porque É o call-site que sabe o que está
  // passando: o testsCode de C não parseia verbatim (a macro SM_TEST
  // da convenção) e a ante-sala vive num ponto único — extract.ts
  // (onda 3). O gate não prepende nada aqui.
  const result = extractAtoms(code, {
    fileName: `${challengeFile}#${label}`,
    language: estado.adapterId,
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
      mensagem: mensagemDeParse(label, estado.adapterId, result.error),
    });
    return;
  }

  if (surface === 'solutionCode') {
    for (const key of result.keys) solutionKeys.add(key);
  }

  const { set, faixa, rule } = allowedFor(surface, lessonBudget);
  for (const occ of result.occurrences) {
    const violacao = avaliarOcorrenciaDaAula(
      estado,
      lessonBudget,
      challengeFile,
      surface,
      { set, faixa, rule },
      starterKeys,
      occ,
    );
    if (violacao !== null) push(violacao);
  }
}

/** É o cenário de erro DERIVADO (`throw`/`assert.throws`) cobrado pelo A11? */
function eCenarioDeErro(key: AtomKey): boolean {
  return key === 'api:assert.throws' || key === 'node:ThrowStatement';
}

/**
 * A decisão por OCORRÊNCIA (a assimetria do cabeçalho do módulo): DEC, orçamento
 * por superfície, subtração do starter e o A11 do cenário de erro. Devolve
 * `null` quando a ocorrência está no orçamento (ou já veio do starter).
 */
function avaliarOcorrenciaDaAula(
  estado: EstadoDaAuditoria,
  lessonBudget: LessonBudget,
  challengeFile: string,
  surface: Surface,
  orcamento: { set: ReadonlySet<AtomKey>; faixa: 'receptive' | 'productive'; rule: BudgetRule },
  starterKeys: ReadonlySet<AtomKey>,
  occ: { key: AtomKey; line: number; column: number; snippet: string },
): Violation | null {
  if (isForbiddenAlways(occ.key, estado.adapterId)) {
    return {
      regra: 'DEC',
      arquivo: challengeFile,
      ref: lessonBudget.ref,
      campo: surface,
      linha: occ.line,
      coluna: occ.column,
      construcao: occ.key,
      eixo: axisOf(occ.key),
      faixa: orcamento.faixa,
      trechoOfensor: occ.snippet,
      primeiraAulaQueEnsina: null,
      mensagem: `${humanLabel(occ.key)} quebra a decidibilidade da análise: com ele o código monta nomes em tempo de execução e nenhuma promessa de orçamento se sustenta`,
    };
  }
  if (orcamento.set.has(occ.key)) return null;
  // Ver `starterKeys` acima: na solução, só conta o que o aluno acrescenta.
  if (surface === 'solutionCode' && starterKeys.has(occ.key)) return null;
  const taughtIn = estado.budget.firstTaughtIn.get(occ.key) ?? null;
  return montarViolacaoDeOcorrencia(challengeFile, lessonBudget.ref, surface, orcamento, taughtIn, occ);
}

/** A violação de orçamento da ocorrência (A11 para cenário de erro, senão a regra da superfície). */
function montarViolacaoDeOcorrencia(
  challengeFile: string,
  ref: string,
  surface: Surface,
  orcamento: { set: ReadonlySet<AtomKey>; faixa: 'receptive' | 'productive'; rule: BudgetRule },
  taughtIn: string | null,
  occ: { key: AtomKey; line: number; column: number; snippet: string },
): Violation {
  const isErrorScenario = eCenarioDeErro(occ.key);
  return {
    regra: isErrorScenario ? 'A11' : orcamento.rule,
    arquivo: challengeFile,
    ref,
    campo: surface,
    linha: occ.line,
    coluna: occ.column,
    construcao: occ.key,
    eixo: axisOf(occ.key),
    faixa: orcamento.faixa,
    trechoOfensor: occ.snippet,
    primeiraAulaQueEnsina: taughtIn,
    mensagem: isErrorScenario
      ? `${humanLabel(occ.key)} cobra tratamento de erro, e o orçamento desta aula não tem \`throw\` nem \`assert.throws\` — cenário de erro é DERIVADO do orçamento, nunca obrigatório por padrão`
      : messageFor(occ.key, taughtIn, ref, surface),
  };
}

/**
 * A6 — direção PUXADA: o desafio exercita o que a aula ensinou? Sem ela o gate
 * aceita uma trilha inteira de desafios que só repetem o que o aluno já sabia.
 */
function auditarA6(
  lessonBudget: LessonBudget,
  challengeFile: string,
  solutionKeys: ReadonlySet<AtomKey>,
  push: EmpurrarViolacao,
): void {
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
}

/** As métricas da aula — com ausência HONÉSTA onde a checagem não rodou. */
function montarMetricasDaAula(
  estado: EstadoDaAuditoria,
  lessonBudget: LessonBudget,
  lesson: LoadedLesson,
  violacoesDaAula: number,
): LessonMetrics {
  // `novosVerdadeiros` SÓ existe quando a bateria A14a o mediu. O fallback
  // `?? introduces.productive.length` que morava aqui fazia a 2ª coluna do
  // histograma sair idêntica à 1ª nas 20 aulas de `python` — uma afirmação
  // positiva ("toda construção declarada é verdadeiramente nova") derivada de
  // uma checagem que não rodou. Ausente = não medido, e `limitacoes` diz por quê.
  const medido = estado.progressao.bateriaRodou
    ? estado.progressao.progressao.novosPorAula.get(lessonBudget.ref)
    : undefined;
  // As colunas da BARRA nesta aula. A barra roda em toda trilha, então o
  // `undefined` aqui só acontece se a aula não estiver no orçamento que a
  // barra percorreu — e nesse caso o campo fica AUSENTE (não medido), pela
  // mesma regra do `novosVerdadeiros`: nunca um zero que ninguém mediu.
  const daBarra = estado.barra.metricaDaBarraPorRef.get(lessonBudget.ref);
  return {
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
  };
}
