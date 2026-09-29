/**
 * ScreenList: a screen whose body is a virtualised list.
 *
 * `ScreenContainer` wraps its content in a `ScrollView`, which is right for
 * chart dashboards and wrong for lists: putting a `FlatList` inside a
 * `ScrollView` of the same orientation breaks windowing, so every row is
 * mounted at once and a long history becomes a memory and scroll-position
 * problem. React Native logs this as a `VirtualizedList` nesting error.
 *
 * This is the correct composition instead — the list is the scroll container,
 * and the page header and sticky footer are handed to it as
 * `ListHeaderComponent` / `ListFooterComponent` so they still scroll and
 * render exactly once.
 */
import { type ReactElement, type ReactNode } from 'react';
import { FlatList, StyleSheet, Text, View, type ListRenderItem } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/src/store/theme';
import { EmptyState } from './EmptyState';
import { type IconName } from './Icon';

/** Props for {@link ScreenList}. */
export interface ScreenListProps<ItemT> {
  readonly title: string;
  readonly eyebrow?: string;
  readonly subtitle?: string;

  /** Sticky footer, rendered after the list with safe-area padding. */
  readonly footer?: ReactNode;

  readonly data: readonly ItemT[];
  readonly keyExtractor: (item: ItemT) => string;
  readonly renderItem: ListRenderItem<ItemT>;

  /** Replaces the default "nothing here" state. */
  readonly emptyIcon?: IconName;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
  readonly emptyActionLabel?: string;
  readonly onEmptyAction?: () => void;

  /** Content rendered above the first row, below the page header. */
  readonly listHeader?: ReactNode;
  /** Content rendered after the last row. */
  readonly listFooter?: ReactNode;

  /** Hides the built-in empty state, e.g. while `data` is still loading. */
  readonly isLoading?: boolean;

  readonly onEndReached?: () => void;
  readonly onEndReachedThreshold?: number;
  readonly refreshing?: boolean;
  readonly onRefresh?: () => void;

  readonly applyTopInset?: boolean;
  readonly testID?: string;
}

/**
 * A screen whose body is a `FlatList`.
 *
 * Generic over the row type so `renderItem` and `keyExtractor` stay typed
 * without a cast at the call site.
 */
export function ScreenList<ItemT>({
  title,
  eyebrow,
  subtitle,
  footer,
  data,
  keyExtractor,
  renderItem,
  emptyIcon = 'stack',
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyActionLabel,
  onEmptyAction,
  listHeader,
  listFooter,
  isLoading = false,
  onEndReached,
  onEndReachedThreshold = 0.4,
  refreshing = false,
  onRefresh,
  applyTopInset = false,
  testID,
}: ScreenListProps<ItemT>): ReactElement {
  const { colors, type } = useTheme();
  const insets = useSafeAreaInsets();

  const hasHeader = eyebrow !== undefined || title.length > 0 || subtitle !== undefined;

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.background,
          paddingTop: applyTopInset ? insets.top : 0,
        },
      ]}
      testID={testID}
    >
      <FlatList
        data={data}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + (footer !== undefined ? 108 : 32) },
        ]}
        ItemSeparatorComponent={ListSeparator}
        ListHeaderComponent={
          <View>
            {hasHeader ? (
              <View style={styles.header}>
                {eyebrow !== undefined ? (
                  <Text style={[type.labelMedium, { color: colors.primary }]}>{eyebrow}</Text>
                ) : null}
                <Text
                  accessibilityRole="header"
                  style={[type.headlineLarge, styles.title, { color: colors.onBackground }]}
                >
                  {title}
                </Text>
                {subtitle !== undefined ? (
                  <Text style={[type.bodyMedium, { color: colors.onSurfaceVariant }]}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {listHeader}
          </View>
        }
        ListFooterComponent={
          <View>
            {listFooter}
            {/* Keeps the last row clear of the sticky footer. */}
            {data.length > 0 ? <View style={styles.tailSpace} /> : null}
          </View>
        }
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState
              icon={emptyIcon}
              title={emptyTitle}
              description={emptyDescription}
              actionLabel={emptyActionLabel}
              onAction={onEmptyAction}
            />
          )
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={onEndReachedThreshold}
        refreshing={refreshing}
        onRefresh={onRefresh}
      />

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
  screen: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  header: {
    paddingTop: 12,
    paddingBottom: 16,
    gap: 4,
  },
  title: {
    letterSpacing: -0.5,
  },
  tailSpace: {
    height: 8,
  },
  separator: {
    height: 12,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

function ListSeparator() {
  return <View style={styles.separator} />;
}
