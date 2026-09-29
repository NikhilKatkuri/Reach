/**
 * Font family names loaded in `app/_layout.tsx`.
 *
 * No italic variants, deliberately. Nothing in the app sets `fontStyle`, and
 * `familyForWeight` only ever returns one of the four below, so the italic
 * files were 8.2 MB of binary that was registered, shipped inside the APK, and
 * never rendered.
 */
export const FONTS = {
  regular: 'GoogleSans-Regular',
  medium: 'GoogleSans-Medium',
  semibold: 'GoogleSans-SemiBold',
  bold: 'GoogleSans-Bold',
  code: 'GoogleSansCode-Medium',
} as const;

/** Resolves a type-scale weight to a loaded family. */
export function familyForWeight(weight: '400' | '500' | '600' | '700'): string {
  switch (weight) {
    case '400':
      return FONTS.regular;
    case '500':
      return FONTS.medium;
    case '600':
      return FONTS.semibold;
    case '700':
      return FONTS.bold;
  }
}
