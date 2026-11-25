/**
 * Moderator checks, cached per user. Reading a community's mod list is a
 * Reddit call; caching the answer for a few minutes keeps /api/pool-check
 * and the menu actions from making one per request, while a removed
 * moderator still loses access within MOD_CACHE_MS.
 *
 * Redis: `mod:{userId}` string, '1' or '0', expiring after MOD_CACHE_MS.
 */
import type { Store } from './store';

export const MOD_CACHE_MS = 5 * 60_000;

const modKey = (userId: string): string => `mod:${userId}`;

export async function cachedIsModerator(
  store: Store,
  userId: string,
  now: Date,
  lookup: () => Promise<boolean>
): Promise<boolean> {
  const cached = await store.get(modKey(userId));
  if (cached === '1' || cached === '0') return cached === '1';
  const isMod = await lookup();
  await store.set(modKey(userId), isMod ? '1' : '0', {
    expiration: new Date(now.getTime() + MOD_CACHE_MS),
  });
  return isMod;
}
