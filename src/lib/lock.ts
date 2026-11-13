import { sha256 } from './sha256';

/**
 * The app lock.
 *
 * Scope, stated plainly: this stops the person who picks up your unlocked phone
 * from reading your chats or pressing "send". It is not encryption. Anything
 * stronger has to come from Android itself (app-private storage, which AmitAI
 * already uses, plus FLAG_SECURE so the recents thumbnail is blank).
 *
 * The PIN is never stored — only `sha256(salt + pin)`, with a fresh salt each
 * time the PIN is set, so two people with PIN 1234 do not share a hash.
 */

export const PIN_MIN = 4;
export const PIN_MAX = 8;
/** How long the app can be in the background before it asks again. */
export const LOCK_AFTER_MS = 60_000;
/** Wrong tries before a cool-down, and how long it lasts. */
export const MAX_TRIES = 5;
export const COOLDOWN_MS = 30_000;

export interface PinRecord {
  salt: string;
  hash: string;
}

/** A salt of the same shape as the hash, so nothing stands out in prefs. */
export function makeSalt(rand: () => number = Math.random): string {
  let s = '';
  while (s.length < 32) s += Math.floor(rand() * 0xffffffff).toString(16).padStart(8, '0');
  return s.slice(0, 32);
}

export function hashPin(pin: string, salt: string): string {
  return sha256(`${salt}:${pin}`);
}

export function makePinRecord(pin: string, rand?: () => number): PinRecord {
  const salt = makeSalt(rand);
  return { salt, hash: hashPin(pin, salt) };
}

export function verifyPin(pin: string, rec: PinRecord | null | undefined): boolean {
  if (!rec?.salt || !rec?.hash) return false;
  const got = hashPin(pin.trim(), rec.salt);
  // constant-ish time: compare every character, never return early
  if (got.length !== rec.hash.length) return false;
  let diff = 0;
  // eslint-disable-next-line no-bitwise -- constant-time-ish compare: no early exit
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ rec.hash.charCodeAt(i);
  return diff === 0;
}

/** Why this PIN is not acceptable, or null when it is. */
export function pinProblem(pin: string): string | null {
  const p = pin.trim();
  if (!/^\d+$/.test(p)) return 'Use digits only';
  if (p.length < PIN_MIN) return `At least ${PIN_MIN} digits`;
  if (p.length > PIN_MAX) return `At most ${PIN_MAX} digits`;
  if (/^(\d)\1+$/.test(p)) return 'Not all the same digit';
  if ('0123456789'.includes(p) || '9876543210'.includes(p)) return 'Not a run like 1234';
  return null;
}

/**
 * Should the app be locked right now?
 *
 * Locked at cold start when a PIN exists, and again after LOCK_AFTER_MS in the
 * background — so switching to WhatsApp and back does not nag, but leaving the
 * phone on a table does.
 */
export function shouldLock(opts: {
  appLock: boolean;
  hasPin: boolean;
  backgroundedAt: number | null;
  now: number;
  afterMs?: number;
}): boolean {
  if (!opts.appLock || !opts.hasPin) return false;
  if (opts.backgroundedAt === null) return true; // cold start
  return opts.now - opts.backgroundedAt >= (opts.afterMs ?? LOCK_AFTER_MS);
}

/** Tries left before the cool-down, and whether we are in one. */
export function tryState(
  wrong: number,
  lastWrongAt: number | null,
  now: number,
): { lockedOutUntil: number | null; left: number } {
  const left = Math.max(0, MAX_TRIES - wrong);
  const lockedOutUntil =
    wrong >= MAX_TRIES && lastWrongAt !== null ? lastWrongAt + COOLDOWN_MS : null;
  return { lockedOutUntil: lockedOutUntil && lockedOutUntil > now ? lockedOutUntil : null, left };
}