import type { TranslationKeys } from '../i18n/locales.types';
import type { DueDateBucket, InstalmentStatus, PaymentMethod } from './due-dates.types';

export const PAYMENT_METHODS: PaymentMethod[] = ['transfer', 'direct_debit', 'promissory_note', 'card', 'cash', 'other'];

export const PAYMENT_METHOD_LABEL_I18N_KEYS = {
  transfer: 'due-dates.methods.transfer',
  direct_debit: 'due-dates.methods.direct_debit',
  promissory_note: 'due-dates.methods.promissory_note',
  card: 'due-dates.methods.card',
  cash: 'due-dates.methods.cash',
  other: 'due-dates.methods.other',
} as const satisfies Record<PaymentMethod, TranslationKeys>;

export const INSTALMENT_STATUSES: InstalmentStatus[] = ['pending', 'paid', 'returned'];

export const INSTALMENT_STATUS_LABEL_I18N_KEYS = {
  pending: 'due-dates.status.pending',
  paid: 'due-dates.status.paid',
  returned: 'due-dates.status.returned',
} as const satisfies Record<InstalmentStatus, TranslationKeys>;

export const INSTALMENT_STATUS_BADGE_CLASSES = {
  pending: 'bg-orange-500/12 text-orange-700 dark:text-orange-300',
  paid: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  returned: 'bg-red-500/12 text-red-700 dark:text-red-300',
} as const satisfies Record<InstalmentStatus, string>;

export const DUE_DATE_BUCKETS: DueDateBucket[] = ['overdue', 'next_30', 'days_31_60', 'days_61_90', 'later'];

export const DUE_DATE_BUCKET_LABEL_I18N_KEYS = {
  overdue: 'due-dates.buckets.overdue',
  next_30: 'due-dates.buckets.next_30',
  days_31_60: 'due-dates.buckets.days_31_60',
  days_61_90: 'due-dates.buckets.days_61_90',
  later: 'due-dates.buckets.later',
} as const satisfies Record<DueDateBucket, TranslationKeys>;
