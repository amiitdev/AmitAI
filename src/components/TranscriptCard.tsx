import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ThemeColors, radius, space } from '../theme';
import { plainMarkdown } from '../lib/format';

/**
 * The answer, on screen, followed by the voice.
 *
 * Native playback position drives `progress`; spoken words light up and the
 * card scrolls itself so the read head stays visible. Line breaks and list
 * items are kept — a "top five phones" answer must not collapse into one block
 * of text — and the soft edges are real gradients rather than opaque strips
 * that clipped the first and last line.
 */
export function TranscriptCard({
  text,
  progress,
  colors,
}: {
  text: string;
  progress: number;
  colors: ThemeColors;
}) {
  const lines = useMemo(
    () =>
      plainMarkdown(text)
        .split('\n')
        .map(l => l.trim())
        .filter(Boolean),
    [text],
  );

  const { blocks, total } = useMemo(() => {
    let index = 0;
    const out = lines.map(line => {
      const words = line.split(/\s+/).filter(Boolean);
      const start = index;
      index += words.length;
      return { words, start };
    });
    return { blocks: out, total: index };
  }, [lines]);

  const spoken = Math.min(total, Math.floor(Math.max(0, Math.min(1, progress)) * total));

  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const geom = useRef({ content: 0, view: 0 });
  const [overflow, setOverflow] = useState(false);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const follow = (fraction: number) => {
    const { content, view } = geom.current;
    const over = Math.max(0, content - view);
    setOverflow(over > 1);
    if (over > 0) {
      scroll.current?.scrollTo({ y: over * fraction, animated: false });
    }
  };

  useEffect(() => {
    follow(progress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scroll}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={(_w, h) => {
          geom.current.content = h;
          follow(progress);
        }}
        onLayout={e => {
          geom.current.view = e.nativeEvent.layout.height;
          follow(progress);
        }}
        contentContainerStyle={styles.content}
      >
        {blocks.map((block, b) => (
          <Text key={b} style={styles.paragraph}>
            {block.words.map((w, i) => (
              <Text
                key={i}
                style={block.start + i < spoken ? styles.spoken : styles.pending}
              >
                {i === 0 ? w : ` ${w}`}
              </Text>
            ))}
          </Text>
        ))}
      </ScrollView>

      {overflow && (
        <>
          <Svg pointerEvents="none" style={[styles.fade, styles.fadeTop]} width="100%" height={EDGE}>
            <Defs>
              <LinearGradient id="top" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.bgRaised} stopOpacity={1} />
                <Stop offset="1" stopColor={colors.bgRaised} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height={EDGE} fill="url(#top)" />
          </Svg>
          <Svg pointerEvents="none" style={[styles.fade, styles.fadeBottom]} width="100%" height={EDGE}>
            <Defs>
              <LinearGradient id="bottom" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.bgRaised} stopOpacity={0} />
                <Stop offset="1" stopColor={colors.bgRaised} stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height={EDGE} fill="url(#bottom)" />
          </Svg>
        </>
      )}
    </View>
  );
}

const EDGE = 26;

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    wrap: {
      width: '100%',
      flexShrink: 1,
      maxHeight: 258,
      minHeight: 118,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgRaised,
      overflow: 'hidden',
    },
    content: { paddingHorizontal: space(4), paddingVertical: space(4) },
    paragraph: { fontSize: 15, lineHeight: 23, marginBottom: 10 },
    spoken: { color: colors.text },
    pending: { color: colors.textFaint },
    fade: { position: 'absolute', left: 0, right: 0 },
    fadeTop: { top: 0 },
    fadeBottom: { bottom: 0 },
  });
