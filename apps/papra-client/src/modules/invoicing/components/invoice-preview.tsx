import type { FiscalProfile, InvoiceBranding, InvoiceItemInput } from '../invoicing.types';
import type { Contact } from '@/modules/contacts/contacts.types';
import { For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';

export function getLineNetMinor(item: InvoiceItemInput) {
  const gross = Math.round(item.quantityMillis * item.unitPriceMinor / 1_000);
  return gross - Math.round(gross * item.discountRateBps / 10_000);
}

export function getLineTaxMinor(item: InvoiceItemInput) {
  return Math.round(getLineNetMinor(item) * item.taxRateBps / 10_000);
}

function formatMoney(minor: number, currency: string, locale?: string) {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

function formatDate(value: string, locale?: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(date);
}

type Party = Pick<Contact, 'name' | 'email' | 'taxId' | 'addressLine1' | 'addressLine2' | 'postalCode' | 'city' | 'region' | 'country'>;

function PartyLines(props: { party?: Party | null; name?: string }) {
  const lines = () => {
    const party = props.party;
    if (!party) {
      return [];
    }

    return [
      party.taxId,
      party.addressLine1,
      party.addressLine2,
      [party.postalCode, party.city].filter(Boolean).join(' '),
      party.region,
      party.country,
      party.email,
    ].filter((line): line is string => Boolean(line));
  };

  return (
    <div class="space-y-0.5">
      <Show when={props.name ?? props.party?.name}>
        {name => <div class="font-medium text-zinc-900">{name()}</div>}
      </Show>
      <For each={lines()}>{line => <div>{line}</div>}</For>
    </div>
  );
}

/**
 * Live, document-like preview of an invoice being edited. It always renders as white paper,
 * whatever the app theme, so it reads like the PDF that will be produced.
 */
export function InvoicePreview(props: {
  number: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  items: InvoiceItemInput[];
  notes: string;
  customer?: Party | null;
  profile?: FiscalProfile | null;
  branding?: InvoiceBranding | null;
}) {
  const { t, getLocale } = useI18n();
  const money = (minor: number) => formatMoney(minor, props.currency, getLocale());
  const subtotal = () => props.items.reduce((sum, item) => sum + getLineNetMinor(item), 0);
  const tax = () => props.items.reduce((sum, item) => sum + getLineTaxMinor(item), 0);
  const total = () => subtotal() + tax();
  const accent = () => props.branding?.accentColor ?? '#18181b';
  const visibleItems = () => props.items.filter(item => item.description.trim() || item.unitPriceMinor > 0);
  const issuerName = () => props.profile?.legalName ?? t('invoicing.preview.your-company');

  return (
    <div class="flex aspect-[210/297] w-full flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white p-8 text-[11px] leading-relaxed text-zinc-500 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(0_0_0/0.12)] dark:border-white/10">
      <div class="flex items-start justify-between gap-6">
        <div class="flex items-center gap-2.5">
          <span class="flex size-8 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ background: accent() }}>
            {issuerName().trim().charAt(0).toUpperCase()}
          </span>
          <span class="text-lg font-medium text-zinc-900">{t('invoicing.preview.invoice')}</span>
        </div>
        <div class="grid grid-cols-2 gap-x-4 text-[10px]">
          <span class="font-medium text-zinc-900">{t('invoicing.preview.number')}</span>
          <span class="font-medium text-zinc-900">{t('invoicing.preview.issue-date')}</span>
          <span>{props.number}</span>
          <span>{formatDate(props.issueDate, getLocale())}</span>
        </div>
      </div>

      <div class="mt-8 grid grid-cols-2 gap-6">
        <div>
          <div class="mb-1 text-[10px] font-medium text-zinc-900">{t('invoicing.preview.billed-to')}</div>
          <Show when={props.customer} fallback={<div class="text-zinc-400">—</div>}>
            <PartyLines party={props.customer} />
          </Show>
        </div>
        <div>
          <div class="mb-1 text-[10px] font-medium text-zinc-900">{t('invoicing.preview.issued-by')}</div>
          <PartyLines party={props.profile ? { ...props.profile, name: props.profile.legalName } : null} name={issuerName()} />
        </div>
      </div>

      <div class="mt-8 text-sm font-medium text-zinc-900">
        {t('invoicing.preview.due-by', { amount: money(total()), date: formatDate(props.dueDate, getLocale()) })}
      </div>

      <table class="mt-5 w-full">
        <thead>
          <tr class="border-b border-zinc-200 text-left text-[10px] text-zinc-900">
            <th class="pb-2 font-medium">{t('invoicing.preview.table.item')}</th>
            <th class="pb-2 text-right font-medium">{t('invoicing.preview.table.quantity')}</th>
            <th class="pb-2 text-right font-medium">{t('invoicing.preview.table.unit-price')}</th>
            <th class="pb-2 text-right font-medium">{t('invoicing.preview.table.tax')}</th>
            <th class="pb-2 text-right font-medium">{t('invoicing.preview.table.total')}</th>
          </tr>
        </thead>
        <tbody>
          <For each={visibleItems()}>
            {item => (
              <tr class="border-b border-zinc-100 align-top">
                <td class="py-2 pr-2 text-zinc-900">{item.description || '—'}</td>
                <td class="py-2 text-right tabular-nums">{item.quantityMillis / 1_000}</td>
                <td class="py-2 text-right tabular-nums">{money(item.unitPriceMinor)}</td>
                <td class="py-2 text-right tabular-nums">{`${item.taxRateBps / 100}%`}</td>
                <td class="py-2 text-right tabular-nums text-zinc-900">{money(getLineNetMinor(item))}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>

      <div class="mt-4 ml-auto w-1/2 space-y-1.5">
        <div class="flex justify-between">
          <span>{t('invoicing.preview.subtotal')}</span>
          <span class="tabular-nums">{money(subtotal())}</span>
        </div>
        <div class="flex justify-between">
          <span>{t('invoicing.preview.tax')}</span>
          <span class="tabular-nums">{money(tax())}</span>
        </div>
        <div class="flex justify-between border-t border-zinc-200 pt-2.5 text-sm font-semibold text-zinc-900">
          <span>{t('invoicing.preview.amount-due')}</span>
          <span class="tabular-nums">{money(total())}</span>
        </div>
      </div>

      <Show when={props.notes.trim()}>
        <div class="mt-8 whitespace-pre-line">{props.notes}</div>
      </Show>

      <div class="mt-auto space-y-1 pt-10 text-[10px]">
        <Show when={props.branding?.paymentDetails}>
          {details => <div class="whitespace-pre-line">{details()}</div>}
        </Show>
        <Show when={props.branding?.footerText}>
          {footer => <div class="text-zinc-400">{footer()}</div>}
        </Show>
      </div>
    </div>
  );
}
