/**
 * Typed SQLite access.
 *
 * All SQL in the app lives in this directory. Screens and hooks call the
 * functions here and never see a query string. That rule is what keeps the
 * UI layer free of persistence concerns and makes the queries testable.
 */
import { type SQLiteDatabase } from 'expo-sqlite';
import { getDatabase, withTransaction } from './database';
import { type CrowdLevel, type TrafficLevel, type WeatherCondition } from '@/src/types/schemas';
import {
  type BindValue,
  type Row,
  decodeEvent,
  decodeRouteEdgeStats,
  decodeStop,
  decodeSegment,
  decodeTemplate,
  decodeTraffic,
  decodeTrip,
  decodeWeather,
  encodeEvent,
  encodeStop,
  encodeSegment,
  encodeTemplate,
  encodeTraffic,
  encodeTrip,
  encodeWeather,
} from '@/src/types/codecs';
import { type HistoryInput } from '@/src/engine/prediction';
import { percentile, round, stddev } from '@/src/utils/math';

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** Converts an `IN (?, ?, ?)` placeholder list. */
function placeholders(count: number): string {
  return new Array(count).fill('?').join(', ');
}

/**
 * Runs an idempotent upsert that updates a row in place.
 *
 * **`INSERT OR REPLACE` must not be used on any table that has children.** It
 * is a `DELETE` followed by an `INSERT`, so in a database where children
 * cascade on delete, an innocuous-looking save silently destroys a whole
 * subtree:
 *
 *  - replacing a `templates` row wipes its stops, segments, **trips** and
 *    route statistics;
 *  - replacing a `stops` row wipes the segments that reference it, and
 *    through them that segment's **logged events**;
 *  - replacing a `trips` row wipes every **event** logged for that commute.
 *
 * `ON CONFLICT DO UPDATE` touches only the listed columns, so a write stays a
 * write. This is the single most dangerous footgun in the whole persistence
 * layer, which is why it is centralised here.
 *
 * The tables that *are* still safe with `INSERT OR REPLACE` are
 * `events`, `route_edges` and `settings`, because nothing references them.
 * Those are the only three.
 *
 * Column names and bound values are both read from `row`, so the two can
 * never drift apart — the usual failure mode of hand-maintained upserts.
 */
async function upsert(
  db: SQLiteDatabase,
  table: string,
  row: Record<string, BindValue>,
  conflictColumn = 'id',
): Promise<void> {
  const columns = Object.keys(row);
  const assignments = columns
    .filter((column) => column !== conflictColumn)
    .map((column) => `${column} = excluded.${column}`);

  const sql =
    `INSERT INTO ${table} (${columns.join(', ')}) ` +
    `VALUES (${columns.map(() => '?').join(', ')}) ` +
    `ON CONFLICT(${conflictColumn}) DO UPDATE SET ${assignments.join(', ')}`;

  await db.runAsync(sql, ...columns.map((column) => row[column] as BindValue));
}

/** A `COUNT(*)` result row. */
type CountRow = { readonly count: number };

/* ------------------------------------------------------------------ *
 * Templates
 * ------------------------------------------------------------------ */

/** Lists templates, newest sort order first. Archived ones are excluded. */
export async function listTemplates(
  includeArchived = false,
): Promise<Awaited<ReturnType<typeof selectTemplates>>> {
  const db = await getDatabase();
  return selectTemplates(db, includeArchived);
}

async function selectTemplates(db: SQLiteDatabase, includeArchived: boolean) {
  const where = includeArchived ? '' : 'WHERE isArchived = 0';
  const rows = await db.getAllAsync<Row>(
    `SELECT * FROM templates ${where} ORDER BY isDefault DESC, sortOrder ASC, name ASC`,
  );
  return rows.map(decodeTemplate);
}

/** Fetches one template by id, or `null`. */
export async function getTemplate(templateId: string) {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Row>('SELECT * FROM templates WHERE id = ?', templateId);
  return row === null ? null : decodeTemplate(row);
}

/**
 * Writes a template and its graph atomically.
 *
 * Also prunes stops and segments that the editor removed, because an in-place
 * upsert cannot express deletion. Pruning is explicit and id-scoped rather
 * than a blanket delete, so nothing the caller did not mention is touched.
 */
