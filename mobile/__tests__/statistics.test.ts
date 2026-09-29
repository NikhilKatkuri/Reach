/**
 * P90 and the rest of the statistical layer.
 *
 * The percentile implementation is the single most load-bearing piece of
 * arithmetic in the app — every recommendation is derived from it — so these
 * tests pin the exact interpolation behaviour rather than just checking
 * monotonicity.
 */
import {
  assumedCoefficientOfVariation,
  buildDurationSample,
  fractionAtOrBelow,
  iqr,
  mad,
  mean,
  median,
  percentile,
  shrinkPercentileToPrior,
  shrinkToPrior,
  stddev,
  summarizeDurations,
  synthesizeDistribution,
  totalDurations,
} from '@/src/engine/statistics';
import { clamp, clamp01, formatPercent, mean as meanOf, round, snap, sum } from '@/src/utils/math';

describe('percentile', () => {
  it('returns null for an empty sample', () => {
    expect(percentile([], 0.9)).toBeNull();
  });

  it('returns the single value for a one-element sample', () => {
    expect(percentile([42], 0.9)).toBe(42);
  });

  it('interpolates linearly between neighbours (R-7 / PERCENTILE.INC)', () => {
    // rank = 0.9 * (5 - 1) = 3.6 → between a[3]=40 and a[4]=50 → 40 + 0.6*10
    expect(percentile([10, 20, 30, 40, 50], 0.9)).toBeCloseTo(46, 10);
  });

  it('returns the exact value when the rank lands on an element', () => {
    // rank = 0.5 * 3 = 1.5 for 4 elements → 15
    expect(percentile([0, 10, 20, 30], 0.5)).toBeCloseTo(15, 10);
  });

  it('clamps p into 0..1', () => {
    const sample = [1, 2, 3, 4];
    expect(percentile(sample, -1)).toBe(1);
    expect(percentile(sample, 2)).toBe(4);
  });

  it('is monotonic in p', () => {
    const sample = [12, 4, 88, 31, 55, 7, 63, 21, 40, 99, 2, 76];
    const values = [0.1, 0.25, 0.5, 0.75, 0.9, 0.95].map((p) => percentile(sample, p) ?? 0);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1] ?? 0);
    }
  });

  it('computes P90 of a right-skewed commute sample', () => {
    // Realistic bus-plus-metro total durations: mostly 40-55, with two bad days.
    const durations = [42, 45, 47, 48, 50, 51, 52, 55, 58, 78];
    const p90 = percentile(durations, 0.9) ?? 0;
    // rank = 0.9 * 9 = 8.1 → 58 + 0.1 * (78 - 58) = 60
    expect(p90).toBeCloseTo(60, 10);
    expect(p90).toBeGreaterThan(median(durations) ?? 0);
  });

  it('leaves the input array untouched', () => {
    const sample = [5, 1, 4, 2, 3];
    percentile(sample, 0.9);
    expect(sample).toEqual([5, 1, 4, 2, 3]);
  });
});

