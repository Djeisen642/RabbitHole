/**
 * Building, choosing and storing daily puzzles.
 *
 * Redis keys:
 * - `puzzle:YYYY-MM-DD` hash: `data` (StoredPuzzle JSON), `answer`,
 *   `active` (index of the candidate post being served), `checkedAt` (ms of
 *   the last check that the post and its comment are still live). Expires
 *   PUZZLE_KEEP_DAYS after its date.
 * - `pick-salt` string: the secret mixed into the pick order.
 * - `used-subs` sorted set: sub name scored by the day number it was used.
 * - `pick-lock:YYYY-MM-DD` lock guarding an on-demand pick or refill.
 * - `live-lock:YYYY-MM-DD` lock guarding the liveness check.
 */
import { createHmac, getRandomValues } from 'node:crypto';
import { addDays, dayNumber } from '../../shared/game/day';
import type { PuzzleDate } from '../../shared/game/day';
import { normalizeSubreddit } from '../../shared/game/rules';
import type { ClueKind } from '../../shared/game/rules';
import type { ClueView, PostCard } from '../../shared/api';
import { POOL, findEntry } from '../../shared/pool';
import type { PoolEntry } from '../../shared/pool';
import type { Deps } from './deps';
import {
  jargonWords,
  pickAbout,
  pickTopComment,
  postProblem,
  subredditProblem,
} from './filters';
import {
  asBoolean,
  asNumber,
  asRecord,
  asString,
  asStringArray,
  parseJson,
} from './json';
import { tryLock } from './lock';
import type { PuzzleSource, SourcePost, SubredditFacts } from './source';

/** A sub isn't picked again within this many days. */
export const REUSE_DAYS = 60;
/** Subs tried per pick before giving up for the night. */
export const MAX_SUB_ATTEMPTS = 12;
/** Candidate posts kept per puzzle, as fallbacks if one is removed. */
export const MAX_CANDIDATES = 3;
/** Top posts read per sub. */
export const TOP_POST_LIMIT = 50;
/** Comment fetches per sub before moving on. */
export const MAX_COMMENT_FETCHES = 8;
/** How long a liveness check of today's post is trusted. */
export const LIVE_CHECK_MS = 10 * 60_000;
/** How long one request may hold the liveness check before another may. */
export const LIVE_LOCK_MS = 30_000;
/**
 * Days a puzzle is kept after its date. Only today's is served; the spare
 * days cover time zones and a late look at yesterday's result.
 */
export const PUZZLE_KEEP_DAYS = 3;

export type StoredCandidate = {
  postId: string;
  /**
   * The top comment's id, re-checked with the post before serving. Null
   * for puzzles stored before comment ids were kept; those skip the check.
   */
  commentId: string | null;
  post: PostCard;
  topComment: { body: string; score: number };
};

export type StoredPuzzle = {
  date: PuzzleDate;
  answer: string;
  hasCustomIcon: boolean;
  candidates: StoredCandidate[];
  /** The community's sidebar description, cleaned and masked. */
  about: string;
  jargon: string[];
  /** createdYear is null when Reddit gave no readable founding date. */
  stats: { subscribers: number; createdYear: number | null };
  iconUrl: string | null;
};

export type PuzzleContent = Omit<StoredPuzzle, 'date'>;

/** Today's puzzle with the candidate post currently being shown. */
export type Served = { puzzle: StoredPuzzle; candidate: StoredCandidate };

export const puzzleKey = (date: PuzzleDate): string => `puzzle:${date}`;
const USED_KEY = 'used-subs';
const SALT_KEY = 'pick-salt';

/** 128 random bits as hex, for a new pick salt. */
export function randomSalt(): string {
  return Buffer.from(getRandomValues(new Uint8Array(16))).toString('hex');
}

/**
 * The secret mixed into the pick order, made once and kept in Redis. The
 * pool and the order algorithm are public, so without a secret anyone could
 * work out every future answer. Two first runs can race to make it; NX
 * makes the first write win and both read that one back.
 */
