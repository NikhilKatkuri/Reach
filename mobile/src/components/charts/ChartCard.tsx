/** Chart card: a titled container for a chart with an optional caption. */
import { type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/src/store/theme';
import { Card } from '@/src/components/ui/Card';

/** Props for {@link ChartCard}. */
export interface ChartCardProps {
  readonly title: string;
  readonly caption?: string;
  readonly children: ReactNode;
  /** Action rendered on the right of the header, e.g. a range selector. */
  readonly trailing?: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/** A titled card wrapping a chart. */
export function ChartCard({ title, caption, children, trailing, style, testID }: ChartCardProps) {
  const { colors, type } = useTheme();

  return (
    <Card style={style} testID={testID}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[type.titleMedium, { color: colors.onSurface }]}>{title}</Text>
          {caption !== undefined ? (
            <Text style={[type.bodySmall, { color: colors.onSurfaceVariant }]}>{caption}</Text>
          ) : null}
        </View>
        {trailing}
      </View>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
});
