/**
 * Small, pure helpers for the reply timing readout.
 *
 * The app shows two numbers on every answer: how long it took, and how fast it
 * produced tokens. Both are measured in `runAgent` (src/api/openai.ts) and
 * stored on the message, so history keeps its real numbers after a restart.
 */

/** 4 characters ≈ 1 token. Only used when the provider reports no usage. */
export const approxTokens = (text: string): number => Math.ceil(text.length / 4);

/** "820 ms" · "4.2 s" · "38 s" · "2m 04s" */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)} s`;
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

/** Output tokens per second, rounded the way people read it. */
export function tokensPerSecond(tokens: number, ms: number): number {
  if (!tokens || !Number.isFinite(ms) || ms <= 0) return 0;
  return tokens / (ms / 1000);
}

/** "48 tok/s" · "6.3 tok/s" */
export function formatTps(tps: number): string {
  if (!Number.isFinite(tps) || tps <= 0) return '—';
  if (tps >= 100) return `${Math.round(tps)} tok/s`;
  if (tps >= 10) return `${tps.toFixed(0)} tok/s`;
  return `${tps.toFixed(1)} tok/s`;
}

/** Convenience: speed straight from a token count and a duration. */
export const formatSpeed = (tokens: number, ms: number): string =>
  formatTps(tokensPerSecond(tokens, ms));

/**
 * The one-line footer: `12 s · first 1.4 s · 48 tok/s · 512 tok`.
 *
 * The first-token figure only appears when it is long enough to explain a
 * silence — below a second it is noise. `exact` says whether the token count
 * came from the provider's usage report (Puter sends one) or from the chars/4
 * estimate, so the number never claims more precision than it has.
 */
export function formatStats(opts: {
  latencyMs?: number;
  ttftMs?: number;
  tps?: number;
  tokens?: number;
  exact?: boolean;
}): string {
  const parts: string[] = [];
  if (opts.latencyMs) parts.push(formatDuration(opts.latencyMs));
  // Only worth saying when the wait is a real fraction of the answer; when it is
  // the whole answer, it just repeats the number before it.
  const ttftAdds = !!opts.ttftMs && !!opts.latencyMs && opts.ttftMs < opts.latencyMs * 0.8;
  if (opts.ttftMs && opts.ttftMs >= 800 && ttftAdds) {
    parts.push(`first ${formatDuration(opts.ttftMs)}`);
  }
  if (opts.tps) parts.push(formatTps(opts.tps));
  if (opts.tokens) parts.push(`${opts.exact ? '' : '~'}${opts.tokens} tok`);
  return parts.join(' · ');
}
