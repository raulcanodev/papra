import { describe, expect, test } from 'vitest';
import { computeInstalments, planInstalmentReminders, splitAmount } from './due-dates.models';

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe('due dates models', () => {
  test('an amount is split in equal parts, the cents left over on the last one', () => {
    expect(splitAmount({ totalMinor: 100_00, count: 3 })).to.eql([33_33, 33_33, 33_34]);
    expect(splitAmount({ totalMinor: 5, count: 0 })).to.eql([]);
  });

  test('printed dates and amounts are kept, the rest of the total is shared by the due dates without an amount', () => {
    const { instalments, source } = computeInstalments({
      issueDate: day('2026-10-01'),
      payableMinor: 1_000_00,
      printedDueDates: [
        { date: null, daysAfterIssue: 60, amountMinor: null },
        { date: day('2026-11-15'), daysAfterIssue: null, amountMinor: 400_00 },
        { date: null, daysAfterIssue: 90, amountMinor: null },
        { date: null, daysAfterIssue: null, amountMinor: 5 },
      ],
    });

    expect(source).to.eql('document');
    expect(instalments).to.eql([
      { dueDate: day('2026-11-15'), amountMinor: 400_00 },
      { dueDate: day('2026-11-30'), amountMinor: 300_00 },
      { dueDate: day('2026-12-30'), amountMinor: 300_00 },
    ]);
  });

  test('without printed terms: the due date, then the contact terms, else nothing', () => {
    expect(computeInstalments({ issueDate: day('2026-10-01'), payableMinor: 10, dueDate: day('2026-10-20'), contactTermsDays: 30 })).to.eql({ instalments: [{ dueDate: day('2026-10-20'), amountMinor: 10 }], source: 'document' });
    expect(computeInstalments({ issueDate: day('2026-10-01'), payableMinor: 10, contactTermsDays: 0 })).to.eql({ instalments: [{ dueDate: day('2026-10-01'), amountMinor: 10 }], source: 'contact_terms' });
    expect(computeInstalments({ issueDate: day('2026-10-01'), payableMinor: 10 })).to.eql({ instalments: [], source: 'none' });
  });

  test('reminders: before and on the day while still ahead, overdue the day after, a returned charge overdue at once, nothing once paid', () => {
    const instalment = { id: 'pins_1', direction: 'receivable' as const, dueDate: day('2026-10-20'), status: 'pending' as const, returnedAt: null };
    const plan = (overrides: Partial<typeof instalment> | { status: 'paid' | 'returned'; returnedAt?: Date }, now: string) => planInstalmentReminders({ instalment: { ...instalment, ...overrides }, daysBefore: 3, now: new Date(now) })
      .map(({ key, type, targetDate }) => `${key.split(':').at(-1)} ${type} ${targetDate.toISOString().slice(0, 10)}`);

    expect(plan({}, '2026-10-10T10:00:00.000Z')).to.eql(['before collection_due 2026-10-17', 'due collection_due 2026-10-20', 'overdue collection_overdue 2026-10-21']);
    expect(plan({}, '2026-10-19T10:00:00.000Z')).to.eql(['due collection_due 2026-10-20', 'overdue collection_overdue 2026-10-21']);
    expect(plan({}, '2026-10-25T10:00:00.000Z')).to.eql(['overdue collection_overdue 2026-10-21']);
    expect(plan({ status: 'paid' }, '2026-10-10T10:00:00.000Z')).to.eql([]);
    expect(plan({ status: 'returned', returnedAt: new Date('2026-10-22T15:00:00.000Z') }, '2026-10-23T10:00:00.000Z')).to.eql(['returned collection_overdue 2026-10-22']);
  });
});
