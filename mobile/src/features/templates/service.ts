/** Template CRUD service: the only writer of template tables. */
import { upsertTemplateGraph, deleteTemplate } from '@/src/db/queries';
import { validateGraph, buildGraph } from '@/src/engine/graph';
import { uuid } from '@/src/lib/uuid';
import {
  type CommuteTemplate,
  type Segment,
  type Stop,
  type TemplateGraph,
} from '@/src/types/schemas';

/** Input for creating or updating a template. */
export interface SaveTemplateInput {
  readonly id?: string;
  readonly name: string;
  readonly originName: string;
  readonly destinationName: string;
  readonly notes: string;
  readonly stops: readonly Stop[];
  readonly segments: readonly Segment[];
  readonly isDefault?: boolean;
  readonly colorSeed?: string;
}

/** Raised when a template cannot be saved. */
export class TemplateValidationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(issues.join('; '));
    this.name = 'TemplateValidationError';
  }
}

/**
 * Validates a draft and returns the blocking issues.
 *
 * Saving is refused while any *error* remains. Warnings (a dead-end stop, an
 * unused branch) do not block, because a partially built template is still
 * useful and the user may be mid-edit.
 */
export function validateDraft(input: SaveTemplateInput): string[] {
  const issues: string[] = [];

  if (input.name.trim().length === 0) issues.push('Give the commute a name.');
  if (input.stops.length < 2) issues.push('Add at least an origin and a destination.');

  if (input.stops.length >= 2) {
    const stopIds = new Set(input.stops.map((stop) => stop.id));
    for (const segment of input.segments) {
      if (!stopIds.has(segment.fromStopId) || !stopIds.has(segment.toStopId)) {
        issues.push('A leg points at a stop that no longer exists.');
        break;
      }
      if (segment.expectedDurationMin <= 0) {
        issues.push(`"${segment.serviceLabel ?? segment.mode}" needs a duration above zero.`);
        break;
      }
    }
  }

  if (input.stops.length >= 2 && input.segments.length > 0) {
    const graph = buildGraph({
      template: {
        id: input.id ?? 'draft',
        name: input.name,
        originName: input.originName,
        destinationName: input.destinationName,
        colorSeed: input.colorSeed ?? '#00639B',
        notes: input.notes,
        isArchived: false,
        isDefault: input.isDefault ?? false,
        sortOrder: 0,
        createdAt: 0,
        updatedAt: 0,
      },
      stops: input.stops,
      segments: input.segments,
    });
    for (const issue of validateGraph(graph)) {
      if (issue.severity === 'error') issues.push(issue.message);
    }
  }

  return issues;
}

/** Creates or updates a template and its graph. */
export async function saveTemplate(input: SaveTemplateInput): Promise<CommuteTemplate> {
  const issues = validateDraft(input);
  if (issues.length > 0) {
    throw new TemplateValidationError(issues);
  }

  const now = Date.now();
  const id = input.id ?? uuid();

  const template: CommuteTemplate = {
    id,
    name: input.name.trim(),
    originName: input.originName.trim() || 'Home',
    destinationName: input.destinationName.trim() || 'Office',
    colorSeed: input.colorSeed ?? '#00639B',
    notes: input.notes.trim().length > 0 ? input.notes.trim() : null,
    isArchived: false,
    isDefault: input.isDefault ?? false,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  };

  // Preserve original timestamps so an edit does not look like a new row.
  const existing = input.stops[0];
  const createdAt = existing?.createdAt ?? now;

  const graph: TemplateGraph = {
    template,
    stops: input.stops.map((stop) => ({
      ...stop,
      templateId: id,
      sortOrder: stop.sortOrder,
      createdAt: stop.id === existing?.id ? stop.createdAt : (stop.createdAt ?? createdAt),
      updatedAt: now,
    })),
    segments: input.segments.map((segment) => ({
      ...segment,
      templateId: id,
      updatedAt: now,
    })),
  };

  await upsertTemplateGraph(graph);
  return template;
}

/** Deletes a template and everything cascading from it. */
export async function removeTemplate(templateId: string): Promise<void> {
  await deleteTemplate(templateId);
}

/** Creates a starter template for a brand-new install. */
export function createBlankTemplate(name = 'New commute'): SaveTemplateInput {
  const now = Date.now();
  const id = uuid();
  const originId = uuid();
  const destinationId = uuid();

  return {
    id,
    name,
    originName: 'Home',
    destinationName: 'Office',
    notes: '',
    stops: [
      {
        id: originId,
        templateId: id,
        name: 'Home',
        kind: 'home',
        latitude: null,
        longitude: null,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: destinationId,
        templateId: id,
        name: 'Office',
        kind: 'office',
        latitude: null,
        longitude: null,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      },
    ],
    segments: [],
  };
}
