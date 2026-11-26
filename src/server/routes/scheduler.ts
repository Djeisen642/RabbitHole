import { Hono } from 'hono';
import type { TaskRequest, TaskResponse } from '@devvit/web/server';
import { puzzleDateAt } from '../../shared/game/day';
import type { Deps } from '../core/deps';
import { asRecord, asString } from '../core/json';
import { runPoolCheckBatch } from '../core/pool-check';
import { postDaily } from '../core/daily-post';
import { runDailyPick } from '../core/puzzle';

export function createScheduler(deps: Deps): Hono {
  const scheduler = new Hono();

  // Runs at the top of every hour. Each run picks today's and tomorrow's
  // puzzles if they're missing and makes today's post if it isn't up yet,
  // so the post goes up in the first run after midnight ET (summer or
  // winter) and a failed pick or post is retried an hour later. Runs that
  // find everything done read nothing from Reddit.
  scheduler.post('/daily-pick', async (c) => {
    try {
      await c.req.json<TaskRequest>();
      const today = puzzleDateAt(deps.now());
      const picks = await runDailyPick(deps, today);
      for (const p of picks)
        if (p.fresh || !p.answer)
          deps.log(
            `daily-pick ${p.date}: ${p.answer ? `r/${p.answer}` : 'none'}${p.fresh ? ' (new)' : ''}`
          );
      const posted = await postDaily(deps, today, picks[0]?.answer ?? null);
      if (posted.kind === 'posted')
        deps.log(`daily post ${today}: ${posted.url}`);
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
