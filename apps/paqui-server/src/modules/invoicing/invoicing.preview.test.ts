import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../app/database/database.test-utils';
import { createContactsRepository } from '../contacts/contacts.repository';
import { createTestContactInput } from '../contacts/contacts.test-utils';
import { renderInvoicePdf } from './invoicing.pdf';
import { getPreviewWatermark, renderInvoicePreviewPdf } from './invoicing.preview';
import { createInvoicingRepository } from './invoicing.repository';
import { invoiceSeriesTable, invoicesTable } from './invoicing.tables';

const ORG_ID = 'org_111111111111111111111111';

describe('invoice preview', () => {
  test('the watermark is in the language of the invoice', () => {
    expect(getPreviewWatermark({ locale: 'es-ES' })).toBe('BORRADOR');
    expect(getPreviewWatermark({ locale: 'en-GB' })).toBe('DRAFT');
    expect(getPreviewWatermark({ locale: null })).toBe('DRAFT');
  });

  test('a watermark is drawn over the invoice', async () => {
    const invoice = {
      number: 'INV-0001',
      issueDate: new Date('2026-10-13T00:00:00.000Z'),
      dueDate: new Date('2026-11-12T00:00:00.000Z'),
      currency: 'EUR',
      subtotalMinor: 10_000,
      taxMinor: 2_100,
      totalMinor: 12_100,
      withholdingRateBps: 0,
      withholdingMinor: 0,
      notes: null,
      terms: null,
      templateId: 'minimal',
      sellerSnapshot: JSON.stringify({ legalName: 'Paqui SL', locale: 'es-ES' }),
      customerSnapshot: JSON.stringify({ name: 'Acme SA' }),
      items: [{ description: 'Service', quantityMillis: 1_000, unitPriceMinor: 10_000, taxRateBps: 2_100, discountRateBps: 0 }],
    };

    const plain = await renderInvoicePdf(invoice);
    const watermarked = await renderInvoicePdf({ ...invoice, watermark: 'BORRADOR' });

    expect(watermarked.subarray(0, 5).toString()).toBe('%PDF-');
    expect(watermarked.equals(plain)).toBe(false);
  });

  test('the form is rendered with the number it would take, and nothing is saved nor reserved', async () => {
    const { db } = await createInMemoryDatabase({ users: [{ id: 'usr_1', email: 'owner@example.com' }], organizations: [{ id: ORG_ID, name: 'Acme' }] });
    const { contact: customer } = await createContactsRepository({ db }).createContact({ organizationId: ORG_ID, contact: createTestContactInput({ name: 'Bruma Café', isCustomer: true }) });
    await createInvoicingRepository({ db }).ensureDefaultSeries({ organizationId: ORG_ID });
    const seriesBefore = await db.select().from(invoiceSeriesTable);

    const { pdf, number } = await renderInvoicePreviewPdf({
      db,
      organizationId: ORG_ID,
      draft: {
        customerId: customer.id,
        issueDate: new Date('2026-10-28T00:00:00.000Z'),
        dueDate: new Date('2026-11-27T00:00:00.000Z'),
        currency: 'EUR',
        templateId: 'minimal',
        withholdingRateBps: 0,
        items: [{ description: 'Consultoría', quantityMillis: 1_000, unitPriceMinor: 50_000, taxRateBps: 2_100, discountRateBps: 0 }],
      },
    });

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(number).toBe(`${seriesBefore[0]!.prefix}${String(seriesBefore[0]!.nextNumber).padStart(seriesBefore[0]!.padding, '0')}`);
    expect(await db.select().from(invoicesTable)).toEqual([]);
    expect(await db.select().from(invoiceSeriesTable)).toEqual(seriesBefore);
  });

  test('a contact that is not a customer cannot be previewed', async () => {
    const { db } = await createInMemoryDatabase({ users: [{ id: 'usr_1', email: 'owner@example.com' }], organizations: [{ id: ORG_ID, name: 'Acme' }] });
    const { contact: supplier } = await createContactsRepository({ db }).createContact({ organizationId: ORG_ID, contact: createTestContactInput({ name: 'Textiles', isCustomer: false, isSupplier: true }) });

    await expect(renderInvoicePreviewPdf({
      db,
      organizationId: ORG_ID,
      draft: { customerId: supplier.id, issueDate: new Date(), dueDate: new Date(), currency: 'EUR', templateId: 'minimal', withholdingRateBps: 0, items: [{ description: 'X', quantityMillis: 1_000, unitPriceMinor: 100, taxRateBps: 2_100, discountRateBps: 0 }] },
    })).rejects.toThrow();
  });
});
