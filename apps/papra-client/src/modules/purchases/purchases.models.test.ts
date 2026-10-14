import { describe, expect, test } from 'vitest';
import { calculatePurchaseInvoiceTotals } from './purchases.models';

describe('purchases models', () => {
  test('same totals as the server: deductible part of the VAT, withholding on the base and amount due', () => {
    expect(calculatePurchaseInvoiceTotals({
      withholdingRateBps: 1_500,
      items: [
        { description: 'Fees', quantityMillis: 1_000, unitPriceMinor: 20_000, taxRateBps: 2_100, discountRateBps: 0, deductibleRateBps: 10_000 },
        { description: 'Car', quantityMillis: 1_000, unitPriceMinor: 10_000, taxRateBps: 2_100, discountRateBps: 1_000, deductibleRateBps: 5_000 },
      ],
    })).toEqual({
      subtotalMinor: 29_000,
      taxMinor: 4_200 + 1_890,
      deductibleTaxMinor: 4_200 + 945,
      totalMinor: 35_090,
      withholdingMinor: 4_350,
      payableMinor: 30_740,
    });
  });
});
