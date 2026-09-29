/**
 * One-tap commute logging.
 *
 * This module owns the logging state machine. Given a route and the current
 * time, it computes:
 *
 *  - the ordered list of prompts the user will see,
 *  - which prompt comes next,
 *  - what to write to the database when a prompt is confirmed.
 *
 * The rule that shapes everything: **logging must never require typing.** Each
 * prompt is a single tap that captures a timestamp. Conditions (weather,
 * traffic, crowd) are inferred from history and can be corrected afterwards,
 * so they are recorded as `isEstimated` rather than asked about mid-commute.
 */
import {
  type CrowdLevel,
  type EventKind,
  type Segment,
  type TransportMode,
} from '@/src/types/schemas';
import { type RoutePath } from '@/src/engine/graph';
import { round } from '@/src/utils/math';

/** One tap in the logging flow. */
export interface LoggingStep {
  /** Stable id derived from the route and step index. */
  readonly id: string;
  /** Verb shown on the button, e.g. `Boarded Bus 10H`. */
  readonly actionLabel: string;
  /** Timeline label for the resulting event, e.g. `Boarded Bus 10H`. */
  readonly eventLabel: string;
  readonly kind: EventKind;
  /** Segment this step completes, when it maps to a leg. */
  readonly segmentId: string | null;
  readonly mode: TransportMode | null;
  readonly fromLabel: string | null;
  readonly toLabel: string | null;
  /** True when this step records getting off a vehicle. */
  readonly isAlighting: boolean;
  /** True when this step records the final arrival. */
  readonly isArrival: boolean;
  /**
   * True when the user should be offered a crowd override.
   *
   * Only boarding steps, because that is where crowd actually costs time.
   */
  readonly offersCrowdChoice: boolean;
}

/** Input for {@link buildLoggingPlan}. */
export interface LoggingPlanInput {
  readonly graph: {
    readonly stopsById: ReadonlyMap<string, { id: string; name: string }>;
    readonly segmentsById: ReadonlyMap<string, Segment>;
  };
  readonly path: RoutePath;
}

/**
 * Builds the ordered list of prompts for a route.
 *
 * The structure is: depart, then per leg either `walk` (a single completion
 * tap) or `board` → `alight` (two taps, with a `transfer` tap in between when
 * a walk leg follows), then a final `arrive`.
 */
export function buildLoggingPlan(input: LoggingPlanInput): LoggingStep[] {
  const { graph, path } = input;
  const steps: LoggingStep[] = [];

  const originId = path.stopIds[0];
  const originName =
    originId === undefined ? 'Home' : (graph.stopsById.get(originId)?.name ?? 'Home');

  steps.push({
    id: `${path.signature}:0:depart`,
    actionLabel: `Left ${originName}`,
    eventLabel: `Left ${originName}`,
    kind: 'depart',
    segmentId: null,
    mode: null,
    fromLabel: originName,
    toLabel: null,
    isAlighting: false,
    isArrival: false,
    offersCrowdChoice: false,
  });

  let order = 1;

  for (let legIndex = 0; legIndex < path.segmentIds.length; legIndex += 1) {
    const segmentId = path.segmentIds[legIndex];
    const segment = segmentId === undefined ? undefined : graph.segmentsById.get(segmentId);
    if (segment === undefined) continue;

    const fromName = graph.stopsById.get(segment.fromStopId)?.name ?? segment.fromStopId;
    const toName = graph.stopsById.get(segment.toStopId)?.name ?? segment.toStopId;
    const serviceName = segment.serviceLabel ?? labelForMode(segment.mode);
    const isTransit = segment.mode !== 'walk' && segment.mode !== 'bike';

    if (isTransit) {
      steps.push({
        id: `${path.signature}:${order}:board:${segmentId}`,
        actionLabel: `Boarded ${serviceName}`,
        eventLabel: `Boarded ${serviceName}`,
        kind: 'board',
        segmentId,
        mode: segment.mode,
        fromLabel: fromName,
        toLabel: toName,
        isAlighting: false,
        isArrival: false,
        offersCrowdChoice: true,
      });
      order += 1;

      steps.push({
        id: `${path.signature}:${order}:alight:${segmentId}`,
        actionLabel: `Got down at ${toName}`,
        eventLabel: `Got down at ${toName}`,
        kind: 'alight',
        segmentId,
        mode: segment.mode,
        fromLabel: fromName,
        toLabel: toName,
        isAlighting: true,
        isArrival: false,
        offersCrowdChoice: false,
      });
      order += 1;
    } else {
      // A walk leg completes in one tap. It is recorded as a `transfer`
      // because that is what it is: moving between vehicles or stops on foot.
      steps.push({
        id: `${path.signature}:${order}:walk:${segmentId}`,
        actionLabel: `Reached ${toName}`,
        eventLabel: `Reached ${toName}`,
        kind: 'transfer',
        segmentId,
        mode: segment.mode,
        fromLabel: fromName,
        toLabel: toName,
        isAlighting: false,
        isArrival: false,
        offersCrowdChoice: false,
      });
      order += 1;
    }
  }

  const lastStopId = path.stopIds[path.stopIds.length - 1];
  const destinationName =
    lastStopId === undefined
      ? 'Destination'
      : (graph.stopsById.get(lastStopId)?.name ?? 'Destination');

  steps.push({
    id: `${path.signature}:${order}:arrive`,
    actionLabel: `Reached ${destinationName}`,
    eventLabel: `Reached ${destinationName}`,
    kind: 'arrive',
    segmentId: null,
    mode: null,
    fromLabel: null,
    toLabel: destinationName,
    isAlighting: false,
    isArrival: true,
    offersCrowdChoice: false,
  });

  return steps;
}

