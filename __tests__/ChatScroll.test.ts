/**
 * The chat list must not fight the user.
 *
 * A long chat re-measures its cells while you scroll (virtualisation), so
 * `onContentSizeChange` keeps firing. The old code answered every one of those
 * with `scrollToEnd`, which made "scroll up to read an old message" impossible:
 * one flick up, then yanked back to the bottom, again and again. Short chats
 * never re-measure after the first layout, which is why they behaved.
 *
 * The fix is one rule, tested here: follow the newest message only while the
 * user is already at the bottom.
 */

import { isNearBottom, NEAR_BOTTOM_PX } from '../src/lib/chatScroll';

/** contentSize 5000, viewport 800 — offset decides where we are. */
const at = (offsetY: number, height = 5000, viewport = 800) => ({
  contentOffset: { x: 0, y: offsetY },
  contentSize: { width: 1080, height },
  layoutMeasurement: { width: 1080, height: viewport },
});

describe('the chat list only follows when you are already at the bottom', () => {
  test('exactly at the bottom follows', () => {
    expect(isNearBottom(at(4200))).toBe(true); // 5000 - (4200 + 800) = 0
  });

  test('a few pixels above the bottom still follows', () => {
    expect(isNearBottom(at(4180))).toBe(true); // 20 px away
  });

  test('reading an old message does not follow', () => {
    expect(isNearBottom(at(0))).toBe(false); // 4200 px away
    expect(isNearBottom(at(2000))).toBe(false);
  });

  test('over-scroll past the end (rubber band) still counts as bottom', () => {
    expect(isNearBottom(at(4300))).toBe(true); // negative distance
  });

  test('the slack is the documented 80 px, and configurable', () => {
    expect(NEAR_BOTTOM_PX).toBe(80);
    expect(isNearBottom(at(4130))).toBe(true); // 70 px away ⇒ still bottom
    expect(isNearBottom(at(4130), 10)).toBe(false); // with a strict 10 px
    expect(isNearBottom(at(4185), 10)).toBe(false); // 15 px away, strict ⇒ no
  });

  test('a short conversation that fits the screen is always at the bottom', () => {
    expect(isNearBottom(at(0, 400, 800))).toBe(true); // content shorter than viewport
  });
});