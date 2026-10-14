import type { InvoiceExtraction } from './purchases.extraction.models';
import { describe, expect, test } from 'vitest';
import { normalizeTaxId } from '../contacts/contacts.models';
import { getInvoiceDirection, toPurchaseInvoiceDraft } from './purchases.extraction.models';
import { calculatePurchaseInvoiceTotals } from './purchases.models';

const party = (overrides: Partial<InvoiceExtraction['issuer']> = {}): InvoiceExtraction['issuer'] => ({ name: 'Acme', taxId: null, email: null, addressLine1: null, postalCode: null, city: null, country: 'ES', ...overrides });

function extraction(overrides: Partial<InvoiceExtraction> = {}): InvoiceExtraction {
  return {
    issuer: party({ name: 'Nube Hosting SL', taxId: 'B-00000010' }),
    recipient: party({ name: 'Acme SL', taxId: 'ES B12345678' }),
    number: 'FRA/000011',
    issueDate: '2026-08-03',
    dueDate: '2026-08-18',
    currency: 'eur',
    lines: [{ description: 'Juegos de base con almohadas', quantity: 100, unitPrice: 15, taxRatePercent: 21, discountPercent: 0 }],
    withholdingRatePercent: 0,
    total: 1_815,
    category: 'goods',
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
      number: 'FRA/000011',
      issueDate: new Date('2026-08-03T00:00:00.000Z'),
      dueDate: new Date('2026-08-18T00:00:00.000Z'),
      currency: 'EUR',
      category: 'goods',
      withholdingRateBps: 0,
      documentId: 'doc_1',
      items: [{ description: 'Juegos de base con almohadas', quantityMillis: 100_000, unitPriceMinor: 1_500, taxRateBps: 2_100, discountRateBps: 0, deductibleRateBps: 10_000 }],
    });

    expect(calculatePurchaseInvoiceTotals(draft).totalMinor).toBe(181_500);
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
});
