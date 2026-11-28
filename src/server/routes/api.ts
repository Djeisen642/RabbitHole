import { Hono } from 'hono';
import type { Context } from 'hono';
import type {
  ErrorResponse,
  PuzzleResponse,
  SuggestResponse,
} from '../../shared/api';
import {
  dayNumber,
  isPuzzleDate,
  puzzleDateAt,
  puzzleNumber,
} from '../../shared/game/day';
import type { PuzzleDate } from '../../shared/game/day';
import { suggest } from '../../shared/pool';
import type { Deps } from '../core/deps';
import { readPoolCheck } from '../core/pool-check';
import type { PoolCheckReport } from '../core/pool-check';
import { dailyPostKey } from '../core/daily-post';
import { giveStreakFlair, playerAvatar } from '../core/player-look';
import { postDay } from '../core/post-day';
import { servePastPuzzle, servePuzzle } from '../core/puzzle';
import type { Served } from '../core/puzzle';
import {
  answerOffer,
  loadRound,
  loadStreak,
  puzzleView,
  submitGuess,
  wrongGuessChart,
} from '../core/round';
import type { PlayerRound } from '../core/round';
import type { Streak } from '../../shared/game/rules';
import type { User } from '../core/deps';
import { asBoolean, asRecord, asString } from '../core/json';

const fail = (
  c: Context,
  status: 400 | 401 | 403 | 404 | 409 | 410 | 500 | 503,
  message: string
) => c.json<ErrorResponse>({ type: 'error', message }, status);

/** The puzzle a request plays: its post's day (see post-day.ts) and today. */
type Day = { date: PuzzleDate; today: PuzzleDate; past: boolean };

/**
 * The player-facing API: the post's puzzle (today's, or an earlier day's
 * for an older post), guessing, the training-wheels offer and autocomplete.
 */
export function createApi(deps: Deps): Hono {
  const api = new Hono();

  async function dayOf(): Promise<Day> {
    const today = puzzleDateAt(deps.now());
    const date = await postDay(deps, today);
    return { date, today, past: date < today };
  }

  const serve = (day: Day) =>
    day.past ? servePastPuzzle(deps, day.date) : servePuzzle(deps, day.date);

  /** Where an older post points: today's number and post. */
  async function todayLink(
    day: Day
  ): Promise<{ number: number; url: string | null } | null> {
    if (!day.past) return null;
    const url = await deps.store.get(dailyPostKey(day.today));
    return {
      number: puzzleNumber(day.today),
      url: url?.startsWith('https://') ? url : null,
    };
  }

  async function view(
    day: Day,
    user: User | null,
    player: PlayerRound,
    streak: Streak,
    served: Served
  ): Promise<PuzzleResponse> {
    const done = player.round.status !== 'playing';
    const [chart, avatarUrl] = await Promise.all([
      done ? wrongGuessChart(deps, day.date) : null,
      done && user ? playerAvatar(deps, user) : null,
    ]);
    return puzzleView({
      puzzle: served.puzzle,
      candidate: served.candidate,
      player,
      streak,
      day: dayNumber(day.today),
      today: await todayLink(day),
      username: user?.username ?? null,
      chart,
      postUrl: deps.postUrl(),
      avatarUrl,
    });
  }

  const notReady = (c: Context, day: Day) =>
    day.past
      ? fail(
          c,
          410,
          `Puzzle #${String(puzzleNumber(day.date))} is no longer available. Today’s is #${String(puzzleNumber(day.today))}.`
        )
      : fail(c, 503, 'Today’s puzzle is still being dug up. Try again soon.');

  api.get('/puzzle', async (c) => {
    try {
      const day = await dayOf();
      const served = await serve(day);
      if (!served) return notReady(c, day);
      const user = await deps.user();
      const [player, streak] = await Promise.all([
        loadRound(deps, served.puzzle, user),
        loadStreak(deps, user),
      ]);
      return c.json<PuzzleResponse>(
        await view(day, user, player, streak, served)
      );
    } catch (error) {
      console.error('GET /api/puzzle failed', error);
      return fail(c, 500, 'Something went wrong loading the puzzle.');
    }
  });

  api.post('/guess', async (c) => {
    try {
      const body = asRecord(await c.req.json<unknown>().catch(() => null));
      const guess = asString(body?.guess)?.trim() ?? '';
      if (guess === '' || guess.length > 64)
        return fail(c, 400, 'Type a community to guess.');
      const day = await dayOf();
      // The client says which day's puzzle it is looking at. On a post that
      // isn't tied to a day, a guess sent after midnight from a page loaded
      // before it would otherwise land on a puzzle the player has never seen.
      if (asString(body?.date) !== day.date)
        return fail(c, 409, 'A new puzzle is out. Reload to play it.');
      const served = await serve(day);
      if (!served) return notReady(c, day);
      const user = await deps.user();
      const outcome = await submitGuess(
        deps,
        served.puzzle,
        user,
        guess,
        !day.past
      );
      if (!outcome.ok) return fail(c, outcome.status, outcome.message);
      // The round just ended (a finished round refuses more guesses), so
      // today's result moves the streak, and the flair with it.
      if (user && !day.past && outcome.player.round.status !== 'playing')
        await giveStreakFlair(deps, user, outcome.streak);
      return c.json<PuzzleResponse>(
        await view(day, user, outcome.player, outcome.streak, served)
      );
    } catch (error) {
      console.error('POST /api/guess failed', error);
      return fail(c, 500, 'Something went wrong with that guess.');
    }
  });

  // The answer to "Want some options?" (PuzzleResponse.offer).
  api.post('/choices', async (c) => {
    try {
      const body = asRecord(await c.req.json<unknown>().catch(() => null));
      const accept = asBoolean(body?.accept);
      if (accept === null) return fail(c, 400, 'Say yes or no to the options.');
      const day = await dayOf();
      if (asString(body?.date) !== day.date)
        return fail(c, 409, 'A new puzzle is out. Reload to play it.');
      const served = await serve(day);
      if (!served) return notReady(c, day);
      const user = await deps.user();
      const outcome = await answerOffer(deps, served.puzzle, user, accept);
      if (!outcome.ok) return fail(c, outcome.status, outcome.message);
      const streak = await loadStreak(deps, user);
      return c.json<PuzzleResponse>(
        await view(day, user, outcome.player, streak, served)
      );
    } catch (error) {
      console.error('POST /api/choices failed', error);
      return fail(c, 500, 'Something went wrong. Try again.');
    }
  });

  api.get('/suggest', (c) => {
    const q = c.req.query('q') ?? '';
    return c.json<SuggestResponse>({
      type: 'suggest',
      names: suggest(q.slice(0, 64)),
    });
  });

  // Moderators only: the latest "Check pool" results.
  api.get('/pool-check', async (c) => {
    try {
      if (!(await deps.isModerator()))
        return fail(c, 403, 'Only moderators can see the pool check.');
      const date = c.req.query('date') ?? puzzleDateAt(deps.now());
      if (!isPuzzleDate(date)) return fail(c, 400, 'Use a YYYY-MM-DD date.');
      return c.json<PoolCheckReport>(await readPoolCheck(deps, date));
    } catch (error) {
      console.error('GET /api/pool-check failed', error);
      return fail(c, 500, 'Could not read the pool check.');
    }
  });

  return api;
}
