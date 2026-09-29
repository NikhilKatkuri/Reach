/**
 * Timeline: the core one-tap logging surface.
 *
 * Renders a route as a vertical sequence of stops and legs. Each stop can be
 * `pending`, `current` or `done`; a done stop animates its check mark, and the
 * connector between stops fills progressively.
 *
 * The component is presentational. It receives the itinerary and the current
 * step index, and reports taps via `onPressStep`, so the logging state machine
 * stays in `src/features/logging` rather than in the view.
 */
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle as SvgCircle, Path } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type AnimatedStyle,
} from 'react-native-reanimated';
import { useTheme } from '@/src/store/theme';
import { type M3ColorScheme } from '@/src/constants/theme';
import { type TransportMode } from '@/src/types/schemas';
import { MODE_LABELS } from '@/src/constants/modes';
import { Icon, modeIconName } from './Icon';

/** Lifecycle of a single timeline step. */
export type TimelineStepState = 'pending' | 'current' | 'done';

/** One stop on the timeline. */
export interface TimelineStep {
  /** Stable key for React and for tracking taps. */
  readonly id: string;
  /** Stop name, e.g. `Bus Stop A`. */
  readonly label: string;
  readonly state: TimelineStepState;
  /** Mode of the leg that *arrives* at this stop. Undefined for the origin. */
  readonly arrivingMode?: TransportMode;
  /** Service name, e.g. `Bus 10H`. */
  readonly serviceLabel?: string;
  /** Actual duration of the arriving leg, once known. */
  readonly actualMinutes?: number;
  /** Expected duration, for the "expected" hint before completion. */
  readonly expectedMinutes?: number;
  /** Timestamp when this step was completed. */
  readonly occurredAt?: number;
  /** Free-form detail line, e.g. `Missed the 8:12 bus`. */
  readonly detail?: string;
  /**
   * Whether this step should let the user record how crowded the vehicle was.
   *
   * The logging state machine needs this; the timeline ignores it. Declaring
   * it here means the logging plan's steps satisfy `TimelineStep` directly,
   * with no lossy mapping in between.
   */
  readonly offersCrowdChoice?: boolean;
}

