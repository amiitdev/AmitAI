/**
 * Action Mode tools — the contract the model actually sees.
 *
 * These tests exercise the JavaScript side end to end: validation happens
 * before anything reaches the phone, every reply is the same JSON envelope, and
 * the tools are only advertised while the user has Action Mode on.
 *
 * The native module is faked here on purpose. What is being tested is the
 * promise we make to the model ("only success when Android confirms it"), not
 * Android itself — the Kotlin side is covered by AutomationPolicyTest and by
 * the on-device checks in docs/ACTION_MODE.md.
 */

import { NativeModules } from 'react-native';

type Envelope = {
  status: string;
  ok: boolean;
  action: string;
  message: string;
  error_code: string | null;
  data: any;
};

const ok = (action: string, data: any = {}, message = 'done'): string =>
  JSON.stringify({
    status: 'success',
    ok: true,
    action,
    message,
    error_code: null,
    changed: true,
    duration_ms: 12,
    at: Date.now(),
    data,
  });

const bad = (action: string, code: string, message = 'no'): string =>
  JSON.stringify({
    status: 'failed',
    ok: false,
    action,
    message,
    error_code: code,
    changed: false,
    duration_ms: 8,
    at: Date.now(),
    data: {},
  });

/** A tiny fake of the Kotlin module, with a screen that actually changes. */
function fakeNative() {
  let digest = 'a1';
  const screen = () => ({ package: 'com.google.android.youtube', app: 'YouTube', digest });
  return {
    openApp: jest.fn(async (pkg: string, uri: string | null) => {
      digest = 'b2';
      return ok('open_app', { package: pkg, app: 'YouTube', mode: uri ? 'deep_link' : 'launcher_intent' });
    }),
    foregroundApp: jest.fn(async () => ok('get_foreground_app', screen())),
    listInstalledApps: jest.fn(async () => ok('list_installed_apps', { apps: [], count: 0 })),
    screenContent: jest.fn(async () => ok('get_screen_content', { ...screen(), elements: [] })),
    findElement: jest.fn(async () => ok('find_element', { matches: [{ text: 'Search' }] })),
    clickableElements: jest.fn(async () => ok('get_clickable_elements', { elements: [] })),
    tapElement: jest.fn(async () => {
      // A tap on a screen that does not react: this is the "no_visible_change"
      // case the model must not treat as success.
      return bad('tap_element', 'no_visible_change', 'The click was accepted but the screen did not change.');
    }),
    typeText: jest.fn(async () => {
      digest = 'c3';
      return ok('type_text', { chars: 24, submitted: true });
    }),
    scrollScreen: jest.fn(async () => ok('scroll_screen', { direction: 'down' })),
    pressBack: jest.fn(async () => ok('press_back', {})),
    requestUserConfirmation: jest.fn(async (description: string, timeoutMs: number) => {
      return ok('request_user_confirmation', { approved: true, id: 'cf_1', description, timeoutMs });
    }),
    stop: jest.fn(async () => ok('stop_automation', { stopped: true })),
    status: jest.fn(async () =>
      JSON.stringify({
        status: 'success',
        ok: true,
        action: 'get_automation_status',
        message: 'Automation status read.',
        error_code: null,
        changed: null,
        duration_ms: 1,
        at: Date.now(),
        data: {
          action_mode: true,
          service_connected: true,
          permission_enabled: true,
          session_active: true,
          status: 'idle',
          package: 'com.google.android.youtube',
          app: 'YouTube',
          action: '',
          completed: 2,
          failed: 0,
          steps: 2,
          max_steps: 40,
          progress: 0.05,
          blocked_reason: '',
          pending_confirm_id: null,
          pending_confirm_text: '',
          screen: null,
          hint: 'Ready.',
        },
      }),
    ),
    permission: jest.fn(async () => ({
      enabled: true,
      connected: true,
      action_mode: true,
      notifications: true,
    })),
    history: jest.fn(async () => JSON.stringify([])),
    clearHistory: jest.fn(async () => JSON.stringify([])),
    setActionMode: jest.fn(async () => '{}'),
    beginSession: jest.fn(async () => '{}'),
    endSession: jest.fn(async () => '{}'),
    confirm: jest.fn(async () => ({ ok: true, approved: true, id: 'cf_1' })),
    openAccessibilitySettings: jest.fn(async () => true),
    openNotificationSettings: jest.fn(async () => true),
  };
}

let native: ReturnType<typeof fakeNative>;
let T: typeof import('../src/lib/automationTools');

