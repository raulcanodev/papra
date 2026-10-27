/* eslint-disable style/max-statements-per-line */
import type { CalendarEntry, CalendarFeedEvent, PublicCalendarEvent } from '../calendar.types';
import type { Invoice } from '@/modules/invoicing/invoicing.types';
import type { PurchaseInvoice } from '@/modules/purchases/purchases.types';
import { useParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { fetchInvoices } from '@/modules/invoicing/invoicing.services';
import { fetchPurchaseInvoices, getPurchaseInvoicesQueryKey } from '@/modules/purchases/purchases.services';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';
import { getOrganizationRouteChildHref } from '@/modules/ui/navigation/organization-navigation';
import { fetchCalendarFeed } from '../calendar.services';
import { CalendarDayEdition } from '../components/calendar-day-edition';

const entryStyles: Record<CalendarEntry['type'], string> = {
  'invoice-created': 'bg-muted border-slate-400 text-muted-foreground',
  'invoice-issued': 'bg-emerald-500/8 border-emerald-500 text-emerald-800 dark:text-emerald-300',
  'purchase-received': 'bg-violet-500/8 border-violet-500 text-violet-800 dark:text-violet-300',
  'holiday': 'bg-rose-500/8 border-rose-500 text-rose-800 dark:text-rose-300',
  'tax-deadline': 'bg-amber-500/10 border-amber-500 text-amber-900 dark:text-amber-300',
  'payment-due': 'bg-red-500/8 border-red-500 text-red-800 dark:text-red-300',
  'collection-due': 'bg-sky-500/10 border-sky-500 text-sky-800 dark:text-sky-300',
};
const entryPriority: Record<CalendarEntry['type'], number> = { 'tax-deadline': 0, 'payment-due': 1, 'collection-due': 2, 'holiday': 3, 'invoice-issued': 4, 'purchase-received': 5, 'invoice-created': 6 };

const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const localDate = (value: string) => new Date(`${value}T12:00:00`);
function monthGrid(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
}

type FormatMoney = (amountMinor: number, currency: string) => string;

function invoiceEntries({ invoice, draftLabel, href, formatMoney }: { invoice: Invoice; draftLabel: string; href: string; formatMoney: FormatMoney }): CalendarEntry[] {
  const base = { title: invoice.number ?? draftLabel, subtitle: invoice.customerName, amount: formatMoney(invoice.totalMinor, invoice.currency), href };
  // Created and issued the same day shows once, as issued
  const isIssuedSameDay = invoice.issuedAt !== null && dayKey(invoice.issuedAt) === dayKey(invoice.createdAt);
  return [
    ...(isIssuedSameDay ? [] : [{ id: `${invoice.id}-created`, date: invoice.createdAt, type: 'invoice-created', ...base } as CalendarEntry]),
    ...(invoice.issuedAt ? [{ id: `${invoice.id}-issued`, date: invoice.issuedAt, type: 'invoice-issued', ...base } as CalendarEntry] : []),
  ];
}

// A received invoice sits on the date it was issued by the supplier, the one that counts for the tax returns
function purchaseEntry({ purchase, href, formatMoney }: { purchase: PurchaseInvoice; href: string; formatMoney: FormatMoney }): CalendarEntry {
  return { id: `${purchase.id}-received`, date: purchase.issueDate, type: 'purchase-received', title: purchase.number || purchase.supplierName || '—', subtitle: purchase.number ? purchase.supplierName : undefined, amount: formatMoney(purchase.totalMinor, purchase.currency), href };
}

function feedEntry({ event, organizationId, formatMoney }: { event: CalendarFeedEvent; organizationId: string; formatMoney: FormatMoney }): CalendarEntry {
  if (event.type === 'payment-due' || event.type === 'collection-due') {
    const href = event.link.entityType === 'purchase_invoice'
      ? getOrganizationRouteChildHref({ organizationId, routeId: 'purchases', childPath: `${event.link.entityId}/edit` })
      : getOrganizationRouteChildHref({ organizationId, routeId: 'invoices', childPath: `${event.link.entityId}/edit` });

    return { id: event.id, date: localDate(event.date), type: event.type, title: formatMoney(event.amountMinor, event.currency), subtitle: event.name, href, isSettled: event.status === 'paid' };
  }

  const { details, links } = event as PublicCalendarEvent;
  return { id: event.id, date: localDate(event.date), type: event.type, title: event.name, source: event.source, details, links };
}

export function CalendarPage() {
  const { t, getLocale } = useI18n();
  const params = useParams();
  const now = new Date();
  const [month, setMonth] = createSignal(new Date(now.getFullYear(), now.getMonth(), 1));
  const [selectedDay, setSelectedDay] = createSignal<Date>();
  const invoicesQuery = useQuery(() => ({ queryKey: ['invoicing', params.organizationId, 'invoices'], queryFn: () => fetchInvoices({ organizationId: params.organizationId }) }));
  const purchasesQuery = useQuery(() => ({ queryKey: getPurchaseInvoicesQueryKey({ organizationId: params.organizationId }), queryFn: () => fetchPurchaseInvoices({ organizationId: params.organizationId }) }));
  const feedQuery = useQuery(() => ({
    queryKey: ['calendar', params.organizationId, month().getFullYear(), getLocale()],
    queryFn: () => fetchCalendarFeed({ organizationId: params.organizationId, year: month().getFullYear(), locale: getLocale() }),
  }));
  const days = createMemo(() => monthGrid(month()));
  const formatMoney = (amountMinor: number, currency: string) => new Intl.NumberFormat(getLocale(), { style: 'currency', currency, maximumFractionDigits: 2 }).format(amountMinor / 100);
  const editHref = (routeId: 'invoices' | 'purchases', id: string) => getOrganizationRouteChildHref({ organizationId: params.organizationId, routeId, childPath: `${id}/edit` });
  const entriesByDay = createMemo(() => {
    const entries = [
      ...(invoicesQuery.data?.invoices ?? []).flatMap(invoice => invoiceEntries({ invoice, draftLabel: t('invoicing.status.draft'), href: editHref('invoices', invoice.id), formatMoney })),
      ...(purchasesQuery.data?.purchaseInvoices ?? []).map(purchase => purchaseEntry({ purchase, href: editHref('purchases', purchase.id), formatMoney })),
      ...(feedQuery.data?.events ?? []).map(event => feedEntry({ event, organizationId: params.organizationId, formatMoney })),
    ].sort((left, right) => entryPriority[left.type] - entryPriority[right.type]);
    return entries.reduce<Record<string, CalendarEntry[]>>((grouped, entry) => {
      (grouped[dayKey(entry.date)] ??= []).push(entry); return grouped;
    }, {});
  });
  const moveMonth = (offset: number) => setMonth(current => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  // Turning the page of the day follows it into the next month, so its feed (and the next year's) loads
  const moveDay = (offset: number) => {
    const current = selectedDay();
    if (current === undefined) {
      return;
    }
    const next = new Date(current.getFullYear(), current.getMonth(), current.getDate() + offset);
    setSelectedDay(next);
    setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
  };
  const monthLabel = () => new Intl.DateTimeFormat(getLocale(), { month: 'long', year: 'numeric' }).format(month());
  const weekDays = () => Array.from({ length: 7 }, (_, index) => new Intl.DateTimeFormat(getLocale(), { weekday: 'short' }).format(new Date(2026, 9, 12 + index)));
  const legend = [
    { type: 'tax-deadline', color: 'bg-amber-500', label: t('calendar.legend.tax-deadline') },
    { type: 'payment-due', color: 'bg-red-500', label: t('calendar.legend.payment-due') },
    { type: 'collection-due', color: 'bg-sky-500', label: t('calendar.legend.collection-due') },
    { type: 'holiday', color: 'bg-rose-500', label: t('calendar.legend.holiday') },
    { type: 'invoice-issued', color: 'bg-emerald-500', label: t('calendar.legend.invoice-issued') },
    { type: 'purchase-received', color: 'bg-violet-500', label: t('calendar.legend.purchase-received') },
    { type: 'invoice-created', color: 'bg-slate-400', label: t('calendar.legend.invoice-created') },
  ] as const;

  return (
    <main class="page-full">
      <div class="flex flex-col gap-4 mb-6 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 class="page-title">{t('calendar.title')}</h1>
          <p class="page-description">{t('calendar.description')}</p>
        </div>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <For each={legend}>
            {item => (
              <span class="flex items-center gap-1.5">
                <span class={cn('size-2 rounded-full', item.color)} />
                {item.label}
              </span>
            )}
          </For>
        </div>
      </div>
      <Show when={feedQuery.data?.warnings.length}>
        <div class="mb-4 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning-foreground">
          {t('calendar.source-warning')}
        </div>
      </Show>
      <div class="flex items-center gap-2 mb-4">
        <div class="flex items-center">
          <Button variant="outline" size="icon" class="rounded-r-none" aria-label={t('calendar.previous-month')} onClick={() => moveMonth(-1)}><div class="i-tabler-chevron-left size-4" /></Button>
          <div class="h-9 min-w-44 border-y bg-card px-4 flex items-center justify-center text-sm font-medium capitalize">{monthLabel()}</div>
          <Button variant="outline" size="icon" class="rounded-l-none" aria-label={t('calendar.next-month')} onClick={() => moveMonth(1)}><div class="i-tabler-chevron-right size-4" /></Button>
        </div>
        <Button variant="outline" size="sm" onClick={() => setMonth(new Date(now.getFullYear(), now.getMonth(), 1))}>{t('calendar.today')}</Button>
      </div>
      <div class="rounded-xl border border-border/80 bg-card shadow-xs dark:shadow-none overflow-hidden flex-1 min-h-[620px] flex flex-col">
        <div class="grid grid-cols-7 border-b bg-muted/35"><For each={weekDays()}>{day => <div class="px-2 py-2 text-center text-xs font-medium text-muted-foreground capitalize">{day}</div>}</For></div>
        <div class="grid grid-cols-7 flex-1" style={{ 'grid-template-rows': 'repeat(6,minmax(0,1fr))' }}>
          <For each={days()}>
            {(day, index) => {
              const entries = () => entriesByDay()[dayKey(day)] ?? [];
              const outside = () => day.getMonth() !== month().getMonth();
              const today = () => dayKey(day) === dayKey(now);
              const selected = () => selectedDay() !== undefined && dayKey(selectedDay()!) === dayKey(day);
              return (
                <button
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  aria-label={new Intl.DateTimeFormat(getLocale(), { dateStyle: 'full' }).format(day)}
                  class={cn('group min-w-0 border-b border-r p-1.5 overflow-hidden text-left align-top flex flex-col transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring', index() % 7 === 6 && 'border-r-0', index() >= 35 && 'border-b-0', outside() && 'bg-muted/15', selected() && 'bg-accent/60')}
                >
                  <div class={cn('size-6 mb-1 flex shrink-0 items-center justify-center rounded-full text-xs', today() ? 'bg-primary text-primary-foreground font-semibold' : outside() ? 'text-muted-foreground/60' : 'text-foreground')}>{day.getDate()}</div>
                  <div class="w-full space-y-1">
                    <For each={entries().slice(0, 3)}>
                      {entry => (
                        <div class={cn('truncate rounded px-1.5 py-1 text-[11px] leading-tight border-l-2', entryStyles[entry.type], entry.isSettled && 'line-through opacity-60')}>
                          <span class="font-medium">{entry.title}</span>
                          <Show when={entry.subtitle}><span class="ml-1 opacity-75">{entry.subtitle}</span></Show>
                        </div>
                      )}
                    </For>
                    <Show when={entries().length > 3}><div class="px-1 text-[11px] text-muted-foreground">{t('calendar.more', { count: entries().length - 3 })}</div></Show>
                  </div>
                </button>
              );
            }}
          </For>
        </div>
      </div>
      <p class="mt-3 text-xs text-muted-foreground">{t('calendar.sources-note')}</p>
      <CalendarDayEdition
        date={selectedDay()}
        entries={selectedDay() ? entriesByDay()[dayKey(selectedDay()!)] ?? [] : []}
        onOpenChange={open => !open && setSelectedDay(undefined)}
        onMoveDay={moveDay}
      />
    </main>
  );
}
