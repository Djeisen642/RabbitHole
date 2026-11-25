/**
 * A player's round and streak, stored per user and date, and the view of
 * the puzzle the API sends back.
 *
 * Redis keys:
 * - `round:YYYY-MM-DD:{userId}` hash: `start` (RoundStart JSON: the answer
 *   the round is played against, where its guesses begin and any
 *   multiple-choice options), `offer` (`yes` or `no`, the player's answer
 *   to a training-wheels offer) and one field per guess, `0`, `1`, ...,
 *   holding the community name. Expires PLAYER_KEEP_DAYS after the last
 *   write.
 * - `user:{userId}:learn` hash: the player's Learner (rounds finished,
 *   losses in a row, training wheels), which decides how much help a round
 *   starts with. Expires PLAYER_KEEP_DAYS after the last finished round; a
 *   player who comes back after that is treated as one who knows the game
 *   (see loadLearner).
 * - `user:{userId}:streak` hash: `current`, `best`, `lastSolvedDay`. Kept
 *   with no expiry: it is the player's running record across days (the best
 *   streak never lapses), and holds only three numbers.
 * - `wrong:YYYY-MM-DD` sorted set: wrong guess name scored by how many
 *   players made it.
 * - `stats:YYYY-MM-DD` hash: `players` (players who guessed at least once)
 *   and `typed` (those of them who typed their guesses).
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
import {
  CHOICES,
  NEW_LEARNER,
  RETURNING_LEARNER,
  acceptWheels,
  afterRound,
  choiceCount,
  offersWheels,
} from '../../shared/game/learning';
import type { Learner } from '../../shared/game/learning';
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
import { optionsFor } from './choices';
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
const learnKey = (userId: string): string => `user:${userId}:learn`;
/** The round hash field holding the answer to a training-wheels offer. */
const OFFER_FIELD = 'offer';

const EMPTY_STREAK: Streak = { current: 0, best: 0, lastSolvedDay: null };

/**
 * What a round is played against, saved when it starts so a later change
 * to the day's answer (a mid-day repick) or to the pool (a deploy) can't
 * rescore it. `from` is the first guess slot that belongs to this round.
 *
 * `options` are the multiple-choice options. With `offer` false they are
 * the round's from the start (a new player, or training wheels already on);
 * with `offer` true they are only used once the player says yes to the
 * training-wheels offer. Empty for a typed round. Kept here so a reload
 * shows the same options, whatever happens to the player's record or the
 * pick history in between.
 */
export type RoundStart = {
  answer: string;
  aliases: string[];
  hasCustomIcon: boolean;
  from: number;
  options: string[];
  offer: boolean;
};

/**
 * The start of a round on today's puzzle for a player with this record
 * (null when logged out).
 */
