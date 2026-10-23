import { describe, expect, test } from 'vitest';
import { calculateInvoiceTotals, formatInvoiceNumber, getEquivalenceSurchargeRateBps, getInvoicePayableMinor } from './invoicing.models';

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
      equivalenceSurchargeMinor: 0,
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

    expect(totals).toEqual({ subtotalMinor: 100_000, taxMinor: 21_000, equivalenceSurchargeMinor: 0, totalMinor: 121_000, withholdingRateBps: 1_500, withholdingMinor: 15_000 });
    expect(getInvoicePayableMinor(totals)).toBe(106_000);
  });

  test('the withholding is rounded to the cent', () => {
    const { withholdingMinor } = calculateInvoiceTotals({
      withholdingRateBps: 700,
      items: [{ description: 'Design', quantityMillis: 1_000, unitPriceMinor: 3_333, discountRateBps: 0, taxRateBps: 2_100 }],
    });

    expect(withholdingMinor).toBe(233);
  });

  test('a retailer customer under the equivalence surcharge pays the surcharge of each VAT rate on top of the VAT', () => {
    // 100 € at 21% and 50 € at 10%: 5,2% of 100 + 1,4% of 50, the total adds VAT and surcharge
    const totals = calculateInvoiceTotals({
      withholdingRateBps: 0,
      equivalenceSurcharge: true,
      items: [
        { description: 'Shoes', quantityMillis: 1_000, unitPriceMinor: 10_000, discountRateBps: 0, taxRateBps: 2_100 },
        { description: 'Bread', quantityMillis: 1_000, unitPriceMinor: 5_000, discountRateBps: 0, taxRateBps: 1_000 },
        { description: 'Exempt course', quantityMillis: 1_000, unitPriceMinor: 2_000, discountRateBps: 0, taxRateBps: 0 },
      ],
    });

    expect(totals).toEqual({ subtotalMinor: 17_000, taxMinor: 2_600, equivalenceSurchargeMinor: 590, totalMinor: 20_190, withholdingRateBps: 0, withholdingMinor: 0 });
  });

  test('the surcharge rate follows the VAT rate of the line', () => {
    expect([2_100, 1_000, 500, 400, 200, 0, 1_500].map(taxRateBps => getEquivalenceSurchargeRateBps({ taxRateBps }))).toEqual([520, 140, 62, 50, 26, 0, 0]);
  });

  test('formats a stable padded invoice number', () => {
    expect(formatInvoiceNumber({ prefix: 'F-2026-', nextNumber: 42, padding: 5 })).toBe('F-2026-00042');
  });
});
