/** MD3 Badge: a small count or status dot. */
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/src/store/theme';
import { type M3ColorScheme } from '@/src/constants/theme';

/** Badge tone. */
export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'error';

/** Props for {@link Badge}. */
export interface BadgeProps {
  readonly label: string;
  readonly tone?: BadgeTone;
  /** Renders a dot instead of a label, for unread state. */
  readonly dot?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

function colorsFor(tone: BadgeTone, colors: M3ColorScheme) {
  switch (tone) {
    case 'primary':
      return { container: colors.primary, label: colors.onPrimary };
    case 'success':
      return { container: colors.successContainer, label: colors.onSuccessContainer };
    case 'warning':
      return { container: colors.warningContainer, label: colors.onWarningContainer };
    case 'error':
      return { container: colors.errorContainer, label: colors.onErrorContainer };
    case 'neutral':
      return { container: colors.surfaceContainerHighest, label: colors.onSurfaceVariant };
  }
}

/** A compact status indicator. */
export function Badge({
  label,
  tone = 'neutral',
  dot = false,
  style,
  accessibilityLabel,
  testID,
}: BadgeProps) {
  const { colors, shape } = useTheme();
  const resolved = colorsFor(tone, colors);

  if (dot) {
    return (
      <View
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityRole="text"
        style={[
          styles.dot,
          {
            backgroundColor: tone === 'neutral' ? resolved.label : resolved.container,
            borderRadius: shape.full,
          },
          style,
        ]}
        testID={testID}
      />
    );
  }

  return (
    <View
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="text"
      style={[
        styles.base,
        { backgroundColor: resolved.container, borderRadius: shape.small },
        style,
      ]}
      testID={testID}
    >
      <Text numberOfLines={1} style={[styles.label, { color: resolved.label }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 8,
    height: 8,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
