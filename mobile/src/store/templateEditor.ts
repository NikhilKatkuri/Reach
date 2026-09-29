/** Backing store for the template editor. */
import { create } from 'zustand';
import {
  resolveNodeRole,
  type NodeRole,
  type Segment,
  type Stop,
  type StopKind,
  type TemplateGraph,
} from '@/src/types/schemas';
import { uuid } from '@/src/lib/uuid';

/** Draft state for the template builder. */
export interface TemplateDraft {
  readonly id: string;
  readonly name: string;
  readonly originName: string;
  readonly destinationName: string;
  readonly notes: string;
  readonly stops: readonly Stop[];
  readonly segments: readonly Segment[];
  /** Steps the user has to fix before saving is allowed. */
  readonly validationErrors: readonly string[];
}

/** Actions exposed by the editor store. */
export interface TemplateEditorActions {
  /** Loads a template into the editor, or creates a blank one. */
  readonly load: (graph: TemplateGraph | null, fallbackName?: string) => void;
  readonly setName: (name: string) => void;
  readonly setNotes: (notes: string) => void;
  /**
   * Adds a node.
   *
   * `role` defaults sensibly from position: the first node added is the
   * origin, the second the destination, anything after that a stop. That is
   * what makes "type a name, tap add, type another name, tap add" produce a
   * valid graph without the user ever choosing a role.
   */
  readonly addStop: (name: string, kind?: StopKind, role?: NodeRole) => string;
  readonly renameStop: (stopId: string, name: string) => void;
  readonly removeStop: (stopId: string) => void;
  /** Moves a stop, and rewrites the sort order of its neighbours. */
  readonly moveStop: (stopId: string, direction: -1 | 1) => void;
  /**
   * Changes a node's role.
   *
   * Enforces the single-origin and single-destination rule by demoting the
   * previous holder to a plain stop, so the user can never produce a graph
   * that validation will reject for this reason.
   */
  readonly setStopRole: (stopId: string, role: NodeRole) => void;
  /** Replaces the whole graph, e.g. from the quick-start flow. */
  readonly loadStops: (stops: readonly Stop[], segments: readonly Segment[]) => void;
  /** Replaces the commute's identity, alongside a freshly built graph. */
  readonly setEndpoints: (input: {
    name?: string;
    originName?: string;
    destinationName?: string;
  }) => void;
  /** Replaces only the connections, e.g. when adding an alternative route. */
  readonly addAlternative: (input: {
    fromStopId: string;
    toStopId: string;
    mode: Segment['mode'];
    expectedDurationMin: number;
    serviceLabel?: string | null;
    bufferMinutes?: number;
  }) => string;
  readonly addSegment: (input: {
    fromStopId: string;
    toStopId: string;
    mode: Segment['mode'];
    expectedDurationMin: number;
    serviceLabel?: string | null;
    bufferMinutes?: number;
    transferWindowMin?: number | null;
    branchLabel?: string | null;
  }) => string;
  readonly updateSegment: (
    segmentId: string,
    patch: Partial<Omit<Segment, 'id' | 'templateId' | 'createdAt'>>,
  ) => void;
  readonly removeSegment: (segmentId: string) => void;
  /**
   * Creates or updates the direct connection between two places.
   *
   * Upsert rather than insert, because the chain editor edits the same hop
   * repeatedly: the user sets the mode, then the duration, then the waiting
   * time, and each keystroke has to update one row rather than accumulate three
   * parallel connections between the same pair.
   */
  readonly setConnection: (
    fromStopId: string,
    toStopId: string,
    input: {
      mode: Segment['mode'];
      expectedDurationMin: number;
      bufferMinutes?: number;
      serviceLabel?: string | null;
    },
  ) => string;
  /** Clears a chain hop without removing either end. */
  readonly clearConnection: (fromStopId: string, toStopId: string) => void;
  /** Marks the draft dirty. */
  readonly touch: () => void;
  readonly isDirty: boolean;
  readonly reset: () => void;
}

