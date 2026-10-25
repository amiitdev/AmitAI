import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, font, radius, space, ThemeColors } from '../theme';
import {
  cancelListening,
  hasSTT,
  startListening,
  stopListening,
  VoiceError,
} from '../lib/native';
import { speakAloud, stopAllSpeech } from '../lib/speech';
import { isRealUserSpeech, isSpeakerEcho, isStopWord } from '../lib/barge';

type Phase = 'listening' | 'thinking' | 'speaking' | 'paused' | 'error';

/** ERROR_SPEECH_TIMEOUT / ERROR_NO_MATCH — silence, not a broken mic. */
const SILENCE_CODES = [6, 7];

/**
 * Hands-free conversation loop with instant barge-in / interruption:
 *
 *   listen → final transcript → ask the model → speak the answer → listen again
 *
 * If the user interrupts while the assistant is speaking or thinking:
 *  - TTS audio is cut instantly.
 *  - Old in-flight responses are strictly discarded via queryEpoch counter.
 *  - The microphone stays focused on the user's new query.
 */
export function VoiceMode({
  onClose,
  onAsk,
  voiceLabel,
}: {
  onClose: () => void;
  onAsk: (text: string) => Promise<string>;
  voiceLabel: string;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [phase, setPhase] = useState<Phase>('listening');
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);

  const alive = useRef(true);
  const phaseRef = useRef<Phase>('listening');
  const handlerRef = useRef<((t: string, final: boolean) => void) | null>(null);
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** cleanup for the mic kept open while the answer is being spoken */
  const bargeStop = useRef<(() => void) | null>(null);
  /** Sequence counter for queries; incremented on interruption to drop stale responses */
  const queryEpoch = useRef(0);
  /** User tapped the orb to stop listening: do not auto-reopen the mic. */
  const pausedRef = useRef(false);
  /** The last answer we spoke — used to recognise the speaker's own echo. */
  const lastSpokenRef = useRef('');
  /** When that answer stopped playing: the echo guard only applies for a beat
   *  afterwards, because after that the speaker cannot still be heard. */
  const lastSpokenAt = useRef(0);
  /** A question said over the answer; asked as soon as the answer ends. */
  const pendingQuery = useRef('');
  /** Last question, so a recogniser that reports twice does not ask twice. */
  const lastQueryRef = useRef('');
  const lastQueryAt = useRef(0);
  /** Consecutive silent timeouts — never fatal, just used to stop hinting. */
  const listenedQuiet = useRef(0);
  /** A final transcript arrived for the current listen cycle. */
  const gotFinal = useRef(false);
  /** Rapid timeout restarts are capped so a broken mic cannot spin. */
  const listenAttempts = useRef(0);
  /** Handler + restart hook for the mic that stays open during playback. */
  const bargeHandlerRef = useRef<((t: string, final: boolean) => void) | null>(null);
  const bargeErrRef = useRef<((e: VoiceError) => void) | null>(null);
  const restartBarge = useRef<() => void>(() => {});

  const pulse = useRef(new Animated.Value(0)).current;

  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  /* pulsing rings while listening / speaking */
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1600,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // `think` and `listen` call each other, so each holds a ref to the other.
  const thinkRef = useRef<(text: string) => void>(() => {});
  const listenRef = useRef<() => void>(() => {});

  /**
   * Quiet-room timeouts are normal (the recogniser ends the session after a
   * few silent seconds). Keeping the loop alive and reopening the mic is the
   * whole point of hands-free mode — it must not turn into a red error that
   * makes the screen look broken. Only genuine failures (no recogniser, mic
   * busy, permission) get the error state, and the message now says which.
   */
  const handleRecognitionError = useCallback((err: VoiceError) => {
    if (!alive.current || pausedRef.current) return;

    if (phaseRef.current === 'speaking') {
      setTimeout(() => restartBarge.current(), 220);
      return;
    }
    if (phaseRef.current !== 'listening' || gotFinal.current) return;

    const silence = err.code !== undefined && SILENCE_CODES.includes(err.code);
    if (silence) {
      listenedQuiet.current++;
      if (listenedQuiet.current === 3) setHeard('');
      setTimeout(() => {
        if (alive.current && phaseRef.current === 'listening' && !gotFinal.current) {
          listenRef.current();
        }
      }, 140);
      return;
    }

    if (listenAttempts.current >= 3) {
      setError(
        err.message || 'Microphone unavailable - check the app mic permission',
      );
      setPhaseBoth('error');
      return;
    }
    listenAttempts.current++;
    setTimeout(() => {
      if (alive.current && phaseRef.current === 'listening' && !gotFinal.current) {
        listenRef.current();
      }
    }, 400);
  }, []);

  /**
   * A recognition session can end without a usable question — on the speaker's
   * own tail, or on a duplicate final. Nothing reports an error in that case,
   * so without this the microphone stays shut while the screen still reads
   * "listening…" and the assistant silently stops answering for the rest of
   * the call.
   */
  const reopenMic = useCallback(() => {
    setTimeout(() => {
      if (!alive.current || pausedRef.current) return;
      if (phaseRef.current !== 'listening' || gotFinal.current) return;
      listenRef.current();
    }, 220);
  }, []);

  const listen = useCallback(async () => {
    if (!alive.current) return;
    setPhaseBoth('listening');
    setHeard('');
    setError(null);
    gotFinal.current = false;
    pausedRef.current = false;

    const handler = (text: string, final: boolean) => {
      if (!alive.current) return;

      // The loudspeaker bleeds into the mic for a moment after each answer.
      // Without this guard the assistant's own tail came back as a fresh
      // question, so it answered itself and spoke again — forever. It has to
      // stay narrow, though: comparing each new question with the whole
      // previous answer threw away every follow-up that shared an ordinary
      // word ("what", "is", "the") with it.
      if (
        text &&
        isSpeakerEcho(text, lastSpokenRef.current, Date.now() - lastSpokenAt.current)
      ) {
        if (final) reopenMic();
        return;
      }

      setHeard(text);
      if (final && text.trim()) {
        const said = text.trim();
        const now = Date.now();
        // Some recognisers deliver the same final twice: ask the model once.
        if (
          said.toLowerCase() === lastQueryRef.current.toLowerCase() &&
          now - lastQueryAt.current < 5000
        ) {
          reopenMic();
          return;
        }
        lastQueryRef.current = said;
        lastQueryAt.current = now;
        gotFinal.current = true;
        listenAttempts.current = 0;
        listenedQuiet.current = 0;
        handlerRef.current = null;
        thinkRef.current(said);
      }
    };
    handlerRef.current = handler;

    const started = await startListening(handler, handleRecognitionError);
    if (!started && alive.current) {
      setError('Microphone unavailable - check the app mic permission');
      setPhaseBoth('error');
    }
  }, [handleRecognitionError, reopenMic]);

  listenRef.current = () => {
    listen().catch(() => {});
  };

  /** Stop background barge listening */
  const stopBarge = () => {
    if (bargeStop.current) {
      bargeStop.current();
      bargeStop.current = null;
    }
  };

  /** Open mic while answer is being spoken for seamless barge-in interruption */
  const startBarge = useCallback((spoken: string) => {
    if (!hasSTT) return;
    /** Audio just started: the loudest, most mis-recognised moment. */
    const openedAt = Date.now();

    const handler = (text: string, final: boolean) => {
      if (!alive.current || !text) return;
      // Don't let the first noisy fragment of the answer silence it.
      if (Date.now() - openedAt < 500) return;

      if (!isRealUserSpeech(text, spoken)) {
        // The speaker's own words, not an interruption. If the session ended on
        // them, open the mic again so barge-in keeps working for the whole
        // answer instead of going deaf until the answer finishes.
        if (final) setTimeout(() => restartBarge.current(), 220);
        return;
      }

      // Only an explicit command may cut the answer short. Anything else said
      // during playback is remembered and asked the moment the answer ends.
      // Cutting on a guessed or half-heard phrase is what silenced replies:
      // the recogniser's own noisy echo was often "real speech" by the old
      // rule, so the answer died after a few words with only text left on
      // screen.
      if (!isStopWord(text)) {
        setHeard(text);
        if (final) {
          if (phaseRef.current === 'speaking') {
            pendingQuery.current = text.trim(); // asked when the answer ends
          } else {
            // The answer was already cut (a "stop" a moment ago): ask now.
            stopBarge();
            thinkRef.current(text.trim());
          }
        }
        return;
      }

      // "stop" / "wait" / "no": cut the audio now.
      queryEpoch.current++; // Invalidate previous query immediately so it never speaks
      stopAllSpeech();
      setPhaseBoth('listening');
      setHeard(text);

      if (!final) return; // the cut already happened; wait for the utterance to end
      // Never ask the model to answer the word "stop".
      stopBarge();
      listenRef.current();
    };

    // Keep the handler so the mic can be re-opened after a silence timeout
    // instead of going deaf for the rest of the answer.
    const onBargeError = (err: VoiceError) => {
      if (!alive.current) return;
      const silence = err.code !== undefined && SILENCE_CODES.includes(err.code);
      if (phaseRef.current === 'speaking') {
        if (silence) setTimeout(() => restartBarge.current(), 220);
        return; // a real failure while speaking: keep the answer going
      }
      // The answer was cut with a stop word, so this session is now the
      // listening one and must recover like any other listen session.
      if (phaseRef.current === 'listening' && silence) listenRef.current();
    };

    bargeHandlerRef.current = handler;
    bargeErrRef.current = onBargeError;
    restartBarge.current = () => {
      if (!alive.current || phaseRef.current !== 'speaking') return;
      const h = bargeHandlerRef.current;
      if (h) void startListening(h, bargeErrRef.current ?? undefined);
    };

    handlerRef.current = handler;
    void startListening(handler, onBargeError);
    bargeStop.current = () => {
      // cancel, not stop: stopListening() delivers a last recognition result,
      // which could ask the model the same question a second time.
      cancelListening();
      handlerRef.current = null;
      bargeHandlerRef.current = null;
    };
  }, []);

  const think = useCallback(
    async (text: string) => {
      if (!alive.current) return;
      const epoch = ++queryEpoch.current;
      pendingQuery.current = '';
      setPhaseBoth('thinking');
      try {
        const answer = await onAsk(text);
        if (!alive.current || queryEpoch.current !== epoch) {
          // Stale query! The user interrupted or spoke a new query while waiting. Drop it.
          return;
        }

        setReply(answer);
        lastSpokenRef.current = answer;
        setPhaseBoth('speaking');

        // The loop advances when this exact utterance finishes. An
        // interruption cancels it, because stopAllSpeech() drops the
        // continuation — so stopping never silently starts talking again.
        //
        // The barge-in mic opens only once playback has actually started:
        // starting the recogniser before the first word let the mic (and the
        // native retry path) cut the answer before it was ever heard.
        speakAloud(answer, () => {
          if (!alive.current) return;
          if (phaseRef.current !== 'speaking') return;
          if (safety.current) clearTimeout(safety.current);
          stopBarge();
          // The answer is over: from here on the only echo possible is its
          // decaying tail, and the guard is time-boxed against it.
          lastSpokenAt.current = Date.now();
          // Something the user said while this was playing: answer it now
          // instead of listening for a brand-new question.
          const pending = pendingQuery.current;
          pendingQuery.current = '';
          // Let the speaker tail decay before opening the mic again.
          setTimeout(() => {
            if (!alive.current || phaseRef.current !== 'speaking') return;
            if (pending) thinkRef.current(pending);
            else listenRef.current();
          }, 180);
        }, msg => {
          // Playback failed (bad key, no voice data, no engine). Say so plainly
          // and keep the conversation going instead of hanging in 'speaking'.
          if (!alive.current) return;
          setError(msg);
          if (phaseRef.current === 'speaking') {
            stopBarge();
            listenRef.current();
          }
        }, () => {
          if (!alive.current || phaseRef.current !== 'speaking') return;
          // Mic stays open so the answer can be interrupted mid-sentence.
          startBarge(answer);
        });

        // If the engine never reports completion, don't hang forever.
        if (safety.current) clearTimeout(safety.current);
        safety.current = setTimeout(() => {
          if (alive.current && phaseRef.current === 'speaking' && queryEpoch.current === epoch) {
            stopBarge();
            stopAllSpeech();
            listenRef.current();
          }
        }, Math.min(120000, answer.length * 90 + 15000));
      } catch (e: any) {
        if (!alive.current || queryEpoch.current !== epoch) return;
        setError(e?.message ?? 'Something went wrong');
        setPhaseBoth('error');
      }
    },
    [onAsk, startBarge],
  );

  thinkRef.current = (text: string) => {
    think(text).catch(() => {});
  };

  useEffect(() => {
    alive.current = true;
    listenRef.current();
    return () => {
      alive.current = false;
      if (safety.current) clearTimeout(safety.current);
      stopBarge();
      cancelListening();
      stopAllSpeech();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const end = () => {
    alive.current = false;
    queryEpoch.current++;
    pendingQuery.current = '';
    stopListening();
    cancelListening();
    stopAllSpeech();
    onClose();
  };

  const retry = () => {
    setError(null);
    listenAttempts.current = 0;
    pausedRef.current = false;
    listenRef.current();
  };

  /** Tap central orb to manually interrupt AI at any time */
  const handleOrbPress = () => {
    if (phase === 'speaking' || phase === 'thinking') {
      // Manual interruption!
      queryEpoch.current++;
      pendingQuery.current = '';
      stopAllSpeech();
      stopBarge();
      listenRef.current();
    } else if (phase === 'listening') {
      // Pause: the recogniser ends the session, and recovery must not reopen it.
      pausedRef.current = true;
      stopListening();
      setHeard('');
      setPhaseBoth('paused');
    } else if (phase === 'paused') {
      // Tapping again resumes — a single stray tap must not end the call.
      retry();
    }
  };

  const label =
    phase === 'listening'
      ? heard
        ? 'hearing you…'
        : 'listening…'
      : phase === 'thinking'
        ? 'thinking…'
        : phase === 'speaking'
          ? 'speaking… (tap to interrupt)'
          : phase === 'paused'
            ? 'paused · tap to resume'
            : 'error';

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });

  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + space(3), paddingBottom: insets.bottom + space(6) }]}>
      <View style={styles.head}>
        <TouchableOpacity onPress={end} hitSlop={10} style={styles.closeBtn}>
          <Ionicons name="chevron-down" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.title}>Voice mode</Text>
          <Text style={styles.sub}>{voiceLabel}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.center}>
        <View style={styles.orbWrap}>
          {(phase === 'listening' || phase === 'speaking') && (
            <Animated.View
              style={[
                styles.ring,
                { borderColor: phase === 'speaking' ? colors.ok : colors.accent },
                { transform: [{ scale: ringScale }], opacity: ringOpacity },
              ]}
            />
          )}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleOrbPress}
            style={[
              styles.orb,
              phase === 'speaking' && { backgroundColor: colors.ok, shadowColor: colors.ok },
              phase === 'thinking' && { backgroundColor: colors.accentDim, shadowColor: colors.accentDim },
            ]}
          >
            <Ionicons
              name={
                phase === 'speaking'
                  ? 'volume-high'
                  : phase === 'thinking'
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
          </TouchableOpacity>
        </View>

        <Text style={styles.phase}>{label}</Text>

        {!!heard && (
          <Text style={styles.heard} numberOfLines={3}>
            “{heard}”
          </Text>
        )}

        {!!reply && phase !== 'listening' && (
          <Text style={styles.reply} numberOfLines={6}>
            {reply}
          </Text>
        )}

        {!!error && <Text style={styles.error}>{error}</Text>}
      </View>

      <View style={styles.footer}>
        {phase === 'error' ? (
          <TouchableOpacity style={styles.retryBtn} onPress={retry}>
            <Ionicons name="refresh" size={18} color="#fff" />
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.hint}>
            {hasSTT
              ? 'Say “stop” or tap to cut the answer · anything else you say is asked next'
              : 'Speech module missing'}
          </Text>
        )}

        <TouchableOpacity style={styles.endBtn} onPress={end}>
          <Ionicons name="call" size={26} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space(5) },
    head: { flexDirection: 'row', alignItems: 'center' },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgRaised,
    },
    title: { color: colors.text, fontSize: 16, fontWeight: '700' },
    sub: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space(4) },
    orbWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: space(4) },
    ring: {
      position: 'absolute',
      width: 130,
      height: 130,
      borderRadius: 65,
      borderWidth: 2,
    },
    orb: {
      width: 130,
      height: 130,
      borderRadius: 65,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.accent,
      shadowOpacity: 0.55,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: 0 },
      elevation: 14,
    },
    phase: { ...font.small, fontSize: 15, color: colors.textDim },
    heard: { color: colors.text, fontSize: 18, textAlign: 'center', lineHeight: 26 },
    reply: { color: colors.textDim, fontSize: 14, textAlign: 'center', lineHeight: 21 },
    error: { color: colors.danger, fontSize: 13, textAlign: 'center' },
    footer: { alignItems: 'center', gap: space(4) },
    hint: { color: colors.textFaint, fontSize: 12, textAlign: 'center' },
    endBtn: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 8,
    },
    retryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space(2),
      backgroundColor: colors.accent,
      borderRadius: radius.pill,
      paddingHorizontal: space(4),
      paddingVertical: space(2.5),
    },
    retryText: { color: '#fff', fontWeight: '600' },
  });

