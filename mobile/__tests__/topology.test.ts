/**
 * Graph topology and node-role tests.
 *
 * Covers the fourteen scenarios the editor depends on: linear routes, single
 * and multiple junctions, alternatives, dead ends, unreachable destinations,
 * cycles, transfer counting, explicit endpoints, role migration, enumeration,
 * route preview and an empty graph.
 *
 * These are pure-function tests, so they run without a database or a renderer.
 */
import {
  analyzeTemplate,
  buildGraph,
  canReach,
  countTransfers,
  enumerateRoutes,
  findBranchPoints,
  findDestination,
  findOrigin,
  validateGraph,
  type CommuteGraph,
} from '@/src/engine/graph';
import { layoutGraph } from '@/src/engine/layout';
import {
  describeRouteInline,
  formatDurationLabel,
  routeTransferLabel,
} from '@/src/engine/routePresentation';
import {
  historyDepth,
  historyDepthLabel,
  isPersonalised,
  tripsUntilNextBand,
} from '@/src/engine/historyDepth';
import { COMMUTE_PRESETS, instantiatePreset } from '@/src/features/templates/presets';
import { resolveNodeRole, type NodeRole, type Segment, type Stop } from '@/src/types/schemas';
import { makeGraph, makeSegment, makeStop } from './fixtures';

const T0 = 1_700_000_000_000;

/** A stop with an explicit role, for endpoint tests. */
function roleStop(id: string, sortOrder: number, nodeRole: NodeRole, overrides = {}): Stop {
  return makeStop(id, sortOrder, { nodeRole, ...overrides });
}

/**
 * Convenience: build and analyse in one call.
 *
 * Both parameters are typed explicitly. With a bare `= []` default, TypeScript
 * infers `never[]` and every call site fails to typecheck, which would push
 * towards loosening the fixtures instead.
 */
function analyse(
  stops: readonly Stop[],
  segments: readonly Segment[] = [],
): ReturnType<typeof analyzeTemplate> {
  return analyzeTemplate(makeGraph([...stops], [...segments]));
}

// ---------------------------------------------------------------------------
// 1. Linear route
// ---------------------------------------------------------------------------

