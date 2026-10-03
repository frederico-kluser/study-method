/**
 * src/views/ChallengeView/trackChallengeUi.ts — LÓGICA PURA do desafio de
 * trilha (TrackChallengePanel): sem React, sem DOM, sem IPC — testável em
 * node:test sem jsdom (mesmo molde de src/views/GamesView/gamesUi.ts).
 *
 * Estado/VIEW separados (docs/storybook/STORY-SPEC.md §5): as DERIVAÇÕES que o
 * painel fazia no corpo do render viraram funções puras aqui — o payload do
 * submit multi-arquivo, o ficheiro que falta preencher (o helper W14 do botão
 * desativado) e a triagem do relatório de domínio do módulo. A semântica é a
 * MESMA que vivia no painel (medida pelos testes existentes); o que o painel
 * mantém inline é o que as cercas de fonte fixam no ficheiro (ver
 * tests/challengeRetry.test.ts / tests/challengeDraftCache.test.ts).
 */
import type {
  TrackChallengeGetRequest,
  TrackChallengeSpec,
  TrackModuleMasteryReport,
} from '../../../shared/ipc-contract';
import type { TrackChallengeNavSelection } from '../../lib/challengeNav';

/**
 * O pedido de `track:challenge`/`track:proficiency` de uma seleção — a mesma
 * triagem de target que o `loadSpec` do painel faz (proficiency tem canal
 * próprio; module leva o moduleSlug; lesson leva o lessonId).
 */
export function trackChallengeRequestFor(
  sel: TrackChallengeNavSelection,
): TrackChallengeGetRequest {
  return sel.target === 'proficiency'
    ? { trackSlug: sel.trackSlug, target: 'proficiency' as const, challengeId: sel.challengeId }
    : sel.target === 'module'
      ? {
          trackSlug: sel.trackSlug,
          target: 'module' as const,
          moduleSlug: sel.moduleSlug,
          challengeId: sel.challengeId,
        }
      : {
          trackSlug: sel.trackSlug,
          target: 'lesson' as const,
          lessonId: sel.lessonId,
          challengeId: sel.challengeId,
        };
}

/** Entrada do payload de submit — o estado de edição do painel. */
export interface TrackSubmitPayloadInput {
  selection: TrackChallengeNavSelection;
  spec: Pick<TrackChallengeSpec, 'slug' | 'files'>;
  /** código do editor único (desafio sem `files`). */
  code: string;
  /** código POR ARQUIVO (desafio multi-arquivo). */
  filesCode: Record<string, string>;
  /** arquivo ativo no seletor de abas (multi-arquivo). */
  activeFile: string | null;
  /** estrelas correntes (vai no pedido de proficiência). */
  starsLeft: number;
}

/**
 * Payload de `track:challenge-submit` — ADITIVO rodada 9: o submit envia o
 * código de TODOS os arquivos (files) quando a spec os traz; sem files, envia
 * o `code` único (comportamento histórico). Proficiência ecoa as estrelas.
 */
export function trackSubmitPayload(input: TrackSubmitPayloadInput): {
  trackSlug: string;
  target: string;
  lessonId?: string;
  moduleSlug?: string;
  challengeId: string;
  code: string;
  files?: { path: string; code: string }[];
  stars?: number;
} {
  const { selection, spec, code, filesCode, activeFile, starsLeft } = input;
  const multiFile = spec.files && spec.files.length > 0;
  return {
    trackSlug: selection.trackSlug,
    target: selection.target,
    lessonId: selection.target === 'lesson' ? selection.lessonId : undefined,
    moduleSlug: selection.target === 'module' ? selection.moduleSlug : undefined,
    challengeId: spec.slug,
    code: multiFile ? (filesCode[activeFile ?? ''] ?? '') : code,
    ...(multiFile
      ? { files: spec.files!.map((f) => ({ path: f.path, code: filesCode[f.path] ?? '' })) }
      : {}),
    ...(selection.target === 'proficiency' ? { stars: starsLeft } : {}),
  };
}

/**
 * W14 (auditoria de UX): o "Testar resposta" desativado nunca fica mudo —
 * este helper diz QUAL ficheiro falta preencher (o primeiro vazio em
 * multi-arquivo; a solução, em ficheiro único). `null` quando nada falta.
 */
export function missingSolutionFile(input: {
  multiFile: boolean;
  files?: TrackChallengeSpec['files'];
  code: string;
  filesCode: Record<string, string>;
}): string | null {
  const { multiFile, files, code, filesCode } = input;
  return multiFile
    ? (files?.find((f) => (filesCode[f.path] ?? '').trim().length === 0)?.path ?? null)
    : code.trim().length === 0
      ? 'solution.mjs'
      : null;
}

/**
 * Triagem do relatório de domínio do módulo (target 'module'): o que a
 * tentativa demonstrou (e foi marcado) × o que resta refazer. Sem `mastery`
 * (erro de análise, alvo não-module) os dois vetores saem vazios — o bloco não
 * renderiza e o veredito continua sendo o do runner.
 */
export function splitMastery(mastery: TrackModuleMasteryReport | null): {
  demonstradas: TrackModuleMasteryReport['lessons'];
  refazer: TrackModuleMasteryReport['lessons'];
} {
  return {
    demonstradas:
      mastery === null ? [] : mastery.lessons.filter((l) => l.dominada && !l.alreadyDone),
    refazer: mastery === null ? [] : mastery.lessons.filter((l) => !l.dominada && !l.alreadyDone),
  };
}
