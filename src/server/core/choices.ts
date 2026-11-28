/**
 * Multiple-choice options for a round: the answer plus distractors, for new
 * players and for anyone who takes up the training-wheels offer (see
 * shared/game/learning.ts).
 *
 * The options must not give away more than the player already sees:
 * - Distractors are ordered by a keyed hash of the date, using the secret
 *   pick salt. With a public key, anyone could try every pool sub as the
 *   answer, rebuild its option list and see which one matches theirs.
 * - Everyone gets the same list for a date and answer, and the five-option
 *   list is the start of the ten-option one. If each player got their own
 *   random distractors, comparing two players' lists would leave only the
 *   answer in common.
 * - Other days' answers are never offered, so the list can't confirm
 *   tomorrow's answer or one a mid-day repick replaced.
 */
import { createHmac } from 'node:crypto';
import type { PuzzleDate } from '../../shared/game/day';
import { isCorrectGuess, normalizeSubreddit } from '../../shared/game/rules';
import { POOL, findEntry } from '../../shared/pool';
import type { PoolEntry } from '../../shared/pool';
import type { Deps } from './deps';
import { answersFrom, pickSalt } from './puzzle-pick';

const hash = (salt: string, text: string): string =>
  createHmac('sha256', salt).update(text).digest('hex');

/**
 * Up to `count` options for a round, the answer among them, in a shuffled
 * but repeatable order. Distractors come from the answer's own pool
 * category first, so they are plausible, then from the rest of the pool if
 * that category is too small. `exclude` holds normalized names never to
 * offer.
 */
export function choiceOptions(args: {
  answer: string;
  count: number;
  date: PuzzleDate;
  salt: string;
  pool: readonly PoolEntry[];
  exclude: ReadonlySet<string>;
}): string[] {
  const { answer, count, date, salt, pool, exclude } = args;
  if (count <= 0) return [];
  const entry = findEntry(answer, pool);
  const aliases = entry?.aliases ?? [];
  const seen = new Set<string>();
  const distractors = pool
    .filter((e) => {
      const key = normalizeSubreddit(e.name);
      if (seen.has(key) || exclude.has(key)) return false;
      seen.add(key);
      return !isCorrectGuess(e.name, answer, aliases);
    })
    .map((e) => ({
      name: e.name,
      // Same category sorts first ('0' before '1').
      key: `${e.category === entry?.category ? '0' : '1'}${hash(salt, `choices:${date}:${e.name.toLowerCase()}`)}`,
    }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(0, count - 1)
    .map((d) => d.name);
  return [answer, ...distractors]
    .map((name) => ({
      name,
      key: hash(salt, `order:${date}:${name.toLowerCase()}`),
    }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((o) => o.name);
}

/** Options for a round on `date` with this answer, read from the store. */
export async function optionsFor(
  deps: Deps,
  date: PuzzleDate,
  answer: string,
  count: number
): Promise<string[]> {
  const exclude = await answersFrom(deps, date);
  exclude.delete(normalizeSubreddit(answer));
  // POOL, not deps.pool: guesses are checked against the full pool, and
  // in mock mode deps.pool is only the handful of fixture subs.
  return choiceOptions({
    answer,
    count,
    date,
    salt: await pickSalt(deps),
    pool: POOL,
    exclude,
  });
}
