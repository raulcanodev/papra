/* eslint-disable style/indent, style/jsx-max-props-per-line, style/jsx-one-expression-per-line, style/max-statements-per-line, style/no-trailing-spaces */
import type { TaxRateInput } from '../invoicing.types';
import { useParams } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { queryClient } from '@/modules/shared/query/query-client';
import { Badge } from '@/modules/ui/components/badge';
import { Button } from '@/modules/ui/components/button';
import { Checkbox, CheckboxControl } from '@/modules/ui/components/checkbox';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField } from '@/modules/ui/components/textfield';
import { CatalogCell, CatalogPage, CatalogRow, CatalogTable, FormField, SaveButton } from '../components/catalog-page';
import { createTaxRate, fetchTaxRates, updateTaxRate } from '../invoicing.services';

const empty = (): TaxRateInput => ({ name: '', rateBps: 2100, isDefault: false });
export function TaxesPage() {
  const { t } = useI18n();
  const params = useParams(); const [value, setValue] = createSignal(empty()); const [editingId, setEditingId] = createSignal<string | null>(null); const [formOpen, setFormOpen] = createSignal(false); const [search, setSearch] = createSignal('');
  const query = useQuery(() => ({ queryKey: ['invoicing', params.organizationId, 'tax-rates'], queryFn: () => fetchTaxRates({ organizationId: params.organizationId }) }));
  const rows = createMemo(() => (query.data?.taxRates ?? []).filter(tax => tax.name.toLowerCase().includes(search().toLowerCase())));
  const reset = () => {
    setValue(empty()); setEditingId(null); setFormOpen(false);
  };
  const edit = (tax: NonNullable<typeof query.data>['taxRates'][number]) => {
    setEditingId(tax.id); setValue({ name: tax.name, rateBps: tax.rateBps, isDefault: tax.isDefault }); setFormOpen(true);
  };
  const mutation = createMutation(() => ({ mutationFn: () => editingId() ? updateTaxRate({ organizationId: params.organizationId, taxRateId: editingId()!, taxRate: value() }) : createTaxRate({ organizationId: params.organizationId, taxRate: value() }), onSuccess: async () => {
    reset(); await queryClient.invalidateQueries({ queryKey: ['invoicing', params.organizationId, 'tax-rates'] }); createToast({ type: 'success', message: t('invoicing.taxes.toast.saved') });
  }, onError: () => createToast({ type: 'error', message: t('invoicing.taxes.toast.error') }) }));
  return (
    <CatalogPage
      title={t('invoicing.taxes.title')}
      description={t('invoicing.taxes.description')}
      actionLabel={t('invoicing.taxes.new')}
      formOpen={formOpen()}
      onFormOpenChange={open => open ? setFormOpen(true) : reset()}
      editing={editingId() !== null}
      editLabel={t('invoicing.taxes.edit')}
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
          <FormField label={t('invoicing.common.name')} class="sm:col-span-2"><TextField placeholder={t('invoicing.taxes.form.name-placeholder')} value={value().name} onInput={event => setValue(current => ({ ...current, name: event.currentTarget.value }))} /></FormField>
          <FormField label={t('invoicing.taxes.form.rate')}><TextField type="number" min="0" max="100" step="0.01" value={value().rateBps / 100} onInput={event => setValue(current => ({ ...current, rateBps: Math.round(Number(event.currentTarget.value) * 100) }))} /></FormField>
          <div class="contents">
            <Checkbox class="flex items-center gap-2 self-end pb-2 text-sm" checked={value().isDefault} onChange={checked => setValue(current => ({ ...current, isDefault: checked }))}>
              <CheckboxControl />
              {t('invoicing.common.default')}
            </Checkbox>
            <SaveButton loading={mutation.isPending} editing={editingId() !== null} onCancel={reset} />
          </div>
        </form>
      )}
    >
      <CatalogTable headers={[{ label: t('invoicing.taxes.table.tax') }, { label: t('invoicing.taxes.table.rate'), class: 'text-right' }, { label: t('invoicing.common.default'), class: 'text-center' }, { label: '', class: 'w-16' }]}>
        <For each={rows()}>
          {tax => (
            <CatalogRow onClick={() => edit(tax)}>
              <CatalogCell class="font-medium">{tax.name}</CatalogCell>
              <CatalogCell class="text-right tabular-nums">
                {tax.rateBps / 100}
                %
              </CatalogCell>
              <CatalogCell class="text-center"><Show when={tax.isDefault}><Badge>{t('invoicing.common.default')}</Badge></Show></CatalogCell>
              <CatalogCell>
                <Button
                  variant="ghost" size="icon" aria-label={t('invoicing.taxes.edit')} onClick={(event) => {
                    event.stopPropagation(); edit(tax);
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
