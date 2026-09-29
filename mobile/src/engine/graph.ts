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

  return {
    templateId: graph.template.id,
    stopsById,
    segmentsById,
    outgoing,
    incoming,
    orderedStops,
  };
}

/** Returns the first stop in declared order — the template's origin. */
export function findOrigin(graph: CommuteGraph): Stop | null {
  return graph.orderedStops[0] ?? null;
}

/** Returns the last stop in declared order — the template's destination. */
export function findDestination(graph: CommuteGraph): Stop | null {
  return graph.orderedStops[graph.orderedStops.length - 1] ?? null;
}

/** Stops that fork into more than one outgoing edge. */
export function findBranchPoints(graph: CommuteGraph): Stop[] {
  return graph.orderedStops.filter((stop) => (graph.outgoing.get(stop.id)?.length ?? 0) > 1);
}

/** Stops with no outgoing edge that are not the destination. */
export function findDeadEnds(graph: CommuteGraph): Stop[] {
  const destination = findDestination(graph);
  return graph.orderedStops.filter(
    (stop) => stop.id !== destination?.id && (graph.outgoing.get(stop.id)?.length ?? 0) === 0,
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
  /** True when the path contains at least one walking transfer. */
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
    hasTransfer: transfers > 0,
  };
}

/**
 * Counts mode changes that require leaving one vehicle and boarding another.
 *
 * A walk leg between two transit legs is a real transfer. Consecutive walks
 * are not — they are just a longer walk. The same mode twice in a row (a bus
 * that stays on for two stops) is not a transfer either.
 */
export function countTransfers(segments: readonly Segment[]): number {
  const isBoardable = (mode: TransportMode) =>
    mode === 'bus' || mode === 'metro' || mode === 'train' || mode === 'auto' || mode === 'cab';

  let transfers = 0;
  let lastBoarded: TransportMode | null = null;

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    if (!isBoardable(segment.mode)) continue;

    if (lastBoarded !== null && lastBoarded !== segment.mode) {
      // A different vehicle means the previous one was boarded then left.
      transfers += 1;
    } else if (lastBoarded === null && i > 0) {
      // First boarding of the trip, but only counts as boarding a transfer
      // when we walked in from somewhere.
      const previous = segments[i - 1];
      if (previous.mode === 'walk' && i >= 2) transfers += 1;
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

/** Problems that make a template unusable, for the builder's validation UI. */
export interface GraphValidationIssue {
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly stopIds: readonly string[];
}

/**
 * Validates a template graph.
 *
 * Errors block the template from being used for predictions; warnings are
 * advisory (for example a branch nobody has ever taken yet).
 */
export function validateGraph(graph: CommuteGraph): GraphValidationIssue[] {
  const issues: GraphValidationIssue[] = [];
  const origin = findOrigin(graph);
  const destination = findDestination(graph);

  if (origin === null || destination === null) {
    issues.push({
      severity: 'error',
      message: 'Add at least an origin and a destination.',
      stopIds: [],
    });
    return issues;
  }

  if (origin.id === destination.id) {
    issues.push({
      severity: 'error',
      message: 'Origin and destination are the same stop.',
      stopIds: [origin.id],
    });
  }

  if (enumerateRoutes(graph, { maxRoutes: 1 }).length === 0) {
    issues.push({
      severity: 'error',
      message: 'No route connects the origin to the destination.',
      stopIds: [origin.id, destination.id],
    });
  }

  for (const stop of findDeadEnds(graph)) {
    issues.push({
      severity: 'warning',
      message: `"${stop.name}" is a dead end — nothing leaves this stop.`,
      stopIds: [stop.id],
    });
  }

  const originOutDegree = graph.outgoing.get(origin.id)?.length ?? 0;
  if (originOutDegree > 1) {
    issues.push({
      severity: 'warning',
      message:
        'The origin has several outgoing legs. Group them as alternatives if they are branches.',
      stopIds: [origin.id],
    });
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
