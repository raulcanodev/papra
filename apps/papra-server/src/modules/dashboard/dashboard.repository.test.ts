import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../app/database/database.test-utils';
import { contactsTable } from '../contacts/contacts.table';
import { documentsTable } from '../documents/documents.table';
import { invoicesTable, invoicingProfilesTable } from '../invoicing/invoicing.tables';
import { createDashboardRepository } from './dashboard.repository';

const ORG_ID = 'org_111111111111111111111111';
const OTHER_ORG_ID = 'org_222222222222222222222222';
const NOW = new Date('2026-10-14T12:00:00.000Z');

describe('dashboard repository', () => {
  test('metrics aggregate the billed invoices of the organization in its currency, month by month against the previous year', async () => {
    const { db } = await createInMemoryDatabase({
      organizations: [{ id: ORG_ID, name: 'Acme' }, { id: OTHER_ORG_ID, name: 'Other' }],
    });

    await db.insert(invoicingProfilesTable).values({ organizationId: ORG_ID, legalName: 'Acme SL', currency: 'EUR' });
    await db.insert(contactsTable).values([
      { id: 'cus_1', organizationId: ORG_ID, name: 'Old customer', isCustomer: true, createdAt: new Date('2026-01-10T00:00:00.000Z') },
      { id: 'cus_2', organizationId: ORG_ID, name: 'New customer', isCustomer: true, createdAt: new Date('2026-10-02T00:00:00.000Z') },
      { id: 'cus_3', organizationId: ORG_ID, name: 'September customer', isCustomer: true, createdAt: new Date('2026-09-20T00:00:00.000Z') },
      { id: 'cus_4', organizationId: ORG_ID, name: 'Archived', isCustomer: true, archivedAt: new Date('2026-05-01T00:00:00.000Z') },
      { id: 'cus_other', organizationId: OTHER_ORG_ID, name: 'Other org customer' },
    ]);

    const invoice = (id: string, values: Partial<typeof invoicesTable.$inferInsert>) => ({
      id,
      organizationId: ORG_ID,
      customerId: 'cus_1',
      status: 'paid',
      currency: 'EUR',
      issueDate: new Date('2026-03-15T00:00:00.000Z'),
      dueDate: new Date('2026-04-15T00:00:00.000Z'),
      totalMinor: 0,
      ...values,
    });

    await db.insert(invoicesTable).values([
      invoice('inv_1', { totalMinor: 10_000, issueDate: new Date('2026-03-15T00:00:00.000Z') }),
      invoice('inv_2', { totalMinor: 5_000, status: 'sent', issueDate: new Date('2026-10-01T00:00:00.000Z'), dueDate: new Date('2026-10-10T00:00:00.000Z') }),
      invoice('inv_3', { totalMinor: 2_500, status: 'issued', issueDate: new Date('2026-10-05T00:00:00.000Z'), dueDate: new Date('2026-11-05T00:00:00.000Z') }),
      // Previous year: one before the same date (counted in the year to date comparison), one after
      invoice('inv_4', { totalMinor: 8_000, issueDate: new Date('2025-03-01T00:00:00.000Z'), dueDate: new Date('2025-04-01T00:00:00.000Z') }),
      invoice('inv_5', { totalMinor: 4_000, issueDate: new Date('2025-12-01T00:00:00.000Z'), dueDate: new Date('2026-01-01T00:00:00.000Z') }),
      // Not counted: draft, void, another currency, another organization
      invoice('inv_6', { totalMinor: 99_000, status: 'draft' }),
      invoice('inv_7', { totalMinor: 99_000, status: 'void' }),
      invoice('inv_8', { totalMinor: 99_000, currency: 'USD' }),
      invoice('inv_9', { totalMinor: 99_000, organizationId: OTHER_ORG_ID, customerId: 'cus_other' }),
    ]);

    await db.insert(documentsTable).values([
      { id: 'doc_1', organizationId: ORG_ID, name: 'a', originalName: 'a', mimeType: 'text/plain', originalStorageKey: 'a', originalSha256Hash: 'a', createdAt: new Date('2026-10-03T00:00:00.000Z') },
      { id: 'doc_2', organizationId: ORG_ID, name: 'b', originalName: 'b', mimeType: 'text/plain', originalStorageKey: 'b', originalSha256Hash: 'b', createdAt: new Date('2026-09-03T00:00:00.000Z') },
      { id: 'doc_3', organizationId: ORG_ID, name: 'c', originalName: 'c', mimeType: 'text/plain', originalStorageKey: 'c', originalSha256Hash: 'c', isDeleted: true },
    ]);

    const { metrics } = await createDashboardRepository({ db }).getOrganizationMetrics({ organizationId: ORG_ID, now: NOW });

    expect(metrics.year).to.eql(2026);
    expect(metrics.currency).to.eql('EUR');
    expect(metrics.revenue.yearToDateMinor).to.eql(17_500);
    expect(metrics.revenue.previousYearToDateMinor).to.eql(8_000);
    expect(metrics.revenue.monthly[2]).to.eql({ month: 3, current: 10_000, previous: 8_000 });
    expect(metrics.revenue.monthly[9]).to.eql({ month: 10, current: 7_500, previous: 0 });
    expect(metrics.revenue.monthly[11]).to.eql({ month: 12, current: 0, previous: 4_000 });
    expect(metrics.revenue.monthly).to.have.length(12);
    expect(metrics.invoices.yearToDateCount).to.eql(3);
    expect(metrics.invoices.monthly[9]).to.eql({ month: 10, current: 2, previous: 0 });

    // inv_2 is past its due date, inv_3 is not yet
    expect(metrics.outstanding).to.eql({ totalMinor: 7_500, count: 2, overdueTotalMinor: 5_000, overdueCount: 1 });
    expect(metrics.customers).to.eql({ total: 3, newThisMonth: 1, newPreviousMonth: 1 });
    expect(metrics.documents).to.eql({ total: 2, newThisMonth: 1, newPreviousMonth: 1 });
  });

  test('an organization without any data gets empty metrics', async () => {
    const { db } = await createInMemoryDatabase({ organizations: [{ id: ORG_ID, name: 'Acme' }] });

    const { metrics } = await createDashboardRepository({ db }).getOrganizationMetrics({ organizationId: ORG_ID, now: NOW });

    expect(metrics.revenue.yearToDateMinor).to.eql(0);
    expect(metrics.revenue.monthly.every(({ current, previous }) => current === 0 && previous === 0)).to.eql(true);
    expect(metrics.outstanding).to.eql({ totalMinor: 0, count: 0, overdueTotalMinor: 0, overdueCount: 0 });
    expect(metrics.customers.total).to.eql(0);
  });
});
