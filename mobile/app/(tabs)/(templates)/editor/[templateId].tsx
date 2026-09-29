/**
 * Template builder: create and edit a commute as a route graph.
 *
 * The screen is a thin shell over `useTemplateEditor` and the graph engine.
 * All business logic — validation, route enumeration, persistence — lives in
 * `src/features/templates` and `src/engine`, so this file is only layout and
 * event wiring.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/src/store/theme';
import { Badge, Button, Card, Chip, EmptyState, Icon, RoutePill } from '@/src/components/ui';
import { useTemplateGraph } from '@/src/hooks/useTrips';
import { useTemplateEditor } from '@/src/store/templateEditor';
import {
  saveTemplate,
  TemplateValidationError,
  validateDraft,
} from '@/src/features/templates/service';
import { analyzeTemplate } from '@/src/engine/graph';
import { MODE_LABELS } from '@/src/constants/modes';
import { modeIconName } from '@/src/components/ui/Icon';
import { TRANSPORT_MODES, type StopKind, type TransportMode as Mode } from '@/src/types/schemas';

import { queryKeys } from '@/src/store/queryClient';

const STOP_KINDS: readonly { value: StopKind; label: string }[] = [
  { value: 'stop', label: 'Stop' },
  { value: 'station', label: 'Station' },
  { value: 'home', label: 'Home' },
  { value: 'office', label: 'Office' },
];

export default function TemplateEditorScreen() {
  const { templateId = 'new' } = useLocalSearchParams<{ templateId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors, type, shape } = useTheme();

  const isNew = templateId === 'new';
  const graphQuery = useTemplateGraph(isNew ? null : templateId);

  const {
    draft,
    isDirty,
    load,
    setName,
    addStop,
    renameStop,
    removeStop,
    moveStop,
    addSegment,
    updateSegment,
    removeSegment,
  } = useTemplateEditor();

  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [selectedFrom, setSelectedFrom] = useState<string | null>(null);

  // Load the template into the editor once it arrives.
  //
  // This is React's "adjust state when an input changes" pattern rather than a
  // `useEffect`: the store write happens during the same render that notices
  // the change, so the first painted frame already shows the loaded draft.
  // An effect would paint an empty editor and then repaint, and would be
  // flagged for the cascading render it causes.
  const loadedKey = isNew ? 'new' : (graphQuery.data?.template.id ?? null);
  const [loadedDraftKey, setLoadedDraftKey] = useState<string | null>(null);

  if (loadedDraftKey !== loadedKey && loadedKey !== null) {
    setLoadedDraftKey(loadedKey);
    load(isNew ? null : (graphQuery.data ?? null));
  }

  const analysis = useMemo(() => {
    if (draft.stops.length < 2) return null;
    return analyzeTemplate({
      template: {
        id: draft.id,
        name: draft.name,
        originName: draft.originName,
        destinationName: draft.destinationName,
        colorSeed: '#00639B',
        notes: draft.notes,
        isArchived: false,
        isDefault: false,
        sortOrder: 0,
        createdAt: 0,
        updatedAt: 0,
      },
      stops: draft.stops,
      segments: draft.segments,
    });
  }, [draft]);

  const orderedStops = useMemo(
    () => [...draft.stops].sort((a, b) => a.sortOrder - b.sortOrder),
    [draft.stops],
  );

  const onSave = useCallback(async () => {
    const issues = validateDraft({
      id: draft.id,
      name: draft.name,
      originName: draft.originName,
      destinationName: draft.destinationName,
      notes: draft.notes,
      stops: draft.stops,
      segments: draft.segments,
    });

    if (issues.length > 0) {
      setErrors(issues);
      return;
    }

    setSaving(true);
    setErrors([]);

    try {
      const template = await saveTemplate({
        id: draft.id,
        name: draft.name,
        originName: draft.originName,
        destinationName: draft.destinationName,
        notes: draft.notes,
        stops: draft.stops,
        segments: draft.segments,
      });

      await queryClient.invalidateQueries({ queryKey: queryKeys.templates.all });
      router.replace(`/(tabs)/(templates)/editor/${template.id}`);
    } catch (error) {
      if (error instanceof TemplateValidationError) {
        setErrors([...error.issues]);
      } else {
        setErrors([error instanceof Error ? error.message : 'Could not save this template.']);
      }
    } finally {
      setSaving(false);
    }
  }, [draft, queryClient, router]);

  const onDelete = useCallback(async () => {
    if (isNew) return;
    const { removeTemplate } = await import('@/src/features/templates/service');
    await removeTemplate(templateId);
    await queryClient.invalidateQueries({ queryKey: queryKeys.templates.all });
    router.back();
  }, [isNew, templateId, queryClient, router]);

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={{
          title: isNew ? 'New commute' : draft.name || 'Edit commute',
          headerRight: () => (
            <Button
              label="Save"
              size="small"
              onPress={() => void onSave()}
              loading={saving}
              disabled={!isDirty && !isNew}
              accessibilityHint="Saves this template to the local database"
            />
          ),
        }}
      />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {isDirty ? (
          <View
            style={[
              styles.dirtyBanner,
              { backgroundColor: colors.tertiaryContainer, borderRadius: shape.small },
            ]}
          >
            <Text style={[type.labelSmall, { color: colors.onTertiaryContainer }]}>
              Unsaved changes — nothing is written until you tap Save.
            </Text>
          </View>
        ) : null}

        <Card>
          <Text style={[type.titleMedium, { color: colors.onSurface }]}>Name</Text>
          <NameField value={draft.name} onChange={setName} />
        </Card>

        <Card>
          <View style={styles.sectionHeader}>
            <Text style={[type.titleMedium, { color: colors.onSurface }]}>Stops</Text>
            <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
              {`${orderedStops.length} in order`}
            </Text>
          </View>

          {orderedStops.length === 0 ? (
            <EmptyState
              compact
              icon="mapPin"
              title="No stops yet"
              description="Add Home first, then each stop along the way."
            />
          ) : (
            <View style={styles.stopList}>
              {orderedStops.map((stop, index) => (
                <View
                  key={stop.id}
                  style={[
                    styles.stopRow,
                    {
                      backgroundColor: colors.surfaceContainer,
                      borderRadius: shape.medium,
                      borderColor: selectedFrom === stop.id ? colors.primary : 'transparent',
                      borderWidth: selectedFrom === stop.id ? 2 : 0,
                    },
                  ]}
                >
                  <View style={styles.stopOrder}>
                    <Text style={[type.labelMedium, { color: colors.onSurfaceVariant }]}>
                      {index + 1}
                    </Text>
                  </View>

                  <View style={styles.stopText}>
                    <TextInputStyled
                      value={stop.name}
                      onChangeText={(value) => renameStop(stop.id, value)}
                      placeholder="Stop name"
                      style={{ color: colors.onSurface, fontSize: 15, borderRadius: shape.small }}
                    />
                    <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
                      {stop.kind}
                    </Text>
                  </View>

                  <View style={styles.stopActions}>
                    <Button
                      label="From"
                      size="small"
                      variant={selectedFrom === stop.id ? 'tonal' : 'text'}
                      onPress={() =>
                        setSelectedFrom((current) => (current === stop.id ? null : stop.id))
                      }
                    />
                    <IconButton
                      icon="arrowLeft"
                      label={`Move ${stop.name} up`}
                      onPress={() => moveStop(stop.id, -1)}
                      disabled={index === 0}
                    />
                    <IconButton
                      icon="arrowRight"
                      label={`Move ${stop.name} down`}
                      onPress={() => moveStop(stop.id, 1)}
                      disabled={index === orderedStops.length - 1}
                    />
                    <IconButton
                      icon="trash"
                      label={`Remove ${stop.name}`}
                      onPress={() => removeStop(stop.id)}
                      destructive
                      disabled={orderedStops.length <= 2}
                    />
                  </View>
                </View>
              ))}
            </View>
          )}

          <AddStopRow onAdd={addStop} />
        </Card>

        <Card>
          <View style={styles.sectionHeader}>
            <Text style={[type.titleMedium, { color: colors.onSurface }]}>Legs</Text>
            <Badge label={`${draft.segments.length}`} />
          </View>

          {draft.segments.length === 0 ? (
            <EmptyState
              compact
              icon="route"
              title="No legs yet"
              description={
                selectedFrom === null
                  ? 'Tap "From" on a stop, then add a leg to the next one.'
                  : 'Now add a leg from the highlighted stop.'
              }
            />
          ) : (
            <View style={styles.segmentList}>
              {[...draft.segments]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((segment) => {
                  const from = orderedStops.find((stop) => stop.id === segment.fromStopId);
                  const to = orderedStops.find((stop) => stop.id === segment.toStopId);
                  return (
                    <View
                      key={segment.id}
                      style={[
                        styles.segmentRow,
                        { backgroundColor: colors.surfaceContainer, borderRadius: shape.medium },
                      ]}
                    >
                      <Icon
                        name={modeIconName(segment.mode)}
                        size={18}
                        color={colors.onSurfaceVariant}
                        weight="fill"
                      />
                      <View style={styles.segmentText}>
                        <Text
                          numberOfLines={1}
                          style={[type.bodyMedium, { color: colors.onSurface }]}
                        >
                          {`${from?.name ?? '?'} → ${to?.name ?? '?'}`}
                        </Text>
                        <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
                          {`${segment.serviceLabel ?? MODE_LABELS[segment.mode]} · ${segment.expectedDurationMin} min` +
                            (segment.bufferMinutes > 0 ? ` + ${segment.bufferMinutes} buffer` : '')}
                        </Text>
                      </View>
                      <View style={styles.segmentActions}>
                        <Button
                          label={`${segment.expectedDurationMin}m`}
                          size="small"
                          variant="text"
                          onPress={() =>
                            updateSegment(segment.id, {
                              expectedDurationMin:
                                segment.expectedDurationMin >= 60
                                  ? 5
                                  : segment.expectedDurationMin + 5,
                            })
                          }
                          accessibilityHint="Increase the expected duration by five minutes"
                        />
                        <IconButton
                          icon="trash"
                          label="Remove leg"
                          onPress={() => removeSegment(segment.id)}
                          destructive
                        />
                      </View>
                    </View>
                  );
                })}
            </View>
          )}

          <AddSegmentRow
            stops={orderedStops}
            segments={draft.segments}
            selectedFrom={selectedFrom}
            onAdd={addSegment}
            onClearSelection={() => setSelectedFrom(null)}
          />
        </Card>

        {analysis !== null ? (
          <Card variant="outlined">
            <Text style={[type.titleMedium, { color: colors.onSurface }]}>
              Routes Reach will consider
            </Text>
            <Text style={[type.bodySmall, styles.routesHint, { color: colors.onSurfaceVariant }]}>
              Reach enumerates every simple path from Home to your destination and scores each one.
              Add a second leg from the same stop to create an alternative.
            </Text>

            {analysis.routes.length === 0 ? (
              <Text style={[type.bodySmall, { color: colors.error }]}>
                No route connects your origin to your destination yet.
              </Text>
            ) : (
              <View style={styles.routeList}>
                {analysis.routes.slice(0, 6).map((route) => (
                  <View key={route.signature} style={styles.routeItem}>
                    <RoutePill
                      modes={route.modes}
                      transfers={route.hasTransfer ? 1 : 0}
                      durationMinutes={route.expectedDurationMin}
                    />
                    <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
                      {route.stopIds.length} stops
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {analysis.issues.length > 0 ? (
              <View style={styles.issues}>
                {analysis.issues.map((issue) => (
                  <View key={issue.message} style={styles.issueRow}>
                    <Icon
                      name={issue.severity === 'error' ? 'warning' : 'info'}
                      size={14}
                      color={issue.severity === 'error' ? colors.error : colors.onSurfaceVariant}
                    />
                    <Text
                      style={[
                        type.bodySmall,
                        styles.issueText,
                        {
                          color:
                            issue.severity === 'error' ? colors.error : colors.onSurfaceVariant,
                        },
                      ]}
                    >
                      {issue.message}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>
        ) : null}

        {errors.length > 0 ? (
          <Card variant="outlined" style={{ borderColor: colors.error }}>
            {errors.map((error) => (
              <View key={error} style={styles.issueRow}>
                <Icon name="warning" size={14} color={colors.error} />
                <Text style={[type.bodySmall, styles.issueText, { color: colors.error }]}>
                  {error}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}

        {!isNew ? (
          <Button
            label="Delete template"
            variant="danger"
            fullWidth
            icon="trash"
            onPress={() => void onDelete()}
          />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * A controlled text field.
 *
 * Deliberately has no local state: the value lives in the editor store, so
 * mirroring it here would need an effect to resynchronise and would cause a
 * cascading render on every keystroke.
 */
