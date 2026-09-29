/** Generates RFC 4122 v4 identifiers without pulling in a dependency. */
import * as Crypto from 'expo-crypto';

const HEX = '0123456789abcdef';

/**
 * Returns a random v4 UUID.
 *
 * Prefers `expo-crypto`'s CSPRNG and falls back to `Math.random` on platforms
 * where the native module is unavailable, which is good enough for local row
 * identifiers.
 *
 * The fallback is chosen on the *value*, not on the absence of an exception,
 * and that distinction is load-bearing. `expo-crypto` can be present but not
 * ready — a bare build without the module linked, or a reload that races module
 * initialisation — and in that state `randomUUID()` returns `undefined` rather
 * than throwing. A `try`/`catch` would sail straight past that, every id in the
 * app would become the string "undefined", and the database would silently
 * collapse into one enormous row keyed `undefined`. Checking the result
 * catches both failure modes.
 */
export function uuid(): string {
  try {
    const value: unknown = Crypto.randomUUID();
    if (typeof value === 'string' && value.length > 0) return value;
  } catch {
    // Fall through to the software generator.
  }

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

/** Short, human-scannable id derived from a prefix, for logs and debugging. */
export function shortId(prefix: string): string {
  return `${prefix}_${uuid().slice(0, 8)}`;
}
