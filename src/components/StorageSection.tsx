import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useTheme } from '../theme';
import { storageInfo, requestAllFiles, StorageInfo } from '../lib/native';

/**
 * Shows where chats are written and, on Android 11+, offers the one-time
 * "All files access" grant that moves them to the visible /sdcard/AmitAI
 * folder. Without the grant they land in Android/data/com.amit.ai/files/AmitAI,
 * which needs no permission at all.
 */
export function StorageSection() {
  const { colors } = useTheme();
  const [info, setInfo] = useState<StorageInfo | null>(null);

  const refresh = useCallback(() => {
    storageInfo()
      .then(setInfo)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const grant = async () => {
    await requestAllFiles();
    Alert.alert(
      'Grant “All files access”',
      'Find AmitAI in the list and allow it, then come back. Chats will be written to /sdcard/AmitAI.',
      [{ text: 'OK', onPress: refresh }],
    );
  };

  const s = styles(colors);

  return (
    <>
      <Text style={s.section}>Chat files</Text>
      <View style={s.card}>
        <View style={s.row}>
          <Text style={s.label}>Folder</Text>
          <Text style={s.value} numberOfLines={2}>
            {info?.path ?? '…'}
          </Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>All-files access</Text>
          <Text style={[s.value, { color: info?.legacy ? colors.ok : colors.textFaint }]}>
            {info?.legacy ? 'granted' : 'not granted'}
          </Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>Free space</Text>
          <Text style={s.value}>{info?.freeMb != null ? `${info.freeMb} MB` : '—'}</Text>
        </View>
        {!info?.legacy && (
          <TouchableOpacity style={s.btn} onPress={grant}>
            <Text style={s.btnText}>Move chats to /sdcard/AmitAI</Text>
          </TouchableOpacity>
        )}
        <Text style={s.hint}>
          Every conversation is saved automatically as JSON in this folder and survives
          reinstalls of the app data.
        </Text>
      </View>
    </>
  );
}

const styles = (colors: any) =>
  StyleSheet.create({
    section: {
      fontSize: 11,
      color: colors.accent,
      textTransform: 'uppercase',
      letterSpacing: 1.6,
      fontWeight: '700',
      marginTop: 30,
      marginBottom: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 18,
    },
    card: {
      backgroundColor: colors.bgRaised,
      borderRadius: 14,
      padding: 14,
      gap: 12,
    },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
    label: { color: colors.textDim, fontSize: 13 },
    value: { color: colors.text, fontSize: 12, flexShrink: 1, textAlign: 'right' },
    btn: {
      backgroundColor: colors.accentDim,
      borderWidth: 1,
      borderColor: colors.accent,
      borderRadius: 12,
      paddingVertical: 11,
      alignItems: 'center',
    },
    btnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    hint: { color: colors.textFaint, fontSize: 11, lineHeight: 16 },
  });