export async function pickSalt(deps: Deps): Promise<string> {
  const existing = await deps.store.get(SALT_KEY);
  if (existing) return existing;
  await deps.store.set(SALT_KEY, deps.newSalt(), { nx: true });
  const saved = await deps.store.get(SALT_KEY);
  if (!saved) throw new Error('pick salt missing after it was written');
  return saved;
}

/**
 * The order in which subs are tried for a date: every pool sub not used in
 * the last REUSE_DAYS days, shuffled by a keyed hash of the date and name,
 * so the same salt, date and history always give the same order.
 *
 * The hash is HMAC-SHA256 rather than a salted FNV-1a: FNV's whole state is
 * 32 bits, so after a salt prefix only those 32 bits stay secret, few enough
 * to brute-force from a handful of revealed answers.
 */
export function pickOrder(
  pool: readonly PoolEntry[],
  date: PuzzleDate,
  recentlyUsed: ReadonlySet<string>,
  salt: string
): PoolEntry[] {
  return pool
    .filter((entry) => !recentlyUsed.has(normalizeSubreddit(entry.name)))
    .map((entry) => ({
      entry,
      key: createHmac('sha256', salt)
        .update(`${date}:${entry.name.toLowerCase()}`)
        .digest('hex'),
    }))
    .sort(
      (a, b) =>
        a.key.localeCompare(b.key) || a.entry.name.localeCompare(b.entry.name)
    )
    .map(({ entry }) => entry);
}

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

type Built = { puzzle: PuzzleContent } | { problem: string };

/**
 * Build a puzzle from one sub, or explain why it can't make one. Reads the
 * sub's facts and month of top posts, then the comments of passing posts
 * until MAX_CANDIDATES posts with a good top comment are found. Posts in
 * `exclude` are never used.
 */
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
      iconUrl: facts.iconUrl,
    },
  };
}

async function recentlyUsed(
  deps: Deps,
  date: PuzzleDate
): Promise<Set<string>> {
  const day = dayNumber(date);
  const used = await deps.store.zRange(
    USED_KEY,
    day - REUSE_DAYS + 1,
    day + REUSE_DAYS,
    { by: 'score' }
  );
  return new Set(used.map((u) => u.member));
}

/**
 * Normalized names of the subs picked for a date or any later one: the
 * date's own answer (and any it had before a mid-day repick) and tomorrow's,
 * which the nightly job picks a day ahead.
 */
export async function answersFrom(
  deps: Deps,
  date: PuzzleDate
): Promise<Set<string>> {
  const day = dayNumber(date);
  const used = await deps.store.zRange(USED_KEY, day, day + REUSE_DAYS, {
    by: 'score',
  });
  return new Set(used.map((u) => u.member));
}

/**
 * Choose and store the puzzle for a date. Tries subs in pickOrder, logging
 * and skipping any that fail a check, so a dead or wrong pool entry can't
 * break a day. Returns null if no sub worked within MAX_SUB_ATTEMPTS.
 *
 * The nightly job and an on-demand pick can run at once. The first to store
 * a puzzle wins (see storeNewPuzzle), and both return that one, so the
 * date never has two answers.
 */
export async function pickPuzzle(
  deps: Deps,
  date: PuzzleDate
): Promise<StoredPuzzle | null> {
  const order = pickOrder(
    deps.pool,
    date,
    await recentlyUsed(deps, date),
    await pickSalt(deps)
  );
  for (const entry of order.slice(0, MAX_SUB_ATTEMPTS)) {
    const built = await tryBuild(deps.source, entry);
    if ('problem' in built) {
      deps.log(`pick ${date}: skipped r/${entry.name} (${built.problem})`);
      continue;
    }
    const stored = await storeNewPuzzle(deps, { date, ...built.puzzle });
    deps.log(`pick ${date}: chose r/${stored.answer}`);
    return stored;
  }
  deps.log(`pick ${date}: no sub worked`);
  return null;
}

