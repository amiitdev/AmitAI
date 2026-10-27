import { useEffect, useReducer } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { hasTTS, speak, stopSpeaking, speakLocal, stopLocal } from './native';
import { Settings } from '../types';

/** Module-level copy of the settings that matter for speaking, so the
 *  per-message hook does not need to thread settings through every bubble. */
let voiceConfig: Pick<Settings, 'ttsProvider' | 'ttsVoice' | 'ttsSpeed'> = {
  ttsProvider: 'device',
  ttsVoice: 0,
  ttsSpeed: 1,
};

export function configureVoice(cfg: typeof voiceConfig) {
  voiceConfig = cfg;
}

/** Strip markdown so the engine reads prose, not formatting noise. */
function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' code block ')
    // table separator rows (|---|---|) carry no meaning when spoken
    .replace(/^\s*\|?[\s:|-]{4,}\|?\s*$/gm, '')
    // remaining table cells read better as a list than as pipes
    .replace(/\|/g, ', ')
    .replace(/[*_#>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2500);
}

/** Turn a rejected native call into something worth showing the user. */
function describeSpeechError(e: any): string {
  const raw = String(e?.message ?? e ?? '');
  if (/localtts_/.test(raw)) {
    return 'The offline voice could not run on this phone - pick Device voice in Settings.';
  }
  if (/network|timeout|resolve host|connect/i.test(raw)) {
    return 'No network - check the connection';
  }
  return raw || 'Speech failed';
}

/** Speak with whichever engine the user picked, under a caller-chosen id. */
export async function speakWithConfig(text: string, utteranceId: string): Promise<void> {
  const clean = cleanForSpeech(text);
  if (!clean) return;

  const engine = voiceConfig.ttsProvider;
  if (engine === 'piper' || engine === 'kitten') {
    await speakLocal(clean, engine, voiceConfig.ttsVoice, voiceConfig.ttsSpeed, utteranceId);
    return;
  }
  speak(clean, voiceConfig.ttsSpeed, utteranceId);
}

/**
 * One-speaker-at-a-time TTS state.
 *
 * Every event from the native side carries the utterance id we handed it, so a
 * "finished" event for an utterance we already replaced can never be mistaken
 * for the end of the speech that is currently playing. That was the bug that
 * flipped the speaker button back to "speak" mid-sentence: every tap restarted
 * the answer from the top, so it looked impossible to stop.
 */

/** message id currently being read aloud, for the bubble button state */
let currentMessage: string | null = null;
/** native utterance id we are waiting on */
let activeUtterance: string | null = null;
/** one-shot success / failure callbacks per utterance */
const waiters = new Map<string, () => void>();
const errorHandlers = new Map<string, (message: string) => void>();
/** one-shot "audio actually started" callbacks per utterance */
const startHandlers = new Map<string, () => void>();
/** Device engines start within a beat; silence this long is a real failure. */
const START_TIMEOUT_MS = 2500;
/** Offline neural voices synthesize on the CPU first, so they get longer. */
const NEURAL_START_TIMEOUT_MS = 30000;
let seq = 0;

const nextId = () => `amitai-${Date.now()}-${++seq}`;

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(fn => fn());

/**
 * End one utterance. A failure runs the error callback instead of the
 * completion callback, so callers never mistake a broken engine for a finished
 * answer (voice mode would otherwise advance on silence).
 */
function settle(id: string, failure?: string) {
  const onDone = waiters.get(id);
  const onError = errorHandlers.get(id);
  waiters.delete(id);
  errorHandlers.delete(id);
  startHandlers.delete(id);

  if (activeUtterance === id) {
    activeUtterance = null;
    currentMessage = null;
    notify();
  }
  progressHandlers.delete(id);

  if (failure !== undefined) onError?.(failure);
  else onDone?.();
}

DeviceEventEmitter.addListener('AmitVoiceSpeakingStart', (e: any) => {
  const id = typeof e?.id === 'string' ? e.id : activeUtterance;
  if (!id) return;
  const onStart = startHandlers.get(id);
  if (!onStart) return;
  startHandlers.delete(id);
  onStart();
});

/** Progress of the utterance currently playing, 0..1. */
export type SpeechProgress = { fraction: number };
const progressHandlers = new Map<string, (p: SpeechProgress) => void>();

/**
 * Word-by-word follow along: native reports the player position while the
 * offline voice speaks, so the transcript can scroll with the audio instead of
 * guessing. Device TTS has no position API; callers fall back to a timer.
 */
export function watchSpeechProgress(id: string, cb: (p: SpeechProgress) => void): () => void {
  progressHandlers.set(id, cb);
  return () => {
    if (progressHandlers.get(id) === cb) progressHandlers.delete(id);
  };
}

DeviceEventEmitter.addListener('AmitVoiceProgress', (e: any) => {
  const id = typeof e?.id === 'string' ? e.id : null;
  if (!id) return;
  const cb = progressHandlers.get(id);
  if (!cb) return;
  const duration = Number(e?.duration) || 0;
  if (duration <= 0) return;
  const position = Number(e?.position) || 0;
  cb({ fraction: Math.max(0, Math.min(1, position / duration)) });
});

DeviceEventEmitter.addListener('AmitVoiceSpeakingEnd', (e: any) => {
  const id = typeof e?.id === 'string' ? e.id : null;
  if (id) {
    settle(id);
    return;
  }
  // Older bridges send no id: treat it as the end of whatever is playing.
  if (activeUtterance) settle(activeUtterance);
});

DeviceEventEmitter.addListener('AmitVoiceError', (e: any) => {
  // Recognition failures arrive on this same event. A silence timeout while the
  // mic is open for barge-in says nothing about the answer being spoken, but it
  // used to settle the utterance — cutting voice mode out of "speaking" in the
  // middle of an answer. Native builds tag the source; an untagged event is a
  // recogniser error when it carries a recogniser code, which TTS never sends.
  if (e?.source === 'stt') return;
  if (e?.source !== 'tts' && typeof e?.code === 'number') return;

  const message = e?.message ?? 'Speech failed';
  const id = typeof e?.id === 'string' ? e.id : activeUtterance;
  if (id) settle(id, message);
  else notify();
});

export function isSpeakingMessage(id: string): boolean {
  return currentMessage === id;
}

/** Cut everything: native engines, UI state, and any pending continuation. */
export function stopAllSpeech() {
  const id = activeUtterance;
  activeUtterance = null;
  currentMessage = null;
  // While stopping, a queued continuation (e.g. voice mode's "listen again")
  // must NOT fire — the user asked for silence.
  if (id) {
    waiters.delete(id);
    errorHandlers.delete(id);
    startHandlers.delete(id);
    progressHandlers.delete(id);
  }
  notify();
  stopSpeaking();
  stopLocal();
}

/**
 * Speak `text` outside the chat bubbles (voice mode, settings preview).
 *
 * `onDone` runs only if the speech finishes on its own — never after a stop or
 * a failure — so an interruption cannot restart the conversation loop, and a
 * broken engine reports the reason instead of hanging in "speaking".
 */
export function speakAloud(
  text: string,
  onDone?: () => void,
  onError?: (message: string) => void,
  onStart?: () => void,
): string {
  // One speaker: anything previously pending is stale.
  waiters.clear();
  errorHandlers.clear();
  startHandlers.clear();

  const id = nextId();
  if (onDone) waiters.set(id, onDone);
  if (onError) errorHandlers.set(id, onError);
  activeUtterance = id;

  // The neural voices need a few seconds to synthesize before anything plays.
  const neural = voiceConfig.ttsProvider !== 'device';
  if (onStart) startHandlers.set(id, onStart);
  else startHandlers.set(id, () => {}); // watchdog only

  speakWithConfig(text, id).catch(e => settle(id, describeSpeechError(e)));

  setTimeout(() => {
    if (!startHandlers.has(id)) return; // it started (or was stopped)
    settle(
      id,
      neural
        ? 'The offline voice could not run on this phone - pick Device voice in Settings.'
        : 'The voice engine is not playing audio - open Settings › Text-to-speech and install a voice.',
    );
  }, neural ? NEURAL_START_TIMEOUT_MS : START_TIMEOUT_MS);

  return id;
}

export function useSpeech(
  id: string,
  text: string,
  onError?: (message: string) => void,
  enabled = true,
) {
  const [, force] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const fn = () => force();
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  const speaking = currentMessage === id;

  const toggle = () => {
    if (!hasTTS) return;
    if (speaking) {
      stopAllSpeech();
      return;
    }
    // Stop anything else first, then claim the UI synchronously so the button
    // shows "stop" immediately — not after a round-trip through the bridge.
    stopAllSpeech();
    const utter = nextId();
    activeUtterance = utter;
    currentMessage = id;
    if (onError) errorHandlers.set(utter, onError);
    notify();

    speakWithConfig(text, utter).catch(e => settle(utter, describeSpeechError(e)));

    // Safety net: if the engine never reports back (some OEMs drop the
    // callback), don't leave the UI stuck in the "stop" state forever.
    const mine = id;
    const words = Math.max(1, Math.ceil(text.split(/\s+/).length / 2.5));
    setTimeout(() => {
      if (currentMessage === mine) {
        stopAllSpeech();
      }
    }, Math.min(180000, words * 1000 + 4000));
  };

  return { speaking, toggle, enabled: enabled && hasTTS };
}

