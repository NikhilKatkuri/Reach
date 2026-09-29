/**
 * Route graph utilities.
 *
 * A commute template is a directed graph: `stops` are nodes and `segments`
 * are directed edges. Alternative branches are simply two or more outgoing
 * edges from the same node, so the whole "branch editor" is a view over this
 * structure rather than a separate concept.
 *
 * These functions are pure — they take a {@link TemplateGraph} and return
 * new data, which makes route enumeration testable without a database.
 */
import {
  resolveNodeRole,
  type Segment,
  type Stop,
  type TemplateGraph,
  type TransportMode,
} from '@/src/types/schemas';

/** Adjacency index for a template's graph. */
export interface CommuteGraph {
  readonly templateId: string;
  readonly stopsById: ReadonlyMap<string, Stop>;
  readonly segmentsById: ReadonlyMap<string, Segment>;
  /** Outgoing edges per stop id, ordered by `sortOrder`. */
  readonly outgoing: ReadonlyMap<string, readonly Segment[]>;
  /** Incoming edges per stop id, ordered by `sortOrder`. */
  readonly incoming: ReadonlyMap<string, readonly Segment[]>;
  /** Stops in declared order; the template builder's primary ordering. */
  readonly orderedStops: readonly Stop[];

  /**
   * Every stop and segment on the graph.
   *
   * Kept so validation can reason about the whole graph without re-walking the
   * adjacency maps, which lose ordering and would make a second traversal.
   */
  readonly stops: readonly Stop[];
  readonly segments: readonly Segment[];

  /**
   * Explicit origin, from the node whose role is `origin`.
   *
   * `null` when no node claims that role, which is a real state during editing
   * and is reported by `validateGraph` rather than silently patched.
   */
  readonly origin: Stop | null;
  /** Explicit destination, from the node whose role is `destination`. */
  readonly destination: Stop | null;
  /** Every node whose role is `junction`. */
  readonly junctions: readonly Stop[];
  /**
   * Endpoints as the engine will actually use them.
   *
   * Falls back to declaration order when roles are absent, so a graph that
   * predates roles keeps behaving exactly as it did. The fallback is
   * first-in-order / last-in-order rather than anything smarter, because that
   * is precisely the convention the old data was written with.
   */
  readonly effectiveOrigin: Stop | null;
  readonly effectiveDestination: Stop | null;
}

/** Builds the adjacency index used by every other graph function. */
export function buildGraph(graph: TemplateGraph): CommuteGraph {
  const stopsById = new Map(graph.stops.map((stop) => [stop.id, stop]));
  const segmentsById = new Map(graph.segments.map((segment) => [segment.id, segment]));

  const outgoing = new Map<string, Segment[]>();
  const incoming = new Map<string, Segment[]>();

  for (const stop of graph.stops) {
    outgoing.set(stop.id, []);
    incoming.set(stop.id, []);
  }

  const bySortOrder = (a: Segment, b: Segment) => a.sortOrder - b.sortOrder;

  for (const segment of graph.segments) {
    outgoing.get(segment.fromStopId)?.push(segment);
    incoming.get(segment.toStopId)?.push(segment);
  }

  for (const list of outgoing.values()) list.sort(bySortOrder);
  for (const list of incoming.values()) list.sort(bySortOrder);

  const orderedStops = [...graph.stops].sort((a, b) => a.sortOrder - b.sortOrder);

  // An explicit role always wins. `??` rather than a length check so a role of
  // `stop` on the first node is respected instead of being overridden.
  const origin = orderedStops.find((stop) => resolveNodeRole(stop) === 'origin') ?? null;
  const destination = orderedStops.find((stop) => resolveNodeRole(stop) === 'destination') ?? null;
  const junctions = orderedStops.filter((stop) => resolveNodeRole(stop) === 'junction');

  const effectiveOrigin =
    origin ??
    // Fallback for pre-role graphs: the old convention, unchanged.
    (graph.stops.length > 0 && orderedStops.every((stop) => resolveNodeRole(stop) === 'stop')
      ? (orderedStops[0] ?? null)
      : null);

  const effectiveDestination =
    destination ??
    (graph.stops.length > 0 && orderedStops.every((stop) => resolveNodeRole(stop) === 'stop')
      ? (orderedStops[orderedStops.length - 1] ?? null)
      : null);

  return {
    templateId: graph.template.id,
    stopsById,
    segmentsById,
    outgoing,
    incoming,
    orderedStops,
    stops: graph.stops,
    segments: graph.segments,
    origin,
    destination,
    junctions,
    effectiveOrigin,
    effectiveDestination,
  };
}

