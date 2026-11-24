/**
 * Core r/abbitHole rules. Pure functions only: no Devvit, no React, no I/O.
 *
 * A round: the player sees one real post with its subreddit hidden. They may
 * guess on the post alone, and every wrong guess reveals the next clue. With
 * five clues that is at most six guesses. Score is the number of clues the
 * player needed; time never counts and ties share a rank.
 */

export const CLUE_COUNT = 5;
export const MAX_GUESSES = CLUE_COUNT + 1;

export type ClueKind = 'topComment' | 'rule' | 'jargon' | 'stats' | 'icon';

/** Order in which clues are revealed, least to most obvious. */
export const CLUE_ORDER: readonly ClueKind[] = [
  'topComment',
  'rule',
  'jargon',
  'stats',
  'icon',
];

export type RoundStatus = 'playing' | 'solved' | 'failed';

export type Round = {
  answer: string;
  aliases: readonly string[];
  guesses: readonly string[];
  status: RoundStatus;
};

export function newRound(
  answer: string,
  aliases: readonly string[] = []
): Round {
  return { answer, aliases, guesses: [], status: 'playing' };
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
  return Math.min(wrongGuessCount(round), CLUE_COUNT);
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
    : guesses.length >= MAX_GUESSES
      ? 'failed'
      : 'playing';
  return { ...round, guesses, status };
}

/** Clues used to solve (0 to CLUE_COUNT), or null if the round was not solved. */
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
