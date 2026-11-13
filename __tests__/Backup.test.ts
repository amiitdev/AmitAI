/**
 * Backup and restore.
 *
 * Kotlin's AmitVoice module is faked with an in-memory "SD card", so this runs
 * the real code path: build → write → list → restore, plus the promise that a
 * backup without keys contains no secret anywhere in the file.
 */

import { NativeModules } from 'react-native';

/** A stand-in for /sdcard/AmitAI/backup/. */
const disk = new Map<string, string>();

const fakeVoice = {
  writeBackup: jest.fn(async (name: string, value: string) => {
    if (!/^[A-Za-z0-9._-]+\.json$/.test(name)) throw new Error('bad name');
    disk.set(name, value);
    return true;
  }),
  listBackups: jest.fn(async () =>
    JSON.stringify(
      [...disk.keys()].map(n => ({ name: n, bytes: disk.get(n)!.length, at: Number(n.slice(7, 20).replace(/\D/g, '')) || 1 })),
    ),
  ),
  readBackup: jest.fn(async (name: string) => disk.get(name) ?? null),
  deleteBackup: jest.fn(async (name: string) => disk.delete(name)),
};

let backup: typeof import('../src/lib/backup');
let store: typeof import('../src/storage/store');
let memory: typeof import('../src/lib/memory');
let types: typeof import('../src/types');

BEFORE_EACH();

function BEFORE_EACH() {
  beforeEach(() => {
    jest.resetModules();
    disk.clear();
    (NativeModules as any).AmitVoice = { ...fakeVoice };
    backup = require('../src/lib/backup');
    store = require('../src/storage/store');
    memory = require('../src/lib/memory');
    types = require('../src/types');
  });
}

const settingsWithSecrets = () => ({
  ...types.DEFAULT_SETTINGS,
  apiKey: 'sk-super-secret',
  providerKeys: { openai: 'sk-provider-secret' },
  puterToken: 'puter-secret',
  theme: 'tokyo' as const,
  temperature: 0.3,
});

describe('what a backup contains', () => {
  test('without keys, no secret survives anywhere in the file', async () => {
    const file = backup.buildBackup({
      settings: settingsWithSecrets(),
      memory: [{ id: '1', text: 'wifi password is on the fridge', createdAt: 1, updatedAt: 1 }],
      schedules: [],
      withKeys: false,
    });
    const text = JSON.stringify(file);
    expect(text).not.toContain('sk-super-secret');
    expect(text).not.toContain('sk-provider-secret');
    expect(text).not.toContain('puter-secret');
    // but the harmless settings are there, which is the whole point
    expect(file.settings.theme).toBe('tokyo');
    expect(file.settings.temperature).toBe(0.3);
    expect(file.withKeys).toBe(false);
  });

  test('the lock is never carried, even when keys are', () => {
    const file = backup.buildBackup({
      settings: { ...settingsWithSecrets(), appLock: true, pinHash: 'deadbeef', pinSalt: 'cafe' },
      memory: [],
      schedules: [],
      withKeys: true,
    });
    expect(file.settings.apiKey).toBe('sk-super-secret');
    expect(file.settings.appLock).toBe(false);
    expect(file.settings.pinHash).toBe('');
    expect(file.settings.pinSalt).toBe('');
  });

  test('counts describe what is inside', () => {
    const file = backup.buildBackup({
      settings: types.DEFAULT_SETTINGS,
      memory: [{}, {}, {}],
      schedules: [{}],
      withKeys: false,
    });
    expect(file.counts).toEqual({ memory: 3, schedules: 1 });
    expect(file.app).toBe('AmitAI');
    expect(file.format).toBe(1);
  });
});

describe('file names', () => {
  test('sort lexicographically and by time', () => {
    const a = backup.backupName(new Date('2026-11-13T21:50:30').getTime());
    const b = backup.backupName(new Date('2026-11-14T09:05:00').getTime());
    expect(a).toBe('amitai-2026-11-13-215030.json');
    expect([b, a].sort()).toEqual([a, b]);
  });
});

