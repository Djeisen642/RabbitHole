/**
 * Core r/abbit_hole rules. Pure functions only: no Devvit, no React, no I/O.
 *
 * A round: the player sees one real post with its subreddit hidden. They may
 * guess on the post alone, and every wrong guess reveals the next clue, so a
 * round allows one more guess than it has clues. The icon clue is only used
 * when the subreddit has a custom icon, so a round has four or five clues.
 * The fourth clue is the community's top post of all time; puzzles made
 * before that clue existed (or with no usable top post) use its member
 * count and founding year instead.
 * Score is the number of clues the player needed; time never counts and ties
 * share a rank.
 */

export type ClueKind =
  'topComment' | 'about' | 'jargon' | 'topPost' | 'stats' | 'icon';

/**
 * The clues a round uses, in reveal order. The icon clue needs a custom
 * icon; the top-post clue replaces the stats clue when the puzzle has one.
 */
export function cluesFor(
  hasCustomIcon: boolean,
  hasTopPost = false
): ClueKind[] {
  return CLUE_ORDER.filter(
    (kind) =>
      (kind !== 'icon' || hasCustomIcon) &&
      (kind !== 'topPost' || hasTopPost) &&
      (kind !== 'stats' || !hasTopPost)
  );
}

/** Order in which clues are revealed, least to most obvious. */
export const CLUE_ORDER: readonly ClueKind[] = [
  'topComment',
  'about',
  'jargon',
  'topPost',
  'stats',
  'icon',
];

export type RoundStatus = 'playing' | 'solved' | 'failed';

export type Round = {
  answer: string;
  aliases: readonly string[];
  clues: readonly ClueKind[];
  guesses: readonly string[];
  status: RoundStatus;
};

export function newRound(
  answer: string,
  options: {
    aliases?: readonly string[];
    hasCustomIcon: boolean;
    hasTopPost?: boolean;
  }
): Round {
  return {
    answer,
    aliases: options.aliases ?? [],
    clues: cluesFor(options.hasCustomIcon, options.hasTopPost ?? false),
    guesses: [],
    status: 'playing',
  };
}

/** One guess on the post alone, then one after each clue. */
export function maxGuesses(round: Round): number {
  return round.clues.length + 1;
}

/** Lowercase, strip a leading "r/" or "/r/", and drop spaces, dashes and underscores. */
export function normalizeSubreddit(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^\/?r\//, '')
    .replace(/[\s_-]+/g, '');
}

export function isCorrectGuess(
  guess: string,
  answer: string,
  aliases: readonly string[] = []
): boolean {
  const g = normalizeSubreddit(guess);
  if (g === '') return false;
  return [answer, ...aliases].some((name) => normalizeSubreddit(name) === g);
}

export function wrongGuessCount(round: Round): number {
  return round.guesses.filter(
    (g) => !isCorrectGuess(g, round.answer, round.aliases)
  ).length;
}

/** How many clues are visible right now. */
export function cluesRevealed(round: Round): number {
  return Math.min(wrongGuessCount(round), round.clues.length);
}

/** Returns a new round with the guess applied. Guesses after the round ends, blank or repeated guesses are ignored. */
export function applyGuess(round: Round, guess: string): Round {
  if (round.status !== 'playing') return round;
  const normalized = normalizeSubreddit(guess);
  if (normalized === '') return round;
  if (round.guesses.some((g) => normalizeSubreddit(g) === normalized))
    return round;

  const guesses = [...round.guesses, guess];
  const solved = isCorrectGuess(guess, round.answer, round.aliases);
  const status: RoundStatus = solved
    ? 'solved'
    : guesses.length >= maxGuesses(round)
      ? 'failed'
      : 'playing';
  return { ...round, guesses, status };
}

/** Clues used to solve (0 to the round's clue count), or null if the round was not solved. */
export function score(round: Round): number | null {
  return round.status === 'solved' ? wrongGuessCount(round) : null;
}

export type Ranked<T> = T & { rank: number };

/**
 * Standard competition ranking: fewer clues ranks higher, unsolved (null)
 * ranks last, equal scores share a rank (1, 1, 3). No tiebreak.
 */
export function rankByScore<T extends { score: number | null }>(
  entries: readonly T[]
): Ranked<T>[] {
  const key = (s: number | null): number =>
    s === null ? Number.POSITIVE_INFINITY : s;
  const sorted = [...entries].sort((a, b) => key(a.score) - key(b.score));
  return sorted.map((entry) => ({
    ...entry,
    rank:
      1 + sorted.filter((other) => key(other.score) < key(entry.score)).length,
  }));
}

export type Streak = {
  current: number;
  best: number;
  lastSolvedDay: number | null;
};

/**
 * Update a streak after a finished round. `day` is the puzzle's day number
 * (whole days since an epoch). Solving on consecutive days extends the
 * streak; a failed round or a skipped day resets it.
 */
export function updateStreak(
  streak: Streak,
  day: number,
  solved: boolean
): Streak {
  if (!solved) return { ...streak, current: 0 };
  if (streak.lastSolvedDay === day) return streak;
  const current = streak.lastSolvedDay === day - 1 ? streak.current + 1 : 1;
  return { current, best: Math.max(streak.best, current), lastSolvedDay: day };
}

/**
 * The streak to show on `day`: a streak whose last solve was before
 * yesterday has already lapsed, even though it is only reset in storage on
 * the next finished round.
 */
export function visibleStreak(streak: Streak, day: number): Streak {
  if (streak.lastSolvedDay === null || streak.lastSolvedDay >= day - 1)
    return streak;
  return { ...streak, current: 0 };
}