async function startFor(
  deps: Deps,
  puzzle: StoredPuzzle,
  learner: Learner | null,
  from: number
): Promise<RoundStart> {
  const offer = learner !== null && offersWheels(learner);
  const count = learner === null ? 0 : offer ? CHOICES : choiceCount(learner);
  return {
    answer: puzzle.answer,
    aliases: [...(findEntry(puzzle.answer, POOL)?.aliases ?? [])],
    hasCustomIcon: puzzle.hasCustomIcon,
    from,
    options:
      count > 0
        ? await optionsFor(deps, puzzle.date, puzzle.answer, count)
        : [],
    offer,
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
  // Rounds started before choices existed have neither field: typed.
  const options = asStringArray(s?.options) ?? [];
  const offer = asBoolean(s?.offer) ?? false;
  return { answer, aliases, hasCustomIcon, from, options, offer };
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
  /** The answer to a training-wheels offer: 'yes', 'no', or not given. */
  offerAnswer: string | undefined;
  learner: Learner;
};

/** A player's round and what the view needs to know about it. */
export type PlayerRound = {
  round: Round;
  /** The options to pick from, or null when the player types. */
  choices: string[] | null;
  /** The training-wheels offer is open: no answer and no guess yet. */
  offer: boolean;
  learner: Learner;
};

/** The options in play: from the start, or once an offer was taken up. */
function choicesOf(
  start: RoundStart,
  offerAnswer: string | undefined
): string[] | null {
  if (start.options.length === 0) return null;
  if (start.offer && offerAnswer !== 'yes') return null;
  return start.options;
}

function playerRound(loaded: Loaded): PlayerRound {
  const { round, start, offerAnswer, learner } = loaded;
  return {
    round,
    choices: choicesOf(start, offerAnswer),
    offer:
      start.offer &&
      offerAnswer === undefined &&
      round.status === 'playing' &&
      round.guesses.length === 0,
    learner,
  };
}

/**
 * The player's Learner. A player with no record but a streak hash has
 * finished a round before (the streak is written on every finished round
 * and never expires), either before the record was kept or long enough ago
 * that it expired. They know the game, so they get RETURNING_LEARNER and
 * type, rather than the first-timer card and five options.
 */
export async function loadLearner(deps: Deps, user: User): Promise<Learner> {
  const l = await deps.store.hGetAll(learnKey(user.id));
  if (l.finished === undefined) {
    const played = await deps.store.hGet(streakKey(user.id), 'best');
    return played === undefined ? NEW_LEARNER : RETURNING_LEARNER;
  }
  const count = (value: string | undefined): number => Number(value) || 0;
  return {
    finished: count(l.finished),
    losses: count(l.losses),
    wheels: l.wheels === '1',
    wheelWins: count(l.wheelWins),
  };
}

async function saveLearner(
  deps: Deps,
  user: User,
  learner: Learner
): Promise<void> {
  const key = learnKey(user.id);
  await deps.store.hSet(key, {
    finished: String(learner.finished),
    losses: String(learner.losses),
    wheels: learner.wheels ? '1' : '0',
    wheelWins: String(learner.wheelWins),
  });
  await deps.store.expire(key, PLAYER_KEEP_SECONDS);
}

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
  const [fields, learner] = await Promise.all([
    deps.store.hGetAll(roundKey(puzzle.date, user.id)),
    loadLearner(deps, user),
  ]);
  let nextSlot = 0;
  while (fields[String(nextSlot)] !== undefined) nextSlot += 1;
  const saved = parseStart(fields.start);
  const hadStart = fields.start !== undefined;
  const offerAnswer = fields[OFFER_FIELD];
  const replay = (start: RoundStart): Round => {
    let round = newRound(start.answer, {
      aliases: start.aliases,
      hasCustomIcon: start.hasCustomIcon,
    });
    for (let i = start.from; i < nextSlot; i += 1)
      round = applyGuess(round, fields[String(i)] ?? '');
    return round;
  };
  const restart = async (from: number): Promise<Loaded> => {
    const start = await startFor(deps, puzzle, learner, from);
    return {
      round: replay(start),
      start,
      nextSlot,
      startChanged: true,
      hadStart,
      offerAnswer,
      learner,
    };
  };
  if (!saved) return restart(0);
  const round = replay(saved);
  if (round.status === 'playing' && !sameSub(saved.answer, puzzle.answer))
    return restart(nextSlot);
  return {
    round,
    start: saved,
    nextSlot,
    startChanged: false,
    hadStart,
    offerAnswer,
    learner,
  };
}

/**
 * Store a round's new start: claimed with HSETNX if the round has none yet,
 * so parallel first requests agree on one, or overwritten on a restart (see
 * readRound), where parallel restarts compute the same start. False if
 * another request claimed it first.
 */
async function saveStart(
  deps: Deps,
  key: string,
  loaded: Loaded
): Promise<boolean> {
  const start = JSON.stringify(loaded.start);
  if (!loaded.hadStart) {
    if (!(await deps.store.hSetNX(key, 'start', start))) return false;
  } else {
    await deps.store.hSet(key, { start });
  }
  await deps.store.expire(key, PLAYER_KEEP_SECONDS);
  return true;
}

/**
 * A player's round for viewing. A round with options (multiple choice, or
 * an offer of it) has its start stored now, before any guess, so a reload
 * shows the same options. A typed round is left to its first guess to
 * store, as before, so just looking (the feed card loads this too) writes
 * nothing for a player who already types.
 */
