/**
 * Usage dashboard — requests + tokens + cost, weekly view.
 *
 * Separate from the quota counters (which remember 429 limits). This one just
 * counts what we actually sent, so the Settings → Usage section can show
 * "this week: 47 requests, 1.2M input tokens, 0.4M output tokens, ~$3.10".
 *
 * Persisted via the same native bridge as quota, so it survives restarts. Falls
 * back to in-memory only if the bridge is absent (counts still work within a
 * session, just not across restarts).
 */

import { NativeModules } from 'react-native';
import { PRICES } from '../types';

const today = () => new Date().toISOString().slice(0, 10);

interface UsageEntry {
  day: string; // ISO date "2026-02-20"
  requests: number;
  tokensIn: number;
  tokensOut: number;
}

interface UsageState {
  entries: UsageEntry[];
  day: string;
}

const USAGE_KEY = 'amitai:usage:v1';
const native = NativeModules.AmitVoice;

let usage: UsageState = { entries: [], day: today() };
let usageLoaded = false;

const todayCutoff = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

async function ensureUsageLoaded(): Promise<void> {
  if (usageLoaded) return;
  usageLoaded = true;
  try {
    const raw = await native?.loadJson?.(USAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as UsageState;
      if (parsed?.entries) {
        usage = {
          entries: parsed.entries.filter(e => e.day >= todayCutoff(8)),
          day: today(),
        };
      }
    }
  } catch {}
}

async function persistUsage(): Promise<void> {
  try {
    native?.saveJson?.(USAGE_KEY, JSON.stringify(usage));
  } catch {}
}

function rollTodayEntry(): void {
  if (usage.day !== today()) {
    usage.entries = usage.entries.filter(e => e.day >= todayCutoff(8));
    usage.entries.push({ day: today(), requests: 0, tokensIn: 0, tokensOut: 0 });
    usage.day = today();
  }
}

/** Record one completed request. tokensIn/tokensOut are approximate (chars/4). */
export async function recordUsage(
  model: string,
  tokensIn: number,
  tokensOut: number,
): Promise<void> {
  await ensureUsageLoaded();
  rollTodayEntry();
  const entry = usage.entries.find(e => e.day === today());
  if (!entry) return;
  entry.requests++;
  entry.tokensIn += tokensIn;
  entry.tokensOut += tokensOut;
  await persistUsage();
}

/** Reset the usage dashboard counters (keeps quota counters separate). */
export async function resetUsage(): Promise<void> {
  usage = { entries: [], day: today() };
  usageLoaded = true;
  await persistUsage();
}

/** Weekly summary from today back 7 days. */
export interface DailyUsage {
  date: string;
  requests: number;
  tokensIn: number;
  tokensOut: number;
  cost: number;
}

export interface WeeklyUsage {
  days: DailyUsage[];
  total: {
    requests: number;
    tokensIn: number;
    tokensOut: number;
    cost: number;
  };
}

const estCostFor = (model: string, inTok: number, outTok: number): number => {
  const p = PRICES[model];
  if (!p) return 0;
  return (inTok / 1_000_000) * p.in + (outTok / 1_000_000) * p.out;
};

export async function getWeeklyUsage(model: string): Promise<WeeklyUsage> {
  await ensureUsageLoaded();
  const start = todayCutoff(7);
  const days = usage.entries
    .filter(e => e.day >= start)
    .sort((a, b) => a.day.localeCompare(b.day))
    .map(e => ({
      date: e.day,
      requests: e.requests,
      tokensIn: e.tokensIn,
      tokensOut: e.tokensOut,
      cost: estCostFor(model, e.tokensIn, e.tokensOut),
    }));

  const total: WeeklyUsage['total'] = {
    requests: days.reduce((s, d) => s + d.requests, 0),
    tokensIn: days.reduce((s, d) => s + d.tokensIn, 0),
    tokensOut: days.reduce((s, d) => s + d.tokensOut, 0),
    cost: days.reduce((s, d) => s + d.cost, 0),
  };

  return { days, total };
}
