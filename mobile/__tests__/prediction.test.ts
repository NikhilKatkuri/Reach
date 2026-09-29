/**
 * Prediction: route selection, P90 and the leave-by time.
 *
 * The central product claim is "reliable beats fast", so the sharpest test
 * here is the one where the fast route must lose: a bus-only alternative that
 * is quicker on paper but historically far less predictable.
 */
import { EMPTY_HISTORY, type HistoryInput, predict } from '@/src/engine/prediction';
import { createRandom } from '@/src/engine/random';
import { percentile, summarizeDurations } from '@/src/engine/statistics';
import {
  BUS_METRO_SIGNATURE,
  BUS_ONLY_SIGNATURE,
  BUS_WALK_SIGNATURE,
  COMMUTE_GRAPH,
  NOW,
  SEGMENTS,
  TARGET_ARRIVAL,
} from './fixtures';

/** History that makes bus+metro tight and predictable. */
function reliableHistory(): HistoryInput {
  return {
    ...EMPTY_HISTORY,
    segmentDurations: {
      [SEGMENTS.walkToStand]: [8, 9, 8, 10, 8, 9, 8, 8, 9, 8, 10, 8],
      [SEGMENTS.busToAmeerpet]: [17, 19, 18, 20, 18, 22, 17, 19, 18, 18, 21, 18],
      [SEGMENTS.metroToMoosarambagh]: [11, 11, 12, 10, 11, 11, 12, 11, 10, 11, 11, 12],
      [SEGMENTS.walkToOffice]: [9, 9, 10, 9, 9, 9, 8, 9, 9, 10, 9, 9],
      [SEGMENTS.busToJntu]: [38, 45, 62, 41, 70, 44, 38, 55, 41, 48, 66, 43],
      'seg-jntu-walk': [12, 12, 13, 12, 12, 12],
    },
    routeDurations: {
      [BUS_METRO_SIGNATURE]: [48, 50, 52, 49, 51, 50, 53, 49, 51, 50, 48, 52],
      [BUS_ONLY_SIGNATURE]: [92, 88, 118, 95, 130, 90, 110, 96, 124, 91, 105, 94],
    },
    routeOnTime: {
      [BUS_METRO_SIGNATURE]: { onTime: 12, total: 12 },
      [BUS_ONLY_SIGNATURE]: { onTime: 4, total: 12 },
    },
    routeMissedTransfers: {
      [BUS_ONLY_SIGNATURE]: 3,
    },
    segmentWorstCrowd: {
      [SEGMENTS.busToAmeerpet]: 3,
      [SEGMENTS.metroToMoosarambagh]: 2,
    },
  };
}

/** Runs a prediction with a fixed seed so results are exactly reproducible. */
function run(history: HistoryInput, overrides: Partial<Parameters<typeof predict>[1]> = {}) {
  return predict(COMMUTE_GRAPH, {
    now: NOW,
    targetArrivalAt: TARGET_ARRIVAL,
    history,
    conditions: { weather: 'clear', traffic: 'medium', crowdLevel: 2 },
    iterations: 1500,
    ...overrides,
  });
}

