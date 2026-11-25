import { useId } from 'react';

/**
 * Training wheels: after a run of losses, a typing round offers options.
 * Only shown before the round's first guess; typing a guess instead counts
 * as no (the server closes the offer).
 */
export function Offer({
  disabled,
  onAnswer,
}: {
  disabled: boolean;
  onAnswer: (accept: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="rh-offer" role="group" aria-labelledby={id}>
      <p id={id}>Tough few days. Want some options?</p>
      <button
        type="button"
        className="rh-button"
        disabled={disabled}
        onClick={() => {
          onAnswer(true);
        }}
      >
        Yes
      </button>
      <button
        type="button"
        className="rh-button quiet"
        disabled={disabled}
        onClick={() => {
          onAnswer(false);
        }}
      >
        No
      </button>
    </div>
  );
}
