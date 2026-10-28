/* eslint-disable style/max-statements-per-line */
import type { Invoice, InvoiceStatus } from '../invoicing.types';
import type { TranslationKeys } from '@/modules/i18n/locales.types';
import type { ActiveFilter, FilterField } from '@/modules/ui/components/table-filters';
import { A, useNavigate, useParams } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { queryClient } from '@/modules/shared/query/query-client';
import { Badge } from '@/modules/ui/components/badge';
import { Button } from '@/modules/ui/components/button';
import { EntityIcon } from '@/modules/ui/components/entity-icon';
import { RowActions } from '@/modules/ui/components/row-actions';
import { createToast } from '@/modules/ui/components/sonner';
import { dateIsInRange, getActiveFilter, isDateRangeValue } from '@/modules/ui/components/table-filters';
import { TableToolbar } from '@/modules/ui/components/table-toolbar';
import { getOrganizationRouteChildHref, getOrganizationRouteHref } from '@/modules/ui/navigation/organization-navigation';
import { useLinkWithReturn } from '@/modules/ui/navigation/return-to';
import { CatalogCell, CatalogRow, CatalogTable } from '../components/catalog-page';
import { getInvoicePayableMinor } from '../invoicing.models';
import { deleteDraftInvoice, downloadInvoicePdf, fetchInvoices, markInvoicePaid, sendInvoice } from '../invoicing.services';

