/** Today's commute: prediction, active trip and one-tap logging. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  appendEvent,
  buildHistoryInput,
  getActiveTrip,
  insertTripBundle,
  refreshRouteEdgeStats,
  undoLastEvent,
  upsertTrip,
} from '@/src/db/queries';
import { type PredictionResult, predict } from '@/src/engine/prediction';
import { enumerateRoutes, buildGraph, type RoutePath } from '@/src/engine/graph';
import { buildLoggingPlan, buildPendingEvent, computeProgress, type LoggingStep } from './plan';
import { useSettings } from '@/src/hooks/useSettings';
import { useTemplates, useTemplateGraph } from '@/src/hooks/useTrips';
import { queryKeys } from '@/src/store/queryClient';
import { tapHeavy, tapLight, tapMedium, notifySuccess, notifyWarning } from '@/src/lib/haptics';
import { uuid } from '@/src/lib/uuid';
import { atLocalTime, startOfDay } from '@/src/utils/time';
import { round } from '@/src/utils/math';
import {
  type CrowdLevel,
  type Segment,
  type TrafficLevel,
  type TransportMode,
  type Trip,
  type TripEvent,
  type WeatherCondition,
} from '@/src/types/schemas';

/** How many days of history the engine considers. */
export const HISTORY_WINDOW_DAYS = 60;

/** Conditions the user has set for today. */
export interface TodayConditions {
  readonly weather: WeatherCondition;
  readonly traffic: TrafficLevel;
  readonly crowdLevel: CrowdLevel;
}

/** The complete Today screen model. */
export interface TodayModel {
  readonly templateId: string | null;
  readonly templateName: string;
  readonly destinationName: string;
  /** Recommended route, or `null` when the template is incomplete. */
  readonly path: RoutePath | null;
  readonly prediction: PredictionResult | null;
  readonly conditions: TodayConditions;
  readonly targetArrivalAt: number;
  readonly activeTrip: Trip | null;
  readonly events: readonly TripEvent[];
  /** Ordered one-tap prompts for the recommended route. */
  readonly plan: readonly LoggingStep[];
  /** The next tap the user should make, or `null` when nothing is active. */
  readonly nextActionLabel: string | null;
  readonly loggingProgress: number;
  readonly isLoading: boolean;
  readonly error: string | null;
}

/** Derives the default target arrival time from a template's name/history. */
function deriveTargetArrival(now: number, name: string): number {
  // Templates are created in the morning, so the default target is the next
  // weekday's 9:05 AM. Users adjust it from the Today screen.
  void name;
  const tomorrow = new Date(startOfDay(now) + 86_400_000);
  return atLocalTime(tomorrow.getTime(), 9, 5);
}

/** Picks the template the Today screen should show. */
function pickDefaultTemplate<T extends { isDefault: boolean; name: string }>(
  templates: readonly T[],
): T | null {
  if (templates.length === 0) return null;
  return templates.find((template) => template.isDefault) ?? templates[0] ?? null;
}

/**
 * Drives the Today screen.
 *
 * Owns three concerns that are tightly coupled and would otherwise be tangled
 * in the screen: which template is active, what the engine recommends, and
 * what the next logging tap does. Screens stay declarative.
 */
