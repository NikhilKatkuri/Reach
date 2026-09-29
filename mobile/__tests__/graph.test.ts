/** Route graph: building, traversing and validating a template's commute. */
import {
  analyzeTemplate,
  buildGraph,
  countTransfers,
  enumerateRoutes,
  findBranchPoints,
  findDeadEnds,
  findDestination,
  findOrigin,
  validateGraph,
} from '@/src/engine/graph';
import {
  BUS_METRO_SIGNATURE,
  BUS_ONLY_SIGNATURE,
  BUS_WALK_SIGNATURE,
  COMMUTE_GRAPH,
  SEGMENTS,
  STOPS,
  makeGraph,
  makeSegment,
  makeStop,
} from './fixtures';

describe('buildGraph', () => {
  it('indexes stops and segments by id', () => {
    const graph = buildGraph(COMMUTE_GRAPH);

    expect(graph.stopsById.get(STOPS.home)?.name).toBe('Home');
    expect(graph.segmentsById.get(SEGMENTS.busToAmeerpet)?.mode).toBe('bus');
    expect(graph.segmentsById.size).toBe(COMMUTE_GRAPH.segments.length);
  });

  it('builds forward and reverse adjacency', () => {
    const graph = buildGraph(COMMUTE_GRAPH);

    const outgoing = (graph.outgoing.get(STOPS.busStand) ?? []).map((segment) => segment.id);
    expect(outgoing).toEqual([SEGMENTS.busToAmeerpet, SEGMENTS.busToJntu]);

    const incoming = (graph.incoming.get(STOPS.ameerpet) ?? []).map((segment) => segment.id);
    expect(incoming).toEqual([SEGMENTS.busToAmeerpet]);
  });

  it('orders adjacency by sortOrder, not insertion order', () => {
    const graph = buildGraph({
      ...COMMUTE_GRAPH,
      segments: [...COMMUTE_GRAPH.segments].reverse(),
    });

    const outgoing = (graph.outgoing.get(STOPS.busStand) ?? []).map((segment) => segment.sortOrder);
    expect(outgoing).toEqual([...outgoing].sort((a, b) => a - b));
  });

  it('identifies the origin and destination by declaration order', () => {
    const graph = buildGraph(COMMUTE_GRAPH);
    expect(findOrigin(graph)?.id).toBe(STOPS.home);
    expect(findDestination(graph)?.id).toBe(STOPS.office);
  });
});

