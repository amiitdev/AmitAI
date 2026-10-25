import { NativeModules } from 'react-native';

/**
 * Free-tier quota display.
 *
 * Google exposes no "remaining quota" endpoint: successful calls carry no
 * rate-limit headers at all (verified with curl). The only place limits appear
 * is inside a 429 body:
 *
 *   limit: 20, model: gemini-2.5-flash. Please retry in 30m48s.
 *
 * So we count our own requests per model per day and remember the limit and
 * reset time whenever Google tells us one.
 */

interface DayState {
  sent: Record<string, number>;
  limit: Record<string, number>;
  resetsAt: Record<string, number>;
  day: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const native = NativeModules.AmitVoice;
const KEY = 'amitai:quota:v1';

let state: DayState = { sent: {}, limit: {}, resetsAt: {}, day: today() };
let loaded = false;

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await native?.loadJson?.(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DayState;
      if (parsed && parsed.day === today()) state = parsed;
    }
  } catch {}
}

async function persist(): Promise<void> {
  try {
    native?.saveJson?.(KEY, JSON.stringify(state));
  } catch {}
}

function rollDay(): void {
  if (state.day !== today()) {
    state = { sent: {}, limit: state.limit, resetsAt: {}, day: today() };
  }
}

export async function recordSent(model: string): Promise<void> {
  await ensureLoaded();
  rollDay();
  state.sent[model] = (state.sent[model] ?? 0) + 1;
  await persist();
}

/** Wipe local counters and every recorded limit (Diagnostics → reset). */
export async function resetQuota(): Promise<void> {
  state = { sent: {}, limit: {}, resetsAt: {}, day: today() };
  loaded = true;
  await persist();
}

/** Read the numbers Google only reveals inside a 429 body. */
export async function recordBlocked(model: string, raw: string): Promise<void> {
  await ensureLoaded();
  rollDay();

  const lim = raw.match(/limit: (\d+), model: ([\w.-]+)/i);
  if (lim) {
    state.limit[lim[2]] = parseInt(lim[1], 10);
    state.sent[lim[2]] = state.limit[lim[2]];
  }

  const delay = raw.match(/retry in (\d+)m/i) ?? raw.match(/retry in (?:\d+h)?(\d+)m/i);
  if (delay) {
    state.resetsAt[model] = Date.now() + parseInt(delay[1], 10) * 60_000;
  } else {
    const secs = raw.match(/retry in ([\d.]+)s/i);
    if (secs) {
      state.resetsAt[model] = Date.now() + Math.ceil(parseFloat(secs[1]) * 1000);
    }
  }
  await persist();
}

const minsLeft = (ms: number) => Math.max(1, Math.ceil((ms - Date.now()) / 60_000));

/**
 * One line shown under each model in the picker.
 * `fallback` is the normal hint (price / provider) when we know nothing.
 */
export async function quotaHint(model: string, fallback: string): Promise<string> {
  await ensureLoaded();
  rollDay();

  const resetsAt = state.resetsAt[model];
  if (resetsAt && resetsAt > Date.now()) {
    return `⛔ used up (${state.limit[model] ?? '?'} req/day) · resets in ${minsLeft(resetsAt)} min`;
  }

  const limit = state.limit[model];
  const sent = state.sent[model];
  if (limit) {
    return `Quota: ${Math.min(sent ?? 0, limit)}/${limit} used today · ${fallback}`;
  }
  return fallback;
}

