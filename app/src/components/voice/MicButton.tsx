/**
 * src/components/voice/MicButton.tsx — botão de transcrição por voz (STT local).
 *
 * Onda 8 (voz local). Componente SIMPLES, PRONTO para a UI MUI da onda 9/10
 * montar — NÃO está montado em nenhuma view. Usa o `useMicSTT` hook e oferece
 * chips de língua pt-BR/en (catálogo STT). Sem jsdom.
 */
import { useMemo, useState } from 'react';
import { useMicSTT } from '../../hooks/useMicSTT';

export interface MicButtonOptions {
  /** Bem-vinda para acessibilidade e para os testes visuais. */
  ariaLabel?: string;
  /** Idioma inicial (default pt-BR). Determina o hint de língua do modelo. */
  locale?: 'pt-BR' | 'en';
  /** onTranscribed(text) — disparado quando uma transcrição final chega. */
  onTranscribed?: (text: string) => void;
  /** onError(err) — falha de captura/streaming. */
  onError?: (err: string) => void;
}

/**
 * Botão toggle: clica para gravar, clica de novo para parar. Exibe o partial
 * acumulado e um selector simples de língua (chips pt-BR/en).
 */
export function MicButton(options: MicButtonOptions = {}): React.JSX.Element {
  const { ariaLabel = 'Transcrever voz', locale = 'pt-BR', onTranscribed, onError } = options;
  const [lang, setLang] = useState<'pt-BR' | 'en'>(locale);
  const { transcribing, partial, error, start, stop, cancel } = useMicSTT(lang);

  const languages = useMemo<Array<'pt-BR' | 'en'>>(() => ['pt-BR', 'en'], []);

  const handleToggle = async (): Promise<void> => {
    if (transcribing) {
      const text = await stop();
      if (text) onTranscribed?.(text);
    } else {
      await start();
      if (error) onError?.(error);
    }
  };

  return (
    <div
      data-testid="mic-button"
      style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}
    >
      <button
        aria-label={ariaLabel}
        aria-pressed={transcribing}
        disabled={!!error}
        onClick={() => void handleToggle()}
        style={{ borderRadius: 999, padding: '8px 18px', cursor: 'pointer' }}
      >
        {transcribing ? '⏹ Parar' : '🎤 Falar'}
      </button>
      <div style={{ display: 'flex', gap: 4 }}>
        {languages.map((l) => (
          <button
            key={l}
            aria-pressed={lang === l}
            onClick={() => setLang(l)}
            style={{
              border: lang === l ? '1px solid #999' : '1px solid #555',
              borderRadius: 999,
              padding: '2px 8px',
              fontSize: 12,
              background: lang === l ? 'rgba(128,128,128,0.3)' : 'transparent',
            }}
          >
            {l === 'pt-BR' ? '🇧🇷 pt' : '🇺🇸 en'}
          </button>
        ))}
      </div>
      {transcribing && <span style={{ fontSize: 13 }} aria-live="polite">{partial || '…'}</span>}
      {error && <span style={{ fontSize: 12, color: '#d33' }}>{error}</span>}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {transcribing && (
          <button onClick={() => void cancel()} aria-label="Cancelar transcrição">
            ✕
          </button>
        )}
      </div>
    </div>
  );
}