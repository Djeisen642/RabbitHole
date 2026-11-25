/**
 * Local mock mode: plays the whole game without Reddit. Serves the built
 * client from dist/client and mounts the same API handlers the app uses on
 * Devvit, wired to the made-up fixtures, an in-memory store and a fake
 * player. Run with `npm run dev:mock`.
 *
 * Extra routes, for local play only:
 * - POST /mock/reset clears your round (and everything else) and re-picks.
 * - POST /mock/user?name=alice switches to another fake player.
 * - POST /mock/check-pool runs the moderator pool check over the fixture
 *   subs; read it at GET /api/pool-check.
 */
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync } from 'node:fs';
import { puzzleDateAt } from '../../shared/game/day';
import { MemoryStore } from '../core/store';
import { createMockDeps } from '../core/mock/mock-deps';
import { runPoolCheckBatch, startPoolCheck } from '../core/pool-check';
import { runDailyPick } from '../core/puzzle';
import { createApi } from '../routes/api';

const ROOT = 'dist/client';
const port = Number(process.env.PORT ?? '5174');

if (!existsSync(`${ROOT}/game.html`)) {
  console.error('Build the client first: npm run build (dev:mock does this).');
  process.exit(1);
}

const deps = createMockDeps({ quiet: false });
// Run every pool-check batch straight away instead of through a scheduler.
deps.scheduleNextPoolCheck = async (date) => {
  await runPoolCheckBatch(deps, date);
};

async function seed(): Promise<void> {
  const picks = await runDailyPick(deps, puzzleDateAt(deps.now()));
  for (const p of picks)
    console.log(`mock puzzle ${p.date}: r/${p.answer ?? '?'}`);
}

const app = new Hono();
app.route('/api', createApi(deps));
app.post('/mock/reset', async (c) => {
  deps.store = new MemoryStore();
  await seed();
  return c.json({ ok: true });
});
app.post('/mock/user', (c) => {
  const name = (c.req.query('name') ?? 'mock_player').replace(/[^\w-]/g, '');
  deps.setUser({ id: `t2_${name}`, username: name });
  return c.json({ ok: true, username: name });
});
app.post('/mock/check-pool', async (c) =>
  c.json(await startPoolCheck(deps, puzzleDateAt(deps.now())))
);
app.get('/', (c) => c.redirect('/splash.html'));
app.use('/*', serveStatic({ root: ROOT }));

await seed();
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`r/abbitHole mock mode: http://localhost:${info.port}/`);
  console.log(
    'Splash: /splash.html  Game: /game.html  Reset: POST /mock/reset'
  );
});
