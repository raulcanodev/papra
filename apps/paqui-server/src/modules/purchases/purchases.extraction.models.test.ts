import type { InvoiceExtraction } from './purchases.extraction.models';
import { describe, expect, test } from 'vitest';
import { normalizeTaxId } from '../contacts/contacts.models';
import { getCompanyNameSimilarity, getInvoiceDirection, normalizeCompanyName, resolveSupplier, toPurchaseInvoiceDraft } from './purchases.extraction.models';
import { calculatePurchaseInvoiceTotals } from './purchases.models';

const party = (overrides: Partial<InvoiceExtraction['issuer']> = {}): InvoiceExtraction['issuer'] => ({ name: 'Acme', taxId: null, email: null, phone: null, addressLine1: null, postalCode: null, city: null, country: 'ES', bankAccount: null, ...overrides });

function extraction(overrides: Partial<InvoiceExtraction> = {}): InvoiceExtraction {
  return {
    documentKind: 'invoice',
    issuer: party({ name: 'Nube Hosting SL', taxId: 'B-00000010' }),
    recipient: party({ name: 'Acme SL', taxId: 'ES B12345678' }),
    number: 'FRA/000011',
    issueDate: '2026-08-03',
    dueDate: '2026-08-18',
    paymentMethod: null,
    paymentTerms: [],
    currency: 'eur',
    lines: [{ description: 'Juegos de base con almohadas', quantity: 100, unitPrice: 15, taxRatePercent: 21, discountPercent: 0 }],
    withholdingRatePercent: 0,
    total: 1_815,
    category: 'goods',
    metadata: [],
    warnings: [],
    ...overrides,
  };
}

