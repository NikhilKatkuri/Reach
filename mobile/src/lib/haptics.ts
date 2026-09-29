/**
 * Haptic feedback wrapper.
 *
 * Centralised so the mapping from a semantic event to a haptic pattern is in
 * one file, and so it degrades to a no-op on simulators and platforms without
 * a taptic engine rather than throwing.
 */
import * as Haptics from 'expo-haptics';

/** Whether the user has asked to reduce haptic feedback. */
let hapticsEnabled = true;

/** Enables or disables haptics app-wide. */
export function setHapticsEnabled(enabled: boolean): void {
  hapticsEnabled = enabled;
}

/** True when haptics are currently enabled. */
export function areHapticsEnabled(): boolean {
  return hapticsEnabled;
}

async function safely(run: () => Promise<void>): Promise<void> {
  if (!hapticsEnabled) return;
  try {
    await run();
  } catch {
    // Haptics are a nicety; never let them break a logging tap.
  }
}

/** Light impact: selection changes, chip taps. */
export function tapLight(): void {
  void safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Medium impact: a logged commute event. */
export function tapMedium(): void {
  void safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** Heavy impact: completing a trip. */
export function tapHeavy(): void {
  void safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
}

/** Success notification: reached the destination. */
export function notifySuccess(): void {
  void safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Warning notification: tight transfer, running late. */
export function notifyWarning(): void {
  void safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

/** Error notification: a failed action. */
export function notifyError(): void {
  void safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}

/** Selection tick: moving a slider or a stepper. */
export function selectionChanged(): void {
  void safely(() => Haptics.selectionAsync());
}
