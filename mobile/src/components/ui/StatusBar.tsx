/**
 * Theme-aware native status bar.
 *
 * React Native does not style the status bar for you, and getting it wrong is
 * the single most visible way an app looks unfinished: dark icons on a dark
 * header in light mode, or light icons on a light background in dark mode.
 *
 * This reads the active theme, so it stays correct when the user flips
 * light/dark or the system appearance changes — no screen has to think about
 * it. Mount it once near the root; do not mount it per screen.
 *
 * Notes on the platform behaviour, since the API is deliberately narrow:
 *
 *  - SDK 57's `expo-status-bar` exposes only `style`, `hidden` and animation
 *    options. The old `backgroundColor` / `translucent` props are gone because
 *    Android 15 draws edge to edge and the bar is transparent by default, so
 *    there is no colour left to set. The app's own surface colour shows
 *    through instead, which is the correct look.
 *  - `animated` matters more than it looks: without it, flipping the theme
 *    snaps the bar icons with no transition, which reads as a glitch.
 */
import { StatusBar as ExpoStatusBar, type StatusBarStyle } from 'expo-status-bar';
import { useTheme } from '@/src/store/theme';

/** Content styles this component accepts, plus `auto`. */
export type StatusBarContentStyle = 'auto' | 'light' | 'dark';

/** Props for {@link StatusBar}. */
export interface StatusBarProps {
  /**
   * Overrides the automatic content style.
   *
   * `'auto'` follows the app theme. Force `'light'` for a permanently dark
   * header, or `'dark'` for a permanently light one.
   */
  readonly style?: StatusBarContentStyle;
  /** Hides the bar, e.g. on an immersive screen. */
  readonly hidden?: boolean;
  /** Animates style and visibility changes. Defaults to true. */
  readonly animated?: boolean;
}

/** Renders the native status bar, styled from the active theme. */
export function StatusBar({ style = 'auto', hidden = false, animated = true }: StatusBarProps) {
  const { scheme } = useTheme();

  // `'dark'` means "dark icons", which is what a light background needs.
  const resolved: StatusBarStyle =
    style === 'auto' ? (scheme === 'dark' ? 'light' : 'dark') : style;

  return <ExpoStatusBar style={resolved} hidden={hidden} animated={animated} />;
}
