import type { Quarter } from './taxes.types';

// The quarter to look at by default: the one being filed during the month after a quarter ends, the current one otherwise
export function getDefaultTaxPeriod({ now = new Date() }: { now?: Date } = {}): { year: number; quarter: Quarter } {
  const month = now.getMonth();
  const year = now.getFullYear();
  const isFilingMonth = month % 3 === 0;

  if (isFilingMonth) {
    return month === 0 ? { year: year - 1, quarter: 4 } : { year, quarter: (month / 3) as Quarter };
  }

  return { year, quarter: (Math.floor(month / 3) + 1) as Quarter };
}

export function getDaysUntil({ date, now = new Date() }: { date: Date; now?: Date }) {
  const startOfToday = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  return Math.round((date.getTime() - startOfToday) / (24 * 60 * 60 * 1000));
}
