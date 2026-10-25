import { isRealUserSpeech, isSpeakerEcho } from '../src/lib/barge';
import { THEMES, ThemeKey, applyTheme } from '../src/theme';

describe('Voice Barge-In / Interruption Logic', () => {
  const assistantSpeech = 'Big O notation measures the execution time or space requirement of algorithms as input grows.';

  test('recognizes single-word stop and interruption keywords immediately', () => {
    expect(isRealUserSpeech('stop', assistantSpeech)).toBe(true);
    expect(isRealUserSpeech('wait', assistantSpeech)).toBe(true);
    expect(isRealUserSpeech('no', assistantSpeech)).toBe(true);
    expect(isRealUserSpeech('cancel', assistantSpeech)).toBe(true);
    expect(isRealUserSpeech('pause', assistantSpeech)).toBe(true);
    expect(isRealUserSpeech('quiet', assistantSpeech)).toBe(true);
    expect(isRealUserSpeech('listen', assistantSpeech)).toBe(true);
    expect(isRealUserSpeech('hey', assistantSpeech)).toBe(true);
    expect(isRealUserSpeech('hold', assistantSpeech)).toBe(true);
  });

  test('recognizes novel phrases with zero echo overlap', () => {
    expect(isRealUserSpeech('what about merge sort', assistantSpeech)).toBe(true);
    expect(isRealUserSpeech('tell me a joke', assistantSpeech)).toBe(true);
  });

  test('filters out phone speaker echo', () => {
    // When the phone mic hears its own speaker repeating the assistant text
    expect(isRealUserSpeech('execution time space requirement', assistantSpeech)).toBe(false);
  });
});

describe('Echo guard after an answer', () => {
  const answer =
    'A monad is a way to wrap a value. In JavaScript you can think of it as a ' +
    'box that tells you what to do with that value.';

  test('a follow-up question right after an answer is not echo', () => {
    expect(isSpeakerEcho('what is the weather in paris today', answer, 300)).toBe(false);
  });

  test('the decaying tail of the answer is echo', () => {
    expect(isSpeakerEcho('tells you what to do with that value', answer, 300)).toBe(true);
  });

  test('nothing is filtered once the speaker has gone quiet', () => {
    expect(isSpeakerEcho('tells you what to do with that value', answer, 5000)).toBe(false);
  });
});

describe('Dark Themes', () => {
  const themes: ThemeKey[] = ['midnight', 'tokyo', 'obsidian'];

  test('all 3 dark themes are registered and have full palette', () => {
    themes.forEach(key => {
      const t = THEMES[key];
      expect(t).toBeDefined();
      expect(t.name).toBeTruthy();
      expect(t.bg).toMatch(/^#[0-9a-f]{6}$/i);
      expect(t.bgRaised).toMatch(/^#[0-9a-f]{6}$/i);
      expect(t.bgInput).toMatch(/^#[0-9a-f]{6}$/i);
      expect(t.border).toMatch(/^#[0-9a-f]{6}$/i);
      expect(t.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(t.text).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  test('applyTheme properly updates active colors', () => {
    const oled = applyTheme('midnight');
    expect(oled.bg).toBe('#000000');

    const tokyo = applyTheme('tokyo');
    expect(tokyo.bg).toBe('#0f141c');

    const obsidian = applyTheme('obsidian');
    expect(obsidian.bg).toBe('#0d1117');
  });
});
