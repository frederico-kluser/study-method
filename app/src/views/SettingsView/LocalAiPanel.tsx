/**
 * src/views/SettingsView/LocalAiPanel.tsx — painel de LLM local.
 *
 * - "Detectar hardware": `localAi.detectHardware` → mostra backend/RAM/VRAM/CPU.
 * - Lista de modelos (localAi.list): cards com label/quant/tamanho e badges
 *   Recomendado/Ativo/Baixado.
 * - Botão "Baixar": `localAi.download(modelId)`; a barra de progresso reativa
 *   via `localAi.onDownloadProgress` (DownloadProgress).
 * - Botão "Usar" (setActive) e deletar (delete) quando já baixado.
 */
import { useEffect, useState, type ReactElement } from 'react';
import type {
  DownloadProgress,
  HardwareInfo,
  LocalModelInfo,
} from '../../../shared/ipc-contract';
import { getApi } from '../../lib/apiBridge';
import { formatBytes, formatModelLabel, formatPercent, formatSpeedBps } from '../../lib/format';
import { InlineSpinner, StatusText } from './FormControls';

type DownloadTick = Pick<DownloadProgress, 'modelId' | 'percent' | 'speedBps' | 'done' | 'error'>;

function HardwareView({ info }: { info: HardwareInfo }): ReactElement {
  return (
    <dl className="hw-grid">
      <div className="hw-grid__item">
        <dt>Backend</dt>
        <dd>{info.backend}</dd>
      </div>
      <div className="hw-grid__item">
        <dt>RAM</dt>
        <dd>{info.ramGb.toFixed(1)} GB</dd>
      </div>
      <div className="hw-grid__item">
        <dt>VRAM</dt>
        <dd>{info.vramGb == null ? 'n/d' : `${info.vramGb.toFixed(1)} GB`}</dd>
      </div>
      <div className="hw-grid__item">
        <dt>CPU</dt>
        <dd>{info.cpuModel}</dd>
      </div>
    </dl>
  );
}

