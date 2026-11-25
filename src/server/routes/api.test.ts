import { describe, expect, it } from 'vitest';
import type {
  ErrorResponse,
  PuzzleResponse,
  SuggestResponse,
} from '../../shared/api';
import { createMockDeps } from '../core/mock/mock-deps';
import { findEntry, POOL } from '../../shared/pool';
import {
  LIVE_CHECK_MS,
  loadPuzzle,
  runDailyPick,
  savePuzzle,
} from '../core/puzzle';
import type { MockDeps } from '../core/mock/mock-deps';
import { PLAYER_KEEP_DAYS } from '../core/round';
import { createApi } from './api';

const NOW = new Date('2026-11-25T15:00:00Z');
const TODAY = '2026-11-25';

type Json = PuzzleResponse | ErrorResponse | SuggestResponse;

/** Responses are built by our own handlers; check the tag and trust the rest. */
function isJson(value: unknown): value is Json {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    (value.type === 'puzzle' ||
      value.type === 'error' ||
      value.type === 'suggest')
  );
}

async function readJson(res: Response): Promise<Json> {
  const value: unknown = await res.json();
  if (!isJson(value)) throw new Error('unexpected response');
  return value;
}

async function setup(answer = 'Breadit') {
  const deps = createMockDeps({ now: NOW, quiet: true });
  const entry = findEntry(answer, POOL);
  if (!entry) throw new Error('missing entry');
  // Pin the answer so the test knows it; guesses still resolve against the
  // whole mock pool.
  const pool = deps.pool;
  deps.pool = [entry];
  await runDailyPick(deps, TODAY);
  deps.pool = pool;
  const app = createApi(deps);
  const get = async (path: string): Promise<{ status: number; body: Json }> => {
    const res = await app.request(path);
    const body = await readJson(res);
    return { status: res.status, body };
  };
  const guess = async (
    text: string,
    date: string = TODAY
  ): Promise<{ status: number; body: Json }> => {
    const res = await app.request('/guess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guess: text, date }),
    });
    const body = await readJson(res);
    return { status: res.status, body };
  };
  const statusOf = async (path: string): Promise<number> =>
    (await app.request(path)).status;
  return { deps, get, guess, statusOf };
}

function puzzle(body: Json): PuzzleResponse {
  if (body.type !== 'puzzle') throw new Error(JSON.stringify(body));
  return body;
}

/** Everything the player must not see before the round ends. */
function expectNoLeak(view: PuzzleResponse): void {
  const text = JSON.stringify(view).toLowerCase();
  expect(view.result).toBeNull();
  expect(text).not.toContain('breadit');
  // Breadit's top comment, which stays hidden until the first wrong guess.
  expect(text).not.toContain('scoring angle');
  expect(view.clues.length).toBe(view.guesses.filter((g) => !g.correct).length);
}

describe('GET /puzzle', () => {
  it('sends the masked post and nothing that gives the answer away', async () => {
    const { get } = await setup();
    const { status, body } = await get('/puzzle');
    expect(status).toBe(200);
    const view = puzzle(body);
    expect(view.date).toBe(TODAY);
    expect(view.post.title).toMatch(/open crumb/);
    expect(view.clues).toEqual([]);
    expect(view.clueKinds).toEqual([
      'topComment',
      'rule',
      'jargon',
      'stats',
      'icon',
    ]);
    expect(view.maxGuesses).toBe(6);
    expect(view.guessesLeft).toBe(6);
    expect(view.status).toBe('playing');
    expect(view.username).toBe('mock_player');
    expectNoLeak(view);
    // The rule and the stats aren't in the payload either.
    const text = JSON.stringify(view);
    expect(text).not.toContain('Share your recipe');
    expect(text).not.toContain('1240000');
  });

  it('lets a logged-out visitor look but not guess', async () => {
    const { deps, get, guess } = await setup();
    deps.setUser(null);
    expect(puzzle((await get('/puzzle')).body).username).toBeNull();
    expect((await guess('Baking')).status).toBe(401);
  });
});

