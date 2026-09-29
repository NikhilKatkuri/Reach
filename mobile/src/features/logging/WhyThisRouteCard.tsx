/**
 * "Why this route": the reasoning behind the recommendation.
 *
 * Structured so the *facts* lead and any generated prose is subordinate.
 *
 * That ordering is a product decision, not a stylistic one. Every number in
 * the fact list is computed on device from the user's own history and can be
 * checked; a sentence of model-written English cannot. Putting the checkable
 * content first means the card is genuinely explainable with the AI adapter
 * switched off entirely — which it must be, since the adapter is optional and
 * may be failing, rate-limited or unset.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/src/store/theme';
import { Badge, Card, Icon } from '@/src/components/ui';
import { explainRecommendation, type ExplanationResult } from '@/src/services/ai';
import { useSettings } from '@/src/hooks/useSettings';
import { type Prediction, type ReliabilityFactor, type RouteCandidate } from '@/src/types/schemas';
import { type RoutePath } from '@/src/engine/graph';
import {
  formatDurationLabel,
  routeTransferLabel,
  transferCountFor,
} from '@/src/engine/routePresentation';
import {
  historyDepth,
  historyDepthLabel,
  historyDepthSentence,
  isPersonalised,
  tripsUntilNextBand,
} from '@/src/engine/historyDepth';
import { formatTime } from '@/src/utils/time';
import { round } from '@/src/utils/math';

/** Icon for each factor key. */
const FACTOR_ICONS = {
  punctuality: 'checkCircle',
  variance: 'chartLine',
  traffic: 'traffic',
  weather: 'cloudRain',
  crowd: 'users',
  transfers: 'swap',
} as const;

/** Props for {@link WhyThisRouteCard}. */
export interface WhyThisRouteCardProps {
  readonly factors: readonly ReliabilityFactor[];
  readonly candidates: readonly RouteCandidate[];
  readonly path: RoutePath;
  readonly destinationName: string;
  readonly prediction: Prediction;
  /** Real trips logged for the route in use. */
  readonly observations?: number;
  /** Opens the full alternative list. */
  readonly onCompareRoutes?: () => void;
}