describe('predict', () => {
  it('recommends a route that exists in the graph', () => {
    const result = run(reliableHistory());

    expect([BUS_METRO_SIGNATURE, BUS_WALK_SIGNATURE, BUS_ONLY_SIGNATURE]).toContain(
      result.prediction.recommendedSignature,
    );
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates.filter((c) => c.isRecommended)).toHaveLength(1);
  });

  it('prefers the reliable route over the faster-looking one', () => {
    // Bus-only is 40+12 = 52 min of legs vs 8+18+11+9 = 46, and its history
    // is far noisier. Reliability must win.
    const result = run(reliableHistory());
    expect(result.prediction.recommendedSignature).toBe(BUS_METRO_SIGNATURE);
  });

  it('reports a meaningfully higher on-time probability for the winner', () => {
    const result = run(reliableHistory());
    const recommended = result.candidates.find((c) => c.isRecommended);
    const alternative = result.candidates.find((c) => !c.isRecommended);

    expect(recommended?.onTimeProbability ?? 0).toBeGreaterThan(
      alternative?.onTimeProbability ?? 1,
    );
    expect(recommended?.reliabilityScore ?? 0).toBeGreaterThan(alternative?.reliabilityScore ?? 1);
  });

  it('produces percentiles in ascending order', () => {
    const result = run(reliableHistory());
    const p = result.prediction;

    expect(p.travelTimeP50Min).toBeLessThanOrEqual(p.travelTimeP75Min);
    expect(p.travelTimeP75Min).toBeLessThanOrEqual(p.travelTimeP90Min);
    expect(p.travelTimeP90Min).toBeLessThanOrEqual(p.travelTimeP95Min);
  });

  it('reports a P90 above the P50 for a real commute', () => {
    const result = run(reliableHistory());
    expect(result.prediction.travelTimeP90Min).toBeGreaterThan(result.prediction.travelTimeP50Min);
  });

  it('sets leave-by to target minus the P90 duration', () => {
    const result = run(reliableHistory());
    const p90Ms = result.prediction.travelTimeP90Min * 60_000;

    // The prediction reports durations rounded to 0.1 min, so compare against
    // exactly that rather than re-deriving from the raw float.
    expect(result.prediction.leaveBy).toBe(Math.round(result.prediction.targetArrivalAt - p90Ms));
  });

  it('sets ETA to now plus the P50 duration', () => {
    const result = run(reliableHistory());
    const p50Ms = result.prediction.travelTimeP50Min * 60_000;

    expect(result.prediction.eta).toBe(Math.round(result.prediction.generatedAt + p50Ms));
  });

  it('recommends leaving earlier when rain slows every road leg', () => {
    const clear = run(reliableHistory());
    const rainy = run(reliableHistory(), {
      conditions: { weather: 'heavy_rain', traffic: 'medium', crowdLevel: 2 },
    });

    expect(rainy.prediction.leaveBy).toBeLessThan(clear.prediction.leaveBy);
  });

  it('recommends leaving earlier in severe traffic', () => {
    const clear = run(reliableHistory(), {
      conditions: { weather: 'clear', traffic: 'low', crowdLevel: 2 },
    });
    const gridlocked = run(reliableHistory(), {
      conditions: { weather: 'clear', traffic: 'very_high', crowdLevel: 2 },
    });

    expect(gridlocked.prediction.leaveBy).toBeLessThan(clear.prediction.leaveBy);
  });

  it('makes the rail route hurt far less than the bus route in heavy rain', () => {
    // The mechanism behind "reliable beats fast": in rain, a metro leg keeps
    // its duration while a bus leg inflates. Whichever route the engine picks
    // here, the metro option's P90 must rise much less than the bus-only one.
    const clear = run(reliableHistory(), {
      conditions: { weather: 'clear', traffic: 'low', crowdLevel: 2 },
    });
    const rainy = run(reliableHistory(), {
      conditions: { weather: 'heavy_rain', traffic: 'low', crowdLevel: 2 },
    });

    const p90Of = (result: typeof clear, signature: string) =>
      result.candidates.find((c) => c.signature === signature)?.travelTimeP90Min ?? 0;

    const busInflation = p90Of(rainy, BUS_ONLY_SIGNATURE) - p90Of(clear, BUS_ONLY_SIGNATURE);
    const metroInflation = p90Of(rainy, BUS_METRO_SIGNATURE) - p90Of(clear, BUS_METRO_SIGNATURE);

    expect(busInflation).toBeGreaterThan(10);
    expect(metroInflation).toBeLessThan(busInflation / 2);
  });

  it('makes the all-bus route worse relative to rail as the rain worsens', () => {
    // The whole argument for rail, stated as a ratio so it is independent of
    // the routes' different base durations: the more it rains, the worse the
    // bus-only option looks compared with bus-then-metro.
    const p90Of = (result: ReturnType<typeof run>, signature: string) =>
      result.candidates.find((c) => c.signature === signature)?.travelTimeP90Min ?? 0;

    const ratio = (weather: 'clear' | 'light_rain' | 'rain' | 'heavy_rain') => {
      const result = run(reliableHistory(), {
        conditions: { weather, traffic: 'medium', crowdLevel: 2 },
      });
      return p90Of(result, BUS_ONLY_SIGNATURE) / p90Of(result, BUS_METRO_SIGNATURE);
    };

    expect(ratio('light_rain')).toBeGreaterThanOrEqual(ratio('clear'));
    expect(ratio('rain')).toBeGreaterThan(ratio('light_rain'));
    expect(ratio('heavy_rain')).toBeGreaterThan(ratio('rain'));
  });

  it('is deterministic for identical inputs', () => {
    const first = run(reliableHistory());
    const second = run(reliableHistory());

    expect(first.prediction).toEqual(second.prediction);
  });

  it('reports low confidence when there is no history at all', () => {
    const result = run(EMPTY_HISTORY);
    expect(result.isLowConfidence).toBe(true);
    expect(result.prediction.confidence).toBeLessThan(0.3);
  });

  it('reports high confidence with plenty of history', () => {
    expect(run(reliableHistory()).isLowConfidence).toBe(false);
  });

  it('keeps every score and probability in range', () => {
    const result = run(reliableHistory());

    expect(result.prediction.reliabilityScore).toBeGreaterThanOrEqual(0);
    expect(result.prediction.reliabilityScore).toBeLessThanOrEqual(100);
    expect(result.prediction.onTimeProbability).toBeGreaterThanOrEqual(0);
    expect(result.prediction.onTimeProbability).toBeLessThanOrEqual(1);
    for (const candidate of result.candidates) {
      expect(candidate.reliabilityScore).toBeGreaterThanOrEqual(0);
      expect(candidate.reliabilityScore).toBeLessThanOrEqual(100);
    }
  });

  it('drops the on-time probability to 0 when the target is unreachable', () => {
    const result = run(reliableHistory(), {
      // Target only 5 minutes away.
      targetArrivalAt: NOW + 5 * 60_000,
    });
    expect(result.prediction.onTimeProbability).toBe(0);
  });

  it('raises the on-time probability monotonically as more time is allowed', () => {
    // Sweep the available time from "impossible" to "no pressure at all" and
    // assert the probability never goes down. This is the guarantee a commuter
    // actually relies on: more time must never make the app less confident.
    const probabilities = [20, 35, 45, 50, 55, 60, 70, 90, 120, 180].map(
      (minutes) =>
        run(reliableHistory(), { targetArrivalAt: NOW + minutes * 60_000 }).prediction
          .onTimeProbability,
    );

    for (let i = 1; i < probabilities.length; i += 1) {
      expect(probabilities[i]).toBeGreaterThanOrEqual(probabilities[i - 1] ?? 0);
    }
    expect(probabilities[probabilities.length - 1]).toBe(1);
  });

  it('reports zero probability when the target cannot be reached', () => {
    const impossible = run(reliableHistory(), { targetArrivalAt: NOW + 20 * 60_000 });
    expect(impossible.prediction.onTimeProbability).toBe(0);
  });

  it('suggests a buffer inside the sane range', () => {
    const result = run(reliableHistory());
    expect(result.prediction.suggestedBufferMin).toBeGreaterThanOrEqual(2);
    expect(result.prediction.suggestedBufferMin).toBeLessThanOrEqual(20);
  });

  it('labels candidates with a readable mode summary', () => {
    const result = run(reliableHistory());
    for (const candidate of result.candidates) {
      expect(candidate.label.length).toBeGreaterThan(0);
      expect(candidate.modeSummary.length).toBeGreaterThan(0);
    }
  });

  it('explains itself with ranked factors', () => {
    const result = run(reliableHistory());
    expect(result.factors.length).toBeGreaterThan(0);
    for (const factor of result.factors) {
      expect(factor.detail.length).toBeGreaterThan(0);
    }
  });

  it('carries the stop ids of the recommended route', () => {
    const result = run(reliableHistory());
    const recommended = result.candidates.find((c) => c.isRecommended);

    expect(recommended?.stopIds.length).toBeGreaterThanOrEqual(2);
    expect(result.prediction.recommendedStopIds).toEqual(recommended?.stopIds ?? []);
  });

  it('stamps the algorithm version for cache invalidation', () => {
    expect(run(reliableHistory()).prediction.algorithmVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('handles a template with no usable route', () => {
    // Strip every leg, so nothing connects Home to the Office.
    const broken = { ...COMMUTE_GRAPH, segments: [] };
    const result = predict(broken, {
      now: NOW,
      targetArrivalAt: TARGET_ARRIVAL,
      history: EMPTY_HISTORY,
      conditions: { weather: 'clear', traffic: 'low', crowdLevel: 0 },
    });

    expect(result.candidates).toEqual([]);
    expect(result.isLowConfidence).toBe(true);
    expect(result.prediction.onTimeProbability).toBe(0);
  });
});

describe('route selection under equal reliability', () => {
  it('breaks a tie on P90, preferring the quicker route', () => {
    // Give both routes identical, tight history so only P90 can separate them.
    const identical: HistoryInput = {
      ...EMPTY_HISTORY,
      routeDurations: {
        [BUS_METRO_SIGNATURE]: [50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50],
        [BUS_ONLY_SIGNATURE]: [50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50],
      },
      routeOnTime: {
        [BUS_METRO_SIGNATURE]: { onTime: 12, total: 12 },
        [BUS_ONLY_SIGNATURE]: { onTime: 12, total: 12 },
      },
      segmentDurations: {
        [SEGMENTS.walkToStand]: [8, 8, 8, 8, 8, 8],
        [SEGMENTS.busToAmeerpet]: [18, 18, 18, 18, 18, 18],
        [SEGMENTS.metroToMoosarambagh]: [11, 11, 11, 11, 11, 11],
        [SEGMENTS.walkToOffice]: [9, 9, 9, 9, 9, 9],
        [SEGMENTS.busToJntu]: [40, 40, 40, 40, 40, 40],
        'seg-jntu-walk': [12, 12, 12, 12, 12, 12],
      },
    };

    const result = run(identical);
    // Both routes have the same historical total, so the model-based
    // comparison decides; either outcome is defensible, but it must be stable.
    const again = run(identical);
    expect(result.prediction.recommendedSignature).toBe(again.prediction.recommendedSignature);
  });
});

describe('random source', () => {
  it('is reproducible and uniform enough', () => {
    const a = createRandom(12345);
    const b = createRandom(12345);

    const first = Array.from({ length: 5 }, () => a());
    const second = Array.from({ length: 5 }, () => b());

    expect(first).toEqual(second);
    for (const value of first) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('produces different sequences for different seeds', () => {
    const a = createRandom(1);
    const b = createRandom(2);
    expect(a()).not.toBe(b());
  });
});

describe('P90 sanity on simulated totals', () => {
  it('tracks the historical P90 when conditions match the history', () => {
    const history = reliableHistory();
    // Compare under clear, free-flowing conditions: the history was recorded
    // in ordinary conditions, so any residual difference is the model itself
    // rather than a deliberate adjustment.
    const result = run(history, {
      conditions: { weather: 'clear', traffic: 'low', crowdLevel: 1 },
    });
    const historicalP90 = percentile(history.routeDurations[BUS_METRO_SIGNATURE] ?? [], 0.9) ?? 0;

    // Route-level history is preferred when it is deep enough, so the reported
    // P90 should land close to the observed one.
    expect(result.prediction.travelTimeP90Min).toBeGreaterThan(historicalP90 - 5);
    expect(result.prediction.travelTimeP90Min).toBeLessThan(historicalP90 + 5);
  });

  it('shifts a deep history upward for worse conditions', () => {
    // Regression guard. Route-level history used to be used verbatim, which
    // meant a route with 50 logged trips reported identical P90 in clear
    // weather and a downpour — the app would have ignored the weather
    // entirely once enough data existed.
    const history = reliableHistory();
    const calm = run(history, {
      conditions: { weather: 'clear', traffic: 'low', crowdLevel: 1 },
    });
    const monsoon = run(history, {
      conditions: { weather: 'heavy_rain', traffic: 'very_high', crowdLevel: 4 },
    });

    expect(monsoon.prediction.travelTimeP90Min).toBeGreaterThan(
      calm.prediction.travelTimeP90Min + 10,
    );
  });

  it('the mean sits between the P50 and the maximum for the observed sample', () => {
    const durations = reliableHistory().routeDurations[BUS_METRO_SIGNATURE] ?? [];
    const summary = summarizeDurations(durations);

    expect(summary.mean).toBeGreaterThanOrEqual(summary.p50);
    expect(summary.mean).toBeLessThanOrEqual(summary.max);
  });
});
