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
const AmitAssistant: any = NativeModules.AmitAssistant;
const AmitScheduler: any = NativeModules.AmitScheduler;
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

/** Offline neural TTS (piper / kitten), bundled — no key, no network. */
export async function speakLocal(
  text: string,
  engine: 'piper' | 'kitten',
  voiceId: number,
  speed = 1,
  utteranceId = `amitai-local-${Date.now()}`,
): Promise<void> {
  if (!AmitVoice?.speakLocal) throw new Error('Offline voice is not available in this build');
  await AmitVoice.speakLocal(text, engine, voiceId, speed, utteranceId);
}

/** Stop whatever media playback the offline voices started. */
export function stopLocal() {
  try {
    AmitVoice?.stopCloud?.();
  } catch {}
}

/* ------------------------------- clipboard -------------------------------- */

export const hasClipboard = !!AmitVoice?.setClipboard;
export const hasClipboardRead = !!AmitVoice?.getClipboard;

/** Real clipboard copy — no Share sheet. Returns false if the bridge is absent. */
export async function copyText(text: string): Promise<boolean> {
  if (!AmitVoice?.setClipboard) return false;
  try {
    return await AmitVoice.setClipboard(text);
  } catch {
    return false;
  }
}

/**
 * Read the clipboard.
 *
 * Android 10+ only lets the *focused* app read the clipboard, and some OEMs
 * show a "AmitAI pasted from…" toast — both are the platform's rules, not ours.
 * An empty string just means there was no text.
 */
export async function readClipboard(): Promise<string> {
  if (!AmitVoice?.getClipboard) return '';
  try {
    const text = await AmitVoice.getClipboard();
    return typeof text === 'string' ? text : '';
  } catch {
    return '';
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

export const MAX_IMAGES = 8;

/**
 * Pick up to `limit` photos. `selectionLimit` is honoured by the Android photo
 * picker; older pickers return one and the user can tap + again, which is why
 * the caller appends instead of replacing.
 */
export async function pickImages(limit = MAX_IMAGES): Promise<string[]> {
  if (!PickerMod?.launchImageLibrary) return [];
  const res = await PickerMod.launchImageLibrary({
    mediaType: 'photo',
    selectionLimit: Math.max(1, limit),
    quality: 0.7,
    maxWidth: 1280,
    maxHeight: 1280,
    includeBase64: false,
  });
  if (res?.didCancel) return [];
  return (res?.assets ?? [])
    .map((a: any) => a?.uri)
    .filter((u: any): u is string => typeof u === 'string' && !!u);
}

export async function pickImage(): Promise<string | null> {
  const [first] = await pickImages(1);
  return first ?? null;
}

/* ---------------------------- share into AmitAI -------------------------- */

export type SharedPayload = {
  text: string;
  images: string[];
  at: number;
};

/**
 * Text/images shared into AmitAI from another app (Chrome, Gallery, Files…).
 *
 * Native copies shared images into the app cache first, because `content://`
 * URIs from another app die when that app's permission grant expires — a
 * `file://` path keeps working after the user sends the message.
 */
export async function consumeShare(): Promise<SharedPayload | null> {
  if (!AmitAssistant?.consumeShare) return null;
  try {
    const p = await AmitAssistant.consumeShare();
    if (!p) return null;
    const text = typeof p.text === 'string' ? p.text : '';
    const images = Array.isArray(p.images) ? p.images.filter((u: any) => typeof u === 'string') : [];
    if (!text && !images.length) return null;
    return { text, images, at: typeof p.at === 'number' ? p.at : Date.now() };
  } catch {
    return null;
  }
}

/** Fires when a share arrives while the app is already running. */
export function onShare(handler: (p: SharedPayload) => void): () => void {
  const sub = DeviceEventEmitter.addListener('AmitShared', (e: any) => {
    const text = typeof e?.text === 'string' ? e.text : '';
    const images = Array.isArray(e?.images) ? e.images.filter((u: any) => typeof u === 'string') : [];
    if (text || images.length) handler({ text, images, at: Date.now() });
  });
  return () => sub.remove();
}

/* ---------------------------- MCP (opencode) ----------------------------- */

export type McpInfo = { url: string; token: string; running: boolean; service: boolean };

/** Loopback MCP endpoint exposing AmitAI's tools to the opencode agent. */
export async function mcpInfo(): Promise<McpInfo | null> {
  if (!AmitAssistant?.mcpInfo) return null;
  try {
    const s = await AmitAssistant.mcpInfo();
    return {
      url: String(s?.url ?? ''),
      token: String(s?.token ?? ''),
      running: !!s?.running,
      service: !!s?.service,
    };
  } catch {
    return null;
  }
}

/**
 * Keeps the endpoint reachable while AmitAI is backgrounded (foreground
 * service). Off = the server only answers while the app is on screen.
 */
export async function setMcpService(enabled: boolean): Promise<boolean> {
  if (!AmitAssistant?.mcpService) return false;
  try {
    await AmitAssistant.mcpService(enabled);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------- scheduler ------------------------------- */

export interface SchedulerStatus {
  exact: boolean;
  notifications: boolean;
  alarms: number;
}

export const hasScheduler = !!AmitScheduler?.replaceAll;

export async function schedulerStatus(): Promise<SchedulerStatus | null> {
  if (!AmitScheduler?.status) return null;
  try {
    const s = await AmitScheduler.status();
    return {
      exact: !!s?.exact,
      notifications: !!s?.notifications,
      alarms: Number(s?.alarms ?? 0),
    };
  } catch {
    return null;
  }
}

/** Android 12+ gates exact alarms behind a system toggle. */
export async function requestExactAlarms(): Promise<boolean> {
  if (!AmitScheduler?.requestExact) return false;
  try {
    return await AmitScheduler.requestExact();
  } catch {
    return false;
  }
}

/** Post the finished scheduled answer as a notification. */
export async function notify(title: string, body: string, id = `task-${Date.now()}`): Promise<boolean> {
  if (!AmitScheduler?.notify) return false;
  try {
    return await AmitScheduler.notify(id, title, body);
  } catch {
    return false;
  }
}

/** Ask for POST_NOTIFICATIONS on Android 13+ (needed before the first job). */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (Number(Platform.Version) < 33) return true;
  const res = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    {
      title: 'Notifications',
      message: 'AmitAI needs notifications to deliver scheduled answers.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    },
  );
  return res === PermissionsAndroid.RESULTS.GRANTED;
}
