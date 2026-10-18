import type { DeliveryNote, DeliveryNoteStatus } from '../delivery-notes.types';
import type { ActiveFilter, FilterField } from '@/modules/ui/components/table-filters';
import { useNavigate, useParams } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import pLimit from 'p-limit';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { uploadChatAttachment } from '@/modules/ai-assistant/ai-assistant.services';
import { isTouchDevice } from '@/modules/captures/captures.models';
import { createPhotoCapture } from '@/modules/captures/components/photo-capture-button';
import { usePageFilesDrop } from '@/modules/documents/components/global-drop-area.component';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { CatalogCell, CatalogRow, CatalogTable } from '@/modules/invoicing/components/catalog-page';
import { EXTRACTABLE_FILE_ACCEPT } from '@/modules/purchases/purchases.constants';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';
import { ChoiceDialog } from '@/modules/ui/components/choice-dialog';
import { EntityIcon } from '@/modules/ui/components/entity-icon';
import { RowActions } from '@/modules/ui/components/row-actions';
import { SimpleCheckbox } from '@/modules/ui/components/simple-checkbox';
import { createToast } from '@/modules/ui/components/sonner';
import { dateIsInRange, getActiveFilter, isDateRangeValue } from '@/modules/ui/components/table-filters';
import { TableToolbar } from '@/modules/ui/components/table-toolbar';
import { getOrganizationRouteChildHref } from '@/modules/ui/navigation/organization-navigation';
import { DELIVERY_NOTE_STATUS_BADGE_CLASSES, DELIVERY_NOTE_STATUS_LABEL_I18N_KEYS, DELIVERY_NOTE_STATUSES } from '../delivery-notes.constants';
import { getPendingDeliveryNotesByCustomer } from '../delivery-notes.models';
import { deleteDeliveryNote, fetchDeliveryNotes, getDeliveryNotesQueryKey, invoiceDeliveryNotes, openDeliveryNotePdf } from '../delivery-notes.services';

