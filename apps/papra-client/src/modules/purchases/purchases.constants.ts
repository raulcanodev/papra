import type { TranslationKeys } from '../i18n/locales.types';
import type { ExpenseCategory, PurchaseInvoiceStatus } from './purchases.types';

export const EXPENSE_CATEGORIES: ExpenseCategory[] = ['goods', 'supplies', 'rent', 'professional_services', 'software', 'marketing', 'travel', 'vehicle', 'insurance', 'bank_fees', 'taxes_and_fees', 'other'];

export const EXPENSE_CATEGORY_LABEL_I18N_KEYS = {
  goods: 'purchases.categories.goods',
  supplies: 'purchases.categories.supplies',
  rent: 'purchases.categories.rent',
  professional_services: 'purchases.categories.professional_services',
  software: 'purchases.categories.software',
  marketing: 'purchases.categories.marketing',
  travel: 'purchases.categories.travel',
  vehicle: 'purchases.categories.vehicle',
  insurance: 'purchases.categories.insurance',
  bank_fees: 'purchases.categories.bank_fees',
  taxes_and_fees: 'purchases.categories.taxes_and_fees',
  other: 'purchases.categories.other',
} as const satisfies Record<ExpenseCategory, TranslationKeys>;

export const PURCHASE_STATUS_LABEL_I18N_KEYS = {
  pending: 'purchases.status.pending',
  paid: 'purchases.status.paid',
} as const satisfies Record<PurchaseInvoiceStatus, TranslationKeys>;

export const PURCHASE_STATUS_BADGE_CLASSES = {
  pending: 'bg-orange-500/12 text-orange-700 dark:text-orange-300',
  paid: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
} as const satisfies Record<PurchaseInvoiceStatus, string>;

// Mirrors the server: what the AI can read
export const EXTRACTABLE_FILE_ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp';
