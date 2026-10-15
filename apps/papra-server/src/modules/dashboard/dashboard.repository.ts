import type { Database } from '../app/database/database.types';
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, notInArray, sql } from 'drizzle-orm';
import { contactsTable } from '../contacts/contacts.table';
import { documentsTable } from '../documents/documents.table';
import { invoicesTable, invoicingProfilesTable } from '../invoicing/invoicing.tables';
import { NON_TAXABLE_PURCHASE_DOCUMENT_KINDS } from '../purchases/purchases.constants';
import { purchaseInvoicesTable } from '../purchases/purchases.tables';
import { buildMonthlyComparison, buildRanking, getDashboardPeriods } from './dashboard.models';

// Invoices that count as billed: a draft is not revenue yet and a voided invoice is not revenue anymore
const BILLED_INVOICE_STATUSES = ['issued', 'sent', 'paid'];
const UNPAID_INVOICE_STATUSES = ['issued', 'sent'];

const TOP_CUSTOMERS_LIMIT = 5;
const SALES_REPRESENTATIVES_LIMIT = 8;

export type DashboardRepository = ReturnType<typeof createDashboardRepository>;

export function createDashboardRepository({ db }: { db: Database }) {
  return {
    getOrganizationMetrics: async (args: { organizationId: string; now?: Date; year?: number }) => getOrganizationMetrics({ db, ...args }),
  };
}

