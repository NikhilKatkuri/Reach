/**
 * CommuteSwitcher: which commute Today is about.
 *
 * Reach assumes a single daily commute, which was fine with one commute and is
 * actively unhelpful with four. The pick lives in the Today header rather than
 * in Settings because it is a per-morning decision, not a preference: the
 * answer changes depending on where you are going today, and burying it in
 * Settings meant there was no way to switch without leaving the screen you were
 * looking at.
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/src/store/theme';
import { Button, Icon } from '@/src/components/ui';

/** A commute the user can switch to. */
export interface CommuteOption {
  readonly id: string;
  readonly name: string;
  readonly destination: string;
}

/** Props for {@link CommuteSwitcher}. */
export interface CommuteSwitcherProps {
  readonly open: boolean;
  readonly commutes: readonly CommuteOption[];
  readonly selectedId: string | null;
  /** True when a different commute has a trip half-logged. */
  readonly activeTripElsewhere: boolean;
  readonly onSelect: (id: string) => void;
  readonly onReturnToActiveTrip: () => void;
  readonly onClose: () => void;
  readonly onCreate: () => void;
}

/** The header control that opens the sheet. */
export function CommuteSwitcherButton({
  name,
  onPress,
}: {
  readonly name: string;
  readonly onPress: () => void;
}) {
  const { colors, type, shape } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Commute: ${name}. Change commute`}
      onPress={onPress}
      style={[
        styles.button,
        { backgroundColor: colors.surfaceContainer, borderRadius: shape.full },
      ]}
    >
      <Icon name="route" size={14} color={colors.primary} weight="fill" />
      <Text
        style={[type.labelLarge, styles.buttonLabel, { color: colors.onSurface }]}
        numberOfLines={1}
      >
        {name}
      </Text>
      <Icon name="caretDown" size={12} color={colors.onSurfaceVariant} weight="bold" />
    </Pressable>
  );
}

/** The sheet itself. */
export function CommuteSwitcher({
  open,
  commutes,
  selectedId,
  activeTripElsewhere,
  onSelect,
  onReturnToActiveTrip,
  onClose,
  onCreate,
}: CommuteSwitcherProps) {
  const { colors, type, shape } = useTheme();
  const insets = useSafeAreaInsets();

  if (!open) return null;

  return (
    <View style={styles.backdrop}>
      <Pressable
        style={styles.flex}
        accessibilityRole="button"
        accessibilityLabel="Close commute list"
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
        <Text style={[type.titleMedium, styles.title, { color: colors.onSurface }]}>
          Which commute?
        </Text>

        {/*
          A half-logged trip is the one thing a user cannot afford to lose
          sight of, so it is offered first and separately from the list.
        */}
        {activeTripElsewhere ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back to the trip you are logging"
            onPress={onReturnToActiveTrip}
            style={[
              styles.activeBanner,
              { backgroundColor: colors.tertiaryContainer, borderRadius: shape.medium },
            ]}
          >
            <Icon name="play" size={16} color={colors.onTertiaryContainer} weight="fill" />
            <Text
              style={[type.bodyMedium, styles.activeText, { color: colors.onTertiaryContainer }]}
            >
              You have a trip in progress. Go back to it.
            </Text>
          </Pressable>
        ) : null}

        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {commutes.length === 0 ? (
            <Text style={[type.bodyMedium, { color: colors.onSurfaceVariant }]}>
              You have not created a commute yet.
            </Text>
          ) : null}

          {commutes.map((commute) => {
            const selected = commute.id === selectedId;
            return (
              <Pressable
                key={commute.id}
                accessibilityRole="radio"
                accessibilityState={{ selected, checked: selected }}
                accessibilityLabel={`${commute.name}, to ${commute.destination}`}
                onPress={() => onSelect(commute.id)}
                style={[
                  styles.row,
                  {
                    backgroundColor: selected ? colors.primaryContainer : colors.surfaceContainer,
                    borderColor: selected ? colors.primary : colors.outlineVariant,
                    borderRadius: shape.medium,
                  },
                ]}
              >
                <View style={styles.rowText}>
                  <Text
                    style={[
                      type.titleSmall,
                      { color: selected ? colors.onPrimaryContainer : colors.onSurface },
                    ]}
                  >
                    {commute.name}
                  </Text>
                  <Text
                    style={[
                      type.bodySmall,
                      { color: selected ? colors.onPrimaryContainer : colors.onSurfaceVariant },
                    ]}
                  >
                    {`To ${commute.destination}`}
                  </Text>
                </View>
                {selected ? (
                  <Icon name="checkCircle" size={20} color={colors.primary} weight="fill" />
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>

        <Button
          label="New commute"
          icon="plus"
          variant="tonal"
          fullWidth
          onPress={onCreate}
          accessibilityHint="Starts building another commute"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  buttonLabel: {
    flexShrink: 1,
  },
  sheet: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
    maxHeight: '80%',
  },
  title: {
    marginBottom: 2,
  },
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
  },
  activeText: {
    flex: 1,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    gap: 8,
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 1,
    minHeight: 56,
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
});
