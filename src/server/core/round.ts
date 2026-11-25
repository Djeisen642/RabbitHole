/**
 * A player's round and streak, stored per user and date, and the view of
 * the puzzle the API sends back.
 *
 * Redis keys:
 * - `round:YYYY-MM-DD:{userId}` hash: one field per guess, `0`, `1`, ...,
 *   holding the community name.
 * - `user:{userId}:streak` hash: `current`, `best`, `lastSolvedDay`.
 * - `wrong:YYYY-MM-DD` sorted set: wrong guess name scored by how many
 *   players made it.
 * - `stats:YYYY-MM-DD` hash: `players` (players who guessed at least once).
 * - `scores:YYYY-MM-DD` sorted set: userId scored by clues used (unsolved
 *   rounds score 99), for a later leaderboard.
 */
import type {
  GuessView,
  PuzzleResponse,
  RoundResult,
  Streak as StreakView,
  WrongGuessBar,
} from '../../shared/api';
import { dayNumber, puzzleNumber } from '../../shared/game/day';
import {
  applyGuess,
  cluesRevealed,
  isCorrectGuess,
  maxGuesses,
  newRound,
  score,
  updateStreak,
  visibleStreak,
} from '../../shared/game/rules';
import type { Round, Streak } from '../../shared/game/rules';
import { shareText } from '../../shared/game/share';
import { POOL, findEntry } from '../../shared/pool';
import type { Deps, User } from './deps';
import { clueView } from './puzzle';
import type { StoredCandidate, StoredPuzzle } from './puzzle';

export const UNSOLVED_SCORE = 99;
export const CHART_BARS = 5;

const roundKey = (date: string, userId: string): string =>
  `round:${date}:${userId}`;
const streakKey = (userId: string): string => `user:${userId}:streak`;
const wrongKey = (date: string): string => `wrong:${date}`;
const statsKey = (date: string): string => `stats:${date}`;
const scoresKey = (date: string): string => `scores:${date}`;

const EMPTY_STREAK: Streak = { current: 0, best: 0, lastSolvedDay: null };

function startRound(puzzle: StoredPuzzle): Round {
  return newRound(puzzle.answer, {
    aliases: findEntry(puzzle.answer, POOL)?.aliases ?? [],
    hasCustomIcon: puzzle.hasCustomIcon,
  });
}

export async function loadRound(
  deps: Deps,
  puzzle: StoredPuzzle,
  user: User | null
): Promise<Round> {
  let round = startRound(puzzle);
  if (!user) return round;
  const slots = await deps.store.hGetAll(roundKey(puzzle.date, user.id));
  for (let i = 0; slots[String(i)] !== undefined; i += 1)
    round = applyGuess(round, slots[String(i)] ?? '');
  return round;
}

export async function loadStreak(
  deps: Deps,
  user: User | null
): Promise<Streak> {
  if (!user) return EMPTY_STREAK;
  const s = await deps.store.hGetAll(streakKey(user.id));
  const last = s.lastSolvedDay;
  return {
    current: Number(s.current ?? '0') || 0,
    best: Number(s.best ?? '0') || 0,
    lastSolvedDay: last === undefined || last === '' ? null : Number(last),
  };
}

export type GuessOutcome =
  | { ok: true; round: Round; streak: Streak }
  | { ok: false; status: 400 | 401 | 409; message: string };

/**
 * Apply a guess for a user. Guesses must name a community in the full
 * answer pool (the autocomplete only offers those), so the wrong-guess chart
 * only ever shows real subs. Records the guess, the wrong-guess tally, and
 * on the last guess the score and streak.
 *
 * Two requests from the same player can arrive together (a double tap, two
 * tabs, or a script firing every guess at once). Each guess claims its slot
 * with HSETNX, so only one request can be the player's Nth guess; the other
 * gets a 409 and records nothing. Without this, parallel guesses all read
 * an empty round and the right one scores 0.
 */
