import type { PurchaseInvoice, PurchaseInvoiceStatus } from '../purchases.types';
import type { ActiveFilter, FilterField } from '@/modules/ui/components/table-filters';
import { A, useNavigate, useParams, useSearchParams } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { uploadDocument } from '@/modules/documents/documents.services';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { CatalogCell, CatalogRow, CatalogTable } from '@/modules/invoicing/components/catalog-page';
import { InvoicesTabs } from '@/modules/invoicing/components/invoices-tabs';
import { getInvoicePayableMinor } from '@/modules/invoicing/invoicing.models';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';
import { createToast } from '@/modules/ui/components/sonner';
import { dateIsInRange, getActiveFilter, isDateRangeValue } from '@/modules/ui/components/table-filters';
import { TableToolbar } from '@/modules/ui/components/table-toolbar';
import { getOrganizationRouteChildHref } from '@/modules/ui/navigation/organization-navigation';
import { EXPENSE_CATEGORY_LABEL_I18N_KEYS, EXTRACTABLE_FILE_ACCEPT, PURCHASE_STATUS_BADGE_CLASSES, PURCHASE_STATUS_LABEL_I18N_KEYS } from '../purchases.constants';
import { fetchPurchaseInvoices, getPurchaseInvoicesQueryKey, setPurchaseInvoiceStatus } from '../purchases.services';

const STATUS_FILTERS: (PurchaseInvoiceStatus | undefined)[] = [undefined, 'pending', 'paid'];