describe('summarizeDurations', () => {
  it('returns a zeroed summary for an empty sample', () => {
    const summary = summarizeDurations([]);
    expect(summary.count).toBe(0);
    expect(summary.mean).toBe(0);
    expect(summary.p90).toBe(0);
    expect(summary.stddev).toBe(0);
  });

  it('drops non-finite values', () => {
    const summary = summarizeDurations([10, Number.NaN, 20, Number.POSITIVE_INFINITY, 30]);
    expect(summary.count).toBe(3);
    expect(summary.mean).toBe(20);
  });

  it('computes the population standard deviation', () => {
    // Population sigma of [2,4,4,4,5,5,7,9] is exactly 2.
    const summary = summarizeDurations([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(summary.mean).toBe(5);
    expect(summary.stddev).toBe(2);
  });

  it('computes the coefficient of variation', () => {
    const summary = summarizeDurations([45, 50, 55]);
    expect(summary.coefficientOfVariation).toBeGreaterThan(0);
    expect(summary.coefficientOfVariation).toBeLessThan(0.2);
  });

  it('reports a zero coefficient of variation for a constant sample', () => {
    expect(summarizeDurations([30, 30, 30]).coefficientOfVariation).toBe(0);
  });

  it('keeps the percentile ordering p50 <= p75 <= p90 <= p95', () => {
    const summary = summarizeDurations([10, 90, 20, 80, 30, 70, 40, 60, 50]);
    expect(summary.p50).toBeLessThanOrEqual(summary.p75);
    expect(summary.p75).toBeLessThanOrEqual(summary.p90);
    expect(summary.p90).toBeLessThanOrEqual(summary.p95);
  });
});

describe('robust spread', () => {
  it('MAD ignores a single extreme outlier, unlike stddev', () => {
    const withOutlier = [45, 47, 48, 50, 52, 95];
    const without = [45, 47, 48, 50, 52, 55];

    expect(mad(withOutlier)).toBeLessThan(mad(without) + 4);
    expect(stddev(withOutlier)).toBeGreaterThan(stddev(without) * 1.5);
  });

  it('MAD of a constant sample is zero', () => {
    expect(mad([25, 25, 25])).toBe(0);
  });

  it('IQR spans the middle half', () => {
    const sample = [10, 20, 30, 40, 50, 60, 70];
    // p25 = 25, p75 = 55
    expect(iqr(sample)).toBeCloseTo(30, 10);
  });
});

describe('shrinkToPrior', () => {
  it('returns the prior exactly when there is no history', () => {
    expect(shrinkToPrior(0, 0, 40, 4)).toBe(40);
  });

  it('returns the observation exactly when the prior weight is zero', () => {
    expect(shrinkToPrior(55, 10, 40, 0)).toBe(55);
  });

  it('blends with weight n/(n+k)', () => {
    // (4 * 60 + 4 * 40) / 8 = 50
    expect(shrinkToPrior(60, 4, 40, 4)).toBe(50);
  });

  it('converges on the observation as history accumulates', () => {
    const early = shrinkToPrior(60, 2, 40, 4);
    const later = shrinkToPrior(60, 40, 40, 4);
    expect(early).toBeGreaterThan(40);
    expect(later).toBeGreaterThan(early);
    expect(later).toBeLessThan(60.5);
  });

  it('shrinks P90 with the same weighting as the mean', () => {
    expect(shrinkPercentileToPrior(70, 4, 50, 4)).toBe(60);
  });
});

describe('assumedCoefficientOfVariation', () => {
  it('shrinks as observations accumulate', () => {
    const none = assumedCoefficientOfVariation(0);
    const few = assumedCoefficientOfVariation(3);
    const many = assumedCoefficientOfVariation(20);

    expect(none).toBeGreaterThan(few);
    expect(few).toBeGreaterThan(many);
    expect(many).toBeGreaterThan(0);
  });

  it('saturates at 12% once the sample is large', () => {
    expect(assumedCoefficientOfVariation(20)).toBe(0.12);
    expect(assumedCoefficientOfVariation(500)).toBe(0.12);
  });
});

describe('synthesizeDistribution', () => {
  it('returns an empty array for a non-positive size', () => {
    expect(synthesizeDistribution(45, 0.2, 0)).toEqual([]);
  });

  it('centres the synthetic sample on the requested mean', () => {
    const sample = synthesizeDistribution(50, 0.2, 20000);
    expect(mean(sample)).toBeGreaterThan(48);
    expect(mean(sample)).toBeLessThan(52);
  });

  it('produces a right-skewed distribution (mean above median)', () => {
    const sample = synthesizeDistribution(45, 0.3, 20000);
    const center = summarizeDurations(sample);
    expect(center.mean).toBeGreaterThan(center.p50);
  });

  it('puts P90 meaningfully above P50', () => {
    const sample = synthesizeDistribution(45, 0.25, 20000);
    const center = summarizeDurations(sample);
    expect(center.p90).toBeGreaterThan(center.p50 * 1.2);
  });
});

describe('buildDurationSample', () => {
  it('uses the real observations once the sample is large enough', () => {
    const observations = [40, 44, 48, 52, 56, 60];
    expect(buildDurationSample({ observations, expectedDurationMin: 45 })).toEqual(observations);
  });

  it('synthesises when there is too little history to trust the sample', () => {
    const observations = [40, 90];
    const sample = buildDurationSample({ observations, expectedDurationMin: 45 });
    expect(sample.length).toBeGreaterThan(observations.length);
  });

  it('switches to a synthetic distribution below the trust threshold', () => {
    // With exactly MIN_TRUSTWORTHY_SAMPLES observations the raw sample is
    // used verbatim, outlier included.
    const trustworthy = [45, 46, 47, 48, 95];
    expect(buildDurationSample({ observations: trustworthy, expectedDurationMin: 46 })).toEqual(
      trustworthy,
    );

    // One sample fewer, and the 95-minute outlier no longer sets the P90: the
    // engine returns a modelled distribution instead.
    const thin = [45, 46, 47, 95];
    const summary = summarizeDurations(
      buildDurationSample({ observations: thin, expectedDurationMin: 46 }),
    );
    expect(summary.count).toBeGreaterThan(thin.length);
    expect(summary.p90).toBeLessThan(95);
  });

  it('shrinks an outlier-heavy mean toward the expected duration', () => {
    const thin = [45, 46, 47, 95];
    const naiveMean = thin.reduce((a, b) => a + b, 0) / thin.length;
    const sample = buildDurationSample({
      observations: thin,
      expectedDurationMin: 46,
      priorWeight: 20,
    });

    // A heavy prior pulls the modelled centre back toward the template value.
    expect(summarizeDurations(sample).mean).toBeLessThan(naiveMean);
  });
});

describe('fractionAtOrBelow', () => {
  it('is 0 for an empty sample', () => {
    expect(fractionAtOrBelow([], 10)).toBe(0);
  });

  it('counts inclusive hits', () => {
    expect(fractionAtOrBelow([10, 20, 30], 20)).toBeCloseTo(2 / 3, 10);
  });

  it('is 1 when everything fits and 0 when nothing does', () => {
    expect(fractionAtOrBelow([10, 20], 100)).toBe(1);
    expect(fractionAtOrBelow([100, 200], 10)).toBe(0);
  });
});

describe('totalDurations', () => {
  it('sums leg-wise samples', () => {
    expect(
      totalDurations([
        [1, 2, 3],
        [10, 20, 30],
      ]),
    ).toEqual([11, 22, 33]);
  });

  it('returns an empty array for no legs', () => {
    expect(totalDurations([])).toEqual([]);
  });
});

describe('math helpers', () => {
  it('clamps into range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp01(1.4)).toBe(1);
  });

  it('returns the lower bound for NaN', () => {
    expect(clamp(Number.NaN, 3, 9)).toBe(3);
  });

  it('rounds and snaps without float drift', () => {
    expect(round(1.005, 2)).toBe(1.01);
    expect(snap(23, 5)).toBe(25);
    expect(snap(23, 0)).toBe(23);
  });

  it('sums and averages', () => {
    expect(sum([1, 2, 3])).toBe(6);
    expect(meanOf([1, 2, 3])).toBe(2);
    expect(meanOf([])).toBeNull();
  });

  it('formats percentages', () => {
    expect(formatPercent(0.925)).toBe('93%');
    expect(formatPercent(0.5)).toBe('50%');
    expect(formatPercent(0.4567, 1)).toBe('45.7%');
    expect(formatPercent(0)).toBe('0%');
  });
});
