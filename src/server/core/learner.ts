/**
 * A player's Learner record (rounds finished, losses in a row, training
 * wheels), which decides how much help a round starts with. The rules for
 * it are in shared/game/learning.ts.
 *
 * Redis keys:
 * - `user:{userId}:learn` hash. Expires PLAYER_KEEP_DAYS after the last
 *   finished round; a player who comes back after that is treated as one
 *   who knows the game (see loadLearner).
 */
import { NEW_LEARNER, RETURNING_LEARNER } from '../../shared/game/learning';
import type { Learner } from '../../shared/game/learning';
import type { Deps, User } from './deps';
import { PLAYER_KEEP_SECONDS } from './keep';
import { streakKey } from './streak';

const learnKey = (userId: string): string => `user:${userId}:learn`;

/**
 * The player's Learner. A player with no record but a streak hash has
 * finished a round before (the streak is written on every finished round
 * and never expires), either before the record was kept or long enough ago
 * that it expired. They know the game, so they get RETURNING_LEARNER and
 * type, rather than the first-timer card and five options.
 */
export async function loadLearner(deps: Deps, user: User): Promise<Learner> {
  const l = await deps.store.hGetAll(learnKey(user.id));
  if (l.finished === undefined) {
    const played = await deps.store.hGet(streakKey(user.id), 'best');
    return played === undefined ? NEW_LEARNER : RETURNING_LEARNER;
  }
  const count = (value: string | undefined): number => Number(value) || 0;
  return {
    finished: count(l.finished),
    losses: count(l.losses),
    wheels: l.wheels === '1',
    wheelWins: count(l.wheelWins),
    // Missing on records saved before this field existed: no intro.
    lastWithChoices: l.lastChoices === '1',
  };
}

export async function saveLearner(
  deps: Deps,
  user: User,
  learner: Learner
): Promise<void> {
  const key = learnKey(user.id);
  await deps.store.hSet(key, {
    finished: String(learner.finished),
    losses: String(learner.losses),
    wheels: learner.wheels ? '1' : '0',
    wheelWins: String(learner.wheelWins),
    lastChoices: learner.lastWithChoices ? '1' : '0',
  });
  await deps.store.expire(key, PLAYER_KEEP_SECONDS);
}
