/**
 * Gemini adapter.
 *
 * This is the only place the app talks to a model, and it does exactly one
 * thing: turn an already-computed recommendation into a sentence. It is not
 * given the user's history, their location, or any means of choosing a
 * route, and its output is truncated to 60 words before display.
 *
 * If the API key is absent, the network fails, or the user has switched the
 * feature off, the caller falls back to `localAdapter` and nothing else in
 * the app changes behaviour.
 */
import {
  type ExplanationAdapter,
  type ExplanationRequest,
  type ExplanationResult,
  buildExplanationPrompt,
  clampWords,
} from './types';

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Configuration for the Gemini adapter. */
export interface GeminiConfig {
  readonly apiKey: string;
  readonly model?: string;
  readonly timeoutMs?: number;
}

/** Default model. A fast tier keeps the explanation snappy. */
const DEFAULT_MODEL = 'gemini-2.5-flash';

/** Default request timeout. The local fallback is instant, so this can be short. */
const DEFAULT_TIMEOUT_MS = 8000;

/** Creates a Gemini-backed explanation adapter. */
export function createGeminiAdapter(config: GeminiConfig): ExplanationAdapter {
  const model = config.model ?? DEFAULT_MODEL;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    name: 'gemini',

    isAvailable: () => config.apiKey.trim().length > 0,

    explain: async (request: ExplanationRequest): Promise<ExplanationResult> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(
          `${GEMINI_ENDPOINT}/${model}:generateContent?key=${encodeURIComponent(config.apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              systemInstruction: {
                parts: [
                  {
                    text: 'You write one short sentence of plain-English transit advice. Never mention AI, models or algorithms. Never choose a route — the route is given to you.',
                  },
                ],
              },
              contents: [{ role: 'user', parts: [{ text: buildExplanationPrompt(request) }] }],
              generationConfig: { maxOutputTokens: 160, temperature: 0.3 },
            }),
          },
        );

        if (!response.ok) {
          throw new Error(`Gemini responded with ${response.status}`);
        }

        const payload = (await response.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };

        const text = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text === undefined || text.length === 0) {
          throw new Error('Gemini returned an empty response');
        }

        return { text: clampWords(text, 60), source: 'gemini', isOffline: false };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
