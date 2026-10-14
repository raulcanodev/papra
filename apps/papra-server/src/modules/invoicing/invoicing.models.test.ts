import { describe, expect, test } from 'vitest';
import { calculateInvoiceTotals, formatInvoiceNumber, getInvoicePayableMinor } from './invoicing.models';

describe('invoicing models', () => {
  test('calculates money with integer minor units and basis points', () => {
    expect(calculateInvoiceTotals({
      withholdingRateBps: 0,
      items: [
        { description: 'Consulting', quantityMillis: 1_500, unitPriceMinor: 10_000, discountRateBps: 1_000, taxRateBps: 2_100 },
        { description: 'Hosting', quantityMillis: 1_000, unitPriceMinor: 2_000, discountRateBps: 0, taxRateBps: 2_100 },
      ],
    })).toEqual({
      subtotalMinor: 15_500,
      taxMinor: 3_255,
      totalMinor: 18_755,
      withholdingRateBps: 0,
      withholdingMinor: 0,
    });
  });

  test('the IRPF withholding is computed on the taxable base and leaves the invoice total untouched', () => {
    // A professional invoicing 1.000 € + 21% VAT with a 15% withholding: the customer pays 1.210 - 150 = 1.060 €
    const totals = calculateInvoiceTotals({
      withholdingRateBps: 1_500,
      items: [{ description: 'Consulting', quantityMillis: 1_000, unitPriceMinor: 100_000, discountRateBps: 0, taxRateBps: 2_100 }],
    });

    expect(totals).toEqual({ subtotalMinor: 100_000, taxMinor: 21_000, totalMinor: 121_000, withholdingRateBps: 1_500, withholdingMinor: 15_000 });
    expect(getInvoicePayableMinor(totals)).toBe(106_000);
  });

  test('the withholding is rounded to the cent', () => {
    const { withholdingMinor } = calculateInvoiceTotals({
      withholdingRateBps: 700,
      items: [{ description: 'Design', quantityMillis: 1_000, unitPriceMinor: 3_333, discountRateBps: 0, taxRateBps: 2_100 }],
    });

    expect(withholdingMinor).toBe(233);
  });

  test('formats a stable padded invoice number', () => {
    expect(formatInvoiceNumber({ prefix: 'F-2026-', nextNumber: 42, padding: 5 })).toBe('F-2026-00042');
  });
});
