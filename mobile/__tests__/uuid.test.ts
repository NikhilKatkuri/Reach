/**
 * Identifier generation.
 *
 * These exist because a broken id generator fails *silently*. Every row in
 * Reach is keyed by a generated id, so an id function that quietly returns
 * `undefined` produces a database where everything collides into one row, and
 * nothing crashes until much later.
 */
import * as Crypto from 'expo-crypto';
import { shortId, uuid } from '@/src/lib/uuid';

describe('uuid', () => {
  it('always returns a non-empty string', () => {
    // The test environment is exactly the failure case this guards: expo-crypto
    // resolves but returns undefined rather than throwing.
    expect(typeof Crypto.randomUUID()).not.toBe('string');

    for (let i = 0; i < 200; i += 1) {
      const value = uuid();
      expect(typeof value).toBe('string');
      expect(value.length).toBe(36);
    }
  });

  it('falls back rather than returning undefined when the native module is inert', () => {
    // A try/catch-only implementation returns `undefined` here, and the failure
    // would not surface until a database write.
    const value = uuid();
    expect(value).not.toBe('undefined');
    expect(value).not.toBe('');
    expect(value).not.toContain('undefined');
  });

  it('produces v4-shaped identifiers', () => {
    expect(uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('does not repeat', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i += 1) seen.add(uuid());
    expect(seen.size).toBe(1000);
  });

  it('shortId keeps its prefix and a readable tail', () => {
    const id = shortId('trip');
    expect(id.startsWith('trip_')).toBe(true);
    expect(id.slice('trip_'.length)).toHaveLength(8);
  });
});