export function WhyThisRouteCard({
  factors,
  candidates,
  path,
  destinationName,
  prediction,
  observations = 0,
  onCompareRoutes,
}: WhyThisRouteCardProps) {
  const { colors, type, shape } = useTheme();
  const { settings } = useSettings();
  const [detailsOpen, setDetailsOpen] = useState(false);

  const depth = historyDepth(observations);
  const alternatives = useMemo(
    () => candidates.filter((candidate) => !candidate.isRecommended),
    [candidates],
  );

  const { leaveBy, targetArrivalAt, travelTimeP90Min, travelTimeP50Min, onTimeProbability } =
    prediction;

  const transferCount = transferCountFor(path, candidates.find((c) => c.isRecommended) ?? null);
  const nextBand = tripsUntilNextBand(observations);

  /*
   * The AI sentence is fetched through the query layer rather than local state
   * in an effect: caching, deduplication and a failure path come for free, and
   * a changed recommendation re-runs the fetch without a cascading render.
   */
  const explanationQuery = useQuery({
    queryKey: [
      'explanation',
      settings.aiExplanationsEnabled,
      settings.geminiApiKey.length > 0,
      prediction.templateId,
      prediction.recommendedSignature,
      prediction.travelTimeP90Min,
      onTimeProbability,
    ],
    queryFn: () =>
      explainRecommendation(
        { prediction, candidates, factors, destinationName },
        { enabled: settings.aiExplanationsEnabled, apiKey: settings.geminiApiKey },
      ),
    staleTime: 5 * 60_000,
  });

  const explanation: ExplanationResult | null = explanationQuery.data ?? null;

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={[type.titleMedium, { color: colors.onSurface }]}>Why this route</Text>
        <Badge
          label={historyDepthLabel(depth)}
          tone={isPersonalised(depth) ? 'primary' : 'neutral'}
        />
      </View>

      {/*
        The data-depth statement comes before the numbers, because it changes
        how every number below should be read. Showing "91% on time" before
        saying "you have logged zero trips" would be the misleading order.
      */}
      <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
        {historyDepthSentence(depth, observations)}
      </Text>

      <View
        style={[
          styles.facts,
          { backgroundColor: colors.surfaceContainer, borderRadius: shape.medium },
        ]}
      >
        {observations > 0 ? (
          <Fact
            line={`${observations} previous ${observations === 1 ? 'trip' : 'trips'} on this route.`}
          />
        ) : null}
        <Fact
          line={
            observations > 0
              ? `Median travel time is ${formatDurationLabel(travelTimeP50Min)}.`
              : `There is no history for this route yet, so ${formatDurationLabel(travelTimeP50Min)} is the time from the legs you entered, not a measurement.`
          }
        />
        <Fact
          line={
            observations > 0
              ? `Nine times in ten it finishes within ${formatDurationLabel(travelTimeP90Min)}.`
              : `The worst case is modelled as ${formatDurationLabel(travelTimeP90Min)}, based on typical variation for these legs.`
          }
        />
        <Fact line={`It arrives on time ${Math.round(onTimeProbability * 100)}% of the time.`} />
        {transferCount > 0 ? (
          <Fact
            line={
              `One transfer${transferCount > 1 ? ` — ${transferCount} in total` : ''} ` +
              'adds extra variability, because a connection can go wrong.'
            }
          />
        ) : (
          <Fact line="No transfers, so nothing here depends on catching a connection." />
        )}
        {factors
          .filter((factor) => factor.impact < 0)
          .map((factor) => (
            <Fact key={factor.key} line={factor.detail} />
          ))}
      </View>

      {/*
        The generated sentence is an optional extra, clearly marked as such. A
        model failure falls back to silence rather than an error, because the
        facts above already stand on their own.
      */}
      {explanation !== null && !explanationQuery.isError ? (
        <View style={styles.generated}>
          <Badge label={explanation.isOffline ? 'On device' : 'Written by Gemini'} tone="neutral" />
          <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
            {explanation.text}
          </Text>
        </View>
      ) : null}

      {alternatives.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Compare ${alternatives.length} other ${alternatives.length === 1 ? 'route' : 'routes'}`}
          onPress={onCompareRoutes}
          disabled={onCompareRoutes === undefined}
          style={[styles.altHeader, { borderTopColor: colors.outlineVariant }]}
        >
          <Text style={[type.titleSmall, { color: colors.onSurface }]}>
            {`${alternatives.length} other ${alternatives.length === 1 ? 'route' : 'routes'} available`}
          </Text>
          {onCompareRoutes !== undefined ? (
            <Icon name="caretRight" size={16} color={colors.onSurfaceVariant} />
          ) : null}
        </Pressable>
      ) : null}

      {/* The percentile spread is detail, not headline. */}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: detailsOpen }}
        accessibilityLabel={detailsOpen ? 'Hide the full numbers' : 'Show the full numbers'}
        onPress={() => setDetailsOpen((open) => !open)}
        style={[styles.detailsToggle, { borderTopColor: colors.outlineVariant }]}
      >
        <Text style={[type.labelLarge, { color: colors.primary }]}>
          {detailsOpen ? 'Hide the full numbers' : 'Show the full numbers'}
        </Text>
        <Icon name={detailsOpen ? 'caretUp' : 'caretDown'} size={14} color={colors.primary} />
      </Pressable>

      {detailsOpen ? (
        <View style={styles.details}>
          {factors.map((factor) => (
            <View key={factor.key} style={styles.factorRow}>
              <Icon
                name={FACTOR_ICONS[factor.key]}
                size={16}
                color={factor.impact >= 0 ? colors.success : colors.warning}
              />
              <Text
                style={[type.bodySmall, styles.factorDetail, { color: colors.onSurfaceVariant }]}
              >
                {factor.detail}
              </Text>
              <Text
                style={[
                  type.labelMedium,
                  { color: factor.impact >= 0 ? colors.success : colors.warning },
                ]}
              >
                {factor.impact >= 0 ? '+' : ''}
                {round(factor.impact, 1)}
              </Text>
            </View>
          ))}

          <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
            {`Leave by ${formatTime(leaveBy)} to arrive by ${formatTime(targetArrivalAt)} · ` +
              `${routeTransferLabel(transferCount)} · ` +
              `reliability ${Math.round(prediction.reliabilityScore)}/100`}
          </Text>

          {nextBand !== null ? (
            <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
              {`${Math.max(0, nextBand.count - observations)} more ` +
                `${nextBand.count - observations === 1 ? 'trip' : 'trips'} and Reach can ` +
                `${nextBand.label.toLowerCase()}.`}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

/** One bullet of the factual explanation. */
function Fact({ line }: { readonly line: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={styles.fact}>
      <Icon name="check" size={12} color={colors.success} weight="bold" />
      <Text style={[type.bodySmall, styles.factText, { color: colors.onSurfaceVariant }]}>
        {line}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  facts: { padding: 12, gap: 8 },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  factText: { flex: 1 },
  generated: { gap: 6, alignItems: 'flex-start' },
  altHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  details: { gap: 8 },
  factorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  factorDetail: { flex: 1 },
});
