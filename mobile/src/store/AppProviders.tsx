/** Root provider stack: database, query client, theme and settings. */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { useColorScheme, Text, View } from 'react-native';
import { getDatabase } from '@/src/db/database';
import { createQueryClient } from '@/src/store/queryClient';
import { ThemeProvider } from '@/src/store/theme';
import { useSettings } from '@/src/hooks/useSettings';
import { applyThemeVariables } from '@/src/lib/themeVariables';
import { getColorScheme } from '@/src/constants/theme';

/** Props for {@link AppProviders}. */
export interface AppProvidersProps {
  readonly children: ReactNode;
}

/**
 * Wraps the app in the providers it needs, in dependency order.
 *
 * 1. The database is opened and migrated, so no screen has to handle a cold
 *    start. A fresh install is intentionally empty.
 * 2. The query client backs every read.
 * 3. The theme resolves the colour scheme and publishes CSS variables for
 *    NativeWind, then supplies typed tokens to components.
 *
 * Nothing renders until step 1 completes, which avoids a flash of empty
 * state on a cold launch.
 */
export function AppProviders({ children }: AppProvidersProps) {
  const [client] = useState(createQueryClient);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        // Reach starts empty on purpose: every statistic it shows has to come
        // from the user's own history, so there is nothing to seed.
        await getDatabase();
        if (!cancelled) setState('ready');
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
        setState('failed');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const content = useMemo(() => {
    if (state === 'loading') return null;
    if (state === 'failed') return <BootstrapError message={errorMessage ?? 'Unknown error'} />;
    return <ThemedProviders>{children}</ThemedProviders>;
  }, [state, errorMessage, children]);

  return <QueryClientProvider client={client}>{content}</QueryClientProvider>;
}

/** Resolves the theme from settings and publishes CSS variables. */
function ThemedProviders({ children }: { readonly children: ReactNode }) {
  const { settings } = useSettings();
  const systemScheme = useColorScheme();

  const resolvedScheme =
    settings.theme === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : settings.theme;

  useEffect(() => {
    applyThemeVariables(getColorScheme(resolvedScheme));
  }, [resolvedScheme]);

  return (
    <ThemeProvider preference={settings.theme} reducedMotion={settings.reducedMotion}>
      {children}
    </ThemeProvider>
  );
}

/** Full-screen failure state, shown when the database cannot be opened. */
function BootstrapError({ message }: { readonly message: string }) {
  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`Reach could not start. ${message}`}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}
    >
      <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8 }}>
        Reach could not start
      </Text>
      <Text style={{ fontSize: 14, opacity: 0.7, textAlign: 'center' }}>{message}</Text>
    </View>
  );
}
