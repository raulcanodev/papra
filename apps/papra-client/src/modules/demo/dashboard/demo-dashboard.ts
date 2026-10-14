import type { DashboardMetrics, MonthlyComparisonPoint } from '../../dashboard/dashboard.types';

type Dated = { createdAt?: string | Date | null };
type DemoInvoice = { status: string; currency: string; issueDate: string | Date; dueDate: string | Date; totalMinor: number };

const BILLED_STATUSES = ['issued', 'sent', 'paid'];
const UNPAID_STATUSES = ['issued', 'sent'];

// Same rules as the server dashboard repository, computed over the demo localStorage records
export function computeDemoDashboardMetrics({ invoices, customers, documents, currency, now = new Date() }: {
  invoices: DemoInvoice[];
  customers: (Dated & { archivedAt?: unknown })[];
  documents: Dated[];
  currency: string;
  now?: Date;
}): DashboardMetrics {
  const year = now.getUTCFullYear();
  const startOfMonth = Date.UTC(year, now.getUTCMonth(), 1);
  const startOfPreviousMonth = Date.UTC(year, now.getUTCMonth() - 1, 1);
  const sameInstantPreviousYear = Date.UTC(year - 1, now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds());

  const billed = invoices.filter(invoice => BILLED_STATUSES.includes(invoice.status) && invoice.currency === currency);
  const time = (value: string | Date | null | undefined) => (value === null || value === undefined ? Number.NaN : new Date(value).getTime());

  const monthly = (valueOf: (invoice: DemoInvoice) => number): MonthlyComparisonPoint[] => Array.from({ length: 12 }, (_, index) => {
    const sumFor = (targetYear: number) => billed
      .filter((invoice) => {
        const date = new Date(invoice.issueDate);
        return date.getUTCFullYear() === targetYear && date.getUTCMonth() === index;
      })
      .reduce((sum, invoice) => sum + valueOf(invoice), 0);

    return { month: index + 1, current: sumFor(year), previous: sumFor(year - 1) };
  });

  const revenueMonthly = monthly(invoice => invoice.totalMinor);
  const invoicesMonthly = monthly(() => 1);
  const unpaid = invoices.filter(invoice => UNPAID_STATUSES.includes(invoice.status) && invoice.currency === currency);
  const overdue = unpaid.filter(invoice => time(invoice.dueDate) < now.getTime());

  const growth = (records: Dated[]) => ({
    total: records.length,
    newThisMonth: records.filter(record => time(record.createdAt) >= startOfMonth).length,
    newPreviousMonth: records.filter(record => time(record.createdAt) >= startOfPreviousMonth && time(record.createdAt) < startOfMonth).length,
  });

  return {
    year,
    currency,
    revenue: {
      yearToDateMinor: revenueMonthly.reduce((sum, { current }) => sum + current, 0),
      previousYearToDateMinor: billed
        .filter(invoice => time(invoice.issueDate) >= Date.UTC(year - 1, 0, 1) && time(invoice.issueDate) < sameInstantPreviousYear)
        .reduce((sum, invoice) => sum + invoice.totalMinor, 0),
      monthly: revenueMonthly,
    },
    invoices: { yearToDateCount: invoicesMonthly.reduce((sum, { current }) => sum + current, 0), monthly: invoicesMonthly },
    outstanding: {
      totalMinor: unpaid.reduce((sum, invoice) => sum + invoice.totalMinor, 0),
      count: unpaid.length,
      overdueTotalMinor: overdue.reduce((sum, invoice) => sum + invoice.totalMinor, 0),
      overdueCount: overdue.length,
    },
    customers: growth(customers.filter(customer => !customer.archivedAt)),
    documents: growth(documents),
  };
}
