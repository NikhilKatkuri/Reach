/**
 * Theme context and hooks.
 *
 * Exposes the MD3 tokens as a single `theme` object. Components never read
 * colours directly from `useColorScheme()` — they read named roles from the
 * theme, which is what makes dark mode automatic and keeps colour choices
 * out of feature code.
 */
import { createContext, createElement, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import {
  type M3ColorScheme,
  type M3TextStyle,
  type M3TypeScale,
  MIN_TOUCH_TARGET,
  SHAPE,
  TYPE_SCALE,
  getColorScheme,
} from '@/src/constants/theme';
import { familyForWeight } from '@/src/constants/fonts';
import { type TextStyle } from 'react-native';

/** Which colour scheme the app is rendering with. */
export type ColorSchemeName = 'light' | 'dark';

/** The MD3 type scale, resolved to React Native `TextStyle`s. */
export type ResolvedTypeScale = { readonly [K in keyof M3TypeScale]: TextStyle };

/** The full theme handed to components. */
export interface Theme {
  readonly scheme: ColorSchemeName;
  readonly colors: M3ColorScheme;
  /**
   * The type scale, pre-resolved to `TextStyle`.
   *
   * Components spread these straight into a `Text`'s `style`, so they never
   * have to strip non-style metadata or call {@link toTextStyle} themselves.
   */
  readonly type: ResolvedTypeScale;
  readonly shape: typeof SHAPE;
  readonly minTouchTarget: number;
  /** `true` when the user has asked for reduced motion. */
  readonly reducedMotion: boolean;
  /** Motion durations in ms, already scaled by the reduced-motion setting. */
  readonly motion: {
    readonly short: number;
    readonly medium: number;
    readonly long: number;
  };
}

/** The user-selectable appearance preference. */
export type ThemePreference = 'system' | 'light' | 'dark';

const ThemeContext = createContext<Theme | null>(null);

/** Standard MD3 motion durations. */
const BASE_MOTION = { short: 150, medium: 250, long: 400 } as const;

/** Resolves the whole MD3 type scale into `TextStyle`s, once per theme. */
function resolveTypeScale(scale: M3TypeScale): ResolvedTypeScale {
  const out = {} as Record<keyof M3TypeScale, TextStyle>;
  for (const key of Object.keys(scale) as (keyof M3TypeScale)[]) {
    out[key] = toTextStyle(scale[key]);
  }
  return out;
}

/** Builds a theme for a scheme, honouring the reduced-motion preference. */
export function createTheme(scheme: ColorSchemeName, reducedMotion: boolean): Theme {
  return {
    scheme,
    colors: getColorScheme(scheme),
    type: resolveTypeScale(TYPE_SCALE),
    shape: SHAPE,
    minTouchTarget: MIN_TOUCH_TARGET,
    reducedMotion,
    motion: reducedMotion ? { short: 0, medium: 0, long: 0 } : { ...BASE_MOTION },
  };
}

/** Props for {@link ThemeProvider}. */
export interface ThemeProviderProps {
  readonly preference: ThemePreference;
  readonly reducedMotion: boolean;
  readonly children: ReactNode;
}

/**
 * Supplies the theme to the tree.
 *
 * `preference` is persisted in settings, so the theme survives a restart and
 * is not coupled to the OS appearance alone.
 */
export function ThemeProvider({ preference, reducedMotion, children }: ThemeProviderProps) {
  const systemScheme = useColorScheme();

  const theme = useMemo(() => {
    const resolved: ColorSchemeName =
      preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;
    return createTheme(resolved, reducedMotion);
  }, [preference, reducedMotion, systemScheme]);

  return createElement(ThemeContext.Provider, { value: theme }, children);
}

/** Reads the current theme. Throws outside a provider, which is a bug. */
export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (theme === null) {
    throw new Error('useTheme must be used inside a ThemeProvider');
  }
  return theme;
}

/** Reads just the colour roles. */
export function useColors(): M3ColorScheme {
  return useTheme().colors;
}

/**
 * Resolves a type-scale role to a `TextStyle`.
 *
 * Only the properties React Native understands are returned, so the result
 * can be spread directly into a `Text`'s `style` array.
 *
 * @param role Key into the MD3 type scale.
 */
export function useTypeStyle(role: keyof M3TypeScale): TextStyle {
  return useTheme().type[role];
}

/**
 * Converts a type-scale entry to a `TextStyle`.
 *
 * Exported separately so components that already read the theme can build
 * styles for several roles without a hook call per style.
 */
export function toTextStyle(entry: M3TextStyle): TextStyle {
  return {
    fontFamily: familyForWeight(entry.fontWeight),
    fontSize: entry.fontSize,
    lineHeight: entry.lineHeight,
    fontWeight: entry.fontWeight,
    letterSpacing: entry.letterSpacing,
    // Android otherwise adds font ascent/descent padding around Google Sans,
    // which makes single-line TextInputs look vertically top-aligned.
    includeFontPadding: false,
  };
}
