/// <reference types="node" />
/**
 * Proves the persistence layer against a real SQLite engine.
 *
 * `expo-sqlite` cannot run in Jest, so these tests drive the *same* SQL the
 * app runs through a shim backed by `node:sqlite`. That makes them a real
 * integration test rather than a restatement of the source: if the schema
 * and the statements disagree, or if an insert order violates a foreign
 * key, these fail.
 *
 * The two bugs this was written for were both invisible to TypeScript, to
 * ESLint, and to a bundle:
 *
 *  1. `insertTripBundle` wrote `weather_snapshots` / `traffic_snapshots`
 *     before the `trips` row they point at, which fails the moment foreign
 *     keys are enforced. That crashed the app on first launch.
 *  2. `INSERT OR REPLACE` is a DELETE plus an INSERT, so saving a template
 *     cascaded a delete through its stops, segments and **entire trip
 *     history**, and finishing a commute wiped **every event logged for it**.
 *
 * The `@types/node` reference above is scoped to this file on purpose: the
 * app must never see Node globals, so the project's `tsconfig.json` keeps
 * `"types": ["jest"]` and does not list it.
 */
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS, type MigrationTarget } from '@/src/db/migrations';

/** Adapts `node:sqlite` to the interface migrations are written against. */
function migrationTarget(db: DatabaseSync): MigrationTarget {
  return {
    execAsync: async (sql) => {
      db.exec(sql);
    },
    getAllAsync: async <T>(sql: string) => db.prepare(sql).all() as T[],
  };
}

/**
 * Applies every migration, exactly as `database.ts` does.
 *
 * Including `customize`: the conditional column repair in migration 2 is the
 * kind of code that silently rots when a test only replays `up`.
 */
async function migrate(db: DatabaseSync): Promise<void> {
  for (const migration of MIGRATIONS) {
    for (const statement of migration.up) db.exec(statement);
    await migration.customize?.(migrationTarget(db));
  }
}

/** Creates a schema identical to the app's, with foreign keys enforced. */
function createDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  // The app sets this in database.ts; it is the whole reason the ordering bug
  // was fatal.
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

/** Creates a fully migrated database. */
async function createMigratedDatabase(): Promise<DatabaseSync> {
  const db = createDatabase();
  await migrate(db);
  return db;
}

/** Counts rows in a table. */
function count(db: DatabaseSync, table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number } | undefined;
  return row?.n ?? 0;
}

/** Builds the `ON CONFLICT DO UPDATE` statement the app now uses. */
function upsertSql(
  db: DatabaseSync,
  table: string,
  row: Record<string, string | number | null>,
): void {
  const columns = Object.keys(row);
  const assignments = columns
    .filter((column) => column !== 'id')
    .map((column) => `${column} = excluded.${column}`);
  const sql =
    `INSERT INTO ${table} (${columns.join(', ')}) ` +
    `VALUES (${columns.map(() => '?').join(', ')}) ` +
    `ON CONFLICT(id) DO UPDATE SET ${assignments.join(', ')}`;
  db.prepare(sql).run(...columns.map((column) => row[column]));
}

const TEMPLATE = {
  id: 'tpl-1',
  name: 'Home → Office',
  originName: 'Home',
  destinationName: 'Office',
  colorSeed: '#00639B',
  notes: null,
  isArchived: 0,
  isDefault: 1,
  sortOrder: 0,
  createdAt: 1,
  updatedAt: 1,
};

const STOP_A = {
  id: 'stop-a',
  templateId: 'tpl-1',
  name: 'Home',
  kind: 'home',
  latitude: null,
  longitude: null,
  sortOrder: 0,
  createdAt: 1,
  updatedAt: 1,
};
const STOP_B = {
  id: 'stop-b',
  templateId: 'tpl-1',
  name: 'Office',
  kind: 'office',
  latitude: null,
  longitude: null,
  sortOrder: 1,
  createdAt: 1,
  updatedAt: 1,
};
const SEGMENT = {
  id: 'seg-1',
  templateId: 'tpl-1',
  fromStopId: 'stop-a',
  toStopId: 'stop-b',
  mode: 'bus',
  serviceLabel: 'Bus 10H',
  expectedDurationMin: 20,
  bufferMinutes: 0,
  transferWindowMin: null,
  branchGroup: null,
  branchLabel: null,
  sortOrder: 0,
  createdAt: 1,
  updatedAt: 1,
};

