import { describe, expect, it } from 'vitest';
import { streakLabel } from './streak';

const streak = { current: 2, best: 5 };

describe('streakLabel', () => {
  it("shows the current streak on today's puzzle", () => {
    expect(streakLabel({ streak, today: null })).toBe('2 day streak');
  });

  it('shows nothing without a current streak', () => {
    expect(streakLabel({ streak: { current: 0, best: 5 }, today: null })).toBe(
      null
    );
  });

  it("hides the streak on an older day's puzzle", () => {
    expect(streakLabel({ streak, today: { number: 3, url: null } })).toBe(null);
  });
});
