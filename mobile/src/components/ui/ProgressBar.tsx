/**
 * ProgressRing-driven linear progress bar, exported for symmetry.
 *
 * The Today screen and the template builder both need a determinate bar; this
 * is a thin, accessible wrapper over the same Reanimated timing curve used by
 * {@link ProgressRing} so both animate identically.
 */
import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/src/store/theme';
import { clamp01 } from '@/src/utils/math';

/** Props for {@link ProgressBar}. */
export interface ProgressBarProps {
  readonly progress: number;
  readonly height?: number;
  readonly color?: string;
  readonly trackColor?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

/** A determinate linear progress indicator. */
export function ProgressBar({
  progress,
  height = 6,
  color,
  trackColor,
  style,
  accessibilityLabel,
  testID,
}: ProgressBarProps) {
  const { colors, reducedMotion, shape } = useTheme();
  const clamped = clamp01(progress);

  const width = useSharedValue(reducedMotion ? clamped : 0);

  useEffect(() => {
    if (reducedMotion) {
      width.value = clamped;
      return;
    }
    width.value = withTiming(clamped, { duration: 500, easing: Easing.out(Easing.cubic) });
  }, [clamped, reducedMotion, width]);

  const animatedStyle = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[
        styles.track,
        {
          height,
          borderRadius: shape.full,
          backgroundColor: trackColor ?? colors.surfaceContainerHighest,
        },
        style,
      ]}
      testID={testID}
    >
      <Animated.View
        style={[
          styles.fill,
          { backgroundColor: color ?? colors.primary, borderRadius: shape.full },
          animatedStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
