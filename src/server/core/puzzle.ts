/**
 * Building, choosing and storing daily puzzles.
 *
 * Redis keys:
 * - `puzzle:YYYY-MM-DD` hash: `data` (StoredPuzzle JSON), `answer`,
 *   `active` (index of the candidate post being served), `checkedAt` (ms of
 *   the last check that the post is still live).
 * - `used-subs` sorted set: sub name scored by the day number it was used.
 * - `pick-lock:YYYY-MM-DD` counter guarding an on-demand pick or refill.
 */
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
  pickRule,
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
import type { PuzzleSource, SourcePost, SubredditFacts } from './source';

/** A sub isn't picked again within this many days. */
export const REUSE_DAYS = 60;
/** Subs tried per pick before giving up for the night. */
export const MAX_SUB_ATTEMPTS = 6;
/** Candidate posts kept per puzzle, as fallbacks if one is removed. */
export const MAX_CANDIDATES = 3;
/** Top posts read per sub. */
export const TOP_POST_LIMIT = 50;
/** Comment fetches per sub before moving on. */
export const MAX_COMMENT_FETCHES = 8;
/** How long a liveness check of today's post is trusted. */
export const LIVE_CHECK_MS = 10 * 60_000;

export type StoredCandidate = {
  postId: string;
  post: PostCard;
  topComment: { body: string; score: number };
};

export type StoredPuzzle = {
  date: PuzzleDate;
  answer: string;
  hasCustomIcon: boolean;
  candidates: StoredCandidate[];
  rule: { title: string; description: string };
  jargon: string[];
  stats: { subscribers: number; createdYear: number };
  iconUrl: string | null;
};

export type PuzzleContent = Omit<StoredPuzzle, 'date'>;

/** Today's puzzle with the candidate post currently being shown. */
export type Served = { puzzle: StoredPuzzle; candidate: StoredCandidate };

export const puzzleKey = (date: PuzzleDate): string => `puzzle:${date}`;
const USED_KEY = 'used-subs';

/** FNV-1a, for a stable order that depends only on the date. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * The order in which subs are tried for a date: every pool sub not used in
 * the last REUSE_DAYS days, shuffled by a hash of the date and name, so the
 * same date and history always give the same order.
 */
