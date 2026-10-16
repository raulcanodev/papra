import type { PurchaseInvoice } from '@/modules/purchases/purchases.types';
import type { ActiveFilter, FilterField } from '@/modules/ui/components/table-filters';
import { useParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { CatalogCell, CatalogRow, CatalogTable } from '@/modules/invoicing/components/catalog-page';
import { getInvoicePayableMinor } from '@/modules/invoicing/invoicing.models';
import { EXPENSE_CATEGORY_LABEL_I18N_KEYS, PURCHASE_DOCUMENT_KIND_LABEL_I18N_KEYS, PURCHASE_STATUS_BADGE_CLASSES, PURCHASE_STATUS_LABEL_I18N_KEYS } from '@/modules/purchases/purchases.constants';
import { cn } from '@/modules/shared/style/cn';
import { EntityIcon } from '@/modules/ui/components/entity-icon';
import { RowActions } from '@/modules/ui/components/row-actions';
import { createToast } from '@/modules/ui/components/sonner';
import { dateIsInRange, getActiveFilter, isDateRangeValue } from '@/modules/ui/components/table-filters';
import { TableToolbar } from '@/modules/ui/components/table-toolbar';
import { ClientModulePage } from '../../components/client-module-page.component';
import { downloadClientPurchaseDocument, fetchClientPurchaseInvoices } from './client-purchases.services';

/** The invoices a client company received, with their file: the same table its members see, read only */
export function ClientPurchasesPage() {
  const { t, getLocale, formatDate } = useI18n();
  const params = useParams();
  const [search, setSearch] = createSignal('');
  const [filters, setFilters] = createSignal<ActiveFilter[]>([]);

  const query = useQuery(() => ({
    queryKey: ['gestorias', params.gestoriaId, 'clients', params.organizationId, 'purchases'],
    queryFn: () => fetchClientPurchaseInvoices({ gestoriaId: params.gestoriaId, organizationId: params.organizationId }),
  }));

  const filterFields = createMemo((): FilterField[] => [
    {
      id: 'category',
      type: 'multi-select',
      label: t('purchases.table.category'),
      icon: 'i-tabler-category',
      options: Object.entries(EXPENSE_CATEGORY_LABEL_I18N_KEYS).map(([value, key]) => ({ value, label: t(key) })),
    },
    { id: 'date', type: 'date-range', label: t('purchases.table.date'), icon: 'i-tabler-calendar' },
  ]);

  const rows = createMemo(() => {
    const term = search().trim().toLowerCase();
    const categories = getActiveFilter(filters(), 'category')?.value;
    const dateRange = getActiveFilter(filters(), 'date')?.value;

    return (query.data?.purchaseInvoices ?? [])
      .filter(purchaseInvoice => !Array.isArray(categories) || categories.length === 0 || categories.includes(purchaseInvoice.category))
      .filter(purchaseInvoice => !isDateRangeValue(dateRange) || dateIsInRange(purchaseInvoice.issueDate, dateRange))
      .filter(purchaseInvoice => `${purchaseInvoice.supplierName ?? ''} ${purchaseInvoice.number} ${purchaseInvoice.supplierTaxId ?? ''}`.toLowerCase().includes(term));
  });

  const money = (purchaseInvoice: PurchaseInvoice, minor: number) => new Intl.NumberFormat(getLocale(), { style: 'currency', currency: purchaseInvoice.currency }).format(minor / 100);

  const download = async (purchaseInvoice: PurchaseInvoice) => {
    try {
      await downloadClientPurchaseDocument({
        gestoriaId: params.gestoriaId,
        organizationId: params.organizationId,
        purchaseInvoiceId: purchaseInvoice.id,
        fileName: `${purchaseInvoice.supplierName ?? ''} ${purchaseInvoice.number}`.trim(),
      });
    } catch {
      createToast({ type: 'error', message: t('gestorias.download.error') });
    }
  };

  return (
    <ClientModulePage module="purchases" description={t('gestorias.modules.purchases.description')}>
      {() => (
        <>
          <TableToolbar search={search()} onSearchChange={setSearch} searchPlaceholder={t('invoicing.common.search')} fields={filterFields()} filters={filters()} onFiltersChange={setFilters} />

          <Show when={!query.isLoading && rows().length === 0}>
            <div class="rounded-xl border border-dashed py-16 text-center">
              <div class="i-tabler-file-invoice mx-auto mb-3 size-9 text-muted-foreground/50" />
              <div class="font-medium">{t('gestorias.modules.purchases.empty')}</div>
            </div>
          </Show>

          <Show when={rows().length > 0}>
            <CatalogTable headers={[
              { label: t('purchases.table.date') },
              { label: t('purchases.table.supplier') },
              { label: t('purchases.table.number') },
              { label: t('purchases.table.category') },
              { label: t('gestorias.table.base'), class: 'text-right' },
              { label: t('purchases.table.vat'), class: 'text-right' },
              { label: t('purchases.table.total'), class: 'text-right' },
              { label: t('purchases.table.status') },
              { label: '', class: 'w-14' },
            ]}
            >
              <For each={rows()}>
                {purchaseInvoice => (
                  <CatalogRow onClick={purchaseInvoice.documentId ? () => void download(purchaseInvoice) : undefined}>
                    <CatalogCell class="whitespace-nowrap text-muted-foreground">{formatDate(purchaseInvoice.issueDate)}</CatalogCell>
                    <CatalogCell>
                      <div class="flex items-center gap-2.5">
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
                    <CatalogCell class="text-muted-foreground">
                      <div class="flex items-center gap-2">
                        <span>{purchaseInvoice.number}</span>
                        <Show when={purchaseInvoice.kind !== 'invoice'}>
                          <span class="rounded-full bg-muted px-2 py-0.5 text-xs whitespace-nowrap">{t(PURCHASE_DOCUMENT_KIND_LABEL_I18N_KEYS[purchaseInvoice.kind])}</span>
                        </Show>
                      </div>
                    </CatalogCell>
                    <CatalogCell class="text-muted-foreground">{t(EXPENSE_CATEGORY_LABEL_I18N_KEYS[purchaseInvoice.category])}</CatalogCell>
                    <CatalogCell class="text-right tabular-nums text-muted-foreground">{money(purchaseInvoice, purchaseInvoice.subtotalMinor)}</CatalogCell>
                    <CatalogCell class="text-right tabular-nums text-muted-foreground">{money(purchaseInvoice, purchaseInvoice.taxMinor)}</CatalogCell>
                    <CatalogCell class="text-right font-medium tabular-nums">{money(purchaseInvoice, getInvoicePayableMinor(purchaseInvoice))}</CatalogCell>
                    <CatalogCell>
                      <span class={cn('rounded-full px-2 py-0.5 text-xs font-medium', PURCHASE_STATUS_BADGE_CLASSES[purchaseInvoice.status])}>
                        {t(PURCHASE_STATUS_LABEL_I18N_KEYS[purchaseInvoice.status])}
                      </span>
                    </CatalogCell>
                    <CatalogCell>
                      <RowActions
                        itemName={`${purchaseInvoice.supplierName} ${purchaseInvoice.number}`}
                        actions={[{ label: t('gestorias.modules.purchases.download'), icon: 'i-tabler-download', disabled: !purchaseInvoice.documentId, onSelect: () => void download(purchaseInvoice) }]}
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
