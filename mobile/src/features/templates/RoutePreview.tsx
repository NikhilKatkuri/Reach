/**
 * RoutePreview: the candidate routes Reach can learn from.
 *
 * Shows what the engine will actually enumerate, before any trips exist. With
 * history it also shows what that route has actually measured — and says
 * plainly when there is not enough history yet rather than showing a
 * confident-looking zero.
 */
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/src/store/theme';
import { RoutePill } from '@/src/components/ui/RoutePill';
import { type CommuteGraph, type RoutePath } from '@/src/engine/graph';
import { formatDurationLabel, routeTransferLabel } from '@/src/engine/routePresentation';

/** Real observations for one route, or null when there are none. */
export interface RouteHistorySummary {
  readonly observations: number;
  readonly p50Minutes: number | null;
  readonly p90Minutes: number | null;
  readonly onTimeRate: number | null;
}

/** Props for {@link RoutePreview}. */
export interface RoutePreviewProps {
  readonly graph: CommuteGraph;
  readonly routes: readonly RoutePath[];
  /** Keyed by route signature. Omitted entirely when no history exists. */
  readonly history?: ReadonlyMap<string, RouteHistorySummary>;
  /** The route Reach currently recommends, if one has been chosen. */
  readonly recommendedSignature?: string | null;
  /** Renders the whole card; set false when embedding elsewhere. */
  readonly showTitle?: boolean;
}

/** How many routes to show. The engine caps at 24; nobody reads 24. */
const MAX_SHOWN = 6;

export function RoutePreview({
  graph,
  routes,
  history,
  recommendedSignature = null,
  showTitle = true,
}: RoutePreviewProps) {
  const { colors, type } = useTheme();

  if (routes.length === 0) {
    return (
      <View style={styles.container}>
        {showTitle ? (
          <Text style={[type.titleMedium, { color: colors.onSurface }]}>
            Ways you can get there
          </Text>
        ) : null}
        <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
          Nothing connects your start to your destination yet. Add a connection and Reach will list
          the routes it can learn.
        </Text>
      </View>
    );
  }

  const shown = routes.slice(0, MAX_SHOWN);
  const hidden = routes.length - shown.length;

  return (
    <View style={styles.container}>
      {showTitle ? (
        <>
          <Text style={[type.titleMedium, { color: colors.onSurface }]}>
            Ways you can get there
          </Text>
          <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
            {routes.length === 1
              ? 'Reach found one route. Add another connection to give it a choice.'
              : `Reach found ${routes.length}. It'll learn how each one actually behaves.`}
          </Text>
        </>
      ) : null}

      <View style={styles.list}>
        {shown.map((route) => (
          <RoutePreviewRow
            key={route.signature}
            graph={graph}
            route={route}
            summary={history?.get(route.signature) ?? null}
            recommended={route.signature === recommendedSignature}
          />
        ))}
      </View>

      {hidden > 0 ? (
        <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
          {`+${hidden} more ${hidden === 1 ? 'route' : 'routes'}`}
        </Text>
      ) : null}
    </View>
  );
}

function RoutePreviewRow({
  graph,
  route,
  summary,
  recommended,
}: {
  readonly graph: CommuteGraph;
  readonly route: RoutePath;
  readonly summary: RouteHistorySummary | null;
  readonly recommended: boolean;
}) {
  const { colors, type, shape } = useTheme();

  const via = describeVia(graph, route);

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: recommended ? colors.primaryContainer : colors.surfaceContainer,
          borderColor: recommended ? colors.primary : 'transparent',
          borderRadius: shape.medium,
        },
      ]}
    >
      <View style={styles.rowTop}>
        <RoutePill
          modes={route.modes}
          transfers={route.transferCount}
          durationMinutes={route.expectedDurationMin}
          recommended={recommended}
          compact
        />
      </View>

      {via !== null ? (
        <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
          {via}
        </Text>
      ) : null}

      <View style={styles.metaRow}>
        <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
          {`${routeTransferLabel(route.transferCount)} · ${formatDurationLabel(route.expectedDurationMin)} expected`}
        </Text>

        {summary !== null && summary.observations > 0 ? (
          <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
            {`${summary.observations} ${summary.observations === 1 ? 'trip' : 'trips'}` +
              (summary.p90Minutes !== null
                ? ` · P90 ${formatDurationLabel(summary.p90Minutes)}`
                : '')}
          </Text>
        ) : (
          <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
            No trips on this route yet
          </Text>
        )}
      </View>
    </View>
  );
}

/**
 * The places a route passes through, as a short chain.
 *
 * Uses node names rather than mode names, because the mode is already on the
 * pill and what the user is checking here is the *shape* of the route.
 */
function describeVia(graph: CommuteGraph, route: RoutePath): string | null {
  if (route.stopIds.length < 2) return null;
  const names = route.stopIds
    .map((id) => graph.stopsById.get(id)?.name)
    .filter((name): name is string => name !== undefined);
  if (names.length < 2) return null;
  return `${names[0]} → ${names[names.length - 1]}`;
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  list: {
    gap: 8,
  },
  row: {
    padding: 10,
    gap: 6,
    borderWidth: 1,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
});
