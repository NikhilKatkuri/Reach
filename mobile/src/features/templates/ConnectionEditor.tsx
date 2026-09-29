/**
 * ConnectionEditor: the sheet for adding one connection.
 *
 * Deliberately a sheet rather than an inline form. The graph stays visible
 * above it, so the user can see the connection appear in context instead of
 * inferring what their form submission did.
 */
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/src/store/theme';
import { Button, Chip, Icon } from '@/src/components/ui';
import { modeIconName } from '@/src/components/ui/Icon';
import { MODE_LABELS } from '@/src/constants/modes';
import { TRANSPORT_MODES, type Segment, type Stop, type TransportMode } from '@/src/types/schemas';

/**
 * What the editor collects, before the store turns it into a connection.
 *
 * Exactly one of `toStopId` / `newNodeName` is set. Keeping the new place's
 * name as a name rather than a pre-made id means the caller decides the kind
 * and role, instead of this sheet inventing a node and leaving the caller to
 * guess what it got.
 */
export interface ConnectionDraft {
  readonly fromStopId: string;
  /** Id of an existing node, or null when creating a new one. */
  readonly toStopId: string | null;
  /** Name of a new node, or null when targeting an existing one. */
  readonly newNodeName: string | null;
  readonly mode: TransportMode;
  readonly expectedDurationMin: number;
  readonly bufferMinutes: number;
  readonly serviceLabel: string | null;
}

/** Props for {@link ConnectionEditor}. */
export interface ConnectionEditorProps {
  readonly visible: boolean;
  readonly stops: readonly Stop[];
  readonly segments: readonly Segment[];
  /** Node the connection starts from, fixed by the caller. */
  readonly fromStopId: string;
  /** Title differs between "add a connection" and "add another way". */
  readonly title: string;
  readonly onSubmit: (draft: ConnectionDraft) => void;
  readonly onClose: () => void;
}

/**
 * A bottom sheet for adding one connection.
 *
 * Defaults are chosen so the common case is three taps: pick a mode, confirm
 * the duration, submit. The destination defaults to "add a new place" only
 * because there is often no existing node to point at.
 */