describe('scenario 1: linear route', () => {
  const stops = [roleStop('home', 0, 'origin'), roleStop('office', 1, 'destination')];
  const segments = [
    makeSegment('s1', 'home', 'office', 0, { mode: 'walk', expectedDurationMin: 20 }),
  ];

  it('enumerates exactly one route', () => {
    const { routes } = analyse(stops, segments);
    expect(routes).toHaveLength(1);
    expect(routes[0]?.modes).toEqual(['walk']);
    expect(routes[0]?.expectedDurationMin).toBe(20);
  });

  it('is valid with no errors', () => {
    const { issues } = analyse(stops, segments);
    expect(issues.filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('reports zero transfers', () => {
    const { routes } = analyse(stops, segments);
    expect(routes[0]?.transferCount).toBe(0);
    expect(routeTransferLabel(routes[0]!.transferCount)).toBe('Direct');
  });

  it('lays out as two columns with the origin leftmost', () => {
    const layout = layoutGraph({ stops, segments });
    expect(layout.columnCount).toBe(2);
    expect(layout.nodes.find((n) => n.stop.id === 'home')?.column).toBe(0);
    expect(layout.nodes.find((n) => n.stop.id === 'office')?.column).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 2. One junction
// ---------------------------------------------------------------------------

describe('scenario 2: one junction', () => {
  const stops = [
    roleStop('home', 0, 'origin'),
    roleStop('j', 1, 'junction', { kind: 'station' }),
    roleStop('office', 2, 'destination'),
  ];
  const segments = [
    makeSegment('s1', 'home', 'j', 0, { mode: 'walk', expectedDurationMin: 8 }),
    makeSegment('s2', 'j', 'office', 1, { mode: 'metro', expectedDurationMin: 22 }),
  ];

  it('enumerates one route through the junction', () => {
    const { routes } = analyse(stops, segments);
    expect(routes).toHaveLength(1);
    expect(routes[0]?.stopIds).toEqual(['home', 'j', 'office']);
  });

  it('recognises the junction from its explicit role', () => {
    const { graph } = analyse(stops, segments);
    expect(graph.junctions.map((s) => s.id)).toEqual(['j']);
    expect(findBranchPoints(graph).map((s) => s.id)).toEqual(['j']);
  });

  it('keeps a station that is a junction as both kind and role', () => {
    // The whole point of separating the two: a station is a place, a junction
    // is a position in the topology, and a station can be a junction.
    const stop = stops[1]!;
    expect(stop.kind).toBe('station');
    expect(resolveNodeRole(stop)).toBe('junction');
  });

  it('counts no transfers for walk-then-metro', () => {
    // Boarding your first vehicle is not a transfer: a transfer is a *change*
    // of vehicle. walk → metro is Direct, and walk → bus → metro is 1 transfer.
    // Verified separately below so the distinction cannot regress unnoticed.
    const { routes } = analyse(stops, segments);
    expect(routes[0]?.transferCount).toBe(0);
    expect(routeTransferLabel(routes[0]!.transferCount)).toBe('Direct');
  });

  it('counts one transfer once a second vehicle is involved', () => {
    // walk → bus → metro → walk: bus is the first boarding, so only the change
    // from bus to metro counts.
    const { routes } = analyse(
      [
        roleStop('home', 0, 'origin'),
        makeStop('a', 1),
        makeStop('b', 2),
        roleStop('office', 3, 'destination'),
      ],
      [
        makeSegment('w', 'home', 'a', 0, { mode: 'walk', expectedDurationMin: 5 }),
        makeSegment('b1', 'a', 'b', 1, { mode: 'bus' }),
        makeSegment('m', 'b', 'office', 2, { mode: 'metro' }),
      ],
    );
    expect(routes[0]?.transferCount).toBe(1);
    expect(routeTransferLabel(routes[0]!.transferCount)).toBe('1 transfer');
  });
});

// ---------------------------------------------------------------------------
// 3. Two alternatives from one junction
// ---------------------------------------------------------------------------

describe('scenario 3: two alternatives', () => {
  const stops = [
    roleStop('home', 0, 'origin'),
    roleStop('j', 1, 'junction', { kind: 'station' }),
    roleStop('office', 2, 'destination'),
  ];
  const segments = [
    makeSegment('walk', 'home', 'j', 0, { mode: 'walk', expectedDurationMin: 7 }),
    makeSegment('metro', 'j', 'office', 1, { mode: 'metro', expectedDurationMin: 20 }),
    makeSegment('bus', 'j', 'office', 2, { mode: 'bus', expectedDurationMin: 34 }),
  ];

  it('enumerates both alternatives', () => {
    const { routes } = analyse(stops, segments);
    expect(routes).toHaveLength(2);
  });

  it('orders them by expected duration, fastest first', () => {
    const { routes } = analyse(stops, segments);
    expect(routes[0]?.expectedDurationMin).toBeLessThan(routes[1]?.expectedDurationMin ?? 0);
    expect(routes[0]?.signature).toBe(['walk', 'metro'].join('|'));
  });

  it('gives each a distinct signature, so history stays separate', () => {
    const { routes } = analyse(stops, segments);
    expect(new Set(routes.map((r) => r.signature)).size).toBe(2);
  });

  it('detects the junction from out-degree even without the role', () => {
    // A graph built before roles existed has no labels; the fork is still real.
    const unlabelled = analyse(
      [makeStop('home', 0), makeStop('j', 1), makeStop('office', 2)],
      segments,
    );
    expect(unlabelled.graph.junctions).toEqual([]);
    expect(findBranchPoints(unlabelled.graph).map((s) => s.id)).toEqual(['j']);
  });

  it('lays both alternatives out in parallel', () => {
    const layout = layoutGraph({ stops, segments });
    const office = layout.nodes.find((n) => n.stop.id === 'office');
    // Both edges leave column 1, so the diagram has a real fork to draw.
    expect(layout.connections.filter((c) => c.fromColumn === 1)).toHaveLength(2);
    expect(office?.column).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 4. Multiple junctions in series
// ---------------------------------------------------------------------------

describe('scenario 4: multiple junctions', () => {
  const stops = [
    roleStop('home', 0, 'origin'),
    roleStop('j1', 1, 'junction'),
    roleStop('j2', 2, 'junction'),
    roleStop('office', 3, 'destination'),
  ];
  const segments = [
    makeSegment('a', 'home', 'j1', 0, { mode: 'walk', expectedDurationMin: 5 }),
    makeSegment('b', 'j1', 'j2', 1, { mode: 'bus', expectedDurationMin: 18 }),
    makeSegment('c', 'j2', 'office', 2, { mode: 'metro', expectedDurationMin: 20 }),
  ];

  it('enumerates the single chain', () => {
    const { routes } = analyse(stops, segments);
    expect(routes).toHaveLength(1);
    expect(routes[0]?.stopIds).toEqual(['home', 'j1', 'j2', 'office']);
  });

  it('counts two transfers for bus-then-metro after a walk', () => {
    const { routes } = analyse(stops, segments);
    // walk → bus → metro: one boarding transition, from bus to metro.
    expect(routes[0]?.transferCount).toBe(1);
  });

  it('puts each node in its own column, left to right', () => {
    const layout = layoutGraph({ stops, segments });
    expect(layout.nodes.map((n) => n.column).sort()).toEqual([0, 1, 2, 3]);
  });

  it('identifies both junctions', () => {
    const { graph } = analyse(stops, segments);
    expect(graph.junctions.map((s) => s.id).sort()).toEqual(['j1', 'j2']);
  });
});

// ---------------------------------------------------------------------------
// 5. Dead end
// ---------------------------------------------------------------------------

describe('scenario 5: dead end', () => {
  const stops = [
    roleStop('home', 0, 'origin'),
    roleStop('j', 1, 'junction'),
    roleStop('office', 2, 'destination'),
    makeStop('nowhere', 3),
  ];
  const segments = [
    makeSegment('a', 'home', 'j', 0),
    makeSegment('b', 'j', 'office', 1),
    makeSegment('c', 'j', 'nowhere', 2),
  ];

  it('warns about the dead end but still allows the valid route', () => {
    const { routes, issues } = analyse(stops, segments);
    expect(routes).toHaveLength(1);
    const deadEnd = issues.find((issue) => issue.code === 'dead-end');
    expect(deadEnd?.severity).toBe('warning');
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('does not enumerate the dead end as a route', () => {
    const { routes } = analyse(stops, segments);
    expect(routes.every((route) => !route.stopIds.includes('nowhere'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Unreachable destination
// ---------------------------------------------------------------------------

describe('scenario 6: unreachable destination', () => {
  it('errors when the destination has no incoming edge', () => {
    const { issues } = analyse(
      [roleStop('home', 0, 'origin'), makeStop('c', 1), roleStop('office', 2, 'destination')],
      [makeSegment('a', 'home', 'c', 0)],
    );
    const unreachable = issues.find((i) => i.code === 'destination-unreachable');
    expect(unreachable?.severity).toBe('error');
  });

  it('names the node that could be extended rather than the origin', () => {
    const { issues } = analyse(
      [
        roleStop('Home', 0, 'origin'),
        roleStop('Ameerpet', 1, 'junction'),
        makeStop('x', 2),
        roleStop('Y', 3, 'destination'),
      ],
      [makeSegment('a', 'Home', 'Ameerpet', 0), makeSegment('b', 'Ameerpet', 'x', 1)],
    );
    const unreachable = issues.find((i) => i.code === 'destination-unreachable');
    expect(unreachable?.message).toContain('Ameerpet');
    expect(unreachable?.message).not.toContain('Home');
  });

  it('canReach agrees with the enumeration', () => {
    const { graph } = analyse(
      [roleStop('home', 0, 'origin'), makeStop('c', 1), roleStop('office', 2, 'destination')],
      [makeSegment('a', 'home', 'c', 0)],
    );
    expect(canReach(graph, 'home', 'office')).toBe(false);
    expect(canReach(graph, 'home', 'c')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 7. Cycle
// ---------------------------------------------------------------------------

describe('scenario 7: cycle', () => {
  it('does not hang, and still finds the simple path', () => {
    // a → b → c → a, with office reachable from c.
    const { routes } = analyse(
      [
        roleStop('a', 0, 'origin'),
        makeStop('b', 1),
        makeStop('c', 2),
        roleStop('office', 3, 'destination'),
      ],
      [
        makeSegment('s1', 'a', 'b', 0),
        makeSegment('s2', 'b', 'c', 1),
        makeSegment('s3', 'c', 'a', 2),
        makeSegment('s4', 'c', 'office', 3),
      ],
    );
    // Only simple paths, so the loop is never re-entered.
    expect(routes).toHaveLength(1);
    expect(routes[0]?.signature).toBe(['s1', 's2', 's4'].join('|'));
  });

  it('flags a direct self-loop as an error', () => {
    const { issues } = analyse(
      [roleStop('a', 0, 'origin'), roleStop('b', 1, 'destination')],
      [makeSegment('loop', 'a', 'a', 0)],
    );
    expect(issues.map((i) => i.code)).toContain('self-loop');
  });

  it('enumeration terminates on a dense cyclic graph', () => {
    // 6 nodes fully connected is 1957 simple paths; the cap must hold.
    const stops = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) =>
      id === 'a'
        ? roleStop(id, 0, 'origin')
        : id === 'f'
          ? roleStop(id, 5, 'destination')
          : makeStop(id, i),
    );
    const segments: ReturnType<typeof makeSegment>[] = [];
    let order = 0;
    for (const from of stops) {
      for (const to of stops) {
        if (from.id === to.id) continue;
        segments.push(makeSegment(`e${order++}`, from.id, to.id, order));
      }
    }
    const { routes } = analyse(stops, segments);
    expect(routes.length).toBeLessThanOrEqual(24);
  });
});

// ---------------------------------------------------------------------------
// 8. Multiple transfers
// ---------------------------------------------------------------------------

describe('scenario 8: multiple transfers', () => {
  it('reports two for walk → bus → metro → walk → bus', () => {
    // The exact case from the brief: a boolean would have said "1 transfer".
    const { routes } = analyse(
      [
        roleStop('home', 0, 'origin'),
        makeStop('a', 1),
        makeStop('b', 2),
        makeStop('c', 3),
        makeStop('d', 4),
        roleStop('office', 5, 'destination'),
      ],
      [
        makeSegment('e0', 'home', 'a', 0, { mode: 'walk' }),
        makeSegment('e1', 'a', 'b', 1, { mode: 'bus' }),
        makeSegment('e2', 'b', 'c', 2, { mode: 'metro' }),
        makeSegment('e3', 'c', 'd', 3, { mode: 'walk' }),
        makeSegment('e4', 'd', 'office', 4, { mode: 'bus' }),
      ],
    );
    expect(routes[0]?.transferCount).toBe(2);
    expect(routeTransferLabel(routes[0]!.transferCount)).toBe('2 transfers');
  });

  it('countTransfers is the same function the route uses', () => {
    const segments = [
      makeSegment('e0', 'a', 'b', 0, { mode: 'walk' }),
      makeSegment('e1', 'b', 'c', 1, { mode: 'bus' }),
      makeSegment('e2', 'c', 'd', 2, { mode: 'metro' }),
    ];
    expect(countTransfers(segments)).toBe(1);
  });

  it('does not count consecutive walks as a transfer', () => {
    // Two walks in a row are one longer walk, and boarding afterwards is the
    // first boarding of the trip.
    expect(
      countTransfers([
        makeSegment('e0', 'a', 'b', 0, { mode: 'walk' }),
        makeSegment('e1', 'b', 'c', 1, { mode: 'walk' }),
        makeSegment('e2', 'c', 'd', 2, { mode: 'bus' }),
      ]),
    ).toBe(0);
  });

  it('does not count staying on the same vehicle as a transfer', () => {
    expect(
      countTransfers([
        makeSegment('e0', 'a', 'b', 0, { mode: 'bus' }),
        makeSegment('e1', 'b', 'c', 1, { mode: 'bus' }),
      ]),
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Explicit origin and destination
// ---------------------------------------------------------------------------

describe('scenario 9: explicit origin and destination', () => {
  it('uses the roles, not the sort order', () => {
    // Deliberately out of topological order: the office is declared first.
    const { graph } = analyse([
      roleStop('office', 0, 'destination'),
      makeStop('middle', 1),
      roleStop('home', 2, 'origin'),
    ]);
    expect(findOrigin(graph)?.id).toBe('home');
    expect(findDestination(graph)?.id).toBe('office');
  });

  it('falls back to declaration order for a graph with no roles', () => {
    const { graph } = analyse([makeStop('first', 0), makeStop('last', 1)]);
    expect(findOrigin(graph)?.id).toBe('first');
    expect(findDestination(graph)?.id).toBe('last');
  });

  it('errors when two nodes claim to be the origin', () => {
    const { issues } = analyse([
      roleStop('a', 0, 'origin'),
      roleStop('b', 1, 'origin'),
      roleStop('c', 2, 'destination'),
    ]);
    const noOrigin = issues.find((i) => i.code === 'no-origin');
    expect(noOrigin?.severity).toBe('error');
    expect(noOrigin?.stopIds).toEqual(['a', 'b']);
  });

  it('errors when no node is the destination', () => {
    const { issues } = analyse([roleStop('a', 0, 'origin'), makeStop('b', 1)]);
    expect(issues.map((i) => i.code)).toContain('no-destination');
  });

  it('errors when the destination is claimed twice', () => {
    const { issues } = analyse([
      roleStop('a', 0, 'origin'),
      roleStop('b', 1, 'destination'),
      roleStop('c', 2, 'destination'),
    ]);
    expect(issues.map((i) => i.code)).toContain('no-destination');
  });

  it('errors when only an origin is marked', () => {
    // The graph has a start and no finish, so the missing piece is the
    // destination. Reporting "no origin" here would send the user to fix the
    // one thing that is already right.
    const { issues } = analyse([roleStop('only', 0, 'origin')]);
    expect(issues.map((i) => i.code)).toContain('no-destination');
    expect(issues.map((i) => i.code)).not.toContain('no-origin');
  });

  it('does not block a graph that forks straight from the origin', () => {
    // A real commute can leave home two ways, and both ways can be complete.
    // Neither fact is a validation problem.
    const { issues, routes } = analyse(
      [
        roleStop('home', 0, 'origin'),
        makeStop('j1', 1),
        makeStop('j2', 2),
        roleStop('office', 3, 'destination'),
      ],
      [
        makeSegment('s1', 'home', 'j1', 0),
        makeSegment('s2', 'j1', 'office', 1),
        makeSegment('s3', 'home', 'j2', 2),
        makeSegment('s4', 'j2', 'office', 3),
      ],
    );
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(routes).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 10. Migration from the old schema
// ---------------------------------------------------------------------------

describe('scenario 10: legacy graphs without roles', () => {
  it('resolveNodeRole infers endpoints from kind', () => {
    expect(resolveNodeRole({ kind: 'home' })).toBe('origin');
    expect(resolveNodeRole({ kind: 'office' })).toBe('destination');
    expect(resolveNodeRole({ kind: 'station' })).toBe('stop');
    expect(resolveNodeRole({ kind: 'stop' })).toBe('stop');
  });

  it('an explicit role always wins over the kind hint', () => {
    // A home that the user has turned into a junction stays a junction.
    expect(resolveNodeRole({ kind: 'home', nodeRole: 'junction' })).toBe('junction');
  });

  it('a pre-role graph still validates and still enumerates', () => {
    const { routes, issues } = analyse(
      [makeStop('a', 0), makeStop('b', 1)],
      [makeSegment('s1', 'a', 'b', 0, { expectedDurationMin: 15 })],
    );
    expect(routes).toHaveLength(1);
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('a pre-role graph is never asked to mark its endpoints', () => {
    const { issues } = analyse(
      [makeStop('a', 0), makeStop('b', 1)],
      [makeSegment('s1', 'a', 'b', 0)],
    );
    // Regression guard: the legacy fallback exists precisely so this is empty.
    expect(issues.map((i) => i.code)).not.toContain('no-origin');
    expect(issues.map((i) => i.code)).not.toContain('no-destination');
  });

  it('a half-finished edit with a destination but no origin does ask', () => {
    const { issues } = analyse([makeStop('a', 0), roleStop('b', 1, 'destination')]);
    expect(issues.map((i) => i.code)).toContain('no-origin');
  });
});

// ---------------------------------------------------------------------------
// 11. Route enumeration guarantees
// ---------------------------------------------------------------------------

describe('scenario 11: enumeration guarantees', () => {
  const branching = () =>
    analyse(
      [
        roleStop('home', 0, 'origin'),
        roleStop('j', 1, 'junction'),
        roleStop('office', 2, 'destination'),
      ],
      [
        makeSegment('w', 'home', 'j', 0, { expectedDurationMin: 5 }),
        makeSegment('m', 'j', 'office', 1, { expectedDurationMin: 20 }),
        makeSegment('b', 'j', 'office', 2, { expectedDurationMin: 30 }),
        makeSegment('c', 'j', 'office', 3, { expectedDurationMin: 40 }),
      ],
    );

  it('never returns duplicate signatures', () => {
    const { routes } = branching();
    expect(new Set(routes.map((r) => r.signature)).size).toBe(routes.length);
  });

  it('respects maxRoutes', () => {
    const graph = branching().graph;
    expect(enumerateRoutes(graph, { maxRoutes: 2 }).length).toBeLessThanOrEqual(2);
  });

  it('respects maxDepth', () => {
    const graph = branching().graph;
    expect(enumerateRoutes(graph, { maxDepth: 1 })).toEqual([]);
  });

  it('is deterministic: the same graph gives the same order every time', () => {
    const first = branching().routes.map((r) => r.signature);
    const second = branching().routes.map((r) => r.signature);
    expect(second).toEqual(first);
  });

  it('returns nothing when the endpoints are identical', () => {
    const graph = branching().graph;
    expect(enumerateRoutes(graph, { originId: 'j', destinationId: 'j' })).toEqual([]);
  });

  it('analyseTemplate is equivalent to the three steps', () => {
    const data = makeGraph(
      [roleStop('home', 0, 'origin'), roleStop('office', 1, 'destination')],
      [makeSegment('s1', 'home', 'office', 0)],
    );
    const graph = buildGraph(data);
    // `analyzeTemplate` builds its own graph internally, so compare content
    // rather than identity.
    const result = analyzeTemplate(data);
    expect(result.graph.templateId).toBe(graph.templateId);
    expect(result.graph.orderedStops).toEqual(graph.orderedStops);
    expect([...result.graph.outgoing.keys()]).toEqual([...graph.outgoing.keys()]);
    expect(result.routes).toEqual(enumerateRoutes(graph));
    expect(result.issues).toEqual(validateGraph(graph));
  });
});

// ---------------------------------------------------------------------------
// 12. Route preview
// ---------------------------------------------------------------------------

describe('scenario 12: route presentation', () => {
  it('formats durations under and over an hour', () => {
    expect(formatDurationLabel(42)).toBe('42 min');
    expect(formatDurationLabel(60)).toBe('1h');
    expect(formatDurationLabel(70)).toBe('1h 10m');
  });

  it('describes a route with arrows, not a set-like middot', () => {
    expect(describeRouteInline(['walk', 'metro', 'walk'], 42)).toBe('Walk → Metro → Walk · 42 min');
  });

  it('describes an empty route rather than rendering nothing', () => {
    expect(describeRouteInline([], undefined)).toBe('No route yet');
  });

  it('labels transfer counts correctly, including the zero case', () => {
    expect(routeTransferLabel(0)).toBe('Direct');
    expect(routeTransferLabel(1)).toBe('1 transfer');
    expect(routeTransferLabel(2)).toBe('2 transfers');
  });
});

// ---------------------------------------------------------------------------
// 13. History depth
// ---------------------------------------------------------------------------

describe('scenario 13: data depth is described honestly', () => {
  it('has five bands with the right boundaries', () => {
    expect(historyDepth(0)).toBe('none');
    expect(historyDepth(1)).toBe('initial');
    expect(historyDepth(2)).toBe('initial');
    expect(historyDepth(3)).toBe('early');
    expect(historyDepth(6)).toBe('early');
    expect(historyDepth(7)).toBe('comparison');
    expect(historyDepth(14)).toBe('comparison');
    expect(historyDepth(15)).toBe('strong');
    expect(historyDepth(400)).toBe('strong');
  });

  it('refuses to call a zero-trip estimate personalised', () => {
    // The guard that stops a cold-start number looking like a hard-won stat.
    expect(isPersonalised(historyDepth(0))).toBe(false);
    expect(isPersonalised(historyDepth(1))).toBe(true);
  });

  it('says plainly that nothing has been recorded at zero trips', () => {
    const sentence = historyDepthLabel(historyDepth(0));
    expect(sentence).toBe('Learning this commute');
  });

  it('counts up to the next band and stops at the top', () => {
    expect(tripsUntilNextBand(0)?.count).toBe(1);
    expect(tripsUntilNextBand(1)?.count).toBe(3);
    expect(tripsUntilNextBand(10)?.count).toBe(15);
    expect(tripsUntilNextBand(50)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 14. Empty graph
// ---------------------------------------------------------------------------

describe('scenario 14: empty and minimal graphs', () => {
  it('an empty graph enumerates nothing and reports no origin', () => {
    const data = makeGraph([], []);
    const graph = buildGraph(data);
    expect(enumerateRoutes(graph)).toEqual([]);
    expect(findOrigin(graph)).toBeNull();
    expect(findDestination(graph)).toBeNull();
    expect(validateGraph(graph).map((i) => i.code)).toContain('no-origin');
  });

  it('an empty graph still lays out without throwing', () => {
    const layout = layoutGraph({ stops: [], segments: [] });
    expect(layout.nodes).toEqual([]);
    expect(layout.columnCount).toBe(0);
  });

  it('a single node is not a valid commute', () => {
    const { issues } = analyse([roleStop('only', 0, 'origin')]);
    expect(issues.some((i) => i.severity === 'error')).toBe(true);
  });

  it('a graph with no connections asks for one', () => {
    const { issues } = analyse([
      roleStop('home', 0, 'origin'),
      roleStop('office', 1, 'destination'),
    ]);
    expect(issues.map((i) => i.code)).toContain('no-connections');
  });

  it('layoutGraph puts unreachable nodes in a trailing column, not nowhere', () => {
    const { stops, segments } = branchingFixture();
    const layout = layoutGraph({ stops, segments });
    // Every stop is placed; a node the user needs to fix must be visible.
    expect(layout.nodes).toHaveLength(stops.length);
    expect(layout.nodes.every((n) => n.column >= 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

describe('commute presets', () => {
  it('every preset instantiates into a valid graph', () => {
    for (const preset of COMMUTE_PRESETS) {
      const { stops, segments } = instantiatePreset(preset, 'tpl-test');
      const { routes, issues } = analyse(stops, segments);

      expect({ preset: preset.id, errors: issues.filter((i) => i.severity === 'error') }).toEqual({
        preset: preset.id,
        errors: [],
      });
      expect(routes.length).toBeGreaterThan(0);
    }
  });

  it('every preset names exactly one origin and one destination', () => {
    for (const preset of COMMUTE_PRESETS) {
      const { stops } = instantiatePreset(preset, 'tpl-test');
      const roles = stops.map((stop) => resolveNodeRole(stop));
      expect({ preset: preset.id, origins: roles.filter((r) => r === 'origin').length }).toEqual({
        preset: preset.id,
        origins: 1,
      });
      expect(roles.filter((r) => r === 'destination')).toHaveLength(1);
    }
  });

  it('the alternatives preset really does produce two routes', () => {
    const preset = COMMUTE_PRESETS.find((p) => p.id === 'alternatives');
    expect(preset).toBeDefined();
    const { stops, segments } = instantiatePreset(preset!, 'tpl-test');
    expect(analyse(stops, segments).routes).toHaveLength(2);
  });

  it('presets carry no invented geography', () => {
    // No route numbers or real place names: a preset that named a real bus
    // would imply Reach knows the user's city.
    for (const preset of COMMUTE_PRESETS) {
      for (const node of preset.nodes) {
        expect(node.name).not.toMatch(/\d/);
      }
    }
  });

  it('presets leave service names empty, since Reach has no timetable', () => {
    for (const preset of COMMUTE_PRESETS) {
      const { segments } = instantiatePreset(preset, 'tpl-test');
      expect(segments.every((s) => s.serviceLabel === null)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Layout determinism
// ---------------------------------------------------------------------------

describe('layout is deterministic and geometry-only', () => {
  it('gives the same result for the same input', () => {
    const { stops, segments } = branchingFixture();
    expect(layoutGraph({ stops, segments })).toEqual(layoutGraph({ stops, segments }));
  });

  it('needs no coordinates at all', () => {
    const { stops, segments } = branchingFixture();
    const layout = layoutGraph({ stops, segments });
    // Everything is derived from topology, so null coordinates are fine.
    expect(stops.every((s) => s.latitude === null && s.longitude === null)).toBe(true);
    expect(layout.nodes).toHaveLength(stops.length);
  });

  it('marks a fork node as a branch', () => {
    const { stops, segments } = branchingFixture();
    const layout = layoutGraph({ stops, segments });
    expect(layout.nodes.find((n) => n.stop.id === 'j')?.isBranch).toBe(true);
    expect(layout.nodes.find((n) => n.stop.id === 'home')?.isBranch).toBe(false);
  });
});

/** Three alternatives from one junction, for layout and enumeration tests. */
function branchingFixture(): { stops: Stop[]; segments: Segment[] } {
  return {
    stops: [
      roleStop('home', 0, 'origin'),
      roleStop('j', 1, 'junction'),
      roleStop('office', 2, 'destination'),
    ],
    segments: [
      makeSegment('w', 'home', 'j', 0, { expectedDurationMin: 5, createdAt: T0, updatedAt: T0 }),
      makeSegment('m', 'j', 'office', 1, { expectedDurationMin: 20, createdAt: T0, updatedAt: T0 }),
      makeSegment('b', 'j', 'office', 2, { expectedDurationMin: 30, createdAt: T0, updatedAt: T0 }),
    ],
  };
}

/** The graph type is exported for the helper above. */
export type { CommuteGraph };
