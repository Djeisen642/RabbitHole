/**
 * PuzzleSource backed by the made-up fixtures, for tests and local play.
 * `removePost` and `removeComment` simulate content deleted on Reddit.
 */
import { normalizeSubreddit } from '../../../shared/game/rules';
import { POOL, findEntry } from '../../../shared/pool';
import type { PoolEntry } from '../../../shared/pool';
import type { PuzzleSource, SourcePost } from '../source';
import { FIXTURE_NOW, FIXTURES } from './fixtures';
import type { FixturePost, FixtureSub } from './fixtures';

const DAY_MS = 86_400_000;

export type MockSource = PuzzleSource & {
  removePost(postId: string): void;
  removeComment(commentId: string): void;
  /** How many calls each method received, for tests that count API use. */
  calls: Record<keyof PuzzleSource, number>;
};

function toSourcePost(post: FixturePost): SourcePost {
  const isSelf = post.isSelf ?? true;
  return {
    id: post.id,
    title: post.title,
    body: isSelf ? post.body : '',
    isSelf,
    nsfw: post.nsfw ?? false,
    spoiler: false,
    removed: false,
    stickied: false,
    flair: post.flair ?? null,
    score: post.score,
    comments: post.comments,
    createdAt: FIXTURE_NOW - post.daysAgo * DAY_MS,
  };
}

export function createMockSource(
  fixtures: readonly FixtureSub[] = FIXTURES
): MockSource {
  const removed = new Set<string>();
  const calls: MockSource['calls'] = {
    topPosts: 0,
    topComments: 0,
    subredditFacts: 0,
    isPostLive: 0,
    isCommentLive: 0,
  };
  const sub = (name: string): FixtureSub | undefined =>
    fixtures.find(
      (f) => normalizeSubreddit(f.name) === normalizeSubreddit(name)
    );
  const post = (id: string): FixturePost | undefined =>
    fixtures.flatMap((f) => f.posts).find((p) => p.id === id);
  // Comment ids are made up from the post id and the comment's place.
  const commentId = (postId: string, index: number): string =>
    `t1_${postId.slice(3)}c${String(index)}`;
  const commentExists = (id: string): boolean =>
    fixtures
      .flatMap((f) => f.posts)
      .some((p) =>
        (p.topComments ?? []).some((_, i) => commentId(p.id, i) === id)
      );

  return {
    calls,
    removePost(postId) {
      removed.add(postId);
    },
    removeComment(id) {
      removed.add(id);
    },
    topPosts(subreddit, timeframe, limit) {
      calls.topPosts += 1;
      const maxDays = timeframe === 'week' ? 7 : 31;
      const posts = (sub(subreddit)?.posts ?? [])
        .filter((p) => p.daysAgo <= maxDays && !removed.has(p.id))
        .map(toSourcePost)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      return Promise.resolve(posts);
    },
    topComments(postId, limit) {
      calls.topComments += 1;
      const comments = (post(postId)?.topComments ?? [])
        .slice(0, limit)
        .map((c, i) => ({
          id: commentId(postId, i),
          body: c.body,
          author: c.author,
          score: c.score,
          stickied: c.stickied ?? false,
          removed: false,
          distinguished: c.distinguished ?? false,
        }))
        .filter((c) => !removed.has(c.id));
      return Promise.resolve(comments);
    },
    subredditFacts(subreddit) {
      calls.subredditFacts += 1;
      const s = sub(subreddit);
      if (!s) return Promise.resolve(null);
      return Promise.resolve({
        name: s.name,
        subscribers: s.subscribers,
        createdAt: Date.UTC(s.createdYear, 0, 25),
        nsfw: s.nsfw ?? false,
        quarantined: s.quarantined ?? false,
        iconUrl: s.iconUrl,
        description: s.description,
      });
    },
    isPostLive(postId) {
      calls.isPostLive += 1;
      return Promise.resolve(
        post(postId) !== undefined && !removed.has(postId)
      );
    },
    isCommentLive(id) {
      calls.isCommentLive += 1;
      return Promise.resolve(commentExists(id) && !removed.has(id));
    },
  };
}

export const mockSource: PuzzleSource = createMockSource();

/** The pool entries the fixtures cover, for picking puzzles in mock mode. */
export const MOCK_POOL: readonly PoolEntry[] = FIXTURES.map((f) =>
  findEntry(f.name, POOL)
).filter((e): e is PoolEntry => e !== undefined);
