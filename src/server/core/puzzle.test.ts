import { describe, expect, it } from 'vitest';
import { POOL, findEntry } from '../../shared/pool';
import type { PoolEntry } from '../../shared/pool';
import { MOCK_SALT, createMockDeps } from './mock/mock-deps';
import { MOCK_POOL, createMockSource } from './mock/mock-source';
import { readPoolCheck, runPoolCheckBatch, startPoolCheck } from './pool-check';
import { addDays } from '../../shared/game/day';
import {
  LIVE_CHECK_MS,
  PUZZLE_KEEP_DAYS,
  REUSE_DAYS,
  buildPuzzle,
  checkSub,
  loadPuzzle,
  parseStoredPuzzle,
  pickOrder,
  pickPuzzle,
  pickSalt,
  randomSalt,
  runDailyPick,
  savePuzzle,
  servePuzzle,
} from './puzzle';

const NOW = new Date('2026-11-25T15:00:00Z');
const entry = (name: string): PoolEntry => {
  const found = findEntry(name, POOL);
  if (!found) throw new Error(`no pool entry ${name}`);
  return found;
};

describe('pickOrder', () => {
  it('is the same for the same date and differs between dates', () => {
    const order = (date: string) =>
      pickOrder(POOL, date, new Set(), MOCK_SALT).map((e) => e.name);
    const a = order('2026-12-01');
    expect(a).toEqual(order('2026-12-01'));
    expect(a).not.toEqual(order('2026-12-02'));
    expect(a).toHaveLength(POOL.length);
  });

  it('depends on the secret salt, not just the date', () => {
    const order = (salt: string) =>
      pickOrder(POOL, '2026-12-01', new Set(), salt).map((e) => e.name);
    expect(order('salt-a')).not.toEqual(order('salt-b'));
  });

  it('leaves out recently used subs', () => {
    const order = pickOrder(
      POOL,
      '2026-12-01',
      new Set(['breadit', 'canada']),
      MOCK_SALT
    );
    expect(order.map((e) => e.name)).not.toContain('Breadit');
    expect(order.map((e) => e.name)).not.toContain('canada');
  });
});

describe('checkSub against the mock source', () => {
  const deps = createMockDeps({ now: NOW, quiet: true });

  it('passes a healthy sub and samples its good titles', async () => {
    const check = await checkSub(deps.source, entry('Breadit'));
    expect(check.ok).toBe(true);
    expect(check.goodPosts).toBe(2);
    expect(check.sampleTitles.length).toBeLessThanOrEqual(3);
    expect(check.sampleTitles.join(' ')).not.toMatch(/breadit/i);
  });

  it('fails a sub that does not exist', async () => {
    const check = await checkSub(deps.source, {
      name: 'NoSuchSubHere',
      aliases: [],
      category: 'hobby',
    });
    expect(check).toMatchObject({ ok: false, problem: 'not found' });
  });

  it('fails a sub under the member minimum', async () => {
    const check = await checkSub(deps.source, entry('Lighthouses'));
    expect(check.ok).toBe(false);
    expect(check.problem).toMatch(/members/);
  });

  it('skips news posts on a news-heavy sub', async () => {
    const strict = await buildPuzzle(deps.source, entry('canada'));
    expect(
      'puzzle' in strict && strict.puzzle.candidates.map((c) => c.postId)
    ).toEqual(['t3_mockca1']);
  });

  it('survives a source that throws', async () => {
    const broken = createMockDeps({ now: NOW, quiet: true });
    broken.source.subredditFacts = () => Promise.reject(new Error('boom'));
    const check = await checkSub(broken.source, entry('Breadit'));
    expect(check).toMatchObject({ ok: false, problem: 'not found' });
  });
});

