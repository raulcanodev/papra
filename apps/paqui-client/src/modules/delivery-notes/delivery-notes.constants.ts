import type { DeliveryNoteStatus } from './delivery-notes.types';
import type { TranslationKeys } from '@/modules/i18n/locales.types';

export const DELIVERY_NOTE_STATUSES = ['pending', 'invoiced'] as const satisfies DeliveryNoteStatus[];

export const DELIVERY_NOTE_STATUS_LABEL_I18N_KEYS = {
  pending: 'delivery-notes.status.pending',
  invoiced: 'delivery-notes.status.invoiced',
} as const satisfies Record<DeliveryNoteStatus, TranslationKeys>;

export const DELIVERY_NOTE_STATUS_BADGE_CLASSES = {
  pending: 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
  invoiced: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
} as const satisfies Record<DeliveryNoteStatus, string>;