/**
 * The node a commute starts from.
 *
 * Prefers the explicit `origin` role; falls back to declaration order for
 * graphs written before roles existed.
 */
export function findOrigin(graph: CommuteGraph): Stop | null {
  return graph.effectiveOrigin;
}

/**
 * The node a commute ends at.
 *
 * Prefers the explicit `destination` role; falls back to declaration order for
 * graphs written before roles existed.
 */
export function findDestination(graph: CommuteGraph): Stop | null {
  return graph.effectiveDestination;
}

/** Stops with no outgoing edge that are not the destination. */
export function findDeadEnds(graph: CommuteGraph): Stop[] {
  const destination = findDestination(graph);
  return graph.orderedStops.filter(
    (stop) => stop.id !== destination?.id && (graph.outgoing.get(stop.id)?.length ?? 0) === 0,
  );
}

/**
 * Nodes that fork into more than one outgoing connection.
 *
 * Reported by explicit `junction` role when the user has marked any, otherwise
 * derived from out-degree. A place with three outgoing options *is* a junction
 * whether or not anyone labelled it, and the graph view needs to know either
 * way in order to draw the branch.
 */
export function findBranchPoints(graph: CommuteGraph): Stop[] {
  const labelled = new Set(graph.junctions.map((stop) => stop.id));
  return graph.orderedStops.filter(
    (stop) => labelled.has(stop.id) || (graph.outgoing.get(stop.id)?.length ?? 0) > 1,
  );
}

/** A complete candidate route through the graph. */
export interface RoutePath {
  /** `|`-joined segment ids. This is the route's identity and stats key. */
  readonly signature: string;
  readonly segmentIds: readonly string[];
  readonly stopIds: readonly string[];
  /** Every distinct mode used, in first-appearance order. */
  readonly modes: readonly TransportMode[];
  /** Sum of `expectedDurationMin` plus per-segment buffer. */
  readonly expectedDurationMin: number;
  /**
   * Real boarding transitions in this path, via {@link countTransfers}.
   *
   * This is the number the UI must show. `hasTransfer` is a boolean derived
   * from it and is kept only where a yes/no answer is genuinely the right
   * question — rendering a route as "1 transfer" because it has *at least
   * one* is a real bug: `Walk → Bus → Metro → Walk → Bus` is two changes, not
   * one, and understating it hides the transfer risk the engine models.
   */
  readonly transferCount: number;
  /** True when the path contains at least one transfer. */
  readonly hasTransfer: boolean;
}

/** Caps enumeration so a dense graph cannot blow up the event loop. */
const DEFAULT_MAX_ROUTES = 24;
const DEFAULT_MAX_DEPTH = 12;

/**
 * Enumerates simple paths from `originId` to `destinationId`.
 *
 * Only simple paths (no repeated stop) are considered, which keeps output
 * finite and matches how a human reads a commute: you never loop back to a
 * stop you already passed. Results are ordered by expected duration so the
 * fastest route comes first, and truncated to `maxRoutes`.
 */
export function enumerateRoutes(
  graph: CommuteGraph,
  options: {
    originId?: string;
    destinationId?: string;
    maxRoutes?: number;
    maxDepth?: number;
  } = {},
): RoutePath[] {
  const origin = options.originId ?? findOrigin(graph)?.id;
  const destination = options.destinationId ?? findDestination(graph)?.id;
  if (origin === undefined || destination === undefined) return [];

  const maxRoutes = options.maxRoutes ?? DEFAULT_MAX_ROUTES;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;

  const found: RoutePath[] = [];
  const visited = new Set<string>([origin]);
  const pathSegments: Segment[] = [];
  const pathStops: string[] = [origin];

  const walk = (currentId: string) => {
    if (found.length >= maxRoutes) return;
    if (currentId === destination && pathSegments.length > 0) {
      found.push(toRoutePath(pathSegments, pathStops));
      return;
    }
    if (pathSegments.length >= maxDepth) return;

    for (const segment of graph.outgoing.get(currentId) ?? []) {
      if (visited.has(segment.toStopId)) continue;
      visited.add(segment.toStopId);
      pathSegments.push(segment);
      pathStops.push(segment.toStopId);
      walk(segment.toStopId);
      pathSegments.pop();
      pathStops.pop();
      visited.delete(segment.toStopId);
    }
  };

  walk(origin);

  return found.sort((a, b) => a.expectedDurationMin - b.expectedDurationMin);
}

