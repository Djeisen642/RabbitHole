/**
 * Deps for tests and the local mock server: the fixture source, an
 * in-memory store, a fixed player, a fixed pick salt and a clock you can
 * set.
 */
import type { Deps, User } from '../deps';
import { MemoryStore } from '../store';
import type { Store } from '../store';
import { MOCK_POOL, createMockSource } from './mock-source';
import type { MockSource } from './mock-source';

export type MockDeps = Deps & {
  source: MockSource;
  store: Store;
  setUser(user: User | null): void;
  setNow(now: Date): void;
  logs: string[];
};

/** The pick salt in tests, so the same date always picks the same sub. */
export const MOCK_SALT = 'mock-salt';

export function createMockDeps(
  options: {
    now?: Date;
    user?: User | null;
    quiet?: boolean;
    salt?: string;
  } = {}
): MockDeps {
  let user: User | null =
    options.user === undefined
      ? { id: 't2_mockplayer', username: 'mock_player' }
      : options.user;
  let now = options.now ?? new Date();
  const logs: string[] = [];
  const deps: MockDeps = {
    // Keys expire by the mock clock, so tests can move time past a TTL.
    store: new MemoryStore(() => now),
    source: createMockSource(),
    pool: MOCK_POOL,
    logs,
    user: () => Promise.resolve(user),
    isModerator: () => Promise.resolve(user !== null),
    newSalt: () => options.salt ?? MOCK_SALT,
    // Tests and the mock server run the next batch themselves.
    scheduleNextPoolCheck: () => Promise.resolve(),
    now: () => now,
    log: (message) => {
      logs.push(message);
      if (!options.quiet) console.log(message);
    },
    setUser(next) {
      user = next;
    },
    setNow(next) {
      now = next;
    },
  };
  return deps;
}
