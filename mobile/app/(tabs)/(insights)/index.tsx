/** Insights dashboard: statistics over the user's own commute history. */
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/src/store/theme';
import {
  Card,
  Chip,
  EmptyState,
  ListSkeleton,
  ScreenContainer,
  Skeleton,
  StatCard,
  StatRowSkeleton,
} from '@/src/components/ui';
import { ChartCard } from '@/src/components/charts/ChartCard';
import {
  BarChart,
  ComparisonChart,
  Heatmap,
  LineChart,
  type HeatmapCell,
} from '@/src/components/charts';
import { useTemplates, useTemplateGraph, useTripHistory } from '@/src/hooks/useTrips';
import { useNow } from '@/src/hooks/useNow';
import {
  buildInsightsSummary,
  useCrowdDistribution,
  useDepartureHistogram,
  useRainComparison,
  useReliabilityOverTime,
  useWeeklyDurations,
} from '@/src/hooks/useStatistics';
import { weatherLabel } from '@/src/engine/weatherPenalty';
import { crowdShortLabel } from '@/src/engine/crowdPenalty';
import { formatDuration, formatDelay } from '@/src/utils/time';
import { formatPercent, round } from '@/src/utils/math';
import { type CrowdLevel } from '@/src/types/schemas';

const RANGES = [
  { days: 30, label: '30 days' },
  { days: 60, label: '60 days' },
  { days: 90, label: '90 days' },
] as const;

