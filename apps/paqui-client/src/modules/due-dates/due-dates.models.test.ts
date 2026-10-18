import { describe, expect, test } from 'vitest';
import { buildInstalmentsFromTerms, getDueDateBucket, parseTermsDays, summarizeDueDates } from './due-dates.models';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const now = new Date(2026, 9, 17, 10);

describe('due dates models', () => {
  test('a due date falls in a period from today, a returned charge is overdue whatever its date', () => {
    expect(getDueDateBucket({ dueDate: day('2026-10-16'), status: 'pending', now })).toBe('overdue');
    expect(getDueDateBucket({ dueDate: day('2026-10-17'), status: 'pending', now })).toBe('next_30');
    expect(getDueDateBucket({ dueDate: day('2026-11-16'), status: 'pending', now })).toBe('next_30');
    expect(getDueDateBucket({ dueDate: day('2026-11-17'), status: 'pending', now })).toBe('days_31_60');
    expect(getDueDateBucket({ dueDate: day('2027-01-15'), status: 'pending', now })).toBe('days_61_90');
    expect(getDueDateBucket({ dueDate: day('2027-01-16'), status: 'pending', now })).toBe('later');
    expect(getDueDateBucket({ dueDate: day('2027-01-16'), status: 'returned', now })).toBe('overdue');
  });

  test('the totals per period leave the paid due dates out', () => {
    const summary = summarizeDueDates({
      now,
      instalments: [
        { dueDate: day('2026-10-01'), status: 'pending', amountMinor: 100 },
        { dueDate: day('2026-10-01'), status: 'paid', amountMinor: 1_000 },
        { dueDate: day('2026-12-30'), status: 'returned', amountMinor: 50 },
        { dueDate: day('2026-10-20'), status: 'pending', amountMinor: 7 },
      ],
    });

    expect(summary.overdue).toEqual({ count: 2, amountMinor: 150 });
    expect(summary.next_30).toEqual({ count: 1, amountMinor: 7 });
    expect(summary.later).toEqual({ count: 0, amountMinor: 0 });
  });

  test('typed terms become due dates after the issue date, the total split in equal parts', () => {
    expect(parseTermsDays('30/60/90')).toEqual([30, 60, 90]);
    expect(parseTermsDays('a 30 y 60 días')).toEqual([30, 60]);
    expect(buildInstalmentsFromTerms({ issueDate: day('2026-10-15'), payableMinor: 1_000, days: [60, 30, 90] })).toEqual([
      { dueDate: day('2026-11-14'), amountMinor: 333 },
      { dueDate: day('2026-12-14'), amountMinor: 333 },
      { dueDate: day('2027-01-13'), amountMinor: 334 },
    ]);
  });
});