/** buildPuzzle, with a Reddit error turned into a problem to log and skip. */
async function tryBuild(
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

/**
 * Seconds from now until a date's keys (its puzzle, its pool check) should
 * go: the end of the day PUZZLE_KEEP_DAYS after it, at least a minute.
 */
export function secondsToKeep(deps: Deps, date: PuzzleDate): number {
  const end = Date.parse(`${addDays(date, PUZZLE_KEEP_DAYS + 1)}T00:00:00Z`);
  return Math.max(60, Math.ceil((end - deps.now().getTime()) / 1000));
}

/**
 * Store a freshly picked puzzle unless the date already has one, and return
 * whichever is stored. HSETNX on `data` makes the first write win.
 */
async function storeNewPuzzle(
  deps: Deps,
  puzzle: StoredPuzzle
): Promise<StoredPuzzle> {
  const key = puzzleKey(puzzle.date);
  if (!(await deps.store.hSetNX(key, 'data', JSON.stringify(puzzle)))) {
    const winner = await loadPuzzle(deps, puzzle.date);
    if (winner) return winner.puzzle;
    // The stored one doesn't parse; replace it rather than serve nothing.
  }
  await savePuzzle(deps, puzzle);
  return puzzle;
}

/**
 * Write a puzzle, replacing what the date had. Used for a refill of the
 * same community, and by storeNewPuzzle once it has won the date.
 */
export async function savePuzzle(
  deps: Deps,
  puzzle: StoredPuzzle
): Promise<void> {
  const key = puzzleKey(puzzle.date);
  await deps.store.hSet(key, {
    data: JSON.stringify(puzzle),
    answer: puzzle.answer,
    active: '0',
    checkedAt: String(deps.now().getTime()),
  });
  await deps.store.expire(key, secondsToKeep(deps, puzzle.date));
  await deps.store.zAdd(USED_KEY, {
    member: normalizeSubreddit(puzzle.answer),
    score: dayNumber(puzzle.date),
  });
}

export async function loadPuzzle(
  deps: Deps,
  date: PuzzleDate
): Promise<{ puzzle: StoredPuzzle; active: number; checkedAt: number } | null> {
  const fields = await deps.store.hGetAll(puzzleKey(date));
  if (!fields.data) return null;
  const puzzle = parseStoredPuzzle(fields.data);
  if (!puzzle) return null;
  return {
    puzzle,
    active: Number(fields.active ?? '0') || 0,
    checkedAt: Number(fields.checkedAt ?? '0') || 0,
  };
}

function parseCandidate(value: unknown): StoredCandidate | null {
  const c = asRecord(value);
  const post = asRecord(c?.post);
  const comment = asRecord(c?.topComment);
  const postId = asString(c?.postId);
  const commentId = asString(c?.commentId);
  const title = asString(post?.title);
  const body = asString(post?.body);
  const score = asNumber(post?.score);
  const comments = asNumber(post?.comments);
  const createdAt = asNumber(post?.createdAt);
  const commentBody = asString(comment?.body);
  const commentScore = asNumber(comment?.score);
  if (
    postId === null ||
    title === null ||
    body === null ||
    score === null ||
    comments === null ||
    createdAt === null ||
    commentBody === null ||
    commentScore === null
  )
    return null;
  return {
    postId,
    commentId,
    post: { title, body, score, comments, createdAt },
    topComment: { body: commentBody, score: commentScore },
  };
}

/** Parse a stored puzzle, checking every field the game relies on. */
export function parseStoredPuzzle(json: string): StoredPuzzle | null {
  const p = asRecord(parseJson(json));
  const stats = asRecord(p?.stats);
  const date = asString(p?.date);
  const answer = asString(p?.answer);
  const hasCustomIcon = asBoolean(p?.hasCustomIcon);
  const jargon = asStringArray(p?.jargon);
  const about = asString(p?.about);
  const subscribers = asNumber(stats?.subscribers);
  // An explicit null is a sub with no known founding year, not bad data.
  const unknownYear = stats?.createdYear === null;
  const createdYear = unknownYear ? null : asNumber(stats?.createdYear);
  const iconUrl = p?.iconUrl === null ? null : asString(p?.iconUrl);
  const rawCandidates = Array.isArray(p?.candidates) ? p.candidates : [];
  const candidates = rawCandidates
    .map(parseCandidate)
    .filter((c): c is StoredCandidate => c !== null);
  if (
    date === null ||
    answer === null ||
    hasCustomIcon === null ||
    jargon === null ||
    about === null ||
    subscribers === null ||
    (createdYear === null && !unknownYear) ||
    candidates.length === 0 ||
    (hasCustomIcon && iconUrl === null)
  )
    return null;
  return {
    date,
    answer,
    hasCustomIcon,
    candidates,
    about,
    jargon,
    stats: { subscribers, createdYear },
    iconUrl: iconUrl ?? null,
  };
}

/**
 * Make sure puzzles exist for a date and the day after, picking any that
 * are missing. Called by the nightly job and the moderator menu.
 */
export async function runDailyPick(
  deps: Deps,
  today: PuzzleDate
): Promise<{ date: PuzzleDate; answer: string | null; fresh: boolean }[]> {
  const out: { date: PuzzleDate; answer: string | null; fresh: boolean }[] = [];
  for (const date of [today, addDays(today, 1)]) {
    const existing = await loadPuzzle(deps, date);
    if (existing) {
      out.push({ date, answer: existing.puzzle.answer, fresh: false });
      continue;
    }
    const picked = await pickPuzzle(deps, date);
    out.push({ date, answer: picked?.answer ?? null, fresh: picked !== null });
  }
  return out;
}

/** How long an on-demand pick or refill holds the lock if it fails or dies. */
const PICK_LOCK_SECONDS = 120;

/**
 * Run an on-demand pick or refill for a date unless another request already
 * is.
 * Players' requests trigger these, so without the lock every player who
 * arrives while Reddit is being read would start the same reads. Returns
 * null without running when the lock is taken. A failed pick leaves the lock
 * to expire, so retries hit Reddit at most every PICK_LOCK_SECONDS.
 */
async function withPickLock<T>(
  deps: Deps,
  date: PuzzleDate,
  run: () => Promise<T | null>
): Promise<T | null> {
  const lockKey = `pick-lock:${date}`;
  if (
    !(await tryLock(deps.store, lockKey, PICK_LOCK_SECONDS * 1000, deps.now()))
  )
    return null;
  const result = await run();
  if (result !== null) await deps.store.del(lockKey);
  return result;
}

const firstCandidate = (puzzle: StoredPuzzle | null): Served | null => {
  const candidate = puzzle?.candidates[0];
  return puzzle && candidate ? { puzzle, candidate } : null;
};

/**
 * Every stored post of the day is gone. The day is refilled with fresh
 * posts from the same community, keeping the other clues, so rounds in
 * progress carry on. Only if that community has nothing usable left is a
 * new one picked. Each round keeps the answer it started with (see
 * round.ts), so finished rounds stay as they ended, and rounds still in
 * play start over on the new community.
 */
async function replaceGonePosts(
  deps: Deps,
  puzzle: StoredPuzzle
): Promise<Served | null> {
  const { date } = puzzle;
  return withPickLock(deps, date, async () => {
    const entry = findEntry(puzzle.answer, POOL);
    // Top listings can lag behind a removal, so never reuse a gone post.
    const gone = new Set(puzzle.candidates.map((c) => c.postId));
    const rebuilt: Built = entry
      ? await tryBuild(deps.source, entry, gone)
      : { problem: 'not in the pool' };
    if ('puzzle' in rebuilt) {
      const refilled = { ...puzzle, candidates: rebuilt.puzzle.candidates };
      await savePuzzle(deps, refilled);
      deps.log(`serve ${date}: posts gone, refilled from r/${puzzle.answer}`);
      return firstCandidate(refilled);
    }
    deps.log(
      `serve ${date}: posts gone and r/${puzzle.answer} has no more (${rebuilt.problem}), picking again`
    );
    await deps.store.del(puzzleKey(date));
    return firstCandidate(await pickPuzzle(deps, date));
  });
}

/**
 * Today's puzzle and the candidate post to serve, re-checking at most every
 * LIVE_CHECK_MS that the post and its top comment are still on Reddit. A
 * candidate whose post or comment was removed or deleted is dropped from
 * Redis, and the next stored candidate is served, then fresh posts (see
 * replaceGonePosts). Picks on demand if the nightly job hasn't run.
 */
export async function servePuzzle(
  deps: Deps,
  date: PuzzleDate
): Promise<Served | null> {
  const loaded = await loadPuzzle(deps, date);
  if (!loaded)
    return firstCandidate(
      await withPickLock(deps, date, () => pickPuzzle(deps, date))
    );

  const { puzzle, checkedAt } = loaded;
  const active = Math.min(loaded.active, puzzle.candidates.length - 1);
  const nowMs = deps.now().getTime();
  // Every request after the check window would otherwise read Reddit at
  // once. One takes the lock and checks; the rest serve the cached
  // candidate, which is at most one check old.
  if (
    nowMs - checkedAt >= LIVE_CHECK_MS &&
    (await tryLock(deps.store, `live-lock:${date}`, LIVE_LOCK_MS, deps.now()))
  )
    return checkCandidates(deps, puzzle, active, nowMs);
  const candidate = puzzle.candidates[active];
  return candidate ? { puzzle, candidate } : null;
}

/**
 * Find the first live candidate from `active` on, and store the puzzle
 * without the gone ones before it, so deleted posts and comments don't stay
 * in Redis.
 */
async function checkCandidates(
  deps: Deps,
  puzzle: StoredPuzzle,
  active: number,
  nowMs: number
): Promise<Served | null> {
  for (let i = active; i < puzzle.candidates.length; i += 1) {
    const candidate = puzzle.candidates[i];
    if (!candidate || !(await isLive(deps, candidate))) continue;
    const key = puzzleKey(puzzle.date);
    if (i === 0) {
      await deps.store.hSet(key, { checkedAt: String(nowMs) });
      return { puzzle, candidate };
    }
    const pruned = { ...puzzle, candidates: puzzle.candidates.slice(i) };
    await deps.store.hSet(key, {
      data: JSON.stringify(pruned),
      active: '0',
      checkedAt: String(nowMs),
    });
    deps.log(`serve ${puzzle.date}: dropped ${String(i)} gone post(s)`);
    return { puzzle: pruned, candidate };
  }
  return replaceGonePosts(deps, puzzle);
}

/** Whether a candidate's post and top comment are both still up. */
async function isLive(
  deps: Deps,
  candidate: StoredCandidate
): Promise<boolean> {
  try {
    if (!(await deps.source.isPostLive(candidate.postId))) return false;
    return (
      candidate.commentId === null ||
      (await deps.source.isCommentLive(candidate.commentId))
    );
  } catch {
    // Can't tell right now; keep serving rather than drop a good post.
    return true;
  }
}

/** One clue's content. */
export function clueView(
  kind: ClueKind,
  puzzle: StoredPuzzle,
  candidate: StoredCandidate
): ClueView {
  switch (kind) {
    case 'topComment':
      return { kind, ...candidate.topComment };
    case 'about':
      return { kind, text: puzzle.about };
    case 'jargon':
      return { kind, words: puzzle.jargon };
    case 'stats':
      return { kind, ...puzzle.stats };
    case 'icon':
      return { kind, url: puzzle.iconUrl ?? '' };
  }
}
