/**
 * Deterministic memory commands.
 *
 * Some providers (the local AmitAI Bridge among them) do not forward tool
 * definitions, so `remember …` never reaches the model's `remember` tool.
 * These two phrasings are handled locally instead: same note store, same
 * Memory tab, no network required. Everything else still goes to the model.
 */

export type MemoryCommand =
  | { kind: 'remember'; text: string }
  | { kind: 'recall' };

const REMEMBER =
  /^(?:please\s+|pls\s+)?remember\s+(?:that\s+)?(.{3,})$/i;

// "remember when we…" is a question about the past, not a request to store.
const NOT_A_COMMAND = /^remember\s+(?:when|how|the\s+time|that\s+time)\b/i;

const RECALL =
  /^(?:what\s+do\s+you\s+(?:know|remember)\s+about\s+me|what(?:'s|\s+is)?\s+in\s+(?:your\s+)?memory|list\s+(?:your\s+)?(?:notes|memories)|show\s+(?:your\s+)?memory)\s*\??$/i;

export function parseMemoryCommand(raw: string): MemoryCommand | null {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return null;

  if (RECALL.test(text)) return { kind: 'recall' };

  if (NOT_A_COMMAND.test(text)) return null;

  const m = text.match(REMEMBER);
  if (m) {
    const note = m[1].trim().replace(/[.!]+$/, '');
    if (note.length >= 3) return { kind: 'remember', text: note };
  }
  return null;
}
