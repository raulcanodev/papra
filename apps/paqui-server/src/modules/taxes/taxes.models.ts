import type { ExpenseCategory } from '../purchases/purchases.constants';
import type { SpanishTaxRules } from './rules/spain.tax-rules';
import type { IncomeTaxMethod, LegalForm, Quarter, TaxModel, VatRegime } from './taxes.constants';
import { getLineAmounts, getLineEquivalenceSurchargeMinor } from '../invoicing/invoicing.models';

type Line = { quantityMillis: number; unitPriceMinor: number; discountRateBps: number; discountMinor?: number; taxRateBps: number };

/** An issued invoice counted as income (issued, sent or paid) */
export type TaxableIssuedInvoice = { issueDate: Date; withholdingMinor: number; equivalenceSurcharge?: boolean; items: Line[] };

/** A received invoice counted as expense. The identifying fields list it in the withholdings by supplier (a simulated purchase has none) */
export type TaxablePurchaseInvoice = {
  issueDate: Date;
  category: ExpenseCategory;
  supplierId: string;
  withholdingMinor: number;
  items: (Line & { deductibleRateBps: number })[];
  id?: string;
  number?: string;
  withholdingRateBps?: number;
  supplierName?: string;
  supplierTaxId?: string | null;
};

export type TaxProfile = { legalForm: LegalForm | null; vatRegime: VatRegime; incomeTaxMethod: IncomeTaxMethod; lastCorporateTaxQuotaMinor: number | null };

export function getQuarterPeriod({ year, quarter }: { year: number; quarter: Quarter }) {
  return {
    yearStart: new Date(Date.UTC(year, 0, 1)),
    start: new Date(Date.UTC(year, (quarter - 1) * 3, 1)),
    // Exclusive end: the first day of the next quarter
    end: new Date(Date.UTC(year, quarter * 3, 1)),
  };
}

// A deadline falling on a weekend moves to the next Monday. Bank holidays are not known here, the AEAT calendar remains the reference.
export function moveToBusinessDay({ date }: { date: Date }) {
  const day = date.getUTCDay();
  const offset = day === 6 ? 2 : day === 0 ? 1 : 0;

  return new Date(date.getTime() + offset * 24 * 60 * 60 * 1000);
}

export function getQuarterlyDeadline({ model, year, quarter, rules }: { model: Exclude<TaxModel, '202'>; year: number; quarter: Quarter; rules: SpanishTaxRules }) {
  const { dayOfFollowingMonth, fourthQuarterDayOfJanuary } = rules.quarterlyDeadlines[model];
  const date = quarter === 4
    ? new Date(Date.UTC(year + 1, 0, fourthQuarterDayOfJanuary))
    : new Date(Date.UTC(year, quarter * 3, dayOfFollowingMonth));

  return moveToBusinessDay({ date });
}

export function getCorporateTaxInstalments({ year, rules, lastCorporateTaxQuotaMinor }: { year: number; rules: SpanishTaxRules; lastCorporateTaxQuotaMinor: number | null }) {
  const amountMinor = lastCorporateTaxQuotaMinor === null ? null : Math.round(Math.max(lastCorporateTaxQuotaMinor, 0) * rules.corporateTax202.quotaRateBps / 10_000);

  return rules.corporateTax202.filingMonths.map((month, index) => ({
    period: index + 1,
    dueDate: moveToBusinessDay({ date: new Date(Date.UTC(year, month - 1, 20)) }),
    amountMinor,
  }));
}

const isWithin = (date: Date, { start, end }: { start: Date; end: Date }) => date >= start && date < end;

