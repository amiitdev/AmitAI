import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, Dimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, RadialGradient, Stop } from 'react-native-svg';

const { width } = Dimensions.get('window');

/**
 * Launch screen.
 *
 * The mark is drawn as SVG rather than a bitmap: it stays sharp on every
 * density, and it is the same geometry as the launcher icon (design/
 * build-assets.py), so the icon, the system splash on Android 12+ and this
 * screen all show one mark instead of three approximations of one.
 *
 * The root colour matches `@color/splash_background` in the Android theme, so
 * there is no white flash between the native window and this screen.
 */
export default function SplashScreen({ onDone }: { onDone: () => void }) {
  const markFade = useRef(new Animated.Value(0)).current;
  const markScale = useRef(new Animated.Value(0.86)).current;
  const glow = useRef(new Animated.Value(0.35)).current;
  const titleFade = useRef(new Animated.Value(0)).current;
  const titleY = useRef(new Animated.Value(14)).current;
  const subFade = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Every started animation is kept so unmount can stop it: a timing that
    // outlives the component would touch a torn-down view (and, under Jest, a
    // torn-down environment).
    const animations = [
      Animated.parallel([
        Animated.timing(markFade, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.spring(markScale, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(titleFade, { toValue: 1, duration: 460, delay: 260, useNativeDriver: true }),
        Animated.timing(titleY, { toValue: 0, duration: 460, delay: 260, useNativeDriver: true }),
      ]),
      Animated.timing(subFade, { toValue: 1, duration: 420, delay: 480, useNativeDriver: true }),
      // Width cannot use the native driver, so the hairline animates in JS.
      Animated.timing(bar, { toValue: 1, duration: 1400, delay: 420, useNativeDriver: false }),
    ];
    animations.forEach(a => a.start());

    const t = setTimeout(onDone, 2200);
    return () => {
      clearTimeout(t);
      animations.forEach(a => a.stop());
    };
    // Animated.Value instances are stable refs and onDone is memoised by the
    // caller, so this mount-only animation never re-runs.
  }, [markFade, markScale, glow, titleFade, titleY, subFade, bar, onDone]);

  return (
    <View style={styles.root}>
      <Animated.View
        style={[styles.mark, { opacity: markFade, transform: [{ scale: markScale }] }]}
      >
        <Svg viewBox="0 0 1024 1024" width={132} height={132}>
          <Defs>
            {/* Same two gradients as the launcher icon, so the mark is the
                same object in the app and on the home screen. */}
            <LinearGradient id="orb" x1="0.1" y1="0.05" x2="0.9" y2="0.95">
              <Stop offset="0" stopColor="#8f9bff" />
              <Stop offset="0.55" stopColor="#6366f1" />
              <Stop offset="1" stopColor="#10b981" />
            </LinearGradient>
            <RadialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor="#6366f1" stopOpacity="0.38" />
              <Stop offset="1" stopColor="#6366f1" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="512" cy="512" r="512" fill="url(#halo)" />
          <Ellipse
            cx="512"
            cy="512"
            rx="318"
            ry="128"
            fill="none"
            stroke="url(#orb)"
            strokeWidth={40}
            strokeOpacity={0.9}
            transform="rotate(-28 512 512)"
          />
          <Ellipse
            cx="512"
            cy="512"
            rx="318"
            ry="128"
            fill="none"
            stroke="url(#orb)"
            strokeWidth={40}
            strokeOpacity={0.9}
            transform="rotate(28 512 512)"
          />
          <Circle cx="512" cy="512" r="118" fill="url(#orb)" />
          <Circle
            cx="512"
            cy="512"
            r="118"
            fill="none"
            stroke="#ffffff"
            strokeOpacity={0.18}
            strokeWidth={6}
          />
        </Svg>
      </Animated.View>

      <Animated.Text
        style={[styles.title, { opacity: titleFade, transform: [{ translateY: titleY }] }]}
      >
        AmitAI
      </Animated.Text>

      <Animated.Text style={[styles.sub, { opacity: subFade }]}>
        Ask anything. Anytime.
      </Animated.Text>

      <View style={styles.track}>
        <Animated.View
          style={[
            styles.fill,
            { width: bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#05060f',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  mark: { width: 132, height: 132, alignItems: 'center', justifyContent: 'center' },
  title: {
    marginTop: 26,
    fontSize: 36,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -1.1,
  },
  sub: {
    marginTop: 8,
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.6,
  },
  track: {
    position: 'absolute',
    bottom: 96,
    width: Math.min(120, width * 0.32),
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  fill: { height: 2, borderRadius: 1, backgroundColor: '#10b981' },
});
