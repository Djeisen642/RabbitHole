/**
 * Storing and loading daily puzzles.
 *
 * Redis keys:
 * - `puzzle:YYYY-MM-DD` hash: `data` (StoredPuzzle JSON), `answer`,
 *   `active` (index of the candidate post being served), `checkedAt` (ms of
 *   the last check that the post and its comment are still live). Expires
 *   PUZZLE_KEEP_DAYS after its date.
 *   (A year: old posts keep playing their own day.)
 * - `used-subs` sorted set: sub name scored by the day number it was used.
 *   Written here when a puzzle is saved; read by the pick (puzzle-pick.ts).
 */
import { addDays, dayNumber } from '../../shared/game/day';
import type { PuzzleDate } from '../../shared/game/day';
import { normalizeSubreddit } from '../../shared/game/rules';
import type { PostCard } from '../../shared/api';
import type { Deps } from './deps';
import {
  asBoolean,
  asNumber,
  asRecord,
  asString,
  asStringArray,
  parseJson,
} from './json';

/**
 * Days a puzzle is kept after its date. Each daily post keeps playing its
 * own day's puzzle (see post-day.ts), so an old post found in the feed or
 * a link still works. A puzzle is a few kilobytes.
 */
export const PUZZLE_KEEP_DAYS = 365;
/**
 * How far back keepRecentPuzzles reaches: past the 3 days puzzles were
 * kept before old posts played their own day.
 */
const KEEP_REACH_DAYS = 7;

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
  /**
   * The community's top post of all time (title masked), shown as the
   * fourth clue. Null when none was usable, or for puzzles made before
   * this clue existed; those rounds show the stats clue instead.
   */
  topPost: { title: string; score: number; createdAt: number } | null;
  iconUrl: string | null;
};

export type PuzzleContent = Omit<StoredPuzzle, 'date'>;

/** Today's puzzle with the candidate post currently being shown. */
export type Served = { puzzle: StoredPuzzle; candidate: StoredCandidate };

export const puzzleKey = (date: PuzzleDate): string => `puzzle:${date}`;

/** Sorted set of picked subs, scored by the day number each was used. */
export const USED_SUBS_KEY = 'used-subs';

/**
 * Seconds from now until a date's keys should go: the end of the day
 * `days` (PUZZLE_KEEP_DAYS for a puzzle) after it, at least a minute.
 */
export function secondsToKeep(
  deps: Deps,
  date: PuzzleDate,
  days: number = PUZZLE_KEEP_DAYS
): number {
  const end = Date.parse(`${addDays(date, days + 1)}T00:00:00Z`);
  return Math.max(60, Math.ceil((end - deps.now().getTime()) / 1000));
}

/**
 * Store a freshly picked puzzle unless the date already has one, and return
 * whichever is stored. HSETNX on `data` makes the first write win.
 */
export async function storeNewPuzzle(
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
  await deps.store.zAdd(USED_SUBS_KEY, {
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
  // Missing on puzzles stored before the top-post clue; those use stats.
  const rawTop = asRecord(p?.topPost);
  const topTitle = asString(rawTop?.title);
  const topScore = asNumber(rawTop?.score);
  const topCreated = asNumber(rawTop?.createdAt);
  const topPost =
    topTitle === null || topScore === null || topCreated === null
      ? null
      : { title: topTitle, score: topScore, createdAt: topCreated };
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
    topPost,
    iconUrl: iconUrl ?? null,
  };
}

/**
 * Give the last few days' puzzles the full PUZZLE_KEEP_DAYS. Puzzles stored
 * when only 3 days were kept would otherwise expire under their posts. Run
 * by the hourly job; a day with no puzzle is skipped.
 */
export async function keepRecentPuzzles(
  deps: Deps,
  today: PuzzleDate
): Promise<void> {
  for (let back = 1; back <= KEEP_REACH_DAYS; back += 1) {
    const date = addDays(today, -back);
    const key = puzzleKey(date);
    if ((await deps.store.hGet(key, 'answer')) !== undefined)
      await deps.store.expire(key, secondsToKeep(deps, date));
  }
}
