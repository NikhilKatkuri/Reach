/** MD3 EmptyState: icon, headline, supporting text and an optional action. */
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/src/store/theme';
import { Icon, type IconName } from './Icon';
import { Button } from './Button';

/** Props for {@link EmptyState}. */
export interface EmptyStateProps {
  readonly icon?: IconName;
  readonly title: string;
  readonly description?: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly secondaryActionLabel?: string;
  readonly onSecondaryAction?: () => void;
  /** Renders the compact variant for use inside a card. */
  readonly compact?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/** Placeholder shown when a list or screen has nothing to display. */
export function EmptyState({
  icon = 'sparkle',
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  compact = false,
  style,
  testID,
}: EmptyStateProps) {
  const { colors, shape, type } = useTheme();

  return (
    <View
      accessibilityRole="summary"
      style={[styles.container, compact && styles.compact, style]}
      testID={testID}
    >
      <View
        style={[
          styles.iconWrap,
          {
            backgroundColor: colors.surfaceContainerHigh,
            borderRadius: shape.full,
            width: compact ? 56 : 72,
            height: compact ? 56 : 72,
          },
        ]}
      >
        <Icon
          name={icon}
          size={compact ? 26 : 34}
          color={colors.onSurfaceVariant}
          weight="regular"
        />
      </View>

      <Text
        style={[type.titleMedium, styles.title, { color: colors.onSurface, textAlign: 'center' }]}
      >
        {title}
      </Text>

      {description !== undefined ? (
        <Text
          style={[
            type.bodyMedium,
            styles.description,
            { color: colors.onSurfaceVariant, textAlign: 'center' },
          ]}
        >
          {description}
        </Text>
      ) : null}

      {actionLabel !== undefined && onAction !== undefined ? (
        <View style={styles.actions}>
          <Button label={actionLabel} onPress={onAction} variant="tonal" />
        </View>
      ) : null}

      {secondaryActionLabel !== undefined && onSecondaryAction !== undefined ? (
        <View style={styles.secondary}>
          <Button
            label={secondaryActionLabel}
            onPress={onSecondaryAction}
            variant="text"
            size="small"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
    gap: 12,
  },
  compact: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    gap: 8,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 4,
  },
  description: {
    maxWidth: 320,
  },
  actions: {
    marginTop: 8,
  },
  secondary: {
    marginTop: 2,
  },
});
