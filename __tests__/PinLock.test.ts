/**
 * The app lock: never store a PIN, never let a wrong one through, never nag
 * when you just switched to WhatsApp for ten seconds.
 */

import { sha256 } from '../src/lib/sha256';
import {
  COOLDOWN_MS,
  LOCK_AFTER_MS,
  MAX_TRIES,
  makePinRecord,
  makeSalt,
  pinProblem,
  shouldLock,
  tryState,
  verifyPin,
} from '../src/lib/lock';

describe('sha256 matches the published FIPS 180-4 vectors', () => {
  test('empty string', () => {
    expect(sha256('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  test('"abc"', () => {
    expect(sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  test('the quick brown fox', () => {
    expect(sha256('The quick brown fox jumps over the lazy dog')).toBe(
      'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592',
    );
  });

  test('multi-block input (> 64 bytes) and padding boundaries', () => {
    expect(sha256('a'.repeat(64))).toBe(
      'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb',
    );
    expect(sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });
});

describe('the PIN is never stored', () => {
  test('a record holds a salt and a hash, not the pin', () => {
    const rec = makePinRecord('4821');
    expect(JSON.stringify(rec)).not.toContain('4821');
    expect(rec.hash).toHaveLength(64);
    expect(rec.salt).toHaveLength(32);
  });

  test('the same PIN gets a different hash each time (fresh salt)', () => {
    const a = makePinRecord('4821');
    const b = makePinRecord('4821');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
    expect(verifyPin('4821', a)).toBe(true);
    expect(verifyPin('4821', b)).toBe(true);
  });

  test('wrong PIN, empty PIN, or a missing record fail', () => {
    const rec = makePinRecord('4821');
    expect(verifyPin('4822', rec)).toBe(false);
    expect(verifyPin('482', rec)).toBe(false);
    expect(verifyPin('', rec)).toBe(false);
    expect(verifyPin('4821', null)).toBe(false);
    expect(verifyPin('4821', { salt: '', hash: '' })).toBe(false);
  });

  test('whitespace from a keyboard does not break it', () => {
    const rec = makePinRecord('4821');
    expect(verifyPin(' 4821 ', rec)).toBe(true);
  });

  test('makeSalt is 32 hex characters and different every call', () => {
    const s1 = makeSalt();
    const s2 = makeSalt();
    expect(s1).toMatch(/^[0-9a-f]{32}$/);
    expect(s1).not.toBe(s2);
  });
});

describe('PIN rules', () => {
  test('accepts a normal PIN', () => {
    expect(pinProblem('4821')).toBeNull();
    expect(pinProblem('907316')).toBeNull();
  });

  test('rejects the shapes people actually choose', () => {
    expect(pinProblem('12')).toMatch(/at least/i);
    expect(pinProblem('12a4')).toMatch(/digits only/i);
    expect(pinProblem('123456789')).toMatch(/at most/i);
    expect(pinProblem('1111')).toMatch(/same digit/i);
    expect(pinProblem('0123')).toMatch(/run/i);
    expect(pinProblem('9876')).toMatch(/run/i);
  });
});

describe('when to ask for the PIN', () => {
  const base = { appLock: true, hasPin: true, now: 1_000_000, backgroundedAt: null as number | null };

  test('a disabled lock or a missing PIN never asks', () => {
    expect(shouldLock({ ...base, appLock: false })).toBe(false);
    expect(shouldLock({ ...base, hasPin: false })).toBe(false);
  });

  test('cold start asks', () => {
    expect(shouldLock({ ...base, backgroundedAt: null })).toBe(true);
  });

  test('a quick switch to another app does not', () => {
    expect(shouldLock({ ...base, backgroundedAt: base.now - 5_000 })).toBe(false);
    expect(shouldLock({ ...base, backgroundedAt: base.now - LOCK_AFTER_MS + 1 })).toBe(false);
  });

  test('a minute in the background does', () => {
    expect(shouldLock({ ...base, backgroundedAt: base.now - LOCK_AFTER_MS })).toBe(true);
    expect(shouldLock({ ...base, backgroundedAt: base.now - 60 * 60_000 })).toBe(true);
  });
});

describe('wrong-try cool-down', () => {
  const now = 5_000_000;

  test('counts down the tries left', () => {
    expect(tryState(0, null, now).left).toBe(MAX_TRIES);
    expect(tryState(2, null, now).left).toBe(MAX_TRIES - 2);
    expect(tryState(99, null, now).left).toBe(0);
  });

  test('no cool-down before the limit', () => {
    expect(tryState(MAX_TRIES - 1, now - 1000, now).lockedOutUntil).toBeNull();
  });

  test('hits a cool-down at the limit, and it expires', () => {
    const last = now - 1000;
    expect(tryState(MAX_TRIES, last, now).lockedOutUntil).toBe(last + COOLDOWN_MS);
    expect(tryState(MAX_TRIES, now - COOLDOWN_MS - 1, now).lockedOutUntil).toBeNull();
  });
});