function NameField({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const { colors, shape } = useTheme();

  return (
    <TextInputStyled
      value={value}
      onChangeText={onChange}
      placeholder="Home → HITAM"
      accessibilityLabel="Commute name"
      style={{ color: colors.onSurface, fontSize: 16, borderRadius: shape.small }}
    />
  );
}

function AddStopRow({ onAdd }: { readonly onAdd: (name: string, kind: StopKind) => string }) {
  const { colors, type, shape } = useTheme();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<StopKind>('stop');

  return (
    <View style={styles.addRow}>
      <TextInputStyled
        value={name}
        onChangeText={setName}
        placeholder="New stop name"
        style={{ color: colors.onSurface, fontSize: 14, borderRadius: shape.small }}
      />
      <View style={styles.kindRow}>
        {STOP_KINDS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            variant="filter"
            selected={kind === option.value}
            onPress={() => setKind(option.value)}
          />
        ))}
      </View>
      <Button
        label="Add stop"
        icon="plus"
        variant="tonal"
        onPress={() => {
          onAdd(name.trim().length > 0 ? name.trim() : `Stop ${Date.now() % 100}`, kind);
          setName('');
        }}
      />
      <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
        Stops are ordered top to bottom. Use the arrows to reorder.
      </Text>
    </View>
  );
}

