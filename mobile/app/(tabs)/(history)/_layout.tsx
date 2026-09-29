import { Stack } from 'expo-router';

/** Per-tab stack. NativeTabs does not render headers, so each tab provides its own. */
export default function TabStack() {
  return (
    <Stack
      screenOptions={{
        headerLargeTitleEnabled: true,
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