const parse = (r: { content: string }): Envelope => JSON.parse(r.content);

beforeEach(() => {
  jest.resetModules();
  native = fakeNative();
  (NativeModules as any).AmitAutomation = native;
  // Required after the fake is installed: src/lib/automation.ts reads the
  // module once, at import time, like every other bridge in this app.
  require('../src/lib/automation');
  T = require('../src/lib/automationTools');
});

afterEach(() => {
  delete (NativeModules as any).AmitAutomation;
});

describe('tool validation happens before the phone is touched', () => {
  test('open_app rejects a package name that is not a package name', async () => {
    const r = parse(await T.executeAutomationTool('open_app', { package_name: 'youtube' }));
    expect(r.status).toBe('failed');
    expect(r.error_code).toBe('invalid_argument');
    expect(native.openApp).not.toHaveBeenCalled();
  });

  test('open_app rejects a relative deep link', async () => {
    const r = parse(
      await T.executeAutomationTool('open_app', { package_name: 'com.google.android.youtube', uri: 'watch?v=1' }),
    );
    expect(r.error_code).toBe('invalid_argument');
    expect(native.openApp).not.toHaveBeenCalled();
  });

  test('open_app forwards a valid package and deep link', async () => {
    const r = parse(
      await T.executeAutomationTool('open_app', {
        package_name: 'com.google.android.youtube',
        uri: 'https://www.youtube.com/results?search_query=tera+fitoor',
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.data.mode).toBe('deep_link');
    expect(native.openApp).toHaveBeenCalledWith(
      'com.google.android.youtube',
      'https://www.youtube.com/results?search_query=tera+fitoor',
    );
  });

  test('type_text refuses empty text and oversized text', async () => {
    expect(parse(await T.executeAutomationTool('type_text', { text: '' })).error_code).toBe(
      'invalid_argument',
    );
    expect(
      parse(await T.executeAutomationTool('type_text', { text: 'x'.repeat(1201) })).error_code,
    ).toBe('invalid_argument');
    expect(native.typeText).not.toHaveBeenCalled();
  });

  test('scroll_screen only accepts real directions', async () => {
    const r = parse(await T.executeAutomationTool('scroll_screen', { direction: 'sideways' }));
    expect(r.error_code).toBe('invalid_argument');
    expect(native.scrollScreen).not.toHaveBeenCalled();
  });

  test('tap_element needs a text or a content description', async () => {
    const r = parse(await T.executeAutomationTool('tap_element', {}));
    expect(r.error_code).toBe('invalid_argument');
    expect(native.tapElement).not.toHaveBeenCalled();
  });

  test('get_screen_content clamps the element limit', async () => {
    await T.executeAutomationTool('get_screen_content', { limit: 9999 });
    expect(native.screenContent).toHaveBeenCalledWith(300);
    await T.executeAutomationTool('get_screen_content', { limit: -4 });
    expect(native.screenContent).toHaveBeenLastCalledWith(4);
  });

  test('an unknown tool answers with an error envelope, never a throw', async () => {
    const r = parse(await T.executeAutomationTool('launch_missiles', {}));
    expect(r.ok).toBe(false);
    expect(r.error_code).toBe('unknown_tool');
  });
});

describe('confirmation is a real round trip', () => {
  test('request_user_confirmation converts seconds to ms and clamps', async () => {
    await T.executeAutomationTool('request_user_confirmation', {
      action_description: 'Send the message to Riya',
      timeout_seconds: 5,
    });
    expect(native.requestUserConfirmation).toHaveBeenCalledWith('Send the message to Riya', 10000);

    await T.executeAutomationTool('request_user_confirmation', {
      action_description: 'Send the message to Riya',
      timeout_seconds: 999,
    });
    expect(native.requestUserConfirmation).toHaveBeenLastCalledWith(
      'Send the message to Riya',
      180000,
    );
  });

  test('a denied confirmation is not reported as success', async () => {
    native.requestUserConfirmation.mockResolvedValueOnce(
      JSON.stringify({
        status: 'failed',
        ok: false,
        action: 'request_user_confirmation',
        message: 'The user declined.',
        error_code: 'user_denied',
        changed: null,
        duration_ms: 900,
        at: Date.now(),
        data: { approved: false },
      }),
    );
    const r = parse(
      await T.executeAutomationTool('request_user_confirmation', {
        action_description: 'Delete the file',
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.error_code).toBe('user_denied');
  });

  test('a description shorter than four characters is refused', async () => {
    const r = parse(await T.executeAutomationTool('request_user_confirmation', { action_description: 'ok' }));
    expect(r.error_code).toBe('invalid_argument');
    expect(native.requestUserConfirmation).not.toHaveBeenCalled();
  });
});

describe('observe → act → verify', () => {
  test('a tap with no visible change comes back as failed, not success', async () => {
    const r = parse(await T.executeAutomationTool('tap_element', { text: 'Search' }));
    expect(r.status).toBe('failed');
    expect(r.error_code).toBe('no_visible_change');
    expect(r.ok).toBe(false);
  });

  test('a multi-step flow keeps every reply structured and ordered', async () => {
    // open app → read → tap (fails honestly) → read again → type → read
    const steps = [
      parse(await T.executeAutomationTool('open_app', { package_name: 'com.google.android.youtube' })),
      parse(await T.executeAutomationTool('get_screen_content', {})),
      parse(await T.executeAutomationTool('tap_element', { content_description: 'Search' })),
      parse(await T.executeAutomationTool('get_screen_content', {})),
      parse(await T.executeAutomationTool('type_text', { text: 'Tera Fitoor Arijit Singh', submit: true })),
      parse(await T.executeAutomationTool('get_screen_content', {})),
    ];
    expect(steps.map(s => s.action)).toEqual([
      'open_app',
      'get_screen_content',
      'tap_element',
      'get_screen_content',
      'type_text',
      'get_screen_content',
    ]);
    // The failed tap is visible in the middle of the flow, and the flow still
    // continues with a fresh read — exactly the loop the prompt demands.
    expect(steps[2].ok).toBe(false);
    expect(steps[3].data.digest).toBe('b2');
    expect(steps[4].ok).toBe(true);
    expect(steps[5].data.digest).toBe('c3');
  });
});

describe('gating', () => {
  test('automation tools are not enabled while Action Mode is off', () => {
    const settings = {
      ...require('../src/types').DEFAULT_SETTINGS,
      actionMode: false,
    };
    expect(T.automationToolsEnabled(settings)).toBe(false);
  });

  test('automation tools are enabled only with the switch and the module', () => {
    const settings = {
      ...require('../src/types').DEFAULT_SETTINGS,
      actionMode: true,
      toolsAutomation: true,
    };
    expect(T.automationToolsEnabled(settings)).toBe(true);
    expect(T.automationToolsEnabled({ ...settings, toolsAutomation: false })).toBe(false);
  });

  test('makeExecutor advertises automation only when enabled', () => {
    const { makeExecutor } = require('../src/lib/agentTools');
    const { DEFAULT_SETTINGS } = require('../src/types');

    const off = makeExecutor({ ...DEFAULT_SETTINGS, actionMode: false });
    expect(off.tools.some((t: any) => t.function.name === 'open_app')).toBe(false);

    const on = makeExecutor({ ...DEFAULT_SETTINGS, actionMode: true, toolsAutomation: true });
    const names = on.tools.map((t: any) => t.function.name);
    expect(names).toContain('open_app');
    expect(names).toContain('get_screen_content');
    expect(names).toContain('request_user_confirmation');
    expect(names).toContain('stop_automation');
  });

  test('the old tools are still advertised when Action Mode is on', () => {
    const { makeExecutor } = require('../src/lib/agentTools');
    const { DEFAULT_SETTINGS } = require('../src/types');
    const exec = makeExecutor({ ...DEFAULT_SETTINGS, actionMode: true });
    const names = exec.tools.map((t: any) => t.function.name);
    ['web_search', 'open_page', 'get_weather', 'calculate', 'get_time', 'remember'].forEach(n =>
      expect(names).toContain(n),
    );
  });

  test('a disabled executor refuses an automation call instead of acting', async () => {
    const { makeExecutor } = require('../src/lib/agentTools');
    const { DEFAULT_SETTINGS } = require('../src/types');
    const exec = makeExecutor({ ...DEFAULT_SETTINGS, actionMode: false });
    await expect(exec.execute('open_app', { package_name: 'com.google.android.youtube' })).rejects.toThrow(
      /Action Mode is off/,
    );
    expect(native.openApp).not.toHaveBeenCalled();
  });
});

describe('the system prompt carries the safety rules', () => {
  test('observe-then-act, confirmation and sensitive-screen rules are present', () => {
    const p = T.AUTOMATION_SYSTEM_PROMPT;
    expect(p).toMatch(/After EVERY action/);
    expect(p).toMatch(/request_user_confirmation/);
    expect(p).toMatch(/Never type passwords, OTPs/);
    expect(p).toMatch(/do not repeat the same action/i);
  });
});
