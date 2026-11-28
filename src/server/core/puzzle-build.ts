/**
 * Building a puzzle from one community: the run-time checks on a sub and
 * the reads that turn its posts, comments and sidebar into clues. Reads
 * Reddit only; nothing here touches Redis.
 */
import type { PoolEntry } from '../../shared/pool';
import {
  jargonWords,
  pickAbout,
  pickTopComment,
  pickTopPost,
  postProblem,
  subredditProblem,
} from './filters';
import type { PuzzleSource, SourcePost, SubredditFacts } from './source';
import type { StoredCandidate, PuzzleContent } from './puzzle-store';

/** Candidate posts kept per puzzle, as fallbacks if one is removed. */
export const MAX_CANDIDATES = 3;
/** Top posts read per sub. */
export const TOP_POST_LIMIT = 50;
/** All-time top posts read for the top-post clue. */
export const ALL_TIME_POST_LIMIT = 25;
/** Comment fetches per sub before moving on. */
export const MAX_COMMENT_FETCHES = 8;

export type SubCheck = {
  name: string;
  ok: boolean;
  problem: string | null;
  subscribers: number | null;
  textPosts: number;
  goodPosts: number;
  sampleTitles: string[];
};

/** Fetch what the checks need about a sub. Errors read as "not found". */
async function readSub(
  source: PuzzleSource,
  entry: PoolEntry
): Promise<{ facts: SubredditFacts | null; posts: SourcePost[] }> {
  try {
    const facts = await source.subredditFacts(entry.name);
    if (!facts || facts.nsfw || facts.quarantined) return { facts, posts: [] };
    const posts = await source.topPosts(entry.name, 'month', TOP_POST_LIMIT);
    return { facts, posts };
  } catch {
    return { facts: null, posts: [] };
  }
}

/**
 * The run-time checks for one pool entry: the sub exists, is SFW, has at
 * least MIN_SUBSCRIBERS members and enough text posts, and how many of its
 * month's top posts would pass the post filters.
 */
export async function checkSub(
  source: PuzzleSource,
  entry: PoolEntry
): Promise<SubCheck> {
  const { facts, posts } = await readSub(source, entry);
  const problem = subredditProblem(facts, posts);
  const good = posts.filter((p) => postProblem(p, entry) === null);
  return {
    name: entry.name,
    ok: problem === null && good.length > 0,
    problem: problem ?? (good.length === 0 ? 'no usable text posts' : null),
    subscribers: facts?.subscribers ?? null,
    textPosts: posts.filter((p) => p.isSelf).length,
    goodPosts: good.length,
    sampleTitles: good.slice(0, 3).map((p) => p.title),
  };
}

/** A built puzzle, or why the sub couldn't make one. */
export type Built = { puzzle: PuzzleContent } | { problem: string };

/**
 * Run one Reddit read, naming it in any error, so a skipped community's log
 * line says which read failed.
 */
async function step<T>(what: string, read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    throw new Error(`${what} failed: ${String(error)}`, { cause: error });
  }
}

/**
 * Build a puzzle from one sub, or explain why it can't make one. Reads the
 * sub's facts and month of top posts, then the comments of passing posts
 * until MAX_CANDIDATES posts with a good top comment are found. Posts in
 * `exclude` are never used.
 */

export async function buildPuzzle(
  source: PuzzleSource,
  entry: PoolEntry,
  exclude: ReadonlySet<string> = new Set()
): Promise<Built> {
  const { facts, posts } = await readSub(source, entry);
  const problem = subredditProblem(facts, posts);
  if (problem || !facts) return { problem: problem ?? 'not found' };

  const passing = posts.filter(
    (p) => !exclude.has(p.id) && postProblem(p, entry) === null
  );
  if (passing.length === 0) return { problem: 'no usable text posts' };

  const candidates: StoredCandidate[] = [];
  for (const post of passing.slice(0, MAX_COMMENT_FETCHES)) {
    const comments = await step('reading comments', () =>
      source.topComments(post.id, 10)
    );
    const topComment = pickTopComment(comments, entry);
    if (!topComment) continue;
    candidates.push({
      postId: post.id,
      commentId: topComment.id,
      post: {
        title: post.title.trim(),
        body: post.body.trim(),
        score: post.score,
        comments: post.comments,
        createdAt: post.createdAt,
      },
      topComment: { body: topComment.body, score: topComment.score },
    });
    if (candidates.length >= MAX_CANDIDATES) break;
  }
  if (candidates.length === 0)
    return { problem: 'no post has a good top comment' };

  const about = pickAbout(facts.description, entry);
  if (!about) return { problem: 'no usable sidebar description' };

  // Every title feeds the jargon cloud, not just the passing posts, but
  // never one from an NSFW, spoiler or removed post.
  const jargon = jargonWords(
    posts
      .filter((p) => !p.nsfw && !p.spoiler && !p.removed)
      .map((p) => p.title),
    entry
  );
  if (jargon.length < 3) return { problem: 'not enough jargon' };

  // The all-time top post is a nice-to-have: if it can't be read or none
  // passes, the round falls back to the stats clue instead of losing the sub.
  const allTime = await source
    .topPosts(entry.name, 'all', ALL_TIME_POST_LIMIT)
    .catch(() => []);
  const topPost = pickTopPost(
    allTime,
    entry,
    new Set(candidates.map((c) => c.postId))
  );

  return {
    puzzle: {
      answer: entry.name,
      hasCustomIcon: facts.iconUrl !== null,
      candidates,
      about,
      jargon,
      stats: {
        subscribers: facts.subscribers,
        createdYear:
          facts.createdAt === null
            ? null
            : new Date(facts.createdAt).getUTCFullYear(),
      },
      topPost,
      iconUrl: facts.iconUrl,
    },
  };
}

/** buildPuzzle, with a Reddit error turned into a problem to log and skip. */
export async function tryBuild(
  source: PuzzleSource,
  entry: PoolEntry,
  exclude?: ReadonlySet<string>
): Promise<Built> {
  try {
    return await buildPuzzle(source, entry, exclude);
  } catch (error) {
    return { problem: `error: ${String(error)}` };
  }
}
