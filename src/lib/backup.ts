import { NativeModules } from 'react-native';
import { Settings, DEFAULT_SETTINGS } from '../types';
import { loadSettings, saveSettings, writeKey } from '../storage/store';
import { loadNotes, MEMORY_KEY } from './memory';
import { loadSchedules, applySchedules, SCHEDULES_KEY } from './schedules';

/**
 * Backup and restore of everything a reinstall destroys.
 *
 * Conversations already live in `/sdcard/AmitAI/conversations.json` and survive
 * an uninstall. What does NOT survive is the app-private state: settings (so
 * every API key), memory notes and scheduled jobs. That is what this file
 * writes — into `/sdcard/AmitAI/backup/`, newest ten kept.
 *
 * Files are plain JSON on purpose: you can read one, diff it, or edit it before
 * restoring. Keys are stripped unless you explicitly ask for them.
 *
 * Kotlin side: AmitVoiceModule.writeBackup / listBackups / readBackup / deleteBackup.
 */
const Voice: any = NativeModules.AmitVoice;

export const hasBackup = !!Voice?.writeBackup;

export const BACKUP_MAX = 10;
export const BACKUP_PREFIX = 'amitai-';

export interface BackupEntry {
  name: string;
  bytes: number;
  at: number;
}

export interface BackupFile {
  app: 'AmitAI';
  format: 1;
  version: string;
  createdAt: number;
  /** true when api keys and tokens are inside this file */
  withKeys: boolean;
  settings: Partial<Settings>;
  memory: unknown[];
  schedules: unknown[];
  counts: { memory: number; schedules: number };
}

/** Settings fields that are secrets. Never written unless asked for. */
const SECRET_FIELDS = ['apiKey', 'providerKeys', 'puterToken', 'bridgeToken'] as const;

export function stripSecrets(s: Settings): Partial<Settings> {
  const copy: Record<string, unknown> = { ...s };
  for (const f of SECRET_FIELDS) {
    if (f in copy) copy[f] = f === 'providerKeys' ? {} : '';
  }
  // The PIN protects this app; a backup file that carries the lock is a
  // downgrade for anyone who gets the file. Always dropped.
  copy.pinHash = '';
  copy.pinSalt = '';
  copy.appLock = false;
  return copy;
}

export function buildBackup(opts: {
  settings: Settings;
  memory: unknown[];
  schedules: unknown[];
  withKeys: boolean;
  now?: number;
  version?: string;
}): BackupFile {
  const settings: Partial<Settings> = opts.withKeys
    ? { ...opts.settings }
    : stripSecrets(opts.settings);
  // The lock never travels, with or without keys: a file that unlocks the app
  // for whoever holds it is worse than no backup at all.
  settings.pinHash = '';
  settings.pinSalt = '';
  settings.appLock = false;
  return {
    app: 'AmitAI',
    format: 1,
    version: opts.version ?? '4.5.0',
    createdAt: opts.now ?? Date.now(),
    withKeys: opts.withKeys,
    settings,
    memory: opts.memory,
    schedules: opts.schedules,
    counts: { memory: opts.memory.length, schedules: opts.schedules.length },
  };
}

