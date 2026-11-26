import { Hono } from 'hono';
import type { Context } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { puzzleDateAt } from '../../shared/game/day';
import type { Deps } from '../core/deps';
import { startPoolCheck } from '../core/pool-check';
import { repickPuzzle, runDailyPick } from '../core/puzzle';
import { clearWrongGuesses, resetRound } from '../core/round';

export type MenuOptions = {
  /** Creates today's post and returns its URL. */
  createPost(): Promise<string>;
};

/**
 * Moderator menu actions. devvit.json only shows these items to
 * moderators, but each handler checks again on the server, since the
 * endpoints can be called without the menu.
 */
export function createMenu(deps: Deps, options: MenuOptions): Hono {
  const menu = new Hono();

  const notMod = (c: Context) =>
    c.json<UiResponse>({ showToast: 'Only moderators can do that.' }, 403);

  menu.post('/post-create', async (c) => {
    try {
      if (!(await deps.isModerator())) return notMod(c);
      return c.json<UiResponse>(
        { navigateTo: await options.createPost() },
        200
      );
    } catch (error) {
      console.error(`Error creating post: ${String(error)}`);
      return c.json<UiResponse>({ showToast: 'Failed to create post' }, 400);
    }
  });

  // Picks today's and tomorrow's puzzles now if they're missing.
  menu.post('/pick-puzzle', async (c) => {
    try {
      if (!(await deps.isModerator())) return notMod(c);
      const picks = await runDailyPick(deps, puzzleDateAt(deps.now()));
      const today = picks[0];
      return c.json<UiResponse>(
        {
          showToast: today?.answer
            ? `Today's puzzle is ready${today.fresh ? ' (just picked)' : ''}.`
            : 'No community passed the checks. See the logs.',
        },
        200
      );
    } catch (error) {
      console.error('pick-puzzle failed', error);
      return c.json<UiResponse>({ showToast: 'Picking failed' }, 400);
    }
  });

  // Replaces today's puzzle with a different community, for a bad pick.
  menu.post('/repick-puzzle', async (c) => {
    try {
      if (!(await deps.isModerator())) return notMod(c);
      const date = puzzleDateAt(deps.now());
      const picked = await repickPuzzle(deps, date);
      if (picked === 'busy')
        return c.json<UiResponse>(
          { showToast: 'A pick is already running. Try again in a minute.' },
          200
        );
      if (picked) await clearWrongGuesses(deps, date);
      return c.json<UiResponse>(
        {
          showToast: picked
            ? "Today's puzzle was replaced with a new community."
            : 'No community passed the checks. See the logs.',
        },
        200
      );
    } catch (error) {
      console.error('repick-puzzle failed', error);
      return c.json<UiResponse>({ showToast: 'Replacing failed' }, 400);
    }
  });

  // Clears the moderator's own round for today, so they can replay it.
  menu.post('/reset-round', async (c) => {
    try {
      if (!(await deps.isModerator())) return notMod(c);
      const user = await deps.user();
      if (!user) return c.json<UiResponse>({ showToast: 'Log in first.' }, 200);
      await resetRound(deps, user, puzzleDateAt(deps.now()));
      return c.json<UiResponse>(
        {
          showToast:
            "Your round for today was reset. Reopen today's post to play again.",
        },
        200
      );
    } catch (error) {
      console.error('reset-round failed', error);
      return c.json<UiResponse>({ showToast: 'Reset failed' }, 400);
    }
  });

  // Starts a check of every pool entry; batches continue on the scheduler.
  menu.post('/check-pool', async (c) => {
    try {
      if (!(await deps.isModerator())) return notMod(c);
      const date = puzzleDateAt(deps.now());
      const progress = await startPoolCheck(deps, date);
      const counts = `${String(progress.checked)} of ${String(progress.total)} done`;
      return c.json<UiResponse>(
        {
          showToast: progress.started
            ? `Checking the pool: ${counts}. Results at /api/pool-check.`
            : `A pool check is already running (${counts}). Results at /api/pool-check.`,
        },
        200
      );
    } catch (error) {
      console.error('check-pool failed', error);
      return c.json<UiResponse>({ showToast: 'Pool check failed' }, 400);
    }
  });

  return menu;
}
