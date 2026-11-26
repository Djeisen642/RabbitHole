/**
 * A player's round and streak, stored per user and date, and the view of
 * the puzzle the API sends back.
 *
 * Redis keys:
 * - `round:YYYY-MM-DD:{userId}` hash: `start` (RoundStart JSON: the answer
 *   the round is played against and where its guesses begin) and one field
 *   per guess, `0`, `1`, ..., holding the community name. Expires
 *   PLAYER_KEEP_DAYS after the last guess.
 * - `user:{userId}:streak` hash: `current`, `best`, `lastSolvedDay`. Kept
 *   with no expiry: it is the player's running record across days (the best
 *   streak never lapses), and holds only three numbers.
 * - `wrong:YYYY-MM-DD` sorted set: wrong guess name scored by how many
 *   players made it.
 * - `stats:YYYY-MM-DD` hash: `players` (players who guessed at least once).
 * - `scores:YYYY-MM-DD` sorted set: userId scored by clues used (unsolved
 *   rounds score 99), for a later leaderboard. Expires after
 *   PLAYER_KEEP_DAYS.
 */
import type {
  ClueView,
  GuessView,
  PostCard,
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
  normalizeSubreddit,
  score,
  updateStreak,
  visibleStreak,
} from '../../shared/game/rules';
import type { ClueKind, Round, Streak } from '../../shared/game/rules';
import { shareText } from '../../shared/game/share';
import { POOL, findEntry } from '../../shared/pool';
import type { Deps, User } from './deps';
import {
  asBoolean,
  asNumber,
  asRecord,
  asString,
  asStringArray,
  parseJson,
} from './json';
import { clueView } from './puzzle';
import type { StoredCandidate, StoredPuzzle } from './puzzle';

export const UNSOLVED_SCORE = 99;
export const CHART_BARS = 5;
/**
 * Days a player's round and the day's scores are kept. Long enough for a
 * later leaderboard over recent days; after that only the streak remains.
 */
export const PLAYER_KEEP_DAYS = 30;
const PLAYER_KEEP_SECONDS = PLAYER_KEEP_DAYS * 86_400;

const roundKey = (date: string, userId: string): string =>
  `round:${date}:${userId}`;
const streakKey = (userId: string): string => `user:${userId}:streak`;
const wrongKey = (date: string): string => `wrong:${date}`;
const statsKey = (date: string): string => `stats:${date}`;
const scoresKey = (date: string): string => `scores:${date}`;

const EMPTY_STREAK: Streak = { current: 0, best: 0, lastSolvedDay: null };

/**
 * What a round is played against, saved when it starts so a later change
 * to the day's answer (a mid-day repick) or to the pool (a deploy) can't
 * rescore it. `from` is the first guess slot that belongs to this round.
 */
export type RoundStart = {
  answer: string;
  aliases: string[];
  hasCustomIcon: boolean;
  from: number;
};

function startFor(puzzle: StoredPuzzle, from: number): RoundStart {
  return {
    answer: puzzle.answer,
    aliases: [...(findEntry(puzzle.answer, POOL)?.aliases ?? [])],
    hasCustomIcon: puzzle.hasCustomIcon,
    from,
  };
}

function parseStart(json: string | undefined): RoundStart | null {
  if (json === undefined) return null;
  const s = asRecord(parseJson(json));
  const answer = asString(s?.answer);
  const aliases = asStringArray(s?.aliases);
  const hasCustomIcon = asBoolean(s?.hasCustomIcon);
  const from = asNumber(s?.from);
  if (
    answer === null ||
    aliases === null ||
    hasCustomIcon === null ||
    from === null
  )
    return null;
  return { answer, aliases, hasCustomIcon, from };
}

const sameSub = (a: string, b: string): boolean =>
  normalizeSubreddit(a) === normalizeSubreddit(b);

/** A player's stored round, replayed against the answer it started with. */
type Loaded = {
  round: Round;
  start: RoundStart;
  /** The next free guess slot. */
  nextSlot: number;
  /** `start` isn't stored yet, or must replace the stored one. */
  startChanged: boolean;
  /** The hash already has a `start` field (even an unreadable one). */
  hadStart: boolean;
};

/**
 * Read and replay a player's round. Guesses are scored against the answer
 * saved when the round began, never today's puzzle as it is now, so a
 * finished round stays as it ended.
 *
 * One case can't keep its saved answer: a round still in play when every
 * post of its community is gone and a new community is picked. The player
 * can no longer see the post or clues they were guessing from, so the
 * round starts over on the new puzzle, with slots after the old guesses.
 * Rounds stored before `start` existed replay against today's answer.
 */
async function readRound(
  deps: Deps,
  puzzle: StoredPuzzle,
  user: User
): Promise<Loaded> {
  const fields = await deps.store.hGetAll(roundKey(puzzle.date, user.id));
  let nextSlot = 0;
  while (fields[String(nextSlot)] !== undefined) nextSlot += 1;
  const saved = parseStart(fields.start);
  const hadStart = fields.start !== undefined;
  const replay = (start: RoundStart): Round => {
    let round = newRound(start.answer, {
      aliases: start.aliases,
      hasCustomIcon: start.hasCustomIcon,
    });
    for (let i = start.from; i < nextSlot; i += 1)
      round = applyGuess(round, fields[String(i)] ?? '');
    return round;
  };
  if (!saved) {
    const start = startFor(puzzle, 0);
    return {
      round: replay(start),
      start,
      nextSlot,
      startChanged: true,
      hadStart,
    };
  }
  const round = replay(saved);
  if (round.status === 'playing' && !sameSub(saved.answer, puzzle.answer)) {
    const start = startFor(puzzle, nextSlot);
    return {
      round: replay(start),
      start,
      nextSlot,
      startChanged: true,
      hadStart,
    };
  }
  return { round, start: saved, nextSlot, startChanged: false, hadStart };
}

