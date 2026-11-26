import { guessHint } from '../lib/hint';

/**
 * The line under the guess box or the options: what a miss costs, and an
 * "I don't know" for a player with no idea, so they never have to throw
 * away a guess on a random name to see the next clue. On the last guess it
 * reads "Give up", since a skip then ends the round.
 */
export function HintRow({
  guessesLeft,
  nextClue,
  disabled,
  onSkip,
}: {
  guessesLeft: number;
  nextClue: string | null;
  disabled: boolean;
  onSkip: () => void;
}) {
  const last = guessesLeft === 1 || nextClue === null;
  return (
    <div className="rh-hint-row">
      <p className="rh-hint">{guessHint(guessesLeft, nextClue)}</p>
      <button
        type="button"
        className="rh-link rh-skip"
        disabled={disabled}
        onClick={onSkip}
      >
        {last ? 'Give up' : 'I don’t know'}
      </button>
    </div>
  );
}
