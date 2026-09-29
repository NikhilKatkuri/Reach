/** Heatmap grid, used for the crowd-by-hour distribution. */
import { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/src/store/theme';
import { type M3ColorScheme } from '@/src/constants/theme';
import { round } from '@/src/utils/math';

/** One cell. */
export interface HeatmapCell {
  readonly label: string;
  readonly value: number;
  /** Row this cell belongs to, used for the axis labels. */
  readonly rowLabel?: string;
}

/** Props for {@link Heatmap}. */
export interface HeatmapProps {
  readonly rows: readonly (readonly HeatmapCell[])[];
  readonly height?: number;
  /** Formats the value shown in a cell. */
  readonly formatValue?: (value: number) => string;
  /** Label for the colour scale, rendered as a legend. */
  readonly legendLabel?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

/**
 * A categorical heatmap.
 *
 * Colour intensity is derived from the value's position between the observed
 * minimum and maximum, so it works for any metric without a caller-supplied
 * domain. A sequential primary-to-primary-container ramp keeps it legible in
 * both light and dark.
 */
export function Heatmap({
  rows,
  height = 180,
  formatValue = (value) => String(round(value, 0)),
  legendLabel,
  style,
  accessibilityLabel,
  testID,
}: HeatmapProps) {
  const { colors, type, shape } = useTheme();

  const { min, max, columnCount } = useMemo(() => {
    const values = rows.flat().map((cell) => cell.value);
    return {
      min: values.length > 0 ? Math.min(...values) : 0,
      max: values.length > 0 ? Math.max(...values) : 1,
      columnCount: rows[0]?.length ?? 0,
    };
  }, [rows]);

  const span = max - min;

  const a11y =
    accessibilityLabel ??
    rows
      .map((row, rowIndex) =>
        row
          .map(
            (cell) =>
              `${cell.rowLabel ?? `row ${rowIndex + 1}`} ${cell.label}: ${formatValue(cell.value)}`,
          )
          .join(', '),
      )
      .join('. ');

  return (
    <View style={[styles.container, style]} testID={testID}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={a11y}
        style={[styles.grid, { height }]}
      >
        {rows.map((row, rowIndex) => (
          <View key={`row-${rowIndex}`} style={styles.row}>
            {row.map((cell, columnIndex) => {
              const intensity = span > 0 ? (cell.value - min) / span : 1;
              return (
                <View
                  key={`cell-${rowIndex}-${columnIndex}`}
                  style={[
                    styles.cell,
                    {
                      backgroundColor: heatColor(intensity, colors),
                      borderRadius: shape.extraSmall,
                    },
                  ]}
                />
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.legend}>
        {columnCount > 0 ? (
          <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
            {rows[0]?.[0]?.label ?? ''}
          </Text>
        ) : null}
        <View style={styles.legendRight}>
          {legendLabel !== undefined ? (
            <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>{legendLabel}</Text>
          ) : null}
          <View style={styles.scale}>
            {[0, 0.25, 0.5, 0.75, 1].map((step) => (
              <View
                key={step}
                style={[styles.scaleStep, { backgroundColor: heatColor(step, colors) }]}
              />
            ))}
          </View>
          <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
            {formatValue(max)}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** Maps a 0..1 intensity to a colour on the primary ramp. */
function heatColor(intensity: number, colors: M3ColorScheme): string {
  const t = Math.max(0, Math.min(1, intensity));
  if (t < 0.25) return colors.surfaceContainerHigh;
  if (t < 0.5) return mix(colors.surfaceContainerHigh, colors.primaryContainer, (t - 0.25) / 0.25);
  if (t < 0.75) return mix(colors.primaryContainer, colors.primary, (t - 0.5) / 0.25);
  return mix(colors.primary, colors.onPrimary, ((t - 0.75) / 0.25) * 0.5);
}

/** Blends two hex colours. */
function mix(from: string, to: string, amount: number): string {
  if (!from.startsWith('#') || !to.startsWith('#')) return from;
  const t = Math.max(0, Math.min(1, amount));
  const r = Math.round(hex(from, 1) + (hex(to, 1) - hex(from, 1)) * t);
  const g = Math.round(hex(from, 3) + (hex(to, 3) - hex(from, 3)) * t);
  const b = Math.round(hex(from, 5) + (hex(to, 5) - hex(from, 5)) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function hex(color: string, offset: number): number {
  return Number.parseInt(color.slice(offset, offset + 2), 16);
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: 8,
  },
  grid: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    flex: 1,
    gap: 2,
  },
  cell: {
    flex: 1,
    marginVertical: 1,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  legendRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scale: {
    flexDirection: 'row',
    gap: 2,
  },
  scaleStep: {
    width: 12,
    height: 8,
    borderRadius: 2,
  },
});