function toRoutePath(segments: readonly Segment[], stopIds: readonly string[]): RoutePath {
  const modes: TransportMode[] = [];
  for (const segment of segments) {
    if (!modes.includes(segment.mode)) modes.push(segment.mode);
  }

  const expectedDurationMin = segments.reduce(
    (total, segment) => total + segment.expectedDurationMin + segment.bufferMinutes,
    0,
  );

  const transfers = countTransfers(segments);

  return {
    signature: segments.map((segment) => segment.id).join('|'),
    segmentIds: segments.map((segment) => segment.id),
    stopIds: [...stopIds],
    modes,
    expectedDurationMin,
    transferCount: transfers,
    hasTransfer: transfers > 0,
  };
}

/**
 * Counts mode changes that require leaving one vehicle and boarding another.
 *
 * A transfer is a *change* of vehicle, so the first boarding of a trip is never
 * one — walking two blocks and then boarding a bus is simply how you start.
 * Each later boarding of a different mode adds one.
 *
 * A walk leg between two transit legs is a real transfer, because you left one
 * vehicle and caught another. Consecutive walks are not — they are one longer
 * walk. The same mode twice in a row (a bus that stays on for two stops) is not
 * a transfer either, which also covers walking between two stops on a bus route
 * and boarding the same service again.
 */
export function countTransfers(segments: readonly Segment[]): number {
  const isBoardable = (mode: TransportMode) =>
    mode === 'bus' || mode === 'metro' || mode === 'train' || mode === 'auto' || mode === 'cab';

  let transfers = 0;
  let lastBoarded: TransportMode | null = null;

  for (const segment of segments) {
    if (!isBoardable(segment.mode)) continue;

    // `lastBoarded === null` means this is the first vehicle of the trip, so
    // there is nothing to have transferred *from*.
    if (lastBoarded !== null && lastBoarded !== segment.mode) {
      transfers += 1;
    }

    lastBoarded = segment.mode;
  }

  return transfers;
}

/** A short label for a route, e.g. "Walk · Bus 10H · Metro Blue". */
export function describeRoute(
  graph: CommuteGraph,
  path: RoutePath,
  resolveLabel: (segment: Segment) => string | null,
): string {
  const parts: string[] = [];
  for (const segmentId of path.segmentIds) {
    const segment = graph.segmentsById.get(segmentId);
    if (segment === undefined) continue;
    const custom = resolveLabel(segment);
    parts.push(custom ?? segment.mode);
  }
  return parts.join(' · ');
}

/**
 * Problems found in a template graph.
 *
 * `error` blocks saving and prediction. `warning` is advisory and must never
 * block: a half-built commute is still worth keeping, and a branch nobody has
 * taken yet is not a mistake.
 */
export interface GraphValidationIssue {
  readonly severity: 'error' | 'warning';
  /**
   * Stable machine key, e.g. `no-destination`.
   *
   * The UI maps this to a friendly headline and a fix affordance. Keeping the
   * prose in one place is what stops raw developer strings leaking into the
   * interface.
   */
  readonly code: ValidationCode;
  /** User-facing sentence. No developer jargon, no node ids. */
  readonly message: string;
  /** Nodes the issue concerns, for highlighting and "Fix" targeting. */
  readonly stopIds: readonly string[];
  /** Connections the issue concerns, when it is about a specific edge. */
  readonly segmentIds: readonly string[];
}

/** Every issue `validateGraph` can report. */
export const VALIDATION_CODES = [
  'no-origin',
  'no-destination',
  'origin-is-destination',
  'destination-unreachable',
  'connection-missing-node',
  'connection-no-duration',
  'self-loop',
  'dead-end',
  'unused-node',
  'duplicate-alternative',
  'very-long-route',
  'branch-has-no-destination',
  'no-connections',
] as const;

