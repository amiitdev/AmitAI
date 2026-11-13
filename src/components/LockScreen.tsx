import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Vibration } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useTheme, ThemeColors, space } from '../theme';
import { verifyPin, tryState, PinRecord } from '../lib/lock';

/**
 * The lock screen.
 *
 * A PIN field, not a keypad: it uses the real numeric keyboard (so TalkBack and
 * hardware keyboards work), and it never shows the digits. Wrong tries shake and
 * count down; five in a row costs 30 seconds.
 *
 * Honest about its limits: this hides the app from whoever picks up the phone.
 * It is not encryption — see src/lib/lock.ts.
 */
export function LockScreen({
  pin,
  onUnlock,
  onForgot,
}: {
  pin: PinRecord;
  onUnlock: () => void;
  /** last resort: clear the lock (requires a full app restart afterwards) */
  onForgot?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [value, setValue] = useState('');
  const [wrong, setWrong] = useState(0);
  const [lastWrongAt, setLastWrongAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);

  // tick while a cool-down is running, so the countdown moves
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const { lockedOutUntil, left } = tryState(wrong, lastWrongAt, now);
  const cooling = lockedOutUntil !== null;

  const submit = () => {
    if (cooling) return;
    if (verifyPin(value, pin)) {
      setValue('');
      onUnlock();
      return;
    }
    Vibration.vibrate(40);
    setWrong(w => w + 1);
    setLastWrongAt(Date.now());
    setValue('');
    input.current?.focus();
  };

  const secs = cooling ? Math.ceil(((lockedOutUntil ?? 0) - now) / 1000) : 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <Ionicons name="lock-closed" size={28} color={colors.accent} />
      </View>
      <Text style={styles.title}>AmitAI is locked</Text>
      <Text style={styles.hint}>
        {cooling
          ? `Too many tries — wait ${secs}s`
          : wrong > 0
            ? `Wrong PIN · ${left} ${left === 1 ? 'try' : 'tries'} left`
            : 'Enter your PIN to continue'}
      </Text>

      <TextInput
        ref={input}
        style={styles.input}
        value={value}
        onChangeText={t => setValue(t.replace(/[^0-9]/g, '').slice(0, 8))}
        onSubmitEditing={submit}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={8}
        autoFocus
        editable={!cooling}
        placeholder="····"
        placeholderTextColor={colors.textFaint}
        returnKeyType="done"
      />

      <TouchableOpacity
        style={[styles.button, (cooling || !value) && styles.buttonOff]}
        onPress={submit}
        disabled={cooling || !value}
        activeOpacity={0.85}
      >
        <Text style={styles.buttonText}>Unlock</Text>
      </TouchableOpacity>

      {onForgot && (
        <TouchableOpacity onPress={onForgot} style={styles.forgot} activeOpacity={0.7}>
          <Text style={styles.forgotText}>
            Forgot the PIN? Clearing it also clears chats, keys and settings.
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: {
      flex: 1,
      backgroundColor: c.bg,
      alignItems: 'center',
      justifyContent: 'center',
      padding: space(6),
    },
    badge: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: c.bgRaised,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: space(4),
    },
    title: { color: c.text, fontSize: 22, fontWeight: '700', marginBottom: space(1.5) },
    hint: { color: c.textDim, fontSize: 14, marginBottom: space(4), textAlign: 'center' },
    input: {
      minWidth: 180,
      textAlign: 'center',
      fontSize: 26,
      letterSpacing: 8,
      color: c.text,
      backgroundColor: c.bgInput,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: space(2),
      paddingHorizontal: space(4),
    },
    button: {
      marginTop: space(4),
      backgroundColor: c.accent,
      borderRadius: 14,
      paddingVertical: space(2.5),
      paddingHorizontal: space(10),
    },
    buttonOff: { opacity: 0.4 },
    buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    forgot: { marginTop: space(8) },
    forgotText: { color: c.textFaint, fontSize: 12, textAlign: 'center', maxWidth: 280 },
  });