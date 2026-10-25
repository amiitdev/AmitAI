import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useTheme, ThemeColors, radius, space, font } from '../theme';
import { useToast } from '../components/Toast';
import {
  Schedule,
  addSchedule,
  describe,
  formatWhen,
  humanIn,
  loadSchedules,
  nextRun,
  parseWhen,
  removeSchedule,
  setScheduleEnabled,
  sortSchedules,
} from '../lib/schedules';
import {
  ensureNotificationPermission,
  requestExactAlarms,
  schedulerStatus,
  SchedulerStatus,
} from '../lib/native';

interface Props {
  onBack: () => void;
}

/**
 * Every scheduled job in one place.
 *
 * The chat is the normal way to create one ("weather every day at 8 am"), but
 * this screen exists so jobs are never invisible: you can see the exact next
 * run, pause one, read the last answer, or delete it.
 */
export function SchedulesScreen({ onBack }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const toast = useToast();

  const [list, setList] = useState<Schedule[] | null>(null);
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [prompt, setPrompt] = useState('');
  const [when, setWhen] = useState('every day at 8 am');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [items, st] = await Promise.all([loadSchedules(), schedulerStatus()]);
    setList(sortSchedules(items));
    setStatus(st);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(async () => {
    const p = prompt.trim();
    const w = when.trim();
    if (!p) {
      toast('Say what to ask', 'error');
      return;
    }
    if (!w) {
      toast('Say when to run it', 'error');
      return;
    }
    const parsed = parseWhen(w);
    if (!parsed.ok) {
      toast(parsed.error ?? 'Could not read that time', 'error');
      return;
    }
    setBusy(true);
    try {
      await ensureNotificationPermission();
      const s = await addSchedule({
        title: p.length > 34 ? p.slice(0, 34) + '…' : p,
        prompt: p,
        when: w,
        parsed,
      });
      setPrompt('');
      await refresh();
      toast(`Scheduled · ${describe(s)}`, 'ok');
    } catch (e: any) {
      toast(e?.message ?? 'Could not save the schedule', 'error');
    } finally {
      setBusy(false);
    }
  }, [prompt, when, refresh, toast]);

  const toggle = useCallback(
    async (s: Schedule) => {
      await setScheduleEnabled(s.id, !s.enabled);
      await refresh();
      toast(s.enabled ? 'Paused' : 'Resumed', 'info');
    },
    [refresh, toast],
  );

  const remove = useCallback(
    async (s: Schedule) => {
      await removeSchedule(s.id);
      await refresh();
      toast('Schedule deleted', 'ok');
    },
    [refresh, toast],
  );

  const header = (
    <View style={styles.head}>
      <TouchableOpacity onPress={onBack} hitSlop={10} style={styles.back}>
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </TouchableOpacity>
      <View style={styles.grow}>
        <Text style={font.h1}>Schedules</Text>
        <Text style={styles.sub}>
          {status?.exact === false
            ? 'alarms work, but may be a few minutes late'
            : 'run with the app closed · answers arrive as notifications'}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      {header}

      {status?.exact === false && (
        <TouchableOpacity
          style={styles.banner}
          onPress={async () => {
            await requestExactAlarms();
            await refresh();
          }}
        >
          <Ionicons name="alarm-outline" size={16} color={colors.accent} />
          <Text style={styles.bannerText}>
            Allow exact alarms so 8:00 means 8:00 — tap to open the system setting.
          </Text>
        </TouchableOpacity>
      )}

      <FlatList
        data={list ?? []}
        keyExtractor={s => s.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.form}>
            <Text style={styles.formTitle}>New job</Text>
            <TextInput
              style={styles.input}
              value={prompt}
              onChangeText={setPrompt}
              placeholder="What should it ask? e.g. today's weather in Nagpur"
              placeholderTextColor={colors.textFaint}
              multiline
            />
            <View style={styles.whenRow}>
              <TextInput
                style={[styles.input, styles.whenInput]}
                value={when}
                onChangeText={setWhen}
                placeholder="every day at 8 am"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={[styles.addBtn, busy && styles.dim]}
                onPress={create}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="add" size={20} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
            <Text style={styles.formHint}>
              “every day at 8 am” · “weekdays at 7:30” · “every monday at 9pm” ·
              “every 2 hours” · “tomorrow at 7pm” · cron “30 7 * * 1-5”
            </Text>
          </View>
        }
        ListEmptyComponent={
          list ? (
            <View style={styles.empty}>
              <Ionicons name="alarm-outline" size={34} color={colors.border} />
              <Text style={styles.emptyText}>Nothing scheduled yet</Text>
              <Text style={styles.emptyHint}>
                You can also just ask: “tell me the weather every day at 8 am”.
              </Text>
            </View>
          ) : (
            <ActivityIndicator style={{ marginTop: space(8) }} color={colors.accent} />
          )
        }
        renderItem={({ item }) => {
          const next = nextRun(item);
          return (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.grow}>
                  <Text numberOfLines={1} style={styles.cardTitle}>
                    {item.title}
                  </Text>
                  <Text style={styles.cardWhen}>
                    {describe(item)}
                    {item.enabled && next
                      ? ` · next ${formatWhen(next)} (${humanIn(next - Date.now())})`
                      : item.enabled
                        ? ' · no next run'
                        : ' · paused'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => toggle(item)} hitSlop={8} style={styles.cardBtn}>
                  <Ionicons
                    name={item.enabled ? 'pause-circle-outline' : 'play-circle-outline'}
                    size={21}
                    color={item.enabled ? colors.textDim : colors.accent}
                  />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => remove(item)} hitSlop={8} style={styles.cardBtn}>
                  <Ionicons name="trash-outline" size={19} color={colors.danger} />
                </TouchableOpacity>
              </View>

              <Text numberOfLines={2} style={styles.cardPrompt}>
                “{item.prompt}”
              </Text>

              {!!item.lastResult && (
                <Text numberOfLines={3} style={styles.cardResult}>
                  {item.lastResult}
                </Text>
              )}
              {!!item.lastError && (
                <Text numberOfLines={2} style={styles.cardError}>
                  Last run failed: {item.lastError}
                </Text>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space(2),
      paddingHorizontal: space(3),
      paddingBottom: space(3),
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    back: { width: 32, height: 32, justifyContent: 'center' },
    grow: { flex: 1 },
    dim: { opacity: 0.5 },
    sub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space(2),
      margin: space(4),
      marginBottom: 0,
      padding: space(3),
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.accentDim,
      backgroundColor: colors.bgRaised,
    },
    bannerText: { flex: 1, color: colors.textDim, fontSize: 12, lineHeight: 17 },
    listContent: { padding: space(4), paddingBottom: space(10) },
    form: {
      backgroundColor: colors.bgRaised,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: space(3),
      marginBottom: space(4),
    },
    formTitle: { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: space(2) },
    input: {
      color: colors.text,
      fontSize: 14,
      backgroundColor: colors.bgInput,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: space(3),
      paddingVertical: space(2),
      minHeight: 42,
    },
    whenRow: { flexDirection: 'row', gap: space(2), marginTop: space(2) },
    whenInput: { flex: 1 },
    addBtn: {
      width: 46,
      height: 42,
      borderRadius: radius.sm,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    formHint: { color: colors.textFaint, fontSize: 11, marginTop: space(2), lineHeight: 16 },
    card: {
      backgroundColor: colors.bgRaised,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: space(3),
      marginBottom: space(3),
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
    cardTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
    cardWhen: { color: colors.accent, fontSize: 11, marginTop: 2 },
    cardBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
    cardPrompt: { color: colors.textDim, fontSize: 12, marginTop: space(2), fontStyle: 'italic' },
    cardResult: {
      color: colors.textDim,
      fontSize: 12,
      marginTop: space(2),
      lineHeight: 17,
      borderLeftWidth: 2,
      borderLeftColor: colors.accentDim,
      paddingLeft: space(2),
    },
    cardError: { color: colors.danger, fontSize: 11, marginTop: space(2) },
    empty: { alignItems: 'center', marginTop: space(10), paddingHorizontal: space(6) },
    emptyText: { color: colors.textDim, fontSize: 14, marginTop: space(3) },
    emptyHint: {
      color: colors.textFaint,
      fontSize: 12,
      marginTop: space(2),
      textAlign: 'center',
      lineHeight: 17,
    },
  });
