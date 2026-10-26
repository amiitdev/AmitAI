import { readKey, writeKey, uid } from '../storage/store';

/**
 * Notes / long-term memory.
 *
 * Deliberately boring: one JSON array in the same two backends settings use
 * (SharedPreferences + AsyncStorage). No vectors, no embeddings, no server —
 * the model calls `remember` to write and `recall` to search, and the user can
 * see and delete every row in Settings → Memory.
 *
 * Keeping it this small is the point: a memory the user cannot inspect is a
 * memory they cannot trust.
 */

export interface Note {
  id: string;
  text: string;
  createdAt: number;
  updatedAt: number;
}

const STOP = new Set([
  'the', 'and', 'for', 'you', 'your', 'was', 'were', 'are', 'is', 'am', 'did',
  'does', 'do', 'what', 'when', 'where', 'who', 'why', 'how', 'about', 'tell',
  'said', 'say', 'me', 'my', 'we', 'our', 'i', 'a', 'an', 'of', 'to', 'in',
  'on', 'at', 'it', 'this', 'that', 'with', 'from', 'know', 'any', 'please',
]);

export const MEMORY_KEY = 'amitai:memory:v1';
export const MEMORY_LIMIT = 500;

let cache: Note[] | null = null;

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Comparison form: case-, space- and punctuation-insensitive.
 *
 * "Wi-Fi" and "wifi" are the same fact; so are "e-mail" and "email". Without
 * this, saying the same thing twice created two rows and `recall("wifi")` could
 * not find a note written as "Wi-Fi" — both were observed on a real device.
 */
const fold = (s: string) => norm(s).toLowerCase().replace(/[^a-z0-9]+/g, '');

export async function loadNotes(): Promise<Note[]> {
  if (cache) return cache;
  try {
    const raw = await readKey(MEMORY_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        cache = list.filter((n: any) => n && typeof n.text === 'string');
        return cache!;
      }
    }
  } catch {
    /* corrupt store: start clean instead of crashing the chat */
  }
  cache = [];
  return cache;
}

async function persist(list: Note[]): Promise<void> {
  cache = list;
  await writeKey(MEMORY_KEY, JSON.stringify(list));
}

/** Newest last. Re-saving the same text updates it instead of duplicating. */
export async function addNote(text: string): Promise<Note> {
  const clean = norm(text);
  if (!clean) throw new Error('nothing to remember');
  const list = await loadNotes();
  const now = Date.now();
  const key = fold(clean);
  const same = list.find(n => {
    const k = fold(n.text);
    return k.length > 0 && k === key;
  });
  if (same) {
    same.updatedAt = now;
    await persist(list);
    return same;
  }
  const note: Note = { id: uid(), text: clean, createdAt: now, updatedAt: now };
  const next = [...list, note];
  // Oldest falls off first once the cap is reached.
  await persist(next.length > MEMORY_LIMIT ? next.slice(next.length - MEMORY_LIMIT) : next);
  return note;
}

export async function updateNote(id: string, text: string): Promise<void> {
  const clean = norm(text);
  const list = await loadNotes();
  const note = list.find(n => n.id === id);
  if (!note) throw new Error('note not found');
  if (!clean) throw new Error('nothing to save');
  note.text = clean;
  note.updatedAt = Date.now();
  await persist(list);
}

export async function deleteNote(id: string): Promise<boolean> {
  const list = await loadNotes();
  const next = list.filter(n => n.id !== id);
  if (next.length === list.length) return false;
  await persist(next);
  return true;
}

export async function clearNotes(): Promise<void> {
  await persist([]);
}

/**
 * Word-overlap ranking. Query words are lower-cased and matched as substrings,
 * so "wifi password" finds "home wifi password is …". Recency breaks ties.
 */
export async function searchNotes(query: string, limit = 8): Promise<Note[]> {
  const list = await loadNotes();
  const words = norm(query)
    .toLowerCase()
    .split(/[^a-z0-9@._-]+/)
    .filter(w => w.length > 2 && !STOP.has(w));
  if (!words.length) {
    // Newest first. Two notes written in the same millisecond keep their
    // insertion order reversed, so "just added" is always at the top.
    return list
      .map((n, i) => ({ n, i }))
      .sort((a, b) => b.n.updatedAt - a.n.updatedAt || b.i - a.i)
      .slice(0, limit)
      .map(x => x.n);
  }
  const scored = list.map(n => {
    const hayRaw = norm(n.text).toLowerCase();
    const hayFold = fold(n.text);
    const score = words.reduce((sum, w) => {
      const wFold = fold(w);
      // plain substring first (fast, exact), then the punctuation-insensitive
      // form so "wifi" still finds "Wi-Fi"
      if (hayRaw.includes(w)) return sum + 1;
      if (wFold.length > 1 && hayFold.includes(wFold)) return sum + 1;
      return sum;
    }, 0);
    return { n, score };
  });
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score || b.n.updatedAt - a.n.updatedAt)
    .slice(0, limit)
    .map(s => s.n);
}

/** Plain-text rendering shared by the tool and the screen. */
export function formatNotes(list: Note[]): string {
  if (!list.length) return '';
  return list
    .map((n, i) => `${i + 1}. ${n.text}  [${new Date(n.updatedAt).toLocaleString()}]`)
    .join('\n');
}

/** Test hook: forget the in-process cache. */
export function __resetMemoryCache() {
  cache = null;
}
