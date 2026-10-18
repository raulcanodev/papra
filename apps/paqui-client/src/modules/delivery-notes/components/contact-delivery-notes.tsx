import { A, useNavigate } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { CatalogCell, CatalogRow, CatalogTable } from '@/modules/invoicing/components/catalog-page';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';
import { createToast } from '@/modules/ui/components/sonner';
import { getOrganizationRouteChildHref } from '@/modules/ui/navigation/organization-navigation';
import { DELIVERY_NOTE_STATUS_BADGE_CLASSES, DELIVERY_NOTE_STATUS_LABEL_I18N_KEYS } from '../delivery-notes.constants';
import { fetchDeliveryNotes, getDeliveryNotesQueryKey, invoiceDeliveryNotes } from '../delivery-notes.services';

// The delivery notes of one customer, on its contact page: a new one already for it, and its pending ones invoiced at once
export function ContactDeliveryNotes(props: { organizationId: string; contactId: string }) {
  const { t, formatDate } = useI18n();
  const navigate = useNavigate();

  const query = useQuery(() => ({
    queryKey: [...getDeliveryNotesQueryKey({ organizationId: props.organizationId }), { customerId: props.contactId }],
    queryFn: () => fetchDeliveryNotes({ organizationId: props.organizationId, customerId: props.contactId }),
  }));
  const deliveryNotes = () => query.data?.deliveryNotes ?? [];
  const pendingIds = () => deliveryNotes().filter(({ status }) => status === 'pending').map(({ id }) => id);
  const childHref = (childPath: string) => getOrganizationRouteChildHref({ organizationId: props.organizationId, routeId: 'deliveryNotes', childPath });

  const invoiceMutation = createMutation(() => ({
    mutationFn: () => invoiceDeliveryNotes({ organizationId: props.organizationId, deliveryNoteIds: pendingIds() }),
    onSuccess: async ({ invoice }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getDeliveryNotesQueryKey({ organizationId: props.organizationId }) }),
        queryClient.invalidateQueries({ queryKey: ['invoicing', props.organizationId, 'invoices'] }),
      ]);
      createToast({ type: 'success', message: t('delivery-notes.toast.invoiced') });
      navigate(getOrganizationRouteChildHref({ organizationId: props.organizationId, routeId: 'invoices', childPath: `${invoice.id}/edit` }));
    },
    onError: () => createToast({ type: 'error', message: t('delivery-notes.toast.invoice-error') }),
  }));

  return (
    <>
      <div class="mb-3 flex items-center justify-between gap-3">
        <p class="text-sm text-muted-foreground">
          {pendingIds().length > 0 ? t('contacts.detail.delivery-notes.pending', { count: pendingIds().length }) : t('contacts.detail.delivery-notes.description')}
        </p>
        <div class="flex shrink-0 gap-2">
          <Show when={pendingIds().length > 0}>
            <Button size="sm" variant="outline" class="gap-1.5" isLoading={invoiceMutation.isPending} onClick={() => invoiceMutation.mutate()}>
              <div class="i-tabler-file-invoice size-4" />
              {t('delivery-notes.pending.invoice')}
            </Button>
          </Show>
          <Button as={A} size="sm" class="gap-1.5" href={`${childHref('new')}?customerId=${encodeURIComponent(props.contactId)}`}>
            <div class="i-tabler-plus size-4" />
            {t('contacts.detail.delivery-notes.new')}
          </Button>
        </div>
      </div>

      <Show when={deliveryNotes().length > 0} fallback={<Show when={!query.isLoading}><div class="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">{t('contacts.detail.delivery-notes.empty')}</div></Show>}>
        <CatalogTable headers={[{ label: t('delivery-notes.table.date') }, { label: t('delivery-notes.table.number') }, { label: t('delivery-notes.table.lines'), class: 'text-right' }, { label: t('delivery-notes.table.status') }]}>
          <For each={deliveryNotes()}>
            {deliveryNote => (
              <CatalogRow onClick={() => navigate(childHref(`${deliveryNote.id}/edit`))}>
                <CatalogCell class="whitespace-nowrap text-muted-foreground">{formatDate(deliveryNote.date)}</CatalogCell>
                <CatalogCell class="font-medium">{deliveryNote.number ?? '—'}</CatalogCell>
                <CatalogCell class="text-right tabular-nums text-muted-foreground">{deliveryNote.itemCount ?? 0}</CatalogCell>
                <CatalogCell>
                  <span class={cn('rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', DELIVERY_NOTE_STATUS_BADGE_CLASSES[deliveryNote.status])}>
                    {t(DELIVERY_NOTE_STATUS_LABEL_I18N_KEYS[deliveryNote.status])}
                  </span>
                  <Show when={deliveryNote.invoiceNumber}>
                    {number => <span class="ml-2 text-xs text-muted-foreground">{number()}</span>}
                  </Show>
                </CatalogCell>
              </CatalogRow>
            )}
          </For>
        </CatalogTable>
      </Show>
    </>
  );
}
