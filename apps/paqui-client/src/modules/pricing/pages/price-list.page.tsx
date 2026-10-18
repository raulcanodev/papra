import type { PriceList, PriceListInput, ShippingRate } from '../pricing.types';
import { A, useNavigate, useParams } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createMemo, createSignal, For, Index, Show } from 'solid-js';
import { fetchContacts, getContactsQueryKey } from '@/modules/contacts/contacts.services';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { FormField } from '@/modules/invoicing/components/catalog-page';
import { getProductsQueryKey } from '@/modules/invoicing/components/product-form';
import { fetchProducts } from '@/modules/invoicing/invoicing.services';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';
import { RowActions } from '@/modules/ui/components/row-actions';
import { SimpleCheckbox } from '@/modules/ui/components/simple-checkbox';
import { SimpleSelect } from '@/modules/ui/components/simple-select';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField } from '@/modules/ui/components/textfield';
import { getOrganizationRouteHref } from '@/modules/ui/navigation/organization-navigation';
import { MultiPickerDialog } from '../components/multi-picker-dialog';
import { getShippingRatesQueryKey } from '../components/shipping-rates-section';
import { adjustPriceMinor, formatMoney, formatRate, getNetPriceMinor, parseAmountToMinor } from '../pricing.models';
import { deletePriceList, downloadPriceListCsv, fetchPriceList, fetchProductCostTotals, fetchShippingRates, getPricingQueryKey, savePriceListContacts, savePriceListItems, updatePriceList } from '../pricing.services';

// Shipping choice of a line: the one of the price list, none, or a given rate id
const LIST_SHIPPING = '';
const NO_SHIPPING = 'none';

type Row = { productId: string; productName: string; productUnit: string; priceText: string; shipping: string };
type Settings = { name: string; description: string; discountText: string; defaultShippingRateId: string; isDefault: boolean };

const toAmountText = (amountMinor: number) => (amountMinor / 100).toFixed(2).replace('.', ',');

export function PriceListPage() {
  const params = useParams();
  const query = useQuery(() => ({ queryKey: [...getPricingQueryKey({ organizationId: params.organizationId }), 'price-list', params.priceListId], queryFn: () => fetchPriceList({ organizationId: params.organizationId, priceListId: params.priceListId }) }));

  // Remounted with the saved data after each save, so the editor always starts from what the server has
  return (
    <main class="page">
      <Show when={query.data?.priceList} keyed>
        {priceList => <PriceListEditor organizationId={params.organizationId} priceList={priceList} />}
      </Show>
    </main>
  );
}

