/**
 * Material Design 3 colour roles.
 *
 * Tokens are named after the MD3 role they fill, never after a colour
 * appearance, so a component that uses `surfaceContainerHigh` is correct in
 * both light and dark without a single conditional.
 *
 * The palette is generated from a single seed (a blue-green, the Reach brand
 * colour) using the Material tonal-palette algorithm, so the ramps are
 * perceptually even rather than hand-picked hex values. `primary` targets
 * tone 40 in light and 80 in dark, per the MD3 baseline scheme.
 */

/** MD3 colour roles used by the app. */
export interface M3ColorScheme {
  readonly primary: string;
  readonly onPrimary: string;
  readonly primaryContainer: string;
  readonly onPrimaryContainer: string;

  readonly secondary: string;
  readonly onSecondary: string;
  readonly secondaryContainer: string;
  readonly onSecondaryContainer: string;

  readonly tertiary: string;
  readonly onTertiary: string;
  readonly tertiaryContainer: string;
  readonly onTertiaryContainer: string;

  readonly error: string;
  readonly onError: string;
  readonly errorContainer: string;
  readonly onErrorContainer: string;

  readonly success: string;
  readonly onSuccess: string;
  readonly successContainer: string;
  readonly onSuccessContainer: string;

  readonly warning: string;
  readonly onWarning: string;
  readonly warningContainer: string;
  readonly onWarningContainer: string;

  readonly background: string;
  readonly onBackground: string;
  readonly surface: string;
  readonly onSurface: string;
  readonly surfaceVariant: string;
  readonly onSurfaceVariant: string;

  readonly surfaceDim: string;
  readonly surfaceBright: string;
  readonly surfaceContainerLowest: string;
  readonly surfaceContainerLow: string;
  readonly surfaceContainer: string;
  readonly surfaceContainerHigh: string;
  readonly surfaceContainerHighest: string;

  readonly outline: string;
  readonly outlineVariant: string;
  readonly inverseSurface: string;
  readonly inverseOnSurface: string;
  readonly inversePrimary: string;

  readonly scrim: string;
  readonly shadow: string;

  /** Elevation tint levels, 0..5. */
  readonly elevationTint: readonly string[];

  /** Per-mode accent colours for transport segments. */
  readonly modeWalk: string;
  readonly modeBus: string;
  readonly modeMetro: string;
  readonly modeTrain: string;
  readonly modeAuto: string;
  readonly modeBike: string;
  readonly modeCab: string;
}

/** MD3 type scale. Sizes in sp, weights per the MD3 type-scale spec. */
export interface M3TypeScale {
  readonly displayLarge: M3TextStyle;
  readonly displayMedium: M3TextStyle;
  readonly displaySmall: M3TextStyle;
  readonly headlineLarge: M3TextStyle;
  readonly headlineMedium: M3TextStyle;
  readonly headlineSmall: M3TextStyle;
  readonly titleLarge: M3TextStyle;
  readonly titleMedium: M3TextStyle;
  readonly titleSmall: M3TextStyle;
  readonly bodyLarge: M3TextStyle;
  readonly bodyMedium: M3TextStyle;
  readonly bodySmall: M3TextStyle;
  readonly labelLarge: M3TextStyle;
  readonly labelMedium: M3TextStyle;
  readonly labelSmall: M3TextStyle;
}

/** A single entry in the MD3 type scale. */
export interface M3TextStyle {
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly fontWeight: '400' | '500' | '600' | '700';
  readonly letterSpacing: number;
  /**
   * Whether this role uses the display cut of the face.
   *
   * Named `useDisplay` rather than `display` because `display` collides with
   * the React Native `display` layout property when these tokens are spread
   * into a `TextStyle`.
   */
  readonly useDisplay: boolean;
}

/** MD3 shape scale, in dp. */
export const SHAPE = {
  none: 0,
  extraSmall: 4,
  small: 8,
  medium: 12,
  large: 16,
  extraLarge: 28,
  full: 9999,
} as const;

/** Minimum touch target per the Material accessibility guidelines (dp). */
export const MIN_TOUCH_TARGET = 48;

/**
 * The MD3 baseline type scale.
 *
 * `display` roles request the display cut of Google Sans, which has tighter
 * tracking and is the face Google's own products use for large numerals.
 */
export const TYPE_SCALE: M3TypeScale = {
  displayLarge: {
    fontSize: 57,
    lineHeight: 64,
    fontWeight: '400',
    letterSpacing: -0.25,
    useDisplay: true,
  },
  displayMedium: {
    fontSize: 45,
    lineHeight: 52,
    fontWeight: '400',
    letterSpacing: 0,
    useDisplay: true,
  },
  displaySmall: {
    fontSize: 36,
    lineHeight: 44,
    fontWeight: '400',
    letterSpacing: 0,
    useDisplay: true,
  },
  headlineLarge: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '400',
    letterSpacing: 0,
    useDisplay: false,
  },
  headlineMedium: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '400',
    letterSpacing: 0,
    useDisplay: false,
  },
  headlineSmall: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '400',
    letterSpacing: 0,
    useDisplay: false,
  },
  titleLarge: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '500',
    letterSpacing: 0,
    useDisplay: false,
  },
  titleMedium: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
    letterSpacing: 0.15,
    useDisplay: false,
  },
  titleSmall: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    letterSpacing: 0.1,
    useDisplay: false,
  },
  bodyLarge: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
    letterSpacing: 0.5,
    useDisplay: false,
  },
  bodyMedium: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    letterSpacing: 0.25,
    useDisplay: false,
  },
  bodySmall: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
    letterSpacing: 0.4,
    useDisplay: false,
  },
  labelLarge: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    letterSpacing: 0.1,
    useDisplay: false,
  },
  labelMedium: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: 0.5,
    useDisplay: false,
  },
  labelSmall: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: 0.5,
    useDisplay: false,
  },
};

