import type { Database } from '../app/database/database.types';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../app/database/database.test-utils';
import { createContactsRepository } from '../contacts/contacts.repository';
import { createTestContactInput } from '../contacts/contacts.test-utils';
import { createDocumentFoldersRepository } from '../documents/document-folders.repository';
import { createDocumentsRepository } from '../documents/documents.repository';
import { organizationsTable } from '../organizations/organizations.table';
import { usersTable } from '../users/users.table';
import { createInvoicingRepository } from './invoicing.repository';
import { invoiceEventsTable, invoiceSeriesTable, verifactuRecordsTable } from './invoicing.tables';
import { createVerifactuRepository } from './verifactu.repository';

describe('invoicing repository', () => {
  test('keeps numbering and finalization idempotent across retries', async () => {
    const { db } = await createTestDatabase();
    const repository = createInvoicingRepository({ db });

    await repository.upsertFiscalProfile({
      organizationId: 'organization-1',
      profile: {
        legalName: 'Paqui SL',
        taxId: 'B12345678',
        email: 'billing@paqui.test',
        addressLine1: null,
        addressLine2: null,
        postalCode: null,
        city: null,
        region: null,
        country: 'ES',
        currency: 'EUR',
        locale: 'es-ES',
        paymentTermsDays: 30,
        defaultNotes: null,
        defaultTerms: null,
        templateId: 'minimal',
        defaultWithholdingRateBps: 0,
        vatRegime: 'general' as const,
        incomeTaxMethod: 'direct_simplified' as const,
      },
    });
    const { contact: customer } = await createContactsRepository({ db }).createContact({ organizationId: 'organization-1', contact: createTestContactInput({ name: 'Acme SL', email: 'billing@acme.test', isCustomer: true }) });
    const foldersRepository = createDocumentFoldersRepository({ db });
    const { folders } = await foldersRepository.listFolders({ organizationId: 'organization-1' });
    expect(folders).toHaveLength(1);
    expect(folders[0]).toMatchObject({ contactId: customer.id, name: 'Acme SL', kind: 'contact', documentsCount: 0 });
    const { invoice: draft } = await repository.createInvoice({
      organizationId: 'organization-1',
      userId: 'user-1',
      draft: {
        customerId: customer.id,
        issueDate: new Date('2026-10-13T00:00:00.000Z'),
        dueDate: new Date('2026-11-12T00:00:00.000Z'),
        currency: 'EUR',
        notes: null,
        terms: null,
        templateId: 'minimal',
        withholdingRateBps: 0,
        items: [{ description: 'Service', quantityMillis: 1_000, unitPriceMinor: 10_000, taxRateBps: 2_100, discountRateBps: 0 }],
      },
    });

    const firstReservation = await repository.reserveInvoiceNumber({ organizationId: 'organization-1', invoiceId: draft!.id, userId: 'user-1' });
    const retriedReservation = await repository.reserveInvoiceNumber({ organizationId: 'organization-1', invoiceId: draft!.id, userId: 'user-1' });
    expect(firstReservation.invoice).toMatchObject({ status: 'issuing', number: 'INV-0001' });
    expect(retriedReservation.invoice).toMatchObject({ status: 'issuing', number: 'INV-0001' });

    const [series] = await db.select().from(invoiceSeriesTable).where(eq(invoiceSeriesTable.organizationId, 'organization-1'));
    const reservationEvents = await db.select().from(invoiceEventsTable).where(eq(invoiceEventsTable.type, 'number_reserved'));
    expect(series?.nextNumber).toBe(2);
    expect(reservationEvents).toHaveLength(1);

    const { document } = await createDocumentsRepository({ db }).saveOrganizationDocument({
      organizationId: 'organization-1',
      createdBy: 'user-1',
      name: 'INV-0001.pdf',
      originalName: 'INV-0001.pdf',
      originalStorageKey: 'invoices/INV-0001.pdf',
      originalSha256Hash: 'invoice-hash',
      mimeType: 'application/pdf',
    });
    await foldersRepository.assignDocument({ organizationId: 'organization-1', documentId: document.id, folderId: folders[0]!.id });
    const folderDocuments = await foldersRepository.listFolderDocuments({ organizationId: 'organization-1', folderId: folders[0]!.id, pageIndex: 0, pageSize: 10 });
    expect(folderDocuments.documents.map(item => item.id)).toEqual([document.id]);
    const issued = await repository.finalizeInvoice({ organizationId: 'organization-1', invoiceId: draft!.id, documentId: document.id, userId: 'user-1' });
    const retriedFinalization = await repository.finalizeInvoice({ organizationId: 'organization-1', invoiceId: draft!.id, documentId: document.id, userId: 'user-1' });
    expect(issued.invoice).toMatchObject({ status: 'issued', documentId: document.id });
    expect(retriedFinalization.invoice).toMatchObject({ status: 'issued', documentId: document.id });

    const issuedEvents = await db.select().from(invoiceEventsTable).where(eq(invoiceEventsTable.type, 'issued'));
    expect(issuedEvents).toHaveLength(1);
  });

  test('freezes customer and seller details when an invoice is issued', async () => {
    const { db } = await createTestDatabase();
    const repository = createInvoicingRepository({ db });
    const profile = {
      legalName: 'Original Seller SL',
      taxId: null,
      email: null,
      addressLine1: null,
      addressLine2: null,
      postalCode: null,
      city: null,
      region: null,
      country: 'ES',
      currency: 'EUR',
      locale: 'es-ES',
      paymentTermsDays: 30,
      defaultNotes: null,
      defaultTerms: null,
      templateId: 'minimal' as const,
      defaultWithholdingRateBps: 0,
      vatRegime: 'general' as const,
      incomeTaxMethod: 'direct_simplified' as const,
    };
    await repository.upsertFiscalProfile({ organizationId: 'organization-1', profile });
    const { contact: customer } = await createContactsRepository({ db }).createContact({ organizationId: 'organization-1', contact: createTestContactInput({ name: 'Original Customer SL', email: 'billing@example.com', isCustomer: true }) });
    const { invoice } = await repository.createInvoice({
      organizationId: 'organization-1',
      userId: 'user-1',
      draft: {
        customerId: customer.id,
        issueDate: new Date('2026-10-13'),
        dueDate: new Date('2026-11-12'),
        currency: 'EUR',
        notes: null,
        terms: null,
        templateId: 'minimal',
        withholdingRateBps: 0,
        items: [{ description: 'Service', quantityMillis: 1_000, unitPriceMinor: 10_000, taxRateBps: 0, discountRateBps: 0 }],
      },
    });
    const { invoice: reserved } = await repository.reserveInvoiceNumber({ organizationId: 'organization-1', invoiceId: invoice!.id, userId: 'user-1' });

    await repository.upsertFiscalProfile({ organizationId: 'organization-1', profile: { ...profile, legalName: 'Changed Seller SL' } });
    await createContactsRepository({ db }).updateContact({
      organizationId: 'organization-1',
      contactId: customer.id,
      contact: createTestContactInput({ name: 'Changed Customer SL', email: customer.email, isCustomer: true }),
    });

    expect(JSON.parse(reserved!.sellerSnapshot!)).toMatchObject({ legalName: 'Original Seller SL' });
    expect(JSON.parse(reserved!.customerSnapshot!)).toMatchObject({ name: 'Original Customer SL' });
  });

  test('creates one immutable VERI*FACTU record per invoice issue retry', async () => {
    const { db } = await createTestDatabase();
    const invoicing = createInvoicingRepository({ db });
    const verifactu = createVerifactuRepository({ db });
    await invoicing.upsertFiscalProfile({
      organizationId: 'organization-1',
      profile: { legalName: 'Jocrimar SL', taxId: 'B12345678', email: null, addressLine1: null, addressLine2: null, postalCode: null, city: null, region: null, country: 'ES', currency: 'EUR', locale: 'es-ES', paymentTermsDays: 30, defaultNotes: null, defaultTerms: null, templateId: 'minimal', defaultWithholdingRateBps: 0, vatRegime: 'general', incomeTaxMethod: 'direct_simplified' },
    });
    const { contact: customer } = await createContactsRepository({ db }).createContact({ organizationId: 'organization-1', contact: createTestContactInput({ name: 'Cliente SL', taxId: 'B87654321', isCustomer: true }) });
    const { invoice } = await invoicing.createInvoice({
      organizationId: 'organization-1',
      userId: 'user-1',
      draft: { customerId: customer.id, issueDate: new Date('2026-10-13T00:00:00.000Z'), dueDate: new Date('2026-11-12T00:00:00.000Z'), currency: 'EUR', notes: null, terms: null, templateId: 'minimal', withholdingRateBps: 0, items: [{ description: 'Consultoría', quantityMillis: 1_000, unitPriceMinor: 10_000, taxRateBps: 2_100, discountRateBps: 0 }] },
    });
    await invoicing.reserveInvoiceNumber({ organizationId: 'organization-1', invoiceId: invoice!.id, userId: 'user-1' });
    await verifactu.upsertConfiguration({ organizationId: 'organization-1', configuration: { mode: 'test', legalName: 'Jocrimar SL', taxId: 'B12345678', applicabilityReason: null, certificateConfigured: false, aeatValidationPassed: false, responsibleDeclarationAccepted: false, transmissionsPaused: false, pauseReason: null } });

    const first = await verifactu.ensureInvoiceRecord({ organizationId: 'organization-1', invoiceId: invoice!.id, now: new Date('2026-10-13T10:30:00.000Z') });
    const retry = await verifactu.ensureInvoiceRecord({ organizationId: 'organization-1', invoiceId: invoice!.id, now: new Date('2026-10-13T10:31:00.000Z') });
    const { records } = await verifactu.listRecords({ organizationId: 'organization-1' });

    expect(first.record).toMatchObject({ recordType: 'alta', status: 'pending', previousHash: null });
    expect(first.record?.hash).toMatch(/^[0-9A-F]{64}$/);
    expect(first.record?.qrUrl).toContain('prewww2.aeat.es');
    expect(retry.record?.id).toBe(first.record?.id);
    expect(records).toHaveLength(1);
    await expect(db.update(verifactuRecordsTable).set({ hash: 'tampered' }).where(eq(verifactuRecordsTable.id, first.record!.id))).rejects.toThrow('VERI*FACTU fiscal fields are immutable');
    await expect(db.delete(verifactuRecordsTable).where(eq(verifactuRecordsTable.id, first.record!.id))).rejects.toThrow('VERI*FACTU records cannot be deleted');
  });

  test('an invoice to a retailer customer carries the equivalence surcharge by default, and it can be removed on the draft', async () => {
    const { db } = await createTestDatabase();
    const invoicing = createInvoicingRepository({ db });
    const { contact: customer } = await createContactsRepository({ db }).createContact({ organizationId: 'organization-1', contact: createTestContactInput({ name: 'Zapatería Lola', isCustomer: true, equivalenceSurcharge: true }) });
    const draft = { customerId: customer.id, issueDate: new Date('2026-10-13T00:00:00.000Z'), dueDate: new Date('2026-11-12T00:00:00.000Z'), currency: 'EUR', notes: null, terms: null, templateId: 'minimal' as const, withholdingRateBps: 0, items: [{ description: 'Zapatos', quantityMillis: 1_000, unitPriceMinor: 10_000, taxRateBps: 2_100, discountRateBps: 0 }] };

    const { invoice } = await invoicing.createInvoice({ organizationId: 'organization-1', userId: 'user-1', draft });
    expect(invoice).toMatchObject({ equivalenceSurcharge: true, subtotalMinor: 10_000, taxMinor: 2_100, equivalenceSurchargeMinor: 520, totalMinor: 12_620 });

    // Saving the draft again without the field keeps it
    const { invoice: kept } = await invoicing.updateInvoice({ organizationId: 'organization-1', invoiceId: invoice!.id, userId: 'user-1', draft });
    expect(kept).toMatchObject({ equivalenceSurcharge: true, totalMinor: 12_620 });

    const { invoice: removed } = await invoicing.updateInvoice({ organizationId: 'organization-1', invoiceId: invoice!.id, userId: 'user-1', draft: { ...draft, equivalenceSurcharge: false } });
    expect(removed).toMatchObject({ equivalenceSurcharge: false, equivalenceSurchargeMinor: 0, totalMinor: 12_100 });
  });
});

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async cleanup => cleanup()));
});

async function createTestDatabase(): Promise<{ db: Database }> {
  const { db } = await createInMemoryDatabase();
  await db.insert(usersTable).values({ id: 'user-1', email: 'owner@example.com' });
  await db.insert(organizationsTable).values({ id: 'organization-1', name: 'Paqui' });
  return { db };
}
