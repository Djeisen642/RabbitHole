import { describe, expect, it } from 'vitest';
import { MOD_CACHE_MS, cachedIsModerator } from './moderator';
import { MemoryStore } from './store';

describe('cachedIsModerator', () => {
  it('asks Reddit once per user within the cache window', async () => {
    let now = new Date('2026-11-25T15:00:00Z');
    const store = new MemoryStore(() => now);
    let lookups = 0;
    let isMod = true;
    const lookup = () => {
      lookups += 1;
      return Promise.resolve(isMod);
    };
    expect(await cachedIsModerator(store, 't2_a', now, lookup)).toBe(true);
    expect(await cachedIsModerator(store, 't2_a', now, lookup)).toBe(true);
    expect(lookups).toBe(1);

    // Another user gets their own answer.
    isMod = false;
    expect(await cachedIsModerator(store, 't2_b', now, lookup)).toBe(false);
    expect(lookups).toBe(2);

    // A removed moderator loses access once the cache expires.
    now = new Date(now.getTime() + MOD_CACHE_MS);
    expect(await cachedIsModerator(store, 't2_a', now, lookup)).toBe(false);
    expect(lookups).toBe(3);
  });
});