export async function submitGuess(
  deps: Deps,
  puzzle: StoredPuzzle,
  user: User | null,
  input: string
): Promise<GuessOutcome> {
  if (!user) return { ok: false, status: 401, message: 'Log in to play.' };
  const entry = findEntry(input, POOL);
  if (!entry)
    return {
      ok: false,
      status: 400,
      message: 'Pick a community from the suggestions.',
    };
  const before = await loadRound(deps, puzzle, user);
  if (before.status !== 'playing')
    return { ok: false, status: 409, message: 'Today’s round is over.' };
  const round = applyGuess(before, entry.name);
  let streak = await loadStreak(deps, user);
  if (round === before) return { ok: true, round, streak };

  const date = puzzle.date;
  const slot = String(before.guesses.length);
  if (!(await deps.store.hSetNX(roundKey(date, user.id), slot, entry.name)))
    return {
      ok: false,
      status: 409,
      message: 'Another guess got there first. Reload to see your round.',
    };
  if (before.guesses.length === 0)
    await deps.store.hIncrBy(statsKey(date), 'players', 1);
  if (!isCorrectGuess(entry.name, round.answer, round.aliases))
    await deps.store.zIncrBy(wrongKey(date), entry.name, 1);

  if (round.status !== 'playing') {
    const solved = round.status === 'solved';
    streak = updateStreak(streak, dayNumber(date), solved);
    await deps.store.hSet(streakKey(user.id), {
      current: String(streak.current),
      best: String(streak.best),
      lastSolvedDay:
        streak.lastSolvedDay === null ? '' : String(streak.lastSolvedDay),
    });
    await deps.store.zAdd(scoresKey(date), {
      member: user.id,
      score: score(round) ?? UNSOLVED_SCORE,
    });
  }
  return { ok: true, round, streak };
}

export async function wrongGuessChart(
  deps: Deps,
  date: string
): Promise<{ bars: WrongGuessBar[]; players: number }> {
  const players =
    Number((await deps.store.hGet(statsKey(date), 'players')) ?? '0') || 0;
  const top = await deps.store.zRange(wrongKey(date), 0, CHART_BARS - 1, {
    by: 'rank',
    reverse: true,
  });
  const bars = top.map(({ member, score: count }) => ({
    name: member,
    count,
    percent: players > 0 ? Math.round((count / players) * 100) : 0,
  }));
  return { bars, players };
}

/**
 * What the player may see. While the round is being played: the masked
 * post, the clues revealed so far and the guesses. The answer, the other
 * clues and the chart are only added once the round has ended.
 */
export function puzzleView(args: {
  puzzle: StoredPuzzle;
  candidate: StoredCandidate;
  round: Round;
  streak: Streak;
  day: number;
  username: string | null;
  chart: { bars: WrongGuessBar[]; players: number } | null;
}): PuzzleResponse {
  const { puzzle, candidate, round, streak, day, username, chart } = args;
  const revealed = cluesRevealed(round);
  const guesses: GuessView[] = round.guesses.map((name) => ({
    name,
    correct: isCorrectGuess(name, round.answer, round.aliases),
  }));
  const shown = visibleStreak(streak, day);
  const streakView: StreakView = { current: shown.current, best: shown.best };
  const number = puzzleNumber(puzzle.date);
  const done = round.status !== 'playing';
  const result: RoundResult | null =
    done && chart
      ? {
          answer: puzzle.answer,
          clues: round.clues.map((kind) => clueView(kind, puzzle, candidate)),
          score: score(round),
          wrongGuesses: chart.bars,
          players: chart.players,
          visitUrl: `https://www.reddit.com/r/${puzzle.answer}/`,
          shareText: shareText({
            puzzleNumber: number,
            status: round.status,
            guesses: guesses.map((g) => g.correct),
            maxGuesses: maxGuesses(round),
          }),
        }
      : null;
  return {
    type: 'puzzle',
    date: puzzle.date,
    number,
    post: candidate.post,
    clueKinds: [...round.clues],
    clues: round.clues
      .slice(0, revealed)
      .map((kind) => clueView(kind, puzzle, candidate)),
    guesses,
    maxGuesses: maxGuesses(round),
    guessesLeft: done ? 0 : maxGuesses(round) - round.guesses.length,
    status: round.status,
    streak: streakView,
    username,
    result,
  };
}
