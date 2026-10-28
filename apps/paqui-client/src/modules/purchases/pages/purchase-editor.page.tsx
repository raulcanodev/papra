import type { ExpenseCategory, PurchaseDocumentKind, PurchaseInvoiceDraftInput, PurchaseInvoiceExtraction, PurchaseInvoiceItemInput, PurchaseMetadataEntry } from '../purchases.types';
import type { ScheduleRow } from '@/modules/due-dates/components/payment-schedule-fields';
import type { InstalmentsSource, PaymentMethod } from '@/modules/due-dates/due-dates.types';
import { A, useNavigate, useParams, useSearchParams } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createEffect, createMemo, createSignal, Index, Show } from 'solid-js';
import { createContact, fetchContacts, getContactsQueryKey, updateContact } from '@/modules/contacts/contacts.services';
import { DocumentPreview } from '@/modules/documents/components/document-preview.component';
import { fetchDocument } from '@/modules/documents/documents.services';
import { fromScheduleRows, PaymentScheduleFields, toScheduleRows } from '@/modules/due-dates/components/payment-schedule-fields';
import { getDueDatesQueryKey } from '@/modules/due-dates/due-dates.services';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { FormField } from '@/modules/invoicing/components/catalog-page';
import { WITHHOLDING_RATES_BPS } from '@/modules/invoicing/invoicing.constants';
import { useConfirmModal } from '@/modules/shared/confirm';
import { useI18nApiErrors } from '@/modules/shared/http/composables/i18n-api-errors';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';
import { SimpleSelect } from '@/modules/ui/components/simple-select';
import { createToast } from '@/modules/ui/components/sonner';
import { TextArea } from '@/modules/ui/components/textarea';
import { TextField } from '@/modules/ui/components/textfield';
import { getOrganizationRouteChildHref, getOrganizationRouteHref } from '@/modules/ui/navigation/organization-navigation';
import { useReturnHref } from '@/modules/ui/navigation/return-to';
import { PurchaseMetadataFields } from '../components/purchase-metadata-fields';
import { ReadingChecks } from '../components/reading-checks';
import { SupplierResolutionPanel } from '../components/supplier-resolution-panel';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL_I18N_KEYS, PURCHASE_DOCUMENT_KIND_LABEL_I18N_KEYS, PURCHASE_DOCUMENT_KINDS } from '../purchases.constants';
import { calculatePurchaseInvoiceTotals, emptyPurchaseInvoiceItem } from '../purchases.models';
import { createPurchaseInvoice, createPurchaseReadings, deletePurchaseInvoice, fetchPurchaseInvoice, fetchPurchaseReadings, getPurchaseInvoicesQueryKey, getPurchaseReadingsQueryKey, updatePurchaseInvoice } from '../purchases.services';

const TAX_RATES_BPS = [0, 400, 1_000, 2_100];
const DEDUCTIBLE_RATES_BPS = [10_000, 5_000, 0];
const toDateInput = (date: Date | null | undefined) => (date ? date.toISOString().slice(0, 10) : '');
const today = () => new Date().toISOString().slice(0, 10);

