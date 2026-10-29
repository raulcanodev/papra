import type { QuarterlyTaxReport, WithholdingPayee } from '../taxes.types';
import { A } from '@solidjs/router';
import { For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';

/**
 * What the company withheld to each supplier over the quarter (models 111 and 115), with the invoices it comes from.
 * That IRPF is not paid to the supplier but to the tax agency, which asks for it per payee: the figures to file,
 * without going through the invoices one by one.
 */
export function WithholdingsByPayee(props: {
  report: QuarterlyTaxReport;
  /** Where a received invoice opens; none when the reader cannot open it (the gestoría view) */
  purchaseHref?: (purchaseInvoiceId: string) => string;
}) {
  const { t, getLocale, formatDate } = useI18n();

  const money = (minor: number) => new Intl.NumberFormat(getLocale(), { style: 'currency', currency: props.report.currency ?? 'EUR', useGrouping: 'always' }).format(minor / 100);
  const percent = (bps: number) => `${bps / 100} %`;

  const groups = () => [
    { model: '111' as const, label: t('taxes.payees.professionals'), boxes: t('taxes.payees.boxes-111'), withholdings: props.report.professionals111 },
    { model: '115' as const, label: t('taxes.payees.rents'), boxes: t('taxes.payees.boxes-115'), withholdings: props.report.rents115 },
  ].filter(({ withholdings }) => withholdings.payees.length > 0);

  const Payee = (payee: WithholdingPayee) => (
    <details class="group">
      <summary class="flex cursor-pointer list-none items-center gap-3 py-3 select-none [&::-webkit-details-marker]:hidden">
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium">{payee.name || t('taxes.payees.unknown')}</p>
          <p class="truncate text-xs text-muted-foreground tabular-nums">
            {[payee.taxId, t('taxes.payees.invoices', { count: payee.invoices.length })].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div class="shrink-0 text-right">
          <p class="font-semibold tabular-nums">{money(payee.amountMinor)}</p>
          <p class="text-xs text-muted-foreground tabular-nums">{t('taxes.payees.base', { base: money(payee.baseMinor) })}</p>
        </div>
        <span class="i-tabler-chevron-down size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>

      <ul class="mb-3 divide-y border-l-2 pl-3 text-sm">
        <For each={payee.invoices}>
          {invoice => (
            <li class="flex items-center gap-3 py-2">
              <div class="min-w-0 flex-1">
                <Show when={props.purchaseHref} fallback={<p class="truncate">{invoice.number}</p>}>
                  {getHref => <A href={getHref()(invoice.id)} class="block truncate underline-offset-2 hover:underline">{invoice.number}</A>}
                </Show>
                <p class="truncate text-xs text-muted-foreground">
                  {t('taxes.payees.invoice-detail', { date: formatDate(invoice.issueDate), rate: percent(invoice.rateBps), base: money(invoice.baseMinor) })}
                </p>
              </div>
              <p class="shrink-0 tabular-nums">{money(invoice.amountMinor)}</p>
            </li>
          )}
        </For>
      </ul>
    </details>
  );

  return (
    <Show when={groups().length > 0}>
      <section class="mt-8 border-t pt-6">
        <h2 class="text-[15px] font-semibold">{t('taxes.payees.title')}</h2>
        <p class="mt-0.5 text-sm text-muted-foreground">{t('taxes.payees.description')}</p>

        <div class="mt-4 grid gap-8 lg:grid-cols-2">
          <For each={groups()}>
            {group => (
              <div class="min-w-0">
                <p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">{`${t('taxes.payees.model', { model: group.model })} · ${group.label}`}</p>
                <div class="divide-y">
                  <For each={group.withholdings.payees}>{payee => Payee(payee)}</For>
                  <div class="flex items-center justify-between gap-3 py-3 pr-7">
                    <p class="font-medium">{t('taxes.payees.total', { count: group.withholdings.payeesCount })}</p>
                    <p class="font-semibold tabular-nums">{money(group.withholdings.amountMinor)}</p>
                  </div>
                </div>
                <p class="text-xs text-muted-foreground">{group.boxes}</p>
              </div>
            )}
          </For>
        </div>
      </section>
    </Show>
  );
}
