/**
 * The database surface a migration needs.
 *
 * Declared structurally rather than as `expo-sqlite`'s `SQLiteDatabase` so the
 * integration test can run the exact same migration objects against
 * `node:sqlite`. Both satisfy this interface.
 */
export interface MigrationTarget {
  execAsync(sql: string): Promise<void>;
  getAllAsync<T>(sql: string): Promise<T[]>;
}

/**
 * Ordered, append-only list of schema migrations.
 *
 * Rules for adding a migration:
 *  1. Never edit an already-released migration — add a new one.
 *  2. `version` must be strictly increasing and gap-free from 1.
 *  3. `up` must be safe to run inside a transaction on a fresh database.
 *  4. Prefer static `up` statements: they are covered by the integration test.
 *     Reach for `customize` only when a step genuinely needs to inspect the
 *     database first, because SQLite has no `ADD COLUMN IF NOT EXISTS`.
 */
export interface Migration {
  /** Monotonic schema version, applied in ascending order. */
  readonly version: number;
  /** Human readable name, recorded in `schema_migrations`. */
  readonly name: string;
  /** Statements executed inside a single transaction. */
  readonly up: readonly string[];
  /** Optional imperative step, run in the same transaction after `up`. */
  readonly customize?: (db: MigrationTarget) => Promise<void>;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: [
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        version     INTEGER PRIMARY KEY NOT NULL,
        name        TEXT    NOT NULL,
        appliedAt   INTEGER NOT NULL
      );`,

      `CREATE TABLE IF NOT EXISTS templates (
        id               TEXT    PRIMARY KEY NOT NULL,
        name             TEXT    NOT NULL,
        originName       TEXT    NOT NULL,
        destinationName  TEXT    NOT NULL,
        colorSeed        TEXT    NOT NULL,
        notes            TEXT,
        isArchived       INTEGER NOT NULL DEFAULT 0,
        isDefault        INTEGER NOT NULL DEFAULT 0,
        sortOrder        INTEGER NOT NULL DEFAULT 0,
        createdAt        INTEGER NOT NULL,
        updatedAt        INTEGER NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_templates_archived
        ON templates (isArchived, sortOrder);`,
      `CREATE INDEX IF NOT EXISTS idx_templates_updatedAt
        ON templates (updatedAt);`,

      `CREATE TABLE IF NOT EXISTS stops (
        id           TEXT    PRIMARY KEY NOT NULL,
        templateId   TEXT    NOT NULL,
        name         TEXT    NOT NULL,
        kind         TEXT    NOT NULL,
        latitude     REAL,
        longitude    REAL,
        sortOrder    INTEGER NOT NULL,
        createdAt    INTEGER NOT NULL,
        updatedAt    INTEGER NOT NULL,
        FOREIGN KEY (templateId) REFERENCES templates (id) ON DELETE CASCADE
      );`,
      `CREATE INDEX IF NOT EXISTS idx_stops_templateId
        ON stops (templateId, sortOrder);`,

      `CREATE TABLE IF NOT EXISTS segments (
        id                  TEXT    PRIMARY KEY NOT NULL,
        templateId          TEXT    NOT NULL,
        fromStopId          TEXT    NOT NULL,
        toStopId            TEXT    NOT NULL,
        mode                TEXT    NOT NULL,
        serviceLabel        TEXT,
        expectedDurationMin INTEGER NOT NULL,
        bufferMinutes       INTEGER NOT NULL DEFAULT 0,
        transferWindowMin   INTEGER,
        branchGroup         TEXT,
        branchLabel         TEXT,
        sortOrder           INTEGER NOT NULL,
        createdAt           INTEGER NOT NULL,
        updatedAt           INTEGER NOT NULL,
        FOREIGN KEY (templateId) REFERENCES templates (id) ON DELETE CASCADE,
        FOREIGN KEY (fromStopId) REFERENCES stops (id) ON DELETE CASCADE,
        FOREIGN KEY (toStopId)   REFERENCES stops (id) ON DELETE CASCADE
      );`,
      `CREATE INDEX IF NOT EXISTS idx_segments_templateId
        ON segments (templateId, sortOrder);`,
      `CREATE INDEX IF NOT EXISTS idx_segments_fromStopId
        ON segments (fromStopId);`,
      `CREATE INDEX IF NOT EXISTS idx_segments_toStopId
        ON segments (toStopId);`,
      `CREATE INDEX IF NOT EXISTS idx_segments_branchGroup
        ON segments (templateId, branchGroup);`,

      `CREATE TABLE IF NOT EXISTS trips (
        id                 TEXT    PRIMARY KEY NOT NULL,
        templateId         TEXT    NOT NULL,
        routeSignature     TEXT,
        legModes           TEXT,
        direction          TEXT    NOT NULL DEFAULT 'outbound',
        status             TEXT    NOT NULL DEFAULT 'active',
        startedAt          INTEGER NOT NULL,
        endedAt            INTEGER,
        targetArrivalAt    INTEGER,
        plannedDurationMin INTEGER,
        actualDurationMin  INTEGER,
        delayMinutes       INTEGER,
        onTimeProbability  REAL,
        reliabilityScore   REAL,
        wasOnTime          INTEGER,
        weatherSnapshotId  TEXT,
        trafficSnapshotId  TEXT,
        note               TEXT,
        createdAt          INTEGER NOT NULL,
        updatedAt          INTEGER NOT NULL,
        FOREIGN KEY (templateId) REFERENCES templates (id) ON DELETE CASCADE
      );`,
      `CREATE INDEX IF NOT EXISTS idx_trips_templateId
        ON trips (templateId, startedAt DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_trips_startedAt
        ON trips (startedAt DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_trips_status
        ON trips (status, startedAt DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_trips_routeSignature
        ON trips (templateId, routeSignature, startedAt DESC);`,

      `CREATE TABLE IF NOT EXISTS events (
        id             TEXT    PRIMARY KEY NOT NULL,
        tripId         TEXT    NOT NULL,
        segmentId      TEXT,
        kind           TEXT    NOT NULL,
        label          TEXT    NOT NULL,
        mode           TEXT,
        fromLabel      TEXT,
        toLabel        TEXT,
        occurredAt     INTEGER NOT NULL,
        elapsedMinutes INTEGER NOT NULL,
        deltaMinutes   INTEGER,
        crowdLevel     INTEGER,
        trafficLevel   INTEGER,
        isEstimated    INTEGER NOT NULL DEFAULT 0,
        undone         INTEGER NOT NULL DEFAULT 0,
        sortOrder      INTEGER NOT NULL,
        createdAt      INTEGER NOT NULL,
        updatedAt      INTEGER NOT NULL,
        FOREIGN KEY (tripId) REFERENCES trips (id) ON DELETE CASCADE,
        FOREIGN KEY (segmentId) REFERENCES segments (id) ON DELETE SET NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_events_tripId
        ON events (tripId, sortOrder);`,
      `CREATE INDEX IF NOT EXISTS idx_events_occurredAt
        ON events (occurredAt);`,
      `CREATE INDEX IF NOT EXISTS idx_events_segmentId
        ON events (segmentId);`,

      `CREATE TABLE IF NOT EXISTS weather_snapshots (
        id           TEXT    PRIMARY KEY NOT NULL,
        tripId       TEXT,
        condition    TEXT    NOT NULL,
        temperatureC REAL,
        feelsLikeC   REAL,
        rainfallMm   REAL,
        humidityPct  INTEGER,
        windKph      REAL,
        isManual     INTEGER NOT NULL DEFAULT 1,
        observedAt   INTEGER NOT NULL,
        createdAt    INTEGER NOT NULL,
        updatedAt    INTEGER NOT NULL,
        FOREIGN KEY (tripId) REFERENCES trips (id) ON DELETE CASCADE
      );`,
      `CREATE INDEX IF NOT EXISTS idx_weather_tripId
        ON weather_snapshots (tripId, observedAt);`,
      `CREATE INDEX IF NOT EXISTS idx_weather_condition
        ON weather_snapshots (condition, observedAt);`,

      `CREATE TABLE IF NOT EXISTS traffic_snapshots (
        id              TEXT    PRIMARY KEY NOT NULL,
        tripId          TEXT,
        level           TEXT    NOT NULL,
        delayMinutes    INTEGER NOT NULL DEFAULT 0,
        sourceSegmentId TEXT,
        isManual        INTEGER NOT NULL DEFAULT 1,
        observedAt      INTEGER NOT NULL,
        createdAt       INTEGER NOT NULL,
        updatedAt       INTEGER NOT NULL,
        FOREIGN KEY (tripId) REFERENCES trips (id) ON DELETE CASCADE
      );`,
      `CREATE INDEX IF NOT EXISTS idx_traffic_tripId
        ON traffic_snapshots (tripId, observedAt);`,
      `CREATE INDEX IF NOT EXISTS idx_traffic_level
        ON traffic_snapshots (level, observedAt);`,

      `CREATE TABLE IF NOT EXISTS route_edges (
        id               TEXT    PRIMARY KEY NOT NULL,
        templateId       TEXT    NOT NULL,
        routeSignature   TEXT    NOT NULL,
        segmentId        TEXT    NOT NULL,
        position         INTEGER NOT NULL,
        totalDurationMin INTEGER NOT NULL,
        observations     INTEGER NOT NULL DEFAULT 0,
        avgDurationMin   REAL,
        p50DurationMin   REAL,
        p90DurationMin   REAL,
        p95DurationMin   REAL,
        stddevMinutes    REAL,
        onTimeRate       REAL,
        missedTransfers  INTEGER NOT NULL DEFAULT 0,
        createdAt        INTEGER NOT NULL,
        updatedAt        INTEGER NOT NULL,
        FOREIGN KEY (templateId) REFERENCES templates (id) ON DELETE CASCADE,
        FOREIGN KEY (segmentId) REFERENCES segments (id) ON DELETE CASCADE
      );`,
      `CREATE INDEX IF NOT EXISTS idx_route_edges_templateId
        ON route_edges (templateId, routeSignature, position);`,
      `CREATE INDEX IF NOT EXISTS idx_route_edges_signature
        ON route_edges (routeSignature);`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_route_edges_unique
        ON route_edges (routeSignature, segmentId);`,

      `CREATE TABLE IF NOT EXISTS settings (
        key       TEXT    PRIMARY KEY NOT NULL,
        value     TEXT    NOT NULL,
        updatedAt INTEGER NOT NULL
      );`,
    ],
  },

  {
    version: 2,
    name: 'purge_demo_data',
    up: [
      /*
       * Reach used to ship a demo seeder that wrote 45 days of synthetic
       * commutes on first launch. It is gone, but rows it already wrote are
       * still sitting in the database on any device that ran that build, and
       * deleting the seeder does not delete its output.
       *
       * Leaving them would be worse than never having seeded: the dashboard
       * would show a user's "P90" computed from commute routes they have never
       * taken, and would be indistinguishable from real history. So every
       * seeded row is removed here, identified by the `seed-` id prefix the
       * seeder used.
       *
       * Children are deleted explicitly rather than relying on ON DELETE
       * CASCADE. An early build could open the database before
       * `PRAGMA foreign_keys = ON` was set, in which case the cascades were
       * inert and the orphans would survive a parent-only delete.
       */
      `DELETE FROM events
        WHERE tripId IN (
          SELECT id FROM trips
          WHERE templateId IN (SELECT id FROM templates WHERE id LIKE 'seed-%')
        );`,
      `DELETE FROM weather_snapshots
        WHERE tripId IN (
          SELECT id FROM trips
          WHERE templateId IN (SELECT id FROM templates WHERE id LIKE 'seed-%')
        );`,
      `DELETE FROM traffic_snapshots
        WHERE tripId IN (
          SELECT id FROM trips
          WHERE templateId IN (SELECT id FROM templates WHERE id LIKE 'seed-%')
        );`,
      `DELETE FROM route_edges
        WHERE templateId IN (SELECT id FROM templates WHERE id LIKE 'seed-%');`,
      `DELETE FROM trips
        WHERE templateId IN (SELECT id FROM templates WHERE id LIKE 'seed-%');`,
      `DELETE FROM segments
        WHERE templateId IN (SELECT id FROM templates WHERE id LIKE 'seed-%');`,
      `DELETE FROM stops
        WHERE templateId IN (SELECT id FROM templates WHERE id LIKE 'seed-%');`,
      `DELETE FROM templates WHERE id LIKE 'seed-%';`,

      // The seeder's "have we run yet" flag, and anything else it owned.
      `DELETE FROM settings WHERE key LIKE 'seed.%';`,
    ],
    customize: async (db) => {
      /*
       * `trips.legModes` was added to migration 1 while the app was still in
       * development, so there are two kinds of v1 database in the wild: ones
       * created before the column existed and ones created after. A plain
       * `ALTER TABLE ... ADD COLUMN` aborts with "duplicate column name" on
       * the latter, which would roll back the data purge above and leave the
       * demo rows in place — the exact failure this migration exists to fix.
       *
       * SQLite has no `ADD COLUMN IF NOT EXISTS`, so the check is explicit.
       */
      const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(trips)');
      if (columns.some((column) => column.name === 'legModes')) return;
      await db.execAsync('ALTER TABLE trips ADD COLUMN legModes TEXT;');
    },
  },
];

/** Highest migration version defined in this build. */
export const LATEST_SCHEMA_VERSION = MIGRATIONS.reduce(
  (max, migration) => Math.max(max, migration.version),
  0,
);
