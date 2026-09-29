/** The one-tap logging surface: the timeline and the primary action. */
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { useTheme } from '@/src/store/theme';
import { Button, Card, ProgressBar, Timeline, type TimelineStep } from '@/src/components/ui';
import { type LoggingStep } from '@/src/features/logging/plan';
import { type TripEvent } from '@/src/types/schemas';
import { formatTime, formatDuration } from '@/src/utils/time';

/** Props for {@link LoggingPanel}. */
export interface LoggingPanelProps {
  readonly steps: readonly LoggingStep[];
  readonly completedCount: number;
  readonly events: readonly TripEvent[];
  readonly nextActionLabel: string | null;
  readonly onConfirm: () => void;
  readonly onUndo: () => void;
  readonly busy: boolean;
  readonly startedAt: number;
  /** Current time, passed in so render stays pure. */
  readonly now: number;
}

/** The live logging panel, shown once a trip is started. */
export function LoggingPanel({
  steps,
  completedCount,
  events,
  nextActionLabel,
  onConfirm,
  onUndo,
  busy,
  startedAt,
  now,
}: LoggingPanelProps) {
  const { colors, type, shape, reducedMotion } = useTheme();

  const timelineSteps = useMemo<TimelineStep[]>(
    () =>
      steps.map((step, index) => {
        const state: TimelineStepState =
          index < completedCount ? 'done' : index === completedCount ? 'current' : 'pending';
        const recorded = events.find((event) => event.label === step.eventLabel);

        // Mapped explicitly rather than spread: `LoggingStep` carries logging
        // fields (`actionLabel`, `kind`, …) that the timeline has no use for,
        // and spreading them would leak them into the view's props.
        return {
          id: step.id,
          label: step.eventLabel,
          state,
          arrivingMode: step.mode ?? undefined,
          serviceLabel: step.toLabel ?? undefined,
          actualMinutes: recorded?.elapsedMinutes,
          detail:
            state === 'current' && step.offersCrowdChoice ? 'Tap to record boarding' : undefined,
        };
      }),
    [steps, completedCount, events],
  );

  const elapsed = Math.max(0, Math.round((now - startedAt) / 60_000));
  const isDone = completedCount >= steps.length;

  return (
    <Animated.View
      entering={reducedMotion ? undefined : FadeIn.duration(240)}
      layout={LinearTransition}
    >
      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[type.titleMedium, { color: colors.onSurface }]}>
              Logging your commute
            </Text>
            <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
              {`Started ${formatTime(startedAt)} · ${formatDuration(elapsed)} elapsed`}
            </Text>
          </View>
          <Button
            label="Undo"
            variant="text"
            size="small"
            icon="undo"
            onPress={onUndo}
            disabled={busy || completedCount === 0}
          />
        </View>

        <ProgressBar
          progress={steps.length > 0 ? completedCount / steps.length : 0}
          accessibilityLabel={`${completedCount} of ${steps.length} steps logged`}
        />

        <Timeline steps={timelineSteps} style={styles.timeline} />

        {isDone ? (
          <View
            style={[
              styles.doneBanner,
              { backgroundColor: colors.successContainer, borderRadius: shape.medium },
            ]}
          >
            <Text style={[type.bodyMedium, { color: colors.onSuccessContainer }]}>
              Commute logged. Your stats will update as soon as the trip closes.
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.actionWrap,
              { backgroundColor: colors.surfaceContainer, borderRadius: shape.large },
            ]}
          >
            {nextActionLabel !== null ? (
              <Button
                label={nextActionLabel}
                onPress={onConfirm}
                size="large"
                fullWidth
                loading={busy}
                accessibilityHint="Records this event with the current time"
              />
            ) : null}
          </View>
        )}
      </Card>
    </Animated.View>
  );
}

type TimelineStepState = 'pending' | 'current' | 'done';

const styles = StyleSheet.create({
  card: {
    gap: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  timeline: {
    marginTop: 4,
  },
  actionWrap: {
    padding: 10,
  },
  doneBanner: {
    padding: 12,
  },
});