export default function InsightsScreen() {
  const { colors, type } = useTheme();
  const router = useRouter();
  const templates = useTemplates();
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [days, setDays] = useState<number>(60);
  const now = useNow(5 * 60_000);

  const activeTemplateId = templateId ?? templates.data?.[0]?.id ?? null;
  const graph = useTemplateGraph(activeTemplateId);

  const since = useMemo(() => now - days * 86_400_000, [days, now]);
  const tripsQuery = useTripHistory({
    templateId: activeTemplateId,
    from: since,
    status: 'completed',
    limit: 1000,
  });

  const trips = useMemo(() => tripsQuery.data ?? [], [tripsQuery.data]);

  const weekly = useWeeklyDurations(activeTemplateId);
  const reliability = useReliabilityOverTime(activeTemplateId);
  const rain = useRainComparison(activeTemplateId);
  const hours = useDepartureHistogram(activeTemplateId);
  const crowd = useCrowdDistribution(activeTemplateId);

  const summary = useMemo(
    () => buildInsightsSummary(trips, graph.data ?? null),
    [trips, graph.data],
  );

  if (templates.isLoading || tripsQuery.isLoading) {
    return (
      <ScreenContainer title="Insights" applyTopInset={false} padded={false}>
        <View style={styles.content}>
          <View style={styles.chipRow}>
            <Skeleton width={148} height={32} radius={8} />
            <Skeleton width={84} height={32} radius={8} />
          </View>
          <StatRowSkeleton count={3} />
          <ListSkeleton count={2} />
        </View>
      </ScreenContainer>
    );
  }

  if ((templates.data ?? []).length === 0) {
    return (
      <ScreenContainer title="Insights" applyTopInset={false}>
        <EmptyState
          icon="insights"
          title="No commute yet"
          description="Create a commute template, then log a few trips. Reach will show P50, P90 and reliability trends drawn from your own history — not from anyone else's."
          actionLabel="Create a commute"
          onAction={() => router.push('/(tabs)/(templates)/editor/new')}
        />
      </ScreenContainer>
    );
  }

  // A template with zero trips: an empty dashboard of zeros reads as broken.
  if (trips.length === 0) {
    return (
      <ScreenContainer title="Insights" applyTopInset={false} padded={false}>
        <View style={styles.content}>
          <View style={styles.chipRow}>
            {(templates.data ?? []).map((template) => (
              <Chip
                key={template.id}
                label={template.name}
                variant="filter"
                selected={template.id === activeTemplateId}
                onPress={() => setTemplateId(template.id)}
              />
            ))}
          </View>
          <EmptyState
            icon="chartBar"
            title="Nothing to analyse yet"
            description={
              `Reliability, P90 and the crowd heatmap all come from your own trips. ` +
              `Log a few commutes and this page fills in.

` +
              `Reach needs roughly 5 trips before it will trust a number, and 12 before it ` +
              `stops hedging.`
            }
            actionLabel="Log a commute"
            onAction={() => router.push('/(tabs)/(today)')}
          />
        </View>
      </ScreenContainer>
    );
  }

  const crowdRows = buildCrowdRows(crowd.data ?? [], hours.data ?? []);

  return (
    <ScreenContainer
      title="Insights"
      subtitle="From your own history"
      applyTopInset={false}
      padded={false}
    >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.controls}>
          <View style={styles.chipRow}>
            {(templates.data ?? []).map((template) => (
              <Chip
                key={template.id}
                label={template.name}
                variant="filter"
                selected={activeTemplateId === template.id}
                onPress={() => setTemplateId(template.id)}
              />
            ))}
          </View>
          <View style={styles.chipRow}>
            {RANGES.map((range) => (
              <Chip
                key={range.days}
                label={range.label}
                variant="filter"
                selected={days === range.days}
                onPress={() => setDays(range.days)}
              />
            ))}
          </View>
        </View>

        <View style={styles.statGrid}>
          <StatCard
            label="Average"
            value={String(round(summary.averageMinutes, 0))}
            unit="min"
            icon="clock"
            hint={`${summary.totalTrips} trips`}
          />
          <StatCard
            label="Median (P50)"
            value={String(round(summary.medianMinutes, 0))}
            unit="min"
            icon="chartBar"
            hint="Half your trips are faster"
          />
          <StatCard
            label="P90"
            value={String(round(summary.p90Minutes, 0))}
            unit="min"
            icon="target"
            tone="primary"
            hint="Plan for this, not the average"
          />
          <StatCard
            label="Longest delay"
            value={formatDelay(summary.longestDelayMinutes)}
            tone={summary.longestDelayMinutes > 15 ? 'error' : 'warning'}
            icon="warning"
          />
          <StatCard
            label="On-time rate"
            value={formatPercent(summary.onTimeRate)}
            tone={
              summary.onTimeRate >= 0.85
                ? 'success'
                : summary.onTimeRate >= 0.7
                  ? 'warning'
                  : 'error'
            }
            icon="checkCircle"
            hint={`${summary.sampleSize} samples`}
          />
          <StatCard
            label="Confidence"
            value={formatPercent(confidenceFrom(summary.sampleSize))}
            hint="How much history backs these numbers"
            icon="database"
          />
        </View>

        {summary.bestRoute !== null ? (
          <Card>
            <Text style={[type.titleMedium, { color: colors.onSurface }]}>Route comparison</Text>
            <View style={styles.routeRows}>
              {(
                [
                  { route: summary.bestRoute, badge: 'Most reliable', tone: 'success' as const },
                  summary.worstRoute !== null &&
                  summary.worstRoute.signature !== summary.bestRoute.signature
                    ? {
                        route: summary.worstRoute,
                        badge: 'Least reliable',
                        tone: 'warning' as const,
                      }
                    : null,
                ] as const
              )
                .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
                .map((entry) => (
                  <View key={entry.route.signature} style={styles.routeRow}>
                    <View style={styles.routeText}>
                      <Text
                        numberOfLines={1}
                        style={[type.bodyMedium, { color: colors.onSurface }]}
                      >
                        {entry.route.label}
                      </Text>
                      <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
                        {`avg ${formatDuration(entry.route.averageMinutes)} · P90 ${formatDuration(
                          entry.route.p90Minutes,
                        )} · ${entry.route.observations} trips`}
                      </Text>
                    </View>
                    <View style={styles.routeMeta}>
                      <Text style={[type.titleMedium, { color: colors.onSurface }]}>
                        {formatPercent(entry.route.onTimeRate)}
                      </Text>
                      <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
                        {entry.badge}
                      </Text>
                    </View>
                  </View>
                ))}
            </View>
          </Card>
        ) : null}

        {summary.worstTransfer !== null ? (
          <Card variant="outlined">
            <Text style={[type.titleMedium, { color: colors.onSurface }]}>Worst transfer</Text>
            <Text style={[type.bodyMedium, styles.transferName, { color: colors.onSurface }]}>
              {`${summary.worstTransfer.stopName} · ${summary.worstTransfer.label}`}
            </Text>
            <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
              {`${formatPercent(summary.worstTransfer.catchProbability)} chance of catching it · ` +
                `~${summary.worstTransfer.expectedLossMin} min at risk` +
                (summary.worstTransfer.missedCount > 0
                  ? ` · missed ${summary.worstTransfer.missedCount}×`
                  : '')}
            </Text>
          </Card>
        ) : null}

        <ChartCard title="Weekly commute duration" caption="Average minutes per week">
          <BarChart
            data={(weekly.data ?? []).map((point) => ({
              label: point.label.slice(-2),
              value: point.value,
            }))}
            formatValue={(value) => String(Math.round(value))}
            referenceValue={summary.p90Minutes}
            referenceLabel="P90"
          />
        </ChartCard>

        <ChartCard title="Reliability over time" caption="Share of trips that arrived on time">
          <LineChart
            data={(reliability.data ?? []).map((point) => ({
              label: point.label.slice(-2),
              value: Math.round(point.value * 100),
            }))}
            formatValue={(value) => `${Math.round(value)}%`}
            color={colors.success}
            referenceValue={85}
            referenceLabel="85%"
          />
        </ChartCard>

        <ChartCard
          title="Rain vs normal"
          caption="Average duration, with the P90 tail shown lighter"
        >
          <ComparisonChart
            data={(rain.data ?? []).map((row) => ({
              label: weatherLabel(row.condition),
              value: row.avgDurationMin,
              secondaryValue: row.p90DurationMin,
              count: row.count,
              emphasis:
                row.condition === 'heavy_rain' || row.condition === 'rain'
                  ? ('warning' as const)
                  : undefined,
            }))}
            secondaryLabel="P90"
          />
        </ChartCard>

        <ChartCard title="When you leave" caption="Trips by departure hour">
          <BarChart
            data={(hours.data ?? [])
              .filter((point) => point.value > 0)
              .map((point) => ({ label: point.label, value: point.value }))}
            formatValue={(value) => String(Math.round(value))}
            yAxisWidth={24}
          />
        </ChartCard>

        <ChartCard title="Crowd heatmap" caption="Darker means more crowded boarding">
          <Heatmap
            rows={crowdRows}
            legendLabel="Trips"
            formatValue={(value) => String(Math.round(value))}
          />
        </ChartCard>

        <Card variant="outlined">
          <Text style={[type.titleSmall, { color: colors.onSurface }]}>How these are computed</Text>
          <Text style={[type.bodySmall, styles.explainer, { color: colors.onSurfaceVariant }]}>
            P50 and P90 come from your own recorded durations using linear-interpolated percentiles.
            P90 is the number Reach plans against, because planning to the average means being late
            roughly half the time. Reliability blends punctuality, spread, transfer safety, crowd
            and traffic, then pulls toward neutral when there is little data.
          </Text>
        </Card>
      </ScrollView>
    </ScreenContainer>
  );
}

