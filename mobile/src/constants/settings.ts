/** Settings keys and their defaults. */
import { type ThemePreference } from '@/src/store/theme';

/** Every persisted app setting. */
export interface AppSettings {
  /** Colour scheme preference. */
  readonly theme: ThemePreference;
  /** Respect the OS "reduce motion" setting. */
  readonly reducedMotion: boolean;
  /** Extra minutes added on top of the computed leave-by time. */
  readonly extraBufferMinutes: number;
  /** Default weather assumed when the user has not set one. */
  readonly defaultWeather: 'clear' | 'cloudy' | 'light_rain' | 'rain' | 'heavy_rain';
  /** Default traffic assumed when the user has not set one. */
  readonly defaultTraffic: 'low' | 'medium' | 'high' | 'very_high';
  /** Whether departure reminders are scheduled. */
  readonly notificationsEnabled: boolean;
  /** Minutes before the leave-by time to fire the reminder. */
  readonly reminderLeadMinutes: number;
  /** Optional Gemini API key. Blank disables the feature entirely. */
  readonly geminiApiKey: string;
  /** Whether the Gemini explanation adapter may be used. */
  readonly aiExplanationsEnabled: boolean;
}

/** Storage keys, namespaced to avoid collisions. */
export const SETTING_KEYS = {
  theme: 'app.theme',
  reducedMotion: 'app.reducedMotion',
  extraBufferMinutes: 'commute.extraBufferMinutes',
  defaultWeather: 'conditions.defaultWeather',
  defaultTraffic: 'conditions.defaultTraffic',
  notificationsEnabled: 'notifications.enabled',
  reminderLeadMinutes: 'notifications.leadMinutes',
  geminiApiKey: 'ai.geminiApiKey',
  aiExplanationsEnabled: 'ai.enabled',
} as const satisfies Record<keyof AppSettings, string>;

/** Values used before the user changes anything. */
export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  reducedMotion: false,
  extraBufferMinutes: 2,
  defaultWeather: 'clear',
  defaultTraffic: 'medium',
  notificationsEnabled: false,
  reminderLeadMinutes: 15,
  geminiApiKey: '',
  aiExplanationsEnabled: false,
};
