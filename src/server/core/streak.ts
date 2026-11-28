/**
 * A player's streak of solved days.
 *
 * Redis keys:
 * - `user:{userId}:streak` hash: `current`, `best`, `lastSolvedDay`. Kept
 *   with no expiry: it is the player's running record across days (the best
 *   streak never lapses), and holds only three numbers.
 */
import type { Streak } from '../../shared/game/rules';
import type { Deps, User } from './deps';

export const streakKey = (userId: string): string => `user:${userId}:streak`;

const EMPTY_STREAK: Streak = {
  current: 0,
  best: 0,
  lastSolvedDay: null,
};

export async function loadStreak(
  deps: Deps,
  user: User | null
): Promise<Streak> {
  if (!user) return EMPTY_STREAK;
  const s = await deps.store.hGetAll(streakKey(user.id));
  const last = s.lastSolvedDay;
  return {
    current: Number(s.current ?? '0') || 0,
    best: Number(s.best ?? '0') || 0,
    lastSolvedDay: last === undefined || last === '' ? null : Number(last),
  };
}

export async function saveStreak(
  deps: Deps,
  user: User,
  streak: Streak
): Promise<void> {
  await deps.store.hSet(streakKey(user.id), {
    current: String(streak.current),
    best: String(streak.best),
    lastSolvedDay:
      streak.lastSolvedDay === null ? '' : String(streak.lastSolvedDay),
  });
}
