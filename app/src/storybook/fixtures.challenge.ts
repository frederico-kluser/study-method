/**
 * src/storybook/fixtures.challenge.ts — fixtures da ÁREA DO DESAFIO
 * (ChallengeView + TrackChallengePanel + blocos) para as histórias.
 *
 * Complementa o `fixtures.ts` partilhado (que tem o mundo canónico:
 * `fixtureChallengeInfos`, `fixtureTestAnswerResult`, `fixtureTrackChallenge`,
 * `fixtureTrackSubmitResult`, `fixturePiStreamEvents`…) com as VARIANTES que a
 * área desenha e o ficheiro partilhado não traz: teste determinístico
 * reprovado, vereditos do avaliador (passed/parcial), submissões
 * aprovada/sem-checks, o relatório de domínio do módulo e os RASCUNHOS do
 * painel de trilha (o caminho real de retomada — `challengeDraftCache` — que
 * as histórias usam para semear os estados de veredito/estrelas sem ter de os
 * alcançar por clique).
 *
 * Regras (STORY-SPEC §7/§9): só payloads TIPADOS com os tipos reais do
 * contrato; sem hex; sem `any`; os emissores de stream envolvem o
 * `emitMockEvent` do mockApi (o push main→renderer simulado).
 */
import type {
  ChallengeInfo,
  PiExecuteResult,
  TestAnswerResult,
  TrackModuleMasteryReport,
  TrackSubmitResult,
} from '@shared/ipc-contract';
import type { TrackChallengeNavSelection } from '../lib/challengeNav';
import type { ChallengeDraft, ChallengeDraftKey } from '../lib/challengeDraftCache';
import { saveChallengeDraft, __resetChallengeDraftForTests } from '../lib/challengeDraftCache';
import { emitMockEvent } from './mockApi';
import {
  fixtureChallengeInfos,
  fixtureTestAnswerResult,
  fixtureTrackChallenge,
  fixtureTrackSubmitResult,
  type TestAnswerEvent,
} from './fixtures';

// ─── Seleções de navegação (ChallengeNav) ────────────────────────────────────

/** Seleção do desafio de AULA (target 'lesson') — o fluxo dos 3 atos. */
export const challengeSelectionLesson: TrackChallengeNavSelection = {
  trackSlug: 'python-iniciante',
  target: 'lesson',
  lessonId: 'aula-2',
  challengeId: fixtureTrackChallenge.slug,
  title: fixtureTrackChallenge.title,
};

/** Desafio de aula TENTADO ANTES DA AULA (flag ONDA2 — "Ver a aula"). */
export const challengeSelectionBeforeLesson: TrackChallengeNavSelection = {
  ...challengeSelectionLesson,
  attemptedBeforeLesson: true,
};

/** Seleção do teste de PROFICIÊNCIA (target 'proficiency'). */
export const challengeSelectionProficiency: TrackChallengeNavSelection = {
  trackSlug: 'python-iniciante',
  target: 'proficiency',
  challengeId: 'proficiencia',
  title: 'Teste de proficiência: Python do Zero',
};

/** Seleção do desafio de MÓDULO (target 'module' — conteúdo autoral). */
export const challengeSelectionModule: TrackChallengeNavSelection = {
  trackSlug: 'python-iniciante',
  target: 'module',
  moduleSlug: 'fundamentos',
  challengeId: 'desafio-modulo-fundamentos',
  title: 'Desafio do módulo: Fundamentos',
};

// ─── Desafio legado (ChallengeView) ──────────────────────────────────────────

/** O desafio ativo da ChallengeView legada (o primeiro do setup). */
export const challengeActive: ChallengeInfo = fixtureChallengeInfos[0];

// ─── Fase determinística (study:test-answer) ─────────────────────────────────

/** Fase determinística REPROVADA (2 de 3 — o caso que perde 1 estrela). */
export const fixtureTestAnswerFailed: TestAnswerResult = {
  success: true,
  testsRun: 2,
  expectedTests: 3,
  passed: false,
  output:
    '✔ dobro de 0 devolve 0\n' +
    '✖ dobro de -3 devolve -6\n' +
    '    AssertionError: 6 != -6\n' +
    '✔ dobro de 7 devolve 14\n' +
    '2 passed, 1 failed in 0.05s',
  verdictFeedback: 'O caso negativo falhou: o sinal não é preservado.',
};

/** Fase determinística que NADA passa (erro de sintaxe → sem checks). */
export const fixtureTestAnswerNothingPassed: TestAnswerResult = {
  success: false,
  testsRun: 0,
  expectedTests: 3,
  passed: false,
  output:
    'Traceback (most recent call last):\n' +
    '  File "solution.py", line 2\n' +
    '    retrn n * 2\n' +
    '         ^\n' +
    'SyntaxError: invalid syntax',
};

/** Evento push `study:test-answer-event` — fase started (progresso no status). */
export const fixtureTestAnswerEventStarted: TestAnswerEvent = {
  phase: 'started',
  challengeDir: challengeActive.workspaceDir,
};

/** Evento push `study:test-answer-event` — fase done. */
export const fixtureTestAnswerEventDone: TestAnswerEvent = {
  phase: 'done',
  challengeDir: challengeActive.workspaceDir,
  result: fixtureTestAnswerResult,
};

/** Emite a sequência started→done do canal de eventos dos testes. */
export function emitTestAnswerStream(): void {
  emitMockEvent('study', 'onTestAnswerEvent', fixtureTestAnswerEventStarted as never);
  emitMockEvent('study', 'onTestAnswerEvent', fixtureTestAnswerEventDone as never);
}

