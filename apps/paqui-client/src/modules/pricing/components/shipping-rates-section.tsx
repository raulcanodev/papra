import type { ShippingRate, ShippingRateInput } from '../pricing.types';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createSignal, For, Show } from 'solid-js';
import { fetchContacts, getContactsQueryKey } from '@/modules/contacts/contacts.services';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { CatalogCell, CatalogRow, CatalogTable, FormField, SaveButton } from '@/modules/invoicing/components/catalog-page';
import { queryClient } from '@/modules/shared/query/query-client';
import { Button } from '@/modules/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/modules/ui/components/dialog';
import { RowActions } from '@/modules/ui/components/row-actions';
import { SimpleSelect } from '@/modules/ui/components/simple-select';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField } from '@/modules/ui/components/textfield';
import { formatMoney, parseAmountToMinor } from '../pricing.models';
import { createShippingRate, deleteShippingRate, fetchShippingRates, getPricingQueryKey, updateShippingRate } from '../pricing.services';

export function getShippingRatesQueryKey({ organizationId }: { organizationId: string }) {
  return [...getPricingQueryKey({ organizationId }), 'shipping-rates'];
}

/** The saved shipping costs a price list or one of its products uses, each with the carrier doing it */
export function ShippingRatesSection(props: { organizationId: string }) {
  const { t } = useI18n();
  const [editing, setEditing] = createSignal<ShippingRate | null>(null);
  const [formOpen, setFormOpen] = createSignal(false);
  const query = useQuery(() => ({ queryKey: getShippingRatesQueryKey({ organizationId: props.organizationId }), queryFn: () => fetchShippingRates({ organizationId: props.organizationId }) }));

  const open = (rate: ShippingRate | null) => {
    setEditing(rate);
    setFormOpen(true);
  };

  const remove = async (rate: ShippingRate) => {
    await deleteShippingRate({ organizationId: props.organizationId, shippingRateId: rate.id });
    await queryClient.invalidateQueries({ queryKey: getPricingQueryKey({ organizationId: props.organizationId }) });
    createToast({ type: 'success', message: t('pricing.shipping.toast.deleted') });
  };

  return (
    <section class="mt-10">
      <div class="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold">{t('pricing.shipping.title')}</h2>
          <p class="text-sm text-muted-foreground">{t('pricing.shipping.description')}</p>
        </div>
        <Button size="sm" variant="outline" class="shrink-0 gap-1.5" onClick={() => open(null)}>
          <div class="i-tabler-plus size-4" />
          {t('pricing.shipping.new')}
        </Button>
      </div>

      <Show when={(query.data?.shippingRates.length ?? 0) > 0} fallback={<Show when={!query.isLoading}><div class="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">{t('pricing.shipping.empty')}</div></Show>}>
        <CatalogTable headers={[{ label: t('invoicing.common.name') }, { label: t('pricing.shipping.carrier') }, { label: t('pricing.shipping.amount'), class: 'text-right' }, { label: '', class: 'w-14' }]}>
          <For each={query.data?.shippingRates ?? []}>
            {rate => (
              <CatalogRow onClick={() => open(rate)}>
                <CatalogCell primary>
                  <div class="font-medium">{rate.name}</div>
                  <Show when={rate.notes}><div class="max-w-md truncate text-xs text-muted-foreground">{rate.notes}</div></Show>
                </CatalogCell>
                <CatalogCell class="text-muted-foreground">{rate.carrierName ?? '—'}</CatalogCell>
                <CatalogCell class="text-right tabular-nums">{formatMoney(rate.amountMinor)}</CatalogCell>
                <CatalogCell><RowActions itemName={rate.name} onEdit={() => open(rate)} onDelete={() => remove(rate)} deleteMessage={t('pricing.shipping.delete-message')} /></CatalogCell>
              </CatalogRow>
            )}
          </For>
        </CatalogTable>
      </Show>

      <Dialog open={formOpen()} onOpenChange={setFormOpen}>
        <DialogContent class="max-w-lg">
          <DialogHeader><DialogTitle>{editing() ? t('pricing.shipping.edit') : t('pricing.shipping.new')}</DialogTitle></DialogHeader>
          <ShippingRateForm organizationId={props.organizationId} rate={editing()} onDone={() => setFormOpen(false)} />
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ShippingRateForm(props: { organizationId: string; rate: ShippingRate | null; onDone: () => void }) {
  const { t } = useI18n();
  const [value, setValue] = createSignal<ShippingRateInput>({ name: props.rate?.name ?? '', carrierContactId: props.rate?.carrierContactId ?? null, amountMinor: props.rate?.amountMinor ?? 0, notes: props.rate?.notes ?? null });
  const [amountText, setAmountText] = createSignal(props.rate ? (props.rate.amountMinor / 100).toFixed(2).replace('.', ',') : '');
  const contactsQuery = useQuery(() => ({ queryKey: getContactsQueryKey({ organizationId: props.organizationId }), queryFn: () => fetchContacts({ organizationId: props.organizationId }) }));

  const mutation = createMutation(() => ({
    mutationFn: async () => {
      const shippingRate = { ...value(), amountMinor: parseAmountToMinor(amountText()) ?? 0 };
      return props.rate === null
        ? createShippingRate({ organizationId: props.organizationId, shippingRate })
        : updateShippingRate({ organizationId: props.organizationId, shippingRateId: props.rate.id, shippingRate });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: getPricingQueryKey({ organizationId: props.organizationId }) });
      createToast({ type: 'success', message: t('pricing.shipping.toast.saved') });
      props.onDone();
    },
    onError: () => createToast({ type: 'error', message: t('pricing.shipping.toast.error') }),
  }));

  return (
    <form
      class="grid gap-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (value().name.trim() && parseAmountToMinor(amountText()) !== null) {
          mutation.mutate();
        }
      }}
    >
      <FormField label={t('invoicing.common.name')} class="sm:col-span-2"><TextField placeholder={t('pricing.shipping.name-placeholder')} value={value().name} onInput={event => setValue(current => ({ ...current, name: event.currentTarget.value }))} /></FormField>
      <FormField label={t('pricing.shipping.carrier')}>
        <SimpleSelect
          triggerClass="h-10 w-full"
          value={value().carrierContactId ?? ''}
          onChange={carrierContactId => setValue(current => ({ ...current, carrierContactId: carrierContactId === '' ? null : carrierContactId }))}
          options={[{ value: '', label: t('pricing.shipping.no-carrier') }, ...(contactsQuery.data?.contacts ?? []).filter(contact => contact.isSupplier).map(contact => ({ value: contact.id, label: contact.name }))]}
        />
      </FormField>
      <FormField label={t('pricing.shipping.amount-per-unit')}><TextField inputMode="decimal" placeholder="0,00" value={amountText()} onInput={event => setAmountText(event.currentTarget.value)} /></FormField>
      <FormField label={t('pricing.shipping.notes')} class="sm:col-span-2"><TextField value={value().notes ?? ''} onInput={event => setValue(current => ({ ...current, notes: event.currentTarget.value || null }))} /></FormField>
      <SaveButton loading={mutation.isPending} editing={props.rate !== null} onCancel={() => props.onDone()} />
    </form>
  );
}
