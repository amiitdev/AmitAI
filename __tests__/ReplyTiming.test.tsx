/**
 * The reply timing readout in a bubble.
 *
 * Before this, an answer showed only "512 tok" — nothing about how long the
 * wait was or how fast the model produced it, which is exactly what you cannot
 * tell from a spinner.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';

jest.mock('../src/lib/native', () => ({
  copyText: jest.fn(async () => true),
  hasTTS: false,
  hasSTT: false,
  hasVoice: false,
  speak: jest.fn(),
  stopSpeaking: jest.fn(),
  speakLocal: jest.fn(async () => {}),
  stopLocal: jest.fn(),
}));

import { Bubble } from '../src/components/Bubble';
import { ToastProvider } from '../src/components/Toast';
import { ThemeProvider } from '../src/theme';
import { Message } from '../src/types';

const render = (message: Message) => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <ThemeProvider>
        <ToastProvider>
          <Bubble message={message} />
        </ToastProvider>
      </ThemeProvider>,
    );
  });
  return tree!;
};

const allText = (tree: ReactTestRenderer.ReactTestRenderer): string =>
  tree.root
    .findAllByType(Text)
    .map(n => React.Children.toArray(n.props.children).join(''))
    .join(' | ');

const answered: Message = {
  id: 'a1',
  role: 'assistant',
  content: 'Four.',
  createdAt: Date.now() - 12_400,
  tokens: 512,
  exactTokens: true,
  latencyMs: 12_400,
  ttftMs: 1400,
  tps: 48,
};

test('a finished answer states its time, first-token wait, speed and tokens', () => {
  const tree = render(answered);
  const text = allText(tree);
  expect(text).toContain('12 s');
  expect(text).toContain('first 1.4 s');
  expect(text).toContain('48 tok/s');
  expect(text).toContain('512 tok');
  ReactTestRenderer.act(() => tree.unmount());
});

test('an old message with no measurements shows no timing line', () => {
  const tree = render({
    id: 'a2',
    role: 'assistant',
    content: 'From before the feature.',
    createdAt: Date.now(),
    tokens: 40,
  });
  const text = allText(tree);
  expect(text).not.toContain('tok/s');
  ReactTestRenderer.act(() => tree.unmount());
});

test('a streaming answer counts up instead of spinning silently', () => {
  const tree = render({
    id: 'a3',
    role: 'assistant',
    content: 'Partial answer still arriving',
    createdAt: Date.now() - 3000,
    streaming: true,
  });
  const text = allText(tree);
  expect(text).toMatch(/\d(\.\d)? s/);
  ReactTestRenderer.act(() => tree.unmount());
});
