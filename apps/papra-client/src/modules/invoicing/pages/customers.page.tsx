/* eslint-disable style/indent, style/jsx-max-props-per-line, style/jsx-one-expression-per-line, style/max-statements-per-line, style/no-trailing-spaces */
import type { CustomerInput, InvoicingCustomer } from '../invoicing.types';
import type { EntityCustomPropertiesInput } from '@/modules/custom-properties/custom-properties.types';
import { useParams } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createMemo, createSignal, For } from 'solid-js';
import { EntityCustomPropertiesFields, invalidateEntityCustomProperties } from '@/modules/custom-properties/components/entity-custom-properties-fields.component';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { queryClient } from '@/modules/shared/query/query-client';
import { Button } from '@/modules/ui/components/button';
import { createToast } from '@/modules/ui/components/sonner';
import { CatalogCell, CatalogPage, CatalogRow, CatalogTable, SaveButton } from '../components/catalog-page';
import { CustomerFormFields, emptyCustomer } from '../components/customer-form';
import { createCustomer, fetchCustomers, updateCustomer } from '../invoicing.services';

const empty = emptyCustomer;
const toInput = (customer: InvoicingCustomer): CustomerInput => ({ name: customer.name, email: customer.email, taxId: customer.taxId, addressLine1: customer.addressLine1, addressLine2: customer.addressLine2, postalCode: customer.postalCode, city: customer.city, region: customer.region, country: customer.country, currency: customer.currency, paymentTermsDays: customer.paymentTermsDays, notes: customer.notes });
export function CustomersPage() {
  const { t } = useI18n();
  const params = useParams(); const [value, setValue] = createSignal(empty()); const [editingId, setEditingId] = createSignal<string | null>(null); const [customProperties, setCustomProperties] = createSignal<EntityCustomPropertiesInput>({}); const [formOpen, setFormOpen] = createSignal(false); const [search, setSearch] = createSignal('');
  const query = useQuery(() => ({ queryKey: ['invoicing', params.organizationId, 'customers'], queryFn: () => fetchCustomers({ organizationId: params.organizationId }) }));
  const rows = createMemo(() => (query.data?.customers ?? []).filter(customer => `${customer.name} ${customer.email ?? ''} ${customer.taxId ?? ''}`.toLowerCase().includes(search().toLowerCase())));
  const reset = () => {
    setValue(empty()); setEditingId(null); setCustomProperties({}); setFormOpen(false);
  };
  const edit = (customer: InvoicingCustomer) => {
    setCustomProperties({}); setEditingId(customer.id); setValue(toInput(customer)); setFormOpen(true);
  };
  const mutation = createMutation(() => ({ mutationFn: () => editingId() ? updateCustomer({ organizationId: params.organizationId, customerId: editingId()!, customer: { ...value(), customProperties: customProperties() } }) : createCustomer({ organizationId: params.organizationId, customer: { ...value(), customProperties: customProperties() } }), onSuccess: async () => {
    reset(); await invalidateEntityCustomProperties({ organizationId: params.organizationId, entityType: 'customer' }); await queryClient.invalidateQueries({ queryKey: ['invoicing', params.organizationId, 'customers'] }); createToast({ type: 'success', message: t('invoicing.customers.toast.saved') });
  }, onError: () => createToast({ type: 'error', message: t('invoicing.customers.toast.error') }) }));
  return (
    <CatalogPage
      title={t('invoicing.customers.title')}
      description={t('invoicing.customers.description')}
      actionLabel={t('invoicing.customers.new')}
      formOpen={formOpen()}
      onFormOpenChange={open => open ? setFormOpen(true) : reset()}
      editing={editingId() !== null}
      editLabel={t('invoicing.customers.edit')}
      search={search()}
      onSearchChange={setSearch}
      loading={query.isLoading}
      empty={rows().length === 0}
      form={(
        <form
          class="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault(); if (value().name.trim()) {
 mutation.mutate(); 
}
          }}
        >
          <CustomerFormFields value={value()} onChange={setValue} autofocus />
          <EntityCustomPropertiesFields organizationId={params.organizationId} entityType="customer" entityId={editingId()} value={customProperties()} onChange={setCustomProperties} />
          <SaveButton loading={mutation.isPending} editing={editingId() !== null} onCancel={reset} />
        </form>
      )}
    >
      <CatalogTable headers={[{ label: t('invoicing.customers.table.customer') }, { label: t('invoicing.common.tax-id') }, { label: t('invoicing.customers.table.city') }, { label: t('invoicing.customers.table.terms'), class: 'text-right' }, { label: '', class: 'w-16' }]}>
        <For each={rows()}>
          {customer => (
            <CatalogRow onClick={() => edit(customer)}>
              <CatalogCell>
                <div class="font-medium">{customer.name}</div>
                <div class="text-xs text-muted-foreground">{customer.email || t('invoicing.customers.no-email')}</div>
              </CatalogCell>
              <CatalogCell class="text-muted-foreground">{customer.taxId || '—'}</CatalogCell>
              <CatalogCell class="text-muted-foreground">{customer.city || '—'}</CatalogCell>
              <CatalogCell class="text-right tabular-nums">
                {t('invoicing.customers.terms-days', { days: customer.paymentTermsDays })}
              </CatalogCell>
              <CatalogCell>
                <Button
                  variant="ghost" size="icon" aria-label={t('invoicing.customers.edit')} onClick={(event) => {
                    event.stopPropagation(); edit(customer);
                  }}
                ><div class="i-tabler-pencil size-4" />
                </Button>
              </CatalogCell>
            </CatalogRow>
          )}
        </For>
      </CatalogTable>
    </CatalogPage>
  );
}