function AddSegmentRow({
  stops,
  segments,
  selectedFrom,
  onAdd,
  onClearSelection,
}: {
  readonly stops: readonly { id: string; name: string; sortOrder: number }[];
  readonly segments: readonly { id: string; fromStopId: string; toStopId: string }[];
  readonly selectedFrom: string | null;
  readonly onAdd: (input: {
    fromStopId: string;
    toStopId: string;
    mode: Mode;
    expectedDurationMin: number;
    serviceLabel?: string | null;
  }) => string;
  readonly onClearSelection: () => void;
}) {
  const { colors, type, shape } = useTheme();
  const [mode, setMode] = useState<Mode>('walk');
  const [minutes, setMinutes] = useState('10');

  const existing = new Set(segments.map((segment) => `${segment.fromStopId}>${segment.toStopId}`));

  // When a stop is selected as the origin, the destination defaults to the
  // next stop in order, which is what the user almost always wants.
  const fromId = selectedFrom ?? stops[0]?.id ?? null;
  const fromIndex = fromId === null ? -1 : stops.findIndex((stop) => stop.id === fromId);
  const suggestedTo = fromIndex >= 0 ? (stops[fromIndex + 1]?.id ?? null) : null;
  const [toId, setToId] = useState<string | null>(null);

  const resolvedTo = toId ?? suggestedTo;

  return (
    <View
      style={[
        styles.addRow,
        { backgroundColor: colors.surfaceContainerLow, borderRadius: shape.medium, padding: 12 },
      ]}
    >
      <Text style={[type.labelMedium, { color: colors.onSurface }]}>Add a leg</Text>

      <View style={styles.kindRow}>
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

      <View style={styles.legPickers}>
        <StopPicker
          label="From"
          stops={stops}
          value={fromId}
          onChange={(next) => {
            setToId(null);
            if (selectedFrom !== null) onClearSelection();
            void next;
          }}
        />
        <StopPicker label="To" stops={stops} value={resolvedTo} onChange={setToId} />
      </View>

      <View style={styles.minutesRow}>
        <Text style={[type.labelMedium, { color: colors.onSurfaceVariant }]}>Minutes</Text>
        <TextInputStyled
          value={minutes}
          onChangeText={setMinutes}
          keyboardType="number-pad"
          style={{ color: colors.onSurface, fontSize: 14, width: 72, borderRadius: shape.small }}
        />
        <Text style={[type.bodySmall, styles.minutesHint, { color: colors.onSurfaceVariant }]}>
          Typical time, including waiting where relevant.
        </Text>
      </View>

      <Button
        label="Add leg"
        icon="plus"
        variant="tonal"
        disabled={fromId === null || resolvedTo === null || fromId === resolvedTo}
        onPress={() => {
          if (fromId === null || resolvedTo === null) return;
          onAdd({
            fromStopId: fromId,
            toStopId: resolvedTo,
            mode,
            expectedDurationMin: Math.max(1, Number.parseInt(minutes, 10) || 10),
            serviceLabel: mode === 'walk' || mode === 'bike' ? null : MODE_LABELS[mode],
          });
          setToId(null);
        }}
      />

      {fromId !== null && resolvedTo !== null && existing.has(`${fromId}>${resolvedTo}`) ? (
        <Text style={[type.labelSmall, { color: colors.warning }]}>
          A leg already connects these two stops. Add another to create an alternative branch.
        </Text>
      ) : null}
    </View>
  );
}

