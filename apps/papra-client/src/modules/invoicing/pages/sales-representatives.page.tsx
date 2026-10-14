/* eslint-disable style/indent, style/jsx-max-props-per-line, style/jsx-one-expression-per-line, style/max-statements-per-line, style/no-trailing-spaces */
import type { SalesRepresentativeInput } from '../invoicing.types';
import type { EntityCustomPropertiesInput } from '@/modules/custom-properties/custom-properties.types';
import { useParams } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createMemo, createSignal, For } from 'solid-js';
import { EntityCustomPropertiesFields, invalidateEntityCustomProperties } from '@/modules/custom-properties/components/entity-custom-properties-fields.component';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { queryClient } from '@/modules/shared/query/query-client';
import { Button } from '@/modules/ui/components/button';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField } from '@/modules/ui/components/textfield';
import { CatalogCell, CatalogPage, CatalogRow, CatalogTable, FormField, SaveButton } from '../components/catalog-page';
import { createSalesRepresentative, fetchSalesRepresentatives, updateSalesRepresentative } from '../invoicing.services';

const empty = (): SalesRepresentativeInput => ({ name: '', email: null, phone: null, taxId: null, notes: null });
export function SalesRepresentativesPage() {
  const { t } = useI18n();
  const params = useParams(); const [value, setValue] = createSignal(empty()); const [editingId, setEditingId] = createSignal<string | null>(null); const [customProperties, setCustomProperties] = createSignal<EntityCustomPropertiesInput>({}); const [formOpen, setFormOpen] = createSignal(false); const [search, setSearch] = createSignal('');
  const query = useQuery(() => ({ queryKey: ['invoicing', params.organizationId, 'sales-representatives'], queryFn: () => fetchSalesRepresentatives({ organizationId: params.organizationId }) }));
  const rows = createMemo(() => (query.data?.salesRepresentatives ?? []).filter(person => `${person.name} ${person.email ?? ''} ${person.phone ?? ''}`.toLowerCase().includes(search().toLowerCase())));
  const reset = () => {
    setValue(empty()); setEditingId(null); setCustomProperties({}); setFormOpen(false);
  };
  const edit = (person: NonNullable<typeof query.data>['salesRepresentatives'][number]) => {
    setCustomProperties({}); setEditingId(person.id); setValue({ name: person.name, email: person.email, phone: person.phone, taxId: person.taxId, notes: person.notes }); setFormOpen(true);
  };
  const mutation = createMutation(() => ({ mutationFn: () => editingId() ? updateSalesRepresentative({ organizationId: params.organizationId, representativeId: editingId()!, representative: { ...value(), customProperties: customProperties() } }) : createSalesRepresentative({ organizationId: params.organizationId, representative: { ...value(), customProperties: customProperties() } }), onSuccess: async () => {
    reset(); await invalidateEntityCustomProperties({ organizationId: params.organizationId, entityType: 'sales_representative' }); await queryClient.invalidateQueries({ queryKey: ['invoicing', params.organizationId, 'sales-representatives'] }); createToast({ type: 'success', message: t('invoicing.sales-representatives.toast.saved') });
  }, onError: () => createToast({ type: 'error', message: t('invoicing.sales-representatives.toast.error') }) }));
  return (
    <CatalogPage
      title={t('invoicing.sales-representatives.title')}
      description={t('invoicing.sales-representatives.description')}
      actionLabel={t('invoicing.sales-representatives.new')}
      formOpen={formOpen()}
      onFormOpenChange={open => open ? setFormOpen(true) : reset()}
      editing={editingId() !== null}
      editLabel={t('invoicing.sales-representatives.edit')}
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
          <FormField label={t('invoicing.common.name')}><TextField value={value().name} onInput={event => setValue(current => ({ ...current, name: event.currentTarget.value }))} /></FormField>
          <FormField label={t('invoicing.common.email')}><TextField type="email" value={value().email ?? ''} onInput={event => setValue(current => ({ ...current, email: event.currentTarget.value || null }))} /></FormField>
          <FormField label={t('invoicing.common.phone')}><TextField value={value().phone ?? ''} onInput={event => setValue(current => ({ ...current, phone: event.currentTarget.value || null }))} /></FormField>
          <EntityCustomPropertiesFields organizationId={params.organizationId} entityType="sales_representative" entityId={editingId()} value={customProperties()} onChange={setCustomProperties} />
          <SaveButton loading={mutation.isPending} editing={editingId() !== null} onCancel={reset} />
        </form>
      )}
    >
      <CatalogTable headers={[{ label: t('invoicing.common.name') }, { label: t('invoicing.common.email') }, { label: t('invoicing.common.phone') }, { label: '', class: 'w-16' }]}>
        <For each={rows()}>
          {person => (
            <CatalogRow onClick={() => edit(person)}>
              <CatalogCell class="font-medium">{person.name}</CatalogCell>
              <CatalogCell class="text-muted-foreground">{person.email || '—'}</CatalogCell>
              <CatalogCell class="text-muted-foreground">{person.phone || '—'}</CatalogCell>
              <CatalogCell>
                <Button
                  variant="ghost" size="icon" aria-label={t('invoicing.sales-representatives.edit')} onClick={(event) => {
                    event.stopPropagation(); edit(person);
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
