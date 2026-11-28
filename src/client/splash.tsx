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
import { openGame, visit } from './lib/platform';
import { streakLabel } from './lib/format';

// The splash has no game events to drive the bunny, so it never needs its
// controls; a module-level no-op keeps BunnyStage's effect from re-running.
const ignoreControls = (): void => undefined;

function statusLine(p: PuzzleResponse): string {
  if (p.today) {
    // With a link, the "Play today's" button says which is today's.
    const later = p.today.url ? '' : ' Today’s puzzle isn’t up yet.';
    if (p.status === 'solved') {
      const solved = solvedWith(p.result?.score ?? 0);
      return `${solved.charAt(0).toUpperCase()}${solved.slice(1)}.${later}`;
    }
    if (p.status === 'failed') return `Stumped on this one.${later}`;
    return `An older puzzle, just for fun.${later}`;
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

  const todayUrl = puzzle?.today?.url ?? null;
  function playToday(event: MouseEvent<HTMLAnchorElement>): void {
    if (todayUrl && visit(todayUrl)) event.preventDefault();
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
          A game by u/djeisen642
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
      <div className="actions">
        {/* Someone who lands on an older post in the feed most likely wants
            today's, so that comes first and this one becomes the quiet option. */}
        {todayUrl ? (
          <a className="rh-button" href={todayUrl} onClick={playToday}>
            Play today’s puzzle
          </a>
        ) : null}
        {/* On Reddit this opens the expanded view; in local mock mode it is a plain link. */}
        <a
          className={todayUrl ? 'rh-button quiet' : 'rh-button'}
          href="game.html"
          onClick={play}
        >
          {puzzle && puzzle.status !== 'playing'
            ? 'See results'
            : todayUrl
              ? 'Play this one'
              : 'Play'}
        </a>
      </div>
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
