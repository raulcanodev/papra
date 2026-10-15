/* eslint-disable style/indent, style/max-statements-per-line, style/no-trailing-spaces */
import type { InvoiceSeriesInput } from '../invoicing.types';
import { useParams } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { queryClient } from '@/modules/shared/query/query-client';
import { Badge } from '@/modules/ui/components/badge';
import { Checkbox, CheckboxControl } from '@/modules/ui/components/checkbox';
import { RowActions } from '@/modules/ui/components/row-actions';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField } from '@/modules/ui/components/textfield';
import { CatalogCell, CatalogPage, CatalogRow, CatalogTable, FormField, SaveButton } from '../components/catalog-page';
import { createInvoiceSeries, fetchInvoiceSeries, updateInvoiceSeries } from '../invoicing.services';

const empty = (): InvoiceSeriesInput => ({ name: '', prefix: 'INV-', nextNumber: 1, padding: 4, isDefault: false });
export function InvoiceSeriesPage() {
  const { t } = useI18n();
  const params = useParams(); const [value, setValue] = createSignal(empty()); const [editingId, setEditingId] = createSignal<string | null>(null); const [formOpen, setFormOpen] = createSignal(false); const [search, setSearch] = createSignal('');
  const query = useQuery(() => ({ queryKey: ['invoicing', params.organizationId, 'series'], queryFn: () => fetchInvoiceSeries({ organizationId: params.organizationId }) }));
  const rows = createMemo(() => (query.data?.series ?? []).filter(series => `${series.name} ${series.prefix}`.toLowerCase().includes(search().toLowerCase())));
  const reset = () => {
    setValue(empty()); setEditingId(null); setFormOpen(false);
  };
  const edit = (series: NonNullable<typeof query.data>['series'][number]) => {
    setEditingId(series.id); setValue({ name: series.name, prefix: series.prefix, nextNumber: series.nextNumber, padding: series.padding, isDefault: series.isDefault }); setFormOpen(true);
  };
  const mutation = createMutation(() => ({ mutationFn: () => editingId() ? updateInvoiceSeries({ organizationId: params.organizationId, seriesId: editingId()!, series: value() }) : createInvoiceSeries({ organizationId: params.organizationId, series: value() }), onSuccess: async () => {
    reset(); await queryClient.invalidateQueries({ queryKey: ['invoicing', params.organizationId, 'series'] }); createToast({ type: 'success', message: t('invoicing.series.toast.saved') });
  }, onError: () => createToast({ type: 'error', message: t('invoicing.series.toast.error') }) }));
  return (
    <CatalogPage
      title={t('invoicing.series.title')}
      description={t('invoicing.series.description')}
      actionLabel={t('invoicing.series.new')}
      formOpen={formOpen()}
      onFormOpenChange={open => open ? setFormOpen(true) : reset()}
      editing={editingId() !== null}
      editLabel={t('invoicing.series.edit')}
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
          <FormField label={t('invoicing.common.name')} class="sm:col-span-2"><TextField value={value().name} onInput={event => setValue(current => ({ ...current, name: event.currentTarget.value }))} /></FormField>
          <FormField label={t('invoicing.series.form.prefix')}><TextField value={value().prefix} onInput={event => setValue(current => ({ ...current, prefix: event.currentTarget.value }))} /></FormField>
          <FormField label={t('invoicing.series.form.next-number')}><TextField type="number" min="1" value={value().nextNumber} onInput={event => setValue(current => ({ ...current, nextNumber: Number(event.currentTarget.value) }))} /></FormField>
          <FormField label={t('invoicing.series.form.digits')}><TextField type="number" min="1" max="12" value={value().padding} onInput={event => setValue(current => ({ ...current, padding: Number(event.currentTarget.value) }))} /></FormField>
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
      <CatalogTable headers={[{ label: t('invoicing.series.table.series') }, { label: t('invoicing.series.table.next-invoice') }, { label: t('invoicing.series.form.digits'), class: 'text-right' }, { label: t('invoicing.common.default'), class: 'text-center' }, { label: '', class: 'w-14' }]}>
        <For each={rows()}>
          {series => (
            <CatalogRow onClick={() => edit(series)}>
              <CatalogCell class="font-medium">{series.name}</CatalogCell>
              <CatalogCell class="font-mono text-muted-foreground">
                {series.prefix}
                {String(series.nextNumber).padStart(series.padding, '0')}
              </CatalogCell>
              <CatalogCell class="text-right tabular-nums">{series.padding}</CatalogCell>
              <CatalogCell class="text-center"><Show when={series.isDefault}><Badge>{t('invoicing.common.default')}</Badge></Show></CatalogCell>
              <CatalogCell>
                {/* Series are not deleted: issued invoices keep pointing to them */}
                <RowActions itemName={series.name} onEdit={() => edit(series)} />
              </CatalogCell>
            </CatalogRow>
          )}
        </For>
      </CatalogTable>
    </CatalogPage>
  );
}