export async function upsertTemplateGraph(input: {
  readonly template: Parameters<typeof encodeTemplate>[0];
  readonly stops: readonly Parameters<typeof encodeStop>[0][];
  readonly segments: readonly Parameters<typeof encodeSegment>[0][];
}): Promise<void> {
  const db = await getDatabase();
  const templateId = input.template.id;

  await withTransaction(db, async () => {
    await upsert(db, 'templates', encodeTemplate(input.template));

    for (const stop of input.stops) {
      await upsert(db, 'stops', encodeStop(stop));
    }

    for (const segment of input.segments) {
      await upsert(db, 'segments', encodeSegment(segment));
    }

    // Prune graph nodes the editor deleted. Segments go first because they
    // reference stops. Only rows belonging to this template are considered,
    // and only ids absent from the incoming set are removed.
    const keepSegments = new Set(input.segments.map((segment) => segment.id));
    const staleSegments = await db.getAllAsync<Row>(
      'SELECT id FROM segments WHERE templateId = ?',
      templateId,
    );
    for (const row of staleSegments) {
      const id = String(row.id);
      if (!keepSegments.has(id)) {
        await db.runAsync('DELETE FROM segments WHERE id = ?', id);
      }
    }

    const keepStops = new Set(input.stops.map((stop) => stop.id));
    const staleStops = await db.getAllAsync<Row>(
      'SELECT id FROM stops WHERE templateId = ?',
      templateId,
    );
    for (const row of staleStops) {
      const id = String(row.id);
      if (!keepStops.has(id)) {
        await db.runAsync('DELETE FROM stops WHERE id = ?', id);
      }
    }
  });
}

/** Deletes a template and everything cascading from it. */
export async function deleteTemplate(templateId: string): Promise<void> {
  const db = await getDatabase();
  await withTransaction(db, async () => {
    await db.runAsync('DELETE FROM route_edges WHERE templateId = ?', templateId);
    await db.runAsync('DELETE FROM segments WHERE templateId = ?', templateId);
    await db.runAsync('DELETE FROM stops WHERE templateId = ?', templateId);
    await db.runAsync('DELETE FROM templates WHERE id = ?', templateId);
  });
}

/** Loads a template with its stops and segments — the graph unit. */
export async function getTemplateGraph(templateId: string) {
  const db = await getDatabase();

  const templateRow = await db.getFirstAsync<Row>(
    'SELECT * FROM templates WHERE id = ?',
    templateId,
  );
  if (templateRow === null) return null;

  const stopRows = await db.getAllAsync<Row>(
    'SELECT * FROM stops WHERE templateId = ? ORDER BY sortOrder ASC',
    templateId,
  );
  const segmentRows = await db.getAllAsync<Row>(
    'SELECT * FROM segments WHERE templateId = ? ORDER BY sortOrder ASC',
    templateId,
  );

  return {
    template: decodeTemplate(templateRow),
    stops: stopRows.map(decodeStop),
    segments: segmentRows.map(decodeSegment),
  };
}

/* ------------------------------------------------------------------ *
 * Trips and events
 * ------------------------------------------------------------------ */

/** Inserts or replaces a trip row. */
export async function upsertTrip(trip: Parameters<typeof encodeTrip>[0]): Promise<void> {
  const db = await getDatabase();
  await upsert(db, 'trips', encodeTrip(trip));
}

/** Inserts a trip, its events and both snapshots in one transaction. */
export async function insertTripBundle(bundle: {
  readonly trip: Parameters<typeof encodeTrip>[0];
  readonly events: readonly Parameters<typeof encodeEvent>[0][];
  readonly weather: Parameters<typeof encodeWeather>[0] | null;
  readonly traffic: Parameters<typeof encodeTraffic>[0] | null;
}): Promise<void> {
  const db = await getDatabase();

  await withTransaction(db, async () => {
    // Order matters. `weather_snapshots.tripId` and
    // `traffic_snapshots.tripId` are foreign keys onto `trips.id`, and foreign
    // keys are enforced, so the parent row must exist before any child that
    // points at it. Writing the snapshots first fails with "FOREIGN KEY
    // constraint failed" the moment anything seeds a trip.
    await upsertTripIn(db, bundle.trip);

    if (bundle.weather !== null) {
      await upsert(db, 'weather_snapshots', encodeWeather(bundle.weather));
    }

    if (bundle.traffic !== null) {
      await upsert(db, 'traffic_snapshots', encodeTraffic(bundle.traffic));
    }

    for (const event of bundle.events) {
      await insertEventIn(db, event);
    }
  });
}

