/**
 * src/components/voice/SpeakButton.tsx — botão de leitura (TTS local).
 *
 * Onda 8 (voz local). Componente SIMPLES, PRONTO para a UI MUI da onda 9/10
 * montar — NÃO está montado em nenhuma view. Chama `api.localTts.generate`
 * (provider 'local') e reproduz o WAV base64 via `<audio>`. O modelId é
 * resolvido por língua: pt-BR → piper-pt-br-faber, en → piper-en-amy (função
 * pura `defaultVoiceFor`, testada). Sem jsdom.
 */
import { useMemo, useRef, useState } from 'react';
import { getApi } from '../../lib/apiBridge';
import {
  defaultVoiceFor,
  TTS_SPEED_DEFAULT,
  TTS_MAX_TEXT_LENGTH,
} from '../../shared/constants/ttsModels.constants';

export interface SpeakButtonOptions {
  /** O texto a ser falado. */
  text: string;
  /** Idioma da UI — resolve a voz Piper (default pt-BR). */
  locale?: 'pt-BR' | 'en';
  /** Velocidade (0.5..2.0); omissa usa 1.0. */
  speed?: number;
  ariaLabel?: string;
  /** onPlaybackEnd() — quando o áudio terminar de tocar. */
  onPlaybackEnd?: () => void;
}

function dataUrlForWav(base64: string, mime = 'audio/wav'): string {
  return `data:${mime};base64,${base64}`;
}

/**
 * Botão de leitura: ao clicar, gera o áudio do `text` com a voz da língua
 * escolhida e toca. Um segundo clique cancela.
 */
export function SpeakButton(options: SpeakButtonOptions): React.JSX.Element {
  const { text, locale = 'pt-BR', speed, ariaLabel = 'Falar', onPlaybackEnd } = options;
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const requestIdRef = useRef<string>(`speak-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const modelId = useMemo(() => {
    // pt-BR → piper-pt-br-faber; en → piper-en-amy.
    const voice = defaultVoiceFor(locale);
    return voice === 'faber' ? 'piper-pt-br-faber' : 'piper-en-amy';
  }, [locale]);

  const handleToggle = async (): Promise<void> => {
    if (speaking) {
      await getApi().localTts.cancelGenerate(requestIdRef.current);
      audioRef.current?.pause();
      setSpeaking(false);
      return;
    }
    if (!text || text.length === 0) return;
    if (text.length > TTS_MAX_TEXT_LENGTH) {
      setError(`Texto muito longo (max ${TTS_MAX_TEXT_LENGTH} caracteres).`);
      return;
    }
    setError(undefined);
    setSpeaking(true);
    requestIdRef.current = `speak-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      const res = await getApi().localTts.generate({
        requestId: requestIdRef.current,
        modelId,
        text,
        defaultVoiceId: defaultVoiceFor(locale),
        speed: speed ?? TTS_SPEED_DEFAULT,
        provider: 'local',
      });
      const audio = new Audio(dataUrlForWav(res.audioBase64));
      audioRef.current = audio;
      audio.addEventListener('ended', () => {
        setSpeaking(false);
        onPlaybackEnd?.();
      }, { once: true });
      await audio.play();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`TTS indisponível: ${msg}`);
      setSpeaking(false);
    }
  };

  return (
    <div data-testid="speak-button" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <button
        aria-label={ariaLabel}
        aria-pressed={speaking}
        disabled={!text || text.length === 0}
        onClick={() => void handleToggle()}
        style={{ borderRadius: 999, padding: '8px 18px', cursor: 'pointer' }}
      >
        {speaking ? '⏹ Parar' : '🔊 Falar'}
      </button>
      {error && <span style={{ fontSize: 12, color: '#d33' }}>{error}</span>}
    </div>
  );
}