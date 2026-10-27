import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, TouchableOpacity, View } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import Svg, { Circle, Line } from 'react-native-svg';
import { ThemeColors, space } from '../theme';

export type HudPhase = 'listening' | 'thinking' | 'speaking' | 'paused' | 'error';

const SIZE = 236;
const C = SIZE / 2;
const RING_R = C - 6;
const TICKS = 60;
const BARS = 7;

const loopRotate = (v: Animated.Value, ms: number) =>
  Animated.loop(
    Animated.sequence([
      Animated.timing(v, {
        toValue: 1,
        duration: ms,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]),
  );

const loopBreathe = (v: Animated.Value, ms: number) =>
  Animated.loop(
    Animated.sequence([
      Animated.timing(v, {
        toValue: 1,
        duration: ms,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(v, {
        toValue: 0,
        duration: ms,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]),
  );

const loopBar = (v: Animated.Value, ms: number, delay: number) =>
  Animated.loop(
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(v, {
        toValue: 1,
        duration: ms,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
      Animated.timing(v, {
        toValue: 0,
        duration: ms,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }),
      Animated.delay(delay),
    ]),
  );

/** Rotating radar sweep: a short glowing arc that orbits the ring. */
function Sweep({ color, spin }: { color: string; spin: Animated.Value }) {
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const circumference = 2 * Math.PI * RING_R;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]}>
      <Svg width={SIZE} height={SIZE}>
        <Circle
          cx={C}
          cy={C}
          r={RING_R}
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={`${circumference * 0.16} ${circumference}`}
        />
      </Svg>
    </Animated.View>
  );
}

/**
 * Jarvis-style voice HUD.
 *
 * Every phase looks different on purpose: the tick ring creeps while listening,
 * the radar sweep snaps into a fast orbit while thinking, and a live-looking
 * waveform replaces the icon while speaking. Nothing here is tied to real audio
 * amplitude (the platform exposes none), so the bars are shaped to read as
 * speech rather than to measure it.
 */
export function VoiceHud({
  phase,
  colors,
  onPress,
}: {
  phase: HudPhase;
  colors: ThemeColors;
  onPress: () => void;
}) {
  const spin = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(0)).current;
  const beat = useRef(new Animated.Value(0)).current;
  const bars = useMemo(
    () => Array.from({ length: BARS }, () => new Animated.Value(0)),
    [],
  );

  const speaking = phase === 'speaking';
  const thinking = phase === 'thinking';
  const active = phase === 'listening' || speaking || thinking;

  useEffect(() => {
    const anim = loopRotate(spin, thinking ? 2600 : 18000);
    anim.start();
    return () => anim.stop();
  }, [spin, thinking]);

  useEffect(() => {
    if (!thinking) return;
    const anim = loopRotate(sweep, 1100);
    anim.start();
    return () => anim.stop();
  }, [sweep, thinking]);

  useEffect(() => {
    if (!active) return;
    const anim = loopBreathe(breath, speaking ? 900 : 2000);
    anim.start();
    return () => anim.stop();
  }, [breath, active, speaking]);

  useEffect(() => {
    if (!speaking) return;
    const anims = bars.map((b, i) =>
      loopBar(b, 280 + (i % 3) * 90, i * 70),
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, [bars, speaking]);

  useEffect(() => {
    if (!speaking) return;
    const anim = loopBreathe(beat, 620);
    anim.start();
    return () => anim.stop();
  }, [beat, speaking]);

  const ringScale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const ringOpacity = breath.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });
  const coreScale = beat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] });

  const accent = phase === 'speaking' ? colors.ok : thinking ? colors.accent : colors.accent;
  const orbColor =
    phase === 'speaking'
      ? colors.ok
      : thinking
        ? colors.accentDim
        : phase === 'paused'
          ? colors.bgRaised
          : phase === 'error'
            ? colors.danger
            : colors.accent;

  const ticks = useMemo(
    () =>
      Array.from({ length: TICKS }, (_, i) => {
        const angle = (i / TICKS) * Math.PI * 2;
        const major = i % 5 === 0;
        const inner = RING_R - (major ? 12 : 6);
        const outer = RING_R - 1;
        return (
          <Line
            key={i}
            x1={C + Math.cos(angle) * inner}
            y1={C + Math.sin(angle) * inner}
            x2={C + Math.cos(angle) * outer}
            y2={C + Math.sin(angle) * outer}
            stroke={colors.textFaint}
            strokeOpacity={major ? 0.55 : 0.22}
            strokeWidth={major ? 2 : 1}
            strokeLinecap="round"
          />
        );
      }),
    [colors.textFaint],
  );

  return (
    <View style={styles.wrap}>
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }]}>
        <Svg width={SIZE} height={SIZE}>
          {ticks}
        </Svg>
      </Animated.View>

      {thinking && <Sweep color={colors.accent} spin={sweep} />}

      {active && (
        <Animated.View
          style={[
            styles.pulse,
            { borderColor: accent, transform: [{ scale: ringScale }], opacity: ringOpacity },
          ]}
        />
      )}

      <Animated.View style={{ transform: [{ scale: speaking ? coreScale : 1 }] }}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onPress}
          style={[
            styles.orb,
            { backgroundColor: orbColor, shadowColor: accent },
          ]}
        >
          {speaking ? (
            <View style={styles.bars}>
              {bars.map((b, i) => (
                <Animated.View
                  key={i}
                  style={[
                    styles.bar,
                    {
                      transform: [
                        {
                          scaleY: b.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.25 + (i % 2) * 0.15, 1],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              ))}
            </View>
          ) : (
            <Ionicons
              name={
                thinking
                  ? 'sparkles'
                  : phase === 'error'
                    ? 'alert'
                    : phase === 'paused'
                      ? 'play'
                      : 'mic'
              }
              size={38}
              color="#fff"
            />
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulse: {
    position: 'absolute',
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 2,
  },
  orb: {
    width: 148,
    height: 148,
    borderRadius: 74,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.55,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 0 },
    elevation: 14,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    gap: space(1),
  },
  bar: {
    width: 5,
    height: 46,
    borderRadius: 3,
    backgroundColor: '#fff',
    opacity: 0.92,
  },
});
