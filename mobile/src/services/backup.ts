/** Database backup export and import. */
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { readAllData, replaceAllData } from '@/src/db/queries';
import { z } from 'zod';

/** The shape of a backup file. */
export const backupPayloadSchema = z.object({
  format: z.literal('reach-backup'),
  version: z.literal(1),
  exportedAt: z.number().int(),
  counts: z.record(z.string(), z.number().int()),
  data: z.object({
    templates: z.array(z.record(z.string(), z.unknown())),
    stops: z.array(z.record(z.string(), z.unknown())),
    segments: z.array(z.record(z.string(), z.unknown())),
    trips: z.array(z.record(z.string(), z.unknown())),
    events: z.array(z.record(z.string(), z.unknown())),
    weatherSnapshots: z.array(z.record(z.string(), z.unknown())),
    trafficSnapshots: z.array(z.record(z.string(), z.unknown())),
    settings: z.array(z.record(z.string(), z.unknown())),
  }),
});

/** A parsed backup file. */
export type BackupPayload = z.infer<typeof backupPayloadSchema>;

const BACKUP_DIR = new Directory(Paths.cache, 'reach-backups');

/** Result of an export or import. */
export interface BackupResult {
  readonly fileUri: string;
  readonly fileName: string;
  readonly counts: Record<string, number>;
}

/** Reads every table and returns a serialisable payload. */
export async function buildBackup(): Promise<BackupPayload> {
  const data = await readAllData();

  const counts: Record<string, number> = {
    templates: data.templates.length,
    stops: data.stops.length,
    segments: data.segments.length,
    trips: data.trips.length,
    events: data.events.length,
    weatherSnapshots: data.weatherSnapshots.length,
    trafficSnapshots: data.trafficSnapshots.length,
  };

  return {
    format: 'reach-backup',
    version: 1,
    exportedAt: Date.now(),
    counts,
    data: {
      templates: data.templates as Record<string, unknown>[],
      stops: data.stops as Record<string, unknown>[],
      segments: data.segments as Record<string, unknown>[],
      trips: data.trips as Record<string, unknown>[],
      events: data.events as Record<string, unknown>[],
      weatherSnapshots: data.weatherSnapshots as Record<string, unknown>[],
      trafficSnapshots: data.trafficSnapshots as Record<string, unknown>[],
      settings: data.settings as Record<string, unknown>[],
    },
  };
}

/** Writes a backup to the cache directory and returns its URI. */
export async function writeBackup(payload: BackupPayload): Promise<BackupResult> {
  if (!BACKUP_DIR.exists) {
    BACKUP_DIR.create({ intermediates: true });
  }

  const stamp = new Date(payload.exportedAt).toISOString().replace(/[:.]/g, '-');
  const fileName = `reach-backup-${stamp}.json`;
  const file = new File(BACKUP_DIR, fileName);

  file.create({ overwrite: true });
  file.write(JSON.stringify(payload, null, 2));

  return { fileUri: file.uri, fileName, counts: payload.counts };
}

/** Exports and shares a backup, prompting the platform share sheet. */
export async function exportAndShare(): Promise<BackupResult> {
  const payload = await buildBackup();
  const result = await writeBackup(payload);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(result.fileUri, {
      mimeType: 'application/json',
      dialogTitle: 'Export Reach backup',
      UTI: 'public.json',
    });
  }

  return result;
}

/** Raised when a backup file cannot be used. */
export class BackupImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupImportError';
  }
}

/** Parses and validates backup JSON. */
export function parseBackup(json: string): BackupPayload {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new BackupImportError('That file is not valid JSON.');
  }

  const parsed = backupPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BackupImportError('That file is not a Reach backup.');
  }
  return parsed.data;
}

/** Replaces all local data with a backup's contents. */
export async function importBackup(payload: BackupPayload): Promise<BackupResult> {
  await replaceAllData(payload.data);
  return {
    fileUri: '',
    fileName: `imported-${payload.counts.trips ?? 0}-trips`,
    counts: payload.counts,
  };
}

/** Reads a backup file and applies it. */
export async function importFromUri(uri: string): Promise<BackupResult> {
  const file = new File(uri);
  if (!file.exists) {
    throw new BackupImportError('That file no longer exists.');
  }
  return importBackup(parseBackup(file.textSync()));
}

/** A backup previously written to the app's cache directory. */
export interface LocalBackup {
  readonly uri: string;
  readonly fileName: string;
  readonly writtenAt: number;
}

/**
 * Lists backups this device has exported, newest first.
 *
 * Imports are offered from this list rather than through a system file
 * picker. That keeps the flow working with no extra native dependency, and it
 * is the case that actually matters offline: you exported, you cleared, you
 * want your data back.
 */
export async function listLocalBackups(): Promise<LocalBackup[]> {
  if (!BACKUP_DIR.exists) return [];

  const files = BACKUP_DIR.list().filter(
    (entry): entry is File => entry instanceof File && entry.name.endsWith('.json'),
  );

  return files
    .map((file) => {
      const match = /reach-backup-(\d{4}-\d{2}-\d{2}T[\d-]+Z)\.json$/.exec(file.name);
      const parsed = match?.[1];
      const writtenAt = parsed === undefined ? 0 : Date.parse(parsed);
      return { uri: file.uri, fileName: file.name, writtenAt };
    })
    .sort((a, b) => b.writtenAt - a.writtenAt);
}
