/**
 * Short-lived locks in Redis, so a burst of player requests can't all start
 * the same Reddit reads.
 */
import { randomUUID } from 'node:crypto';
import type { Store } from './store';

/**
 * Try to take a lock for `ms` milliseconds. One SET with NX and an
 * expiration does both in a single atomic command, so a request that dies
 * right after taking the lock can't leave it without a TTL (which an
 * INCRBY followed by EXPIRE could).
 *
 * Whether we won is read back as our own random token rather than from
 * SET's reply: Redis answers "OK" or nil, but that reply passes through
 * Devvit's plugin as a string, and comparing the stored value doesn't
 * depend on how the plugin spells a miss.
 */
export async function tryLock(
  store: Store,
  key: string,
  ms: number,
  now: Date
): Promise<boolean> {
  const token = randomUUID();
  await store.set(key, token, {
    nx: true,
    expiration: new Date(now.getTime() + ms),
  });
  return (await store.get(key)) === token;
}
