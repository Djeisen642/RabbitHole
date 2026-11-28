import type { PuzzleResponse } from '../../shared/api';

/**
 * The streak line for the header, or null to show none. The streak is the
 * player's running count as of today, so on an older day's post it would read
 * as that day's streak; those posts show none (their banner already says they
 * won't change it).
 */
export function streakLabel(
  puzzle: Pick<PuzzleResponse, 'streak' | 'today'>
): string | null {
  if (puzzle.today !== null) return null;
  const { current } = puzzle.streak;
  return current > 0 ? `${current} day streak` : null;
}
