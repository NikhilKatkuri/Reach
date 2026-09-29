/** Gemini adapter: explanation only, never a decision maker. */
import { type Prediction, type RouteCandidate, type ReliabilityFactor } from '@/src/types/schemas';

/** What the adapter is asked to explain. */
export interface ExplanationRequest {
  readonly prediction: Prediction;
  readonly candidates: readonly RouteCandidate[];
  readonly factors: readonly ReliabilityFactor[];
  /** Plain-language target, e.g. `HITAM`. */
  readonly destinationName: string;
  /** Commute distance in km, when known, for a more concrete explanation. */
  readonly distanceKm?: number;
}

/** The adapter's result. */
export interface ExplanationResult {
  /** Under 60 words, per the product constraint. */
  readonly text: string;
  /** Which adapter produced this. */
  readonly source: 'gemini' | 'local';
  /** True when the text was generated without a network call. */
  readonly isOffline: boolean;
}

/**
 * The interface every explanation backend must satisfy.
 *
 * Note what is absent: there is no way to ask an adapter which route to take.
 * Route selection happens in `src/engine` and is not reachable from here,
 * which is what guarantees Gemini can only ever explain a decision that has
 * already been made arithmetically.
 */
export interface ExplanationAdapter {
  readonly name: string;
  /** True when the adapter has everything it needs to run. */
  readonly isAvailable: () => boolean;
  readonly explain: (request: ExplanationRequest) => Promise<ExplanationResult>;
}

/** Truncates a message to a word budget, respecting sentence boundaries. */
export function clampWords(text: string, maxWords = 60): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return words.join(' ');

  const truncated = words.slice(0, maxWords);
  const lastStop = truncated.lastIndexOf('.');
  if (lastStop > maxWords * 0.5) {
    return truncated.slice(0, lastStop + 1).join(' ');
  }
  return `${truncated.join(' ').replace(/[,;:]$/, '')}.`;
}

/** Builds the prompt sent to Gemini. */
export function buildExplanationPrompt(request: ExplanationRequest): string {
  const { prediction, candidates, factors, destinationName } = request;

  const candidateLines = candidates
    .map(
      (candidate) =>
        `- ${candidate.isRecommended ? 'RECOMMENDED' : 'alternative'}: ${candidate.label}; ` +
        `typical ${candidate.travelTimeP50Min} min, P90 ${candidate.travelTimeP90Min} min, ` +
        `on time ${Math.round(candidate.onTimeProbability * 100)}%, ` +
        `reliability ${Math.round(candidate.reliabilityScore)}/100`,
    )
    .join('\n');

  const factorLines = factors
    .slice(0, 4)
    .map((factor) => `- ${factor.detail} (${factor.impact >= 0 ? '+' : ''}${factor.impact} pts)`)
    .join('\n');

  return [
    'You explain public-transport commute advice. You do not choose routes.',
    '',
    `Destination: ${destinationName}`,
    `Leave by: ${new Date(prediction.leaveBy).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
    `Typical trip: ${Math.round(prediction.travelTimeP50Min)} min`,
    `P90 trip: ${Math.round(prediction.travelTimeP90Min)} min`,
    `On-time probability: ${Math.round(prediction.onTimeProbability * 100)}%`,
    `Reliability score: ${Math.round(prediction.reliabilityScore)}/100`,
    `Suggested buffer: ${prediction.suggestedBufferMin} min`,
    '',
    'Route options:',
    candidateLines,
    '',
    'Main factors behind the score:',
    factorLines,
    '',
    `Write ONE sentence of at most 60 words explaining why this route was chosen and what could go wrong.`,
    'Be concrete and mention the alternative only if it is genuinely competitive.',
    'Do not use the words "AI", "model" or "algorithm". No preamble.',
  ].join('\n');
}
