/**
 * RouteGraph: a visual diagram of a commute's topology.
 *
 * This is the replacement for a scrolling list of stops and legs. The point is
 * that a branch *looks* like a branch — the user should see that they have two
 * ways to the same place without reading anything.
 *
 * Rendering approach, and why:
 *
 * - `react-native-svg` for the connector lines, so the edges can be real
 *   curves with rounded joins. A branch drawn as stacked rectangles reads as
 *   two unrelated rows.
 * - `ScrollView` with horizontal scrolling. A branching graph genuinely does
 *   not fit a small phone, and squashing it to fit destroys the topology. The
 *   primary path is laid out first so it fits without scrolling; only extra
 *   branches push the content wider.
 * - No animation on layout changes. Re-drawing a graph while the user taps
 *   through nodes is disorienting, and the diagram is information rather than
 *   decoration.
 */
import { memo, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/src/store/theme';
import { layoutGraph, type GraphLayout, type LaidOutNode } from '@/src/engine/layout';
import { formatDurationLabel } from '@/src/engine/routePresentation';
import { resolveNodeRole, type Segment, type Stop } from '@/src/types/schemas';
import { Icon, modeIconName, type IconName } from '@/src/components/ui/Icon';

/** Props for {@link RouteGraph}. */
export interface RouteGraphProps {
  readonly stops: readonly Stop[];
  readonly segments: readonly Segment[];
  /** Node the user is currently editing, highlighted in the diagram. */
  readonly selectedStopId?: string | null;
  /** Called when a node is tapped. */
  readonly onSelectStop?: (stopId: string) => void;
  /** Show the mode icon and duration on each connection. Defaults to true. */
  readonly showEdgeLabels?: boolean;
  /** Widest single column, in dp. */
  readonly columnWidth?: number;
  /** Height of one row, in dp. */
  readonly rowHeight?: number;
  /** Left inset for the origin column, so the first node is not flush. */
  readonly paddingHorizontal?: number;
}

const NODE_WIDTH = 116;
const COLUMN_GAP = 40;
const ROW_HEIGHT = 74;
const PADDING = 16;

/** Icon per node role, so the endpoints read instantly. */
const ROLE_ICONS: Readonly<Record<string, IconName>> = {
  origin: 'homeIcon',
  destination: 'destination',
  junction: 'junction',
  stop: 'mapPin',
};

/**
 * A layered diagram of the commute graph.
 *
 * Memoised on the graph contents: re-rendering several hundred SVG paths on
 * every parent render is the difference between this feeling native and
 * feeling like a web view.
 */
export const RouteGraph = memo(function RouteGraph({
  stops,
  segments,
  selectedStopId = null,
  onSelectStop,
  showEdgeLabels = true,
  columnWidth = NODE_WIDTH,
  rowHeight = ROW_HEIGHT,
  paddingHorizontal = PADDING,
}: RouteGraphProps) {
  const { colors, type, shape, minTouchTarget } = useTheme();

  const layout = useMemo(() => layoutGraph({ stops, segments }), [stops, segments]);

  if (layout.nodes.length === 0) {
    return (
      <View
        style={[
          styles.empty,
          { backgroundColor: colors.surfaceContainerLow, borderRadius: shape.medium },
        ]}
      >
        <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
          Your route appears here once you add your first place.
        </Text>
      </View>
    );
  }

  // Height for the whole diagram: the tallest column block, plus padding. Uses
  // the same arithmetic as `positionOf` so the last row is never clipped.
  const totalHeight = Math.max(rowHeight * layout.maxColumnHeight, rowHeight) + PADDING * 2;
  const totalWidth =
    paddingHorizontal * 2 +
    layout.columnCount * columnWidth +
    (layout.columnCount - 1) * COLUMN_GAP;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // Start scrolled to the origin, which is the leftmost column, and let the
      // user pan right to reach branches.
      contentContainerStyle={[styles.scroll, { minWidth: totalWidth }]}
      accessibilityLabel="Route diagram"
    >
      <View style={{ width: totalWidth, height: totalHeight }}>
        <EdgeLayer
          layout={layout}
          columnWidth={columnWidth}
          rowHeight={rowHeight}
          padding={PADDING}
          showEdgeLabels={showEdgeLabels}
        />

        {layout.nodes.map((node) => (
          <NodeChip
            key={node.stop.id}
            node={node}
            columnWidth={columnWidth}
            rowHeight={rowHeight}
            padding={PADDING}
            selected={node.stop.id === selectedStopId}
            minTouchTarget={minTouchTarget}
            onPress={onSelectStop === undefined ? undefined : () => onSelectStop(node.stop.id)}
          />
        ))}
      </View>
    </ScrollView>
  );
});

