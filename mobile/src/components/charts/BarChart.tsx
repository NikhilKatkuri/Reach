/** Bar chart built on react-native-svg. */
import { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { useTheme } from '@/src/store/theme';
import { useChartDimensions } from './useChartDimensions';
import { niceTicks } from './scales';
import { round } from '@/src/utils/math';

/** One bar. */
export interface BarDatum {
  readonly label: string;
  readonly value: number;
  /** Optional highlight, used for the current or worst bucket. */
  readonly emphasis?: 'primary' | 'error' | 'warning' | 'success';
}

/** Props for {@link BarChart}. */
export interface BarChartProps {
  readonly data: readonly BarDatum[];
  readonly height?: number;
  /** Formats the value for the axis and the tooltip row. */
  readonly formatValue?: (value: number) => string;
  readonly yAxisWidth?: number;
  readonly showGridlines?: boolean;
  /** Renders a reference line, e.g. the on-time threshold. */
  readonly referenceValue?: number;
  readonly referenceLabel?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

/** A vertical bar chart with a left value axis. */
export function BarChart({
  data,
  height = 180,
  formatValue = (value) => String(round(value, 1)),
  yAxisWidth = 40,
  showGridlines = true,
  referenceValue,
  referenceLabel,
  style,
  accessibilityLabel,
  testID,
}: BarChartProps) {
  const { colors } = useTheme();
  const { width, measured } = useChartDimensions();

  const { max, ticks, plotHeight, barWidth, gap } = useMemo(() => {
    const maxValue = Math.max(1, ...data.map((datum) => datum.value));
    const scaleTicks = niceTicks(maxValue, 4);
    const resolvedMax = scaleTicks[scaleTicks.length - 1] ?? maxValue;
    const innerWidth = Math.max(0, width - yAxisWidth);
    const innerHeight = Math.max(0, height - 26);
    const slot = data.length > 0 ? innerWidth / data.length : innerWidth;
    return {
      max: resolvedMax,
      ticks: scaleTicks,
      plotHeight: innerHeight,
      barWidth: Math.max(3, slot * 0.62),
      gap: slot,
    };
  }, [data, width, height, yAxisWidth]);

  const a11y =
    accessibilityLabel ??
    data.map((datum) => `${datum.label}: ${formatValue(datum.value)}`).join(', ');

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={a11y}
      style={[styles.container, { height }, style]}
      testID={testID}
    >
      {measured ? (
        <Svg width={width} height={height}>
          {showGridlines
            ? ticks.map((tick) => {
                const y = plotHeight - (tick / max) * plotHeight;
                return (
                  <G key={`grid-${tick}`}>
                    <Line
                      x1={yAxisWidth}
                      y1={y}
                      x2={width}
                      y2={y}
                      stroke={colors.outlineVariant}
                      strokeWidth={1}
                    />
                    <SvgText
                      x={yAxisWidth - 6}
                      y={y + 4}
                      fill={colors.onSurfaceVariant}
                      fontSize={10}
                      textAnchor="end"
                    >
                      {formatValue(tick)}
                    </SvgText>
                  </G>
                );
              })
            : null}

          {data.map((datum, index) => {
            const barHeight = max > 0 ? (datum.value / max) * plotHeight : 0;
            const x = yAxisWidth + index * gap + (gap - barWidth) / 2;
            const y = plotHeight - barHeight;
            const fill = emphasisColor(datum.emphasis, colors);

            return (
              <G key={`bar-${datum.label}-${index}`}>
                <Rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(barHeight, datum.value > 0 ? 2 : 0)}
                  rx={Math.min(4, barWidth / 2)}
                  fill={fill}
                />
                <SvgText
                  x={x + barWidth / 2}
                  y={plotHeight + 14}
                  fill={colors.onSurfaceVariant}
                  fontSize={10}
                  textAnchor="middle"
                >
                  {datum.label}
                </SvgText>
              </G>
            );
          })}

          {referenceValue !== undefined ? (
            <G>
              <Line
                x1={yAxisWidth}
                y1={plotHeight - (referenceValue / max) * plotHeight}
                x2={width}
                y2={plotHeight - (referenceValue / max) * plotHeight}
                stroke={colors.error}
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
              {referenceLabel !== undefined ? (
                <SvgText
                  x={width - 4}
                  y={plotHeight - (referenceValue / max) * plotHeight - 4}
                  fill={colors.error}
                  fontSize={10}
                  textAnchor="end"
                >
                  {referenceLabel}
                </SvgText>
              ) : null}
            </G>
          ) : null}
        </Svg>
      ) : (
        <View />
      )}
    </View>
  );
}

function emphasisColor(
  emphasis: BarDatum['emphasis'],
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
  },
});