async function upsertTripIn(
  db: SQLiteDatabase,
  trip: Parameters<typeof encodeTrip>[0],
): Promise<void> {
  // In-place on purpose. `INSERT OR REPLACE` would delete the existing trip
  // row and cascade that delete through to every event logged for it.
  await upsert(db, 'trips', encodeTrip(trip));
}

async function insertEventIn(db: SQLiteDatabase, event: Parameters<typeof encodeEvent>[0]) {
  const row = encodeEvent(event);
  await db.runAsync(
    `INSERT OR REPLACE INTO events
       (id, tripId, segmentId, kind, label, mode, fromLabel, toLabel, occurredAt,
        elapsedMinutes, deltaMinutes, crowdLevel, trafficLevel, isEstimated,
        undone, sortOrder, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.id,
    row.tripId,
    row.segmentId,
    row.kind,
    row.label,
    row.mode,
    row.fromLabel,
    row.toLabel,
    row.occurredAt,
    row.elapsedMinutes,
    row.deltaMinutes,
    row.crowdLevel,
    row.trafficLevel,
    row.isEstimated,
    row.undone,
    row.sortOrder,
    row.createdAt,
    row.updatedAt,
  );
}

/** The single in-progress trip, or `null`. */
export async function getActiveTrip() {
  const db = await getDatabase();
  const row = await db.getFirstAsync<Row>(
    `SELECT * FROM trips WHERE status = 'active' ORDER BY startedAt DESC LIMIT 1`,
  );
  return row === null ? null : decodeTrip(row);
}

/** Fetches a trip with its events and snapshots. */
export async function getTripDetail(tripId: string) {
  const db = await getDatabase();

  const tripRow = await db.getFirstAsync<Row>('SELECT * FROM trips WHERE id = ?', tripId);
  if (tripRow === null) return null;

  const eventRows = await db.getAllAsync<Row>(
    'SELECT * FROM events WHERE tripId = ? ORDER BY sortOrder ASC',
    tripId,
  );
  const trip = decodeTrip(tripRow);

  const weatherRow =
    trip.weatherSnapshotId === null
      ? null
      : await db.getFirstAsync<Row>(
          'SELECT * FROM weather_snapshots WHERE id = ?',
          trip.weatherSnapshotId,
        );

  const trafficRow =
    trip.trafficSnapshotId === null
      ? null
      : await db.getFirstAsync<Row>(
          'SELECT * FROM traffic_snapshots WHERE id = ?',
          trip.trafficSnapshotId,
        );

  return {
    trip,
    events: eventRows.map(decodeEvent),
    weather: weatherRow == null ? null : decodeWeather(weatherRow),
    traffic: trafficRow == null ? null : decodeTraffic(trafficRow),
  };
}

/** Filters accepted by {@link listTrips}. */
export interface TripFilters {
  readonly templateId?: string | null;
  readonly from?: number;
  readonly to?: number;
  readonly status?: 'active' | 'completed' | 'abandoned';
  /** Only late trips when true, only on-time when false. */
  readonly lateOnly?: boolean;
  readonly search?: string;
  readonly limit?: number;
  readonly offset?: number;
}

/** Lists trips with filtering and pagination. */
export async function listTrips(filters: TripFilters = {}) {
  const db = await getDatabase();

  const conditions: string[] = [];
  const params: BindValue[] = [];

  if (filters.templateId != null) {
    conditions.push('templateId = ?');
    params.push(filters.templateId);
  }
  if (filters.from !== undefined) {
    conditions.push('startedAt >= ?');
    params.push(filters.from);
  }
  if (filters.to !== undefined) {
    conditions.push('startedAt < ?');
    params.push(filters.to);
  }
  if (filters.status !== undefined) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters.lateOnly === true) {
    conditions.push('wasOnTime = 0');
  }
  if (filters.search !== undefined && filters.search.length > 0) {
    conditions.push('note LIKE ?');
    params.push(`%${filters.search}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const rows = await db.getAllAsync<Row>(
    `SELECT * FROM trips ${where} ORDER BY startedAt DESC LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset,
  );

  return rows.map(decodeTrip);
}

/** Counts trips matching the same filters, ignoring pagination. */
export async function countTrips(filters: TripFilters = {}): Promise<number> {
  const db = await getDatabase();

  const conditions: string[] = [];
  const params: BindValue[] = [];

  if (filters.templateId != null) {
    conditions.push('templateId = ?');
    params.push(filters.templateId);
  }
  if (filters.from !== undefined) {
    conditions.push('startedAt >= ?');
    params.push(filters.from);
  }
  if (filters.to !== undefined) {
    conditions.push('startedAt < ?');
    params.push(filters.to);
  }
  if (filters.status !== undefined) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters.lateOnly === true) {
    conditions.push('wasOnTime = 0');
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const row = await db.getFirstAsync<CountRow>(
    `SELECT COUNT(*) as count FROM trips ${where}`,
    ...params,
  );
  return row?.count ?? 0;
}

/** Appends an event to a trip. */
export async function appendEvent(event: Parameters<typeof encodeEvent>[0]): Promise<void> {
  const db = await getDatabase();
  await insertEventIn(db, event);
}

/** Soft-deletes the most recent event, for the one-tap undo. */
export async function undoLastEvent(tripId: string): Promise<TripEventRow | null> {
  const db = await getDatabase();

  const row = await db.getFirstAsync<Row>(
    'SELECT * FROM events WHERE tripId = ? AND undone = 0 ORDER BY sortOrder DESC LIMIT 1',
    tripId,
  );
  if (row === null) return null;

  const event = decodeEvent(row);
  await db.runAsync(
    'UPDATE events SET undone = 1, updatedAt = ? WHERE id = ?',
    Date.now(),
    event.id,
  );
  return event;
}

/** The shape returned by {@link undoLastEvent}. */
export type TripEventRow = ReturnType<typeof decodeEvent>;

/* ------------------------------------------------------------------ *
 * History aggregation for the engine
 * ------------------------------------------------------------------ */

/**
 * Builds the engine's history input from the database.
 *
 * This is the only place the app derives statistics from raw events, and it
 * does so in SQL rather than in JavaScript: aggregating 60 days of trips in
 * memory on every render would be wasteful and would block the UI thread.
 *
 * Per-segment durations come from consecutive `board` → `alight` event pairs
 * on the same segment. Route totals come from completed trips.
 */
export async function buildHistoryInput(options: {
  readonly templateId: string;
  readonly sinceMs: number;
}): Promise<HistoryInput> {
  const db = await getDatabase();
  const { templateId, sinceMs } = options;

  const tripIds = await db.getAllAsync<{ id: string; routeSignature: string | null }>(
    `SELECT id, routeSignature FROM trips
      WHERE templateId = ? AND startedAt >= ? AND status = 'completed'`,
    templateId,
    sinceMs,
  );
  const signatureById = new Map(tripIds.map((row) => [row.id, row.routeSignature]));
  if (tripIds.length === 0) {
    return {
      segmentDurations: {},
      routeDurations: {},
      routeOnTime: {},
      routeMissedTransfers: {},
      segmentWorstCrowd: {},
    };
  }

  const ids = tripIds.map((row) => row.id);

  // Per-segment leg durations: pair each `board` event with the next
  // `alight` event on the same segment within the same trip.
  const legRows = await db.getAllAsync<{
    segmentId: string;
    durationMin: number;
    crowdLevel: number | null;
  }>(
    `SELECT b.segmentId AS segmentId,
            (a.occurredAt - b.occurredAt) / 60000.0 AS durationMin,
            b.crowdLevel AS crowdLevel
       FROM events b
       JOIN events a
         ON a.tripId = b.tripId
        AND a.kind = 'alight'
        AND a.undone = 0
        AND a.occurredAt > b.occurredAt
        AND a.occurredAt = (
              SELECT MIN(a2.occurredAt)
                FROM events a2
               WHERE a2.tripId = b.tripId
                 AND a2.kind = 'alight'
                 AND a2.undone = 0
                 AND a2.occurredAt > b.occurredAt
            )
      WHERE b.kind = 'board'
        AND b.undone = 0
        AND b.segmentId IS NOT NULL
        AND b.tripId IN (${placeholders(ids.length)})`,
    ...ids,
  );

  const segmentDurations: Record<string, number[]> = {};
  const segmentWorstCrowd: Record<string, CrowdLevel> = {};

  for (const row of legRows) {
    const duration = row.durationMin;
    if (!Number.isFinite(duration) || duration <= 0) continue;
    (segmentDurations[row.segmentId] ??= []).push(round(duration, 2));
    if (row.crowdLevel !== null) {
      const level = row.crowdLevel as CrowdLevel;
      const current = segmentWorstCrowd[row.segmentId] ?? 0;
      if (level > current) segmentWorstCrowd[row.segmentId] = level;
    }
  }

  const tripRows = await db.getAllAsync<{
    id: string;
    routeSignature: string | null;
    actualDurationMin: number | null;
    wasOnTime: number | null;
  }>(
    `SELECT id, routeSignature, actualDurationMin, wasOnTime
       FROM trips
      WHERE templateId = ? AND startedAt >= ? AND status = 'completed'`,
    templateId,
    sinceMs,
  );

  const routeDurations: Record<string, number[]> = {};
  const routeOnTime: Record<string, { onTime: number; total: number }> = {};
  const routeMissedTransfers: Record<string, number> = {};

  for (const row of tripRows) {
    const signature = row.routeSignature;
    if (signature === null || signature.length === 0) continue;
    if (row.actualDurationMin !== null && row.actualDurationMin > 0) {
      (routeDurations[signature] ??= []).push(row.actualDurationMin);
    }
    const counts = (routeOnTime[signature] ??= { onTime: 0, total: 0 });
    counts.total += 1;
    if (row.wasOnTime === 1) counts.onTime += 1;
  }

  // Missed transfers, counted from `miss` events grouped by the route taken.
  for (const [tripId, signature] of signatureById) {
    if (signature === null || signature.length === 0) continue;
    const missRow = await db.getFirstAsync<CountRow>(
      `SELECT COUNT(*) as count FROM events
        WHERE tripId = ? AND kind = 'miss' AND undone = 0`,
      tripId,
    );
    const count = missRow?.count ?? 0;
    if (count > 0) routeMissedTransfers[signature] = (routeMissedTransfers[signature] ?? 0) + count;
  }

  return { segmentDurations, routeDurations, routeOnTime, routeMissedTransfers, segmentWorstCrowd };
}

/**
 * Recomputes and stores aggregate stats for every route of a template.
 *
 * Runs after logging so the Insights screen and the engine read pre-computed
 * numbers rather than re-deriving them.
 */
export async function refreshRouteEdgeStats(templateId: string): Promise<void> {
  const db = await getDatabase();

  const rows = await db.getAllAsync<{
    routeSignature: string;
    totalDurationMin: number;
    onTime: number;
    total: number;
  }>(
    `SELECT routeSignature,
            AVG(actualDurationMin) AS totalDurationMin,
            SUM(CASE WHEN wasOnTime = 1 THEN 1 ELSE 0 END) AS onTime,
            COUNT(*) AS total
       FROM trips
      WHERE templateId = ? AND status = 'completed'
            AND routeSignature IS NOT NULL AND actualDurationMin IS NOT NULL
      GROUP BY routeSignature`,
    templateId,
  );

  const durationsBySignature = new Map<string, number[]>();
  for (const row of await db.getAllAsync<{ routeSignature: string; actualDurationMin: number }>(
    `SELECT routeSignature, actualDurationMin FROM trips
      WHERE templateId = ? AND status = 'completed'
            AND routeSignature IS NOT NULL AND actualDurationMin IS NOT NULL`,
    templateId,
  )) {
    (
      durationsBySignature.get(row.routeSignature) ??
      durationsBySignature.set(row.routeSignature, []).get(row.routeSignature)!
    ).push(row.actualDurationMin);
  }

  const missedBySignature = new Map<string, number>();
  const segmentRows = await db.getAllAsync<{ routeSignature: string; count: number }>(
    `SELECT t.routeSignature AS routeSignature, COUNT(e.id) AS count
       FROM trips t
       JOIN events e ON e.tripId = t.id AND e.kind = 'miss' AND e.undone = 0
      WHERE t.templateId = ? AND t.routeSignature IS NOT NULL
      GROUP BY t.routeSignature`,
    templateId,
  );
  for (const row of segmentRows) {
    missedBySignature.set(row.routeSignature, row.count);
  }

  await withTransaction(db, async () => {
    await db.runAsync('DELETE FROM route_edges WHERE templateId = ?', templateId);

    for (const row of rows) {
      const durations = durationsBySignature.get(row.routeSignature) ?? [];
      if (durations.length === 0) continue;
      const segmentIds = row.routeSignature.split('|');

      for (let position = 0; position < segmentIds.length; position += 1) {
        const segmentId = segmentIds[position];
        if (segmentId === undefined || segmentId.length === 0) continue;

        await db.runAsync(
          `INSERT OR REPLACE INTO route_edges
             (id, templateId, routeSignature, segmentId, position, totalDurationMin,
              observations, avgDurationMin, p50DurationMin, p90DurationMin,
              p95DurationMin, stddevMinutes, onTimeRate, missedTransfers,
              createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          `${row.routeSignature}:${segmentId}`,
          templateId,
          row.routeSignature,
          segmentId,
          position,
          Math.round(row.totalDurationMin),
          durations.length,
          round(row.totalDurationMin, 2),
          round(percentile(durations, 0.5) ?? 0, 2),
          round(percentile(durations, 0.9) ?? 0, 2),
          round(percentile(durations, 0.95) ?? 0, 2),
          round(stddev(durations), 2),
          row.total > 0 ? round(row.onTime / row.total, 4) : null,
          missedBySignature.get(row.routeSignature) ?? 0,
          Date.now(),
          Date.now(),
        );
      }
    }
  });
}

