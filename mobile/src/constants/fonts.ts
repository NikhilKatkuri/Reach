/** Font family names loaded in `app/_layout.tsx`. */
export const FONTS = {
  regular: 'GoogleSans-Regular',
  medium: 'GoogleSans-Medium',
  semibold: 'GoogleSans-SemiBold',
  bold: 'GoogleSans-Bold',
  italic: 'GoogleSans-Italic',
  mediumItalic: 'GoogleSans-MediumItalic',
  semiboldItalic: 'GoogleSans-SemiBoldItalic',
  boldItalic: 'GoogleSans-BoldItalic',
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