describe('enumerateRoutes', () => {
  const graph = buildGraph(COMMUTE_GRAPH);

  it('finds every simple path from origin to destination', () => {
    const routes = enumerateRoutes(graph);
    const signatures = routes.map((route) => route.signature);

    expect(signatures).toContain(BUS_METRO_SIGNATURE);
    expect(signatures).toContain(BUS_ONLY_SIGNATURE);
    expect(signatures).toContain(BUS_WALK_SIGNATURE);
    // The fixture has three complete paths: the bus branches at Bus Stop A
    // into two options, and Ameerpet offers a walk and a metro in parallel.
    expect(routes).toHaveLength(3);
  });

  it('orders routes by expected duration, fastest first', () => {
    const routes = enumerateRoutes(graph);
    const durations = routes.map((route) => route.expectedDurationMin);
    expect(durations).toEqual([...durations].sort((a, b) => a - b));
    // On paper the bus-then-walk branch is quickest, which is exactly why the
    // engine cannot simply sort by duration.
    expect(routes[0]?.signature).toBe(BUS_WALK_SIGNATURE);
  });

  it('builds a stop path consistent with the segments', () => {
    const busMetro = enumerateRoutes(graph).find((r) => r.signature === BUS_METRO_SIGNATURE);

    expect(busMetro?.stopIds).toEqual([
      STOPS.home,
      STOPS.busStand,
      STOPS.ameerpet,
      STOPS.moosarambagh,
      STOPS.office,
    ]);
  });

  it('connects consecutive segments end to end', () => {
    for (const route of enumerateRoutes(graph)) {
      for (let i = 1; i < route.segmentIds.length; i += 1) {
        const previous = graph.segmentsById.get(route.segmentIds[i - 1] ?? '');
        const current = graph.segmentsById.get(route.segmentIds[i] ?? '');
        expect(current?.fromStopId).toBe(previous?.toStopId);
      }
    }
  });

  it('includes each leg buffer in the expected total', () => {
    const withBuffer = makeGraph(
      [makeStop('a', 0), makeStop('b', 1)],
      [makeSegment('s1', 'a', 'b', 0, { mode: 'bus', expectedDurationMin: 20, bufferMinutes: 5 })],
    );
    const routes = enumerateRoutes(buildGraph(withBuffer));
    expect(routes[0]?.expectedDurationMin).toBe(25);
  });

  it('records the distinct modes in first-appearance order', () => {
    const busMetro = enumerateRoutes(graph).find((r) => r.signature === BUS_METRO_SIGNATURE);
    expect(busMetro?.modes).toEqual(['walk', 'bus', 'metro']);
  });

  it('flags a route containing a mode change as a transfer', () => {
    const busMetro = enumerateRoutes(graph).find((r) => r.signature === BUS_METRO_SIGNATURE);
    const busOnly = enumerateRoutes(graph).find((r) => r.signature === BUS_ONLY_SIGNATURE);

    // Leaving the bus for the metro is a transfer.
    expect(busMetro?.hasTransfer).toBe(true);
    // A single bus followed by walking is one continuous ride.
    expect(busOnly?.hasTransfer).toBe(false);
  });

  it('returns nothing when origin and destination are disconnected', () => {
    const disconnected = makeGraph(
      [makeStop('a', 0), makeStop('b', 1), makeStop('c', 2)],
      [makeSegment('s1', 'a', 'b', 0)],
    );
    expect(enumerateRoutes(buildGraph(disconnected))).toEqual([]);
  });

  it('returns nothing when there are no segments', () => {
    const empty = makeGraph([makeStop('a', 0), makeStop('b', 1)], []);
    expect(enumerateRoutes(buildGraph(empty))).toEqual([]);
  });

  it('does not loop when the graph contains a cycle', () => {
    const cyclic = makeGraph(
      [makeStop('a', 0), makeStop('b', 1), makeStop('c', 2)],
      [
        makeSegment('s1', 'a', 'b', 0, { expectedDurationMin: 5 }),
        makeSegment('s2', 'b', 'c', 1, { expectedDurationMin: 5 }),
        makeSegment('s3', 'c', 'b', 2, { expectedDurationMin: 5 }),
      ],
    );
    const routes = enumerateRoutes(buildGraph(cyclic));
    // b→c→b is skipped as a cycle, so only a→b→c survives.
    expect(routes).toHaveLength(1);
  });

  it('respects maxRoutes', () => {
    expect(enumerateRoutes(graph, { maxRoutes: 1 })).toHaveLength(1);
  });

  it('respects an explicit origin and destination', () => {
    const routes = enumerateRoutes(graph, {
      originId: STOPS.busStand,
      destinationId: STOPS.moosarambagh,
    });

    // Ameerpet offers a walk or a metro from Bus Stop A.
    expect(routes).toHaveLength(2);
    for (const route of routes) {
      expect(route.stopIds[0]).toBe(STOPS.busStand);
      expect(route.stopIds[route.stopIds.length - 1]).toBe(STOPS.moosarambagh);
    }
  });
});

describe('branch detection', () => {
  const graph = buildGraph(COMMUTE_GRAPH);

  it('finds every stop that offers alternatives', () => {
    // Bus Stop A branches into two buses; Ameerpet offers a walk or a metro.
    expect(findBranchPoints(graph).map((stop) => stop.id)).toEqual([
      STOPS.busStand,
      STOPS.ameerpet,
    ]);
  });

  it('treats parallel edges from one stop as alternatives', () => {
    // Ameerpet → Moosarambagh has both a walk and a metro edge.
    const outgoing = graph.outgoing.get(STOPS.ameerpet) ?? [];
    expect(outgoing).toHaveLength(2);
    expect(new Set(outgoing.map((segment) => segment.toStopId))).toEqual(
      new Set([STOPS.moosarambagh]),
    );
  });

  it('finds stops that lead nowhere', () => {
    // `orphan` sits before the destination, so it really is a dead end rather
    // than the end of the journey.
    const withDeadEnd = makeGraph(
      [makeStop('a', 0), makeStop('b', 1), makeStop('orphan', 2), makeStop('z', 3)],
      [
        makeSegment('s1', 'a', 'b', 0),
        makeSegment('s2', 'b', 'orphan', 1),
        makeSegment('s3', 'b', 'z', 2),
      ],
    );
    expect(findDeadEnds(buildGraph(withDeadEnd)).map((s) => s.id)).toEqual(['orphan']);
  });

  it('does not report the destination as a dead end', () => {
    expect(findDeadEnds(graph)).toEqual([]);
  });
});

