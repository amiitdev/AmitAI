import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Message } from '../types';
import { useTheme, ThemeColors, font, radius, space } from '../theme';
import { Markdown } from './Markdown';
import Ionicons from '@react-native-vector-icons/ionicons';
import { copyText } from '../lib/native';
import { useSpeech } from '../lib/speech';
import { useToast } from './Toast';

interface Props {
  message: Message;
  onRegenerate?: () => void;
  canRegenerate?: boolean;
}

export function Bubble({ message, onRegenerate, canRegenerate }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  // A silent speaker is impossible to debug, so surface the reason.
  const speech = useSpeech(message.id, message.content, msg => toast(msg));

  // One chip per host, newest first — four python.org links is noise.
  const chips = useMemo(() => {
    const seen = new Set<string>();
    const out: { host: string; url: string }[] = [];
    for (const src of message.sources ?? []) {
      let host = src.url;
      try {
        host = new URL(src.url).hostname.replace(/^www\./, '');
      } catch {}
      if (seen.has(host)) continue;
      seen.add(host);
      out.push({ host, url: src.url });
      if (out.length >= 3) break;
    }
    return out;
  }, [message.sources]);

  const doCopy = async () => {
    const ok = await copyText(message.content);
    if (ok) {
      setCopied(true);
      toast('Copied to clipboard');
      setTimeout(() => setCopied(false), 1500);
    } else {
      Share.share({ message: message.content }).catch(() => {});
    }
  };
  const empty = !message.content && message.streaming;

  // Some models (reasoning ones especially) take several seconds before the
  // first token. Keep the "thinking" state visible for a little while after
  // streaming started even if content is still empty, so the user does not see
  // a dead bubble.
  const [firstTokenPending, setFirstTokenPending] = useState(false);
  useEffect(() => {
    if (!message.streaming || message.content) {
      setFirstTokenPending(false);
      return;
    }
    const t = setTimeout(() => setFirstTokenPending(true), 600);
    return () => clearTimeout(t);
  }, [message.streaming, message.content]);

  const showThinking = empty || firstTokenPending;

  return (
    <View style={[styles.row, isUser && styles.rowUser]}>
      <View style={[styles.bubble, isUser ? styles.user : styles.assistant]}>
        {!isUser && (
          <Text style={styles.author}>AmitAI</Text>
        )}

        {showThinking ? (
          <View style={styles.thinking}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.thinkingText}>thinking…</Text>
          </View>
        ) : isUser ? (
          <Text style={styles.userText} selectable>
            {message.content}
          </Text>
        ) : (
          <Markdown source={message.content} caret={!!message.streaming} />
        )}

        {chips.length > 0 && (
          <View style={styles.sources}>
            {chips.map(c => (
              <TouchableOpacity
                key={c.url}
                style={styles.sourceChip}
                onPress={() => Linking.openURL(c.url).catch(() => {})}
              >
                <Ionicons name="link" size={11} color={colors.accent} />
                <Text numberOfLines={1} style={styles.sourceText}>
                  {c.host}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {!!message.error && <Text style={styles.error}>{message.error}</Text>}

        {!isUser && !message.streaming && !!message.content && (
          <View style={styles.actions}>
            <TouchableOpacity hitSlop={8} onPress={doCopy} style={styles.actionBtn}>
              <Ionicons
                name={copied ? 'checkmark' : 'copy-outline'}
                size={14}
                color={copied ? colors.ok : colors.textFaint}
              />
              <Text style={[styles.action, copied && styles.actionDone]}>
                {copied ? 'copied' : 'copy'}
              </Text>
            </TouchableOpacity>

            {speech.enabled && (
              <TouchableOpacity hitSlop={8} onPress={speech.toggle} style={styles.actionBtn}>
                <Ionicons
                  name={speech.speaking ? 'stop-circle' : 'volume-high-outline'}
                  size={14}
                  color={speech.speaking ? colors.accent : colors.textFaint}
                />
                <Text style={[styles.action, speech.speaking && styles.actionActive]}>
                  {speech.speaking ? 'stop' : 'speak'}
                </Text>
              </TouchableOpacity>
            )}

            {canRegenerate && !!onRegenerate && (
              <TouchableOpacity hitSlop={8} onPress={onRegenerate} style={styles.actionBtn}>
                <Ionicons name="refresh" size={14} color={colors.textFaint} />
                <Text style={styles.action}>regenerate</Text>
              </TouchableOpacity>
            )}

            {!!message.tokens && <Text style={styles.meta}>{message.tokens} tok</Text>}
          </View>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  row: { marginBottom: space(4) },
  rowUser: { alignItems: 'flex-end' },
  bubble: { maxWidth: '100%' },
  user: {
    backgroundColor: colors.user,
    borderRadius: radius.lg,
    borderBottomRightRadius: radius.sm,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    maxWidth: '88%',
  },
  assistant: { paddingTop: space(1) },
  author: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 0.8,
    marginBottom: space(1.5),
    textTransform: 'uppercase',
  },
  userText: { ...font.body },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  thinkingText: { color: colors.textFaint, fontSize: 14 },
  error: { color: colors.danger, fontSize: 13, marginTop: space(2) },
  sources: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginTop: space(3) },
  sourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: space(2.5),
    paddingVertical: space(1.5),
    maxWidth: '100%',
  },
  sourceText: { color: colors.textDim, fontSize: 11 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    columnGap: space(4),
    rowGap: space(1),
    marginTop: space(3),
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: space(1.5) },
  action: { color: colors.textFaint, fontSize: 12 },
  actionDone: { color: colors.ok },
  actionActive: { color: colors.accent },
  meta: { ...font.tiny, marginLeft: 'auto' },
});
