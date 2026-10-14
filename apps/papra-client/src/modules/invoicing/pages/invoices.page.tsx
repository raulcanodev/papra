/* eslint-disable style/max-statements-per-line */
import type { Invoice, InvoiceStatus } from '../invoicing.types';
import type { TranslationKeys } from '@/modules/i18n/locales.types';
import { A, useParams } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { queryClient } from '@/modules/shared/query/query-client';
import { Badge } from '@/modules/ui/components/badge';
import { Button } from '@/modules/ui/components/button';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField } from '@/modules/ui/components/textfield';
import { getOrganizationRouteChildHref, getOrganizationRouteHref } from '@/modules/ui/navigation/organization-navigation';
import { CatalogCell, CatalogRow, CatalogTable, FilterMenu } from '../components/catalog-page';
import { InvoicesTabs } from '../components/invoices-tabs';
import { getInvoicePayableMinor } from '../invoicing.models';
import { downloadInvoicePdf, fetchInvoices, markInvoicePaid, sendInvoice } from '../invoicing.services';

export const invoiceStatusLabelKeys = { draft: 'invoicing.status.draft', issuing: 'invoicing.status.issuing', issued: 'invoicing.status.issued', sent: 'invoicing.status.sent', paid: 'invoicing.status.paid', void: 'invoicing.status.void' } as const satisfies Record<InvoiceStatus, TranslationKeys>;
export function InvoicesPage() {
  const { t, getLocale } = useI18n();
  const statusOptions = () => Object.entries(invoiceStatusLabelKeys).map(([value, key]) => ({ value, label: t(key) }));
  const params = useParams(); const [search, setSearch] = createSignal(''); const [statuses, setStatuses] = createSignal<string[]>([]);
  const query = useQuery(() => ({ queryKey: ['invoicing', params.organizationId, 'invoices'], queryFn: () => fetchInvoices({ organizationId: params.organizationId }) }));
  const invoices = createMemo(() => (query.data?.invoices ?? []).filter((invoice) => {
    const matchesText = `${invoice.number ?? ''} ${invoice.customerName ?? ''}`.toLowerCase().includes(search().toLowerCase()); return matchesText && (statuses().length === 0 || statuses().includes(invoice.status));
  }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['invoicing', params.organizationId, 'invoices'] });
  const sendMutation = createMutation(() => ({ mutationFn: (invoiceId: string) => sendInvoice({ organizationId: params.organizationId, invoiceId }), onSuccess: async () => {
    createToast({ type: 'success', message: t('invoicing.invoices.toast.sent') }); await refresh();
  }, onError: () => createToast({ type: 'error', message: t('invoicing.invoices.toast.send-error') }) }));
  const paidMutation = createMutation(() => ({ mutationFn: (invoiceId: string) => markInvoicePaid({ organizationId: params.organizationId, invoiceId }), onSuccess: refresh }));
  // The amount the customer pays, the IRPF withholding goes to the tax agency
  const money = (invoice: Invoice) => new Intl.NumberFormat(getLocale(), { style: 'currency', currency: invoice.currency }).format(getInvoicePayableMinor(invoice) / 100);
  return (
    <main class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">{t('invoicing.invoices.title')}</h1>
          <p class="page-description">{t('invoicing.invoices.description')}</p>
        </div>
        <Button as={A} size="sm" href={getOrganizationRouteChildHref({ organizationId: params.organizationId, routeId: 'invoices', childPath: 'new' })} class="gap-1.5">
          <div class="i-tabler-plus size-4" />
          {t('invoicing.invoices.new')}
        </Button>
      </div>

      <InvoicesTabs />
      <div class="flex items-center gap-2 mb-3">
        <div class="relative w-full max-w-sm">
          <div class="i-tabler-search absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <TextField value={search()} onInput={event => setSearch(event.currentTarget.value)} placeholder={t('invoicing.invoices.search')} class="pl-9" />
        </div>
        <FilterMenu label={t('invoicing.invoices.filter.status')} options={statusOptions()} values={statuses()} onChange={setStatuses} />
      </div>
      <Show when={!query.isLoading && invoices().length === 0}>
        <div class="rounded-xl border border-dashed py-16 text-center">
          <div class="i-tabler-receipt size-9 mx-auto text-muted-foreground/50 mb-3" />
          <div class="font-medium">{t('invoicing.invoices.empty.title')}</div>
          <div class="text-sm text-muted-foreground mt-1">{t('invoicing.invoices.empty.description')}</div>
          <Button variant="outline" size="sm" class="mt-4" as={A} href={getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'customers' })}>{t('invoicing.invoices.empty.manage-customers')}</Button>
        </div>
      </Show>
      <Show when={invoices().length > 0}>
        <CatalogTable headers={[{ label: t('invoicing.invoices.table.invoice') }, { label: t('invoicing.invoices.table.customer') }, { label: t('invoicing.invoices.table.issue-date') }, { label: t('invoicing.invoices.table.status') }, { label: t('invoicing.invoices.table.total'), class: 'text-right' }, { label: '', class: 'w-36' }]}>
          <For each={invoices()}>
            {invoice => (
              <CatalogRow>
                <CatalogCell class="font-medium">{invoice.number ?? t('invoicing.status.draft')}</CatalogCell>
                <CatalogCell>{invoice.customerName}</CatalogCell>
                <CatalogCell class="text-muted-foreground">{invoice.issueDate.toLocaleDateString(getLocale())}</CatalogCell>
                <CatalogCell><Badge variant="outline">{t(invoiceStatusLabelKeys[invoice.status])}</Badge></CatalogCell>
                <CatalogCell class="text-right font-medium tabular-nums">{money(invoice)}</CatalogCell>
                <CatalogCell>
                  <div class="flex justify-end gap-1">
                    <Show when={invoice.status === 'draft'}>
                      <Button
                        as={A}
                        size="icon"
                        variant="ghost"
                        aria-label={t('invoicing.invoices.actions.edit-draft')}
                        href={`/organizations/${params.organizationId}/invoicing/invoices/${invoice.id}/edit`}
                      >
                        <div class="i-tabler-pencil size-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => sendMutation.mutate(invoice.id)}>{t('invoicing.invoices.actions.send')}</Button>
                    </Show>
                    <Show when={invoice.status !== 'draft' && invoice.status !== 'issuing'}><Button size="icon" variant="ghost" aria-label={t('invoicing.invoices.actions.download')} onClick={() => downloadInvoicePdf({ organizationId: params.organizationId, invoiceId: invoice.id, filename: invoice.number ?? invoice.id })}><div class="i-tabler-download size-4" /></Button></Show>
                    <Show when={invoice.status === 'issued' || invoice.status === 'sent'}><Button size="icon" variant="ghost" aria-label={t('invoicing.invoices.actions.mark-paid')} onClick={() => paidMutation.mutate(invoice.id)}><div class="i-tabler-check size-4" /></Button></Show>
                  </div>
                </CatalogCell>
              </CatalogRow>
            )}
          </For>
        </CatalogTable>
      </Show>
    </main>
  );
}
