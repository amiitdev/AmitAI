import React from 'react';
import R from 'react-test-renderer';
import { AutomationBar } from '../src/components/AutomationBar';

const txt = (n: any): string =>
  n == null ? '' : typeof n === 'string' ? n
    : Array.isArray(n) ? n.map(txt).join(' ')
    : txt(n.children);

const st: any = {
  action_mode: true, service_connected: true, permission_enabled: true,
  session_active: true, status: 'running', package: 'com.google.android.youtube',
  app: 'YouTube', action: 'Tapping Search', completed: 3, failed: 0, steps: 3,
  max_steps: 40, progress: 0.075, blocked_reason: '', pending_confirm_id: null,
  pending_confirm_text: '', screen: null,
};

test('strip is hidden when Action Mode is off', () => {
  let t: any;
  R.act(() => { t = R.create(<AutomationBar status={{ ...st, action_mode: false }} onStop={() => {}} onOpen={() => {}} />); });
  expect(t.toJSON()).toBeNull();
});

test('strip names the app/action and stops', () => {
  const onStop = jest.fn();
  let t: any;
  R.act(() => { t = R.create(<AutomationBar status={st} onStop={onStop} onOpen={() => {}} />); });
  const s = txt(t.toJSON());
  expect(s).toContain('YouTube');
  expect(s).toMatch(/3\s+done/);
  const btn = t.root
    .findAll((n: any) => typeof n.props?.onPress === 'function' && n.props?.hitSlop === 8)
    .pop();
  R.act(() => { btn.props.onPress(); });
  expect(onStop).toHaveBeenCalled();
});

test('blocked state shows the reason instead of a task', () => {
  let t: any;
  R.act(() => { t = R.create(<AutomationBar status={{ ...st, status: 'blocked', blocked_reason: 'password field on screen' }} onStop={() => {}} onOpen={() => {}} />); });
  expect(txt(t.toJSON())).toContain('password field on screen');
});