describe('a full round', () => {
  it('wrong, wrong, right: reveals clues one by one, then the answer', async () => {
    const { get, guess } = await setup();

    const first = puzzle((await guess('r/Baking')).body);
    expect(first.status).toBe('playing');
    expect(first.clues.map((c) => c.kind)).toEqual(['topComment']);
    expect(first.guessesLeft).toBe(5);
    expect(first.result).toBeNull();
    expect(JSON.stringify(first).toLowerCase()).not.toContain('breadit');

    const second = puzzle((await guess('sourdough')).body);
    expect(second.clues.map((c) => c.kind)).toEqual(['topComment', 'rule']);
    expect(JSON.stringify(second)).not.toContain('"words"');
    expect(JSON.stringify(second).toLowerCase()).not.toContain('breadit');
    expect(second.result).toBeNull();

    const done = puzzle((await guess('bredit')).body);
    expect(done.status).toBe('solved');
    expect(done.guesses.map((g) => g.correct)).toEqual([false, false, true]);
    expect(done.guessesLeft).toBe(0);
    expect(done.streak.current).toBe(1);
    const result = done.result;
    if (!result) throw new Error('no result');
    expect(result.answer).toBe('Breadit');
    expect(result.score).toBe(2);
    expect(result.clues.map((c) => c.kind)).toEqual([
      'topComment',
      'rule',
      'jargon',
      'stats',
      'icon',
    ]);
    expect(result.visitUrl).toBe('https://www.reddit.com/r/Breadit/');
    expect(result.wrongGuesses.map((w) => w.name).sort()).toEqual([
      'Baking',
      'Sourdough',
    ]);
    expect(result.wrongGuesses[0]?.percent).toBe(100);
    expect(result.players).toBe(1);
    expect(result.shareText).toContain('solved with 2 clues');
    expect(result.shareText.toLowerCase()).not.toContain('breadit');

    // The finished round comes back the same on reload, and is closed.
    const reload = puzzle((await get('/puzzle')).body);
    expect(reload.result?.answer).toBe('Breadit');
    expect((await guess('Cooking')).status).toBe(409);
  });

  it('fails after every guess is used and resets the streak', async () => {
    const { deps, get, guess } = await setup('houseplants');
    for (const name of ['Breadit', 'castiron', 'birding', 'canada']) {
      const view = puzzle((await guess(name)).body);
      expect(view.result).toBeNull();
      expect(JSON.stringify(view).toLowerCase()).not.toContain('houseplants');
    }
    const last = puzzle((await guess('whatisthisthing')).body);
    expect(last.maxGuesses).toBe(5); // no custom icon, so four clues
    expect(last.status).toBe('failed');
    expect(last.result?.answer).toBe('houseplants');
    expect(last.result?.score).toBeNull();
    expect(last.result?.shareText).toContain('stumped');
    expect(last.streak.current).toBe(0);
    expect(await deps.store.zScore(`scores:${TODAY}`, 't2_mockplayer')).toBe(
      99
    );
    expect(puzzle((await get('/puzzle')).body).status).toBe('failed');
  });

  it('counts wrong guesses across players for the chart', async () => {
    const { deps, guess } = await setup();
    await guess('Baking');
    await guess('Breadit');
    deps.setUser({ id: 't2_second', username: 'second_player' });
    await guess('Baking');
    await guess('Cooking');
    const done = puzzle((await guess('Breadit')).body);
    expect(done.result?.players).toBe(2);
    expect(done.result?.wrongGuesses[0]).toEqual({
      name: 'Baking',
      count: 2,
      percent: 100,
    });
    expect(done.result?.wrongGuesses[1]).toMatchObject({
      name: 'Cooking',
      percent: 50,
    });
  });
});

describe('concurrent guesses', () => {
  it('cannot solve for free by sending several guesses at once', async () => {
    const { deps, get, guess } = await setup();
    const sent = await Promise.all(
      ['Baking', 'Cooking', 'Breadit'].map((name) => guess(name))
    );
    // Only one guess can take the first slot; the rest are turned away.
    expect(sent.filter((r) => r.status === 200)).toHaveLength(1);
    expect(sent.filter((r) => r.status === 409)).toHaveLength(2);

    const stored = puzzle((await get('/puzzle')).body);
    expect(stored.guesses).toHaveLength(1);
    const accepted = sent.find((r) => r.status === 200);
    expect(accepted && puzzle(accepted.body).guesses).toEqual(stored.guesses);
    expect(
      await deps.store.hGet(`stats:${TODAY}`, 'players').then(Number)
    ).toBe(1);
  });
});

/** Take down every post of a sub, so the day has to move to another. */
async function takeDownSub(deps: MockDeps, sub: string): Promise<void> {
  for (const p of await deps.source.topPosts(sub, 'month', 100))
    deps.source.removePost(p.id);
  deps.setNow(new Date(NOW.getTime() + LIVE_CHECK_MS));
}

