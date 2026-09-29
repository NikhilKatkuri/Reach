/**
 * The notification service must degrade safely when the native module is
 * unavailable.
 *
 * This is a regression lock for a crash that took the whole app down on
 * Android in Expo Go: `expo-notifications` throws *while it is being
 * evaluated* (push support was removed in SDK 53), and the original static
 * `import * as Notifications` at the top of that module meant the throw
 * propagated through `app/_layout.tsx` and killed every screen.
 *
 * The static imports below are the point of the test: if the service ever
 * goes back to importing the native module eagerly, this suite fails to load.
 *
 * `jest.mock` is hoisted above imports, and the factory deliberately throws
 * to reproduce Expo Go's behaviour exactly.
 */
import {
  REMINDER_LEADS,
  cancelAllReminders,
  configureNotifications,
  ensureChannel,
  notificationsSupported,
  requestPermission,
  scheduleLeaveReminders,
} from '@/src/services/notifications';
import { type Prediction } from '@/src/types/schemas';

jest.mock('expo-notifications', () => {
  // The message is inlined because Jest forbids a mock factory from closing
  // over anything outside it.
  throw new Error(
    'expo-notifications: Android Push notifications (remote notifications) ' +
      'functionality provided by expo-notifications was removed from Expo Go ' +
      'with the release of SDK 53.',
  );
});

/** A minimal prediction, enough to build the reminder copy. */
const PREDICTION: Prediction = {
  templateId: 'tpl-1',
  generatedAt: 1_700_000_000_000,
  targetArrivalAt: 1_700_003_900_000,
  leaveBy: 1_700_002_820_000,
  eta: 1_700_003_700_000,
  fastestDurationMin: 40,
  travelTimeP50Min: 48,
  travelTimeP75Min: 50,
  travelTimeP90Min: 55,
  travelTimeP95Min: 60,
  meanDurationMin: 49,
  stddevMinutes: 6,
  onTimeProbability: 0.92,
  reliabilityScore: 87,
  confidence: 1,
  suggestedBufferMin: 6,
  recommendedSignature: 'a|b',
  recommendedStopIds: ['s1', 's2'],
  algorithmVersion: '1.0.0',
};

describe('notifications when the native module is unavailable', () => {
  it('imports without throwing', () => {
    // The original crash happened at import time. Reaching this assertion at
    // all is the primary regression guard.
    expect(typeof configureNotifications).toBe('function');
  });

  it('reports the platform as unsupported', () => {
    expect(notificationsSupported()).toBe(false);
  });

  it('makes configureNotifications a safe, idempotent no-op', () => {
    expect(() => configureNotifications()).not.toThrow();
    expect(() => configureNotifications()).not.toThrow();
  });

  it('returns false from requestPermission instead of throwing', async () => {
    await expect(requestPermission()).resolves.toBe(false);
  });

  it('resolves an empty list from scheduleLeaveReminders', async () => {
    await expect(
      scheduleLeaveReminders(PREDICTION, {
        leadMinutes: REMINDER_LEADS,
        weather: 'rain',
        traffic: 'high',
      }),
    ).resolves.toEqual([]);
  });

  it('makes cancelAllReminders and ensureChannel safe no-ops', async () => {
    await expect(cancelAllReminders()).resolves.toBeUndefined();
    await expect(ensureChannel()).resolves.toBeUndefined();
  });

  it('still exports the reminder lead times callers depend on', () => {
    expect(REMINDER_LEADS).toEqual([30, 10, 2]);
  });
});
