import { Text, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/src/store/theme';
import {
  Button,
  Card,
  HeroCardSkeleton,
  ListSkeleton,
  ScreenContainer,
  StatCard,
  StatRowSkeleton,
} from '@/src/components/ui';
import { useTodayTrip } from '@/src/features/logging/useTodayTrip';
import { ConditionChips } from '@/src/features/logging/ConditionChips';
import { LoggingPanel } from '@/src/features/logging/LoggingPanel';
import { RecommendationCard, DurationSpreadRow } from '@/src/features/logging/RecommendationCard';
import { WhyThisRouteCard } from '@/src/features/logging/WhyThisRouteCard';
import { FirstRunCard } from '@/src/features/logging/FirstRunCard';
import { formatDate } from '@/src/utils/time';
import { useNow } from '@/src/hooks/useNow';

export default function TodayScreen() {
  const { colors, type } = useTheme();
  const router = useRouter();
  const today = useTodayTrip();
  const now = useNow();

  const hasTemplate = today.templateId !== null;
  const hasPrediction = today.prediction !== null && today.path !== null;

  // First run: explain the product and offer the one action that matters.
  // Nothing else on this screen is useful yet, so nothing else is shown.
  if (!today.isLoading && !hasTemplate) {
    return (
      <ScreenContainer
        title="Today"
        eyebrow={formatDate(now)}
        applyTopInset={false}
        bottomInset={24}
      >
        <FirstRunCard onCreateTemplate={() => router.push('/(tabs)/(templates)/editor/new')} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      title="Today"
      eyebrow={formatDate(now)}
      subtitle={today.destinationName === '' ? undefined : `To ${today.destinationName}`}
      applyTopInset={false}
      footer={
        today.activeTrip === null ? (
          <Button
            label="Start commute"
            size="large"
            fullWidth
            icon="play"
            onPress={today.startTrip}
            disabled={today.path === null || today.isMutating}
            accessibilityHint="Begins one-tap logging for this commute"
          />
        ) : undefined
      }
    >
      <View style={styles.stack}>
        {/* Loading: mirror the real layout so nothing jumps when data lands. */}
        {today.isLoading ? (
          <>
            <HeroCardSkeleton />
            <StatRowSkeleton />
            <ListSkeleton count={2} />
          </>
        ) : (
          <>
            {hasPrediction && today.prediction !== null && today.path !== null ? (
              <RecommendationCard
                prediction={today.prediction.prediction}
                path={today.path}
                candidate={
                  today.prediction.candidates.find((candidate) => candidate.isRecommended) ?? null
                }
                templateName={today.templateName}
                slowerThanFastest={
                  today.prediction.prediction.travelTimeP50Min >
                  today.prediction.prediction.fastestDurationMin + 1
                }
                tradeoffMinutes={Math.max(
                  0,
                  today.prediction.prediction.travelTimeP50Min -
                    today.prediction.prediction.fastestDurationMin,
                )}
              />
            ) : null}

            {today.prediction !== null ? (
              <DurationSpreadRow prediction={today.prediction.prediction} />
            ) : null}

            {today.activeTrip !== null ? (
              <LoggingPanel
                steps={today.plan}
                completedCount={today.events.filter((event) => !event.undone).length}
                events={today.events}
                nextActionLabel={today.nextActionLabel}
                onConfirm={today.confirmNextStep}
                onUndo={today.undoLast}
                busy={today.isMutating}
                startedAt={today.activeTrip.startedAt}
                now={now}
              />
            ) : null}

            {hasPrediction && today.prediction !== null && today.path !== null ? (
              <WhyThisRouteCard
                factors={today.prediction.factors}
                candidates={today.prediction.candidates}
                path={today.path}
                destinationName={today.destinationName || 'your destination'}
                prediction={today.prediction.prediction}
              />
            ) : null}

            <View style={styles.statRow}>
              <StatCard
                label="Confidence"
                value={String(
                  today.prediction === null
                    ? 0
                    : Math.round(today.prediction.prediction.confidence * 100),
                )}
                unit="%"
                hint={
                  today.prediction === null
                    ? 'No trips logged yet'
                    : today.prediction.isLowConfidence
                      ? 'Log a few trips for a sharper estimate'
                      : 'How much history backs this'
                }
                icon="database"
              />
              <StatCard
                label="Buffer"
                value={String(today.prediction?.prediction.suggestedBufferMin ?? 0)}
                unit="min"
                hint="Recommended slack on top of the P90"
                icon="clock"
                tone="primary"
              />
            </View>
          </>
        )}

        {/* Conditions are useful even with no prediction, so they stay put. */}
        {today.isLoading ? null : (
          <Card>
            <Text style={[type.titleMedium, styles.sectionTitle, { color: colors.onSurface }]}>
              Conditions
            </Text>
            <Text style={[type.bodySmall, styles.sectionHint, { color: colors.onSurfaceVariant }]}>
              Reach has no weather feed. Tell it what it is like out there and the prediction
              updates.
            </Text>
            <ConditionChips
              conditions={today.conditions}
              onWeather={today.setWeather}
              onTraffic={today.setTraffic}
              onCrowd={today.setCrowd}
            />
          </Card>
        )}

        {/* A template exists but has no complete route yet. */}
        {today.isLoading || hasPrediction ? null : (
          <Card variant="outlined">
            <Text style={[type.titleMedium, { color: colors.onSurface }]}>
              This commute needs a route
            </Text>
            <Text style={[type.bodySmall, styles.sectionHint, { color: colors.onSurfaceVariant }]}>
              Reach could not find a path from your first stop to your last one. Open the template
              builder and check that every leg connects to the next.
            </Text>
            <Button
              label="Open the builder"
              icon="pencilSimple"
              variant="tonal"
              onPress={() => router.push('/(tabs)/(templates)')}
            />
          </Card>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 16,
  },
  sectionTitle: {
    marginBottom: 4,
  },
  sectionHint: {
    marginBottom: 12,
  },
  statRow: {
    flexDirection: 'row',
    gap: 12,
  },
});
