/**
 * The moderator "Check pool" action: run the daily pick's per-sub checks
 * over every pool entry and store the results, a batch at a time so each
 * run stays inside Devvit's request time limit. Each batch queues the next
 * through the scheduler until the pool is done.
 *
 * Redis: `poolcheck:YYYY-MM-DD` hash, one field per sub (SubCheck JSON) plus
 * `_cursor` (next pool index) and `_total`.
 */
import type { Deps } from './deps';
import {
  asBoolean,
  asNumber,
  asRecord,
  asString,
  asStringArray,
  parseJson,
} from './json';
import { checkSub } from './puzzle';
import type { SubCheck } from './puzzle';

export const POOL_CHECK_BATCH = 10;

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
  });
  const done = checked >= total;
  if (!done) await deps.scheduleNextPoolCheck(date);
  return { checked, total, done };
}

/** Start a fresh check for a date (dropping any earlier results). */
export async function startPoolCheck(
  deps: Deps,
  date: string
): Promise<PoolCheckProgress> {
  await deps.store.del(poolCheckKey(date));
  return runPoolCheckBatch(deps, date);
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

export async function readPoolCheck(
  deps: Deps,
  date: string
): Promise<PoolCheckReport> {
  const fields = await deps.store.hGetAll(poolCheckKey(date));
  const results = Object.entries(fields)
    .filter(([field]) => !field.startsWith('_'))
    .map(([, json]) => parseCheck(json))
    .filter((c): c is SubCheck => c !== null)
    .sort(
      (a, b) => Number(a.ok) - Number(b.ok) || a.name.localeCompare(b.name)
    );
  const checked = Number(fields._cursor ?? '0') || 0;
  const total = Number(fields._total ?? String(deps.pool.length)) || 0;
  return { date, checked, total, done: total > 0 && checked >= total, results };
}
