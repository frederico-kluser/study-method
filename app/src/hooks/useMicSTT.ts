/**
 * src/hooks/useMicSTT.ts — captura do microfone + streaming de transcrição
 * local para o Study Method (onda 8, voz local).
 *
 * getUserMedia → AudioContext → downsampleTo16k (Web Audio native rate) →
 * `api.stt.streamChunk` (Float32Array mono 16 kHz) → `api.stt.streamStop` para
 * o texto final; partias chegam por `api.stt.onStreamPartial`.
 *
 * NÃO está montado em nenhuma view — a UI MUI da onda 9/10 integra. Sem jsdom.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getApi } from '../lib/apiBridge';
import { downsampleTo16k } from '../shared/utils/audioResample.utils';

/** Estado da captura exposto pelo hook. */
export interface MicSttState {
  transcribing: boolean;
  /** Última transcrição parcial CUMULATIVA recebida do engine. */
  partial: string;
  error?: string;
}

const MAX_CHUNK_SAMPLES = 48000; // ≤ 3 s @ 16 kHz — limite do contrato IPC.

/**
 * Hook de streaming de STT local. `start()` pede o mic, abre o AudioContext,
 * resampleia cada frame para 16 kHz mono e o envia por `stt:stream-chunk`;
 * `stop()` finaliza e devolve a transcrição final.
 */
export function useMicSTT(passiveLocale = 'pt-BR'): {
  transcribing: boolean;
  partial: string;
  error?: string;
  start: () => Promise<void>;
  stop: () => Promise<string>;
  cancel: () => Promise<void>;
} {
  const [transcribing, setTranscribing] = useState(false);
  const [partial, setPartial] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  // Refs para o ciclo de vida dentro dos callbacks (não re-renderizar).
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionIdRef = useRef<string>('mic');
  const disposedRef = useRef(false);
  // Guarda o `partial` mais recente no final, sem estado no stop.
  const lastPartialRef = useRef('');

  useEffect(() => {
    disposedRef.current = false;
    const unsub = getApi().stt.onStreamPartial((ev) => {
      setPartial(ev.text);
      lastPartialRef.current = ev.text;
    });
    const unsubErr = getApi().stt.onEngineStatus((ev) => {
      if (ev.status === 'dead') setError('Engine de STT indisponível (crashes demais).');
    });
    return () => {
      unsub();
      unsubErr();
      disposedRef.current = true;
      void teardown();
    };
    // teardown é estável o bastante na montagem; es-lint perdoa a omissão.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const teardown = async (): Promise<void> => {
    try {
      processorRef.current?.disconnect();
    } catch { /* já liberado */ }
    try {
      sourceRef.current?.disconnect();
    } catch { /* já liberado */ }
    try {
      await audioCtxRef.current?.close();
    } catch { /* já fechado */ }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current = null;
    sourceRef.current = null;
    processorRef.current = null;
  };

  const start = useCallback(async (): Promise<void> => {
    if (transcribing) return;
    setError(undefined);
    setPartial('');
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = mediaStream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(mediaStream);
      sourceRef.current = source;
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (ev) => {
        const input = ev.inputBuffer.getChannelData(0);
        if (input.length === 0) return;
        const mono16k = downsampleTo16k(input, ctx.sampleRate);
        // Mantém os chunks ≤ 48000 amostras mesmo se o frame for maior.
        let offset = 0;
        while (offset < mono16k.length) {
          const slice = mono16k.subarray(offset, offset + MAX_CHUNK_SAMPLES);
          getApi().stt.streamChunk({ sessionId: sessionIdRef.current, samples: slice });
          offset += MAX_CHUNK_SAMPLES;
        }
      };

      source.connect(processor);
      processor.connect(ctx.destination);

      await getApi().stt.streamStart({ locale: passiveLocale, sessionId: sessionIdRef.current });
      setTranscribing(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Não foi possível iniciar a captura de voz: ${msg}`);
      await teardown();
    }
  }, [passiveLocale, transcribing]);

  const stop = useCallback(async (): Promise<string> => {
    if (!transcribing) return lastPartialRef.current;
    let finalText = lastPartialRef.current;
    try {
      const res = await getApi().stt.streamStop(sessionIdRef.current);
      const data = (res as { success?: boolean; data?: { text?: string } }).data;
      if (res && (res as { success?: boolean }).success && data?.text) {
        finalText = data.text;
        setPartial(finalText);
        lastPartialRef.current = finalText;
      }
    } catch /* ignore stop errors */ {
      /* nada */
    } finally {
      await teardown();
      setTranscribing(false);
    }
    return finalText;
  }, [transcribing]);

  const cancel = useCallback(async (): Promise<void> => {
    try {
      await getApi().stt.streamCancel(sessionIdRef.current);
    } catch { /* ignore */ }
    await teardown();
    setTranscribing(false);
  }, []);

  return { transcribing, partial, error, start, stop, cancel };
}