export async function loadRound(
  deps: Deps,
  puzzle: StoredPuzzle,
  user: User | null
): Promise<PlayerRound> {
  if (!user) return freshRound(puzzle);
  const loaded = await readRound(deps, puzzle, user);
  if (
    loaded.startChanged &&
    loaded.start.options.length > 0 &&
    !(await saveStart(deps, roundKey(puzzle.date, user.id), loaded))
  )
    // Another request stored the start first; show that one.
    return playerRound(await readRound(deps, puzzle, user));
  return playerRound(loaded);
}

/**
 * A fresh round on today's puzzle, for a visitor who isn't logged in. They
 * can't guess, so it is typed; they count as new, so they see how to play.
 */
function freshRound(puzzle: StoredPuzzle): PlayerRound {
  const round = newRound(puzzle.answer, {
    aliases: findEntry(puzzle.answer, POOL)?.aliases ?? [],
    hasCustomIcon: puzzle.hasCustomIcon,
  });
  return { round, choices: null, offer: false, learner: NEW_LEARNER };
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

/** The option a pick names, or null if it isn't one of them. */
function pickedOption(
  input: string,
  choices: readonly string[]
): string | null {
  return choices.find((option) => sameSub(option, input)) ?? null;
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

type Refusal = { ok: false; status: 400 | 401 | 409; message: string };

export type GuessOutcome =
  { ok: true; player: PlayerRound; streak: Streak } | Refusal;

const LOGGED_OUT: Refusal = {
  ok: false,
  status: 401,
  message: 'Log in to play.',
};
const ROUND_OVER: Refusal = {
  ok: false,
  status: 409,
  message: 'Today’s round is over.',
};
const TAKEN: Refusal = {
  ok: false,
  status: 409,
  message: 'Another guess got there first. Reload to see your round.',
};

/**
 * Apply a guess for a user. A typed guess must name a community in the full
 * answer pool (the autocomplete only offers those) or the round's own
 * answer, so the wrong-guess chart only ever shows real subs. In a
 * multiple-choice round it must be one of the round's options. Records the
 * guess, the wrong-guess tally, and on the last guess the score, streak and
 * learner record.
 *
 * Two requests from the same player can arrive together (a double tap, two
 * tabs, or a script firing every guess at once). Each guess claims its slot
 * with HSETNX, so only one request can be the player's Nth guess; the other
 * gets a 409 and records nothing. Without this, parallel guesses all read
 * an empty round and the right one scores 0. The round's start is claimed
 * the same way on its first guess, and so is the answer to an open
 * training-wheels offer (see answerOffer).
 */
export async function submitGuess(
  deps: Deps,
  puzzle: StoredPuzzle,
  user: User | null,
  input: string
): Promise<GuessOutcome> {
  if (!user) return LOGGED_OUT;
  const loaded = await readRound(deps, puzzle, user);
  const before = loaded.round;
  if (before.status !== 'playing') return ROUND_OVER;
  const choices = choicesOf(loaded.start, loaded.offerAnswer);
  const name = choices
    ? pickedOption(input, choices)
    : guessName(input, before);
  if (name === null)
    return {
      ok: false,
      status: 400,
      message: choices
        ? 'Pick one of the options.'
        : 'Pick a community from the suggestions.',
    };
  const round = applyGuess(before, name);
  let streak = await loadStreak(deps, user);
  if (round === before)
    return { ok: true, player: playerRound(loaded), streak };

  const date = puzzle.date;
  const key = roundKey(date, user.id);
  if (loaded.startChanged && !(await saveStart(deps, key, loaded)))
    return TAKEN;
  // A typed first guess answers an open offer with no, so a yes sent at
  // the same moment can't turn a round with a typed guess into choices.
  if (
    loaded.start.offer &&
    loaded.offerAnswer === undefined &&
    !(await deps.store.hSetNX(key, OFFER_FIELD, 'no'))
  )
    return TAKEN;
  if (!(await deps.store.hSetNX(key, String(loaded.nextSlot), name)))
    return TAKEN;
  await deps.store.expire(key, PLAYER_KEEP_SECONDS);
  const typed = choices === null;
  if (loaded.nextSlot === 0) {
    await deps.store.hIncrBy(statsKey(date), 'players', 1);
    if (typed) await deps.store.hIncrBy(statsKey(date), 'typed', 1);
  }
  // Only typed wrong guesses feed the chart: a pick from a short list says
  // little about what players really thought it was, and every new player
  // picking among the same few options would crowd out the typed guesses.
  if (typed && !isCorrectGuess(name, round.answer, round.aliases))
    await deps.store.zIncrBy(wrongKey(date), name, 1);

  let learner = loaded.learner;
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
    learner = afterRound(learner, { solved, withChoices: !typed });
    await saveLearner(deps, user, learner);
  }
  return {
    ok: true,
    player: playerRound({
      ...loaded,
      round,
      offerAnswer: loaded.start.offer
        ? (loaded.offerAnswer ?? 'no')
        : undefined,
      learner,
    }),
    streak,
  };
}

export type OfferOutcome = { ok: true; player: PlayerRound } | Refusal;

/**
 * Answer the training-wheels offer ("Want some options?"). Only a round
 * that started with the offer can take it, and only before its first
 * guess: switching to options after typing a guess or two would let a
 * player narrow the answer down with the clues first. Yes switches this
 * round to options and keeps them on for later rounds (see
 * shared/game/learning.ts); no keeps this round typed.
 *
 * The answer is claimed with HSETNX, like a guess slot, and a typed first
 * guess claims it as no, so the two can't both win.
 */
export async function answerOffer(
  deps: Deps,
  puzzle: StoredPuzzle,
  user: User | null,
  accept: boolean
): Promise<OfferOutcome> {
  if (!user) return LOGGED_OUT;
  const loaded = await readRound(deps, puzzle, user);
  if (loaded.round.status !== 'playing') return ROUND_OVER;
  if (!loaded.start.offer)
    return {
      ok: false,
      status: 400,
      message: 'This round has no offer of options.',
    };
  const want = accept ? 'yes' : 'no';
  // A repeat of the same answer (a double tap) changes nothing.
  if (loaded.offerAnswer === want)
    return { ok: true, player: playerRound(loaded) };
  if (loaded.offerAnswer !== undefined || loaded.round.guesses.length > 0)
    return {
      ok: false,
      status: 409,
      message: 'Options can only be switched on before your first guess.',
    };
  const key = roundKey(puzzle.date, user.id);
  if (loaded.startChanged && !(await saveStart(deps, key, loaded)))
    return TAKEN;
  if (!(await deps.store.hSetNX(key, OFFER_FIELD, want))) return TAKEN;
  await deps.store.expire(key, PLAYER_KEEP_SECONDS);
  let learner = loaded.learner;
  if (accept) {
    learner = acceptWheels(learner);
    await saveLearner(deps, user, learner);
  }
  return {
    ok: true,
    player: playerRound({ ...loaded, offerAnswer: want, learner }),
  };
}

/**
 * The most common wrong guesses of the day. Only typed guesses count (see
 * submitGuess), so each bar's share is of the players who typed, not of
 * everyone: new players picking from options would otherwise pull every
 * percentage down. A day counted before `typed` was kept falls back to all
 * players, who all typed then.
 */
export async function wrongGuessChart(
  deps: Deps,
  date: string
): Promise<{ bars: WrongGuessBar[]; players: number }> {
  const stats = await deps.store.hGetAll(statsKey(date));
  const players = Number(stats.players ?? '0') || 0;
  const typed = stats.typed === undefined ? players : Number(stats.typed) || 0;
  const top = await deps.store.zRange(wrongKey(date), 0, CHART_BARS - 1, {
    by: 'rank',
    reverse: true,
  });
  const bars = top.map(({ member, score: count }) => ({
    name: member,
    count,
    percent: typed > 0 ? Math.round((count / typed) * 100) : 0,
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
  player: PlayerRound;
  streak: Streak;
  day: number;
  username: string | null;
  chart: { bars: WrongGuessBar[]; players: number } | null;
}): PuzzleResponse {
  const { puzzle, candidate, player, streak, day, username, chart } = args;
  const { round } = player;
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
    firstTime: player.learner.finished === 0,
    choices: player.choices,
    offer: player.offer,
  };
}
