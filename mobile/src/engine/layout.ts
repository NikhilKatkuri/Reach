/**
 * Lays a commute graph out for display.
 *
 * A layered "columns by depth" layout rather than a force-directed one, for
 * three reasons that matter more than prettier curves:
 *
 * 1. A commute has a direction. Putting the origin on the left and the
 *    destination on the right means the diagram reads the same way the journey
 *    does, so a user can check it at a glance.
 * 2. It is deterministic. The same graph always draws identically, which makes
 *    a change visible instead of mysterious.
 * 3. It needs no physics, so it costs nothing to run on every keystroke while
 *    the user edits.
 *
 * Pure and dependency-free, so it is unit-testable without rendering anything.
 */
import { resolveNodeRole, type Segment, type Stop } from '@/src/types/schemas';

/** A node placed in the layout. */
export interface LaidOutNode {
  readonly stop: Stop;
  /** Column index, 0 at the origin. */
  readonly column: number;
  /** Row within the column, 0 at the top. */
  readonly row: number;
  /** Row count of this node's column, for centring. */
  readonly columnHeight: number;
  /** True when the node has more than one outgoing connection. */
  readonly isBranch: boolean;
}

/** A connection placed in the layout. */
export interface LaidOutConnection {
  readonly segment: Segment;
  readonly fromColumn: number;
  readonly fromRow: number;
  readonly toColumn: number;
  readonly toRow: number;
  /** True when the connection skips a column, i.e. it is a long jump. */
  readonly spansColumns: boolean;
}

/** The full layout of a graph. */
export interface GraphLayout {
  readonly nodes: readonly LaidOutNode[];
  readonly connections: readonly LaidOutConnection[];
  readonly columnCount: number;
  /** Widest column, used to scale horizontal spacing. */
  readonly maxColumnHeight: number;
  readonly originId: string | null;
  readonly destinationId: string | null;
}

/** Inputs, kept minimal so this function has no dependency on the engine. */
export interface LayoutInput {
  readonly stops: readonly Stop[];
  readonly segments: readonly Segment[];
}

/**
 * Assigns each node a column by shortest distance from the origin.
 *
 * Shortest-distance rather than longest-path on purpose: with a cycle in the
 * graph, longest-path is undefined, and an undefined column would put nodes
 * anywhere. Breadth-first gives a stable, finite answer, and any node the
 * origin cannot reach is pushed to a trailing column of its own so it still
 * appears on screen — an orphan the user needs to fix should be visible, not
 * dropped.
 */
export function layoutGraph(input: LayoutInput): GraphLayout {
  const { stops, segments } = input;
  if (stops.length === 0) {
    return {
      nodes: [],
      connections: [],
      columnCount: 0,
      maxColumnHeight: 0,
      originId: null,
      destinationId: null,
    };
  }

  const byId = new Map(stops.map((stop) => [stop.id, stop]));
  const outgoing = new Map<string, Segment[]>();
  for (const segment of segments) {
    const list = outgoing.get(segment.fromStopId);
    if (list === undefined) outgoing.set(segment.fromStopId, [segment]);
    else list.push(segment);
  }

  const origin = pickEndpoint(stops, 'origin');
  const destination = pickEndpoint(stops, 'destination');

  // Breadth-first from the origin, in stable declaration order.
  const column = new Map<string, number>();
  const order: string[] = [];
  const queue: string[] = [];

  if (origin !== null) {
    column.set(origin.id, 0);
    order.push(origin.id);
    queue.push(origin.id);
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    const at = column.get(current) ?? 0;
    for (const segment of outgoing.get(current) ?? []) {
      if (!byId.has(segment.toStopId)) continue;
      if (column.has(segment.toStopId)) continue;
      column.set(segment.toStopId, at + 1);
      order.push(segment.toStopId);
      queue.push(segment.toStopId);
    }
  }

  // Anything unreachable from the origin goes in a trailing column of its own,
  // so an orphan is visible instead of silently dropped from the diagram.
  const orphans = stops.filter((stop) => !column.has(stop.id));
  const orphanColumn = (column.size > 0 ? Math.max(...column.values()) + 1 : 0) + 1;
  for (const stop of orphans) {
    column.set(stop.id, orphanColumn);
    order.push(stop.id);
  }

  // Group into columns, preserving the order the BFS discovered them so the
  // primary path reads left-to-right along the top of the diagram.
  const columns = new Map<number, string[]>();
  for (const id of order) {
    const at = column.get(id) ?? 0;
    const list = columns.get(at);
    if (list === undefined) columns.set(at, [id]);
    else list.push(id);
  }

  const columnIndexes = [...columns.keys()].sort((a, b) => a - b);
  const rows = new Map<string, number>();
  const columnHeights = new Map<number, number>();

  for (const at of columnIndexes) {
    const ids = columns.get(at) ?? [];
    ids.forEach((id, index) => rows.set(id, index));
    columnHeights.set(at, ids.length);
  }

  const rowOf = (id: string): number => rows.get(id) ?? 0;
  const heightOf = (columnIndex: number): number => columnHeights.get(columnIndex) ?? 1;

  const nodes: LaidOutNode[] = stops.map((stop) => {
    const at = column.get(stop.id) ?? 0;
    return {
      stop,
      column: at,
      row: rowOf(stop.id),
      columnHeight: heightOf(at),
      isBranch: (outgoing.get(stop.id)?.length ?? 0) > 1 || resolveNodeRole(stop) === 'junction',
    };
  });

  const connections: LaidOutConnection[] = segments
    // A connection to a deleted node cannot be drawn; validateGraph reports it.
    .filter((segment) => byId.has(segment.fromStopId) && byId.has(segment.toStopId))
    .map((segment) => {
      const fromColumn = column.get(segment.fromStopId) ?? 0;
      const toColumn = column.get(segment.toStopId) ?? 0;
      return {
        segment,
        fromColumn,
        fromRow: rowOf(segment.fromStopId),
        toColumn,
        toRow: rowOf(segment.toStopId),
        spansColumns: toColumn - fromColumn > 1,
      };
    });

  return {
    nodes,
    connections,
    columnCount: columnIndexes.length,
    maxColumnHeight: Math.max(1, ...columnHeights.values()),
    originId: origin?.id ?? null,
    destinationId: destination?.id ?? null,
  };
}

/**
 * Picks the node with the given role.
 *
 * Falls back to declaration order, mirroring the engine's legacy convention,
 * so a graph without roles still lays out rather than collapsing.
 */
function pickEndpoint(stops: readonly Stop[], role: 'origin' | 'destination'): Stop | null {
  const explicit = stops.find((stop) => resolveNodeRole(stop) === role);
  if (explicit !== undefined) return explicit;

  if (role === 'origin') {
    const hasEndpoints = stops.some(
      (stop) => resolveNodeRole(stop) === 'origin' || resolveNodeRole(stop) === 'destination',
    );
    // A graph with a destination but no origin is mid-edit; guessing the
    // origin would hide the real problem.
    if (hasEndpoints) return null;
    return stops[0] ?? null;
  }

  const hasEndpoints = stops.some(
    (stop) => resolveNodeRole(stop) === 'origin' || resolveNodeRole(stop) === 'destination',
  );
  if (hasEndpoints) return null;
  return stops.length > 1 ? (stops[stops.length - 1] ?? null) : null;
}
