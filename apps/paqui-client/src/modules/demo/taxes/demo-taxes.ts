import type { Quarter, QuarterlyTaxReport, SimulatedPurchase } from '../../taxes/taxes.types';

// The quarterly taxes estimation of the demo, computed in the browser from the demo invoices with the same formulas
// and rules as the server taxes module (2026 rules)
type Line = { quantityMillis: number; unitPriceMinor: number; discountRateBps: number; discountMinor?: number; taxRateBps: number; deductibleRateBps?: number };
type DemoIssued = { status: string; currency: string; issueDate: string; withholdingMinor?: number; items: Line[] };
type DemoPurchase = { currency: string; issueDate: string; category: string; supplierId: string; withholdingMinor?: number; items: Line[] };
type DemoProfile = { currency?: string; legalForm?: 'self_employed' | 'company' | null; vatRegime?: 'general' | 'equivalence_surcharge' | 'exempt'; incomeTaxMethod?: 'direct_simplified' | 'direct_normal' | 'modules'; lastCorporateTaxQuotaMinor?: number | null; accountantEmail?: string | null } | null;

const BILLED_STATUSES = ['issued', 'sent', 'paid'];
const DAY = 24 * 60 * 60 * 1000;

function lineAmounts(item: Line) {
  const gross = Math.round(item.quantityMillis * item.unitPriceMinor / 1_000);
  const netMinor = gross - Math.round(gross * item.discountRateBps / 10_000) - (item.discountMinor ?? 0);
  return { netMinor, taxMinor: Math.round(netMinor * item.taxRateBps / 10_000) };
}

const businessDay = (date: Date) => new Date(date.getTime() + ({ 6: 2, 0: 1 }[date.getUTCDay()] ?? 0) * DAY);

