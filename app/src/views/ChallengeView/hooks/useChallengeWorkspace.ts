/**
 * src/views/ChallengeView/hooks/useChallengeWorkspace.ts — o WORKSPACE do
 * desafio ativo (enunciado + ficheiros) da ChallengeView.
 *
 * Separação STATE/VIEW (docs/storybook/STORY-SPEC.md §5): o estado do
 * workspace e o IPC de carga vivem aqui; a view recebe `{ files, statement,
 * statementError, loadWorkspace, primaryCodePath }`. Semântica preservada byte
 * a byte do corpo da ChallengeView:
 *
 *  - o README (enunciado) tem severidade 'warning' quando indisponível (o
 *    desafio continua utilizável W11); a falha de workspace é 'error';
 *  - ambos os canais têm teto de tempo (C4: canal mudo vira erro claro com
 *    "Tentar de novo");
 *  - cada carga RECOMEÇA as fases a jusante (teste/pi) — quem faz esse reset é
 *    o `onResetDownstream` do chamador (o container liga-o ao hook de submit).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChallengeInfo, WorkspaceFile } from '../../../../shared/ipc-contract';
import { getApi } from '../../../lib/apiBridge';
import { IPC_TIMEOUT_MS, isTimeoutError, withTimeout } from '../../../lib/ipcTimeout';
import { primaryCodePathOf } from '../challengeUi';

/** Faz o cast para o payload de runtime (ver nota sobre ApiSchema). */
type ReadArgs = { workspaceDir: string; path: string };

export interface ChallengeStatementError {
  text: string;
  severity: 'warning' | 'error';
}

export interface UseChallengeWorkspaceInput {
  /** Desafio ativo (null = nenhum). */
  challenge: ChallengeInfo | null;
  /** Reset das fases a jusante (teste/pi) no início de cada carga. */
  onResetDownstream?: () => void;
}

export interface UseChallengeWorkspace {
  files: WorkspaceFile[];
  statement: string;
  statementError: ChallengeStatementError | null;
  loadWorkspace: (ch: ChallengeInfo) => Promise<void>;
  /** Path do arquivo de código "principal" (para o pi ver o stub). */
  primaryCodePath: string;
}

export function useChallengeWorkspace(input: UseChallengeWorkspaceInput): UseChallengeWorkspace {
  const { t } = useTranslation();
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [statement, setStatement] = useState('');
  // Erro do carregamento do workspace, com severidade (W11): o enunciado
  // indisponível é 'warning' (o desafio continua utilizável); falha de
  // workspace é 'error'. Os dois renderizam como Alert com "Tentar de novo".
  const [statementError, setStatementError] = useState<ChallengeStatementError | null>(null);

  // Último callback de reset (identidade pode mudar a cada render; o
  // `loadWorkspace` é estável e lê sempre o mais recente).
  const resetRef = useRef(input.onResetDownstream);
  resetRef.current = input.onResetDownstream;

  // Carrega arquivos + enunciado do desafio ativo.
  const loadWorkspace = useCallback(async (ch: ChallengeInfo): Promise<void> => {
    setStatement('');
    setStatementError(null);
    setFiles([]);
    // Reset das fases a jusante (antes era `setTestResult/setBlocks/…` no
    // corpo da ChallengeView — agora o container liga este callback).
    resetRef.current?.();
    try {
      const api = getApi();
      // README (C4: com teto de tempo — canal mudo vira erro claro + retry):
      try {
        const readme = await withTimeout(
          (api.study.readWorkspaceFile as (a: ReadArgs) => Promise<string>)(
            { workspaceDir: ch.workspaceDir, path: 'README.md' },
          ),
          IPC_TIMEOUT_MS,
          'study.readWorkspaceFile',
        );
        setStatement(readme);
      } catch (err) {
        setStatementError({
          text: isTimeoutError(err)
            ? t('translation:challenge.trackLoadTimeout')
            : t('translation:challenge.statementUnavailable'),
          severity: 'warning',
        });
      }
      // Arquivos (mesmo teto):
      const wsFiles = await withTimeout(
        (api.study.listWorkspaceFiles as (a: { workspaceDir: string }) => Promise<WorkspaceFile[]>)({
          workspaceDir: ch.workspaceDir,
        }),
        IPC_TIMEOUT_MS,
        'study.listWorkspaceFiles',
      );
      setFiles(wsFiles);
    } catch (err) {
      setStatementError({
        text: isTimeoutError(err)
          ? t('translation:challenge.trackLoadTimeout')
          : `${t('translation:challenge.workspaceLoadError')}: ${String(err)}`,
        severity: 'error',
      });
    }
  }, []);

  useEffect(() => {
    if (input.challenge) void loadWorkspace(input.challenge);
  }, [input.challenge, loadWorkspace]);

  // Path do arquivo de código "principal" do workspace (para o pi ver o stub).
  const primaryCodePath = useMemo(() => primaryCodePathOf(files), [files]);

  return { files, statement, statementError, loadWorkspace, primaryCodePath };
}
