/**
 * Departure reminder notifications.
 *
 * `expo-notifications` is loaded lazily and defensively. On Android under
 * Expo Go the module throws **while it is being evaluated** (push support was
 * removed in SDK 53), so a plain top-level `import` takes down every screen
 * that transitively touches this file — including `app/_layout.tsx`, which
 * means the whole app. Loading on first use and treating a failure as
 * "notifications unavailable" keeps Reach fully usable in Expo Go on both
 * platforms; reminders simply become a no-op until a development build is
 * used.
 */
import { Platform } from 'react-native';
import { type Prediction } from '@/src/types/schemas';
import { weatherLabel } from '@/src/engine/weatherPenalty';
import { trafficShortLabel } from '@/src/engine/trafficPenalty';

/** The subset of the `expo-notifications` API Reach actually uses. */
type NotificationsModule = typeof import('expo-notifications');

/** Identifier prefix so our notifications can be cancelled as a group. */
const IDENTIFIER_PREFIX = 'reach-reminder-';

/** Android channel used for every Reach reminder. */
const CHANNEL_ID = 'commute-reminders';

/**
 * Memoised module handle.
 *
 * `null` is a cached failure, not "not yet loaded": the module throws on
 * every evaluation in Expo Go, so retrying would just throw again.
 */
let module: NotificationsModule | null | undefined;

/**
 * Loads `expo-notifications` on first use, or returns `null` if unavailable.
 *
 * Metro still bundles the module — `require` with a literal specifier is
 * resolved statically — so this costs nothing at build time while removing
 * the crash-at-import problem at runtime.
 */
function loadNotifications(): NotificationsModule | null {
  if (module !== undefined) return module;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    module = require('expo-notifications') as NotificationsModule;
  } catch {
    module = null;
  }

  return module;
}

let handlerConfigured = false;

/**
 * Registers the foreground notification handler. Safe to call repeatedly.
 *
 * Never throws: on a platform where the module is unavailable this is a no-op.
 */
export function configureNotifications(): void {
  if (handlerConfigured) return;

  const Notifications = loadNotifications();
  if (Notifications === null) return;

  handlerConfigured = true;

  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // A failure here must not stop the app from starting.
  }
}

/** True when this device can actually show Reach's reminders. */
export function notificationsSupported(): boolean {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
  return loadNotifications() !== null;
}

/** Requests notification permission, returning whether it was granted. */
export async function requestPermission(): Promise<boolean> {
  const Notifications = loadNotifications();
  if (Notifications === null) return false;

  configureNotifications();

  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'granted') return true;
    if (current.status === 'denied') return false;

    const requested = await Notifications.requestPermissionsAsync();
    return requested.status === 'granted';
  } catch {
    return false;
  }
}

/** Cancels every reminder Reach has scheduled. */
export async function cancelAllReminders(): Promise<void> {
  const Notifications = loadNotifications();
  if (Notifications === null) return;

  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const ours = scheduled.filter((notification) =>
      notification.identifier.startsWith(IDENTIFIER_PREFIX),
    );
    for (const notification of ours) {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    }
  } catch {
    // Nothing to cancel if the platform cannot schedule them.
  }
}

/** A reminder that has been scheduled. */
export interface ScheduledReminder {
  readonly identifier: string;
  readonly fireAt: number;
  readonly title: string;
  readonly body: string;
}

/**
 * Schedules "leave now" reminders for a prediction.
 *
 * Multiple reminders are supported: a 2-minute heads-up, a 10-minute warning
 * and a 30-minute planning prompt, so the user gets a nudge at whichever
 * moment they happen to be checking their phone. Each carries the buffer
 * recommendation and, when relevant, the weather warning.
 *
 * Returns an empty array when reminders are unavailable, which is the normal
 * outcome in Expo Go on Android.
 */
export async function scheduleLeaveReminders(
  prediction: Prediction,
  options: {
    readonly leadMinutes: readonly number[];
    readonly weather: Parameters<typeof weatherLabel>[0];
    readonly traffic: Parameters<typeof trafficShortLabel>[0];
  },
): Promise<ScheduledReminder[]> {
  const Notifications = loadNotifications();
  if (Notifications === null) return [];

  const granted = await requestPermission();
  if (!granted) return [];

  await ensureChannel();
  await cancelAllReminders();

  const buffer = prediction.suggestedBufferMin;
  const rainWarning =
    options.weather === 'rain' || options.weather === 'heavy_rain'
      ? ` Expect ${weatherLabel(options.weather).toLowerCase()}.`
      : '';

  const reminders: ScheduledReminder[] = [];

  for (const lead of options.leadMinutes) {
    const fireAt = prediction.leaveBy - lead * 60_000;
    if (fireAt <= Date.now()) continue;

    const title = lead <= 10 ? 'Leave now' : 'Reach reminder';
    const body =
      lead <= 10
        ? `Leave now for ${Math.round(prediction.travelTimeP50Min)} min to ` +
          `${Math.round(prediction.onTimeProbability * 100)}% on time. ` +
          `Add ${buffer} min buffer.${rainWarning}`
        : `Plan to leave in ${lead} minutes. ` +
          `Traffic is ${trafficShortLabel(options.traffic).toLowerCase()}.${rainWarning}`;

    try {
      const identifier = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: { templateId: prediction.templateId, leaveBy: prediction.leaveBy },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(fireAt),
          channelId: CHANNEL_ID,
        },
      });

      reminders.push({ identifier, fireAt, title, body });
    } catch {
      // A single failed reminder must not abandon the rest.
    }
  }

  return reminders;
}

/** The lead times Reach offers, in minutes before the leave-by time. */
export const REMINDER_LEADS = [30, 10, 2] as const;

/**
 * Ensures the Android channel exists.
 *
 * Android 13+ only shows the permission prompt once a channel exists, so this
 * must run before requesting permission.
 */
export async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  const Notifications = loadNotifications();
  if (Notifications === null) return;

  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Commute reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 200],
      lightColor: '#00639B',
    });
  } catch {
    // Scheduling still works without an explicit channel.
  }
}
