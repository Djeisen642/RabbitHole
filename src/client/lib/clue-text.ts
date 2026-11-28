import type { ClueKind } from '../../shared/game/rules';

/** How each clue is introduced, as a layer of the burrow. */
export const CLUE_LABELS: Record<ClueKind, string> = {
  topComment: 'The top comment',
  about: 'How it describes itself',
  jargon: 'Words the regulars use',
  topPost: 'Its biggest post ever',
  stats: 'Members and birthday',
  icon: 'Its icon',
};

/**
 * The line under the guess box or the options: what a miss costs. Shared so
 * typing and picking read the same.
 */
export function guessHint(
  guessesLeft: number,
  nextClue: string | null
): string {
  return guessesLeft === 1 || nextClue === null
    ? 'Last guess.'
    : `A wrong guess shows you ${lowerFirst(nextClue)}.`;
}

const lowerFirst = (text: string): string =>
  text.charAt(0).toLowerCase() + text.slice(1);