export function ConnectionEditor({
  visible,
  stops,
  segments,
  fromStopId,
  title,
  onSubmit,
  onClose,
}: ConnectionEditorProps) {
  const { colors, type, shape } = useTheme();
  const insets = useSafeAreaInsets();

  const from = stops.find((stop) => stop.id === fromStopId) ?? null;

  const [mode, setMode] = useState<TransportMode>('walk');
  const [minutes, setMinutes] = useState('10');
  const [buffer, setBuffer] = useState('0');
  const [service, setService] = useState('');
  const [toStopId, setToStopId] = useState<string | null>(null);
  const [newNodeName, setNewNodeName] = useState('');

  // Everything the user could connect to, minus the node they are leaving
  // (a self-loop is always a mistake, and `validateGraph` blocks it).
  const targets = useMemo(
    () => stops.filter((stop) => stop.id !== fromStopId),
    [stops, fromStopId],
  );

  const [addingNode, setAddingNode] = useState(false);
  const resolvedTo = addingNode ? null : toStopId;
  const trimmedNewName = newNodeName.trim();

  const parsedMinutes = Number.parseInt(minutes, 10);
  const parsedBuffer = Number.parseInt(buffer, 10);
  // Submit needs a from-node, and either an existing target or a named new
  // place. Duration is clamped rather than validated: "0" almost always means
  // a typo, and silently turning it into 1 is kinder than blocking the save.
  const canSubmit = from !== null && (resolvedTo !== null || newNodeName.trim().length > 0);

  const duplicate = useMemo(() => {
    if (resolvedTo === null) return null;
    const same = segments.find(
      (segment) => segment.fromStopId === fromStopId && segment.toStopId === resolvedTo,
    );
    if (same === undefined) return null;
    return same;
  }, [segments, fromStopId, resolvedTo]);

  const reset = () => {
    setMode('walk');
    setMinutes('10');
    setBuffer('0');
    setService('');
    setToStopId(null);
    setNewNodeName('');
    setAddingNode(false);
  };

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      fromStopId,
      toStopId: resolvedTo,
      newNodeName: trimmedNewName.length > 0 ? trimmedNewName : null,
      mode,
      expectedDurationMin: Number.isFinite(parsedMinutes) ? Math.max(1, parsedMinutes) : 10,
      bufferMinutes: Number.isFinite(parsedBuffer) ? Math.max(0, parsedBuffer) : 0,
      serviceLabel: service.trim().length > 0 ? service.trim() : null,
    });
    reset();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          style={styles.backdropTap}
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
        />

        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surfaceContainerLow,
              borderTopLeftRadius: shape.extraLarge,
              borderTopRightRadius: shape.extraLarge,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={[type.titleMedium, { color: colors.onSurface }]}>{title}</Text>
            {from !== null ? (
              <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
                {`Starting from ${from.name}`}
              </Text>
            ) : null}
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Mode */}
            <View style={styles.field}>
              <Text style={[type.labelMedium, { color: colors.onSurfaceVariant }]}>
                How do you travel this part?
              </Text>
              <View style={styles.chipRow}>
                {TRANSPORT_MODES.map((option) => (
                  <Chip
                    key={option}
                    label={MODE_LABELS[option]}
                    icon={modeIconName(option)}
                    variant="filter"
                    selected={mode === option}
                    onPress={() => setMode(option)}
                  />
                ))}
              </View>
            </View>

            {/* Where to */}
            <View style={styles.field}>
              <Text style={[type.labelMedium, { color: colors.onSurfaceVariant }]}>Where to?</Text>

              {!addingNode ? (
                <View style={styles.chipRow}>
                  {targets.map((stop) => (
                    <Chip
                      key={stop.id}
                      label={stop.name}
                      variant="filter"
                      selected={resolvedTo === stop.id}
                      onPress={() => setToStopId(stop.id)}
                    />
                  ))}
                  <Chip
                    label="New place"
                    icon="plus"
                    variant="filter"
                    selected={addingNode}
                    onPress={() => {
                      setAddingNode(true);
                      setToStopId(null);
                    }}
                  />
                </View>
              ) : null}

              {addingNode ? (
                <View style={styles.newNodeRow}>
                  <TextInput
                    value={newNodeName}
                    onChangeText={setNewNodeName}
                    placeholder="Name of the place"
                    placeholderTextColor={colors.onSurfaceVariant}
                    accessibilityLabel="New place name"
                    style={[
                      type.bodyMedium,
                      styles.input,
                      {
                        color: colors.onSurface,
                        backgroundColor: colors.surfaceContainerHighest,
                        borderColor: colors.outlineVariant,
                        borderRadius: shape.small,
                      },
                    ]}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Choose an existing place instead"
                    onPress={() => {
                      setAddingNode(false);
                      setNewNodeName('');
                    }}
                    style={styles.cancelNew}
                    hitSlop={10}
                  >
                    <Icon name="x" size={16} color={colors.onSurfaceVariant} />
                  </Pressable>
                </View>
              ) : null}
            </View>

            {/* Durations */}
            <View style={styles.field}>
              <Text style={[type.labelMedium, { color: colors.onSurfaceVariant }]}>
                Expected time
              </Text>
              <View style={styles.numberRow}>
                <View style={styles.numberField}>
                  <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
                    Usually takes
                  </Text>
                  <View style={styles.inputWithSuffix}>
                    <TextInput
                      value={minutes}
                      onChangeText={setMinutes}
                      keyboardType="number-pad"
                      accessibilityLabel="Expected time in minutes"
                      style={[type.titleMedium, styles.numberInput, { color: colors.onSurface }]}
                    />
                    <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>min</Text>
                  </View>
                </View>

                <View style={styles.numberField}>
                  <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
                    Extra waiting
                  </Text>
                  <View style={styles.inputWithSuffix}>
                    <TextInput
                      value={buffer}
                      onChangeText={setBuffer}
                      keyboardType="number-pad"
                      accessibilityLabel="Extra waiting minutes"
                      style={[type.titleMedium, styles.numberInput, { color: colors.onSurface }]}
                    />
                    <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>min</Text>
                  </View>
                </View>
              </View>
              <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
                Roughly how long this part usually takes, including waiting.
              </Text>
            </View>

            {/* Service */}
            {mode !== 'walk' && mode !== 'bike' ? (
              <View style={styles.field}>
                <Text style={[type.labelMedium, { color: colors.onSurfaceVariant }]}>
                  Which one? (optional)
                </Text>
                <TextInput
                  value={service}
                  onChangeText={setService}
                  placeholder="Bus number, line, anything you'll recognise"
                  placeholderTextColor={colors.onSurfaceVariant}
                  accessibilityLabel="Service name, optional"
                  style={[
                    type.bodyMedium,
                    styles.input,
                    {
                      color: colors.onSurface,
                      backgroundColor: colors.surfaceContainerHighest,
                      borderColor: colors.outlineVariant,
                      borderRadius: shape.small,
                    },
                  ]}
                />
              </View>
            ) : null}

            {duplicate !== null ? (
              <View
                style={[
                  styles.duplicateNote,
                  { backgroundColor: colors.tertiaryContainer, borderRadius: shape.small },
                ]}
              >
                <Icon name="info" size={14} color={colors.onTertiaryContainer} />
                <Text
                  style={[
                    type.bodySmall,
                    styles.duplicateText,
                    { color: colors.onTertiaryContainer },
                  ]}
                >
                  {`There's already a ${MODE_LABELS[duplicate.mode]} connection there. ` +
                    'Adding this one gives you an alternative way to get there — Reach will learn both.'}
                </Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.outlineVariant }]}>
            <Button label="Cancel" variant="text" onPress={onClose} style={styles.footerButton} />
            <Button
              label={addingNode ? 'Add place and connection' : 'Add connection'}
              icon="plus"
              onPress={submit}
              disabled={!canSubmit}
              style={styles.footerButton}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  backdropTap: {
    flex: 1,
  },
  sheet: {
    maxHeight: '88%',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.4)',
    marginBottom: 12,
  },
  header: {
    gap: 2,
    marginBottom: 12,
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    gap: 18,
    paddingBottom: 12,
  },
  field: {
    gap: 8,
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
    gap: 4,
  },
  inputWithSuffix: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  numberInput: {
    minWidth: 56,
    paddingVertical: 4,
  },
  input: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    minHeight: 44,
  },
  newNodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cancelNew: {
    padding: 8,
  },
  duplicateNote: {
    flexDirection: 'row',
    gap: 8,
    padding: 10,
  },
  duplicateText: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 12,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerButton: {
    flex: 1,
  },
});
