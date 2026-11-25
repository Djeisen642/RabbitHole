import { Hono } from 'hono';
import type { Context } from 'hono';
import type {
  ErrorResponse,
  PuzzleResponse,
  SuggestResponse,
} from '../../shared/api';
import { dayNumber, isPuzzleDate, puzzleDateAt } from '../../shared/game/day';
import { suggest } from '../../shared/pool';
import type { Deps } from '../core/deps';
import { readPoolCheck } from '../core/pool-check';
import type { PoolCheckReport } from '../core/pool-check';
import { servePuzzle } from '../core/puzzle';
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
  status: 400 | 401 | 403 | 404 | 409 | 500 | 503,
  message: string
) => c.json<ErrorResponse>({ type: 'error', message }, status);

/**
 * The player-facing API: today's puzzle, guessing, the training-wheels
 * offer and autocomplete.
 */
export function createApi(deps: Deps): Hono {
  const api = new Hono();

  async function view(
    date: string,
    user: User | null,
    player: PlayerRound,
    streak: Streak,
    served: Served
  ): Promise<PuzzleResponse> {
    const chart =
      player.round.status === 'playing'
        ? null
        : await wrongGuessChart(deps, date);
    return puzzleView({
      puzzle: served.puzzle,
      candidate: served.candidate,
      player,
      streak,
      day: dayNumber(date),
      username: user?.username ?? null,
      chart,
    });
  }

  const notReady = (c: Context) =>
    fail(c, 503, 'Today’s puzzle is still being dug up. Try again soon.');

  api.get('/puzzle', async (c) => {
    try {
      const date = puzzleDateAt(deps.now());
      const served = await servePuzzle(deps, date);
      if (!served) return notReady(c);
      const user = await deps.user();
      const [player, streak] = await Promise.all([
        loadRound(deps, served.puzzle, user),
        loadStreak(deps, user),
      ]);
      return c.json<PuzzleResponse>(
        await view(date, user, player, streak, served)
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
      const date = puzzleDateAt(deps.now());
      // The client says which day's post it is looking at. A guess sent
      // after midnight from a page loaded before it would otherwise land on
      // a puzzle the player has never seen.
      if (asString(body?.date) !== date)
        return fail(c, 409, 'A new puzzle is out. Reload to play it.');
      const served = await servePuzzle(deps, date);
      if (!served) return notReady(c);
      const user = await deps.user();
      const outcome = await submitGuess(deps, served.puzzle, user, guess);
      if (!outcome.ok) return fail(c, outcome.status, outcome.message);
      return c.json<PuzzleResponse>(
        await view(date, user, outcome.player, outcome.streak, served)
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
      const date = puzzleDateAt(deps.now());
      if (asString(body?.date) !== date)
        return fail(c, 409, 'A new puzzle is out. Reload to play it.');
      const served = await servePuzzle(deps, date);
      if (!served) return notReady(c);
      const user = await deps.user();
      const outcome = await answerOffer(deps, served.puzzle, user, accept);
      if (!outcome.ok) return fail(c, outcome.status, outcome.message);
      const streak = await loadStreak(deps, user);
      return c.json<PuzzleResponse>(
        await view(date, user, outcome.player, streak, served)
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
