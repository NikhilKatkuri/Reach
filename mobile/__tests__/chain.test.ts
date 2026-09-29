/**
 * Chain derivation and editor-state transitions.
 *
 * The chain is what the commute builder actually shows, and the store actions
 * that maintain it. Both are tested without a renderer: the derivation is a
 * pure function, and the store is Zustand, which is deliberately usable outside
 * React.
 */
import { buildChainHops, chainProgress, connectionBetween } from '@/src/engine/chain';
import { useTemplateEditor } from '@/src/store/templateEditor';
import { resolveNodeRole, type Segment, type Stop } from '@/src/types/schemas';
import { makeSegment, makeStop } from './fixtures';

function stop(id: string, sortOrder: number, role?: Stop['nodeRole']): Stop {
  return makeStop(id, sortOrder, role === undefined ? {} : { nodeRole: role });
}

/** Puts a known, empty graph into the store and returns it. */
function loadDraft(): void {
  useTemplateEditor.getState().load(null);
  useTemplateEditor
    .getState()
    .loadStops(
      [stop('home', 0, 'origin'), stop('j', 1, 'junction'), stop('office', 2, 'destination')],
      [],
    );
}

const editor = () => useTemplateEditor.getState();

describe('buildChainHops', () => {
  it('produces one hop per adjacent pair', () => {
    const hops = buildChainHops({
      stops: [stop('a', 0), stop('b', 1), stop('c', 2)],
      segments: [],
    });
    expect(hops).toHaveLength(2);
    expect(hops[0]?.from.id).toBe('a');
    expect(hops[0]?.to.id).toBe('b');
    expect(hops[1]?.from.id).toBe('b');
    expect(hops[1]?.to.id).toBe('c');
  });

  it('returns nothing for fewer than two places', () => {
    expect(buildChainHops({ stops: [], segments: [] })).toEqual([]);
    expect(buildChainHops({ stops: [stop('only', 0)], segments: [] })).toEqual([]);
  });

  it('follows declared order, not id or insertion order', () => {
    const hops = buildChainHops({
      stops: [stop('z', 2), stop('a', 0), stop('m', 1)],
      segments: [],
    });
    expect(hops.map((hop) => `${hop.from.id}->${hop.to.id}`)).toEqual(['a->m', 'm->z']);
  });

  it('treats the first connection between a pair as primary', () => {
    const hops = buildChainHops({
      stops: [stop('a', 0), stop('b', 1)],
      segments: [
        makeSegment('first', 'a', 'b', 0, { expectedDurationMin: 30 }),
        makeSegment('second', 'a', 'b', 1, { expectedDurationMin: 10 }),
      ],
    });
    // Chosen by declaration, not duration. Picking the faster one would
    // silently rewrite the route the user described.
    expect(hops[0]?.primary?.id).toBe('first');
    expect(hops[0]?.alternatives.map((s) => s.id)).toEqual(['second']);
  });

  it('reports an unconnected hop as having no primary', () => {
    const hops = buildChainHops({
      stops: [stop('a', 0), stop('b', 1), stop('c', 2)],
      segments: [makeSegment('s1', 'a', 'b', 0)],
    });
    expect(hops[0]?.primary).not.toBeNull();
    expect(hops[1]?.primary).toBeNull();
  });

  it('ignores connections that skip a place', () => {
    // a → c is a shortcut, not part of the a → b → c chain.
    const hops = buildChainHops({
      stops: [stop('a', 0), stop('b', 1), stop('c', 2)],
      segments: [makeSegment('shortcut', 'a', 'c', 0)],
    });
    expect(hops.every((hop) => hop.primary === null)).toBe(true);
  });

  it('ignores connections pointing at places that are not in the list', () => {
    const hops = buildChainHops({
      stops: [stop('a', 0), stop('b', 1)],
      segments: [makeSegment('ghost', 'a', 'nowhere', 0)],
    });
    expect(hops[0]?.primary).toBeNull();
  });
});

describe('chainProgress', () => {
  it('counts connected hops', () => {
    const hops = buildChainHops({
      stops: [stop('a', 0), stop('b', 1), stop('c', 2)],
      segments: [makeSegment('s1', 'a', 'b', 0)],
    });
    expect(chainProgress(hops)).toEqual({ connected: 1, total: 2, isComplete: false });
  });

  it('is complete only when every hop is connected', () => {
    const hops = buildChainHops({
      stops: [stop('a', 0), stop('b', 1)],
      segments: [makeSegment('s1', 'a', 'b', 0)],
    });
    expect(chainProgress(hops).isComplete).toBe(true);
  });

  it('is never complete for an empty chain', () => {
    // Two places is the minimum for a commute; one is a mistake, not a chain.
    expect(chainProgress([]).isComplete).toBe(false);
  });
});

