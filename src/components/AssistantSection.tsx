import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  PermissionsAndroid,
} from 'react-native';
import { useTheme } from '../theme';
import * as A from '../lib/assistant';

const POLICIES: Array<[A.AssistantStatus['policy'], string, string]> = [
  ['chargingOrScreenOff', 'Charging / screen off', 'saves battery'],
  ['always', 'Always', '~5–8%/hour'],
  ['appOnly', 'Paused', 'manual only'],
];

export function AssistantSection() {
  const { colors } = useTheme();
  const [st, setSt] = useState<A.AssistantStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSt(await A.getAssistantStatus());
    } catch {}
  }, []);

  useEffect(() => {
    if (!A.hasAssistant) return;
    refresh();
    const off1 = A.onModelProgress((phase, p) => {
      if (phase === 'downloading') setPct(p);
      if (phase === 'unzipping') setPct(-2);
      if (phase === 'ready') {
        setPct(null);
        refresh();
        Alert.alert('Ready', 'Wake word model installed. Say “Ok Amit”.');
      }
      if (phase === 'failed') setPct(null);
    });
    const off2 = A.onAssistantState(() => refresh());
    const off3 = A.onAssistantError(msg => Alert.alert('Assistant', msg));
    return () => {
      off1();
      off2();
      off3();
    };
  }, [refresh]);

  if (!A.hasAssistant) return null;

  const run = async (fn: () => Promise<any>, failTitle = 'Assistant') => {
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      Alert.alert(failTitle, e?.message ?? 'Failed');
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const enableWake = () =>
    run(async () => {
      const notif = await A.ensureNotifications();
      if (!notif) throw new Error('Notifications are blocked — the listener needs its ongoing card.');
      if (!(await A.canDrawOverlays())) {
        if (st?.wake) return;
      }
      if (!st?.model) {
        Alert.alert(
          'Download the wake word?',
          'Vosk English model, about 40 MB. Downloaded once to the phone, works offline.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Download',
              onPress: () =>
                run(async () => {
                  await A.ensureNotifications();
                  await A.downloadWakeModel();
                  await A.startWake();
                }, 'Download'),
            },
          ],
        );
        return;
      }
      const mic = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone',
          message: 'Needed to hear “Ok Amit”. Audio never leaves the phone.',
          buttonPositive: 'Allow',
          buttonNegative: 'Cancel',
        },
      );
      if (mic !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('Microphone permission denied');
      if (!(await A.canDrawOverlays())) {
        Alert.alert(
          'Allow display over other apps',
          'Android needs this so the wake word can bring AmitAI to the front. Open the setting and enable it, then come back.',
          [
            { text: 'Later', style: 'cancel' },
            { text: 'Open settings', onPress: () => A.openOverlaySettings() },
          ],
        );
      }
      await A.startWake();
    }, 'Wake word');

  const toggleWake = (on: boolean) =>
    on ? enableWake() : run(() => A.stopWake(), 'Wake word');

  const toggleBubble = async (on: boolean) => {
    if (on && !(await A.canDrawOverlays())) {
      Alert.alert('Allow display over other apps', 'Required for the floating bubble.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open settings', onPress: () => A.openOverlaySettings() },
      ]);
      return;
    }
    run(() => (on ? A.showBubble() : A.hideBubble()), 'Bubble');
  };

  const downloading = pct !== null;

  return (
    <>
      <Text style={s(colors).section}>Ok Amit — hands-free</Text>
      <Text style={s(colors).hint}>
        Offline wake word on the phone. Say “Ok Amit” to open AmitAI in voice mode. Audio is
        processed locally and never uploaded.
      </Text>

      <View style={s(colors).row}>
        <Text style={s(colors).label}>Wake word</Text>
        <View style={s(colors).seg}>
          {[false, true].map(on => (
            <TouchableOpacity
              key={String(on)}
              disabled={busy || downloading}
              onPress={() => toggleWake(on)}
              style={[s(colors).segBtn, !!st?.wake === on && s(colors).segOn]}
            >
              <Text style={[s(colors).segText, !!st?.wake === on && s(colors).segTextOn]}>
                {on ? 'On' : 'Off'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={s(colors).row}>
        <Text style={s(colors).label}>Floating bubble</Text>
        <View style={s(colors).seg}>
          {[false, true].map(on => (
            <TouchableOpacity
              key={String(on)}
              disabled={busy}
              onPress={() => toggleBubble(on)}
              style={[s(colors).segBtn, !!st?.bubble === on && s(colors).segOn]}
            >
              <Text style={[s(colors).segText, !!st?.bubble === on && s(colors).segTextOn]}>
                {on ? 'On' : 'Off'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <Text style={s(colors).label}>When to listen</Text>
      <View style={s(colors).chips}>
        {POLICIES.map(([key, label, hint]) => (
          <TouchableOpacity
            key={key}
            style={[s(colors).chip, st?.policy === key && s(colors).chipOn]}
            onPress={() => run(() => A.setWakePolicy(key), 'Listening policy')}
          >
            <Text style={[s(colors).chipText, st?.policy === key && s(colors).chipTextOn]}>
              {label}
            </Text>
            <Text style={s(colors).chipHint}>{hint}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {downloading && (
        <View style={s(colors).progressWrap}>
          <View style={s(colors).progressRow}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={s(colors).hint}>
              {pct === -2 ? 'Unpacking model…' : `Downloading model… ${pct}%`}
            </Text>
          </View>
        </View>
      )}

      <Text style={s(colors).hint}>
        {st?.model
          ? `Model installed (${(st.modelBytes / 1048576).toFixed(0)} MB) · listener ${
              st.listening ? 'running' : 'stopped'
            }`
          : 'Model not downloaded yet (40 MB, one time).'}
        {'  '}
        {st?.overlay ? '· overlay allowed' : '· overlay not allowed'}
        {st?.battery ? ' · battery exempt' : ''}
      </Text>

      <View style={s(colors).links}>
        <TouchableOpacity onPress={() => A.openOverlaySettings()}>
          <Text style={s(colors).link}>Overlay</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => A.requestBatteryExemption()}>
          <Text style={s(colors).link}>Battery</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => A.openNotificationSettings()}>
          <Text style={s(colors).link}>Notifications</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => run(() => A.deleteWakeModel(), 'Model')}>
          <Text style={[s(colors).link, { color: colors.danger ?? '#ff6b6b' }]}>
            {st?.model ? 'Delete model' : 'Refresh'}
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

const s = (colors: any) =>
  StyleSheet.create({
    section: {
      color: colors.textFaint,
      fontSize: 12,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginTop: 28,
      marginBottom: 8,
      fontWeight: '700',
    },
    label: { color: colors.text, fontSize: 15 },
    hint: { color: colors.textFaint, fontSize: 13, lineHeight: 18, marginBottom: 8 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    seg: { flexDirection: 'row', backgroundColor: colors.bgRaised, borderRadius: 10, padding: 3 },
    segBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 8 },
    segOn: { backgroundColor: colors.accent },
    segText: { color: colors.textFaint, fontWeight: '600' },
    segTextOn: { color: '#fff' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    chip: {
      borderWidth: 1,
      borderColor: colors.border ?? '#333',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      minWidth: 110,
    },
    chipOn: { borderColor: colors.accent, backgroundColor: colors.accent + '22' },
    chipText: { color: colors.text, fontSize: 13, fontWeight: '600' },
    chipTextOn: { color: colors.accent },
    chipHint: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
    progressWrap: { marginBottom: 10 },
    progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    links: { flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 6, marginBottom: 10 },
    link: { color: colors.accent, fontSize: 13 },
  });
