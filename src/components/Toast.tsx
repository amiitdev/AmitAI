import React, { ComponentProps, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { colors, radius, space } from '../theme';

type Kind = 'ok' | 'error' | 'info';

type Show = (message: string, kind?: Kind) => void;

const ToastCtx = createContext<Show>(() => {});

export const useToast = () => useContext(ToastCtx);

type IconName = ComponentProps<typeof Ionicons>['name'];

const ICON: Record<Kind, IconName> = {
  ok: 'checkmark-circle',
  error: 'alert-circle',
  info: 'information-circle',
};

const TINT: Record<Kind, string> = {
  ok: colors.ok,
  error: colors.danger,
  info: colors.accent,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ message: string; kind: Kind; id: number } | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback<Show>((message, kind = 'ok') => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, kind, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    anim.setValue(0);
    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      damping: 18,
      stiffness: 220,
      mass: 0.8,
    }).start();

    timer.current = setTimeout(() => {
      Animated.timing(anim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start(({ finished }) => finished && setToast(null));
    }, 2000);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [toast, anim]);

  return (
    <ToastCtx.Provider value={show}>
      <View style={styles.root}>
        {children}
        {!!toast && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.toast,
              {
                opacity: anim,
                transform: [
                  {
                    translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }),
                  },
                  {
                    scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }),
                  },
                ],
              },
            ]}
          >
            <Ionicons name={ICON[toast.kind]} size={18} color={TINT[toast.kind]} />
            <Text style={styles.text} numberOfLines={2}>
              {toast.message}
            </Text>
          </Animated.View>
        )}
      </View>
    </ToastCtx.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  toast: {
    position: 'absolute',
    left: space(6),
    right: space(6),
    bottom: space(24),
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2.5),
    backgroundColor: '#1e1e2a',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  text: { color: colors.text, fontSize: 14, flex: 1 },
});