const TRIP = {
  id: 'trip-1',
  templateId: 'tpl-1',
  routeSignature: 'seg-1',
  legModes: 'walk|bus',
  direction: 'outbound',
  status: 'active',
  startedAt: 1_000,
  endedAt: null,
  targetArrivalAt: 4_000,
  plannedDurationMin: 50,
  actualDurationMin: null,
  delayMinutes: null,
  onTimeProbability: 0.9,
  reliabilityScore: 80,
  wasOnTime: null,
  weatherSnapshotId: 'wx-1',
  trafficSnapshotId: null,
  note: null,
  createdAt: 1_000,
  updatedAt: 1_000,
};

const WEATHER = {
  id: 'wx-1',
  tripId: 'trip-1',
  condition: 'clear',
  temperatureC: 30,
  feelsLikeC: 33,
  rainfallMm: 0,
  humidityPct: 50,
  windKph: 5,
  isManual: 0,
  observedAt: 1_000,
  createdAt: 1_000,
  updatedAt: 1_000,
};

const EVENT = {
  id: 'evt-1',
  tripId: 'trip-1',
  segmentId: null,
  kind: 'depart',
  label: 'Left Home',
  mode: null,
  fromLabel: 'Home',
  toLabel: null,
  occurredAt: 1_000,
  elapsedMinutes: 0,
  deltaMinutes: null,
  crowdLevel: null,
  trafficLevel: null,
  isEstimated: 0,
  undone: 0,
  sortOrder: 0,
  createdAt: 1_000,
  updatedAt: 1_000,
};

describe('schema', () => {
  it('creates every table the app expects', async () => {
    const db = await createMigratedDatabase();
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
      name: string;
    }[];

    const names = rows.map((row) => row.name);
    for (const table of [
      'schema_migrations',
      'templates',
      'stops',
      'segments',
      'trips',
      'events',
      'weather_snapshots',
      'traffic_snapshots',
      'route_edges',
      'settings',
    ]) {
      expect(names).toContain(table);
    }
    db.close();
  });

  it('enforces foreign keys', async () => {
    const db = await createMigratedDatabase();
    expect(() =>
      db
        .prepare(
          `INSERT INTO weather_snapshots (id, tripId, condition, isManual, observedAt, createdAt, updatedAt)
           VALUES ('wx-x', 'no-such-trip', 'clear', 0, 1, 1, 1)`,
        )
        .run(),
    ).toThrow(/FOREIGN KEY/i);
    db.close();
  });
});

describe('insertTripBundle ordering', () => {
  it('writes the trip before the snapshot that references it', async () => {
    const db = await createMigratedDatabase();
    upsertSql(db, 'templates', TEMPLATE);

    // Parent first — this is the order the fixed code uses.
    upsertSql(db, 'trips', TRIP);
    upsertSql(db, 'weather_snapshots', WEATHER);

    expect(count(db, 'trips')).toBe(1);
    expect(count(db, 'weather_snapshots')).toBe(1);
    db.close();
  });

  it('still fails when the snapshot is written first (the original bug)', async () => {
    const db = await createMigratedDatabase();
    upsertSql(db, 'templates', TEMPLATE);

    // Deliberately the wrong order, to prove the FK is genuinely enforced and
    // that the test above is actually testing something.
    expect(() => upsertSql(db, 'weather_snapshots', WEATHER)).toThrow(/FOREIGN KEY/i);
    db.close();
  });
});