const emptyDraft = (): TemplateDraft => ({
  id: uuid(),
  name: '',
  originName: 'Home',
  destinationName: 'Office',
  notes: '',
  stops: [],
  segments: [],
  validationErrors: [],
});

/**
 * Editor state for the template builder.
 *
 * Edits are applied to an immutable draft and only committed to SQLite on
 * save. That is what lets the user abandon a half-finished template without
 * leaving a broken graph behind — important because a template with a
 * dangling edge would break the prediction engine.
 */
export const useTemplateEditor = create<TemplateEditorActions & { draft: TemplateDraft }>(
  (set, get) => ({
    draft: emptyDraft(),
    isDirty: false,

    load: (graph, fallbackName) => {
      if (graph === null) {
        const draft = emptyDraft();
        set({ draft: { ...draft, name: fallbackName ?? 'New commute' }, isDirty: false });
        return;
      }
      set({
        draft: {
          id: graph.template.id,
          name: graph.template.name,
          originName: graph.template.originName,
          destinationName: graph.template.destinationName,
          notes: graph.template.notes ?? '',
          stops: graph.stops,
          segments: graph.segments,
          validationErrors: [],
        },
        isDirty: false,
      });
    },

    setName: (name) => set((state) => ({ draft: { ...state.draft, name }, isDirty: true })),

    setNotes: (notes) => set((state) => ({ draft: { ...state.draft, notes }, isDirty: true })),

    addStop: (name, kind = 'stop', role) => {
      const { draft } = get();
      // Reject a blank name here rather than at save time. `stopSchema` requires
      // a non-empty name, so accepting one produces a draft that renders as an
      // empty row and then fails validation with a message about the whole
      // commute rather than about the row the user just added.
      const trimmed = name.trim();
      if (trimmed.length === 0) return '';

      const now = Date.now();
      const id = uuid();

      // Infer the role from position so the common case needs no ceremony:
      // first node is the start, second is the destination, rest are stops.
      const inferred: NodeRole =
        role ??
        (draft.stops.length === 0 ? 'origin' : draft.stops.length === 1 ? 'destination' : 'stop');

      const stop: Stop = {
        id,
        templateId: draft.id,
        name: trimmed,
        kind,
        nodeRole: inferred,
        latitude: null,
        longitude: null,
        sortOrder: draft.stops.length,
        createdAt: now,
        updatedAt: now,
      };

      set((state) => ({
        draft: {
          ...state.draft,
          stops: [...state.draft.stops, stop],
          // The template's endpoint names follow the roles, so they stay
          // truthful as the user promotes a stop to origin.
          originName: inferred === 'origin' ? trimmed : state.draft.originName,
          destinationName: inferred === 'destination' ? trimmed : state.draft.destinationName,
        },
        isDirty: true,
      }));
      return id;
    },

    setStopRole: (stopId, role) =>
      set((state) => {
        // Exactly one origin and one destination. Promoting a node demotes the
        // previous holder rather than leaving the graph invalid, so the user
        // cannot get stuck with a state they cannot undo.
        const stops = state.draft.stops.map((stop) => {
          if (stop.id === stopId) return { ...stop, nodeRole: role, updatedAt: Date.now() };

          const current = resolveNodeRole(stop);
          const shouldDemote =
            (role === 'origin' && current === 'origin') ||
            (role === 'destination' && current === 'destination');
          if (!shouldDemote) return stop;

          return {
            ...stop,
            nodeRole: 'stop' as NodeRole,
            // Keep the kind consistent with the demotion so a demoted origin
            // that was `home` no longer claims to be home either.
            kind: current === 'origin' ? ('stop' as StopKind) : ('office' as StopKind),
            updatedAt: Date.now(),
          };
        });

        const nextOrigin = stops.find((stop) => resolveNodeRole(stop) === 'origin')?.name;
        const nextDestination = stops.find((stop) => resolveNodeRole(stop) === 'destination')?.name;

        return {
          draft: {
            ...state.draft,
            stops,
            originName: nextOrigin ?? state.draft.originName,
            destinationName: nextDestination ?? state.draft.destinationName,
          },
          isDirty: true,
        };
      }),

    setEndpoints: ({ name, originName, destinationName }) =>
      set((state) => ({
        draft: {
          ...state.draft,
          name: name ?? state.draft.name,
          originName: originName ?? state.draft.originName,
          destinationName: destinationName ?? state.draft.destinationName,
        },
        isDirty: true,
      })),

    loadStops: (stops, segments) =>
      set((state) => {
        const next = [...stops];
        return {
          draft: {
            ...state.draft,
            stops: next,
            segments: [...segments],
            // Keeps the invariant that the template's endpoint names describe
            // the graph's actual endpoints. A pattern applied to a draft would
            // otherwise leave the name pointing at a place that was replaced.
            originName:
              next.find((s) => resolveNodeRole(s) === 'origin')?.name ?? state.draft.originName,
            destinationName:
              next.find((s) => resolveNodeRole(s) === 'destination')?.name ??
              state.draft.destinationName,
          },
          isDirty: true,
        };
      }),

    /**
     * Adds a second route between two nodes.
     *
     * The node it leaves from becomes a junction if it was not one already,
     * because that is the graph-level fact the user just created — and the
     * diagram draws branches from junction nodes.
     */
    addAlternative: (input) => {
      const { draft } = get();
      const now = Date.now();
      const id = uuid();

      const segment: Segment = {
        id,
        templateId: draft.id,
        fromStopId: input.fromStopId,
        toStopId: input.toStopId,
        mode: input.mode,
        serviceLabel: input.serviceLabel ?? null,
        expectedDurationMin: input.expectedDurationMin,
        bufferMinutes: input.bufferMinutes ?? 0,
        transferWindowMin: null,
        branchGroup: null,
        branchLabel: null,
        sortOrder: draft.segments.length,
        createdAt: now,
        updatedAt: now,
      };

      set((state) => {
        /*
         * Promote the fork point to a junction — but never demote the origin
         * or destination to do it. A node has exactly one role, and an origin
         * with two outgoing options is still an origin: the diagram draws that
         * fork off out-degree, so nothing is lost by leaving the role alone.
         */
        const hasExistingOutgoing = state.draft.segments.some(
          (existing) => existing.fromStopId === input.fromStopId,
        );

        const stops = hasExistingOutgoing
          ? state.draft.stops.map((stop) => {
              if (stop.id !== input.fromStopId) return stop;
              const role = resolveNodeRole(stop);
              if (role === 'junction' || role === 'origin' || role === 'destination') return stop;
              return { ...stop, nodeRole: 'junction' as NodeRole, updatedAt: now };
            })
          : state.draft.stops;

        return {
          draft: { ...state.draft, stops, segments: [...state.draft.segments, segment] },
          isDirty: true,
        };
      });

      return id;
    },

    renameStop: (stopId, name) =>
      set((state) => {
        const stops = state.draft.stops.map((stop) =>
          stop.id === stopId ? { ...stop, name, updatedAt: Date.now() } : stop,
        );
        return {
          draft: { ...state.draft, stops },
          isDirty: true,
        };
      }),

    removeStop: (stopId) =>
      set((state) => {
        const removedRole = resolveNodeRole(
          state.draft.stops.find((stop) => stop.id === stopId) ?? { kind: 'stop' },
        );

        const stops = state.draft.stops
          .filter((stop) => stop.id !== stopId)
          .map((stop, index) => ({ ...stop, sortOrder: index }));

        /*
         * Removing the origin or destination would leave the graph with no
         * endpoint, which validation blocks on save — an unrecoverable state
         * caused by one tap. Promote the next node instead, so the graph stays
         * saveable and the user can adjust it.
         */
        if (removedRole === 'origin' && stops.length > 0) {
          const next = stops[0]!;
          next.nodeRole = 'origin';
        } else if (removedRole === 'destination' && stops.length > 0) {
          const next = stops[stops.length - 1]!;
          next.nodeRole = 'destination';
        }

        const segments = state.draft.segments.filter(
          (segment) => segment.fromStopId !== stopId && segment.toStopId !== stopId,
        );

        const originName = stops.find((stop) => resolveNodeRole(stop) === 'origin')?.name;
        const destinationName = stops.find((stop) => resolveNodeRole(stop) === 'destination')?.name;

        return {
          draft: {
            ...state.draft,
            stops,
            segments,
            originName: originName ?? state.draft.originName,
            destinationName: destinationName ?? state.draft.destinationName,
          },
          isDirty: true,
        };
      }),

    moveStop: (stopId, direction) =>
      set((state) => {
        const ordered = [...state.draft.stops].sort((a, b) => a.sortOrder - b.sortOrder);
        const index = ordered.findIndex((stop) => stop.id === stopId);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= ordered.length) return state;

        const reordered = [...ordered];
        const [moved] = reordered.splice(index, 1);
        if (moved === undefined) return state;
        reordered.splice(target, 0, moved);

        return {
          draft: {
            ...state.draft,
            stops: reordered.map((stop, position) => ({
              ...stop,
              sortOrder: position,
              updatedAt: Date.now(),
            })),
          },
          isDirty: true,
        };
      }),

    addSegment: (input) => {
      const { draft } = get();
      const now = Date.now();
      const id = uuid();
      const segment: Segment = {
        id,
        templateId: draft.id,
        fromStopId: input.fromStopId,
        toStopId: input.toStopId,
        mode: input.mode,
        serviceLabel: input.serviceLabel ?? null,
        expectedDurationMin: input.expectedDurationMin,
        bufferMinutes: input.bufferMinutes ?? 0,
        transferWindowMin: input.transferWindowMin ?? null,
        branchGroup: input.branchLabel ?? null,
        branchLabel: input.branchLabel ?? null,
        sortOrder: draft.segments.length,
        createdAt: now,
        updatedAt: now,
      };
      set((state) => ({
        draft: { ...state.draft, segments: [...state.draft.segments, segment] },
        isDirty: true,
      }));
      return id;
    },

    updateSegment: (segmentId, patch) =>
      set((state) => ({
        draft: {
          ...state.draft,
          segments: state.draft.segments.map((segment) =>
            segment.id === segmentId ? { ...segment, ...patch, updatedAt: Date.now() } : segment,
          ),
        },
        isDirty: true,
      })),

    setConnection: (fromStopId, toStopId, input) => {
      const { draft } = get();
      const now = Date.now();

      const existing = draft.segments.find(
        (segment) => segment.fromStopId === fromStopId && segment.toStopId === toStopId,
      );

      const next: Segment = {
        id: existing?.id ?? uuid(),
        templateId: draft.id,
        fromStopId,
        toStopId,
        mode: input.mode,
        serviceLabel: input.serviceLabel ?? existing?.serviceLabel ?? null,
        expectedDurationMin: input.expectedDurationMin,
        bufferMinutes: input.bufferMinutes ?? existing?.bufferMinutes ?? 0,
        transferWindowMin: existing?.transferWindowMin ?? null,
        branchGroup: existing?.branchGroup ?? null,
        branchLabel: existing?.branchLabel ?? null,
        sortOrder: existing?.sortOrder ?? draft.segments.length,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };

      set((state) => ({
        draft: {
          ...state.draft,
          segments:
            existing === undefined
              ? [...state.draft.segments, next]
              : state.draft.segments.map((segment) =>
                  segment.id === existing.id ? next : segment,
                ),
        },
        isDirty: true,
      }));

      return next.id;
    },

    clearConnection: (fromStopId, toStopId) =>
      set((state) => ({
        draft: {
          ...state.draft,
          segments: state.draft.segments.filter(
            (segment) => !(segment.fromStopId === fromStopId && segment.toStopId === toStopId),
          ),
        },
        isDirty: true,
      })),

    removeSegment: (segmentId) =>
      set((state) => ({
        draft: {
          ...state.draft,
          segments: state.draft.segments.filter((segment) => segment.id !== segmentId),
        },
        isDirty: true,
      })),

    touch: () => set({ isDirty: true }),

    reset: () => set({ draft: emptyDraft(), isDirty: false }),
  }),
);
