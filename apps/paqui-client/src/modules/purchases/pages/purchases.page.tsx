import type { PurchaseInvoice, PurchaseInvoiceStatus } from '../purchases.types';
import type { ActiveFilter, FilterField } from '@/modules/ui/components/table-filters';
import { useNavigate, useParams, useSearchParams } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { usePageFilesDrop } from '@/modules/documents/components/global-drop-area.component';
import { getDueDatesQueryKey } from '@/modules/due-dates/due-dates.services';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { CatalogCell, CatalogRow, CatalogTable } from '@/modules/invoicing/components/catalog-page';
import { getInvoicePayableMinor } from '@/modules/invoicing/invoicing.models';
import { useSalesImportUpload } from '@/modules/invoicing/use-sales-import-upload';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';
import { EntityIcon } from '@/modules/ui/components/entity-icon';
import { createToast } from '@/modules/ui/components/sonner';
import { dateIsInRange, getActiveFilter, isDateRangeValue } from '@/modules/ui/components/table-filters';
import { TableToolbar } from '@/modules/ui/components/table-toolbar';
import { getOrganizationRouteChildHref } from '@/modules/ui/navigation/organization-navigation';
import { useLinkWithReturn } from '@/modules/ui/navigation/return-to';
import { AddPurchaseDialog } from '../components/add-purchase-dialog';
import { PurchaseRowActions } from '../components/purchase-row-actions';
import { EXPENSE_CATEGORY_LABEL_I18N_KEYS, PURCHASE_DOCUMENT_KIND_BADGE_CLASSES, PURCHASE_DOCUMENT_KIND_LABEL_I18N_KEYS, PURCHASE_DOCUMENT_KINDS, PURCHASE_STATUS_BADGE_CLASSES, PURCHASE_STATUS_LABEL_I18N_KEYS } from '../purchases.constants';
import { dismissPurchaseInboxDocument, fetchPurchaseInbox, fetchPurchaseInvoices, getPurchaseInboxQueryKey, getPurchaseInvoicesQueryKey, setPurchaseInvoiceStatus } from '../purchases.services';
import { usePurchaseUpload } from '../use-purchase-upload';

const STATUS_FILTERS: (PurchaseInvoiceStatus | undefined)[] = [undefined, 'pending', 'paid'];

