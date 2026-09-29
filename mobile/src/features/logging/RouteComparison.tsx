/**
 * RouteComparison: every candidate route, side by side.
 *
 * The point of this sheet is to make the trade-off visible. Reach recommends
 * one route, and a user who has never seen the others reasonably wonders why.
 * Showing speed *and* predictability together is what turns "trust the app"
 * into "I understand the app" — the faster route is often visibly worse on the
 * P90, and that is the whole argument for the recommendation.
 *
 * Alternatives are never hidden, including when there are none.
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/src/store/theme';
import { Badge, Button, Icon, RoutePill } from '@/src/components/ui';
import { formatDurationLabel, routeTransferLabel } from '@/src/engine/routePresentation';
import { type RouteCandidate } from '@/src/types/schemas';
import { type RoutePath } from '@/src/engine/graph';

/** Props for {@link RouteComparison}. */
export interface RouteComparisonProps {
  /** How many places the commute runs through, for the closing note. */
  readonly stopCount: number;
  /** Candidates paired with the enumerated path that produced them. */
  readonly options: readonly { candidate: RouteCandidate; path: RoutePath }[];
  readonly selectedSignature: string;
  /** True when the current pick is the engine's recommendation. */
  readonly selectedIsRecommended: boolean;
  readonly onSelect: (signature: string) => void;
  readonly onUseRecommended: () => void;
  readonly onClose: () => void;
  /** Real trip counts per signature, when history exists. */
  readonly observations?: ReadonlyMap<string, number>;
}

export function RouteComparison({
  stopCount,
  options,
  selectedSignature,
  selectedIsRecommended,
  onSelect,
  onUseRecommended,
  onClose,
  observations,
}: RouteComparisonProps) {
  const { colors, type, shape } = useTheme();

  const recommended = options.find((option) => option.candidate.isRecommended)?.candidate.signature;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[type.titleMedium, { color: colors.onSurface }]}>Choose a route</Text>
          <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
            Faster is not always more reliable. Pick the one you would actually take.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close route choices"
          onPress={onClose}
          hitSlop={10}
          style={styles.closeButton}
        >
          <Icon name="x" size={18} color={colors.onSurfaceVariant} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {options.length === 0 ? (
          <Text style={[type.bodyMedium, { color: colors.onSurfaceVariant }]}>
            No complete route yet. Add a connection in the editor and Reach can compare them.
          </Text>
        ) : null}

        {options.map(({ candidate, path }) => {
          const selected = candidate.signature === selectedSignature;
          const isRecommended = candidate.signature === recommended;
          const count = observations?.get(candidate.signature) ?? 0;
          const fastest = Math.min(...options.map((o) => o.candidate.travelTimeP50Min));
          const mostReliable = Math.max(...options.map((o) => o.candidate.reliabilityScore));

          return (
            <Pressable
              key={candidate.signature}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              accessibilityLabel={describeOption(candidate, path, isRecommended)}
              onPress={() => onSelect(candidate.signature)}
              style={[
                styles.option,
                {
                  backgroundColor: selected ? colors.primaryContainer : colors.surfaceContainer,
                  borderColor: selected ? colors.primary : colors.outlineVariant,
                  borderRadius: shape.medium,
                },
              ]}
            >
              <View style={styles.optionTop}>
                <RoutePill
                  modes={path.modes}
                  transfers={candidate.transferCount ?? path.transferCount}
                  compact
                />
                {selected ? (
                  <Icon name="checkCircle" size={20} color={colors.primary} weight="fill" />
                ) : null}
              </View>

              <View style={styles.badgeRow}>
                {isRecommended ? <Badge label="Reach recommends" tone="primary" /> : null}
                {candidate.travelTimeP50Min === fastest && options.length > 1 ? (
                  <Badge label="Fastest" tone="success" />
                ) : null}
                {candidate.reliabilityScore === mostReliable && options.length > 1 ? (
                  <Badge label="Most reliable" tone="success" />
                ) : null}
              </View>

              <View style={styles.metricRow}>
                <Metric label="Typical" value={formatDurationLabel(candidate.travelTimeP50Min)} />
                <Metric
                  label="Worst case"
                  value={formatDurationLabel(candidate.travelTimeP90Min)}
                />
                <Metric
                  label="On time"
                  value={`${Math.round(candidate.onTimeProbability * 100)}%`}
                />
              </View>

              <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
                {`${routeTransferLabel(candidate.transferCount ?? path.transferCount)}` +
                  (count > 0 ? ` · ${count} ${count === 1 ? 'trip' : 'trips'}` : ' · no trips yet')}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {recommended !== undefined && !selectedIsRecommended ? (
        <Button
          label="Use the recommended route"
          variant="tonal"
          fullWidth
          onPress={onUseRecommended}
          accessibilityHint="Switches back to the route Reach thinks is most reliable"
        />
      ) : null}

      <Text style={[type.labelSmall, styles.disclaimer, { color: colors.onSurfaceVariant }]}>
        {`Reach will still learn from whichever route you pick, including one it would not ` +
          `have suggested. Its estimate is based on ${stopCount} ${stopCount === 1 ? 'place' : 'places'} in your route.`}
      </Text>
    </View>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={styles.metric}>
      <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>{label}</Text>
      <Text style={[type.titleMedium, { color: colors.onSurface }]}>{value}</Text>
    </View>
  );
}

/** Screen-reader sentence for one option. */
function describeOption(
  candidate: RouteCandidate,
  path: RoutePath,
  isRecommended: boolean,
): string {
  return (
    `${isRecommended ? 'Recommended. ' : ''}` +
    `${path.modes.length} legs, ` +
    `${routeTransferLabel(candidate.transferCount ?? path.transferCount)}. ` +
    `Usually ${Math.round(candidate.travelTimeP50Min)} minutes, ` +
    `worst case ${Math.round(candidate.travelTimeP90Min)} minutes, ` +
    `${Math.round(candidate.onTimeProbability * 100)} percent on time.`
  );
}

const styles = StyleSheet.create({
  container: { gap: 12, padding: 20 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  headerText: { flex: 1, gap: 2 },
  closeButton: { padding: 6 },
  list: { gap: 8, paddingBottom: 4 },
  option: { padding: 12, gap: 8, borderWidth: 1, minHeight: 48 },
  optionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metricRow: { flexDirection: 'row', gap: 16 },
  metric: { gap: 1 },
  disclaimer: { marginTop: 2 },
});
