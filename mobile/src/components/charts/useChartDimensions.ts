/** Measures a chart's available width. */
import { useEffect, useState } from 'react';
import { type LayoutChangeEvent } from 'react-native';

/** Fallback width before layout runs, so the first paint is not zero-width. */
const FALLBACK_WIDTH = 320;

/** Result of {@link useChartDimensions}. */
export interface ChartDimensions {
  /** Usable width in dp. */
  readonly width: number;
  /** False until the first layout pass, so callers can skip rendering. */
  readonly measured: boolean;
}

/**
 * Reports a view's measured width.
 *
 * SVG needs an explicit width, and charts inside a scroll view can be
 * measured late. Returning `measured: false` on the first pass avoids
 * flashing an empty chart at the wrong size.
 */
export function useChartDimensions(): ChartDimensions & {
  readonly onLayout: (event: LayoutChangeEvent) => void;
} {
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  const [measured, setMeasured] = useState(false);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next > 0) {
      setWidth(next);
      setMeasured(true);
    }
  };

  useEffect(() => {
    // Nothing to do; the hook is purely measurement-driven.
  }, []);

  return { width, measured, onLayout };
}
