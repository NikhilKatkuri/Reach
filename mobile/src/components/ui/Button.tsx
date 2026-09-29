/**
 * MD3 Button.
 *
 * Implements the filled, tonal, outlined, elevated and text variants with the
 * correct state layers (hover, focus, pressed, disabled) and the MD3 minimum
 * touch target. Colour comes from the theme via `useTheme`, so there are no
 * hardcoded hex values and dark mode is automatic.
 */
import { forwardRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Icon, type IconName } from '@/src/components/ui/Icon';
import { useTheme } from '@/src/store/theme';
import { type M3ColorScheme } from '@/src/constants/theme';

/** Visual weight of the button. */
export type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'elevated' | 'text' | 'danger';

/** Size bucket from the MD3 spec. */
export type ButtonSize = 'small' | 'medium' | 'large';

/** Props for {@link Button}. */
export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  readonly label: string;
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly icon?: IconName;
  readonly trailingIcon?: IconName;
  readonly loading?: boolean;
  readonly disabled?: boolean;
  readonly fullWidth?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly textStyle?: StyleProp<TextStyle>;
  /** Screen-reader hint, e.g. "Logs that you boarded the bus". */
  readonly accessibilityHint?: string;
}

interface ResolvedColors {
  readonly container: string;
  readonly label: string;
  readonly border: string;
  readonly ripple: string;
}

function resolveColors(variant: ButtonVariant, colors: M3ColorScheme): ResolvedColors {
  switch (variant) {
    case 'filled':
      return {
        container: colors.primary,
        label: colors.onPrimary,
        border: 'transparent',
        ripple: colors.onPrimary,
      };
    case 'tonal':
      return {
        container: colors.secondaryContainer,
        label: colors.onSecondaryContainer,
        border: 'transparent',
        ripple: colors.onSecondaryContainer,
      };
    case 'outlined':
      return {
        container: 'transparent',
        label: colors.primary,
        border: colors.outline,
        ripple: colors.primary,
      };
    case 'elevated':
      return {
        container: colors.surfaceContainerLow,
        label: colors.primary,
        border: 'transparent',
        ripple: colors.primary,
      };
    case 'danger':
      return {
        container: colors.errorContainer,
        label: colors.onErrorContainer,
        border: 'transparent',
        ripple: colors.onErrorContainer,
      };
    case 'text':
      return {
        container: 'transparent',
        label: colors.primary,
        border: 'transparent',
        ripple: colors.primary,
      };
  }
}

/** The MD3 button. */
export const Button = forwardRef<View, ButtonProps>(function Button(
  {
    label,
    variant = 'filled',
    size = 'medium',
    icon,
    trailingIcon,
    loading = false,
    disabled = false,
    fullWidth = false,
    style,
    textStyle,
    accessibilityHint,
    onPress,
    ...rest
  },
  ref,
) {
  const { colors, shape, minTouchTarget } = useTheme();
  const isDisabled = disabled || loading;
  const resolved = resolveColors(variant, colors);

  const height =
    size === 'small' ? 40 : size === 'large' ? Math.max(64, minTouchTarget + 16) : minTouchTarget;
  const paddingHorizontal = size === 'small' ? 16 : size === 'large' ? 32 : 24;
  const fontSize = size === 'small' ? 14 : size === 'large' ? 16 : 14;

  const borderWidth = variant === 'outlined' ? StyleSheet.hairlineWidth * 2 : 0;
  const radius = variant === 'text' ? shape.small : shape.full;

  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      android_ripple={{ color: `${resolved.ripple}22` }}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          minWidth: minTouchTarget,
          paddingHorizontal,
          borderRadius: radius,
          backgroundColor:
            pressed && !isDisabled ? withAlpha(resolved.container, 0.88) : resolved.container,
          borderColor: resolved.border,
          borderWidth,
          opacity: isDisabled ? 0.38 : 1,
        },
        fullWidth && styles.fullWidth,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={resolved.label} />
      ) : (
        <View style={styles.content}>
          {icon !== undefined ? (
            <Icon name={icon} size={18} color={resolved.label} weight="bold" />
          ) : null}
          <Text
            numberOfLines={1}
            style={[
              styles.label,
              {
                color: resolved.label,
                fontSize,
                fontWeight: '600',
                letterSpacing: 0.1,
              },
              textStyle,
            ]}
          >
            {label}
          </Text>
          {trailingIcon !== undefined ? (
            <Icon name={trailingIcon} size={18} color={resolved.label} weight="bold" />
          ) : null}
        </View>
      )}
    </Pressable>
  );
});

/** Applies 12% opacity to a hex colour, for the pressed state. */
function withAlpha(hex: string, alpha: number): string {
  if (hex === 'transparent') return 'transparent';
  if (!hex.startsWith('#') || (hex.length !== 7 && hex.length !== 4)) return hex;
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
    gap: 8,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  label: {
    textAlign: 'center',
  },
});
