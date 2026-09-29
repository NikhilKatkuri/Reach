/** Weather, traffic and crowd penalty models. */
import {
  DEFAULT_WEATHER_PENALTY,
  WEATHER_SEVERITY,
  routeWeatherPenalty,
  weatherAffectsCommute,
  weatherLabel,
  weatherPenalty,
  weatherSeverity,
} from '@/src/engine/weatherPenalty';
import {
  DEFAULT_TRAFFIC_PENALTY,
  routeTrafficPenalty,
  trafficLabel,
  trafficPenalty,
  trafficSeverity,
  trafficShortLabel,
} from '@/src/engine/trafficPenalty';
import {
  BOARDING_DELAY_MINUTES,
  crowdAffectsCommute,
  crowdLabel,
  crowdPenalty,
  crowdShortLabel,
  transferCrowdDispersion,
} from '@/src/engine/crowdPenalty';
import { type TransportMode } from '@/src/types/schemas';

const ALL_MODES: TransportMode[] = ['walk', 'bus', 'metro', 'train', 'auto', 'bike', 'cab'];

describe('weatherPenalty', () => {
  it('is zero for clear skies on every mode', () => {
    for (const mode of ALL_MODES) {
      const penalty = weatherPenalty('clear', mode, 20);
      if (mode === 'cab') {
        // Cabs keep a small residual allowance for pickup variance.
        expect(penalty.fraction).toBeLessThanOrEqual(0.02);
      } else {
        expect(penalty.addedMinutes).toBe(0);
        expect(penalty.adjustedDurationMin).toBe(20);
      }
    }
  });

  it('hurts road transport more than rail in heavy rain', () => {
    const bus = weatherPenalty('heavy_rain', 'bus', 20);
    const metro = weatherPenalty('heavy_rain', 'metro', 20);

    expect(bus.addedMinutes).toBeGreaterThan(metro.addedMinutes * 5);
    expect(bus.fraction).toBeGreaterThan(0.5);
    expect(metro.fraction).toBeLessThan(0.1);
  });

  it('scales the penalty with the leg duration', () => {
    const short = weatherPenalty('rain', 'bus', 10);
    const long = weatherPenalty('rain', 'bus', 40);

    expect(long.addedMinutes).toBeCloseTo(short.addedMinutes * 4, 10);
  });

  it('treats light rain as a nuisance, not a planning problem', () => {
    const penalty = weatherPenalty('light_rain', 'bus', 20);
    expect(penalty.fraction).toBeLessThan(0.1);
  });

  it('monotonically increases with severity for every mode', () => {
    for (const mode of ALL_MODES) {
      const fractions = WEATHER_SEVERITY.map(
        (condition) => weatherPenalty(condition, mode, 20).fraction,
      );
      for (let i = 1; i < fractions.length; i += 1) {
        expect(fractions[i]).toBeGreaterThanOrEqual(fractions[i - 1] ?? 0);
      }
    }
  });

  it('accepts a custom penalty table', () => {
    const table = {
      ...DEFAULT_WEATHER_PENALTY,
      rain: { ...DEFAULT_WEATHER_PENALTY.rain, bus: 1 },
    };
    const penalty = weatherPenalty('rain', 'bus', 20, table);
    expect(penalty.adjustedDurationMin).toBe(40);
  });

  it('clamps an absurd custom penalty', () => {
    const table = {
      ...DEFAULT_WEATHER_PENALTY,
      rain: { ...DEFAULT_WEATHER_PENALTY.rain, bus: 99 },
    };
    expect(weatherPenalty('rain', 'bus', 10, table).fraction).toBe(3);
  });
});

describe('routeWeatherPenalty', () => {
  it('sums the per-leg penalties and reports a real adjusted total', () => {
    const legs = [
      { mode: 'walk' as const, durationMin: 10 },
      { mode: 'bus' as const, durationMin: 20 },
      { mode: 'metro' as const, durationMin: 10 },
    ];
    const result = routeWeatherPenalty('rain', legs);

    const expected = legs.reduce(
      (total, leg) => total + weatherPenalty('rain', leg.mode, leg.durationMin).addedMinutes,
      0,
    );

    expect(result.totalAddedMinutes).toBeCloseTo(expected, 10);
    expect(result.adjustedTotalMin).toBeCloseTo(40 + expected, 10);
    expect(result.byMode.bus).toBeGreaterThan(0);
  });

  it('leaves a metro-only commute nearly untouched by rain', () => {
    const result = routeWeatherPenalty('heavy_rain', [{ mode: 'metro', durationMin: 30 }]);
    expect(result.totalAddedMinutes).toBeLessThan(3);
  });
});

describe('weather labels', () => {
  it('labels every condition', () => {
    for (const condition of WEATHER_SEVERITY) {
      expect(weatherLabel(condition).length).toBeGreaterThan(0);
    }
  });

  it('orders severity from best to worst', () => {
    expect(weatherSeverity('clear')).toBe(0);
    expect(weatherSeverity('heavy_rain')).toBe(4);
    expect(weatherSeverity('rain')).toBeGreaterThan(weatherSeverity('cloudy'));
  });

  it('flags only substantial rain as affecting the commute', () => {
    expect(weatherAffectsCommute('clear')).toBe(false);
    expect(weatherAffectsCommute('light_rain')).toBe(false);
    expect(weatherAffectsCommute('rain')).toBe(true);
    expect(weatherAffectsCommute('heavy_rain')).toBe(true);
  });
});