describe('buildPuzzle', () => {
  it('builds every clue from a good sub', async () => {
    const deps = createMockDeps({ now: NOW, quiet: true });
    const built = await buildPuzzle(deps.source, entry('Breadit'));
    if (!('puzzle' in built)) throw new Error(built.problem);
    const p = built.puzzle;
    expect(p.answer).toBe('Breadit');
    expect(p.hasCustomIcon).toBe(true);
    expect(p.candidates.map((c) => c.postId)).toEqual([
      't3_mockbr1',
      't3_mockbr2',
    ]);
    expect(p.candidates[0]?.topComment.body).toMatch(/scoring angle/);
    expect(p.rule.title).toBe('Share your recipe');
    expect(p.jargon.length).toBeGreaterThanOrEqual(3);
    expect(p.jargon).toContain('crumb');
    expect(p.stats).toEqual({ subscribers: 1_240_000, createdYear: 2011 });
  });

  it('takes no jargon from NSFW, spoiler or removed post titles', async () => {
    const deps = createMockDeps({ now: NOW, quiet: true });
    const real = createMockSource();
    deps.source.topPosts = async (sub, timeframe, limit) => {
      const posts = await real.topPosts(sub, timeframe, limit);
      const base = posts[0];
      if (!base) return posts;
      // Each hidden word appears twice, so it would rank as jargon.
      const extra = (id: string, title: string, over: object) => ({
        ...base,
        id,
        title,
        ...over,
      });
      return [
        ...posts,
        extra('t3_x1', 'Zzlewdword zzlewdword again', { nsfw: true }),
        extra('t3_x2', 'Zzlewdword zzlewdword more', { nsfw: true }),
        extra('t3_x3', 'Zzspoilerword reveal', { spoiler: true }),
        extra('t3_x4', 'Zzspoilerword reveal', { spoiler: true }),
        extra('t3_x5', 'Zzremovedword gone', { removed: true }),
        extra('t3_x6', 'Zzremovedword gone', { removed: true }),
      ];
    };
    const built = await buildPuzzle(deps.source, entry('Breadit'));
    if (!('puzzle' in built)) throw new Error(built.problem);
    const words = built.puzzle.jargon.join(' ');
    expect(words).not.toMatch(/zzlewdword|zzspoilerword|zzremovedword/);
    expect(built.puzzle.jargon.length).toBeGreaterThanOrEqual(3);
  });

  it('marks a sub without a custom icon', async () => {
    const deps = createMockDeps({ now: NOW, quiet: true });
    const built = await buildPuzzle(deps.source, entry('houseplants'));
    expect('puzzle' in built && built.puzzle.hasCustomIcon).toBe(false);
  });
});

describe('pickPuzzle', () => {
  it('is deterministic for a date', async () => {
    const a = createMockDeps({ now: NOW, quiet: true });
    const b = createMockDeps({ now: NOW, quiet: true });
    const pa = await pickPuzzle(a, '2026-12-03');
    const pb = await pickPuzzle(b, '2026-12-03');
    expect(pa?.answer).toBeDefined();
    expect(pa?.answer).toBe(pb?.answer);
  });

  it('moves on from subs that fail a check', async () => {
    const deps = createMockDeps({ now: NOW, quiet: true });
    deps.pool = [
      { name: 'NoSuchSubHere', aliases: [], category: 'hobby' },
      entry('Lighthouses'),
      entry('castiron'),
    ];
    const picked = await pickPuzzle(deps, '2026-12-03');
    expect(picked?.answer).toBe('castiron');
    expect(deps.logs.filter((l) => l.includes('skipped'))).toHaveLength(2);
  });

  it('uses every usable sub once before repeating any', async () => {
    const deps = createMockDeps({ now: NOW, quiet: true });
    const seen = new Set<string>();
    for (let d = 1; d <= MOCK_POOL.length; d += 1) {
      const p = await pickPuzzle(deps, `2026-12-${String(d).padStart(2, '0')}`);
      if (!p) break;
      expect(seen.has(p.answer)).toBe(false);
      seen.add(p.answer);
    }
    // Lighthouses is too small, so one fixture sub never gets picked.
    expect(seen.size).toBe(MOCK_POOL.length - 1);
  });

  it(`can pick a sub again ${String(REUSE_DAYS)} days later, not sooner`, async () => {
    const deps = createMockDeps({ now: NOW, quiet: true });
    deps.pool = [entry('Breadit')];
    expect((await pickPuzzle(deps, '2026-12-01'))?.answer).toBe('Breadit');
    expect(await pickPuzzle(deps, addDays('2026-12-01', REUSE_DAYS - 1))).toBe(
      null
    );
    expect(
      (await pickPuzzle(deps, addDays('2026-12-01', REUSE_DAYS)))?.answer
    ).toBe('Breadit');
  });
});

