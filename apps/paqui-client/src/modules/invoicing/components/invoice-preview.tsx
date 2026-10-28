import type { FiscalProfile, InvoiceBranding, InvoiceItemInput } from '../invoicing.types';
import type { Contact } from '@/modules/contacts/contacts.types';
import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { getEquivalenceSurchargeRateBps } from '../invoicing.models';

function getLineGrossMinor(item: InvoiceItemInput) {
  return Math.round(item.quantityMillis * item.unitPriceMinor / 1_000);
}

// Same as the server: the fixed discount can take the line below zero, taking that amount off the rest of the invoice
export function getLineNetMinor(item: InvoiceItemInput) {
  const gross = getLineGrossMinor(item);
  return gross - Math.round(gross * item.discountRateBps / 10_000) - (item.discountMinor ?? 0);
}

// Everything taken off the line, the percentage and the fixed amount
export function getLineDiscountMinor(item: InvoiceItemInput) {
  return getLineGrossMinor(item) - getLineNetMinor(item);
}

// Same rounding as the server: the withholding is computed on the taxable base
export function getWithholdingMinor({ subtotalMinor, withholdingRateBps }: { subtotalMinor: number; withholdingRateBps: number }) {
  return Math.round(subtotalMinor * withholdingRateBps / 10_000);
}

export function getLineTaxMinor(item: InvoiceItemInput) {
  return Math.round(getLineNetMinor(item) * item.taxRateBps / 10_000);
}

// Same rounding as the server: the surcharge is on the taxable base of the line, rounded to the cent line by line
export function getLineEquivalenceSurchargeMinor(item: InvoiceItemInput) {
  return Math.round(getLineNetMinor(item) * getEquivalenceSurchargeRateBps(item) / 10_000);
}

// The surcharge by rate, as the invoice shows each rate and its amount
export function getEquivalenceSurchargeRows(items: InvoiceItemInput[]) {
  const byRate = new Map<number, number>();
  for (const item of items) {
    const rateBps = getEquivalenceSurchargeRateBps(item);
    if (rateBps > 0) {
      byRate.set(rateBps, (byRate.get(rateBps) ?? 0) + getLineEquivalenceSurchargeMinor(item));
    }
  }

  return [...byRate.entries()].toSorted(([a], [b]) => b - a).map(([rateBps, amountMinor]) => ({ rateBps, amountMinor }));
}