export function pickOrder(
  pool: readonly PoolEntry[],
  date: PuzzleDate,
  recentlyUsed: ReadonlySet<string>
): PoolEntry[] {
  return pool
    .filter((entry) => !recentlyUsed.has(normalizeSubreddit(entry.name)))
    .map((entry) => ({
      entry,
      key: hash(`${date}:${entry.name.toLowerCase()}`),
    }))
    .sort((a, b) => a.key - b.key || a.entry.name.localeCompare(b.entry.name))
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
    const comments = await source.topComments(post.id, 10);
    const topComment = pickTopComment(comments, entry);
    if (!topComment) continue;
    candidates.push({
      postId: post.id,
      post: {
        title: post.title.trim(),
        body: post.body.trim(),
        score: post.score,
        comments: post.comments,
        createdAt: post.createdAt,
      },
      topComment,
    });
    if (candidates.length >= MAX_CANDIDATES) break;
  }
  if (candidates.length === 0)
    return { problem: 'no post has a good top comment' };

  const rule = pickRule(await source.rules(entry.name), entry);
  if (!rule) return { problem: 'no rules' };

  const jargon = jargonWords(
    posts.map((p) => p.title),
    entry
  );
  if (jargon.length < 3) return { problem: 'not enough jargon' };

  return {
    puzzle: {
      answer: entry.name,
      hasCustomIcon: facts.iconUrl !== null,
      candidates,
      rule,
      jargon,
      stats: {
        subscribers: facts.subscribers,
        createdYear: new Date(facts.createdAt).getUTCFullYear(),
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
 * Choose and store the puzzle for a date. Tries subs in pickOrder, logging
 * and skipping any that fail a check, so a dead or wrong pool entry can't
 * break a day. Returns null if no sub worked within MAX_SUB_ATTEMPTS.
 */
export async function pickPuzzle(
  deps: Deps,
  date: PuzzleDate
): Promise<StoredPuzzle | null> {
  const order = pickOrder(deps.pool, date, await recentlyUsed(deps, date));
  for (const entry of order.slice(0, MAX_SUB_ATTEMPTS)) {
    const built = await tryBuild(deps.source, entry);
    if ('problem' in built) {
      deps.log(`pick ${date}: skipped r/${entry.name} (${built.problem})`);
      continue;
    }
    const puzzle: StoredPuzzle = { date, ...built.puzzle };
    await savePuzzle(deps, puzzle);
    deps.log(`pick ${date}: chose r/${entry.name}`);
    return puzzle;
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

export async function savePuzzle(
  deps: Deps,
  puzzle: StoredPuzzle
): Promise<void> {
  await deps.store.hSet(puzzleKey(puzzle.date), {
    data: JSON.stringify(puzzle),
    answer: puzzle.answer,
    active: '0',
    checkedAt: String(deps.now().getTime()),
  });
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
    post: { title, body, score, comments, createdAt },
    topComment: { body: commentBody, score: commentScore },
  };
}

/** Parse a stored puzzle, checking every field the game relies on. */
export function parseStoredPuzzle(json: string): StoredPuzzle | null {
  const p = asRecord(parseJson(json));
  const rule = asRecord(p?.rule);
  const stats = asRecord(p?.stats);
  const date = asString(p?.date);
  const answer = asString(p?.answer);
  const hasCustomIcon = asBoolean(p?.hasCustomIcon);
  const jargon = asStringArray(p?.jargon);
  const ruleTitle = asString(rule?.title);
  const ruleDescription = asString(rule?.description);
  const subscribers = asNumber(stats?.subscribers);
  const createdYear = asNumber(stats?.createdYear);
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
    ruleTitle === null ||
    ruleDescription === null ||
    subscribers === null ||
    createdYear === null ||
    candidates.length === 0 ||
    (hasCustomIcon && iconUrl === null)
  )
    return null;
  return {
    date,
    answer,
    hasCustomIcon,
    candidates,
    rule: { title: ruleTitle, description: ruleDescription },
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
  if ((await deps.store.incrBy(lockKey, 1)) !== 1) return null;
  await deps.store.expire(lockKey, PICK_LOCK_SECONDS);
  const result = await run();
  if (result !== null) await deps.store.del(lockKey);
  return result;
}

const firstCandidate = (puzzle: StoredPuzzle | null): Served | null => {
  const candidate = puzzle?.candidates[0];
  return puzzle && candidate ? { puzzle, candidate } : null;
};

/**
 * Every stored post of the day is gone. Rounds already in progress are
 * replayed against the stored answer, so the day is refilled with fresh
 * posts from the same community, keeping the other clues. Only if that
 * community has nothing usable left is a new one picked; rounds in progress
 * then replay their guesses against the new answer.
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
 * LIVE_CHECK_MS that the post is still on Reddit. A removed or deleted post
 * falls back to the next stored candidate, then to fresh posts (see
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
  let active = Math.min(loaded.active, puzzle.candidates.length - 1);
  const nowMs = deps.now().getTime();
  if (nowMs - checkedAt >= LIVE_CHECK_MS) {
    let found = -1;
    for (let i = active; i < puzzle.candidates.length; i += 1) {
      const candidate = puzzle.candidates[i];
      if (candidate && (await isLive(deps, candidate.postId))) {
        found = i;
        break;
      }
    }
    if (found < 0) return replaceGonePosts(deps, puzzle);
    active = found;
    await deps.store.hSet(puzzleKey(date), {
      active: String(active),
      checkedAt: String(nowMs),
    });
  }
  const candidate = puzzle.candidates[active];
  return candidate ? { puzzle, candidate } : null;
}

async function isLive(deps: Deps, postId: string): Promise<boolean> {
  try {
    return await deps.source.isPostLive(postId);
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
    case 'rule':
      return { kind, ...puzzle.rule };
    case 'jargon':
      return { kind, words: puzzle.jargon };
    case 'stats':
      return { kind, ...puzzle.stats };
    case 'icon':
      return { kind, url: puzzle.iconUrl ?? '' };
  }
}
