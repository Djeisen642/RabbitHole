import { describe, expect, it } from 'vitest';
import {
  applyGuess,
  cluesFor,
  cluesRevealed,
  isCorrectGuess,
  maxGuesses,
  newRound,
  normalizeSubreddit,
  rankByScore,
  score,
  updateStreak,
  visibleStreak,
} from './rules';

describe('normalizeSubreddit', () => {
  it('ignores case, r/ prefix and separators', () => {
    expect(normalizeSubreddit('  /r/Ask_Reddit ')).toBe('askreddit');
    expect(normalizeSubreddit('r/no-sleep')).toBe('nosleep');
  });
});

describe('isCorrectGuess', () => {
  it('matches the answer or an alias', () => {
    expect(isCorrectGuess('r/AskReddit', 'AskReddit')).toBe(true);
    expect(isCorrectGuess('ask reddit', 'AskReddit')).toBe(true);
    expect(isCorrectGuess('nba', 'nba', ['basketball'])).toBe(true);
    expect(isCorrectGuess('basketball', 'nba', ['basketball'])).toBe(true);
    expect(isCorrectGuess('', 'nba')).toBe(false);
    expect(isCorrectGuess('nfl', 'nba')).toBe(false);
  });
});

describe('a round', () => {
  it('reveals one clue per wrong guess and scores clues used', () => {
    let round = newRound('Breadit', { hasCustomIcon: true });
    round = applyGuess(round, 'Baking');
    round = applyGuess(round, 'Sourdough');
    expect(cluesRevealed(round)).toBe(2);
    expect(round.status).toBe('playing');
    round = applyGuess(round, 'r/breadit');
    expect(round.status).toBe('solved');
    expect(score(round)).toBe(2);
  });

  it('scores 0 when solved on the post alone', () => {
    expect(
      score(applyGuess(newRound('Breadit', { hasCustomIcon: true }), 'Breadit'))
    ).toBe(0);
  });

  it('ignores blank and repeated guesses', () => {
    let round = applyGuess(
      newRound('Breadit', { hasCustomIcon: true }),
      'Baking'
    );
    round = applyGuess(round, ' baking ');
    round = applyGuess(round, '   ');
    expect(round.guesses).toHaveLength(1);
  });

  it('fails after six wrong guesses when the sub has an icon', () => {
    let round = newRound('Breadit', { hasCustomIcon: true });
    expect(maxGuesses(round)).toBe(6);
    for (const g of ['a', 'b', 'c', 'd', 'e', 'f'])
      round = applyGuess(round, g);
    expect(round.status).toBe('failed');
    expect(cluesRevealed(round)).toBe(5);
    expect(score(round)).toBeNull();
    expect(applyGuess(round, 'Breadit').status).toBe('failed');
  });

  it('skips the icon clue and allows five guesses without a custom icon', () => {
    let round = newRound('Breadit', { hasCustomIcon: false });
    expect(round.clues).not.toContain('icon');
    expect(maxGuesses(round)).toBe(5);
    for (const g of ['a', 'b', 'c', 'd', 'e']) round = applyGuess(round, g);
    expect(round.status).toBe('failed');
    expect(cluesRevealed(round)).toBe(4);
  });
});

describe('cluesFor', () => {
  it('keeps reveal order and only adds the icon when there is one', () => {
    expect(cluesFor(true)).toEqual([
      'topComment',
      'about',
      'jargon',
      'stats',
      'icon',
    ]);
    expect(cluesFor(false)).toEqual(['topComment', 'about', 'jargon', 'stats']);
  });
});

describe('rankByScore', () => {
  it('ranks fewer clues first, shares ties, puts unsolved last', () => {
    const ranked = rankByScore([
      { user: 'a', score: 2 },
      { user: 'b', score: null },
      { user: 'c', score: 0 },
      { user: 'd', score: 2 },
    ]);
    expect(ranked.map((r) => [r.user, r.rank])).toEqual([
      ['c', 1],
      ['a', 2],
      ['d', 2],
      ['b', 4],
    ]);
  });
});

describe('updateStreak', () => {
  const start = { current: 0, best: 0, lastSolvedDay: null };

  it('extends on consecutive days and resets on a gap or a loss', () => {
    let s = updateStreak(start, 10, true);
    s = updateStreak(s, 11, true);
    expect(s).toEqual({ current: 2, best: 2, lastSolvedDay: 11 });
    expect(updateStreak(s, 13, true).current).toBe(1);
    expect(updateStreak(s, 12, false)).toEqual({
      current: 0,
      best: 2,
      lastSolvedDay: 11,
    });
  });

  it('does not double count the same day', () => {
    const s = updateStreak(updateStreak(start, 10, true), 10, true);
    expect(s.current).toBe(1);
  });
});

describe('visibleStreak', () => {
  const s = { current: 4, best: 6, lastSolvedDay: 20 };

  it('keeps a streak solved today or yesterday', () => {
    expect(visibleStreak(s, 20).current).toBe(4);
    expect(visibleStreak(s, 21).current).toBe(4);
  });

  it('shows a lapsed streak as zero but keeps the best', () => {
    expect(visibleStreak(s, 22)).toEqual({ ...s, current: 0 });
  });
});
