import { useMemo, useState } from 'react';
import { Modal, Text, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { RecommendationCard } from '@/src/features/logging/RecommendationCard';
import { WhyThisRouteCard } from '@/src/features/logging/WhyThisRouteCard';
import { FirstRunCard } from '@/src/features/logging/FirstRunCard';
import { RouteComparison } from '@/src/features/logging/RouteComparison';
import { CommuteSwitcher, CommuteSwitcherButton } from '@/src/features/logging/CommuteSwitcher';
import { historyDepth, historyDepthSentence } from '@/src/engine/historyDepth';
import { formatDate } from '@/src/utils/time';
import { useNow } from '@/src/hooks/useNow';

export default function TodayScreen() {
  const { colors, type } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const today = useTodayTrip();
  const now = useNow();
  const [compareOpen, setCompareOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const hasTemplate = today.templateId !== null;
  const hasPrediction = today.prediction !== null && today.path !== null;

  // Real trips behind the route in use, so the hero card can say whether its
  // numbers were measured or modelled. Read from the matching candidate rather
  // than recomputed, because the engine already counted it.
  const activeObservations = useMemo(() => {
    if (today.prediction === null || today.path === null) return 0;
    return (
      today.prediction.candidates.find((c) => c.signature === today.path?.signature)
        ?.observedTrips ?? 0
    );
  }, [today.prediction, today.path]);

  const compareOptions = useMemo(() => {
    if (today.prediction === null || today.path === null) return [];
    return today.prediction.candidates
      .map((candidate) => ({
        candidate,
        path: today.allPaths.find((p) => p.signature === candidate.signature),
      }))
      .filter(
        (
          entry,
        ): entry is { candidate: typeof entry.candidate; path: NonNullable<typeof entry.path> } =>
          entry.path !== undefined,
      );
  }, [today.prediction, today.allPaths, today.path]);

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
      // The commute name is the control, not a label: switching which commute
      // you are heading for is a decision you make on this screen, every
      // morning, and it was previously impossible without going to Settings.
      headerAction={
        today.sortedCommutes.length > 1 || today.otherCommutesHaveActiveTrip ? (
          <CommuteSwitcherButton name={today.templateName} onPress={() => setSwitcherOpen(true)} />
        ) : undefined
      }
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
                prediction={
                  today.activeForecast === null
                    ? today.prediction.prediction
                    : {
                        ...today.prediction.prediction,
                        leaveBy: today.activeForecast.leaveBy,
                        eta: today.activeForecast.eta,
                        travelTimeP50Min: today.activeForecast.travelTimeP50Min,
                        travelTimeP90Min: today.activeForecast.travelTimeP90Min,
                        onTimeProbability: today.activeForecast.onTimeProbability,
                        reliabilityScore: today.activeForecast.reliabilityScore,
                      }
                }
                path={today.path}
                candidate={
                  today.prediction.candidates.find(
                    (candidate) => candidate.signature === today.path?.signature,
                  ) ?? null
                }
                templateName={today.templateName}
                isManualChoice={today.isRouteOverridden}
                observations={activeObservations}
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

            {compareOptions.length > 1 ? (
              <Button
                label={today.isRouteOverridden ? 'Change route' : 'Choose another route'}
                icon="swap"
                variant="tonal"
                fullWidth
                onPress={() => setCompareOpen(true)}
                accessibilityHint="See every route Reach knows, and pick the one you will take"
              />
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
                observations={activeObservations}
                onCompareRoutes={compareOptions.length > 1 ? () => setCompareOpen(true) : undefined}
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
                hint={historyDepthSentence(historyDepth(activeObservations), activeObservations)}
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
        <CommuteSwitcher
          open={switcherOpen}
          commutes={today.sortedCommutes}
          selectedId={today.templateId}
          activeTripElsewhere={today.otherCommutesHaveActiveTrip}
          onSelect={(id) => {
            today.selectCommute(id);
            setSwitcherOpen(false);
          }}
          onReturnToActiveTrip={() => {
            today.returnToActiveTrip();
            setSwitcherOpen(false);
          }}
          onClose={() => setSwitcherOpen(false)}
          onCreate={() => {
            setSwitcherOpen(false);
            router.push('/(tabs)/(templates)/editor/new');
          }}
        />
      </View>

      <Modal
        visible={compareOpen}
        animationType="slide"
        onRequestClose={() => setCompareOpen(false)}
        transparent
      >
        <View style={[styles.sheetBackdrop, { paddingTop: insets.top }]}>
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surfaceContainerLow,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                paddingBottom: insets.bottom + 8,
              },
            ]}
          >
            {today.prediction !== null && today.path !== null ? (
              <RouteComparison
                stopCount={today.stopCount}
                options={compareOptions}
                selectedSignature={today.path.signature}
                selectedIsRecommended={!today.isRouteOverridden}
                onSelect={(signature) => {
                  today.selectRoute(signature);
                  setCompareOpen(false);
                }}
                onUseRecommended={() => {
                  today.useRecommendedRoute();
                  setCompareOpen(false);
                }}
                onClose={() => setCompareOpen(false)}
                observations={
                  new Map(
                    today.prediction.candidates.map((c) => [c.signature, c.observedTrips ?? 0]),
                  )
                }
              />
            ) : null}
          </View>
        </View>
      </Modal>
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
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    maxHeight: '90%',
    paddingHorizontal: 8,
  },
});