export function PurchasesPage() {
  const { t, getLocale, formatDate } = useI18n();
  const params = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = createSignal('');
  const initialStatus = STATUS_FILTERS.find(status => status !== undefined && status === searchParams.status);
  const [filters, setFilters] = createSignal<ActiveFilter[]>(initialStatus ? [{ fieldId: 'status', value: [initialStatus] }] : []);
  const [isAddOpen, setIsAddOpen] = createSignal(false);

  const query = useQuery(() => ({ queryKey: getPurchaseInvoicesQueryKey({ organizationId: params.organizationId }), queryFn: () => fetchPurchaseInvoices({ organizationId: params.organizationId }) }));

  // Invoices forwarded by email (or uploaded and not reviewed), already read: waiting to be registered
  const inboxQuery = useQuery(() => ({ queryKey: getPurchaseInboxQueryKey({ organizationId: params.organizationId }), queryFn: () => fetchPurchaseInbox({ organizationId: params.organizationId }) }));
  const inbox = () => inboxQuery.data?.readings ?? [];
  const dismissInboxMutation = createMutation(() => ({
    mutationFn: (documentId: string) => dismissPurchaseInboxDocument({ organizationId: params.organizationId, documentId }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: getPurchaseInboxQueryKey({ organizationId: params.organizationId }) }),
  }));

  const filterFields = createMemo((): FilterField[] => [
    {
      id: 'kind',
      type: 'multi-select',
      label: t('purchases.table.kind'),
      icon: 'i-tabler-file-description',
      options: PURCHASE_DOCUMENT_KINDS.map(kind => ({ value: kind, label: t(PURCHASE_DOCUMENT_KIND_LABEL_I18N_KEYS[kind]) })),
    },
    {
      id: 'status',
      type: 'multi-select',
      label: t('purchases.filter.label'),
      icon: 'i-tabler-progress-check',
      options: STATUS_FILTERS.filter((status): status is PurchaseInvoiceStatus => status !== undefined).map(status => ({ value: status, label: t(PURCHASE_STATUS_LABEL_I18N_KEYS[status]) })),
    },
    {
      id: 'category',
      type: 'multi-select',
      label: t('purchases.table.category'),
      icon: 'i-tabler-category',
      options: Object.entries(EXPENSE_CATEGORY_LABEL_I18N_KEYS).map(([value, key]) => ({ value, label: t(key) })),
    },
    { id: 'date', type: 'date-range', label: t('purchases.table.date'), icon: 'i-tabler-calendar' },
  ]);
  const purchaseInvoices = () => query.data?.purchaseInvoices ?? [];
  const rows = createMemo(() => {
    const term = search().trim().toLowerCase();
    const kinds = getActiveFilter(filters(), 'kind')?.value;
    const statuses = getActiveFilter(filters(), 'status')?.value;
    const categories = getActiveFilter(filters(), 'category')?.value;
    const dateRange = getActiveFilter(filters(), 'date')?.value;

    return purchaseInvoices()
      .filter(purchaseInvoice => !Array.isArray(kinds) || kinds.length === 0 || kinds.includes(purchaseInvoice.kind))
      .filter(purchaseInvoice => !Array.isArray(statuses) || statuses.length === 0 || statuses.includes(purchaseInvoice.status))
      .filter(purchaseInvoice => !Array.isArray(categories) || categories.length === 0 || categories.includes(purchaseInvoice.category))
      .filter(purchaseInvoice => !isDateRangeValue(dateRange) || dateIsInRange(purchaseInvoice.issueDate, dateRange))
      .filter(purchaseInvoice => `${purchaseInvoice.supplierName ?? ''} ${purchaseInvoice.number} ${purchaseInvoice.supplierTaxId ?? ''}`.toLowerCase().includes(term));
  });

  const money = (purchaseInvoice: PurchaseInvoice, minor: number) => new Intl.NumberFormat(getLocale(), { style: 'currency', currency: purchaseInvoice.currency }).format(minor / 100);
  const linkWithReturn = useLinkWithReturn();
  const editorHref = (childPath: string) => linkWithReturn(getOrganizationRouteChildHref({ organizationId: params.organizationId, routeId: 'purchases', childPath }));

  const { uploadFiles, reviewDocuments, manualHref, openFilePicker, openPhoto, isBusy, elements: uploadElements } = usePurchaseUpload({ organizationId: () => params.organizationId });
  const salesImport = useSalesImportUpload({ organizationId: () => params.organizationId });

  // Invoices dropped anywhere on this page are uploaded and read as purchases, not as plain documents
  usePageFilesDrop(files => void uploadFiles(files), { description: () => t('purchases.drop-area') });

  const statusMutation = createMutation(() => ({
    mutationFn: ({ purchaseInvoiceId, status }: { purchaseInvoiceId: string; status: PurchaseInvoiceStatus }) => setPurchaseInvoiceStatus({ organizationId: params.organizationId, purchaseInvoiceId, status }),
    onSuccess: async () => Promise.all([
      queryClient.invalidateQueries({ queryKey: getPurchaseInvoicesQueryKey({ organizationId: params.organizationId }) }),
      queryClient.invalidateQueries({ queryKey: getDueDatesQueryKey({ organizationId: params.organizationId }) }),
    ]),
    onError: () => createToast({ type: 'error', message: t('purchases.toast.error') }),
  }));

  return (
    <main class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">{t('purchases.title')}</h1>
          <p class="page-description">{t('purchases.description')}</p>
        </div>
        <div>
          <Button size="sm" class="gap-1.5 max-sm:w-full" isLoading={isBusy()} onClick={() => setIsAddOpen(true)}>
            <div class="i-tabler-plus size-4" />
            {t('purchases.add.button')}
          </Button>
          <AddPurchaseDialog open={isAddOpen()} onOpenChange={setIsAddOpen} onUpload={openFilePicker} onPhoto={openPhoto} manualHref={manualHref()} />
          {uploadElements}
        </div>
      </div>

      <Show when={inbox().length > 0}>
        <section class="mt-4 rounded-xl border border-violet-500/25 bg-violet-500/6 p-4">
          <div class="flex flex-wrap items-center gap-3">
            <div class="i-tabler-inbox size-5 shrink-0 text-violet-600 dark:text-violet-300" />
            <div class="min-w-0 flex-1">
              <p class="font-medium">{t('purchases.inbox.title', { count: inbox().length })}</p>
              <p class="text-sm text-muted-foreground">{t('purchases.inbox.description')}</p>
            </div>
            <Button size="sm" class="gap-1.5" onClick={() => reviewDocuments(inbox().filter(reading => reading.extraction?.direction !== 'issued').map(({ documentId }) => documentId))}>
              <div class="i-tabler-eye-check size-4" />
              {t('purchases.inbox.review')}
            </Button>
          </div>
          <ul class="mt-3 flex flex-col gap-1.5">
            <For each={inbox().slice(0, 5)}>
              {reading => (
                <li class="flex items-center gap-2 text-sm">
                  <div class={cn('size-4 shrink-0', reading.status === 'pending' || reading.status === 'reading' ? 'i-tabler-loader-2 animate-spin text-muted-foreground' : reading.status === 'failed' ? 'i-tabler-alert-triangle text-orange-600' : 'i-tabler-file-invoice text-violet-600 dark:text-violet-300')} />
                  {/* An invoice the organization issued itself goes to the sales, never to the expenses */}
                  <button type="button" class="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => (reading.extraction?.direction === 'issued' ? salesImport.reviewDocuments([reading.documentId]) : reviewDocuments([reading.documentId]))}>
                    {reading.extraction?.counterparty.name ?? reading.documentName ?? reading.documentId}
                    <Show when={reading.extraction?.draft.number}>
                      {getNumber => <span class="ml-1.5 text-muted-foreground">{getNumber()}</span>}
                    </Show>
                    <Show when={reading.extraction?.direction === 'issued'}>
                      <span class="ml-2 rounded-full bg-emerald-500/10 px-1.5 py-px text-xs text-emerald-700 dark:text-emerald-300">{t('purchases.inbox.is-sale')}</span>
                    </Show>
                  </button>
                  <Button variant="ghost" size="sm" class="h-7 text-xs text-muted-foreground" onClick={() => dismissInboxMutation.mutate(reading.documentId)}>{t('purchases.inbox.dismiss')}</Button>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>

      <div class="mt-4" />
      <TableToolbar search={search()} onSearchChange={setSearch} searchPlaceholder={t('invoicing.common.search')} fields={filterFields()} filters={filters()} onFiltersChange={setFilters} />

      <Show
        when={query.isLoading || rows().length > 0}
        fallback={(
          <div class="rounded-xl border border-dashed py-14 text-center">
            <div class="i-tabler-file-invoice mx-auto mb-3 size-9 text-muted-foreground/50" />
            <p class="font-medium">{t('purchases.empty.title')}</p>
            <p class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t('purchases.empty.description')}</p>
            <Button size="sm" class="mt-4 gap-1.5" isLoading={isBusy()} onClick={() => setIsAddOpen(true)}>
              <div class="i-tabler-plus size-4" />
              {t('purchases.add.button')}
            </Button>
          </div>
        )}
      >
        <CatalogTable headers={[
          { label: t('purchases.table.date') },
          { label: t('purchases.table.kind') },
          { label: t('purchases.table.supplier') },
          { label: t('purchases.table.number') },
          { label: t('purchases.table.category') },
          { label: t('purchases.table.vat'), class: 'text-right' },
          { label: t('purchases.table.total'), class: 'text-right' },
          { label: t('purchases.table.status') },
          { label: '', class: 'w-14' },
        ]}
        >
          <For each={rows()}>
            {purchaseInvoice => (
              <CatalogRow onClick={() => navigate(editorHref(`${purchaseInvoice.id}/edit`))}>
                <CatalogCell class="whitespace-nowrap text-muted-foreground">{formatDate(purchaseInvoice.issueDate)}</CatalogCell>
                <CatalogCell>
                  <span class={cn('rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', PURCHASE_DOCUMENT_KIND_BADGE_CLASSES[purchaseInvoice.kind])}>
                    {t(PURCHASE_DOCUMENT_KIND_LABEL_I18N_KEYS[purchaseInvoice.kind])}
                  </span>
                </CatalogCell>
                <CatalogCell primary>
                  <div class="flex min-w-0 items-center gap-2.5">
                    <EntityIcon icon={purchaseInvoice.supplierIcon} color={purchaseInvoice.supplierIconColor} fallback="i-tabler-building" />
                    <div class="min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="font-medium">{purchaseInvoice.supplierName}</span>
                        <Show when={purchaseInvoice.documentId}>
                          <div class="i-tabler-paperclip size-3.5 text-muted-foreground" title={t('purchases.table.has-document')} />
                        </Show>
                      </div>
                      <div class="text-xs text-muted-foreground">{purchaseInvoice.supplierTaxId || '—'}</div>
                    </div>
                  </div>
                </CatalogCell>
                <CatalogCell class="text-muted-foreground">{purchaseInvoice.number}</CatalogCell>
                <CatalogCell class="text-muted-foreground">{t(EXPENSE_CATEGORY_LABEL_I18N_KEYS[purchaseInvoice.category])}</CatalogCell>
                <CatalogCell class="text-right tabular-nums text-muted-foreground">{money(purchaseInvoice, purchaseInvoice.taxMinor)}</CatalogCell>
                <CatalogCell class="text-right font-medium tabular-nums">{money(purchaseInvoice, getInvoicePayableMinor(purchaseInvoice))}</CatalogCell>
                <CatalogCell>
                  <button
                    type="button"
                    title={purchaseInvoice.status === 'pending' ? t('purchases.actions.mark-paid') : t('purchases.actions.mark-pending')}
                    class={cn('rounded-full px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80', PURCHASE_STATUS_BADGE_CLASSES[purchaseInvoice.status])}
                    onClick={(event) => {
                      event.stopPropagation();
                      statusMutation.mutate({ purchaseInvoiceId: purchaseInvoice.id, status: purchaseInvoice.status === 'pending' ? 'paid' : 'pending' });
                    }}
                  >
                    {t(PURCHASE_STATUS_LABEL_I18N_KEYS[purchaseInvoice.status])}
                  </button>
                </CatalogCell>
                <CatalogCell>
                  <PurchaseRowActions organizationId={params.organizationId} purchaseInvoice={purchaseInvoice} />
                </CatalogCell>
              </CatalogRow>
            )}
          </For>
        </CatalogTable>
      </Show>
    </main>
  );
}
