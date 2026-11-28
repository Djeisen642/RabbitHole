/**
 * Choosing the community for a date: the secret pick order, the
 * recently-used history, and the nightly pick.
 *
 * Redis keys:
 * - `pick-salt` string: the secret mixed into the pick order.
 * - `used-subs` sorted set (see puzzle-store.ts), read here to skip subs
 *   used recently.
 */
import { createHmac, getRandomValues } from 'node:crypto';
import { addDays, dayNumber } from '../../shared/game/day';
import type { PuzzleDate } from '../../shared/game/day';
import { normalizeSubreddit } from '../../shared/game/rules';
import type { PoolEntry } from '../../shared/pool';
import type { Deps } from './deps';
import { storeNewPuzzle, loadPuzzle, USED_SUBS_KEY } from './puzzle-store';
import type { StoredPuzzle } from './puzzle-store';
import { tryBuild } from './puzzle-build';

/** A sub isn't picked again within this many days. */
export const REUSE_DAYS = 60;
/** Subs tried per pick before giving up for the night. */
export const MAX_SUB_ATTEMPTS = 12;

const SALT_KEY = 'pick-salt';

/** 128 random bits as hex, for a new pick salt. */
export function randomSalt(): string {
  return Buffer.from(getRandomValues(new Uint8Array(16))).toString('hex');
}

/**
 * The secret mixed into the pick order, made once and kept in Redis. The
 * pool and the order algorithm are public, so without a secret anyone could
 * work out every future answer. Two first runs can race to make it; NX
 * makes the first write win and both read that one back.
 */
export async function pickSalt(deps: Deps): Promise<string> {
  const existing = await deps.store.get(SALT_KEY);
  if (existing) return existing;
  await deps.store.set(SALT_KEY, deps.newSalt(), { nx: true });
  const saved = await deps.store.get(SALT_KEY);
  if (!saved) throw new Error('pick salt missing after it was written');
  return saved;
}

/**
 * The order in which subs are tried for a date: every pool sub not used in
 * the last REUSE_DAYS days, shuffled by a keyed hash of the date and name,
 * so the same salt, date and history always give the same order.
 *
 * The hash is HMAC-SHA256 rather than a salted FNV-1a: FNV's whole state is
 * 32 bits, so after a salt prefix only those 32 bits stay secret, few enough
 * to brute-force from a handful of revealed answers.
 */
export function pickOrder(
  pool: readonly PoolEntry[],
  date: PuzzleDate,
  recentlyUsed: ReadonlySet<string>,
  salt: string
): PoolEntry[] {
  return pool
    .filter((entry) => !recentlyUsed.has(normalizeSubreddit(entry.name)))
    .map((entry) => ({
      entry,
      key: createHmac('sha256', salt)
        .update(`${date}:${entry.name.toLowerCase()}`)
        .digest('hex'),
    }))
    .sort(
      (a, b) =>
        a.key.localeCompare(b.key) || a.entry.name.localeCompare(b.entry.name)
    )
    .map(({ entry }) => entry);
}

async function recentlyUsed(
  deps: Deps,
  date: PuzzleDate
): Promise<Set<string>> {
  const day = dayNumber(date);
  const used = await deps.store.zRange(
    USED_SUBS_KEY,
    day - REUSE_DAYS + 1,
    day + REUSE_DAYS,
    { by: 'score' }
  );
  return new Set(used.map((u) => u.member));
}

/**
 * Normalized names of the subs picked for a date or any later one: the
 * date's own answer (and any it had before a mid-day repick) and tomorrow's,
 * which the nightly job picks a day ahead.
 */
export async function answersFrom(
  deps: Deps,
  date: PuzzleDate
): Promise<Set<string>> {
  const day = dayNumber(date);
  const used = await deps.store.zRange(USED_SUBS_KEY, day, day + REUSE_DAYS, {
    by: 'score',
  });
  return new Set(used.map((u) => u.member));
}

/**
 * Choose and store the puzzle for a date. Tries subs in pickOrder, logging
 * and skipping any that fail a check, so a dead or wrong pool entry can't
 * break a day. Returns null if no sub worked within MAX_SUB_ATTEMPTS.
 *
 * The nightly job and an on-demand pick can run at once. The first to store
 * a puzzle wins (see storeNewPuzzle), and both return that one, so the
 * date never has two answers.
 */
export async function pickPuzzle(
  deps: Deps,
  date: PuzzleDate
): Promise<StoredPuzzle | null> {
  const order = pickOrder(
    deps.pool,
    date,
    await recentlyUsed(deps, date),
    await pickSalt(deps)
  );
  for (const entry of order.slice(0, MAX_SUB_ATTEMPTS)) {
    const built = await tryBuild(deps.source, entry);
    if ('problem' in built) {
      deps.log(`pick ${date}: skipped r/${entry.name} (${built.problem})`);
      continue;
    }
    const stored = await storeNewPuzzle(deps, { date, ...built.puzzle });
    deps.log(`pick ${date}: chose r/${stored.answer}`);
    return stored;
  }
  deps.log(`pick ${date}: no sub worked`);
  return null;
}

/**
 * Make sure puzzles exist for a date and the day after, picking any that
 * are missing. Called by the nightly job and the moderator menu.
 */
export async function runDailyPick(
  deps: Deps,
  today: PuzzleDate
): Promise<{ date: PuzzleDate; answer: string | null; fresh: boolean }[]> {
  const out: { date: PuzzleDate; answer: string | null; fresh: boolean }[] = [];
  for (const date of [today, addDays(today, 1)]) {
    const existing = await loadPuzzle(deps, date);
    if (existing) {
      out.push({ date, answer: existing.puzzle.answer, fresh: false });
      continue;
    }
    const picked = await pickPuzzle(deps, date);
    out.push({ date, answer: picked?.answer ?? null, fresh: picked !== null });
  }
  return out;
}