describe('runDailyPick and servePuzzle', () => {
  it('stores today and tomorrow, and keeps an existing pick', async () => {
    const deps = createMockDeps({ now: NOW, quiet: true });
    const first = await runDailyPick(deps, '2026-11-25');
    expect(first.map((p) => p.date)).toEqual(['2026-11-25', '2026-11-26']);
    expect(first.every((p) => p.fresh)).toBe(true);
    const again = await runDailyPick(deps, '2026-11-25');
    expect(again[0]?.answer).toBe(first[0]?.answer);
    expect(again[0]?.fresh).toBe(false);
    const stored = await deps.store.hGet('puzzle:2026-11-25', 'data');
    expect(stored && parseStoredPuzzle(stored)?.answer).toBe(first[0]?.answer);
  });

  it('falls back to the next candidate when the post is removed', async () => {
    const deps = createMockDeps({ now: NOW, quiet: true });
    deps.pool = [entry('Breadit')];
    await runDailyPick(deps, '2026-11-25');
    const before = await servePuzzle(deps, '2026-11-25');
    expect(before?.candidate.postId).toBe('t3_mockbr1');

    deps.source.removePost('t3_mockbr1');
    // Within the check window the cached answer stands.
    expect((await servePuzzle(deps, '2026-11-25'))?.candidate.postId).toBe(
      't3_mockbr1'
    );
    deps.setNow(new Date(NOW.getTime() + LIVE_CHECK_MS));
    expect((await servePuzzle(deps, '2026-11-25'))?.candidate.postId).toBe(
      't3_mockbr2'
    );
    // The gone post is dropped from Redis, not just skipped.
    const stored = await loadPuzzle(deps, '2026-11-25');
    expect(stored?.active).toBe(0);
    expect(stored?.puzzle.candidates.map((c) => c.postId)).toEqual([
      't3_mockbr2',
    ]);
    const raw = await deps.store.hGet('puzzle:2026-11-25', 'data');
    expect(raw).not.toContain('t3_mockbr1');
  });

  it('falls back the same way when the top comment is deleted', async () => {
    const deps = createMockDeps({ now: NOW, quiet: true });
    deps.pool = [entry('Breadit')];
    await runDailyPick(deps, '2026-11-25');
    const before = await servePuzzle(deps, '2026-11-25');
    const commentId = before?.candidate.commentId;
    const commentBody = before?.candidate.topComment.body;
    if (!commentId || !commentBody) throw new Error('no comment id stored');

    deps.source.removeComment(commentId);
    deps.setNow(new Date(NOW.getTime() + LIVE_CHECK_MS));
    const after = await servePuzzle(deps, '2026-11-25');
    expect(after?.candidate.postId).toBe('t3_mockbr2');
    const raw = await deps.store.hGet('puzzle:2026-11-25', 'data');
    expect(raw).not.toContain(commentId);
    expect(raw).not.toContain(commentBody);
  });

  it('makes one liveness read when many players arrive at once', async () => {
    const deps = createMockDeps({ now: NOW, quiet: true });
    await runDailyPick(deps, '2026-11-25');
    deps.setNow(new Date(NOW.getTime() + LIVE_CHECK_MS));
    const served = await Promise.all(
      Array.from({ length: 50 }, () => servePuzzle(deps, '2026-11-25'))
    );
    expect(served.every((s) => s !== null)).toBe(true);
    expect(deps.source.calls.isPostLive).toBe(1);
    expect(deps.source.calls.isCommentLive).toBe(1);
  });

  it('runs one on-demand pick for a burst of players, and retries after the lock expires', async () => {
    const deps = createMockDeps({ now: NOW, quiet: true });
    const real = createMockSource();
    let redditDown = true;
    deps.source.subredditFacts = (name) =>
      redditDown ? Promise.resolve(null) : real.subredditFacts(name);
    const first = await Promise.all(
      Array.from({ length: 20 }, () => servePuzzle(deps, '2026-11-25'))
    );
    expect(first.every((s) => s === null)).toBe(true);
    // One pick ran, trying MAX_SUB_ATTEMPTS subs; the rest saw the lock.
    expect(deps.logs.filter((l) => l.includes('no sub worked'))).toHaveLength(
      1
    );
    redditDown = false;
    // A failed pick leaves the lock to expire, then the next request picks.
    expect(await servePuzzle(deps, '2026-11-25')).toBeNull();
    deps.setNow(new Date(NOW.getTime() + 121_000));
    expect((await servePuzzle(deps, '2026-11-25'))?.puzzle.date).toBe(
      '2026-11-25'
    );
  });

  it('keeps the same community when every stored post is gone', async () => {
    const deps = createMockDeps({ now: NOW, quiet: true });
    deps.pool = [entry('Breadit')];
    await runDailyPick(deps, '2026-11-25');
    deps.pool = MOCK_POOL;
    // Keep one stored candidate, then take it down on Reddit.
    const loaded = await loadPuzzle(deps, '2026-11-25');
    if (!loaded) throw new Error('no puzzle');
    await savePuzzle(deps, {
      ...loaded.puzzle,
      candidates: loaded.puzzle.candidates.slice(0, 1),
    });
    deps.source.removePost('t3_mockbr1');
    deps.setNow(new Date(NOW.getTime() + LIVE_CHECK_MS));

    const served = await servePuzzle(deps, '2026-11-25');
    // Players mid-round keep the same answer; only the post changes.
    expect(served?.puzzle.answer).toBe('Breadit');
    expect(served?.candidate.postId).toBe('t3_mockbr2');
    expect(served?.puzzle.rule).toEqual(loaded.puzzle.rule);
  });

  it('picks another community when the old one has no posts left', async () => {
    const deps = createMockDeps({ now: NOW, quiet: true });
    deps.pool = [entry('Breadit')];
    await runDailyPick(deps, '2026-11-25');
    deps.pool = MOCK_POOL;
    deps.source.removePost('t3_mockbr1');
    deps.source.removePost('t3_mockbr2');
    deps.setNow(new Date(NOW.getTime() + LIVE_CHECK_MS));
    const served = await servePuzzle(deps, '2026-11-25');
    expect(served?.puzzle.answer).toBeDefined();
    expect(served?.puzzle.answer).not.toBe('Breadit');
  });

  it('picks on demand when the nightly job has not run', async () => {
    const deps = createMockDeps({ now: NOW, quiet: true });
    const served = await servePuzzle(deps, '2026-11-25');
    expect(served?.puzzle.date).toBe('2026-11-25');
  });

  it('expires a puzzle a few days after its date', async () => {
    const deps = createMockDeps({ now: NOW, quiet: true });
    await runDailyPick(deps, '2026-11-25');
    const day = 86_400_000;
    deps.setNow(new Date(NOW.getTime() + PUZZLE_KEEP_DAYS * day));
    expect(await loadPuzzle(deps, '2026-11-25')).not.toBeNull();
    deps.setNow(new Date(NOW.getTime() + (PUZZLE_KEEP_DAYS + 1) * day));
    expect(await loadPuzzle(deps, '2026-11-25')).toBeNull();
  });
});

