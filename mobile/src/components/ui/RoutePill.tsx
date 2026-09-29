/**
 * RoutePill: a compact summary of a route's mode mix.
 *
 * Renders each mode as a coloured dot with its label, plus a transfer
 * separator where a connection is involved. This is the vocabulary the
 * recommendation card and the template builder share, so a route looks the
 * same everywhere it appears.
 */
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/src/store/theme';
import { type M3ColorScheme } from '@/src/constants/theme';
import { type TransportMode } from '@/src/types/schemas';
import { MODE_LABELS } from '@/src/constants/modes';
import { Icon, modeIconName } from './Icon';

/** Props for {@link RoutePill}. */
export interface RoutePillProps {
  /** Modes in travel order. */
  readonly modes: readonly TransportMode[];
  /** Number of transfers, rendered as a connector. */
  readonly transfers?: number;
  /** Total expected duration, shown on the right when provided. */
  readonly durationMinutes?: number;
  /** Highlights the pill as the recommended option. */
  readonly recommended?: boolean;
  /** Truncates mode labels, for narrow layouts. */
  readonly compact?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

/** Resolves the accent colour for a transport mode. */
export function modeColor(mode: TransportMode, colors: M3ColorScheme): string {
  switch (mode) {
    case 'walk':
      return colors.modeWalk;
    case 'bus':
      return colors.modeBus;
    case 'metro':
      return colors.modeMetro;
    case 'train':
      return colors.modeTrain;
    case 'auto':
      return colors.modeAuto;
    case 'bike':
      return colors.modeBike;
    case 'cab':
      return colors.modeCab;
  }
}

/** A horizontal chain of transport modes. */
export function RoutePill({
  modes,
  transfers,
  durationMinutes,
  recommended = false,
  compact = false,
  style,
  accessibilityLabel,
  testID,
}: RoutePillProps) {
  const { colors, shape, type } = useTheme();

  const parts = modes.map((mode) => modeLabel(mode, compact));

  const a11yLabel =
    accessibilityLabel ??
    `${parts.join(', then ')}${transfers !== undefined && transfers > 0 ? `, ${transfers} transfer${transfers === 1 ? '' : 's'}` : ''}${
      durationMinutes !== undefined ? `, ${Math.round(durationMinutes)} minutes` : ''
    }`;

  return (
    <View
      accessibilityLabel={a11yLabel}
      style={[
        styles.container,
        {
          backgroundColor: recommended ? colors.primaryContainer : colors.surfaceContainer,
          borderRadius: shape.full,
          borderColor: recommended ? colors.primary : 'transparent',
        },
        style,
      ]}
      testID={testID}
    >
      {modes.map((mode, index) => (
        <View key={`${mode}-${index}`} style={styles.segment}>
          {index > 0 ? (
            <Icon
              name="arrowRight"
              size={compact ? 10 : 12}
              color={colors.onSurfaceVariant}
              weight="bold"
            />
          ) : null}
          <View style={styles.mode}>
            <Icon
              name={modeIconName(mode)}
              size={compact ? 12 : 14}
              color={recommended ? colors.onPrimaryContainer : modeColor(mode, colors)}
              weight="fill"
            />
            {!compact ? (
              <Text
                numberOfLines={1}
                style={[
                  type.labelSmall,
                  {
                    color: recommended ? colors.onPrimaryContainer : colors.onSurfaceVariant,
                  },
                ]}
              >
                {MODE_LABELS[mode]}
              </Text>
            ) : null}
          </View>
        </View>
      ))}

      {transfers !== undefined && transfers > 0 ? (
        <View style={styles.segment}>
          <View style={[styles.transferBadge, { backgroundColor: colors.tertiaryContainer }]}>
            <Text style={[type.labelSmall, { color: colors.onTertiaryContainer }]}>
              {transfers} transfer{transfers === 1 ? '' : 's'}
            </Text>
          </View>
        </View>
      ) : null}

      {durationMinutes !== undefined ? (
        <Text
          style={[
            type.labelMedium,
            { color: recommended ? colors.onPrimaryContainer : colors.onSurfaceVariant },
          ]}
        >
          {Math.round(durationMinutes)} min
        </Text>
      ) : null}
    </View>
  );
}

function modeLabel(mode: TransportMode, compact: boolean): string {
  return compact ? MODE_LABELS[mode] : `${MODE_LABELS[mode]}`;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    gap: 6,
    borderWidth: 1,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  transferBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
});
