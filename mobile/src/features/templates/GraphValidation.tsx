/**
 * GraphValidation: the editor's status line and issue list.
 *
 * Turns `GraphValidationIssue[]` into a compact summary plus a list, and owns
 * the decision about what blocks saving. Warnings never block.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/src/store/theme';
import { Icon } from '@/src/components/ui/Icon';
import { type GraphValidationIssue } from '@/src/engine/graph';

/** Props for {@link GraphValidation}. */
export interface GraphValidationProps {
  readonly issues: readonly GraphValidationIssue[];
  /** Tapping an issue focuses the node it concerns. */
  readonly onFocusStop?: (stopId: string) => void;
  /** True when the graph has no issues at all. */
  readonly showSuccess?: boolean;
}

export function GraphValidation({ issues, onFocusStop, showSuccess = true }: GraphValidationProps) {
  const { colors, type, shape } = useTheme();

  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');

  if (issues.length === 0) {
    if (!showSuccess) return null;
    return (
      <View
        style={[
          styles.summary,
          { backgroundColor: colors.successContainer, borderRadius: shape.medium },
        ]}
        accessibilityRole="text"
        accessibilityLabel="Route connected. This commute is ready."
      >
        <Icon name="checkCircle" size={18} color={colors.onSuccessContainer} weight="fill" />
        <Text style={[type.bodyMedium, { color: colors.onSuccessContainer }]}>Route connected</Text>
      </View>
    );
  }

  return (
    <View style={styles.container} accessibilityRole="summary">
      <View
        style={[
          styles.summary,
          {
            backgroundColor: errors.length > 0 ? colors.errorContainer : colors.tertiaryContainer,
            borderRadius: shape.medium,
          },
        ]}
      >
        <Icon
          name={errors.length > 0 ? 'warning' : 'info'}
          size={18}
          color={errors.length > 0 ? colors.onErrorContainer : colors.onTertiaryContainer}
          weight="fill"
        />
        <Text
          style={[
            type.bodyMedium,
            { color: errors.length > 0 ? colors.onErrorContainer : colors.onTertiaryContainer },
          ]}
        >
          {errors.length > 0
            ? `${errors.length} ${errors.length === 1 ? 'problem' : 'problems'} to fix`
            : `${warnings.length} ${warnings.length === 1 ? 'suggestion' : 'suggestions'}`}
        </Text>
      </View>

      <View style={styles.list}>
        {issues.map((issue) => (
          <IssueRow
            key={`${issue.code}-${issue.message}`}
            issue={issue}
            onFocusStop={onFocusStop}
          />
        ))}
      </View>
    </View>
  );
}

function IssueRow({
  issue,
  onFocusStop,
}: {
  readonly issue: GraphValidationIssue;
  readonly onFocusStop: ((stopId: string) => void) | undefined;
}) {
  const { colors, type, shape } = useTheme();
  const isError = issue.severity === 'error';
  const tint = isError ? colors.error : colors.onSurfaceVariant;

  // Only offer "Fix" when there is a single node to jump to; a multi-node
  // issue has no obvious focus and a dead button is worse than none.
  const focusable = onFocusStop !== undefined && issue.stopIds.length === 1;
  const target = issue.stopIds[0];

  return (
    <View
      style={[
        styles.issueRow,
        { backgroundColor: colors.surfaceContainerLow, borderRadius: shape.small },
      ]}
    >
      <Icon name={isError ? 'warning' : 'info'} size={14} color={tint} />
      <Text style={[type.bodySmall, styles.issueText, { color: tint }]}>{issue.message}</Text>

      {focusable ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Fix: ${issue.message}`}
          onPress={() => onFocusStop?.(target as string)}
          style={styles.fixButton}
          hitSlop={8}
        >
          <Text style={[type.labelMedium, { color: colors.primary }]}>Fix</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  list: {
    gap: 6,
  },
  issueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  issueText: {
    flex: 1,
  },
  fixButton: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
});
