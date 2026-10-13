import type { TranslationKeys } from '@/modules/i18n/locales.types';

export const transactionClassifications = ['expense', 'income', 'owner_transfer', 'internal_transfer'] as const;

export type TransactionClassification = typeof transactionClassifications[number];

export const classificationLabelKeys = {
  expense: 'finances.category.expense',
  income: 'finances.category.income',
  owner_transfer: 'finances.category.owner_transfer',
  internal_transfer: 'finances.category.internal_transfer',
} as const satisfies Record<TransactionClassification, TranslationKeys>;

export function getClassificationLabelKey(classification: string): TranslationKeys | undefined {
  return classificationLabelKeys[classification as TransactionClassification];
}
