/**
 * Column mapping and row codecs for the SQLite layer.
 *
 * `expo-sqlite` returns rows as `Record<string, unknown>`, and booleans are
 * stored as 0/1 integers. These codecs are the single place that knowledge
 * lives so no screen ever has to think about it.
 */
import { z } from 'zod';
import {
  CROWD_LEVELS,
  TRANSPORT_MODES,
  type CommuteTemplate,
  type CrowdLevel,
  resolveNodeRole,
  type RouteEdgeStats,
  type Segment,
  type Setting,
  type Stop,
  type TrafficSnapshot,
  type Trip,
  type TransportMode,
  type TripEvent,
  type WeatherSnapshot,
} from './schemas';

/**
 * A raw row as returned by `expo-sqlite`.
 *
 * `getAllAsync` is generic over the row type, so the safe pattern is to ask
 * for `SQLite.SQLiteVariadicBindParams`-compatible rows. The helpers below
 * narrow `unknown` to the type each column actually holds, which is why every
 * decoder takes `Row` rather than a generic record.
 */
export type Row = Record<string, unknown>;

const str = (row: Row, key: string): string => String(row[key] ?? '');
const num = (row: Row, key: string): number => Number(row[key] ?? 0);
const numOrNull = (row: Row, key: string): number | null => {
  const value = row[key];
  return value === null || value === undefined ? null : Number(value);
};
const strOrNull = (row: Row, key: string): string | null => {
  const value = row[key];
  return value === null || value === undefined ? null : String(value);
};
const bool = (row: Row, key: string): boolean => num(row, key) !== 0;
const boolOrNull = (row: Row, key: string): boolean | null => {
  const value = row[key];
  return value === null || value === undefined ? null : Number(value) !== 0;
};
const toIntBool = (value: boolean): number => (value ? 1 : 0);

/**
 * Narrows a stored integer to a {@link CrowdLevel}.
 *
 * SQLite columns are dynamically typed, so a corrupt value must degrade to
 * `null` rather than produce an out-of-range crowd level.
 */
const toCrowdLevel = (value: unknown): CrowdLevel | null => {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  return CROWD_LEVELS.includes(numeric as CrowdLevel) ? (numeric as CrowdLevel) : null;
};

/** Parses the pipe-joined transport modes stored on a trip. */
const decodeModes = (value: unknown): TransportMode[] | null => {
  if (value === null || value === undefined) return null;
  const parts = String(value)
    .split('|')
    .filter((part) => TRANSPORT_MODES.includes(part as TransportMode));
  return parts.length > 0 ? (parts as TransportMode[]) : null;
};

/** A value SQLite can bind as a statement parameter. */
export type BindValue = string | number | null;

/** Decodes a `templates` row. */
export function decodeTemplate(row: Row): CommuteTemplate {
  return {
    id: str(row, 'id'),
    name: str(row, 'name'),
    originName: str(row, 'originName'),
    destinationName: str(row, 'destinationName'),
    colorSeed: str(row, 'colorSeed'),
    notes: strOrNull(row, 'notes'),
    isArchived: bool(row, 'isArchived'),
    isDefault: bool(row, 'isDefault'),
    sortOrder: num(row, 'sortOrder'),
    createdAt: num(row, 'createdAt'),
    updatedAt: num(row, 'updatedAt'),
  };
}

/** Decodes a `stops` row. */
export function decodeStop(row: Row): Stop {
  return {
    id: str(row, 'id'),
    templateId: str(row, 'templateId'),
    name: str(row, 'name'),
    kind: str(row, 'kind') as Stop['kind'],
    // Null only for a row written before node roles existed. Inferring from
    // `kind` here means the rest of the app can treat the role as always
    // present, rather than branching on undefined at every use site.
    nodeRole: resolveNodeRole({
      kind: str(row, 'kind') as Stop['kind'],
      nodeRole: strOrNull(row, 'nodeRole') as Stop['nodeRole'],
    }),
    latitude: numOrNull(row, 'latitude'),
    longitude: numOrNull(row, 'longitude'),
    sortOrder: num(row, 'sortOrder'),
    createdAt: num(row, 'createdAt'),
    updatedAt: num(row, 'updatedAt'),
  };
}

/** Decodes a `segments` row. */
export function decodeSegment(row: Row): Segment {
  return {
    id: str(row, 'id'),
    templateId: str(row, 'templateId'),
    fromStopId: str(row, 'fromStopId'),
    toStopId: str(row, 'toStopId'),
    mode: str(row, 'mode') as Segment['mode'],
    serviceLabel: strOrNull(row, 'serviceLabel'),
    expectedDurationMin: num(row, 'expectedDurationMin'),
    bufferMinutes: num(row, 'bufferMinutes'),
    transferWindowMin: numOrNull(row, 'transferWindowMin'),
    branchGroup: strOrNull(row, 'branchGroup'),
    branchLabel: strOrNull(row, 'branchLabel'),
    sortOrder: num(row, 'sortOrder'),
    createdAt: num(row, 'createdAt'),
    updatedAt: num(row, 'updatedAt'),
  };
}

