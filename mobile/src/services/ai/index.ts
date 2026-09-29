/**
 * Explanation service facade.
 *
 * The rest of the app calls `explainRecommendation` and gets a result no
 * matter what: a Gemini sentence when configured, a locally generated one
 * otherwise. Nothing downstream needs to know which happened.
 */
import { type ExplanationAdapter, type ExplanationRequest, type ExplanationResult } from './types';
import { localAdapter, explainLocally } from './local';
import { createGeminiAdapter } from './gemini';

export type { ExplanationAdapter, ExplanationRequest, ExplanationResult } from './types';
export { buildExplanationPrompt, clampWords } from './types';
export { explainLocally, localAdapter } from './local';
export { createGeminiAdapter, type GeminiConfig } from './gemini';

/** Selects the adapter for the current settings. */
export function selectAdapter(options: {
  readonly enabled: boolean;
  readonly apiKey: string;
}): ExplanationAdapter {
  if (!options.enabled) return localAdapter;
  const gemini = createGeminiAdapter({ apiKey: options.apiKey });
  return gemini.isAvailable() ? gemini : localAdapter;
}

/**
 * Produces an explanation, never throwing.
 *
 * A model failure is not an app failure, so any error degrades to the local
 * explanation rather than surfacing an error state to the user.
 */
export async function explainRecommendation(
  request: ExplanationRequest,
  options: { readonly enabled: boolean; readonly apiKey: string },
): Promise<ExplanationResult> {
  const adapter = selectAdapter(options);
  if (adapter.isAvailable()) {
    try {
      return await adapter.explain(request);
    } catch {
      return explainLocally(request);
    }
  }
  return localAdapter.explain(request);
}
