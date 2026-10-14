import type { InvoiceExtraction } from './purchases.extraction.models';
import type { InvoiceReader } from './purchases.extraction.usecases';
import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../app/database/database.test-utils';
import { overrideConfig } from '../config/config.test-utils';
import { contactsTable } from '../contacts/contacts.table';
import { invoicingProfilesTable } from '../invoicing/invoicing.tables';
import { extractPurchaseInvoiceFromDocument } from './purchases.extraction.usecases';

const ORG_ID = 'org_111111111111111111111111';

const party = (name: string, taxId: string | null) => ({ name, taxId, email: null, addressLine1: null, postalCode: null, city: null, country: 'ES' });

const extraction: InvoiceExtraction = {
  issuer: party('Nube Hosting SL', 'ES-B00000010'),
  recipient: party('Acme SL', 'B12345678'),
  number: 'NUBE-2026-77',
  issueDate: '2026-09-30',
  dueDate: null,
  currency: 'EUR',
  lines: [{ description: 'Hosting', quantity: 1, unitPrice: 45, taxRatePercent: 21, discountPercent: 0 }],
  withholdingRatePercent: 0,
  total: 54.45,
  category: 'software',
};

async function setup({ mimeType = 'application/pdf', content = 'NUBE HOSTING SL - Factura NUBE-2026-77' }: { mimeType?: string; content?: string } = {}) {
  const { db } = await createInMemoryDatabase({
    organizations: [{ id: ORG_ID, name: 'Acme' }],
    documents: [{ id: 'doc_1', organizationId: ORG_ID, name: 'invoice.pdf', originalName: 'invoice.pdf', mimeType, originalStorageKey: 'key', originalSha256Hash: 'hash', content }],
  });
  await db.insert(invoicingProfilesTable).values({ organizationId: ORG_ID, legalName: 'Acme SL', taxId: 'B12345678' });

  const reads: Parameters<InvoiceReader>[0][] = [];
  const readInvoice: InvoiceReader = async (input) => {
    reads.push(input);
    return extraction;
  };

  // The text is already extracted in these tests, the storage is never read
  const extract = async ({ reader = readInvoice }: { reader?: InvoiceReader } = {}) => extractPurchaseInvoiceFromDocument({
    organizationId: ORG_ID,
    documentId: 'doc_1',
    db,
    config: overrideConfig({ env: 'test' }),
    documentsStorageService: {} as never,
    readInvoice: reader,
  });

  return { db, reads, extract };
}

describe('purchases extraction usecases', () => {
  test('the invoice is read from the document text, the supplier matched by tax id and the draft prefilled', async () => {
    const { db, reads, extract } = await setup();
    await db.insert(contactsTable).values({ id: 'ctc_nube', organizationId: ORG_ID, name: 'Nube Hosting', taxId: 'b00000010', isSupplier: true });

    const result = await extract();

    expect(reads).to.eql([{ text: 'NUBE HOSTING SL - Factura NUBE-2026-77' }]);
    expect(result.direction).to.eql('received');
    expect(result.counterparty).to.include({ contactId: 'ctc_nube', hasSupplierRole: true, name: 'Nube Hosting SL' });
    expect(result.draft).to.include({ supplierId: 'ctc_nube', number: 'NUBE-2026-77', category: 'software', documentId: 'doc_1' });
    expect(result.printedTotal).to.eql(5_445);
  });

  test('a known contact without the supplier role is suggested, not used as supplier', async () => {
    const { db, extract } = await setup();
    await db.insert(contactsTable).values({ id: 'ctc_nube', organizationId: ORG_ID, name: 'Nube Hosting', taxId: 'B00000010', isCustomer: true });

    const result = await extract();

    expect(result.counterparty).to.include({ contactId: 'ctc_nube', hasSupplierRole: false });
    expect(result.draft.supplierId).to.eql(null);
  });

  test('an invoice issued by the organization itself is reported as a sale', async () => {
    const { extract } = await setup();
    const issued = { ...extraction, issuer: party('Acme SL', 'B12345678'), recipient: party('Client', 'B99999999') };

    const result = await extract({ reader: async () => issued });

    expect(result.direction).to.eql('issued');
    expect(result.counterparty.name).to.eql('Client');
  });

  test('only PDF and image documents can be read', async () => {
    const { extract } = await setup({ mimeType: 'text/plain' });

    await expect(extract()).rejects.toMatchObject({ code: 'purchase_invoice.document_not_extractable' });
  });

  test('a reading failure is reported so the user fills the invoice in manually', async () => {
    const { extract } = await setup();

    await expect(extract({
      reader: async () => {
        throw new Error('model unavailable');
      },
    })).rejects.toMatchObject({ code: 'purchase_invoice.extraction_failed' });
  });
});
