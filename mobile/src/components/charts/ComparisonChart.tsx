/** Grouped comparison bars, used for rain vs dry commute durations. */
import { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/src/store/theme';

/** One comparison group. */
export interface ComparisonDatum {
  readonly label: string;
  /** Primary value, e.g. the average duration. */
  readonly value: number;
  /** Optional second value, e.g. P90, drawn as a lighter extension. */
  readonly secondaryValue?: number;
  readonly count?: number;
  readonly emphasis?: 'primary' | 'error' | 'warning' | 'success';
}

/** Props for {@link ComparisonChart}. */
export interface ComparisonChartProps {
  readonly data: readonly ComparisonDatum[];
  readonly formatValue?: (value: number) => string;
  readonly secondaryLabel?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

/**
 * Horizontal comparison bars.
 *
 * Horizontal rather than vertical because the labels here are condition
 * names ("Heavy rain"), which do not fit under a column.
 */
export function ComparisonChart({
  data,
  formatValue = (value) => String(Math.round(value)),
  secondaryLabel,
  style,
  accessibilityLabel,
  testID,
}: ComparisonChartProps) {
  const { colors, type, shape } = useTheme();

  const max = useMemo(
    () => Math.max(1, ...data.map((datum) => datum.secondaryValue ?? datum.value)),
    [data],
  );

  const a11y =
    accessibilityLabel ??
    data
      .map((datum) => {
        const base = `${datum.label}: ${formatValue(datum.value)}`;
        const secondary =
          datum.secondaryValue !== undefined
            ? `, ${secondaryLabel ?? 'P90'} ${formatValue(datum.secondaryValue)}`
            : '';
        const count = datum.count !== undefined ? `, ${datum.count} trips` : '';
        return base + secondary + count;
      })
      .join('. ');

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={a11y}
      style={[styles.container, style]}
      testID={testID}
    >
      {data.map((datum) => {
        const primaryWidth = (datum.value / max) * 100;
        const secondaryExtra =
          datum.secondaryValue !== undefined
            ? Math.max(0, ((datum.secondaryValue - datum.value) / max) * 100)
            : 0;

        return (
          <View key={datum.label} style={styles.row}>
            <View style={styles.labelRow}>
              <Text style={[type.labelMedium, { color: colors.onSurface }]}>{datum.label}</Text>
              <View style={styles.valueRow}>
                <Text style={[type.labelMedium, { color: colors.onSurface }]}>
                  {formatValue(datum.value)}
                </Text>
                {datum.count !== undefined ? (
                  <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
                    {`· ${datum.count}`}
                  </Text>
                ) : null}
              </View>
            </View>

            <View
              style={[
                styles.track,
                { backgroundColor: colors.surfaceContainerHigh, borderRadius: shape.full },
              ]}
            >
              <View
                style={[
                  styles.bar,
                  {
                    width: `${primaryWidth}%`,
                    backgroundColor: barColor(datum.emphasis, colors),
                    borderRadius: shape.full,
                  },
                ]}
              />
              {secondaryExtra > 0 ? (
                <View
                  style={[
                    styles.barExtension,
                    {
                      left: `${primaryWidth}%`,
                      width: `${secondaryExtra}%`,
                      backgroundColor: barColor(datum.emphasis, colors),
                      opacity: 0.35,
                      borderRadius: shape.full,
                    },
                  ]}
                />
              ) : null}
            </View>
          </View>
        );
      })}

      {secondaryLabel !== undefined ? (
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: colors.secondary }]} />
            <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>Average</Text>
          </View>
          <View style={styles.legendItem}>
            <View
              style={[styles.legendSwatch, { backgroundColor: colors.secondary, opacity: 0.35 }]}
            />
            <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
              {secondaryLabel}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function barColor(
  emphasis: ComparisonDatum['emphasis'],
  colors: ReturnType<typeof useTheme>['colors'],
): string {
  switch (emphasis) {
    case 'error':
      return colors.error;
    case 'warning':
      return colors.warning;
    case 'success':
      return colors.success;
    case 'primary':
      return colors.primary;
    default:
      return colors.secondary;
  }
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: 12,
  },
  row: {
    gap: 4,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  track: {
    height: 12,
    overflow: 'hidden',
  },
  bar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  barExtension: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
});