/** Decodes a `trips` row. */
export function decodeTrip(row: Row): Trip {
  return {
    id: str(row, 'id'),
    templateId: str(row, 'templateId'),
    routeSignature: strOrNull(row, 'routeSignature'),
    legModes: decodeModes(row['legModes']),
    direction: str(row, 'direction') as Trip['direction'],
    status: str(row, 'status') as Trip['status'],
    startedAt: num(row, 'startedAt'),
    endedAt: numOrNull(row, 'endedAt'),
    targetArrivalAt: numOrNull(row, 'targetArrivalAt'),
    plannedDurationMin: numOrNull(row, 'plannedDurationMin'),
    actualDurationMin: numOrNull(row, 'actualDurationMin'),
    delayMinutes: numOrNull(row, 'delayMinutes'),
    onTimeProbability: numOrNull(row, 'onTimeProbability'),
    reliabilityScore: numOrNull(row, 'reliabilityScore'),
    wasOnTime: boolOrNull(row, 'wasOnTime'),
    weatherSnapshotId: strOrNull(row, 'weatherSnapshotId'),
    trafficSnapshotId: strOrNull(row, 'trafficSnapshotId'),
    note: strOrNull(row, 'note'),
    createdAt: num(row, 'createdAt'),
    updatedAt: num(row, 'updatedAt'),
  };
}

/** Decodes an `events` row. */
export function decodeEvent(row: Row): TripEvent {
  return {
    id: str(row, 'id'),
    tripId: str(row, 'tripId'),
    segmentId: strOrNull(row, 'segmentId'),
    kind: str(row, 'kind') as TripEvent['kind'],
    label: str(row, 'label'),
    mode: strOrNull(row, 'mode') as TripEvent['mode'],
    fromLabel: strOrNull(row, 'fromLabel'),
    toLabel: strOrNull(row, 'toLabel'),
    occurredAt: num(row, 'occurredAt'),
    elapsedMinutes: num(row, 'elapsedMinutes'),
    deltaMinutes: numOrNull(row, 'deltaMinutes'),
    crowdLevel: toCrowdLevel(row['crowdLevel']),
    trafficLevel: strOrNull(row, 'trafficLevel'),
    isEstimated: bool(row, 'isEstimated'),
    undone: bool(row, 'undone'),
    sortOrder: num(row, 'sortOrder'),
    createdAt: num(row, 'createdAt'),
    updatedAt: num(row, 'updatedAt'),
  };
}

/** Decodes a `weather_snapshots` row. */
export function decodeWeather(row: Row): WeatherSnapshot {
  return {
    id: str(row, 'id'),
    tripId: strOrNull(row, 'tripId'),
    condition: str(row, 'condition') as WeatherSnapshot['condition'],
    temperatureC: numOrNull(row, 'temperatureC'),
    feelsLikeC: numOrNull(row, 'feelsLikeC'),
    rainfallMm: numOrNull(row, 'rainfallMm'),
    humidityPct: numOrNull(row, 'humidityPct'),
    windKph: numOrNull(row, 'windKph'),
    isManual: bool(row, 'isManual'),
    observedAt: num(row, 'observedAt'),
    createdAt: num(row, 'createdAt'),
    updatedAt: num(row, 'updatedAt'),
  };
}

/** Decodes a `traffic_snapshots` row. */
export function decodeTraffic(row: Row): TrafficSnapshot {
  return {
    id: str(row, 'id'),
    tripId: strOrNull(row, 'tripId'),
    level: str(row, 'level') as TrafficSnapshot['level'],
    delayMinutes: num(row, 'delayMinutes'),
    sourceSegmentId: strOrNull(row, 'sourceSegmentId'),
    isManual: bool(row, 'isManual'),
    observedAt: num(row, 'observedAt'),
    createdAt: num(row, 'createdAt'),
    updatedAt: num(row, 'updatedAt'),
  };
}

/** Decodes a `settings` row. */
export function decodeSetting(row: Row): Setting {
  return {
    key: str(row, 'key'),
    value: str(row, 'value'),
    updatedAt: num(row, 'updatedAt'),
  };
}

/** Parses a `route_edges` row into aggregate stats. */
export function decodeRouteEdgeStats(row: Row): RouteEdgeStats {
  const segmentIds = str(row, 'segmentIds')
    .split('|')
    .filter((value) => value.length > 0);

  return z
    .object({
      routeSignature: z.string().min(1),
      segmentIds: z.array(z.string().min(1)).min(1),
      observations: z.number().int().min(0),
      avgDurationMin: z.number().nullable(),
      p50DurationMin: z.number().nullable(),
      p90DurationMin: z.number().nullable(),
      p95DurationMin: z.number().nullable(),
      stddevMinutes: z.number().nullable(),
      onTimeRate: z.number().min(0).max(1).nullable(),
      missedTransfers: z.number().int().min(0),
    })
    .parse({
      routeSignature: str(row, 'routeSignature'),
      segmentIds,
      observations: num(row, 'observations'),
      avgDurationMin: numOrNull(row, 'avgDurationMin'),
      p50DurationMin: numOrNull(row, 'p50DurationMin'),
      p90DurationMin: numOrNull(row, 'p90DurationMin'),
      p95DurationMin: numOrNull(row, 'p95DurationMin'),
      stddevMinutes: numOrNull(row, 'stddevMinutes'),
      onTimeRate: numOrNull(row, 'onTimeRate'),
      missedTransfers: num(row, 'missedTransfers'),
    });
}

