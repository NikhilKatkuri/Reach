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

/**
 * The numbers the hero card shows.
 *
 * Split out from `Prediction` because a manually chosen route must show *its*
 * figures, not the recommended route's. The engine already scores every
 * candidate, so this is a lookup rather than a second simulation.
 */
export interface ActiveForecast {
  readonly signature: string;
  readonly travelTimeP50Min: number;
  readonly travelTimeP90Min: number;
  readonly onTimeProbability: number;
  readonly reliabilityScore: number;
  readonly leaveBy: number;
  readonly eta: number;
  readonly isRecommended: boolean;
}

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
  /** Every saved commute, for the picker. */
  readonly commutes: readonly { id: string; name: string; destination: string }[];
  /** Commutes in creation order, for the picker. */
  readonly sortedCommutes: readonly { id: string; name: string; destination: string }[];
  /** Where a trip was left in progress, so the choice can survive a restart. */
  readonly otherCommutesHaveActiveTrip: boolean;
  /** The route actually in use: the manual pick if there is one, else the
   *  engine's recommendation. `null` when the template is incomplete. */
  readonly path: RoutePath | null;
  /** The engine's own pick, regardless of any manual override. */
  readonly recommendedPath: RoutePath | null;
  /** Every route Reach can take, for the comparison sheet. */
  readonly allPaths: readonly RoutePath[];
  /** Places in the active graph, for copy about the route's shape. */
  readonly stopCount: number;
  /** True when the user has overridden the recommendation. */
  readonly isRouteOverridden: boolean;
  /** Scores for whichever route is in use, recomputed for a manual pick. */
  readonly activeForecast: ActiveForecast | null;
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
  /** Picks a route for this trip by signature. */
  readonly selectRoute: (signature: string) => void;
  /** Drops any manual pick and returns to the engine's recommendation. */
  readonly useRecommendedRoute: () => void;
  /** Switches which commute Today is about. */
  readonly selectCommute: (templateId: string) => void;
  /** Puts an in-progress trip back in view. */
  readonly returnToActiveTrip: () => void;
} {
  const queryClient = useQueryClient();
  const { settings } = useSettings();

  const [now, setNow] = useState(() => Date.now());
  const [targetArrivalAt, setTargetArrivalAt] = useState<number | null>(null);
  // A manual route pick, scoped to this visit. Not persisted: it describes
  // "what I am doing right now", not a preference, and persisting it would
  // mean tomorrow's commute silently reused today's detour.
  const [routeOverride, setRouteOverride] = useState<string | null>(null);
  // Which commute Today is showing. Null means "whichever is the default",
  // which is the behaviour when the user has not chosen.
  const [chosenTemplateId, setChosenTemplateId] = useState<string | null>(null);
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

  const activeTripQuery = useQuery({
    queryKey: queryKeys.trips.active(),
    queryFn: getActiveTrip,
  });
  const activeTrip = activeTripQuery.data ?? null;

  /*
   * Which commute to show.
   *
   * An in-progress trip wins over everything else. A user who is halfway
   * through logging a journey and is shown a different commute's prediction
   * would have to hunt for the trip they were logging, and could easily start
   * the same journey twice. Everything else is the user's explicit choice, then
   * the default, then the first.
   */
  const templateId = useMemo(() => {
    if (activeTrip !== null) return activeTrip.templateId;
    if (chosenTemplateId !== null) return chosenTemplateId;

    const all = templatesQuery.data ?? [];
    if (all.length === 0) return null;
    if (all.some((template) => template.id === chosenTemplateId)) return chosenTemplateId;
    return pickDefaultTemplate(all)?.id ?? null;
  }, [activeTrip, chosenTemplateId, templatesQuery.data]);

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

  const commutes = useMemo(
    () =>
      (templatesQuery.data ?? []).map((template) => ({
        id: template.id,
        name: template.name,
        destination: template.destinationName,
      })),
    [templatesQuery.data],
  );

  const allPaths = useMemo<readonly RoutePath[]>(
    () => (graph === null ? [] : enumerateRoutes(graph)),
    [graph],
  );

  const recommendedPath = useMemo<RoutePath | null>(() => {
    if (allPaths.length === 0) return null;
    return (
      allPaths.find((route) => route.signature === recommendedSignature) ?? allPaths[0] ?? null
    );
  }, [allPaths, recommendedSignature]);

  const path = useMemo<RoutePath | null>(() => {
    if (recommendedPath === null) return null;
    // An override only counts if the route still exists. Editing the graph can
    // remove it, and silently logging the wrong route would be much worse than
    // falling back to the recommendation.
    if (routeOverride !== null) {
      const chosen = allPaths.find((route) => route.signature === routeOverride);
      if (chosen !== undefined) return chosen;
    }
    return recommendedPath;
  }, [allPaths, recommendedPath, routeOverride]);

  /**
   * Figures for whichever route is in use.
   *
   * For the recommendation this is the engine's prediction verbatim. For a
   * manual pick it is the matching candidate, with leave-by and ETA derived the
   * same way the engine derives them — from that route's own P90 and P50 — so
   * the numbers stay internally consistent rather than mixing a route's
   * durations with another route's clock times.
   */
  const activeForecast = useMemo<ActiveForecast | null>(() => {
    // The query's type is `PredictionResult | null | undefined` — the undefined
    // covers "not loaded yet", which a `=== null` check would miss.
    const result = predictionQuery.data;
    if (path === null || result == null) return null;

    const recommended = result.prediction;

    if (path.signature === recommendedSignature) {
      return {
        signature: path.signature,
        travelTimeP50Min: recommended.travelTimeP50Min,
        travelTimeP90Min: recommended.travelTimeP90Min,
        onTimeProbability: recommended.onTimeProbability,
        reliabilityScore: recommended.reliabilityScore,
        leaveBy: recommended.leaveBy,
        eta: recommended.eta,
        isRecommended: true,
      };
    }

    const candidate = result.candidates.find((option) => option.signature === path.signature);
    if (candidate === undefined) return null;

    return {
      signature: candidate.signature,
      travelTimeP50Min: candidate.travelTimeP50Min,
      travelTimeP90Min: candidate.travelTimeP90Min,
      onTimeProbability: candidate.onTimeProbability,
      reliabilityScore: candidate.reliabilityScore,
      // Same derivation the engine uses: leave by is the target minus this
      // route's P90, and the ETA is now plus its P50. Deriving them from the
      // same route's own numbers is what keeps the three displayed times
      // consistent with each other.
      leaveBy: recommended.targetArrivalAt - candidate.travelTimeP90Min * 60_000,
      eta: now + candidate.travelTimeP50Min * 60_000,
      isRecommended: false,
    };
  }, [now, path, predictionQuery.data, recommendedSignature]);

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
      // Record the route actually being taken, plus the forecast for *that*
      // route. Writing the recommended route's numbers onto a trip the user
      // chose differently would poison the statistics Reach learns from.
      const forecast = activeForecast;
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
        plannedDurationMin: forecast?.travelTimeP50Min ?? null,
        actualDurationMin: null,
        delayMinutes: null,
        onTimeProbability: forecast?.onTimeProbability ?? null,
        reliabilityScore: forecast?.reliabilityScore ?? null,
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

  const selectRoute = useCallback((signature: string) => {
    setRouteOverride(signature);
  }, []);

  const selectCommute = useCallback((nextId: string) => {
    setChosenTemplateId(nextId);
    // The target and the route pick are per-commute, so leaving them set
    // would carry a College deadline onto a Work prediction.
    setTargetArrivalAt(null);
    setRouteOverride(null);
  }, []);

  const returnToActiveTrip = useCallback(() => {
    if (activeTrip === null) return;
    setChosenTemplateId(activeTrip.templateId);
    setRouteOverride(null);
  }, [activeTrip]);

  const useRecommendedRoute = useCallback(() => {
    setRouteOverride(null);
  }, []);

  const activeTemplate =
    (templatesQuery.data ?? []).find((template) => template.id === templateId) ?? null;

  return {
    templateId,
    templateName: activeTemplate?.name ?? 'No commute yet',
    destinationName: activeTemplate?.destinationName ?? '',
    commutes,
    sortedCommutes: [...commutes].sort((a, b) => a.name.localeCompare(b.name)),
    // A commute mid-trip elsewhere must not be quietly hidden by the choice.
    otherCommutesHaveActiveTrip:
      activeTrip !== null && templateId !== null && activeTrip.templateId !== templateId,
    path,
    recommendedPath,
    allPaths,
    stopCount: graph?.orderedStops.length ?? 0,
    isRouteOverridden:
      path !== null && recommendedPath !== null && path.signature !== recommendedPath.signature,
    activeForecast,
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
    selectRoute,
    useRecommendedRoute,
    selectCommute,
    returnToActiveTrip,
  };
}

/** Modes used by the current recommended route, for the RoutePill. */
export function useRecommendedModes(path: RoutePath | null): TransportMode[] {
  return useMemo(() => (path === null ? [] : [...path.modes]), [path]);
}
