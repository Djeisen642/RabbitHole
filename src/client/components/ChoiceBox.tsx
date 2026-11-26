import type { ReactNode } from 'react';
import type { GuessView } from '../../shared/api';
import { normalizeSubreddit } from '../../shared/game/rules';
import { guessHint } from '../lib/hint';

/**
 * Names longer than this get smaller text, so most fit a phone-width
 * button without being cut off.
 */
const LONG_NAME = 14;

/**
 * Let a long name wrap where its words meet ("Camping|And|Hiking") instead
 * of being cut off. All-lowercase names have no such points and rely on
 * the smaller text.
 */
function breakable(name: string): ReactNode[] {
  return name
    .split(/(?<=[a-z0-9])(?=[A-Z])/)
    .flatMap((part, i) => (i === 0 ? [part] : [<wbr key={i} />, part]));
}

/**
 * Multiple choice, docked where the guess box goes: one button per option
 * for new players and for training wheels. A wrong pick is a wrong guess,
 * so it stays on screen crossed out and can't be picked again.
 */
export function ChoiceBox({
  options,
  guesses,
  disabled,
  guessesLeft,
  nextClue,
  onGuess,
}: {
  options: readonly string[];
  guesses: readonly GuessView[];
  disabled: boolean;
  guessesLeft: number;
  /** What a wrong pick digs up next, or null on the last guess. */
  nextClue: string | null;
  onGuess: (name: string) => Promise<boolean>;
}) {
  const picked = new Map(
    guesses.map((g) => [normalizeSubreddit(g.name), g.correct])
  );

  return (
    <div className="rh-guess">
      <div
        className="rh-choices"
        role="group"
        aria-label="Which community is this from?"
      >
        {options.map((name) => {
          const result = picked.get(normalizeSubreddit(name));
          const state = result === undefined ? '' : result ? 'right' : 'wrong';
          return (
            <button
              key={name}
              type="button"
              className={`rh-choice ${state}${name.length > LONG_NAME ? ' long' : ''}`}
              disabled={disabled || result !== undefined}
              onClick={() => {
                void onGuess(name);
              }}
            >
              r/{breakable(name)}
              {state === 'wrong' ? (
                <span className="rh-sr-only">, wrong</span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="rh-hint">{guessHint(guessesLeft, nextClue)}</p>
    </div>
  );
}
