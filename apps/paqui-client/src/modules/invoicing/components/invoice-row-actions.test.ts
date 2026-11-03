import { describe, expect, test } from 'vitest';
import { canDeleteInvoice } from './invoice-row-actions.models';

describe('invoice row actions', () => {
  test('allows deleting drafts and imported invoices, but protects invoices issued by Paqui', () => {
    expect(canDeleteInvoice({ status: 'draft', importedAt: null })).toBe(true);
    expect(canDeleteInvoice({ status: 'issued', importedAt: new Date('2026-01-10') })).toBe(true);
    expect(canDeleteInvoice({ status: 'paid', importedAt: new Date('2026-01-10') })).toBe(true);
    expect(canDeleteInvoice({ status: 'issued', importedAt: null })).toBe(false);
    expect(canDeleteInvoice({ status: 'sent', importedAt: null })).toBe(false);
  });
});
