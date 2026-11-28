/**
 * A player's round on a day's puzzle: where it starts, replaying its
 * guesses, and the guess and training-wheels actions that change it.
 *
 * Redis keys:
 * - `round:YYYY-MM-DD:{userId}` hash: `start` (RoundStart JSON: the answer
 *   the round is played against, where its guesses begin and any
 *   multiple-choice options), `offer` (`yes` or `no`, the player's answer
 *   to a training-wheels offer) and one field per guess, `0`, `1`, ...,
 *   holding the community name. Expires PLAYER_KEEP_DAYS after the last
 *   write.
 *
 * A finished round also updates the streak (streak.ts), the learner record
 * (learner.ts) and the day's stats and scores (day-stats.ts).
 */
import { dayNumber } from '../../shared/game/day';
import type { PuzzleDate } from '../../shared/game/day';
import {
  SKIP_GUESS,
  applyGuess,
  isCorrectGuess,
  isSkip,
  maxGuesses,
  newRound,
  normalizeSubreddit,
  score,
  updateStreak,
} from '../../shared/game/rules';
import type { Round, Streak } from '../../shared/game/rules';
import {
  CHOICES,
  NEW_LEARNER,
  acceptWheels,
  afterRound,
  choiceCount,
  offersWheels,
} from '../../shared/game/learning';
import type { Learner } from '../../shared/game/learning';
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
import type { StoredPuzzle } from './puzzle-store';
import { PLAYER_KEEP_SECONDS } from './keep';
import { loadLearner, saveLearner } from './learner';
import { loadStreak, saveStreak } from './streak';
import { countPlayer, countWrongGuess, recordScore } from './day-stats';

const roundKey = (date: string, userId: string): string =>
  `round:${date}:${userId}`;
/** The round hash field holding the answer to a training-wheels offer. */
const OFFER_FIELD = 'offer';

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
  /** False for rounds started before the top-post clue: they keep stats. */
  hasTopPost: boolean;
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
    hasTopPost: puzzle.topPost !== null,
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
  const hasTopPost = asBoolean(s?.hasTopPost) ?? false;
  return { answer, aliases, hasCustomIcon, hasTopPost, from, options, offer };
}

export const sameSub = (a: string, b: string): boolean =>
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
  /** Options for a typed round's last guess (see finalChoices), else null. */
  final: string[] | null;
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

/**
 * A typed round's last guess is a pick from CHOICES options instead, so a
 * player who is still stumped after every clue has a fair shot rather than
 * a blind one. Everyone gets the same list for a date and answer (the
 * training-wheels list), so it gives nothing away; earlier wrong guesses on
 * it show crossed out. Null when the round isn't on its last guess, or
 * already has options.
 */
async function finalChoices(
  deps: Deps,
  date: PuzzleDate,
  start: RoundStart,
  offerAnswer: string | undefined,
  round: Round
): Promise<string[] | null> {
  if (choicesOf(start, offerAnswer) !== null) return null;
  if (
    round.status !== 'playing' ||
    round.guesses.length !== maxGuesses(round) - 1
  )
    return null;
  return optionsFor(deps, date, start.answer, CHOICES);
}

function playerRound(loaded: Loaded): PlayerRound {
  const { round, start, offerAnswer, learner, final } = loaded;
  return {
    round,
    choices: choicesOf(start, offerAnswer) ?? final,
    offer:
      start.offer &&
      offerAnswer === undefined &&
      round.status === 'playing' &&
      round.guesses.length === 0,
    learner,
  };
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
      hasTopPost: start.hasTopPost,
    });
    for (let i = start.from; i < nextSlot; i += 1)
      round = applyGuess(round, fields[String(i)] ?? '');
    return round;
  };
  const final = (start: RoundStart, round: Round): Promise<string[] | null> =>
    finalChoices(deps, puzzle.date, start, offerAnswer, round);
  const restart = async (from: number): Promise<Loaded> => {
    const start = await startFor(deps, puzzle, learner, from);
    const round = replay(start);
    return {
      round,
      start,
      nextSlot,
      startChanged: true,
      hadStart,
      offerAnswer,
      learner,
      final: await final(start, round),
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
    final: await final(saved, round),
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
    hasTopPost: puzzle.topPost !== null,
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
 * multiple-choice round, and on a typed round's last guess, it must be one
 * of the options. A skip is only allowed while typing and counts as a miss that names
 * nothing, so it stays off the chart. Records the
 * guess, the wrong-guess tally, and on the last guess the score, streak and
 * learner record. An earlier day's puzzle, played from its own post, leaves
 * the streak alone (`forStreak` false): the streak is for today's puzzle.
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
  input: string,
  forStreak = true
): Promise<GuessOutcome> {
  if (!user) return LOGGED_OUT;
  const loaded = await readRound(deps, puzzle, user);
  const before = loaded.round;
  if (before.status !== 'playing') return ROUND_OVER;
  // A typed round's last guess is a pick too (see finalChoices), but the
  // round still counts as typed for the player's record.
  const typedRound = choicesOf(loaded.start, loaded.offerAnswer) === null;
  const choices = choicesOf(loaded.start, loaded.offerAnswer) ?? loaded.final;
  // With options on screen the player just picks: no skip.
  if (isSkip(input) && choices)
    return {
      ok: false,
      status: 400,
      message: 'Pick one of the options.',
    };
  const name = isSkip(input)
    ? SKIP_GUESS
    : choices
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
  if (loaded.nextSlot === 0) await countPlayer(deps, date, typedRound);
  // Only typed wrong guesses feed the chart: a pick from a short list says
  // little about what players really thought it was, and every new player
  // picking among the same few options would crowd out the typed guesses.
  // A skip names nothing, so it isn't charted either.
  if (
    typed &&
    !isSkip(name) &&
    !isCorrectGuess(name, round.answer, round.aliases)
  )
    await countWrongGuess(deps, date, name);

  let learner = loaded.learner;
  if (round.status !== 'playing') {
    const solved = round.status === 'solved';
    if (forStreak) {
      streak = updateStreak(streak, dayNumber(date), solved);
      await saveStreak(deps, user, streak);
    }
    await recordScore(deps, date, user.id, score(round));
    learner = afterRound(learner, { solved, withChoices: !typedRound });
    await saveLearner(deps, user, learner);
  }
  const offerAnswer = loaded.start.offer
    ? (loaded.offerAnswer ?? 'no')
    : undefined;
  return {
    ok: true,
    player: playerRound({
      ...loaded,
      round,
      offerAnswer,
      learner,
      final: await finalChoices(deps, date, loaded.start, offerAnswer, round),
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
 * Deletes `user`'s round for `date`, so a moderator can replay a day while
 * testing. The day's stats and wrong-guess chart keep what the first try
 * added; the streak is safe, since a second solve of the same day doesn't
 * move it.
 */
export async function resetRound(
  deps: Deps,
  user: User,
  date: string
): Promise<void> {
  await deps.store.del(roundKey(date, user.id));
}