/** The SVG layer of connector curves, drawn behind the nodes. */
function EdgeLayer({
  layout,
  columnWidth,
  rowHeight,
  padding,
  showEdgeLabels,
}: {
  readonly layout: GraphLayout;
  readonly columnWidth: number;
  readonly rowHeight: number;
  readonly padding: number;
  readonly showEdgeLabels: boolean;
}) {
  const { colors, type, shape } = useTheme();

  /**
   * The centre point of a node.
   *
   * Each column is vertically centred as a block, so a column of three sits
   * centred against a column of one instead of hanging from the top. That is
   * what makes a fork look like a fork: the two branches diverge from one
   * shared node and land symmetrically.
   */
  const positionOf = (
    column: number,
    row: number,
    columnHeight: number,
  ): { x: number; y: number } => {
    const columnBlockHeight = columnHeight * rowHeight;
    return {
      x: padding + column * (columnWidth + COLUMN_GAP) + columnWidth / 2,
      y: padding + (columnBlockHeight - rowHeight) / 2 + row * rowHeight + rowHeight / 2,
    };
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        {layout.connections.map((connection) => {
          const from = positionOf(
            connection.fromColumn,
            connection.fromRow,
            heightOfColumn(layout, connection.fromColumn),
          );
          const to = positionOf(
            connection.toColumn,
            connection.toRow,
            heightOfColumn(layout, connection.toColumn),
          );

          // Start and end at the node edge, not its centre, so the line meets
          // the chip rather than disappearing under it.
          const startX = from.x + columnWidth / 2;
          const endX = to.x - columnWidth / 2;
          const midX = (startX + endX) / 2;
          const highlight = isHighlighted(layout, connection.segment);

          return (
            <Path
              key={connection.segment.id}
              // A cubic with horizontal control points: straight when the two
              // nodes are level, a smooth S when they are not. That is what
              // makes a fork read as a fork.
              d={`M ${startX} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${endX} ${to.y}`}
              stroke={highlight ? colors.primary : colors.outline}
              strokeWidth={highlight ? 2.5 : 1.75}
              strokeDasharray={connection.spansColumns ? '6 4' : undefined}
              strokeLinecap="round"
              fill="none"
            />
          );
        })}
      </Svg>

      {showEdgeLabels
        ? layout.connections.map((connection) => {
            const from = positionOf(
              connection.fromColumn,
              connection.fromRow,
              heightOfColumn(layout, connection.fromColumn),
            );
            const to = positionOf(
              connection.toColumn,
              connection.toRow,
              heightOfColumn(layout, connection.toColumn),
            );
            const highlight = isHighlighted(layout, connection.segment);

            return (
              <View
                key={`label-${connection.segment.id}`}
                style={[
                  styles.edgeLabel,
                  {
                    left: (from.x + to.x) / 2 - EDGE_LABEL_WIDTH / 2,
                    top: (from.y + to.y) / 2 - EDGE_LABEL_HEIGHT / 2,
                    backgroundColor: highlight ? colors.primaryContainer : colors.surface,
                    borderColor: highlight ? colors.primary : colors.outlineVariant,
                    borderRadius: shape.extraSmall,
                  },
                ]}
              >
                <Icon
                  name={modeIconName(connection.segment.mode)}
                  size={11}
                  color={highlight ? colors.onPrimaryContainer : colors.onSurfaceVariant}
                  weight="fill"
                />
                <Text
                  style={[
                    type.labelSmall,
                    {
                      color: highlight ? colors.onPrimaryContainer : colors.onSurfaceVariant,
                      fontSize: 10,
                    },
                  ]}
                >
                  {formatDurationLabel(connection.segment.expectedDurationMin)}
                </Text>
              </View>
            );
          })
        : null}
    </View>
  );
}