describe('connectionBetween', () => {
  it('finds the connection in the forward direction only', () => {
    const segments: Segment[] = [makeSegment('s1', 'a', 'b', 0)];
    expect(connectionBetween(segments, 'a', 'b')?.id).toBe('s1');
    // Directed: b → a is a different journey, and the graph is directed.
    expect(connectionBetween(segments, 'b', 'a')).toBeNull();
  });
});

describe('editor: adding places', () => {
  it('infers origin then destination then stop', () => {
    loadDraft();
    editor().reset();
    const first = editor().addStop('Home', 'home');
    const second = editor().addStop('Campus', 'office');
    const third = editor().addStop('Bus Stop', 'station');

    expect(resolveNodeRole(draftStop(first))).toBe('origin');
    expect(resolveNodeRole(draftStop(second))).toBe('destination');
    expect(resolveNodeRole(draftStop(third))).toBe('stop');
  });

  it('keeps the template endpoint names in step with the roles', () => {
    editor().reset();
    editor().addStop('Home', 'home');
    expect(useTemplateEditor.getState().draft.originName).toBe('Home');
    editor().addStop('Campus', 'office');
    expect(useTemplateEditor.getState().draft.destinationName).toBe('Campus');
  });

  it('rejects a blank stop name at the store level', () => {
    // The UI filters this, but a store is a public surface.
    editor().reset();
    const before = useTemplateEditor.getState().draft.stops.length;
    editor().addStop('', 'stop');
    expect(useTemplateEditor.getState().draft.stops.length).toBe(before);
  });

  it('renames in place', () => {
    editor().reset();
    const id = editor().addStop('Home', 'home');
    editor().renameStop(id, 'Flat');
    expect(draftStop(id).name).toBe('Flat');
  });
});

describe('editor: setConnection upserts', () => {
  it('creates a connection when the hop is empty', () => {
    loadDraft();
    editor().setConnection('home', 'j', { mode: 'walk', expectedDurationMin: 8 });
    const { segments } = useTemplateEditor.getState().draft;
    expect(segments).toHaveLength(1);
    expect(segments[0]?.fromStopId).toBe('home');
    expect(segments[0]?.expectedDurationMin).toBe(8);
  });

  it('updates the same row on a second edit, rather than adding another', () => {
    // The chain editor edits a hop repeatedly: mode, then time, then waiting.
    // Inserting each time would leave three parallel connections between one
    // pair of places, which the engine would enumerate as three routes.
    loadDraft();
    editor().setConnection('home', 'j', { mode: 'walk', expectedDurationMin: 8 });
    editor().setConnection('home', 'j', { mode: 'walk', expectedDurationMin: 12 });
    editor().setConnection('home', 'j', {
      mode: 'walk',
      expectedDurationMin: 12,
      bufferMinutes: 4,
    });

    const { segments } = useTemplateEditor.getState().draft;
    expect(segments).toHaveLength(1);
    expect(segments[0]?.expectedDurationMin).toBe(12);
    expect(segments[0]?.bufferMinutes).toBe(4);
  });

  it('changes the mode without losing the id', () => {
    loadDraft();
    editor().setConnection('home', 'j', { mode: 'walk', expectedDurationMin: 8 });
    const before = useTemplateEditor.getState().draft.segments[0]!.id;
    editor().setConnection('home', 'j', { mode: 'bus', expectedDurationMin: 8 });
    const after = useTemplateEditor.getState().draft.segments[0]!;
    expect(after.id).toBe(before);
    expect(after.mode).toBe('bus');
  });

  it('keeps the service name when only the duration changes', () => {
    loadDraft();
    editor().setConnection('home', 'j', {
      mode: 'bus',
      expectedDurationMin: 8,
      serviceLabel: 'Bus 219',
    });
    editor().setConnection('home', 'j', { mode: 'bus', expectedDurationMin: 14 });
    expect(useTemplateEditor.getState().draft.segments[0]?.serviceLabel).toBe('Bus 219');
  });

  it('keeps a genuine alternative as a second connection', () => {
    loadDraft();
    editor().setConnection('home', 'j', { mode: 'walk', expectedDurationMin: 8 });
    // A different pair is a different hop; the same pair twice is an edit.
    editor().setConnection('j', 'office', { mode: 'metro', expectedDurationMin: 20 });
    expect(useTemplateEditor.getState().draft.segments).toHaveLength(2);
  });

  it('clearConnection removes only that hop', () => {
    loadDraft();
    editor().setConnection('home', 'j', { mode: 'walk', expectedDurationMin: 8 });
    editor().setConnection('j', 'office', { mode: 'metro', expectedDurationMin: 20 });
    editor().clearConnection('home', 'j');

    const { segments } = useTemplateEditor.getState().draft;
    expect(segments).toHaveLength(1);
    expect(segments[0]?.fromStopId).toBe('j');
  });
});