describe('countTransfers', () => {
  it('counts 0 for a single-mode trip', () => {
    const segments = COMMUTE_GRAPH.segments.filter(
      (segment) => segment.id === SEGMENTS.busToAmeerpet,
    );
    expect(countTransfers(segments)).toBe(0);
  });

  it('counts 1 for bus → walk → metro', () => {
    const segments = [
      COMMUTE_GRAPH.segments.find((s) => s.id === SEGMENTS.busToAmeerpet),
      COMMUTE_GRAPH.segments.find((s) => s.id === SEGMENTS.walkAmeerpetToMoosarambagh),
      COMMUTE_GRAPH.segments.find((s) => s.id === SEGMENTS.metroToMoosarambagh),
    ].filter((segment) => segment !== undefined);
    expect(countTransfers(segments)).toBe(1);
  });

  it('does not count consecutive walking legs as a transfer', () => {
    const segments = [
      makeSegment('w1', 'a', 'b', 0, { mode: 'walk' }),
      makeSegment('w2', 'b', 'c', 1, { mode: 'walk' }),
    ];
    expect(countTransfers(segments)).toBe(0);
  });
});

describe('validateGraph', () => {
  it('accepts the fixture graph with no errors', () => {
    const issues = validateGraph(buildGraph(COMMUTE_GRAPH));
    expect(issues.filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('rejects a graph with a single stop', () => {
    const issues = validateGraph(buildGraph(makeGraph([makeStop('only', 0)], [])));
    expect(issues.some((issue) => issue.severity === 'error')).toBe(true);
  });

  it('rejects a graph where the origin cannot reach the destination', () => {
    const broken = makeGraph(
      [makeStop('a', 0), makeStop('b', 1)],
      [makeSegment('s1', 'a', 'a', 0)],
    );
    const issues = validateGraph(buildGraph(broken));
    expect(issues.some((issue) => issue.message.includes('No route connects'))).toBe(true);
  });

  it('warns about a dead end without blocking', () => {
    const withDeadEnd = makeGraph(
      [makeStop('a', 0), makeStop('b', 1), makeStop('orphan', 2), makeStop('z', 3)],
      [
        makeSegment('s1', 'a', 'b', 0),
        makeSegment('s2', 'b', 'orphan', 1),
        makeSegment('s3', 'b', 'z', 2),
      ],
    );
    const issues = validateGraph(buildGraph(withDeadEnd));
    const deadEnd = issues.find((issue) => issue.message.includes('dead end'));

    expect(deadEnd?.severity).toBe('warning');
    // A dead end is advisory: the template still works.
    expect(issues.filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('warns when the origin itself branches', () => {
    const branchingOrigin = makeGraph(
      [makeStop('a', 0), makeStop('b', 1), makeStop('c', 2)],
      [makeSegment('s1', 'a', 'b', 0), makeSegment('s2', 'a', 'c', 1)],
    );
    const issues = validateGraph(buildGraph(branchingOrigin));
    expect(issues.some((issue) => issue.message.includes('several outgoing legs'))).toBe(true);
  });
});

describe('analyzeTemplate', () => {
  it('returns the graph, routes and issues together', () => {
    const result = analyzeTemplate(COMMUTE_GRAPH);

    expect(result.graph.stopsById.size).toBe(COMMUTE_GRAPH.stops.length);
    expect(result.routes).toHaveLength(3);
    expect(Array.isArray(result.issues)).toBe(true);
  });
});