// Model 303: VAT charged on the issued invoices of the quarter minus the deductible VAT of the received ones
export function computeVatReturn({ issuedInvoices, purchaseInvoices, period, quarter }: { issuedInvoices: TaxableIssuedInvoice[]; purchaseInvoices: TaxablePurchaseInvoice[]; period: { start: Date; end: Date }; quarter: Quarter }) {
  const outputByRate = new Map<number, { baseMinor: number; taxMinor: number; equivalenceSurchargeMinor: number }>();

  for (const invoice of issuedInvoices.filter(({ issueDate }) => isWithin(issueDate, period))) {
    for (const item of invoice.items) {
      const { netMinor, taxMinor } = getLineAmounts(item);
      // The surcharge charged to retailer customers is paid in the 303 with the VAT
      const equivalenceSurchargeMinor = invoice.equivalenceSurcharge === true ? getLineEquivalenceSurchargeMinor({ netMinor, taxRateBps: item.taxRateBps }) : 0;
      const current = outputByRate.get(item.taxRateBps) ?? { baseMinor: 0, taxMinor: 0, equivalenceSurchargeMinor: 0 };
      outputByRate.set(item.taxRateBps, { baseMinor: current.baseMinor + netMinor, taxMinor: current.taxMinor + taxMinor, equivalenceSurchargeMinor: current.equivalenceSurchargeMinor + equivalenceSurchargeMinor });
    }
  }

  const input = purchaseInvoices.filter(({ issueDate }) => isWithin(issueDate, period)).flatMap(({ items }) => items).reduce((sums, item) => {
    const { netMinor, taxMinor } = getLineAmounts(item);
    return {
      baseMinor: sums.baseMinor + netMinor,
      taxMinor: sums.taxMinor + taxMinor,
      deductibleTaxMinor: sums.deductibleTaxMinor + Math.round(taxMinor * item.deductibleRateBps / 10_000),
    };
  }, { baseMinor: 0, taxMinor: 0, deductibleTaxMinor: 0 });

  const output = [...outputByRate.entries()].map(([rateBps, amounts]) => ({ rateBps, ...amounts })).toSorted((a, b) => b.rateBps - a.rateBps);
  const outputTaxMinor = output.reduce((sum, { taxMinor }) => sum + taxMinor, 0);
  const outputEquivalenceSurchargeMinor = output.reduce((sum, { equivalenceSurchargeMinor }) => sum + equivalenceSurchargeMinor, 0);
  const resultMinor = outputTaxMinor + outputEquivalenceSurchargeMinor - input.deductibleTaxMinor;

  return {
    output,
    outputBaseMinor: output.reduce((sum, { baseMinor }) => sum + baseMinor, 0),
    outputTaxMinor,
    outputEquivalenceSurchargeMinor,
    inputBaseMinor: input.baseMinor,
    inputTaxMinor: input.taxMinor,
    deductibleTaxMinor: input.deductibleTaxMinor,
    resultMinor,
    // A negative result is carried forward, except in the last quarter where a refund can be asked
    outcome: resultMinor > 0 ? 'pay' as const : resultMinor === 0 ? 'zero' as const : quarter === 4 ? 'refund_or_compensate' as const : 'compensate' as const,
  };
}

// Model 130: 20% of the year to date net income, minus the withholdings already paid by the customers and the
// instalments of the previous quarters of the year
export function computeIncomeTaxInstalment({ issuedInvoices, purchaseInvoices, year, quarter, incomeTaxMethod, rules }: { issuedInvoices: TaxableIssuedInvoice[]; purchaseInvoices: TaxablePurchaseInvoice[]; year: number; quarter: Quarter; incomeTaxMethod: IncomeTaxMethod; rules: SpanishTaxRules }) {
  const computeUntil = (untilQuarter: Quarter): { incomeMinor: number; expensesMinor: number; difficultExpensesMinor: number; netIncomeMinor: number; grossInstalmentMinor: number; withholdingsMinor: number; previousInstalmentsMinor: number; resultMinor: number } => {
    const range = { start: getQuarterPeriod({ year, quarter: 1 }).yearStart, end: getQuarterPeriod({ year, quarter: untilQuarter }).end };

    const issued = issuedInvoices.filter(({ issueDate }) => isWithin(issueDate, range));
    const incomeMinor = issued.flatMap(({ items }) => items).reduce((sum, item) => sum + getLineAmounts(item).netMinor, 0);
    const withholdingsMinor = issued.reduce((sum, { withholdingMinor }) => sum + withholdingMinor, 0);

    // The non deductible part of the VAT of an expense is an expense too
    const expensesMinor = purchaseInvoices.filter(({ issueDate }) => isWithin(issueDate, range)).flatMap(({ items }) => items).reduce((sum, item) => {
      const { netMinor, taxMinor } = getLineAmounts(item);
      return sum + netMinor + taxMinor - Math.round(taxMinor * item.deductibleRateBps / 10_000);
    }, 0);

    const previousNetIncomeMinor = incomeMinor - expensesMinor;
    const difficultExpensesMinor = incomeTaxMethod === 'direct_simplified'
      ? Math.min(Math.round(Math.max(previousNetIncomeMinor, 0) * rules.incomeTax130.difficultExpensesRateBps / 10_000), rules.incomeTax130.difficultExpensesYearlyCapMinor)
      : 0;
    const netIncomeMinor = previousNetIncomeMinor - difficultExpensesMinor;
    const grossInstalmentMinor = Math.round(Math.max(netIncomeMinor, 0) * rules.incomeTax130.rateBps / 10_000);

    // Only the positive results of the previous quarters were paid and can be deducted
    const previousInstalmentsMinor = untilQuarter === 1
      ? 0
      : ([1, 2, 3] as const).filter(previousQuarter => previousQuarter < untilQuarter).reduce((sum, previousQuarter) => sum + computeUntil(previousQuarter).resultMinor, 0);

    return {
      incomeMinor,
      expensesMinor,
      difficultExpensesMinor,
      netIncomeMinor,
      grossInstalmentMinor,
      withholdingsMinor,
      previousInstalmentsMinor,
      resultMinor: Math.max(grossInstalmentMinor - withholdingsMinor - previousInstalmentsMinor, 0),
    };
  };

  return { rateBps: rules.incomeTax130.rateBps, ...computeUntil(quarter) };
}

