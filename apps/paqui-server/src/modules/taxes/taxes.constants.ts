// Self-employed (autónomo) or company (sociedad): decides which quarterly models apply
export const LEGAL_FORMS = ['self_employed', 'company'] as const;
export type LegalForm = typeof LEGAL_FORMS[number];

// Equivalence surcharge (retailers) and exempt activities do not file the quarterly VAT return
export const VAT_REGIMES = ['general', 'equivalence_surcharge', 'exempt'] as const;
export type VatRegime = typeof VAT_REGIMES[number];

// How a self-employed computes the income tax: the quarterly model 130 applies to the direct estimation methods,
// the modules (objective estimation) method files the model 131 instead
export const INCOME_TAX_METHODS = ['direct_simplified', 'direct_normal', 'modules'] as const;
export type IncomeTaxMethod = typeof INCOME_TAX_METHODS[number];

export const QUARTERS = [1, 2, 3, 4] as const;
export type Quarter = typeof QUARTERS[number];

export const TAX_MODELS = ['303', '130', '111', '115', '202'] as const;
export type TaxModel = typeof TAX_MODELS[number];
