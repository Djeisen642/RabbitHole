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
  /** Posts, pinned comments and moderator notices made, oldest first. */
  posts: { id: string; title: string; url: string }[];
  pinned: { postId: string; markdown: string }[];
  notices: { subject: string; markdown: string }[];
  /** Flair set, by username. */
  flairs: Map<string, string>;
  store: Store;
  setUser(user: User | null): void;
  /** The post requests come from (null: none, so today's puzzle). */
  setPostId(postId: string | null): void;
  setNow(now: Date): void;
  logs: string[];
};

/** The post link the share text uses in tests and mock mode. */
export const MOCK_POST_URL =
  'https://www.reddit.com/r/abbit_hole/comments/mock01/';

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
  let currentPost: string | null = null;
  const logs: string[] = [];
  const posts: MockDeps['posts'] = [];
  const pinned: MockDeps['pinned'] = [];
  const notices: MockDeps['notices'] = [];
  const flairs = new Map<string, string>();
  const deps: MockDeps = {
    // Keys expire by the mock clock, so tests can move time past a TTL.
    store: new MemoryStore(() => now),
    source: createMockSource(),
    pool: MOCK_POOL,
    logs,
    posts,
    pinned,
    notices,
    flairs,
    user: () => Promise.resolve(user),
    // A made-up post, so the share text has a link line in mock mode too.
    postUrl: () => MOCK_POST_URL,
    postId: () => currentPost,
    postTitle: (id) =>
      Promise.resolve(posts.find((p) => p.id === id)?.title ?? null),
    isModerator: () => Promise.resolve(user !== null),
    newSalt: () => options.salt ?? MOCK_SALT,
    createPost(title) {
      const id = `t3_mock${String(posts.length + 1)}`;
      const url = `https://www.reddit.com/r/abbit_hole/comments/${id.slice(3)}/`;
      posts.push({ id, title, url });
      return Promise.resolve({ id, url });
    },
    setFlair(username, text) {
      flairs.set(username, text);
      return Promise.resolve();
    },
    avatarUrl: (username) =>
      Promise.resolve(`https://i.redd.it/snoovatar/${username}.png`),
    pinComment(postId, markdown) {
      pinned.push({ postId, markdown });
      return Promise.resolve();
    },
    notifyMods(subject, markdown) {
      notices.push({ subject, markdown });
      return Promise.resolve();
    },
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
    setPostId(next) {
      currentPost = next;
    },
    setNow(next) {
      now = next;
    },
  };
  return deps;
}
