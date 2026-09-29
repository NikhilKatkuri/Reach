/**
 * Shared fixtures for engine tests.
 *
 * The graph fixture mirrors the seeded "Home → HITAM" commute: a bus leg and a
 * metro leg with a walking transfer between them, plus a branch that offers a
 * faster but less reliable all-bus alternative.
 */
import { type Segment, type Stop, type TemplateGraph } from '@/src/types/schemas';

const T0 = 1_700_000_000_000;

/** Stop ids used by the fixture, exported so tests can assert on them. */
export const STOPS = {
  home: 'stop-home',
  busStand: 'stop-bus-stand',
  ameerpet: 'stop-ameerpet',
  moosarambagh: 'stop-moosarambagh',
  jntu: 'stop-jntu',
  office: 'stop-office',
} as const;

/** Segment ids used by the fixture. */
export const SEGMENTS = {
  walkToStand: 'seg-walk-to-stand',
  busToAmeerpet: 'seg-bus-to-ameerpet',
  busToJntu: 'seg-bus-to-jntu',
  walkAmeerpetToMoosarambagh: 'seg-walk-ameerpet-moosarambagh',
  metroToMoosarambagh: 'seg-metro-to-moosarambagh',
  walkToOffice: 'seg-walk-to-office',
} as const;

/** The bus+metro template graph. */
export const COMMUTE_GRAPH: TemplateGraph = {
  template: {
    id: 'tpl-1',
    name: 'Home → Office',
    originName: 'Home',
    destinationName: 'Office',
    colorSeed: '#00639B',
    notes: null,
    isArchived: false,
    isDefault: true,
    sortOrder: 0,
    createdAt: T0,
    updatedAt: T0,
  },
  stops: [
    {
      id: STOPS.home,
      templateId: 'tpl-1',
      name: 'Home',
      kind: 'home',
      latitude: null,
      longitude: null,
      sortOrder: 0,
      createdAt: T0,
      updatedAt: T0,
    },
    {
      id: STOPS.busStand,
      templateId: 'tpl-1',
      name: 'Bus Stop A',
      kind: 'stop',
      latitude: null,
      longitude: null,
      sortOrder: 1,
      createdAt: T0,
      updatedAt: T0,
    },
    {
      id: STOPS.ameerpet,
      templateId: 'tpl-1',
      name: 'Ameerpet',
      kind: 'station',
      latitude: null,
      longitude: null,
      sortOrder: 2,
      createdAt: T0,
      updatedAt: T0,
    },
    {
      id: STOPS.jntu,
      templateId: 'tpl-1',
      name: 'JNTU',
      kind: 'stop',
      latitude: null,
      longitude: null,
      sortOrder: 3,
      createdAt: T0,
      updatedAt: T0,
    },
    {
      id: STOPS.moosarambagh,
      templateId: 'tpl-1',
      name: 'Moosarambagh',
      kind: 'stop',
      latitude: null,
      longitude: null,
      sortOrder: 4,
      createdAt: T0,
      updatedAt: T0,
    },
    {
      id: STOPS.office,
      templateId: 'tpl-1',
      name: 'Office',
      kind: 'office',
      latitude: null,
      longitude: null,
      sortOrder: 5,
      createdAt: T0,
      updatedAt: T0,
    },
  ],
  segments: [
    {
      id: SEGMENTS.walkToStand,
      templateId: 'tpl-1',
      fromStopId: STOPS.home,
      toStopId: STOPS.busStand,
      mode: 'walk',
      serviceLabel: null,
      expectedDurationMin: 8,
      bufferMinutes: 0,
      transferWindowMin: null,
      branchGroup: null,
      branchLabel: null,
      sortOrder: 0,
      createdAt: T0,
      updatedAt: T0,
    },
    {
      id: SEGMENTS.busToAmeerpet,
      templateId: 'tpl-1',
      fromStopId: STOPS.busStand,
      toStopId: STOPS.ameerpet,
      mode: 'bus',
      serviceLabel: 'Bus 10H',
      expectedDurationMin: 18,
      bufferMinutes: 0,
      transferWindowMin: 6,
      branchGroup: 'main',
      branchLabel: 'Via Ameerpet',
      sortOrder: 1,
      createdAt: T0,
      updatedAt: T0,
    },
    {
      id: SEGMENTS.busToJntu,
      templateId: 'tpl-1',
      fromStopId: STOPS.busStand,
      toStopId: STOPS.jntu,
      mode: 'bus',
      serviceLabel: 'Bus 216',
      expectedDurationMin: 40,
      bufferMinutes: 0,
      transferWindowMin: null,
      branchGroup: 'main',
      branchLabel: 'Bus only',
      sortOrder: 2,
      createdAt: T0,
      updatedAt: T0,
    },
    {
      id: SEGMENTS.walkAmeerpetToMoosarambagh,
      templateId: 'tpl-1',
      fromStopId: STOPS.ameerpet,
      toStopId: STOPS.moosarambagh,
      mode: 'walk',
      serviceLabel: null,
      expectedDurationMin: 4,
      bufferMinutes: 0,
      transferWindowMin: null,
      branchGroup: null,
      branchLabel: null,
      sortOrder: 3,
      createdAt: T0,
      updatedAt: T0,
    },
    {
      id: SEGMENTS.metroToMoosarambagh,
      templateId: 'tpl-1',
      fromStopId: STOPS.ameerpet,
      toStopId: STOPS.moosarambagh,
      mode: 'metro',
      serviceLabel: 'Metro Blue',
      expectedDurationMin: 11,
      bufferMinutes: 0,
      transferWindowMin: 5,
      branchGroup: 'main',
      branchLabel: 'Via Ameerpet',
      sortOrder: 4,
      createdAt: T0,
      updatedAt: T0,
    },
    {
      id: SEGMENTS.walkToOffice,
      templateId: 'tpl-1',
      fromStopId: STOPS.moosarambagh,
      toStopId: STOPS.office,
      mode: 'walk',
      serviceLabel: null,
      expectedDurationMin: 9,
      bufferMinutes: 0,
      transferWindowMin: null,
      branchGroup: null,
      branchLabel: null,
      sortOrder: 5,
      createdAt: T0,
      updatedAt: T0,
    },
    {
      id: 'seg-jntu-walk',
      templateId: 'tpl-1',
      fromStopId: STOPS.jntu,
      toStopId: STOPS.office,
      mode: 'walk',
      serviceLabel: null,
      expectedDurationMin: 12,
      bufferMinutes: 0,
      transferWindowMin: null,
      branchGroup: null,
      branchLabel: null,
      sortOrder: 6,
      createdAt: T0,
      updatedAt: T0,
    },
  ],
};

