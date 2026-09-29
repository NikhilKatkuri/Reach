/** MD3 Card with the five elevation/tonal variants. */
import { forwardRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/src/store/theme';
import { type M3ColorScheme } from '@/src/constants/theme';

/** Card variant from the MD3 spec. */
export type CardVariant = 'elevated' | 'filled' | 'outlined';

/** Props for {@link Card}. */
export interface CardProps {
  readonly children: ReactNode;
  readonly variant?: CardVariant;
  /** Padded with the default 16dp inset. Set false for edge-to-edge content. */
  readonly padded?: boolean;
  readonly onPress?: () => void;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

function containerColor(variant: CardVariant, colors: M3ColorScheme): string {
  switch (variant) {
    case 'elevated':
      return colors.surfaceContainerLow;
    case 'filled':
      return colors.surfaceContainerHighest;
    case 'outlined':
      return 'transparent';
  }
}

/** A surface that groups related content. */
export const Card = forwardRef<View, CardProps>(function Card(
  {
    children,
    variant = 'filled',
    padded = true,
    onPress,
    accessibilityLabel,
    accessibilityHint,
    style,
    testID,
  },
  ref,
) {
  const { colors, shape } = useTheme();

  const base: StyleProp<ViewStyle> = [
    styles.base,
    {
      backgroundColor: containerColor(variant, colors),
      borderRadius: shape.large,
      borderWidth: variant === 'outlined' ? StyleSheet.hairlineWidth * 2 : 0,
      borderColor: variant === 'outlined' ? colors.outlineVariant : 'transparent',
    },
    variant === 'elevated' && { shadowColor: colors.shadow, elevation: 1 },
    style,
  ];

  const inner = padded ? <View style={styles.padded}>{children}</View> : children;

  if (onPress !== undefined) {
    return (
      <Pressable
        ref={ref}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        onPress={onPress}
        android_ripple={{ color: colors.elevationTint[1] }}
        style={({ pressed }) => [...base, pressed && { opacity: 0.92 }]}
        testID={testID}
      >
        {inner}
      </Pressable>
    );
  }

  return (
    <View ref={ref} style={base} testID={testID}>
      {inner}
    </View>
  );
});

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
  },
  padded: {
    padding: 16,
  },
});
