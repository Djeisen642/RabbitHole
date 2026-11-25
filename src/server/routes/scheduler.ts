import { Hono } from 'hono';
import type { TaskRequest, TaskResponse } from '@devvit/web/server';
import { puzzleDateAt } from '../../shared/game/day';
import type { Deps } from '../core/deps';
import { asRecord, asString } from '../core/json';
import { runPoolCheckBatch } from '../core/pool-check';
import { runDailyPick } from '../core/puzzle';

export function createScheduler(deps: Deps): Hono {
  const scheduler = new Hono();

  // Runs daily at 05:00 UTC: midnight ET in winter, 1 AM in summer. That
  // hour's gap is fine because each run also picks tomorrow's puzzle, so the
  // new day's puzzle already exists when midnight ET comes.
  scheduler.post('/daily-pick', async (c) => {
    try {
      await c.req.json<TaskRequest>();
      const picks = await runDailyPick(deps, puzzleDateAt(deps.now()));
      for (const p of picks)
        deps.log(
          `daily-pick ${p.date}: ${p.answer ? `r/${p.answer}` : 'none'}${p.fresh ? ' (new)' : ''}`
        );
    } catch (error) {
      console.error('daily-pick failed', error);
    }
    return c.json<TaskResponse>({ status: 'ok' }, 200);
  });

  // One batch of a moderator's "Check pool"; queues the next batch itself.
  scheduler.post('/pool-check', async (c) => {
    try {
      const task = await c.req.json<TaskRequest>();
      const date =
        asString(asRecord(task.data)?.date) ?? puzzleDateAt(deps.now());
      await runPoolCheckBatch(deps, date);
    } catch (error) {
      console.error('pool-check failed', error);
    }
    return c.json<TaskResponse>({ status: 'ok' }, 200);
  });

  return scheduler;
}
