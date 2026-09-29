/** Generates RFC 4122 v4 identifiers without pulling in a dependency. */
import * as Crypto from 'expo-crypto';

const HEX = '0123456789abcdef';

/**
 * Returns a random v4 UUID.
 *
 * Uses `expo-crypto`'s CSPRNG. Falls back to `Math.random` on platforms
 * where the native module is unavailable (web preview, Jest), which is good
 * enough for local row identifiers.
 */
export function uuid(): string {
  try {
    return Crypto.randomUUID();
  } catch {
    let out = '';
    for (let i = 0; i < 36; i += 1) {
      if (i === 8 || i === 13 || i === 18 || i === 23) {
        out += '-';
      } else if (i === 14) {
        out += '4';
      } else if (i === 19) {
        out += HEX[(Math.floor(Math.random() * 16) & 0x3) | 0x8];
      } else {
        out += HEX[Math.floor(Math.random() * 16)];
      }
    }
    return out;
  }
}

/** Short, human-scannable id derived from a prefix, for logs and debugging. */
export function shortId(prefix: string): string {
  return `${prefix}_${uuid().slice(0, 8)}`;
}
