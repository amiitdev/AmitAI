import { readKey, writeKey, uid } from '../storage/store';

/**
 * Scheduled jobs ("cron, but in plain words").
 *
 * The user says *“tell me the weather every day at 8 am”*, the model calls the
 * `create_schedule` tool, `parseWhen()` turns the phrase into a trigger, and the
 * Kotlin side holds an AlarmManager alarm. When it fires, a Headless JS task
 * runs the same agent loop and posts the answer as a notification — the app does
 * not need to be open.
 *
 * Everything here is pure JS except `applySchedules()`, which mirrors the list
 * into the native alarm store. Keeping the date maths in one language means the
 * alarm and the UI can never disagree about "next run".
 */

export type Repeat = 'once' | 'hourly' | 'daily' | 'weekly' | 'cron';

export interface Schedule {
  id: string;
  /** short human name, e.g. "Morning weather" */
  title: string;
  /** what to ask the model when it fires */
  prompt: string;
  /** the phrase the user used, kept so the UI can explain itself */
  when: string;
  repeat: Repeat;
  /** local wall-clock hour 0-23 */
  hour: number;
  minute: number;
  /** 0 = Sunday … 6 = Saturday (weekly) */
  weekday?: number;
  /** interval for repeat: 'hourly' */
  everyHours?: number;
  /** 5-field expression when repeat = 'cron' */
  cron?: string;
  /** epoch ms for repeat: 'once' */
  at?: number;
  enabled: boolean;
  createdAt: number;
  lastRun?: number;
  lastResult?: string;
  lastError?: string;
  nextAt?: number;
}

export interface ParseResult {
  ok: boolean;
  error?: string;
  title?: string;
  repeat?: Repeat;
  hour?: number;
  minute?: number;
  weekday?: number;
  everyHours?: number;
  cron?: string;
  at?: number;
  /** the next time this expression would fire, from `now` */
  next?: number;
}

export const SCHEDULES_KEY = 'amitai:schedules:v1';
export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const WD_LONG = WEEKDAYS.map(d => d.toLowerCase());
const WD_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n: number) => String(n).padStart(2, '0');

/* ------------------------------- cron parse ------------------------------ */

interface CronSpec {
  minutes: number[];
  hours: number[];
  doms: number[];
  months: number[];
  dows: number[];
  domRestricted: boolean;
  dowRestricted: boolean;
}

const CRON_RANGES: [number, number][] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
];

function expandField(field: string, min: number, max: number): number[] | null {
  const out = new Set<number>();
  for (const part of field.split(',')) {
    if (!part) return null;
    const [range, stepRaw] = part.split('/');
    const step = stepRaw === undefined ? 1 : Number(stepRaw);
    if (!Number.isInteger(step) || step < 1) return null;

    let lo: number;
    let hi: number;
    if (range === '*') {
      lo = min;
      hi = max;
    } else if (range.includes('-')) {
      const [a, b] = range.split('-');
      lo = Number(a);
      hi = Number(b);
    } else {
      lo = Number(range);
      hi = stepRaw === undefined ? lo : max;
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi)) return null;
    if (lo < min || hi > max || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return [...out].sort((a, b) => a - b);
}

/** Five fields, standard cron: minute hour day-of-month month day-of-week. */
export function parseCron(expr: string): CronSpec | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const fields: number[][] = [];
  for (let i = 0; i < 5; i++) {
    const vals = expandField(parts[i], CRON_RANGES[i][0], CRON_RANGES[i][1]);
    if (!vals || !vals.length) return null;
    fields.push(vals);
  }
  const dows = [...new Set(fields[4].map(d => (d === 7 ? 0 : d)))].sort((a, b) => a - b);
  return {
    minutes: fields[0],
    hours: fields[1],
    doms: fields[2],
    months: fields[3],
    dows,
    domRestricted: parts[2] !== '*',
    dowRestricted: parts[4] !== '*',
  };
}

