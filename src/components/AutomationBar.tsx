import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { AutomationStatus } from '../lib/automation';
import { useTheme, ThemeColors, radius, space } from '../theme';

/**
 * The live Action Mode strip.
 *
 * Deliberately small: one row above the composer that answers "what is it doing
 * to my phone right now" and gives a stop button that never requires opening a
 * menu. When a confirmation is waiting it turns amber-ish (accent, not danger)
 * so the user knows the phone is paused on them.
 */
export function AutomationBar({
  status,
  onStop,
  onOpen,
}: {
  status: AutomationStatus | null;
  onStop: () => void;
  onOpen: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!status?.action_mode) return null;

  const waiting = status.status === 'awaiting_confirmation' || !!status.pending_confirm_id;
  const blocked = status.status === 'blocked';
  const running = status.status === 'running' || waiting;
  const app = status.app || status.package;
  const progress = Math.max(0, Math.min(1, status.progress || 0));
  const tint = blocked ? colors.danger : colors.accent;

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onOpen} style={styles.wrap}>
      <View style={styles.top}>
        {running ? (
          <ActivityIndicator size="small" color={tint} />
        ) : (
          <View style={[styles.dot, { backgroundColor: blocked ? colors.danger : colors.ok }]} />
        )}

        <Text numberOfLines={1} style={[styles.title, { color: tint }]}>
          {blocked
            ? 'Action Mode stopped'
            : waiting
              ? 'Waiting for your confirmation'
              : running
                ? 'Action Mode · working'
                : 'Action Mode · ready'}
        </Text>

        <Text style={styles.count}>
          {status.completed} done{status.failed ? ` · ${status.failed} failed` : ''}
        </Text>

        <TouchableOpacity
          onPress={onStop}
          hitSlop={8}
          style={[styles.stop, { borderColor: colors.danger }]}
        >
          <Ionicons name="stop" size={11} color={colors.danger} />
          <Text style={[styles.stopText, { color: colors.danger }]}>Stop</Text>
        </TouchableOpacity>
      </View>

      <Text numberOfLines={1} style={styles.sub}>
        {blocked
          ? status.blocked_reason || 'Automation is paused.'
          : waiting
            ? status.pending_confirm_text || 'Approve or deny the action in AmitAI.'
            : app
              ? `${app}${status.action ? ` · ${status.action}` : ''}`
              : 'Ask AmitAI to do something on your phone.'}
      </Text>

      {(running || blocked) && (
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              { width: `${Math.round(progress * 100)}%`, backgroundColor: tint },
            ]}
          />
        </View>
      )}
    </TouchableOpacity>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    wrap: {
      marginHorizontal: space(4),
      marginBottom: space(2),
      paddingHorizontal: space(3),
      paddingVertical: space(2),
      backgroundColor: colors.bgRaised,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      gap: space(1),
    },
    top: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
    dot: { width: 8, height: 8, borderRadius: 4 },
    title: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, flexShrink: 1 },
    count: { color: colors.textFaint, fontSize: 10, marginLeft: 'auto' },
    stop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space(1),
      borderWidth: 1,
      borderRadius: radius.pill,
      paddingHorizontal: space(2),
      paddingVertical: 2,
    },
    stopText: { fontSize: 10, fontWeight: '700' },
    sub: { color: colors.textDim, fontSize: 11 },
    track: {
      height: 2,
      backgroundColor: colors.bgInput,
      borderRadius: 1,
      overflow: 'hidden',
      marginTop: space(1),
    },
    fill: { height: 2 },
  });
