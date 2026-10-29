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
        output: [{ rateBps: 2_100, baseMinor: 100_000, taxMinor: 21_000, equivalenceSurchargeMinor: 0 }, { rateBps: 1_000, baseMinor: 20_000, taxMinor: 2_000, equivalenceSurchargeMinor: 0 }],
        outputBaseMinor: 120_000,
        outputTaxMinor: 23_000,
        outputEquivalenceSurchargeMinor: 0,
        inputBaseMinor: 60_000,
        inputTaxMinor: 12_600,
        deductibleTaxMinor: 10_500 + 1_050,
        resultMinor: 23_000 - 11_550,
        outcome: 'pay',
      });
    });

    test('the equivalence surcharge charged to retailer customers is paid with the VAT', () => {
      const result = computeVatReturn({
        quarter: 3,
        period: getQuarterPeriod({ year: 2026, quarter: 3 }),
        issuedInvoices: [{ ...issued('2026-07-10', 1_000), equivalenceSurcharge: true }, issued('2026-08-01', 1_000)],
        purchaseInvoices: [],
      });

      expect(result.output).toEqual([{ rateBps: 2_100, baseMinor: 200_000, taxMinor: 42_000, equivalenceSurchargeMinor: 5_200 }]);
      expect(result.outputEquivalenceSurchargeMinor).toBe(5_200);
      expect(result.resultMinor).toBe(42_000 + 5_200);
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

      expect(result).toMatchObject({
        professionals111: { payeesCount: 1, baseMinor: 150_000, amountMinor: 22_500 },
        rents115: { payeesCount: 1, baseMinor: 80_000, amountMinor: 15_200 },
      });
    });

    test('what was withheld to each supplier over the quarter, with its invoices, the largest first', () => {
      const period = getQuarterPeriod({ year: 2026, quarter: 3 });
      // An advisory fee of 190 € with 15 % IRPF: 28,50 € withheld every month
      const advisory = (date: string, number: string) => ({ ...purchase(date, 190, { withholdingRateBps: 1_500, category: 'professional_services', supplierId: 'ctc_advisory' }), id: `pin_${number}`, number, withholdingRateBps: 1_500, supplierName: 'Asesoría Losada, C.B.', supplierTaxId: 'E73881773' });
      const designer = { ...purchase('2026-08-10', 100, { withholdingRateBps: 700, category: 'professional_services', supplierId: 'ctc_designer' }), id: 'pin_d1', number: 'D-1', withholdingRateBps: 700, supplierName: 'Diseño Ana', supplierTaxId: null };

      const { professionals111 } = computeWithholdingsReturns({ period, purchaseInvoices: [advisory('2026-07-31', '1/1901'), designer, advisory('2026-08-31', '1/2079'), advisory('2026-09-30', '1/2250')] });

      expect(professionals111.amountMinor).toBe(9_250);
      expect(professionals111.payees).toEqual([
        {
          supplierId: 'ctc_advisory',
          name: 'Asesoría Losada, C.B.',
          taxId: 'E73881773',
          baseMinor: 57_000,
          amountMinor: 8_550,
          invoices: [
            { id: 'pin_1/1901', number: '1/1901', issueDate: new Date('2026-07-31T00:00:00.000Z'), baseMinor: 19_000, rateBps: 1_500, amountMinor: 2_850 },
            { id: 'pin_1/2079', number: '1/2079', issueDate: new Date('2026-08-31T00:00:00.000Z'), baseMinor: 19_000, rateBps: 1_500, amountMinor: 2_850 },
            { id: 'pin_1/2250', number: '1/2250', issueDate: new Date('2026-09-30T00:00:00.000Z'), baseMinor: 19_000, rateBps: 1_500, amountMinor: 2_850 },
          ],
        },
        { supplierId: 'ctc_designer', name: 'Diseño Ana', taxId: null, baseMinor: 10_000, amountMinor: 700, invoices: [{ id: 'pin_d1', number: 'D-1', issueDate: new Date('2026-08-10T00:00:00.000Z'), baseMinor: 10_000, rateBps: 700, amountMinor: 700 }] },
      ]);
    });
  });
});