/** Next fire time for a cron expression, strictly after `from`. */
export function nextCron(expr: string, from: number = Date.now()): number | null {
  const spec = parseCron(expr);
  if (!spec) return null;

  const start = new Date(from);
  start.setSeconds(0, 0);

  // Walk days instead of minutes: 4 years of a bad expression still returns fast.
  for (let day = 0; day < 366 * 4; day++) {
    const d = new Date(start);
    d.setDate(start.getDate() + day);
    d.setHours(0, 0, 0, 0);
    if (!spec.months.includes(d.getMonth() + 1)) continue;

    const domMatch = spec.doms.includes(d.getDate());
    const dowMatch = spec.dows.includes(d.getDay());
    // Vixie cron ORs day-of-month and day-of-week when both are restricted.
    const dayOk =
      spec.domRestricted && spec.dowRestricted
        ? domMatch || dowMatch
        : domMatch && dowMatch;
    if (!dayOk) continue;

    for (const h of spec.hours) {
      for (const m of spec.minutes) {
        const candidate = new Date(d);
        candidate.setHours(h, m, 0, 0);
        if (candidate.getTime() > from) return candidate.getTime();
      }
    }
  }
  return null;
}

/* ------------------------------ next run -------------------------------- */

/** When should this job run next? `null` = never again. */
export function nextRun(s: Schedule, from: number = Date.now()): number | null {
  if (!s.enabled) return null;

  if (s.repeat === 'once') return s.at ?? null;
  if (s.repeat === 'cron') return s.cron ? nextCron(s.cron, from) : null;

  const anchor = new Date(from);
  anchor.setSeconds(0, 0);

  if (s.repeat === 'hourly') {
    const step = Math.max(1, s.everyHours ?? 1);
    const cand = new Date(from);
    cand.setSeconds(0, 0);
    cand.setMinutes(s.minute ?? 0, 0, 0);
    while (cand.getTime() <= from) cand.setHours(cand.getHours() + step);
    return cand.getTime();
  }

  const cand = new Date(from);
  cand.setHours(s.hour, s.minute, 0, 0);

  if (s.repeat === 'daily') {
    if (cand.getTime() <= from) cand.setDate(cand.getDate() + 1);
    return cand.getTime();
  }

  // weekly
  const target = s.weekday ?? 1;
  let guard = 0;
  while (cand.getDay() !== target && guard++ < 8) cand.setDate(cand.getDate() + 1);
  if (cand.getTime() <= from) cand.setDate(cand.getDate() + 7);
  return cand.getTime();
}

/** Fixed fallback interval the native alarm uses if JS cannot run. */
export function repeatMs(s: Schedule): number {
  if (s.repeat === 'once') return 0;
  if (s.repeat === 'hourly') return Math.max(1, s.everyHours ?? 1) * 3600_000;
  if (s.repeat === 'daily') return 86_400_000;
  if (s.repeat === 'weekly') return 7 * 86_400_000;
  if (s.repeat === 'cron' && s.cron) {
    const first = nextCron(s.cron, Date.now());
    if (!first) return 0;
    const second = nextCron(s.cron, first);
    if (!second) return 0;
    return second - first;
  }
  return 0;
}

/* -------------------------------- describe ------------------------------- */

export function describe(s: Schedule): string {
  const time = `${pad(s.hour)}:${pad(s.minute)}`;
  switch (s.repeat) {
    case 'once':
      return s.at ? `once on ${formatWhen(s.at)}` : 'once';
    case 'daily':
      return `every day at ${time}`;
    case 'weekly':
      return `every ${WEEKDAYS[s.weekday ?? 1]} at ${time}`;
    case 'hourly':
      return (s.everyHours ?? 1) === 1 ? 'every hour' : `every ${s.everyHours} hours`;
    case 'cron':
      return `cron ${s.cron}`;
    default:
      return s.when;
  }
}

