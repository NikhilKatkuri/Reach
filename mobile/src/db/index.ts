import { Directory, File, Paths } from 'expo-file-system';

const DB_DIR = new Directory(Paths.document, 'reach-db');

async function ensureDir(): Promise<void> {
  if (!DB_DIR.exists) {
    DB_DIR.create({ intermediates: true });
  }
}

const writeQueues = new Map<string, Promise<void>>();

function queueWrite(path: string, task: () => Promise<void>): Promise<void> {
  const prev = writeQueues.get(path) ?? Promise.resolve();
  const next = prev.then(task).catch((err) => {
    console.error(`[jsondb] write failed for ${path}`, err);
    throw err;
  });
  writeQueues.set(path, next);
  return next;
}

export class JsonCollection<T> {
  private file: File;
  private tmpFile: File;
  private cache: T | null = null;

  constructor(
    private name: string,
    private defaultValue: T,
  ) {
    this.file = new File(DB_DIR, `${name}.json`);
    this.tmpFile = new File(DB_DIR, `${name}.json.tmp`);
  }

  async read(): Promise<T> {
    if (this.cache !== null) return this.cache;
    await ensureDir();

    if (!this.file.exists) {
      await this.write(this.defaultValue);
      return this.defaultValue;
    }

    const raw = this.file.textSync();
    this.cache = raw.length ? (JSON.parse(raw) as T) : this.defaultValue;
    return this.cache;
  }

  async write(data: T): Promise<T> {
    this.cache = data;
    await queueWrite(this.file.uri, async () => {
      await ensureDir();
      this.tmpFile.write(JSON.stringify(data));

      if (this.file.exists) {
        this.file.delete();
      }
      this.tmpFile.move(this.file);
    });
    return data;
  }

  async update(mutator: (current: T) => T): Promise<T> {
    const current = await this.read();
    const next = mutator(current);
    await this.write(next);
    return next;
  }

  invalidateCache(): void {
    this.cache = null;
  }
}

export type DbType = typeof JsonCollection.prototype;
