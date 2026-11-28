import type { PuzzleResponse } from '../../shared/api';

/** Compact counts the way Reddit shows them: 950, 4.8k, 1.2m. */
export function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k < 10 ? k.toFixed(1).replace(/\.0$/, '') : Math.round(k)}k`;
  }
  const m = n / 1_000_000;
  return `${m < 10 ? m.toFixed(1).replace(/\.0$/, '') : Math.round(m)}m`;
}

/** Whole thousands with separators: 1,240,000. */
export function grouped(n: number): string {
  return n.toLocaleString('en-US');
}

/** "3d ago", "5h ago" from a timestamp. */
export function ago(ms: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - ms) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

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
