import type { ExpenseCategory } from '../purchases/purchases.types';

export type LegalForm = 'self_employed' | 'company';
export type VatRegime = 'general' | 'equivalence_surcharge' | 'exempt';
export type IncomeTaxMethod = 'direct_simplified' | 'direct_normal' | 'modules';
export type Quarter = 1 | 2 | 3 | 4;
export type TaxModel = '303' | '130' | '111' | '115' | '202';

type WithholdingsReturn = { payeesCount: number; baseMinor: number; amountMinor: number };

export type QuarterlyTaxReport = {
  year: number;
  quarter: Quarter;
  currency: string;
  period: { start: Date; end: Date };
  profile: { legalForm: LegalForm | null; vatRegime: VatRegime; incomeTaxMethod: IncomeTaxMethod; lastCorporateTaxQuotaMinor: number | null; isConfigured: boolean; accountantEmail: string | null };
  applicable: Record<TaxModel, boolean>;
  vat303: {
    output: { rateBps: number; baseMinor: number; taxMinor: number }[];
    outputBaseMinor: number;
    outputTaxMinor: number;
    inputBaseMinor: number;
    inputTaxMinor: number;
    deductibleTaxMinor: number;
    resultMinor: number;
    outcome: 'pay' | 'zero' | 'compensate' | 'refund_or_compensate';
  };
  incomeTax130: {
    rateBps: number;
    incomeMinor: number;
    expensesMinor: number;
    difficultExpensesMinor: number;
    netIncomeMinor: number;
    grossInstalmentMinor: number;
    withholdingsMinor: number;
    previousInstalmentsMinor: number;
    resultMinor: number;
  };
  professionals111: WithholdingsReturn;
  rents115: WithholdingsReturn;
  corporateTax202: { period: number; dueDate: Date; amountMinor: number | null }[];
  deadlines: { model: Exclude<TaxModel, '202'>; dueDate: Date }[];
  counts: { issuedInvoices: number; purchaseInvoices: number };
  simulation: null | {
    purchase: SimulatedPurchase;
    vat303ResultMinor: number;
    incomeTax130ResultMinor: number;
    vat303SavingMinor: number;
    incomeTax130SavingMinor: number;
  };
  sources: { label: string; url: string }[];
};

export type SimulatedPurchase = { baseMinor: number; taxRateBps: number; deductibleRateBps: number; category: ExpenseCategory };
