/**
 * Commute presets for the new-commute flow.
 *
 * These are *structural* templates: named shapes for the kind of journey
 * someone has, with placeholder names and durations for the user to replace.
 * No invented geography, no fake route numbers, no "Bus 219 from Ameerpet to
 * HITAM" — a preset that named real-looking routes would teach the user that
 * Reach knows their city, which it does not.
 *
 * Each preset returns nodes and connections relative to a template id, so the
 * caller can drop the result straight into the editor store.
 */
import { uuid } from '@/src/lib/uuid';
import {
  type NodeRole,
  type Segment,
  type Stop,
  type StopKind,
  type TransportMode,
} from '@/src/types/schemas';

/** A node in a preset, before ids are assigned. */
interface PresetNode {
  readonly key: string;
  readonly name: string;
  readonly kind: StopKind;
  readonly role: NodeRole;
}

/** A connection in a preset, before ids are assigned. */
interface PresetConnection {
  readonly from: string;
  readonly to: string;
  readonly mode: TransportMode;
  readonly minutes: number;
}

/** A structural starting point for a new commute. */
export interface CommutePreset {
  readonly id: string;
  readonly title: string;
  /** One line, in the user's terms rather than graph terms. */
  readonly blurb: string;
  readonly nodes: readonly PresetNode[];
  readonly connections: readonly PresetConnection[];
}

/**
 * The presets, in the order they are offered.
 *
 * Ordered simplest-first. "Simple commute" is the answer for a lot of people
 * and should be one tap; the branching ones are further down because they need
 * more thought.
 */
export const COMMUTE_PRESETS: readonly CommutePreset[] = [
  {
    id: 'simple',
    title: 'Simple commute',
    blurb: 'Home straight to where you are going.',
    nodes: [
      { key: 'start', name: 'Start', kind: 'home', role: 'origin' },
      { key: 'end', name: 'Destination', kind: 'office', role: 'destination' },
    ],
    connections: [{ from: 'start', to: 'end', mode: 'walk', minutes: 20 }],
  },
  {
    id: 'one-transfer',
    title: 'One change',
    blurb: 'Get somewhere, change once, carry on.',
    nodes: [
      { key: 'start', name: 'Start', kind: 'home', role: 'origin' },
      { key: 'change', name: 'Change here', kind: 'station', role: 'junction' },
      { key: 'end', name: 'Destination', kind: 'office', role: 'destination' },
    ],
    connections: [
      { from: 'start', to: 'change', mode: 'walk', minutes: 8 },
      { from: 'change', to: 'end', mode: 'metro', minutes: 25 },
    ],
  },
  {
    id: 'walk-transit',
    title: 'Walk, then transit, then walk',
    blurb: 'The usual walk-transport-walk shape.',
    nodes: [
      { key: 'start', name: 'Start', kind: 'home', role: 'origin' },
      { key: 'board', name: 'Board here', kind: 'station', role: 'stop' },
      { key: 'alight', name: 'Get off here', kind: 'station', role: 'stop' },
      { key: 'end', name: 'Destination', kind: 'office', role: 'destination' },
    ],
    connections: [
      { from: 'start', to: 'board', mode: 'walk', minutes: 6 },
      { from: 'board', to: 'alight', mode: 'bus', minutes: 22 },
      { from: 'alight', to: 'end', mode: 'walk', minutes: 9 },
    ],
  },
  {
    id: 'multi-transfer',
    title: 'Several changes',
    blurb: 'Two or more changes along the way.',
    nodes: [
      { key: 'start', name: 'Start', kind: 'home', role: 'origin' },
      { key: 'j1', name: 'First change', kind: 'station', role: 'junction' },
      { key: 'j2', name: 'Second change', kind: 'station', role: 'junction' },
      { key: 'end', name: 'Destination', kind: 'office', role: 'destination' },
    ],
    connections: [
      { from: 'start', to: 'j1', mode: 'walk', minutes: 5 },
      { from: 'j1', to: 'j2', mode: 'bus', minutes: 18 },
      { from: 'j2', to: 'end', mode: 'metro', minutes: 20 },
    ],
  },
  {
    id: 'last-mile',
    title: 'Transit, then a choice',
    blurb: 'Get off the train, then walk, auto or cab.',
    nodes: [
      { key: 'start', name: 'Start', kind: 'home', role: 'origin' },
      { key: 'alight', name: 'Get off here', kind: 'station', role: 'junction' },
      { key: 'end', name: 'Destination', kind: 'office', role: 'destination' },
    ],
    connections: [
      { from: 'start', to: 'alight', mode: 'metro', minutes: 28 },
      { from: 'alight', to: 'end', mode: 'walk', minutes: 12 },
    ],
  },
  {
    id: 'alternatives',
    title: 'More than one way',
    blurb: 'One place you can branch from, several ways through it.',
    nodes: [
      { key: 'start', name: 'Start', kind: 'home', role: 'origin' },
      { key: 'change', name: 'Change here', kind: 'station', role: 'junction' },
      { key: 'end', name: 'Destination', kind: 'office', role: 'destination' },
    ],
    connections: [
      { from: 'start', to: 'change', mode: 'walk', minutes: 7 },
      { from: 'change', to: 'end', mode: 'metro', minutes: 22 },
      { from: 'change', to: 'end', mode: 'bus', minutes: 30 },
    ],
  },
];

/** The materialised result of applying a preset to a template. */
export interface PresetDraft {
  readonly stops: readonly Stop[];
  readonly segments: readonly Segment[];
}

/**
 * Turns a preset into concrete draft nodes and connections.
 *
 * Roles are carried through from the preset, which is the point: a preset
 * named "more than one way" produces a graph whose middle node is a genuine
 * junction rather than three unrelated rows.
 */
export function instantiatePreset(preset: CommutePreset, templateId: string): PresetDraft {
  const now = Date.now();
  const idFor = new Map<string, string>();

  const stops: Stop[] = preset.nodes.map((node, index) => {
    const id = uuid();
    idFor.set(node.key, id);
    return {
      id,
      templateId,
      name: node.name,
      kind: node.kind,
      nodeRole: node.role,
      latitude: null,
      longitude: null,
      sortOrder: index,
      createdAt: now,
      updatedAt: now,
    };
  });

  const segments = preset.connections.map((connection, index) => {
    const from = idFor.get(connection.from);
    const to = idFor.get(connection.to);
    // The presets are defined in this file, so a missing key is a bug here
    // rather than bad user input; the skip keeps a bad preset from producing
    // a connection referencing nothing.
    if (from === undefined || to === undefined) {
      throw new Error(`Preset "${preset.id}" references an unknown node.`);
    }

    return {
      id: uuid(),
      templateId,
      fromStopId: from,
      toStopId: to,
      mode: connection.mode,
      // Left null on purpose: the app has no timetable, so it has no
      // service names to offer. A made-up "Metro Blue" would be a guess the
      // user has to correct, and worse, one they might not notice.
      serviceLabel: null,
      expectedDurationMin: connection.minutes,
      bufferMinutes: 0,
      transferWindowMin: null,
      branchGroup: null,
      branchLabel: null,
      sortOrder: index,
      createdAt: now,
      updatedAt: now,
    };
  });

  return { stops, segments };
}
