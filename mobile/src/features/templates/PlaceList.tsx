/**
 * PlaceList: step one of building a commute — the places, in order.
 *
 * This exists because the old flow made the user interleave two decisions. Add
 * a stop, then add a leg from it, then add another stop, then another leg, and
 * every time you typed a name you immediately had to think about transport and
 * minutes. Naming a journey is a different task from timing it.
 *
 * So places come first, all of them, in one pass. Connections are the next
 * step, configured in one list rather than one modal at a time.
 */
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/src/store/theme';
import { Button, Chip, Icon } from '@/src/components/ui';
import { resolveNodeRole, type NodeRole, type Stop } from '@/src/types/schemas';

const ROLE_HINTS: Readonly<Record<NodeRole, string>> = {
  origin: 'Your commute starts here.',
  destination: 'Your commute ends here.',
  junction: 'Routes split or rejoin here.',
  stop: 'A place you pass through.',
};

/** Which quick names to offer, in the order a commute is usually described. */
const SUGGESTED_NAMES: readonly string[] = ['Home', 'Work', 'College', 'School'];

/** Props for {@link PlaceList}. */
export interface PlaceListProps {
  readonly stops: readonly Stop[];
  readonly onAdd: (name: string) => void;
  readonly onRename: (stopId: string, name: string) => void;
  readonly onRemove: (stopId: string) => void;
  readonly onMove: (stopId: string, direction: -1 | 1) => void;
  readonly onSetRole: (stopId: string, role: NodeRole) => void;
  /** True once a place exists; the first name is the origin. */
  readonly hasPlaces: boolean;
}

/**
 * The ordered list of places, with add, rename, reorder and role controls.
 *
 * The add field keeps focus and its value is consumed on submit, so typing four
 * place names in a row needs no tapping back to the field between each one.
 */
export function PlaceList({
  stops,
  onAdd,
  onRename,
  onRemove,
  onMove,
  onSetRole,
  hasPlaces,
}: PlaceListProps) {
  const { colors, type, shape } = useTheme();
  const [draft, setDraft] = useState('');
  const inputRef = useRef<TextInput>(null);

  const submit = () => {
    const name = draft.trim();
    if (name.length === 0) return;
    onAdd(name);
    setDraft('');
    // Stay in the field: the common case is naming several places in a row.
    inputRef.current?.focus();
  };

  return (
    <View style={styles.container}>
      <View style={styles.addRow}>
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submit}
          returnKeyType="done"
          placeholder={hasPlaces ? 'Add another place' : 'Where do you start?'}
          placeholderTextColor={colors.onSurfaceVariant}
          accessibilityLabel="Place name"
          style={[
            type.bodyLarge,
            styles.input,
            {
              color: colors.onSurface,
              backgroundColor: colors.surfaceContainerHighest,
              borderColor: colors.outlineVariant,
              borderRadius: shape.small,
            },
          ]}
        />
        <Button
          label="Add"
          icon="plus"
          onPress={submit}
          disabled={draft.trim().length === 0}
          accessibilityHint="Adds this place to your commute"
        />
      </View>

      {!hasPlaces ? (
        <View style={styles.suggestionRow}>
          {SUGGESTED_NAMES.map((name) => (
            <Chip
              key={name}
              label={name}
              variant="filter"
              onPress={() => {
                onAdd(name);
                setDraft('');
                inputRef.current?.focus();
              }}
            />
          ))}
        </View>
      ) : null}

      {stops.map((stop, index) => {
        const role = resolveNodeRole(stop);
        return (
          <View
            key={stop.id}
            style={[
              styles.row,
              {
                backgroundColor: colors.surfaceContainer,
                borderRadius: shape.medium,
              },
            ]}
          >
            <View
              style={[
                styles.index,
                { backgroundColor: colors.surfaceContainerHighest, borderRadius: shape.full },
              ]}
            >
              <Text style={[type.labelMedium, { color: colors.onSurfaceVariant }]}>
                {index + 1}
              </Text>
            </View>

            <View style={styles.rowBody}>
              <TextInput
                value={stop.name}
                onChangeText={(value) => onRename(stop.id, value)}
                placeholder="Place name"
                placeholderTextColor={colors.onSurfaceVariant}
                accessibilityLabel={`Name of place ${index + 1}`}
                style={[type.bodyLarge, styles.rowInput, { color: colors.onSurface }]}
              />
              <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
                {ROLE_HINTS[role]}
              </Text>
            </View>

            <View style={styles.rowActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Move ${stop.name} up`}
                accessibilityState={{ disabled: index === 0 }}
                disabled={index === 0}
                onPress={() => onMove(stop.id, -1)}
                hitSlop={8}
                style={[styles.iconButton, index === 0 && styles.dimmed]}
              >
                <Icon name="arrowLeft" size={16} color={colors.onSurfaceVariant} weight="bold" />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Move ${stop.name} down`}
                accessibilityState={{ disabled: index === stops.length - 1 }}
                disabled={index === stops.length - 1}
                onPress={() => onMove(stop.id, 1)}
                hitSlop={8}
                style={[styles.iconButton, index === stops.length - 1 && styles.dimmed]}
              >
                <Icon name="arrowRight" size={16} color={colors.onSurfaceVariant} weight="bold" />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${stop.name}`}
                onPress={() => onRemove(stop.id)}
                hitSlop={8}
                style={styles.iconButton}
              >
                <Icon name="trash" size={16} color={colors.error} />
              </Pressable>
            </View>
          </View>
        );
      })}

      {hasPlaces ? (
        <View style={styles.roleSection}>
          <Text style={[type.labelMedium, { color: colors.onSurfaceVariant }]}>
            Which end is which?
          </Text>
          <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
            Reach needs to know where you start and where you are going. By default the first place
            is your start and the last is your destination.
          </Text>
          <View style={styles.roleRow}>
            <View style={styles.roleGroup}>
              <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>Start</Text>
              <View style={styles.roleChips}>
                {stops.map((stop) => (
                  <Chip
                    key={stop.id}
                    label={stop.name}
                    variant="filter"
                    selected={resolveNodeRole(stop) === 'origin'}
                    onPress={() => onSetRole(stop.id, 'origin')}
                  />
                ))}
              </View>
            </View>
            <View style={styles.roleGroup}>
              <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>Destination</Text>
              <View style={styles.roleChips}>
                {stops.map((stop) => (
                  <Chip
                    key={stop.id}
                    label={stop.name}
                    variant="filter"
                    selected={resolveNodeRole(stop) === 'destination'}
                    onPress={() => onSetRole(stop.id, 'destination')}
                  />
                ))}
              </View>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    minHeight: 48,
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 10,
  },
  index: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 1,
  },
  rowInput: {
    paddingVertical: 2,
    minHeight: 28,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  iconButton: {
    padding: 8,
  },
  dimmed: {
    opacity: 0.3,
  },
  roleSection: {
    gap: 6,
    marginTop: 4,
  },
  roleRow: {
    gap: 10,
    marginTop: 4,
  },
  roleGroup: {
    gap: 4,
  },
  roleChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
});
