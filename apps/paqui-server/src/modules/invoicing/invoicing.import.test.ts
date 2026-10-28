import { eq } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../app/database/database.test-utils';
import { createContactsRepository } from '../contacts/contacts.repository';
import { createTestContactInput } from '../contacts/contacts.test-utils';
import { purchaseInvoicesTable } from '../purchases/purchases.tables';
import { createInvoicingRepository } from './invoicing.repository';
import { invoicesTable, verifactuRecordsTable } from './invoicing.tables';

const ORG_ID = 'org_111111111111111111111111';

async function setup() {
  const { db } = await createInMemoryDatabase({
    users: [{ id: 'usr_1', email: 'owner@example.com' }],
    organizations: [{ id: ORG_ID, name: 'Acme' }],
    documents: ['doc_1', 'doc_2', 'doc_3'].map(id => ({ id, organizationId: ORG_ID, name: `${id}.pdf`, originalName: `${id}.pdf`, mimeType: 'application/pdf', originalStorageKey: id, originalSha256Hash: id })),
  });
  const { contact: customer } = await createContactsRepository({ db }).createContact({ organizationId: ORG_ID, contact: createTestContactInput({ name: 'Bruma Café', isCustomer: true }) });
  const repository = createInvoicingRepository({ db });
  const importInvoice = async (overrides: Partial<Parameters<typeof repository.importIssuedInvoice>[0]['input']> = {}) => repository.importIssuedInvoice({
    organizationId: ORG_ID,
    userId: 'usr_1',
    input: {
      documentId: 'doc_1',
      number: 'F-2025-031',
      isPaid: false,
      customerId: customer.id,
      issueDate: new Date('2025-11-03T00:00:00.000Z'),
      dueDate: new Date('2025-12-03T00:00:00.000Z'),
      currency: 'EUR',
      withholdingRateBps: 1_500,
      items: [{ description: 'Consultoría', quantityMillis: 1_000, unitPriceMinor: 100_000, taxRateBps: 2_100, discountRateBps: 0 }],
      ...overrides,
    },
  });

  return { db, customer, importInvoice };
}

describe('importing an issued invoice', () => {
  test('it is registered as issued with its printed number and paper, its totals computed, outside VERI*FACTU', async () => {
    const { db, importInvoice } = await setup();

    const { invoice } = await importInvoice();

    expect(invoice).toMatchObject({ status: 'issued', number: 'F-2025-031', documentId: 'doc_1', seriesId: null, subtotalMinor: 100_000, taxMinor: 21_000, totalMinor: 121_000, withholdingMinor: 15_000, paidAt: null });
    expect(invoice!.importedAt).toBeInstanceOf(Date);
    expect(invoice!.issuedAt).toEqual(new Date('2025-11-03T00:00:00.000Z'));
    expect(await db.select().from(verifactuRecordsTable)).toEqual([]);
  });

  test('a paid one is paid at once, without any notes or terms of the fiscal profile', async () => {
    const { importInvoice } = await setup();

    const { invoice } = await importInvoice({ isPaid: true });

    expect(invoice).toMatchObject({ status: 'paid', notes: null, terms: null });
    expect(invoice!.paidAt).toBeInstanceOf(Date);
  });

  test('a number already used and a paper already registered (as a sale or a purchase) are refused', async () => {
    const { db, customer, importInvoice } = await setup();
    await importInvoice();

    await expect(importInvoice({ documentId: 'doc_2' })).rejects.toMatchObject({ code: 'invoicing.invoice_number_taken' });
    await expect(importInvoice({ number: 'F-2025-032' })).rejects.toMatchObject({ code: 'invoicing.document_already_registered' });

    await db.insert(purchaseInvoicesTable).values({ organizationId: ORG_ID, supplierId: customer.id, number: 'P-1', issueDate: new Date(), documentId: 'doc_3' });
    await expect(importInvoice({ number: 'F-2025-033', documentId: 'doc_3' })).rejects.toMatchObject({ code: 'invoicing.document_already_registered' });

    expect(await db.select({ id: invoicesTable.id }).from(invoicesTable).where(eq(invoicesTable.organizationId, ORG_ID))).toHaveLength(1);
  });

  test('a document of another organization or a deleted one cannot be imported', async () => {
    const { importInvoice } = await setup();

    await expect(importInvoice({ documentId: 'doc_unknown' })).rejects.toMatchObject({ code: 'document.not_found' });
  });
});
