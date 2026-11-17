import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import Ionicons from '@react-native-vector-icons/ionicons';
import { useTheme, mono, radius, space } from '../theme';
import { AgentStep } from '../lib/agentSteps';

/**
 * The live tool trace: one compact line per call, a coloured state marker,
 * and a pulsing dot on whatever is running right now.
 */
export function AgentSteps({ steps }: { steps: AgentStep[] }) {
  const { colors } = useTheme();
  const running = steps.some(s => s.state === 'running');
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!running) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.2, duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [running, pulse]);

  const card = useMemo(
    () => ({
      backgroundColor: colors.bgRaised,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.lg,
      paddingVertical: space(2),
      paddingHorizontal: space(3),
      gap: space(1.5),
      marginVertical: space(1),
    }),
    [colors],
  );

  return (
    <View style={card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1.5) }}>
        <Animated.View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: running ? colors.accent : colors.ok,
            opacity: running ? pulse : 1,
          }}
        />
        <Text style={{ color: colors.textFaint, fontSize: 11, letterSpacing: 0.4 }}>
          {running ? 'WORKING' : `${steps.length} STEP${steps.length === 1 ? '' : 'S'}`}
        </Text>
      </View>

      {steps.map((step, i) => {
        const inFlight = step.state === 'running' && i === steps.length - 1;
        const colour =
          step.state === 'failed' ? colors.danger : step.state === 'done' ? colors.ok : colors.accent;
        return (
          <View
            key={`${step.tool}-${i}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}
          >
            {inFlight ? (
              <Animated.View style={{ opacity: pulse }}>
                <Ionicons name="ellipsis-horizontal-circle" size={13} color={colors.accent} />
              </Animated.View>
            ) : (
              <Ionicons
                name={step.state === 'failed' ? 'close-circle' : 'checkmark-circle'}
                size={13}
                color={colour}
              />
            )}
            <Text style={{ color: colors.accent, fontSize: 12, fontFamily: mono, width: 58 }} numberOfLines={1}>
              {step.tool}
            </Text>
            {!!step.detail && (
              <Text
                numberOfLines={1}
                style={{ flexShrink: 1, color: inFlight ? colors.text : colors.textDim, fontSize: 12, fontFamily: mono }}
              >
                {step.detail}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}
