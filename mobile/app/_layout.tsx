import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import '@/global.css';
import { AppProviders } from '@/src/store/AppProviders';
import { StatusBar } from '@/src/components/ui';
import { configureNotifications } from '@/src/services/notifications';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    'GoogleSans-Regular': require('../assets/fonts/GoogleSans-Regular.ttf'),
    'GoogleSans-Medium': require('../assets/fonts/GoogleSans-Medium.ttf'),
    'GoogleSans-SemiBold': require('../assets/fonts/GoogleSans-SemiBold.ttf'),
    'GoogleSans-Bold': require('../assets/fonts/GoogleSans-Bold.ttf'),
    'GoogleSansCode-Medium': require('../assets/fonts/GoogleSansCode-Medium.ttf'),
  });

  useEffect(() => {
    configureNotifications();
  }, []);

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      void SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <AppProviders>
      {/* Inside AppProviders so it can read the theme; a themed status bar is
          the difference between "finished" and "a demo". */}
      <StatusBar />
      <RootLayoutNav />
    </AppProviders>
  );
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