export function LocalAiPanel(): ReactElement {
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [models, setModels] = useState<LocalModelInfo[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [error, setError] = useState<string>('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadTicks, setDownloadTicks] = useState<Record<string, DownloadTick>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  // Provedor de feedback do desafio (settings.defaultModelProvider — órfão até a
  // onda 5; agora lido aqui e consumido pelo fluxo de feedback).
  const [feedbackProvider, setFeedbackProvider] = useState<'deepseek' | 'local'>('deepseek');

  // Lê o provedor salvo na montagem (settings:get).
  useEffect(() => {
    let cancelled = false;
    getApi()
      .settings.get()
      .then((settings) => {
        if (cancelled) return;
        if (settings?.defaultModelProvider === 'local' || settings?.defaultModelProvider === 'deepseek') {
          setFeedbackProvider(settings.defaultModelProvider);
        }
      })
      .catch(() => {
        /* settings indisponível — mantém o default deepseek */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFeedbackProviderChange = async (next: 'deepseek' | 'local'): Promise<void> => {
    const prev = feedbackProvider;
    setFeedbackProvider(next);
    try {
      await getApi().settings.set({ defaultModelProvider: next });
    } catch (err) {
      setFeedbackProvider(prev); // volta ao valor anterior se a escrita falhar
      setError(`Falha ao salvar o provedor de feedback: ${String(err)}`);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoadingModels(true);
    getApi()
      .localAi.list()
      .then((list) => {
        if (!cancelled) setModels(list);
      })
      .catch((err) => {
        if (!cancelled) setError(`Não foi possível listar os modelos: ${String(err)}`);
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
        // Atualiza a lista para refletir downloaded.
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

  const handleDetect = async (): Promise<void> => {
    setDetecting(true);
    setError('');
    try {
      const info = await getApi().localAi.detectHardware();
      setHardware(info);
    } catch (err) {
      setError(`Falha ao detectar hardware: ${String(err)}`);
    } finally {
      setDetecting(false);
    }
  };

  const handleDownload = async (modelId: string): Promise<void> => {
    setError('');
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
      setError(`Falha ao iniciar download de ${modelId}: ${String(err)}`);
      setDownloading(null);
    }
  };

  const handleSetActive = async (modelId: string): Promise<void> => {
    setError('');
    setBusy((b) => ({ ...b, [modelId]: true }));
    try {
      await getApi().localAi.setActive(modelId);
      setModels((prev) =>
        prev.map((m) => ({ ...m, active: m.id === modelId })),
      );
    } catch (err) {
      setError(`Falha ao ativar ${modelId}: ${String(err)}`);
    } finally {
      setBusy((b) => ({ ...b, [modelId]: false }));
    }
  };

  const handleDelete = async (modelId: string): Promise<void> => {
    setError('');
    setBusy((b) => ({ ...b, [modelId]: true }));
    try {
      await getApi().localAi.delete(modelId);
      setModels((prev) => prev.map((m) => (m.id === modelId ? { ...m, downloaded: false, active: false } : m)));
    } catch (err) {
      setError(`Falha ao remover ${modelId}: ${String(err)}`);
    } finally {
      setBusy((b) => ({ ...b, [modelId]: false }));
    }
  };

  return (
    <div className="localai">
      <label className="form-field localai__provider">
        <span className="form-field__label">Provedor de feedback do desafio</span>
        <select
          className="form-field__input"
          value={feedbackProvider}
          onChange={(e) =>
            void handleFeedbackProviderChange(e.target.value === 'local' ? 'local' : 'deepseek')
          }
        >
          <option value="deepseek">DeepSeek (nuvem)</option>
          <option value="local">Modelo local</option>
        </select>
        <span className="settings__hint">
          O modelo local é usado como avaliador do desafio quando selecionado aqui E um modelo
          local está ativo. Sem modelo ativo, o feedback usa o DeepSeek (nuvem).
        </span>
      </label>

      <div className="localai__toolbar">
        <button
          type="button"
          className="btn btn--secondary"
          disabled={detecting}
          onClick={handleDetect}
        >
          {detecting ? <InlineSpinner text="Detectando…" /> : 'Detectar hardware'}
        </button>
        {hardware ? <HardwareView info={hardware} /> : null}
      </div>

      {loadingModels ? (
        <StatusText tone="muted">
          <InlineSpinner text="Carregando modelos…" />
        </StatusText>
      ) : null}

      <div className="model-grid">
        {models.map((model) => {
          const tick = downloadTicks[model.id];
          const isDownloading = downloading === model.id || (tick && !tick.done);
          const pct = tick ? formatPercent(tick.percent) : 0;
          return (
            <article className="model-card" key={model.id}>
              <div className="model-card__head">
                <h4 className="model-card__title">{formatModelLabel(model)}</h4>
                <div className="model-card__badges">
                  {model.recommended ? (
                    <span className="badge badge--accent">Recomendado</span>
                  ) : null}
                  {model.active ? (
                    <span className="badge badge--ok">Ativo</span>
                  ) : null}
                  {model.downloaded ? (
                    <span className="badge badge--muted">Baixado</span>
                  ) : null}
                </div>
              </div>
              <p className="model-card__size">{formatBytes(model.sizeBytes)}</p>

              {isDownloading && tick ? (
                <div className="download-bar">
                  <div className="download-bar__track">
                    <div
                      className="download-bar__fill"
                      style={{ width: `${pct}%` }}
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      {pct}%
                    </div>
                  </div>
                  <div className="download-bar__meta">
                    {formatSpeedBps(tick.speedBps)}
                    {tick.error ? <span className="download-bar__error">{tick.error}</span> : null}
                  </div>
                </div>
              ) : null}

              <div className="model-card__actions">
                {model.downloaded ? (
                  <>
                    <button
                      type="button"
                      className="btn btn--primary"
                      disabled={busy[model.id] || model.active}
                      onClick={() => handleSetActive(model.id)}
                    >
                      {model.active
                        ? 'Em uso'
                        : busy[model.id]
                          ? 'Ativando…'
                          : 'Usar'}
                    </button>
                    <button
                      type="button"
                      className="btn btn--danger"
                      disabled={busy[model.id]}
                      aria-label={`Remover ${model.id}`}
                      onClick={() => handleDelete(model.id)}
                    >
                      Excluir
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={isDownloading}
                    onClick={() => handleDownload(model.id)}
                  >
                    {isDownloading ? 'Baixando…' : 'Baixar'}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {error ? <StatusText tone="danger">{error}</StatusText> : null}
    </div>
  );
}