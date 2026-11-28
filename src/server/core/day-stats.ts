/**
 * What all players did on a day: how many played, the common wrong
 * guesses and everyone's scores.
 *
 * Redis keys:
 * - `wrong:YYYY-MM-DD` sorted set: wrong guess name scored by how many
 *   players made it.
 * - `stats:YYYY-MM-DD` hash: `players` (players who guessed at least once)
 *   and `typed` (those of them who typed their guesses).
 * - `scores:YYYY-MM-DD` sorted set: userId scored by clues used (unsolved
 *   rounds score 99), for a later leaderboard. Expires after
 *   PLAYER_KEEP_DAYS.
 */
import type { WrongGuessBar } from '../../shared/api';
import type { Deps } from './deps';
import { PLAYER_KEEP_SECONDS } from './keep';

const wrongKey = (date: string): string => `wrong:${date}`;
const statsKey = (date: string): string => `stats:${date}`;
const scoresKey = (date: string): string => `scores:${date}`;

export const UNSOLVED_SCORE = 99;
export const CHART_BARS = 5;

/** Count a player's first guess of the day, and whether they type. */
export async function countPlayer(
  deps: Deps,
  date: string,
  typed: boolean
): Promise<void> {
  await deps.store.hIncrBy(statsKey(date), 'players', 1);
  if (typed) await deps.store.hIncrBy(statsKey(date), 'typed', 1);
}

/** Add one to a wrong guess's tally for the chart. */
export async function countWrongGuess(
  deps: Deps,
  date: string,
  name: string
): Promise<void> {
  await deps.store.zIncrBy(wrongKey(date), name, 1);
}

/** Record a finished round's score (UNSOLVED_SCORE when unsolved). */
export async function recordScore(
  deps: Deps,
  date: string,
  userId: string,
  clues: number | null
): Promise<void> {
  await deps.store.zAdd(scoresKey(date), {
    member: userId,
    score: clues ?? UNSOLVED_SCORE,
  });
  await deps.store.expire(scoresKey(date), PLAYER_KEEP_SECONDS);
}

/**
 * The most common wrong guesses of the day. Only typed guesses count (see
 * submitGuess), so each bar's share is of the players who typed, not of
 * everyone: new players picking from options would otherwise pull every
 * percentage down. A day counted before `typed` was kept falls back to all
 * players, who all typed then.
 */
export async function wrongGuessChart(
  deps: Deps,
  date: string
): Promise<{ bars: WrongGuessBar[]; players: number }> {
  const stats = await deps.store.hGetAll(statsKey(date));
  const players = Number(stats.players ?? '0') || 0;
  const typed = stats.typed === undefined ? players : Number(stats.typed) || 0;
  const top = await deps.store.zRange(wrongKey(date), 0, CHART_BARS - 1, {
    by: 'rank',
    reverse: true,
  });
  const bars = top.map(({ member, score: count }) => ({
    name: member,
    count,
    percent: typed > 0 ? Math.round((count / typed) * 100) : 0,
  }));
  return { bars, players };
}

/** Forget a date's wrong guesses, after its answer changes (see repickPuzzle). */

export async function clearWrongGuesses(
  deps: Deps,
  date: string
): Promise<void> {
  await deps.store.del(wrongKey(date));
}
