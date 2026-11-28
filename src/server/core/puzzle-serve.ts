/**
 * Serving a day's puzzle: checking its post and comment are still up,
 * falling back to another stored post or a refill, picking on demand, and
 * a moderator's repick.
 *
 * Redis keys:
 * - `pick-lock:YYYY-MM-DD` lock guarding an on-demand pick or refill.
 * - `live-lock:YYYY-MM-DD` lock guarding the liveness check.
 */
import type { PuzzleDate } from '../../shared/game/day';
import { POOL, findEntry } from '../../shared/pool';
import type { Deps } from './deps';
import { tryLock } from './lock';
import { savePuzzle, loadPuzzle, puzzleKey } from './puzzle-store';
import type { StoredCandidate, StoredPuzzle, Served } from './puzzle-store';
import type { Built } from './puzzle-build';
import { tryBuild } from './puzzle-build';
import { pickPuzzle } from './puzzle-pick';

/** How long a liveness check of today's post is trusted. */
export const LIVE_CHECK_MS = 10 * 60_000;
/** How long one request may hold the liveness check before another may. */
export const LIVE_LOCK_MS = 30_000;

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

/**
 * A moderator's do-over: drop the date's puzzle and pick a different
 * community (the old answer counts as recently used, so it isn't picked
 * again). Rounds handle the switch as after replaceGonePosts: finished
 * ones stay as they ended, ones in play start over. Returns 'busy' when
 * another pick for the date is running.
 */
export async function repickPuzzle(
  deps: Deps,
  date: PuzzleDate
): Promise<StoredPuzzle | null | 'busy'> {
  const done = await withPickLock(deps, date, async () => {
    const old = await loadPuzzle(deps, date);
    await deps.store.del(puzzleKey(date));
    const picked = await pickPuzzle(deps, date);
    deps.log(
      `repick ${date}: r/${old?.puzzle.answer ?? 'none'} -> r/${picked?.answer ?? 'none'}`
    );
    return { picked };
  });
  return done ? done.picked : 'busy';
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
export function servePuzzle(
  deps: Deps,
  date: PuzzleDate
): Promise<Served | null> {
  return serve(deps, date, true);
}

/**
 * An earlier day's puzzle, for its own post. Checked like today's, but
 * never picked or refilled: a missing day, or one whose posts are all gone,
 * is null, since a new community wouldn't match the post's comments.
 */
export function servePastPuzzle(
  deps: Deps,
  date: PuzzleDate
): Promise<Served | null> {
  return serve(deps, date, false);
}

async function serve(
  deps: Deps,
  date: PuzzleDate,
  today: boolean
): Promise<Served | null> {
  const loaded = await loadPuzzle(deps, date);
  if (!loaded)
    return today
      ? firstCandidate(
          await withPickLock(deps, date, () => pickPuzzle(deps, date))
        )
      : null;

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
    return checkCandidates(deps, puzzle, active, nowMs, today);
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
  nowMs: number,
  refill: boolean
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
  return refill ? replaceGonePosts(deps, puzzle) : null;
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
