/**
 * Puzzle days. A new puzzle drops at midnight US Eastern, so a puzzle's date
 * is the calendar date in America/New_York. Pure functions, no I/O.
 */

/** Dates are YYYY-MM-DD strings. */
export type PuzzleDate = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** The first puzzle's date; puzzle #1. */
export const FIRST_PUZZLE_DATE: PuzzleDate = '2026-11-26';

export function isPuzzleDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  const t = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  return new Date(t).toISOString().slice(0, 10) === value;
}

/** Whole days since 1970-01-01 for a puzzle date. */
export function dayNumber(date: PuzzleDate): number {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Not a puzzle date: ${date}`);
  const [, y, mo, d] = m;
  return Math.round(
    Date.UTC(Number(y), Number(mo) - 1, Number(d)) / MS_PER_DAY
  );
}

export function dateFromDayNumber(day: number): PuzzleDate {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDays(date: PuzzleDate, days: number): PuzzleDate {
  return dateFromDayNumber(dayNumber(date) + days);
}

/** The date of puzzle #`number` (FIRST_PUZZLE_DATE is #1). */
export function puzzleDateFor(number: number): PuzzleDate {
  return addDays(FIRST_PUZZLE_DATE, number - 1);
}

/** The puzzle number shown to players (#1 on FIRST_PUZZLE_DATE). */
export function puzzleNumber(date: PuzzleDate): number {
  return dayNumber(date) - dayNumber(FIRST_PUZZLE_DATE) + 1;
}

/**
 * The puzzle date at an instant: the calendar date in New York. Falls back to
 * a fixed UTC-5 offset if the runtime has no time zone data.
 */
export function puzzleDateAt(now: Date): PuzzleDate {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const get = (type: string): string =>
      parts.find((p) => p.type === type)?.value ?? '';
    const date = `${get('year')}-${get('month')}-${get('day')}`;
    if (isPuzzleDate(date)) return date;
  } catch {
    // No ICU data; use the fallback below.
  }
  return new Date(now.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}
