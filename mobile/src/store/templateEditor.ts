/** Backing store for the template editor. */
import { create } from 'zustand';
import { type Segment, type Stop, type TemplateGraph } from '@/src/types/schemas';
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
  readonly addStop: (name: string, kind: Stop['kind']) => string;
  readonly renameStop: (stopId: string, name: string) => void;
  readonly removeStop: (stopId: string) => void;
  /** Moves a stop, and rewrites the sort order of its neighbours. */
  readonly moveStop: (stopId: string, direction: -1 | 1) => void;
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

    addStop: (name, kind) => {
      const { draft } = get();
      const now = Date.now();
      const id = uuid();
      const stop: Stop = {
        id,
        templateId: draft.id,
        name,
        kind,
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
          originName: state.draft.stops.length === 0 ? name : state.draft.originName,
          destinationName: name,
        },
        isDirty: true,
      }));
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
        const stops = state.draft.stops
          .filter((stop) => stop.id !== stopId)
          .map((stop, index) => ({ ...stop, sortOrder: index }));
        const segments = state.draft.segments.filter(
          (segment) => segment.fromStopId !== stopId && segment.toStopId !== stopId,
        );
        return { draft: { ...state.draft, stops, segments }, isDirty: true };
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
