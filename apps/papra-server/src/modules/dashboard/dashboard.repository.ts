import type { Database } from '../app/database/database.types';
import { and, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { contactsTable } from '../contacts/contacts.table';
import { documentsTable } from '../documents/documents.table';
import { invoicesTable, invoicingProfilesTable } from '../invoicing/invoicing.tables';
import { buildMonthlyComparison, getDashboardPeriods } from './dashboard.models';

// Invoices that count as billed: a draft is not revenue yet and a voided invoice is not revenue anymore
const BILLED_INVOICE_STATUSES = ['issued', 'sent', 'paid'];
const UNPAID_INVOICE_STATUSES = ['issued', 'sent'];

export type DashboardRepository = ReturnType<typeof createDashboardRepository>;

export function createDashboardRepository({ db }: { db: Database }) {
  return {
    getOrganizationMetrics: async (args: { organizationId: string; now?: Date }) => getOrganizationMetrics({ db, ...args }),
  };
}

// Every metric is a single aggregate query scoped to the organization, run in parallel
async function getOrganizationMetrics({ db, organizationId, now = new Date() }: { db: Database; organizationId: string; now?: Date }) {
  const periods = getDashboardPeriods({ now });

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

  const [monthlyInvoices, [previousYearToDate], [outstanding], [customers], [documents]] = await Promise.all([
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
        totalMinor: sql<number>`coalesce(sum(${invoicesTable.totalMinor}), 0)::double precision`,
        count: sql<number>`count(*)::int`,
        overdueTotalMinor: sql<number>`coalesce(sum(${invoicesTable.totalMinor}) filter (where ${invoicesTable.dueDate} < ${now}), 0)::double precision`,
        overdueCount: sql<number>`(count(*) filter (where ${invoicesTable.dueDate} < ${now}))::int`,
      })
      .from(invoicesTable)
      .where(and(eq(invoicesTable.organizationId, organizationId), inArray(invoicesTable.status, UNPAID_INVOICE_STATUSES), eq(invoicesTable.currency, currency))),

    db
      .select({
        total: sql<number>`count(*)::int`,
        newThisMonth: sql<number>`(count(*) filter (where ${contactsTable.createdAt} >= ${periods.startOfMonth}))::int`,
        newPreviousMonth: sql<number>`(count(*) filter (where ${contactsTable.createdAt} >= ${periods.startOfPreviousMonth} and ${contactsTable.createdAt} < ${periods.startOfMonth}))::int`,
      })
      .from(contactsTable)
      .where(and(eq(contactsTable.organizationId, organizationId), eq(contactsTable.isCustomer, true), isNull(contactsTable.archivedAt))),

    db
      .select({
        total: sql<number>`count(*)::int`,
        newThisMonth: sql<number>`(count(*) filter (where ${documentsTable.createdAt} >= ${periods.startOfMonth}))::int`,
        newPreviousMonth: sql<number>`(count(*) filter (where ${documentsTable.createdAt} >= ${periods.startOfPreviousMonth} and ${documentsTable.createdAt} < ${periods.startOfMonth}))::int`,
      })
      .from(documentsTable)
      .where(and(eq(documentsTable.organizationId, organizationId), eq(documentsTable.isDeleted, false))),
  ]);

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
    },
  };
}
