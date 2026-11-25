import './fonts';
import './index.css';

import { StrictMode, useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { PuzzleResponse } from '../shared/api';
import { solvedWith } from '../shared/game/share';
import { bunnyPath } from './bunny/bunny';
import { fetchPuzzle } from './lib/api';
import { openGame } from './lib/platform';

const BUNNY = bunnyPath();

function statusLine(p: PuzzleResponse): string {
  if (p.status === 'solved')
    return `Today: ${solvedWith(p.result?.score ?? 0)}. Come back tomorrow.`;
  if (p.status === 'failed')
    return 'Stumped today. A new hole opens at midnight ET.';
  if (p.guesses.length > 0)
    return `${p.guessesLeft} guesses left. Keep digging.`;
  return `One post, ${p.maxGuesses} guesses. Which community is it from?`;
}

export const Splash = () => {
  const [puzzle, setPuzzle] = useState<PuzzleResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchPuzzle()
      .then(setPuzzle)
      .catch(() => {
        setFailed(true);
      });
  }, []);

  function play(event: MouseEvent<HTMLAnchorElement>): void {
    if (openGame(event.nativeEvent)) event.preventDefault();
  }

  return (
    <main className="rh-splash">
      <div>
        <h1 className="rh-wordmark" style={{ margin: 0 }}>
          <b>r/</b>abbitHole
        </h1>
        <p className="rh-muted" style={{ margin: '2px 0 0', fontSize: 14 }}>
          {puzzle
            ? `#${puzzle.number}${puzzle.streak.current > 0 ? ` · ${puzzle.streak.current} day streak` : ''}`
            : 'Guess the community'}
        </p>
      </div>
      <svg
        className="rh-splash-bunny"
        viewBox="-60 -182 125 186"
        aria-hidden="true"
      >
        <path d={BUNNY} />
      </svg>
      <p className="teaser">
        {puzzle ? (
          <>
            <q>{puzzle.post.title}</q>
            <br />
            <span className="rh-muted">{statusLine(puzzle)}</span>
          </>
        ) : failed ? (
          'Today’s post is still being dug up.'
        ) : (
          'Loading today’s post…'
        )}
      </p>
      {/* On Reddit this opens the expanded view; in local mock mode it is a plain link. */}
      <a
        className="rh-button"
        href="game.html"
        style={{ gridColumn: '1 / -1', justifySelf: 'start' }}
        onClick={play}
      >
        {puzzle && puzzle.status !== 'playing' ? 'See results' : 'Play'}
      </a>
    </main>
  );
};

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root element');

createRoot(rootElement).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
