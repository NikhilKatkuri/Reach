import { z } from 'zod';

/** Transport modes a user can add to a commute. */
export const transportModeSchema = z.enum(['walk', 'bus', 'metro', 'train', 'auto', 'bike', 'cab']);
export type TransportMode = z.infer<typeof transportModeSchema>;

/** Ordered modes shown in the template builder's mode picker. */
export const TRANSPORT_MODES: readonly TransportMode[] = [
  'walk',
  'bus',
  'metro',
  'train',
  'auto',
  'bike',
  'cab',
];

/** Kinds of node in a commute graph. */
export const stopKindSchema = z.enum(['home', 'stop', 'station', 'office']);
export type StopKind = z.infer<typeof stopKindSchema>;

/** Weather conditions stored on a snapshot. */
export const weatherConditionSchema = z.enum([
  'clear',
  'cloudy',
  'light_rain',
  'rain',
  'heavy_rain',
]);
export type WeatherCondition = z.infer<typeof weatherConditionSchema>;

/** Traffic levels stored on a snapshot. */
export const trafficLevelSchema = z.enum(['low', 'medium', 'high', 'very_high']);
export type TrafficLevel = z.infer<typeof trafficLevelSchema>;

/**
 * Crowd levels.
 *
 * 0 empty, 1 seat available, 2 moderate, 3 standing comfortable,
 * 4 packed, 5 difficult to board.
 *
 * Declared as a literal union rather than `z.number().min(0).max(5)` so that
 * exhaustive `switch` statements in the label helpers are checked at compile
 * time — a missing case becomes a type error, not an `undefined` at runtime.
 */
export const CROWD_LEVELS = [0, 1, 2, 3, 4, 5] as const;

export const crowdLevelSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export type CrowdLevel = z.infer<typeof crowdLevelSchema>;

/** Kinds of one-tap logging events. */
export const eventKindSchema = z.enum(['depart', 'board', 'alight', 'transfer', 'arrive', 'miss']);
export type EventKind = z.infer<typeof eventKindSchema>;

/** Lifecycle status of a trip. */
export const tripStatusSchema = z.enum(['active', 'completed', 'abandoned']);
export type TripStatus = z.infer<typeof tripStatusSchema>;

/** Travel direction relative to the template's canonical direction. */
export const tripDirectionSchema = z.enum(['outbound', 'inbound']);
export type TripDirection = z.infer<typeof tripDirectionSchema>;

const idSchema = z.string().min(1);
const timestampSchema = z.number().int().nonnegative();

