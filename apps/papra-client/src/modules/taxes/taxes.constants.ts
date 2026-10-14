import type { TranslationKeys } from '../i18n/locales.types';
import type { IncomeTaxMethod, LegalForm, VatRegime } from './taxes.types';

export const LEGAL_FORMS: LegalForm[] = ['self_employed', 'company'];
export const VAT_REGIMES: VatRegime[] = ['general', 'equivalence_surcharge', 'exempt'];
export const INCOME_TAX_METHODS: IncomeTaxMethod[] = ['direct_simplified', 'direct_normal', 'modules'];

export const LEGAL_FORM_LABEL_I18N_KEYS = {
  self_employed: 'taxes.legal-form.self_employed',
  company: 'taxes.legal-form.company',
} as const satisfies Record<LegalForm, TranslationKeys>;

export const VAT_REGIME_LABEL_I18N_KEYS = {
  general: 'taxes.vat-regime.general',
  equivalence_surcharge: 'taxes.vat-regime.equivalence_surcharge',
  exempt: 'taxes.vat-regime.exempt',
} as const satisfies Record<VatRegime, TranslationKeys>;

export const INCOME_TAX_METHOD_LABEL_I18N_KEYS = {
  direct_simplified: 'taxes.income-tax-method.direct_simplified',
  direct_normal: 'taxes.income-tax-method.direct_normal',
  modules: 'taxes.income-tax-method.modules',
} as const satisfies Record<IncomeTaxMethod, TranslationKeys>;
