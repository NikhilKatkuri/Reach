import { Stack } from 'expo-router';

/** Per-tab stack. NativeTabs does not render headers, so each tab provides its own. */
export default function TabStack() {
  return (
    <Stack
      screenOptions={{
        headerLargeTitleEnabled: true,
        headerShadowVisible: false,
        headerShown: false,
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
