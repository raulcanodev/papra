import { describe, expect, test } from 'vitest';
import { calculatePurchaseInvoiceTotals, compareLineWithTariff } from './purchases.models';

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

  describe('compareLineWithTariff', () => {
    const tariff = { unitPriceMinor: 1_100, currency: 'EUR' };

    test('the list price, with or without its discount, or a discounted price equal to it, is the same price', () => {
      expect(compareLineWithTariff({ item: { unitPriceMinor: 1_100, discountRateBps: 0 }, tariff, currency: 'EUR' }).comparison).toEqual('same');
      expect(compareLineWithTariff({ item: { unitPriceMinor: 1_100, discountRateBps: 1_000 }, tariff, currency: 'EUR' }).comparison).toEqual('same');
      expect(compareLineWithTariff({ item: { unitPriceMinor: 1_222, discountRateBps: 1_000 }, tariff, currency: 'EUR' }).comparison).toEqual('same');
      expect(compareLineWithTariff({ item: { unitPriceMinor: 1_101, discountRateBps: 0 }, tariff, currency: 'EUR' }).comparison).toEqual('same');
    });

    test('the price actually charged, after the discount, is compared with the list price', () => {
      expect(compareLineWithTariff({ item: { unitPriceMinor: 1_250, discountRateBps: 0 }, tariff, currency: 'EUR' })).toEqual({ comparison: 'higher', chargedMinor: 1_250, differenceMinor: 150 });
      expect(compareLineWithTariff({ item: { unitPriceMinor: 1_200, discountRateBps: 2_000 }, tariff, currency: 'EUR' })).toEqual({ comparison: 'lower', chargedMinor: 960, differenceMinor: -140 });
    });

    test('another currency or a line without price cannot be compared', () => {
      expect(compareLineWithTariff({ item: { unitPriceMinor: 1_250, discountRateBps: 0 }, tariff, currency: 'USD' }).comparison).toEqual('not_comparable');
      expect(compareLineWithTariff({ item: { unitPriceMinor: 0, discountRateBps: 0 }, tariff, currency: 'EUR' }).comparison).toEqual('not_comparable');
    });
  });
});
