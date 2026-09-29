/**
 * How much personal history actually exists.
 *
 * Reach has to be honest that a prediction built on three trips is not the same
 * kind of claim as one built on forty. This module names those stages so the
 * UI can say so, and — more importantly — so the *engine's* confidence
 * thresholds and the *interface's* wording stay derived from one place.
 *
 * The bands are UX guidance, not statistics. With 15 trips a percentile is
 * still a very rough estimate, and nothing here claims otherwise. What the
 * bands do guarantee is that the app never presents a cold-start number in the
 * same words as a well-measured one.
 */

/** The stages a commute moves through as trips accumulate. */
export type HistoryDepth = 'none' | 'initial' | 'early' | 'comparison' | 'strong';

/** Trip-count thresholds, ascending and gap-free. */
const THRESHOLDS = {
  /** 1–2 trips: the first number is barely more than the one trip. */
  initial: 1,
  /** 3–6: a pattern is starting to appear. */
  early: 3,
  /** 7–14: different routes can be compared meaningfully. */
  comparison: 7,
  /** 15+: enough history to lean on. */
  strong: 15,
} as const;

/** Classifies a trip count. */
export function historyDepth(observations: number): HistoryDepth {
  if (observations < THRESHOLDS.initial) return 'none';
  if (observations < THRESHOLDS.early) return 'initial';
  if (observations < THRESHOLDS.comparison) return 'early';
  if (observations < THRESHOLDS.strong) return 'comparison';
  return 'strong';
}

/** Short label for the current stage. */
export function historyDepthLabel(depth: HistoryDepth): string {
  switch (depth) {
    case 'none':
      return 'Learning this commute';
    case 'initial':
      return 'First estimate';
    case 'early':
      return 'Early pattern';
    case 'comparison':
      return 'Comparing routes';
    case 'strong':
      return 'Based on your history';
  }
}

/** A sentence saying plainly how much is known. */
export function historyDepthSentence(depth: HistoryDepth, observations: number): string {
  switch (depth) {
    case 'none':
      return 'No trips recorded yet. Your first few trips set the baseline.';
    case 'initial':
      return `${observations} ${observations === 1 ? 'trip' : 'trips'} recorded. This estimate will change as you travel it more.`;
    case 'early':
      return `${observations} trips recorded. A pattern is starting to show, but the numbers are still rough.`;
    case 'comparison':
      return `${observations} trips recorded. Reach can now compare your routes against each other.`;
    case 'strong':
      return `${observations} trips recorded. These numbers come from your own history.`;
  }
}

/**
 * Whether a prediction at this depth may be presented as personalised.
 *
 * A guard rather than a hint: the zero-data case is where an app is most
 * tempted to display a confident-looking estimate derived from nothing but
 * the user's guesses, and that is precisely the claim Reach must not make.
 */
export function isPersonalised(depth: HistoryDepth): boolean {
  return depth !== 'none';
}

/**
 * How many more trips until the next band.
 *
 * `null` once the strongest band is reached. Used for "3 more trips and Reach
 * can compare your routes", which is a concrete reason to log rather than a
 * vague one.
 */
export function tripsUntilNextBand(observations: number): { count: number; label: string } | null {
  const current = historyDepth(observations);
  switch (current) {
    case 'none':
      return { count: THRESHOLDS.initial, label: 'First estimate' };
    case 'initial':
      return { count: THRESHOLDS.early, label: 'Early pattern' };
    case 'early':
      return { count: THRESHOLDS.comparison, label: 'Comparing routes' };
    case 'comparison':
      return { count: THRESHOLDS.strong, label: 'Based on your history' };
    case 'strong':
      return null;
  }
}