function labelForMode(mode: TransportMode): string {
  switch (mode) {
    case 'walk':
      return 'Walk';
    case 'bus':
      return 'Bus';
    case 'metro':
      return 'Metro';
    case 'train':
      return 'Train';
    case 'auto':
      return 'Auto';
    case 'bike':
      return 'Bike';
    case 'cab':
      return 'Cab';
  }
}

/** Current progress through a plan. */
export interface LoggingProgress {
  /** Number of steps confirmed so far. */
  readonly completedCount: number;
  /** The step the user should act on next, or `null` when finished. */
  readonly next: LoggingStep | null;
  /** 0..1 completion ratio. */
  readonly progress: number;
  /** True when every step is done and the trip should be closed. */
  readonly isComplete: boolean;
}

/** Computes progress for a plan given the number of confirmed steps. */
export function computeProgress(
  steps: readonly LoggingStep[],
  completedCount: number,
): LoggingProgress {
  const safeCount = Math.max(0, Math.min(completedCount, steps.length));
  return {
    completedCount: safeCount,
    next: safeCount < steps.length ? (steps[safeCount] ?? null) : null,
    progress: steps.length > 0 ? safeCount / steps.length : 0,
    isComplete: safeCount >= steps.length,
  };
}

/** What to persist when a step is confirmed. */
export interface PendingEvent {
  readonly step: LoggingStep;
  readonly occurredAt: number;
  readonly elapsedMinutes: number;
  readonly sortOrder: number;
  readonly deltaMinutes: number | null;
  readonly crowdLevel: CrowdLevel | null;
}

/** Input for {@link buildPendingEvent}. */
export interface PendingEventInput {
  readonly step: LoggingStep;
  readonly tripStartedAt: number;
  readonly now: number;
  readonly sortOrder: number;
  /** Expected duration of the leg being completed, in minutes. */
  readonly expectedMinutes?: number;
  /** Previously observed duration of the leg, for the delta. */
  readonly historicalMeanMinutes?: number | null;
  /** Crowd level to record; usually inferred. */
  readonly crowdLevel?: CrowdLevel | null;
}

/** Builds the event payload for a confirmed step. */
export function buildPendingEvent(input: PendingEventInput): PendingEvent {
  const { step, tripStartedAt, now, sortOrder } = input;
  const elapsedMinutes = Math.max(0, round((now - tripStartedAt) / 60_000, 1));

  // A delta is only meaningful when we know what the leg should have taken.
  const baseline =
    input.historicalMeanMinutes !== undefined && input.historicalMeanMinutes !== null
      ? input.historicalMeanMinutes
      : input.expectedMinutes;

  const deltaMinutes =
    step.isAlighting && baseline !== undefined && baseline > 0
      ? round(elapsedMinutes - baseline, 1)
      : null;

  return {
    step,
    occurredAt: now,
    elapsedMinutes,
    sortOrder,
    deltaMinutes,
    crowdLevel: step.offersCrowdChoice ? (input.crowdLevel ?? null) : null,
  };
}

/**
 * Infers a crowd level for a boarding step.
 *
 * With no history we assume level 2 (moderate) rather than 0, because assuming
 * an empty bus would make the engine systematically optimistic.
 */
export function inferCrowdLevel(observations: readonly number[]): CrowdLevel {
  if (observations.length === 0) return 2;
  const recent = observations.slice(-5);
  const average = recent.reduce((total, value) => total + value, 0) / recent.length;
  const rounded = Math.round(average);
  return (rounded < 0 ? 0 : rounded > 5 ? 5 : rounded) as CrowdLevel;
}