/** A node in a commute template's graph. */
export const stopSchema = z.object({
  id: idSchema,
  templateId: idSchema,
  name: z.string().min(1).max(120),
  kind: stopKindSchema,
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  sortOrder: z.number().int().nonnegative(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type Stop = z.infer<typeof stopSchema>;

/** A directed edge in a commute template's graph. */
export const segmentSchema = z.object({
  id: idSchema,
  templateId: idSchema,
  fromStopId: idSchema,
  toStopId: idSchema,
  mode: transportModeSchema,
  serviceLabel: z.string().max(80).nullable(),
  expectedDurationMin: z
    .number()
    .int()
    .min(0)
    .max(24 * 60),
  bufferMinutes: z.number().int().min(0).max(240),
  transferWindowMin: z.number().int().min(0).max(240).nullable(),
  branchGroup: z.string().max(80).nullable(),
  branchLabel: z.string().max(80).nullable(),
  sortOrder: z.number().int().nonnegative(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type Segment = z.infer<typeof segmentSchema>;

/** A reusable commute. */
export const templateSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(120),
  originName: z.string().min(1).max(120),
  destinationName: z.string().min(1).max(120),
  colorSeed: z.string().min(1).max(32),
  notes: z.string().max(2000).nullable(),
  isArchived: z.boolean(),
  isDefault: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type CommuteTemplate = z.infer<typeof templateSchema>;

/** A template plus its graph — the unit the builder and engine consume. */
export const templateGraphSchema = z.object({
  template: templateSchema,
  stops: z.array(stopSchema).readonly(),
  segments: z.array(segmentSchema).readonly(),
});
export type TemplateGraph = z.infer<typeof templateGraphSchema>;

/** A recorded one-tap event. */
export const tripEventSchema = z.object({
  id: idSchema,
  tripId: idSchema,
  segmentId: z.string().nullable(),
  kind: eventKindSchema,
  label: z.string().min(1).max(120),
  mode: transportModeSchema.nullable(),
  fromLabel: z.string().max(120).nullable(),
  toLabel: z.string().max(120).nullable(),
  occurredAt: timestampSchema,
  elapsedMinutes: z.number().int().min(0),
  deltaMinutes: z.number().int().nullable(),
  crowdLevel: crowdLevelSchema.nullable(),
  trafficLevel: z.string().nullable(),
  isEstimated: z.boolean(),
  undone: z.boolean(),
  sortOrder: z.number().int().nonnegative(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type TripEvent = z.infer<typeof tripEventSchema>;

/** A weather observation attached to a trip. */
export const weatherSnapshotSchema = z.object({
  id: idSchema,
  tripId: z.string().nullable(),
  condition: weatherConditionSchema,
  temperatureC: z.number().nullable(),
  feelsLikeC: z.number().nullable(),
  rainfallMm: z.number().nullable(),
  humidityPct: z.number().int().min(0).max(100).nullable(),
  windKph: z.number().nullable(),
  isManual: z.boolean(),
  observedAt: timestampSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type WeatherSnapshot = z.infer<typeof weatherSnapshotSchema>;

/** A traffic observation attached to a trip. */
export const trafficSnapshotSchema = z.object({
  id: idSchema,
  tripId: z.string().nullable(),
  level: trafficLevelSchema,
  delayMinutes: z.number().int().min(0).max(240),
  sourceSegmentId: z.string().nullable(),
  isManual: z.boolean(),
  observedAt: timestampSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type TrafficSnapshot = z.infer<typeof trafficSnapshotSchema>;

/** A logged commute. */
export const tripSchema = z.object({
  id: idSchema,
  templateId: idSchema,
  routeSignature: z.string().nullable(),
  /**
   * Transport modes in travel order, denormalised onto the trip.
   *
   * The History list needs the route for every card but should not have to
   * join through events or load each template's graph to get it, so the mode
   * mix is written once when the trip is created.
   */
  legModes: z.array(transportModeSchema).nullable(),
  direction: tripDirectionSchema,
  status: tripStatusSchema,
  startedAt: timestampSchema,
  endedAt: z.number().int().nullable(),
  targetArrivalAt: z.number().int().nullable(),
  plannedDurationMin: z.number().int().nullable(),
  actualDurationMin: z.number().int().nullable(),
  delayMinutes: z.number().int().nullable(),
  onTimeProbability: z.number().min(0).max(1).nullable(),
  reliabilityScore: z.number().min(0).max(100).nullable(),
  wasOnTime: z.boolean().nullable(),
  weatherSnapshotId: z.string().nullable(),
  trafficSnapshotId: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type Trip = z.infer<typeof tripSchema>;

/** A trip with its events and conditions attached. */
export const tripDetailSchema = z.object({
  trip: tripSchema,
  events: z.array(tripEventSchema).readonly(),
  weather: weatherSnapshotSchema.nullable(),
  traffic: trafficSnapshotSchema.nullable(),
});
export type TripDetail = z.infer<typeof tripDetailSchema>;

/** Aggregate statistics for one route (a `|`-joined segment id signature). */
export const routeEdgeStatsSchema = z.object({
  routeSignature: z.string().min(1),
  segmentIds: z.array(idSchema).min(1),
  observations: z.number().int().min(0),
  avgDurationMin: z.number().nullable(),
  p50DurationMin: z.number().nullable(),
  p90DurationMin: z.number().nullable(),
  p95DurationMin: z.number().nullable(),
  stddevMinutes: z.number().nullable(),
  onTimeRate: z.number().min(0).max(1).nullable(),
  missedTransfers: z.number().int().min(0),
});
export type RouteEdgeStats = z.infer<typeof routeEdgeStatsSchema>;

/** Bumped whenever the engine's math changes, so cached scores can expire. */
export const ALGORITHM_VERSION = '1.0.0';

/** The engine's final answer for a template under given conditions. */
export const predictionSchema = z.object({
  templateId: idSchema,
  generatedAt: timestampSchema,
  targetArrivalAt: timestampSchema,
  leaveBy: timestampSchema,
  eta: timestampSchema,
  /** Fastest plausible path, ignoring reliability. */
  fastestDurationMin: z.number().nonnegative(),
  /** Conservative total duration for the recommended route. */
  travelTimeP50Min: z.number().nonnegative(),
  travelTimeP75Min: z.number().nonnegative(),
  travelTimeP90Min: z.number().nonnegative(),
  travelTimeP95Min: z.number().nonnegative(),
  meanDurationMin: z.number().nonnegative(),
  stddevMinutes: z.number().nonnegative(),
  /** 0..1 probability of arriving at or before `targetArrivalAt`. */
  onTimeProbability: z.number().min(0).max(1),
  /** 0..100 composite reliability score. */
  reliabilityScore: z.number().min(0).max(100),
  /** How much data backs this prediction, 0..1. */
  confidence: z.number().min(0).max(1),
  /** Extra minutes to add on top of P90 for comfort. */
  suggestedBufferMin: z.number().int().min(0),
  recommendedSignature: z.string().min(1),
  recommendedStopIds: z.array(idSchema).min(2),
  algorithmVersion: z.string().min(1),
});
export type Prediction = z.infer<typeof predictionSchema>;

/** A scored alternative route, used to explain why one route won. */
export const routeCandidateSchema = z.object({
  signature: z.string().min(1),
  segmentIds: z.array(idSchema).min(1),
  stopIds: z.array(idSchema).min(2),
  label: z.string().min(1),
  modeSummary: z.string().min(1),
  travelTimeP50Min: z.number().nonnegative(),
  travelTimeP90Min: z.number().nonnegative(),
  onTimeProbability: z.number().min(0).max(1),
  reliabilityScore: z.number().min(0).max(100),
  isRecommended: z.boolean(),
});
export type RouteCandidate = z.infer<typeof routeCandidateSchema>;

/** Human-readable drivers behind a score, for the "why" sheet. */
export interface ReliabilityFactor {
  /** Stable key so the UI can look up an icon and label. */
  readonly key: 'punctuality' | 'variance' | 'traffic' | 'weather' | 'crowd' | 'transfers';
  /** Signed contribution in score points, negative means a penalty. */
  readonly impact: number;
  /** Short human sentence, e.g. "Heavy traffic adds ~4 min". */
  readonly detail: string;
}

/** Full recommendation payload persisted for the audit trail. */
export const recommendationSchema = z.object({
  prediction: predictionSchema,
  candidates: z.array(routeCandidateSchema),
  factors: z.array(
    z.object({
      key: z.enum(['punctuality', 'variance', 'traffic', 'weather', 'crowd', 'transfers']),
      impact: z.number(),
      detail: z.string(),
    }),
  ),
});
export type Recommendation = z.infer<typeof recommendationSchema>;

/** Rows returned by the settings key/value store. */
export const settingSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
  updatedAt: timestampSchema,
});
export type Setting = z.infer<typeof settingSchema>;
