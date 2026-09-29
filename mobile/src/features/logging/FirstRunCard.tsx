/**
 * First-run state for the Today screen.
 *
 * With no seed data, this is the first thing a new user ever sees, so it has
 * to do a job rather than apologise: explain what Reach is for in one line,
 * show the concrete output it will produce, and make the single next action
 * unmissable.
 *
 * It deliberately does not teach the whole app. One action, one screen.
 */
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/src/store/theme';
import { Button, Card, Icon, type IconName } from '@/src/components/ui';

/** One line explaining what Reach does. */
const STEPS: readonly { icon: IconName; text: string }[] = [
  {
    icon: 'mapPin',
    text: 'Describe your commute once: the stops, and how you travel between them.',
  },
  { icon: 'stack', text: 'Log each trip with a tap. No typing, ever.' },
  {
    icon: 'target',
    text: 'Get a leave-by time that accounts for rain, traffic and how you actually travel.',
  },
];

/**
 * The shape of a recommendation, with no values.
 *
 * An earlier version of this card showed a worked example — a real-looking
 * route, a 92% probability, times for a specific morning. That was invented
 * data presented in the same visual style as a genuine recommendation, which
 * is the one thing this app must never do: a user who trusts a fabricated 92%
 * is trusting a number that has no connection to their commute. Naming the
 * fields and leaving the values blank teaches the same thing honestly.
 */
const PREVIEW_FIELDS: readonly { label: string; emphasis?: boolean }[] = [
  { label: 'Leave by', emphasis: true },
  { label: 'Arrive by' },
  { label: 'On time' },
];

/** Props for {@link FirstRunCard}. */
export interface FirstRunCardProps {
  readonly onCreateTemplate: () => void;
}

/** Shown on Today when no template exists yet. */
export function FirstRunCard({ onCreateTemplate }: FirstRunCardProps) {
  const { colors, type, shape } = useTheme();

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <View
          style={[
            styles.badge,
            { backgroundColor: colors.primaryContainer, borderRadius: shape.large },
          ]}
        >
          <Icon name="target" size={22} color={colors.onPrimaryContainer} weight="fill" />
        </View>
        <View style={styles.headerText}>
          <Text style={[type.titleLarge, { color: colors.onSurface }]}>
            Arrive on time, not just quickly
          </Text>
          <Text style={[type.bodyMedium, { color: colors.onSurfaceVariant }]}>
            Reach learns from your own commute history and recommends the route least likely to make
            you late.
          </Text>
        </View>
      </View>

      {/* The shape of the output, with the values deliberately blank. */}
      <View
        style={[
          styles.example,
          { backgroundColor: colors.surfaceContainer, borderRadius: shape.medium },
        ]}
      >
        <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>
          Every recommendation, once you have your own history
        </Text>
        <View style={styles.exampleRow}>
          {PREVIEW_FIELDS.map((field) => (
            <ExampleStat key={field.label} label={field.label} emphasis={field.emphasis} />
          ))}
        </View>
        <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>
          {'Leave by is the P90 of your real trips, plus buffer — not the average, ' +
            'which would leave you late half the time.'}
        </Text>
      </View>

      <View style={styles.steps}>
        {STEPS.map((step, index) => (
          <View key={step.icon} style={styles.step}>
            <View
              style={[
                styles.stepIndex,
                { backgroundColor: colors.secondaryContainer, borderRadius: shape.full },
              ]}
            >
              <Text style={[type.labelMedium, { color: colors.onSecondaryContainer }]}>
                {index + 1}
              </Text>
            </View>
            <Text style={[type.bodyMedium, styles.stepText, { color: colors.onSurfaceVariant }]}>
              {step.text}
            </Text>
          </View>
        ))}
      </View>

      <Button
        label="Create your commute"
        icon="plus"
        size="large"
        fullWidth
        onPress={onCreateTemplate}
        accessibilityHint="Starts building your first commute template"
      />
    </Card>
  );
}

function ExampleStat({
  label,
  emphasis = false,
}: {
  readonly label: string;
  readonly emphasis?: boolean;
}) {
  const { colors, type, shape } = useTheme();
  return (
    <View style={styles.exampleStat}>
      <Text style={[type.labelSmall, { color: colors.onSurfaceVariant }]}>{label}</Text>
      {/* Placeholder, not a value. Dashed and empty, so it reads as
          "not calculated yet" rather than as a real number. */}
      <View
        style={[
          styles.placeholder,
          { borderColor: colors.outlineVariant, borderRadius: shape.extraSmall },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 20,
  },
  headerRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  badge: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  example: {
    padding: 14,
    gap: 10,
  },
  exampleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  exampleStat: {
    gap: 2,
  },
  placeholder: {
    width: 56,
    height: 22,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginTop: 3,
  },
  steps: {
    gap: 12,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepIndex: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
  },
});