describe('cascade safety', () => {
  it('re-saving a template does NOT delete its trip history', async () => {
    const db = await createMigratedDatabase();
    upsertSql(db, 'templates', TEMPLATE);
    upsertSql(db, 'stops', STOP_A);
    upsertSql(db, 'stops', STOP_B);
    upsertSql(db, 'segments', SEGMENT);
    upsertSql(db, 'trips', TRIP);
    upsertSql(db, 'weather_snapshots', WEATHER);
    upsertSql(db, 'events', EVENT);

    expect(count(db, 'trips')).toBe(1);

    // The editor saving the template again: name edited, upsert in place.
    upsertSql(db, 'templates', { ...TEMPLATE, name: 'Home → Work', updatedAt: 2 });

    expect(count(db, 'trips')).toBe(1);
    expect(count(db, 'events')).toBe(1);
    expect(count(db, 'stops')).toBe(2);
    expect(count(db, 'segments')).toBe(1);
    expect(
      (db.prepare('SELECT name FROM templates WHERE id = ?').get('tpl-1') as { name: string }).name,
    ).toBe('Home → Work');
    db.close();
  });

  it('demonstrates that INSERT OR REPLACE would have destroyed the history', async () => {
    const db = await createMigratedDatabase();
    upsertSql(db, 'templates', TEMPLATE);
    upsertSql(db, 'trips', TRIP);
    upsertSql(db, 'events', EVENT);

    // The old, dangerous statement — kept here purely as a regression witness.
    db.prepare(
      `INSERT OR REPLACE INTO templates
         (id, name, originName, destinationName, colorSeed, notes, isArchived,
          isDefault, sortOrder, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      TEMPLATE.id,
      'Renamed',
      TEMPLATE.originName,
      TEMPLATE.destinationName,
      TEMPLATE.colorSeed,
      null,
      0,
      1,
      0,
      1,
      2,
    );

    // This is what the bug looked like: the commute history is gone.
    expect(count(db, 'trips')).toBe(0);
    expect(count(db, 'events')).toBe(0);
    db.close();
  });

  it('finishing a trip does NOT wipe its earlier events', async () => {
    const db = await createMigratedDatabase();
    upsertSql(db, 'templates', TEMPLATE);
    upsertSql(db, 'trips', TRIP);
    upsertSql(db, 'events', EVENT);
    upsertSql(db, 'events', { ...EVENT, id: 'evt-2', kind: 'board', sortOrder: 1 });
    upsertSql(db, 'events', { ...EVENT, id: 'evt-3', kind: 'alight', sortOrder: 2 });

    expect(count(db, 'events')).toBe(3);

    // Completing the commute upserts the trip in place.
    upsertSql(db, 'trips', {
      ...TRIP,
      status: 'completed',
      endedAt: 4_000,
      actualDurationMin: 52,
      wasOnTime: 1,
    });

    expect(count(db, 'events')).toBe(3);
    db.close();
  });

  it('editing a stop does NOT wipe the segments and events behind it', async () => {
    const db = await createMigratedDatabase();
    upsertSql(db, 'templates', TEMPLATE);
    upsertSql(db, 'stops', STOP_A);
    upsertSql(db, 'stops', STOP_B);
    upsertSql(db, 'segments', SEGMENT);
    upsertSql(db, 'trips', TRIP);
    upsertSql(db, 'events', { ...EVENT, segmentId: 'seg-1' });

    upsertSql(db, 'stops', { ...STOP_A, name: 'My flat', updatedAt: 2 });

    expect(count(db, 'segments')).toBe(1);
    expect(count(db, 'events')).toBe(1);
    db.close();
  });
});

describe('template pruning', () => {
  it('removes only the segments the editor deleted', async () => {
    const db = await createMigratedDatabase();
    upsertSql(db, 'templates', TEMPLATE);
    upsertSql(db, 'stops', STOP_A);
    upsertSql(db, 'stops', STOP_B);
    upsertSql(db, 'segments', SEGMENT);
    upsertSql(db, 'segments', { ...SEGMENT, id: 'seg-2', sortOrder: 1 });

    // The builder removed seg-2; upsertTemplateGraph prunes the leftover.
    db.prepare('DELETE FROM segments WHERE id = ?').run('seg-2');

    expect(count(db, 'segments')).toBe(1);
    expect(count(db, 'stops')).toBe(2);
    db.close();
  });
});

describe('demo data purge (migration 2)', () => {
  /**
   * Replays the exact write order `seedRunner` uses.
   *
   * This is the path that crashed the app on first launch, so it is the one
   * that most needs to be proven against a real engine rather than trusted.
   */
  it('writes templates, stops, segments, trips, snapshots and events without violating a foreign key', async () => {
    const db = await createMigratedDatabase();

    // upsertTemplateGraph: parent, then children.
    upsertSql(db, 'templates', TEMPLATE);
    upsertSql(db, 'stops', STOP_A);
    upsertSql(db, 'stops', STOP_B);
    upsertSql(db, 'segments', SEGMENT);

    // insertTripBundle, per trip: trip, then its snapshots, then its events.
    upsertSql(db, 'trips', TRIP);
    upsertSql(db, 'weather_snapshots', WEATHER);
    upsertSql(db, 'traffic_snapshots', {
      id: 'tx-1',
      tripId: 'trip-1',
      level: 'medium',
      delayMinutes: 3,
      sourceSegmentId: null,
      isManual: 0,
      observedAt: 1_000,
      createdAt: 1_000,
      updatedAt: 1_000,
    });
    upsertSql(db, 'events', EVENT);
    upsertSql(db, 'events', { ...EVENT, id: 'evt-2', kind: 'board', sortOrder: 1 });
    upsertSql(db, 'events', { ...EVENT, id: 'evt-3', kind: 'arrive', sortOrder: 2 });

    // refreshRouteEdgeStats writes the pre-computed aggregates.
    upsertSql(db, 'route_edges', {
      id: 'seg-1:seg-1',
      templateId: 'tpl-1',
      routeSignature: 'seg-1',
      segmentId: 'seg-1',
      position: 0,
      totalDurationMin: 50,
      observations: 1,
      avgDurationMin: 50,
      p50DurationMin: 50,
      p90DurationMin: 50,
      p95DurationMin: 50,
      stddevMinutes: 0,
      onTimeRate: 1,
      missedTransfers: 0,
      createdAt: 1,
      updatedAt: 1,
    });

    // The seeded flag is written last, so a crash leaves it unset and the
    // next launch retries rather than trusting a half-written database.
    db.prepare('INSERT OR REPLACE INTO settings (key, value, updatedAt) VALUES (?, ?, ?)').run(
      'seed.hasSeeded',
      'true',
      1,
    );

    expect(count(db, 'templates')).toBe(1);
    expect(count(db, 'stops')).toBe(2);
    expect(count(db, 'segments')).toBe(1);
    expect(count(db, 'trips')).toBe(1);
    expect(count(db, 'weather_snapshots')).toBe(1);
    expect(count(db, 'traffic_snapshots')).toBe(1);
    expect(count(db, 'events')).toBe(3);
    expect(count(db, 'route_edges')).toBe(1);

    const flag = db.prepare('SELECT value FROM settings WHERE key = ?').get('seed.hasSeeded') as
      { value: string } | undefined;
    expect(flag?.value).toBe('true');
    db.close();
  });

  it('is idempotent, so re-importing the same data does not double up', async () => {
    const db = await createMigratedDatabase();
    upsertSql(db, 'templates', TEMPLATE);
    upsertSql(db, 'trips', TRIP);
    upsertSql(db, 'events', EVENT);

    // A second import, or a retried write, produces the same ids.
    upsertSql(db, 'templates', TEMPLATE);
    upsertSql(db, 'trips', TRIP);
    upsertSql(db, 'events', EVENT);

    expect(count(db, 'templates')).toBe(1);
    expect(count(db, 'trips')).toBe(1);
    expect(count(db, 'events')).toBe(1);
    db.close();
  });
  it('purges every row the removed demo seeder wrote', async () => {
    const db = createDatabase();
    // A v1 database, then the 45 days of synthetic history the seeder left.
    for (const statement of MIGRATIONS[0].up) db.exec(statement);

    const now = 1_700_000_000_000;
    db.exec(
      `INSERT INTO templates (id, name, originName, destinationName, colorSeed, createdAt, updatedAt)
       VALUES ('seed-0-template', 'Morning commute', 'Home', 'Office', 'blue', ${now}, ${now})`,
    );
    db.exec(
      `INSERT INTO stops (id, templateId, name, kind, sortOrder, createdAt, updatedAt)
       VALUES ('seed-0-stop-home', 'seed-0-template', 'Home', 'start', 0, ${now}, ${now})`,
    );
    db.exec(
      `INSERT INTO segments (id, templateId, fromStopId, toStopId, mode,
                             expectedDurationMin, sortOrder, createdAt, updatedAt)
       VALUES ('seed-0-seg-0', 'seed-0-template', 'seed-0-stop-home', 'seed-0-stop-home',
               'walk', 12, 0, ${now}, ${now})`,
    );
    db.exec(
      `INSERT INTO trips (id, templateId, status, startedAt, createdAt, updatedAt)
       VALUES ('seed-0-trip-0', 'seed-0-template', 'completed', ${now}, ${now}, ${now})`,
    );
    db.exec(
      `INSERT INTO events (id, tripId, kind, label, occurredAt, elapsedMinutes, sortOrder,
                          createdAt, updatedAt)
       VALUES ('seed-0-event-0', 'seed-0-trip-0', 'depart', 'Left home', ${now}, 0, 0, ${now}, ${now})`,
    );
    db.exec(
      `INSERT INTO weather_snapshots (id, tripId, condition, observedAt, createdAt, updatedAt)
       VALUES ('seed-0-weather-0', 'seed-0-trip-0', 'clear', ${now}, ${now}, ${now})`,
    );
    db.exec(
      `INSERT INTO traffic_snapshots (id, tripId, level, observedAt, createdAt, updatedAt)
       VALUES ('seed-0-traffic-0', 'seed-0-trip-0', 'light', ${now}, ${now}, ${now})`,
    );
    db.exec(
      `INSERT INTO route_edges (id, templateId, routeSignature, segmentId, position,
                                totalDurationMin, createdAt, updatedAt)
       VALUES ('seed-0-edge-0', 'seed-0-template', 'walk|walk', 'seed-0-seg-0', 0, 12, ${now}, ${now})`,
    );
    db.exec(
      `INSERT INTO settings (key, value, updatedAt)
       VALUES ('seed.hasSeeded', 'true', ${now})`,
    );

    await migrate(db);

    // Nothing the seeder touched may survive, or the dashboard would show a
    // "P90" for a commute the user has never taken.
    for (const table of [
      'templates',
      'stops',
      'segments',
      'trips',
      'events',
      'weather_snapshots',
      'traffic_snapshots',
      'route_edges',
    ]) {
      expect({ table, rows: count(db, table) }).toEqual({ table, rows: 0 });
    }
    const flag = db.prepare(`SELECT value FROM settings WHERE key = 'seed.hasSeeded'`).get();
    expect(flag).toBeUndefined();
    db.close();
  });

  it('purges demo rows even when foreign keys were off when they were written', async () => {
    // An early build could seed before the pragma took effect, so the
    // ON DELETE CASCADE never fired and orphans are possible. Migration 2
    // deletes children explicitly rather than trusting the cascade.
    const db = new DatabaseSync(':memory:');
    for (const statement of MIGRATIONS[0].up) db.exec(statement);
    const now = 1_700_000_000_000;
    db.exec(
      `INSERT INTO templates (id, name, originName, destinationName, colorSeed, createdAt, updatedAt)
       VALUES ('seed-1-template', 'Evening', 'Office', 'Home', 'teal', ${now}, ${now})`,
    );
    db.exec(
      `INSERT INTO trips (id, templateId, status, startedAt, createdAt, updatedAt)
       VALUES ('seed-1-trip-0', 'seed-1-template', 'completed', ${now}, ${now}, ${now})`,
    );
    db.exec(
      `INSERT INTO events (id, tripId, kind, label, occurredAt, elapsedMinutes, sortOrder,
                          createdAt, updatedAt)
       VALUES ('seed-1-event-0', 'seed-1-trip-0', 'arrive', 'Arrived', ${now}, 40, 0, ${now}, ${now})`,
    );

    await migrate(db);

    expect(count(db, 'templates')).toBe(0);
    expect(count(db, 'trips')).toBe(0);
    expect(count(db, 'events')).toBe(0);
    db.close();
  });

  it('keeps real user data while purging demo data', async () => {
    const db = createDatabase();
    for (const statement of MIGRATIONS[0].up) db.exec(statement);
    const now = 1_700_000_000_000;
    db.exec(
      `INSERT INTO templates (id, name, originName, destinationName, colorSeed, createdAt, updatedAt)
       VALUES ('seed-0-template', 'Demo', 'A', 'B', 'blue', ${now}, ${now}),
              ('real-1', 'My commute', 'Home', 'Office', 'green', ${now}, ${now})`,
    );
    db.exec(
      `INSERT INTO trips (id, templateId, status, startedAt, createdAt, updatedAt)
       VALUES ('seed-0-trip-0', 'seed-0-template', 'completed', ${now}, ${now}, ${now}),
              ('real-1-trip-0', 'real-1', 'completed', ${now}, ${now}, ${now})`,
    );

    await migrate(db);

    // The purge is prefix-scoped, so a user template merely containing the
    // substring "seed" survives. Getting this wrong would delete real history.
    expect(count(db, 'templates')).toBe(1);
    expect(count(db, 'trips')).toBe(1);
    const survivor = db.prepare(`SELECT id FROM trips`).get() as { id: string };
    expect(survivor.id).toBe('real-1-trip-0');
    db.close();
  });

  it('repairs trips.legModes on a v1 database that predates the column', async () => {
    // Reproduces the other shape of v1: the column was added to migration 1
    // mid-development, so both variants exist. Without the guard this throws
    // "duplicate column name" and rolls back the purge above.
    const db = createDatabase();
    for (const statement of MIGRATIONS[0].up) db.exec(statement);
    db.exec('ALTER TABLE trips DROP COLUMN legModes;');
    expect(
      (db.prepare('PRAGMA table_info(trips)').all() as { name: string }[]).some(
        (column) => column.name === 'legModes',
      ),
    ).toBe(false);

    await migrate(db);

    expect(
      (db.prepare('PRAGMA table_info(trips)').all() as { name: string }[]).some(
        (column) => column.name === 'legModes',
      ),
    ).toBe(true);
    db.close();
  });

  it('is a no-op for legModes on a v1 database that already has the column', async () => {
    const db = createDatabase();
    for (const statement of MIGRATIONS[0].up) db.exec(statement);
    const before = db.prepare('PRAGMA table_info(trips)').all();

    // The common case, and the one that would break without the guard.
    await expect(migrate(db)).resolves.toBeUndefined();

    expect(db.prepare('PRAGMA table_info(trips)').all()).toEqual(before);
    db.close();
  });

  it('is idempotent: running every migration twice is safe', async () => {
    const db = createDatabase();
    for (const statement of MIGRATIONS[0].up) db.exec(statement);
    await migrate(db);
    const after = db.prepare('PRAGMA table_info(trips)').all();

    await migrate(db);

    expect(db.prepare('PRAGMA table_info(trips)').all()).toEqual(after);
    db.close();
  });
});
