import type { DeliveryNote } from '../delivery-notes.types';
import type { InvoiceDeliveryNote } from '@/modules/invoicing/invoicing.types';
import { useQuery } from '@tanstack/solid-query';
import { createSignal, For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { Button } from '@/modules/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/modules/ui/components/dialog';
import { SimpleCheckbox } from '@/modules/ui/components/simple-checkbox';
import { createToast } from '@/modules/ui/components/sonner';
import { fetchDeliveryNote, fetchDeliveryNotes, getDeliveryNotesQueryKey } from '../delivery-notes.services';

// On an invoice of a customer: the delivery notes it covers, and its pending ones to add, whose lines fill the invoice
export function InvoiceDeliveryNotesField(props: {
  organizationId: string;
  customerId: string;
  deliveryNotes: InvoiceDeliveryNote[];
  /** The ones the saved invoice covered: taken out in this edit, they can go back on it before saving */
  savedDeliveryNotes: InvoiceDeliveryNote[];
  onAdd: (deliveryNotes: DeliveryNote[]) => void;
  onRemove: (deliveryNoteId: string) => void;
}) {
  const { t, formatDate } = useI18n();
  const [isOpen, setIsOpen] = createSignal(false);
  const [selectedIds, setSelectedIds] = createSignal<string[]>([]);
  const [isAdding, setIsAdding] = createSignal(false);

  const query = useQuery(() => ({
    queryKey: [...getDeliveryNotesQueryKey({ organizationId: props.organizationId }), { customerId: props.customerId, status: 'pending' }],
    queryFn: () => fetchDeliveryNotes({ organizationId: props.organizationId, customerId: props.customerId, status: 'pending' }),
  }));
  // The pending ones, and the ones taken out of this invoice in this edit (still on it for the server until saved)
  const isOnInvoice = (id: string) => props.deliveryNotes.some(deliveryNote => deliveryNote.id === id);
  const available = (): Array<InvoiceDeliveryNote & { itemCount?: number }> => [
    ...props.savedDeliveryNotes.filter(({ id }) => !isOnInvoice(id)),
    ...(query.data?.deliveryNotes ?? []).filter(({ id }) => !isOnInvoice(id) && !props.savedDeliveryNotes.some(saved => saved.id === id)),
  ].toSorted((a, b) => a.date.getTime() - b.date.getTime());

  const open = () => {
    setSelectedIds(available().map(({ id }) => id));
    setIsOpen(true);
  };

  const add = async (organizationId: string) => {
    setIsAdding(true);
    try {
      const details = await Promise.all(selectedIds().map(async deliveryNoteId => (await fetchDeliveryNote({ organizationId, deliveryNoteId })).deliveryNote));
      props.onAdd(details);
      setIsOpen(false);
    } catch {
      createToast({ type: 'error', message: t('invoicing.editor.delivery-notes.error') });
    } finally {
      setIsAdding(false);
    }
  };

  const label = (deliveryNote: { number: string | null; date: Date }) => [deliveryNote.number, formatDate(deliveryNote.date)].filter(Boolean).join(' · ');

  return (
    <Show when={props.deliveryNotes.length > 0 || available().length > 0}>
      <div class="mb-4 flex flex-wrap items-center gap-2">
        <For each={props.deliveryNotes}>
          {deliveryNote => (
            <span class="inline-flex items-center gap-1.5 rounded-full bg-muted py-1 pe-1 ps-2.5 text-xs font-medium">
              <div class="i-tabler-truck-delivery size-3.5 text-muted-foreground" />
              {label(deliveryNote)}
              <button type="button" class="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:(bg-background text-foreground)" aria-label={t('invoicing.editor.delivery-notes.remove')} onClick={() => props.onRemove(deliveryNote.id)}>
                <div class="i-tabler-x size-3" />
              </button>
            </span>
          )}
        </For>
        <Show when={available().length > 0}>
          <Button type="button" variant="outline" size="sm" class="h-7 gap-1.5 rounded-full" onClick={open}>
            <div class="i-tabler-truck-delivery size-3.5" />
            {t('invoicing.editor.delivery-notes.add', { count: available().length })}
          </Button>
        </Show>
      </div>

      <Dialog open={isOpen()} onOpenChange={setIsOpen}>
        <DialogContent class="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('invoicing.editor.delivery-notes.dialog.title')}</DialogTitle>
            <DialogDescription>{t('invoicing.editor.delivery-notes.dialog.description')}</DialogDescription>
          </DialogHeader>
          <ul class="max-h-80 divide-y overflow-y-auto border-y">
            <For each={available()}>
              {deliveryNote => (
                <li>
                  <SimpleCheckbox
                    class="py-2.5"
                    checked={selectedIds().includes(deliveryNote.id)}
                    onChange={checked => setSelectedIds(ids => (checked ? [...ids, deliveryNote.id] : ids.filter(id => id !== deliveryNote.id)))}
                    label={(
                      <span class="flex items-center gap-3">
                        <span class="font-medium">{deliveryNote.number ?? '—'}</span>
                        <span class="text-muted-foreground">{formatDate(deliveryNote.date)}</span>
                        <Show when={deliveryNote.itemCount}>
                          {count => <span class="text-muted-foreground">{t('invoicing.editor.delivery-notes.lines', { count: count() })}</span>}
                        </Show>
                      </span>
                    )}
                  />
                </li>
              )}
            </For>
          </ul>
          <div class="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>{t('invoicing.editor.delivery-notes.dialog.cancel')}</Button>
            <Button type="button" disabled={selectedIds().length === 0} isLoading={isAdding()} onClick={() => void add(props.organizationId)}>
              {t('invoicing.editor.delivery-notes.dialog.confirm', { count: selectedIds().length })}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Show>
  );
}
