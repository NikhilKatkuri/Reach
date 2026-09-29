/** History screen: filterable list of completed commutes. */
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/src/store/theme';
import { Button, Chip, ScreenList, Skeleton } from '@/src/components/ui';
import { useTemplates, useTripHistory } from '@/src/hooks/useTrips';
import {
  useHistoryFilters,
  PAGE_SIZE,
  type DateRange,
  type OnTimeFilter,
} from '@/src/features/history/filters';
import { TripCard } from '@/src/features/history/TripCard';
import { type TransportMode, type Trip } from '@/src/types/schemas';
import { formatPercent, round } from '@/src/utils/math';

const DATE_RANGES: readonly { value: DateRange; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: '7 days' },
  { value: 'month', label: '30 days' },
];

const ON_TIME_FILTERS: readonly { value: OnTimeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'onTime', label: 'On time' },
  { value: 'late', label: 'Late' },
];

export default function HistoryScreen() {
  const { colors, type } = useTheme();
  const router = useRouter();
  const { filters, queryFilters, setRange, setTemplate, setOnTime, reset, isFiltered } =
    useHistoryFilters();
  const templates = useTemplates();
  const [limit, setLimit] = useState(PAGE_SIZE);

  const effectiveFilters = useMemo(() => ({ ...queryFilters, limit }), [queryFilters, limit]);
  const tripsQuery = useTripHistory(effectiveFilters);

  const trips = useMemo(() => tripsQuery.data ?? [], [tripsQuery.data]);

  /**
   * The transport modes a trip used.
   *
   * Read straight off the trip row: the mode mix is denormalised at write
   * time so the list can render a route for every card without loading each
   * template's graph.
   */
  const signatureModes = useCallback((trip: Trip): TransportMode[] => trip.legModes ?? [], []);

  const aggregate = useMemo(() => {
    if (trips.length === 0) return null;
    const durations = trips.map((trip) => trip.actualDurationMin ?? 0).filter((value) => value > 0);
    const average =
      durations.length > 0
        ? durations.reduce((total, value) => total + value, 0) / durations.length
        : 0;
    const onTime = trips.filter((trip) => trip.wasOnTime === true).length;
    return {
      count: trips.length,
      average: round(average, 1),
      onTimeRate: trips.length > 0 ? onTime / trips.length : 0,
    };
  }, [trips]);

  const renderItem = useCallback(
    ({ item }: { item: Trip }) => (
      <TripCard
        trip={item}
        weather={null}
        traffic={null}
        modes={signatureModes(item)}
        onPress={() => router.push(`/(tabs)/(history)/trip/${item.id}`)}
        testID={`trip-${item.id}`}
      />
    ),
    [router, signatureModes],
  );

  return (
    <ScreenList
      title="History"
      subtitle={`${trips.length} trip${trips.length === 1 ? '' : 's'}${aggregate === null ? '' : ` · ${formatPercent(aggregate.onTimeRate)} on time`}`}
      data={trips}
      keyExtractor={(trip) => trip.id}
      renderItem={renderItem}
      isLoading={tripsQuery.isLoading}
      onEndReached={() => setLimit((current) => current + PAGE_SIZE)}
      listHeader={
        <View style={styles.header}>
          <View style={styles.filterRow}>
            {DATE_RANGES.map((range) => (
              <Chip
                key={range.value}
                label={range.label}
                variant="filter"
                selected={filters.range === range.value}
                onPress={() => setRange(range.value)}
              />
            ))}
          </View>

          <View style={styles.filterRow}>
            {ON_TIME_FILTERS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                variant="filter"
                selected={filters.onTime === option.value}
                onPress={() => setOnTime(option.value)}
              />
            ))}
          </View>

          {(templates.data ?? []).length > 1 ? (
            <View style={styles.filterRow}>
              <Chip
                label="Every commute"
                variant="filter"
                selected={filters.templateId === null}
                onPress={() => setTemplate(null)}
              />
              {(templates.data ?? []).map((template) => (
                <Chip
                  key={template.id}
                  label={template.name}
                  variant="filter"
                  selected={filters.templateId === template.id}
                  onPress={() => setTemplate(template.id)}
                />
              ))}
            </View>
          ) : null}

          {isFiltered ? (
            <Button label="Clear filters" variant="text" size="small" onPress={reset} />
          ) : null}

          {tripsQuery.isLoading ? (
            <View style={styles.filterRow}>
              <Skeleton width={72} height={32} radius={8} />
              <Skeleton width={88} height={32} radius={8} />
            </View>
          ) : null}
        </View>
      }
      listFooter={
        trips.length > 0 && trips.length < (tripsQuery.data?.length ?? 0) + PAGE_SIZE ? (
          <Text style={[type.labelSmall, styles.tail, { color: colors.onSurfaceVariant }]}>
            {`${trips.length} shown`}
          </Text>
        ) : null
      }
      emptyIcon="history"
      emptyTitle={isFiltered ? 'No trips match' : 'No trips yet'}
      emptyDescription={
        isFiltered
          ? 'No commutes match these filters. Try widening the date range.'
          : 'Log your first commute from the Today tab and it will appear here, with the delay and the reasons behind it.'
      }
      emptyActionLabel={isFiltered ? 'Clear filters' : undefined}
      onEmptyAction={isFiltered ? reset : undefined}
    />
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tail: {
    paddingHorizontal: 20,
    paddingTop: 12,
    textAlign: 'center',
  },
});
