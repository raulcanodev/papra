/* eslint-disable style/max-statements-per-line */
import type { Invoice } from '../invoicing.types';
import type { ActiveFilter, FilterField } from '@/modules/ui/components/table-filters';
import { A, useParams, useSearchParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { usePageFilesDrop } from '@/modules/documents/components/global-drop-area.component';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { Button } from '@/modules/ui/components/button';
import { EntityIcon } from '@/modules/ui/components/entity-icon';
import { dateIsInRange, getActiveFilter, isDateRangeValue } from '@/modules/ui/components/table-filters';
import { TableToolbar } from '@/modules/ui/components/table-toolbar';
import { Tabs, TabsContent, TabsIndicator, TabsList, TabsTrigger } from '@/modules/ui/components/tabs';
import { getOrganizationRouteChildHref, getOrganizationRouteHref } from '@/modules/ui/navigation/organization-navigation';
import { CatalogCell, CatalogRow, CatalogTable } from '../components/catalog-page';
import { InvoiceRowActions, useOpenInvoice } from '../components/invoice-row-actions';
import { InvoiceStatusBadge, invoiceStatusLabelKeys } from '../components/invoice-status-badge';
import { getNewProformaHref, ProformasTab } from '../components/proformas-table';
import { getInvoicePayableMinor } from '../invoicing.models';
import { fetchInvoices } from '../invoicing.services';
import { useSalesImportUpload } from '../use-sales-import-upload';

export function InvoicesPage() {
  const { t, getLocale } = useI18n();
  // Proformas have a tab of their own: their totals are not sales, and mixed here they would add up with them
  const statusOptions = () => Object.entries(invoiceStatusLabelKeys).filter(([value]) => value !== 'proforma').map(([value, key]) => ({ value, label: t(key) }));
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = () => searchParams.tab === 'proformas' ? 'proformas' : 'invoices';
  const params = useParams(); const [search, setSearch] = createSignal(''); const [filters, setFilters] = createSignal<ActiveFilter[]>([]);
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
  // Invoices issued before the app (or outside it): uploaded with the button or dropped anywhere on the page
  const salesImport = useSalesImportUpload({ organizationId: () => params.organizationId });
  usePageFilesDrop(files => void salesImport.uploadFiles(files), { description: () => t('invoicing.import.drop-area') });
  // The list keeps its search (filters) when the invoice returns to it
  const { canOpen, openInvoice } = useOpenInvoice({ organizationId: () => params.organizationId });
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
        <div class="flex flex-wrap gap-2 sm:(shrink-0 flex-nowrap) max-sm:w-full [&>*]:max-sm:flex-1">
          <Button variant="outline" size="sm" class="gap-1.5" isLoading={salesImport.isBusy()} onClick={() => salesImport.openFilePicker()}>
            <div class="i-tabler-file-import size-4" />
            {t('invoicing.import.button')}
          </Button>
          <Button as={A} variant="outline" size="sm" href={getNewProformaHref({ organizationId: params.organizationId })} class="gap-1.5">
            <div class="i-tabler-file-description size-4" />
            {t('invoicing.proformas.new')}
          </Button>
          <Button as={A} size="sm" href={getOrganizationRouteChildHref({ organizationId: params.organizationId, routeId: 'invoices', childPath: 'new' })} class="gap-1.5">
            <div class="i-tabler-plus size-4" />
            {t('invoicing.invoices.new')}
          </Button>
          {salesImport.elements}
        </div>
      </div>

      <Tabs value={activeTab()} onChange={tab => setSearchParams({ tab: tab === 'invoices' ? undefined : tab }, { replace: true })}>
        <TabsList class="mb-4 h-11 w-full p-1 sm:w-fit">
          <TabsTrigger value="invoices" class="h-9 gap-2 px-3 sm:px-4">
            <div class="i-tabler-receipt size-4 max-sm:hidden" />
            {t('invoicing.invoices.tabs.invoices')}
          </TabsTrigger>
          <TabsTrigger value="proformas" class="h-9 gap-2 px-3 sm:px-4">
            <div class="i-tabler-file-description size-4 max-sm:hidden" />
            {t('invoicing.invoices.tabs.proformas')}
          </TabsTrigger>
          <TabsIndicator />
        </TabsList>

        <TabsContent value="invoices" class="mt-0">
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
                  <CatalogRow onClick={canOpen(invoice) ? () => openInvoice(invoice) : undefined}>
                    <CatalogCell class="font-medium">
                      {invoice.number ?? t('invoicing.status.draft')}
                      <Show when={invoice.importedAt}>
                        <span class="ml-2 text-xs font-normal text-muted-foreground">{t('invoicing.import.badge')}</span>
                      </Show>
                    </CatalogCell>
                    <CatalogCell>
                      <div class="flex items-center gap-2">
                        <EntityIcon icon={invoice.customerIcon} color={invoice.customerIconColor} fallback="i-tabler-building" size="sm" />
                        <span class="truncate">{invoice.customerName}</span>
                      </div>
                    </CatalogCell>
                    <CatalogCell class="text-muted-foreground">{invoice.issueDate.toLocaleDateString(getLocale())}</CatalogCell>
                    <CatalogCell><InvoiceStatusBadge status={invoice.status} /></CatalogCell>
                    <CatalogCell class="text-right font-medium tabular-nums">{money(invoice)}</CatalogCell>
                    <CatalogCell>
                      <InvoiceRowActions organizationId={params.organizationId} invoice={invoice} />
                    </CatalogCell>
                  </CatalogRow>
                )}
              </For>
            </CatalogTable>
          </Show>
        </TabsContent>

        <TabsContent value="proformas" class="mt-0">
          <ProformasTab organizationId={params.organizationId} />
        </TabsContent>
      </Tabs>
    </main>
  );
}
