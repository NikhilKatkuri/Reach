/** Statistics and Insights hooks. */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  countTrips,
  getCrowdDistribution,
  getDepartureHourHistogram,
  getRainComparison,
  getReliabilityOverTime,
  getWeeklyDurations,
  listTrips,
  type SeriesPoint,
} from '@/src/db/queries';
import { summarizeDurations, type DistributionSummary } from '@/src/engine/statistics';
import { countTransfers, buildGraph, enumerateRoutes } from '@/src/engine/graph';
import { type TemplateGraph, type Trip } from '@/src/types/schemas';
import { round } from '@/src/utils/math';

/** Headline metrics for the Insights dashboard. */
export interface InsightsSummary {
  readonly averageMinutes: number;
  readonly medianMinutes: number;
  readonly p90Minutes: number;
  readonly p95Minutes: number;
  readonly longestDelayMinutes: number;
  readonly totalTrips: number;
  readonly onTimeRate: number;
  readonly bestRoute: RouteScoreSummary | null;
  readonly worstRoute: RouteScoreSummary | null;
  readonly worstTransfer: TransferSummary | null;
  readonly sampleSize: number;
}

/** Per-route summary used by the best/worst route cards. */
export interface RouteScoreSummary {
  readonly signature: string;
  readonly label: string;
  readonly averageMinutes: number;
  readonly p90Minutes: number;
  readonly onTimeRate: number;
  readonly observations: number;
}

/** Transfer summary for the worst-transfer card. */
export interface TransferSummary {
  readonly label: string;
  readonly stopName: string;
  readonly catchProbability: number;
  readonly missedCount: number;
  readonly expectedLossMin: number;
}

/** The distribution of all completed trip durations. */
export function useTripStatistics(
  templateId: string | null,
  days = 60,
): UseQueryResult<DistributionSummary> {
  return useQuery({
    queryKey: ['insights', 'stats', templateId, days],
    enabled: templateId !== null,
    queryFn: async (): Promise<DistributionSummary> => {
      if (templateId === null) return summarizeDurations([]);

      const since = Date.now() - days * 86_400_000;
      const trips = await listTrips({
        templateId,
        from: since,
        status: 'completed',
        limit: 1000,
      });

      const durations = trips
        .map((trip) => trip.actualDurationMin)
        .filter((value): value is number => value !== null && value > 0);

      return summarizeDurations(durations);
    },
  });
}

/** Weekly average durations. */
export function useWeeklyDurations(
  templateId: string | null,
  weeks = 8,
): UseQueryResult<SeriesPoint[]> {
  return useQuery({
    queryKey: ['insights', 'weekly', templateId, weeks],
    enabled: templateId !== null,
    queryFn: async (): Promise<SeriesPoint[]> =>
      templateId === null ? [] : getWeeklyDurations(templateId, weeks),
  });
}

/** On-time rate over time. */
export function useReliabilityOverTime(
  templateId: string | null,
  weeks = 8,
): UseQueryResult<SeriesPoint[]> {
  return useQuery({
    queryKey: ['insights', 'reliability', templateId, weeks],
    enabled: templateId !== null,
    queryFn: async (): Promise<SeriesPoint[]> =>
      templateId === null ? [] : getReliabilityOverTime(templateId, weeks),
  });
}

/** Duration split by weather condition. */
export function useRainComparison(templateId: string | null) {
  return useQuery({
    queryKey: ['insights', 'rain', templateId],
    enabled: templateId !== null,
    queryFn: async () => (templateId === null ? [] : getRainComparison(templateId)),
  });
}

/** Trip counts by departure hour. */
export function useDepartureHistogram(templateId: string | null): UseQueryResult<SeriesPoint[]> {
  return useQuery({
    queryKey: ['insights', 'hours', templateId],
    enabled: templateId !== null,
    queryFn: async (): Promise<SeriesPoint[]> =>
      templateId === null ? [] : getDepartureHourHistogram(templateId),
  });
}

/** Crowd level distribution. */
export function useCrowdDistribution(templateId: string | null) {
  return useQuery({
    queryKey: ['insights', 'crowd', templateId],
    enabled: templateId !== null,
    queryFn: async () => (templateId === null ? [] : getCrowdDistribution(templateId)),
  });
}

/**
 * Computes the headline metrics for a template.
 *
 * Everything is derived from the trip list and the template's own graph, so
 * there is one source of truth: the same function powers the dashboard and
 * the "best route" comparison.
 */
export function buildInsightsSummary(
  trips: readonly Trip[],
  graph: TemplateGraph | null,
): InsightsSummary {
  const completed = trips.filter((trip) => trip.status === 'completed');

  const durations = completed
    .map((trip) => trip.actualDurationMin)
    .filter((value): value is number => value !== null && value > 0);

  const summary = summarizeDurations(durations);

  const onTimeCount = completed.filter((trip) => trip.wasOnTime === true).length;
  const onTimeRate = completed.length > 0 ? onTimeCount / completed.length : 0;

  const delays = completed
    .map((trip) => trip.delayMinutes)
    .filter((value): value is number => value !== null);
  const longestDelay = delays.length > 0 ? Math.max(...delays) : 0;

  const routeSummaries = summarizeRoutesBySignature(completed, graph);
  const ranked = [...routeSummaries].sort(
    (a, b) => b.onTimeRate - a.onTimeRate || a.p90Minutes - b.p90Minutes,
  );

  return {
    averageMinutes: summary.mean,
    medianMinutes: summary.p50,
    p90Minutes: summary.p90,
    p95Minutes: summary.p95,
    longestDelayMinutes: longestDelay,
    totalTrips: completed.length,
    onTimeRate: round(onTimeRate, 3),
    bestRoute: ranked[0] ?? null,
    worstRoute: ranked[ranked.length - 1] ?? null,
    worstTransfer: findWorstTransfer(completed, graph),
    sampleSize: summary.count,
  };
}

