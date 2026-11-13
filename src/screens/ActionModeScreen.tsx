import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { Settings } from '../types';
import { useTheme, ThemeColors, radius, space, mono } from '../theme';
import {
  AutomationHistoryEntry,
  automationHistory,
  clearAutomationHistory,
  hasAutomation,
  openAccessibilitySettings,
  openAutomationNotificationSettings,
  setActionMode,
  stopAutomation,
} from '../lib/automation';
import { useAutomationStatus } from '../lib/useAutomation';
import { ensureNotificationPermission } from '../lib/native';

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onBack: () => void;
}

const ago = (ts: number): string => {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const STATUS_TINT = (status: string, colors: ThemeColors) =>
  status === 'success'
    ? colors.ok
    : status === 'blocked' || status === 'failed'
      ? colors.danger
      : status === 'timeout'
        ? colors.accent
        : colors.textFaint;

/**
 * Action Mode: permission, live state, history.
 *
 * This screen is also the Play-policy surface: the accessibility disclosure is
 * shown *before* the system setting is opened, the reason is written in plain
 * words, the active indicator and emergency stop are permanent UI, and the
 * rules the engine enforces are listed so nothing is hidden behind a toggle.
 */
export function ActionModeScreen({ settings, onChange, onBack }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { status, permission, refresh } = useAutomationStatus();
  const [history, setHistory] = useState<AutomationHistoryEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const loadHistory = useCallback(async () => {
    const h = await automationHistory();
    setHistory(h);
  }, []);

  useEffect(() => {
    loadHistory();
    const t = setInterval(() => {
      refresh();
      loadHistory();
    }, 4000);
    return () => clearInterval(t);
  }, [loadHistory, refresh]);

  const enabled = !!permission?.enabled;
  const connected = !!permission?.connected;
  const modeOn = !!settings.actionMode;
  const active = !!status?.session_active;

  const explainAndOpen = () => {
    Alert.alert(
      'Enable AmitAI Action Mode',
      'Android does not let an app tap or read other apps on its own. The only supported way is an ' +
        'accessibility service that you enable yourself, in Settings › Accessibility.\n\n' +
        'With it, AmitAI can read the text on screen and tap, type and scroll — only while you have ' +
        'Action Mode on, and only for the task you asked for.\n\n' +
        'It stops on password, OTP, banking and payment screens, never fills a login form, and never ' +
        'touches Android permission dialogs. An ongoing notification with a Stop button is shown ' +
        'while it works. You can turn it off at any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open settings', onPress: () => openAccessibilitySettings() },
      ],
    );
  };

  const toggleMode = async (on: boolean) => {
    setBusy(true);
    try {
      if (on) {
        const notif = await ensureNotificationPermission();
        if (!notif) {
          Alert.alert(
            'Notifications are blocked',
            'Action Mode shows an ongoing card with a Stop button. Allow notifications for AmitAI ' +
              'first, otherwise the active indicator cannot appear.',
            [
              { text: 'Later', style: 'cancel' },
              { text: 'Open settings', onPress: () => openAutomationNotificationSettings() },
            ],
          );
        }
        if (!enabled) {
          onChange({ actionMode: true });
          await setActionMode(true);
          refresh();
          explainAndOpen();
          return;
        }
      }
      onChange({ actionMode: on });
      await setActionMode(on);
      refresh();
    } finally {
      setBusy(false);
      loadHistory();
    }
  };

  const stopNow = async () => {
    await stopAutomation();
    refresh();
    loadHistory();
  };

  const progress = Math.max(0, Math.min(1, status?.progress ?? 0));
  const steps = status?.steps ?? 0;
  const maxSteps = status?.max_steps ?? 40;

  if (!hasAutomation) {
    return (
      <View style={styles.wrap}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} hitSlop={10}>
            <Text style={styles.back}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Action Mode</Text>
          <View style={{ width: 60 }} />
        </View>
        <Text style={styles.hint}>
          Action Mode is not available in this build. The native automation module was not linked.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={10}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Action Mode</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* ------------------------------ status ------------------------------ */}
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Action Mode</Text>
            <Text style={styles.hint}>
              Let AmitAI do the task on the phone: open the app, read the screen, tap, type.
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => toggleMode(!modeOn)}
            style={[styles.toggle, modeOn && styles.toggleOn]}
            activeOpacity={0.8}
            disabled={busy}
          >
            <View style={[styles.knob, modeOn && styles.knobOn]} />
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <Ionicons
            name={enabled && connected ? 'shield-checkmark' : 'shield-outline'}
            size={18}
            color={enabled && connected ? colors.ok : colors.danger}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Android accessibility</Text>
            <Text style={styles.hint}>
              {enabled && connected
                ? 'Enabled and connected — Android is reporting the UI to AmitAI.'
                : enabled
                  ? 'Enabled, but the service is not bound yet. Turn it off and on again in Settings.'
                  : 'Not enabled. Android requires you to turn this on yourself; no app can grant it.'}
            </Text>
          </View>
          {!enabled && (
            <TouchableOpacity style={styles.smallBtn} onPress={explainAndOpen}>
              <Text style={styles.smallBtnText}>Enable</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.row}>
          <Ionicons
            name={permission?.notifications === false ? 'notifications-off-outline' : 'notifications-outline'}
            size={17}
            color={permission?.notifications === false ? colors.danger : colors.textDim}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Active indicator</Text>
            <Text style={styles.hint}>
              {permission?.notifications === false
                ? 'Notifications are blocked, so the “acting on screen” card cannot be shown.'
                : 'A small ongoing card with a Stop button appears while automation runs.'}
            </Text>
          </View>
          {permission?.notifications === false && (
            <TouchableOpacity
              style={styles.smallBtn}
              onPress={() => openAutomationNotificationSettings()}
            >
              <Text style={styles.smallBtnText}>Fix</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ------------------------------- live ------------------------------- */}
      <Text style={styles.section}>Live</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          {active || status?.status === 'running' ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <View
              style={[
                styles.dot,
                { backgroundColor: status?.status === 'blocked' ? colors.danger : colors.textFaint },
              ]}
            />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>
              {status?.status === 'blocked'
                ? 'Stopped for safety'
                : active
                  ? 'Working'
                  : modeOn
                    ? 'Standing by'
                    : 'Off'}
            </Text>
            <Text style={styles.hint} numberOfLines={2}>
              {status?.status === 'blocked'
                ? status.blocked_reason || 'Automation paused.'
                : status?.app
                  ? `${status.app}${status.action ? ` · ${status.action}` : ''}`
                  : 'Nothing running right now.'}
            </Text>
          </View>
        </View>

        <View style={styles.metrics}>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{status?.completed ?? 0}</Text>
            <Text style={styles.metricLabel}>completed</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{status?.failed ?? 0}</Text>
            <Text style={styles.metricLabel}>failed</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{status?.app || '—'}</Text>
            <Text style={styles.metricLabel}>current app</Text>
          </View>
        </View>

        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <Text style={styles.hint}>
          {steps}/{maxSteps} actions in this session · {Math.round(progress * 100)}% of the step budget
        </Text>

        <TouchableOpacity style={styles.stopBtn} onPress={stopNow}>
          <Ionicons name="stop-circle-outline" size={17} color={colors.danger} />
          <Text style={styles.stopText}>Stop automation now</Text>
        </TouchableOpacity>
      </View>

      {/* ------------------------------ history ----------------------------- */}
      <View style={styles.rowBetween}>
        <Text style={styles.section}>History</Text>
        {!!history.length && (
          <TouchableOpacity
            onPress={async () => {
              const h = await clearAutomationHistory();
              setHistory(h);
            }}
          >
            <Text style={styles.clear}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>
      {history.length ? (
        <View style={styles.card}>
          {history.slice(0, 25).map((h, i) => (
            <View key={`${h.at}-${i}`} style={[styles.historyRow, i > 0 && styles.historySep]}>
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: STATUS_TINT(h.status, colors),
                  marginTop: 6,
                }}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.historyAction}>
                  {h.action.replace(/_/g, ' ')}
                  {h.app ? ` · ${h.app}` : ''}
                </Text>
                <Text style={styles.historyMsg} numberOfLines={2}>
                  {h.message}
                </Text>
              </View>
              <Text style={styles.historyTime}>{ago(h.at)}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.hint}>Nothing yet. Every action is recorded here with its real outcome.</Text>
      )}

      {/* ------------------------------- rules ------------------------------ */}
      <Text style={styles.section}>What it will never do</Text>
      <View style={styles.card}>
        {[
          'Type into or read password fields, OTPs, PINs or card numbers.',
          'Complete a payment, transfer, purchase or anything financial.',
          'Answer Android permission dialogs, or bypass an app’s security or login.',
          'Send a message, post, delete files or uninstall anything without asking you first.',
          'Keep tapping when the screen does not match: three misses in a row stops the session.',
        ].map(text => (
          <View key={text} style={styles.ruleRow}>
            <Ionicons name="close-circle-outline" size={15} color={colors.danger} />
            <Text style={styles.ruleText}>{text}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.section}>Apps it can see</Text>
      <Text style={styles.hint}>
        Android hides secure windows. Banking apps, some streaming apps that set FLAG_SECURE, and
        system permission dialogs simply cannot be read — AmitAI will report “screen could not be
        read” instead of guessing. Accessibility also cannot see inside apps that disable it.
      </Text>
      <Text style={styles.mono}>
        target SDK 36 · min SDK 24 · accessibility service + specialUse foreground service
      </Text>

      <View style={{ height: space(12) }} />
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    wrap: { flex: 1, backgroundColor: colors.bg },
    content: { padding: space(4), maxWidth: 760, width: '100%', alignSelf: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: space(3),
      paddingHorizontal: space(1),
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    back: { color: colors.accent, fontSize: 15, width: 60 },
    headerTitle: { fontSize: 19, fontWeight: '700', color: colors.text },
    card: {
      backgroundColor: colors.bgRaised,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: space(3),
      gap: space(2),
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
    rowBetween: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
    },
    cardTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
    label: { color: colors.text, fontSize: 14 },
    hint: { color: colors.textFaint, fontSize: 11, lineHeight: 16, marginTop: 2 },
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
    divider: { height: 1, backgroundColor: colors.border, marginVertical: space(1) },
    toggle: {
      width: 46,
      height: 27,
      borderRadius: radius.pill,
      backgroundColor: colors.bgInput,
      padding: 3,
      justifyContent: 'center',
    },
    toggleOn: { backgroundColor: colors.accent },
    knob: { width: 21, height: 21, borderRadius: 11, backgroundColor: colors.textDim },
    knobOn: { backgroundColor: '#fff', alignSelf: 'flex-end' },
    smallBtn: {
      borderWidth: 1,
      borderColor: colors.accent,
      backgroundColor: colors.accentDim,
      borderRadius: radius.pill,
      paddingHorizontal: space(3),
      paddingVertical: space(1.5),
    },
    smallBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
    dot: { width: 8, height: 8, borderRadius: 4 },
    metrics: {
      flexDirection: 'row',
      gap: space(3),
      backgroundColor: colors.bgInput,
      borderRadius: radius.sm,
      padding: space(2.5),
    },
    metric: { flex: 1 },
    metricValue: { color: colors.text, fontSize: 15, fontWeight: '700' },
    metricLabel: { color: colors.textFaint, fontSize: 10, marginTop: 1 },
    track: {
      height: 3,
      backgroundColor: colors.bgInput,
      borderRadius: 2,
      overflow: 'hidden',
      marginTop: space(1),
    },
    fill: { height: 3, backgroundColor: colors.accent },
    stopBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space(2),
      borderWidth: 1,
      borderColor: colors.danger,
      borderRadius: radius.md,
      paddingVertical: space(2.5),
      marginTop: space(1),
    },
    stopText: { color: colors.danger, fontWeight: '700', fontSize: 13 },
    clear: { color: colors.textDim, fontSize: 12 },
    historyRow: { flexDirection: 'row', gap: space(2), paddingVertical: space(1.5) },
    historySep: { borderTopWidth: 1, borderTopColor: colors.border },
    historyAction: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '600',
      textTransform: 'capitalize',
    },
    historyMsg: { color: colors.textFaint, fontSize: 11, lineHeight: 15, marginTop: 1 },
    historyTime: { color: colors.textFaint, fontSize: 10 },
    ruleRow: { flexDirection: 'row', gap: space(2), alignItems: 'flex-start' },
    ruleText: { color: colors.textDim, fontSize: 12, lineHeight: 17, flex: 1 },
    mono: { color: colors.textFaint, fontSize: 10, fontFamily: mono, marginTop: space(2) },
  });
