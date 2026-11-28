/**
 * How long stored data is kept. Puzzles last a year so old posts keep
 * playing; per-player records last a month.
 */
import { addDays } from '../../shared/game/day';
import type { PuzzleDate } from '../../shared/game/day';
import type { Deps } from './deps';

/**
 * Days a puzzle is kept after its date. Each daily post keeps playing its
 * own day's puzzle (see post-day.ts), so an old post found in the feed or
 * a link still works. A puzzle is a few kilobytes.
 */
export const PUZZLE_KEEP_DAYS = 365;

/**
 * Days a player's round, learner record and the day's scores are kept.
 * Long enough for a later leaderboard over recent days; after that only the
 * streak remains.
 */
export const PLAYER_KEEP_DAYS = 30;
export const PLAYER_KEEP_SECONDS = PLAYER_KEEP_DAYS * 86_400;

/**
 * Seconds from now until a date's keys should go: the end of the day
 * `days` (PUZZLE_KEEP_DAYS for a puzzle) after it, at least a minute.
 */
export function secondsToKeep(
  deps: Deps,
  date: PuzzleDate,
  days: number = PUZZLE_KEEP_DAYS
): number {
  const end = Date.parse(`${addDays(date, days + 1)}T00:00:00Z`);
  return Math.max(60, Math.ceil((end - deps.now().getTime()) / 1000));
}
