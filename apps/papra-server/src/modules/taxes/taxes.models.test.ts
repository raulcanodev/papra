import type { TaxableIssuedInvoice, TaxablePurchaseInvoice } from './taxes.models';
import { describe, expect, test } from 'vitest';
import { getSpanishTaxRules } from './rules/spain.tax-rules';
import { computeIncomeTaxInstalment, computeVatReturn, computeWithholdingsReturns, getCorporateTaxInstalments, getQuarterlyDeadline, getQuarterPeriod } from './taxes.models';

const rules = getSpanishTaxRules({ year: 2026 });

const line = (euros: number, taxRateBps = 2_100) => ({ quantityMillis: 1_000, unitPriceMinor: euros * 100, discountRateBps: 0, taxRateBps });
function issued(date: string, euros: number, { taxRateBps = 2_100, withholdingRateBps = 0 } = {}): TaxableIssuedInvoice {
  return {
    issueDate: new Date(`${date}T00:00:00.000Z`),
    withholdingMinor: Math.round(euros * 100 * withholdingRateBps / 10_000),
    items: [line(euros, taxRateBps)],
  };
}
function purchase(date: string, euros: number, { taxRateBps = 2_100, deductibleRateBps = 10_000, category = 'supplies', withholdingRateBps = 0, supplierId = 'ctc_1' }: { taxRateBps?: number; deductibleRateBps?: number; category?: TaxablePurchaseInvoice['category']; withholdingRateBps?: number; supplierId?: string } = {}): TaxablePurchaseInvoice {
  return {
    issueDate: new Date(`${date}T00:00:00.000Z`),
    category,
    supplierId,
    withholdingMinor: Math.round(euros * 100 * withholdingRateBps / 10_000),
    items: [{ ...line(euros, taxRateBps), deductibleRateBps }],
  };
}

