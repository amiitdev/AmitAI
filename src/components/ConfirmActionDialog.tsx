import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { AutomationConfirmRequest } from '../lib/automation';
import { useTheme, ThemeColors, radius, space } from '../theme';

/**
 * The one dialog the agent cannot skip.
 *
 * Native blocks the `request_user_confirmation` tool call until this component
 * answers, so "the model asked" and "the user said yes" are the same event. The
 * countdown is honest: with no answer the action is denied, never assumed.
 */
export function ConfirmActionDialog({
  request,
  onAnswer,
}: {
  request: AutomationConfirmRequest | null;
  onAnswer: (id: string, approved: boolean) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [left, setLeft] = useState(0);
  const answered = useRef<string | null>(null);

  useEffect(() => {
    if (!request) return;
    answered.current = null;
    const total = Math.max(1, Math.round((request.timeout_ms || 90000) / 1000));
    setLeft(total);
    const timer = setInterval(() => {
      setLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          if (answered.current !== request.id) {
            answered.current = request.id;
            onAnswer(request.id, false);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [request, onAnswer]);

  if (!request) return null;

  const answer = (approved: boolean) => {
    if (answered.current === request.id) return;
    answered.current = request.id;
    onAnswer(request.id, approved);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => answer(false)}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <View style={styles.head}>
            <View style={styles.iconWrap}>
              <Ionicons name="hand-left-outline" size={18} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Confirm this action</Text>
              <Text style={styles.sub}>AmitAI is about to act on your phone</Text>
            </View>
            <Text style={styles.countdown}>{left}s</Text>
          </View>

          <Text style={styles.description}>{request.description}</Text>

          <Text style={styles.note}>
            Nothing happens unless you tap Approve. If the timer runs out, the action is denied.
          </Text>

          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, styles.deny]} onPress={() => answer(false)}>
              <Text style={styles.denyText}>Deny</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.approve]} onPress={() => answer(true)}>
              <Ionicons name="checkmark" size={16} color="#fff" />
              <Text style={styles.approveText}>Approve</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    scrim: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.75)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: space(6),
    },
    card: {
      width: '100%',
      maxWidth: 440,
      backgroundColor: colors.bgRaised,
      borderWidth: 1.5,
      borderColor: colors.accent,
      borderRadius: radius.lg,
      padding: space(5),
      gap: space(3),
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
    iconWrap: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.accentDim,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { color: colors.text, fontSize: 16, fontWeight: '700' },
    sub: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
    countdown: { color: colors.accent, fontSize: 13, fontWeight: '700' },
    description: {
      color: colors.text,
      fontSize: 15,
      lineHeight: 22,
      backgroundColor: colors.bgInput,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: space(3),
    },
    note: { color: colors.textFaint, fontSize: 11, lineHeight: 16 },
    row: { flexDirection: 'row', gap: space(3), marginTop: space(1) },
    btn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space(1),
      paddingVertical: space(3),
      borderRadius: radius.md,
    },
    deny: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgInput },
    denyText: { color: colors.textDim, fontWeight: '700', fontSize: 14 },
    approve: { backgroundColor: colors.accent },
    approveText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  });
