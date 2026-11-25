/**
 * The slice of Devvit's redis client the game uses. Devvit's `redis` fits
 * this type as is; `MemoryStore` implements it in memory for tests and the
 * local mock server. Redis here has strings, hashes, numbers and sorted
 * sets, not plain sets or lists, so neither does this.
 */

export type ZMember = { member: string; score: number };

export type Store = {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<string>;
  del(...keys: string[]): Promise<void>;
  incrBy(key: string, value: number): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
  hGet(key: string, field: string): Promise<string | undefined>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hSet(key: string, fieldValues: Record<string, string>): Promise<number>;
  /** Set a field only if it is missing; 1 if it was set, 0 if it existed. */
  hSetNX(key: string, field: string, value: string): Promise<number>;
  hIncrBy(key: string, field: string, value: number): Promise<number>;
  zAdd(key: string, ...members: ZMember[]): Promise<number>;
  zIncrBy(key: string, member: string, value: number): Promise<number>;
  zScore(key: string, member: string): Promise<number | undefined>;
  zRange(
    key: string,
    start: number,
    stop: number,
    options: { by: 'score' | 'rank'; reverse?: boolean }
  ): Promise<ZMember[]>;
};

type Entry =
  | { kind: 'string'; value: string }
  | { kind: 'hash'; value: Map<string, string> }
  | { kind: 'zset'; value: Map<string, number> };

/** An in-memory Store. Expiry is accepted and ignored. */
export class MemoryStore implements Store {
  readonly #data = new Map<string, Entry>();

  #string(key: string): string | undefined {
    const entry = this.#data.get(key);
    if (entry && entry.kind !== 'string') throw new Error(`WRONGTYPE ${key}`);
    return entry?.value;
  }

  #hash(key: string): Map<string, string> {
    const entry = this.#data.get(key);
    if (!entry) {
      const value = new Map<string, string>();
      this.#data.set(key, { kind: 'hash', value });
      return value;
    }
    if (entry.kind !== 'hash') throw new Error(`WRONGTYPE ${key}`);
    return entry.value;
  }

  #zset(key: string): Map<string, number> {
    const entry = this.#data.get(key);
    if (!entry) {
      const value = new Map<string, number>();
      this.#data.set(key, { kind: 'zset', value });
      return value;
    }
    if (entry.kind !== 'zset') throw new Error(`WRONGTYPE ${key}`);
    return entry.value;
  }

  get(key: string): Promise<string | undefined> {
    return Promise.resolve(this.#string(key));
  }

  set(key: string, value: string): Promise<string> {
    this.#data.set(key, { kind: 'string', value });
    return Promise.resolve('OK');
  }

  del(...keys: string[]): Promise<void> {
    for (const key of keys) this.#data.delete(key);
    return Promise.resolve();
  }

  incrBy(key: string, value: number): Promise<number> {
    const next = Number(this.#string(key) ?? '0') + value;
    this.#data.set(key, { kind: 'string', value: String(next) });
    return Promise.resolve(next);
  }

  expire(_key: string, _seconds: number): Promise<void> {
    return Promise.resolve();
  }

  hGet(key: string, field: string): Promise<string | undefined> {
    const entry = this.#data.get(key);
    if (entry && entry.kind !== 'hash') throw new Error(`WRONGTYPE ${key}`);
    return Promise.resolve(entry?.value.get(field));
  }

  hGetAll(key: string): Promise<Record<string, string>> {
    const entry = this.#data.get(key);
    if (entry && entry.kind !== 'hash') throw new Error(`WRONGTYPE ${key}`);
    return Promise.resolve(Object.fromEntries(entry?.value ?? []));
  }

  hSet(key: string, fieldValues: Record<string, string>): Promise<number> {
    const hash = this.#hash(key);
    let added = 0;
    for (const [field, value] of Object.entries(fieldValues)) {
      if (!hash.has(field)) added += 1;
      hash.set(field, value);
    }
    return Promise.resolve(added);
  }

  hSetNX(key: string, field: string, value: string): Promise<number> {
    const hash = this.#hash(key);
    if (hash.has(field)) return Promise.resolve(0);
    hash.set(field, value);
    return Promise.resolve(1);
  }

  hIncrBy(key: string, field: string, value: number): Promise<number> {
    const hash = this.#hash(key);
    const next = Number(hash.get(field) ?? '0') + value;
    hash.set(field, String(next));
    return Promise.resolve(next);
  }

  zAdd(key: string, ...members: ZMember[]): Promise<number> {
    const set = this.#zset(key);
    let added = 0;
    for (const { member, score } of members) {
      if (!set.has(member)) added += 1;
      set.set(member, score);
    }
    return Promise.resolve(added);
  }

  zIncrBy(key: string, member: string, value: number): Promise<number> {
    const set = this.#zset(key);
    const next = (set.get(member) ?? 0) + value;
    set.set(member, next);
    return Promise.resolve(next);
  }

  zScore(key: string, member: string): Promise<number | undefined> {
    const entry = this.#data.get(key);
    if (entry && entry.kind !== 'zset') throw new Error(`WRONGTYPE ${key}`);
    return Promise.resolve(entry?.value.get(member));
  }

  zRange(
    key: string,
    start: number,
    stop: number,
    options: { by: 'score' | 'rank'; reverse?: boolean }
  ): Promise<ZMember[]> {
    const entry = this.#data.get(key);
    if (entry && entry.kind !== 'zset') throw new Error(`WRONGTYPE ${key}`);
    const all = [...(entry?.value ?? new Map<string, number>())]
      .map(([member, score]) => ({ member, score }))
      .sort((a, b) => a.score - b.score || a.member.localeCompare(b.member));
    if (options.reverse) all.reverse();
    if (options.by === 'score') {
      const lo = Math.min(start, stop);
      const hi = Math.max(start, stop);
      return Promise.resolve(
        all.filter(({ score }) => score >= lo && score <= hi)
      );
    }
    const end = stop < 0 ? all.length + stop : stop;
    return Promise.resolve(all.slice(start, end + 1));
  }
}
