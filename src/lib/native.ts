import { NativeModules, DeviceEventEmitter, PermissionsAndroid, Platform } from 'react-native';

/**
 * Native bridges.
 *
 * Voice is our own Kotlin module (android/.../AmitVoiceModule.kt) so there is
 * no third-party dependency to rot. The image picker is a maintained package.
 * Everything is guarded: if a bridge is missing the button hides instead of
 * the app crashing.
 */

const AmitVoice: any = NativeModules.AmitVoice;
const PickerMod: any = (() => {
  try {
    return require('react-native-image-picker');
  } catch {
    return null;
  }
})();

export const hasVoice = !!AmitVoice;
export const hasSTT = hasVoice;
export const hasTTS = hasVoice;
export const hasPicker = !!PickerMod?.launchImageLibrary;

/* ------------------------------- speech in ------------------------------- */

type Handler = (text: string, final: boolean) => void;
export type VoiceError = { message: string; code?: number };
type ErrorHandler = (err: VoiceError) => void;

let current: Handler | null = null;
let currentError: ErrorHandler | null = null;
let subs: { remove: () => void }[] = [];

async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
    title: 'Microphone',
    message: 'AmitAI needs the microphone to turn your speech into text.',
    buttonPositive: 'Allow',
    buttonNegative: 'Cancel',
  });
  return res === PermissionsAndroid.RESULTS.GRANTED;
}

export async function startListening(
  onText: Handler,
  onError?: ErrorHandler,
): Promise<boolean> {
  if (!hasVoice) return false;

  const granted = await ensureMicPermission();
  if (!granted) return false;

  current = onText;
  currentError = onError ?? null;
  subs.forEach(s => s.remove());
  subs = [
    DeviceEventEmitter.addListener('AmitVoiceResult', (e: any) => {
      current?.(e?.text ?? '', !!e?.final);
    }),
    // Forward the real reason (no speech, busy, no network…) instead of
    // swallowing it: a silent mic is impossible to diagnose otherwise.
    DeviceEventEmitter.addListener('AmitVoiceError', (e: any) => {
      // Playback failures share this event; they are not listening failures.
      if (e?.source === 'tts') return;
      currentError?.({ message: e?.message ?? 'Speech error', code: e?.code });
    }),
    DeviceEventEmitter.addListener('AmitVoiceEnd', () => {}),
  ];

  try {
    AmitVoice.startListening();
    return true;
  } catch (e: any) {
    currentError?.({ message: e?.message ?? 'Could not start listening' });
    return false;
  }
}

/** Pre-bind Google's recogniser so the first tap is instant. */
export function warmUp() {
  try {
    AmitVoice?.warmUp?.();
  } catch {}
}

export async function stopListening() {
  if (!hasVoice) return;
  try {
    AmitVoice.stopListening();
  } catch {}
}

export async function cancelListening() {
  if (!hasVoice) return;
  try {
    AmitVoice.cancelListening();
  } catch {}
  current = null;
  currentError = null;
  subs.forEach(s => s.remove());
  subs = [];
}

/* ------------------------------- speech out ------------------------------ */

/**
 * Speak text with the device engine.
 *
 * `utteranceId` is chosen by the caller so the native side can tag its
 * progress events: JS must be able to tell a stale "finished" event (from an
 * utterance it already replaced) apart from the one it is waiting for.
 */
export function speak(text: string, rate = 1, utteranceId = `amitai-${Date.now()}`) {
  if (!hasVoice) return;
  const clean = text
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/[*_#>`]/g, '')
    // tables: "| a | b |" should be read as "a, b", not splattered pipes
    .replace(/^\s*\|?[\s:|-]{4,}\|?\s*$/gm, '') // separator rows
    .replace(/\|/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
  if (!clean) return;
  // Let failures surface: callers report them instead of playing silence.
  AmitVoice.speak(clean, rate, utteranceId);
}

/** Lets the user install/enable a speech engine when the device has none. */
export function openTtsSettings() {
  try {
    AmitVoice?.openTtsSettings?.();
  } catch {}
}

/** Which engine/language the native side actually managed to initialise. */
export async function ttsStatus(): Promise<{
  ready: boolean;
  engine: string;
  language: string;
} | null> {
  try {
    if (!AmitVoice?.ttsStatus) return null;
    return await AmitVoice.ttsStatus();
  } catch {
    return null;
  }
}

export function stopSpeaking() {
  if (!hasVoice) return;
  try {
    AmitVoice.stopSpeaking();
  } catch {}
  try {
    AmitVoice.stopCloud();
  } catch {}
}

/** ElevenLabs TTS. Resolves once playback has started. */
export async function speakCloud(
  text: string,
  apiKey: string,
  voiceId: string,
  model: string,
  speed = 1,
  utteranceId = `amitai-cloud-${Date.now()}`,
): Promise<void> {
  if (!AmitVoice?.speakCloud) throw new Error('cloud voice not linked in this build');
  if (!apiKey) throw new Error('add your ElevenLabs key in Settings');
  await AmitVoice.speakCloud(text, apiKey, voiceId, model, speed, utteranceId);
}

export function stopCloud() {
  try {
    AmitVoice?.stopCloud?.();
  } catch {}
}

/* ------------------------------- clipboard -------------------------------- */

export const hasClipboard = !!AmitVoice?.setClipboard;

/** Real clipboard copy — no Share sheet. Returns false if the bridge is absent. */
export async function copyText(text: string): Promise<boolean> {
  if (!AmitVoice?.setClipboard) return false;
  try {
    return await AmitVoice.setClipboard(text);
  } catch {
    return false;
  }
}


/* -------------------------------- storage -------------------------------- */

export type StorageInfo = {
  path: string;
  legacy: boolean;
  writable: boolean;
  freeMb: number;
};

export async function storageInfo(): Promise<StorageInfo | null> {
  try {
    if (!AmitVoice?.storageInfo) return null;
    return await AmitVoice.storageInfo();
  } catch {
    return null;
  }
}

/** Opens the Android "All files access" screen (Android 11+). */
export async function requestAllFiles(): Promise<boolean> {
  try {
    if (!AmitVoice?.requestAllFiles) return false;
    return await AmitVoice.requestAllFiles();
  } catch {
    return false;
  }
}

/* -------------------------------- images --------------------------------- */

export async function pickImage(): Promise<string | null> {
  if (!PickerMod?.launchImageLibrary) return null;
  const res = await PickerMod.launchImageLibrary({
    mediaType: 'photo',
    selectionLimit: 1,
    quality: 0.7,
    maxWidth: 1024,
    maxHeight: 1024,
    includeBase64: false,
  });
  if (res?.didCancel) return null;
  return res?.assets?.[0]?.uri ?? null;
}
