/**
 * The moderator "Check pool" action: run the daily pick's per-sub checks
 * over every pool entry and store the results, a batch at a time so each
 * run stays inside Devvit's request time limit. Each batch queues the next
 * through the scheduler until the pool is done.
 *
 * Redis: `poolcheck:YYYY-MM-DD` hash, one field per sub (SubCheck JSON) plus
 * `_cursor` (next pool index), `_total` and `_updatedAt` (ms of the last
 * batch). Expires POOL_CHECK_KEEP_DAYS after its date. `poolcheck-lock:` guards
 * starting a check.
 */
import { addDays, puzzleDateAt } from '../../shared/game/day';
import { normalizeSubreddit } from '../../shared/game/rules';
import type { Deps } from './deps';
import {
  asBoolean,
  asNumber,
  asRecord,
  asString,
  asStringArray,
  parseJson,
} from './json';
import { tryLock } from './lock';
import { checkSub } from './puzzle-build';
import type { SubCheck } from './puzzle-build';
import { loadPuzzle, secondsToKeep } from './puzzle-store';

export const POOL_CHECK_BATCH = 10;
/** Days a pool check's results are kept after its date. */
export const POOL_CHECK_KEEP_DAYS = 3;
/**
 * A check whose last batch is older than this counts as dead (its
 * scheduler job failed), so a new one may start.
 */
export const POOL_CHECK_STALE_MS = 10 * 60_000;

export const poolCheckKey = (date: string): string => `poolcheck:${date}`;

export type PoolCheckProgress = {
  checked: number;
  total: number;
  done: boolean;
};

export async function runPoolCheckBatch(
  deps: Deps,
  date: string,
  batchSize = POOL_CHECK_BATCH
): Promise<PoolCheckProgress> {
  const key = poolCheckKey(date);
  const total = deps.pool.length;
  const start = Number((await deps.store.hGet(key, '_cursor')) ?? '0') || 0;
  const batch = deps.pool.slice(start, start + batchSize);
  const results: Record<string, string> = {};
  for (const entry of batch) {
    const check = await checkSub(deps.source, entry);
    if (!check.ok)
      deps.log(`pool check: r/${entry.name} ${check.problem ?? ''}`);
    results[entry.name] = JSON.stringify(check);
  }
  const checked = Math.min(total, start + batch.length);
  await deps.store.hSet(key, {
    ...results,
    _cursor: String(checked),
    _total: String(total),
    _updatedAt: String(deps.now().getTime()),
  });
  await deps.store.expire(key, secondsToKeep(deps, date, POOL_CHECK_KEEP_DAYS));
  const done = checked >= total;
  if (!done) await deps.scheduleNextPoolCheck(date);
  return { checked, total, done };
}

export type PoolCheckStart = PoolCheckProgress & { started: boolean };

/**
 * Start a fresh check for a date (dropping any earlier results), unless one
 * is still running: two would read every sub twice and write over each
 * other's cursor. A short lock covers two starts at the same moment; after
 * the first batch, `_updatedAt` shows the check is alive.
 */
export async function startPoolCheck(
  deps: Deps,
  date: string
): Promise<PoolCheckStart> {
  const key = poolCheckKey(date);
  const fields = await deps.store.hGetAll(key);
  const running = progressOf(deps, fields);
  const updatedAt = Number(fields._updatedAt ?? '0') || 0;
  const alive = deps.now().getTime() - updatedAt < POOL_CHECK_STALE_MS;
  if (running.checked > 0 && !running.done && alive)
    return { started: false, ...running };
  const lockKey = `poolcheck-lock:${date}`;
  if (!(await tryLock(deps.store, lockKey, 60_000, deps.now())))
    return { started: false, ...running };
  try {
    await deps.store.del(key);
    return { started: true, ...(await runPoolCheckBatch(deps, date)) };
  } finally {
    await deps.store.del(lockKey);
  }
}

function progressOf(
  deps: Deps,
  fields: Record<string, string>
): PoolCheckProgress {
  const checked = Number(fields._cursor ?? '0') || 0;
  const total = Number(fields._total ?? String(deps.pool.length)) || 0;
  return { checked, total, done: total > 0 && checked >= total };
}

function parseCheck(json: string): SubCheck | null {
  const c = asRecord(parseJson(json));
  const name = asString(c?.name);
  const ok = asBoolean(c?.ok);
  const problem = c?.problem === null ? null : asString(c?.problem);
  const subscribers = c?.subscribers === null ? null : asNumber(c?.subscribers);
  const textPosts = asNumber(c?.textPosts);
  const goodPosts = asNumber(c?.goodPosts);
  const sampleTitles = asStringArray(c?.sampleTitles);
  if (
    name === null ||
    ok === null ||
    textPosts === null ||
    goodPosts === null ||
    sampleTitles === null
  )
    return null;
  return {
    name,
    ok,
    problem: problem ?? null,
    subscribers: subscribers ?? null,
    textPosts,
    goodPosts,
    sampleTitles,
  };
}

export type PoolCheckReport = PoolCheckProgress & {
  date: string;
  results: SubCheck[];
};

/**
 * The stored results of a check. Sample titles of today's and tomorrow's
 * answers are left out, since they are likely the very posts players are
 * shown, and a moderator who plays shouldn't get the answer from them.
 */
export async function readPoolCheck(
  deps: Deps,
  date: string
): Promise<PoolCheckReport> {
  const fields = await deps.store.hGetAll(poolCheckKey(date));
  const hidden = await currentAnswers(deps);
  const results = Object.entries(fields)
    .filter(([field]) => !field.startsWith('_'))
    .map(([, json]) => parseCheck(json))
    .filter((c): c is SubCheck => c !== null)
    .map((c) =>
      hidden.has(normalizeSubreddit(c.name)) ? { ...c, sampleTitles: [] } : c
    )
    .sort(
      (a, b) => Number(a.ok) - Number(b.ok) || a.name.localeCompare(b.name)
    );
  return { date, ...progressOf(deps, fields), results };
}

/** Today's and tomorrow's answers, normalized. */
async function currentAnswers(deps: Deps): Promise<Set<string>> {
  const today = puzzleDateAt(deps.now());
  const out = new Set<string>();
  for (const date of [today, addDays(today, 1)]) {
    const loaded = await loadPuzzle(deps, date);
    if (loaded) out.add(normalizeSubreddit(loaded.puzzle.answer));
  }
  return out;
}
