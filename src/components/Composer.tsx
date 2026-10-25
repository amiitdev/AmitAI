import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useTheme, ThemeColors, radius, space } from '../theme';
import { hasSTT, hasPicker, MAX_IMAGES } from '../lib/native';

interface Props {
  value: string;
  onChange: (t: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  imageUris: string[];
  onPickImages: () => void;
  onRemoveImage: (uri: string) => void;
  listening: boolean;
  onMic: () => void;
  disabled?: boolean;
  webOn: boolean;
  onToggleWeb: () => void;
}

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  imageUris,
  onPickImages,
  onRemoveImage,
  listening,
  onMic,
  disabled,
  webOn,
  onToggleWeb,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [height, setHeight] = useState(44);
  // Images alone are a valid message now ("what is this?" is optional).
  const canSend = (!!value.trim() || imageUris.length > 0) && !disabled;

  // Shrink back when the field is emptied — contentSizeChange never reports a
  // smaller size than the current box, so the composer would stay tall.
  useEffect(() => {
    if (!value) setHeight(44);
  }, [value]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      {imageUris.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.attachRow}
          contentContainerStyle={styles.attachContent}
        >
          {imageUris.map((uri, i) => (
            <View key={`${uri}-${i}`} style={styles.thumbWrap}>
              <Image source={{ uri }} style={styles.thumb} />
              <TouchableOpacity
                onPress={() => onRemoveImage(uri)}
                hitSlop={10}
                style={styles.remove}
              >
                <Ionicons name="close" size={12} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
          {hasPicker && imageUris.length < MAX_IMAGES && (
            <TouchableOpacity style={styles.addTile} onPress={onPickImages} activeOpacity={0.8}>
              <Ionicons name="add" size={20} color={colors.textDim} />
              <Text style={styles.addTileText}>{MAX_IMAGES - imageUris.length}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      <View style={styles.wrap}>
        {hasPicker && (
          <TouchableOpacity onPress={onPickImages} style={styles.iconBtn} hitSlop={6}>
            <Ionicons
              name={imageUris.length ? 'images' : 'add'}
              size={imageUris.length ? 19 : 22}
              color={imageUris.length ? colors.accent : colors.textDim}
            />
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={onToggleWeb} style={styles.iconBtn} hitSlop={6}>
          <Ionicons
            name={webOn ? 'globe' : 'globe-outline'}
            size={19}
            color={webOn ? colors.accent : colors.textFaint}
          />
        </TouchableOpacity>

        <TextInput
          style={[styles.input, { height: Math.min(140, Math.max(44, height)) }]}
          value={value}
          onChangeText={onChange}
          placeholder={listening ? 'listening…' : 'Message'}
          placeholderTextColor={colors.textFaint}
          multiline
          maxFontSizeMultiplier={1.15}
          onContentSizeChange={e => setHeight(e.nativeEvent.contentSize.height + 12)}
          editable={!streaming}
          returnKeyType="default"
        />

        {hasSTT && (
          <TouchableOpacity onPress={onMic} style={styles.iconBtn} hitSlop={6}>
            <Ionicons
              name={listening ? 'stop' : 'mic'}
              size={20}
              color={listening ? colors.danger : colors.textDim}
            />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={streaming ? onStop : onSend}
          disabled={!streaming && !canSend}
          style={[
            styles.send,
            streaming ? styles.stop : canSend ? styles.sendOn : styles.sendOff,
          ]}
        >
          <Ionicons name={streaming ? 'stop' : 'arrow-up'} size={19} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space(2),
    backgroundColor: colors.bgInput,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space(2),
    paddingVertical: space(2),
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
    paddingTop: space(1.5),
    paddingBottom: space(1.5),
    maxHeight: 140,
  },
  iconBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 18, color: colors.textDim },
  send: { width: 36, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  sendOn: { backgroundColor: colors.accent },
  sendOff: { backgroundColor: colors.bgRaised },
  stop: { backgroundColor: colors.danger },
  sendText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  attachRow: { marginBottom: space(2), flexGrow: 0 },
  attachContent: { gap: space(2), alignItems: 'center', paddingRight: space(2) },
  thumbWrap: { width: 56, height: 56 },
  thumb: { width: 56, height: 56, borderRadius: radius.sm },
  addTile: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgInput,
  },
  addTileText: { color: colors.textFaint, fontSize: 10, marginTop: -2 },
  remove: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.bg,
  },
  removeText: { color: colors.textDim, fontSize: 11 },
});
