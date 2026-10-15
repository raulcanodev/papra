import type { DashboardMetrics, MonthlyComparisonPoint, Ranking } from '../../dashboard/dashboard.types';
import { getInvoicePayableMinor } from '../../invoicing/invoicing.models';

type Dated = { createdAt?: string | Date | null };
type DemoInvoice = { status: string; currency: string; issueDate: string | Date; dueDate: string | Date; totalMinor: number; subtotalMinor?: number; withholdingMinor?: number; customerId?: string; salesRepresentativeId?: string | null };
type DemoPurchaseInvoice = { currency: string; issueDate: string | Date; subtotalMinor?: number };
type DemoContact = { id: string; name: string };

const TOP_CUSTOMERS_LIMIT = 5;
const SALES_REPRESENTATIVES_LIMIT = 8;

// Same as the server buildRanking: totals per key, sorted, each with its share of the whole
function rank({ invoices, keyOf, contacts, limit }: { invoices: DemoInvoice[]; keyOf: (invoice: DemoInvoice) => string | null | undefined; contacts: DemoContact[]; limit: number }): Ranking {
  const totals = new Map<string, { totalMinor: number; count: number }>();

  for (const invoice of invoices) {
    const key = keyOf(invoice);

    if (key === null || key === undefined) {
      continue;
    }

    const current = totals.get(key) ?? { totalMinor: 0, count: 0 };
    totals.set(key, { totalMinor: current.totalMinor + (invoice.subtotalMinor ?? 0), count: current.count + 1 });
  }

  const entries = [...totals.entries()]
    .map(([id, { totalMinor, count }]) => ({ id, name: contacts.find(contact => contact.id === id)?.name ?? '', totalMinor, count }))
    .sort((left, right) => right.totalMinor - left.totalMinor);
  const totalMinor = entries.reduce((sum, entry) => sum + entry.totalMinor, 0);

  return { totalMinor, entries: entries.slice(0, limit).map(entry => ({ ...entry, shareBps: totalMinor === 0 ? 0 : Math.round(entry.totalMinor / totalMinor * 10_000) })) };
}

const BILLED_STATUSES = ['issued', 'sent', 'paid'];
const UNPAID_STATUSES = ['issued', 'sent'];

// Same rules as the server dashboard repository, computed over the demo localStorage records
export function computeDemoDashboardMetrics({ invoices, customers, documents, currency, purchaseInvoices = [], contacts = [], now = new Date() }: {
  invoices: DemoInvoice[];
  purchaseInvoices?: DemoPurchaseInvoice[];
  contacts?: DemoContact[];
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

  const isYearToDate = (date: string | Date) => new Date(date).getUTCFullYear() === year;
  const isPreviousYearToDate = (date: string | Date) => time(date) >= Date.UTC(year - 1, 0, 1) && time(date) < sameInstantPreviousYear;
  const billedThisYear = billed.filter(invoice => isYearToDate(invoice.issueDate));
  const purchasesInCurrency = purchaseInvoices.filter(purchase => purchase.currency === currency);
  const sumBase = (records: { subtotalMinor?: number }[]) => records.reduce((sum, record) => sum + (record.subtotalMinor ?? 0), 0);
  const salesYearToDateMinor = sumBase(billedThisYear);
  const expensesYearToDateMinor = sumBase(purchasesInCurrency.filter(purchase => isYearToDate(purchase.issueDate)));

  return {
    year,
    currency,
    profit: {
      yearToDateMinor: salesYearToDateMinor - expensesYearToDateMinor,
      previousYearToDateMinor: sumBase(billed.filter(invoice => isPreviousYearToDate(invoice.issueDate))) - sumBase(purchasesInCurrency.filter(purchase => isPreviousYearToDate(purchase.issueDate))),
      salesYearToDateMinor,
      expensesYearToDateMinor,
    },
    topCustomers: rank({ invoices: billedThisYear, keyOf: invoice => invoice.customerId, contacts, limit: TOP_CUSTOMERS_LIMIT }),
    salesByRepresentative: rank({ invoices: billedThisYear, keyOf: invoice => invoice.salesRepresentativeId, contacts, limit: SALES_REPRESENTATIVES_LIMIT }),
    revenue: {
      yearToDateMinor: revenueMonthly.reduce((sum, { current }) => sum + current, 0),
      previousYearToDateMinor: billed
        .filter(invoice => time(invoice.issueDate) >= Date.UTC(year - 1, 0, 1) && time(invoice.issueDate) < sameInstantPreviousYear)
        .reduce((sum, invoice) => sum + invoice.totalMinor, 0),
      monthly: revenueMonthly,
    },
    invoices: { yearToDateCount: invoicesMonthly.reduce((sum, { current }) => sum + current, 0), monthly: invoicesMonthly },
    outstanding: {
      totalMinor: unpaid.reduce((sum, invoice) => sum + getInvoicePayableMinor(invoice), 0),
      count: unpaid.length,
      overdueTotalMinor: overdue.reduce((sum, invoice) => sum + getInvoicePayableMinor(invoice), 0),
      overdueCount: overdue.length,
    },
    customers: growth(customers.filter(customer => !customer.archivedAt)),
    documents: growth(documents),
  };
}
