/**
 * The hidden pool of possible answers: types and lookups. The entries live in
 * `pool-data.ts`. Guesses autocomplete against the pool and the daily picker
 * chooses from it, but it is never sent to the client as a list: the suggest
 * endpoint returns a handful of matches for a typed prefix.
 *
 * Every entry is a public, safe-for-work community with a distinctive voice.
 * No NSFW, politics, tragedy or drama subs. Names use the subreddit's own
 * casing.
 */
import { normalizeSubreddit } from './game/rules';
import { POOL_DATA } from './pool-data';

export type PoolCategory =
  | 'animals'
  | 'books'
  | 'collecting'
  | 'country'
  | 'fitness'
  | 'food'
  | 'gaming'
  | 'hobby'
  | 'humor'
  | 'learning'
  | 'life'
  | 'nature'
  | 'outdoors'
  | 'places'
  | 'science';

export type PoolEntry = {
  name: string;
  /** Other names people type for it; also treated as giveaways in a post. */
  aliases: readonly string[];
  category: PoolCategory;
  /**
   * The sub's front page leans on news and politics (mostly country subs).
   * The picker skips posts whose title or flair reads like news there.
   */
  newsHeavy?: boolean;
};

export const POOL: readonly PoolEntry[] = POOL_DATA;

/** Shortest prefix the suggest endpoint answers, and how many it returns. */
export const SUGGEST_MIN_CHARS = 2;
export const SUGGEST_LIMIT = 8;

/** Every spelling of an entry, normalized. */
function spellings(entry: PoolEntry): string[] {
  return [entry.name, ...entry.aliases].map(normalizeSubreddit);
}

/** The pool entry a typed name refers to (by name or alias), if any. */
export function findEntry(
  input: string,
  pool: readonly PoolEntry[] = POOL
): PoolEntry | undefined {
  const key = normalizeSubreddit(input);
  if (key === '') return undefined;
  return (
    pool.find((entry) => normalizeSubreddit(entry.name) === key) ??
    pool.find((entry) => spellings(entry).includes(key))
  );
}

/**
 * Up to SUGGEST_LIMIT pool names matching a typed prefix of at least
 * SUGGEST_MIN_CHARS characters. Names whose own name starts with the prefix
 * come first, then names with a matching alias, each alphabetically. Shorter
 * input returns nothing, so the pool can't be listed.
 */
export function suggest(
  input: string,
  pool: readonly PoolEntry[] = POOL
): string[] {
  const prefix = normalizeSubreddit(input);
  if (prefix.length < SUGGEST_MIN_CHARS) return [];
  const byName: string[] = [];
  const byAlias: string[] = [];
  for (const entry of pool) {
    if (normalizeSubreddit(entry.name).startsWith(prefix))
      byName.push(entry.name);
    else if (spellings(entry).some((s) => s.startsWith(prefix)))
      byAlias.push(entry.name);
  }
  const alpha = (a: string, b: string): number =>
    a.toLowerCase().localeCompare(b.toLowerCase());
  return [...byName.sort(alpha), ...byAlias.sort(alpha)].slice(
    0,
    SUGGEST_LIMIT
  );
}
