import type { DeliveryNoteReader, DeliveryNoteReading } from './delivery-notes.reading';
import { Buffer } from 'node:buffer';
import { Readable } from 'node:stream';
import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../app/database/database.test-utils';
import { overrideConfig } from '../config/config.test-utils';
import { contactsTable } from '../contacts/contacts.table';
import { invoicingProductsTable } from '../invoicing/invoicing.tables';
import { readDeliveryNote } from './delivery-notes.reading';
import { createDeliveryNotesRepository } from './delivery-notes.repository';

const ORG_ID = 'org_111111111111111111111111';

async function setup({ mimeType = 'image/jpeg' }: { mimeType?: string } = {}) {
  const { db } = await createInMemoryDatabase({
    organizations: [{ id: ORG_ID, name: 'Frutas Joseda' }],
    documents: [{ id: 'doc_1', organizationId: ORG_ID, name: 'albaran.jpg', originalName: 'albaran.jpg', mimeType, originalStorageKey: 'key', originalSha256Hash: 'hash', content: '' }],
  });

  await db.insert(contactsTable).values([
    { id: 'ctc_bar', organizationId: ORG_ID, name: 'Bar Pepe', isCustomer: true },
    { id: 'ctc_farm', organizationId: ORG_ID, name: 'Huerta Supplier', isSupplier: true },
  ]);
  await db.insert(invoicingProductsTable).values([
    { id: 'prd_tomato', organizationId: ORG_ID, name: 'Tomate pera', unit: 'caja 5 kg', unitPriceMinor: 900, taxRateBps: 400 },
    { id: 'prd_lettuce', organizationId: ORG_ID, name: 'Lechuga', unitPriceMinor: 80, taxRateBps: 400 },
    { id: 'prd_seeds', organizationId: ORG_ID, name: 'Semillas', unitPriceMinor: 10, contactId: 'ctc_farm' },
  ]);

  const calls: Parameters<DeliveryNoteReader>[0][] = [];
  const read = async (reading: DeliveryNoteReading) => readDeliveryNote({
    db,
    config: overrideConfig({ env: 'test' }),
    documentsStorageService: { getFileStream: async () => ({ fileStream: Readable.from([Buffer.from('photo')]) }) } as never,
    organizationId: ORG_ID,
    documentId: 'doc_1',
    readDeliveryNote: async (input) => {
      calls.push(input);
      return reading;
    },
  });

  return { db, calls, read };
}

const reading: DeliveryNoteReading = {
  customer: { name: 'bar pepe', taxId: null },
  number: '0042',
  date: '2026-10-14',
  warnings: ['La segunda línea está tachada'],
  lines: [
    { writtenText: '3 caj tom pera', quantity: 3, productRef: 'P2', alternativeRefs: [], confidence: 'high' },
    { writtenText: 'lechu', quantity: 10, productRef: null, alternativeRefs: ['P1'], confidence: 'low' },
  ],
};

describe('delivery note reading', () => {
  test('the photo goes to the reader with the sold catalog only, the customer and the products are matched', async () => {
    const { calls, read } = await setup();

    const result = await read(reading);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.file).to.eql({ data: Buffer.from('photo'), mediaType: 'image/jpeg' });
    // Without past delivery notes, the catalog goes in alphabetical order
    expect(calls[0]!.prompt).to.include('P1: Lechuga\nP2: Tomate pera (caja 5 kg)');
    // What suppliers sell us is not sold to customers
    expect(calls[0]!.prompt).not.to.include('Semillas');

    expect(result.customer).to.eql({ name: 'bar pepe', taxId: null, contactId: 'ctc_bar', candidates: [] });
    expect(result.number).to.eql('0042');
    expect(result.duplicate).to.eql(null);
    expect(result.warnings).to.eql(['La segunda línea está tachada']);
    expect(result.lines.map(({ productId, matchedBy, alternativeProductIds }) => ({ productId, matchedBy, alternativeProductIds }))).to.eql([
      { productId: 'prd_tomato', matchedBy: 'reading', alternativeProductIds: [] },
      { productId: null, matchedBy: null, alternativeProductIds: ['prd_lettuce'] },
    ]);
  });

  test('what the user confirmed in a past delivery note is taught to the reader and wins over its guess, a known number is flagged', async () => {
    const { db, calls, read } = await setup();

    const { deliveryNote } = await createDeliveryNotesRepository({ db }).createDeliveryNote({
      organizationId: ORG_ID,
      draft: { customerId: 'ctc_bar', number: '0042', date: new Date('2026-10-01'), items: [{ productId: 'prd_lettuce', writtenText: 'Lechu.', description: 'Lechuga', quantityMillis: 1_000 }] },
    });

    const result = await read(reading);

    // The products used before come first
    expect(calls[0]!.prompt).to.include('P1: Lechuga');
    expect(calls[0]!.prompt).to.include('"lechu" → P1');
    expect(result.lines[1]).to.include({ productId: 'prd_lettuce', matchedBy: 'memory', confidence: 'high' });
    expect(result.duplicate).to.eql({ id: deliveryNote!.id, number: '0042', customerId: 'ctc_bar' });
  });

  test('a file that is not a photo nor a PDF is refused before calling the reader', async () => {
    const { calls, read } = await setup({ mimeType: 'text/plain' });

    await expect(read(reading)).rejects.toMatchObject({ code: 'delivery_notes.unreadable' });
    expect(calls).to.eql([]);
  });
});
