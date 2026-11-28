import { describe, expect, it } from 'vitest';
import { createMockDeps } from '../core/mock/mock-deps';
import { createScheduler } from './scheduler';
import { createTriggers } from './triggers';

const NOW = new Date('2026-11-25T15:00:00Z');

const json = (body: object): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

describe('install trigger', () => {
  it('makes the real daily post, which the scheduler then leaves alone', async () => {
    const deps = createMockDeps({ now: NOW, quiet: true });
    const install = await createTriggers(deps).request(
      '/on-app-install',
      json({ type: 'AppInstall' })
    );
    expect(install.status).toBe(200);
    expect(deps.posts).toHaveLength(1);
    expect(deps.pinned).toHaveLength(1);
    expect(await deps.store.get('daily-post:2026-11-25')).toBe(
      deps.posts[0]?.url
    );

    await createScheduler(deps).request(
      '/daily-pick',
      json({ name: 'daily-pick' })
    );
    expect(deps.posts).toHaveLength(1);
  });
});
