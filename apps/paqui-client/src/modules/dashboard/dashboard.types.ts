export type MonthlyComparisonPoint = {
  /** 1 to 12 */
  month: number;
  current: number;
  previous: number;
};

export type DashboardMetrics = {
  year: number;
  currency: string;
  revenue: { yearToDateMinor: number; previousYearToDateMinor: number; monthly: MonthlyComparisonPoint[] };
  invoices: { yearToDateCount: number; monthly: MonthlyComparisonPoint[] };
  outstanding: { totalMinor: number; count: number; overdueTotalMinor: number; overdueCount: number };
  customers: { total: number; newThisMonth: number; newPreviousMonth: number };
  documents: { total: number; newThisMonth: number; newPreviousMonth: number };
  profit: { yearToDateMinor: number; previousYearToDateMinor: number; salesYearToDateMinor: number; expensesYearToDateMinor: number };
  topCustomers: Ranking;
  salesByRepresentative: Ranking;
};

export type Ranking = {
  totalMinor: number;
  entries: Array<{ id: string; name: string; totalMinor: number; count: number; shareBps: number }>;
};