describe('the pick salt', () => {
  it('is made once, and concurrent first runs agree on it', async () => {
    const deps = createMockDeps({ now: NOW, quiet: true });
    let made = 0;
    deps.newSalt = () => {
      made += 1;
      return `salt-${String(made)}`;
    };
    const salts = await Promise.all([
      pickSalt(deps),
      pickSalt(deps),
      pickSalt(deps),
    ]);
    expect(new Set(salts).size).toBe(1);
    expect(await pickSalt(deps)).toBe(salts[0]);
    expect(await deps.store.get('pick-salt')).toBe(salts[0]);
  });

  it('is 128 random bits on Reddit', () => {
    expect(randomSalt()).toMatch(/^[0-9a-f]{32}$/);
    expect(randomSalt()).not.toBe(randomSalt());
  });
});

describe('the first stored pick wins', () => {
  it('keeps one answer when the nightly and an on-demand pick race', async () => {
    const nightly = createMockDeps({ now: NOW, quiet: true });
    // A second request with its own view of the pool shares the store.
    const onDemand = createMockDeps({ now: NOW, quiet: true });
    onDemand.store = nightly.store;
    nightly.pool = [entry('Breadit')];
    onDemand.pool = [entry('castiron')];
    const [a, b] = await Promise.all([
      pickPuzzle(nightly, '2026-11-25'),
      pickPuzzle(onDemand, '2026-11-25'),
    ]);
    expect(a?.answer).toBeDefined();
    expect(b?.answer).toBe(a?.answer);
    expect((await loadPuzzle(nightly, '2026-11-25'))?.puzzle.answer).toBe(
      a?.answer
    );
    // The loser's sub isn't marked as used.
    const loser = a?.answer === 'Breadit' ? 'castiron' : 'breadit';
    expect(await nightly.store.zScore('used-subs', loser)).toBeUndefined();
  });
});

describe('pool check', () => {
  it('checks the whole pool in batches and stores the results', async () => {
    const deps = createMockDeps({ now: NOW, quiet: true });
    let queued = 0;
    deps.scheduleNextPoolCheck = () => {
      queued += 1;
      return Promise.resolve();
    };
    let progress = await runPoolCheckBatch(deps, '2026-11-25', 4);
    expect(progress).toMatchObject({ checked: 4, done: false });
    while (!progress.done)
      progress = await runPoolCheckBatch(deps, '2026-11-25', 4);
    // Every batch but the last queues the next one.
    expect(queued).toBe(Math.ceil(MOCK_POOL.length / 4) - 1);
    const report = await readPoolCheck(deps, '2026-11-25');
    expect(report.done).toBe(true);
    expect(report.results).toHaveLength(MOCK_POOL.length);
    expect(report.results[0]).toMatchObject({ name: 'Lighthouses', ok: false });
    expect(report.results.filter((r) => r.ok)).toHaveLength(
      MOCK_POOL.length - 1
    );
  });

  it('starts over when a new check is started', async () => {
    const deps = createMockDeps({ now: NOW, quiet: true });
    await runPoolCheckBatch(deps, '2026-11-25', 2);
    const restarted = await startPoolCheck(deps, '2026-11-25');
    expect(restarted.checked).toBe(Math.min(10, MOCK_POOL.length));
  });
});