export function DeliveryNotesPage() {
  const { t, formatDate } = useI18n();
  const params = useParams();
  const navigate = useNavigate();
  const [search, setSearch] = createSignal('');
  const [filters, setFilters] = createSignal<ActiveFilter[]>([]);
  const [selectedIds, setSelectedIds] = createSignal<string[]>([]);
  const [isAddOpen, setIsAddOpen] = createSignal(false);
  const [isUploading, setIsUploading] = createSignal(false);
  let fileInput: HTMLInputElement | undefined;

  const queryKey = () => getDeliveryNotesQueryKey({ organizationId: params.organizationId });
  const query = useQuery(() => ({ queryKey: queryKey(), queryFn: () => fetchDeliveryNotes({ organizationId: params.organizationId }) }));
  const deliveryNotes = () => query.data?.deliveryNotes ?? [];

  const filterFields = createMemo((): FilterField[] => [
    {
      id: 'status',
      type: 'multi-select',
      label: t('delivery-notes.table.status'),
      icon: 'i-tabler-progress-check',
      options: DELIVERY_NOTE_STATUSES.map(status => ({ value: status, label: t(DELIVERY_NOTE_STATUS_LABEL_I18N_KEYS[status]) })),
    },
    { id: 'date', type: 'date-range', label: t('delivery-notes.table.date'), icon: 'i-tabler-calendar' },
  ]);

  const rows = createMemo(() => {
    const term = search().trim().toLowerCase();
    const statuses = getActiveFilter(filters(), 'status')?.value;
    const dateRange = getActiveFilter(filters(), 'date')?.value;

    return deliveryNotes()
      .filter(deliveryNote => !Array.isArray(statuses) || statuses.length === 0 || statuses.includes(deliveryNote.status))
      .filter(deliveryNote => !isDateRangeValue(dateRange) || dateIsInRange(deliveryNote.date, dateRange))
      .filter(deliveryNote => `${deliveryNote.customerName} ${deliveryNote.number ?? ''} ${deliveryNote.invoiceNumber ?? ''}`.toLowerCase().includes(term));
  });

  // What is owed and not invoiced yet, customer by customer: one click turns all of it into an invoice
  const pendingByCustomer = createMemo(() => getPendingDeliveryNotesByCustomer({ deliveryNotes: deliveryNotes() }));
  const selected = createMemo(() => deliveryNotes().filter(deliveryNote => selectedIds().includes(deliveryNote.id)));
  const selectionCustomerCount = () => new Set(selected().map(({ customerId }) => customerId)).size;

  const childHref = (childPath: string) => getOrganizationRouteChildHref({ organizationId: params.organizationId, routeId: 'deliveryNotes', childPath });
  const invoiceHref = (invoiceId: string) => getOrganizationRouteChildHref({ organizationId: params.organizationId, routeId: 'invoices', childPath: `${invoiceId}/edit` });

  const toggleSelected = (deliveryNote: DeliveryNote, isSelected: boolean) => setSelectedIds(ids => (isSelected ? [...ids, deliveryNote.id] : ids.filter(id => id !== deliveryNote.id)));

  const invoiceMutation = createMutation(() => ({
    mutationFn: (deliveryNoteIds: string[]) => invoiceDeliveryNotes({ organizationId: params.organizationId, deliveryNoteIds }),
    onSuccess: async ({ invoice }) => {
      setSelectedIds([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKey() }),
        queryClient.invalidateQueries({ queryKey: ['invoicing', params.organizationId, 'invoices'] }),
      ]);
      createToast({ type: 'success', message: t('delivery-notes.toast.invoiced') });
      navigate(invoiceHref(invoice.id));
    },
    onError: () => createToast({ type: 'error', message: t('delivery-notes.toast.invoice-error') }),
  }));

  const deleteMutation = createMutation(() => ({
    mutationFn: (deliveryNoteId: string) => deleteDeliveryNote({ organizationId: params.organizationId, deliveryNoteId }),
    onSuccess: async () => {
      createToast({ type: 'success', message: t('delivery-notes.toast.deleted') });
      await queryClient.invalidateQueries({ queryKey: queryKey() });
    },
    onError: () => createToast({ type: 'error', message: t('delivery-notes.toast.delete-error') }),
  }));

  // The tab is opened on the click: one opened once the PDF is ready would be blocked
  const print = (deliveryNoteId: string) => {
    const target = window.open('', '_blank');
    openDeliveryNotePdf({ organizationId: params.organizationId, deliveryNoteId, target }).catch(() => {
      target?.close();
      createToast({ type: 'error', message: t('delivery-notes.toast.print-error') });
    });
  };

  // Each photo is reviewed in the editor, prefilled by the reading; several are reviewed one after the other
  const reviewDocuments = (documentIds: string[]) => {
    const [first, ...queue] = documentIds;
    if (first === undefined) {
      return;
    }

    const searchParams = new URLSearchParams({ documentId: first });
    if (queue.length > 0) {
      searchParams.set('queue', queue.join(','));
    }
    navigate(`${childHref('new')}?${searchParams.toString()}`);
  };

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    setIsUploading(true);
    try {
      const limit = pLimit(3);
      const documentIds = await Promise.all(files.map(async file => limit(async () => (await uploadChatAttachment({ organizationId: params.organizationId, file })).attachment.documentId)));
      reviewDocuments([...new Set(documentIds)]);
    } catch {
      createToast({ type: 'error', message: t('delivery-notes.upload.error') });
    } finally {
      setIsUploading(false);
    }
  };

  usePageFilesDrop(files => void uploadFiles(files));
  const photoCapture = createPhotoCapture({ organizationId: params.organizationId, purpose: 'delivery_note', onFiles: files => void uploadFiles(files), onDocuments: reviewDocuments });

  return (
    <main class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">{t('delivery-notes.title')}</h1>
          <p class="page-description">{t('delivery-notes.description')}</p>
        </div>
        <div>
          <Button size="sm" class="gap-1.5 max-sm:w-full" isLoading={isUploading() || photoCapture.isPreparing()} onClick={() => setIsAddOpen(true)}>
            <div class="i-tabler-plus size-4" />
            {t('delivery-notes.add.button')}
          </Button>
          <ChoiceDialog
            open={isAddOpen()}
            onOpenChange={setIsAddOpen}
            title={t('delivery-notes.add.title')}
            description={t('delivery-notes.add.description')}
            options={[
              { id: 'photo', icon: 'i-tabler-camera', title: t('delivery-notes.add.photo.title'), description: isTouchDevice() ? t('delivery-notes.add.photo.description') : t('delivery-notes.add.photo.description-desktop'), isHighlighted: true, onSelect: () => photoCapture.open() },
              { id: 'upload', icon: 'i-tabler-upload', title: t('delivery-notes.add.upload.title'), description: t('delivery-notes.add.upload.description'), onSelect: () => fileInput?.click() },
              { id: 'manual', icon: 'i-tabler-pencil', title: t('delivery-notes.add.manual.title'), description: t('delivery-notes.add.manual.description'), href: childHref('new') },
            ]}
          />
          {photoCapture.elements}
          <input
            ref={fileInput}
            type="file"
            class="hidden"
            multiple
            accept={EXTRACTABLE_FILE_ACCEPT}
            onChange={(event) => {
              const files = [...(event.currentTarget.files ?? [])];
              event.currentTarget.value = '';
              void uploadFiles(files);
            }}
          />
        </div>
      </div>

      <Show when={pendingByCustomer().length > 0}>
        <section class="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/6 p-4">
          <div class="flex items-center gap-3">
            <div class="i-tabler-truck-delivery size-5 shrink-0 text-amber-600 dark:text-amber-300" />
            <div class="min-w-0 flex-1">
              <p class="font-medium">{t('delivery-notes.pending.title')}</p>
              <p class="text-sm text-muted-foreground">{t('delivery-notes.pending.description')}</p>
            </div>
          </div>
          <ul class="mt-3 flex flex-col divide-y divide-amber-500/15">
            <For each={pendingByCustomer()}>
              {group => (
                <li class="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
                  <EntityIcon icon={group.customerIcon} color={group.customerIconColor} fallback="i-tabler-building" size="sm" />
                  <div class="min-w-0 flex-1">
                    <span class="font-medium">{group.customerName}</span>
                    <span class="ml-2 text-sm text-muted-foreground">{t('delivery-notes.pending.count', { count: group.deliveryNoteIds.length })}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    class="h-8 gap-1.5"
                    isLoading={invoiceMutation.isPending && invoiceMutation.variables?.join() === group.deliveryNoteIds.join()}
                    disabled={invoiceMutation.isPending}
                    onClick={() => invoiceMutation.mutate(group.deliveryNoteIds)}
                  >
                    <div class="i-tabler-file-invoice size-4" />
                    {t('delivery-notes.pending.invoice')}
                  </Button>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>

      <div class="mt-4" />
      <TableToolbar search={search()} onSearchChange={setSearch} searchPlaceholder={t('invoicing.common.search')} fields={filterFields()} filters={filters()} onFiltersChange={setFilters} />

      <Show when={selected().length > 0}>
        <div class="mb-3 flex flex-wrap items-center gap-3 rounded-xl border bg-muted/40 px-4 py-2.5">
          <span class="text-sm font-medium">{t('delivery-notes.selection.count', { count: selected().length })}</span>
          <Show when={selectionCustomerCount() > 1}>
            <span class="text-sm text-muted-foreground">{t('delivery-notes.selection.mixed-customers')}</span>
          </Show>
          <div class="flex-1" />
          <Button variant="ghost" size="sm" class="h-8" onClick={() => setSelectedIds([])}>{t('delivery-notes.selection.clear')}</Button>
          <Button size="sm" class="h-8 gap-1.5" disabled={selectionCustomerCount() !== 1 || invoiceMutation.isPending} isLoading={invoiceMutation.isPending} onClick={() => invoiceMutation.mutate(selectedIds())}>
            <div class="i-tabler-file-invoice size-4" />
            {t('delivery-notes.selection.invoice')}
          </Button>
        </div>
      </Show>

      <Show
        when={query.isLoading || rows().length > 0}
        fallback={(
          <div class="rounded-xl border border-dashed py-14 text-center">
            <div class="i-tabler-truck-delivery mx-auto mb-3 size-9 text-muted-foreground/50" />
            <p class="font-medium">{t('delivery-notes.empty.title')}</p>
            <p class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{t('delivery-notes.empty.description')}</p>
            <Button size="sm" class="mt-4 gap-1.5" isLoading={isUploading()} onClick={() => setIsAddOpen(true)}>
              <div class="i-tabler-plus size-4" />
              {t('delivery-notes.add.button')}
            </Button>
          </div>
        )}
      >
        <CatalogTable headers={[
          { label: '', class: 'w-10' },
          { label: t('delivery-notes.table.date') },
          { label: t('delivery-notes.table.number') },
          { label: t('delivery-notes.table.customer') },
          { label: t('delivery-notes.table.lines'), class: 'text-right' },
          { label: t('delivery-notes.table.status') },
          { label: '', class: 'w-14' },
        ]}
        >
          <For each={rows()}>
            {deliveryNote => (
              <CatalogRow onClick={() => navigate(childHref(`${deliveryNote.id}/edit`))}>
                <CatalogCell>
                  <Show when={deliveryNote.status === 'pending'}>
                    <div onClick={event => event.stopPropagation()}>
                      <SimpleCheckbox aria-label={t('delivery-notes.selection.select')} checked={selectedIds().includes(deliveryNote.id)} onChange={checked => toggleSelected(deliveryNote, checked)} />
                    </div>
                  </Show>
                </CatalogCell>
                <CatalogCell class="whitespace-nowrap text-muted-foreground">{formatDate(deliveryNote.date)}</CatalogCell>
                <CatalogCell class="text-muted-foreground">
                  <div class="flex items-center gap-1.5">
                    {deliveryNote.number ?? '—'}
                    <Show when={deliveryNote.documentId}>
                      <div class="i-tabler-photo size-3.5" title={t('delivery-notes.table.has-photo')} />
                    </Show>
                  </div>
                </CatalogCell>
                <CatalogCell primary>
                  <div class="flex min-w-0 items-center gap-2.5">
                    <EntityIcon icon={deliveryNote.customerIcon} color={deliveryNote.customerIconColor} fallback="i-tabler-building" />
                    <span class="truncate font-medium">{deliveryNote.customerName}</span>
                  </div>
                </CatalogCell>
                <CatalogCell class="text-right tabular-nums text-muted-foreground">{deliveryNote.itemCount ?? 0}</CatalogCell>
                <CatalogCell>
                  <StatusCell deliveryNote={deliveryNote} onOpenInvoice={invoiceId => navigate(invoiceHref(invoiceId))} />
                </CatalogCell>
                <CatalogCell>
                  <RowActions
                    itemName={deliveryNote.number ?? deliveryNote.customerName}
                    actions={[
                      { label: t('delivery-notes.actions.print'), icon: 'i-tabler-printer', onSelect: () => print(deliveryNote.id) },
                      ...(deliveryNote.status === 'pending' ? [{ label: t('delivery-notes.actions.invoice'), icon: 'i-tabler-file-invoice', onSelect: () => invoiceMutation.mutate([deliveryNote.id]) }] : []),
                    ]}
                    onEdit={() => navigate(childHref(`${deliveryNote.id}/edit`))}
                    onDelete={() => deleteMutation.mutateAsync(deliveryNote.id)}
                    // An invoiced delivery note belongs to its invoice: deleting the draft invoice frees it
                    deleteDisabled={deliveryNote.status !== 'pending'}
                  />
                </CatalogCell>
              </CatalogRow>
            )}
          </For>
        </CatalogTable>
      </Show>
    </main>
  );
}

function StatusCell(props: { deliveryNote: DeliveryNote; onOpenInvoice: (invoiceId: string) => void }) {
  const { t } = useI18n();
  const status = (): DeliveryNoteStatus => props.deliveryNote.status;

  return (
    <div class="flex items-center gap-2">
      <span class={cn('rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', DELIVERY_NOTE_STATUS_BADGE_CLASSES[status()])}>
        {t(DELIVERY_NOTE_STATUS_LABEL_I18N_KEYS[status()])}
      </span>
      <Show when={props.deliveryNote.invoiceNumber !== null}>
        <span class="truncate text-xs text-muted-foreground">{props.deliveryNote.invoiceNumber}</span>
      </Show>
      {/* A draft invoice opens in its editor, an issued one is a legal record listed in sales */}
      <Show when={props.deliveryNote.invoiceStatus === 'draft' ? props.deliveryNote.invoiceId : null}>
        {invoiceId => (
          <button
            type="button"
            class="truncate text-xs text-muted-foreground hover:underline"
            onClick={(event) => {
              event.stopPropagation();
              props.onOpenInvoice(invoiceId());
            }}
          >
            {t('delivery-notes.table.draft-invoice')}
          </button>
        )}
      </Show>
    </div>
  );
}
