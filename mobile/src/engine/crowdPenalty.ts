/**
 * Crowd penalty model.
 *
 * Crowd affects two things, and conflating them is a common modelling error:
 *
 *  1. **Boarding delay.** Getting onto a packed bus takes real time — you may
 *     watch one go, or spend 40 seconds shuffling to the door.
 *  2. **Transfer reliability.** A crowded interchange is where missed
 *     connections happen, because movement is slow and the next vehicle is
 *     already filling up.
 *
 * The engine applies boarding delay directly to the duration and feeds
 * transfer risk into the variance of the leg that follows a transfer.
 */
import { type CrowdLevel, type TransportMode } from '@/src/types/schemas';
import { clamp } from '@/src/utils/math';

/** Extra minutes spent getting aboard, by crowd level and mode. */
export const BOARDING_DELAY_MINUTES: Readonly<Record<CrowdLevel, number>> = {
  0: 0,
  1: 0.2,
  2: 0.6,
  3: 1.1,
  4: 2.0,
  5: 3.4,
};

/** Extra minutes walking a crowded interchange, by crowd level. */
export const TRANSFER_DELAY_MINUTES: Readonly<Record<CrowdLevel, number>> = {
  0: 0,
  1: 0.1,
  2: 0.4,
  3: 0.8,
  4: 1.5,
  5: 2.6,
};

/**
 * Crowding matters most for road transport, where a packed vehicle means
 * slower acceleration and dwell. Metro platforms are managed and trains
 * arrive regardless, so crowding there mostly costs transfer time.
 */
const BOARDING_MODE_FACTOR: Readonly<Record<TransportMode, number>> = {
  walk: 0,
  bike: 0,
  bus: 1,
  auto: 0.9,
  cab: 0.5,
  train: 0.8,
  metro: 0.55,
};

/** Result of applying crowd to one leg. */
export interface CrowdPenalty {
  readonly boardingDelayMin: number;
  readonly adjustedDurationMin: number;
  /** Multiplier on the leg's spread; crowding makes timing less predictable. */
  readonly dispersionMultiplier: number;
}

/**
 * Applies crowd to one leg.
 *
 * @param crowdLevel Observed 0..5 crowd at boarding.
 * @param mode The leg's transport mode.
 * @param expectedDurationMin Duration before penalties.
 * @param isFirstBoarding When true, the boarding delay is skipped because the
 *   user has no vehicle to board yet (e.g. the walk out of home).
 */
export function crowdPenalty(
  crowdLevel: CrowdLevel,
  mode: TransportMode,
  expectedDurationMin: number,
  isFirstBoarding = false,
): CrowdPenalty {
  const factor = BOARDING_MODE_FACTOR[mode];
  const raw = BOARDING_DELAY_MINUTES[crowdLevel] * factor;
  // The very first boarding of a commute is not penalised: the walk to the
  // stop already absorbed the time and you are not competing for a seat.
  const boardingDelayMin = isFirstBoarding ? 0 : raw;

  return {
    boardingDelayMin,
    adjustedDurationMin: expectedDurationMin + boardingDelayMin,
    dispersionMultiplier: clamp(1 + crowdLevel * 0.08, 1, 1.5),
  };
}

/**
 * Additional dispersion for the leg following a transfer.
 *
 * Entering a new vehicle at a crowded interchange is the least predictable
 * part of a multi-modal commute, so we widen the spread more aggressively
 * than the boarding delay alone would suggest.
 */
export function transferCrowdDispersion(crowdLevel: CrowdLevel): number {
  return clamp(1 + crowdLevel * 0.12, 1, 1.75);
}

/** Human label for a crowd level. */
export function crowdLabel(level: CrowdLevel): string {
  switch (level) {
    case 0:
      return 'Empty';
    case 1:
      return 'Seats free';
    case 2:
      return 'Moderate';
    case 3:
      return 'Standing room';
    case 4:
      return 'Packed';
    case 5:
      return 'Hard to board';
  }
}

/** Short label for compact chips. */
export function crowdShortLabel(level: CrowdLevel): string {
  switch (level) {
    case 0:
      return 'Empty';
    case 1:
      return 'Seats';
    case 2:
      return 'Moderate';
    case 3:
      return 'Standing';
    case 4:
      return 'Packed';
    case 5:
      return 'Very packed';
  }
}

/** True when crowding is bad enough to affect planning. */
export function crowdAffectsCommute(level: CrowdLevel): boolean {
  return level >= 4;
}
