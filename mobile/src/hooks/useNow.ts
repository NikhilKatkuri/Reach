import { useEffect, useState } from 'react';

/**
 * Provides a timestamp that advances once a minute.
 *
 * The Today screen needs the current time to keep elapsed durations and the
 * leave-by countdown honest, but reading the clock during render is an impure
 * operation and React will not allow it. The value is therefore captured once
 * in a lazy state initialiser — which React treats as a one-off — and then
 * refreshed on an interval.
 *
 * Callers get a value that is stable within a render pass, so passing it down
 * as a prop does not defeat memoisation.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