export function computeDemoQuarterlyTaxReport({ issuedInvoices, purchaseInvoices, profile, year, quarter, simulatedPurchase }: { issuedInvoices: DemoIssued[]; purchaseInvoices: DemoPurchase[]; profile: DemoProfile; year: number; quarter: Quarter; simulatedPurchase?: SimulatedPurchase }): QuarterlyTaxReport {
  const currency = profile?.currency ?? 'EUR';
  const start = new Date(Date.UTC(year, (quarter - 1) * 3, 1));
  const end = new Date(Date.UTC(year, quarter * 3, 1));
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const within = (value: string, from: Date, to: Date) => new Date(value) >= from && new Date(value) < to;

  const issued = issuedInvoices.filter(invoice => BILLED_STATUSES.includes(invoice.status) && invoice.currency === currency && within(invoice.issueDate, yearStart, end));
  const basePurchases = purchaseInvoices.filter(purchase => purchase.currency === currency && within(purchase.issueDate, yearStart, end));

  const compute = (purchases: DemoPurchase[]) => {
    const outputByRate = new Map<number, { baseMinor: number; taxMinor: number }>();
    for (const item of issued.filter(invoice => within(invoice.issueDate, start, end)).flatMap(invoice => invoice.items)) {
      const { netMinor, taxMinor } = lineAmounts(item);
      const current = outputByRate.get(item.taxRateBps) ?? { baseMinor: 0, taxMinor: 0 };
      outputByRate.set(item.taxRateBps, { baseMinor: current.baseMinor + netMinor, taxMinor: current.taxMinor + taxMinor });
    }
    const quarterPurchases = purchases.filter(purchase => within(purchase.issueDate, start, end));
    const input = quarterPurchases.flatMap(purchase => purchase.items).reduce((sums, item) => {
      const { netMinor, taxMinor } = lineAmounts(item);
      return { baseMinor: sums.baseMinor + netMinor, taxMinor: sums.taxMinor + taxMinor, deductibleTaxMinor: sums.deductibleTaxMinor + Math.round(taxMinor * (item.deductibleRateBps ?? 10_000) / 10_000) };
    }, { baseMinor: 0, taxMinor: 0, deductibleTaxMinor: 0 });
    const output = [...outputByRate.entries()].map(([rateBps, amounts]) => ({ rateBps, ...amounts })).toSorted((a, b) => b.rateBps - a.rateBps);
    const outputTaxMinor = output.reduce((sum, { taxMinor }) => sum + taxMinor, 0);
    const resultMinor = outputTaxMinor - input.deductibleTaxMinor;

    const incomeUntil = (untilQuarter: number): QuarterlyTaxReport['incomeTax130'] => {
      const to = new Date(Date.UTC(year, untilQuarter * 3, 1));
      const yearIssued = issued.filter(invoice => within(invoice.issueDate, yearStart, to));
      const incomeMinor = yearIssued.flatMap(invoice => invoice.items).reduce((sum, item) => sum + lineAmounts(item).netMinor, 0);
      const withholdingsMinor = yearIssued.reduce((sum, invoice) => sum + (invoice.withholdingMinor ?? 0), 0);
      const expensesMinor = purchases.filter(purchase => within(purchase.issueDate, yearStart, to)).flatMap(purchase => purchase.items).reduce((sum, item) => {
        const { netMinor, taxMinor } = lineAmounts(item);
        return sum + netMinor + taxMinor - Math.round(taxMinor * (item.deductibleRateBps ?? 10_000) / 10_000);
      }, 0);
      const previous = incomeMinor - expensesMinor;
      const difficultExpensesMinor = profile?.incomeTaxMethod === 'direct_normal' ? 0 : Math.min(Math.round(Math.max(previous, 0) * 500 / 10_000), 200_000);
      const netIncomeMinor = previous - difficultExpensesMinor;
      const grossInstalmentMinor = Math.round(Math.max(netIncomeMinor, 0) * 2_000 / 10_000);
      const previousInstalmentsMinor = Array.from({ length: untilQuarter - 1 }, (_, index) => incomeUntil(index + 1).resultMinor).reduce((sum, value) => sum + value, 0);
      return { rateBps: 2_000, incomeMinor, expensesMinor, difficultExpensesMinor, netIncomeMinor, grossInstalmentMinor, withholdingsMinor, previousInstalmentsMinor, resultMinor: Math.max(grossInstalmentMinor - withholdingsMinor - previousInstalmentsMinor, 0) };
    };

    const withholdingsOf = (rent: boolean) => {
      const invoices = quarterPurchases.filter(purchase => (purchase.withholdingMinor ?? 0) > 0 && (purchase.category === 'rent') === rent);
      return {
        payeesCount: new Set(invoices.map(purchase => purchase.supplierId)).size,
        baseMinor: invoices.flatMap(purchase => purchase.items).reduce((sum, item) => sum + lineAmounts(item).netMinor, 0),
        amountMinor: invoices.reduce((sum, purchase) => sum + (purchase.withholdingMinor ?? 0), 0),
      };
    };

    return {
      vat303: {
        output,
        outputBaseMinor: output.reduce((sum, { baseMinor }) => sum + baseMinor, 0),
        outputTaxMinor,
        inputBaseMinor: input.baseMinor,
        inputTaxMinor: input.taxMinor,
        deductibleTaxMinor: input.deductibleTaxMinor,
        resultMinor,
        outcome: resultMinor > 0 ? 'pay' as const : resultMinor === 0 ? 'zero' as const : quarter === 4 ? 'refund_or_compensate' as const : 'compensate' as const,
      },
      incomeTax130: incomeUntil(quarter),
      professionals111: withholdingsOf(false),
      rents115: withholdingsOf(true),
    };
  };

  const taxes = compute(basePurchases);
  const legalForm = profile?.legalForm ?? null;
  const applicable = {
    303: (profile?.vatRegime ?? 'general') === 'general',
    130: legalForm === 'self_employed' && profile?.incomeTaxMethod !== 'modules',
    111: taxes.professionals111.amountMinor > 0,
    115: taxes.rents115.amountMinor > 0,
    202: legalForm === 'company',
  };

  const simulated = simulatedPurchase === undefined
    ? null
    : compute([...basePurchases, { currency, issueDate: new Date(end.getTime() - DAY).toISOString(), category: simulatedPurchase.category, supplierId: 'simulation', items: [{ quantityMillis: 1_000, unitPriceMinor: simulatedPurchase.baseMinor, discountRateBps: 0, taxRateBps: simulatedPurchase.taxRateBps, deductibleRateBps: simulatedPurchase.deductibleRateBps }] }]);

  const quota = profile?.lastCorporateTaxQuotaMinor ?? null;
  const deadline = (fourthQuarterDay: number) => businessDay(quarter === 4 ? new Date(Date.UTC(year + 1, 0, fourthQuarterDay)) : new Date(Date.UTC(year, quarter * 3, 20)));

  return {
    year,
    quarter,
    currency,
    period: { start, end },
    profile: { legalForm, vatRegime: profile?.vatRegime ?? 'general', incomeTaxMethod: profile?.incomeTaxMethod ?? 'direct_simplified', lastCorporateTaxQuotaMinor: quota, isConfigured: legalForm !== null, accountantEmail: profile?.accountantEmail ?? null },
    applicable,
    ...taxes,
    corporateTax202: [4, 10, 12].map((month, index) => ({ period: index + 1, dueDate: businessDay(new Date(Date.UTC(year, month - 1, 20))), amountMinor: quota === null ? null : Math.round(quota * 1_800 / 10_000) })),
    deadlines: [
      { model: '303', dueDate: deadline(30) },
      { model: '130', dueDate: deadline(30) },
      { model: '111', dueDate: deadline(20) },
      { model: '115', dueDate: deadline(20) },
    ],
    counts: {
      issuedInvoices: issued.filter(invoice => within(invoice.issueDate, start, end)).length,
      purchaseInvoices: basePurchases.filter(purchase => within(purchase.issueDate, start, end)).length,
    },
    simulation: simulated === null || simulatedPurchase === undefined
      ? null
      : {
          purchase: simulatedPurchase,
          vat303ResultMinor: simulated.vat303.resultMinor,
          incomeTax130ResultMinor: simulated.incomeTax130.resultMinor,
          vat303SavingMinor: taxes.vat303.resultMinor - simulated.vat303.resultMinor,
          incomeTax130SavingMinor: applicable[130] ? taxes.incomeTax130.resultMinor - simulated.incomeTax130.resultMinor : 0,
        },
    sources: [{ label: 'AEAT, calendario del contribuyente', url: 'https://sede.agenciatributaria.gob.es/Sede/calendario-contribuyente.html' }],
  };
}
