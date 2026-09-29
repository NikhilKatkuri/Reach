/** "Why this route" sheet: the scored factors behind the recommendation. */
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '@/src/store/theme';
import { Badge, Card, Icon, RoutePill } from '@/src/components/ui';
import { explainRecommendation, type ExplanationResult } from '@/src/services/ai';
import { useSettings } from '@/src/hooks/useSettings';
import { type Prediction, type ReliabilityFactor, type RouteCandidate } from '@/src/types/schemas';
import { type RoutePath } from '@/src/engine/graph';
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
}

/** Explains the recommendation and lists the alternatives. */
export function WhyThisRouteCard({
  factors,
  candidates,
  path,
  destinationName,
  prediction,
}: WhyThisRouteCardProps) {
  const { colors, type, shape } = useTheme();
  const { settings } = useSettings();

  const { leaveBy, targetArrivalAt, travelTimeP90Min, onTimeProbability } = prediction;

  /**
   * The explanation is fetched through the query layer rather than local
   * state in an effect. That gets caching, deduplication and a retry-free
   * failure path for free, and it means a change to the recommendation
   * re-runs the fetch without a cascading render.
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
    // The answer cannot change while the screen is open.
    staleTime: 5 * 60_000,
  });

  const explanation: ExplanationResult | null = explanationQuery.data ?? null;
  const alternatives = useMemo(
    () => candidates.filter((candidate) => !candidate.isRecommended),
    [candidates],
  );

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={[type.titleMedium, { color: colors.onSurface }]}>Why this route</Text>
        {explanation !== null ? (
          <Badge
            label={explanation.isOffline ? 'On device' : 'Gemini'}
            tone={explanation.isOffline ? 'neutral' : 'primary'}
          />
        ) : null}
      </View>

      <View
        style={[
          styles.explanation,
          {
            backgroundColor: colors.surfaceContainer,
            borderRadius: shape.medium,
          },
        ]}
      >
        <Text style={[type.bodyMedium, { color: colors.onSurfaceVariant }]}>
          {explanation === null
            ? 'Working out why…'
            : explanationQuery.isError
              ? // A model failure must never look like a broken app: the local
                // explanation is the fallback, not an error state.
                explainLocallyFallback(prediction, candidates, factors, destinationName)
              : explanation.text}
        </Text>
      </View>

      <View style={styles.factors}>
        {factors.map((factor) => (
          <View key={factor.key} style={styles.factorRow}>
            <Icon
              name={FACTOR_ICONS[factor.key]}
              size={16}
              color={factor.impact >= 0 ? colors.success : colors.warning}
              weight="regular"
            />
            <Text style={[type.bodySmall, styles.factorDetail, { color: colors.onSurfaceVariant }]}>
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
      </View>

      {alternatives.length > 0 ? (
        <View style={styles.alternatives}>
          <Text style={[type.titleSmall, { color: colors.onSurface }]}>
            {`Other options (${alternatives.length})`}
          </Text>
          {alternatives.map((candidate) => (
            <View key={candidate.signature} style={styles.alternativeRow}>
              <View style={styles.alternativeText}>
                <Text numberOfLines={1} style={[type.bodyMedium, { color: colors.onSurface }]}>
                  {candidate.label}
                </Text>
                <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
                  {`${Math.round(candidate.travelTimeP50Min)} min typical · ` +
                    `${Math.round(candidate.onTimeProbability * 100)}% on time`}
                </Text>
              </View>
              <RoutePill
                modes={[]}
                compact
                durationMinutes={candidate.travelTimeP90Min}
                accessibilityLabel={`${candidate.label}, P90 ${candidate.travelTimeP90Min} minutes`}
              />
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.footer}>
        <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
          {`Leave by ${formatTime(leaveBy)} for ${formatTime(targetArrivalAt)} · ` +
            `P90 ${Math.round(travelTimeP90Min)} min`}
        </Text>
      </View>
    </Card>
  );
}

/** Last-resort explanation used only if even the local adapter throws. */
function explainLocallyFallback(
  prediction: Prediction,
  candidates: readonly RouteCandidate[],
  factors: readonly ReliabilityFactor[],
  destinationName: string,
): string {
  const recommended = candidates.find((candidate) => candidate.isRecommended);
  const onTime = Math.round(prediction.onTimeProbability * 100);
  return (
    `Take the ${recommended?.label ?? 'recommended route'} to ${destinationName}. ` +
    `It usually takes ${Math.round(prediction.travelTimeP50Min)} min and arrives on time ` +
    `${onTime}% of the time, scored ${Math.round(prediction.reliabilityScore)}/100.`
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  explanation: {
    padding: 12,
  },
  factors: {
    gap: 8,
  },
  factorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  factorDetail: {
    flex: 1,
  },
  alternatives: {
    gap: 8,
  },
  alternativeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  alternativeText: {
    flex: 1,
  },
  footer: {
    marginTop: 2,
  },
});