function StopPicker({
  label,
  stops,
  value,
  onChange,
}: {
  readonly label: string;
  readonly stops: readonly { id: string; name: string; sortOrder: number }[];
  readonly value: string | null;
  readonly onChange: (id: string) => void;
}) {
  const { colors, type } = useTheme();
  return (
    <View style={styles.picker}>
      <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>{label}</Text>
      <View style={styles.kindRow}>
        {stops.map((stop) => (
          <Chip
            key={stop.id}
            label={stop.name}
            variant="filter"
            selected={value === stop.id}
            onPress={() => onChange(stop.id)}
          />
        ))}
      </View>
    </View>
  );
}

/** A themed text input used throughout the builder. */
function TextInputStyled({ style, ...props }: React.ComponentProps<typeof TextInput>) {
  const { colors } = useTheme();
  return (
    <TextInput
      {...props}
      style={[
        {
          backgroundColor: colors.surfaceContainerHighest,
          borderColor: colors.outlineVariant,
          borderWidth: 1,
          paddingHorizontal: 12,
          paddingVertical: 10,
        },
        style,
      ]}
    />
  );
}

function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
  destructive = false,
}: {
  readonly icon: 'arrowLeft' | 'arrowRight' | 'trash';
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly destructive?: boolean;
}) {
  const { colors, minTouchTarget } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.iconButton,
        { width: minTouchTarget, height: minTouchTarget, opacity: disabled ? 0.3 : 1 },
      ]}
    >
      <Icon
        name={icon}
        size={18}
        color={destructive ? colors.error : colors.onSurfaceVariant}
        weight="bold"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: 20,
    gap: 16,
    paddingBottom: 48,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  stopList: {
    gap: 8,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    gap: 8,
  },
  stopOrder: {
    width: 24,
    alignItems: 'center',
  },
  stopText: {
    flex: 1,
  },
  stopActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  segmentList: {
    gap: 8,
  },
  segmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 10,
  },
  segmentText: {
    flex: 1,
  },
  segmentActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addRow: {
    marginTop: 12,
    gap: 8,
  },
  kindRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  legPickers: {
    gap: 8,
  },
  picker: {
    gap: 4,
  },
  minutesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  minutesHint: {
    flex: 1,
  },
  routesHint: {
    marginTop: 6,
    marginBottom: 12,
  },
  routeList: {
    gap: 8,
  },
  routeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  issues: {
    marginTop: 12,
    gap: 6,
  },
  issueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  issueText: {
    flex: 1,
  },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dirtyBanner: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