/** A single node, rendered as a labelled chip. */
function NodeChip({
  node,
  columnWidth,
  rowHeight,
  padding,
  selected,
  minTouchTarget,
  onPress,
}: {
  readonly node: LaidOutNode;
  readonly columnWidth: number;
  readonly rowHeight: number;
  readonly padding: number;
  readonly selected: boolean;
  readonly minTouchTarget: number;
  readonly onPress: (() => void) | undefined;
}) {
  const { colors, type, shape } = useTheme();

  const role = resolveNodeRole(node.stop);
  const iconName = ROLE_ICONS[role] ?? 'mapPin';

  const top =
    padding + (node.columnHeight * rowHeight) / 2 + node.row * rowHeight - NODE_HEIGHT / 2;
  const left = padding + node.column * (columnWidth + COLUMN_GAP);

  const label = `${node.stop.name}, ${role}${node.isBranch ? ', has alternative routes' : ''}`;

  const body = (
    <View
      style={[
        styles.node,
        {
          top,
          left,
          width: columnWidth,
          backgroundColor: selected ? colors.primaryContainer : colors.surfaceContainerHighest,
          borderColor: selected ? colors.primary : colors.outlineVariant,
          borderWidth: selected ? 2 : 1,
          borderRadius: shape.large,
        },
      ]}
    >
      <View
        style={[
          styles.nodeBadge,
          { backgroundColor: selected ? colors.primary : colors.surfaceContainer },
          { borderRadius: shape.full },
        ]}
      >
        <Icon
          name={iconName}
          size={14}
          color={selected ? colors.onPrimary : colors.onSurfaceVariant}
          weight="fill"
        />
      </View>

      <Text
        numberOfLines={2}
        style={[
          type.labelMedium,
          styles.nodeName,
          { color: selected ? colors.onPrimaryContainer : colors.onSurface },
        ]}
      >
        {node.stop.name}
      </Text>

      <Text style={[type.labelSmall, styles.nodeRole, { color: colors.onSurfaceVariant }]}>
        {role === 'origin' ? 'Start' : role === 'destination' ? 'Destination' : role}
      </Text>
    </View>
  );

  if (onPress === undefined) return body;

  return (
    <Pressable
      // The diagram is the primary way a user navigates the graph, so every
      // node must be reachable and announced. A decorative SVG reading "Home"
      // and nothing else would be useless with a screen reader.
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      // Padded to the minimum touch target without moving the visual chip.
      hitSlop={Math.max(0, (minTouchTarget - NODE_HEIGHT) / 2)}
      style={styles.nodePressable}
    >
      {body}
    </Pressable>
  );
}

function heightOfColumn(layout: GraphLayout, column: number): number {
  return layout.nodes.find((node) => node.column === column)?.columnHeight ?? 1;
}

/**
 * Whether a connection is part of the spine of the graph.
 *
 * Highlights the origin-to-destination chain so the primary route is obvious
 * even when branches are present. This is a visual aid only — it has no effect
 * on enumeration, scoring or prediction.
 */
function isHighlighted(layout: GraphLayout, segment: Segment): boolean {
  if (layout.originId === null || layout.destinationId === null) return false;
  const onSpine =
    segment.fromStopId === layout.originId || segment.toStopId === layout.destinationId;
  return onSpine && segment.toStopId !== segment.fromStopId;
}

/** Height of a node chip. */
const NODE_HEIGHT = 54;
const EDGE_LABEL_WIDTH = 74;
const EDGE_LABEL_HEIGHT = 20;

const styles = StyleSheet.create({
  scroll: {
    paddingVertical: 0,
  },
  empty: {
    padding: 20,
    alignItems: 'center',
  },
  nodePressable: {
    position: 'absolute',
  },
  node: {
    position: 'absolute',
    height: NODE_HEIGHT,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  nodeBadge: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  nodeName: {
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 15,
  },
  nodeRole: {
    textTransform: 'capitalize',
    fontSize: 9,
  },
  edgeLabel: {
    position: 'absolute',
    width: EDGE_LABEL_WIDTH,
    height: EDGE_LABEL_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderWidth: 1,
    paddingHorizontal: 4,
  },
});
