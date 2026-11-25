import { describe, expect, it } from 'vitest';
import { normalizeSubreddit } from './game/rules';
import {
  POOL,
  SUGGEST_LIMIT,
  SUGGEST_MIN_CHARS,
  findEntry,
  suggest,
} from './pool';
import type { PoolEntry } from './pool';

describe('POOL', () => {
  it('has about 140 communities with unique names and spellings', () => {
    expect(POOL.length).toBeGreaterThanOrEqual(100);
    expect(POOL.length).toBeLessThanOrEqual(160);
    const seen = new Map<string, string>();
    for (const entry of POOL) {
      for (const s of [entry.name, ...entry.aliases].map(normalizeSubreddit)) {
        expect(seen.get(s) ?? entry.name, `${s} is used twice`).toBe(
          entry.name
        );
        seen.set(s, entry.name);
      }
    }
  });

  it('marks every country sub as news heavy, and only those', () => {
    for (const entry of POOL)
      expect(entry.newsHeavy === true).toBe(entry.category === 'country');
    expect(POOL.filter((e) => e.category === 'country').length).toBe(22);
  });
});

describe('findEntry', () => {
  it('resolves names and aliases however they are typed', () => {
    expect(findEntry('r/Breadit')?.name).toBe('Breadit');
    expect(findEntry('  /r/breddit ')?.name).toBe('Breadit');
    expect(findEntry('Mechanical Keyboards')?.name).toBe('MechanicalKeyboards');
    expect(findEntry('Canadian')?.name).toBe('canada');
    expect(findEntry('not-a-real-sub-xyz')).toBeUndefined();
    expect(findEntry('')).toBeUndefined();
  });
});

describe('suggest', () => {
  it('needs at least two characters', () => {
    expect(SUGGEST_MIN_CHARS).toBe(2);
    expect(suggest('')).toEqual([]);
    expect(suggest('b')).toEqual([]);
    expect(suggest('r/b')).toEqual([]);
  });

  it('never returns more than the limit, so the pool cannot be listed', () => {
    const crowded: PoolEntry[] = Array.from(
      { length: SUGGEST_LIMIT + 5 },
      (_, i) => ({ name: `same${String(i)}`, aliases: [], category: 'hobby' })
    );
    expect(suggest('same', crowded)).toHaveLength(SUGGEST_LIMIT);
  });

  it('puts name matches before alias matches', () => {
    const names = suggest('bre');
    expect(names[0]).toBe('Breadit');
    expect(suggest('canadi')).toEqual(['canada']);
    expect(suggest('r/mech')).toContain('MechanicalKeyboards');
  });
});
