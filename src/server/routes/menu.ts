import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { puzzleDateAt } from '../../shared/game/day';
import type { Deps } from '../core/deps';
import { startPoolCheck } from '../core/pool-check';
import { runDailyPick } from '../core/puzzle';

export type MenuOptions = {
  /** Creates today's post and returns its URL. */
  createPost(): Promise<string>;
};

export function createMenu(deps: Deps, options: MenuOptions): Hono {
  const menu = new Hono();

  menu.post('/post-create', async (c) => {
    try {
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

  // Starts a check of every pool entry; batches continue on the scheduler.
  menu.post('/check-pool', async (c) => {
    try {
      const date = puzzleDateAt(deps.now());
      const progress = await startPoolCheck(deps, date);
      return c.json<UiResponse>(
        {
          showToast: `Checking the pool: ${progress.checked} of ${progress.total} done. Results at /api/pool-check.`,
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
