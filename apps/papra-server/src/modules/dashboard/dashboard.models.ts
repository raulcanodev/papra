export type MonthlyComparisonPoint = {
  /** 1 to 12 */
  month: number;
  current: number;
  previous: number;
};

export function getDashboardPeriods({ now }: { now: Date }) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  return {
    year,
    startOfPreviousYear: new Date(Date.UTC(year - 1, 0, 1)),
    startOfYear: new Date(Date.UTC(year, 0, 1)),
    startOfNextYear: new Date(Date.UTC(year + 1, 0, 1)),
    startOfPreviousMonth: new Date(Date.UTC(year, month - 1, 1)),
    startOfMonth: new Date(Date.UTC(year, month, 1)),
    // Same instant one year earlier, to compare the year to date against the same span of last year
    sameInstantPreviousYear: new Date(Date.UTC(year - 1, month, now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds())),
  };
}

// The database only returns the months having rows, the charts always need the twelve of them
export function buildMonthlyComparison({ rows, year }: { rows: { year: number; month: number; value: number }[]; year: number }): MonthlyComparisonPoint[] {
  const valueOf = (targetYear: number, month: number) => rows.find(row => row.year === targetYear && row.month === month)?.value ?? 0;

  return Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    current: valueOf(year, index + 1),
    previous: valueOf(year - 1, index + 1),
  }));
}
