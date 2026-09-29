/** MD3 Chip: assist, filter and input chips. */
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/src/store/theme';
import { type M3ColorScheme } from '@/src/constants/theme';
import { Icon, type IconName } from './Icon';

/** Chip variant from the MD3 spec. */
export type ChipVariant = 'assist' | 'filter' | 'input' | 'suggestion';

/** Props for {@link Chip}. */
export interface ChipProps {
  readonly label: string;
  readonly variant?: ChipVariant;
  readonly icon?: IconName;
  readonly selected?: boolean;
  readonly onPress?: () => void;
  readonly onRemove?: () => void;
  readonly disabled?: boolean;
  /** Overrides the accent colour, used for condition chips. */
  readonly accentColor?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

interface ChipColors {
  readonly container: string;
  readonly label: string;
  readonly border: string;
}

function resolveColors(
  variant: ChipVariant,
  selected: boolean,
  accent: string,
  colors: M3ColorScheme,
): ChipColors {
  if (variant === 'filter' || variant === 'input') {
    return selected
      ? {
          container: colors.secondaryContainer,
          label: colors.onSecondaryContainer,
          border: 'transparent',
        }
      : { container: 'transparent', label: colors.onSurfaceVariant, border: colors.outline };
  }
  if (selected) {
    return { container: `${accent}1F`, label: accent, border: accent };
  }
  return {
    container: colors.surfaceContainer,
    label: colors.onSurfaceVariant,
    border: 'transparent',
  };
}

/** A compact, tappable label. */
export function Chip({
  label,
  variant = 'assist',
  icon,
  selected = false,
  onPress,
  onRemove,
  disabled = false,
  accentColor,
  style,
  accessibilityLabel,
  testID,
}: ChipProps) {
  const { colors, shape, minTouchTarget, type } = useTheme();
  const resolved = resolveColors(variant, selected, accentColor ?? colors.primary, colors);
  const isInteractive = onPress !== undefined || onRemove !== undefined;

  const content = (
    <View style={styles.content}>
      {icon !== undefined ? (
        <Icon name={icon} size={16} color={resolved.label} weight="bold" />
      ) : null}
      <Text
        numberOfLines={1}
        style={[
          type.labelLarge,
          styles.label,
          { color: resolved.label, opacity: disabled ? 0.5 : 1 },
        ]}
      >
        {label}
      </Text>
      {onRemove !== undefined ? (
        <Icon name="x" size={14} color={resolved.label} weight="bold" />
      ) : null}
    </View>
  );

  const containerStyle: StyleProp<ViewStyle> = [
    styles.base,
    {
      minHeight: variant === 'filter' || variant === 'input' ? 32 : minTouchTarget * 0.75,
      paddingHorizontal: variant === 'assist' || variant === 'suggestion' ? 16 : 12,
      borderRadius: shape.small,
      backgroundColor: resolved.container,
      borderColor: resolved.border,
      borderWidth: resolved.border === 'transparent' ? 0 : StyleSheet.hairlineWidth * 2,
      opacity: disabled ? 0.5 : 1,
    },
    style,
  ];

  if (!isInteractive) {
    return (
      <View style={containerStyle} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onRemove ?? onPress}
      hitSlop={8}
      android_ripple={{ color: `${resolved.label}1A` }}
      style={({ pressed }) => [containerStyle, pressed && { opacity: 0.85 }]}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  label: {
    flexShrink: 1,
  },
});
