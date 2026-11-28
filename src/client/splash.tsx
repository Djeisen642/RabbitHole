import './fonts';
import './index.css';

import { StrictMode, useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { PuzzleResponse } from '../shared/api';
import { solvedWith } from '../shared/game/share';
import { shortDate } from '../shared/game/day';
import { BunnyStage } from './components/BunnyStage';
import { fetchPuzzle } from './lib/api';
import { openGame } from './lib/platform';
import { streakLabel } from './lib/format';

// The splash has no game events to drive the bunny, so it never needs its
// controls; a module-level no-op keeps BunnyStage's effect from re-running.
const ignoreControls = (): void => undefined;

function statusLine(p: PuzzleResponse): string {
  if (p.today) {
    const later = `Today’s is #${p.today.number}.`;
    if (p.status === 'solved') {
      const solved = solvedWith(p.result?.score ?? 0);
      return `${solved.charAt(0).toUpperCase()}${solved.slice(1)}. ${later}`;
    }
    if (p.status === 'failed') return `Stumped on this one. ${later}`;
    return `An older puzzle, just for fun. ${later}`;
  }
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
          <b>r/</b>abbit_hole
        </h1>
        <p className="rh-muted" style={{ margin: '2px 0 0', fontSize: 14 }}>
          {puzzle
            ? [`#${puzzle.number}`, shortDate(puzzle.date), streakLabel(puzzle)]
                .filter(Boolean)
                .join(' · ')
            : 'Guess the community'}
        </p>
        <p className="rh-muted" style={{ margin: 0, fontSize: 12 }}>
          by u/djeisen642
        </p>
      </div>
      {/* Same live, tappable bunny as the game header. Wait for the puzzle so a
          player who already solved today sees it down the hole. */}
      <BunnyStage
        onReady={ignoreControls}
        ready={puzzle !== null || failed}
        inHole={puzzle?.status === 'solved'}
      />
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
