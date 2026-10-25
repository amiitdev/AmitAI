import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { Conversation } from '../types';
import { useTheme, ThemeColors, font, radius, space } from '../theme';
import { ActionSheet, RenameDialog } from './Sheet';
import { useToast } from './Toast';

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onPin: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onClose: () => void;
  onSettings: () => void;
  onSchedules: () => void;
  onMemory: () => void;
}

function ago(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(ts).toLocaleDateString();
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onPin,
  onRename,
  onClose,
  onSettings,
  onSchedules,
  onMemory,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [q, setQ] = useState('');
  const [menuFor, setMenuFor] = useState<Conversation | null>(null);
  const [renaming, setRenaming] = useState<Conversation | null>(null);
  const toast = useToast();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const base = needle
      ? conversations.filter(
          c =>
            c.title.toLowerCase().includes(needle) ||
            c.messages.some(m => m.content.toLowerCase().includes(needle)),
        )
      : conversations;
    return [...base].sort(
      (a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt,
    );
  }, [conversations, q]);

  const pick = (id: string) => {
    onSelect(id);
    onClose();
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={font.h1}>Chats</Text>
        <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.closeBtn}>
          <Ionicons name="close" size={20} color={colors.textDim} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.newBtn} onPress={() => { onNew(); onClose(); }}>
        <Ionicons name="add" size={19} color="#fff" />
        <Text style={styles.newText}>New chat</Text>
      </TouchableOpacity>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.textFaint} />
        <TextInput
          style={styles.search}
          value={q}
          onChangeText={setQ}
          placeholder="Search chats"
          placeholderTextColor={colors.textFaint}
        />
        {!!q && (
          <TouchableOpacity onPress={() => setQ('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.textFaint} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={c => c.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={34} color={colors.border} />
            <Text style={styles.emptyText}>{q ? 'Nothing matches' : 'No chats yet'}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const active = item.id === activeId;
          const last = item.messages[item.messages.length - 1];
          return (
            <TouchableOpacity
              style={[styles.row, active && styles.rowActive]}
              onPress={() => pick(item.id)}
              onLongPress={() => setMenuFor(item)}
            >
              <View style={[styles.avatar, active && styles.avatarActive]}>
                <Ionicons
                  name={item.pinned ? 'bookmark' : 'chatbubble-ellipses-outline'}
                  size={16}
                  color={active ? '#fff' : colors.textDim}
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[styles.title, active && styles.titleActive]}>
                  {item.title}
                </Text>
                <Text numberOfLines={1} style={styles.preview}>
                  {last ? last.content.replace(/\s+/g, ' ').slice(0, 52) : 'empty'}
                </Text>
              </View>

              <Text style={styles.time}>{ago(item.updatedAt)}</Text>

              <TouchableOpacity onPress={() => setMenuFor(item)} hitSlop={10} style={styles.more}>
                <Ionicons name="ellipsis-vertical" size={16} color={colors.textFaint} />
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
      />

      <View style={styles.footRow}>
        <TouchableOpacity style={styles.footBtn} onPress={onSchedules}>
          <Ionicons name="alarm-outline" size={20} color={colors.textDim} />
          <Text style={styles.footLabel}>Schedules</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.footBtn} onPress={onMemory}>
          <Ionicons name="bulb-outline" size={20} color={colors.textDim} />
          <Text style={styles.footLabel}>Memory</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.footBtn} onPress={onSettings}>
          <Ionicons name="settings-outline" size={20} color={colors.textDim} />
          <Text style={styles.footLabel}>Settings</Text>
        </TouchableOpacity>
      </View>

      <ActionSheet
        visible={!!menuFor}
        title={menuFor?.title}
        onClose={() => setMenuFor(null)}
        items={
          menuFor
            ? [
                {
                  label: 'Rename',
                  icon: 'create-outline',
                  onPress: () => setRenaming(menuFor),
                },
                {
                  label: menuFor.pinned ? 'Unpin from top' : 'Pin to top',
                  icon: menuFor.pinned ? 'bookmark-outline' : 'bookmark',
                  onPress: () => {
                    onPin(menuFor.id);
                    toast(menuFor.pinned ? 'Unpinned' : 'Pinned to top', 'info');
                  },
                },
                {
                  label: 'Delete chat',
                  icon: 'trash-outline',
                  destructive: true,
                  onPress: () => {
                    onDelete(menuFor.id);
                    toast('Chat deleted', 'ok');
                  },
                },
              ]
            : []
        }
      />

      <RenameDialog
        visible={!!renaming}
        initial={renaming?.title ?? ''}
        onCancel={() => setRenaming(null)}
        onSave={title => {
          const t = title.trim();
          if (renaming && t) {
            onRename(renaming.id, t);
            toast('Renamed', 'ok');
          }
          setRenaming(null);
        }}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: space(4), paddingTop: space(4) },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgInput,
  },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(2),
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: space(3),
    marginTop: space(4),
  },
  newText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    paddingHorizontal: space(3),
    marginVertical: space(3),
    borderWidth: 1,
    borderColor: colors.border,
  },
  search: { flex: 1, color: colors.text, paddingVertical: space(2.5), fontSize: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    paddingVertical: space(3),
    paddingHorizontal: space(2),
    borderRadius: radius.md,
  },
  rowActive: { backgroundColor: colors.bgInput },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: colors.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarActive: { backgroundColor: colors.accent },
  title: { color: colors.text, fontSize: 14.5, fontWeight: '600' },
  titleActive: { color: '#fff' },
  preview: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
  time: { color: colors.textFaint, fontSize: 11 },
  more: { padding: space(1) },
  empty: { alignItems: 'center', marginTop: space(10), gap: space(2) },
  emptyText: { ...font.small },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: space(4),
    marginTop: space(2),
  },
  footerText: { color: colors.textDim, fontSize: 15 },
  footRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: space(2),
    marginTop: space(2),
  },
  footBtn: { flex: 1, alignItems: 'center', gap: space(1), paddingVertical: space(2) },
  footLabel: { color: colors.textDim, fontSize: 11 },
});
