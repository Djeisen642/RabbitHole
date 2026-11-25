import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayNumber,
  isPuzzleDate,
  puzzleDateAt,
  puzzleNumber,
} from './day';

describe('puzzle days', () => {
  it('rolls over at midnight in New York', () => {
    expect(puzzleDateAt(new Date('2026-11-25T04:59:00Z'))).toBe('2026-11-24');
    expect(puzzleDateAt(new Date('2026-11-25T05:00:00Z'))).toBe('2026-11-25');
    // Daylight saving time: midnight is 04:00 UTC in summer.
    expect(puzzleDateAt(new Date('2026-07-01T04:00:00Z'))).toBe('2026-07-01');
  });

  it('counts days and puzzle numbers', () => {
    expect(dayNumber('1970-01-02')).toBe(1);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(puzzleNumber('2026-11-24')).toBe(1);
    expect(puzzleNumber('2026-12-08')).toBe(15);
  });

  it('validates dates', () => {
    expect(isPuzzleDate('2026-02-29')).toBe(false);
    expect(isPuzzleDate('2028-02-29')).toBe(true);
    expect(isPuzzleDate('nope')).toBe(false);
  });
});
