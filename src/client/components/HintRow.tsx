import { guessHint } from '../lib/clue-text';

/**
 * The line under the guess box: what a miss costs, and a Skip for a player
 * with no idea, so they never have to throw away a guess on a random name
 * to see the next clue. Options (including the last guess) have no Skip:
 * the player just picks.
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
      {last ? null : (
        <button
          type="button"
          className="rh-link rh-skip"
          disabled={disabled}
          onClick={onSkip}
        >
          Skip
        </button>
      )}
    </div>
  );
}
