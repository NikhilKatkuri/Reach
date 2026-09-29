/** Settings hook. */
import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loadSettings, saveSetting } from '@/src/services/settings';
import { DEFAULT_SETTINGS, type AppSettings } from '@/src/constants/settings';
import { queryKeys } from '@/src/store/queryClient';

/** Reads all app settings, applying defaults for anything unset. */
export function useSettings() {
  const query = useQuery({
    queryKey: queryKeys.settings.all,
    queryFn: loadSettings,
    staleTime: 5 * 60_000,
  });

  return {
    settings: query.data ?? DEFAULT_SETTINGS,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
  };
}

/**
 * Returns a setter for one setting.
 *
 * The mutation writes through to SQLite and invalidates the settings query,
 * so every consumer re-renders with the new value. There is no optimistic
 * update because reads are already cached and the write is sub-millisecond.
 */
export function useSettingMutation() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { key: keyof AppSettings; value: unknown }>({
    mutationFn: async ({ key, value }) => {
      await saveSetting(key, value as never);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.settings.all });
    },
  });
}

/**
 * Returns a setter for one setting.
 *
 * The mutation writes through to SQLite and invalidates the settings query,
 * so every consumer re-renders with the new value. There is no optimistic
 * update because reads are already cached and the write is sub-millisecond.
 */
export function useSetSetting() {
  const mutation = useSettingMutation();

  return useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      mutation.mutate({ key, value });
    },
    [mutation],
  );
}
