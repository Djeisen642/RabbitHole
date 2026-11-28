import type { MouseEvent } from 'react';
import { visit } from '../lib/platform';

/**
 * The note on an older post: its own day's puzzle still plays, just not for
 * the streak, and today's is a tap away.
 */
export function OlderPuzzle({
  today,
}: {
  today: { number: number; url: string | null };
}) {
  const url = today.url;
  function open(event: MouseEvent<HTMLAnchorElement>): void {
    if (url && visit(url)) event.preventDefault();
  }
  return (
    <p className="rh-older">
      An older puzzle, just for fun. It won’t change your streak.{' '}
      {url ? (
        <a className="rh-link" href={url} onClick={open}>
          Play today’s puzzle
        </a>
      ) : (
        <>Today’s puzzle isn’t up yet.</>
      )}
    </p>
  );
}