/** Reads stored per-route stats for a template. */
export async function getRouteEdgeStats(templateId: string) {
  const db = await getDatabase();
  const rows = await db.getAllAsync<Row>(
    `SELECT * FROM route_edges WHERE templateId = ? ORDER BY routeSignature, position ASC`,
    templateId,
  );
  return rows.map(decodeRouteEdgeStats);
}

/* ------------------------------------------------------------------ *
 * Insights
 * ------------------------------------------------------------------ */

/** One point in a chart series. */
export interface SeriesPoint {
  readonly label: string;
  readonly value: number;
}

/** Duration series bucketed by ISO week for the Insights charts. */
export async function getWeeklyDurations(templateId: string, weeks = 8): Promise<SeriesPoint[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ label: string; value: number }>(
    `SELECT strftime('%Y-W%W', startedAt / 1000, 'unixepoch', 'localtime') AS label,
            AVG(actualDurationMin) AS value
       FROM trips
      WHERE templateId = ? AND status = 'completed' AND actualDurationMin IS NOT NULL
      GROUP BY label
      ORDER BY label ASC
      LIMIT ?`,
    templateId,
    weeks,
  );
  return rows.map((row) => ({ label: row.label, value: round(row.value, 1) }));
}

/** On-time rate bucketed by ISO week. */
export async function getReliabilityOverTime(
  templateId: string,
  weeks = 8,
): Promise<SeriesPoint[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ label: string; value: number }>(
    `SELECT strftime('%Y-W%W', startedAt / 1000, 'unixepoch', 'localtime') AS label,
            AVG(CASE WHEN wasOnTime = 1 THEN 1.0 ELSE 0.0 END) AS value
       FROM trips
      WHERE templateId = ? AND status = 'completed' AND wasOnTime IS NOT NULL
      GROUP BY label
      ORDER BY label ASC
      LIMIT ?`,
    templateId,
    weeks,
  );
  return rows.map((row) => ({ label: row.label, value: round(row.value, 3) }));
}