// Models 111 (professionals) and 115 (rents): the withholdings the organization applied on the invoices it received,
// paid to the tax agency on behalf of its suppliers
export function computeWithholdingsReturns({ purchaseInvoices, period }: { purchaseInvoices: TaxablePurchaseInvoice[]; period: { start: Date; end: Date } }) {
  const withWithholding = purchaseInvoices.filter(({ issueDate, withholdingMinor }) => isWithin(issueDate, period) && withholdingMinor > 0);

  const baseOf = (invoice: TaxablePurchaseInvoice) => invoice.items.reduce((sum, item) => sum + getLineAmounts(item).netMinor, 0);

  // The tax agency asks what was withheld to each payee: the quarter total of every supplier, with its invoices,
  // so nobody has to go through them one by one when filing (and the yearly model 190 gets the same figures)
  const byPayee = (invoices: TaxablePurchaseInvoice[]) => [...Map.groupBy(invoices, ({ supplierId }) => supplierId).entries()]
    .map(([supplierId, payeeInvoices]) => ({
      supplierId,
      name: payeeInvoices[0]?.supplierName ?? '',
      taxId: payeeInvoices[0]?.supplierTaxId ?? null,
      baseMinor: payeeInvoices.reduce((sum, invoice) => sum + baseOf(invoice), 0),
      amountMinor: payeeInvoices.reduce((sum, { withholdingMinor }) => sum + withholdingMinor, 0),
      invoices: payeeInvoices.map(invoice => ({
        id: invoice.id ?? '',
        number: invoice.number ?? '',
        issueDate: invoice.issueDate,
        baseMinor: baseOf(invoice),
        rateBps: invoice.withholdingRateBps ?? 0,
        amountMinor: invoice.withholdingMinor,
      })),
    }))
    .toSorted((a, b) => b.amountMinor - a.amountMinor || a.name.localeCompare(b.name));

  const summarize = (invoices: TaxablePurchaseInvoice[]) => ({
    payeesCount: new Set(invoices.map(({ supplierId }) => supplierId)).size,
    baseMinor: invoices.reduce((sum, invoice) => sum + baseOf(invoice), 0),
    amountMinor: invoices.reduce((sum, { withholdingMinor }) => sum + withholdingMinor, 0),
    payees: byPayee(invoices),
  });

  return {
    professionals111: summarize(withWithholding.filter(({ category }) => category !== 'rent')),
    rents115: summarize(withWithholding.filter(({ category }) => category === 'rent')),
  };
}

export function getApplicableModels({ profile, withholdings }: { profile: TaxProfile; withholdings: ReturnType<typeof computeWithholdingsReturns> }) {
  return {
    303: profile.vatRegime === 'general',
    130: profile.legalForm === 'self_employed' && profile.incomeTaxMethod !== 'modules',
    111: withholdings.professionals111.amountMinor > 0,
    115: withholdings.rents115.amountMinor > 0,
    202: profile.legalForm === 'company',
  } satisfies Record<TaxModel, boolean>;
}
