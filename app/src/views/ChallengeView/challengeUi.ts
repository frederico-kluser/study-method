/**
 * src/views/ChallengeView/challengeUi.ts — LÓGICA PURA da tela de Desafio
 * (ChallengeView): sem React, sem DOM, sem IPC — testável em node:test sem
 * jsdom (mesmo molde de src/views/GamesView/gamesUi.ts).
 *
 * O que vive aqui é o que era derivação/decisão no corpo do componente e
 * ganhou vida própria na separação STATE/VIEW (docs/storybook/STORY-SPEC.md
 * §5): o acumulador de blocos de streaming do pi, a escolha do arquivo
 * principal do workspace, a identidade da tentativa e o veredito do bloco de
 * feedback. Nada aqui altera comportamento — cada função preserva, byte a
 * byte, a semântica que tinha no corpo da ChallengeView.
 */
import type { TestAnswerResult, WorkspaceFile } from '../../../shared/ipc-contract';

/**
 * Fases de streaming do pi exibidas como blocos no painel de feedback.
 * ('error' é o bloco de erro do stream; 'tool' é a linha de ferramenta.)
 */
export interface StreamingBlock {
  kind: 'thinking' | 'text' | 'tool' | 'error';
  text: string;
}

/**
 * Acumula texto de streaming por bloco do mesmo tipo consecutivo — evita criar
 * um bloco por delta (o pi manda muitos deltas pequenos).
 */
export function appendDelta(
  blocks: StreamingBlock[],
  kind: StreamingBlock['kind'],
  delta: string,
): StreamingBlock[] {
  const last = blocks[blocks.length - 1];
  if (last && last.kind === kind) {
    return [...blocks.slice(0, -1), { ...last, text: last.text + delta }];
  }
  return [...blocks, { kind, text: delta }];
}

/**
 * Blocos VISÍVEIS no painel: sem o disclosure aberto, o 'thinking' fica
 * escondido (o botão "Pensamento" revela-o); o resto aparece sempre.
 */
export function streamBlocksVisible(
  blocks: StreamingBlock[],
  showThinking: boolean,
): StreamingBlock[] {
  return blocks.filter((b) => (showThinking ? true : b.kind !== 'thinking'));
}

/** Há conteúdo de stream para a caixa monoespaçada? (texto/ferramenta/erro) */
export function hasStreamOutput(blocks: StreamingBlock[]): boolean {
  return blocks.filter((b) => b.kind === 'text' || b.kind === 'tool' || b.kind === 'error').length > 0;
}

/** Identidade de um desafio (key de idempotência da tentativa). */
export interface ChallengeIdentity {
  challengeId: string;
  workspaceDir: string;
}

/**
 * Key `${challengeId}:${workspaceDir}` — a identidade usada pelas guardas de
 * idempotência do mark e de corrida (troca A→B sem misturar chaves).
 */
export function challengeAttemptKey(ch: ChallengeIdentity): string {
  return `${ch.challengeId}:${ch.workspaceDir}`;
}

/**
 * Path do arquivo de código "principal" do workspace (para o pi ver o stub):
 * o primeiro candidato de código (não-diretório, extensão de linguagem).
 */
export function primaryCodePathOf(
  files: ReadonlyArray<Pick<WorkspaceFile, 'path' | 'dir'>>,
): string {
  const candidates = files.filter(
    (f) => !f.dir && /\.(py|js|ts|jsx|tsx|go|rs|c|rb|sql)$/i.test(f.path),
  );
  return candidates.length ? candidates[0].path : '';
}

/** Severidade do bloco de veredito do avaliador (docs §8 / S1). */
export type VerdictSeverity = 'success' | 'warning' | 'error';

/**
 * Semântica das contagens no veredito: `testsRun` é lido pela UI como "casos
 * que passaram" — sucesso quando passou, warning quando PARCIAL (alguns
 * passaram), error quando NADA passou.
 */
export function verdictSeverity(
  testResult: Pick<TestAnswerResult, 'passed' | 'testsRun'> | null,
): VerdictSeverity {
  if (testResult?.passed) return 'success';
  if (testResult && testResult.testsRun > 0) return 'warning';
  return 'error';
}