describe('trafficPenalty', () => {
  it('slows road modes and barely touches metro', () => {
    const levels = ['low', 'medium', 'high', 'very_high'] as const;

    for (const level of levels) {
      const bus = trafficPenalty(level, 'bus', 20, 0.2);
      const metro = trafficPenalty(level, 'metro', 20, 0.2);

      expect(bus.addedMinutes).toBeGreaterThan(metro.addedMinutes);
      expect(metro.addedMinutes).toBeLessThan(2);
    }
  });

  it('widens the spread far more on roads than on rail', () => {
    // This is the mechanism that makes the engine prefer rail in traffic.
    const bus = trafficPenalty('very_high', 'bus', 20, 0.2);
    const metro = trafficPenalty('very_high', 'metro', 20, 0.2);

    expect(bus.dispersionMultiplier).toBeGreaterThan(2);
    expect(metro.dispersionMultiplier).toBeLessThan(1.2);
    expect(bus.coefficientOfVariation).toBeGreaterThan(metro.coefficientOfVariation);
  });

  it('increases monotonically with severity', () => {
    const levels = ['low', 'medium', 'high', 'very_high'] as const;
    const fractions = levels.map((level) => trafficPenalty(level, 'bus', 20, 0.2).fraction);
    for (let i = 1; i < fractions.length; i += 1) {
      expect(fractions[i]).toBeGreaterThan(fractions[i - 1] ?? 0);
    }
  });

  it('never leaves a mode below free-flow speed', () => {
    for (const level of ['low', 'medium', 'high', 'very_high'] as const) {
      for (const mode of ALL_MODES) {
        expect(trafficPenalty(level, mode, 20, 0.2).fraction).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('caps the dispersion multiplier', () => {
    const table = {
      fraction: DEFAULT_TRAFFIC_PENALTY.fraction,
      dispersion: {
        ...DEFAULT_TRAFFIC_PENALTY.dispersion,
        very_high: { ...DEFAULT_TRAFFIC_PENALTY.dispersion.very_high, bus: 50 },
      },
    };
    expect(trafficPenalty('very_high', 'bus', 20, 0.2, table).dispersionMultiplier).toBe(4);
  });
});

describe('routeTrafficPenalty', () => {
  it('reports a duration-weighted dispersion', () => {
    const result = routeTrafficPenalty('high', [
      { mode: 'bus', durationMin: 30, coefficientOfVariation: 0.2 },
      { mode: 'metro', durationMin: 10, coefficientOfVariation: 0.1 },
    ]);

    // The longer bus leg dominates, so the weighted value sits near its own.
    expect(result.weightedDispersion).toBeGreaterThan(1.5);
    expect(result.weightedDispersion).toBeLessThan(1.95);
  });

  it('adds zero for a free-flow metro-only commute', () => {
    const result = routeTrafficPenalty('low', [
      { mode: 'metro', durationMin: 25, coefficientOfVariation: 0.12 },
    ]);
    expect(result.totalAddedMinutes).toBe(0);
    expect(result.adjustedTotalMin).toBe(25);
  });
});

describe('traffic labels', () => {
  it('orders severity from best to worst', () => {
    expect(trafficSeverity('low')).toBe(0);
    expect(trafficSeverity('very_high')).toBe(3);
    expect(trafficLabel('high').length).toBeGreaterThan(0);
    expect(trafficShortLabel('very_high')).toBe('Very high');
  });
});

describe('crowdPenalty', () => {
  it('adds nothing for an empty vehicle', () => {
    const penalty = crowdPenalty(0, 'bus', 20);
    expect(penalty.boardingDelayMin).toBe(0);
    expect(penalty.adjustedDurationMin).toBe(20);
  });

  it('adds more boarding delay as the crowd grows', () => {
    const delays = [0, 1, 2, 3, 4, 5].map(
      (level) => crowdPenalty(level as 0, 'bus', 20).boardingDelayMin,
    );
    for (let i = 1; i < delays.length; i += 1) {
      expect(delays[i]).toBeGreaterThan(delays[i - 1] ?? 0);
    }
  });

  it('charges less on metro than on a bus for the same crowd', () => {
    expect(crowdPenalty(5, 'metro', 20).boardingDelayMin).toBeLessThan(
      crowdPenalty(5, 'bus', 20).boardingDelayMin,
    );
  });

  it('charges nothing for walking', () => {
    expect(crowdPenalty(5, 'walk', 20).boardingDelayMin).toBe(0);
  });

  it('waives the delay on the very first boarding', () => {
    // The walk to the stop already absorbed the time.
    expect(crowdPenalty(5, 'bus', 20, true).boardingDelayMin).toBe(0);
    expect(crowdPenalty(5, 'bus', 20, false).boardingDelayMin).toBeGreaterThan(0);
  });

  it('widens the spread with crowd', () => {
    expect(crowdPenalty(5, 'bus', 20).dispersionMultiplier).toBeGreaterThan(
      crowdPenalty(0, 'bus', 20).dispersionMultiplier,
    );
  });

  it('exposes a monotonic boarding delay table', () => {
    const values = Object.values(BOARDING_DELAY_MINUTES);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1] ?? 0);
    }
  });
});

describe('transferCrowdDispersion', () => {
  it('grows with crowd and is bounded', () => {
    expect(transferCrowdDispersion(0)).toBe(1);
    expect(transferCrowdDispersion(5)).toBeGreaterThan(1.5);
    expect(transferCrowdDispersion(5)).toBeLessThanOrEqual(1.75);
  });
});

describe('crowd labels', () => {
  it('labels every level', () => {
    for (const level of [0, 1, 2, 3, 4, 5] as const) {
      expect(crowdLabel(level).length).toBeGreaterThan(0);
      expect(crowdShortLabel(level).length).toBeGreaterThan(0);
    }
  });

  it('flags only severe crowding as affecting the commute', () => {
    expect(crowdAffectsCommute(3)).toBe(false);
    expect(crowdAffectsCommute(4)).toBe(true);
    expect(crowdAffectsCommute(5)).toBe(true);
  });
});
