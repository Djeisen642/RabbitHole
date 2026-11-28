/**
 * Which day's puzzle a post plays. Each daily post is tied to its own date,
 * so an older post keeps playing its own puzzle (for fun, not the streak),
 * and its comments and pinned spoiler still match what's on screen. A post
 * that isn't a daily one (the post made when the app was installed, a
 * playtest post) has no date and always plays today's.
 *
 * Redis: `post-day:{postId}` string, the post's puzzle date, or `today`
 * for a post with none. No expiry: one short string per post.
 *
 * Daily posts are recorded when they're made. A post made before that was
 * kept is matched once, on its first load, by the puzzle number in its
 * title (see dailyTitle).
 */
import {
  isPuzzleDate,
  puzzleDateAt,
  puzzleDateFor,
} from '../../shared/game/day';
import type { PuzzleDate } from '../../shared/game/day';
import type { Deps } from './deps';

const TODAY = 'today';
const TITLE_RE = /^r\/abbit_?hole #(\d+):/i;

const bare = (postId: string): string => postId.replace(/^t3_/, '');
export const postDayKey = (postId: string): string =>
  `post-day:${bare(postId)}`;

/** The puzzle date a daily post's title names, or null. */
export function dateFromTitle(title: string): PuzzleDate | null {
  const m = TITLE_RE.exec(title);
  const number = Number(m?.[1]);
  return Number.isSafeInteger(number) && number >= 1
    ? puzzleDateFor(number)
    : null;
}

/** Tie a new daily post to its date. */
export async function recordPostDay(
  deps: Deps,
  postId: string,
  date: PuzzleDate
): Promise<void> {
  await deps.store.set(postDayKey(postId), date);
}

/**
 * The date of the puzzle the request's post plays: its own date for a
 * daily post, today's for any other post or a request from no post. Never
 * a date after today.
 */
export async function postDay(
  deps: Deps,
  today: PuzzleDate
): Promise<PuzzleDate> {
  const postId = deps.postId();
  if (!postId) return today;
  const key = postDayKey(postId);
  const saved = await deps.store.get(key);
  if (saved === TODAY) return today;
  if (saved !== undefined && isPuzzleDate(saved))
    return saved < today ? saved : today;

  let title: string | null;
  try {
    title = await deps.postTitle(postId);
  } catch (error) {
    // Can't tell right now: play today's and look again next load.
    deps.log(`post day ${postId}: reading the title failed: ${String(error)}`);
    return today;
  }
  if (title === null) return today;
  const date = dateFromTitle(title);
  const own = date !== null && date <= today ? date : null;
  await deps.store.set(key, own ?? TODAY);
  return own !== null && own < today ? own : today;
}

/** The puzzle a request plays: its post's day, and today. */
export type PlayDay = { date: PuzzleDate; today: PuzzleDate; past: boolean };

/** The request's PlayDay, from its post (see postDay) and the clock. */
export async function playDay(deps: Deps): Promise<PlayDay> {
  const today = puzzleDateAt(deps.now());
  const date = await postDay(deps, today);
  return { date, today, past: date < today };
}
