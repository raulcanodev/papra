import type { ExpenseCategory } from '../purchases/purchases.constants';
import type { Quarter } from './taxes.constants';
import type { TaxablePurchaseInvoice, TaxProfile } from './taxes.models';
import type { TaxesRepository } from './taxes.repository';
import { getSpanishTaxRules } from './rules/spain.tax-rules';
import { computeIncomeTaxInstalment, computeVatReturn, computeWithholdingsReturns, getApplicableModels, getCorporateTaxInstalments, getQuarterlyDeadline, getQuarterPeriod } from './taxes.models';

export type SimulatedPurchase = { baseMinor: number; taxRateBps: number; deductibleRateBps: number; category: ExpenseCategory };

const DEFAULT_TAX_PROFILE: TaxProfile = { legalForm: null, vatRegime: 'general', incomeTaxMethod: 'direct_simplified', lastCorporateTaxQuotaMinor: null };

function computeTaxes({ profile, issuedInvoices, purchaseInvoices, year, quarter }: { profile: TaxProfile; issuedInvoices: Parameters<typeof computeVatReturn>[0]['issuedInvoices']; purchaseInvoices: TaxablePurchaseInvoice[]; year: number; quarter: Quarter }) {
  const rules = getSpanishTaxRules({ year });
  const period = getQuarterPeriod({ year, quarter });
  const withholdings = computeWithholdingsReturns({ purchaseInvoices, period });

  return {
    applicable: getApplicableModels({ profile, withholdings }),
    vat303: computeVatReturn({ issuedInvoices, purchaseInvoices, period, quarter }),
    incomeTax130: computeIncomeTaxInstalment({ issuedInvoices, purchaseInvoices, year, quarter, incomeTaxMethod: profile.incomeTaxMethod, rules }),
    professionals111: withholdings.professionals111,
    rents115: withholdings.rents115,
  };
}

// The quarterly taxes estimation of an organization, optionally with a purchase it is considering, to see how much it lowers them
export async function buildQuarterlyTaxReport({ organizationId, year, quarter, simulatedPurchase, taxesRepository }: { organizationId: string; year: number; quarter: Quarter; simulatedPurchase?: SimulatedPurchase; taxesRepository: TaxesRepository }) {
  const rules = getSpanishTaxRules({ year });
  const period = getQuarterPeriod({ year, quarter });
  const { profile: storedProfile } = await taxesRepository.getTaxProfile({ organizationId });
  const profile: TaxProfile = storedProfile ? { legalForm: storedProfile.legalForm, vatRegime: storedProfile.vatRegime, incomeTaxMethod: storedProfile.incomeTaxMethod, lastCorporateTaxQuotaMinor: storedProfile.lastCorporateTaxQuotaMinor } : DEFAULT_TAX_PROFILE;
  const currency = storedProfile?.currency ?? 'EUR';

  // The income tax is cumulative over the year: everything from January 1st to the end of the quarter
  const { issuedInvoices, purchaseInvoices } = await taxesRepository.getTaxableDocuments({ organizationId, from: period.yearStart, to: period.end, currency });

  const taxes = computeTaxes({ profile, issuedInvoices, purchaseInvoices, year, quarter });

  const simulation = simulatedPurchase === undefined
    ? null
    : (() => {
        const hypothetical: TaxablePurchaseInvoice = {
          // Last day of the quarter, so it counts in the quarter whatever today is
          issueDate: new Date(period.end.getTime() - 24 * 60 * 60 * 1000),
          category: simulatedPurchase.category,
          supplierId: 'simulation',
          withholdingMinor: 0,
          items: [{ quantityMillis: 1_000, unitPriceMinor: simulatedPurchase.baseMinor, discountRateBps: 0, taxRateBps: simulatedPurchase.taxRateBps, deductibleRateBps: simulatedPurchase.deductibleRateBps }],
        };
        const simulated = computeTaxes({ profile, issuedInvoices, purchaseInvoices: [...purchaseInvoices, hypothetical], year, quarter });

        return {
          purchase: simulatedPurchase,
          vat303ResultMinor: simulated.vat303.resultMinor,
          incomeTax130ResultMinor: simulated.incomeTax130.resultMinor,
          // What the purchase saves this quarter, positive when taxes go down
          vat303SavingMinor: taxes.vat303.resultMinor - simulated.vat303.resultMinor,
          incomeTax130SavingMinor: taxes.applicable[130] ? taxes.incomeTax130.resultMinor - simulated.incomeTax130.resultMinor : 0,
        };
      })();

  return {
    report: {
      year,
      quarter,
      currency,
      period: { start: period.start, end: period.end },
      profile: { ...profile, isConfigured: storedProfile !== null && storedProfile.legalForm !== null },
      ...taxes,
      corporateTax202: getCorporateTaxInstalments({ year, rules, lastCorporateTaxQuotaMinor: profile.lastCorporateTaxQuotaMinor }),
      deadlines: (['303', '130', '111', '115'] as const).map(model => ({ model, dueDate: getQuarterlyDeadline({ model, year, quarter, rules }) })),
      counts: {
        issuedInvoices: issuedInvoices.filter(({ issueDate }) => issueDate >= period.start).length,
        purchaseInvoices: purchaseInvoices.filter(({ issueDate }) => issueDate >= period.start).length,
      },
      simulation,
      sources: rules.sources,
    },
    issuedInvoices,
    purchaseInvoices,
  };
}
