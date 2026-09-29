/** Line chart with a smoothed series and optional area fill. */
import { useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { useTheme } from '@/src/store/theme';
import { niceTicks, smoothPath } from './scales';
import { round } from '@/src/utils/math';
import { useChartDimensions } from './useChartDimensions';

/** One point in a line series. */
export interface LinePoint {
  readonly label: string;
  readonly value: number;
}

/** Props for {@link LineChart}. */
export interface LineChartProps {
  readonly data: readonly LinePoint[];
  readonly height?: number;
  readonly yAxisWidth?: number;
  /** Formats values for the axis labels. */
  readonly formatValue?: (value: number) => string;
  /** Overrides the series colour, e.g. green for an on-time rate. */
  readonly color?: string;
  /** Fills the area under the line. */
  readonly showArea?: boolean;
  /** Renders a dashed horizontal reference line. */
  readonly referenceValue?: number;
  readonly referenceLabel?: string;
  /** Renders a dot on each point. */
  readonly showDots?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

/** A single-series line chart. */
export function LineChart({
  data,
  height = 180,
  yAxisWidth = 40,
  formatValue = (value) => String(round(value, 1)),
  color,
  showArea = true,
  referenceValue,
  referenceLabel,
  showDots = true,
  style,
  accessibilityLabel,
  testID,
}: LineChartProps) {
  const { colors } = useTheme();
  const { width, measured } = useChartDimensions();
  const seriesColor = color ?? colors.primary;

  const { max, ticks, points, plotHeight } = useMemo(() => {
    const values = data.map((point) => point.value);
    const scaleTicks = niceTicks(Math.max(1, ...values), 4);
    const resolvedMax = scaleTicks[scaleTicks.length - 1] ?? 1;
    const innerWidth = Math.max(0, width - yAxisWidth);
    const innerHeight = Math.max(0, height - 26);
    const step = data.length > 1 ? innerWidth / (data.length - 1) : 0;

    const resolved = data.map((point, index) => ({
      x: yAxisWidth + index * step,
      y: innerHeight - (resolvedMax > 0 ? (point.value / resolvedMax) * innerHeight : 0),
    }));

    return { max: resolvedMax, ticks: scaleTicks, points: resolved, plotHeight: innerHeight };
  }, [data, width, height, yAxisWidth]);

  const a11y =
    accessibilityLabel ??
    data.map((point) => `${point.label}: ${formatValue(point.value)}`).join(', ');

  if (data.length === 0) {
    return <View style={[{ height }, style]} testID={testID} />;
  }

  const line = smoothPath(points);
  const first = points[0];
  const last = points[points.length - 1];
  const area =
    showArea && first !== undefined && last !== undefined
      ? `${line} L ${round(last.x, 2)} ${round(plotHeight, 2)} L ${round(first.x, 2)} ${round(
          plotHeight,
          2,
        )} Z`
      : '';

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={a11y}
      style={[{ height }, style]}
      testID={testID}
    >
      {measured ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="reachArea" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={seriesColor} stopOpacity={0.28} />
              <Stop offset="1" stopColor={seriesColor} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>

          {ticks.map((tick) => {
            const y = plotHeight - (tick / max) * plotHeight;
            return (
              <G key={`tick-${tick}`}>
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
          })}

          {area !== '' ? <Path d={area} fill="url(#reachArea)" /> : null}
          <Path
            d={line}
            stroke={seriesColor}
            strokeWidth={2.5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {showDots
            ? points.map((point, index) => (
                <Circle
                  key={`dot-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={3.5}
                  fill={colors.surface}
                  stroke={seriesColor}
                  strokeWidth={2}
                />
              ))
            : null}

          {data.map((point, index) => (
            <SvgText
              key={`x-${point.label}-${index}`}
              x={points[index]?.x ?? 0}
              y={plotHeight + 14}
              fill={colors.onSurfaceVariant}
              fontSize={9}
              textAnchor="middle"
            >
              {point.label}
            </SvgText>
          ))}

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
