/**
 * StatCard: a single headline metric with a label, value and optional trend.
 *
 * Used across the Today hero and the Insights dashboard. The value is set in
 * the display face at display-small size so numbers read as a hierarchy
 * rather than as body text.
 */
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/src/store/theme';
import { Icon, type IconName } from './Icon';

/** Visual tone for the value and trend. */
export type StatTone = 'neutral' | 'primary' | 'success' | 'warning' | 'error';

/** Props for {@link StatCard}. */
export interface StatCardProps {
  readonly label: string;
  readonly value: string;
  /** Unit rendered after the value, e.g. `min`. */
  readonly unit?: string;
  /** One-line explanation under the value. */
  readonly hint?: string;
  readonly icon?: IconName;
  readonly tone?: StatTone;
  /** Signed delta, e.g. `−2 min vs last week`. */
  readonly trend?: string;
  /** Renders the trend with the success colour. */
  readonly trendPositive?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

/** A metric tile. */
export function StatCard({
  label,
  value,
  unit,
  hint,
  icon,
  tone = 'neutral',
  trend,
  trendPositive,
  style,
  accessibilityLabel,
  testID,
}: StatCardProps) {
  const { colors, shape, type } = useTheme();

  const toneColor =
    tone === 'primary'
      ? colors.primary
      : tone === 'success'
        ? colors.success
        : tone === 'warning'
          ? colors.warning
          : tone === 'error'
            ? colors.error
            : colors.onSurface;

  return (
    <View
      accessibilityLabel={accessibilityLabel ?? `${label}: ${value}${unit ?? ''}`}
      style={[
        styles.container,
        {
          backgroundColor: colors.surfaceContainer,
          borderRadius: shape.large,
        },
        style,
      ]}
      testID={testID}
    >
      <View style={styles.labelRow}>
        {icon !== undefined ? <Icon name={icon} size={14} color={colors.onSurfaceVariant} /> : null}
        <Text
          numberOfLines={1}
          style={[type.labelMedium, styles.label, { color: colors.onSurfaceVariant }]}
        >
          {label}
        </Text>
      </View>

      <View style={styles.valueRow}>
        <Text style={[type.displaySmall, { color: toneColor }]}>{value}</Text>
        {unit !== undefined ? (
          <Text style={[type.titleSmall, styles.unit, { color: colors.onSurfaceVariant }]}>
            {unit}
          </Text>
        ) : null}
      </View>

      {hint !== undefined ? (
        <Text numberOfLines={2} style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
          {hint}
        </Text>
      ) : null}

      {trend !== undefined ? (
        <View style={styles.trendRow}>
          <Icon
            name={trendPositive === true ? 'arrowRight' : 'arrowLeft'}
            size={12}
            color={trendPositive === true ? colors.success : colors.warning}
            weight="bold"
          />
          <Text
            numberOfLines={1}
            style={[
              type.labelSmall,
              { color: trendPositive === true ? colors.success : colors.warning },
            ]}
          >
            {trend}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 14,
    gap: 4,
    flex: 1,
    minWidth: 140,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    flexShrink: 1,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  unit: {
    marginBottom: 2,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
});
