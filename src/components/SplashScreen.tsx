import React, { useEffect, useRef } from 'react';
import { View, Image, ImageBackground, Animated, StyleSheet, Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

const BG = require('../../assets/splash.jpg');
const LOGO = require('../../assets/icon.jpg');

export default function SplashScreen({ onDone }: { onDone: () => void }) {
  // background: fade in + slow ken-burns zoom
  const bgFade = useRef(new Animated.Value(0)).current;
  const bgScale = useRef(new Animated.Value(1.08)).current;
  // logo: bounce in
  const logoFade = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.6)).current;
  // title + tagline: slide up, staggered
  const titleY = useRef(new Animated.Value(30)).current;
  const titleFade = useRef(new Animated.Value(0)).current;
  const subY = useRef(new Animated.Value(20)).current;
  const subFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Keep every started animation so unmount can stop them: a delayed spring
    // or timing that outlives the component would touch a torn-down view
    // (and, under Jest, a torn-down environment).
    const animations = [
      Animated.parallel([
        Animated.timing(bgFade, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(bgScale, { toValue: 1, duration: 2600, useNativeDriver: true }),
      ]),
      Animated.spring(logoScale, { toValue: 1, friction: 6, tension: 80, delay: 250, useNativeDriver: true }),
      Animated.timing(logoFade, { toValue: 1, duration: 600, delay: 250, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(titleFade, { toValue: 1, duration: 600, delay: 700, useNativeDriver: true }),
        Animated.timing(titleY, { toValue: 0, duration: 600, delay: 700, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(subFade, { toValue: 1, duration: 600, delay: 1000, useNativeDriver: true }),
        Animated.timing(subY, { toValue: 0, duration: 600, delay: 1000, useNativeDriver: true }),
      ]),
    ];
    animations.forEach(a => a.start());

    const t = setTimeout(onDone, 2600);
    return () => {
      clearTimeout(t);
      animations.forEach(a => a.stop());
    };
    // Animated.Value instances are stable refs and onDone is memoised by the
    // caller, so this mount-only animation never re-runs.
  }, [bgFade, bgScale, logoFade, logoScale, titleFade, titleY, subFade, subY, onDone]);

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.bgWrap, { opacity: bgFade, transform: [{ scale: bgScale }] }]}>
        <ImageBackground source={BG} style={styles.bg} resizeMode="cover">
          <View style={styles.overlay} />
        </ImageBackground>
      </Animated.View>

      <View style={styles.center}>
        <Animated.View style={{ opacity: logoFade, transform: [{ scale: logoScale }] }}>
          <Image source={LOGO} style={styles.logo} />
        </Animated.View>

        <Animated.Text
          style={[
            styles.title,
            { opacity: titleFade, transform: [{ translateY: titleY }] },
          ]}
        >
          AmitAI
        </Animated.Text>

        <Animated.Text
          style={[
            styles.sub,
            { opacity: subFade, transform: [{ translateY: subY }] },
          ]}
        >
          Ask anything. Anytime.
        </Animated.Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05060f' },
  // StyleSheet.absoluteFillObject was removed in RN 0.87 — set position explicitly
  bgWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  bg: { flex: 1, width, height },
  // dark tint so the logo and text stay readable over the plexus image
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(5, 6, 15, 0.55)',
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  logo: {
    width: 110,
    height: 110,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  title: {
    marginTop: 28,
    fontSize: 40,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -1,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  sub: {
    marginTop: 10,
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
});
