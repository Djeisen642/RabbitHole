import { describe, expect, it } from 'vitest';
import { createMockDeps } from '../core/mock/mock-deps';
import { runPoolCheckBatch } from '../core/pool-check';
import { createMenu } from './menu';

const NOW = new Date('2026-11-25T15:00:00Z');

async function toast(res: Response): Promise<string> {
  const body: unknown = await res.json();
  return typeof body === 'object' &&
    body !== null &&
    'showToast' in body &&
    typeof body.showToast === 'string'
    ? body.showToast
    : '';
}

function setup() {
  const deps = createMockDeps({ now: NOW, quiet: true });
  const menu = createMenu(deps);
  const post = (path: string) => menu.request(path, { method: 'POST' });
  return { deps, post, posts: () => deps.posts.length };
}

describe('moderator menu actions', () => {
  it('refuses every action to a non-moderator on the server', async () => {
    const { deps, post, posts } = setup();
    deps.isModerator = () => Promise.resolve(false);
    for (const path of [
      '/post-create',
      '/pick-puzzle',
      '/repick-puzzle',
      '/reset-round',
      '/check-pool',
    ]) {
      const res = await post(path);
      expect(res.status).toBe(403);
      expect(await toast(res)).toMatch(/only moderators/i);
    }
    expect(posts()).toBe(0);
    expect(await deps.store.hGet('puzzle:2026-11-25', 'data')).toBeUndefined();
    expect(deps.source.calls.subredditFacts).toBe(0);
  });

  it('runs them for a moderator', async () => {
    const { deps, post, posts } = setup();
    expect((await post('/post-create')).status).toBe(200);
    expect(posts()).toBe(1);
    expect(deps.pinned).toHaveLength(1);
    expect(await deps.store.get('daily-post:2026-11-25')).toBe(
      deps.posts[0]?.url
    );
    expect(await toast(await post('/pick-puzzle'))).toMatch(/ready/);
  });

  it("replaces today's puzzle with a different community", async () => {
    const { deps, post } = setup();
    await post('/pick-puzzle');
    const before = await deps.store.hGet('puzzle:2026-11-25', 'answer');
    await deps.store.zIncrBy('wrong:2026-11-25', 'Cooking', 1);
    expect(await toast(await post('/repick-puzzle'))).toMatch(/replaced/);
    const after = await deps.store.hGet('puzzle:2026-11-25', 'answer');
    expect(after).toBeDefined();
    expect(after).not.toBe(before);
    expect(
      await deps.store.zScore('wrong:2026-11-25', 'Cooking')
    ).toBeUndefined();
  });

  it("clears only the moderator's own round for today", async () => {
    const { deps, post } = setup();
    const me = await deps.user();
    if (!me) throw new Error('mock deps should have a user');
    await deps.store.hSet(`round:2026-11-25:${me.id}`, { '0': 'Cooking' });
    await deps.store.hSet('round:2026-11-25:t2_other', { '0': 'Cooking' });
    expect(await toast(await post('/reset-round'))).toMatch(/reset/);
    expect(await deps.store.hGetAll(`round:2026-11-25:${me.id}`)).toEqual({});
    expect(await deps.store.hGet('round:2026-11-25:t2_other', '0')).toBe(
      'Cooking'
    );
  });

  it('says so when a pool check is already running', async () => {
    const { deps, post } = setup();
    await runPoolCheckBatch(deps, '2026-11-25', 2);
    const res = await post('/check-pool');
    expect(res.status).toBe(200);
    expect(await toast(res)).toMatch(/already running/);
  });
});