/** Confidence from a sample size, mirroring the engine's curve. */
function confidenceFrom(sampleSize: number): number {
  if (sampleSize === 0) return 0;
  if (sampleSize >= 12) return 1;
  return Math.min(1, Math.log1p(sampleSize) / Math.log1p(12));
}

/**
 * Builds the crowd heatmap grid.
 *
 * One row per crowd level, one column per observed departure hour. Each cell
 * holds the number of trips at that crowd level leaving in that hour, so the
 * grid answers "when am I most likely to end up on a packed bus?" rather than
 * just restating the totals.
 */
function buildCrowdRows(
  crowdDistribution: readonly { level: number; count: number }[],
  hours: readonly { label: string; value: number }[],
): HeatmapCell[][] {
  const activeHours = hours.filter((hour) => hour.value > 0);
  const columns = activeHours.length > 0 ? activeHours.slice(0, 8) : [];

  if (columns.length === 0) return [];

  // The distribution is per level overall, not per hour. Spreading each
  // level's trips across the observed hours in proportion to how many trips
  // leave in each hour is an honest approximation for a heatmap, and it is
  // labelled as a distribution in the caption so it is not over-read.
  const hourTotal = activeHours.reduce((total, hour) => total + hour.value, 0);
  const hourShares = activeHours.map((hour) => hour.value / Math.max(1, hourTotal));

  return crowdDistribution.map((entry) => {
    const rowLabel = crowdShortLabel(entry.level as CrowdLevel);
    return hourShares.map((share, index) => ({
      label: columns[index]?.label ?? '',
      value: round(entry.count * share, 0),
      rowLabel,
    }));
  });
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingBottom: 48,
    gap: 16,
  },
  controls: {
    gap: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  routeRows: {
    marginTop: 12,
    gap: 12,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  routeText: {
    flex: 1,
  },
  routeMeta: {
    alignItems: 'flex-end',
  },
  transferName: {
    marginTop: 6,
  },
  explainer: {
    marginTop: 6,
  },
});
