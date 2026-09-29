/**
 * ScreenContainer: the standard page shell.
 *
 * Owns the background colour, safe-area handling, scroll behaviour and
 * consistent page padding so no screen has to reimplement them. Supports a
 * large-title header, a subtitle, and an optional sticky footer for the
 * primary action.
 */
import { type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/src/store/theme';

/** Props for {@link ScreenContainer}. */
export interface ScreenContainerProps {
  readonly children: ReactNode;
  /** Large display title, MD3 headlineLarge. */
  readonly title?: string;
  /** Supporting line under the title. */
  readonly subtitle?: string;
  /** Small label above the title, e.g. a date. */
  readonly eyebrow?: string;
  /** Sticks to the bottom, above the safe-area inset. */
  readonly footer?: ReactNode;
  /**
   * Rendered beside the title, e.g. a control that changes what the screen is
   * about. Sized to sit on the title's baseline rather than floating above it.
   */
  readonly headerAction?: ReactNode;
  readonly scrollable?: boolean;
  /** Extra bottom padding for lists, in dp. */
  readonly bottomInset?: number;
  /** Adds the top safe-area inset, for screens with a large title. */
  readonly applyTopInset?: boolean;
  readonly padded?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly contentStyle?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/** The page shell used by every top-level screen. */
export function ScreenContainer({
  children,
  title,
  subtitle,
  eyebrow,
  footer,
  headerAction,
  scrollable = true,
  bottomInset = 0,
  applyTopInset = true,
  padded = true,
  style,
  contentStyle,
  testID,
}: ScreenContainerProps) {
  const { colors, type } = useTheme();
  const insets = useSafeAreaInsets();

  const header =
    title !== undefined || eyebrow !== undefined || subtitle !== undefined ? (
      <View style={styles.header}>
        {eyebrow !== undefined ? (
          <Text style={[type.labelMedium, { color: colors.primary }]}>{eyebrow}</Text>
        ) : null}
        {title !== undefined ? (
          <View style={styles.titleRow}>
            <Text
              accessibilityRole="header"
              style={[type.headlineLarge, styles.title, { color: colors.onBackground }]}
            >
              {title}
            </Text>
            {headerAction}
          </View>
        ) : (
          headerAction
        )}
        {subtitle !== undefined ? (
          <Text style={[type.bodyMedium, { color: colors.onSurfaceVariant }]}>{subtitle}</Text>
        ) : null}
      </View>
    ) : null;

  const body = (
    <View style={[padded && styles.padded, !scrollable && styles.flex, contentStyle]}>
      {children}
    </View>
  );

  const containerStyle = [
    styles.container,
    {
      backgroundColor: colors.background,
      paddingTop: applyTopInset ? insets.top : 0,
    },
    style,
  ];

  return (
    <View style={containerStyle} testID={testID}>
      {scrollable ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: bottomInset + (footer !== undefined ? 96 : 32) },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {header}
          {body}
        </ScrollView>
      ) : (
        <View style={styles.flex}>
          {header}
          {body}
        </View>
      )}

      {footer !== undefined ? (
        <View
          style={[
            styles.footer,
            {
              backgroundColor: colors.surfaceContainer,
              paddingBottom: Math.max(insets.bottom, 12),
              borderTopColor: colors.outlineVariant,
            },
          ]}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 18,
    gap: 4,
  },
  title: {
    letterSpacing: -0.5,
  },
  padded: {
    paddingHorizontal: 20,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
