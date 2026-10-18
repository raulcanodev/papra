import type { InvoiceExtraction } from './purchases.extraction.models';
import type { InvoiceReader } from './purchases.extraction.usecases';
import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../app/database/database.test-utils';
import { overrideConfig } from '../config/config.test-utils';
import { contactsTable } from '../contacts/contacts.table';
import { invoicingProfilesTable } from '../invoicing/invoicing.tables';
import { extractPurchaseInvoiceFromDocument } from './purchases.extraction.usecases';

const ORG_ID = 'org_111111111111111111111111';

const party = (name: string | null, taxId: string | null) => ({ name, taxId, email: null, phone: null, addressLine1: null, postalCode: null, city: null, country: 'ES' });

const extraction: InvoiceExtraction = {
  documentKind: 'invoice',
  issuer: party('Nube Hosting SL', 'ES-B00000010'),
  recipient: party('Acme SL', 'B12345678'),
  number: 'NUBE-2026-77',
  issueDate: '2026-09-30',
  dueDate: null,
  paymentMethod: 'direct_debit',
  paymentTerms: [],
  currency: 'EUR',
  lines: [{ description: 'Hosting', quantity: 1, unitPrice: 45, taxRatePercent: 21, discountPercent: 0 }],
  withholdingRatePercent: 0,
  total: 54.45,
  category: 'software',
  metadata: [{ label: 'Forma de pago', value: 'Domiciliación' }],
  warnings: [],
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

    expect(reads).to.eql([{ text: 'NUBE HOSTING SL - Factura NUBE-2026-77', organization: { name: 'Acme SL', taxId: 'B12345678' } }]);
    expect(result.direction).to.eql('received');
    expect(result.counterparty).to.include({ status: 'matched', matchedBy: 'tax_id', contactId: 'ctc_nube', hasSupplierRole: true, name: 'Nube Hosting SL' });
    expect(result.draft).to.include({ supplierId: 'ctc_nube', kind: 'invoice', number: 'NUBE-2026-77', category: 'software', documentId: 'doc_1' });
    expect(result.draft.metadata).to.eql([{ label: 'Forma de pago', value: 'Domiciliación' }]);
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

  test('a supplier without tax id is matched by its name, an unknown one is suggested for creation, a nameless one is asked', async () => {
    const { db, extract } = await setup();
    await db.insert(contactsTable).values({ id: 'ctc_nube', organizationId: ORG_ID, name: 'NUBE HOSTING, S.L.', isSupplier: true });

    const byName = await extract({ reader: async () => ({ ...extraction, issuer: party('Nube Hosting SL', null) }) });
    expect(byName.counterparty).to.include({ status: 'matched', matchedBy: 'name', contactId: 'ctc_nube' });
    expect(byName.draft.supplierId).to.eql('ctc_nube');

    const unknown = await extract({ reader: async () => ({ ...extraction, issuer: party('Ferretería López', null) }) });
    expect(unknown.counterparty).to.include({ status: 'create', contactId: null, name: 'Ferretería López' });
    expect(unknown.draft.supplierId).to.eql(null);

    const nameless = await extract({ reader: async () => ({ ...extraction, issuer: party(null, null) }) });
    expect(nameless.counterparty).to.include({ status: 'ask', contactId: null });
  });

  test('a photo is sent to the vision model as a file, with its recognized text as a hint', async () => {
    const { db } = await createInMemoryDatabase({
      organizations: [{ id: ORG_ID, name: 'Acme' }],
      documents: [{ id: 'doc_photo', organizationId: ORG_ID, name: 'ticket.jpg', originalName: 'ticket.jpg', mimeType: 'image/jpeg', originalStorageKey: 'key', originalSha256Hash: 'hash', content: 'TICKET' }],
    });
    const reads: Parameters<InvoiceReader>[0][] = [];

    await extractPurchaseInvoiceFromDocument({
      organizationId: ORG_ID,
      documentId: 'doc_photo',
      db,
      config: overrideConfig({ env: 'test' }),
      documentsStorageService: { getFileStream: async () => ({ fileStream: Readable.from([Buffer.from('jpeg bytes')]) }) } as never,
      readInvoice: async (input) => {
        reads.push(input);
        return extraction;
      },
    });

    expect(reads).to.eql([{ file: { data: Buffer.from('jpeg bytes'), mediaType: 'image/jpeg' }, text: 'TICKET', organization: { name: null, taxId: null } }]);
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
