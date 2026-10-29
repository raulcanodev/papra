import type { PurchaseInvoiceItemInput } from '../purchases.types';
import type { InvoicingProduct } from '@/modules/invoicing/invoicing.types';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createEffect, createMemo, createSignal, For, onCleanup, Show, untrack } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { getProductsQueryKey } from '@/modules/invoicing/components/product-form';
import { createProduct, fetchProducts, updateProduct } from '@/modules/invoicing/invoicing.services';
import { useI18nApiErrors } from '@/modules/shared/http/composables/i18n-api-errors';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';
import { SimpleCheckbox } from '@/modules/ui/components/simple-checkbox';
import { createToast } from '@/modules/ui/components/sonner';
import { compareLineWithTariff, getPurchaseUnitPrice } from '../purchases.models';
import { getPurchaseInvoicesQueryKey, matchPurchaseProducts } from '../purchases.services';

// Typing a description waits this long before the lines are matched again
const MATCHING_DEBOUNCE_MS = 800;

const normalizeDescription = (description: string) => description.trim().replace(/\s+/g, ' ');

// The lines of a purchase against the price list of its supplier (its saved products): the prices charged that differ
// from it, and the lines that are none of its products, to save them as its products. Runs again when the supplier is
// changed by hand or the lines are corrected.
export function SupplierTariffCheck(props: {
  organizationId: string;
  supplierId: string;
  supplierName: string;
  currency: string;
  items: PurchaseInvoiceItemInput[];
  onAddNote: (note: string) => void;
}) {
  const { t, getLocale } = useI18n();
  const { getErrorMessage } = useI18nApiErrors();
  const money = (minor: number) => new Intl.NumberFormat(getLocale(), { style: 'currency', currency: props.currency }).format(minor / 100);
  // A price beyond the cent is shown as printed (0,365 €), not rounded
  const unitPrice = (item: PurchaseInvoiceItemInput) => new Intl.NumberFormat(getLocale(), { style: 'currency', currency: props.currency, maximumFractionDigits: 6 }).format(getPurchaseUnitPrice(item));

  const productsQuery = useQuery(() => ({
    queryKey: [...getProductsQueryKey({ organizationId: props.organizationId }), { contactId: props.supplierId }],
    queryFn: () => fetchProducts({ organizationId: props.organizationId, contactId: props.supplierId }),
  }));
  const products = () => productsQuery.data?.products ?? [];

  const [descriptions, setDescriptions] = createSignal<string[]>([]);
  createEffect(() => {
    const next = props.items.map(item => normalizeDescription(item.description));
    // The first lines (read by the AI) are matched at once, corrections once the typing stops
    const isFirst = untrack(descriptions).length === 0;
    const timeout = setTimeout(() => setDescriptions(next), isFirst ? 0 : MATCHING_DEBOUNCE_MS);
    onCleanup(() => clearTimeout(timeout));
  });

  const hasDescriptions = () => descriptions().some(description => description !== '');
  const matchesQuery = useQuery(() => ({
    // The ids of the products are in the key: a product saved from here matches its line at once
    queryKey: [...getPurchaseInvoicesQueryKey({ organizationId: props.organizationId }), 'product-matches', props.supplierId, products().map(({ id }) => id).join(','), descriptions()],
    queryFn: () => matchPurchaseProducts({ organizationId: props.organizationId, supplierId: props.supplierId, descriptions: descriptions() }),
    enabled: products().length > 0 && hasDescriptions(),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  }));

  // A product the AI picked and the user rejected, per line description
  const [rejected, setRejected] = createSignal<Set<string>>(new Set());
  // New lines the user unticked before saving them as products
  const [unticked, setUnticked] = createSignal<Set<string>>(new Set());

  const lines = createMemo(() => props.items.map((item, index) => {
    const description = normalizeDescription(item.description);
    // While the matching of a corrected description is on its way, the line has no product yet
    const match = descriptions()[index] === description ? matchesQuery.data?.matches[index] : undefined;
    const product = match?.productId ? products().find(({ id }) => id === match.productId) : undefined;
    const isRejected = product !== undefined && rejected().has(`${description}\n${product.id}`);

    return { index, item, description, product: isRejected ? undefined : product, matchedBy: match?.matchedBy ?? null };
  }));

  const priceDifferences = () => lines().flatMap(line => (line.product ? [{ ...line, product: line.product, ...compareLineWithTariff({ item: line.item, tariff: line.product, currency: props.currency }) }] : [])).filter(({ comparison }) => comparison === 'higher' || comparison === 'lower');
  const sameCount = () => lines().filter(line => line.product && compareLineWithTariff({ item: line.item, tariff: line.product, currency: props.currency }).comparison === 'same').length;
  // Each description once: the same item on two lines is one product
  const newLines = () => [...new Map(lines().filter(line => !line.product && line.description !== '' && line.item.unitPriceMinor > 0).map(line => [line.description.toLowerCase(), line])).values()];
  const linesToSave = () => newLines().filter(line => !unticked().has(line.description));
  const extraMinor = () => priceDifferences().reduce((sum, { differenceMinor, item }) => sum + Math.round(differenceMinor * item.quantityMillis / 1_000), 0);

  const isChecking = () => productsQuery.isLoading || matchesQuery.isFetching;
  const isSettled = () => !isChecking() && descriptions().join('\n') === props.items.map(item => normalizeDescription(item.description)).join('\n');

  const invalidateProducts = async () => queryClient.invalidateQueries({ queryKey: getProductsQueryKey({ organizationId: props.organizationId }) });

  const toProductInput = (product: InvoicingProduct) => ({
    name: product.name,
    description: product.description,
    unit: product.unit,
    unitPriceMinor: product.unitPriceMinor,
    currency: product.currency,
    taxRateBps: product.taxRateBps,
    contactId: product.contactId,
    icon: product.icon,
    iconColor: product.iconColor,
    imageDocumentId: product.imageDocumentId,
  });

  const updatePriceMutation = createMutation(() => ({
    mutationFn: async ({ product, unitPriceMinor }: { product: InvoicingProduct; unitPriceMinor: number }) => updateProduct({ organizationId: props.organizationId, productId: product.id, product: { ...toProductInput(product), unitPriceMinor } }),
    onSuccess: async ({ product }) => {
      await invalidateProducts();
      createToast({ type: 'success', message: t('purchases.editor.tariff.price-updated', { product: product.name }) });
    },
    onError: (error: unknown) => createToast({ type: 'error', message: getErrorMessage({ error, defaultMessage: t('purchases.editor.tariff.error') }) }),
  }));

  const saveProductsMutation = createMutation(() => ({
    mutationFn: async () => {
      for (const { description, item } of linesToSave()) {
        await createProduct({
          organizationId: props.organizationId,
          product: { name: description.slice(0, 200), description: null, unit: 'unit', unitPriceMinor: item.unitPriceMinor, currency: props.currency, taxRateBps: item.taxRateBps, contactId: props.supplierId },
        });
      }
      return { count: linesToSave().length };
    },
    onSuccess: async ({ count }) => {
      await invalidateProducts();
      createToast({ type: 'success', message: t('purchases.editor.tariff.products-saved', { count, supplier: props.supplierName }) });
    },
    onError: async (error: unknown) => {
      // Some may have been saved before the error: they are matched again
      await invalidateProducts();
      createToast({ type: 'error', message: getErrorMessage({ error, defaultMessage: t('purchases.editor.tariff.error') }) });
    },
  }));

  const addNote = () => props.onAddNote([
    t('purchases.editor.tariff.note.title', { supplier: props.supplierName }),
    ...priceDifferences().map(({ description, product, chargedMinor, differenceMinor }) => t('purchases.editor.tariff.note.line', { line: description, charged: money(chargedMinor), tariff: money(product.unitPriceMinor), difference: `${differenceMinor > 0 ? '+' : '−'}${money(Math.abs(differenceMinor))}` })),
  ].join('\n'));

  return (
    <Show when={productsQuery.isSuccess || productsQuery.isLoading}>
      <div class="mb-4 flex flex-col gap-3 empty:hidden">
        <Show when={isChecking() && hasDescriptions()}>
          <div class="flex items-center gap-3 rounded-xl border border-violet-500/25 bg-violet-500/8 p-4 text-sm">
            <div class="i-tabler-loader-2 size-5 shrink-0 animate-spin text-violet-600 dark:text-violet-300" />
            <p>{t('purchases.editor.tariff.checking', { supplier: props.supplierName })}</p>
          </div>
        </Show>

        <Show when={!isChecking()}>
          <Show when={priceDifferences().length > 0}>
            <div class="rounded-xl border border-orange-500/30 bg-orange-500/8 p-4 text-sm">
              <div class="flex items-start gap-3">
                <div class="i-tabler-receipt-2 mt-0.5 size-5 shrink-0 text-orange-600" />
                <div class="min-w-0 flex-1">
                  <p class="font-medium">{t('purchases.editor.tariff.differences.title', { count: priceDifferences().length, supplier: props.supplierName })}</p>
                  <ul class="mt-2 divide-y divide-orange-500/20">
                    <For each={priceDifferences()}>
                      {line => (
                        <li class="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">
                          <div class="min-w-0 flex-1">
                            <p class="truncate">
                              {line.description}
                              <Show when={line.description.toLowerCase() !== line.product.name.toLowerCase()}>
                                <span class="text-muted-foreground">{` · ${line.product.name}`}</span>
                              </Show>
                              <Show when={line.matchedBy === 'ai'}>
                                <span class="i-tabler-sparkles ml-1 inline-block size-3.5 align-[-2px] text-violet-600 dark:text-violet-300" title={t('purchases.editor.tariff.matched-by-ai')} />
                              </Show>
                            </p>
                            <p class="text-muted-foreground tabular-nums">
                              {t('purchases.editor.tariff.differences.line', { charged: money(line.chargedMinor), tariff: money(line.product.unitPriceMinor) })}
                              <span class={cn('ml-1.5 whitespace-nowrap font-medium', line.comparison === 'higher' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400')}>
                                {`${line.differenceMinor > 0 ? '+' : '−'}${money(Math.abs(line.differenceMinor))}`}
                              </span>
                            </p>
                          </div>
                          <div class="flex gap-1">
                            <Show when={line.matchedBy === 'ai'}>
                              <Button size="sm" variant="ghost" onClick={() => setRejected(current => new Set([...current, `${line.description}\n${line.product.id}`]))}>
                                {t('purchases.editor.tariff.not-this-product')}
                              </Button>
                            </Show>
                            <Button size="sm" variant="outline" disabled={updatePriceMutation.isPending} onClick={() => updatePriceMutation.mutate({ product: line.product, unitPriceMinor: line.chargedMinor })}>
                              {t('purchases.editor.tariff.update-price', { price: money(line.chargedMinor) })}
                            </Button>
                          </div>
                        </li>
                      )}
                    </For>
                  </ul>
                  <div class="mt-2 flex flex-wrap items-center gap-3 border-t border-orange-500/20 pt-3">
                    <p class="min-w-0 flex-1 font-medium tabular-nums">
                      {extraMinor() > 0
                        ? t('purchases.editor.tariff.differences.total-more', { amount: money(extraMinor()) })
                        : extraMinor() < 0 ? t('purchases.editor.tariff.differences.total-less', { amount: money(-extraMinor()) }) : t('purchases.editor.tariff.differences.total-even')}
                    </p>
                    <Button size="sm" variant="outline" class="gap-1.5" onClick={addNote}>
                      <div class="i-tabler-notes size-4" />
                      {t('purchases.editor.tariff.add-note')}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Show>

          <Show when={isSettled() && priceDifferences().length === 0 && sameCount() > 0}>
            <p class="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
              <span class="i-tabler-circle-check size-4.5 shrink-0" />
              {t('purchases.editor.tariff.all-same', { count: sameCount(), supplier: props.supplierName })}
            </p>
          </Show>

          <Show when={isSettled() && newLines().length > 0}>
            <div class="rounded-xl border bg-muted/40 p-4 text-sm">
              <div class="flex items-start gap-3">
                <div class="i-tabler-package-import mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <div class="min-w-0 flex-1">
                  <p class="font-medium">
                    {products().length === 0
                      ? t('purchases.editor.tariff.new.no-products', { supplier: props.supplierName })
                      : t('purchases.editor.tariff.new.title', { count: newLines().length, supplier: props.supplierName })}
                  </p>
                  <p class="text-muted-foreground">{t('purchases.editor.tariff.new.hint')}</p>
                  <ul class="mt-2 divide-y">
                    <For each={newLines()}>
                      {line => (
                        <li class="flex items-start gap-3 py-2">
                          <SimpleCheckbox
                            class="min-w-0 flex-1 items-start [&_label]:min-w-0"
                            checked={!unticked().has(line.description)}
                            onChange={checked => setUnticked((current) => {
                              const next = new Set(current);
                              if (checked) {
                                next.delete(line.description);
                              } else {
                                next.add(line.description);
                              }
                              return next;
                            })}
                            label={<span class="line-clamp-2 break-words">{line.description}</span>}
                          />
                          <span class="shrink-0 pt-px text-muted-foreground tabular-nums">{unitPrice(line.item)}</span>
                        </li>
                      )}
                    </For>
                  </ul>
                  <Button size="sm" class="mt-2 max-w-full gap-1.5" disabled={linesToSave().length === 0} isLoading={saveProductsMutation.isPending} onClick={() => saveProductsMutation.mutate()}>
                    <div class="i-tabler-device-floppy size-4" />
                    {t('purchases.editor.tariff.new.save', { count: linesToSave().length })}
                  </Button>
                  <Show when={matchesQuery.data?.isModelUnavailable && products().length > 0}>
                    <p class="mt-2 text-xs text-muted-foreground">{t('purchases.editor.tariff.no-ai')}</p>
                  </Show>
                </div>
              </div>
            </div>
          </Show>

          <Show when={matchesQuery.isError}>
            <p class="text-sm text-muted-foreground">{t('purchases.editor.tariff.failed')}</p>
          </Show>
        </Show>
      </div>
    </Show>
  );
}
