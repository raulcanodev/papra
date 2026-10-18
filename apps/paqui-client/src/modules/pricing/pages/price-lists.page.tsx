import type { PriceListSummary } from '../pricing.types';
import { useNavigate, useParams } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createSignal, For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { CatalogCell, CatalogRow, CatalogTable, FormField } from '@/modules/invoicing/components/catalog-page';
import { queryClient } from '@/modules/shared/query/query-client';
import { Button } from '@/modules/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/modules/ui/components/dialog';
import { RowActions } from '@/modules/ui/components/row-actions';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField } from '@/modules/ui/components/textfield';
import { getOrganizationPriceListHref } from '@/modules/ui/navigation/organization-navigation';
import { usePriceListDownloads } from '../components/price-list-downloads';
import { ShippingRatesSection } from '../components/shipping-rates-section';
import { PricingImportDialog } from '../import/pricing-import-dialog';
import { formatRate } from '../pricing.models';
import { createPriceList, deletePriceList, duplicatePriceList, fetchPriceLists, getPricingQueryKey } from '../pricing.services';

export function getPriceListsQueryKey({ organizationId }: { organizationId: string }) {
  return [...getPricingQueryKey({ organizationId }), 'price-lists'];
}

/** Every price list with how many products and contacts it has, and the shipping rates they use */
export function PriceListsPage() {
  const { t } = useI18n();
  const params = useParams();
  const { downloadImage, downloadSpreadsheet } = usePriceListDownloads({ organizationId: () => params.organizationId });
  const navigate = useNavigate();
  // Creating and duplicating both only ask for a name
  const [naming, setNaming] = createSignal<{ source: PriceListSummary | null } | null>(null);
  const [name, setName] = createSignal('');
  const [isImporting, setIsImporting] = createSignal(false);

  const query = useQuery(() => ({ queryKey: getPriceListsQueryKey({ organizationId: params.organizationId }), queryFn: () => fetchPriceLists({ organizationId: params.organizationId }) }));
  const priceLists = () => query.data?.priceLists ?? [];

  const openNaming = (source: PriceListSummary | null) => {
    setName(source ? t('pricing.lists.copy-name', { name: source.name }) : '');
    setNaming({ source });
  };

  const create = createMutation(() => ({
    mutationFn: async () => {
      const source = naming()?.source ?? null;
      return source
        ? duplicatePriceList({ organizationId: params.organizationId, priceListId: source.id, name: name().trim() })
        // The first price list is the default one: until there is another, it applies to every contact
        : createPriceList({ organizationId: params.organizationId, priceList: { name: name().trim(), description: null, discountRateBps: 0, defaultShippingRateId: null, isDefault: priceLists().length === 0 } });
    },
    onSuccess: async ({ priceList }) => {
      await queryClient.invalidateQueries({ queryKey: getPricingQueryKey({ organizationId: params.organizationId }) });
      setNaming(null);
      navigate(getOrganizationPriceListHref({ organizationId: params.organizationId, priceListId: priceList.id }));
    },
    onError: () => createToast({ type: 'error', message: t('pricing.lists.toast.error') }),
  }));

  const remove = async (priceList: PriceListSummary) => {
    await deletePriceList({ organizationId: params.organizationId, priceListId: priceList.id });
    await queryClient.invalidateQueries({ queryKey: getPricingQueryKey({ organizationId: params.organizationId }) });
    createToast({ type: 'success', message: t('pricing.lists.toast.deleted') });
  };

  return (
    <main class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">{t('pricing.lists.title')}</h1>
          <p class="page-description">{t('pricing.lists.description')}</p>
        </div>
        <div class="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" class="gap-1.5" onClick={() => setIsImporting(true)}>
            <div class="i-tabler-table-import size-4" />
            {t('pricing.import.open')}
          </Button>
          <Button size="sm" class="gap-1.5" onClick={() => openNaming(null)}>
            <div class="i-tabler-plus size-4" />
            {t('pricing.lists.new')}
          </Button>
        </div>
      </div>

      <Show when={priceLists().length > 0} fallback={<Show when={!query.isLoading}><div class="rounded-xl border border-dashed px-6 py-14 text-center text-sm text-muted-foreground">{t('pricing.lists.empty')}</div></Show>}>
        <CatalogTable headers={[{ label: t('invoicing.common.name') }, { label: t('pricing.lists.products'), class: 'text-right' }, { label: t('pricing.lists.contacts'), class: 'text-right' }, { label: t('pricing.lists.discount'), class: 'text-right' }, { label: '', class: 'w-14' }]}>
          <For each={priceLists()}>
            {priceList => (
              <CatalogRow onClick={() => navigate(getOrganizationPriceListHref({ organizationId: params.organizationId, priceListId: priceList.id }))}>
                <CatalogCell primary>
                  <div class="flex items-center gap-2">
                    <span class="font-medium">{priceList.name}</span>
                    <Show when={priceList.isDefault}><span class="rounded-full bg-primary/10 px-1.5 py-px text-[11px] font-medium text-primary">{t('pricing.lists.default')}</span></Show>
                  </div>
                  <Show when={priceList.description}><div class="max-w-md truncate text-xs text-muted-foreground">{priceList.description}</div></Show>
                </CatalogCell>
                <CatalogCell class="text-right tabular-nums">{priceList.itemCount}</CatalogCell>
                <CatalogCell class="text-right tabular-nums">{priceList.isDefault ? t('pricing.lists.contacts-default', { count: priceList.contactCount }) : priceList.contactCount}</CatalogCell>
                <CatalogCell class="text-right tabular-nums">{priceList.discountRateBps === 0 ? '—' : formatRate(priceList.discountRateBps)}</CatalogCell>
                <CatalogCell>
                  <RowActions
                    itemName={priceList.name}
                    onEdit={() => navigate(getOrganizationPriceListHref({ organizationId: params.organizationId, priceListId: priceList.id }))}
                    onDelete={() => remove(priceList)}
                    deleteMessage={t('pricing.lists.delete-message')}
                    actions={[
                      { label: t('pricing.lists.duplicate'), icon: 'i-tabler-copy', onSelect: () => openNaming(priceList) },
                      { label: t('pricing.download.image'), icon: 'i-tabler-photo', onSelect: () => void downloadImage({ priceListId: priceList.id, name: priceList.name }) },
                      { label: t('pricing.download.spreadsheet'), icon: 'i-tabler-table', onSelect: () => void downloadSpreadsheet({ priceListId: priceList.id, name: priceList.name }) },
                    ]}
                  />
                </CatalogCell>
              </CatalogRow>
            )}
          </For>
        </CatalogTable>
      </Show>

      <ShippingRatesSection organizationId={params.organizationId} />

      <PricingImportDialog organizationId={params.organizationId} open={isImporting()} onOpenChange={setIsImporting} />

      <Dialog open={naming() !== null} onOpenChange={open => !open && setNaming(null)}>
        <DialogContent class="max-w-md">
          <DialogHeader>
            <DialogTitle>{naming()?.source ? t('pricing.lists.duplicate') : t('pricing.lists.new')}</DialogTitle>
            <DialogDescription>{naming()?.source ? t('pricing.lists.duplicate-description') : t('pricing.lists.new-description')}</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (name().trim()) {
                create.mutate();
              }
            }}
          >
            <FormField label={t('invoicing.common.name')}><TextField autofocus placeholder={t('pricing.lists.name-placeholder')} value={name()} onInput={event => setName(event.currentTarget.value)} /></FormField>
            <DialogFooter class="mt-4">
              <Button type="button" variant="ghost" onClick={() => setNaming(null)}>{t('invoicing.common.cancel')}</Button>
              <Button type="submit" variant="primary" isLoading={create.isPending}>{t('invoicing.common.create')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
