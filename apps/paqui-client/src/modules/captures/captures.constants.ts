import type { CapturePurpose } from './captures.types';
import type { TranslationKeys } from '@/modules/i18n/locales.types';

// What the computer and the phone say, depending on what the photos are for
export const CAPTURE_TEXT_I18N_KEYS = {
  purchase: { dialog: 'captures.dialog.description.purchase', title: 'captures.page.title.purchase', tip: 'captures.page.tip.purchase' },
  product_image: { dialog: 'captures.dialog.description.product', title: 'captures.page.title.product', tip: 'captures.page.tip.product' },
  delivery_note: { dialog: 'captures.dialog.description.delivery-note', title: 'captures.page.title.delivery-note', tip: 'captures.page.tip.delivery-note' },
} as const satisfies Record<CapturePurpose, Record<'dialog' | 'title' | 'tip', TranslationKeys>>;
