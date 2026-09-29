/** Trip card for the History list. */
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/src/store/theme';
import { Badge, Card, Icon } from '@/src/components/ui';
import { modeIconName } from '@/src/components/ui/Icon';
import { type TransportMode, type Trip } from '@/src/types/schemas';
import { weatherLabel } from '@/src/engine/weatherPenalty';
import { trafficShortLabel } from '@/src/engine/trafficPenalty';
import { formatDate, formatTime, formatDuration, formatDelay } from '@/src/utils/time';
import { formatPercent } from '@/src/utils/math';

/** Props for {@link TripCard}. */
export interface TripCardProps {
  readonly trip: Trip;
  readonly weather: string | null;
  readonly traffic: string | null;
  readonly modes: readonly TransportMode[];
  readonly onPress: () => void;
  readonly testID?: string;
  /** Name of the commute this trip belongs to. */
  readonly templateName?: string;
  /**
   * How this trip's route compares to the typical time for the same route.
   *
   * `null` when the route has not been taken often enough to have a typical
   * time — showing "faster than usual" against a median of the user's only
   * other trip would be nonsense.
   */
  readonly comparedToTypicalMinutes?: number | null;
  /** Real trips logged on this exact route, including this one. */
  readonly routeObservations?: number;
}

/** A completed trip in the history list. */
export function TripCard({
  trip,
  weather,
  traffic,
  modes,
  onPress,
  testID,
  templateName,
  comparedToTypicalMinutes = null,
  routeObservations = 0,
}: TripCardProps) {
  const { colors, type, shape } = useTheme();

  const onTime = trip.wasOnTime === true;
  const delay = trip.delayMinutes ?? 0;

  return (
    <Card
      variant="outlined"
      onPress={onPress}
      accessibilityLabel={`${formatDate(trip.startedAt)} commute, ${formatTime(trip.startedAt)} to ${formatTime(
        trip.endedAt ?? trip.startedAt,
      )}, ${onTime ? 'on time' : formatDelay(delay)}`}
      accessibilityHint="Opens the detailed timeline"
      style={styles.card}
      testID={testID}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={[type.titleSmall, { color: colors.onSurface }]}>
            {formatDate(trip.startedAt)}
          </Text>
          {templateName !== undefined ? (
            <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
              {templateName}
            </Text>
          ) : null}
        </View>
        <Badge
          label={onTime ? 'On time' : formatDelay(delay)}
          tone={onTime ? 'success' : delay > 10 ? 'error' : 'warning'}
        />
      </View>

      <View style={styles.timeRow}>
        <Text style={[type.bodyMedium, { color: colors.onSurfaceVariant }]}>
          {formatTime(trip.startedAt)}
        </Text>
        <View style={[styles.connector, { backgroundColor: colors.outlineVariant }]} />
        <Text style={[type.bodyMedium, { color: colors.onSurfaceVariant }]}>
          {formatTime(trip.endedAt ?? trip.startedAt)}
        </Text>
        <Text style={[type.titleMedium, styles.duration, { color: colors.onSurface }]}>
          {formatDuration(trip.actualDurationMin ?? 0)}
        </Text>
      </View>

      <View style={styles.footerRow}>
        <View style={styles.modes}>
          {modes.slice(0, 5).map((mode, index) => (
            <View
              key={`${mode}-${index}`}
              style={[
                styles.modeIcon,
                { backgroundColor: colors.surfaceContainerHighest, borderRadius: shape.full },
              ]}
            >
              <Icon
                name={modeIconName(mode)}
                size={13}
                color={colors.onSurfaceVariant}
                weight="fill"
              />
            </View>
          ))}
        </View>

        {weather !== null ? (
          <View style={styles.conditions}>
            <Icon
              name={weather === 'clear' ? 'sun' : weather === 'cloudy' ? 'cloud' : 'cloudRain'}
              size={13}
              color={colors.onSurfaceVariant}
            />
            <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
              {weatherLabel(weather as never)}
            </Text>
          </View>
        ) : null}

        {traffic !== null ? (
          <View style={styles.conditions}>
            <Icon name="traffic" size={13} color={colors.onSurfaceVariant} />
            <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
              {trafficShortLabel(traffic as never)}
            </Text>
          </View>
        ) : null}
      </View>

      {/*
        Route context rather than per-trip context. "This route is usually 42
        min" is the number that explains why Reach recommends it, and it is what
        a user needs to judge whether this particular trip was normal.
      */}
      {comparedToTypicalMinutes !== null ? (
        <View style={styles.reliabilityRow}>
          <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
            {`${formatDuration(comparedToTypicalMinutes)} is typical for this route` +
              (routeObservations > 1 ? ` (${routeObservations} trips)` : '')}
          </Text>
        </View>
      ) : null}

      {trip.reliabilityScore !== null ? (
        <View style={styles.reliabilityRow}>
          <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
            {`Reliability ${Math.round(trip.reliabilityScore)}/100`}
          </Text>
          {trip.onTimeProbability !== null ? (
            <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
              {`${formatPercent(trip.onTimeProbability)} predicted`}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerText: {
    flex: 1,
    gap: 1,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  connector: {
    width: 16,
    height: 1,
  },
  duration: {
    marginLeft: 'auto',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  modes: {
    flexDirection: 'row',
    gap: 4,
  },
  modeIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conditions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reliabilityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