export function formatWhen(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const tomorrow = new Date(today.getTime() + 86_400_000).toDateString() === d.toDateString();
  const day = sameDay ? 'today' : tomorrow ? 'tomorrow' : `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  return `${day}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "in 2 h 15 m" — used in confirmations and the schedule list. */
export function humanIn(ms: number): string {
  if (ms <= 0) return 'now';
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return 'in <1 min';
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m ? `in ${h} h ${m} min` : `in ${h} h`;
  const days = Math.floor(h / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

/* ------------------------------ natural parse ---------------------------- */

const cleanInput = (input: string) =>
  input
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\beveryday\b/g, 'every day')
    .replace(/\ba\.?m\.?\b/g, 'am')
    .replace(/\bp\.?m\.?\b/g, 'pm')
    .replace(/\s+/g, ' ')
    .trim();

function readTime(raw: string): { hour: number; minute: number } | null {
  const ampm = raw.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (ampm) {
    let h = parseInt(ampm[1], 10) % 12;
    if (ampm[3] === 'pm') h += 12;
    const m = ampm[2] ? parseInt(ampm[2], 10) : 0;
    if (h < 0 || h > 23 || m > 59) return null;
    return { hour: h, minute: m };
  }

  const hhmm = raw.match(/\b(\d{1,2}):(\d{2})\b/);
  if (hhmm) {
    const h = parseInt(hhmm[1], 10);
    const m = parseInt(hhmm[2], 10);
    if (h > 23 || m > 59) return null;
    return { hour: h, minute: m };
  }

  const named: [RegExp, number][] = [
    [/\bmidnight\b/, 0],
    [/\bnoon\b/, 12],
    [/\bmorning\b/, 8],
    [/\bafternoon\b/, 15],
    [/\bevening\b/, 19],
    [/\bnight\b/, 21],
  ];
  for (const [re, h] of named) if (re.test(raw)) return { hour: h, minute: 0 };

  const at = raw.match(/\bat\s+(\d{1,2})\b/);
  if (at) {
    const h = parseInt(at[1], 10);
    if (h >= 0 && h <= 23) return { hour: h, minute: 0 };
  }

  const bare = raw.match(/^(\d{1,2})(?::(\d{2}))?$/);
  if (bare) {
    const h = parseInt(bare[1], 10);
    const m = bare[2] ? parseInt(bare[2], 10) : 0;
    if (h <= 23 && m <= 59) return { hour: h, minute: m };
  }
  return null;
}

function readWeekday(raw: string): number | null {
  for (let i = 0; i < 7; i++) if (new RegExp(`\\b${WD_LONG[i]}\\b`).test(raw)) return i;
  for (let i = 0; i < 7; i++) if (new RegExp(`\\b${WD_SHORT[i]}\\b`).test(raw)) return i;
  return null;
}

/** A one-off at a local date/time, moved forward if it already passed. */
function onceAt(date: Date, hour: number, minute: number, now: number): number {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/**
 * Turn "tell me the weather every day at 8 am" style phrases into a trigger.
 *
 * Supported (documented in the README, tested in __tests__/Schedule.test.ts):
 *   every day / daily / every morning at 8am
 *   every monday at 9pm, weekdays at 7:30
 *   every 2 hours, hourly
 *   tomorrow at 7pm, today at 18:00, monday at 9am
 *   a raw 5-field cron expression
 * Anything else is rejected with an example, so the model can retry instead of
 * silently creating a job that never fires.
 */
export function parseWhen(input: string, now: number = Date.now()): ParseResult {
  const raw = cleanInput(input);
  if (!raw) {
    return { ok: false, error: 'Empty time phrase. Try “every day at 8 am”.' };
  }

  // 1) explicit cron expression
  const cronCandidate = raw.replace(/\bcron\b/g, '').trim();
  if (/^[\d*/,\-\s]+$/.test(cronCandidate) && cronCandidate.split(/\s+/).length === 5) {
    const next = nextCron(cronCandidate, now);
    if (next) {
      const spec = parseCron(cronCandidate)!;
      return {
        ok: true,
        repeat: 'cron',
        cron: cronCandidate,
        hour: spec.hours[0],
        minute: spec.minutes[0],
        next,
      };
    }
  }

  const weekday = readWeekday(raw);
  const time = readTime(raw);
  const hour = time ? time.hour : 9;
  const minute = time ? time.minute : 0;

  const hourly = raw.match(/\bevery\s+(\d{1,2})\s+hours?\b/) ?? (/\bhourly\b/.test(raw) ? ['', '1'] : null);
  if (hourly) {
    const everyHours = Math.max(1, Math.min(23, parseInt(String(hourly[1]), 10) || 1));
    const s: Schedule = {
      id: 'x',
      title: '',
      prompt: '',
      when: input,
      repeat: 'hourly',
      hour,
      minute,
      everyHours,
      enabled: true,
      createdAt: now,
    };
    return { ok: true, repeat: 'hourly', hour, minute, everyHours, next: nextRun(s, now) ?? undefined };
  }

  // weekdays / weekends as a cron preset
  if (/\bweekdays?\b/.test(raw)) {
    const cron = `${minute} ${hour} * * 1-5`;
    return { ok: true, repeat: 'cron', cron, hour, minute, next: nextCron(cron, now) ?? undefined };
  }
  if (/\bweekends?\b/.test(raw)) {
    const cron = `${minute} ${hour} * * 0,6`;
    return { ok: true, repeat: 'cron', cron, hour, minute, next: nextCron(cron, now) ?? undefined };
  }

  const wantsEvery = /\bevery\b|\beach\b|\bdaily\b/.test(raw);

  if (weekday !== null && wantsEvery) {
    const s: Schedule = {
      id: 'x',
      title: '',
      prompt: '',
      when: input,
      repeat: 'weekly',
      hour,
      minute,
      weekday,
      enabled: true,
      createdAt: now,
    };
    return { ok: true, repeat: 'weekly', hour, minute, weekday, next: nextRun(s, now) ?? undefined };
  }

  if (/\bdaily\b|\bevery\s+(day|morning|afternoon|evening|night)\b|\beach\s+day\b/.test(raw)) {
    const s: Schedule = {
      id: 'x',
      title: '',
      prompt: '',
      when: input,
      repeat: 'daily',
      hour,
      minute,
      enabled: true,
      createdAt: now,
    };
    return { ok: true, repeat: 'daily', hour, minute, next: nextRun(s, now) ?? undefined };
  }

  // one-off dates
  let target: Date | null = null;
  const iso = raw.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    target = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (isNaN(target.getTime())) target = null;
    if (target) {
      const at = new Date(target);
      at.setHours(hour, minute, 0, 0);
      const ts = at.getTime() > now ? at.getTime() : onceAt(target, hour, minute, now);
      return { ok: true, repeat: 'once', hour, minute, at: ts, next: ts };
    }
  }
  if (/\btomorrow\b/.test(raw)) {
    const at = onceAt(new Date(now + 86_400_000), hour, minute, now);
    return { ok: true, repeat: 'once', hour, minute, at, next: at };
  }
  if (/\btoday\b|\btonight\b/.test(raw)) {
    const at = onceAt(new Date(now), hour, minute, now);
    return { ok: true, repeat: 'once', hour, minute, at, next: at };
  }
  if (weekday !== null) {
    const d = new Date(now);
    d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7));
    const at = onceAt(d, hour, minute, now);
    return { ok: true, repeat: 'once', hour, minute, at, next: at };
  }
  if (time) {
    const at = onceAt(new Date(now), hour, minute, now);
    return { ok: true, repeat: 'once', hour, minute, at, next: at };
  }

  return {
    ok: false,
    error:
      'No time found. Use “every day at 8 am”, “every monday at 9pm”, ' +
      '“every 2 hours”, “tomorrow at 7pm” or a 5-field cron like “30 7 * * 1-5”.',
  };
}