export type ValidationCode = (typeof VALIDATION_CODES)[number];

/** Number of stops above which a route is flagged as implausibly long. */
const LONG_ROUTE_STOP_LIMIT = 12;

/** Two alternatives are "meaningfully different" below this duration gap. */
const MEANINGFUL_ALTERNATIVE_GAP_MIN = 3;

/**
 * Validates a template graph.
 *
 * Split into two passes on purpose:
 *
 * 1. *Structural* checks run first and are allowed to be incomplete, because
 *    they describe a graph that is not fully built yet — that is the normal
 *    state mid-edit.
 * 2. *Topological* checks run only once the endpoints are known, since
 *    reachability and dead ends are meaningless without them.
 *
 * Returning early after the structural pass matters: a user who has not yet
 * added a destination should see "add a destination", not five follow-on
 * complaints about routes that cannot exist yet.
 */
export function validateGraph(graph: CommuteGraph): GraphValidationIssue[] {
  const issues: GraphValidationIssue[] = [];
  const stopIds = new Set(graph.stopsById.keys());

  // --- Structural: does the data itself hold together? ---

  for (const segment of graph.segments) {
    // Only segments on this graph's own nodes; a foreign id is data
    // corruption, and the specific node is named so it can be fixed.
    if (!stopIds.has(segment.fromStopId) || !stopIds.has(segment.toStopId)) {
      const missing = !stopIds.has(segment.fromStopId) ? segment.fromStopId : segment.toStopId;
      issues.push({
        severity: 'error',
        code: 'connection-missing-node',
        message: 'One of your connections points at a place that no longer exists.',
        stopIds: [missing],
        segmentIds: [segment.id],
      });
    }

    if (segment.fromStopId === segment.toStopId) {
      issues.push({
        severity: 'error',
        code: 'self-loop',
        message: `"${graph.stopsById.get(segment.fromStopId)?.name ?? 'A place'}" has a connection that goes nowhere — it ends where it starts.`,
        stopIds: [segment.fromStopId],
        segmentIds: [segment.id],
      });
    }

    if (segment.expectedDurationMin <= 0) {
      issues.push({
        severity: 'error',
        code: 'connection-no-duration',
        message: 'Every connection needs an expected time above zero.',
        stopIds: [segment.fromStopId, segment.toStopId],
        segmentIds: [segment.id],
      });
    }
  }

  if (graph.stops.length === 0) {
    issues.push({
      severity: 'error',
      code: 'no-origin',
      message: 'Add the place you start from.',
      stopIds: [],
      segmentIds: [],
    });
    return issues;
  }

  // --- Endpoints ---

  const explicitOrigins = graph.orderedStops.filter((stop) => resolveNodeRole(stop) === 'origin');
  const explicitDestinations = graph.orderedStops.filter(
    (stop) => resolveNodeRole(stop) === 'destination',
  );

  /*
   * Legacy fallback.
   *
   * A graph in which *no* node carries an endpoint role is one written before
   * roles existed, and its convention was first-in-order / last-in-order. Such
   * a graph is valid and must keep working unchanged — reporting "mark one
   * place as your start" at a user who has always had a start would be a
   * regression, and would block them from saving a commute they built years ago.
   *
   * The fallback is deliberately all-or-nothing. If the user has marked a
   * destination but not an origin, that is a half-finished edit and deserves
   * the "mark your start" error, not a silent guess.
   */
  const isLegacyGraph = explicitOrigins.length === 0 && explicitDestinations.length === 0;

  const origins = isLegacyGraph
    ? graph.orderedStops.length > 0
      ? [graph.orderedStops[0]!]
      : []
    : explicitOrigins;

  const destinations = isLegacyGraph
    ? graph.orderedStops.length > 1
      ? [graph.orderedStops[graph.orderedStops.length - 1]!]
      : []
    : explicitDestinations;

  if (!isLegacyGraph) {
    if (explicitOrigins.length === 0) {
      issues.push({
        severity: 'error',
        code: 'no-origin',
        message: 'Mark one place as where you start.',
        stopIds: graph.orderedStops.map((stop) => stop.id),
        segmentIds: [],
      });
    } else if (explicitOrigins.length > 1) {
      issues.push({
        severity: 'error',
        code: 'no-origin',
        message: `Only one place can be your start, but ${explicitOrigins.length} are marked as one.`,
        stopIds: explicitOrigins.map((stop) => stop.id),
        segmentIds: [],
      });
    }

    if (explicitDestinations.length === 0) {
      issues.push({
        severity: 'error',
        code: 'no-destination',
        message: 'Mark one place as where you are going.',
        stopIds: graph.orderedStops.map((stop) => stop.id),
        segmentIds: [],
      });
    } else if (explicitDestinations.length > 1) {
      issues.push({
        severity: 'error',
        code: 'no-destination',
        message: `Only one place can be your destination, but ${explicitDestinations.length} are marked as one.`,
        stopIds: explicitDestinations.map((stop) => stop.id),
        segmentIds: [],
      });
    }
  }

  // Nothing below is meaningful without exactly one of each.
  if (issues.length > 0) return issues;

  const origin = origins[0];
  const destination = destinations[0];
  if (origin === undefined || destination === undefined) {
    issues.push({
      severity: 'error',
      code: 'no-origin',
      message: 'Add at least a start and a destination.',
      stopIds: graph.orderedStops.map((stop) => stop.id),
      segmentIds: [],
    });
    return issues;
  }

  if (origin.id === destination.id) {
    issues.push({
      severity: 'error',
      code: 'origin-is-destination',
      message: 'Your start and your destination are the same place.',
      stopIds: [origin.id],
      segmentIds: [],
    });
    return issues;
  }

  if (graph.segments.length === 0) {
    issues.push({
      severity: 'error',
      code: 'no-connections',
      message: `Add a connection from ${origin.name} so there is a way to get there.`,
      stopIds: [origin.id, destination.id],
      segmentIds: [],
    });
    return issues;
  }

  // --- Topological: now that the endpoints are known ---

  const routes = enumerateRoutes(graph, { maxRoutes: 1 });

  if (routes.length === 0) {
    // Name the place the user is stuck at, which is the actionable part. The
    // last node before things go nowhere is far more useful than the origin.
    const blockedAt = findBlocker(graph, origin, destination);
    issues.push({
      severity: 'error',
      code: 'destination-unreachable',
      message:
        blockedAt === null
          ? `There is no route from ${origin.name} to ${destination.name} yet.`
          : `${destination.name} can't be reached from ${blockedAt.name} yet.`,
      stopIds: blockedAt === null ? [origin.id, destination.id] : [blockedAt.id, destination.id],
      segmentIds: [],
    });
  }

  for (const stop of findDeadEnds(graph)) {
    issues.push({
      severity: 'warning',
      code: 'dead-end',
      message: `"${stop.name}" is a dead end — nothing continues from there.`,
      stopIds: [stop.id],
      segmentIds: [],
    });
  }

  for (const stop of graph.orderedStops) {
    if (stop.id === origin.id || stop.id === destination.id) continue;
    const hasIn = (graph.incoming.get(stop.id)?.length ?? 0) > 0;
    const hasOut = (graph.outgoing.get(stop.id)?.length ?? 0) > 0;
    if (!hasIn && !hasOut) {
      issues.push({
        severity: 'warning',
        code: 'unused-node',
        message: `"${stop.name}" isn't part of any route yet.`,
        stopIds: [stop.id],
        segmentIds: [],
      });
    } else if (!canReach(graph, stop.id, destination.id)) {
      issues.push({
        severity: 'warning',
        code: 'branch-has-no-destination',
        message: `Nothing from "${stop.name}" leads to ${destination.name}.`,
        stopIds: [stop.id],
        segmentIds: [],
      });
    }
  }

  issues.push(...findAlternativeIssues(graph));

  return issues;
}

