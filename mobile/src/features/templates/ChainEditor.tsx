/**
 * ChainEditor: step two — turn the places into a timed route.
 *
 * One row per hop between consecutive places, all on one screen, editable in
 * place. The alternative to this is a modal per hop, which is what the editor
 * used to do and which meant four dialogs, four round trips through the
 * keyboard, and no way to see the whole journey at once.
 *
 * Durations are stored as editable text rather than a numeric stepper. Minute
 * buttons are the right control for "roughly how long" but the wrong control
 * for entering 45, and a commute's durations are mostly two-digit numbers the
 * user already knows. Every field defaults to a sensible value so the fastest
 * possible completion is three taps.
 */
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/src/store/theme';
import { Button, Chip, Icon } from '@/src/components/ui';
import { modeIconName } from '@/src/components/ui/Icon';
import { MODE_LABELS } from '@/src/constants/modes';
import { TRANSPORT_MODES, type Segment, type Stop, type TransportMode } from '@/src/types/schemas';
import { formatDurationLabel } from '@/src/engine/routePresentation';
import { buildChainHops, chainProgress, type ChainHop } from '@/src/engine/chain';

/** Sensible default minutes, so an empty field still produces a usable graph. */
const DEFAULT_MINUTES: Readonly<Record<TransportMode, number>> = {
  walk: 10,
  bus: 25,
  metro: 20,
  train: 30,
  auto: 20,
  cab: 20,
  bike: 15,
};

/** Props for {@link ChainEditor}. */
export interface ChainEditorProps {
  readonly stops: readonly Stop[];
  readonly segments: readonly Segment[];
  readonly onSet: (input: {
    fromStopId: string;
    toStopId: string;
    mode: TransportMode;
    expectedDurationMin: number;
    bufferMinutes: number;
    serviceLabel: string | null;
  }) => void;
  readonly onClear: (fromStopId: string, toStopId: string) => void;
  readonly onAddAlternative: (fromStopId: string) => void;
}