/* ------------------------------- store ---------------------------------- */

let cache: Schedule[] | null = null;

export async function loadSchedules(): Promise<Schedule[]> {
  if (cache) return cache;
  try {
    const raw = await readKey(SCHEDULES_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        cache = list
          .filter((s: any) => s && s.id && s.prompt)
          .map((s: any) => ({ ...s, enabled: s.enabled !== false }));
        return cache!;
      }
    }
  } catch {
    /* corrupt store: an empty list is better than a crash at boot */
  }
  cache = [];
  return cache;
}

export async function saveSchedules(list: Schedule[]): Promise<void> {
  cache = list;
  await writeKey(SCHEDULES_KEY, JSON.stringify(list));
}

export async function addSchedule(fields: {
  title: string;
  prompt: string;
  when: string;
  parsed: ParseResult;
  now?: number;
}): Promise<Schedule> {
  const now = fields.now ?? Date.now();
  const p = fields.parsed;
  if (!p.ok) throw new Error(p.error ?? 'bad time');
  const s: Schedule = {
    id: uid(),
    title: fields.title,
    prompt: fields.prompt,
    when: fields.when,
    repeat: p.repeat ?? 'once',
    hour: p.hour ?? 9,
    minute: p.minute ?? 0,
    weekday: p.weekday,
    everyHours: p.everyHours,
    cron: p.cron,
    at: p.at,
    enabled: true,
    createdAt: now,
  };
  s.nextAt = nextRun(s, now) ?? undefined;
  const list = await loadSchedules();
  const next = [s, ...list];
  await saveSchedules(next);
  await applySchedules(next);
  return s;
}

