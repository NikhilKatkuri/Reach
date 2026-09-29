/** Trip detail: the full one-tap event timeline for a single commute. */
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/src/store/theme';
import { Badge, Card, EmptyState, StatCard } from '@/src/components/ui';
import { useTripDetail } from '@/src/hooks/useTrips';
import { weatherLabel } from '@/src/engine/weatherPenalty';
import { trafficShortLabel } from '@/src/engine/trafficPenalty';
import { crowdLabel } from '@/src/engine/crowdPenalty';

import { formatDate, formatTime, formatDuration, formatDelay } from '@/src/utils/time';
import { formatPercent, round } from '@/src/utils/math';
import { Icon, modeIconName } from '@/src/components/ui/Icon';

export default function TripDetailScreen() {
  const { colors, type, shape } = useTheme();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const detail = useTripDetail(tripId ?? null);

  const events = useMemo(
    () => (detail.data?.events ?? []).filter((event) => !event.undone),
    [detail.data],
  );

  if (detail.isPending) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <EmptyState compact icon="spinner" title="Loading trip" />
      </ScrollView>
    );
  }

  if (detail.data == null) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <EmptyState icon="question" title="Trip not found" />
      </ScrollView>
    );
  }

  const { trip, weather, traffic } = detail.data;
  const onTime = trip.wasOnTime === true;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      style={{ backgroundColor: colors.background }}
    >
      <Stack.Screen options={{ title: formatDate(trip.startedAt) }} />

      <View style={styles.statRow}>
        <StatCard
          label="Duration"
          value={String(round(trip.actualDurationMin ?? 0, 0))}
          unit="min"
          icon="clock"
        />
        <StatCard
          label={onTime ? 'Result' : 'Delay'}
          value={onTime ? 'On time' : formatDelay(trip.delayMinutes ?? 0)}
          tone={onTime ? 'success' : 'error'}
          icon={onTime ? 'checkCircle' : 'warning'}
        />
        <StatCard
          label="Reliability"
          value={trip.reliabilityScore === null ? '—' : String(Math.round(trip.reliabilityScore))}
          unit={trip.reliabilityScore === null ? undefined : '/100'}
          icon="target"
          tone="primary"
        />
      </View>

      <Card>
        <View style={styles.headerRow}>
          <Text style={[type.titleMedium, { color: colors.onSurface }]}>Journey</Text>
          <Text style={[type.labelMedium, { color: colors.onSurfaceVariant }]}>
            {`${formatTime(trip.startedAt)} → ${formatTime(trip.endedAt ?? trip.startedAt)}`}
          </Text>
        </View>

        {events.length === 0 ? (
          <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
            No events were recorded for this trip.
          </Text>
        ) : (
          events.map((event, index) => {
            const isLast = index === events.length - 1;
            const tone =
              event.kind === 'miss'
                ? colors.error
                : event.kind === 'arrive'
                  ? colors.success
                  : colors.primary;

            return (
              <View key={event.id} style={styles.eventRow}>
                <View style={styles.rail}>
                  <View style={[styles.dot, { backgroundColor: tone }]} />
                  {!isLast ? (
                    <View style={[styles.line, { backgroundColor: colors.outlineVariant }]} />
                  ) : null}
                </View>

                <View style={[styles.eventBody, { paddingBottom: isLast ? 0 : 16 }]}>
                  <View style={styles.eventHeader}>
                    <Text style={[type.bodyLarge, { color: colors.onSurface }]}>{event.label}</Text>
                    <Text style={[type.labelMedium, { color: colors.onSurfaceVariant }]}>
                      {formatTime(event.occurredAt)}
                    </Text>
                  </View>

                  <View style={styles.eventMeta}>
                    {event.mode !== null ? (
                      <View style={styles.metaItem}>
                        <Icon
                          name={modeIconName(event.mode)}
                          size={12}
                          color={colors.onSurfaceVariant}
                          weight="fill"
                        />
                        <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
                          {event.mode}
                        </Text>
                      </View>
                    ) : null}

                    {event.crowdLevel !== null ? (
                      <View style={styles.metaItem}>
                        <Icon name="users" size={12} color={colors.onSurfaceVariant} />
                        <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
                          {crowdLabel(event.crowdLevel)}
                        </Text>
                      </View>
                    ) : null}

                    {event.isEstimated ? (
                      <View
                        style={[
                          styles.metaItem,
                          {
                            backgroundColor: colors.surfaceContainerHighest,
                            borderRadius: shape.full,
                          },
                        ]}
                      >
                        <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
                          estimated
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {event.deltaMinutes !== null && Math.abs(event.deltaMinutes) >= 1 ? (
                    <Text
                      style={[
                        type.labelSmall,
                        {
                          color:
                            event.deltaMinutes > 5
                              ? colors.error
                              : event.deltaMinutes > 0
                                ? colors.warning
                                : colors.success,
                        },
                      ]}
                    >
                      {`${formatDelay(event.deltaMinutes)} vs expected`}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </Card>

      <Card>
        <Text style={[type.titleMedium, { color: colors.onSurface }]}>Conditions</Text>
        <View style={styles.conditionsGrid}>
          <ConditionRow
            icon="cloudRain"
            label="Weather"
            value={weather === null ? 'Not recorded' : weatherLabel(weather.condition)}
            hint={
              weather != null && weather.rainfallMm != null
                ? `${round(weather.rainfallMm, 1)} mm`
                : undefined
            }
          />
          <ConditionRow
            icon="traffic"
            label="Traffic"
            value={traffic === null ? 'Not recorded' : trafficShortLabel(traffic.level)}
            hint={traffic === null ? undefined : `${traffic.delayMinutes} min lost`}
          />
        </View>
      </Card>

      {trip.plannedDurationMin !== null ? (
        <Card>
          <View style={styles.headerRow}>
            <Text style={[type.titleMedium, { color: colors.onSurface }]}>Prediction check</Text>
            <Badge
              label={trip.wasOnTime === true ? 'Beat the estimate' : 'Missed the estimate'}
              tone={trip.wasOnTime === true ? 'success' : 'warning'}
            />
          </View>
          <View style={styles.predictionGrid}>
            <Text style={[type.bodyMedium, { color: colors.onSurfaceVariant }]}>
              {`Planned ${formatDuration(trip.plannedDurationMin)} · actual ${formatDuration(
                trip.actualDurationMin ?? 0,
              )}`}
            </Text>
            {trip.onTimeProbability !== null ? (
              <Text style={[type.bodyMedium, { color: colors.onSurfaceVariant }]}>
                {`Predicted ${formatPercent(trip.onTimeProbability)} on time`}
              </Text>
            ) : null}
          </View>
        </Card>
      ) : null}
    </ScrollView>
  );
}

function ConditionRow({
  icon,
  label,
  value,
  hint,
}: {
  readonly icon: 'cloudRain' | 'traffic';
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
}) {
  const { colors, type } = useTheme();

  return (
    <View style={styles.conditionRow}>
      <Icon name={icon} size={16} color={colors.onSurfaceVariant} />
      <View style={styles.conditionText}>
        <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>{label}</Text>
        <Text style={[type.bodyMedium, { color: colors.onSurface }]}>{value}</Text>
        {hint !== undefined ? (
          <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>{hint}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 16,
    paddingBottom: 48,
  },
  statRow: {
    flexDirection: 'row',
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 8,
  },
  eventRow: {
    flexDirection: 'row',
  },
  rail: {
    width: 16,
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  line: {
    flex: 1,
    width: 2,
    marginTop: 4,
  },
  eventBody: {
    flex: 1,
    paddingLeft: 12,
    gap: 4,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  eventMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  conditionsGrid: {
    gap: 12,
  },
  conditionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  conditionText: {
    flex: 1,
  },
  predictionGrid: {
    gap: 4,
  },
});