describe('editor: junction promotion', () => {
  it('promotes a fork point to a junction when a second route is added', () => {
    loadDraft();
    editor().setConnection('j', 'office', { mode: 'metro', expectedDurationMin: 20 });
    editor().addAlternative({
      fromStopId: 'j',
      toStopId: 'office',
      mode: 'bus',
      expectedDurationMin: 35,
    });

    const j = draftStop('j');
    expect(resolveNodeRole(j)).toBe('junction');
    expect(useTemplateEditor.getState().draft.segments).toHaveLength(2);
  });

  it('never demotes the origin or destination to a junction', () => {
    // A node has exactly one role, and an origin with two ways out is still an
    // origin. The diagram draws that fork from out-degree regardless.
    editor().reset();
    const home = editor().addStop('Home', 'home');
    const office = editor().addStop('Campus', 'office');
    editor().setConnection(home, office, { mode: 'walk', expectedDurationMin: 20 });
    editor().addAlternative({
      fromStopId: home,
      toStopId: office,
      mode: 'bike',
      expectedDurationMin: 12,
    });

    expect(resolveNodeRole(draftStop(home))).toBe('origin');
    expect(resolveNodeRole(draftStop(office))).toBe('destination');
  });
});

describe('editor: roles stay exclusive', () => {
  it('demotes the previous origin rather than creating two', () => {
    loadDraft();
    editor().setStopRole('j', 'origin');
    const roles = useTemplateEditor.getState().draft.stops.map((s) => resolveNodeRole(s));
    expect(roles.filter((r) => r === 'origin')).toHaveLength(1);
    expect(resolveNodeRole(draftStop('j'))).toBe('origin');
  });

  it('demotes the previous destination rather than creating two', () => {
    loadDraft();
    editor().setStopRole('j', 'destination');
    const roles = useTemplateEditor.getState().draft.stops.map((s) => resolveNodeRole(s));
    expect(roles.filter((r) => r === 'destination')).toHaveLength(1);
  });

  it('updates the template endpoint names to match', () => {
    loadDraft();
    editor().setStopRole('j', 'origin');
    expect(useTemplateEditor.getState().draft.originName).toBe('j');
  });
});

describe('editor: removing a place repairs the graph', () => {
  it('promotes a new origin so the draft stays saveable', () => {
    // Deleting the origin must not leave the graph with no start, which
    // validation would block on save — an unrecoverable state from one tap.
    loadDraft();
    editor().removeStop('home');
    const { stops } = useTemplateEditor.getState().draft;
    expect(stops.map((s) => resolveNodeRole(s))).toContain('origin');
  });

  it('removes the connections that used the removed place', () => {
    loadDraft();
    editor().setConnection('home', 'j', { mode: 'walk', expectedDurationMin: 8 });
    editor().removeStop('j');
    expect(useTemplateEditor.getState().draft.segments).toHaveLength(0);
  });

  it('renumbers sortOrder so the chain stays contiguous', () => {
    loadDraft();
    editor().removeStop('j');
    const orders = useTemplateEditor
      .getState()
      .draft.stops.map((s) => s.sortOrder)
      .sort((a, b) => a - b);
    expect(orders).toEqual([0, 1]);
  });
});

describe('editor: setEndpoints', () => {
  it('changes only what it is given', () => {
    loadDraft();
    editor().setEndpoints({ name: 'College' });
    const draft = useTemplateEditor.getState().draft;
    expect(draft.name).toBe('College');
    expect(draft.originName).toBe('home');
  });
});

/** Reads one stop out of the current draft. */
function draftStop(id: string): Stop {
  const found = useTemplateEditor.getState().draft.stops.find((s) => s.id === id);
  if (found === undefined) throw new Error(`No stop ${id} in the draft.`);
  return found;
}
