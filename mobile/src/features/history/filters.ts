/** Filter state for the History screen. */
import { useMemo, useState } from 'react';
import { type TripFilters } from '@/src/db/queries';
import { startOfDay, startOfDayOffset } from '@/src/utils/time';

/** Date ranges offered by the filter bar. */
export type DateRange = 'all' | 'today' | 'week' | 'month';

/** On-time filter. */
export type OnTimeFilter = 'all' | 'onTime' | 'late';

/** The user-facing filter selection. */
export interface HistoryFilters {
  readonly range: DateRange;
  readonly templateId: string | null;
  readonly onTime: OnTimeFilter;
  readonly search: string;
}

/** Default filter selection. */
export const DEFAULT_FILTERS: HistoryFilters = {
  range: 'all',
  templateId: null,
  onTime: 'all',
  search: '',
};

/** Page size for the infinite list. */
export const PAGE_SIZE = 25;

/**
 * Translates the UI filter selection into query filters.
 *
 * Kept as a pure function so the mapping is testable and the screen does not
 * have to know how dates are stored.
 */
export function toQueryFilters(filters: HistoryFilters, now: number, offset = 0): TripFilters {
  const result: {
    templateId?: string | null;
    from?: number;
    status?: 'completed' | 'active' | 'abandoned';
    lateOnly?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  } = {
    status: 'completed',
    limit: PAGE_SIZE,
    offset,
  };

  if (filters.templateId !== null) {
    result.templateId = filters.templateId;
  }

  switch (filters.range) {
    case 'today':
      result.from = startOfDay(now);
      break;
    case 'week':
      result.from = startOfDayOffset(now, 7);
      break;
    case 'month':
      result.from = startOfDayOffset(now, 30);
      break;
    case 'all':
      break;
  }

  if (filters.onTime === 'late') {
    result.lateOnly = true;
  }

  if (filters.search.length > 0) {
    result.search = filters.search;
  }

  return result as TripFilters;
}

/** History screen state, with the filter setters. */
export function useHistoryFilters() {
  const [filters, setFilters] = useState<HistoryFilters>(DEFAULT_FILTERS);
  const [now] = useState(() => Date.now());

  const queryFilters = useMemo(() => toQueryFilters(filters, now), [filters, now]);
  const countFilters = useMemo(() => toQueryFilters(filters, now), [filters, now]);

  return {
    filters,
    queryFilters,
    countFilters,
    setRange: (range: DateRange) => setFilters((prev) => ({ ...prev, range })),
    setTemplate: (templateId: string | null) => setFilters((prev) => ({ ...prev, templateId })),
    setOnTime: (onTime: OnTimeFilter) => setFilters((prev) => ({ ...prev, onTime })),
    setSearch: (search: string) => setFilters((prev) => ({ ...prev, search })),
    reset: () => setFilters(DEFAULT_FILTERS),
    /** True when anything is narrowing the list. */
    isFiltered:
      filters.range !== 'all' ||
      filters.templateId !== null ||
      filters.onTime !== 'all' ||
      filters.search.length > 0,
  };
}
