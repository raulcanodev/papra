import type { Database } from '../app/database/database.types';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createInMemoryDatabase } from '../app/database/database.test-utils';
import { createContactsRepository } from '../contacts/contacts.repository';
import { createTestContactInput } from '../contacts/contacts.test-utils';
import { organizationsTable } from '../organizations/organizations.table';
import { usersTable } from '../users/users.table';
import { createInvoicingRepository } from './invoicing.repository';
import { verifactuAttemptsTable, verifactuRecordsTable } from './invoicing.tables';
import { dispatchPendingVerifactuRecords } from './verifactu.dispatcher';
import { createVerifactuRepository } from './verifactu.repository';

describe('vERI*FACTU dispatcher', () => {
  test('persists accepted responses and does not resend accepted records', async () => {
    const { db, recordId } = await createPendingRecord();
    const send = vi.fn().mockResolvedValue({ outcome: 'accepted', httpStatus: 200, response: '<accepted/>', csv: 'CSV123' });
    const first = await dispatchPendingVerifactuRecords({ db, transport: { send }, now: new Date('2026-10-13T10:31:00.000Z') });
    const second = await dispatchPendingVerifactuRecords({ db, transport: { send }, now: new Date('2026-10-13T10:32:00.000Z') });
    const [record] = await db.select().from(verifactuRecordsTable).where(eq(verifactuRecordsTable.id, recordId));
    const attempts = await db.select().from(verifactuAttemptsTable).where(eq(verifactuAttemptsTable.recordId, recordId));

    expect(first).toEqual({ processed: 1, paused: false });
    expect(second).toEqual({ processed: 0, paused: false });
    expect(send).toHaveBeenCalledTimes(1);
    expect(record).toMatchObject({ status: 'accepted', attemptCount: 1, aeatCsv: 'CSV123' });
    expect(attempts).toHaveLength(1);
  });

  test('keeps transport failures queued with exponential backoff', async () => {
    const { db, recordId } = await createPendingRecord();
    const send = vi.fn().mockRejectedValue(new Error('AEAT unavailable'));
    await dispatchPendingVerifactuRecords({ db, transport: { send }, now: new Date('2026-10-13T10:31:00.000Z') });
    const [record] = await db.select().from(verifactuRecordsTable).where(eq(verifactuRecordsTable.id, recordId));

    expect(record).toMatchObject({ status: 'retrying', attemptCount: 1, aeatErrorDescription: 'AEAT unavailable' });
    expect(record?.nextAttemptAt).toEqual(new Date('2026-10-13T10:31:30.000Z'));
  });
});

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async cleanup => cleanup()));
});

async function createPendingRecord(): Promise<{ db: Database; recordId: string }> {
  const { db } = await createInMemoryDatabase();
  await db.insert(usersTable).values({ id: 'user-1', email: 'owner@example.com' });
  await db.insert(organizationsTable).values({ id: 'organization-1', name: 'Jocrimar' });
  const invoicing = createInvoicingRepository({ db });
  await invoicing.upsertFiscalProfile({ organizationId: 'organization-1', profile: { legalName: 'Jocrimar SL', taxId: 'B12345678', email: null, addressLine1: null, addressLine2: null, postalCode: null, city: null, region: null, country: 'ES', currency: 'EUR', locale: 'es-ES', paymentTermsDays: 30, defaultNotes: null, defaultTerms: null, templateId: 'minimal', defaultWithholdingRateBps: 0, vatRegime: 'general', incomeTaxMethod: 'direct_simplified' } });
  const { contact: customer } = await createContactsRepository({ db }).createContact({ organizationId: 'organization-1', contact: createTestContactInput({ name: 'Cliente SL', taxId: 'B87654321', isCustomer: true }) });
  const { invoice } = await invoicing.createInvoice({ organizationId: 'organization-1', userId: 'user-1', draft: { customerId: customer.id, issueDate: new Date('2026-10-13T00:00:00.000Z'), dueDate: new Date('2026-11-12T00:00:00.000Z'), currency: 'EUR', notes: null, terms: null, templateId: 'minimal', withholdingRateBps: 0, items: [{ description: 'Servicio', quantityMillis: 1_000, unitPriceMinor: 10_000, taxRateBps: 2_100, discountRateBps: 0 }] } });
  await invoicing.reserveInvoiceNumber({ organizationId: 'organization-1', invoiceId: invoice!.id, userId: 'user-1' });
  const verifactu = createVerifactuRepository({ db });
  await verifactu.upsertConfiguration({ organizationId: 'organization-1', configuration: { mode: 'test', applicabilityReason: null, legalName: 'Jocrimar SL', taxId: 'B12345678', certificateConfigured: false, aeatValidationPassed: false, responsibleDeclarationAccepted: false, transmissionsPaused: false, pauseReason: null } });
  const { record } = await verifactu.ensureInvoiceRecord({ organizationId: 'organization-1', invoiceId: invoice!.id, now: new Date('2026-10-13T10:30:00.000Z') });
  return { db, recordId: record!.id };
}