// An A4 page in PDF points, the size of the page the server draws
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;

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
  withholdingRateBps: number;
  equivalenceSurcharge?: boolean;
  notes: string;
  customer?: Party | null;
  profile?: FiscalProfile | null;
  branding?: InvoiceBranding | null;
}) {
  const { t, getLocale } = useI18n();
  const money = (minor: number) => formatMoney(minor, props.currency, getLocale());
  const subtotal = () => props.items.reduce((sum, item) => sum + getLineNetMinor(item), 0);
  const tax = () => props.items.reduce((sum, item) => sum + getLineTaxMinor(item), 0);
  const surchargeRows = () => (props.equivalenceSurcharge ? getEquivalenceSurchargeRows(props.items) : []);
  const total = () => subtotal() + tax() + surchargeRows().reduce((sum, { amountMinor }) => sum + amountMinor, 0);
  const withholding = () => getWithholdingMinor({ subtotalMinor: subtotal(), withholdingRateBps: props.withholdingRateBps });
  const amountDue = () => total() - withholding();
  const accent = () => props.branding?.accentColor ?? '#18181b';
  const visibleItems = () => props.items.filter(item => item.description.trim() || item.unitPriceMinor > 0);
  const issuerName = () => props.profile?.legalName ?? t('invoicing.preview.your-company');

  // The page is laid out at its real size and scaled as a whole to the width available,
  // so the text keeps its proportion to the paper on a phone as on a wide screen
  const [scale, setScale] = createSignal(1);
  const [pageHeight, setPageHeight] = createSignal(PAGE_HEIGHT);
  let frameRef: HTMLDivElement | undefined;
  let pageRef: HTMLDivElement | undefined;

  onMount(() => {
    const observer = new ResizeObserver(() => {
      setScale((frameRef?.clientWidth ?? PAGE_WIDTH) / PAGE_WIDTH);
      setPageHeight(pageRef?.offsetHeight ?? PAGE_HEIGHT);
    });
    observer.observe(frameRef!);
    observer.observe(pageRef!);
    onCleanup(() => observer.disconnect());
  });

  return (
    <div
      ref={frameRef}
      class="w-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(0_0_0/0.12)] dark:border-white/10"
      style={{ 'height': `${pageHeight() * scale()}px`, 'box-sizing': 'content-box' }}
    >
      <div
        ref={pageRef}
        class="flex origin-top-left flex-col p-12 text-[11px] leading-relaxed text-zinc-500"
        style={{ 'width': `${PAGE_WIDTH}px`, 'min-height': `${PAGE_HEIGHT}px`, 'transform': `scale(${scale()})` }}
      >
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
          {t('invoicing.preview.due-by', { amount: money(amountDue()), date: formatDate(props.dueDate, getLocale()) })}
        </div>

        <table class="mt-5 w-full">
          <thead>
            <tr class="border-b border-zinc-200 text-left text-[10px] text-zinc-900">
              <th class="pb-2 font-medium">{t('invoicing.preview.table.item')}</th>
              <th class="whitespace-nowrap pb-2 pl-3 text-right font-medium">{t('invoicing.preview.table.quantity')}</th>
              <th class="whitespace-nowrap pb-2 pl-3 text-right font-medium">{t('invoicing.preview.table.unit-price')}</th>
              <th class="whitespace-nowrap pb-2 pl-3 text-right font-medium">{t('invoicing.preview.table.tax')}</th>
              <th class="whitespace-nowrap pb-2 pl-3 text-right font-medium">{t('invoicing.preview.table.total')}</th>
            </tr>
          </thead>
          <tbody>
            <For each={visibleItems()}>
              {item => (
                <tr class="border-b border-zinc-100 align-top">
                  <td class="py-2 pr-2 text-zinc-900">
                    {item.description || '—'}
                    <Show when={getLineDiscountMinor(item) !== 0}>
                      <div class="text-zinc-500">
                        {[t('invoicing.preview.table.discount'), item.discountRateBps > 0 ? `${item.discountRateBps / 100}%` : null, money(-getLineDiscountMinor(item))].filter(Boolean).join(' ')}
                      </div>
                    </Show>
                  </td>
                  <td class="whitespace-nowrap py-2 pl-3 text-right tabular-nums">{item.quantityMillis / 1_000}</td>
                  <td class="whitespace-nowrap py-2 pl-3 text-right tabular-nums">{money(item.unitPriceMinor)}</td>
                  <td class="whitespace-nowrap py-2 pl-3 text-right tabular-nums">{`${item.taxRateBps / 100}%`}</td>
                  <td class="whitespace-nowrap py-2 pl-3 text-right tabular-nums text-zinc-900">{money(getLineNetMinor(item))}</td>
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
          <For each={surchargeRows()}>
            {row => (
              <div class="flex justify-between">
                <span>{t('invoicing.preview.equivalence-surcharge', { rate: row.rateBps / 100 })}</span>
                <span class="tabular-nums">{money(row.amountMinor)}</span>
              </div>
            )}
          </For>
          <Show when={withholding() > 0}>
            <div class="flex justify-between border-t border-zinc-200 pt-2 font-medium text-zinc-900">
              <span>{t('invoicing.preview.total')}</span>
              <span class="tabular-nums">{money(total())}</span>
            </div>
            <div class="flex justify-between">
              <span>{t('invoicing.preview.withholding', { rate: props.withholdingRateBps / 100 })}</span>
              <span class="tabular-nums">{`-${money(withholding())}`}</span>
            </div>
          </Show>
          <div class="flex justify-between border-t border-zinc-200 pt-2.5 text-sm font-semibold text-zinc-900">
            <span>{t('invoicing.preview.amount-due')}</span>
            <span class="tabular-nums">{money(amountDue())}</span>
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
    </div>
  );
}
