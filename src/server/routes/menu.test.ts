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
  let posts = 0;
  const menu = createMenu(deps, {
    createPost: () => {
      posts += 1;
      return Promise.resolve('https://reddit.com/r/test/comments/abc');
    },
  });
  const post = (path: string) => menu.request(path, { method: 'POST' });
  return { deps, post, posts: () => posts };
}

describe('moderator menu actions', () => {
  it('refuses every action to a non-moderator on the server', async () => {
    const { deps, post, posts } = setup();
    deps.isModerator = () => Promise.resolve(false);
    for (const path of ['/post-create', '/pick-puzzle', '/check-pool']) {
      const res = await post(path);
      expect(res.status).toBe(403);
      expect(await toast(res)).toMatch(/only moderators/i);
    }
    expect(posts()).toBe(0);
    expect(await deps.store.hGet('puzzle:2026-11-25', 'data')).toBeUndefined();
    expect(deps.source.calls.subredditFacts).toBe(0);
  });

  it('runs them for a moderator', async () => {
    const { post, posts } = setup();
    expect((await post('/post-create')).status).toBe(200);
    expect(posts()).toBe(1);
    expect(await toast(await post('/pick-puzzle'))).toMatch(/ready/);
  });

  it('says so when a pool check is already running', async () => {
    const { deps, post } = setup();
    await runPoolCheckBatch(deps, '2026-11-25', 2);
    const res = await post('/check-pool');
    expect(res.status).toBe(200);
    expect(await toast(res)).toMatch(/already running/);
  });
});
