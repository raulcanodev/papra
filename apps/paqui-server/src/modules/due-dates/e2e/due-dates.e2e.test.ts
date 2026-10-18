import type { Contact } from '../../contacts/contacts.models';
import type { InvoiceExtraction } from '../../purchases/purchases.extraction.models';
import type { ListedInstalment } from '../due-dates.repository';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createInMemoryDatabase } from '../../app/database/database.test-utils';
import { createServer } from '../../app/server';
import { createTestServerDependencies } from '../../app/server.test-utils';
import { overrideConfig } from '../../config/config.test-utils';
import { invoicesTable, invoicingProfilesTable } from '../../invoicing/invoicing.tables';
import { remindersTable } from '../../notifications/notifications.tables';
import { sendDueReminders } from '../../notifications/notifications.usecases';
import { ORGANIZATION_ROLES } from '../../organizations/organizations.constants';
import { extractPurchaseInvoiceFromDocument } from '../../purchases/purchases.extraction.usecases';
import { createDueDatesRepository } from '../due-dates.repository';

const USER_ID = 'usr_111111111111111111111111';
const ORG_ID = 'org_222222222222222222222222';
const OTHER_USER_ID = 'usr_333333333333333333333333';
const OTHER_ORG_ID = 'org_444444444444444444444444';
const NOW = new Date('2026-10-17T09:00:00.000Z');

const party = (name: string, taxId: string) => ({ name, taxId, email: null, phone: null, addressLine1: null, postalCode: null, city: null, country: 'ES' });

// "Giro a 30 y 60 días" on a received invoice issued on October 15th
const extraction: InvoiceExtraction = {
  documentKind: 'invoice',
  issuer: party('Metales del Norte SL', 'B00000099'),
  recipient: party('Acme SL', 'B12345678'),
  number: 'MN-2026-145',
  issueDate: '2026-10-15',
  dueDate: null,
  paymentMethod: 'direct_debit',
  paymentTerms: [{ date: null, daysAfterIssue: 30, amount: null }, { date: null, daysAfterIssue: 60, amount: null }],
  currency: 'EUR',
  lines: [{ description: 'Chapa de acero 2 mm', quantity: 10, unitPrice: 100, taxRatePercent: 21, discountPercent: 0 }],
  withholdingRatePercent: 0,
  total: 1_210,
  category: 'goods',
  metadata: [{ label: 'Forma de pago', value: 'Giro a 30 y 60 días' }],
  warnings: [],
};

async function setupApp() {
  const { db } = await createInMemoryDatabase({
    users: [{ id: USER_ID, email: 'owner@example.com' }, { id: OTHER_USER_ID, email: 'other@example.com' }],
    organizations: [{ id: ORG_ID, name: 'Acme' }, { id: OTHER_ORG_ID, name: 'Other' }],
    organizationMembers: [
      { organizationId: ORG_ID, userId: USER_ID, role: ORGANIZATION_ROLES.OWNER },
      { organizationId: OTHER_ORG_ID, userId: OTHER_USER_ID, role: ORGANIZATION_ROLES.OWNER },
    ],
    documents: [{ id: 'doc_invoice', organizationId: ORG_ID, name: 'mn-145.pdf', originalName: 'mn-145.pdf', mimeType: 'application/pdf', originalStorageKey: 'key', originalSha256Hash: 'hash', content: 'METALES DEL NORTE SL - Factura MN-2026-145 - Giro a 30 y 60 días' }],
  });
  await db.insert(invoicingProfilesTable).values({ organizationId: ORG_ID, legalName: 'Acme SL', taxId: 'B12345678' });

  const config = overrideConfig({ env: 'test' });
  const { app } = createServer(createTestServerDependencies({ db, config }));

  const request = async ({ path, method = 'GET', body, userId = USER_ID }: { path: string; method?: string; body?: unknown; userId?: string }) => app.request(
    path,
    { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) },
    { loggedInUserId: userId },
  );

  const json = async <T>(args: Parameters<typeof request>[0]) => {
    const response = await request(args);
    const body = await response.text();
    expect(response.status, body).toBeLessThan(300);
    return (body === '' ? {} : JSON.parse(body)) as T;
  };

  const createContact = async (contact: Record<string, unknown>) => (await json<{ contact: Contact }>({ path: `/api/organizations/${ORG_ID}/contacts`, method: 'POST', body: contact })).contact;
  const listDueDates = async (direction?: 'payable' | 'receivable') => (await json<{ instalments: ListedInstalment[] }>({ path: `/api/organizations/${ORG_ID}/due-dates${direction ? `?direction=${direction}` : ''}` })).instalments;
  const listReminders = async () => (await db.select().from(remindersTable).where(eq(remindersTable.organizationId, ORG_ID))).toSorted((a, b) => a.targetDate.getTime() - b.targetDate.getTime() || a.key.localeCompare(b.key));

  return { db, config, request, json, createContact, listDueDates, listReminders };
}