describe('purchases extraction models', () => {
  test('tax ids are compared regardless of spaces, dashes, case and the ES prefix', () => {
    expect(normalizeTaxId({ taxId: 'ES B-1234 5678' })).toBe('B12345678');
    expect(normalizeTaxId({ taxId: 'b12345678' })).toBe('B12345678');
    expect(normalizeTaxId({ taxId: ' ' })).toBe(null);
    expect(normalizeTaxId({ taxId: null })).toBe(null);
  });

  test('an invoice addressed to the organization is received, one it issued itself is a sale', () => {
    expect(getInvoiceDirection({ extraction: extraction(), organizationTaxId: 'B12345678' })).toBe('received');
    expect(getInvoiceDirection({ extraction: extraction({ issuer: party({ taxId: 'B12345678' }), recipient: party({ taxId: 'B99999999' }) }), organizationTaxId: 'b-12345678' })).toBe('issued');
    expect(getInvoiceDirection({ extraction: extraction(), organizationTaxId: null })).toBe('unknown');
  });

  test('amounts read as decimals become minor units and rates basis points, ready for review', () => {
    const draft = toPurchaseInvoiceDraft({ extraction: extraction(), supplierId: 'ctc_1', documentId: 'doc_1' });

    expect(draft).toEqual({
      supplierId: 'ctc_1',
      kind: 'invoice',
      number: 'FRA/000011',
      issueDate: new Date('2026-08-03T00:00:00.000Z'),
      dueDate: new Date('2026-08-18T00:00:00.000Z'),
      paymentMethod: null,
      instalments: [{ dueDate: new Date('2026-08-18T00:00:00.000Z'), amountMinor: 181_500 }],
      instalmentsSource: 'document',
      currency: 'EUR',
      category: 'goods',
      withholdingRateBps: 0,
      documentId: 'doc_1',
      metadata: [],
      items: [{ description: 'Juegos de base con almohadas', quantityMillis: 100_000, unitPriceMinor: 1_500, taxRateBps: 2_100, discountRateBps: 0, deductibleRateBps: 10_000 }],
    });

    expect(calculatePurchaseInvoiceTotals(draft).totalMinor).toBe(181_500);
  });

  test('printed payment terms become due dates computed from the issue date, split in equal parts when no amount is printed', () => {
    const draft = toPurchaseInvoiceDraft({
      extraction: extraction({ dueDate: null, paymentMethod: 'direct_debit', paymentTerms: [30, 60, 90].map(days => ({ date: null, daysAfterIssue: days, amount: null })) }),
      supplierId: 'ctc_1',
      documentId: 'doc_1',
    });

    expect(draft.paymentMethod).toBe('direct_debit');
    expect(draft.instalmentsSource).toBe('terms');
    expect(draft.instalments).toEqual([
      { dueDate: new Date('2026-09-02T00:00:00.000Z'), amountMinor: 60_500 },
      { dueDate: new Date('2026-10-02T00:00:00.000Z'), amountMinor: 60_500 },
      { dueDate: new Date('2026-11-01T00:00:00.000Z'), amountMinor: 60_500 },
    ]);
    expect(draft.dueDate).toEqual(new Date('2026-09-02T00:00:00.000Z'));
  });

  test('without any printed due date, the supplier usual payment terms are used; a delivery note has no due date', () => {
    const fromContact = toPurchaseInvoiceDraft({ extraction: extraction({ dueDate: null }), supplierId: 'ctc_1', documentId: 'doc_1', contactTermsDays: 45 });
    expect(fromContact.instalments).toEqual([{ dueDate: new Date('2026-09-17T00:00:00.000Z'), amountMinor: 181_500 }]);
    expect(fromContact.instalmentsSource).toBe('contact_terms');

    expect(toPurchaseInvoiceDraft({ extraction: extraction({ dueDate: null }), supplierId: null, documentId: 'doc_1' }).instalments).toEqual([]);
    expect(toPurchaseInvoiceDraft({ extraction: extraction({ documentKind: 'delivery_note' }), supplierId: null, documentId: 'doc_1' }).instalments).toEqual([]);
  });

  test('invalid dates and out of range rates read by the model are neutralized', () => {
    const draft = toPurchaseInvoiceDraft({
      extraction: extraction({ issueDate: 'not a date', dueDate: null, currency: '€', withholdingRatePercent: 150, lines: [{ description: '  ', quantity: 0, unitPrice: -3, taxRatePercent: -5, discountPercent: 0 }] }),
      supplierId: null,
      documentId: 'doc_1',
    });

    expect(draft.issueDate).toBe(null);
    expect(draft.currency).toBe('EUR');
    expect(draft.withholdingRateBps).toBe(5_000);
    expect(draft.items[0]).toEqual({ description: '—', quantityMillis: 1, unitPriceMinor: 0, taxRateBps: 0, discountRateBps: 0, deductibleRateBps: 10_000 });
  });

  test('a delivery note keeps its kind, a ticket or a card voucher is booked as a simplified invoice, and missing fields stay empty', () => {
    const deliveryNote = toPurchaseInvoiceDraft({ extraction: extraction({ documentKind: 'delivery_note', number: null, total: null, lines: [] }), supplierId: null, documentId: 'doc_1' });

    expect(deliveryNote.kind).toBe('delivery_note');
    expect(deliveryNote.number).toBe('');
    expect(deliveryNote.items).toEqual([]);
    expect(toPurchaseInvoiceDraft({ extraction: extraction({ documentKind: 'receipt' }), supplierId: null, documentId: 'doc_1' }).kind).toBe('simplified_invoice');
    expect(toPurchaseInvoiceDraft({ extraction: extraction({ documentKind: 'other' }), supplierId: null, documentId: 'doc_1' }).kind).toBe('invoice');
  });

  test('the data that has no field of its own is kept as metadata, trimmed, without empty entries', () => {
    const draft = toPurchaseInvoiceDraft({
      extraction: extraction({ metadata: [{ label: ' Forma de pago ', value: 'Transferencia   bancaria' }, { label: 'IBAN', value: '  ' }, { label: '', value: 'orphan' }] }),
      supplierId: null,
      documentId: 'doc_1',
    });

    expect(draft.metadata).toEqual([{ label: 'Forma de pago', value: 'Transferencia bancaria' }]);
  });

  describe('supplier resolution', () => {
    const contact = (id: string, name: string, overrides: { taxId?: string | null; isSupplier?: boolean } = {}) => ({ id, name, taxId: null, isSupplier: true, ...overrides });

    test('company names are compared without legal forms, accents, punctuation or case', () => {
      expect(normalizeCompanyName({ name: 'Nube Hosting, S.L.' })).toBe('nube hosting');
      expect(normalizeCompanyName({ name: 'NUBE HOSTING SL' })).toBe('nube hosting');
      expect(normalizeCompanyName({ name: 'Panadería Martínez S. L. U.' })).toBe('panaderia martinez');
      expect(normalizeCompanyName({ name: null })).toBe('');
      expect(getCompanyNameSimilarity({ a: 'Nube Hosting, S.L.', b: 'NUBE HOSTING SL' })).toBe(1);
      expect(getCompanyNameSimilarity({ a: 'Nube Hosting', b: 'Ferretería López' })).toBeLessThan(0.5);
    });

    test('the tax id wins over the name', () => {
      const resolution = resolveSupplier({ party: { name: 'Something else', taxId: 'ES-B00000010' }, contacts: [contact('ctc_1', 'Nube Hosting', { taxId: 'B00000010', isSupplier: false })] });

      expect(resolution).toEqual({ status: 'matched', contactId: 'ctc_1', matchedBy: 'tax_id', hasSupplierRole: false, candidates: [] });
    });

    test('without tax id, the same name is a match', () => {
      const resolution = resolveSupplier({ party: { name: 'NUBE HOSTING S.L.', taxId: null }, contacts: [contact('ctc_1', 'Nube Hosting SL'), contact('ctc_2', 'Ferretería López')] });

      expect(resolution).toMatchObject({ status: 'matched', contactId: 'ctc_1', matchedBy: 'name' });
    });

    test('a contact with another tax id is never matched by name', () => {
      const resolution = resolveSupplier({ party: { name: 'Nube Hosting SL', taxId: 'B11111111' }, contacts: [contact('ctc_1', 'Nube Hosting SL', { taxId: 'B22222222' })] });

      expect(resolution).toMatchObject({ status: 'create', contactId: null, candidates: [] });
    });

    test('an unknown name suggests creating the supplier, with the similar contacts to pick instead', () => {
      const resolution = resolveSupplier({ party: { name: 'Nube Hosting Servicios Cloud', taxId: null }, contacts: [contact('ctc_1', 'Nube Hosting'), contact('ctc_2', 'Ferretería López')] });

      expect(resolution.status).toBe('create');
      expect(resolution.candidates.map(candidate => candidate.contactId)).toEqual(['ctc_1']);
    });

    test('without name nor tax id the user is asked', () => {
      expect(resolveSupplier({ party: { name: '  ', taxId: null }, contacts: [contact('ctc_1', 'Nube Hosting')] })).toMatchObject({ status: 'ask', contactId: null, candidates: [] });
    });
  });
});
