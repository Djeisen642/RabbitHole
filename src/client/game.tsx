import './fonts';
import './index.css';

import {
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import type { PuzzleResponse } from '../shared/api';
import type { BunnyControls } from './bunny/bunny';
import { BunnyStage } from './components/BunnyStage';
import { Clue } from './components/Clue';
import { GuessBox } from './components/GuessBox';
import { PostCard } from './components/PostCard';
import { Result } from './components/Result';
import { Tunnel } from './components/Tunnel';
import { ApiError, fetchPuzzle, sendGuess } from './lib/api';
import { CLUE_LABELS } from './lib/clue-labels';

export const App = () => {
  const [puzzle, setPuzzle] = useState<PuzzleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [freshFrom, setFreshFrom] = useState(Number.POSITIVE_INFINITY);
  const bunny = useRef<BunnyControls | null>(null);
  const onBunny = useCallback((controls: BunnyControls | null) => {
    bunny.current = controls;
  }, []);
  // Stable between renders so GuessBox doesn't refetch suggestions every
  // time `busy` or `notice` changes.
  const guessed = useMemo(
    () => puzzle?.guesses.map((g) => g.name) ?? [],
    [puzzle]
  );

  useEffect(() => {
    fetchPuzzle()
      .then(setPuzzle)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Could not load the puzzle.');
      });
  }, []);

  const onGuess = useCallback(
    async (name: string): Promise<boolean> => {
      if (!puzzle) return false;
      setBusy(true);
      setNotice(null);
      try {
        const next = await sendGuess({ guess: name, date: puzzle.date });
        const shownBefore = puzzle.result?.clues.length ?? puzzle.clues.length;
        setFreshFrom(shownBefore);
        setPuzzle(next);
        const last = next.guesses[next.guesses.length - 1];
        if (next.status === 'solved') {
          void bunny.current
            ?.play('perk')
            .then(() => bunny.current?.play('dive'));
        } else if (last && !last.correct) {
          const wrong = next.guesses.filter((g) => !g.correct).length;
          void bunny.current?.play(wrong % 2 === 1 ? 'droop' : 'thump');
        }
        return true;
      } catch (e: unknown) {
        setNotice(
          e instanceof Error ? e.message : 'That guess did not go through.'
        );
        // 409: the day rolled over or another tab guessed first. Either way
        // the round on screen is stale, so show the server's copy.
        if (e instanceof ApiError && e.status === 409)
          void fetchPuzzle()
            .then(setPuzzle)
            .catch(() => undefined);
        void bunny.current?.play('thump');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [puzzle]
  );

  if (error) {
    return (
      <main className="rh-page">
        <Header puzzle={null} />
        <BunnyStage onReady={onBunny} />
        <p className="rh-error" role="alert">
          {error}
        </p>
      </main>
    );
  }
  if (!puzzle) {
    return (
      <main className="rh-page">
        <Header puzzle={null} />
        <BunnyStage onReady={onBunny} />
        <p className="rh-muted" style={{ textAlign: 'center' }}>
          Digging up today’s post…
        </p>
      </main>
    );
  }

  const done = puzzle.status !== 'playing';
  const clues = puzzle.result?.clues ?? puzzle.clues;
  const wonAt = puzzle.guesses.findIndex((g) => g.correct);
  const buried = done ? [] : puzzle.clueKinds.slice(clues.length);

  return (
    <main className="rh-page">
      <Header puzzle={puzzle} />
      <BunnyStage onReady={onBunny} />
      <Tunnel
        max={puzzle.maxGuesses}
        used={puzzle.guesses.length}
        wonAt={wonAt >= 0 ? wonAt : null}
      />
      <PostCard post={puzzle.post} answer={puzzle.result?.answer ?? null} />

      {done && puzzle.result ? (
        <Result
          result={puzzle.result}
          solved={puzzle.status === 'solved'}
          clueCount={puzzle.clueKinds.length}
        />
      ) : puzzle.username ? (
        <GuessBox
          disabled={busy}
          guessed={guessed}
          guessesLeft={puzzle.guessesLeft}
          onGuess={onGuess}
        />
      ) : (
        <p className="rh-muted">Log in to Reddit to make a guess.</p>
      )}

      {notice ? (
        <p className="rh-error" role="alert">
          {notice}
        </p>
      ) : null}

      {puzzle.guesses.length > 0 ? (
        <ul className="rh-guesses" aria-label="Your guesses">
          {puzzle.guesses.map((g) => (
            <li key={g.name} className={g.correct ? 'right' : ''}>
              r/{g.name}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="rh-clues" aria-live="polite">
        {clues.map((clue, i) => (
          <Clue
            key={clue.kind}
            clue={clue}
            layer={i + 1}
            fresh={i >= freshFrom}
            clearIcon={done}
          />
        ))}
        {buried.map((kind, i) => (
          <div className="rh-buried" key={kind}>
            Layer {clues.length + i + 1}:{' '}
            {i === 0 ? CLUE_LABELS[kind] : 'still buried'}
          </div>
        ))}
      </div>
    </main>
  );
};

function Header({ puzzle }: { puzzle: PuzzleResponse | null }) {
  return (
    <header className="rh-header">
      <h1 className="rh-wordmark" style={{ margin: 0 }}>
        <b>r/</b>abbitHole
      </h1>
      {puzzle ? (
        <span className="rh-chip">
          #{puzzle.number}
          <span aria-hidden="true">·</span>
          {puzzle.streak.current > 0
            ? `${puzzle.streak.current} day streak`
            : 'no streak yet'}
        </span>
      ) : null}
    </header>
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root element');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
