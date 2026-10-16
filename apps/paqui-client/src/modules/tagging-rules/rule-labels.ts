import type { TranslationKeys } from '@/modules/i18n/locales.types';

export const documentFieldLabelKeys: Record<string, TranslationKeys> = {
  name: 'tagging-rules.wizard.field.document-name',
  content: 'tagging-rules.wizard.field.document-content',
};

export const transactionFieldLabelKeys: Record<string, TranslationKeys> = {
  counterparty: 'tagging-rules.wizard.field.counterparty',
  description: 'tagging-rules.wizard.field.description',
  amount: 'tagging-rules.wizard.field.amount',
};

export const ruleOperatorLabelKeys: Record<string, TranslationKeys> = {
  equal: 'tagging-rules.operator.equals',
  equals: 'tagging-rules.operator.equals',
  not_equal: 'tagging-rules.operator.not-equals',
  contains: 'tagging-rules.operator.contains',
  not_contains: 'tagging-rules.operator.not-contains',
  starts_with: 'tagging-rules.operator.starts-with',
  ends_with: 'tagging-rules.operator.ends-with',
  gt: 'tagging-rules.wizard.operator.greater-than',
  lt: 'tagging-rules.wizard.operator.less-than',
};
