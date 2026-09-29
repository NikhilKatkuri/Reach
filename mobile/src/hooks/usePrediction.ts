/** Prediction hook, separate from the Today screen's orchestration. */
import { useEffect, useState } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { buildHistoryInput } from '@/src/db/queries';
import {
  EMPTY_HISTORY,
  type ConditionInput,
  type PredictionResult,
  predict,
} from '@/src/engine/prediction';
import { type TemplateGraph } from '@/src/types/schemas';
import { startOfDay } from '@/src/utils/time';

/** Days of history the engine considers when predicting. */
export const PREDICTION_HISTORY_DAYS = 60;

/** Input for {@link usePrediction}. */
export interface UsePredictionOptions {
  readonly graph: TemplateGraph | null;
  readonly targetArrivalAt: number;
  readonly conditions: ConditionInput;
  readonly now?: number;
  readonly enabled?: boolean;
}

/**
 * Runs the prediction engine against a template.
 *
 * Kept separate from `useTodayTrip` so other screens (Insights, the template
 * builder's preview) can ask the same question without duplicating the
 * history query and the condition plumbing.
 */
export function usePrediction(
  options: UsePredictionOptions,
): UseQueryResult<PredictionResult | null> {
  // Reading the clock during render would be an impure operation, so it is
  // captured in a lazy state initialiser and refreshed on an interval.
  const [clock, setClock] = useState<number>(() => options.now ?? Date.now());

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 5 * 60_000);
    return () => clearInterval(timer);
  }, []);

  const { graph, targetArrivalAt, conditions, enabled = true } = options;
  const now = options.now ?? clock;

  return useQuery({
    queryKey: [
      'prediction',
      graph?.template.id ?? null,
      targetArrivalAt,
      conditions.weather,
      conditions.traffic,
      conditions.crowdLevel,
    ],
    enabled: enabled && graph !== null,
    queryFn: async (): Promise<PredictionResult | null> => {
      if (graph === null) return null;

      const sinceMs = startOfDay(now) - PREDICTION_HISTORY_DAYS * 86_400_000;
      const history =
        (await buildHistoryInput({ templateId: graph.template.id, sinceMs })) ?? EMPTY_HISTORY;

      return predict(graph, { now, targetArrivalAt, history, conditions });
    },
  });
}
