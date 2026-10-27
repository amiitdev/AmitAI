/**
 * Voice mode conversation loop.
 *
 * The bug this locks down: after the assistant answered once, the next
 * question never reached the model. The echo guard compared every new
 * transcript against the *whole* previous answer — and any question sharing a
 * few ordinary words ("what", "is", "the") with a long answer scored high
 * enough to be thrown away as the phone hearing itself. Worse, the recogniser
 * session had already ended by then, so the screen sat on "listening…" with a
 * closed microphone for the rest of the call: voice mode simply stopped
 * answering, with nothing on screen to explain it.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { VoiceMode } from '../src/screens/VoiceMode';

jest.mock('../src/lib/native', () => ({
  hasSTT: true,
  hasTTS: true,
  hasVoice: true,
  startListening: jest.fn(),
  stopListening: jest.fn(),
  cancelListening: jest.fn(),
  warmUp: jest.fn(),
}));

jest.mock('../src/lib/speech', () => ({
  speakAloud: jest.fn(),
  stopAllSpeech: jest.fn(),
  watchSpeechProgress: jest.fn(() => () => {}),
}));

const native = jest.requireMock('../src/lib/native');
const speech = jest.requireMock('../src/lib/speech');

type Session = { onText: (text: string, final: boolean) => void };

let sessions: Session[] = [];
let speechDone: (() => void) | null = null;
let speechStarted: (() => void) | null = null;

const ANSWER =
  'A monad is a way to wrap a value. In JavaScript you can think of it as a ' +
  'box that tells you what to do with that value.';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Let the component's awaits/timeouts settle inside act(). */
const settle = async (ms = 320) => {
  await ReactTestRenderer.act(async () => {
    await sleep(ms);
  });
};

beforeEach(() => {
  sessions = [];
  speechDone = null;
  speechStarted = null;
  jest.clearAllMocks();
  native.startListening.mockImplementation(async (onText: (t: string, f: boolean) => void) => {
    sessions.push({ onText });
    return true;
  });
  speech.speakAloud.mockImplementation(
    (_text: string, onDone?: () => void, _onError?: (m: string) => void, onStart?: () => void) => {
      speechDone = onDone ?? null;
      speechStarted = onStart ?? null;
      return 'utterance-1';
    },
  );
});

async function renderVoice(onAsk: (text: string) => Promise<string>) {
  let tree: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    tree = ReactTestRenderer.create(
      <VoiceMode onClose={() => {}} onAsk={onAsk} voiceLabel="Device voice" />,
    );
  });
  return tree!;
}

describe('voice mode · conversation loop', () => {
  test('a follow-up question after an answer still reaches the model', async () => {
    const onAsk = jest.fn(async () => ANSWER);
    const tree = await renderVoice(onAsk);
    await settle();

    expect(sessions).toHaveLength(1);

    // First question.
    await ReactTestRenderer.act(async () => {
      sessions[0].onText('what is a monad', true);
    });
    await settle();

    await ReactTestRenderer.act(async () => {
      speechStarted?.();
    });
    await settle();

    // While the answer plays the mic stays shut (opening it cuts playback on
    // many phones), so no second recogniser session may appear here.
    expect(sessions).toHaveLength(1);

    // The answer finished playing; the loop reopens the mic.
    await ReactTestRenderer.act(async () => {
      speechDone?.();
    });
    await settle();
    expect(sessions.length).toBeGreaterThanOrEqual(2);

    const before = sessions.length;

    // A normal follow-up: it shares only ordinary words with the answer.
    await ReactTestRenderer.act(async () => {
      sessions[before - 1].onText('what is the weather in paris today', true);
    });
    await settle();

    expect(onAsk).toHaveBeenCalledTimes(2);
    expect(onAsk).toHaveBeenLastCalledWith('what is the weather in paris today');

    await ReactTestRenderer.act(async () => tree.unmount());
  });

  test('the microphone is closed for the whole answer, then reopens', async () => {
    const onAsk = jest.fn(async () => ANSWER);
    const tree = await renderVoice(onAsk);
    await settle();

    await ReactTestRenderer.act(async () => {
      sessions[0].onText('what is a monad', true);
    });
    await settle();
    await ReactTestRenderer.act(async () => {
      speechStarted?.();
    });
    await settle(650);

    expect(native.startListening).toHaveBeenCalledTimes(1);
    expect(sessions).toHaveLength(1);

    await ReactTestRenderer.act(async () => {
      speechDone?.();
    });
    await settle();

    expect(native.startListening).toHaveBeenCalledTimes(2);
    expect(onAsk).toHaveBeenCalledTimes(1);

    await ReactTestRenderer.act(async () => tree.unmount());
  });

  test('a session that ends on the speaker echo reopens the mic', async () => {
    const onAsk = jest.fn(async () => ANSWER);
    const tree = await renderVoice(onAsk);
    await settle();

    await ReactTestRenderer.act(async () => {
      sessions[0].onText('what is a monad', true);
    });
    await settle();
    await ReactTestRenderer.act(async () => {
      speechStarted?.();
    });
    await settle();
    await ReactTestRenderer.act(async () => {
      speechDone?.();
    });
    await settle();

    const before = sessions.length;
    expect(before).toBeGreaterThanOrEqual(2);

    // The mic picks up the tail of its own answer — a final result for it.
    await ReactTestRenderer.act(async () => {
      sessions[before - 1].onText('tells you what to do with that value', true);
    });
    await settle();

    // It must not be asked as a new question…
    expect(onAsk).toHaveBeenCalledTimes(1);
    // …and the mic must come back instead of going deaf.
    expect(sessions.length).toBeGreaterThan(before);

    await ReactTestRenderer.act(async () => tree.unmount());
  });
});
