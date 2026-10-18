import type { InvoicingProduct, ProductInput } from '../invoicing.types';
import type { EntityCustomPropertiesInput } from '@/modules/custom-properties/custom-properties.types';
import type { ProductCostLine } from '@/modules/pricing/pricing.types';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createMemo, createSignal, Show } from 'solid-js';
import { fetchContacts, getContactsQueryKey } from '@/modules/contacts/contacts.services';
import { EntityCustomPropertiesFields, invalidateEntityCustomProperties } from '@/modules/custom-properties/components/entity-custom-properties-fields.component';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { ProductCostsEditor } from '@/modules/pricing/components/product-costs-editor';
import { fetchProductCosts, getPricingQueryKey, saveProductCosts } from '@/modules/pricing/pricing.services';
import { queryClient } from '@/modules/shared/query/query-client';
import { EntityIconPicker } from '@/modules/ui/components/entity-icon';
import { SimpleSelect } from '@/modules/ui/components/simple-select';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField } from '@/modules/ui/components/textfield';
import { createProduct, fetchProducts, updateProduct } from '../invoicing.services';
import { FormField, SaveButton } from './catalog-page';
import { ProductPhotoField } from './product-photo';

export const PRODUCT_FALLBACK_ICON = 'i-tabler-package';

// Every products listing (the catalog and each contact page) lives under this key
export function getProductsQueryKey({ organizationId }: { organizationId: string }) {
  return ['invoicing', organizationId, 'products'];
}

function toProductInput({ product, contactId }: { product: InvoicingProduct | null; contactId: string | null }): ProductInput {
  return product === null
    ? { name: '', description: null, unit: 'unidad', unitPriceMinor: 0, currency: 'EUR', taxRateBps: 2100, icon: null, iconColor: null, contactId, imageDocumentId: null }
    : { name: product.name, description: product.description, unit: product.unit, unitPriceMinor: product.unitPriceMinor, currency: product.currency, taxRateBps: product.taxRateBps, icon: product.icon, iconColor: product.iconColor, contactId: product.contactId, imageDocumentId: product.imageDocumentId ?? null };
}

/**
 * Creates or edits a product. From the catalog the owner can be chosen (our own, or a supplier or customer);
 * from a contact page it is fixed to that contact. Mounted each time its dialog opens, so it starts from its props.
 */
