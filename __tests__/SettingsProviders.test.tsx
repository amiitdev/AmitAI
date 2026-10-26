/**
 * Provider switching in Settings.
 *
 * The point of the vault: every provider keeps its own API key, so flipping
 * between Gemini / OpenRouter / OpenAI never overwrites the one you already
 * typed. These tests press the real chips and read the settings that the
 * screen hands back through onChange.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TouchableOpacity, TextInput } from 'react-native';

import { SettingsScreen } from '../src/screens/SettingsScreen';
import { Settings, DEFAULT_SETTINGS, PROVIDERS, OPENROUTER_FREE } from '../src/types';

// Nothing here touches the network or the Kotlin bridge.
jest.mock('../src/api/openai', () => ({ ping: jest.fn(async () => []) }));
jest.mock('../src/lib/native', () => ({
  hasSTT: () => false,
  hasTTS: () => false,
  hasPicker: () => false,
  pickImage: jest.fn(),
  // StorageSection mounts with the screen and asks the bridge for its path.
  storageInfo: jest.fn(async () => null),
  requestAllFiles: jest.fn(async () => false),
  // The Voice section reports the phone TTS engine it managed to open.
  ttsStatus: jest.fn(async () => null),
  // The opencode MCP card asks the bridge where the loopback endpoint is.
  mcpInfo: jest.fn(async () => ({ url: 'http://127.0.0.1:8140/mcp', token: 'test', running: true, service: true })),
  setMcpService: jest.fn(async () => true),
  copyText: jest.fn(async () => true),
}));
jest.mock('../src/lib/speech', () => ({
  speakWithConfig: jest.fn(),
  stopAllSpeech: jest.fn(),
}));
jest.mock('../src/lib/useKeyboard', () => ({ useKeyboardHeight: () => 0 }));

/** Latest settings the screen asked App to store. */
let latest: Settings = { ...DEFAULT_SETTINGS };

/** App's real behaviour: merge every patch into one settings object. */
function Harness({ initial }: { initial: Settings }) {
  const [settings, setSettings] = React.useState(initial);
  latest = settings;
  return (
    <SettingsScreen
      settings={settings}
      onChange={patch => setSettings(prev => ({ ...prev, ...patch }))}
      onBack={() => {}}
      onClearChats={() => {}}
    />
  );
}

const textOf = (node: ReactTestRenderer.ReactTestInstance): string => {
  const kids = node.props.children;
  if (typeof kids === 'string') return kids;
  const first = React.Children.toArray(kids)[0];
  if (React.isValidElement(first)) {
    const inner = (first.props as { children?: unknown }).children;
    return typeof inner === 'string' ? inner : '';
  }
  return '';
};

const chip = (root: ReactTestRenderer.ReactTestInstance, name: string) => {
  const found = root
    .findAllByType(TouchableOpacity)
    .find(n => textOf(n) === name || textOf(n).replace(/\s+/g, ' ').trim() === name);
  if (!found) throw new Error(`chip not found: ${name}`);
  return found;
};

const press = async (root: ReactTestRenderer.ReactTestInstance, name: string) => {
  await ReactTestRenderer.act(async () => {
    chip(root, name).props.onPress();
  });
};

const typeKey = async (root: ReactTestRenderer.ReactTestInstance, value: string) => {
  const field = root.findAllByType(TextInput).find(n => n.props.placeholder === 'sk-...');
  if (!field) throw new Error('API key field not found');
  await ReactTestRenderer.act(async () => {
    field.props.onChangeText(value);
  });
};

const START: Settings = {
  ...DEFAULT_SETTINGS,
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-5.1',
  apiKey: 'sk-openai-key',
};

describe('Settings · provider switching', () => {
  test('every provider from types.ts is offered as a chip', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<Harness initial={START} />);
    });
    PROVIDERS.forEach(p => {
      expect(() => chip(tree.root, p.name)).not.toThrow();
    });
    await ReactTestRenderer.act(async () => tree.unmount());
  });

  test('switching files the old key under its provider and clears the field', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<Harness initial={START} />);
    });

    await press(tree.root, 'OpenRouter');

    expect(latest.baseUrl).toBe('https://openrouter.ai/api/v1');
    // no OpenRouter key stored yet → field is empty, not the OpenAI key
    expect(latest.apiKey).toBe('');
    expect(latest.providerKeys.OpenAI).toBe('sk-openai-key');

    await ReactTestRenderer.act(async () => tree.unmount());
  });

  test('both keys survive a round trip and each provider restores its own', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<Harness initial={START} />);
    });

    await press(tree.root, 'OpenRouter');
    await typeKey(tree.root, 'sk-or-v1-free');

    expect(latest.apiKey).toBe('sk-or-v1-free');
    expect(latest.providerKeys.OpenRouter).toBe('sk-or-v1-free');
    expect(latest.providerKeys.OpenAI).toBe('sk-openai-key');

    // Gemini has no key yet: field empties, both other keys stay filed
    await press(tree.root, 'Gemini');
    expect(latest.baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta/openai');
    expect(latest.apiKey).toBe('');
    expect(latest.providerKeys.OpenRouter).toBe('sk-or-v1-free');
    expect(latest.providerKeys.OpenAI).toBe('sk-openai-key');

    // going back to OpenRouter restores its key
    await press(tree.root, 'OpenRouter');
    expect(latest.apiKey).toBe('sk-or-v1-free');

    await ReactTestRenderer.act(async () => tree.unmount());
  });

  test('each provider gets a sensible default model, and OpenRouter offers only the free list', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<Harness initial={START} />);
    });

    await press(tree.root, 'OpenRouter');
    expect(latest.model).toBe('nvidia/nemotron-3.5-super-vl:free');

    // model chips are restricted to the hand-tested free models
    OPENROUTER_FREE.forEach(m => {
      expect(() => chip(tree.root, m.model)).not.toThrow();
    });
    // …and nothing paid sneaks in
    expect(() => chip(tree.root, 'gpt-5.1')).toThrow();

    // picking a free model updates settings.model
    await press(tree.root, 'recursive/flint-v1.0:free');
    expect(latest.model).toBe('recursive/flint-v1.0:free');

    await press(tree.root, 'Gemini');
    expect(latest.model).toBe('gemini-3.5-flash');

    await ReactTestRenderer.act(async () => tree.unmount());
  });
});