export function PurchaseEditorPage() {
  const { t, getLocale } = useI18n();
  const params = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { confirm } = useConfirmModal();
  const { getErrorMessage } = useI18nApiErrors();

  const isEditing = () => Boolean(params.purchaseInvoiceId);
  const documentIdParam = () => (typeof searchParams.documentId === 'string' ? searchParams.documentId : undefined);
  const queue = () => (typeof searchParams.queue === 'string' && searchParams.queue !== '' ? searchParams.queue.split(',') : []);
  // Opened from a supplier's page: that supplier is chosen unless the AI reads another one on the document
  const supplierIdParam = () => (typeof searchParams.supplierId === 'string' ? searchParams.supplierId : undefined);
  const { returnHref: listHref, keepReturnTo } = useReturnHref(() => getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'purchases' }));

  const [supplierId, setSupplierId] = createSignal(isEditing() ? '' : supplierIdParam() ?? '');
  const [number, setNumber] = createSignal('');
  const [kind, setKind] = createSignal<PurchaseDocumentKind>('invoice');
  const [metadata, setMetadata] = createSignal<PurchaseMetadataEntry[]>([]);
  const [issueDate, setIssueDate] = createSignal(today());
  const [paymentMethod, setPaymentMethod] = createSignal<PaymentMethod | null>(null);
  const [scheduleRows, setScheduleRows] = createSignal<ScheduleRow[]>([]);
  const [instalmentsSource, setInstalmentsSource] = createSignal<InstalmentsSource | undefined>(undefined);
  const [currency, setCurrency] = createSignal('EUR');
  const [category, setCategory] = createSignal<ExpenseCategory>('other');
  const [withholdingRateBps, setWithholdingRateBps] = createSignal(0);
  const [notes, setNotes] = createSignal('');
  const [documentId, setDocumentId] = createSignal<string | null>(null);
  const [items, setItems] = createSignal<PurchaseInvoiceItemInput[]>([emptyPurchaseInvoiceItem()]);
  const [extraction, setExtraction] = createSignal<PurchaseInvoiceExtraction | null>(null);

  const contactsQuery = useQuery(() => ({ queryKey: getContactsQueryKey({ organizationId: params.organizationId }), queryFn: () => fetchContacts({ organizationId: params.organizationId }) }));
  const suppliers = () => (contactsQuery.data?.contacts ?? []).filter(contact => contact.isSupplier);

  const purchaseQuery = useQuery(() => ({
    queryKey: [...getPurchaseInvoicesQueryKey({ organizationId: params.organizationId }), params.purchaseInvoiceId],
    queryFn: () => fetchPurchaseInvoice({ organizationId: params.organizationId, purchaseInvoiceId: params.purchaseInvoiceId! }),
    enabled: isEditing(),
  }));

  // The AI reading of the document, queued at upload: usually ready when the screen opens, polled while it is not.
  // A document opened directly (not uploaded from here) is queued now.
  const getReading = async ({ documentId: id }: { documentId: string }) => {
    const { readings: [reading] } = await fetchPurchaseReadings({ organizationId: params.organizationId, documentIds: [id] });
    if (reading) {
      return { reading };
    }

    const { readings: [queued] } = await createPurchaseReadings({ organizationId: params.organizationId, documentIds: [id] });
    return { reading: queued ?? null };
  };
  const isInProgress = (status: string | undefined) => status === 'pending' || status === 'reading';

  const readingQuery = useQuery(() => ({
    queryKey: getPurchaseReadingsQueryKey({ organizationId: params.organizationId, documentId: documentIdParam() ?? '' }),
    queryFn: () => getReading({ documentId: documentIdParam()! }),
    enabled: !isEditing() && documentIdParam() !== undefined,
    refetchInterval: query => (isInProgress(query.state.data?.reading?.status) ? 1_500 : false),
    retry: 1,
  }));
  const reading = () => readingQuery.data?.reading ?? null;
  const isReading = () => readingQuery.isLoading || isInProgress(reading()?.status);
  const readingFailedMessage = () => {
    if (!readingQuery.isError && reading()?.status !== 'failed') {
      return undefined;
    }
    const errorCode = reading()?.errorCode;
    return errorCode === 'ai_assistant.not_configured'
      ? t('purchases.editor.reading-failed.not-configured')
      : errorCode === 'purchase_invoice.document_not_extractable'
        ? t('purchases.editor.reading-failed.not-extractable')
        : t('purchases.editor.reading-failed');
  };

  // The next document of the queue is fetched while this one is reviewed: "save and next" opens it ready
  createEffect(() => {
    const [next] = queue();
    if (next !== undefined && reading() !== null && !isInProgress(reading()?.status)) {
      void queryClient.prefetchQuery({ queryKey: getPurchaseReadingsQueryKey({ organizationId: params.organizationId, documentId: next }), queryFn: () => getReading({ documentId: next }) });
    }
  });

  const retryReadingMutation = createMutation(() => ({
    mutationFn: () => createPurchaseReadings({ organizationId: params.organizationId, documentIds: [documentIdParam()!], force: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: getPurchaseReadingsQueryKey({ organizationId: params.organizationId, documentId: documentIdParam()! }) }),
  }));

  const documentQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'documents', documentId()],
    queryFn: () => fetchDocument({ organizationId: params.organizationId, documentId: documentId()! }),
    enabled: documentId() !== null,
  }));

  let loadedKey: string | undefined;
  createEffect(() => {
    const purchaseInvoice = purchaseQuery.data?.purchaseInvoice;
    if (!purchaseInvoice || loadedKey === purchaseInvoice.id) {
      return;
    }

    loadedKey = purchaseInvoice.id;
    setSupplierId(purchaseInvoice.supplierId);
    setNumber(purchaseInvoice.number);
    // Invoices saved before these fields existed (demo data kept in the browser) have neither
    setKind(purchaseInvoice.kind ?? 'invoice');
    setMetadata(purchaseInvoice.metadata ?? []);
    setIssueDate(toDateInput(purchaseInvoice.issueDate));
    setPaymentMethod(purchaseInvoice.paymentMethod ?? null);
    setScheduleRows(toScheduleRows(purchaseInvoice.instalments));
    setCurrency(purchaseInvoice.currency);
    setCategory(purchaseInvoice.category);
    setWithholdingRateBps(purchaseInvoice.withholdingRateBps);
    setNotes(purchaseInvoice.notes ?? '');
    setDocumentId(purchaseInvoice.documentId);
    setItems(purchaseInvoice.items?.map(({ description, quantityMillis, unitPriceMinor, taxRateBps, discountRateBps, deductibleRateBps }) => ({ description, quantityMillis, unitPriceMinor, taxRateBps, discountRateBps, deductibleRateBps })) ?? [emptyPurchaseInvoiceItem()]);
  });

  createEffect(() => {
    const documentIdToLoad = documentIdParam();
    if (isEditing() || documentIdToLoad === undefined || loadedKey === documentIdToLoad) {
      return;
    }

    // The document is attached even when the AI cannot read it, the user then fills in the form manually
    setDocumentId(documentIdToLoad);

    const result = reading()?.extraction;
    if (!result) {
      return;
    }

    loadedKey = documentIdToLoad;
    setExtraction(result);
    setSupplierId(result.draft.supplierId ?? supplierIdParam() ?? '');
    setNumber(result.draft.number);
    setKind(result.draft.kind);
    setMetadata(result.draft.metadata);
    setIssueDate(toDateInput(result.draft.issueDate) || today());
    setPaymentMethod(result.draft.paymentMethod ?? null);
    // Readings made before the due dates were read only have the printed due date
    setScheduleRows(result.draft.instalments ? toScheduleRows(result.draft.instalments) : toScheduleRows(result.draft.dueDate ? [{ dueDate: result.draft.dueDate, amountMinor: 0 }] : []));
    setInstalmentsSource(result.draft.instalmentsSource);
    setCurrency(result.draft.currency);
    setCategory(result.draft.category);
    setWithholdingRateBps(result.draft.withholdingRateBps);
    // A delivery note photo can come without any readable line
    setItems(result.draft.items.length > 0 ? result.draft.items : [emptyPurchaseInvoiceItem()]);
  });

  const totals = createMemo(() => calculatePurchaseInvoiceTotals({ items: items(), withholdingRateBps: withholdingRateBps() }));
  // A single due date still to pay is the whole invoice: it follows the lines as they are corrected
  createEffect(() => {
    const payableMinor = totals().payableMinor;
    const rows = scheduleRows();
    const [only] = rows;
    if (rows.length === 1 && only && (only.status ?? 'pending') === 'pending' && only.amountMinor !== payableMinor) {
      setScheduleRows([{ ...only, amountMinor: payableMinor }]);
    }
  });
  const supplierTermsDays = () => suppliers().find(contact => contact.id === supplierId())?.paymentTermsDays ?? null;
  const money = (minor: number) => new Intl.NumberFormat(getLocale(), { style: 'currency', currency: currency() }).format(minor / 100);
  // The model reads the printed total too: a difference means a line was misread
  const totalMismatch = () => {
    const printedTotal = extraction()?.printedTotal;
    return printedTotal !== undefined && printedTotal !== null && printedTotal > 0 && Math.abs(printedTotal - totals().totalMinor) > items().length;
  };

  const updateItem = (index: number, changes: Partial<PurchaseInvoiceItemInput>) => setItems(current => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...changes } : item)));

  // The counterparty read by the AI: an unknown company is created as supplier (with the name typed by the user when none
  // could be read), a known contact, the recognized one or a similar one picked by the user, gets the supplier role
  const counterpartyMutation = createMutation(() => ({
    mutationFn: async (target: { contactId: string } | { name: string }) => {
      const counterparty = extraction()!.counterparty;

      if ('contactId' in target) {
        const existing = contactsQuery.data?.contacts.find(contact => contact.id === target.contactId);
        if (!existing) {
          throw new Error('Contact not found');
        }
        if (existing.isSupplier) {
          return { contact: existing };
        }

        const { id: _id, organizationId: _organizationId, archivedAt: _archivedAt, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = existing;
        return updateContact({ organizationId: params.organizationId, contactId: existing.id, contact: { ...input, isSupplier: true } });
      }

      return createContact({
        organizationId: params.organizationId,
        contact: {
          kind: 'company',
          name: target.name,
          email: counterparty.email,
          phone: counterparty.phone,
          taxId: counterparty.taxId,
          addressLine1: counterparty.addressLine1,
          addressLine2: null,
          postalCode: counterparty.postalCode,
          city: counterparty.city,
          region: null,
          country: counterparty.country,
          bankAccount: counterparty.bankAccount ?? null,
          currency: currency(),
          paymentTermsDays: 30,
          notes: null,
          isCustomer: false,
          isSupplier: true,
          isSalesRepresentative: false,
        },
      });
    },
    onSuccess: async ({ contact }) => {
      await queryClient.invalidateQueries({ queryKey: getContactsQueryKey({ organizationId: params.organizationId }) });
      setSupplierId(contact.id);
      setExtraction(current => (current ? { ...current, counterparty: { ...current.counterparty, status: 'matched', name: contact.name, contactId: contact.id, hasSupplierRole: true, candidates: [] } } : current));
      createToast({ type: 'success', message: t('purchases.editor.supplier.created') });
    },
    onError: (error: unknown) => createToast({ type: 'error', message: getErrorMessage({ error, defaultMessage: t('contacts.toast.error') }) }),
  }));

  const draft = (): PurchaseInvoiceDraftInput => ({
    supplierId: supplierId(),
    number: number().trim(),
    kind: kind(),
    issueDate: new Date(`${issueDate()}T00:00:00.000Z`),
    dueDate: fromScheduleRows(scheduleRows()).map(({ dueDate }) => dueDate).toSorted((a, b) => a.getTime() - b.getTime())[0] ?? null,
    paymentMethod: paymentMethod(),
    instalments: kind() === 'delivery_note' ? [] : fromScheduleRows(scheduleRows()),
    currency: currency(),
    category: category(),
    withholdingRateBps: withholdingRateBps(),
    notes: notes().trim() || null,
    documentId: documentId(),
    metadata: metadata().map(entry => ({ label: entry.label.trim(), value: entry.value.trim() })).filter(entry => entry.label !== '' && entry.value !== ''),
    items: items(),
  });

  const canSave = () => Boolean(supplierId() && number().trim() && issueDate() && items().length > 0 && items().every(item => item.description.trim() && item.quantityMillis > 0));

  const saveMutation = createMutation(() => ({
    mutationFn: async () => (isEditing()
      ? updatePurchaseInvoice({ organizationId: params.organizationId, purchaseInvoiceId: params.purchaseInvoiceId!, purchaseInvoice: draft() })
      : createPurchaseInvoice({ organizationId: params.organizationId, purchaseInvoice: draft() })),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getPurchaseInvoicesQueryKey({ organizationId: params.organizationId }) }),
        queryClient.invalidateQueries({ queryKey: getDueDatesQueryKey({ organizationId: params.organizationId }) }),
        queryClient.invalidateQueries({ queryKey: ['calendar', params.organizationId] }),
      ]);
      createToast({ type: 'success', message: t('purchases.toast.saved') });

      // Several files uploaded at once are reviewed one after the other
      const [next, ...rest] = queue();
      if (next === undefined) {
        navigate(listHref());
        return;
      }

      const search = new URLSearchParams({ documentId: next });
      if (rest.length > 0) {
        search.set('queue', rest.join(','));
      }
      if (supplierIdParam() !== undefined) {
        search.set('supplierId', supplierIdParam()!);
      }
      navigate(keepReturnTo(`${getOrganizationRouteChildHref({ organizationId: params.organizationId, routeId: 'purchases', childPath: 'new' })}?${search.toString()}`));
    },
    onError: (error: unknown) => createToast({ type: 'error', message: getErrorMessage({ error, defaultMessage: t('purchases.toast.error') }) }),
  }));

  const deleteMutation = createMutation(() => ({
    mutationFn: async () => deletePurchaseInvoice({ organizationId: params.organizationId, purchaseInvoiceId: params.purchaseInvoiceId! }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: getPurchaseInvoicesQueryKey({ organizationId: params.organizationId }) });
      navigate(listHref());
    },
  }));

  const supplierOptions = () => [
    { value: '', label: t('purchases.editor.supplier.placeholder') },
    ...suppliers().map(contact => ({ value: contact.id, label: contact.taxId ? `${contact.name} · ${contact.taxId}` : contact.name })),
  ];

  return (
    <main class="page">
      <div class="mb-6 flex flex-wrap items-center gap-3">
        <Button as={A} href={listHref()} variant="ghost" size="icon" aria-label={t('purchases.editor.back')}>
          <div class="i-tabler-arrow-left size-5" />
        </Button>
        <h1 class="text-xl font-semibold">{isEditing() ? t('purchases.editor.edit-title') : t('purchases.editor.new-title')}</h1>
        <Show when={queue().length > 0}>
          <span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t('purchases.editor.queue', { count: queue().length })}</span>
        </Show>
        <div class="ml-auto flex gap-2">
          <Show when={isEditing()}>
            <Button
              variant="ghost"
              class="text-red-600"
              isLoading={deleteMutation.isPending}
              onClick={async () => {
                if (await confirm({ title: t('purchases.editor.delete.title'), message: t('purchases.editor.delete.message'), confirmButton: { text: t('purchases.editor.delete.confirm'), variant: 'destructive' } })) {
                  deleteMutation.mutate();
                }
              }}
            >
              {t('purchases.editor.delete.confirm')}
            </Button>
          </Show>
          <Button disabled={!canSave()} isLoading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {queue().length > 0 ? t('purchases.editor.save-and-next') : t('purchases.editor.save')}
          </Button>
        </div>
      </div>

      <div class={cn('grid gap-6', documentId() && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]')}>
        <div class="flex min-w-0 flex-col gap-6">
          <Show when={isReading()}>
            <div class="flex items-center gap-3 rounded-xl border bg-muted/40 p-4 text-sm">
              <div class="i-tabler-loader-2 size-5 animate-spin text-muted-foreground" />
              {reading()?.status === 'pending' ? t('purchases.editor.reading.queued') : t('purchases.editor.reading')}
            </div>
          </Show>
          <Show when={readingFailedMessage()}>
            {getMessage => (
              <div class="flex flex-wrap items-center gap-3 rounded-xl border border-orange-500/30 bg-orange-500/8 p-4 text-sm">
                <p class="min-w-0 flex-1">{getMessage()}</p>
                <Show when={reading()?.errorCode !== 'ai_assistant.not_configured' && reading()?.errorCode !== 'purchase_invoice.document_not_extractable'}>
                  <Button size="sm" variant="outline" class="gap-1.5" isLoading={retryReadingMutation.isPending} onClick={() => retryReadingMutation.mutate()}>
                    <div class="i-tabler-refresh size-4" />
                    {t('purchases.editor.reading.retry')}
                  </Button>
                </Show>
              </div>
            )}
          </Show>

          <Show when={extraction()}>
            {getExtraction => (
              <>
                <div class="flex items-start gap-3 rounded-xl border border-violet-500/25 bg-violet-500/8 p-4 text-sm">
                  <div class="i-tabler-sparkles mt-0.5 size-5 shrink-0 text-violet-600 dark:text-violet-300" />
                  <p>{t('purchases.editor.read-by-ai')}</p>
                </div>

                <Show when={getExtraction().direction === 'issued'}>
                  <div class="flex flex-wrap items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/8 p-4 text-sm">
                    <p class="min-w-0 flex-1">{t('purchases.editor.direction.issued')}</p>
                    <Show when={documentId()}>
                      {getDocumentId => (
                        <Button as={A} size="sm" variant="outline" href={keepReturnTo(`${getOrganizationRouteChildHref({ organizationId: params.organizationId, routeId: 'invoices', childPath: 'import' })}?documentId=${encodeURIComponent(getDocumentId())}`)}>
                          {t('purchases.editor.direction.issued.action')}
                        </Button>
                      )}
                    </Show>
                  </div>
                </Show>

                <ReadingChecks checks={reading()?.checks ?? []} warnings={getExtraction().warnings} />

                <SupplierResolutionPanel
                  counterparty={getExtraction().counterparty}
                  selectedSupplierId={supplierId()}
                  isPending={counterpartyMutation.isPending}
                  onCreate={({ name }) => counterpartyMutation.mutate({ name })}
                  onUseContact={({ contactId }) => counterpartyMutation.mutate({ contactId })}
                />
              </>
            )}
          </Show>

          <section class="grid gap-4 sm:grid-cols-2">
            <FormField label={t('purchases.editor.supplier')} class="sm:col-span-2">
              <SimpleSelect triggerClass="h-10 w-full" value={supplierId()} onChange={setSupplierId} options={supplierOptions()} />
            </FormField>
            <FormField label={t('purchases.editor.kind')}>
              <SimpleSelect triggerClass="h-10 w-full" value={kind()} onChange={value => setKind(value as PurchaseDocumentKind)} options={PURCHASE_DOCUMENT_KINDS.map(value => ({ value, label: t(PURCHASE_DOCUMENT_KIND_LABEL_I18N_KEYS[value]) }))} />
            </FormField>
            <FormField label={t('purchases.editor.number')}><TextField value={number()} onInput={event => setNumber(event.currentTarget.value)} /></FormField>
            <Show when={kind() === 'delivery_note'}>
              <p class="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground sm:col-span-2">{t('purchases.editor.kind.delivery-note-hint')}</p>
            </Show>
            <FormField label={t('purchases.editor.category')}>
              <SimpleSelect triggerClass="h-10 w-full" value={category()} onChange={value => setCategory(value as ExpenseCategory)} options={EXPENSE_CATEGORIES.map(value => ({ value, label: t(EXPENSE_CATEGORY_LABEL_I18N_KEYS[value]) }))} />
            </FormField>
            <FormField label={t('purchases.editor.issue-date')}><TextField type="date" value={issueDate()} onInput={event => setIssueDate(event.currentTarget.value)} /></FormField>
          </section>

          <section class="border-t pt-6">
            <div class="mb-3 flex items-center justify-between">
              <h2 class="font-medium">{t('purchases.editor.lines')}</h2>
              <Button variant="outline" size="sm" class="gap-1.5" onClick={() => setItems(current => [...current, emptyPurchaseInvoiceItem()])}>
                <div class="i-tabler-plus size-4" />
                {t('purchases.editor.add-line')}
              </Button>
            </div>
            <div class="flex flex-col gap-4">
              <Index each={items()}>
                {(item, index) => (
                  <div class="grid grid-cols-2 gap-3 border-b pb-4 last:border-b-0 last:pb-0 sm:grid-cols-3 2xl:grid-cols-5">
                    <div class="col-span-full flex items-end gap-2">
                      <FormField label={t('purchases.editor.line.description')} class="flex-1">
                        <TextField value={item().description} onInput={event => updateItem(index, { description: event.currentTarget.value })} />
                      </FormField>
                      <Button variant="ghost" size="icon" class="text-red-600" aria-label={t('purchases.editor.line.remove')} disabled={items().length === 1} onClick={() => setItems(current => current.filter((_, itemIndex) => itemIndex !== index))}>
                        <div class="i-tabler-trash size-4" />
                      </Button>
                    </div>
                    <FormField label={t('purchases.editor.line.quantity')}>
                      <TextField type="number" min="0" step="any" value={item().quantityMillis / 1_000} onInput={event => updateItem(index, { quantityMillis: Math.round(Number(event.currentTarget.value) * 1_000) })} />
                    </FormField>
                    <FormField label={t('purchases.editor.line.unit-price')}>
                      <TextField type="number" min="0" step="0.01" value={item().unitPriceMinor / 100} onInput={event => updateItem(index, { unitPriceMinor: Math.round(Number(event.currentTarget.value) * 100) })} />
                    </FormField>
                    <FormField label={t('purchases.editor.line.vat')}>
                      <SimpleSelect triggerClass="h-10 w-full" value={String(item().taxRateBps)} onChange={value => updateItem(index, { taxRateBps: Number(value) })} options={[...new Set([...TAX_RATES_BPS, item().taxRateBps])].toSorted((a, b) => a - b).map(rateBps => ({ value: String(rateBps), label: `${rateBps / 100} %` }))} />
                    </FormField>
                    <FormField label={t('purchases.editor.line.discount')}>
                      <TextField type="number" min="0" max="100" step="0.01" value={item().discountRateBps / 100} onInput={event => updateItem(index, { discountRateBps: Math.round(Number(event.currentTarget.value) * 100) })} />
                    </FormField>
                    <FormField label={t('purchases.editor.line.deductible')}>
                      <SimpleSelect triggerClass="h-10 w-full" value={String(item().deductibleRateBps)} onChange={value => updateItem(index, { deductibleRateBps: Number(value) })} options={[...new Set([...DEDUCTIBLE_RATES_BPS, item().deductibleRateBps])].toSorted((a, b) => b - a).map(rateBps => ({ value: String(rateBps), label: `${rateBps / 100} %` }))} />
                    </FormField>
                  </div>
                )}
              </Index>
            </div>
          </section>

          <section class="grid gap-4 border-t pt-6 sm:grid-cols-2">
            <FormField label={t('invoicing.editor.withholding')}>
              <SimpleSelect triggerClass="h-10 w-full" value={String(withholdingRateBps())} onChange={value => setWithholdingRateBps(Number(value))} options={[...new Set([...WITHHOLDING_RATES_BPS, withholdingRateBps()])].toSorted((a, b) => a - b).map(rateBps => ({ value: String(rateBps), label: rateBps === 0 ? t('invoicing.editor.withholding.none') : `${rateBps / 100} %` }))} />
            </FormField>
            <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt class="text-muted-foreground">{t('invoicing.preview.subtotal')}</dt>
              <dd class="text-right tabular-nums">{money(totals().subtotalMinor)}</dd>
              <dt class="text-muted-foreground">{t('invoicing.preview.tax')}</dt>
              <dd class="text-right tabular-nums">{money(totals().taxMinor)}</dd>
              <dt class="text-muted-foreground">{t('purchases.editor.deductible-vat')}</dt>
              <dd class="text-right tabular-nums">{money(totals().deductibleTaxMinor)}</dd>
              <Show when={totals().withholdingMinor > 0}>
                <dt class="text-muted-foreground">{t('invoicing.preview.withholding', { rate: withholdingRateBps() / 100 })}</dt>
                <dd class="text-right tabular-nums">{`-${money(totals().withholdingMinor)}`}</dd>
              </Show>
              <dt class="font-semibold">{t('invoicing.preview.amount-due')}</dt>
              <dd class="text-right font-semibold tabular-nums">{money(totals().payableMinor)}</dd>
            </dl>
            <Show when={totalMismatch()}>
              <div class="rounded-lg border border-orange-500/30 bg-orange-500/8 p-3 text-sm sm:col-span-2">
                {t('purchases.editor.total-mismatch', { printed: money(extraction()!.printedTotal ?? 0), computed: money(totals().totalMinor) })}
              </div>
            </Show>
            <FormField label={t('invoicing.editor.notes')} class="sm:col-span-2">
              <TextArea value={notes()} onInput={event => setNotes(event.currentTarget.value)} />
            </FormField>
          </section>

          <Show when={kind() !== 'delivery_note'}>
            <PaymentScheduleFields
              paymentMethod={paymentMethod()}
              onPaymentMethodChange={setPaymentMethod}
              rows={scheduleRows()}
              onRowsChange={(rows) => {
                setScheduleRows(rows);
                setInstalmentsSource(undefined);
              }}
              issueDate={issueDate()}
              payableMinor={totals().payableMinor}
              currency={currency()}
              source={instalmentsSource()}
              contactTermsDays={supplierTermsDays()}
            />
          </Show>

          <PurchaseMetadataFields value={metadata()} onChange={setMetadata} />
        </div>

        <Show when={documentQuery.data?.document}>
          {getDocument => (
            <aside class="min-w-0 lg:sticky lg:top-6 lg:self-start">
              {/* The PDF viewer is absolutely positioned, it needs a container with an explicit height */}
              <div class="relative h-[calc(100dvh-9rem)] min-h-96 overflow-auto rounded-xl border bg-card">
                <DocumentPreview document={getDocument()} />
              </div>
            </aside>
          )}
        </Show>
      </div>

    </main>
  );
}