function PriceListEditor(props: { organizationId: string; priceList: PriceList }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const listsHref = () => getOrganizationRouteHref({ organizationId: props.organizationId, routeId: 'priceLists' });

  const initialSettings: Settings = {
    name: props.priceList.name,
    description: props.priceList.description ?? '',
    discountText: props.priceList.discountRateBps === 0 ? '' : toAmountText(props.priceList.discountRateBps),
    defaultShippingRateId: props.priceList.defaultShippingRateId ?? '',
    isDefault: props.priceList.isDefault,
  };
  const initialRows: Row[] = props.priceList.items.map(item => ({
    productId: item.productId,
    productName: item.productName,
    productUnit: item.productUnit,
    priceText: toAmountText(item.priceMinor),
    shipping: item.overridesShipping ? (item.shippingRateId ?? NO_SHIPPING) : LIST_SHIPPING,
  }));
  const initialContacts = props.priceList.contacts.map(contact => ({ id: contact.id, name: contact.name }));

  const [settings, setSettings] = createSignal<Settings>(initialSettings);
  const [rows, setRows] = createSignal<Row[]>(initialRows);
  const [contacts, setContacts] = createSignal(initialContacts);
  const [adjustText, setAdjustText] = createSignal('');
  const [productPickerOpen, setProductPickerOpen] = createSignal(false);
  const [contactPickerOpen, setContactPickerOpen] = createSignal(false);

  const productsQuery = useQuery(() => ({ queryKey: getProductsQueryKey({ organizationId: props.organizationId }), queryFn: () => fetchProducts({ organizationId: props.organizationId }) }));
  const contactsQuery = useQuery(() => ({ queryKey: getContactsQueryKey({ organizationId: props.organizationId }), queryFn: () => fetchContacts({ organizationId: props.organizationId }) }));
  const shippingQuery = useQuery(() => ({ queryKey: getShippingRatesQueryKey({ organizationId: props.organizationId }), queryFn: () => fetchShippingRates({ organizationId: props.organizationId }) }));
  const costsQuery = useQuery(() => ({ queryKey: [...getPricingQueryKey({ organizationId: props.organizationId }), 'product-cost-totals'], queryFn: () => fetchProductCostTotals({ organizationId: props.organizationId }) }));

  const shippingRates = () => shippingQuery.data?.shippingRates ?? [];
  const shippingById = createMemo(() => new Map(shippingRates().map(rate => [rate.id, rate])));
  const costByProductId = createMemo(() => new Map((costsQuery.data?.costs ?? []).map(cost => [cost.productId, cost.totalMinor])));
  const discountRateBps = () => parseAmountToMinor(settings().discountText) ?? 0;
  const listShipping = (): ShippingRate | undefined => shippingById().get(settings().defaultShippingRateId);

  const isDirty = () => JSON.stringify([settings(), rows(), contacts().map(contact => contact.id)]) !== JSON.stringify([initialSettings, initialRows, initialContacts.map(contact => contact.id)]);
  const hasInvalidAmounts = () => rows().some(row => parseAmountToMinor(row.priceText) === null) || parseAmountToMinor(settings().discountText) === null || discountRateBps() > 10_000;

  // The internal figures of a line, recomputed as prices are typed
  const figures = (row: Row) => {
    const priceMinor = parseAmountToMinor(row.priceText) ?? 0;
    const rate = row.shipping === LIST_SHIPPING ? listShipping() : row.shipping === NO_SHIPPING ? undefined : shippingById().get(row.shipping);
    const productCostMinor = costByProductId().get(row.productId) ?? 0;
    const shippingMinor = rate?.amountMinor ?? 0;
    const netPriceMinor = getNetPriceMinor({ priceMinor, discountRateBps: discountRateBps() });
    const marginMinor = netPriceMinor - productCostMinor - shippingMinor;
    return { productCostMinor, shippingMinor, costMinor: productCostMinor + shippingMinor, netPriceMinor, marginMinor, marginRateBps: netPriceMinor === 0 ? null : Math.round(marginMinor * 10_000 / netPriceMinor) };
  };

  const updateRow = (productId: string, changes: Partial<Row>) => setRows(current => current.map(row => (row.productId === productId ? { ...row, ...changes } : row)));

  const addProducts = (productIds: string[]) => {
    const products = productsQuery.data?.products ?? [];
    setRows(current => [
      ...current,
      ...productIds.map((productId) => {
        const product = products.find(candidate => candidate.id === productId)!;
        return { productId, productName: product.name, productUnit: product.unit, priceText: toAmountText(product.unitPriceMinor), shipping: LIST_SHIPPING };
      }),
    ]);
  };

  const applyAdjustment = () => {
    const text = adjustText().trim().replace(',', '.').replace('%', '');
    const rate = Number(text);
    if (text === '' || !Number.isFinite(rate)) {
      return;
    }
    setRows(current => current.map(row => ({ ...row, priceText: toAmountText(adjustPriceMinor({ priceMinor: parseAmountToMinor(row.priceText) ?? 0, rateBps: Math.round(rate * 100) })) })));
    setAdjustText('');
  };

  const save = createMutation(() => ({
    mutationFn: async () => {
      const current = settings();
      const priceList: PriceListInput = { name: current.name.trim() || props.priceList.name, description: current.description.trim() || null, discountRateBps: discountRateBps(), defaultShippingRateId: current.defaultShippingRateId || null, isDefault: current.isDefault };
      await updatePriceList({ organizationId: props.organizationId, priceListId: props.priceList.id, priceList });
      await savePriceListItems({
        organizationId: props.organizationId,
        priceListId: props.priceList.id,
        items: rows().map(row => ({
          productId: row.productId,
          priceMinor: parseAmountToMinor(row.priceText) ?? 0,
          overridesShipping: row.shipping !== LIST_SHIPPING,
          shippingRateId: row.shipping === LIST_SHIPPING || row.shipping === NO_SHIPPING ? null : row.shipping,
        })),
      });
      await savePriceListContacts({ organizationId: props.organizationId, priceListId: props.priceList.id, contactIds: contacts().map(contact => contact.id) });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: getPricingQueryKey({ organizationId: props.organizationId }) });
      createToast({ type: 'success', message: t('pricing.list.toast.saved') });
    },
    onError: () => createToast({ type: 'error', message: t('pricing.list.toast.error') }),
  }));

  const remove = async () => {
    await deletePriceList({ organizationId: props.organizationId, priceListId: props.priceList.id });
    await queryClient.invalidateQueries({ queryKey: getPricingQueryKey({ organizationId: props.organizationId }) });
    navigate(listsHref());
  };

  const shippingOptions = () => [
    { value: LIST_SHIPPING, label: listShipping() ? t('pricing.list.shipping.from-list', { name: listShipping()!.name }) : t('pricing.list.shipping.from-list-none') },
    { value: NO_SHIPPING, label: t('pricing.list.shipping.none') },
    ...shippingRates().map(rate => ({ value: rate.id, label: `${rate.name} · ${formatMoney(rate.amountMinor)}` })),
  ];

  const numberInputClass = 'h-9 w-24 rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <>
      <A href={listsHref()} class="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <div class="i-tabler-arrow-left size-4" />
        {t('pricing.lists.title')}
      </A>

      <div class="page-header">
        <div class="min-w-0">
          <h1 class="page-title truncate">{settings().name || props.priceList.name}</h1>
          <p class="page-description">{t('pricing.list.description')}</p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" class="gap-1.5" disabled={isDirty()} title={isDirty() ? t('pricing.list.download-save-first') : undefined} onClick={() => downloadPriceListCsv({ organizationId: props.organizationId, priceListId: props.priceList.id, name: props.priceList.name, lang: 'es' })}>
            <div class="i-tabler-download size-4" />
            <span class="hidden sm:inline">{t('pricing.lists.download')}</span>
          </Button>
          <RowActions itemName={props.priceList.name} onDelete={remove} deleteMessage={t('pricing.lists.delete-message')} />
        </div>
      </div>

      <section class="mb-8 grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <FormField label={t('invoicing.common.name')}><TextField value={settings().name} onInput={event => setSettings(current => ({ ...current, name: event.currentTarget.value }))} /></FormField>
        <FormField label={t('pricing.list.discount')}><TextField inputMode="decimal" placeholder="0" value={settings().discountText} onInput={event => setSettings(current => ({ ...current, discountText: event.currentTarget.value }))} /></FormField>
        <FormField label={t('pricing.list.default-shipping')}>
          <SimpleSelect triggerClass="h-10 w-full" value={settings().defaultShippingRateId} onChange={defaultShippingRateId => setSettings(current => ({ ...current, defaultShippingRateId }))} options={[{ value: '', label: t('pricing.list.shipping.none') }, ...shippingRates().map(rate => ({ value: rate.id, label: `${rate.name} · ${formatMoney(rate.amountMinor)}` }))]} />
        </FormField>
        <div class="flex items-end pb-2.5">
          <SimpleCheckbox checked={settings().isDefault} onChange={isDefault => setSettings(current => ({ ...current, isDefault }))} label={t('pricing.list.is-default')} />
        </div>
        <FormField label={t('pricing.list.notes')} class="sm:col-span-2 lg:col-span-4"><TextField value={settings().description} onInput={event => setSettings(current => ({ ...current, description: event.currentTarget.value }))} /></FormField>
      </section>

      <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold">{t('pricing.list.products.title')}</h2>
          <p class="text-sm text-muted-foreground">{t('pricing.list.products.private')}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Show when={rows().length > 0}>
            <form
              class="flex items-center gap-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                applyAdjustment();
              }}
            >
              <input class={cn(numberInputClass, 'w-20')} inputMode="decimal" placeholder="+5 %" aria-label={t('pricing.list.adjust')} value={adjustText()} onInput={event => setAdjustText(event.currentTarget.value)} />
              <Button type="submit" size="sm" variant="outline">{t('pricing.list.adjust')}</Button>
            </form>
          </Show>
          <Button size="sm" class="gap-1.5" onClick={() => setProductPickerOpen(true)}>
            <div class="i-tabler-plus size-4" />
            {t('pricing.list.products.add')}
          </Button>
        </div>
      </div>

      <Show when={rows().length > 0} fallback={<div class="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">{t('pricing.list.products.empty')}</div>}>
        <div class="overflow-x-auto rounded-xl border bg-card">
          <table class="w-full min-w-[860px] text-sm">
            <thead class="border-b bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th class="h-10 px-3 text-left font-medium">{t('invoicing.products.table.product')}</th>
                <th class="h-10 px-3 text-right font-medium">{t('pricing.list.column.cost')}</th>
                <th class="h-10 px-3 text-left font-medium">{t('pricing.list.column.shipping')}</th>
                <th class="h-10 px-3 text-right font-medium">{t('pricing.list.column.total-cost')}</th>
                <th class="h-10 px-3 text-right font-medium">{t('pricing.list.column.price')}</th>
                <th class="h-10 px-3 text-right font-medium">{t('pricing.list.column.margin')}</th>
                <th class="h-10 w-10 px-1" />
              </tr>
            </thead>
            <tbody class="divide-y">
              <Index each={rows()}>
                {(row) => {
                  // <Index> keeps the inputs (and their focus) while the line values change
                  const values = () => figures(row());
                  return (
                    <tr class="hover:bg-muted/20">
                      <td class="px-3 py-1.5">
                        <div class="font-medium">{row().productName}</div>
                        <div class="text-xs text-muted-foreground">{row().productUnit}</div>
                      </td>
                      <td class="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{values().productCostMinor === 0 ? '—' : formatMoney(values().productCostMinor)}</td>
                      <td class="px-3 py-1.5">
                        <SimpleSelect triggerClass="h-9 w-52 text-xs" value={row().shipping} onChange={shipping => updateRow(row().productId, { shipping })} options={shippingOptions()} aria-label={t('pricing.list.column.shipping')} />
                      </td>
                      <td class="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{formatMoney(values().costMinor)}</td>
                      <td class="px-3 py-1.5 text-right">
                        <input class={cn(numberInputClass, parseAmountToMinor(row().priceText) === null && 'border-destructive')} inputMode="decimal" aria-label={t('pricing.list.column.price')} value={row().priceText} onInput={event => updateRow(row().productId, { priceText: event.currentTarget.value })} />
                        <Show when={discountRateBps() > 0}><div class="mt-0.5 text-[11px] text-muted-foreground">{t('pricing.list.net', { amount: formatMoney(values().netPriceMinor) })}</div></Show>
                      </td>
                      <td class={cn('px-3 py-1.5 text-right tabular-nums', values().marginMinor < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400')}>
                        <div class="font-semibold">{formatMoney(values().marginMinor)}</div>
                        <div class="text-[11px] opacity-80">{formatRate(values().marginRateBps)}</div>
                      </td>
                      <td class="px-1 py-1.5">
                        <button type="button" class="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t('pricing.list.products.remove')} onClick={() => setRows(current => current.filter(candidate => candidate.productId !== row().productId))}>
                          <div class="i-tabler-x size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                }}
              </Index>
            </tbody>
          </table>
        </div>
      </Show>

      <div class="mb-3 mt-10 flex items-end justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold">{t('pricing.list.contacts.title')}</h2>
          <p class="text-sm text-muted-foreground">{settings().isDefault ? t('pricing.list.contacts.default-hint') : t('pricing.list.contacts.hint')}</p>
        </div>
        <Button size="sm" variant="outline" class="shrink-0 gap-1.5" onClick={() => setContactPickerOpen(true)}>
          <div class="i-tabler-user-plus size-4" />
          {t('pricing.list.contacts.add')}
        </Button>
      </div>
      <Show when={contacts().length > 0} fallback={<div class="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">{t('pricing.list.contacts.empty')}</div>}>
        <div class="flex flex-wrap gap-2">
          <For each={contacts()}>
            {contact => (
              <span class="inline-flex items-center gap-1 rounded-full border bg-card py-1 pl-3 pr-1 text-sm">
                {contact.name}
                <button type="button" class="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={t('pricing.list.contacts.remove', { name: contact.name })} onClick={() => setContacts(current => current.filter(candidate => candidate.id !== contact.id))}>
                  <div class="i-tabler-x size-3.5" />
                </button>
              </span>
            )}
          </For>
        </div>
      </Show>

      <Show when={isDirty()}>
        <div class="sticky bottom-4 z-10 mt-8 flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-lg">
          <span class="text-sm text-muted-foreground">{hasInvalidAmounts() ? t('pricing.list.invalid-amounts') : t('pricing.list.unsaved')}</span>
          <div class="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSettings(initialSettings);
                setRows(initialRows);
                setContacts(initialContacts);
              }}
            >
              {t('pricing.list.discard')}
            </Button>
            <Button variant="primary" size="sm" disabled={hasInvalidAmounts()} isLoading={save.isPending} onClick={() => save.mutate()}>{t('invoicing.common.save-changes')}</Button>
          </div>
        </div>
      </Show>

      <MultiPickerDialog
        open={productPickerOpen()}
        onOpenChange={setProductPickerOpen}
        title={t('pricing.list.products.add')}
        confirmLabel={t('pricing.list.products.add')}
        items={(productsQuery.data?.products ?? []).filter(product => !rows().some(row => row.productId === product.id)).map(product => ({ id: product.id, label: product.name, detail: formatMoney(product.unitPriceMinor, product.currency) }))}
        onConfirm={addProducts}
      />
      <MultiPickerDialog
        open={contactPickerOpen()}
        onOpenChange={setContactPickerOpen}
        title={t('pricing.list.contacts.add')}
        confirmLabel={t('pricing.list.contacts.add')}
        items={(contactsQuery.data?.contacts ?? []).filter(contact => (contact.isCustomer || contact.isSupplier) && !contacts().some(candidate => candidate.id === contact.id)).map(contact => ({ id: contact.id, label: contact.name, detail: contact.taxId ?? undefined }))}
        onConfirm={ids => setContacts(current => [...current, ...ids.map(id => ({ id, name: contactsQuery.data?.contacts.find(contact => contact.id === id)?.name ?? '' }))].sort((a, b) => a.name.localeCompare(b.name)))}
      />
    </>
  );
}
