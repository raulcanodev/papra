import { describe, expect, test } from 'vitest';
import { calculateInvoiceTotals, formatInvoiceNumber } from './invoicing.models';

describe('invoicing models', () => {
  test('calculates money with integer minor units and basis points', () => {
    expect(calculateInvoiceTotals([
      { description: 'Consulting', quantityMillis: 1_500, unitPriceMinor: 10_000, discountRateBps: 1_000, taxRateBps: 2_100 },
      { description: 'Hosting', quantityMillis: 1_000, unitPriceMinor: 2_000, discountRateBps: 0, taxRateBps: 2_100 },
    ])).toEqual({
      subtotalMinor: 15_500,
      taxMinor: 3_255,
      totalMinor: 18_755,
    });
  });

  test('formats a stable padded invoice number', () => {
    expect(formatInvoiceNumber({ prefix: 'F-2026-', nextNumber: 42, padding: 5 })).toBe('F-2026-00042');
  });
});
