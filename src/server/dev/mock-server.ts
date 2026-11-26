/**
 * Local mock mode: plays the whole game without Reddit. Serves the built
 * client from dist/client and mounts the same API handlers the app uses on
 * Devvit, wired to the made-up fixtures, an in-memory store and a fake
 * player. Run with `npm run dev:mock`.
 *
 * Extra routes, for local play only:
 * - POST /mock/reset clears your round (and everything else) and re-picks.
 * - POST /mock/user?name=alice switches to another fake player.
 * - POST /mock/next-day moves the clock a day on and picks that day's
 *   puzzle, so a player can be taken through several rounds (the first
 *   rounds with options, a run of losses) without waiting for midnight.
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
  deps.store = new MemoryStore(() => deps.now());
  await seed();
  return c.json({ ok: true });
});
app.post('/mock/user', (c) => {
  const name = (c.req.query('name') ?? 'mock_player').replace(/[^\w-]/g, '');
  deps.setUser({ id: `t2_${name}`, username: name });
  return c.json({ ok: true, username: name });
});
app.post('/mock/next-day', async (c) => {
  deps.setNow(new Date(deps.now().getTime() + 86_400_000));
  await seed();
  return c.json({ ok: true, date: puzzleDateAt(deps.now()) });
});
app.post('/mock/check-pool', async (c) =>
  c.json(await startPoolCheck(deps, puzzleDateAt(deps.now())))
);
app.get('/', (c) => c.redirect('/splash.html'));
app.use('/*', serveStatic({ root: ROOT }));

await seed();
// Loopback only: the mock server has no login and resets on request, so it
// must not be reachable from the network.
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, (info) => {
  console.log(`r/abbit_hole mock mode: http://127.0.0.1:${info.port}/`);
  console.log(
    'Splash: /splash.html  Game: /game.html  Reset: POST /mock/reset'
  );
});