describe('taxes models', () => {
  describe('deadlines', () => {
    test('quarterly models are due the 20th of the following month, the fourth quarter VAT and income tax on January 30th', () => {
      expect(getQuarterlyDeadline({ model: '303', year: 2026, quarter: 3, rules })).toEqual(new Date('2026-10-20T00:00:00.000Z'));
      expect(getQuarterlyDeadline({ model: '111', year: 2026, quarter: 4, rules })).toEqual(new Date('2027-01-20T00:00:00.000Z'));
    });

    test('a deadline on a weekend moves to the next Monday', () => {
      // January 30th 2027 is a Saturday
      expect(getQuarterlyDeadline({ model: '303', year: 2026, quarter: 4, rules })).toEqual(new Date('2027-02-01T00:00:00.000Z'));
      expect(getQuarterlyDeadline({ model: '130', year: 2026, quarter: 4, rules })).toEqual(new Date('2027-02-01T00:00:00.000Z'));
    });

    test('corporate tax instalments are 18% of the last quota, due in April, October and December', () => {
      // December 20th 2026 is a Sunday
      expect(getCorporateTaxInstalments({ year: 2026, rules, lastCorporateTaxQuotaMinor: 1_000_000 })).toEqual([
        { period: 1, dueDate: new Date('2026-04-20T00:00:00.000Z'), amountMinor: 180_000 },
        { period: 2, dueDate: new Date('2026-10-20T00:00:00.000Z'), amountMinor: 180_000 },
        { period: 3, dueDate: new Date('2026-12-21T00:00:00.000Z'), amountMinor: 180_000 },
      ]);
      expect(getCorporateTaxInstalments({ year: 2026, rules, lastCorporateTaxQuotaMinor: null })[0]?.amountMinor).toBe(null);
    });
  });

  describe('model 303', () => {
    test('the VAT charged in the quarter minus the deductible VAT received, grouped by rate', () => {
      const result = computeVatReturn({
        quarter: 3,
        period: getQuarterPeriod({ year: 2026, quarter: 3 }),
        issuedInvoices: [issued('2026-07-10', 1_000), issued('2026-08-01', 200, { taxRateBps: 1_000 }), issued('2026-06-30', 9_999)],
        purchaseInvoices: [purchase('2026-09-30', 500), purchase('2026-07-01', 100, { deductibleRateBps: 5_000 }), purchase('2026-10-01', 9_999)],
      });

      expect(result).toEqual({
        output: [{ rateBps: 2_100, baseMinor: 100_000, taxMinor: 21_000 }, { rateBps: 1_000, baseMinor: 20_000, taxMinor: 2_000 }],
        outputBaseMinor: 120_000,
        outputTaxMinor: 23_000,
        inputBaseMinor: 60_000,
        inputTaxMinor: 12_600,
        deductibleTaxMinor: 10_500 + 1_050,
        resultMinor: 23_000 - 11_550,
        outcome: 'pay',
      });
    });

    test('more deductible VAT than charged is carried forward, refundable in the last quarter', () => {
      const compute = (quarter: 3 | 4) => computeVatReturn({ quarter, period: getQuarterPeriod({ year: 2026, quarter }), issuedInvoices: [], purchaseInvoices: [purchase(quarter === 3 ? '2026-08-01' : '2026-11-01', 1_000)] }).outcome;

      expect(compute(3)).toBe('compensate');
      expect(compute(4)).toBe('refund_or_compensate');
    });
  });

  describe('model 130', () => {
    // Q1: 10.000 € billed with a 15% withholding, 2.000 € of expenses
    const issuedInvoices = [issued('2026-02-01', 10_000, { withholdingRateBps: 1_500 }), issued('2026-05-01', 5_000)];
    const purchaseInvoices = [purchase('2026-03-01', 2_000)];

    test('20% of the net income minus the difficult to justify expenses and the withholdings already paid', () => {
      // 10.000 - 2.000 = 8.000, minus 5% (400) = 7.600, 20% = 1.520, minus 1.500 withheld = 20 €
      expect(computeIncomeTaxInstalment({ issuedInvoices, purchaseInvoices, year: 2026, quarter: 1, incomeTaxMethod: 'direct_simplified', rules })).toEqual({
        rateBps: 2_000,
        incomeMinor: 1_000_000,
        expensesMinor: 200_000,
        difficultExpensesMinor: 40_000,
        netIncomeMinor: 760_000,
        grossInstalmentMinor: 152_000,
        withholdingsMinor: 150_000,
        previousInstalmentsMinor: 0,
        resultMinor: 2_000,
      });
    });

    test('the figures are cumulative over the year and the previous quarters instalments are deducted', () => {
      // 15.000 - 2.000 = 13.000, minus 650 = 12.350, 20% = 2.470, minus 1.500 withheld and the 20 € paid in Q1 = 950 €
      const result = computeIncomeTaxInstalment({ issuedInvoices, purchaseInvoices, year: 2026, quarter: 2, incomeTaxMethod: 'direct_simplified', rules });

      expect(result).toMatchObject({ grossInstalmentMinor: 247_000, previousInstalmentsMinor: 2_000, resultMinor: 95_000 });
    });

    test('the difficult to justify expenses are capped at 2.000 € a year and only apply to the simplified method', () => {
      const bigYear = [issued('2026-01-15', 100_000)];

      expect(computeIncomeTaxInstalment({ issuedInvoices: bigYear, purchaseInvoices: [], year: 2026, quarter: 1, incomeTaxMethod: 'direct_simplified', rules }).difficultExpensesMinor).toBe(200_000);
      expect(computeIncomeTaxInstalment({ issuedInvoices: bigYear, purchaseInvoices: [], year: 2026, quarter: 1, incomeTaxMethod: 'direct_normal', rules }).difficultExpensesMinor).toBe(0);
    });

    test('a loss gives nothing to pay', () => {
      expect(computeIncomeTaxInstalment({ issuedInvoices: [issued('2026-01-15', 100)], purchaseInvoices: [purchase('2026-01-20', 1_000)], year: 2026, quarter: 1, incomeTaxMethod: 'direct_simplified', rules })).toMatchObject({ grossInstalmentMinor: 0, resultMinor: 0 });
    });
  });

  describe('models 111 and 115', () => {
    test('withholdings applied on received invoices, professionals and rents apart, with their number of payees', () => {
      const period = getQuarterPeriod({ year: 2026, quarter: 3 });
      const result = computeWithholdingsReturns({
        period,
        purchaseInvoices: [
          purchase('2026-07-01', 1_000, { withholdingRateBps: 1_500, category: 'professional_services', supplierId: 'ctc_lawyer' }),
          purchase('2026-08-01', 500, { withholdingRateBps: 1_500, category: 'professional_services', supplierId: 'ctc_lawyer' }),
          purchase('2026-09-01', 800, { withholdingRateBps: 1_900, category: 'rent', supplierId: 'ctc_landlord' }),
          purchase('2026-09-02', 300),
        ],
      });

      expect(result).toEqual({
        professionals111: { payeesCount: 1, baseMinor: 150_000, amountMinor: 22_500 },
        rents115: { payeesCount: 1, baseMinor: 80_000, amountMinor: 15_200 },
      });
    });
  });
});
