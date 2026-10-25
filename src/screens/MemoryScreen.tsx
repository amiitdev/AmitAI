import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useTheme, ThemeColors, radius, space, font } from '../theme';
import { useToast } from '../components/Toast';
import { Note, addNote, clearNotes, deleteNote, loadNotes } from '../lib/memory';

interface Props {
  onBack: () => void;
}

/**
 * The file cabinet behind `remember` / `recall`.
 *
 * A memory feature the user cannot audit is a liability, so every row is
 * visible, editable-by-replacement and deletable. Nothing is summarised or
 * hidden — what the model wrote is what you see.
 */
export function MemoryScreen({ onBack }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const toast = useToast();

  const [notes, setNotes] = useState<Note[] | null>(null);
  const [text, setText] = useState('');

  const refresh = useCallback(async () => {
    const list = await loadNotes();
    setNotes([...list].sort((a, b) => b.updatedAt - a.updatedAt));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(async () => {
    const clean = text.trim();
    if (!clean) return;
    try {
      await addNote(clean);
      setText('');
      await refresh();
      toast('Saved to memory', 'ok');
    } catch (e: any) {
      toast(e?.message ?? 'Could not save', 'error');
    }
  }, [text, refresh, toast]);

  const remove = useCallback(
    async (note: Note) => {
      await deleteNote(note.id);
      await refresh();
      toast('Forgotten', 'info');
    },
    [refresh, toast],
  );

  const clearAll = useCallback(() => {
    Alert.alert('Clear all memory?', 'Every saved note will be deleted. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete all',
        style: 'destructive',
        onPress: async () => {
          await clearNotes();
          await refresh();
          toast('Memory cleared', 'ok');
        },
      },
    ]);
  }, [refresh, toast]);

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <TouchableOpacity onPress={onBack} hitSlop={10} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.grow}>
          <Text style={font.h1}>Memory</Text>
          <Text style={styles.sub}>
            {notes ? `${notes.length} note${notes.length === 1 ? '' : 's'}` : 'loading…'} · read by
            the model via recall
          </Text>
        </View>
        {!!notes?.length && (
          <TouchableOpacity onPress={clearAll} hitSlop={8}>
            <Ionicons name="trash-outline" size={19} color={colors.danger} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.addRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Add a note yourself…"
          placeholderTextColor={colors.textFaint}
          multiline
          onSubmitEditing={save}
        />
        <TouchableOpacity style={[styles.addBtn, !text.trim() && styles.dim]} onPress={save}>
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={notes ?? []}
        keyExtractor={n => n.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="bulb-outline" size={34} color={colors.border} />
            <Text style={styles.emptyText}>
              {notes ? 'Nothing remembered yet' : ' '}
            </Text>
            <Text style={styles.emptyHint}>
              Ask in chat: “remember that my bike service is due in March”.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.note}>{item.text}</Text>
            <Text style={styles.time}>{new Date(item.updatedAt).toLocaleString()}</Text>
            <TouchableOpacity onPress={() => remove(item)} hitSlop={8} style={styles.remove}>
              <Ionicons name="close" size={16} color={colors.textFaint} />
            </TouchableOpacity>
          </View>
        )}
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
    dim: { opacity: 0.4 },
    sub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
    addRow: {
      flexDirection: 'row',
      gap: space(2),
      alignItems: 'flex-end',
      paddingHorizontal: space(4),
      paddingTop: space(3),
    },
    input: {
      flex: 1,
      color: colors.text,
      fontSize: 14,
      backgroundColor: colors.bgInput,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: space(3),
      paddingVertical: space(2),
      minHeight: 42,
      maxHeight: 110,
    },
    addBtn: {
      width: 42,
      height: 42,
      borderRadius: radius.md,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    listContent: { padding: space(4), paddingBottom: space(10) },
    row: {
      backgroundColor: colors.bgRaised,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: space(3),
      paddingRight: space(8),
      marginBottom: space(2),
    },
    note: { color: colors.text, fontSize: 14, lineHeight: 20 },
    time: { color: colors.textFaint, fontSize: 10, marginTop: space(1.5) },
    remove: { position: 'absolute', top: space(2.5), right: space(2.5) },
    empty: { alignItems: 'center', marginTop: space(12), paddingHorizontal: space(6) },
    emptyText: { color: colors.textDim, fontSize: 14, marginTop: space(3) },
    emptyHint: {
      color: colors.textFaint,
      fontSize: 12,
      marginTop: space(2),
      textAlign: 'center',
      lineHeight: 17,
    },
  });
