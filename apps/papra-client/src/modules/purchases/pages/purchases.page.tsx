import type { PurchaseInvoice, PurchaseInvoiceStatus } from '../purchases.types';
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
import { TextField } from '@/modules/ui/components/textfield';
import { getOrganizationRouteChildHref } from '@/modules/ui/navigation/organization-navigation';
import { EXPENSE_CATEGORY_LABEL_I18N_KEYS, EXTRACTABLE_FILE_ACCEPT, PURCHASE_STATUS_BADGE_CLASSES, PURCHASE_STATUS_LABEL_I18N_KEYS } from '../purchases.constants';
import { fetchPurchaseInvoices, getPurchaseInvoicesQueryKey, setPurchaseInvoiceStatus } from '../purchases.services';

const STATUS_FILTERS: (PurchaseInvoiceStatus | undefined)[] = [undefined, 'pending', 'paid'];

export function PurchasesPage() {
  const { t, getLocale, formatDate } = useI18n();
  const params = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = createSignal('');
  const [isUploading, setIsUploading] = createSignal(false);
  let fileInput: HTMLInputElement | undefined;

  const query = useQuery(() => ({ queryKey: getPurchaseInvoicesQueryKey({ organizationId: params.organizationId }), queryFn: () => fetchPurchaseInvoices({ organizationId: params.organizationId }) }));

  const statusFilter = () => STATUS_FILTERS.find(status => status !== undefined && status === searchParams.status);
  const purchaseInvoices = () => query.data?.purchaseInvoices ?? [];
  const rows = createMemo(() => {
    const term = search().trim().toLowerCase();

    return purchaseInvoices()
      .filter(purchaseInvoice => !statusFilter() || purchaseInvoice.status === statusFilter())
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

      <div class="mb-3 flex flex-wrap items-center gap-2">
        <div class="relative w-full max-w-sm">
          <div class="i-tabler-search absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <TextField value={search()} onInput={event => setSearch(event.currentTarget.value)} placeholder={t('invoicing.common.search')} class="pl-9" />
        </div>
        <div class="flex gap-1 rounded-lg border p-0.5" role="tablist" aria-label={t('purchases.filter.label')}>
          <For each={STATUS_FILTERS}>
            {status => (
              <button
                type="button"
                role="tab"
                aria-selected={statusFilter() === status}
                class={cn('whitespace-nowrap rounded-md px-2.5 py-1 text-sm transition-colors', statusFilter() === status ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                onClick={() => setSearchParams({ status })}
              >
                {status ? t(PURCHASE_STATUS_LABEL_I18N_KEYS[status]) : t('purchases.filter.all')}
              </button>
            )}
          </For>
        </div>
      </div>

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