export async function loadRound(
  deps: Deps,
  puzzle: StoredPuzzle,
  user: User | null
): Promise<Round> {
  if (!user) return freshRound(puzzle);
  return (await readRound(deps, puzzle, user)).round;
}

/** A fresh round on today's puzzle, for a visitor who isn't logged in. */
function freshRound(puzzle: StoredPuzzle): Round {
  const start = startFor(puzzle, 0);
  return newRound(start.answer, {
    aliases: start.aliases,
    hasCustomIcon: start.hasCustomIcon,
  });
}

/**
 * The community a guess names: a pool entry, or the round's own answer
 * (or one of its aliases), which is accepted even after it has left the
 * pool. Anything else is refused, so the chart only shows real subs.
 */
function guessName(input: string, round: Round): string | null {
  const entry = findEntry(input, POOL);
  if (entry) return entry.name;
  return isCorrectGuess(input, round.answer, round.aliases)
    ? round.answer
    : null;
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
 * answer pool (the autocomplete only offers those) or the round's own
 * answer, so the wrong-guess chart only ever shows real subs. Records the
 * guess, the wrong-guess tally, and on the last guess the score and streak.
 *
 * Two requests from the same player can arrive together (a double tap, two
 * tabs, or a script firing every guess at once). Each guess claims its slot
 * with HSETNX, so only one request can be the player's Nth guess; the other
 * gets a 409 and records nothing. Without this, parallel guesses all read
 * an empty round and the right one scores 0. The round's start is claimed
 * the same way on its first guess.
 */
export async function submitGuess(
  deps: Deps,
  puzzle: StoredPuzzle,
  user: User | null,
  input: string
): Promise<GuessOutcome> {
  if (!user) return { ok: false, status: 401, message: 'Log in to play.' };
  const loaded = await readRound(deps, puzzle, user);
  const before = loaded.round;
  if (before.status !== 'playing')
    return { ok: false, status: 409, message: 'Today’s round is over.' };
  const name = guessName(input, before);
  if (name === null)
    return {
      ok: false,
      status: 400,
      message: 'Pick a community from the suggestions.',
    };
  const round = applyGuess(before, name);
  let streak = await loadStreak(deps, user);
  if (round === before) return { ok: true, round, streak };

  const date = puzzle.date;
  const key = roundKey(date, user.id);
  const taken: GuessOutcome = {
    ok: false,
    status: 409,
    message: 'Another guess got there first. Reload to see your round.',
  };
  if (loaded.startChanged) {
    const start = JSON.stringify(loaded.start);
    // A first start is claimed like a slot. A restart (see readRound)
    // overwrites; parallel restarts compute the same start, and the slot
    // claim below still lets only one guess through.
    if (!loaded.hadStart) {
      if (!(await deps.store.hSetNX(key, 'start', start))) return taken;
    } else {
      await deps.store.hSet(key, { start });
    }
  }
  if (!(await deps.store.hSetNX(key, String(loaded.nextSlot), name)))
    return taken;
  await deps.store.expire(key, PLAYER_KEEP_SECONDS);
  if (loaded.nextSlot === 0)
    await deps.store.hIncrBy(statsKey(date), 'players', 1);
  if (!isCorrectGuess(name, round.answer, round.aliases))
    await deps.store.zIncrBy(wrongKey(date), name, 1);

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
    await deps.store.expire(scoresKey(date), PLAYER_KEEP_SECONDS);
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

/** Stands in for a post that was taken down after the player's round. */
function removedPost(date: string): PostCard {
  return {
    title: 'This round’s post was removed from Reddit.',
    body: '',
    score: 0,
    comments: 0,
    createdAt: Date.parse(`${date}T12:00:00Z`),
  };
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
  // A finished round keeps the answer it was played against. If the day
  // has since moved to another community, today's post and clues aren't
  // the ones this player saw, and theirs were taken down on Reddit, so
  // none are shown.
  const ownPuzzle = sameSub(round.answer, puzzle.answer);
  const clue = (kind: ClueKind): ClueView => clueView(kind, puzzle, candidate);
  const revealed = ownPuzzle ? cluesRevealed(round) : 0;
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
          answer: round.answer,
          clues: ownPuzzle ? round.clues.map(clue) : [],
          score: score(round),
          wrongGuesses: chart.bars,
          players: chart.players,
          visitUrl: `https://www.reddit.com/r/${round.answer}/`,
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
    post: ownPuzzle ? candidate.post : removedPost(puzzle.date),
    clueKinds: [...round.clues],
    clues: round.clues.slice(0, revealed).map(clue),
    guesses,
    maxGuesses: maxGuesses(round),
    guessesLeft: done ? 0 : maxGuesses(round) - round.guesses.length,
    status: round.status,
    streak: streakView,
    username,
    result,
  };
}
