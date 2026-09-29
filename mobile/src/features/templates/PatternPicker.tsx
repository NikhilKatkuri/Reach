/**
 * PatternPicker: start a commute from a structural shape.
 *
 * These are patterns, not routes. Nothing here names a real bus, line or place,
 * because Reach has no timetable and no knowledge of the user's city — a preset
 * that said "Bus 219 from Ameerpet" would be a confident invention sitting in
 * the middle of an app whose entire promise is that its numbers are measured
 * rather than guessed.
 *
 * Each pattern is a *shape* of journey. The user still names every place and
 * sets every duration.
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/src/store/theme';
import { Icon } from '@/src/components/ui';
import { COMMUTE_PRESETS } from './presets';

/** Props for {@link PatternPicker}. */
export interface PatternPickerProps {
  readonly onPick: (presetId: string) => void;
}

export function PatternPicker({ onPick }: PatternPickerProps) {
  const { colors, type, shape } = useTheme();

  return (
    <View style={styles.container}>
      <Text style={[type.labelMedium, { color: colors.onSurfaceVariant }]}>
        Or start from a pattern
      </Text>

      {/* Horizontal so the common case is a glance, not a scroll. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {COMMUTE_PRESETS.map((preset) => (
          <Pressable
            key={preset.id}
            accessibilityRole="button"
            accessibilityLabel={`${preset.title}. ${preset.blurb}`}
            onPress={() => onPick(preset.id)}
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: pressed ? colors.secondaryContainer : colors.surfaceContainerLow,
                borderColor: colors.outlineVariant,
                borderRadius: shape.medium,
              },
            ]}
          >
            <View style={styles.cardHeader}>
              <Text style={[type.titleSmall, { color: colors.onSurface }]}>{preset.title}</Text>
              <Icon name="arrowRight" size={12} color={colors.onSurfaceVariant} weight="bold" />
            </View>
            <Text style={[type.bodySmall, styles.blurb, { color: colors.onSurfaceVariant }]}>
              {preset.blurb}
            </Text>
            <View style={styles.shape} accessibilityElementsHidden>
              {preset.nodes.map((node) => (
                <View
                  key={node.key}
                  style={[
                    styles.node,
                    {
                      backgroundColor:
                        node.role === 'origin'
                          ? colors.primary
                          : node.role === 'destination'
                            ? colors.tertiary
                            : node.role === 'junction'
                              ? colors.secondary
                              : colors.surfaceContainerHighest,
                    },
                  ]}
                />
              ))}
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
        A pattern only sets the shape. You name the places and set the times.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'transparent',
  },
  row: {
    gap: 8,
    paddingRight: 4,
  },
  card: {
    width: 168,
    padding: 12,
    gap: 4,
    borderWidth: 1,
    minHeight: 96,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  blurb: {
    flex: 1,
  },
  shape: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
  },
  node: {
    width: 14,
    height: 6,
    borderRadius: 3,
  },
});
