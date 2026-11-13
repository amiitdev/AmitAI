import { NativeModules, DeviceEventEmitter } from 'react-native';

/**
 * Action Mode bridge (Kotlin: AmitAutomationModule).
 *
 * Same conventions as the other bridges in src/lib/native.ts and
 * src/lib/assistant.ts: the module is looked up once, every call is guarded,
 * and a build without it simply reports `hasAutomation === false`. Nothing here
 * throws because a native module is missing — the UI hides instead.
 *
 * Native answers in one envelope:
 *
 *   { status, ok, action, message, error_code, changed, duration_ms, at, data }
 *
 * `status` is the contract. Only `success` means Android confirmed the action;
 * `failed` means it was refused or nothing changed; `blocked` means a safety
 * rule (or a missing permission) stopped it before anything was touched.
 */
const A: any = NativeModules.AmitAutomation;

export const hasAutomation = !!A;

export type AutomationStatusName =
  | 'success'
  | 'failed'
  | 'timeout'
  | 'cancelled'
  | 'blocked'
  | 'needs_confirmation';

export type AutomationEnvelope<T = any> = {
  status: AutomationStatusName;
  ok: boolean;
  action: string;
  message: string;
  error_code: string | null;
  changed: boolean | null;
  duration_ms: number;
  at: number;
  data: T;
};

export type AutomationScreen = {
  package: string;
  app: string;
  digest: string;
  node_count: number;
  clickable_count: number;
  editable_count: number;
  sensitive: string | null;
  captured_at: number;
  window_title: string;
};

export type AutomationHistoryEntry = {
  at: number;
  action: string;
  status: AutomationStatusName;
  message: string;
  app: string;
  duration_ms: number;
};

export type AutomationStatus = {
  action_mode: boolean;
  service_connected: boolean;
  permission_enabled: boolean;
  notification_allowed?: boolean;
  foreground_service?: boolean;
  session_active: boolean;
  status:
    | 'idle'
    | 'running'
    | 'awaiting_confirmation'
    | 'stopped'
    | 'blocked'
    | 'no_permission';
  package: string;
  app: string;
  action: string;
  completed: number;
  failed: number;
  steps: number;
  max_steps: number;
  progress: number;
  blocked_reason: string;
  pending_confirm_id: string | null;
  pending_confirm_text: string;
  screen: AutomationScreen | null;
  idle_ms?: number;
  history?: AutomationHistoryEntry[];
  hint?: string;
};

export type AutomationPermission = {
  enabled: boolean;
  connected: boolean;
  action_mode: boolean;
  notifications: boolean;
};

export type AutomationConfirmRequest = {
  id: string;
  description: string;
  timeout_ms: number;
};

/* -------------------------------- helpers -------------------------------- */

const EMPTY: AutomationEnvelope = {
  status: 'failed',
  ok: false,
  action: 'unknown',
  message: 'Action Mode is not available in this build.',
  error_code: 'not_available',
  changed: null,
  duration_ms: 0,
  at: Date.now(),
  data: {},
};

/** Native returns a JSON string; a parse failure must not look like success. */
function parse(raw: any, action = 'unknown'): AutomationEnvelope {
  if (typeof raw !== 'string' || !raw) {
    return { ...EMPTY, action };
  }
  try {
    const j = JSON.parse(raw);
    return {
      status: j?.status ?? 'failed',
      ok: !!j?.ok,
      action: j?.action ?? action,
      message: String(j?.message ?? ''),
      error_code: j?.error_code ?? null,
      changed: typeof j?.changed === 'boolean' ? j.changed : null,
      duration_ms: Number(j?.duration_ms ?? 0),
      at: Number(j?.at ?? Date.now()),
      data: j?.data ?? {},
    };
  } catch {
    return { ...EMPTY, action, message: 'The native reply could not be read.' };
  }
}

async function call(action: string, fn: string, ...args: any[]): Promise<AutomationEnvelope> {
  if (!A?.[fn]) return { ...EMPTY, action };
  try {
    return parse(await A[fn](...args), action);
  } catch (e: any) {
    return {
      ...EMPTY,
      action,
      message: e?.message ?? `${fn} failed`,
      error_code: 'bridge_error',
    };
  }
}

/* --------------------------------- status -------------------------------- */