describe('a mid-day repick', () => {
  it('leaves a finished round as it ended', async () => {
    const { deps, get, guess } = await setup();
    const won = puzzle((await guess('Breadit')).body);
    expect(won.status).toBe('solved');

    await takeDownSub(deps, 'Breadit');
    const after = puzzle((await get('/puzzle')).body);
    const today = await loadPuzzle(deps, TODAY);
    expect(today?.puzzle.answer).not.toBe('Breadit');
    expect(after.status).toBe('solved');
    expect(after.result?.answer).toBe('Breadit');
    expect(after.result?.score).toBe(0);
    expect(after.streak.current).toBe(1);
    // The new community's post and clues aren't this player's.
    expect(after.post.title).toMatch(/removed/);
    expect(after.result?.clues).toEqual([]);

    // The round stays closed, even to the new answer.
    const again = await guess(today?.puzzle.answer ?? '');
    expect(again.status).toBe(409);
    expect(await deps.store.zScore(`scores:${TODAY}`, 't2_mockplayer')).toBe(0);
  });

  it('starts a round still in play over on the new community', async () => {
    const { deps, get, guess } = await setup();
    puzzle((await guess('Baking')).body);

    await takeDownSub(deps, 'Breadit');
    const fresh = puzzle((await get('/puzzle')).body);
    expect(fresh.status).toBe('playing');
    expect(fresh.guesses).toEqual([]);
    const answer = (await loadPuzzle(deps, TODAY))?.puzzle.answer ?? '';
    const done = puzzle((await guess(answer)).body);
    expect(done.status).toBe('solved');
    expect(done.result?.answer).toBe(answer);
    expect(done.result?.score).toBe(0);
    // Still one player for the day.
    expect(done.result?.players).toBe(1);
  });
});

describe('an answer that left the pool', () => {
  it('is still accepted as a guess, and the win stands', async () => {
    const { deps, get, guess } = await setup();
    const loaded = await loadPuzzle(deps, TODAY);
    if (!loaded) throw new Error('no puzzle');
    // As if a deploy dropped the sub from the pool after it was picked.
    await savePuzzle(deps, { ...loaded.puzzle, answer: 'RetiredSub' });
    expect((await guess('definitely_not_a_sub')).status).toBe(400);
    const done = puzzle((await guess('r/RetiredSub')).body);
    expect(done.status).toBe('solved');
    expect(done.result?.answer).toBe('RetiredSub');
    expect(done.result?.wrongGuesses).toEqual([]);
    expect(puzzle((await get('/puzzle')).body).status).toBe('solved');
  });
});

describe('player data retention', () => {
  it('expires rounds and scores after about a month', async () => {
    const { deps, guess } = await setup();
    await guess('Breadit');
    const key = `round:${TODAY}:t2_mockplayer`;
    expect(await deps.store.hGet(key, '0')).toBe('Breadit');
    deps.setNow(new Date(NOW.getTime() + PLAYER_KEEP_DAYS * 86_400_000));
    expect(await deps.store.hGet(key, '0')).toBeUndefined();
    expect(
      await deps.store.zScore(`scores:${TODAY}`, 't2_mockplayer')
    ).toBeUndefined();
    // The streak is the player's running record and stays.
    expect(await deps.store.hGet('user:t2_mockplayer:streak', 'best')).toBe(
      '1'
    );
  });
});

describe('the daily rollover', () => {
  it('does not spend a guess on a puzzle the player has not seen', async () => {
    const { deps, get, guess } = await setup();
    // The page was loaded for today's puzzle; midnight in New York passes
    // before the guess is sent.
    deps.setNow(new Date('2026-11-26T05:01:00Z'));
    const stale = await guess('Baking', TODAY);
    expect(stale.status).toBe(409);
    const tomorrow = puzzle((await get('/puzzle')).body);
    expect(tomorrow.date).toBe('2026-11-26');
    expect(tomorrow.guesses).toEqual([]);
  });
});

describe('POST /guess validation', () => {
  it('rejects blanks and names outside the pool, and ignores repeats', async () => {
    const { guess } = await setup();
    expect((await guess('   ')).status).toBe(400);
    expect((await guess('definitely_not_a_sub')).status).toBe(400);
    puzzle((await guess('Baking')).body);
    const repeat = puzzle((await guess('r/baking')).body);
    expect(repeat.guesses).toHaveLength(1);
  });
});

describe('GET /suggest', () => {
  it('returns at most 8 names and nothing for one character', async () => {
    const { get } = await setup();
    const one = (await get('/suggest?q=b')).body;
    expect(one).toEqual({ type: 'suggest', names: [] });
    const two = (await get('/suggest?q=ca')).body;
    if (two.type !== 'suggest') throw new Error('bad');
    expect(two.names.length).toBeGreaterThan(0);
    expect(two.names.length).toBeLessThanOrEqual(8);
    expect(two.names).toContain('castiron');
  });
});

describe('GET /pool-check', () => {
  it('is for moderators only', async () => {
    const { deps, statusOf } = await setup();
    expect(await statusOf('/pool-check')).toBe(200);
    deps.isModerator = () => Promise.resolve(false);
    expect(await statusOf('/pool-check')).toBe(403);
  });
});
