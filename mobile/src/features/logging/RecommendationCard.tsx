/** The Today screen's hero card: leave-by, ETA, probability and buffer. */
import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/src/store/theme';
import { Badge, Card, ProgressRing, RoutePill, StatCard } from '@/src/components/ui';
import { type Prediction, type RouteCandidate } from '@/src/types/schemas';
import { type RoutePath } from '@/src/engine/graph';
import { formatTime } from '@/src/utils/time';
import { round } from '@/src/utils/math';

/** Props for {@link RecommendationCard}. */
export interface RecommendationCardProps {
  readonly prediction: Prediction;
  readonly path: RoutePath;
  readonly candidate: RouteCandidate | null;
  readonly templateName: string;
  /** True when the recommended route is slower than the fastest option. */
  readonly slowerThanFastest: boolean;
  /** Minutes slower than the fastest option. */
  readonly tradeoffMinutes: number;
}

/** The primary answer: when to leave, which route, and how confident we are. */
export function RecommendationCard({
  prediction,
  path,
  candidate,
  templateName,
  slowerThanFastest,
  tradeoffMinutes,
}: RecommendationCardProps) {
  const { colors, type, shape, reducedMotion } = useTheme();

  const probabilityPercent = Math.round(prediction.onTimeProbability * 100);
  const score = Math.round(prediction.reliabilityScore);

  // The probability colour is the one place a hard-coded semantic is right:
  // green reads as "safe" faster than a tonal ramp would.
  const probabilityColor =
    probabilityPercent >= 85
      ? colors.success
      : probabilityPercent >= 65
        ? colors.warning
        : colors.error;

  return (
    <Animated.View entering={reducedMotion ? undefined : FadeIn.duration(320)}>
      <Card variant="filled" style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={[type.labelLarge, { color: colors.onSurfaceVariant }]}>
              {templateName}
            </Text>
            <Text style={[type.labelMedium, { color: colors.primary }]}>
              {slowerThanFastest
                ? `Reliable route · ${Math.round(tradeoffMinutes)} min slower`
                : 'Fastest and most reliable'}
            </Text>
          </View>
          <Badge
            label={`${score}/100`}
            tone={score >= 80 ? 'success' : score >= 60 ? 'warning' : 'error'}
          />
        </View>

        <View style={styles.heroRow}>
          <View style={styles.times}>
            <TimeBlock
              label="Leave by"
              value={formatTime(prediction.leaveBy)}
              hint={`P90 ${Math.round(prediction.travelTimeP90Min)} min`}
              emphasis
            />
            <TimeBlock
              label="Arrive by"
              value={formatTime(prediction.targetArrivalAt)}
              hint={`ETA ${formatTime(prediction.eta)}`}
            />
            <TimeBlock
              label="Buffer"
              value={`${prediction.suggestedBufferMin}`}
              hint={prediction.suggestedBufferMin === 1 ? 'min slack' : 'min slack'}
            />
          </View>

          <ProbabilityBadge
            percent={probabilityPercent}
            color={probabilityColor}
            reducedMotion={reducedMotion}
          />
        </View>

        {candidate !== null ? (
          <RoutePill
            modes={path.modes}
            transfers={path.hasTransfer ? 1 : 0}
            durationMinutes={prediction.travelTimeP50Min}
            recommended
            style={styles.pill}
          />
        ) : null}

        {slowerThanFastest ? (
          <View
            style={[
              styles.tradeoff,
              { backgroundColor: colors.secondaryContainer, borderRadius: shape.small },
            ]}
          >
            <Text style={[type.bodySmall, { color: colors.onSecondaryContainer }]}>
              {`The quickest route is ${Math.round(tradeoffMinutes)} min faster but far less predictable. ` +
                `This one has a ${score}% reliability score.`}
            </Text>
          </View>
        ) : null}
      </Card>
    </Animated.View>
  );
}

function TimeBlock({
  label,
  value,
  hint,
  emphasis = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint: string;
  readonly emphasis?: boolean;
}) {
  const { colors, type } = useTheme();

  return (
    <View style={styles.timeBlock}>
      <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>{label}</Text>
      <Text
        style={[
          emphasis ? type.headlineSmall : type.titleLarge,
          { color: emphasis ? colors.primary : colors.onSurface },
        ]}
      >
        {value}
      </Text>
      <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>{hint}</Text>
    </View>
  );
}

/** A pulsing ring for the on-time probability. */
function ProbabilityBadge({
  percent,
  color,
  reducedMotion,
}: {
  readonly percent: number;
  readonly color: string;
  readonly reducedMotion: boolean;
}) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (reducedMotion) {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [pulse, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <Animated.View style={animatedStyle}>
      <ProgressRing
        progress={percent / 100}
        size={104}
        strokeWidth={11}
        color={color}
        label={`${percent}%`}
        caption="on time"
        accessibilityLabel={`${percent} percent chance of arriving on time`}
      />
    </Animated.View>
  );
}

/** A compact row of the P50/P75/P90 spread. */
export function DurationSpreadRow({ prediction }: { readonly prediction: Prediction }) {
  const items = useMemo(
    () => [
      { label: 'P50', value: prediction.travelTimeP50Min },
      { label: 'P75', value: prediction.travelTimeP75Min },
      { label: 'P90', value: prediction.travelTimeP90Min },
      { label: 'P95', value: prediction.travelTimeP95Min },
    ],
    [prediction],
  );

  return (
    <View style={styles.spreadRow}>
      {items.map((item) => (
        <StatCard
          key={item.label}
          label={item.label}
          value={String(round(item.value, 0))}
          unit="min"
          style={styles.spreadCard}
          accessibilityLabel={`${item.label} duration ${round(item.value, 0)} minutes`}
        />
      ))}
      <View style={styles.spreadSpacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  times: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  timeBlock: {
    flex: 1,
    gap: 1,
  },
  pill: {
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  tradeoff: {
    padding: 10,
  },
  spreadRow: {
    flexDirection: 'row',
    gap: 8,
  },
  spreadCard: {
    minWidth: 0,
  },
  spreadSpacer: {
    display: 'none',
  },
});