export const getAutomationStatus = async (): Promise<AutomationStatus | null> => {
  if (!A?.status) return null;
  try {
    const r = await call('get_automation_status', 'status');
    return (r.data ?? null) as AutomationStatus | null;
  } catch {
    return null;
  }
};

export const getAutomationPermission = async (): Promise<AutomationPermission | null> => {
  if (!A?.permission) return null;
  try {
    return (await A.permission()) as AutomationPermission;
  } catch {
    return null;
  }
};

export async function setActionMode(enabled: boolean): Promise<AutomationStatus | null> {
  if (!A?.setActionMode) return null;
  try {
    const r = await call('set_action_mode', 'setActionMode', enabled);
    return (r.data ?? null) as AutomationStatus | null;
  } catch {
    return null;
  }
}

export const beginSession = () => call('begin_session', 'beginSession');
export const endSession = () => call('end_session', 'endSession');
export const stopAutomation = () => call('stop_automation', 'stop');

export async function confirmAction(id: string, approved: boolean): Promise<boolean> {
  if (!A?.confirm) return false;
  try {
    const r = await A.confirm(id, approved);
    return !!r?.ok;
  } catch {
    return false;
  }
}

export const openAccessibilitySettings = async () => {
  try {
    return !!(await A?.openAccessibilitySettings?.());
  } catch {
    return false;
  }
};

export const openAutomationNotificationSettings = async () => {
  try {
    return !!(await A?.openNotificationSettings?.());
  } catch {
    return false;
  }
};

/* ------------------------------- history --------------------------------- */

export async function automationHistory(): Promise<AutomationHistoryEntry[]> {
  if (!A?.history) return [];
  try {
    const raw = await A.history();
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function clearAutomationHistory(): Promise<AutomationHistoryEntry[]> {
  if (!A?.clearHistory) return [];
  try {
    const raw = await A.clearHistory();
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/* --------------------------------- tools --------------------------------- */

export const openApp = (packageName: string, uri?: string) =>
  call('open_app', 'openApp', packageName, uri ?? null);
export const foregroundApp = () => call('get_foreground_app', 'foregroundApp');
export const listInstalledApps = (query?: string) =>
  call('list_installed_apps', 'listInstalledApps', query ?? null);
export const screenContent = (limit = 80) =>
  call('get_screen_content', 'screenContent', limit);
export const findElement = (text?: string, contentDescription?: string) =>
  call('find_element', 'findElement', text ?? null, contentDescription ?? null);
export const clickableElements = (limit = 40) =>
  call('get_clickable_elements', 'clickableElements', limit);
export const tapElement = (text?: string, contentDescription?: string) =>
  call('tap_element', 'tapElement', text ?? null, contentDescription ?? null);
export const typeText = (text: string, submit = false) =>
  call('type_text', 'typeText', text, submit);
export const scrollScreen = (direction: 'up' | 'down' | 'left' | 'right') =>
  call('scroll_screen', 'scrollScreen', direction);
export const pressBack = () => call('press_back', 'pressBack');
export const requestUserConfirmation = (description: string, timeoutMs = 90000) =>
  call('request_user_confirmation', 'requestUserConfirmation', description, timeoutMs);

/* -------------------------------- events --------------------------------- */

const listen = (name: string, cb: (payload: any) => void) => {
  const sub = DeviceEventEmitter.addListener(name, (e: any) => {
    // AssistantBus puts the payload in `json`; older builds may send the map
    // itself, so both shapes are accepted.
    let payload: any = e;
    if (typeof e?.json === 'string') {
      try {
        payload = JSON.parse(e.json);
      } catch {
        payload = null;
      }
    }
    if (payload) cb(payload);
  });
  // Every subscription returns its remover: a screen that unmounts must not be
  // updated by an event that arrives afterwards.
  return () => sub.remove();
};

export const onAutomationState = (cb: (s: AutomationStatus) => void) =>
  listen('AmitAutomationState', cb);

export const onAutomationEvent = (cb: (r: AutomationEnvelope) => void) =>
  listen('AmitAutomationEvent', cb);

export const onAutomationScreen = (cb: (s: AutomationScreen) => void) =>
  listen('AmitAutomationScreen', cb);

export const onAutomationConfirm = (cb: (c: AutomationConfirmRequest) => void) =>
  listen('AmitAutomationConfirm', cb);

export const onAutomationError = (cb: (e: { code: string; message: string }) => void) =>
  listen('AmitAutomationError', cb);