/**
 * Finds the node from which the user most usefully needs to add a connection.
 *
 * Deliberately *not* the furthest node reached. If the graph dead-ends at
 * "somewhere else", naming that dead end is true but useless — nothing can
 * continue from it. What the user needs is the last node that still has an
 * outgoing connection and simply lacks the right one, because that is the
 * node they can add to.
 *
 * Bounded by `maxDepth` so a cyclic graph cannot make this run long.
 */
function findBlocker(graph: CommuteGraph, origin: Stop, destination: Stop): Stop | null {
  let best: Stop | null = null;
  const seen = new Set<string>([origin.id]);

  const walk = (id: string, depth: number): void => {
    if (id === destination.id) return;
    if (depth > 24) return;

    const stop = graph.stopsById.get(id);
    // Only a node with somewhere to go counts as a place worth fixing.
    if (stop !== undefined && (graph.outgoing.get(stop.id)?.length ?? 0) > 0) {
      best = stop;
    }

    for (const segment of graph.outgoing.get(id) ?? []) {
      if (seen.has(segment.toStopId)) continue;
      seen.add(segment.toStopId);
      walk(segment.toStopId, depth + 1);
      seen.delete(segment.toStopId);
    }
  };

  walk(origin.id, 0);
  return best;
}

/** Whether `toId` is reachable from `fromId`, following directed edges. */
export function canReach(graph: CommuteGraph, fromId: string, toId: string): boolean {
  if (fromId === toId) return true;

  const seen = new Set<string>([fromId]);
  const queue: string[] = [fromId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    for (const segment of graph.outgoing.get(current) ?? []) {
      if (segment.toStopId === toId) return true;
      if (seen.has(segment.toStopId)) continue;
      seen.add(segment.toStopId);
      queue.push(segment.toStopId);
    }
  }

  return false;
}

