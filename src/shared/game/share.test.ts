import { describe, expect, it } from 'vitest';
import { shareText, solvedWith } from './share';

describe('shareText', () => {
  it('shows squares and the clue count but never the answer', () => {
    const text = shareText({
      puzzleNumber: 12,
      status: 'solved',
      guesses: [false, false, true],
      maxGuesses: 6,
    });
    expect(text).toBe('r/abbitHole #12: solved with 2 clues\n🟫🟫🟧⬜⬜⬜');
  });

  it('handles a first-guess solve and a failed round', () => {
    expect(
      shareText({
        puzzleNumber: 1,
        status: 'solved',
        guesses: [true],
        maxGuesses: 5,
      })
    ).toContain('solved on the post alone');
    expect(
      shareText({
        puzzleNumber: 2,
        status: 'failed',
        guesses: [false, false, false, false, false],
        maxGuesses: 5,
      })
    ).toBe('r/abbitHole #2: stumped this time\n🟫🟫🟫🟫🟫');
  });
});

describe('solvedWith', () => {
  it('counts clues in words, singular for one', () => {
    expect(solvedWith(0)).toBe('solved on the post alone');
    expect(solvedWith(1)).toBe('solved with 1 clue');
    expect(solvedWith(3)).toBe('solved with 3 clues');
  });
});
