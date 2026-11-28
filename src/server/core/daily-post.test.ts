import { describe, expect, it } from 'vitest';
import {
  dailyPostKey,
  dailyTitle,
  postDaily,
  recordDailyPost,
} from './daily-post';
import { createMockDeps } from './mock/mock-deps';
import { postDayKey } from './post-day';

const NOW = new Date('2026-11-26T05:00:00Z');
const DATE = '2026-11-26';

describe('daily post', () => {
  it('posts once, pins the spoiler comment and tells the moderators', async () => {
    const deps = createMockDeps({ now: NOW, quiet: true });
    const first = await postDaily(deps, DATE, 'AskOldPeople');
    expect(first.kind).toBe('posted');
    expect(deps.posts).toHaveLength(1);
    expect(deps.posts[0]?.title).toBe(dailyTitle(DATE));
    expect(deps.posts[0]?.title).toMatch(/^r\/abbit_hole #1:/);
    expect(deps.pinned[0]?.postId).toBe(deps.posts[0]?.id);
    expect(deps.pinned[0]?.markdown).toMatch(/spoiler/);
    expect(deps.notices).toHaveLength(1);
    expect(deps.notices[0]?.subject).toBe('r/abbit_hole #1 is r/AskOldPeople');
    expect(deps.notices[0]?.markdown).toContain(deps.posts[0]?.url);

    const again = await postDaily(deps, DATE, 'AskOldPeople');
    expect(again).toEqual({ kind: 'already', url: deps.posts[0]?.url });
    expect(deps.posts).toHaveLength(1);
    expect(deps.notices).toHaveLength(1);
  });

  it('retries a post that failed to be made', async () => {
    const deps = createMockDeps({ now: NOW, quiet: true });
    const down = {
      ...deps,
      createPost: () => Promise.reject(new Error('Reddit is down')),
    };
    await expect(postDaily(down, DATE, 'AskOldPeople')).rejects.toThrow();
    expect(await deps.store.get(dailyPostKey(DATE))).toBeUndefined();
    expect(deps.posts).toHaveLength(0);
    expect((await postDaily(deps, DATE, 'AskOldPeople')).kind).toBe('posted');
  });

  it('still posts when pinning or the notice fails', async () => {
    const deps = createMockDeps({ now: NOW, quiet: true });
    deps.pinComment = () => Promise.reject(new Error('no'));
    deps.notifyMods = () => Promise.reject(new Error('no'));
    expect((await postDaily(deps, DATE, 'AskOldPeople')).kind).toBe('posted');
    expect(deps.logs.join('\n')).toMatch(/pinning the comment failed/);
  });

  it('tells the moderators once when a day has no puzzle', async () => {
    const deps = createMockDeps({ now: NOW, quiet: true });
    expect((await postDaily(deps, DATE, null)).kind).toBe('no-puzzle');
    await postDaily(deps, DATE, null);
    expect(deps.posts).toHaveLength(0);
    expect(deps.notices).toHaveLength(1);
    expect(deps.notices[0]?.subject).toMatch(/no puzzle/);
    // A pick that works later in the day still gets posted.
    expect((await postDaily(deps, DATE, 'AskOldPeople')).kind).toBe('posted');
  });

  it("doesn't post a day a moderator already posted by hand", async () => {
    const deps = createMockDeps({ now: NOW, quiet: true });
    await recordDailyPost(deps, DATE, {
      id: 't3_abc',
      url: 'https://www.reddit.com/r/x/comments/abc/',
    });
    expect(await postDaily(deps, DATE, 'AskOldPeople')).toEqual({
      kind: 'already',
      url: 'https://www.reddit.com/r/x/comments/abc/',
    });
    expect(deps.posts).toHaveLength(0);
    expect(await deps.store.get(postDayKey('t3_abc'))).toBe(DATE);
  });

  it('ties the post to its date, so it keeps playing that day', async () => {
    const deps = createMockDeps({ now: NOW, quiet: true });
    await postDaily(deps, DATE, 'AskOldPeople');
    const id = deps.posts[0]?.id ?? '';
    expect(await deps.store.get(postDayKey(id))).toBe(DATE);
  });
});
