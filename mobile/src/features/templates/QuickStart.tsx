/**
 * QuickStart: the three questions that get a commute started.
 *
 * Deliberately *not* a graph builder. An earlier version asked for a travel
 * mode here and constructed a two-node graph immediately, which meant a user
 * answering the same three questions in a different order got a different
 * editor. There is now one flow — places, then route — and this screen only
 * pre-fills it.
 *
 * It disappears as soon as the user has a graph, so nobody has to learn two
 * things.
 */
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/src/store/theme';
import { Button, Card } from '@/src/components/ui';

/** What the quick start collects, applied to the draft before the editor opens. */
export interface QuickStartResult {
  readonly name: string;
  readonly startName: string;
  readonly destinationName: string;
}

/** Props for {@link QuickStart}. */
export interface QuickStartProps {
  readonly onComplete: (result: QuickStartResult) => void;
}

export function QuickStart({ onComplete }: QuickStartProps) {
  const { colors, type } = useTheme();

  const [name, setName] = useState('');
  const [startName, setStartName] = useState('');
  const [destinationName, setDestinationName] = useState('');

  const canContinue = startName.trim().length > 0 && destinationName.trim().length > 0;
  const trimmedName = name.trim();
  const trimmedStart = startName.trim();
  const trimmedEnd = destinationName.trim();

  return (
    <View style={styles.container}>
      <Card>
        <Text style={[type.titleLarge, { color: colors.onSurface }]}>New commute</Text>
        <Text style={[type.bodyMedium, { color: colors.onSurfaceVariant }]}>
          Three details to start with. You can change all of it afterwards.
        </Text>

        <Field label="What do you call it?">
          <ThemedInput
            value={name}
            onChangeText={setName}
            placeholder="College"
            accessibilityLabel="Commute name"
          />
        </Field>

        <Field label="Where do you start?">
          <ThemedInput
            value={startName}
            onChangeText={setStartName}
            placeholder="Home"
            accessibilityLabel="Where you start"
          />
        </Field>

        <Field label="Where are you going?">
          <ThemedInput
            value={destinationName}
            onChangeText={setDestinationName}
            placeholder="Campus"
            accessibilityLabel="Where you are going"
          />
        </Field>

        <Button
          label="Add the places you pass through"
          icon="arrowRight"
          size="large"
          fullWidth
          disabled={!canContinue}
          onPress={() =>
            onComplete({
              // A generated name beats a blank one, and "Home to Campus" is
              // more use than an empty string in a list.
              name: trimmedName.length > 0 ? trimmedName : `${trimmedStart} to ${trimmedEnd}`,
              startName: trimmedStart,
              destinationName: trimmedEnd,
            })
          }
          accessibilityHint="Opens the builder where you add every place and set how long each part takes"
        />

        {!canContinue ? (
          <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
            Fill in where you start and where you are going.
          </Text>
        ) : null}
      </Card>

      <Text style={[type.bodySmall, styles.note, { color: colors.onSurfaceVariant }]}>
        Next you will add the places in between and say how long each part takes. Reach works out
        the rest.
      </Text>
    </View>
  );
}

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  const { colors, type } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[type.labelMedium, { color: colors.onSurfaceVariant }]}>{label}</Text>
      {children}
    </View>
  );
}

function ThemedInput(props: React.ComponentProps<typeof TextInput>) {
  const { colors, type, shape } = useTheme();
  return (
    <TextInput
      {...props}
      placeholderTextColor={colors.onSurfaceVariant}
      returnKeyType="next"
      style={[
        type.bodyLarge,
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
  container: {
    gap: 12,
  },
  field: {
    gap: 6,
  },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    minHeight: 48,
    textAlignVertical: 'center',
  },
  note: {
    paddingHorizontal: 4,
  },
});