export function useTodayTrip(): TodayModel & {
  readonly setWeather: (condition: WeatherCondition) => void;
  readonly setTraffic: (level: TrafficLevel) => void;
  readonly setCrowd: (level: CrowdLevel) => void;
  readonly confirmNextStep: () => void;
  readonly undoLast: () => void;
  readonly startTrip: () => void;
  readonly abandonTrip: () => void;
  readonly isMutating: boolean;
  readonly targetArrivalAt: number;
  readonly setTargetArrivalAt: (timestamp: number) => void;
} {
  const queryClient = useQueryClient();
  const { settings } = useSettings();

  const [now, setNow] = useState(() => Date.now());
  const [targetArrivalAt, setTargetArrivalAt] = useState<number | null>(null);
  const [weather, setWeather] = useState<WeatherCondition>(settings.defaultWeather);
  const [traffic, setTraffic] = useState<TrafficLevel>(settings.defaultTraffic);
  const [crowd, setCrowd] = useState<CrowdLevel>(2);

  // Tick once a minute so elapsed times and the leave-by countdown stay live.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const templatesQuery = useTemplates();
  const defaultTemplate = useMemo(
    () => pickDefaultTemplate(templatesQuery.data ?? []),
    [templatesQuery.data],
  );

  const templateId = defaultTemplate?.id ?? null;
  const graphQuery = useTemplateGraph(templateId);

  const effectiveTarget = targetArrivalAt ?? deriveTargetArrival(now, defaultTemplate?.name ?? '');

  const predictionQuery = useQuery({
    queryKey: ['prediction', templateId, effectiveTarget, weather, traffic, crowd],
    enabled: graphQuery.data != null,
    queryFn: async (): Promise<PredictionResult | null> => {
      const graphData = graphQuery.data ?? null;
      if (graphData === null) return null;

      const sinceMs = startOfDay(now) - HISTORY_WINDOW_DAYS * 86_400_000;
      const history = await buildHistoryInput({ templateId: graphData.template.id, sinceMs });

      return predict(graphData, {
        now,
        targetArrivalAt: effectiveTarget,
        history,
        conditions: { weather, traffic, crowdLevel: crowd },
      });
    },
  });

  const activeTripQuery = useQuery({
    queryKey: queryKeys.trips.active(),
    queryFn: getActiveTrip,
  });

  const activeTrip = activeTripQuery.data ?? null;

  const eventsQuery = useQuery({
    queryKey: queryKeys.trips.detail(activeTrip?.id ?? 'none'),
    enabled: activeTrip != null,
    queryFn: async () => {
      if (activeTrip == null) return null;
      const { getTripDetail } = await import('@/src/db/queries');
      return getTripDetail(activeTrip.id);
    },
  });

  const events = useMemo(() => eventsQuery.data?.events ?? [], [eventsQuery.data]);

  const graph = useMemo(
    () => (graphQuery.data == null ? null : buildGraph(graphQuery.data)),
    [graphQuery.data],
  );

  const recommendedSignature = predictionQuery.data?.prediction.recommendedSignature ?? '';

  const path = useMemo<RoutePath | null>(() => {
    if (graph === null) return null;
    const routes = enumerateRoutes(graph);
    if (routes.length === 0) return null;
    return routes.find((route) => route.signature === recommendedSignature) ?? routes[0] ?? null;
  }, [graph, recommendedSignature]);

  const loggingPlan = useMemo(() => {
    if (graph === null || path === null) return [];
    return buildLoggingPlan({
      graph: {
        stopsById: graph.stopsById as ReadonlyMap<string, { id: string; name: string }>,
        segmentsById: graph.segmentsById,
      },
      path,
    });
  }, [graph, path]);

  const completedCount = events.filter((event) => !event.undone).length;
  const progress = computeProgress(loggingPlan, completedCount);

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (activeTrip == null || path === null || graph === null) return;
      const next = progress.next;
      if (next === null) return;

      const segment =
        next.segmentId === null
          ? undefined
          : (graph.segmentsById.get(next.segmentId) as Segment | undefined);

      const pending = buildPendingEvent({
        step: next,
        tripStartedAt: activeTrip.startedAt,
        now: Date.now(),
        sortOrder: completedCount,
        expectedMinutes: segment?.expectedDurationMin,
        historicalMeanMinutes: null,
        crowdLevel: next.offersCrowdChoice ? crowd : null,
      });

      const event: TripEvent = {
        id: uuid(),
        tripId: activeTrip.id,
        segmentId: pending.step.segmentId,
        kind: pending.step.kind,
        label: pending.step.eventLabel,
        mode: pending.step.mode,
        fromLabel: pending.step.fromLabel,
        toLabel: pending.step.toLabel,
        occurredAt: pending.occurredAt,
        elapsedMinutes: pending.elapsedMinutes,
        deltaMinutes: pending.deltaMinutes,
        crowdLevel: pending.crowdLevel,
        trafficLevel: traffic,
        isEstimated: pending.step.offersCrowdChoice,
        undone: false,
        sortOrder: pending.sortOrder,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const isFinal = next.isArrival;
      if (isFinal) {
        await insertTripBundle({
          trip: {
            ...activeTrip,
            status: 'completed',
            endedAt: pending.occurredAt,
            actualDurationMin: round((pending.occurredAt - activeTrip.startedAt) / 60_000, 1),
            plannedDurationMin: activeTrip.plannedDurationMin,
            delayMinutes: round(
              (pending.occurredAt - activeTrip.startedAt) / 60_000 -
                (activeTrip.plannedDurationMin ?? 0),
              1,
            ),
            wasOnTime:
              pending.occurredAt <= (activeTrip.targetArrivalAt ?? Number.MAX_SAFE_INTEGER),
            updatedAt: Date.now(),
          },
          events: [event],
          weather: null,
          traffic: null,
        });
        await refreshRouteEdgeStats(activeTrip.templateId);
        return;
      }

      await appendEvent(event);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.templates.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.insights.all });
    },
  });

  const confirmNextStep = useCallback(() => {
    const next = progress.next;
    if (next === null) return;

    if (next.isArrival) {
      notifySuccess();
      tapHeavy();
    } else if (next.kind === 'board') {
      tapMedium();
    } else {
      tapLight();
    }

    // Warn when the user is running late against their own P90.
    if (activeTrip != null) {
      const elapsed = (Date.now() - activeTrip.startedAt) / 60_000;
      const planned = activeTrip.plannedDurationMin ?? 0;
      if (planned > 0 && elapsed > planned) {
        notifyWarning();
      }
    }

    confirmMutation.mutate();
  }, [progress.next, activeTrip, confirmMutation]);

  const undoMutation = useMutation({
    mutationFn: async () => {
      if (activeTrip == null) return;
      const removed = await undoLastEvent(activeTrip.id);
      if (removed == null) return;
      tapLight();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
    },
  });

  const undoLast = useCallback(() => {
    undoMutation.mutate();
  }, [undoMutation]);

  const startMutation = useMutation({
    mutationFn: async () => {
      if (path === null) return;
      const startedAt = Date.now();
      const prediction = predictionQuery.data?.prediction;
      const trip: Trip = {
        id: uuid(),
        templateId: templateId ?? '',
        routeSignature: path.signature,
        legModes: [...path.modes],
        direction: 'outbound',
        status: 'active',
        startedAt,
        endedAt: null,
        targetArrivalAt: effectiveTarget,
        plannedDurationMin: prediction?.travelTimeP50Min ?? null,
        actualDurationMin: null,
        delayMinutes: null,
        onTimeProbability: prediction?.onTimeProbability ?? null,
        reliabilityScore: prediction?.reliabilityScore ?? null,
        wasOnTime: null,
        weatherSnapshotId: null,
        trafficSnapshotId: null,
        note: null,
        createdAt: startedAt,
        updatedAt: startedAt,
      };
      await upsertTrip(trip);
      tapHeavy();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
    },
  });

  const startTrip = useCallback(() => {
    startMutation.mutate();
  }, [startMutation]);

  const abandonMutation = useMutation({
    mutationFn: async () => {
      if (activeTrip == null) return;
      await upsertTrip({ ...activeTrip, status: 'abandoned', updatedAt: Date.now() });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
    },
  });

  const abandonTrip = useCallback(() => {
    abandonMutation.mutate();
  }, [abandonMutation]);

  const isMutating =
    confirmMutation.isPending ||
    undoMutation.isPending ||
    startMutation.isPending ||
    abandonMutation.isPending;

  return {
    templateId,
    templateName: defaultTemplate?.name ?? 'No commute yet',
    destinationName: defaultTemplate?.destinationName ?? '',
    path,
    prediction: predictionQuery.data ?? null,
    conditions: { weather, traffic, crowdLevel: crowd },
    targetArrivalAt: effectiveTarget,
    activeTrip,
    events,
    plan: loggingPlan,
    nextActionLabel: activeTrip === null ? null : (progress.next?.actionLabel ?? null),
    loggingProgress: activeTrip === null ? 0 : progress.progress,
    isLoading: templatesQuery.isLoading || graphQuery.isLoading,
    error: predictionQuery.error?.message ?? null,
    setWeather,
    setTraffic,
    setCrowd,
    confirmNextStep,
    undoLast,
    startTrip,
    abandonTrip,
    isMutating,
    setTargetArrivalAt,
  };
}

/** Modes used by the current recommended route, for the RoutePill. */
export function useRecommendedModes(path: RoutePath | null): TransportMode[] {
  return useMemo(() => (path === null ? [] : [...path.modes]), [path]);
}