/** Groups trips by route signature and summarises each group. */
function summarizeRoutesBySignature(
  trips: readonly Trip[],
  graph: TemplateGraph | null,
): RouteScoreSummary[] {
  const bySignature = new Map<string, Trip[]>();
  for (const trip of trips) {
    const signature = trip.routeSignature;
    if (signature === null || signature.length === 0) continue;
    const list = bySignature.get(signature) ?? [];
    list.push(trip);
    bySignature.set(signature, list);
  }

  const built = buildGraph(graph ?? { template: emptyTemplate(), stops: [], segments: [] });
  const routes = enumerateRoutes(built);

  const out: RouteScoreSummary[] = [];
  for (const [signature, group] of bySignature) {
    const durations = group
      .map((trip) => trip.actualDurationMin)
      .filter((value): value is number => value !== null && value > 0);
    if (durations.length === 0) continue;

    const stats = summarizeDurations(durations);
    const onTime = group.filter((trip) => trip.wasOnTime === true).length;
    const path = routes.find((route) => route.signature === signature);

    out.push({
      signature,
      label: describeSignature(built, path?.segmentIds ?? signature.split('|')),
      averageMinutes: stats.mean,
      p90Minutes: stats.p90,
      onTimeRate: round(onTime / group.length, 3),
      observations: group.length,
    });
  }

  return out;
}

function emptyTemplate() {
  return {
    id: 'none',
    name: '',
    originName: '',
    destinationName: '',
    colorSeed: '',
    notes: null,
    isArchived: false,
    isDefault: false,
    sortOrder: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

/** Builds a readable label from a route's segment ids. */
function describeSignature(
  graph: ReturnType<typeof buildGraph>,
  segmentIds: readonly string[],
): string {
  const parts: string[] = [];
  for (const id of segmentIds) {
    const segment = graph.segmentsById.get(id);
    if (segment === undefined) continue;
    parts.push(segment.serviceLabel ?? segment.mode);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Unknown route';
}

/** Finds the transfer with the lowest catch probability across routes. */
function findWorstTransfer(
  trips: readonly Trip[],
  graph: TemplateGraph | null,
): TransferSummary | null {
  if (graph === null) return null;

  const built = buildGraph(graph);
  const routes = enumerateRoutes(built);

  let worst: TransferSummary | null = null;

  for (const route of routes) {
    const segments = route.segmentIds
      .map((id) => built.segmentsById.get(id))
      .filter((segment): segment is NonNullable<typeof segment> => segment !== undefined);

    for (let i = 1; i < segments.length - 1; i += 1) {
      const previous = segments[i - 1];
      const current = segments[i];
      const next = segments[i + 1];
      if (previous === undefined || current === undefined || next === undefined) continue;
      if (current.mode !== 'walk') continue;

      const headway = next.transferWindowMin ?? 8;
      const window = Math.max(1, (previous.transferWindowMin ?? headway) + previous.bufferMinutes);
      const catchProbability = Math.min(1, window / headway);

      const missedCount = trips.filter(
        (trip) =>
          trip.routeSignature === route.signature &&
          trip.actualDurationMin !== null &&
          trip.plannedDurationMin !== null &&
          trip.actualDurationMin > trip.plannedDurationMin + 15,
      ).length;

      const candidate: TransferSummary = {
        label: `${previous.serviceLabel ?? previous.mode} → ${next.serviceLabel ?? next.mode}`,
        stopName: built.stopsById.get(previous.toStopId)?.name ?? previous.toStopId,
        catchProbability: round(catchProbability, 3),
        missedCount,
        expectedLossMin: round((1 - catchProbability) * 20, 1),
      };

      if (worst === null || candidate.catchProbability < worst.catchProbability) {
        worst = candidate;
      }
    }
  }

  return worst;
}

/** Number of transfers in the most-travelled route. */
export function useTransferCount(graph: TemplateGraph | null): number {
  if (graph === null) return 0;
  const built = buildGraph(graph);
  const routes = enumerateRoutes(built);
  const longest = routes.reduce<(typeof routes)[number] | null>(
    (best, route) =>
      best === null || route.segmentIds.length > best.segmentIds.length ? route : best,
    null,
  );
  if (longest === null) return 0;
  const segments = longest.segmentIds
    .map((id) => built.segmentsById.get(id))
    .filter((segment): segment is NonNullable<typeof segment> => segment !== undefined);
  return countTransfers(segments);
}

/** Total completed trips across all templates. */
export function useTotalTripCount(): UseQueryResult<number> {
  return useQuery({
    queryKey: ['insights', 'total'],
    queryFn: () => countTrips({ status: 'completed' }),
  });
}