// Every metric is a single aggregate query scoped to the organization, run in parallel
async function getOrganizationMetrics({ db, organizationId, now = new Date(), year }: { db: Database; organizationId: string; now?: Date; year?: number }) {
  const currentYear = now.getUTCFullYear();
  const metricsNow = year === undefined || year === currentYear ? now : new Date(Date.UTC(year, 11, 31, 23, 59, 59));
  const periods = getDashboardPeriods({ now: metricsNow });

  const [profile] = await db.select({ currency: invoicingProfilesTable.currency }).from(invoicingProfilesTable).where(eq(invoicingProfilesTable.organizationId, organizationId)).limit(1);
  // Amounts in different currencies cannot be added up, the metrics use the organization invoicing currency
  const currency = profile?.currency ?? 'EUR';

  const billedInvoices = and(
    eq(invoicesTable.organizationId, organizationId),
    inArray(invoicesTable.status, BILLED_INVOICE_STATUSES),
    eq(invoicesTable.currency, currency),
  );

  const issueYear = sql<number>`extract(year from ${invoicesTable.issueDate} at time zone 'UTC')::int`;
  const issueMonth = sql<number>`extract(month from ${invoicesTable.issueDate} at time zone 'UTC')::int`;

  // Delivery notes are not expenses yet: the invoice that covers them is
  const purchasesInCurrency = and(eq(purchaseInvoicesTable.organizationId, organizationId), eq(purchaseInvoicesTable.currency, currency), notInArray(purchaseInvoicesTable.kind, NON_TAXABLE_PURCHASE_DOCUMENT_KINDS));
  // Sales are counted without VAT (subtotal): the VAT belongs to the tax agency, not to the business
  const salesBase = sql<number>`coalesce(sum(${invoicesTable.subtotalMinor}), 0)::double precision`;
  const yearToDate = gte(invoicesTable.issueDate, periods.startOfYear);
  const untilEndOfYear = lt(invoicesTable.issueDate, periods.startOfNextYear);

  const [monthlyInvoices, [previousYearToDate], [outstanding], [customers], [documents], [salesBaseYearToDate], [salesBasePreviousYearToDate], [expensesYearToDate], [expensesPreviousYearToDate], customerSales, representativeSales] = await Promise.all([
    db
      .select({
        year: issueYear,
        month: issueMonth,
        totalMinor: sql<number>`coalesce(sum(${invoicesTable.totalMinor}), 0)::double precision`,
        count: sql<number>`count(*)::int`,
      })
      .from(invoicesTable)
      .where(and(billedInvoices, gte(invoicesTable.issueDate, periods.startOfPreviousYear), lt(invoicesTable.issueDate, periods.startOfNextYear)))
      .groupBy(issueYear, issueMonth),

    db
      .select({ totalMinor: sql<number>`coalesce(sum(${invoicesTable.totalMinor}), 0)::double precision` })
      .from(invoicesTable)
      .where(and(billedInvoices, gte(invoicesTable.issueDate, periods.startOfPreviousYear), lt(invoicesTable.issueDate, periods.sameInstantPreviousYear))),

    db
      .select({
        // What customers still owe: the total minus the withholding they pay to the tax agency instead
        totalMinor: sql<number>`coalesce(sum(${invoicesTable.totalMinor} - ${invoicesTable.withholdingMinor}), 0)::double precision`,
        count: sql<number>`count(*)::int`,
        overdueTotalMinor: sql<number>`coalesce(sum(${invoicesTable.totalMinor} - ${invoicesTable.withholdingMinor}) filter (where ${lt(invoicesTable.dueDate, now)}), 0)::double precision`,
        overdueCount: sql<number>`(count(*) filter (where ${lt(invoicesTable.dueDate, now)}))::int`,
      })
      .from(invoicesTable)
      .where(and(eq(invoicesTable.organizationId, organizationId), inArray(invoicesTable.status, UNPAID_INVOICE_STATUSES), eq(invoicesTable.currency, currency))),

    db
      .select({
        total: sql<number>`count(*)::int`,
        newThisMonth: sql<number>`(count(*) filter (where ${gte(contactsTable.createdAt, periods.startOfMonth)}))::int`,
        newPreviousMonth: sql<number>`(count(*) filter (where ${and(gte(contactsTable.createdAt, periods.startOfPreviousMonth), lt(contactsTable.createdAt, periods.startOfMonth))}))::int`,
      })
      .from(contactsTable)
      .where(and(eq(contactsTable.organizationId, organizationId), eq(contactsTable.isCustomer, true), isNull(contactsTable.archivedAt))),

    db
      .select({
        total: sql<number>`count(*)::int`,
        newThisMonth: sql<number>`(count(*) filter (where ${gte(documentsTable.createdAt, periods.startOfMonth)}))::int`,
        newPreviousMonth: sql<number>`(count(*) filter (where ${and(gte(documentsTable.createdAt, periods.startOfPreviousMonth), lt(documentsTable.createdAt, periods.startOfMonth))}))::int`,
      })
      .from(documentsTable)
      .where(and(eq(documentsTable.organizationId, organizationId), eq(documentsTable.isDeleted, false))),

    db.select({ totalMinor: salesBase }).from(invoicesTable).where(and(billedInvoices, yearToDate, untilEndOfYear)),
    db.select({ totalMinor: salesBase }).from(invoicesTable).where(and(billedInvoices, gte(invoicesTable.issueDate, periods.startOfPreviousYear), lt(invoicesTable.issueDate, periods.sameInstantPreviousYear))),

    db
      .select({ totalMinor: sql<number>`coalesce(sum(${purchaseInvoicesTable.subtotalMinor}), 0)::double precision` })
      .from(purchaseInvoicesTable)
      .where(and(purchasesInCurrency, gte(purchaseInvoicesTable.issueDate, periods.startOfYear), lt(purchaseInvoicesTable.issueDate, periods.startOfNextYear))),
    db
      .select({ totalMinor: sql<number>`coalesce(sum(${purchaseInvoicesTable.subtotalMinor}), 0)::double precision` })
      .from(purchaseInvoicesTable)
      .where(and(purchasesInCurrency, gte(purchaseInvoicesTable.issueDate, periods.startOfPreviousYear), lt(purchaseInvoicesTable.issueDate, periods.sameInstantPreviousYear))),

    db
      .select({ id: contactsTable.id, name: contactsTable.name, totalMinor: salesBase, count: sql<number>`count(*)::int` })
      .from(invoicesTable)
      .innerJoin(contactsTable, eq(invoicesTable.customerId, contactsTable.id))
      .where(and(billedInvoices, yearToDate, untilEndOfYear))
      .groupBy(contactsTable.id, contactsTable.name)
      .orderBy(desc(salesBase)),

    db
      .select({ id: contactsTable.id, name: contactsTable.name, totalMinor: salesBase, count: sql<number>`count(*)::int` })
      .from(invoicesTable)
      .innerJoin(contactsTable, eq(invoicesTable.salesRepresentativeId, contactsTable.id))
      .where(and(billedInvoices, yearToDate, untilEndOfYear, isNotNull(invoicesTable.salesRepresentativeId)))
      .groupBy(contactsTable.id, contactsTable.name)
      .orderBy(desc(salesBase)),
  ]);

  const salesBaseYearToDateMinor = Number(salesBaseYearToDate?.totalMinor ?? 0);
  const expensesYearToDateMinor = Number(expensesYearToDate?.totalMinor ?? 0);

  const revenueMonthly = buildMonthlyComparison({ year: periods.year, rows: monthlyInvoices.map(({ year, month, totalMinor }) => ({ year, month, value: Number(totalMinor) })) });
  const invoicesMonthly = buildMonthlyComparison({ year: periods.year, rows: monthlyInvoices.map(({ year, month, count }) => ({ year, month, value: count })) });

  return {
    metrics: {
      year: periods.year,
      currency,
      revenue: {
        yearToDateMinor: revenueMonthly.reduce((sum, { current }) => sum + current, 0),
        previousYearToDateMinor: Number(previousYearToDate?.totalMinor ?? 0),
        monthly: revenueMonthly,
      },
      invoices: {
        yearToDateCount: invoicesMonthly.reduce((sum, { current }) => sum + current, 0),
        monthly: invoicesMonthly,
      },
      outstanding: {
        totalMinor: Number(outstanding?.totalMinor ?? 0),
        count: outstanding?.count ?? 0,
        overdueTotalMinor: Number(outstanding?.overdueTotalMinor ?? 0),
        overdueCount: outstanding?.overdueCount ?? 0,
      },
      customers: {
        total: customers?.total ?? 0,
        newThisMonth: customers?.newThisMonth ?? 0,
        newPreviousMonth: customers?.newPreviousMonth ?? 0,
      },
      documents: {
        total: documents?.total ?? 0,
        newThisMonth: documents?.newThisMonth ?? 0,
        newPreviousMonth: documents?.newPreviousMonth ?? 0,
      },
      // Sales without VAT minus expenses without VAT: a profit before taxes, the figure the business really made
      profit: {
        yearToDateMinor: salesBaseYearToDateMinor - expensesYearToDateMinor,
        previousYearToDateMinor: Number(salesBasePreviousYearToDate?.totalMinor ?? 0) - Number(expensesPreviousYearToDate?.totalMinor ?? 0),
        salesYearToDateMinor: salesBaseYearToDateMinor,
        expensesYearToDateMinor,
      },
      topCustomers: buildRanking({ rows: customerSales, limit: TOP_CUSTOMERS_LIMIT }),
      salesByRepresentative: buildRanking({ rows: representativeSales, limit: SALES_REPRESENTATIVES_LIMIT }),
    },
  };
}
