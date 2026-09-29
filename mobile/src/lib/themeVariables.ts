/**
 * Syncs the MD3 colour tokens into CSS custom properties.
 *
 * NativeWind v5 resolves theme values through CSS variables. Because Reach
 * already has a canonical `M3ColorScheme` in TypeScript, we publish those
 * values into the same variable names the `@theme` block in `global.css`
 * references. One source of truth, and `className="bg-surface"` follows the
 * theme automatically.
 */
import { type M3ColorScheme } from '@/src/constants/theme';

/** Maps scheme keys to their CSS variable names. */
const VARIABLE_NAMES: Readonly<Record<keyof M3ColorScheme, string>> = {
  primary: '--reach-primary',
  onPrimary: '--reach-on-primary',
  primaryContainer: '--reach-primary-container',
  onPrimaryContainer: '--reach-on-primary-container',
  secondary: '--reach-secondary',
  onSecondary: '--reach-on-secondary',
  secondaryContainer: '--reach-secondary-container',
  onSecondaryContainer: '--reach-on-secondary-container',
  tertiary: '--reach-tertiary',
  onTertiary: '--reach-on-tertiary',
  tertiaryContainer: '--reach-tertiary-container',
  onTertiaryContainer: '--reach-on-tertiary-container',
  error: '--reach-error',
  onError: '--reach-on-error',
  errorContainer: '--reach-error-container',
  onErrorContainer: '--reach-on-error-container',
  success: '--reach-success',
  onSuccess: '--reach-on-success',
  successContainer: '--reach-success-container',
  onSuccessContainer: '--reach-on-success-container',
  warning: '--reach-warning',
  onWarning: '--reach-on-warning',
  warningContainer: '--reach-warning-container',
  onWarningContainer: '--reach-on-warning-container',
  background: '--reach-background',
  onBackground: '--reach-on-background',
  surface: '--reach-surface',
  onSurface: '--reach-on-surface',
  surfaceVariant: '--reach-surface-variant',
  onSurfaceVariant: '--reach-on-surface-variant',
  surfaceDim: '--reach-surface-dim',
  surfaceBright: '--reach-surface-bright',
  surfaceContainerLowest: '--reach-surface-container-lowest',
  surfaceContainerLow: '--reach-surface-container-low',
  surfaceContainer: '--reach-surface-container',
  surfaceContainerHigh: '--reach-surface-container-high',
  surfaceContainerHighest: '--reach-surface-container-highest',
  outline: '--reach-outline',
  outlineVariant: '--reach-outline-variant',
  inverseSurface: '--reach-inverse-surface',
  inverseOnSurface: '--reach-inverse-on-surface',
  inversePrimary: '--reach-inverse-primary',
  scrim: '--reach-scrim',
  shadow: '--reach-shadow',
  elevationTint: '--reach-elevation-tint',
  modeWalk: '--reach-mode-walk',
  modeBus: '--reach-mode-bus',
  modeMetro: '--reach-mode-metro',
  modeTrain: '--reach-mode-train',
  modeAuto: '--reach-mode-auto',
  modeBike: '--reach-mode-bike',
  modeCab: '--reach-mode-cab',
};

/**
 * Writes the active scheme's tokens to the document root.
 *
 * Safe to call on every render; the diff is small and the browser/RN style
 * engine ignores unchanged values.
 */
export function applyThemeVariables(colors: M3ColorScheme): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  for (const key of Object.keys(VARIABLE_NAMES) as (keyof M3ColorScheme)[]) {
    const value = colors[key];
    const name = VARIABLE_NAMES[key];
    if (typeof value === 'string') {
      root.style.setProperty(name, value);
    } else {
      root.style.removeProperty(name);
    }
  }
  root.style.setProperty('--reach-elevation-tint', colors.elevationTint[1] ?? 'transparent');
}

/** The variable name for a scheme key, for tests and debugging. */
export function variableNameFor(key: keyof M3ColorScheme): string {
  return VARIABLE_NAMES[key];
}