/** Light scheme, baseline MD3 with the Reach blue-green seed. */
export const lightColors: M3ColorScheme = {
  primary: '#00639B',
  onPrimary: '#FFFFFF',
  primaryContainer: '#CFE5FF',
  onPrimaryContainer: '#001D33',

  secondary: '#51606F',
  onSecondary: '#FFFFFF',
  secondaryContainer: '#D4E4F6',
  onSecondaryContainer: '#0D1D2A',

  tertiary: '#6A5778',
  onTertiary: '#FFFFFF',
  tertiaryContainer: '#F2DAFF',
  onTertiaryContainer: '#251431',

  error: '#BA1A1A',
  onError: '#FFFFFF',
  errorContainer: '#FFDAD6',
  onErrorContainer: '#410002',

  success: '#146C2E',
  onSuccess: '#FFFFFF',
  successContainer: '#A6F4B5',
  onSuccessContainer: '#002109',

  warning: '#8B5000',
  onWarning: '#FFFFFF',
  warningContainer: '#FFDDB6',
  onWarningContainer: '#2C1600',

  background: '#FDFCFF',
  onBackground: '#1A1C1E',
  surface: '#FDFCFF',
  onSurface: '#1A1C1E',
  surfaceVariant: '#DEE3EA',
  onSurfaceVariant: '#42474E',

  surfaceDim: '#D8DBE0',
  surfaceBright: '#FDFCFF',
  surfaceContainerLowest: '#FFFFFF',
  surfaceContainerLow: '#F7F9FC',
  surfaceContainer: '#F1F4F8',
  surfaceContainerHigh: '#EBEEF3',
  surfaceContainerHighest: '#E5E8ED',

  outline: '#72777F',
  outlineVariant: '#C2C7CF',
  inverseSurface: '#2F3033',
  inverseOnSurface: '#F1F0F4',
  inversePrimary: '#99CBFF',

  scrim: '#000000',
  shadow: '#000000',
  elevationTint: [
    'rgba(0, 0, 0, 0.00)',
    'rgba(0, 0, 0, 0.05)',
    'rgba(0, 0, 0, 0.08)',
    'rgba(0, 0, 0, 0.11)',
    'rgba(0, 0, 0, 0.14)',
    'rgba(0, 0, 0, 0.17)',
  ],

  modeWalk: '#4F6B5A',
  modeBus: '#00639B',
  modeMetro: '#7B4397',
  modeTrain: '#8B5000',
  modeAuto: '#B3261E',
  modeBike: '#00696E',
  modeCab: '#5B5F6B',
};

/** Dark scheme, generated from the same seed at MD3 dark tonal targets. */
export const darkColors: M3ColorScheme = {
  primary: '#99CBFF',
  onPrimary: '#003354',
  primaryContainer: '#004A77',
  onPrimaryContainer: '#CFE5FF',

  secondary: '#B8C8DA',
  onSecondary: '#233240',
  secondaryContainer: '#394857',
  onSecondaryContainer: '#D4E4F6',

  tertiary: '#D6BEE4',
  onTertiary: '#3B2948',
  tertiaryContainer: '#523F5F',
  onTertiaryContainer: '#F2DAFF',

  error: '#FFB4AB',
  onError: '#690005',
  errorContainer: '#93000A',
  onErrorContainer: '#FFDAD6',

  success: '#8BD89D',
  onSuccess: '#003914',
  successContainer: '#005220',
  onSuccessContainer: '#A6F4B5',

  warning: '#FFB871',
  onWarning: '#4A2800',
  warningContainer: '#6A3B00',
  onWarningContainer: '#FFDDB6',

  background: '#1A1C1E',
  onBackground: '#E2E2E6',
  surface: '#111416',
  onSurface: '#E2E2E6',
  surfaceVariant: '#42474E',
  onSurfaceVariant: '#C2C7CF',

  surfaceDim: '#1A1C1E',
  surfaceBright: '#343538',
  surfaceContainerLowest: '#0C0E10',
  surfaceContainerLow: '#1A1C1E',
  surfaceContainer: '#1E2022',
  surfaceContainerHigh: '#282A2D',
  surfaceContainerHighest: '#333538',

  outline: '#8C9199',
  outlineVariant: '#42474E',
  inverseSurface: '#E2E2E6',
  inverseOnSurface: '#2F3033',
  inversePrimary: '#00639B',

  scrim: '#000000',
  shadow: '#000000',
  elevationTint: [
    'rgba(0, 0, 0, 0.00)',
    'rgba(255, 255, 255, 0.05)',
    'rgba(255, 255, 255, 0.08)',
    'rgba(255, 255, 255, 0.11)',
    'rgba(255, 255, 255, 0.14)',
    'rgba(255, 255, 255, 0.17)',
  ],

  modeWalk: '#B2CCBD',
  modeBus: '#99CBFF',
  modeMetro: '#DCB0E8',
  modeTrain: '#FFB871',
  modeAuto: '#FFB4AB',
  modeBike: '#4FD8E0',
  modeCab: '#C4C7D0',
};

/** The two schemes, keyed for lookup. */
export const COLOR_SCHEMES: Readonly<Record<'light' | 'dark', M3ColorScheme>> = {
  light: lightColors,
  dark: darkColors,
};

/** Returns the colour scheme for a resolved colour scheme. */
export function getColorScheme(scheme: 'light' | 'dark' | null | undefined): M3ColorScheme {
  return scheme === 'dark' ? darkColors : lightColors;
}
