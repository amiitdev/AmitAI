import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
} from 'react-native';
import { Settings } from '../types';
import { useTheme, ThemeColors, space, radius, mono } from '../theme';
import {
  BACKUP_MAX,
  BackupEntry,
  deleteBackup,
  hasBackup,
  listBackups,
  readBackup,
  restoreBackup,
  writeBackupNow,
} from '../lib/backup';
import { makePinRecord, pinProblem, PIN_MIN, PIN_MAX } from '../lib/lock';
import { storageInfo } from '../lib/native';

/**
 * Backup & security, in Settings.
 *
 * Two things live here because they are the same promise — "a reinstall should
 * not cost you a day": a one-tap backup of everything app-private, and a PIN so
 * the resulting chats and keys are not readable by whoever picks the phone up.
 */
export function BackupSection({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [files, setFiles] = useState<BackupEntry[]>([]);
  /** the real folder, so the confirmation is not a guess (it is app-private
   *  Android/data/... unless All-files access is granted) */
  const [folder, setFolder] = useState<string>('AmitAI/backup/');
  const [busy, setBusy] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setFiles(await listBackups());
  }, []);

  useEffect(() => {
    refresh();
    storageInfo()
      .then(i => {
        if (i?.path) setFolder(`${i.path}/backup/`);
      })
      .catch(() => {});
  }, [refresh]);

  const backUp = async () => {
    setBusy(true);
    try {
      const name = await writeBackupNow({ withKeys: settings.backupWithKeys });
      if (name) {
        await refresh();
        Alert.alert(
          'Backup written',
          `${name}\n\nin ${folder}` +
            (settings.backupWithKeys
              ? '\n\nThis file contains your API keys — keep it somewhere safe.'
              : '\n\nIt contains no API keys, so after a restore you paste the key again.'),
        );
      } else {
        Alert.alert('Backup not available', 'This build has no storage bridge.');
      }
    } catch (e: any) {
      Alert.alert('Backup failed', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const restore = (entry: BackupEntry) => {
    Alert.alert(
      'Restore this backup?',
      `${entry.name}\n\nSettings, memory and schedules are replaced. Chats are not touched — they live in ` +
        `conversations.json and are already safe.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            const file = await readBackup(entry.name);
            if (!file) {
              Alert.alert('Could not read that file', 'It may have been deleted or edited.');
              return;
            }
            try {
              const report = await restoreBackup(file);
              onChange({ ...file.settings });
              await refresh();
              Alert.alert(
                'Restored',
                `${report.memory} notes · ${report.schedules} schedules · settings applied.` +
                  (report.needsKeys
                    ? '\n\nThis backup had no API keys — re-enter your key under Connection.'
                    : '\n\nAPI keys were restored too.'),
              );
            } catch (e: any) {
              Alert.alert('Restore failed', e?.message ?? String(e));
            }
          },
        },
      ],
    );
  };

  const remove = (entry: BackupEntry) => {
    Alert.alert('Delete backup?', entry.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteBackup(entry.name);
          await refresh();
        },
      },
    ]);
  };

  const savePin = () => {
    const problem = pinProblem(pin);
    if (problem) return setPinError(problem);
    if (pin !== pin2) return setPinError('The two PINs are different');
    const rec = makePinRecord(pin);
    onChange({ appLock: true, pinSalt: rec.salt, pinHash: rec.hash });
    setPinOpen(false);
    setPin('');
    setPin2('');
    setPinError(null);
  };

  const toggleLock = () => {
    if (settings.appLock) {
      onChange({ appLock: false });
      return;
    }
    if (settings.pinHash) {
      onChange({ appLock: true });
      return;
    }
    setPinOpen(true);
  };

  return (
    <>
      <Text style={styles.section}>Backup</Text>
      {!hasBackup ? (
        <Text style={styles.hint}>Storage bridge not available in this build.</Text>
      ) : (
        <>
          <Text style={styles.hint}>
            A backup holds settings, memory notes and scheduled jobs — the things a reinstall
            destroys. Chats already live in conversations.json and survive on their own. Files go
            to the folder below, newest {BACKUP_MAX} kept.
          </Text>
          <Text style={styles.folder}>{folder}</Text>

          <View style={styles.row}>
            <Text style={styles.label}>Include API keys</Text>
            <TouchableOpacity
              onPress={() => onChange({ backupWithKeys: !settings.backupWithKeys })}
              style={[styles.toggle, settings.backupWithKeys && styles.toggleOn]}
              activeOpacity={0.8}
            >
              <View style={[styles.knob, settings.backupWithKeys && styles.knobOn]} />
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>
            {settings.backupWithKeys
              ? 'On — the file is plain text and contains your keys. Treat it like a password.'
              : 'Off — the file is safe to leave on the SD card; you re-paste the key after restoring.'}
          </Text>

          <View style={styles.row}>
            <Text style={styles.label}>Back up automatically</Text>
            <TouchableOpacity
              onPress={() => onChange({ autoBackup: !settings.autoBackup })}
              style={[styles.toggle, settings.autoBackup && styles.toggleOn]}
              activeOpacity={0.8}
            >
              <View style={[styles.knob, settings.autoBackup && styles.knobOn]} />
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>
            Writes a file when the app goes to the background, at most every 10 minutes, and only
            when something actually changed.
          </Text>

          <TouchableOpacity style={styles.button} onPress={backUp} disabled={busy} activeOpacity={0.85}>
            <Text style={styles.buttonText}>{busy ? 'Writing…' : 'Back up now'}</Text>
          </TouchableOpacity>

          {files.length === 0 ? (
            <Text style={styles.hint}>No backups yet.</Text>
          ) : (
            <View style={styles.list}>
              {files.map(f => (
                <View key={f.name} style={styles.fileRow}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={styles.fileName}>
                      {f.name}
                    </Text>
                    <Text style={styles.fileMeta}>
                      {new Date(f.at).toLocaleString()} · {Math.max(1, Math.round(f.bytes / 1024))} KB
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => restore(f)} hitSlop={8} style={styles.fileBtn}>
                    <Text style={styles.fileBtnText}>Restore</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => remove(f)} hitSlop={8} style={styles.fileBtn}>
                    <Text style={styles.fileDelete}>Delete</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      <Text style={styles.section}>App lock</Text>
      <Text style={styles.hint}>
        Asks for a {PIN_MIN}–{PIN_MAX} digit PIN when AmitAI starts, and again after a minute in the
        background. The PIN is stored only as a salted hash. Screenshot blocking (FLAG_SECURE) also
        blanks the card in the recents switcher.
      </Text>

      <View style={styles.row}>
        <Text style={styles.label}>Require PIN</Text>
        <TouchableOpacity
          onPress={toggleLock}
          style={[styles.toggle, settings.appLock && styles.toggleOn]}
          activeOpacity={0.8}
        >
          <View style={[styles.knob, settings.appLock && styles.knobOn]} />
        </TouchableOpacity>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Block screenshots</Text>
        <TouchableOpacity
          onPress={() => onChange({ blockScreenshots: !settings.blockScreenshots })}
          style={[styles.toggle, settings.blockScreenshots && styles.toggleOn]}
          activeOpacity={0.8}
        >
          <View style={[styles.knob, settings.blockScreenshots && styles.knobOn]} />
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>
        FLAG_SECURE. Screen recordings and screenshots come out black, and the recents thumbnail is
        blank — which also means you cannot screenshot a chat yourself.
      </Text>

      {settings.pinHash ? (
        <TouchableOpacity style={styles.buttonGhost} onPress={() => setPinOpen(true)} activeOpacity={0.85}>
          <Text style={styles.buttonGhostText}>Change PIN</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.hint}>No PIN set yet.</Text>
      )}

      {settings.pinHash ? (
        <TouchableOpacity
          onPress={() =>
            Alert.alert('Remove the PIN?', 'AmitAI will open without asking.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Remove',
                style: 'destructive',
                onPress: () => onChange({ appLock: false, pinHash: '', pinSalt: '' }),
              },
            ])
          }
          style={styles.resetBtn}
        >
          <Text style={styles.resetText}>Remove PIN</Text>
        </TouchableOpacity>
      ) : null}

      <Modal visible={pinOpen} transparent animationType="fade" onRequestClose={() => setPinOpen(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{settings.pinHash ? 'Change PIN' : 'Set a PIN'}</Text>
            <Text style={styles.modalHint}>
              {PIN_MIN}–{PIN_MAX} digits. Not a birthday, not 1234 — it is the only thing between a
              stranger and your chats.
            </Text>

            <TextInput
              style={styles.pinInput}
              value={pin}
              onChangeText={t => {
                setPin(t.replace(/[^0-9]/g, '').slice(0, 8));
                setPinError(null);
              }}
              placeholder="PIN"
              placeholderTextColor={colors.textFaint}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              autoFocus
            />
            <TextInput
              style={styles.pinInput}
              value={pin2}
              onChangeText={t => {
                setPin2(t.replace(/[^0-9]/g, '').slice(0, 8));
                setPinError(null);
              }}
              placeholder="Repeat PIN"
              placeholderTextColor={colors.textFaint}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
            />

            {!!pinError && <Text style={styles.pinError}>{pinError}</Text>}

            <View style={styles.modalRow}>
              <TouchableOpacity
                onPress={() => {
                  setPinOpen(false);
                  setPin('');
                  setPin2('');
                  setPinError(null);
                }}
                style={styles.modalCancel}
              >
                <Text style={styles.resetText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={savePin} style={styles.modalSave}>
                <Text style={styles.buttonText}>Save PIN</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    section: {
      fontSize: 11,
      color: colors.accent,
      textTransform: 'uppercase',
      letterSpacing: 1.6,
      fontWeight: '700',
      marginTop: space(6),
      marginBottom: space(2.5),
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: space(4),
    },
    hint: { color: colors.textFaint, fontSize: 11, marginTop: space(1) },
    folder: {
      color: colors.textDim,
      fontFamily: mono,
      fontSize: 10,
      marginTop: space(1),
      marginBottom: space(2),
    },
    label: { color: colors.text, fontSize: 14, marginBottom: space(1.5) },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 44,
      marginBottom: space(3),
      marginTop: space(2),
    },
    toggle: {
      width: 46,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.bgInput,
      borderWidth: 1,
      borderColor: colors.border,
      justifyContent: 'center',
      padding: 2,
    },
    toggleOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.textFaint },
    knobOn: { backgroundColor: '#fff', alignSelf: 'flex-end' },
    button: {
      marginTop: space(3),
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingVertical: space(3),
      alignItems: 'center',
    },
    buttonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    buttonGhost: {
      marginTop: space(2),
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: space(2.5),
      alignItems: 'center',
    },
    buttonGhostText: { color: colors.text, fontSize: 14 },
    list: { marginTop: space(4), gap: space(2) },
    fileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space(2),
      backgroundColor: colors.bgRaised,
      borderRadius: radius.md,
      padding: space(3),
    },
    fileName: { color: colors.text, fontFamily: mono, fontSize: 11 },
    fileMeta: { color: colors.textFaint, fontSize: 10, marginTop: 2 },
    fileBtn: { paddingHorizontal: space(1.5), paddingVertical: space(1) },
    fileBtnText: { color: colors.accent, fontSize: 12 },
    fileDelete: { color: colors.danger, fontSize: 12 },
    resetBtn: { marginTop: space(3), paddingVertical: space(3), alignItems: 'center' },
    resetText: { color: colors.textDim, fontSize: 13 },
    modalWrap: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.65)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: space(5),
    },
    modalCard: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.bgRaised,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: space(4),
      gap: space(2),
    },
    modalTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
    modalHint: { color: colors.textDim, fontSize: 12, marginBottom: space(2) },
    pinInput: {
      backgroundColor: colors.bgInput,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.text,
      paddingHorizontal: space(3),
      paddingVertical: space(2.5),
      fontSize: 18,
      letterSpacing: 4,
    },
    pinError: { color: colors.danger, fontSize: 12 },
    modalRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: space(4),
      marginTop: space(3),
    },
    modalCancel: { paddingVertical: space(2), paddingHorizontal: space(2) },
    modalSave: {
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingVertical: space(2),
      paddingHorizontal: space(4),
    },
  });