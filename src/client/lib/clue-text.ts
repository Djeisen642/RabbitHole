import type { PuzzleResponse } from '../../shared/api';
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

/**
 * What a screen reader hears after a guess: whether it was right, and if
 * not, which clue just opened and how many guesses are left. Sighted players
 * get the same from the bunny, the new clue and the tunnel.
 */
export function guessAnnouncement(
  next: Pick<
    PuzzleResponse,
    'status' | 'guesses' | 'clues' | 'result' | 'guessesLeft'
  >
): string {
  const last = next.guesses[next.guesses.length - 1];
  const answer = next.result?.answer;
  if (next.status === 'solved')
    return `Right! It was r/${answer ?? last?.name ?? ''}.`;
  if (next.status === 'failed')
    return answer ? `Out of guesses. It was r/${answer}.` : 'Out of guesses.';
  const said = !last
    ? ''
    : last.skipped
      ? 'Skipped.'
      : `r/${last.name} is wrong.`;
  const kind = next.clues[next.clues.length - 1]?.kind;
  const clue = kind ? ` New clue: ${lowerFirst(CLUE_LABELS[kind])}.` : '';
  const left = ` ${String(next.guessesLeft)} ${next.guessesLeft === 1 ? 'guess' : 'guesses'} left.`;
  return `${said}${clue}${left}`.trim();
}