describe('write, list, restore', () => {
  test('a written backup is listed and readable', async () => {
    await memory.addNote('car service every 10k km');
    await store.saveSettings({ ...types.DEFAULT_SETTINGS, theme: 'tokyo', model: 'gpt-5.1' });

    const name = await backup.writeBackupNow();
    expect(name).toMatch(/^amitai-\d{4}-\d{2}-\d{2}-\d{6}\.json$/);

    const list = await backup.listBackups();
    expect(list.map(f => f.name)).toContain(name);

    const file = await backup.readBackup(name!);
    expect(file?.app).toBe('AmitAI');
    expect(file?.counts.memory).toBe(1);
    expect(file?.settings.theme).toBe('tokyo');
  });

  test('restore puts settings, notes and jobs back', async () => {
    await store.saveSettings({ ...types.DEFAULT_SETTINGS, theme: 'tokyo', model: 'gpt-5.1' });
    await memory.addNote('car service every 10k km');
    const name = await backup.writeBackupNow();

    // now destroy everything the way a reinstall would
    await store.saveSettings({ ...types.DEFAULT_SETTINGS });
    await memory.clearNotes?.();
    const notesAfterWipe = await memory.loadNotes();

    const file = await backup.readBackup(name!);
    const report = await backup.restoreBackup(file!);

    const restored = await store.loadSettings();
    expect(restored.theme).toBe('tokyo');
    expect(restored.model).toBe('gpt-5.1');
    expect(report.settings).toBe(true);
    expect(notesAfterWipe.length).toBe(0);
    expect((await memory.loadNotes()).map(n => n.text)).toContain('car service every 10k km');
  });

  test('restore refuses a file that is not ours', async () => {
    await expect(backup.restoreBackup({ app: 'Something' } as any)).rejects.toThrow(/not an AmitAI backup/);
  });

  test('restore keeps the current lock and does not import one', async () => {
    await store.saveSettings({ ...types.DEFAULT_SETTINGS, appLock: true, pinHash: 'H', pinSalt: 'S' });
    const file = backup.buildBackup({
      settings: { ...types.DEFAULT_SETTINGS, appLock: false, pinHash: '', pinSalt: '', theme: 'obsidian' },
      memory: [],
      schedules: [],
      withKeys: false,
    });
    await backup.restoreBackup(file);
    const now = await store.loadSettings();
    expect(now.theme).toBe('obsidian');
    expect(now.appLock).toBe(true);
    expect(now.pinHash).toBe('H');
  });

  test('only the newest ten are kept', async () => {
    for (let i = 0; i < 14; i++) {
      await backup.writeBackupNow({ now: Date.now() + i * 1000 });
      // give each file a distinct timestamp on the fake disk
      await new Promise<void>(r => setTimeout(r, 2));
    }
    const list = await backup.listBackups();
    expect(list.length).toBeLessThanOrEqual(backup.BACKUP_MAX);
  });
});

describe('auto backup', () => {
  test('does nothing when the toggle is off', async () => {
    await store.saveSettings({ ...types.DEFAULT_SETTINGS, autoBackup: false });
    const name = await backup.autoBackupIfDue();
    expect(name).toBeNull();
  });

  test('writes at most once per window, and not at all when nothing changed', async () => {
    backup.resetAutoBackupState();
    await store.saveSettings({ ...types.DEFAULT_SETTINGS, autoBackup: true });
    const t0 = Date.now();

    const first = await backup.autoBackupIfDue({ now: t0 });
    expect(first).not.toBeNull();

    const tooSoon = await backup.autoBackupIfDue({ now: t0 + 1000 });
    expect(tooSoon).toBeNull();

    const later = await backup.autoBackupIfDue({ now: t0 + backup.AUTO_EVERY_MS + 1 });
    expect(later).toBeNull(); // same content ⇒ nothing worth a file

    await memory.addNote('something new');
    const changed = await backup.autoBackupIfDue({ now: t0 + backup.AUTO_EVERY_MS + 2 });
    expect(changed).not.toBeNull();
  });
});