/** TanStack Query defaults tuned for a local SQLite database. */
import { QueryClient } from '@tanstack/react-query';

/**
 * Query keys, centralised so cache invalidation cannot drift from reads.
 *
 * `keys.templates.detail(id)` is the only way to build a template key, which
 * guarantees `invalidateQueries` calls match what was registered.
 */
export const queryKeys = {
  templates: {
    all: ['templates'] as const,
    list: () => ['templates', 'list'] as const,
    detail: (templateId: string) => ['templates', 'detail', templateId] as const,
  },
  trips: {
    all: ['trips'] as const,
    list: (filters: readonly unknown[]) => ['trips', 'list', ...filters] as const,
    detail: (tripId: string) => ['trips', 'detail', tripId] as const,
    active: () => ['trips', 'active'] as const,
  },
  insights: {
    all: ['insights'] as const,
    summary: (templateId: string | null, days: number) =>
      ['insights', 'summary', templateId, days] as const,
  },
  settings: {
    all: ['settings'] as const,
  },
} as const;

/**
 * Creates the app's query client.
 *
 * Data is local, so reads are fast and there is no network to be careful
 * about. `staleTime` is long enough that navigating between tabs does not
 * re-query, and invalidation on write keeps things correct.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        retry: 0,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
