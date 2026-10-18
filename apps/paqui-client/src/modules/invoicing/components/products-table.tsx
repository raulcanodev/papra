import type { InvoicingProduct } from '../invoicing.types';
import { A, useParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { createMemo, For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { fetchProductCostTotals, getPricingQueryKey } from '@/modules/pricing/pricing.services';
import { EntityIcon } from '@/modules/ui/components/entity-icon';
import { RowActions } from '@/modules/ui/components/row-actions';
import { getOrganizationContactHref } from '@/modules/ui/navigation/organization-navigation';
import { useLinkWithReturn } from '@/modules/ui/navigation/return-to';
import { CatalogCell, CatalogRow, CatalogTable } from './catalog-page';
import { PRODUCT_FALLBACK_ICON } from './product-form';
import { ProductThumbnail } from './product-photo';

/** The products table of the catalog and of each contact page: a click edits, the last column has edit and delete */
export function ProductsTable(props: {
  products: InvoicingProduct[];
  /** The catalog shows whose product it is; a contact page does not need to */
  showOwner: boolean;
  onEdit: (product: InvoicingProduct) => void;
  onDelete: (product: InvoicingProduct) => unknown;
}) {
  const { t } = useI18n();
  const params = useParams();
  const linkWithReturn = useLinkWithReturn();
  const money = (product: InvoicingProduct, amountMinor = product.unitPriceMinor) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: product.currency }).format(amountMinor / 100);
  const costsQuery = useQuery(() => ({ queryKey: [...getPricingQueryKey({ organizationId: params.organizationId }), 'product-cost-totals'], queryFn: () => fetchProductCostTotals({ organizationId: params.organizationId }) }));
  const costByProductId = createMemo(() => new Map((costsQuery.data?.costs ?? []).map(cost => [cost.productId, cost.totalMinor])));

  return (
    <CatalogTable headers={[
      { label: t('invoicing.products.table.product') },
      ...(props.showOwner ? [{ label: t('invoicing.products.owner.label') }] : []),
      { label: t('invoicing.products.form.unit') },
      { label: t('invoicing.products.form.price'), class: 'text-right' },
      { label: t('pricing.costs.cost-column'), class: 'text-right' },
      { label: t('invoicing.products.table.tax'), class: 'text-right' },
      { label: '', class: 'w-14' },
    ]}
    >
      <For each={props.products}>
        {product => (
          <CatalogRow onClick={() => props.onEdit(product)}>
            <CatalogCell>
              <div class="flex items-center gap-2.5">
                <ProductThumbnail organizationId={params.organizationId} imageDocumentId={product.imageDocumentId} fallback={<EntityIcon icon={product.icon} color={product.iconColor} fallback={PRODUCT_FALLBACK_ICON} />} />
                <div class="min-w-0">
                  <div class="truncate font-medium">{product.name}</div>
                  <div class="max-w-lg truncate text-xs text-muted-foreground">{product.description || t('invoicing.products.no-description')}</div>
                </div>
              </div>
            </CatalogCell>
            <Show when={props.showOwner}>
              <CatalogCell class="text-muted-foreground">
                <Show when={product.contactId} fallback={t('invoicing.products.owner.own')}>
                  {contactId => (
                    <A href={linkWithReturn(getOrganizationContactHref({ organizationId: params.organizationId, contactId: contactId() }))} class="hover:text-foreground hover:underline" onClick={event => event.stopPropagation()}>
                      {product.contactName}
                    </A>
                  )}
                </Show>
              </CatalogCell>
            </Show>
            <CatalogCell class="text-muted-foreground">{product.unit}</CatalogCell>
            <CatalogCell class="text-right tabular-nums">{money(product)}</CatalogCell>
            <CatalogCell class="text-right tabular-nums text-muted-foreground">
              {costByProductId().has(product.id) ? money(product, costByProductId().get(product.id)) : '—'}
            </CatalogCell>
            <CatalogCell class="text-right tabular-nums">{`${product.taxRateBps / 100}%`}</CatalogCell>
            <CatalogCell>
              <RowActions itemName={product.name} onEdit={() => props.onEdit(product)} onDelete={() => props.onDelete(product)} deleteMessage={t('invoicing.products.delete-message')} />
            </CatalogCell>
          </CatalogRow>
        )}
      </For>
    </CatalogTable>
  );
}
