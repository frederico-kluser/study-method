/**
 * src/views/SettingsView/useLocalAiPanel.ts — ESTADO do painel de LLM local
 * (state/view split — STORY-SPEC §5).
 *
 * A VIEW (`LocalAiPanel.tsx`) é só props; aqui vive o estado do produto: SWR
 * da lista de modelos, deteção de hardware, o fluxo de DOWNLOAD com progresso
 * (subscrição `localAi.onDownloadProgress`), ativação/exclusão de modelos (C3:
 * exclusão só depois da confirmação) e o provedor de feedback (W23: com
 * rollback do valor + do cache em erro).
 */
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  DownloadProgress,
  HardwareInfo,
  LocalModelInfo,
} from '../../../shared/ipc-contract';
import { getApi } from '../../lib/apiBridge';
import { readCached, writeCached } from './panelCache';

export type DownloadTick = Pick<DownloadProgress, 'modelId' | 'percent' | 'speedBps' | 'done' | 'error'>;
/** Campo do provedor de feedback (defaultModelProvider). */
export type FeedbackProvider = 'openrouter' | 'local';

/** Mensagem de erro W19: frase i18n + detalhe técnico OPCIONAL. */
export type LocalAiError = { message: string; detail?: string };

export type LocalAiFeedbackMsg = {
  severity: 'success' | 'error';
  message: string;
  detail?: string;
} | null;

/** Props da view pura (o hook devolve exatamente isto). */
export interface LocalAiPanelViewProps {
  hardware: HardwareInfo | null;
  models: LocalModelInfo[];
  detecting: boolean;
  loadingModels: boolean;
  error: LocalAiError | null;
  /** C3: modelo pendente de exclusão (diálogo de confirmação aberto). */
  pendingDelete: LocalModelInfo | null;
  feedbackMsg: LocalAiFeedbackMsg;
  /** S6: anúncio do resultado da deteção (role="status"). */
  detectMsg: string;
  downloading: string | null;
  downloadTicks: Record<string, DownloadTick>;
  busy: Record<string, boolean>;
  feedbackProvider: FeedbackProvider;
  setPendingDelete: Dispatch<SetStateAction<LocalModelInfo | null>>;
  handleFeedbackProviderChange(next: FeedbackProvider): Promise<void>;
  handleDetect(): Promise<void>;
  handleDownload(modelId: string): Promise<void>;
  handleSetActive(modelId: string): Promise<void>;
  handleConfirmDelete(): Promise<void>;
}

