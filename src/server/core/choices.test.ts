import { describe, expect, it } from 'vitest';
import { normalizeSubreddit } from '../../shared/game/rules';
import { POOL, findEntry } from '../../shared/pool';
import { choiceOptions } from './choices';

const base = {
  answer: 'Breadit',
  date: '2026-11-25',
  salt: 'test-salt',
  pool: POOL,
  exclude: new Set<string>(),
};

const categoryOf = (name: string): string | undefined =>
  findEntry(name, POOL)?.category;

describe('choiceOptions', () => {
  it('returns the asked-for count, with the answer once and no repeats', () => {
    for (const count of [5, 10]) {
      const options = choiceOptions({ ...base, count });
      expect(options).toHaveLength(count);
      expect(options.filter((o) => o === 'Breadit')).toHaveLength(1);
      expect(new Set(options.map(normalizeSubreddit)).size).toBe(count);
    }
  });

  it('prefers distractors from the answer’s own category', () => {
    // Food has plenty of subs, so every distractor is a food sub.
    const options = choiceOptions({ ...base, count: 10 });
    expect(options.every((o) => categoryOf(o) === 'food')).toBe(true);
  });

  it('tops up from other categories when the category is too small', () => {
    const collecting = POOL.filter((e) => e.category === 'collecting');
    expect(collecting.length).toBeLessThan(10);
    const answer = collecting[0]?.name ?? '';
    const options = choiceOptions({ ...base, answer, count: 10 });
    expect(options).toHaveLength(10);
    expect(options).toContain(answer);
    // Every other collecting sub is offered before any other category.
    for (const e of collecting) expect(options).toContain(e.name);
  });

  it('is the same every time for the same day and answer', () => {
    const a = choiceOptions({ ...base, count: 10 });
    const b = choiceOptions({ ...base, count: 10 });
    expect(a).toEqual(b);
    // The five-option list is drawn from the ten-option one, so a player on
    // five and one on ten learn nothing new by comparing lists.
    const five = choiceOptions({ ...base, count: 5 });
    for (const o of five) expect(a).toContain(o);
  });

  it('changes with the day and the secret salt', () => {
    const a = choiceOptions({ ...base, count: 10 });
    expect(
      choiceOptions({ ...base, count: 10, date: '2026-11-26' })
    ).not.toEqual(a);
    expect(choiceOptions({ ...base, count: 10, salt: 'other' })).not.toEqual(a);
  });

  it('never offers an excluded sub, such as tomorrow’s answer', () => {
    const all = choiceOptions({ ...base, count: 10 });
    const banned = all.find((o) => o !== 'Breadit') ?? '';
    const options = choiceOptions({
      ...base,
      count: 10,
      exclude: new Set([normalizeSubreddit(banned)]),
    });
    expect(options).toHaveLength(10);
    expect(options).not.toContain(banned);
  });

  it('never offers an alias of the answer as a separate option', () => {
    const others = choiceOptions({ ...base, count: 10 })
      .filter((o) => o !== 'Breadit')
      .map(normalizeSubreddit);
    const entry = findEntry('Breadit', POOL);
    for (const alias of entry?.aliases ?? [])
      expect(others).not.toContain(normalizeSubreddit(alias));
  });

  it('still offers the answer when it has left the pool', () => {
    const options = choiceOptions({ ...base, answer: 'RetiredSub', count: 5 });
    expect(options).toContain('RetiredSub');
    expect(options).toHaveLength(5);
  });
});
