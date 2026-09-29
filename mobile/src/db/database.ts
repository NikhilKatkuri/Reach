import { type SQLiteDatabase } from 'expo-sqlite';
import { LATEST_SCHEMA_VERSION, MIGRATIONS } from './migrations';

const DATABASE_NAME = 'reach.db';

/**
 * Reads `PRAGMA user_version`, which we use as the authoritative marker for
 * how far migrations have progressed.
 */
async function readUserVersion(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

async function writeUserVersion(db: SQLiteDatabase, version: number): Promise<void> {
  // `user_version` is a signed 32-bit int and cannot be parameterised.
  await db.execAsync(`PRAGMA user_version = ${Math.trunc(version)}`);
}

/**
 * Applies every migration newer than the database's current `user_version`.
 *
 * Each migration runs in its own transaction, so a failure leaves the
 * database at the last fully-applied version rather than half-migrated.
 */
async function runMigrations(db: SQLiteDatabase): Promise<number> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const current = await readUserVersion(db);

  if (current >= LATEST_SCHEMA_VERSION) {
    return current;
  }

  const pending = MIGRATIONS.filter((migration) => migration.version > current).sort(
    (a, b) => a.version - b.version,
  );

  for (const migration of pending) {
    await db.withExclusiveTransactionAsync(async () => {
      for (const statement of migration.up) {
        await db.execAsync(statement);
      }
      // Runs inside the same transaction, so a throwing `customize` rolls the
      // whole migration back exactly like a failing statement would.
      await migration.customize?.(db);
      await db.runAsync(
        `INSERT OR REPLACE INTO schema_migrations (version, name, appliedAt)
         VALUES (?, ?, ?)`,
        migration.version,
        migration.name,
        Date.now(),
      );
      await writeUserVersion(db, migration.version);
    });
  }

  return LATEST_SCHEMA_VERSION;
}

/**
 * Opens the Reach database and brings it to the latest schema version.
 *
 * Call this from a React effect or at app start; the returned handle is the
 * only thing repository modules need. Re-invoking it returns the same
 * singleton instance.
 */
let handle: Promise<SQLiteDatabase> | null = null;

/** Opens (and migrates) the shared database handle. */
export function getDatabase(): Promise<SQLiteDatabase> {
  handle ??= openAndMigrate();

  return handle;
}

async function openAndMigrate(): Promise<SQLiteDatabase> {
  const { openDatabaseAsync } = await import('expo-sqlite');
  const db = await openDatabaseAsync(DATABASE_NAME);
  await runMigrations(db);
  return db;
}

/** Closes the shared handle. Primarily used by tests. */
export async function closeDatabase(): Promise<void> {
  if (handle === null) return;
  const db = await handle.catch(() => null);
  handle = null;
  if (db !== null) await db.closeAsync();
}

/**
 * Runs `task` inside an exclusive transaction and returns its result.
 *
 * Exclusive transactions serialise against other queries on the same
 * connection, which matters because `expo-sqlite` uses a single connection.
 * Use this for writes that must be atomic (multi-table upserts, imports).
 *
 * `expo-sqlite`'s own signature discards the callback's return value, so the
 * task communicates its result by assigning to a captured variable — see the
 * implementation, which is why callers see a plain `T` back.
 */
export async function withTransaction<T>(db: SQLiteDatabase, task: () => Promise<T>): Promise<T> {
  let result: T;
  await db.withExclusiveTransactionAsync(async () => {
    result = await task();
  });
  return result!;
}
