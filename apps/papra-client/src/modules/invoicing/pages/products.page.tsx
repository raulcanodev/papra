/* eslint-disable style/max-statements-per-line */
import type { ProductInput } from '../invoicing.types';
import type { EntityCustomPropertiesInput } from '@/modules/custom-properties/custom-properties.types';
import type { ActiveFilter, FilterField } from '@/modules/ui/components/table-filters';
import { useParams } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createMemo, createSignal, For } from 'solid-js';
import { EntityCustomPropertiesFields, invalidateEntityCustomProperties } from '@/modules/custom-properties/components/entity-custom-properties-fields.component';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { queryClient } from '@/modules/shared/query/query-client';
import { Button } from '@/modules/ui/components/button';
import { createToast } from '@/modules/ui/components/sonner';
import { matchesSelectedFilter, toDistinctFilterOptions } from '@/modules/ui/components/table-filters';
import { TextField } from '@/modules/ui/components/textfield';
import { CatalogCell, CatalogPage, CatalogRow, CatalogTable, FormField, SaveButton } from '../components/catalog-page';
import { createProduct, fetchProducts, updateProduct } from '../invoicing.services';

const empty = (): ProductInput => ({ name: '', description: null, unit: 'unidad', unitPriceMinor: 0, currency: 'EUR', taxRateBps: 2100 });
export function ProductsPage() {
  const { t } = useI18n();
  const params = useParams();
  const [value, setValue] = createSignal(empty());
  const [editingId, setEditingId] = createSignal<string | null>(null); const [customProperties, setCustomProperties] = createSignal<EntityCustomPropertiesInput>({});
  const [formOpen, setFormOpen] = createSignal(false);
  const [search, setSearch] = createSignal('');
  const query = useQuery(() => ({ queryKey: ['invoicing', params.organizationId, 'products'], queryFn: () => fetchProducts({ organizationId: params.organizationId }) }));
  const [filters, setFilters] = createSignal<ActiveFilter[]>([]);
  const allProducts = () => query.data?.products ?? [];
  // Options taken from the catalog itself: only the rates and units in use
  const filterFields = createMemo((): FilterField[] => [
    { id: 'tax', type: 'multi-select', label: t('invoicing.products.table.tax'), icon: 'i-tabler-percentage', options: toDistinctFilterOptions(allProducts(), product => ({ value: String(product.taxRateBps), label: `${product.taxRateBps / 100}%` })) },
    { id: 'unit', type: 'multi-select', label: t('invoicing.products.form.unit'), icon: 'i-tabler-ruler-measure', options: toDistinctFilterOptions(allProducts(), product => ({ value: product.unit, label: product.unit })) },
  ]);
  const products = createMemo(() => allProducts()
    .filter(product => matchesSelectedFilter(filters(), 'tax', String(product.taxRateBps)) && matchesSelectedFilter(filters(), 'unit', product.unit))
    .filter(product => `${product.name} ${product.description ?? ''} ${product.unit}`.toLowerCase().includes(search().trim().toLowerCase())));
  const reset = () => {
    setValue(empty()); setEditingId(null); setCustomProperties({}); setFormOpen(false);
  };
  const edit = (product: NonNullable<typeof query.data>['products'][number]) => {
    setCustomProperties({}); setEditingId(product.id); setValue({ name: product.name, description: product.description, unit: product.unit, unitPriceMinor: product.unitPriceMinor, currency: product.currency, taxRateBps: product.taxRateBps }); setFormOpen(true);
  };
  const mutation = createMutation(() => ({ mutationFn: () => editingId() ? updateProduct({ organizationId: params.organizationId, productId: editingId()!, product: { ...value(), customProperties: customProperties() } }) : createProduct({ organizationId: params.organizationId, product: { ...value(), customProperties: customProperties() } }), onSuccess: async () => {
    reset(); await invalidateEntityCustomProperties({ organizationId: params.organizationId, entityType: 'product' }); await queryClient.invalidateQueries({ queryKey: ['invoicing', params.organizationId, 'products'] }); createToast({ type: 'success', message: t('invoicing.products.toast.saved') });
  }, onError: () => createToast({ type: 'error', message: t('invoicing.products.toast.error') }) }));
  return (
    <CatalogPage
      title={t('invoicing.products.title')}
      description={t('invoicing.products.description')}
      actionLabel={t('invoicing.products.new')}
      formOpen={formOpen()}
      onFormOpenChange={open => open ? setFormOpen(true) : reset()}
      editing={editingId() !== null}
      editLabel={t('invoicing.products.edit')}
      search={search()}
      onSearchChange={setSearch}
      filterFields={filterFields()}
      filters={filters()}
      onFiltersChange={setFilters}
      loading={query.isLoading}
      empty={products().length === 0}
      form={(
        <form
          class="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault(); if (value().name.trim()) {
              mutation.mutate();
            }
          }}
        >
          <FormField label={t('invoicing.common.name')} class="sm:col-span-2"><TextField value={value().name} onInput={event => setValue(current => ({ ...current, name: event.currentTarget.value }))} /></FormField>
          <FormField label={t('invoicing.products.form.price')}><TextField type="number" min="0" step="0.01" value={value().unitPriceMinor / 100} onInput={event => setValue(current => ({ ...current, unitPriceMinor: Math.round(Number(event.currentTarget.value) * 100) }))} /></FormField>
          <FormField label={t('invoicing.products.form.unit')}><TextField value={value().unit} onInput={event => setValue(current => ({ ...current, unit: event.currentTarget.value }))} /></FormField>
          <FormField label={t('invoicing.products.form.tax')}><TextField type="number" min="0" max="100" step="0.01" value={value().taxRateBps / 100} onInput={event => setValue(current => ({ ...current, taxRateBps: Math.round(Number(event.currentTarget.value) * 100) }))} /></FormField>
          <EntityCustomPropertiesFields organizationId={params.organizationId} entityType="product" entityId={editingId()} value={customProperties()} onChange={setCustomProperties} />
          <SaveButton loading={mutation.isPending} editing={editingId() !== null} onCancel={reset} />
        </form>
      )}
    >
      <CatalogTable headers={[{ label: t('invoicing.products.table.product') }, { label: t('invoicing.products.form.unit') }, { label: t('invoicing.products.form.price'), class: 'text-right' }, { label: t('invoicing.products.table.tax'), class: 'text-right' }, { label: '', class: 'w-16' }]}>
        <For each={products()}>
          {product => (
            <CatalogRow onClick={() => edit(product)}>
              <CatalogCell>
                <div class="font-medium">{product.name}</div>
                <div class="text-xs text-muted-foreground truncate max-w-lg">{product.description || t('invoicing.products.no-description')}</div>
              </CatalogCell>
              <CatalogCell class="text-muted-foreground">{product.unit}</CatalogCell>
              <CatalogCell class="text-right tabular-nums">{new Intl.NumberFormat('es-ES', { style: 'currency', currency: product.currency }).format(product.unitPriceMinor / 100)}</CatalogCell>
              <CatalogCell class="text-right tabular-nums">
                {product.taxRateBps / 100}
                %
              </CatalogCell>
              <CatalogCell>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('invoicing.products.edit')}
                  onClick={(event) => {
                    event.stopPropagation(); edit(product);
                  }}
                >
                  <div class="i-tabler-pencil size-4" />
                </Button>
              </CatalogCell>
            </CatalogRow>
          )}
        </For>
      </CatalogTable>
    </CatalogPage>
  );
}
