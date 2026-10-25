/**
 * Echo guard for barge-in.
 *
 * While the assistant speaks, the mic is open so it can be interrupted. The
 * phone's own loudspeaker bleeds into the microphone, so the recognizer
 * routinely transcribes the assistant's own sentence — which must NOT count
 * as an interruption.
 *
 * Both sides are normalised and compared as word sets. A Jaccard-style ratio
 * of 0.4 is the cut: overlap above it is the phone hearing itself, below it is
 * the user talking over it.
 */

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const words = (s: string) => norm(s).split(' ').filter(Boolean);

const STOP_WORDS = new Set([
  'stop',
  'wait',
  'no',
  'cancel',
  'pause',
  'quiet',
  'listen',
  'hey',
  'hold',
  'shh',
  'enough',
  'silence',
]);

export function wordOverlap(heard: string, spoken: string): number {
  const a = new Set(words(heard));
  const b = new Set(words(spoken));
  if (!a.size || !b.size) return 1; // nothing to compare: assume echo
  let hit = 0;
  a.forEach(w => {
    if (b.has(w)) hit++;
  });
  return hit / a.size;
}

/** A one-word command the user says to cut the assistant off. */
export function isStopWord(heard: string): boolean {
  const w = words(heard);
  return w.length === 1 && STOP_WORDS.has(w[0]);
}

/** True when what the mic picked up is really the user, not the speaker. */
export function isRealUserSpeech(heard: string, spoken: string): boolean {
  const w = words(heard);
  if (!w.length) return false;
  // Immediate single-word stop/interruption commands
  if (isStopWord(heard)) return true;
  const overlap = wordOverlap(heard, spoken);
  // Completely new words not uttered by the assistant
  if (w.length >= 1 && overlap === 0) return true;
  // Multi-word phrase with low echo overlap
  return w.length >= 2 && overlap < 0.4;
}

/**
 * How long after the last word the speaker's tail can still reach the mic —
 * generous enough to cover the recogniser's own end-of-speech delay, after
 * which the tail arrives as a final result.
 */
export const ECHO_TAIL_MS = 2000;

/**
 * Only the last part of an answer can still be ringing in the microphone, so
 * only that part is worth comparing against. Comparing against the whole
 * answer is what made every follow-up question look like echo.
 */
export function spokenTail(text: string, chars = 180): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= chars) return flat;
  const cut = flat.slice(flat.length - chars);
  return cut.slice(cut.indexOf(' ') + 1);
}

/**
 * True when a transcript that arrived `silentForMs` after the answer stopped
 * playing is the loudspeaker's own tail rather than the user.
 *
 * Deliberately time-boxed and deliberately strict: it only applies for a beat
 * after the answer, only compares the answer's last words, and only fires when
 * most of what was heard are those same words. Anything looser silently ate
 * real questions — the user spoke, the screen said "listening…", and the
 * assistant never answered.
 */
export function isSpeakerEcho(
  heard: string,
  spoken: string,
  silentForMs: number,
): boolean {
  if (!spoken || !heard) return false;
  if (silentForMs > ECHO_TAIL_MS) return false;
  const tail = spokenTail(spoken);
  // A tail with no words (formatting, table pipes) tells us nothing.
  if (!words(tail).length) return false;
  return wordOverlap(heard, tail) >= 0.75;
}
