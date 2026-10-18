import type { DueDateBucket, InstalmentInput, InstalmentStatus } from './due-dates.types';

const DAY_MS = 86_400_000;

// Due dates are days at midnight UTC, like on the server
const toUtcDay = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
const toLocalDay = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());

export function addDays(date: Date, days: number) {
  return new Date(toUtcDay(date) + days * DAY_MS);
}

/** Days from today (local) to the due date: negative when late */
export function getDaysUntil({ dueDate, now = new Date() }: { dueDate: Date; now?: Date }) {
  return Math.round((toUtcDay(dueDate) - toLocalDay(now)) / DAY_MS);
}

// A returned charge is owed now, whatever its date
export function getDueDateBucket({ dueDate, status, now = new Date() }: { dueDate: Date; status: InstalmentStatus; now?: Date }): DueDateBucket {
  const days = getDaysUntil({ dueDate, now });

  if (status === 'returned' || days < 0) {
    return 'overdue';
  }

  return days <= 30 ? 'next_30' : days <= 60 ? 'days_31_60' : days <= 90 ? 'days_61_90' : 'later';
}

/** What is still owed, added up per period: the paid due dates are left out */
export function summarizeDueDates({ instalments, now = new Date() }: { instalments: { dueDate: Date; status: InstalmentStatus; amountMinor: number }[]; now?: Date }) {
  const summary: Record<DueDateBucket, { count: number; amountMinor: number }> = {
    overdue: { count: 0, amountMinor: 0 },
    next_30: { count: 0, amountMinor: 0 },
    days_31_60: { count: 0, amountMinor: 0 },
    days_61_90: { count: 0, amountMinor: 0 },
    later: { count: 0, amountMinor: 0 },
  };

  for (const instalment of instalments) {
    if (instalment.status === 'paid') {
      continue;
    }

    const bucket = summary[getDueDateBucket({ ...instalment, now })];
    bucket.count += 1;
    bucket.amountMinor += instalment.amountMinor;
  }

  return summary;
}

/** "30/60/90", "30, 60 y 90", "a 30 días": the numbers of days after the issue date */
export function parseTermsDays(value: string) {
  return [...value.matchAll(/\d{1,3}/g)].map(([days]) => Number(days)).filter(days => days <= 365);
}

export function splitAmount({ totalMinor, count }: { totalMinor: number; count: number }) {
  if (count <= 0) {
    return [];
  }

  const part = Math.floor(totalMinor / count);

  return Array.from({ length: count }, (_, index) => (index === count - 1 ? totalMinor - part * (count - 1) : part));
}

/** One due date per term, the total split in equal parts, the cents left over on the last one */
export function buildInstalmentsFromTerms({ issueDate, payableMinor, days }: { issueDate: Date; payableMinor: number; days: number[] }): InstalmentInput[] {
  const amounts = splitAmount({ totalMinor: payableMinor, count: days.length });

  return days.toSorted((a, b) => a - b).map((termDays, index) => ({ dueDate: addDays(issueDate, termDays), amountMinor: amounts[index]! }));
}
