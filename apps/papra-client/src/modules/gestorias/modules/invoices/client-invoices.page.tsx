import type { Invoice } from '@/modules/invoicing/invoicing.types';
import type { ActiveFilter, FilterField } from '@/modules/ui/components/table-filters';
import { useParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { CatalogCell, CatalogRow, CatalogTable } from '@/modules/invoicing/components/catalog-page';
import { getInvoicePayableMinor } from '@/modules/invoicing/invoicing.models';
import { invoiceStatusLabelKeys } from '@/modules/invoicing/pages/invoices.page';
import { Badge } from '@/modules/ui/components/badge';
import { EntityIcon } from '@/modules/ui/components/entity-icon';
import { RowActions } from '@/modules/ui/components/row-actions';
import { createToast } from '@/modules/ui/components/sonner';
import { dateIsInRange, getActiveFilter, isDateRangeValue } from '@/modules/ui/components/table-filters';
import { TableToolbar } from '@/modules/ui/components/table-toolbar';
import { ClientModulePage } from '../../components/client-module-page.component';
import { downloadClientInvoicePdf, fetchClientInvoices } from './client-invoices.services';

/** The invoices a client company issued, as on its books: the same table its members see, read only */
export function ClientInvoicesPage() {
  const { t, getLocale } = useI18n();
  const params = useParams();
  const [search, setSearch] = createSignal('');
  const [filters, setFilters] = createSignal<ActiveFilter[]>([]);

  const query = useQuery(() => ({
    queryKey: ['gestorias', params.gestoriaId, 'clients', params.organizationId, 'invoices'],
    queryFn: () => fetchClientInvoices({ gestoriaId: params.gestoriaId, organizationId: params.organizationId }),
  }));

  const filterFields = createMemo((): FilterField[] => [
    {
      id: 'status',
      type: 'multi-select',
      label: t('invoicing.invoices.filter.status'),
      icon: 'i-tabler-progress-check',
      options: (['issued', 'sent', 'paid', 'void'] as const).map(status => ({ value: status, label: t(invoiceStatusLabelKeys[status]) })),
    },
    { id: 'date', type: 'date-range', label: t('invoicing.invoices.table.issue-date'), icon: 'i-tabler-calendar' },
  ]);

  const invoices = createMemo(() => (query.data?.invoices ?? []).filter((invoice) => {
    const statuses = getActiveFilter(filters(), 'status')?.value;
    const dateRange = getActiveFilter(filters(), 'date')?.value;

    return `${invoice.number ?? ''} ${invoice.customerName ?? ''}`.toLowerCase().includes(search().trim().toLowerCase())
      && (!Array.isArray(statuses) || statuses.length === 0 || statuses.includes(invoice.status))
      && (!isDateRangeValue(dateRange) || dateIsInRange(invoice.issueDate, dateRange));
  }));

  const money = (invoice: Invoice, minor: number) => new Intl.NumberFormat(getLocale(), { style: 'currency', currency: invoice.currency }).format(minor / 100);

  const download = async (invoice: Invoice) => {
    try {
      await downloadClientInvoicePdf({ gestoriaId: params.gestoriaId, organizationId: params.organizationId, invoiceId: invoice.id, fileName: invoice.number ?? invoice.id });
    } catch {
      createToast({ type: 'error', message: t('gestorias.download.error') });
    }
  };

  return (
    <ClientModulePage module="invoices" description={t('gestorias.modules.invoices.description')}>
      {() => (
        <>
          <TableToolbar search={search()} onSearchChange={setSearch} searchPlaceholder={t('invoicing.invoices.search')} fields={filterFields()} filters={filters()} onFiltersChange={setFilters} />

          <Show when={!query.isLoading && invoices().length === 0}>
            <div class="rounded-xl border border-dashed py-16 text-center">
              <div class="i-tabler-receipt mx-auto mb-3 size-9 text-muted-foreground/50" />
              <div class="font-medium">{t('gestorias.modules.invoices.empty')}</div>
            </div>
          </Show>

          <Show when={invoices().length > 0}>
            <CatalogTable headers={[
              { label: t('invoicing.invoices.table.invoice') },
              { label: t('invoicing.invoices.table.customer') },
              { label: t('invoicing.invoices.table.issue-date') },
              { label: t('invoicing.invoices.table.status') },
              { label: t('gestorias.table.base'), class: 'text-right' },
              { label: t('gestorias.table.vat'), class: 'text-right' },
              { label: t('invoicing.invoices.table.total'), class: 'text-right' },
              { label: '', class: 'w-14' },
            ]}
            >
              <For each={invoices()}>
                {invoice => (
                  <CatalogRow onClick={() => void download(invoice)}>
                    <CatalogCell class="font-medium">{invoice.number}</CatalogCell>
                    <CatalogCell>
                      <div class="flex items-center gap-2">
                        <EntityIcon icon={invoice.customerIcon} color={invoice.customerIconColor} fallback="i-tabler-building" size="sm" />
                        <span class="truncate">{invoice.customerName}</span>
                      </div>
                    </CatalogCell>
                    <CatalogCell class="text-muted-foreground">{invoice.issueDate.toLocaleDateString(getLocale())}</CatalogCell>
                    <CatalogCell><Badge variant="outline">{t(invoiceStatusLabelKeys[invoice.status])}</Badge></CatalogCell>
                    <CatalogCell class="text-right tabular-nums text-muted-foreground">{money(invoice, invoice.subtotalMinor)}</CatalogCell>
                    <CatalogCell class="text-right tabular-nums text-muted-foreground">{money(invoice, invoice.taxMinor)}</CatalogCell>
                    <CatalogCell class="text-right font-medium tabular-nums">{money(invoice, getInvoicePayableMinor(invoice))}</CatalogCell>
                    <CatalogCell>
                      <RowActions
                        itemName={invoice.number ?? invoice.id}
                        actions={[{ label: t('invoicing.invoices.actions.download'), icon: 'i-tabler-download', onSelect: () => void download(invoice) }]}
                      />
                    </CatalogCell>
                  </CatalogRow>
                )}
              </For>
            </CatalogTable>
          </Show>
        </>
      )}
    </ClientModulePage>
  );
}
