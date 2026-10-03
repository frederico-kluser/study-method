/**
 * src/views/SettingsView/useOrphanTracksPanel.ts — ESTADO do painel de
 * RESQUÍCIOS (state/view split — STORY-SPEC §5).
 *
 * A VIEW (`OrphanTracksPanel.tsx`) é só props; aqui vive a reconciliação
 * `track.orphans` (SWR + timeout), a remoção EXPLÍCITA (`track.purgeOrphans`
 * com os slugs que a tela acabou de mostrar) e a máquina do diálogo de
 * confirmação. Testável por node:test sem jsdom (decisões puras abaixo).
 *
 * Regra de ouro preservada (onda9-cache-reconcilia): o dado só some quando o
 * dono manda; a lista mostra EXATAMENTE o que sairia ANTES de sair, e o main
 * recalcula a reconciliação — nenhum progresso de trilha instalada sai por
 * aqui, nem que a lista da tela esteja velha.
 */
import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type { TrackOrphanEntry } from '../../../shared/ipc-contract';
import { getApi } from '../../lib/apiBridge';
import { IPC_TIMEOUT_MS, isTimeoutError, withTimeout } from '../../lib/ipcTimeout';
import { readCached, writeCached } from './panelCache';

type Feedback =
  | { kind: 'done' }
  | { kind: 'error'; message: string; detail?: string }
  | null;

/**
 * W19 (onda-ux): a FRASE principal é sempre i18n; o texto cru do canal/erro é
 * DETALHE técnico em legenda — nunca a frase que o utilizador lê.
 */
type LoadError = { message: string; detail?: string };

/** Props da view pura (o hook devolve exatamente isto). */
export interface OrphanTracksPanelViewProps {
  /** null = ainda verificando; [] = nada órfão (estado bom e comum). */
  orphans: TrackOrphanEntry[] | null;
  /** Lista já achatada para desenho (orphans ?? []). */
  list: TrackOrphanEntry[];
  loadError: LoadError | null;
  confirmOpen: boolean;
  busy: boolean;
  feedback: Feedback;
  load(): void;
  handleRemove(): Promise<void>;
  setConfirmOpen: Dispatch<SetStateAction<boolean>>;
}

export function useOrphanTracksPanel(): OrphanTracksPanelViewProps {
  const { t } = useTranslation();
  // null = ainda verificando; [] = nada órfão (estado bom e comum).
  // SWR: nasce com a última reconciliação conhecida — a load() abaixo revalida
  // em toda montagem (o main recolcula do banco+disco de verdade; o cache é
  // só o primeiro paint).
  const [orphans, setOrphans] = useState<TrackOrphanEntry[] | null>(
    () => readCached<TrackOrphanEntry[]>('track.orphans') ?? null,
  );
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  /** Recarrega a reconciliação (o "o quê" que o diálogo vai mostrar). */
  const load = useCallback((): void => {
    setLoadError(null);
    withTimeout(getApi().track.orphans(), IPC_TIMEOUT_MS, 'track.orphans')
      .then((res) => {
        if (res.ok === false) {
          setLoadError({
            message: t('translation:settings.orphansLoadFailed'),
            detail: res.error ?? undefined,
          });
          return;
        }
        setOrphans(res.orphans);
        writeCached('track.orphans', res.orphans);
      })
      .catch((err: unknown) => {
        setLoadError({
          message: isTimeoutError(err)
            ? t('translation:settings.orphansTimeout')
            : t('translation:settings.orphansLoadFailed'),
          detail: err instanceof Error ? err.message : String(err),
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => load(), [load]);

  /**
   * Remoção EXPLÍCITA: manda os slugs que a tela ACABOU de mostrar. O main
   * recalcula a reconciliação e ignora qualquer slug que não seja órfão de
   * verdade — nenhum progresso de trilha instalada pode sair por aqui, nem se
   * a lista da tela estiver velha.
   */
  const handleRemove = useCallback(async (): Promise<void> => {
    setBusy(true);
    setFeedback(null);
    try {
      const res = await withTimeout(
        getApi().track.purgeOrphans({ slugs: (orphans ?? []).map((o) => o.slug) }),
        IPC_TIMEOUT_MS,
        'track.purge-orphans',
      );
      // `=== false` (e não truthiness): é a comparação discriminante que estreita
      // a união `TrackPurgeOrphansResult` mesmo sem strictNullChecks no projeto.
      if (res.ok === false) {
        setFeedback({
          kind: 'error',
          // W19 (onda-ux): frase i18n sempre; o texto cru do canal vira
          // DETALHE técnico em legenda (antes era a frase principal).
          message: t('translation:settings.orphansRemoveFailed'),
          detail: res.error,
        });
      } else {
        setFeedback({ kind: 'done' });
        setOrphans([]);
        load();
      }
    } catch (err) {
      setFeedback({
        kind: 'error',
        message: isTimeoutError(err)
          ? t('translation:settings.orphansTimeout')
          : t('translation:settings.orphansRemoveFailed'),
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      // Fecha nos TRÊS caminhos (sucesso, falha de negócio, rejeição) — o
      // Alert de feedback fica ABAIXO do botão, fora do backdrop do modal.
      setConfirmOpen(false);
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orphans, load, t]);

  const list = orphans ?? [];
  return {
    orphans,
    list,
    loadError,
    confirmOpen,
    busy,
    feedback,
    load,
    handleRemove,
    setConfirmOpen,
  };
}