/** `amitai-2026-11-13-2150.json` — sorts lexicographically by time, too. */
export function backupName(at = Date.now()): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${BACKUP_PREFIX}${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.json`
  );
}

/** Write one now. Returns the file name, or null when the bridge is absent. */
export async function writeBackupNow(opts?: {
  withKeys?: boolean;
  settings?: Settings;
  now?: number;
}): Promise<string | null> {
  if (!hasBackup) return null;
  const settings = opts?.settings ?? (await loadSettings());
  const [memory, schedules] = await Promise.all([loadNotes(), loadSchedules()]);
  const withKeys = opts?.withKeys ?? !!settings.backupWithKeys;
  const file = buildBackup({ settings, memory, schedules, withKeys, now: opts?.now });
  const name = backupName(opts?.now ?? Date.now());
  await Voice.writeBackup(name, JSON.stringify(file, null, 2));
  await pruneBackups();
  return name;
}

export async function listBackups(): Promise<BackupEntry[]> {
  if (!hasBackup) return [];
  try {
    const raw = await Voice.listBackups();
    const list: BackupEntry[] = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return [...list].sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

export async function readBackup(name: string): Promise<BackupFile | null> {
  if (!hasBackup) return null;
  try {
    const raw = await Voice.readBackup(name);
    if (!raw) return null;
    return JSON.parse(String(raw)) as BackupFile;
  } catch {
    return null;
  }
}

export async function deleteBackup(name: string): Promise<boolean> {
  if (!hasBackup) return false;
  try {
    return !!(await Voice.deleteBackup(name));
  } catch {
    return false;
  }
}

/** Keep the newest BACKUP_MAX files, delete the rest. */
export async function pruneBackups(): Promise<number> {
  const list = await listBackups();
  const extra = list.slice(BACKUP_MAX);
  let removed = 0;
  for (const e of extra) if (await deleteBackup(e.name)) removed++;
  return removed;
}

export interface RestoreReport {
  settings: boolean;
  memory: number;
  schedules: number;
  /** true when the file had no keys, so the user must re-enter them */
  needsKeys: boolean;
}

/**
 * Restore a parsed backup.
 *
 * Settings are merged over the current ones (so a backup taken on an older
 * version cannot blank a field added since), memory and schedules are replaced,
 * and the alarms are re-armed immediately so a restored job actually fires.
 */
export async function restoreBackup(file: BackupFile): Promise<RestoreReport> {
  if (file?.app !== 'AmitAI' || !file.settings) {
    throw new Error('That file is not an AmitAI backup');
  }

  const current = await loadSettings();
  const merged: Settings = { ...DEFAULT_SETTINGS, ...current, ...file.settings };

  // The backup never carries the lock, and never carries an "unlocked" state.
  merged.appLock = current.appLock;
  merged.pinHash = current.pinHash;
  merged.pinSalt = current.pinSalt;

  await saveSettings(merged);

  const notes = Array.isArray(file.memory) ? file.memory : [];
  await writeKey(MEMORY_KEY, JSON.stringify(notes));

  const jobs = Array.isArray(file.schedules) ? file.schedules : [];
  await writeKey(SCHEDULES_KEY, JSON.stringify(jobs));
  if (jobs.length) await applySchedules(jobs as never).catch(() => {});

  return {
    settings: true,
    memory: notes.length,
    schedules: jobs.length,
    needsKeys: !file.withKeys,
  };
}

/**
 * Auto-backup: called when the app goes to the background.
 *
 * Throttled so a chatty session cannot litter the folder: at most one file per
 * ten minutes, and never if nothing changed since the last one.
 */
export const AUTO_EVERY_MS = 10 * 60_000;

let lastAutoAt = 0;
let lastAutoSignature = '';

export async function autoBackupIfDue(opts?: {
  settings?: Settings;
  now?: number;
  force?: boolean;
}): Promise<string | null> {
  if (!hasBackup) return null;
  const settings = opts?.settings ?? (await loadSettings());
  if (!settings.autoBackup && !opts?.force) return null;

  const now = opts?.now ?? Date.now();
  if (!opts?.force && now - lastAutoAt < AUTO_EVERY_MS) return null;

  const [memory, schedules] = await Promise.all([loadNotes(), loadSchedules()]);
  const signature = JSON.stringify([settings, memory, schedules]);
  if (!opts?.force && signature === lastAutoSignature) return null;

  const name = await writeBackupNow({ settings, now });
  lastAutoAt = now;
  lastAutoSignature = signature;
  return name;
}

/** Test seam: forget the throttle. */
export function resetAutoBackupState(): void {
  lastAutoAt = 0;
  lastAutoSignature = '';
}