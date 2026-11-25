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
import type { ClueKind } from '../shared/game/rules';
import type { BunnyControls } from './bunny/bunny';
import { BunnyStage } from './components/BunnyStage';
import { Clue } from './components/Clue';
import { GuessBox } from './components/GuessBox';
import { PostCard } from './components/PostCard';
import { Result, ResultActions } from './components/Result';
import { Tunnel } from './components/Tunnel';
import { ApiError, fetchPuzzle, sendGuess } from './lib/api';
import { CLUE_LABELS } from './lib/clue-labels';
import { trackVisualViewport } from './lib/viewport';

export const App = () => {
  const [puzzle, setPuzzle] = useState<PuzzleResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [freshFrom, setFreshFrom] = useState(Number.POSITIVE_INFINITY);
  // Clues the player opened or closed by hand; the rest follow the default
  // (only the newest open while playing, all closed at the end).
  const [toggled, setToggled] = useState<Partial<Record<ClueKind, boolean>>>(
    {}
  );
  // A round already solved when it loaded starts with the bunny down the
  // hole. Only loads set this; a live solve dives in on its own.
  const [solvedOnLoad, setSolvedOnLoad] = useState(false);
  const bunny = useRef<BunnyControls | null>(null);
  const shell = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLElement>(null);
  const scrollAfterGuess = useRef(false);
  const onBunny = useCallback((controls: BunnyControls | null) => {
    bunny.current = controls;
  }, []);
  // Stable between renders so GuessBox doesn't refetch suggestions every
  // time `busy` or `notice` changes.
  const guessed = useMemo(
    () => puzzle?.guesses.map((g) => g.name) ?? [],
    [puzzle]
  );

  const load = useCallback((next: PuzzleResponse) => {
    setPuzzle(next);
    setSolvedOnLoad(next.status === 'solved');
  }, []);

  useEffect(() => {
    fetchPuzzle()
      .then(load)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Could not load the puzzle.');
      });
  }, [load]);

  useEffect(() => {
    const el = shell.current;
    return el ? trackVisualViewport(el) : undefined;
  }, []);

  // After a guess, bring the new clue (just above the guess box) into view;
  // after the last one, go back up to the result.
  useEffect(() => {
    const el = scroller.current;
    if (!scrollAfterGuess.current || !el || !puzzle) return;
    scrollAfterGuess.current = false;
    const top = puzzle.status === 'playing' ? el.scrollHeight : 0;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)')
      .matches;
    el.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  }, [puzzle]);

  const onGuess = useCallback(
    async (name: string): Promise<boolean> => {
      if (!puzzle) return false;
      setBusy(true);
      setNotice(null);
      try {
        const next = await sendGuess({ guess: name, date: puzzle.date });
        const shownBefore = puzzle.result?.clues.length ?? puzzle.clues.length;
        setFreshFrom(shownBefore);
        scrollAfterGuess.current = true;
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
            .then(load)
            .catch(() => undefined);
        void bunny.current?.play('thump');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [puzzle, load]
  );

  const done = puzzle !== null && puzzle.status !== 'playing';
  const clues = puzzle ? (puzzle.result?.clues ?? puzzle.clues) : [];
  const wonAt = puzzle ? puzzle.guesses.findIndex((g) => g.correct) : -1;
  const nextKind = puzzle && !done ? puzzle.clueKinds[clues.length] : undefined;
  const newest = clues[clues.length - 1]?.kind;

  return (
    <div className="rh-app" ref={shell}>
      <header className="rh-top">
        <BunnyStage
          onReady={onBunny}
          ready={puzzle !== null || error !== null}
          inHole={solvedOnLoad}
        />
        <div className="rh-top-info">
          <h1 className="rh-wordmark">
            <b>r/</b>abbitHole
          </h1>
          {puzzle ? (
            <>
              <p className="rh-top-meta">
                #{puzzle.number}
                {puzzle.streak.current > 0 ? (
                  <>
                    <span aria-hidden="true"> · </span>
                    {puzzle.streak.current} day streak
                  </>
                ) : null}
              </p>
              <Tunnel
                max={puzzle.maxGuesses}
                used={puzzle.guesses.length}
                wonAt={wonAt >= 0 ? wonAt : null}
              />
            </>
          ) : null}
        </div>
      </header>

      <main className="rh-scroll" ref={scroller}>
        {error ? (
          <p className="rh-error" role="alert">
            {error}
          </p>
        ) : !puzzle ? (
          <p className="rh-muted">Digging up today’s post…</p>
        ) : (
          <>
            {done && puzzle.result ? (
              <Result
                result={puzzle.result}
                solved={puzzle.status === 'solved'}
                clueCount={puzzle.clueKinds.length}
              />
            ) : null}
            <PostCard
              post={puzzle.post}
              answer={puzzle.result?.answer ?? null}
            />
            {clues.length > 0 ? (
              <div className="rh-clues" aria-live="polite">
                {clues.map((clue, i) => (
                  <Clue
                    key={clue.kind}
                    clue={clue}
                    layer={i + 1}
                    open={toggled[clue.kind] ?? (!done && clue.kind === newest)}
                    fresh={i >= freshFrom}
                    onToggle={() => {
                      setToggled((t) => ({
                        ...t,
                        [clue.kind]: !(
                          t[clue.kind] ??
                          (!done && clue.kind === newest)
                        ),
                      }));
                    }}
                  />
                ))}
              </div>
            ) : null}
            {puzzle.guesses.length > 0 ? (
              <ul className="rh-guesses" aria-label="Your guesses">
                {puzzle.guesses.map((g) => (
                  <li key={g.name} className={g.correct ? 'right' : ''}>
                    r/{g.name}
                    <span className="rh-sr-only">
                      {g.correct ? ', right' : ', wrong'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </main>

      {puzzle ? (
        <footer className="rh-dock">
          {notice ? (
            <p className="rh-error" role="alert">
              {notice}
            </p>
          ) : null}
          {done && puzzle.result ? (
            <ResultActions result={puzzle.result} />
          ) : puzzle.username ? (
            <GuessBox
              disabled={busy}
              guessed={guessed}
              guessesLeft={puzzle.guessesLeft}
              nextClue={nextKind ? CLUE_LABELS[nextKind] : null}
              onGuess={onGuess}
            />
          ) : (
            <p className="rh-hint">Log in to Reddit to make a guess.</p>
          )}
        </footer>
      ) : null}
    </div>
  );
};

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root element');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
