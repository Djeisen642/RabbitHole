/**
 * Spoiler-free share text for a finished round: the puzzle number, how many
 * clues it took and one square per guess. Never names the answer.
 */
import type { RoundStatus } from './rules';

export type ShareInput = {
  puzzleNumber: number;
  status: RoundStatus;
  /** Whether each guess was right, in order. */
  guesses: readonly boolean[];
  maxGuesses: number;
};

const WRONG = '🟫';
const RIGHT = '🟧';
const UNUSED = '⬜';

export function shareText(input: ShareInput): string {
  const { puzzleNumber, status, guesses, maxGuesses } = input;
  const wrong = guesses.filter((g) => !g).length;
  const headline =
    status === 'solved'
      ? wrong === 0
        ? 'solved on the post alone'
        : `solved with ${wrong} ${wrong === 1 ? 'clue' : 'clues'}`
      : status === 'failed'
        ? 'stumped this time'
        : 'still digging';
  const squares = [
    ...guesses.map((g) => (g ? RIGHT : WRONG)),
    ...Array.from(
      { length: Math.max(0, maxGuesses - guesses.length) },
      () => UNUSED
    ),
  ].join('');
  return `r/abbitHole #${puzzleNumber}: ${headline}\n${squares}`;
}
