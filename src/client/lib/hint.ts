/**
 * The line under the guess box or the options: what a miss costs. Shared so
 * typing and picking read the same.
 */
export function guessHint(
  guessesLeft: number,
  nextClue: string | null
): string {
  return guessesLeft === 1 || nextClue === null
    ? 'Last guess. Make it count.'
    : `A miss digs up ${lowerFirst(nextClue)}.`;
}

const lowerFirst = (text: string): string =>
  text.charAt(0).toLowerCase() + text.slice(1);