// ─── Fase pi (veredito do avaliador) ─────────────────────────────────────────

/** Veredito APROVADO (markdown real — KaTeX + checklist no renderizador). */
export const fixtureVerdictPassed =
  '## Veredito: aprovado\n\n' +
  'A função `dobro(n)` devolve o dobro de $n$ preservando o sinal — o caso ' +
  '`dobro(-3) == -6` cobre a armadilha habitual.\n\n' +
  '- entrada, processamento e retorno corretos;\n' +
  '- sem estado escondido entre chamadas.\n';

/** Veredito PARCIAL (2 de 3 — aponta o caso que falhou). */
export const fixtureVerdictPartial =
  '## Veredito: quase\n\n' +
  'O caso positivo está certo, mas `dobro(-3)` devolveu `6`: o sinal não é ' +
  'preservado quando `n < 0`.\n\n' +
  'Reveja a linha `return n * 2` — em Python, `-3 * 2` dá `-6`; se o seu ' +
  'código usa `abs()`, é aí que o sinal se perde.\n';

/** Corrida do pi com veredito PARCIAL (o output é o próprio veredito). */
export const fixturePiExecutePartial: PiExecuteResult = {
  success: true,
  output: fixtureVerdictPartial,
  executionTimeMs: 2210,
};

/** Corrida do pi REPROVADA por chave ausente (W10 — o ramo com keyHint). */
export const fixturePiExecuteMissingKey: PiExecuteResult = {
  success: false,
  output: '',
  error: 'openrouter: chave da API ausente',
  executionTimeMs: 120,
};

// ─── Submissão do desafio de trilha (track:challenge-submit) ─────────────────

/** Submissão APROVADA (3 de 3 — confete + "Passou com N estrelas"). */
export const fixtureTrackSubmitPassed: TrackSubmitResult = {
  ok: true,
  passed: true,
  testsRun: 3,
  expectedTests: 3,
  output:
    '✔ para_celsius(32) devolve 0.0\n' +
    '✔ para_celsius(212) devolve 100.0\n' +
    '✔ o resultado é float\n' +
    '3 passed in 0.04s',
  checks: [
    { name: 'para_celsius(32) devolve 0.0', passed: true },
    { name: 'para_celsius(212) devolve 100.0', passed: true },
    { name: 'o resultado é float', passed: true },
  ],
  passedCount: 3,
  totalCount: 3,
};

/** Submissão sem NENHUM check (erro de sintaxe — a saída fala por si). */
export const fixtureTrackSubmitNoChecks: TrackSubmitResult = {
  ok: true,
  passed: false,
  testsRun: 0,
  expectedTests: 3,
  output:
    '  File "solution.py", line 2\n' +
    '    retrun (f - 32) * 5 / 9\n' +
    '          ^\n' +
    'SyntaxError: invalid syntax',
  checks: [],
  passedCount: 0,
  totalCount: 0,
};

/** A submissão PARCIAL canónica (2 de 3) — reexport para as histórias. */
export const fixtureTrackSubmitPartial: TrackSubmitResult = fixtureTrackSubmitResult;

/** Análise de domínio do desafio do MÓDULO (o bloco TrackChallengeMastery). */
export const fixtureTrackMastery: TrackModuleMasteryReport = {
  marcadas: ['aula-1', 'aula-2'],
  refazer: ['aula-3'],
  lessons: [
    {
      lessonId: 'aula-1',
      title: 'Variáveis e tipos',
      dominada: true,
      alreadyDone: false,
      motivo: 'testes e código demonstram uso correto de variáveis',
    },
    {
      lessonId: 'aula-2',
      title: 'Condicionais',
      dominada: true,
      alreadyDone: true,
      motivo: 'já estava concluída antes desta tentativa',
    },
    {
      lessonId: 'aula-3',
      title: 'Laços',
      dominada: false,
      alreadyDone: false,
      motivo: 'sem evidência de laços nesta tentativa',
    },
  ],
};

// ─── Rascunhos do painel de trilha (o caminho REAL de retomada) ──────────────

/**
 * A chave do rascunho EXATA que o painel usa (`challengeDraftKeyFor` com o
 * slug da spec carregada) — as histórias semestam com ela e o painel restaura
 * pelo caminho real (ONDA-RETOMAR), sem simulação.
 */
export function trackDraftKey(
  selection: TrackChallengeNavSelection,
  challengeId: string = fixtureTrackChallenge.slug,
): ChallengeDraftKey {
  return {
    trackSlug: selection.trackSlug,
    target: selection.target,
    lessonId: selection.lessonId,
    moduleSlug: selection.moduleSlug,
    challengeId,
  };
}

/** Rascunho de partida (o estado que o "Começar" produz). */
export function trackDraft(over: Partial<ChallengeDraft> = {}): ChallengeDraft {
  return {
    code: 'def para_celsius(f):\n    return (f - 32) * 5 / 9\n',
    filesCode: { 'solution.py': 'def para_celsius(f):\n    return (f - 32) * 5 / 9\n' },
    activeFile: 'solution.py',
    started: true,
    elapsedMs: 52_000,
    starsLeft: 3,
    concluded: null,
    result: null,
    marked: null,
    ...over,
  };
}

/**
 * Semeia o cache de rascunhos com UM estado (reseta primeiro) — é assim que as
 * histórias de veredito/estrelas/draft chegam aos estados sem cliques.
 */
export function seedTrackDraft(
  selection: TrackChallengeNavSelection,
  draft: ChallengeDraft,
  challengeId?: string,
): void {
  __resetChallengeDraftForTests();
  saveChallengeDraft(trackDraftKey(selection, challengeId), draft);
}
