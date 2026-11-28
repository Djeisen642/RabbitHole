import { describe, expect, it } from 'vitest';
import type { PuzzleResponse } from '../../shared/api';
import { guessAnnouncement } from './clue-text';

type Next = Parameters<typeof guessAnnouncement>[0];

const comment = {
  kind: 'topComment',
  body: 'b',
  score: 1,
} as unknown as PuzzleResponse['clues'][number];

function next(over: Partial<Next>): Next {
  return {
    status: 'playing',
    guesses: [],
    clues: [],
    result: null,
    guessesLeft: 5,
    ...over,
  };
}

describe('guessAnnouncement', () => {
  it('names a wrong guess, the clue it opened and the guesses left', () => {
    expect(
      guessAnnouncement(
        next({
          guesses: [{ name: 'Cooking', correct: false, skipped: false }],
          clues: [comment],
          guessesLeft: 4,
        })
      )
    ).toBe('r/Cooking is wrong. New clue: the top comment. 4 guesses left.');
  });

  it('says a skip was a skip', () => {
    expect(
      guessAnnouncement(
        next({
          guesses: [{ name: '', correct: false, skipped: true }],
          clues: [comment],
          guessesLeft: 1,
        })
      )
    ).toBe('Skipped. New clue: the top comment. 1 guess left.');
  });

  it('gives the answer when the round ends', () => {
    const result = { answer: 'Breadit' } as PuzzleResponse['result'];
    expect(guessAnnouncement(next({ status: 'solved', result }))).toBe(
      'Right! It was r/Breadit.'
    );
    expect(guessAnnouncement(next({ status: 'failed', result }))).toBe(
      'Out of guesses. It was r/Breadit.'
    );
  });
});
