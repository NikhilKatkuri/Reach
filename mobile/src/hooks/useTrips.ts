/** TanStack Query hooks over the SQLite read layer. */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  countTrips,
  getActiveTrip,
  getRouteEdgeStats,
  getTemplateGraph,
  getTripDetail,
  listTemplates,
  listTrips,
  type TripFilters,
} from '@/src/db/queries';
import { queryKeys } from '@/src/store/queryClient';
import { type Trip, type TripEvent } from '@/src/types/schemas';

/** A trip plus its events, for the detail screen. */
export interface TripWithEvents {
  readonly trip: Trip;
  readonly events: readonly TripEvent[];
}

/**
 * Lists templates, excluding archived ones by default.
 *
 * @param includeArchived Pass true to show archived templates in Settings.
 */
export function useTemplates(
  includeArchived = false,
): UseQueryResult<Awaited<ReturnType<typeof listTemplates>>> {
  return useQuery({
    queryKey: queryKeys.templates.list(),
    queryFn: () => listTemplates(includeArchived),
  });
}

/**
 * Loads one template with its stops and segments.
 *
 * Returns `null` while loading or when the template does not exist, so
 * screens can branch on `data === null` without a separate loading flag.
 */
export function useTemplateGraph(
  templateId: string | null,
): UseQueryResult<Awaited<ReturnType<typeof getTemplateGraph>>> {
  return useQuery({
    queryKey: queryKeys.templates.detail(templateId ?? 'none'),
    queryFn: async () => (templateId === null ? null : getTemplateGraph(templateId)),
    enabled: templateId !== null,
  });
}

/** Lists trips matching the given filters. */
export function useTripHistory(filters: TripFilters = {}): UseQueryResult<Trip[]> {
  return useQuery({
    queryKey: queryKeys.trips.list([filters]),
    queryFn: () => listTrips(filters),
  });
}

/** Total number of trips matching the same filters, for pagination. */
export function useTripCount(filters: TripFilters = {}): UseQueryResult<number> {
  return useQuery({
    queryKey: [...queryKeys.trips.list([filters]), 'count'],
    queryFn: () => countTrips(filters),
  });
}

/** The full payload `getTripDetail` returns. */
export type TripDetailPayload = NonNullable<Awaited<ReturnType<typeof getTripDetail>>>;

/** Loads a trip with its events and conditions. */
export function useTripDetail(tripId: string | null): UseQueryResult<TripDetailPayload | null> {
  return useQuery({
    queryKey: queryKeys.trips.detail(tripId ?? 'none'),
    queryFn: async () => (tripId === null ? null : getTripDetail(tripId)),
    enabled: tripId !== null,
  });
}

/** The single in-progress trip, or `null` when nothing is being logged. */
export function useActiveTrip(): UseQueryResult<Trip | null> {
  return useQuery({
    queryKey: queryKeys.trips.active(),
    queryFn: getActiveTrip,
  });
}

/** Per-route aggregate statistics for a template. */
export function useRouteStats(templateId: string | null) {
  return useQuery({
    queryKey: ['routeStats', templateId],
    queryFn: async () => (templateId === null ? [] : getRouteEdgeStats(templateId)),
    enabled: templateId !== null,
  });
}
