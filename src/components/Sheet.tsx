import React, { ComponentProps, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, ThemeColors, font, radius, space } from '../theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export interface SheetItem {
  label: string;
  icon: IconName;
  onPress: () => void;
  destructive?: boolean;
  hint?: string;
}

/** Bottom sheet used for chat actions and the model picker. */
export function ActionSheet({
  visible,
  title,
  items,
  onClose,
  loading,
}: {
  visible: boolean;
  title?: string;
  items: SheetItem[];
  onClose: () => void;
  loading?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const slide = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;
    slide.setValue(1);
    Animated.spring(slide, {
      toValue: 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 240,
      mass: 0.9,
    }).start();
  }, [visible, slide]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: insets.bottom + space(3) },
          {
            transform: [
              { translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 320] }) },
            ],
          },
        ]}
      >
        <View style={styles.grabber} />
        {!!title && (
          <Text style={styles.sheetTitle} numberOfLines={1}>
            {title}
          </Text>
        )}

        {!!loading && (
          <View style={styles.loading}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={styles.loadingText}>Fetching models…</Text>
          </View>
        )}

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {items.map((item, i) => (
          <View key={item.label + i}>
            {i > 0 && <View style={styles.sep} />}
            <TouchableOpacity
              style={styles.item}
              onPress={() => {
                onClose();
                // let the sheet close before the action opens another modal
                setTimeout(item.onPress, 180);
              }}
            >
              <Ionicons
                name={item.icon}
                size={20}
                color={item.destructive ? colors.danger : colors.text}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemLabel, item.destructive && { color: colors.danger }]}>
                  {item.label}
                </Text>
                {!!item.hint && <Text style={styles.itemHint}>{item.hint}</Text>}
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </TouchableOpacity>
          </View>
        ))}
        </ScrollView>

        <TouchableOpacity style={styles.cancel} onPress={onClose}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
}

/** Centred card for renaming a conversation. */
export function RenameDialog({
  visible,
  initial,
  onCancel,
  onSave,
}: {
  visible: boolean;
  initial: string;
  onCancel: () => void;
  onSave: (title: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    if (visible) setValue(initial);
  }, [visible, initial]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.dialogWrap}
      >
        <Pressable style={styles.backdrop} onPress={onCancel} />
        <View style={styles.dialog}>
          <Text style={font.h2}>Rename chat</Text>
          <TextInput
            style={styles.dialogInput}
            value={value}
            onChangeText={setValue}
            autoFocus
            selectTextOnFocus
            placeholder="Chat name"
            placeholderTextColor={colors.textFaint}
            maxLength={60}
            returnKeyType="done"
            onSubmitEditing={() => onSave(value)}
          />
          <View style={styles.dialogRow}>
            <TouchableOpacity style={styles.ghostBtn} onPress={onCancel}>
              <Text style={styles.ghostText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={() => onSave(value)}
              disabled={!value.trim()}
            >
              <Text style={styles.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bgRaised,
    borderTopLeftRadius: radius.lg + 6,
    borderTopRightRadius: radius.lg + 6,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space(4),
    paddingTop: space(2.5),
  },
  scroll: { maxHeight: 420 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: space(2), paddingVertical: space(3) },
  loadingText: { color: colors.textDim, fontSize: 13 },
  grabber: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: space(3),
  },
  sheetTitle: { ...font.small, marginBottom: space(2), paddingHorizontal: space(2) },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    paddingVertical: space(4),
    paddingHorizontal: space(2),
  },
  itemLabel: { color: colors.text, fontSize: 16 },
  itemHint: { color: colors.textFaint, fontSize: 12, marginTop: 2 },
  sep: { height: 1, backgroundColor: colors.border, marginLeft: space(9) },
  cancel: {
    marginTop: space(2),
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    paddingVertical: space(3.5),
    alignItems: 'center',
  },
  cancelText: { color: colors.textDim, fontSize: 15, fontWeight: '600' },

  dialogWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(6) },
  dialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.bgRaised,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space(5),
  },
  dialogInput: {
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: space(3),
    paddingVertical: space(3),
    marginTop: space(4),
  },
  dialogRow: { flexDirection: 'row', gap: space(2), marginTop: space(4) },
  ghostBtn: {
    flex: 1,
    paddingVertical: space(3),
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: colors.bgInput,
  },
  ghostText: { color: colors.textDim, fontWeight: '600' },
  saveBtn: {
    flex: 1,
    paddingVertical: space(3),
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: colors.accent,
  },
  saveText: { color: '#fff', fontWeight: '700' },
});
