/**
 * The daily post: once a day's puzzle exists, the app posts it in its own
 * community with a numbered title, pins a comment asking for spoiler tags
 * and tells the moderators which community was picked, so a bad pick can be
 * replaced before many people play it. The hourly scheduler run calls this;
 * a day that already has its post is left alone, so the retries are free.
 *
 * Redis: `daily-post:YYYY-MM-DD` string, the post's link once it's made
 * (a lock token while one is being made). `daily-post-missing:YYYY-MM-DD`
 * marks that the moderators were told a day has no puzzle.
 */
import { puzzleNumber } from '../../shared/game/day';
import type { PuzzleDate } from '../../shared/game/day';
import type { Deps } from './deps';
import { tryLock } from './lock';

/** How long the markers live: long enough to outlast the day they're for. */
const MARKER_SECONDS = 3 * 86_400;

export const dailyPostKey = (date: string): string => `daily-post:${date}`;
const missingKey = (date: string): string => `daily-post-missing:${date}`;

export function dailyTitle(date: PuzzleDate): string {
  return `r/abbit_hole #${String(puzzleNumber(date))}: which subreddit is this post from?`;
}

export const SPOILER_COMMENT =
  'Solved it? Please hide the answer in a spoiler tag, like `>!r/answer!<`, so everyone else can still play. The **Copy result** text is already spoiler-free.';

export type DailyPostOutcome =
  | { kind: 'posted'; url: string }
  | { kind: 'already'; url: string }
  | { kind: 'no-puzzle' };

const expiry = (deps: Deps): Date =>
  new Date(deps.now().getTime() + MARKER_SECONDS * 1000);

/** Take a once-a-day marker; true only for the one caller that set it. */
const claim = (deps: Deps, key: string): Promise<boolean> =>
  tryLock(deps.store, key, MARKER_SECONDS * 1000, deps.now());

/**
 * Make `date`'s post, pin the spoiler comment and tell the moderators, all
 * at most once per day. `answer` is the day's pick, or null when nothing
 * passed the checks. A post that fails to be made is retried on the next
 * call; the comment and the notice are best effort, since the post is what
 * players need.
 */
export async function postDaily(
  deps: Deps,
  date: PuzzleDate,
  answer: string | null
): Promise<DailyPostOutcome> {
  const key = dailyPostKey(date);
  if (!answer) {
    if (await claim(deps, missingKey(date)))
      await tell(
        deps,
        `r/abbit_hole has no puzzle for ${date}`,
        `No community passed the checks for ${date}, so there's no post yet. The app tries again every hour. To try now, use **Pick today's r/abbit_hole puzzle** from the subreddit's mod menu.`
      );
    return { kind: 'no-puzzle' };
  }

  if (!(await claim(deps, key)))
    return { kind: 'already', url: (await deps.store.get(key)) ?? '' };

  let post: { id: string; url: string };
  try {
    post = await deps.createPost(dailyTitle(date));
  } catch (error) {
    await deps.store.del(key);
    throw error;
  }
  await deps.store.set(key, post.url, { expiration: expiry(deps) });

  try {
    await deps.pinComment(post.id, SPOILER_COMMENT);
  } catch (error) {
    deps.log(
      `daily post ${date}: pinning the comment failed: ${String(error)}`
    );
  }
  await tell(
    deps,
    `r/abbit_hole #${String(puzzleNumber(date))} is r/${answer}`,
    `Today's post is up: ${post.url}\n\nThe answer is **r/${answer}**. If it's a bad pick (mostly photos, a post about the sub itself, anything off), use **Replace today's r/abbit_hole puzzle** from the subreddit's mod menu.`
  );
  return { kind: 'posted', url: post.url };
}

/**
 * Record a post a moderator made by hand from the menu, so the scheduler
 * doesn't post the same day again.
 */
export async function recordDailyPost(
  deps: Deps,
  date: PuzzleDate,
  url: string
): Promise<void> {
  await deps.store.set(dailyPostKey(date), url, { expiration: expiry(deps) });
}

async function tell(deps: Deps, subject: string, body: string): Promise<void> {
  try {
    await deps.notifyMods(subject, body);
  } catch (error) {
    deps.log(`moderator notice failed: ${String(error)}`);
  }
}
