/**
 * Transcript follow-along.
 *
 * The card highlights the words the voice has reached and scrolls itself; the
 * boundary maths is what keeps those two in step, so it is pinned here rather
 * than only eyeballed on a device.
 */

import { plainMarkdown, spokenWordIndex } from '../src/lib/format';

describe('transcript · follow along', () => {
  const TEXT = 'One two three four';

  test('starts with nothing spoken and ends with everything', () => {
    expect(spokenWordIndex(TEXT, 0)).toBe(0);
    expect(spokenWordIndex(TEXT, 1)).toBe(4);
  });

  test('advances one word at a time and never overruns', () => {
    expect(spokenWordIndex(TEXT, 0.25)).toBe(1);
    expect(spokenWordIndex(TEXT, 0.5)).toBe(2);
    expect(spokenWordIndex(TEXT, 0.99)).toBe(3);
    expect(spokenWordIndex(TEXT, 4)).toBe(4);
    expect(spokenWordIndex(TEXT, -1)).toBe(0);
  });

  test('empty text is safe', () => {
    expect(spokenWordIndex('   ', 0.5)).toBe(0);
  });

  test('markdown is stripped before it reaches the card', () => {
    expect(plainMarkdown('**Bold** and `code` and [link](http://x)')).toBe(
      'Bold and code and link',
    );
    expect(plainMarkdown('- one\n- two')).toBe('• one\n• two');
  });

  test('numbered items and table rows keep their own line', () => {
    expect(plainMarkdown('1. first\n2. second')).toBe('1. first\n2. second');
    expect(plainMarkdown('| 1 | X300 | flagship |')).toBe('1 · X300 · flagship');
  });
});
