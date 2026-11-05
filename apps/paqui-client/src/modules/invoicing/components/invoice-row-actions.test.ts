import { describe, expect, test } from 'vitest';
import { canDeleteInvoice, getProformaState } from './invoice-row-actions.models';

describe('invoice row actions', () => {
  test('allows deleting drafts and imported invoices, but protects invoices issued by Paqui', () => {
    expect(canDeleteInvoice({ status: 'draft', importedAt: null })).toBe(true);
    expect(canDeleteInvoice({ status: 'issued', importedAt: new Date('2026-01-10') })).toBe(true);
    expect(canDeleteInvoice({ status: 'paid', importedAt: new Date('2026-01-10') })).toBe(true);
    expect(canDeleteInvoice({ status: 'issued', importedAt: null })).toBe(false);
    expect(canDeleteInvoice({ status: 'sent', importedAt: null })).toBe(false);
  });

  test('a proforma is not a legal record, it can always be deleted', () => {
    expect(canDeleteInvoice({ status: 'proforma', importedAt: null })).toBe(true);
  });

  test('a proforma stands as a draft until sent, and as converted once it has its invoice', () => {
    expect(getProformaState({ sentAt: null, convertedInvoiceId: null })).toBe('draft');
    expect(getProformaState({ sentAt: new Date('2026-10-14'), convertedInvoiceId: null })).toBe('sent');
    expect(getProformaState({ sentAt: new Date('2026-10-14'), convertedInvoiceId: 'inv_1' })).toBe('converted');
    expect(getProformaState({ sentAt: null, convertedInvoiceId: 'inv_1' })).toBe('converted');
  });
});
