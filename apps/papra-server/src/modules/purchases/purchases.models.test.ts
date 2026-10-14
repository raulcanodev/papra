import { describe, expect, test } from 'vitest';
import { calculatePurchaseInvoiceTotals } from './purchases.models';

describe('purchases models', () => {
  test('purchase totals match the issued invoice computation and only part of the VAT can be deductible', () => {
    const totals = calculatePurchaseInvoiceTotals({
      withholdingRateBps: 0,
      items: [
        { description: 'Hosting', quantityMillis: 1_000, unitPriceMinor: 10_000, taxRateBps: 2_100, discountRateBps: 0, deductibleRateBps: 10_000 },
        // A car used half privately: only 50% of its VAT is deductible
        { description: 'Car renting', quantityMillis: 1_000, unitPriceMinor: 40_000, taxRateBps: 2_100, discountRateBps: 0, deductibleRateBps: 5_000 },
      ],
    });

    expect(totals).toEqual({
      subtotalMinor: 50_000,
      taxMinor: 10_500,
      totalMinor: 60_500,
      withholdingRateBps: 0,
      withholdingMinor: 0,
      deductibleTaxMinor: 2_100 + 4_200,
    });
  });

  test('a professional invoice received with a withholding: the withholding is computed on the taxable base', () => {
    const { withholdingMinor, totalMinor } = calculatePurchaseInvoiceTotals({
      withholdingRateBps: 1_500,
      items: [{ description: 'Accountant fees', quantityMillis: 1_000, unitPriceMinor: 20_000, taxRateBps: 2_100, discountRateBps: 0, deductibleRateBps: 10_000 }],
    });

    expect({ withholdingMinor, totalMinor }).toEqual({ withholdingMinor: 3_000, totalMinor: 24_200 });
  });
});
