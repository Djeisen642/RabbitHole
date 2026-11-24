import { Hono } from 'hono';
import type { TaskRequest, TaskResponse } from '@devvit/web/server';

export const scheduler = new Hono();

// Runs daily at 05:00 UTC (midnight ET). Picks tomorrow's puzzle from the
// curated subreddit list and stores it in redis. See PLAN.md, milestone 2.
scheduler.post('/daily-pick', async (c) => {
  await c.req.json<TaskRequest>();
  console.log(
    `daily-pick ran at ${new Date().toISOString()} (not implemented yet)`
  );
  return c.json<TaskResponse>({ status: 'ok' }, 200);
});
