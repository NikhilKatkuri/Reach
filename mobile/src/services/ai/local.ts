/**
 * Deterministic local explanation.
 *
 * Used whenever Gemini is unavailable or switched off. It reads from the same
 * `ReliabilityFactor` list the score is built from, so the text can never
 * disagree with the number.
 */
import {
  type ExplanationAdapter,
  type ExplanationRequest,
  type ExplanationResult,
  clampWords,
} from './types';

/** Formats minutes as `45 min`. */
function minutes(value: number): string {
  return `${Math.round(value)} min`;
}

/** Generates an explanation without any network call. */
export function explainLocally(request: ExplanationRequest): ExplanationResult {
  const { prediction, candidates, factors, destinationName } = request;

  const recommended = candidates.find((candidate) => candidate.isRecommended) ?? null;
  const alternative =
    candidates
      .filter((candidate) => !candidate.isRecommended)
      .sort((a, b) => b.reliabilityScore - a.reliabilityScore)[0] ?? null;

  const dominant = factors[0] ?? null;
  const risk = factors.find((factor) => factor.impact < -2) ?? null;

  const parts: string[] = [];

  parts.push(`Take the ${recommended?.label ?? 'recommended route'} to ${destinationName}.`);

  parts.push(
    `It usually takes ${minutes(prediction.travelTimeP50Min)}, but allow ` +
      `${minutes(prediction.travelTimeP90Min)} so you arrive on time ` +
      `${Math.round(prediction.onTimeProbability * 100)}% of the time.`,
  );

  if (alternative !== null && alternative.reliabilityScore >= prediction.reliabilityScore - 8) {
    parts.push(
      `The ${alternative.label} is close behind at ${Math.round(alternative.reliabilityScore)}/100, ` +
        `so either works today.`,
    );
  }

  if (dominant !== null) {
    parts.push(`${dominant.detail}.`);
  }

  if (risk !== null && risk !== dominant) {
    parts.push(`Watch out: ${risk.detail.toLowerCase()}.`);
  }

  if (prediction.suggestedBufferMin > 0) {
    parts.push(`Add ${prediction.suggestedBufferMin} min of slack.`);
  }

  return {
    text: clampWords(parts.join(' '), 60),
    source: 'local',
    isOffline: true,
  };
}

/** The offline adapter. Always available. */
export const localAdapter: ExplanationAdapter = {
  name: 'local',
  isAvailable: () => true,
  explain: async (request) => explainLocally(request),
};
