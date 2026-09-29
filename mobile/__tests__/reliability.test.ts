/** Reliability scoring: the function that actually picks the route. */
import {
  DEFAULT_WEIGHTS,
  computeReliability,
  confidenceFromObservations,
  crowdScore,
  suggestedBufferMinutes,
  trafficScore,
  varianceScore,
  weatherScore,
} from '@/src/engine/reliability';
import { type ReliabilityInputs } from '@/src/engine/reliability';

/** A well-behaved route on a clear, quiet morning with 20 trips of history. */
function goodInputs(overrides: Partial<ReliabilityInputs> = {}): ReliabilityInputs {
  return {
    punctuality: 0.94,
    coefficientOfVariation: 0.1,
    transferCatchProbability: 0.98,
    crowdLevel: 1,
    trafficLevel: 'low',
    weather: 'clear',
    observations: 20,
    ...overrides,
  };
}

describe('component normalisation', () => {
  it('varianceScore is 1 for a perfectly consistent route and 0 at CV 0.5', () => {
    expect(varianceScore(0)).toBe(1);
    expect(varianceScore(0.5)).toBe(0);
    expect(varianceScore(0.25)).toBe(0.5);
  });

  it('crowdScore runs from 1 (empty) down to 0 (unboardable)', () => {
    expect(crowdScore(0)).toBe(1);
    expect(crowdScore(5)).toBe(0);
    expect(crowdScore(2)).toBeCloseTo(0.6, 10);
  });

  it('trafficScore degrades monotonically', () => {
    const scores = (['low', 'medium', 'high', 'very_high'] as const).map(trafficScore);
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]).toBeLessThan(scores[i - 1] ?? 1);
    }
  });

  it('weatherScore degrades monotonically with severity', () => {
    const scores = (['clear', 'cloudy', 'light_rain', 'rain', 'heavy_rain'] as const).map(
      weatherScore,
    );
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]).toBeLessThan(scores[i - 1] ?? 1);
    }
  });
});

describe('confidenceFromObservations', () => {
  it('is 0 with no history and 1 once saturated', () => {
    expect(confidenceFromObservations(0)).toBe(0);
    expect(confidenceFromObservations(12)).toBe(1);
    expect(confidenceFromObservations(1000)).toBe(1);
  });

  it('rises with the sample size', () => {
    const three = confidenceFromObservations(3);
    const six = confidenceFromObservations(6);
    expect(three).toBeGreaterThan(0);
    expect(six).toBeGreaterThan(three);
  });
});