export async function removeSchedule(id: string): Promise<void> {
  const list = await loadSchedules();
  const next = list.filter(s => s.id !== id);
  await saveSchedules(next);
  await applySchedules(next);
}

export async function setScheduleEnabled(id: string, enabled: boolean): Promise<void> {
  const list = await loadSchedules();
  const next = list.map(s => (s.id === id ? { ...s, enabled } : s));
  for (const s of next) if (s.id === id) s.nextAt = nextRun(s) ?? undefined;
  await saveSchedules(next);
  await applySchedules(next);
}

/** Record the outcome of a run and push the new next-time to the alarm. */
export async function markScheduleRun(
  id: string,
  result: { text?: string; error?: string },
): Promise<void> {
  const list = await loadSchedules();
  const next = list.map(s => {
    if (s.id !== id) return s;
    const updated: Schedule = {
      ...s,
      lastRun: Date.now(),
      lastResult: result.text,
      lastError: result.error,
    };
    // A one-shot has done its job.
    if (s.repeat === 'once') updated.enabled = false;
    updated.nextAt = nextRun(updated) ?? undefined;
    return updated;
  });
  await saveSchedules(next);
  await applySchedules(next);
}

/**
 * Mirror the list into AlarmManager.
 *
 * Deliberately optional: under Jest, or on a build where the module is missing,
 * schedules still live in storage and the UI still works — they just cannot
 * wake the phone. `hasScheduler` is false there.
 */
export async function applySchedules(list: Schedule[]): Promise<boolean> {
  const bridge = nativeScheduler();
  if (!bridge?.replaceAll) return false;
  try {
    const payload = list
      .filter(s => s.enabled)
      .map(s => {
        const at = nextRun(s);
        return {
          id: s.id,
          title: s.title,
          prompt: s.prompt,
          at: at ?? 0,
          repeatMs: repeatMs(s),
        };
      })
      .filter(e => e.at > Date.now());
    await bridge.replaceAll(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function nativeScheduler(): any {
  try {
    return require('react-native').NativeModules.AmitScheduler;
  } catch {
    return null;
  }
}

/** Test hook. */
export function __resetScheduleCache() {
  cache = null;
}

export function sortSchedules(list: Schedule[]): Schedule[] {
  return [...list].sort((a, b) => {
    const an = a.enabled ? nextRun(a) ?? Infinity : Infinity;
    const bn = b.enabled ? nextRun(b) ?? Infinity : Infinity;
    return an - bn || b.createdAt - a.createdAt;
  });
}