/** Encodes a template for an `INSERT OR REPLACE` statement. */
export function encodeTemplate(template: CommuteTemplate): Record<string, BindValue> {
  return {
    id: template.id,
    name: template.name,
    originName: template.originName,
    destinationName: template.destinationName,
    colorSeed: template.colorSeed,
    notes: template.notes,
    isArchived: toIntBool(template.isArchived),
    isDefault: toIntBool(template.isDefault),
    sortOrder: template.sortOrder,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

/** Encodes a stop for an `INSERT OR REPLACE` statement. */
export function encodeStop(stop: Stop): Record<string, BindValue> {
  return {
    id: stop.id,
    templateId: stop.templateId,
    name: stop.name,
    kind: stop.kind,
    // Always written, even when the caller left it undefined, so a stop edited
    // through the new editor persists the role the user chose.
    nodeRole: resolveNodeRole(stop),
    latitude: stop.latitude,
    longitude: stop.longitude,
    sortOrder: stop.sortOrder,
    createdAt: stop.createdAt,
    updatedAt: stop.updatedAt,
  };
}

/** Encodes a segment for an `INSERT OR REPLACE` statement. */
export function encodeSegment(segment: Segment): Record<string, BindValue> {
  return {
    id: segment.id,
    templateId: segment.templateId,
    fromStopId: segment.fromStopId,
    toStopId: segment.toStopId,
    mode: segment.mode,
    serviceLabel: segment.serviceLabel,
    expectedDurationMin: segment.expectedDurationMin,
    bufferMinutes: segment.bufferMinutes,
    transferWindowMin: segment.transferWindowMin,
    branchGroup: segment.branchGroup,
    branchLabel: segment.branchLabel,
    sortOrder: segment.sortOrder,
    createdAt: segment.createdAt,
    updatedAt: segment.updatedAt,
  };
}

/** Encodes a trip for an `INSERT OR REPLACE` statement. */
export function encodeTrip(trip: Trip): Record<string, BindValue> {
  return {
    id: trip.id,
    templateId: trip.templateId,
    routeSignature: trip.routeSignature,
    legModes: trip.legModes === null ? null : trip.legModes.join('|'),
    direction: trip.direction,
    status: trip.status,
    startedAt: trip.startedAt,
    endedAt: trip.endedAt,
    targetArrivalAt: trip.targetArrivalAt,
    plannedDurationMin: trip.plannedDurationMin,
    actualDurationMin: trip.actualDurationMin,
    delayMinutes: trip.delayMinutes,
    onTimeProbability: trip.onTimeProbability,
    reliabilityScore: trip.reliabilityScore,
    wasOnTime: trip.wasOnTime === null ? null : toIntBool(trip.wasOnTime),
    weatherSnapshotId: trip.weatherSnapshotId,
    trafficSnapshotId: trip.trafficSnapshotId,
    note: trip.note,
    createdAt: trip.createdAt,
    updatedAt: trip.updatedAt,
  };
}

/** Encodes an event for an `INSERT OR REPLACE` statement. */
export function encodeEvent(event: TripEvent): Record<string, BindValue> {
  return {
    id: event.id,
    tripId: event.tripId,
    segmentId: event.segmentId,
    kind: event.kind,
    label: event.label,
    mode: event.mode,
    fromLabel: event.fromLabel,
    toLabel: event.toLabel,
    occurredAt: event.occurredAt,
    elapsedMinutes: event.elapsedMinutes,
    deltaMinutes: event.deltaMinutes,
    crowdLevel: event.crowdLevel,
    trafficLevel: event.trafficLevel,
    isEstimated: toIntBool(event.isEstimated),
    undone: toIntBool(event.undone),
    sortOrder: event.sortOrder,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

/** Encodes a weather snapshot for an `INSERT OR REPLACE` statement. */
export function encodeWeather(snapshot: WeatherSnapshot): Record<string, BindValue> {
  return {
    id: snapshot.id,
    tripId: snapshot.tripId,
    condition: snapshot.condition,
    temperatureC: snapshot.temperatureC,
    feelsLikeC: snapshot.feelsLikeC,
    rainfallMm: snapshot.rainfallMm,
    humidityPct: snapshot.humidityPct,
    windKph: snapshot.windKph,
    isManual: toIntBool(snapshot.isManual),
    observedAt: snapshot.observedAt,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
}

/** Encodes a traffic snapshot for an `INSERT OR REPLACE` statement. */
export function encodeTraffic(snapshot: TrafficSnapshot): Record<string, BindValue> {
  return {
    id: snapshot.id,
    tripId: snapshot.tripId,
    level: snapshot.level,
    delayMinutes: snapshot.delayMinutes,
    sourceSegmentId: snapshot.sourceSegmentId,
    isManual: toIntBool(snapshot.isManual),
    observedAt: snapshot.observedAt,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
}
