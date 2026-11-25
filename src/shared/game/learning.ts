/**
 * How much help a player gets: multiple choice for new players, typing once
 * they know the game, and "training wheels" (choices again, on request)
 * after a run of losses. Pure functions only: no Devvit, no React, no I/O.
 *
 * - 0 rounds finished: FIRST_CHOICES options.
 * - 1 to LEARNING_ROUNDS - 1 finished: CHOICES options.
 * - LEARNING_ROUNDS or more: typing, with autocomplete.
 * - After WHEELS_AFTER_LOSSES losses in a row, a typing round offers
 *   CHOICES options. Saying yes keeps choices on until the player wins
 *   WHEELS_WINS_TO_END rounds with them.
 *
 * - The first typing round after a multiple-choice one shows a line on how
 *   typing works, since the player has only ever picked from a list.
 *
 * Scoring never changes: a wrong pick is a wrong guess and reveals a clue.
 */

export const FIRST_CHOICES = 5;
export const CHOICES = 10;
/** Rounds a new player gets with choices before typing. */
export const LEARNING_ROUNDS = 3;
export const WHEELS_AFTER_LOSSES = 3;
export const WHEELS_WINS_TO_END = 2;

export type Learner = {
  /** Rounds finished, solved or not. */
  finished: number;
  /** Rounds lost in a row; a win resets it. */
  losses: number;
  /** Training wheels are on: rounds start with choices. */
  wheels: boolean;
  /** Rounds won with choices since the training wheels went on. */
  wheelWins: number;
  /** The last finished round was multiple choice. */
  lastWithChoices: boolean;
};

export const NEW_LEARNER: Learner = {
  finished: 0,
  losses: 0,
  wheels: false,
  wheelWins: 0,
  lastWithChoices: false,
};

/**
 * A player who has played before but has no learner record: one from
 * before this was tracked, or whose record expired after a long break.
 * They already know the game, so they type.
 */
export const RETURNING_LEARNER: Learner = {
  ...NEW_LEARNER,
  finished: LEARNING_ROUNDS,
};

/** Options a new round starts with, or 0 for typing. */
export function choiceCount(learner: Learner): number {
  if (learner.finished === 0) return FIRST_CHOICES;
  if (learner.finished < LEARNING_ROUNDS || learner.wheels) return CHOICES;
  return 0;
}

/**
 * A typing round right after a multiple-choice one: the player has never
 * typed a guess, so show them how.
 */
export function needsTypingIntro(learner: Learner): boolean {
  return choiceCount(learner) === 0 && learner.lastWithChoices;
}

/** Whether a new round should offer the player some options. */
export function offersWheels(learner: Learner): boolean {
  return choiceCount(learner) === 0 && learner.losses >= WHEELS_AFTER_LOSSES;
}

/** The player said yes to some options. */
export function acceptWheels(learner: Learner): Learner {
  return { ...learner, wheels: true, wheelWins: 0 };
}

/** Update after a finished round. `withChoices`: it was multiple choice. */
export function afterRound(
  learner: Learner,
  round: { solved: boolean; withChoices: boolean }
): Learner {
  const finished = learner.finished + 1;
  const lastWithChoices = round.withChoices;
  if (!round.solved)
    return {
      ...learner,
      finished,
      losses: learner.losses + 1,
      lastWithChoices,
    };
  const counts = learner.wheels && round.withChoices;
  const wheelWins = counts ? learner.wheelWins + 1 : learner.wheelWins;
  return wheelWins >= WHEELS_WINS_TO_END
    ? { finished, losses: 0, wheels: false, wheelWins: 0, lastWithChoices }
    : { ...learner, finished, losses: 0, wheelWins, lastWithChoices };
}
