import { describe, expect, it } from 'vitest';
import { dailyTitle } from './daily-post';
import { createMockDeps } from './mock/mock-deps';
import { dateFromTitle, postDay, postDayKey, recordPostDay } from './post-day';

const NOW = new Date('2026-11-28T15:00:00Z');
const TODAY = '2026-11-28';

describe('dateFromTitle', () => {
  it('reads the puzzle number of a daily title', () => {
    expect(dateFromTitle(dailyTitle('2026-11-26'))).toBe('2026-11-26');
    expect(
      dateFromTitle('r/abbitHole #2: which subreddit is this post from?')
    ).toBe('2026-11-27');
    expect(dateFromTitle('abbit-hole')).toBeNull();
    expect(dateFromTitle('r/abbit_hole #0: nope')).toBeNull();
  });
});

describe('postDay', () => {
  it('is today with no post, or for a post with no day', async () => {
    const deps = createMockDeps({ now: NOW, quiet: true });
    expect(await postDay(deps, TODAY)).toBe(TODAY);
    const post = await deps.createPost('abbit-hole');
    deps.setPostId(post.id);
    expect(await postDay(deps, TODAY)).toBe(TODAY);
    expect(await deps.store.get(postDayKey(post.id))).toBe('today');
  });

  it("is a daily post's own day, recorded or read from its title", async () => {
    const deps = createMockDeps({ now: NOW, quiet: true });
    const recorded = await deps.createPost('anything');
    await recordPostDay(deps, recorded.id, '2026-11-27');
    deps.setPostId(recorded.id);
    expect(await postDay(deps, TODAY)).toBe('2026-11-27');

    // Made before posts were recorded: matched by title, then remembered.
    const old = await deps.createPost(dailyTitle('2026-11-26'));
    deps.setPostId(old.id);
    expect(await postDay(deps, TODAY)).toBe('2026-11-26');
    expect(await deps.store.get(postDayKey(old.id))).toBe('2026-11-26');
  });

  it('never plays a day after today', async () => {
    const deps = createMockDeps({ now: NOW, quiet: true });
    const post = await deps.createPost(dailyTitle('2026-12-01'));
    deps.setPostId(post.id);
    expect(await postDay(deps, TODAY)).toBe(TODAY);
  });

  it("plays today's when the title can't be read, and tries again later", async () => {
    const deps = createMockDeps({ now: NOW, quiet: true });
    const post = await deps.createPost(dailyTitle('2026-11-26'));
    deps.setPostId(post.id);
    const title = deps.postTitle.bind(deps);
    deps.postTitle = () => Promise.reject(new Error('Reddit is down'));
    expect(await postDay(deps, TODAY)).toBe(TODAY);
    expect(await deps.store.get(postDayKey(post.id))).toBeUndefined();
    deps.postTitle = title;
    expect(await postDay(deps, TODAY)).toBe('2026-11-26');
  });
});