/** Duration split by weather condition, for the rain-vs-normal comparison. */
export async function getRainComparison(templateId: string): Promise<
  {
    readonly condition: WeatherCondition;
    readonly count: number;
    readonly avgDurationMin: number;
    readonly p90DurationMin: number;
  }[]
> {
  const db = await getDatabase();

  const rows = await db.getAllAsync<{ condition: WeatherCondition; durations: string }>(
    `SELECT w.condition AS condition, group_concat(t.actualDurationMin) AS durations
       FROM trips t
       JOIN weather_snapshots w ON w.id = t.weatherSnapshotId
      WHERE t.templateId = ? AND t.status = 'completed'
            AND t.actualDurationMin IS NOT NULL
      GROUP BY w.condition`,
    templateId,
  );

  return rows.map((row) => {
    const durations = row.durations
      .split(',')
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
    const avg =
      durations.reduce((total, value) => total + value, 0) / Math.max(1, durations.length);
    return {
      condition: row.condition,
      count: durations.length,
      avgDurationMin: round(avg, 1),
      p90DurationMin: round(percentile(durations, 0.9) ?? 0, 1),
    };
  });
}

/** Trip counts by departure hour, for the departure-hour distribution. */
export async function getDepartureHourHistogram(templateId: string): Promise<SeriesPoint[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ hour: number; value: number }>(
    `SELECT CAST(strftime('%H', startedAt / 1000, 'unixepoch', 'localtime') AS INTEGER) AS hour,
            COUNT(*) AS value
       FROM trips
      WHERE templateId = ? AND status = 'completed'
      GROUP BY hour
      ORDER BY hour ASC`,
    templateId,
  );

  const buckets: SeriesPoint[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    buckets.push({ label: String(hour).padStart(2, '0'), value: 0 });
  }
  for (const row of rows) {
    if (row.hour >= 0 && row.hour < 24) {
      buckets[row.hour] = { label: buckets[row.hour].label, value: row.value };
    }
  }
  return buckets;
}

