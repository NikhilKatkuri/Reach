/** Templates list: saved commutes with their current reliability. */
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/src/store/theme';
import { Badge, Button, Card, ScreenList } from '@/src/components/ui';
import { useTemplates, useTripHistory } from '@/src/hooks/useTrips';
import { summarizeDurations } from '@/src/engine/statistics';
import { formatDuration } from '@/src/utils/time';
import { formatPercent } from '@/src/utils/math';
import { type CommuteTemplate } from '@/src/types/schemas';

export default function TemplatesScreen() {
  const { colors, type, shape } = useTheme();
  const router = useRouter();
  const templates = useTemplates();
  const total = templates.data?.length ?? 0;
  const trips = useTripHistory({ status: 'completed', limit: 1000 });

  const statsByTemplate = useMemo(() => {
    const grouped = new Map<string, number[]>();
    for (const trip of trips.data ?? []) {
      if (trip.actualDurationMin === null || trip.actualDurationMin <= 0) continue;
      const list = grouped.get(trip.templateId) ?? [];
      list.push(trip.actualDurationMin);
      grouped.set(trip.templateId, list);
    }

    const out = new Map<string, { count: number; p50: number; p90: number; onTimeRate: number }>();
    for (const [templateId, durations] of grouped) {
      const summary = summarizeDurations(durations);
      const group = (trips.data ?? []).filter((trip) => trip.templateId === templateId);
      const onTime = group.filter((trip) => trip.wasOnTime === true).length;
      out.set(templateId, {
        count: summary.count,
        p50: summary.p50,
        p90: summary.p90,
        onTimeRate: group.length > 0 ? onTime / group.length : 0,
      });
    }
    return out;
  }, [trips.data]);

  const renderItem = ({ item }: { item: CommuteTemplate }) => {
    const stats = statsByTemplate.get(item.id);
    return (
      <Card
        variant="outlined"
        onPress={() => router.push(`/(tabs)/(templates)/editor/${item.id}`)}
        accessibilityLabel={`${item.name}, ${item.originName} to ${item.destinationName}`}
        accessibilityHint="Opens the template builder"
        style={styles.card}
        testID={`template-${item.id}`}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={[type.titleMedium, { color: colors.onSurface }]}>{item.name}</Text>
            <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
              {`${item.originName} → ${item.destinationName}`}
            </Text>
          </View>
          {item.isDefault && total > 1 ? <Badge label="Default" tone="primary" /> : null}
        </View>

        {stats !== undefined && stats.count > 0 ? (
          <View
            style={[
              styles.stats,
              { backgroundColor: colors.surfaceContainer, borderRadius: shape.medium },
            ]}
          >
            <Stat label="Trips" value={String(stats.count)} />
            <Stat label="P50" value={formatDuration(stats.p50)} />
            <Stat label="P90" value={formatDuration(stats.p90)} />
            <Stat label="On time" value={formatPercent(stats.onTimeRate)} />
          </View>
        ) : (
          <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
            No trips logged yet. Reach will still estimate from the legs you define.
          </Text>
        )}

        <View style={styles.footerRow}>
          <Button
            label="Edit"
            variant="text"
            size="small"
            icon="pencilSimple"
            onPress={() => router.push(`/(tabs)/(templates)/editor/${item.id}`)}
          />
          <Button
            label="History"
            variant="text"
            size="small"
            onPress={() => router.push('/(tabs)/(history)')}
          />
        </View>
      </Card>
    );
  };

  return (
    <ScreenList
      title="Templates"
      subtitle={
        total === 0
          ? 'Reusable journeys Reach learns from'
          : `${total} commute${total === 1 ? '' : 's'}`
      }
      footer={
        <Button
          label="New commute"
          size="large"
          fullWidth
          icon="plus"
          onPress={() => router.push('/(tabs)/(templates)/editor/new')}
          accessibilityHint="Starts building a new commute template"
        />
      }
      data={templates.data ?? []}
      keyExtractor={(template) => template.id}
      renderItem={renderItem}
      isLoading={templates.isLoading}
      emptyIcon="templates"
      emptyTitle="No commutes yet"
      emptyDescription={
        'A template is a reusable journey — Home → bus stop → metro → office.\n\n' +
        'Add a second leg from the same stop and Reach treats it as an alternative route, so it ' +
        'can start telling you which one is actually more reliable.'
      }
      emptyActionLabel="Create your first commute"
      onEmptyAction={() => router.push('/(tabs)/(templates)/editor/new')}
    />
  );
}

function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={styles.stat}>
      <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>{label}</Text>
      <Text style={[type.titleSmall, { color: colors.onSurface }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 12,
  },
  card: {
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerText: {
    flex: 1,
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
  },
  stat: {
    gap: 2,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 4,
  },
});
