import type { InvoiceStatus } from '../invoicing.types';
import type { getProformaState } from './invoice-row-actions.models';
import type { TranslationKeys } from '@/modules/i18n/locales.types';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { cn } from '@/modules/shared/style/cn';

export const invoiceStatusLabelKeys = { draft: 'invoicing.status.draft', issuing: 'invoicing.status.issuing', issued: 'invoicing.status.issued', sent: 'invoicing.status.sent', paid: 'invoicing.status.paid', void: 'invoicing.status.void', proforma: 'invoicing.status.proforma' } as const satisfies Record<InvoiceStatus, TranslationKeys>;

type ProformaState = ReturnType<typeof getProformaState>;

// Each step of an invoice told apart at a glance in a list: a colour and an icon, not only the word
const INVOICE_STATUS_STYLES = {
  draft: { class: 'bg-zinc-500/12 text-zinc-700 dark:text-zinc-300', icon: 'i-tabler-pencil' },
  issuing: { class: 'bg-sky-500/12 text-sky-700 dark:text-sky-300', icon: 'i-tabler-loader-2 animate-spin' },
  issued: { class: 'bg-blue-500/12 text-blue-700 dark:text-blue-300', icon: 'i-tabler-file-check' },
  sent: { class: 'bg-violet-500/12 text-violet-700 dark:text-violet-300', icon: 'i-tabler-send' },
  paid: { class: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300', icon: 'i-tabler-circle-check' },
  void: { class: 'bg-red-500/12 text-red-700 dark:text-red-300', icon: 'i-tabler-ban' },
  proforma: { class: 'bg-amber-500/12 text-amber-700 dark:text-amber-300', icon: 'i-tabler-file-description' },
} as const satisfies Record<InvoiceStatus, { class: string; icon: string }>;

const PROFORMA_STATE_STYLES = {
  draft: { label: 'invoicing.status.draft', class: INVOICE_STATUS_STYLES.proforma.class, icon: INVOICE_STATUS_STYLES.proforma.icon },
  sent: { label: 'invoicing.status.sent', class: INVOICE_STATUS_STYLES.sent.class, icon: INVOICE_STATUS_STYLES.sent.icon },
  converted: { label: 'invoicing.proformas.state.converted', class: INVOICE_STATUS_STYLES.paid.class, icon: INVOICE_STATUS_STYLES.paid.icon },
} as const satisfies Record<ProformaState, { label: TranslationKeys; class: string; icon: string }>;

export function InvoiceStatusBadge(props: { status: InvoiceStatus }) {
  const { t } = useI18n();
  const style = () => INVOICE_STATUS_STYLES[props.status];

  return (
    <span class={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', style().class)}>
      <span class={cn('size-3.5 shrink-0', style().icon)} aria-hidden="true" />
      {t(invoiceStatusLabelKeys[props.status])}
    </span>
  );
}

/** A proforma, with the number of its invoice once it has one */
export function ProformaStateBadge(props: { state: ProformaState; invoiceNumber?: string | null }) {
  const { t } = useI18n();
  const style = () => PROFORMA_STATE_STYLES[props.state];

  return (
    <span class={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', style().class)}>
      <span class={cn('size-3.5 shrink-0', style().icon)} aria-hidden="true" />
      {t(style().label)}
      {props.invoiceNumber ? ` · ${props.invoiceNumber}` : ''}
    </span>
  );
}
