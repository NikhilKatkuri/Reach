/** Skeleton placeholders shown while queries resolve. */
import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/src/store/theme';

/**
 * A single shimmering placeholder block.
 *
 * Honours the reduced-motion preference by rendering a flat block instead of
 * animating — a pulsing skeleton is exactly the kind of motion that setting
 * exists to suppress.
 */
export function Skeleton({
  width,
  height = 16,
  radius,
  style,
}: {
  readonly width?: number | `${number}%`;
  readonly height?: number;
  readonly radius?: number;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const { colors, shape, reducedMotion } = useTheme();
  const opacity = useSharedValue(0.45);

  useEffect(() => {
    if (reducedMotion) {
      opacity.value = 0.6;
      return;
    }
    opacity.value = withRepeat(
      withTiming(0.9, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [opacity, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.block,
        {
          width,
          height,
          borderRadius: radius ?? shape.small,
          backgroundColor: colors.surfaceContainerHighest,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

/** Placeholder matching the shape of the Today hero card. */
export function HeroCardSkeleton() {
  const { colors, shape } = useTheme();

  return (
    <View
      accessibilityLabel="Loading your commute"
      style={[styles.card, { backgroundColor: colors.surfaceContainer, borderRadius: shape.large }]}
    >
      <View style={styles.row}>
        <Skeleton width={140} height={14} />
        <Skeleton width={64} height={24} radius={8} />
      </View>
      <View style={styles.heroRow}>
        <View style={styles.heroText}>
          <Skeleton width={72} height={11} />
          <Skeleton width={120} height={30} />
          <Skeleton width={96} height={11} />
        </View>
        <Skeleton width={104} height={104} radius={52} />
      </View>
    </View>
  );
}

/** Placeholder matching a stack of stat cards. */
export function StatRowSkeleton({ count = 2 }: { readonly count?: number }) {
  return (
    <View style={styles.row}>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} width="48%" height={96} radius={16} />
      ))}
    </View>
  );
}

/** Placeholder matching a list of cards. */
export function ListSkeleton({ count = 3 }: { readonly count?: number }) {
  const { colors, shape } = useTheme();

  return (
    <View style={styles.list}>
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          style={[
            styles.card,
            { backgroundColor: colors.surfaceContainer, borderRadius: shape.large },
          ]}
        >
          <View style={styles.row}>
            <Skeleton width={120} height={14} />
            <Skeleton width={72} height={22} radius={8} />
          </View>
          <Skeleton width="80%" height={12} />
          <Skeleton width="50%" height={12} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {},
  card: {
    padding: 16,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroText: {
    flex: 1,
    gap: 8,
  },
  list: {
    gap: 12,
  },
});
