/**
 * Where the chat list is, and whether it should keep following the newest
 * message.
 *
 * Kept out of App.tsx so the rule can be tested without mounting the whole
 * app (and without RN's Animated/Fabric machinery in the test env).
 */

/** How close to the bottom still counts as "at the bottom". */
export const NEAR_BOTTOM_PX = 80;

export interface ScrollMetrics {
  contentOffset: { x: number; y: number };
  contentSize: { width: number; height: number };
  layoutMeasurement: { width: number; height: number };
}

/**
 * True when the visible window reaches (within 80 px of) the end of the list.
 *
 * A long chat re-measures its cells while you scroll, so `onContentSizeChange`
 * fires repeatedly. Following it unconditionally is what used to yank the list
 * back to the bottom while you were reading an old message.
 */
export function isNearBottom(m: ScrollMetrics, slack = NEAR_BOTTOM_PX): boolean {
  const distance = m.contentSize.height - (m.contentOffset.y + m.layoutMeasurement.height);
  return distance <= slack;
}