/** Props for {@link Timeline}. */
export interface TimelineProps {
  readonly steps: readonly TimelineStep[];
  /** Called when the user taps a step. */
  readonly onPressStep?: (step: TimelineStep, index: number) => void;
  /** Shows elapsed time on completed steps. */
  readonly showDurations?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/** A vertical journey timeline. */
export function Timeline({
  steps,
  onPressStep,
  showDurations = true,
  style,
  testID,
}: TimelineProps) {
  return (
    <View style={style} testID={testID}>
      {steps.map((step, index) => (
        <TimelineRow
          key={step.id}
          step={step}
          index={index}
          isFirst={index === 0}
          isLast={index === steps.length - 1}
          onPress={onPressStep === undefined ? undefined : () => onPressStep(step, index)}
          showDurations={showDurations}
        />
      ))}
    </View>
  );
}

interface TimelineRowProps {
  readonly step: TimelineStep;
  readonly index: number;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly onPress?: () => void;
  readonly showDurations: boolean;
}

function TimelineRow({ step, isFirst, isLast, onPress, showDurations }: TimelineRowProps) {
  const { colors, shape, type, reducedMotion } = useTheme();

  const isDone = step.state === 'done';
  const isCurrent = step.state === 'current';

  const progress = useSharedValue(isDone ? 1 : 0);
  useEffect(() => {
    progress.value = reducedMotion
      ? isDone
        ? 1
        : 0
      : withTiming(isDone ? 1 : 0, { duration: 400, easing: Easing.out(Easing.cubic) });
  }, [isDone, reducedMotion, progress]);

  const fillStyle: AnimatedStyle<ViewStyle> = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const nodeColor = nodeColorFor(step.state, colors);
  const body = (
    <View style={styles.row}>
      <View style={styles.rail}>
        {!isFirst ? (
          <View
            style={[
              styles.connectorAbove,
              {
                backgroundColor:
                  isDone || step.state === 'current' ? colors.primary : colors.outlineVariant,
              },
            ]}
          />
        ) : null}

        <TimelineNode
          state={step.state}
          color={nodeColor}
          ringColor={colors.surface}
          fillStyle={fillStyle}
          reducedMotion={reducedMotion}
        />

        {!isLast ? (
          <View style={[styles.connectorBelow, { backgroundColor: colors.outlineVariant }]} />
        ) : null}
      </View>

      <View style={[styles.content, { paddingBottom: isLast ? 0 : 16 }]}>
        <View style={styles.headerRow}>
          <Text
            numberOfLines={1}
            style={[
              isCurrent ? type.titleMedium : type.bodyLarge,
              { color: isCurrent ? colors.primary : colors.onSurface, flexShrink: 1 },
            ]}
          >
            {step.label}
          </Text>

          {showDurations && step.actualMinutes !== undefined ? (
            <Text style={[type.labelMedium, { color: colors.onSurfaceVariant }]}>
              {formatMinutes(step.actualMinutes)}
            </Text>
          ) : showDurations && step.expectedMinutes !== undefined && isCurrent ? (
            <Text style={[type.labelMedium, { color: colors.onSurfaceVariant }]}>
              {`~${formatMinutes(step.expectedMinutes)}`}
            </Text>
          ) : null}
        </View>

        {step.arrivingMode !== undefined ? (
          <View style={styles.legRow}>
            <Icon
              name={modeIconName(step.arrivingMode)}
              size={13}
              color={colors.onSurfaceVariant}
              weight="fill"
            />
            <Text numberOfLines={1} style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
              {step.serviceLabel ?? MODE_LABELS[step.arrivingMode]}
            </Text>
          </View>
        ) : null}

        {step.detail !== undefined ? (
          <Text
            style={[
              type.bodySmall,
              { color: step.state === 'current' ? colors.primary : colors.error },
            ]}
          >
            {step.detail}
          </Text>
        ) : null}

        {isCurrent ? (
          <View
            style={[
              styles.currentPill,
              { backgroundColor: colors.primaryContainer, borderRadius: shape.full },
            ]}
          >
            <Text style={[type.labelSmall, { color: colors.onPrimaryContainer }]}>Next</Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  if (onPress === undefined) {
    return body;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${step.label}, ${step.state}`}
      accessibilityState={{ selected: isCurrent }}
      onPress={onPress}
      android_ripple={{ color: colors.elevationTint[1] }}
    >
      {body}
    </Pressable>
  );
}

interface TimelineNodeProps {
  readonly state: TimelineStepState;
  readonly color: string;
  readonly ringColor: string;
  /** Drives the check mark's fade-in on completed steps. */
  readonly fillStyle: AnimatedStyle<ViewStyle>;
  readonly reducedMotion: boolean;
}

function TimelineNode({ state, color, ringColor, fillStyle, reducedMotion }: TimelineNodeProps) {
  const size = 24;

  if (state === 'done') {
    return (
      <View
        style={[
          styles.node,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            borderColor: ringColor,
          },
        ]}
      >
        {/* The check mark lives in a plain View so the Reanimated opacity can
            be applied to it directly, which avoids wrapping SVG in an
            animated view (unsupported on Fabric). */}
        <Animated.View style={fillStyle}>
          <Svg width={size} height={size}>
            <Path
              d="M6 12.5 L10 16.5 L18 8"
              stroke={ringColor}
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </Animated.View>
      </View>
    );
  }

  if (state === 'current') {
    return (
      <View
        style={[
          styles.node,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: color,
            borderWidth: 2,
            backgroundColor: ringColor,
          },
        ]}
      >
        <View
          style={[styles.nodeInner, { backgroundColor: color, opacity: reducedMotion ? 1 : 0.9 }]}
        />
      </View>
    );
  }

  return (
    <Svg width={size} height={size}>
      <SvgCircle cx={size / 2} cy={size / 2} r={8} stroke={color} strokeWidth={2} fill="none" />
    </Svg>
  );
}

function nodeColorFor(state: TimelineStepState, colors: M3ColorScheme): string {
  if (state === 'done') return colors.primary;
  if (state === 'current') return colors.primary;
  return colors.outline;
}

function formatMinutes(minutes: number): string {
  const total = Math.round(minutes);
  return total < 60 ? `${total} min` : `${Math.floor(total / 60)} h ${total % 60} m`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  rail: {
    width: 24,
    alignItems: 'center',
  },
  connectorAbove: {
    position: 'absolute',
    top: -2,
    width: 2,
    height: 12,
  },
  connectorBelow: {
    flex: 1,
    width: 2,
    minHeight: 16,
  },
  node: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  nodeCurrent: {
    borderStyle: 'solid',
  },
  nodeInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  content: {
    flex: 1,
    paddingLeft: 12,
    gap: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  legRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  currentPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 2,
  },
});