/**
 * Warns about alternatives that are not actually different options.
 *
 * Two outgoing connections from the same node with the same mode and a
 * near-identical duration are almost always a duplicate rather than a
 * genuine "sometimes the bus is faster" branch, and offering the user two
 * options that behave the same is misleading.
 */
function findAlternativeIssues(graph: CommuteGraph): GraphValidationIssue[] {
  const issues: GraphValidationIssue[] = [];
  const destination = findDestination(graph);
  if (destination === null) return issues;

  // Branch points, not just labelled junctions: a node with two outgoing
  // options is a fork whether or not anyone set `nodeRole: 'junction'`, and a
  // graph built before roles existed has no labels at all.
  for (const junction of findBranchPoints(graph)) {
    const outgoing = graph.outgoing.get(junction.id) ?? [];
    if (outgoing.length < 2) continue;

    for (let i = 0; i < outgoing.length; i += 1) {
      for (let j = i + 1; j < outgoing.length; j += 1) {
        const a = outgoing[i]!;
        const b = outgoing[j]!;
        const sameMode = a.mode === b.mode;
        const nearIdentical =
          Math.abs(a.expectedDurationMin - b.expectedDurationMin) < MEANINGFUL_ALTERNATIVE_GAP_MIN;

        if (sameMode && nearIdentical) {
          issues.push({
            severity: 'warning',
            code: 'duplicate-alternative',
            message: `Two options from "${junction.name}" are the same mode and about the same length. Change one, or remove it.`,
            stopIds: [junction.id],
            segmentIds: [a.id, b.id],
          });
        }
      }
    }
  }

  // A "very long route" is only worth saying when it is a real path, not when
  // the user is still wiring things up.
  for (const route of enumerateRoutes(graph, {
    maxRoutes: 4,
    maxDepth: LONG_ROUTE_STOP_LIMIT + 2,
  })) {
    if (route.stopIds.length > LONG_ROUTE_STOP_LIMIT) {
      issues.push({
        severity: 'warning',
        code: 'very-long-route',
        message: `One route passes through ${route.stopIds.length} places. Check that's intentional.`,
        stopIds: route.stopIds,
        segmentIds: [...route.segmentIds],
      });
      break;
    }
  }

  return issues;
}

/** Convenience: builds the graph, enumerates routes and validates in one call. */
export function analyzeTemplate(templateGraph: TemplateGraph): {
  readonly graph: CommuteGraph;
  readonly routes: readonly RoutePath[];
  readonly issues: readonly GraphValidationIssue[];
} {
  const graph = buildGraph(templateGraph);
  return {
    graph,
    routes: enumerateRoutes(graph),
    issues: validateGraph(graph),
  };
}