describe('due dates e2e', () => {
  beforeEach(() => {
    // Only the clock: the database and the server keep their real timers
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('the due dates read on a document ("giro a 30 y 60 días") become the instalments of the saved invoice, each with its reminders, on the calendar', async () => {
    const { db, config, json, createContact, listDueDates, listReminders } = await setupApp();
    const supplier = await createContact({ name: 'Metales del Norte SL', taxId: 'B00000099', isSupplier: true, paymentTermsDays: 90 });

    // The AI reading (here a stub reader) gives the method and the instalments computed from the issue date
    const { draft } = await extractPurchaseInvoiceFromDocument({ organizationId: ORG_ID, documentId: 'doc_invoice', db, config, documentsStorageService: {} as never, readInvoice: async () => extraction });

    expect(draft.supplierId).to.eql(supplier.id);
    expect(draft.paymentMethod).to.eql('direct_debit');
    expect(draft.instalmentsSource).to.eql('terms');
    expect(draft.instalments).to.eql([
      { dueDate: new Date('2026-11-14T00:00:00.000Z'), amountMinor: 60_500 },
      { dueDate: new Date('2026-12-14T00:00:00.000Z'), amountMinor: 60_500 },
    ]);

    // Saved as reviewed by the user
    const { purchaseInvoice } = await json<{ purchaseInvoice: { id: string; dueDate: string; paymentMethod: string; instalments: ListedInstalment[] } }>({
      path: `/api/organizations/${ORG_ID}/purchases`,
      method: 'POST',
      body: { ...draft, supplierId: supplier.id, instalments: draft.instalments },
    });

    expect(purchaseInvoice.paymentMethod).to.eql('direct_debit');
    expect(purchaseInvoice.dueDate).to.eql('2026-11-14T00:00:00.000Z');
    expect(purchaseInvoice.instalments.map(({ dueDate, amountMinor, status, paymentMethod }) => ({ dueDate, amountMinor, status, paymentMethod }))).to.eql([
      { dueDate: '2026-11-14T00:00:00.000Z', amountMinor: 60_500, status: 'pending', paymentMethod: 'direct_debit' },
      { dueDate: '2026-12-14T00:00:00.000Z', amountMinor: 60_500, status: 'pending', paymentMethod: 'direct_debit' },
    ]);

    const dueDates = await listDueDates('payable');
    expect(dueDates.map(({ contactName, documentNumber, documentId, direction }) => ({ contactName, documentNumber, documentId, direction }))).to.eql([
      { contactName: 'Metales del Norte SL', documentNumber: 'MN-2026-145', documentId: 'doc_invoice', direction: 'payable' },
      { contactName: 'Metales del Norte SL', documentNumber: 'MN-2026-145', documentId: 'doc_invoice', direction: 'payable' },
    ]);
    expect(await listDueDates('receivable')).to.eql([]);

    // Three reminders per due date: 3 days before, on the day, and the day after if still unpaid
    const [first, second] = dueDates;
    expect((await listReminders()).map(({ type, targetDate, key, status, entityType, entityId, data }) => ({ type, targetDate: targetDate.toISOString().slice(0, 10), key, status, entityType, entityId, amountMinor: data.amountMinor }))).to.eql([
      { type: 'payment_due', targetDate: '2026-11-11', key: `payment_instalment:${first!.id}:before`, status: 'pending', entityType: 'purchase_invoice', entityId: purchaseInvoice.id, amountMinor: 60_500 },
      { type: 'payment_due', targetDate: '2026-11-14', key: `payment_instalment:${first!.id}:due`, status: 'pending', entityType: 'purchase_invoice', entityId: purchaseInvoice.id, amountMinor: 60_500 },
      { type: 'payment_overdue', targetDate: '2026-11-15', key: `payment_instalment:${first!.id}:overdue`, status: 'pending', entityType: 'purchase_invoice', entityId: purchaseInvoice.id, amountMinor: 60_500 },
      { type: 'payment_due', targetDate: '2026-12-11', key: `payment_instalment:${second!.id}:before`, status: 'pending', entityType: 'purchase_invoice', entityId: purchaseInvoice.id, amountMinor: 60_500 },
      { type: 'payment_due', targetDate: '2026-12-14', key: `payment_instalment:${second!.id}:due`, status: 'pending', entityType: 'purchase_invoice', entityId: purchaseInvoice.id, amountMinor: 60_500 },
      { type: 'payment_overdue', targetDate: '2026-12-15', key: `payment_instalment:${second!.id}:overdue`, status: 'pending', entityType: 'purchase_invoice', entityId: purchaseInvoice.id, amountMinor: 60_500 },
    ]);

    // The calendar shows both due dates, each linked to its invoice and file (the public sources are unreachable here)
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const { events } = await json<{ events: { id: string; date: string; type: string; name: string; amountMinor?: number; link?: unknown }[] }>({ path: `/api/organizations/${ORG_ID}/calendar?year=2026` });
    expect(events.filter(({ type }) => type === 'payment-due' || type === 'collection-due')).to.eql([
      { id: `due-date-${first!.id}`, date: '2026-11-14', name: 'Metales del Norte SL · MN-2026-145', type: 'payment-due', source: 'Paqui', amountMinor: 60_500, currency: 'EUR', status: 'pending', link: { entityType: 'purchase_invoice', entityId: purchaseInvoice.id, documentId: 'doc_invoice' } },
      { id: `due-date-${second!.id}`, date: '2026-12-14', name: 'Metales del Norte SL · MN-2026-145', type: 'payment-due', source: 'Paqui', amountMinor: 60_500, currency: 'EUR', status: 'pending', link: { entityType: 'purchase_invoice', entityId: purchaseInvoice.id, documentId: 'doc_invoice' } },
    ]);
  });

  test('without any due date on the paper, the supplier payment terms give it; editing the date moves its pending reminders', async () => {
    const { json, createContact, listDueDates, listReminders } = await setupApp();
    const supplier = await createContact({ name: 'Nube Hosting SL', isSupplier: true, paymentTermsDays: 45 });
    const body = { supplierId: supplier.id, number: 'NUBE-1', issueDate: '2026-10-10', category: 'software', items: [{ description: 'Hosting', quantityMillis: 1_000, unitPriceMinor: 10_000, taxRateBps: 2_100 }] };

    const { purchaseInvoice } = await json<{ purchaseInvoice: { id: string } }>({ path: `/api/organizations/${ORG_ID}/purchases`, method: 'POST', body });
    const [instalment] = await listDueDates();
    expect(instalment).to.include({ amountMinor: 12_100, status: 'pending', paymentMethod: null });
    expect(instalment!.dueDate).to.eql('2026-11-24T00:00:00.000Z');

    await json({ path: `/api/organizations/${ORG_ID}/purchases/${purchaseInvoice.id}`, method: 'PUT', body: { ...body, paymentMethod: 'transfer', instalments: [{ dueDate: '2026-11-30', amountMinor: 12_100 }] } });

    const [moved] = await listDueDates();
    // Same due date (same id), moved
    expect(moved).to.include({ id: instalment!.id, paymentMethod: 'transfer' });
    expect((await listReminders()).map(({ targetDate }) => targetDate.toISOString().slice(0, 10))).to.eql(['2026-11-27', '2026-11-30', '2026-12-01']);
  });

  test('paying every due date pays the invoice and drops its pending reminders; a returned charge is owed again and overdue at once', async () => {
    const { json, createContact, listDueDates, listReminders } = await setupApp();
    const supplier = await createContact({ name: 'Metales del Norte SL', isSupplier: true });
    const body = {
      supplierId: supplier.id,
      number: 'MN-1',
      issueDate: '2026-10-15',
      paymentMethod: 'direct_debit',
      items: [{ description: 'Chapa', quantityMillis: 1_000, unitPriceMinor: 100_000, taxRateBps: 0 }],
      instalments: [{ dueDate: '2026-11-14', amountMinor: 50_000 }, { dueDate: '2026-12-14', amountMinor: 50_000 }],
    };
    const { purchaseInvoice } = await json<{ purchaseInvoice: { id: string } }>({ path: `/api/organizations/${ORG_ID}/purchases`, method: 'POST', body });
    const [first, second] = await listDueDates();
    const setStatus = async (id: string, status: string) => json<{ instalment: ListedInstalment }>({ path: `/api/organizations/${ORG_ID}/due-dates/${id}/status`, method: 'PATCH', body: { status } });
    const getPurchase = async () => (await json<{ purchaseInvoice: { status: string; paidAt: string | null } }>({ path: `/api/organizations/${ORG_ID}/purchases/${purchaseInvoice.id}` })).purchaseInvoice;

    expect((await setStatus(first!.id, 'paid')).instalment).to.include({ status: 'paid', paidAt: NOW.toISOString() });
    expect(await getPurchase()).to.include({ status: 'pending' });
    expect((await listReminders()).map(({ key }) => key.split(':')[1])).to.eql([second!.id, second!.id, second!.id]);

    await setStatus(second!.id, 'paid');
    expect(await getPurchase()).to.include({ status: 'paid', paidAt: NOW.toISOString() });
    expect(await listReminders()).to.eql([]);

    // The bank returned the second charge: the invoice is owed again, with an overdue reminder for today
    expect((await setStatus(second!.id, 'returned')).instalment).to.include({ status: 'returned', returnedAt: NOW.toISOString(), paidAt: null });
    expect(await getPurchase()).to.include({ status: 'pending', paidAt: null });
    expect((await listReminders()).map(({ type, key, targetDate }) => ({ type, key, targetDate: targetDate.toISOString().slice(0, 10) }))).to.eql([
      { type: 'payment_overdue', key: `payment_instalment:${second!.id}:returned`, targetDate: '2026-10-17' },
    ]);

    // Marking the whole invoice paid from the purchases list pays every due date
    await json({ path: `/api/organizations/${ORG_ID}/purchases/${purchaseInvoice.id}/status`, method: 'PATCH', body: { status: 'paid' } });
    expect((await listDueDates()).map(({ status }) => status)).to.eql(['paid', 'paid']);
  });

  test('issued invoices are collected: their due dates are listed and reminded, a draft is not, and they belong to their organization only', async () => {
    const { db, json, request, createContact, listDueDates, listReminders } = await setupApp();
    const customer = await createContact({ name: 'Muebles Ejemplo SA', isCustomer: true });

    const { invoice } = await json<{ invoice: { id: string } }>({
      path: `/api/organizations/${ORG_ID}/invoicing/invoices`,
      method: 'POST',
      body: { customerId: customer.id, issueDate: '2026-10-16', dueDate: '2026-11-15', paymentMethod: 'promissory_note', items: [{ description: 'Mesa', quantityMillis: 1_000, unitPriceMinor: 20_000, taxRateBps: 2_100 }] },
    });

    expect(await listDueDates('receivable')).to.eql([]);
    expect(await listReminders()).to.eql([]);

    await db.update(invoicesTable).set({ status: 'issued', number: 'F-0001' }).where(eq(invoicesTable.id, invoice.id));
    await createDueDatesRepository({ db }).syncSourceReminders({ organizationId: ORG_ID, source: { direction: 'receivable', invoiceId: invoice.id } });

    const [instalment] = await listDueDates('receivable');
    expect(instalment).to.include({ invoiceId: invoice.id, amountMinor: 24_200, paymentMethod: 'promissory_note', documentNumber: 'F-0001', contactName: 'Muebles Ejemplo SA' });
    expect((await listReminders()).map(({ type }) => type)).to.eql(['collection_due', 'collection_due', 'collection_overdue']);

    // Collected: the invoice is paid
    await json({ path: `/api/organizations/${ORG_ID}/due-dates/${instalment!.id}/status`, method: 'PATCH', body: { status: 'paid' } });
    const [paid] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoice.id));
    expect(paid).to.include({ status: 'paid' });

    // Another organization sees nothing and cannot change it
    expect((await request({ path: `/api/organizations/${ORG_ID}/due-dates`, userId: OTHER_USER_ID })).status).to.eql(403);
    expect((await request({ path: `/api/organizations/${OTHER_ORG_ID}/due-dates/${instalment!.id}/status`, method: 'PATCH', body: { status: 'pending' }, userId: OTHER_USER_ID })).status).to.eql(404);
  });

  test('the reminders of the day are emailed only to the organizations that turned the emails on', async () => {
    const { db, config, json, createContact, listReminders } = await setupApp();
    const supplier = await createContact({ name: 'Metales del Norte SL', isSupplier: true });
    await json({ path: `/api/organizations/${ORG_ID}/purchases`, method: 'POST', body: { supplierId: supplier.id, number: 'MN-1', issueDate: '2026-10-15', items: [{ description: 'Chapa', quantityMillis: 1_000, unitPriceMinor: 100_000, taxRateBps: 0 }], instalments: [{ dueDate: '2026-10-20', amountMinor: 100_000 }] } });

    const sent: { to: string; subject: string; html: string }[] = [];
    const emailsServices = { sendEmail: async (email: { to: string; subject: string; html: string }) => void sent.push(email) };

    // Off by default: nothing is sent, the reminder stays pending
    expect(await sendDueReminders({ db, emailsServices, config, now: new Date('2026-10-17T07:00:00.000Z') })).to.eql({ sentCount: 0 });

    const { settings } = await json<{ settings: Record<string, unknown> }>({ path: `/api/organizations/${ORG_ID}/due-dates/settings`, method: 'PUT', body: { emailRemindersEnabled: true, reminderEmail: '', reminderDaysBefore: 3, readIntakeEmailAttachments: true } });
    expect(settings).to.include({ emailRemindersEnabled: true, reminderEmail: null });

    expect(await sendDueReminders({ db, emailsServices, config, now: new Date('2026-10-17T07:00:00.000Z') })).to.eql({ sentCount: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).to.include({ to: 'owner@example.com', subject: 'Tienes 1 vencimiento' });
    expect(sent[0]!.html).to.include('Metales del Norte SL · MN-1');
    expect((await listReminders()).map(({ status }) => status)).to.eql(['sent', 'pending', 'pending']);

    // Sent once only
    expect(await sendDueReminders({ db, emailsServices, config, now: new Date('2026-10-17T08:00:00.000Z') })).to.eql({ sentCount: 0 });
  });
});
