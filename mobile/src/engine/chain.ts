/**
 * The chain: the primary path through a commute's graph.
 *
 * Reach models a commute as a graph, but almost every real commute is a
 * *chain* of places with occasional forks — Home → junction → … → destination,
 * where the junction offers two or three ways onward. The chain is that
 * spine, derived from the places in declared order, with alternatives attached
 * to the hop they branch from.
 *
 * Kept out of the editor component so it can be tested directly. Deriving it
 * involves grouping connections by pair and deciding which is primary, and
 * getting that subtly wrong would show the user the wrong number of alternatives
 * without anything visibly breaking.
 */
import { type Segment, type Stop } from '@/src/types/schemas';

/** One step of the primary route. */
export interface ChainHop {
  /** Zero-based position in the chain. */
  readonly index: number;
  readonly from: Stop;
  readonly to: Stop;
  /**
   * The connection treated as this hop's main route, or `null` when the hop is
   * not connected yet.
   *
   * "Main" means the earliest-declared connection between the pair. There is
   * deliberately no scoring here: choosing by duration would silently rewrite
   * the user's route behind their back, and a user who put the bus first meant
   * the bus first.
   */
  readonly primary: Segment | null;
  /** Further connections between the same two places. */
  readonly alternatives: readonly Segment[];
}

/** Input, kept minimal so this has no dependency on the graph index. */
export interface ChainInput {
  readonly stops: readonly Stop[];
  readonly segments: readonly Segment[];
}

/**
 * Groups a graph's places into ordered hops.
 *
 * The chain follows *declared* order, not topology. A user who lists
 * Home, Ameerpet, HITAM is describing their journey in that order, and
 * respecting it is what lets the chain editor be a simple vertical list. Where
 * the declared order contradicts the graph, `validateGraph` reports the
 * unreachable destination — the two concerns stay separate.
 */
export function buildChainHops(input: ChainInput): readonly ChainHop[] {
  const ordered = [...input.stops].sort((a, b) => a.sortOrder - b.sortOrder);
  const hops: ChainHop[] = [];

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const from = ordered[index]!;
    const to = ordered[index + 1]!;

    const between = input.segments
      .filter((segment) => segment.fromStopId === from.id && segment.toStopId === to.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    hops.push({
      index,
      from,
      to,
      primary: between.length > 0 ? between[0]! : null,
      alternatives: between.slice(1),
    });
  }

  return hops;
}

/**
 * The connection between two places, if any.
 *
 * Used by the chain editor to decide whether an edit updates an existing
 * connection or creates one, and by anything else that needs to know whether a
 * pair is already joined.
 */
export function connectionBetween(
  segments: readonly Segment[],
  fromStopId: string,
  toStopId: string,
): Segment | null {
  return (
    segments.find(
      (segment) => segment.fromStopId === fromStopId && segment.toStopId === toStopId,
    ) ?? null
  );
}

/**
 * Whether the chain is complete: every hop connected.
 *
 * Drives the editor's primary call to action, so a half-finished journey is
 * reported as "one part still needs a time" rather than as an error.
 */
export function chainProgress(hops: readonly ChainHop[]): {
  readonly connected: number;
  readonly total: number;
  readonly isComplete: boolean;
} {
  const connected = hops.filter((hop) => hop.primary !== null).length;
  return {
    connected,
    total: hops.length,
    isComplete: hops.length > 0 && connected === hops.length,
  };
}
