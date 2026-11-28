import { Hono } from 'hono';
import type { OnAppInstallRequest, TriggerResponse } from '@devvit/web/shared';
import { runDaily } from '../core/daily-post';
import type { Deps } from '../core/deps';

export function createTriggers(deps: Deps): Hono {
  const triggers = new Hono();

  // Installing the app runs the same daily run as the hourly scheduler, so
  // the first post is the real, recorded daily post rather than a second
  // one the scheduler doesn't know about.
  triggers.post('/on-app-install', async (c) => {
    try {
      const input = await c.req.json<OnAppInstallRequest>();
      const outcome = await runDaily(deps);
      return c.json<TriggerResponse>(
        {
          status: 'success',
          message: `Install (${input.type}): ${outcome.kind === 'no-puzzle' ? 'no puzzle yet, the scheduler retries hourly' : outcome.url}`,
        },
        200
      );
    } catch (error) {
      console.error(`Install run failed: ${String(error)}`);
      return c.json<TriggerResponse>(
        { status: 'error', message: 'Install run failed' },
        400
      );
    }
  });

  return triggers;
}
