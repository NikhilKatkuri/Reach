/**
 * Template builder: create and edit a commute as a route graph.
 *
 * Structure, in the order a user meets it:
 *
 *  1. Commute information — name
 *  2. Route graph — the diagram, and the only way to add a connection
 *  3. Validation — what still needs attention
 *  4. Ways you can get there — what Reach can learn
 *  5. Save
 *
 * This file is a shell. Graph logic lives in `src/engine`, the sheets and
 * cards in `src/features/templates`, persistence in `src/db`. It wires them
 * together and owns nothing else.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Button, Card, Icon, ListSkeleton, RouteGraph, ScreenContainer } from '@/src/components/ui';
import { modeIconName } from '@/src/components/ui/Icon';
import { useTemplateGraph } from '@/src/hooks/useTrips';
import { useTemplateEditor } from '@/src/store/templateEditor';
import {
  saveTemplate,
  TemplateValidationError,
  validateDraft,
} from '@/src/features/templates/service';
import { GraphValidation } from '@/src/features/templates/GraphValidation';
import { PlaceList } from '@/src/features/templates/PlaceList';
import { PatternPicker } from '@/src/features/templates/PatternPicker';
import { ChainEditor } from '@/src/features/templates/ChainEditor';
import { COMMUTE_PRESETS, instantiatePreset } from '@/src/features/templates/presets';
import { RoutePreview } from '@/src/features/templates/RoutePreview';
import { ConnectionEditor } from '@/src/features/templates/ConnectionEditor';
import { QuickStart } from '@/src/features/templates/QuickStart';
import type { QuickStartResult } from '@/src/features/templates/QuickStart';
import type { ConnectionDraft } from '@/src/features/templates/ConnectionEditor';
import { analyzeTemplate } from '@/src/engine/graph';
import { formatDurationLabel } from '@/src/engine/routePresentation';
import { MODE_LABELS } from '@/src/constants/modes';
import { resolveNodeRole, type NodeRole, type Stop } from '@/src/types/schemas';
import { queryKeys } from '@/src/store/queryClient';
import { uuid } from '@/src/lib/uuid';

const NODE_ROLE_LABELS: Readonly<Record<NodeRole, string>> = {
  origin: 'Start',
  destination: 'Destination',
  junction: 'Junction',
  stop: 'Stop',
};

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
    setStopRole,
    addSegment,
    addAlternative,
    removeSegment,
    setConnection,
    clearConnection,
    loadStops,
    setEndpoints,
  } = useTemplateEditor();

  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  /** Node the user is working from, or null when nothing is selected. */
  const [focusStopId, setFocusStopId] = useState<string | null>(null);
  const [connectionOpen, setConnectionOpen] = useState(false);
  /**
   * Which half of the builder is showing.
   *
   * Two steps rather than one long form, because naming your places and timing
   * your legs are separate thoughts. It also gives the graph view a place to
   * live where it is not competing with nine form fields.
   */
  const [step, setStep] = useState<'places' | 'route'>('places');

  /*
   * Load the template into the editor once it arrives.
   *
   * This was previously a render-phase write, on the reasoning that "adjust
   * state during render" avoids an extra paint. That reasoning conflated two
   * different things. Adjusting *this component's own* state during render is a
   * real, documented React pattern. `load()` is not that — it is a Zustand
   * setter, so it notifies every other component subscribed to the store while
   * this one is still rendering. React throws for exactly this, and correctly:
   * a render must not have side effects on the rest of the tree.
   *
   * So the store write goes in an effect, and a ref records which template has
   * been loaded. The ref is doing the work a `useState` guard would, except it
   * is not itself a render-phase mutation, and it does not trigger a second
   * render pass. Keying on the template id rather than the query result means a
   * background refetch does not clobber unsaved edits with a fresh copy.
   */
  const loadedTemplateId = isNew ? 'new' : (graphQuery.data?.template.id ?? null);
  const loadedRef = useRef<string | null>(null);
  const graphData = graphQuery.data ?? null;

  useEffect(() => {
    if (loadedTemplateId === null) return;
    if (loadedRef.current === loadedTemplateId) return;
    loadedRef.current = loadedTemplateId;
    load(isNew ? null : graphData);
  }, [graphData, isNew, load, loadedTemplateId]);

  const analysis = useMemo(
    () =>
      analyzeTemplate({
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
      }),
    [draft],
  );

  const focusStop: Stop | null =
    focusStopId === null ? null : (draft.stops.find((s) => s.id === focusStopId) ?? null);

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
        setErrors([error instanceof Error ? error.message : 'Could not save this commute.']);
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

  /**
   * Turns a submitted sheet into a node (if needed) plus a connection.
   *
   * Two details worth stating. A brand-new place is created as a plain stop,
   * because the sheet did not ask what kind of place it is and guessing would
   * be worse than the neutral default. And when the node already has a
   * connection leaving it, this is an *alternative route*, so it goes through
   * `addAlternative`, which promotes the fork to a junction.
   */
  const onConnectionSubmit = useCallback(
    (input: ConnectionDraft) => {
      const toStopId = input.toStopId ?? addStop(input.newNodeName ?? 'New place', 'stop', 'stop');

      const alreadyHasOutgoing = draft.segments.some(
        (segment) => segment.fromStopId === input.fromStopId,
      );

      if (alreadyHasOutgoing) {
        addAlternative({
          fromStopId: input.fromStopId,
          toStopId,
          mode: input.mode,
          expectedDurationMin: input.expectedDurationMin,
          serviceLabel: input.serviceLabel,
          bufferMinutes: input.bufferMinutes,
        });
      } else {
        addSegment({
          fromStopId: input.fromStopId,
          toStopId,
          mode: input.mode,
          expectedDurationMin: input.expectedDurationMin,
          serviceLabel: input.serviceLabel,
          bufferMinutes: input.bufferMinutes,
        });
      }

      setConnectionOpen(false);
    },
    [addAlternative, addSegment, addStop, draft.segments],
  );

  /*
   * A brand-new commute starts on the quick path. It hands back a complete,
   * valid graph, so by the time the full editor appears there is already
   * something to edit rather than a blank page.
   */
  // An existing template whose graph has not arrived yet must not flash the
  // new-commute form: the draft is empty precisely because the data is still
  // coming, and swapping to "create your commute" mid-load looks like the app
  // forgot everything.
  const isLoadingGraph = !isNew && graphQuery.isLoading;

  if (isLoadingGraph) {
    return (
      <ScreenContainer title={draft.name || 'Commute'} applyTopInset={false}>
        <ListSkeleton count={4} />
      </ScreenContainer>
    );
  }

  if (draft.stops.length === 0) {
    return (
      <KeyboardAvoidingView
        style={[styles.flex, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Stack.Screen options={{ title: 'New commute' }} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <QuickStart
            onComplete={(result: QuickStartResult) => {
              setEndpoints({
                name: result.name,
                originName: result.startName,
                destinationName: result.destinationName,
              });
              // Seed just the two endpoints. The journey is built in the
              // editor, one flow, rather than being pre-assembled here.
              const now = Date.now();
              loadStops(
                [
                  {
                    id: uuid(),
                    templateId: draft.id,
                    name: result.startName,
                    kind: 'home',
                    nodeRole: 'origin',
                    latitude: null,
                    longitude: null,
                    sortOrder: 0,
                    createdAt: now,
                    updatedAt: now,
                  },
                  {
                    id: uuid(),
                    templateId: draft.id,
                    name: result.destinationName,
                    kind: 'office',
                    nodeRole: 'destination',
                    latitude: null,
                    longitude: null,
                    sortOrder: 1,
                    createdAt: now,
                    updatedAt: now,
                  },
                ],
                [],
              );
              setStep('places');
            }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: isNew ? 'New commute' : draft.name || 'Edit commute' }} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {isDirty ? (
          <View
            style={[
              styles.dirtyBanner,
              { backgroundColor: colors.tertiaryContainer, borderRadius: shape.small },
            ]}
          >
            <Text style={[type.labelSmall, { color: colors.onTertiaryContainer }]}>
              Unsaved changes — nothing is stored until you tap Save.
            </Text>
          </View>
        ) : null}

        {/* 1. Commute information */}
        <Card>
          <Text style={[type.titleMedium, { color: colors.onSurface }]}>Commute</Text>
          <ThemedInput
            value={draft.name}
            onChangeText={setName}
            placeholder="College"
            accessibilityLabel="Commute name"
          />
          <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
            {draft.stops.length === 0
              ? 'Add your start and destination below.'
              : `${draft.originName} → ${draft.destinationName}`}
          </Text>
        </Card>

        {/* Step switch */}
        <View
          style={[
            styles.stepper,
            { backgroundColor: colors.surfaceContainer, borderRadius: shape.full },
          ]}
        >
          <StepTab label="Places" selected={step === 'places'} onPress={() => setStep('places')} />
          <StepTab
            label="Route"
            selected={step === 'route'}
            onPress={() => setStep('route')}
            disabled={draft.stops.length < 2}
          />
        </View>

        {step === 'places' ? (
          <Card>
            <View style={styles.sectionHeader}>
              <Text style={[type.titleMedium, { color: colors.onSurface }]}>
                Where does your commute go?
              </Text>
            </View>
            <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
              Add every place you go through, in order. You can change anything later.
            </Text>
            <PlaceList
              stops={draft.stops}
              hasPlaces={draft.stops.length > 0}
              onAdd={(name) => addStop(name, 'stop')}
              onRename={renameStop}
              onRemove={removeStop}
              onMove={moveStop}
              onSetRole={setStopRole}
            />

            {/*
              Patterns are offered here rather than in a separate flow, so there
              is one way to build a commute. Only for an untouched draft: a
              pattern applied over places the user has already named would
              overwrite their words.
            */}
            {draft.stops.length <= 2 && draft.segments.length === 0 ? (
              <PatternPicker
                onPick={(presetId) => {
                  const preset = COMMUTE_PRESETS.find((p) => p.id === presetId);
                  if (preset === undefined) return;
                  const built = instantiatePreset(preset, draft.id);
                  // Keep the names the user just typed for the two endpoints.
                  const originName = draft.originName;
                  const destinationName = draft.destinationName;
                  loadStops(
                    built.stops.map((stop) => {
                      if (resolveNodeRole(stop) === 'origin' && originName.trim().length > 0) {
                        return { ...stop, name: originName.trim(), kind: 'home' as const };
                      }
                      if (
                        resolveNodeRole(stop) === 'destination' &&
                        destinationName.trim().length > 0
                      ) {
                        return { ...stop, name: destinationName.trim(), kind: 'office' as const };
                      }
                      return stop;
                    }),
                    built.segments,
                  );
                }}
              />
            ) : null}
            {draft.stops.length >= 2 ? (
              <Button
                label="Next: how you get between them"
                icon="arrowRight"
                variant="tonal"
                fullWidth
                onPress={() => setStep('route')}
              />
            ) : null}
          </Card>
        ) : (
          <>
            <Card>
              <View style={styles.sectionHeader}>
                <Text style={[type.titleMedium, { color: colors.onSurface }]}>
                  How long between each place?
                </Text>
              </View>
              <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
                Set the usual time for each part, plus any waiting you normally do.
              </Text>
              <ChainEditor
                stops={draft.stops}
                segments={draft.segments}
                onSet={(input) => setConnection(input.fromStopId, input.toStopId, input)}
                onClear={clearConnection}
                onAddAlternative={(fromStopId) => {
                  setFocusStopId(fromStopId);
                  setConnectionOpen(true);
                }}
              />
            </Card>

            <Card variant="outlined">
              <View style={styles.sectionHeader}>
                <Text style={[type.titleMedium, { color: colors.onSurface }]}>Your route</Text>
              </View>
              <RouteGraph
                stops={draft.stops}
                segments={draft.segments}
                selectedStopId={focusStopId}
                onSelectStop={(id) => {
                  setFocusStopId((current) => (current === id ? null : id));
                }}
              />
              <Text style={[type.bodySmall, styles.graphHint, { color: colors.onSurfaceVariant }]}>
                Tap a place to rename it, change what it is, or add another way from it.
              </Text>
              {focusStop !== null ? (
                <NodeActions
                  stop={focusStop}
                  onDismiss={() => setFocusStopId(null)}
                  onAddConnection={() => setConnectionOpen(true)}
                  onRename={(name) => renameStop(focusStop.id, name)}
                  onRole={(role) => setStopRole(focusStop.id, role)}
                  onRemove={() => {
                    removeStop(focusStop.id);
                    setFocusStopId(null);
                  }}
                  canRemove={draft.stops.length > 2}
                />
              ) : null}
            </Card>
          </>
        )}

        {/* 3. Validation */}
        {draft.stops.length > 0 ? (
          <Card variant="outlined">
            <GraphValidation
              issues={analysis.issues}
              onFocusStop={(stopId) => setFocusStopId(stopId)}
            />
          </Card>
        ) : null}

        {/* 4. Routes Reach will consider */}
        {draft.stops.length > 0 ? (
          <Card variant="outlined">
            <RoutePreview graph={analysis.graph} routes={analysis.routes} />
          </Card>
        ) : null}

        {draft.segments.length > 0 ? (
          <Card>
            <View style={styles.sectionHeader}>
              <Text style={[type.titleMedium, { color: colors.onSurface }]}>Connections</Text>
              <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
                {`${draft.segments.length}`}
              </Text>
            </View>
            <View style={styles.segmentList}>
              {[...draft.segments]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((segment) => {
                  const from = draft.stops.find((s) => s.id === segment.fromStopId);
                  const to = draft.stops.find((s) => s.id === segment.toStopId);
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
                          {`${segment.serviceLabel ?? MODE_LABELS[segment.mode]} · ${formatDurationLabel(segment.expectedDurationMin)}` +
                            (segment.bufferMinutes > 0 ? ` +${segment.bufferMinutes} waiting` : '')}
                        </Text>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove connection from ${from?.name ?? '?'} to ${to?.name ?? '?'}`}
                        onPress={() => removeSegment(segment.id)}
                        hitSlop={10}
                        style={styles.removeButton}
                      >
                        <Icon name="trash" size={16} color={colors.error} />
                      </Pressable>
                    </View>
                  );
                })}
            </View>
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

        <Button
          label={isNew ? 'Create commute' : 'Save changes'}
          size="large"
          fullWidth
          onPress={() => void onSave()}
          loading={saving}
          disabled={!isDirty && !isNew}
          accessibilityHint="Stores this commute on this device"
        />

        {!isNew ? (
          <Button
            label="Delete commute"
            variant="danger"
            fullWidth
            icon="trash"
            onPress={() => void onDelete()}
          />
        ) : null}
      </ScrollView>

      <ConnectionEditor
        visible={connectionOpen}
        stops={draft.stops}
        segments={draft.segments}
        fromStopId={focusStopId ?? ''}
        title={
          focusStop !== null &&
          draft.segments.some((segment) => segment.fromStopId === focusStop.id)
            ? 'Add another way from here'
            : 'Add a connection'
        }
        onSubmit={onConnectionSubmit}
        onClose={() => setConnectionOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

/**
 * The panel shown for the node the user has selected in the diagram.
 *
 * Everything about a node lives here rather than being scattered onto the
 * diagram itself, so the graph stays readable: the diagram communicates
 * topology, this panel does configuration.
 */
function NodeActions({
  stop,
  onDismiss,
  onAddConnection,
  onRename,
  onRole,
  onRemove,
  canRemove,
}: {
  readonly stop: Stop;
  readonly onDismiss: () => void;
  readonly onAddConnection: () => void;
  readonly onRename: (name: string) => void;
  readonly onRole: (role: NodeRole) => void;
  readonly onRemove: () => void;
  readonly canRemove: boolean;
}) {
  const { colors, type, shape } = useTheme();
  const currentRole = resolveNodeRole(stop);

  return (
    <View
      style={[
        styles.nodePanel,
        { backgroundColor: colors.surfaceContainerLow, borderRadius: shape.medium },
      ]}
    >
      <View style={styles.nodePanelHeader}>
        <Text style={[type.titleSmall, { color: colors.onSurface }]} numberOfLines={1}>
          {stop.name}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Stop editing this place"
          onPress={onDismiss}
          hitSlop={10}
        >
          <Icon name="x" size={16} color={colors.onSurfaceVariant} />
        </Pressable>
      </View>

      <ThemedInput
        value={stop.name}
        onChangeText={onRename}
        placeholder="Name"
        accessibilityLabel={`Name of ${stop.name}`}
      />

      <View style={styles.chipRow}>
        {(Object.keys(NODE_ROLE_LABELS) as NodeRole[]).map((role) => (
          <RoleChip
            key={role}
            role={role}
            selected={currentRole === role}
            onPress={() => onRole(role)}
          />
        ))}
      </View>
      <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
        {currentRole === 'origin'
          ? 'Where this commute starts.'
          : currentRole === 'destination'
            ? 'Where this commute ends.'
            : currentRole === 'junction'
              ? 'Routes split or rejoin here.'
              : 'An ordinary place you pass through.'}
      </Text>

      <Button
        label="Add connection"
        icon="plus"
        variant="tonal"
        fullWidth
        onPress={onAddConnection}
        accessibilityHint={`Adds a way to get from ${stop.name} to somewhere else`}
      />

      {canRemove ? (
        <Button
          label="Remove this place"
          variant="text"
          fullWidth
          onPress={onRemove}
          accessibilityHint="Also removes any connections that use it"
        />
      ) : null}
    </View>
  );
}

function RoleChip({
  role,
  selected,
  onPress,
}: {
  readonly role: NodeRole;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  const { colors, type, shape } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={NODE_ROLE_LABELS[role]}
      onPress={onPress}
      style={[
        styles.roleChip,
        {
          backgroundColor: selected ? colors.secondaryContainer : colors.surfaceContainer,
          borderColor: selected ? colors.secondary : colors.outlineVariant,
          borderRadius: shape.small,
        },
      ]}
    >
      <Text
        style={[
          type.labelMedium,
          { color: selected ? colors.onSecondaryContainer : colors.onSurfaceVariant },
        ]}
      >
        {NODE_ROLE_LABELS[role]}
      </Text>
    </Pressable>
  );
}

/** One half of the builder's step switch. */
function StepTab({
  label,
  selected,
  onPress,
  disabled = false,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly disabled?: boolean;
}) {
  const { colors, type } = useTheme();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.stepTab,
        {
          backgroundColor: selected ? colors.primary : 'transparent',
          borderRadius: 999,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      <Text
        style={[type.labelLarge, { color: selected ? colors.onPrimary : colors.onSurfaceVariant }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ThemedInput(props: React.ComponentProps<typeof TextInput>) {
  const { colors, type, shape } = useTheme();
  return (
    <TextInput
      {...props}
      placeholderTextColor={colors.onSurfaceVariant}
      style={[
        type.bodyMedium,
        styles.input,
        {
          color: colors.onSurface,
          backgroundColor: colors.surfaceContainerHighest,
          borderColor: colors.outlineVariant,
          borderRadius: shape.small,
        },
        props.style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 20, gap: 16, paddingBottom: 48 },
  dirtyBanner: { paddingHorizontal: 12, paddingVertical: 8 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  stepper: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
  },
  stepTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    minHeight: 44,
  },
  graphHint: {
    marginTop: 8,
  },
  input: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    minHeight: 48,
    textAlignVertical: 'center',
  },
  addPlace: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    minHeight: 48,
  },
  nodePanel: { marginTop: 12, padding: 12, gap: 10 },
  nodePanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  roleChip: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, minHeight: 36 },
  segmentList: { gap: 8 },
  segmentRow: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 10 },
  segmentText: { flex: 1 },
  removeButton: { padding: 6 },
  issueRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  issueText: { flex: 1 },
});
