/**
 * ProgressRing: an animated circular gauge.
 *
 * Used for the on-time probability on the Today hero card. Built on
 * `react-native-svg` with a Reanimated stroke-dashoffset, and it fully
 * respects the reduced-motion preference by rendering the final state with no
 * animation.
 */
import { useEffect } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useDerivedValue,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '@/src/store/theme';
import { clamp01, round } from '@/src/utils/math';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Props for {@link ProgressRing}. */
export interface ProgressRingProps {
  /** Progress in 0..1. */
  readonly progress: number;
  readonly size?: number;
  readonly strokeWidth?: number;
  /** Overrides the track/indicator colour, e.g. green for high probability. */
  readonly color?: string;
  /** Centre label, e.g. `92%`. */
  readonly label?: string;
  /** Secondary line under the label. */
  readonly caption?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

/** A circular progress indicator with a centred label. */
export function ProgressRing({
  progress,
  size = 96,
  strokeWidth = 10,
  color,
  label,
  caption,
  style,
  accessibilityLabel,
  testID,
}: ProgressRingProps) {
  const { colors, reducedMotion, type } = useTheme();

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = clamp01(progress);

  const animatedProgress = useSharedValue(reducedMotion ? clamped : 0);

  useEffect(() => {
    if (reducedMotion) {
      animatedProgress.value = clamped;
      return;
    }
    animatedProgress.value = withTiming(clamped, {
      duration: 650,
      easing: Easing.bezier(0.2, 0, 0, 1),
    });
  }, [clamped, reducedMotion, animatedProgress]);

  const dashoffset = useDerivedValue(
    () => circumference * (1 - animatedProgress.value),
    [circumference, animatedProgress],
  );

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: dashoffset.value,
  }));

  const trackColor = colors.surfaceContainerHighest;
  const indicatorColor = color ?? colors.primary;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? `${Math.round(clamped * 100)} percent`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.container, { width: size, height: size }, style]}
      testID={testID}
    >
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={trackColor}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={indicatorColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circumference}
            animatedProps={animatedProps}
          />
        </G>
      </Svg>

      {label !== undefined ? (
        <View style={styles.labelWrap} pointerEvents="none">
          <Text
            style={[
              styles.label,
              { color: colors.onSurface, fontSize: size * 0.26, lineHeight: size * 0.3 },
            ]}
          >
            {label}
          </Text>
          {caption !== undefined ? (
            <Text
              style={[
                styles.caption,
                { color: colors.onSurfaceVariant, fontSize: Math.max(10, size * 0.1) },
              ]}
            >
              {caption}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.srOnly} accessibilityElementsHidden>
        <Text style={[type.bodySmall, { color: colors.onSurface }]}>
          {`${round(clamped * 100)} percent`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  caption: {
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
  },
});