export const invoiceStatusLabelKeys = { draft: 'invoicing.status.draft', issuing: 'invoicing.status.issuing', issued: 'invoicing.status.issued', sent: 'invoicing.status.sent', paid: 'invoicing.status.paid', void: 'invoicing.status.void' } as const satisfies Record<InvoiceStatus, TranslationKeys>;
export function InvoicesPage() {
  const { t, getLocale } = useI18n();
  const statusOptions = () => Object.entries(invoiceStatusLabelKeys).map(([value, key]) => ({ value, label: t(key) }));
  const params = useParams(); const navigate = useNavigate(); const [search, setSearch] = createSignal(''); const [filters, setFilters] = createSignal<ActiveFilter[]>([]);
  const filterFields = createMemo((): FilterField[] => [
    { id: 'status', type: 'multi-select', label: t('invoicing.invoices.filter.status'), icon: 'i-tabler-progress-check', options: statusOptions() },
    { id: 'date', type: 'date-range', label: t('invoicing.invoices.table.issue-date'), icon: 'i-tabler-calendar' },
  ]);
  const query = useQuery(() => ({ queryKey: ['invoicing', params.organizationId, 'invoices'], queryFn: () => fetchInvoices({ organizationId: params.organizationId }) }));
  const invoices = createMemo(() => (query.data?.invoices ?? []).filter((invoice) => {
    const statuses = getActiveFilter(filters(), 'status')?.value;
    const dateRange = getActiveFilter(filters(), 'date')?.value;
    const matchesText = `${invoice.number ?? ''} ${invoice.customerName ?? ''}`.toLowerCase().includes(search().toLowerCase());
    const matchesStatus = !Array.isArray(statuses) || statuses.length === 0 || statuses.includes(invoice.status);
    const matchesDate = !isDateRangeValue(dateRange) || dateIsInRange(invoice.issueDate, dateRange);
    return matchesText && matchesStatus && matchesDate;
  }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['invoicing', params.organizationId, 'invoices'] });
  const sendMutation = createMutation(() => ({ mutationFn: (invoiceId: string) => sendInvoice({ organizationId: params.organizationId, invoiceId }), onSuccess: async () => {
    createToast({ type: 'success', message: t('invoicing.invoices.toast.sent') }); await refresh();
  }, onError: () => createToast({ type: 'error', message: t('invoicing.invoices.toast.send-error') }) }));
  const deleteMutation = createMutation(() => ({ mutationFn: (invoiceId: string) => deleteDraftInvoice({ organizationId: params.organizationId, invoiceId }), onSuccess: async () => {
    createToast({ type: 'success', message: t('invoicing.invoices.toast.deleted') }); await refresh();
  }, onError: () => createToast({ type: 'error', message: t('invoicing.invoices.toast.delete-error') }) }));
  const linkWithReturn = useLinkWithReturn();
  // The list keeps its search (filters) when the editor returns to it
  const editHref = (invoice: Invoice) => linkWithReturn(getOrganizationRouteChildHref({ organizationId: params.organizationId, routeId: 'invoices', childPath: `${invoice.id}/edit` }));
  // A draft opens in the editor; an issued invoice is a legal record, it opens as its archived PDF
  const openInvoice = (invoice: Invoice) => {
    if (invoice.status === 'draft') {
      navigate(editHref(invoice));
    } else if (invoice.documentId !== null) {
      navigate(linkWithReturn(`/organizations/${params.organizationId}/documents/${invoice.documentId}`));
    }
  };
  const paidMutation = createMutation(() => ({ mutationFn: (invoiceId: string) => markInvoicePaid({ organizationId: params.organizationId, invoiceId }), onSuccess: refresh }));
  // The amount the customer pays, the IRPF withholding goes to the tax agency
  const formatMoney = (minor: number, currency: string) => new Intl.NumberFormat(getLocale(), { style: 'currency', currency }).format(minor / 100);
  const money = (invoice: Invoice) => formatMoney(getInvoicePayableMinor(invoice), invoice.currency);
  // The sum of the listed invoices, one amount per currency; a void invoice counts nothing
  const totals = createMemo(() => {
    const byCurrency = new Map<string, number>();
    for (const invoice of invoices()) {
      if (invoice.status !== 'void') {
        byCurrency.set(invoice.currency, (byCurrency.get(invoice.currency) ?? 0) + getInvoicePayableMinor(invoice));
      }
    }
    return [...byCurrency].map(([currency, minor]) => formatMoney(minor, currency));
  });
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

      <TableToolbar search={search()} onSearchChange={setSearch} searchPlaceholder={t('invoicing.invoices.search')} fields={filterFields()} filters={filters()} onFiltersChange={setFilters} />
      <Show when={!query.isLoading && invoices().length === 0}>
        <div class="rounded-xl border border-dashed py-16 text-center">
          <div class="i-tabler-receipt size-9 mx-auto text-muted-foreground/50 mb-3" />
          <div class="font-medium">{t('invoicing.invoices.empty.title')}</div>
          <div class="text-sm text-muted-foreground mt-1">{t('invoicing.invoices.empty.description')}</div>
          <Button variant="outline" size="sm" class="mt-4" as={A} href={getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'customers' })}>{t('invoicing.invoices.empty.manage-customers')}</Button>
        </div>
      </Show>
      <Show when={invoices().length > 0}>
        <CatalogTable
          headers={[{ label: t('invoicing.invoices.table.invoice') }, { label: t('invoicing.invoices.table.customer') }, { label: t('invoicing.invoices.table.issue-date') }, { label: t('invoicing.invoices.table.status') }, { label: t('invoicing.invoices.table.total'), class: 'text-right' }, { label: '', class: 'w-14' }]}
          footer={(
            <div class="flex items-center justify-between gap-4 text-sm md:pr-14">
              <span class="text-muted-foreground">{t('invoicing.invoices.table.sum', { count: invoices().length })}</span>
              <span class="flex flex-wrap justify-end gap-x-4 font-semibold tabular-nums"><For each={totals()}>{amount => <span>{amount}</span>}</For></span>
            </div>
          )}
        >
          <For each={invoices()}>
            {invoice => (
              <CatalogRow onClick={invoice.status === 'draft' || invoice.documentId !== null ? () => openInvoice(invoice) : undefined}>
                <CatalogCell class="font-medium">{invoice.number ?? t('invoicing.status.draft')}</CatalogCell>
                <CatalogCell>
                  <div class="flex items-center gap-2">
                    <EntityIcon icon={invoice.customerIcon} color={invoice.customerIconColor} fallback="i-tabler-building" size="sm" />
                    <span class="truncate">{invoice.customerName}</span>
                  </div>
                </CatalogCell>
                <CatalogCell class="text-muted-foreground">{invoice.issueDate.toLocaleDateString(getLocale())}</CatalogCell>
                <CatalogCell><Badge variant="outline">{t(invoiceStatusLabelKeys[invoice.status])}</Badge></CatalogCell>
                <CatalogCell class="text-right font-medium tabular-nums">{money(invoice)}</CatalogCell>
                <CatalogCell>
                  <RowActions
                    itemName={invoice.number ?? t('invoicing.status.draft')}
                    actions={[
                      ...(invoice.status === 'draft' || invoice.status === 'issued' ? [{ label: t('invoicing.invoices.actions.send'), icon: 'i-tabler-send', onSelect: () => sendMutation.mutate(invoice.id) }] : []),
                      ...(invoice.status !== 'draft' && invoice.status !== 'issuing' ? [{ label: t('invoicing.invoices.actions.download'), icon: 'i-tabler-download', onSelect: () => void downloadInvoicePdf({ organizationId: params.organizationId, invoiceId: invoice.id, filename: invoice.number ?? invoice.id }) }] : []),
                      ...(invoice.status === 'issued' || invoice.status === 'sent' ? [{ label: t('invoicing.invoices.actions.mark-paid'), icon: 'i-tabler-check', onSelect: () => paidMutation.mutate(invoice.id) }] : []),
                    ]}
                    // An issued invoice is a legal record: it is corrected with a credit note, never edited nor deleted
                    onEdit={invoice.status === 'draft' ? () => navigate(editHref(invoice)) : undefined}
                    onDelete={() => deleteMutation.mutateAsync(invoice.id)}
                    deleteDisabled={invoice.status !== 'draft'}
                  />
                </CatalogCell>
              </CatalogRow>
            )}
          </For>
        </CatalogTable>
      </Show>
    </main>
  );
}