/** Crowd level counts, for the crowd heatmap. */
export async function getCrowdDistribution(
  templateId: string,
): Promise<{ readonly level: number; readonly count: number }[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ level: number; value: number }>(
    `SELECT e.crowdLevel AS level, COUNT(*) AS value
       FROM events e
       JOIN trips t ON t.id = e.tripId
      WHERE t.templateId = ? AND e.crowdLevel IS NOT NULL AND e.undone = 0
      GROUP BY level
      ORDER BY level ASC`,
    templateId,
  );

  const buckets = [0, 1, 2, 3, 4, 5].map((level) => ({ level, count: 0 }));
  for (const row of rows) {
    if (row.level >= 0 && row.level <= 5) {
      const bucket = buckets[row.level];
      if (bucket !== undefined) bucket.count = row.value;
    }
  }
  return buckets;
}

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

/** Reads every settings row. */
export async function getAllSettings(): Promise<Record<string, string>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM settings',
  );
  const out: Record<string, string> = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

/** Reads one settings row, or `null`. */
export async function getSetting(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

/** Writes one settings row. */
export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value, updatedAt) VALUES (?, ?, ?)',
    key,
    value,
    Date.now(),
  );
}

/** Removes a settings row, restoring the default. */
export async function deleteSetting(key: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM settings WHERE key = ?', key);
}

