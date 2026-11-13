/**
 * The bridge when there is no bridge.
 *
 * A build without the native module (Jest, an old APK, an iOS build) must not
 * crash, and — more importantly — must not look like it worked. Every call
 * returns the same failure envelope, `hasAutomation` is false, and the tools
 * are never advertised.
 *
 * Also covers event plumbing: native pushes JSON in a `json` field, a broken
 * payload is ignored rather than thrown, and an unsubscribed listener stops
 * hearing anything (this is what stops a destroyed screen from being updated).
 */

import { NativeModules, DeviceEventEmitter } from 'react-native';

describe('without the native module', () => {
  let A: typeof import('../src/lib/automation');

  beforeEach(() => {
    jest.resetModules();
    delete (NativeModules as any).AmitAutomation;
    A = require('../src/lib/automation');
  });

  test('reports itself as missing', () => {
    expect(A.hasAutomation).toBe(false);
  });

  test('status and permission return null instead of throwing', async () => {
    expect(await A.getAutomationStatus()).toBeNull();
    expect(await A.getAutomationPermission()).toBeNull();
  });

  test('every tool answers with a not_available envelope', async () => {
    const calls = [
      A.openApp('com.google.android.youtube'),
      A.foregroundApp(),
      A.listInstalledApps(),
      A.screenContent(),
      A.findElement('Search'),
      A.clickableElements(),
      A.tapElement('Search'),
      A.typeText('hello'),
      A.scrollScreen('down'),
      A.pressBack(),
      A.requestUserConfirmation('send it'),
    ];
    for (const r of await Promise.all(calls)) {
      expect(r.ok).toBe(false);
      expect(r.error_code).toBe('not_available');
      expect(r.message).toMatch(/not available/i);
    }
  });

  test('history is an empty list, not undefined', async () => {
    expect(await A.automationHistory()).toEqual([]);
    expect(await A.clearAutomationHistory()).toEqual([]);
  });

  test('confirming a non-existent prompt reports false', async () => {
    expect(await A.confirmAction('nope', true)).toBe(false);
  });
});

describe('with the native module', () => {
  let A: typeof import('../src/lib/automation');

  beforeEach(() => {
    jest.resetModules();
    (NativeModules as any).AmitAutomation = {
      status: jest.fn(async () =>
        JSON.stringify({
          status: 'success',
          ok: true,
          action: 'get_automation_status',
          message: 'ok',
          error_code: null,
          changed: null,
          duration_ms: 1,
          at: Date.now(),
          data: { action_mode: true, permission_enabled: false, service_connected: false },
        }),
      ),
      tapElement: jest.fn(async () => 'not json at all'),
    };
    A = require('../src/lib/automation');
  });

  afterEach(() => {
    delete (NativeModules as any).AmitAutomation;
  });

  test('a malformed native reply is a failure, never a success', async () => {
    const r = await A.tapElement('Search');
    expect(r.ok).toBe(false);
    expect(r.status).toBe('failed');
    expect(r.message).toMatch(/could not be read/i);
  });

  test('state events arrive parsed and stop after unsubscribe', () => {
    const seen: any[] = [];
    const off = A.onAutomationState(s => seen.push(s));

    DeviceEventEmitter.emit('AmitAutomationState', {
      json: JSON.stringify({ action_mode: true, status: 'running', app: 'YouTube' }),
      ts: Date.now(),
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].app).toBe('YouTube');

    // A broken payload is dropped instead of throwing inside the emitter.
    DeviceEventEmitter.emit('AmitAutomationState', { json: '{oops' });
    expect(seen).toHaveLength(1);

    off();
    DeviceEventEmitter.emit('AmitAutomationState', { json: JSON.stringify({ app: 'Late' }) });
    expect(seen).toHaveLength(1);
  });

  test('confirmation events carry the id, text and timeout', () => {
    const seen: any[] = [];
    const off = A.onAutomationConfirm(c => seen.push(c));
    DeviceEventEmitter.emit('AmitAutomationConfirm', {
      json: JSON.stringify({ id: 'cf_9', description: 'Send the message', timeout_ms: 90000 }),
    });
    expect(seen[0]).toEqual({ id: 'cf_9', description: 'Send the message', timeout_ms: 90000 });
    off();
  });
});

describe('permission helpers', () => {
  test('opening settings failures are swallowed, not thrown', async () => {
    jest.resetModules();
    (NativeModules as any).AmitAutomation = {
      openAccessibilitySettings: jest.fn(async () => {
        throw new Error('no activity');
      }),
    };
    const A2 = require('../src/lib/automation');
    expect(await A2.openAccessibilitySettings()).toBe(false);
    delete (NativeModules as any).AmitAutomation;
  });
});