describe('computeReliability', () => {
  it('scores a well-behaved route highly', () => {
    const result = computeReliability(goodInputs());
    expect(result.score).toBeGreaterThan(85);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.confidence).toBe(1);
  });

  it('stays inside 0..100 for pathological inputs', () => {
    const result = computeReliability(
      goodInputs({
        punctuality: 0,
        coefficientOfVariation: 5,
        transferCatchProbability: 0,
        crowdLevel: 5,
        trafficLevel: 'very_high',
        weather: 'heavy_rain',
        observations: 50,
      }),
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('ranks the components in the documented order of impact', () => {
    // Each variant drives one component to its floor and leaves the rest at
    // the baseline. The score drop is therefore `weight * componentValue`,
    // so ranking the drops pins the weights themselves:
    //
    //   punctuality 0.30 > variance 0.25 > transfer 0.20 > crowd 0.15 > traffic 0.10
    //
    // Transfer risk sits above the two condition proxies on purpose: a missed
    // connection is a step change in lateness, whereas traffic and crowd are
    // already partly baked into the observed durations and would otherwise
    // count twice.
    const base = computeReliability(goodInputs()).score;
    const drop = (overrides: Partial<ReliabilityInputs>) =>
      base - computeReliability(goodInputs(overrides)).score;

    const punctualityDrop = drop({ punctuality: 0 });
    const varianceDrop = drop({ coefficientOfVariation: 0.5 });
    const transferDrop = drop({ transferCatchProbability: 0 });
    const crowdDrop = drop({ crowdLevel: 5 });
    const trafficDrop = drop({ trafficLevel: 'very_high' });

    expect(punctualityDrop).toBeGreaterThan(varianceDrop);
    expect(varianceDrop).toBeGreaterThan(transferDrop);
    expect(transferDrop).toBeGreaterThan(crowdDrop);
    expect(crowdDrop).toBeGreaterThan(trafficDrop);
  });

  it('penalises spread, not just slowness', () => {
    const tight = computeReliability(goodInputs({ coefficientOfVariation: 0.08 }));
    const wide = computeReliability(goodInputs({ coefficientOfVariation: 0.35 }));
    expect(tight.score).toBeGreaterThan(wide.score);
  });

  it('reports exactly neutral when there is no history at all', () => {
    // With zero observations the blend is 0 * raw + 1 * 0.5, so the score
    // cannot be influenced by modelled optimism.
    const noData = computeReliability(
      goodInputs({ punctuality: 1, coefficientOfVariation: 0, observations: 0 }),
    );
    expect(noData.score).toBe(50);
    expect(noData.confidence).toBe(0);
  });

  it('keeps a thin-data score closer to neutral than a well-measured one', () => {
    const weak = computeReliability(
      goodInputs({ punctuality: 0.55, coefficientOfVariation: 0.3, observations: 1 }),
    );
    const strong = computeReliability(
      goodInputs({ punctuality: 0.55, coefficientOfVariation: 0.3, observations: 12 }),
    );

    expect(Math.abs(weak.score - 50)).toBeLessThan(Math.abs(strong.score - 50));
  });

  it('never reports an extreme score without evidence', () => {
    // A perfect-looking route with a single observation must not read as 100.
    const oneTrip = computeReliability(goodInputs({ observations: 1 }));
    expect(oneTrip.score).toBeLessThan(70);
    expect(oneTrip.confidence).toBeLessThan(0.6);
  });

  it('falls back to a neutral punctuality when history provides none', () => {
    const result = computeReliability(goodInputs({ punctuality: null, observations: 0 }));
    expect(result.components.punctuality).toBe(0.5);
  });

  it('returns components and factors for the explain sheet', () => {
    const result = computeReliability(goodInputs({ trafficLevel: 'very_high' }));

    expect(Object.keys(result.components)).toEqual(
      expect.arrayContaining(['punctuality', 'variance', 'transfer', 'crowd', 'traffic']),
    );
    expect(result.factors.length).toBeGreaterThan(0);
    for (const factor of result.factors) {
      expect(typeof factor.detail).toBe('string');
      expect(Number.isFinite(factor.impact)).toBe(true);
    }
  });

  it('orders factors by absolute impact', () => {
    const result = computeReliability(goodInputs({ trafficLevel: 'very_high' }));
    const magnitudes = result.factors.map((factor) => Math.abs(factor.impact));
    for (let i = 1; i < magnitudes.length; i += 1) {
      expect(magnitudes[i]).toBeLessThanOrEqual(magnitudes[i - 1] ?? 0);
    }
  });

  it('mentions the weather only when it actually hurts', () => {
    const clear = computeReliability(goodInputs({ weather: 'clear' }));
    const rain = computeReliability(goodInputs({ weather: 'rain' }));

    expect(clear.factors.some((factor) => factor.key === 'weather')).toBe(false);
    expect(rain.factors.some((factor) => factor.key === 'weather')).toBe(true);
  });

  it('respects custom weights', () => {
    const input = goodInputs({ coefficientOfVariation: 0.45, punctuality: 0.95 });
    const varianceHeavy = computeReliability(input, {
      ...DEFAULT_WEIGHTS,
      variance: 0.6,
      punctuality: 0.1,
    });
    const punctualityHeavy = computeReliability(input, {
      ...DEFAULT_WEIGHTS,
      variance: 0.1,
      punctuality: 0.6,
    });

    expect(varianceHeavy.score).toBeLessThan(punctualityHeavy.score);
  });

  it('gives a route with no transfers full transfer credit', () => {
    // A route with nothing to connect can never miss a connection.
    expect(
      computeReliability(goodInputs({ transferCatchProbability: 1 })).components.transfer,
    ).toBe(1);
  });
});

describe('suggestedBufferMinutes', () => {
  it('grows with the spread', () => {
    const tight = suggestedBufferMinutes({
      p90Minutes: 50,
      standardDeviation: 3,
      transferCount: 0,
      tightTransferCount: 0,
    });
    const wide = suggestedBufferMinutes({
      p90Minutes: 50,
      standardDeviation: 18,
      transferCount: 0,
      tightTransferCount: 0,
    });
    expect(wide).toBeGreaterThan(tight);
  });

  it('grows with tight transfers', () => {
    const easy = suggestedBufferMinutes({
      p90Minutes: 50,
      standardDeviation: 5,
      transferCount: 1,
      tightTransferCount: 0,
    });
    const tight = suggestedBufferMinutes({
      p90Minutes: 50,
      standardDeviation: 5,
      transferCount: 1,
      tightTransferCount: 1,
    });
    expect(tight).toBeGreaterThan(easy);
  });

  it('is clamped to a sane range', () => {
    expect(
      suggestedBufferMinutes({
        p90Minutes: 10,
        standardDeviation: 0,
        transferCount: 0,
        tightTransferCount: 0,
      }),
    ).toBe(2);

    expect(
      suggestedBufferMinutes({
        p90Minutes: 240,
        standardDeviation: 90,
        transferCount: 5,
        tightTransferCount: 5,
      }),
    ).toBe(20);
  });
});
