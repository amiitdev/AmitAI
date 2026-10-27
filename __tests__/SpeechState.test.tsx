/**
 * TTS state machine.
 *
 * The bug this locks down: finishing one utterance used to clear the state of
 * whatever had been started since, so the speaker button flipped back to
 * "speak" mid-sentence and every tap restarted the answer from the top —
 * it looked like the app would not stop talking.
 *
 * The native side now tags every event with the utterance id JS handed it, and
 * JS ignores ids that are not the active one.
 */

import { DeviceEventEmitter } from 'react-native';

jest.mock('../src/lib/native', () => ({
  hasTTS: true,
  hasSTT: true,
  hasVoice: true,
  speak: jest.fn(),
  stopSpeaking: jest.fn(),
  speakLocal: jest.fn(async () => {}),
  stopLocal: jest.fn(),
}));

import { speak, stopSpeaking, stopLocal } from '../src/lib/native';
import { speakAloud, stopAllSpeech, configureVoice } from '../src/lib/speech';

const end = (id?: string) =>
  DeviceEventEmitter.emit('AmitVoiceSpeakingEnd', id ? { id } : {});

const idOfLastSpeak = (): string => {
  const calls = (speak as jest.Mock).mock.calls;
  return calls[calls.length - 1][2];
};

beforeEach(() => {
  jest.clearAllMocks();
  configureVoice({
    ttsProvider: 'device',
    ttsVoice: 0,
    ttsSpeed: 1,
  });
});

describe('speech · utterance ids', () => {
  test('the id JS passes reaches the native bridge', () => {
    const id = speakAloud('hello there');
    expect(idOfLastSpeak()).toBe(id);
    expect(id).toMatch(/^amitai-/);
  });

  test('a stale end event does not end the utterance that is playing', () => {
    const onDone = jest.fn();
    const id = speakAloud('long answer', onDone);

    // event for some other (already replaced) utterance
    end('amitai-somewhere-else-1');
    expect(onDone).not.toHaveBeenCalled();

    // and the real one still works
    end(id);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  test('the same end event cannot fire twice', () => {
    const onDone = jest.fn();
    const id = speakAloud('answer', onDone);
    end(id);
    end(id);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  test('stopping cancels the continuation — no zombie restart', () => {
    const onDone = jest.fn();
    const id = speakAloud('answer', onDone);

    stopAllSpeech();

    // the engine reports the stop a beat later; it must not advance the loop
    end(id);
    expect(onDone).not.toHaveBeenCalled();
  });

  test('stopAllSpeech reaches both engines and is idempotent', () => {
    speakAloud('answer');
    stopAllSpeech();
    stopAllSpeech();
    expect(stopSpeaking).toHaveBeenCalledTimes(2);
    expect(stopLocal).toHaveBeenCalledTimes(2);
  });

  test('an engine error unsticks the UI and reports the reason', () => {
    const onDone = jest.fn();
    const onError = jest.fn();
    const id = speakAloud('answer', onDone, onError);

    DeviceEventEmitter.emit('AmitVoiceError', {
      id,
      message: 'Text-to-speech is not ready on this phone.',
    });

    // a failure must not look like a finished answer (voice mode would advance)
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('Text-to-speech is not ready on this phone.');
  });

  test('an offline voice rejection reports why instead of playing silence', async () => {
    const native = jest.requireMock('../src/lib/native');
    (native.speakLocal as jest.Mock).mockRejectedValueOnce(
      new Error('localtts_piper: model failed to load'),
    );
    configureVoice({
      ttsProvider: 'piper',
      ttsVoice: 0,
      ttsSpeed: 1,
    });

    const onDone = jest.fn();
    const onError = jest.fn();
    speakAloud('answer', onDone, onError);
    await Promise.resolve();
    await Promise.resolve();

    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatch(/could not run on this phone/i);
  });

  test('"started playing" is reported for the matching utterance only', () => {
    const onStart = jest.fn();
    const id = speakAloud('answer', undefined, undefined, onStart);

    DeviceEventEmitter.emit('AmitVoiceSpeakingStart', { id: 'somebody-elses-utterance' });
    expect(onStart).not.toHaveBeenCalled();

    DeviceEventEmitter.emit('AmitVoiceSpeakingStart', { id });
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  test('an engine that never starts says so instead of waiting in silence', () => {
    jest.useFakeTimers();
    try {
      const onError = jest.fn();
      speakAloud('an answer nobody hears', undefined, onError);

      jest.advanceTimersByTime(2600);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0]).toMatch(/not playing audio/i);
    } finally {
      jest.useRealTimers();
    }
  });

  test('a real start cancels the silent-engine warning', () => {
    jest.useFakeTimers();
    try {
      const onError = jest.fn();
      const id = speakAloud('answer', undefined, onError);

      DeviceEventEmitter.emit('AmitVoiceSpeakingStart', { id });
      jest.advanceTimersByTime(2600);

      expect(onError).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  test('a recogniser error does not end the answer that is playing', () => {
    const onDone = jest.fn();
    const onError = jest.fn();
    speakAloud('a long answer that is still being read out', onDone, onError);

    // The mic is open during playback for barge-in, so the recogniser reports
    // its own errors on the same event. A silence timeout says nothing about
    // the audio — treating it as a failure used to cut the answer short.
    DeviceEventEmitter.emit('AmitVoiceError', {
      code: 7,
      message: 'No speech detected',
    });
    DeviceEventEmitter.emit('AmitVoiceError', {
      source: 'stt',
      code: 2,
      message: 'Recognizer needs a network connection',
    });

    expect(onDone).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  test('stopping drops the error callback too — one interruption, no reports', () => {
    const onError = jest.fn();
    const id = speakAloud('answer', undefined, onError);
    stopAllSpeech();
    DeviceEventEmitter.emit('AmitVoiceError', { id, message: 'stopped' });
    expect(onError).not.toHaveBeenCalled();
  });

  test('the offline path sends engine, voice and the same utterance id', async () => {
    configureVoice({
      ttsProvider: 'kitten',
      ttsVoice: 3,
      ttsSpeed: 1.2,
    });
    const id = speakAloud('offline answer');
    await Promise.resolve();
    const call = (jest.requireMock('../src/lib/native').speakLocal as jest.Mock).mock.calls[0];
    expect(call[1]).toBe('kitten');
    expect(call[2]).toBe(3);
    expect(call[3]).toBe(1.2);
    expect(call[4]).toBe(id);
  });
});