/** Signatures the fixture graph should enumerate, fastest first. */
export const BUS_METRO_SIGNATURE = [
  SEGMENTS.walkToStand,
  SEGMENTS.busToAmeerpet,
  SEGMENTS.metroToMoosarambagh,
  SEGMENTS.walkToOffice,
].join('|');

/** The all-bus alternative. */
export const BUS_ONLY_SIGNATURE = [SEGMENTS.walkToStand, SEGMENTS.busToJntu, 'seg-jntu-walk'].join(
  '|',
);

/** Bus then walk — the third branch, created by the parallel walk edge. */
export const BUS_WALK_SIGNATURE = [
  SEGMENTS.walkToStand,
  SEGMENTS.busToAmeerpet,
  SEGMENTS.walkAmeerpetToMoosarambagh,
  SEGMENTS.walkToOffice,
].join('|');

/** Builds a stop with sensible defaults, for validation tests. */
export function makeStop(id: string, sortOrder: number, overrides: Partial<Stop> = {}): Stop {
  return {
    id,
    templateId: 'tpl-x',
    name: id,
    kind: 'stop',
    latitude: null,
    longitude: null,
    sortOrder,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

/** Builds a segment with sensible defaults, for validation tests. */
export function makeSegment(
  id: string,
  fromStopId: string,
  toStopId: string,
  sortOrder: number,
  overrides: Partial<Segment> = {},
): Segment {
  return {
    id,
    templateId: 'tpl-x',
    fromStopId,
    toStopId,
    mode: 'walk',
    serviceLabel: null,
    expectedDurationMin: 10,
    bufferMinutes: 0,
    transferWindowMin: null,
    branchGroup: null,
    branchLabel: null,
    sortOrder,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

/** Builds a minimal valid graph from raw stops and segments. */
export function makeGraph(stops: Stop[], segments: Segment[]): TemplateGraph {
  return {
    ...COMMUTE_GRAPH,
    template: { ...COMMUTE_GRAPH.template, id: 'tpl-x' },
    stops,
    segments,
  };
}

/** Fixed "now" used across tests: 2024-01-15 08:00 local. */
export const NOW = new Date(2024, 0, 15, 8, 0, 0).getTime();

/** Target arrival: 09:05 local, i.e. 65 minutes away. */
export const TARGET_ARRIVAL = new Date(2024, 0, 15, 9, 5, 0).getTime();