export function useLocalAiPanel(): LocalAiPanelViewProps {
  const { t } = useTranslation();
  // Interpolação ({{var}}): mesmo cast aprovado do ChallengeView (tI) — o `t`
  // tipado (i18next v25 + strictKeyChecks) não expõe a assinatura
  // (chave, options), e a base inteira interpola por este cast.
  const tI = t as unknown as (key: string, options?: Record<string, string | number>) => string;
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  // SWR: nasce com a última lista conhecida — o IPC abaixo revalida em toda
  // montagem. O spinner só roda na 1ª abertura (sem cache); nas seguintes a
  // lista conhecida já pinta no primeiro commit.
  const [models, setModels] = useState<LocalModelInfo[]>(
    () => readCached<LocalModelInfo[]>('localAi.models') ?? [],
  );
  const [detecting, setDetecting] = useState(false);
  const [loadingModels, setLoadingModels] = useState(
    () => readCached('localAi.models') === undefined,
  );
  // W19 (onda-ux): o erro tem frase PRINCIPAL i18n + detalhe técnico opcional —
  // `String(err)` nunca vira a frase da UI.
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null);
  // C3 (onda-ux): exclusão de modelo local só com CONFIRMAÇÃO (nome + tamanho),
  // o mesmo padrão do ProgressPanel/OrphanTracksPanel.
  const [pendingDelete, setPendingDelete] = useState<LocalModelInfo | null>(null);
  // W23 (onda-ux): feedback do "Provedor de feedback" INLINE junto ao seletor
  // (antes fugia para o Alert do fundo da lista, longe da ação).
  const [feedbackMsg, setFeedbackMsg] = useState<{ severity: 'success' | 'error'; message: string; detail?: string } | null>(null);
  // S6 (onda-ux): anúncio do resultado da deteção de hardware (role="status").
  const [detectMsg, setDetectMsg] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadTicks, setDownloadTicks] = useState<Record<string, DownloadTick>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [feedbackProvider, setFeedbackProvider] = useState<FeedbackProvider>(
    () => readCached<FeedbackProvider>('settings.feedbackProvider') ?? 'openrouter',
  );

  // Lê o provedor salvo na montagem (settings:get).
  useEffect(() => {
    let cancelled = false;
    getApi()
      .settings.get()
      .then((settings) => {
        if (cancelled) return;
        if (
          settings?.defaultModelProvider === 'local' ||
          settings?.defaultModelProvider === 'openrouter'
        ) {
          setFeedbackProvider(settings.defaultModelProvider);
          writeCached('settings.feedbackProvider', settings.defaultModelProvider);
        }
      })
      .catch(() => {
        /* settings indisponível — mantém o default openrouter */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFeedbackProviderChange = async (next: FeedbackProvider): Promise<void> => {
    const prev = feedbackProvider;
    setFeedbackProvider(next);
    setFeedbackMsg(null);
    writeCached('settings.feedbackProvider', next);
    try {
      await getApi().settings.set({ defaultModelProvider: next });
      // W23: confirmação INLINE junto ao seletor — a mudança fica dita onde
      // foi feita, não no Alert do fundo da página.
      setFeedbackMsg({ severity: 'success', message: t('translation:localAi.feedbackSaved') });
    } catch (err) {
      setFeedbackProvider(prev);
      // Reverte também o cache — senão a próxima visita pinta o valor novo
      // (que nunca chegou ao disco) até a revalidação corrigir.
      writeCached('settings.feedbackProvider', prev);
      // W19: frase i18n + detalhe técnico opcional (nunca `String(err)` solto).
      setFeedbackMsg({
        severity: 'error',
        message: t('translation:localAi.errorSaveFeedback'),
        detail: String(err),
      });
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoadingModels(true);
    getApi()
      .localAi.list()
      .then((list) => {
        if (!cancelled) {
          setModels(list);
          writeCached('localAi.models', list);
        }
      })
      .catch((err) => {
        // W19: frase i18n + detalhe técnico opcional.
        if (!cancelled) setError({ message: t('translation:localAi.errorList'), detail: String(err) });
      })
      .finally(() => {
        if (!cancelled) setLoadingModels(false);
      });

    const unsubscribe = getApi().localAi.onDownloadProgress((ev) => {
      setDownloadTicks((prev) => ({
        ...prev,
        [ev.modelId]: {
          modelId: ev.modelId,
          percent: ev.percent,
          speedBps: ev.speedBps,
          done: ev.done,
          error: ev.error,
        },
      }));
      if (ev.done) {
        setDownloading(null);
        setModels((prev) =>
          prev.map((m) => (m.id === ev.modelId ? { ...m, downloaded: true } : m)),
        );
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // O cache acompanha QUALQUER mudança local na lista (setActive/delete/loop
  // de download) — um único efeito sincroniza estado → cache.
  useEffect(() => {
    writeCached('localAi.models', models);
  }, [models]);

  const handleDetect = async (): Promise<void> => {
    setDetecting(true);
    setError(null);
    // S6: o anúncio do resultado anterior some enquanto se deteta de novo.
    setDetectMsg('');
    try {
      const info = await getApi().localAi.detectHardware();
      setHardware(info);
      // S6: o resultado é ANUNCIADO (role="status" logo abaixo do botão) —
      // quem usa leitor de tela não fica sem saber que a deteção terminou.
      setDetectMsg(
        tI('translation:localAi.detectDone', { backend: info.backend, ram: info.ramGb.toFixed(1) }),
      );
    } catch (err) {
      // W19: frase i18n + detalhe técnico opcional.
      setError({ message: t('translation:localAi.errorDetect'), detail: String(err) });
    } finally {
      setDetecting(false);
    }
  };

  const handleDownload = async (modelId: string): Promise<void> => {
    setError(null);
    setDownloading(modelId);
    setDownloadTicks((prev) => ({
      ...prev,
      [modelId]: {
        modelId,
        percent: 0,
        speedBps: 0,
        done: false,
        error: undefined,
      },
    }));
    try {
      await getApi().localAi.download(modelId);
    } catch (err) {
      // W19: frase i18n (+ modelo) e detalhe técnico opcional.
      setError({ message: `${t('translation:localAi.errorDownload')} ${modelId}`, detail: String(err) });
      setDownloading(null);
    }
  };

  const handleSetActive = async (modelId: string): Promise<void> => {
    setError(null);
    setBusy((b) => ({ ...b, [modelId]: true }));
    try {
      await getApi().localAi.setActive(modelId);
      setModels((prev) => prev.map((m) => ({ ...m, active: m.id === modelId })));
    } catch (err) {
      setError({ message: `${t('translation:localAi.errorActivate')} ${modelId}`, detail: String(err) });
    } finally {
      setBusy((b) => ({ ...b, [modelId]: false }));
    }
  };

  const handleDelete = async (modelId: string): Promise<void> => {
    setError(null);
    setBusy((b) => ({ ...b, [modelId]: true }));
    try {
      await getApi().localAi.delete(modelId);
      setModels((prev) =>
        prev.map((m) =>
          m.id === modelId ? { ...m, downloaded: false, active: false } : m,
        ),
      );
    } catch (err) {
      setError({ message: `${t('translation:localAi.errorRemove')} ${modelId}`, detail: String(err) });
    } finally {
      setBusy((b) => ({ ...b, [modelId]: false }));
    }
  };

  /**
   * C3 (onda-ux): a exclusão só acontece DEPOIS do diálogo de confirmação
   * (nome + tamanho do modelo) — mesmo padrão do ProgressPanel e do
   * OrphanTracksPanel. O diálogo fecha e a remoção corre em seguida.
   */
  const handleConfirmDelete = async (): Promise<void> => {
    const model = pendingDelete;
    setPendingDelete(null);
    if (model) await handleDelete(model.id);
  };
  return {
    hardware,
    models,
    detecting,
    loadingModels,
    error,
    pendingDelete,
    feedbackMsg,
    detectMsg,
    downloading,
    downloadTicks,
    busy,
    feedbackProvider,
    setPendingDelete,
    handleFeedbackProviderChange,
    handleDetect,
    handleDownload,
    handleSetActive,
    handleConfirmDelete,
  };
}