/* ------------------------------------------------------------------ *
 * Maintenance
 * ------------------------------------------------------------------ */

/** Replaces all data with the supplied tables, for backup import. */
export async function replaceAllData(payload: {
  readonly templates: readonly unknown[];
  readonly stops: readonly unknown[];
  readonly segments: readonly unknown[];
  readonly trips: readonly unknown[];
  readonly events: readonly unknown[];
  readonly weatherSnapshots: readonly unknown[];
  readonly trafficSnapshots: readonly unknown[];
}): Promise<void> {
  const db = await getDatabase();

  const tableOrder = [
    'weather_snapshots',
    'traffic_snapshots',
    'events',
    'trips',
    'route_edges',
    'segments',
    'stops',
    'templates',
  ] as const;

  await withTransaction(db, async () => {
    for (const table of tableOrder) {
      await db.runAsync(`DELETE FROM ${table}`);
    }

    for (const template of payload.templates) {
      const row = encodeTemplate(template as Parameters<typeof encodeTemplate>[0]);
      await db.runAsync(
        `INSERT INTO templates
           (id, name, originName, destinationName, colorSeed, notes, isArchived,
            isDefault, sortOrder, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id,
        row.name,
        row.originName,
        row.destinationName,
        row.colorSeed,
        row.notes,
        row.isArchived,
        row.isDefault,
        row.sortOrder,
        row.createdAt,
        row.updatedAt,
      );
    }

    for (const stop of payload.stops) {
      const row = encodeStop(stop as Parameters<typeof encodeStop>[0]);
      await db.runAsync(
        `INSERT INTO stops (id, templateId, name, kind, latitude, longitude, sortOrder, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id,
        row.templateId,
        row.name,
        row.kind,
        row.latitude,
        row.longitude,
        row.sortOrder,
        row.createdAt,
        row.updatedAt,
      );
    }

    for (const segment of payload.segments) {
      const row = encodeSegment(segment as Parameters<typeof encodeSegment>[0]);
      await db.runAsync(
        `INSERT INTO segments
           (id, templateId, fromStopId, toStopId, mode, serviceLabel,
            expectedDurationMin, bufferMinutes, transferWindowMin, branchGroup,
            branchLabel, sortOrder, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id,
        row.templateId,
        row.fromStopId,
        row.toStopId,
        row.mode,
        row.serviceLabel,
        row.expectedDurationMin,
        row.bufferMinutes,
        row.transferWindowMin,
        row.branchGroup,
        row.branchLabel,
        row.sortOrder,
        row.createdAt,
        row.updatedAt,
      );
    }

    for (const weather of payload.weatherSnapshots) {
      const row = encodeWeather(weather as Parameters<typeof encodeWeather>[0]);
      await db.runAsync(
        `INSERT INTO weather_snapshots
           (id, tripId, condition, temperatureC, feelsLikeC, rainfallMm,
            humidityPct, windKph, isManual, observedAt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id,
        row.tripId,
        row.condition,
        row.temperatureC,
        row.feelsLikeC,
        row.rainfallMm,
        row.humidityPct,
        row.windKph,
        row.isManual,
        row.observedAt,
        row.createdAt,
        row.updatedAt,
      );
    }

    for (const traffic of payload.trafficSnapshots) {
      const row = encodeTraffic(traffic as Parameters<typeof encodeTraffic>[0]);
      await db.runAsync(
        `INSERT INTO traffic_snapshots
           (id, tripId, level, delayMinutes, sourceSegmentId, isManual,
            observedAt, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id,
        row.tripId,
        row.level,
        row.delayMinutes,
        row.sourceSegmentId,
        row.isManual,
        row.observedAt,
        row.createdAt,
        row.updatedAt,
      );
    }

    for (const trip of payload.trips) {
      const row = encodeTrip(trip as Parameters<typeof encodeTrip>[0]);
      await db.runAsync(
        `INSERT INTO trips
           (id, templateId, routeSignature, direction, status, startedAt, endedAt,
            targetArrivalAt, plannedDurationMin, actualDurationMin, delayMinutes,
            onTimeProbability, reliabilityScore, wasOnTime, weatherSnapshotId,
            trafficSnapshotId, note, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id,
        row.templateId,
        row.routeSignature,
        row.direction,
        row.status,
        row.startedAt,
        row.endedAt,
        row.targetArrivalAt,
        row.plannedDurationMin,
        row.actualDurationMin,
        row.delayMinutes,
        row.onTimeProbability,
        row.reliabilityScore,
        row.wasOnTime,
        row.weatherSnapshotId,
        row.trafficSnapshotId,
        row.note,
        row.createdAt,
        row.updatedAt,
      );
    }

    for (const event of payload.events) {
      const row = encodeEvent(event as Parameters<typeof encodeEvent>[0]);
      await db.runAsync(
        `INSERT INTO events
           (id, tripId, segmentId, kind, label, mode, fromLabel, toLabel, occurredAt,
            elapsedMinutes, deltaMinutes, crowdLevel, trafficLevel, isEstimated,
            undone, sortOrder, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id,
        row.tripId,
        row.segmentId,
        row.kind,
        row.label,
        row.mode,
        row.fromLabel,
        row.toLabel,
        row.occurredAt,
        row.elapsedMinutes,
        row.deltaMinutes,
        row.crowdLevel,
        row.trafficLevel,
        row.isEstimated,
        row.undone,
        row.sortOrder,
        row.createdAt,
        row.updatedAt,
      );
    }
  });
}

/**
 * Deletes every row from every table.
 *
 * Settings are preserved deliberately: "delete all my commutes" should not
 * also throw away the user's theme and notification preferences. Offered from
 * Settings as a destructive escape hatch.
 */
export async function clearAllData(): Promise<void> {
  await replaceAllData({
    templates: [],
    stops: [],
    segments: [],
    trips: [],
    events: [],
    weatherSnapshots: [],
    trafficSnapshots: [],
  });
}

/** Reads every table, for backup export. */
export async function readAllData(): Promise<{
  templates: unknown[];
  stops: unknown[];
  segments: unknown[];
  trips: unknown[];
  events: unknown[];
  weatherSnapshots: unknown[];
  trafficSnapshots: unknown[];
  settings: unknown[];
}> {
  const db = await getDatabase();
  return {
    templates: await db.getAllAsync('SELECT * FROM templates'),
    stops: await db.getAllAsync('SELECT * FROM stops'),
    segments: await db.getAllAsync('SELECT * FROM segments'),
    trips: await db.getAllAsync('SELECT * FROM trips'),
    events: await db.getAllAsync('SELECT * FROM events'),
    weatherSnapshots: await db.getAllAsync('SELECT * FROM weather_snapshots'),
    trafficSnapshots: await db.getAllAsync('SELECT * FROM traffic_snapshots'),
    settings: await db.getAllAsync('SELECT * FROM settings'),
  };
}

/** Traffic level of the most recent completed trip, or `null`. */
export async function getLastTrafficLevel(): Promise<TrafficLevel | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ level: TrafficLevel }>(
    `SELECT level FROM traffic_snapshots ORDER BY observedAt DESC LIMIT 1`,
  );
  return row?.level ?? null;
}

/** Weather condition of the most recent trip, or `null`. */
export async function getLastWeatherCondition(): Promise<WeatherCondition | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ condition: WeatherCondition }>(
    `SELECT condition FROM weather_snapshots ORDER BY observedAt DESC LIMIT 1`,
  );
  return row?.condition ?? null;
}
