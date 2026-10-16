import type { InvoicingProduct } from '../invoicing.types';
import type { ActiveFilter, FilterField } from '@/modules/ui/components/table-filters';
import { useParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { createMemo, createSignal } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { queryClient } from '@/modules/shared/query/query-client';
import { createToast } from '@/modules/ui/components/sonner';
import { matchesSelectedFilter, toDistinctFilterOptions } from '@/modules/ui/components/table-filters';
import { CatalogPage } from '../components/catalog-page';
import { getProductsQueryKey, ProductForm } from '../components/product-form';
import { ProductsTable } from '../components/products-table';
import { deleteProduct, fetchProducts } from '../invoicing.services';

// Owner filter value of our own products (the others are contact ids)
const OWN_PRODUCTS = 'own';

/** Every product: our own catalog and the ones of each supplier or customer, which can also be managed from their page */
export function ProductsPage() {
  const { t } = useI18n();
  const params = useParams();
  const [editing, setEditing] = createSignal<InvoicingProduct | null>(null);
  const [formOpen, setFormOpen] = createSignal(false);
  const [search, setSearch] = createSignal('');
  const [filters, setFilters] = createSignal<ActiveFilter[]>([]);
  const query = useQuery(() => ({ queryKey: getProductsQueryKey({ organizationId: params.organizationId }), queryFn: () => fetchProducts({ organizationId: params.organizationId }) }));
  const allProducts = () => query.data?.products ?? [];

  // Options taken from the catalog itself: only the rates, units and owners in use
  const filterFields = createMemo((): FilterField[] => [
    { id: 'owner', type: 'multi-select', label: t('invoicing.products.owner.label'), icon: 'i-tabler-building-store', options: toDistinctFilterOptions(allProducts(), product => (product.contactId === null ? { value: OWN_PRODUCTS, label: t('invoicing.products.owner.own') } : { value: product.contactId, label: product.contactName ?? '' })) },
    { id: 'tax', type: 'multi-select', label: t('invoicing.products.table.tax'), icon: 'i-tabler-percentage', options: toDistinctFilterOptions(allProducts(), product => ({ value: String(product.taxRateBps), label: `${product.taxRateBps / 100}%` })) },
    { id: 'unit', type: 'multi-select', label: t('invoicing.products.form.unit'), icon: 'i-tabler-ruler-measure', options: toDistinctFilterOptions(allProducts(), product => ({ value: product.unit, label: product.unit })) },
  ]);

  const products = createMemo(() => allProducts()
    .filter(product => matchesSelectedFilter(filters(), 'owner', product.contactId ?? OWN_PRODUCTS) && matchesSelectedFilter(filters(), 'tax', String(product.taxRateBps)) && matchesSelectedFilter(filters(), 'unit', product.unit))
    .filter(product => `${product.name} ${product.description ?? ''} ${product.unit} ${product.contactName ?? ''}`.toLowerCase().includes(search().trim().toLowerCase())));

  const openForm = (product: InvoicingProduct | null) => {
    setEditing(product);
    setFormOpen(true);
  };

  const close = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const remove = async (product: InvoicingProduct) => {
    try {
      await deleteProduct({ organizationId: params.organizationId, productId: product.id });
      await queryClient.invalidateQueries({ queryKey: getProductsQueryKey({ organizationId: params.organizationId }) });
      createToast({ type: 'success', message: t('invoicing.products.toast.deleted') });
    } catch {
      createToast({ type: 'error', message: t('invoicing.products.toast.delete-error') });
    }
  };

  return (
    <CatalogPage
      title={t('invoicing.products.title')}
      description={t('invoicing.products.description')}
      actionLabel={t('invoicing.products.new')}
      formOpen={formOpen()}
      onFormOpenChange={open => (open ? openForm(null) : close())}
      editing={editing() !== null}
      editLabel={t('invoicing.products.edit')}
      search={search()}
      onSearchChange={setSearch}
      filterFields={filterFields()}
      filters={filters()}
      onFiltersChange={setFilters}
      loading={query.isLoading}
      empty={products().length === 0}
      form={<ProductForm organizationId={params.organizationId} product={editing()} onDone={close} />}
    >
      <ProductsTable products={products()} showOwner onEdit={openForm} onDelete={remove} />
    </CatalogPage>
  );
}
