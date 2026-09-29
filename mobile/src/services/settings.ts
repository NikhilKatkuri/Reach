/** Settings repository: typed read/write over the key-value store. */
import { DEFAULT_SETTINGS, SETTING_KEYS, type AppSettings } from '@/src/constants/settings';
import { type ThemePreference } from '@/src/store/theme';
import { type TrafficLevel, type WeatherCondition } from '@/src/types/schemas';
import { deleteSetting, getAllSettings, getSetting, setSetting } from '@/src/db/queries';

/** Parsers for each setting, so invalid stored values fall back to defaults. */
const PARSERS = {
  theme: (value: string) =>
    value === 'light' || value === 'dark' || value === 'system' ? (value as ThemePreference) : null,
  reducedMotion: (value: string) => parseBoolean(value),
  extraBufferMinutes: (value: string) => parseBoundedInt(value, 0, 60),
  defaultWeather: (value: string) =>
    value === 'clear' ||
    value === 'cloudy' ||
    value === 'light_rain' ||
    value === 'rain' ||
    value === 'heavy_rain'
      ? (value as WeatherCondition)
      : null,
  defaultTraffic: (value: string) =>
    value === 'low' || value === 'medium' || value === 'high' || value === 'very_high'
      ? (value as TrafficLevel)
      : null,
  notificationsEnabled: (value: string) => parseBoolean(value),
  reminderLeadMinutes: (value: string) => parseBoundedInt(value, 5, 120),
  geminiApiKey: (value: string) => (value.length > 0 ? value : null),
  aiExplanationsEnabled: (value: string) => parseBoolean(value),
} satisfies { [K in keyof AppSettings]: (value: string) => AppSettings[K] | null };

function parseBoolean(value: string): boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function parseBoundedInt(value: string, min: number, max: number): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < min || parsed > max) return null;
  return parsed;
}

/**
 * Reads all settings, filling gaps with defaults.
 *
 * A missing or unparseable row yields the default rather than an error, so a
 * corrupted settings table can never prevent the app from starting.
 */
export async function loadSettings(): Promise<AppSettings> {
  const raw = await getAllSettings();

  // The parsers are keyed by the same keys as `AppSettings`, so each one
  // narrows its own value. The cast is confined to this one line rather than
  // leaking a loose `Record<string, unknown>` through the rest of the module.
  const out: AppSettings = { ...DEFAULT_SETTINGS };
  const writable = out as unknown as Record<string, unknown>;

  for (const key of Object.keys(SETTING_KEYS) as (keyof AppSettings)[]) {
    const value = raw[SETTING_KEYS[key]];
    if (value === undefined) continue;

    // Each parser is written for its own key, so a successful parse is always
    // that key's type. The write goes through a `string`-keyed view because
    // TypeScript cannot correlate the `keyof` lookup with the union return.
    const parsed = PARSERS[key](value) as unknown;
    if (parsed !== null) writable[key] = parsed;
  }

  return out;
}

/** Reads a single setting with its default applied. */
export async function loadSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
  const value = await getSetting(SETTING_KEYS[key]);
  if (value === null) return DEFAULT_SETTINGS[key];

  // `PARSERS[key]` is the parser written for this key, so a successful parse
  // is that key's type; the assertion just restates the correlation TS cannot
  // see through the `keyof` lookup.
  const parsed = PARSERS[key](value) as AppSettings[K] | null;
  return parsed === null ? DEFAULT_SETTINGS[key] : parsed;
}

/** Persists a single setting. */
export async function saveSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
): Promise<void> {
  await setSetting(SETTING_KEYS[key], String(value));
}

/** Removes a setting, restoring its default. */
export async function resetSetting(key: keyof AppSettings): Promise<void> {
  await deleteSetting(SETTING_KEYS[key]);
}
