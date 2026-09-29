import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { ThemeProvider, DarkTheme, DefaultTheme } from 'expo-router/react-navigation';
import { useTheme } from '@/src/store/theme';

/**
 * Bottom tabs.
 *
 * NativeTabs renders the platform's own tab bar: Material 3 bottom
 * navigation on Android, and the iOS tab bar with liquid glass on iOS 26+.
 * Each tab nests its own Stack so headers and large titles are native.
 */
export default function TabsLayout() {
  const { scheme, colors } = useTheme();

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      {/* Tint and background come from the theme rather than a literal, so the
          tab bar tracks light/dark instead of staying blue on a dark bar. */}
      <NativeTabs tintColor={colors.primary} backgroundColor={colors.surfaceContainer}>
        <NativeTabs.Trigger name="(today)">
          <NativeTabs.Trigger.Icon sf="sun.horizon.fill" md="wb_sunny" />
          <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="(history)">
          <NativeTabs.Trigger.Icon sf="clock.arrow.circlepath" md="history" />
          <NativeTabs.Trigger.Label>History</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="(templates)">
          <NativeTabs.Trigger.Icon sf="map" md="map" />
          <NativeTabs.Trigger.Label>Templates</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="(insights)">
          <NativeTabs.Trigger.Icon sf="chart.line.uptrend.xyaxis" md="insights" />
          <NativeTabs.Trigger.Label>Insights</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="(settings)">
          <NativeTabs.Trigger.Icon sf="gearshape" md="settings" />
          <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </ThemeProvider>
  );
}