export function ProductForm(props: {
  organizationId: string;
  product: InvoicingProduct | null;
  /** Set from a contact page: the product belongs to that contact and the owner is not editable */
  lockedContactId?: string;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = createSignal<ProductInput>(toProductInput({ product: props.product, contactId: props.lockedContactId ?? null }));
  const [customProperties, setCustomProperties] = createSignal<EntityCustomPropertiesInput>({});
  const update = (changes: Partial<ProductInput>) => setValue(current => ({ ...current, ...changes }));
  // null until the breakdown is touched: an untouched breakdown is not saved again
  const [costLines, setCostLines] = createSignal<ProductCostLine[] | null>(null);

  const costsQuery = useQuery(() => ({
    queryKey: [...getPricingQueryKey({ organizationId: props.organizationId }), 'product-costs', props.product?.id],
    queryFn: () => fetchProductCosts({ organizationId: props.organizationId, productId: props.product!.id }),
    enabled: props.product !== null,
  }));

  const productsQuery = useQuery(() => ({ queryKey: getProductsQueryKey({ organizationId: props.organizationId }), queryFn: () => fetchProducts({ organizationId: props.organizationId }) }));

  const contactsQuery = useQuery(() => ({
    queryKey: getContactsQueryKey({ organizationId: props.organizationId }),
    queryFn: () => fetchContacts({ organizationId: props.organizationId }),
    enabled: props.lockedContactId === undefined,
  }));

  const ownerOptions = createMemo(() => [
    { value: '', label: t('invoicing.products.owner.own') },
    ...(contactsQuery.data?.contacts ?? [])
      .filter(contact => contact.isSupplier || contact.isCustomer)
      .map(contact => ({ value: contact.id, label: contact.name })),
  ]);

  const mutation = createMutation(() => ({
    mutationFn: async () => {
      const product = { ...value(), customProperties: customProperties() };
      const saved = props.product === null
        ? await createProduct({ organizationId: props.organizationId, product })
        : await updateProduct({ organizationId: props.organizationId, productId: props.product.id, product });
      const lines = costLines();
      if (lines !== null) {
        await saveProductCosts({ organizationId: props.organizationId, productId: saved.product.id, lines });
      }
      return saved;
    },
    onSuccess: async () => {
      await Promise.all([
        invalidateEntityCustomProperties({ organizationId: props.organizationId, entityType: 'product' }),
        queryClient.invalidateQueries({ queryKey: getProductsQueryKey({ organizationId: props.organizationId }) }),
        queryClient.invalidateQueries({ queryKey: getPricingQueryKey({ organizationId: props.organizationId }) }),
      ]);
      createToast({ type: 'success', message: t('invoicing.products.toast.saved') });
      props.onDone();
    },
    onError: () => createToast({ type: 'error', message: t('invoicing.products.toast.error') }),
  }));

  return (
    <form
      class="grid gap-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (value().name.trim()) {
          mutation.mutate();
        }
      }}
    >
      {/* The picker stays outside the label: a click on the label text must focus the name, not open the picker */}
      <div class="flex items-end gap-3 sm:col-span-2">
        <EntityIconPicker value={{ icon: value().icon ?? null, iconColor: value().iconColor ?? null }} onChange={appearance => update(appearance)} fallback={PRODUCT_FALLBACK_ICON} />
        <FormField label={t('invoicing.common.name')} class="flex-1"><TextField value={value().name} onInput={event => update({ name: event.currentTarget.value })} /></FormField>
      </div>
      <ProductPhotoField organizationId={props.organizationId} value={value().imageDocumentId ?? null} onChange={imageDocumentId => update({ imageDocumentId })} />
      <FormField label={t('invoicing.products.form.price')}><TextField type="number" min="0" step="0.01" value={value().unitPriceMinor / 100} onInput={event => update({ unitPriceMinor: Math.round(Number(event.currentTarget.value) * 100) })} /></FormField>
      <FormField label={t('invoicing.products.form.unit')}><TextField value={value().unit} onInput={event => update({ unit: event.currentTarget.value })} /></FormField>
      <FormField label={t('invoicing.products.form.tax')}><TextField type="number" min="0" max="100" step="0.01" value={value().taxRateBps / 100} onInput={event => update({ taxRateBps: Math.round(Number(event.currentTarget.value) * 100) })} /></FormField>
      <Show when={props.lockedContactId === undefined}>
        <FormField label={t('invoicing.products.owner.label')}>
          <SimpleSelect triggerClass="h-10 w-full" value={value().contactId ?? ''} onChange={contactId => update({ contactId: contactId === '' ? null : contactId })} options={ownerOptions()} />
        </FormField>
      </Show>
      <div class="sm:col-span-2">
        <Show when={props.product === null || costsQuery.data}>
          <ProductCostsEditor
            organizationId={props.organizationId}
            initialLines={costsQuery.data?.lines ?? []}
            currency={value().currency}
            basePriceMinor={value().unitPriceMinor}
            copyCandidates={(productsQuery.data?.products ?? []).filter(product => product.id !== props.product?.id)}
            onChange={setCostLines}
          />
        </Show>
      </div>
      <EntityCustomPropertiesFields organizationId={props.organizationId} entityType="product" entityId={props.product?.id ?? null} value={customProperties()} onChange={setCustomProperties} />
      <SaveButton loading={mutation.isPending} editing={props.product !== null} onCancel={() => props.onDone()} />
    </form>
  );
}