export function PurchasesPage() {
  const { t, getLocale, formatDate } = useI18n();
  const params = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = createSignal('');
  const initialStatus = STATUS_FILTERS.find(status => status !== undefined && status === searchParams.status);
  const [filters, setFilters] = createSignal<ActiveFilter[]>(initialStatus ? [{ fieldId: 'status', value: [initialStatus] }] : []);
  const [isUploading, setIsUploading] = createSignal(false);
  let fileInput: HTMLInputElement | undefined;

  const query = useQuery(() => ({ queryKey: getPurchaseInvoicesQueryKey({ organizationId: params.organizationId }), queryFn: () => fetchPurchaseInvoices({ organizationId: params.organizationId }) }));

  const filterFields = createMemo((): FilterField[] => [
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
    const statuses = getActiveFilter(filters(), 'status')?.value;
    const categories = getActiveFilter(filters(), 'category')?.value;
    const dateRange = getActiveFilter(filters(), 'date')?.value;

    return purchaseInvoices()
      .filter(purchaseInvoice => !Array.isArray(statuses) || statuses.length === 0 || statuses.includes(purchaseInvoice.status))
      .filter(purchaseInvoice => !Array.isArray(categories) || categories.length === 0 || categories.includes(purchaseInvoice.category))
      .filter(purchaseInvoice => !isDateRangeValue(dateRange) || dateIsInRange(purchaseInvoice.issueDate, dateRange))
      .filter(purchaseInvoice => `${purchaseInvoice.supplierName ?? ''} ${purchaseInvoice.number} ${purchaseInvoice.supplierTaxId ?? ''}`.toLowerCase().includes(term));
  });

  const money = (purchaseInvoice: PurchaseInvoice, minor: number) => new Intl.NumberFormat(getLocale(), { style: 'currency', currency: purchaseInvoice.currency }).format(minor / 100);
  const editorHref = (childPath: string) => getOrganizationRouteChildHref({ organizationId: params.organizationId, routeId: 'purchases', childPath });

  // Files are uploaded as documents first, then reviewed one after the other in the editor prefilled by the AI
  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    setIsUploading(true);

    try {
      const documentIds: string[] = [];
      for (const file of files) {
        const { document } = await uploadDocument({ file, organizationId: params.organizationId });
        documentIds.push(document.id);
      }

      const [first, ...queue] = documentIds;
      const search = new URLSearchParams({ documentId: first! });
      if (queue.length > 0) {
        search.set('queue', queue.join(','));
      }
      navigate(`${editorHref('new')}?${search.toString()}`);
    } catch {
      createToast({ type: 'error', message: t('purchases.upload.error') });
    } finally {
      setIsUploading(false);
    }
  };

  const statusMutation = createMutation(() => ({
    mutationFn: ({ purchaseInvoiceId, status }: { purchaseInvoiceId: string; status: PurchaseInvoiceStatus }) => setPurchaseInvoiceStatus({ organizationId: params.organizationId, purchaseInvoiceId, status }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: getPurchaseInvoicesQueryKey({ organizationId: params.organizationId }) }),
    onError: () => createToast({ type: 'error', message: t('purchases.toast.error') }),
  }));

  return (
    <main class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">{t('invoicing.invoices.title')}</h1>
          <p class="page-description">{t('purchases.description')}</p>
        </div>
        <div class="flex items-center gap-2">
          <Button as={A} variant="outline" size="sm" href={editorHref('new')} class="gap-1.5">
            <div class="i-tabler-pencil-plus size-4" />
            {t('purchases.new-manual')}
          </Button>
          <Button size="sm" class="gap-1.5" isLoading={isUploading()} onClick={() => fileInput?.click()}>
            <div class="i-tabler-sparkles size-4" />
            {t('purchases.upload.button')}
          </Button>
          <input
            ref={fileInput}
            type="file"
            class="hidden"
            multiple
            accept={EXTRACTABLE_FILE_ACCEPT}
            onChange={(event) => {
              const files = [...(event.currentTarget.files ?? [])];
              event.currentTarget.value = '';
              void uploadFiles(files);
            }}
          />
        </div>
      </div>

      <InvoicesTabs />

      <TableToolbar search={search()} onSearchChange={setSearch} searchPlaceholder={t('invoicing.common.search')} fields={filterFields()} filters={filters()} onFiltersChange={setFilters} />

      <Show
        when={query.isLoading || rows().length > 0}
        fallback={(
          <div class="rounded-xl border border-dashed py-14 text-center">
            <div class="i-tabler-file-invoice mx-auto mb-3 size-9 text-muted-foreground/50" />
            <p class="font-medium">{t('purchases.empty.title')}</p>
            <p class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t('purchases.empty.description')}</p>
            <Button size="sm" class="mt-4 gap-1.5" isLoading={isUploading()} onClick={() => fileInput?.click()}>
              <div class="i-tabler-sparkles size-4" />
              {t('purchases.upload.button')}
            </Button>
          </div>
        )}
      >
        <CatalogTable headers={[
          { label: t('purchases.table.date') },
          { label: t('purchases.table.supplier') },
          { label: t('purchases.table.number') },
          { label: t('purchases.table.category') },
          { label: t('purchases.table.vat'), class: 'text-right' },
          { label: t('purchases.table.total'), class: 'text-right' },
          { label: t('purchases.table.status') },
        ]}
        >
          <For each={rows()}>
            {purchaseInvoice => (
              <CatalogRow onClick={() => navigate(editorHref(`${purchaseInvoice.id}/edit`))}>
                <CatalogCell class="whitespace-nowrap text-muted-foreground">{formatDate(purchaseInvoice.issueDate)}</CatalogCell>
                <CatalogCell>
                  <div class="flex items-center gap-2">
                    <span class="font-medium">{purchaseInvoice.supplierName}</span>
                    <Show when={purchaseInvoice.documentId}>
                      <div class="i-tabler-paperclip size-3.5 text-muted-foreground" title={t('purchases.table.has-document')} />
                    </Show>
                  </div>
                  <div class="text-xs text-muted-foreground">{purchaseInvoice.supplierTaxId || '—'}</div>
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
              </CatalogRow>
            )}
          </For>
        </CatalogTable>
      </Show>
    </main>
  );
}