export function ChainEditor({
  stops,
  segments,
  onSet,
  onClear,
  onAddAlternative,
}: ChainEditorProps) {
  const { colors, type } = useTheme();

  // The chain is the primary path: origin → … → destination, in declared
  // order. Alternatives are attached to the hop they branch from rather than
  // being separate rows, so the user sees the fork where it happens.
  const hops = useMemo(() => buildChainHops({ stops, segments }), [stops, segments]);
  const progress = chainProgress(hops);

  if (hops.length === 0) {
    return (
      <Text style={[type.bodyMedium, { color: colors.onSurfaceVariant }]}>
        Add at least two places and the route between them will appear here.
      </Text>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
        {progress.isComplete
          ? `${progress.total} ${progress.total === 1 ? 'part' : 'parts'}, all with a time.`
          : `${progress.connected} of ${progress.total} parts have a time.`}
      </Text>

      {hops.map((hop) => (
        <HopRow
          key={`${hop.from.id}-${hop.to.id}`}
          hop={hop}
          onSet={onSet}
          onClear={onClear}
          onAddAlternative={onAddAlternative}
        />
      ))}
    </View>
  );
}

function HopRow({
  hop,
  onSet,
  onClear,
  onAddAlternative,
}: {
  readonly hop: ChainHop;
  readonly onSet: ChainEditorProps['onSet'];
  readonly onClear: ChainEditorProps['onClear'];
  readonly onAddAlternative: ChainEditorProps['onAddAlternative'];
}) {
  const { colors, type, shape } = useTheme();

  const current: TransportMode = hop.primary?.mode ?? 'walk';
  const minutes = hop.primary?.expectedDurationMin ?? DEFAULT_MINUTES.walk;
  const buffer = hop.primary?.bufferMinutes ?? 0;

  const apply = (patch: {
    mode?: TransportMode;
    expectedDurationMin?: number;
    bufferMinutes?: number;
    serviceLabel?: string | null;
  }) => {
    onSet({
      fromStopId: hop.from.id,
      toStopId: hop.to.id,
      mode: patch.mode ?? current,
      expectedDurationMin: patch.expectedDurationMin ?? minutes,
      bufferMinutes: patch.bufferMinutes ?? buffer,
      serviceLabel: patch.serviceLabel ?? hop.primary?.serviceLabel ?? null,
    });
  };

  return (
    <View
      style={[
        styles.hop,
        {
          backgroundColor: colors.surfaceContainer,
          borderRadius: shape.medium,
        },
      ]}
    >
      <View style={styles.hopHeader}>
        <Text
          style={[type.titleSmall, styles.endName, { color: colors.onSurface }]}
          numberOfLines={1}
        >
          {hop.from.name}
        </Text>
        <Icon name="arrowRight" size={14} color={colors.onSurfaceVariant} weight="bold" />
        <Text
          style={[type.titleSmall, styles.endName, { color: colors.onSurface }]}
          numberOfLines={1}
        >
          {hop.to.name}
        </Text>
        {hop.primary === null ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove the connection between ${hop.from.name} and ${hop.to.name}`}
            onPress={() => onClear(hop.from.id, hop.to.id)}
            hitSlop={8}
            style={styles.clearButton}
          >
            <Text style={[type.labelMedium, { color: colors.onSurfaceVariant }]}>Clear</Text>
          </Pressable>
        ) : (
          <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
            {formatDurationLabel(minutes + buffer)}
          </Text>
        )}
      </View>

      {/* Mode */}
      <View style={styles.chipRow}>
        {TRANSPORT_MODES.map((mode) => (
          <Chip
            key={mode}
            label={MODE_LABELS[mode]}
            icon={modeIconName(mode)}
            variant="filter"
            selected={current === mode}
            onPress={() => {
              // Switching mode resets the duration to that mode's typical
              // value, because 10 minutes means something very different for a
              // bus than for a walk and keeping the old number would be wrong.
              apply({
                mode,
                expectedDurationMin: current === mode ? minutes : DEFAULT_MINUTES[mode],
              });
            }}
          />
        ))}
      </View>

      {/* Durations */}
      <View style={styles.numberRow}>
        <NumberField
          label="Journey time"
          suffix="min"
          value={String(minutes)}
          onChange={(text) => {
            const parsed = Number.parseInt(text, 10);
            apply({ expectedDurationMin: Number.isFinite(parsed) ? Math.max(1, parsed) : 1 });
          }}
          accessibilityLabel={`Travel time from ${hop.from.name} to ${hop.to.name}, in minutes`}
        />
        <NumberField
          label="Waiting"
          suffix="min"
          value={String(buffer)}
          onChange={(text) => {
            const parsed = Number.parseInt(text, 10);
            apply({ bufferMinutes: Number.isFinite(parsed) ? Math.max(0, parsed) : 0 });
          }}
          accessibilityLabel={`Extra waiting between ${hop.from.name} and ${hop.to.name}, in minutes`}
        />
      </View>

      {/* Service name, only where it is meaningful */}
      {current !== 'walk' && current !== 'bike' ? (
        <TextInput
          value={hop.primary?.serviceLabel ?? ''}
          onChangeText={(text) => apply({ serviceLabel: text.length > 0 ? text : null })}
          placeholder="Which bus or line? (optional)"
          placeholderTextColor={colors.onSurfaceVariant}
          accessibilityLabel={`Service name between ${hop.from.name} and ${hop.to.name}, optional`}
          style={[
            type.bodySmall,
            styles.serviceInput,
            {
              color: colors.onSurface,
              backgroundColor: colors.surfaceContainerHighest,
              borderColor: colors.outlineVariant,
              borderRadius: shape.small,
            },
          ]}
        />
      ) : null}

      {/*
        Only offered once the primary hop exists. A branch from a hop that is
        not yet defined would be a fork to nowhere.
      */}
      {hop.primary !== null ? (
        <Button
          label="Add another way between these"
          icon="swap"
          variant="text"
          size="small"
          onPress={() => onAddAlternative(hop.from.id)}
          accessibilityHint="Creates an alternative route from the same place"
        />
      ) : null}

      {hop.alternatives.length > 0 ? (
        <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
          {`${hop.alternatives.length} alternative ${hop.alternatives.length === 1 ? 'way' : 'ways'} already here`}
        </Text>
      ) : null}
    </View>
  );
}

function NumberField({
  label,
  suffix,
  value,
  onChange,
  accessibilityLabel,
}: {
  readonly label: string;
  readonly suffix: string;
  readonly value: string;
  readonly onChange: (text: string) => void;
  readonly accessibilityLabel: string;
}) {
  const { colors, type } = useTheme();

  return (
    <View style={styles.numberField}>
      <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>{label}</Text>
      <View style={styles.numberInputRow}>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType="number-pad"
          accessibilityLabel={accessibilityLabel}
          style={[type.titleMedium, styles.numberInput, { color: colors.onSurface }]}
        />
        <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>{suffix}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  hop: {
    padding: 12,
    gap: 10,
  },
  hopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  endName: {
    flexShrink: 1,
  },
  clearButton: {
    marginLeft: 'auto',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  numberRow: {
    flexDirection: 'row',
    gap: 12,
  },
  numberField: {
    flex: 1,
    gap: 2,
  },
  numberInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  numberInput: {
    minWidth: 48,
    paddingVertical: 4,
    textAlignVertical: 'center',
  },
  serviceInput: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    minHeight: 40,
    textAlignVertical: 'center',
  },
});
