import { NativeModules, DeviceEventEmitter, PermissionsAndroid, Platform } from 'react-native';

/**
 * Assistant shell bridge (Kotlin: AmitAssistantModule).
 *
 * Everything is optional: a build without the native module simply reports
 * `hasAssistant === false` and the Settings section hides its controls.
 */
const A: any = NativeModules.AmitAssistant;

export const hasAssistant = !!A;

export type AssistantStatus = {
  model: boolean;
  modelBytes: number;
  listening: boolean;
  wake: boolean;
  bubble: boolean;
  policy: 'chargingOrScreenOff' | 'always' | 'appOnly';
  overlay: boolean;
  battery: boolean;
  notifications: boolean;
};

const NOOP = () => {};

async function call<T>(fn: string, ...args: any[]): Promise<T | null> {
  if (!A?.[fn]) return null;
  try {
    return (await A[fn](...args)) as T;
  } catch (e: any) {
    throw new Error(e?.message ?? `${fn} failed`);
  }
}

export const getAssistantStatus = () => call<AssistantStatus>('status');

export async function downloadWakeModel(): Promise<boolean> {
  const ok = await call<boolean>('downloadModel');
  return !!ok;
}

export async function deleteWakeModel() {
  return call<boolean>('deleteModel');
}

export async function startWake() {
  return call<boolean>('startWake');
}

export async function stopWake() {
  return call<boolean>('stopWake');
}

export async function setWakePolicy(policy: AssistantStatus['policy']) {
  return call<boolean>('setPolicy', policy);
}

export async function showBubble() {
  return call<boolean>('showBubble');
}

export async function hideBubble() {
  return call<boolean>('hideBubble');
}

export async function canDrawOverlays() {
  return !!(await call<boolean>('canDrawOverlays'));
}

export async function openOverlaySettings() {
  return call<boolean>('openOverlaySettings');
}

export async function requestBatteryExemption() {
  return call<boolean>('requestBatteryExemption');
}

export async function openNotificationSettings() {
  return call<boolean>('openNotificationSettings');
}

export async function openAppSettings() {
  return call<boolean>('openAppSettings');
}

/** True once, when AmitAI was opened by the wake word or the bubble. */
export async function consumeLaunchVoice(): Promise<boolean> {
  return !!(await call<boolean>('consumeLaunchVoice'));
}

/** Android 13+ needs runtime permission before the listener can show its card. */
export async function ensureNotifications(): Promise<boolean> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return true;
  const res = await PermissionsAndroid.request(
    'android.permission.POST_NOTIFICATIONS' as any,
    {
      title: 'Notifications',
      message: 'AmitAI shows a small ongoing card while “Ok Amit” is listening.',
      buttonPositive: 'Allow',
      buttonNegative: 'Not now',
    },
  );
  return res === PermissionsAndroid.RESULTS.GRANTED;
}

/* -------------------------------- events --------------------------------- */

const listen = (name: string, cb: (...a: any[]) => void) => {
  const sub = DeviceEventEmitter.addListener(name, cb);
  return () => sub.remove();
};

export const onWake = (cb: (phrase: string) => void) =>
  listen('AmitAssistantWake', e => cb(e?.phrase ?? 'amit'));

export const onAssistantState = (cb: (key: string, value: string) => void) =>
  listen('AmitAssistantState', e => cb(e?.key ?? '', e?.value ?? ''));

export const onAssistantError = (cb: (msg: string) => void) =>
  listen('AmitAssistantError', e => cb(e?.message ?? 'Assistant error'));

export const onModelProgress = (cb: (phase: string, pct: number) => void) =>
  listen('AmitAssistantModel', e => cb(e?.phase ?? '', Number(e?.pct ?? -1)));

export { NOOP };
