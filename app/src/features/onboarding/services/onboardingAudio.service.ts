/**
 * src/features/onboarding/services/onboardingAudio.service.ts
 *
 * Narração do tutorial via TTS local (Piper — `localTts.generate`).
 *
 * Onda 16 — ADAPTAÇÃO do sistema de áudio do ondokai (que usava MP3 por passo)
 * ao nosso TTS on-device: em vez de arquivos, geramos a fala do texto do passo
 * em runtime com a voz da língua ativa. O comportamento é fiel ao ondokai:
 *  - toca a narração após a mudança de passo (com pequeno atraso p/ a animação);
 *  - mute persiste em `study-method-onboarding-audio-muted` e para a narração;
 *  - ausência de modelo/TTS NUNCA é erro: resolve em silêncio (só texto + botão
 *    de mute com ícone de silêncio).
 *
 * 100% seguro sem o TTS configurado — as views nunca dependem do áudio.
 */

import { getApi } from '../../../lib/apiBridge';
import { defaultVoiceFor } from '../../../shared/constants/ttsModels.constants';

const MUTE_KEY = 'study-method-onboarding-audio-muted';

let currentAudio: HTMLAudioElement | null = null;
let requestId = 0;

export function isAudioMuted(): boolean {
  try {
    return globalThis.localStorage?.getItem(MUTE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setAudioMuted(muted: boolean): void {
  try {
    globalThis.localStorage?.setItem(MUTE_KEY, String(muted));
  } catch {
    /* ignore */
  }
  if (muted) stopOnboardingAudio();
}

export function toggleAudioMuted(): boolean {
  const next = !isAudioMuted();
  setAudioMuted(next);
  return next;
}

/** Para a narração atual (se houver). */
export function stopOnboardingAudio(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
  requestId += 1;
}

function dataUrlForWav(base64: string): string {
  return `data:audio/wav;base64,${base64}`;
}

/**
 * Fala um texto (título + descrição do passo) com a voz da língua ativa.
 * Resolve em silêncio quando o TTS não está disponível, está mudo, ou o texto
 * está vazio. Nunca lança.
 */
export async function speakOnboardingText(
  text: string,
  locale: string,
): Promise<void> {
  if (!text || text.trim().length === 0 || isAudioMuted()) return;

  const myRequest = ++requestId;
  stopOnboardingAudio();

  let res;
  try {
    res = await getApi().localTts.generate({
      requestId: `onboarding-${myRequest}`,
      modelId: locale === 'pt-BR' ? 'piper-pt-br-faber' : 'piper-en-amy',
      text: text.slice(0, 4096),
      defaultVoiceId: defaultVoiceFor(locale),
      provider: 'local',
    });
  } catch {
    // TTS indisponível — silencioso.
    return;
  }

  if (myRequest !== requestId || isAudioMuted() || !res?.audioBase64) return;

  const audio = new Audio(dataUrlForWav(res.audioBase64));
  currentAudio = audio;
  try {
    await audio.play();
  } catch {
    currentAudio = null;
  }
}