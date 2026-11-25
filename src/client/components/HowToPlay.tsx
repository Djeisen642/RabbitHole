import { useEffect, useId, useRef } from 'react';

/**
 * How to play, in four lines. Opens by itself for a player who has never
 * finished a round (the server decides, from their history, since local
 * storage may not last in Reddit's web view) and from the "?" in the
 * header. It covers the post and the dock but not the header, so the bunny
 * stays in view.
 */
export function HowToPlay({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    button.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="rh-howto-shade">
      <section
        className="rh-howto"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId}>How to play</h2>
        <ol>
          <li>
            You get a real Reddit post, its title and text, with the community
            hidden.
          </li>
          <li>Guess which subreddit it came from.</li>
          <li>
            Stuck? Each miss digs up a clue, and every clue costs a point.
          </li>
          <li>
            One new puzzle a day, the same for everyone. Lowest score wins.
          </li>
        </ol>
        <button
          ref={button}
          type="button"
          className="rh-button"
          onClick={onClose}
        >
          Got it
        </button>
      </section>
    </div>
  );
}
