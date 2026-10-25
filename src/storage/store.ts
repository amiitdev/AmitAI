import AsyncStorage from '@react-native-async-storage/async-storage';
import { Conversation, Message, Settings, DEFAULT_SETTINGS } from '../types';

const K_CONV = 'amitai:conversations:v1';
const K_SET = 'amitai:settings:v1';

/**
 * Read/write through two backends: SharedPreferences (reliable) and
 * AsyncStorage. Prefs wins on read; both get written on save, so data also
 * migrates forward if prefs were empty and AsyncStorage still has it.
 */
const native = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('react-native').NativeModules.AmitVoice;
  } catch {
    return null;
  }
})();

export async function readKey(key: string): Promise<string | null> {
  try {
    const v = native?.loadJson ? await native.loadJson(key) : null;
    if (typeof v === 'string' && v) return v;
  } catch {}
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function writeKey(key: string, value: string): Promise<void> {
  try {
    native?.saveJson?.(key, value);
  } catch {}
  try {
    await AsyncStorage.setItem(key, value);
  } catch {}
}

/* ----------------------------------------------- */
/* SD-card (external files dir) backend for big JSON */
/* ----------------------------------------------- */

const SD_KEY_CONV = 'conversations.json';

async function sdRead(key: string): Promise<string | null> {
  if (!native?.loadLargeJson) return null;
  try {
    return await native.loadLargeJson(key);
  } catch {
    return null;
  }
}

async function sdWrite(key: string, value: string): Promise<void> {
  if (!native?.saveLargeJson) return;
  try {
    await native.saveLargeJson(key, value);
  } catch {}
}

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Title from the first user message — same trick every chat app uses. */
export function titleFrom(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 42 ? t.slice(0, 42) + '…' : t || 'New chat';
}

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await readKey(K_SET);
    if (!raw) return DEFAULT_SETTINGS;
    // spread over defaults so new fields added later never come back undefined
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  await writeKey(K_SET, JSON.stringify(s));
}

/**
 * Conversations live either in the small prefs+AsyncStorage backend (default)
 * or in the SD-card backend when the user enables it in Settings.
 *
 * SD-card storage is app-private on Android 10+ (scoped storage), so no extra
 * permission is needed and the files are only readable by this app's UID.
 */
export async function loadConversations(): Promise<Conversation[]> {
  // SD-card backend takes precedence when it has data.
  if (native?.loadLargeJson) {
    try {
      const raw = await sdRead(SD_KEY_CONV);
      if (raw) {
        const list: Conversation[] = JSON.parse(raw);
        return list.sort((a, b) => b.updatedAt - a.updatedAt);
      }
    } catch {}
  }

  try {
    const raw = await readKey(K_CONV);
    if (!raw) return [];
    const list: Conversation[] = JSON.parse(raw);
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

/**
 * Migrate conversations out of the old backend into the new one when switching
 * to SD-card storage, so nothing is lost in the transition.
 */
export async function migrateConversationsToSd(): Promise<void> {
  if (!native?.saveLargeJson) return;
  try {
    const raw = await readKey(K_CONV);
    if (raw) {
      await sdWrite(SD_KEY_CONV, raw);
    }
  } catch {}
}

export async function saveConversations(list: Conversation[]): Promise<void> {
  // SD-card backend is the primary target when available; prefs is the
  // fallback. Writing to both means a future switch-back still has the data.
  const json = JSON.stringify(list);
  if (native?.saveLargeJson) {
    try {
      await sdWrite(SD_KEY_CONV, json);
    } catch {}
  }
  try {
    await writeKey(K_CONV, json);
  } catch {}
}

export function newConversation(): Conversation {
  const now = Date.now();
  return { id: uid(), title: 'New chat', messages: [], createdAt: now, updatedAt: now };
}

export function newMessage(role: Message['role'], content = ''): Message {
  return { id: uid(), role, content, createdAt: Date.now() };
}

/**
 * When on SD-card storage we do not need to trim — the external files dir has
 * plenty of room. Keep the stubbing logic for the AsyncStorage backend so old
 * installs still survive the ~2 MB ceiling.
 *
 * When `storageMode` is 'sdcard' we keep everything; otherwise the 1.5 MB cap
 * from before still applies.
 */
export function trimForStorage(
  list: Conversation[],
  storageMode: 'default' | 'sdcard' = 'default',
): { list: Conversation[]; dropped: number } {
  if (storageMode === 'sdcard') return { list, dropped: 0 };

  const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  let bytes = 0;
  let dropped = 0;
  const out: Conversation[] = [];
  for (const c of sorted) {
    const size = JSON.stringify(c).length;
    if (bytes + size > 1_500_000 && !c.pinned) {
      out.push({ ...c, messages: c.messages.slice(-2) }); // keep a stub, not the thread
      dropped++;
      continue;
    }
    bytes += size;
    out.push(c);
  }
  return { list: out, dropped };
}
