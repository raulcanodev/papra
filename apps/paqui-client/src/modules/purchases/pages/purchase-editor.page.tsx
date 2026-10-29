import type { ExpenseCategory, PurchaseDocumentKind, PurchaseInvoiceDraftInput, PurchaseInvoiceExtraction, PurchaseInvoiceItemInput, PurchaseMetadataEntry } from '../purchases.types';
import type { ScheduleRow } from '@/modules/due-dates/components/payment-schedule-fields';
import type { InstalmentInput, InstalmentsSource, PaymentMethod } from '@/modules/due-dates/due-dates.types';
import type { TranslationKeys } from '@/modules/i18n/locales.types';
import { A, useNavigate, useParams, useSearchParams } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createEffect, createMemo, createSignal, For, Index, Show } from 'solid-js';
import { useAiAssistantPanel, useAssistantScreen } from '@/modules/ai-assistant/ai-assistant-panel.provider';
import { createContact, fetchContacts, getContactsQueryKey, updateContact } from '@/modules/contacts/contacts.services';
import { DocumentSidePreview } from '@/modules/documents/components/document-side-preview';
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
import { useUnsavedChangesGuard } from '@/modules/shared/unsaved-changes';
import { Button } from '@/modules/ui/components/button';
import { EditorBar } from '@/modules/ui/components/editor-bar';
import { SimpleCheckbox } from '@/modules/ui/components/simple-checkbox';
import { SimpleSelect } from '@/modules/ui/components/simple-select';
import { createToast } from '@/modules/ui/components/sonner';
import { TextArea } from '@/modules/ui/components/textarea';
import { TextField } from '@/modules/ui/components/textfield';
import { getOrganizationRouteChildHref, getOrganizationRouteHref } from '@/modules/ui/navigation/organization-navigation';
import { useReturnHref } from '@/modules/ui/navigation/return-to';
import { InvoiceParties } from '../components/invoice-parties';
import { PurchaseMetadataFields } from '../components/purchase-metadata-fields';
import { ReadingChecks } from '../components/reading-checks';
import { ReviewNotice } from '../components/review-notice';
import { SupplierResolutionPanel } from '../components/supplier-resolution-panel';
import { SupplierTariffCheck } from '../components/supplier-tariff-check';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL_I18N_KEYS, PURCHASE_DOCUMENT_KIND_LABEL_I18N_KEYS, PURCHASE_DOCUMENT_KINDS } from '../purchases.constants';
import { calculatePurchaseInvoiceTotals, emptyPurchaseInvoiceItem } from '../purchases.models';
import { createPurchaseInvoice, createPurchaseReadings, deletePurchaseInvoice, fetchPurchaseInvoice, fetchPurchaseReadings, getPurchaseInvoicesQueryKey, getPurchaseReadingsQueryKey, updatePurchaseInvoice } from '../purchases.services';

// The server takes up to 20 000 characters of screen data
const MAX_ASSISTANT_SCREEN_CHARS = 18_000;

const TAX_RATES_BPS = [0, 400, 1_000, 2_100];
const DEDUCTIBLE_RATES_BPS = [10_000, 5_000, 0];
const toDateInput = (date: Date | null | undefined) => (date ? date.toISOString().slice(0, 10) : '');

type SaveBlocker = 'supplier' | 'number' | 'issue_date' | 'lines' | 'due_date_before_issue_date';

const SAVE_BLOCKER_I18N_KEYS = {
  supplier: 'purchases.editor.blocker.supplier',
  number: 'purchases.editor.blocker.number',
  issue_date: 'purchases.editor.blocker.issue-date',
  lines: 'purchases.editor.blocker.lines',
  due_date_before_issue_date: 'purchases.editor.blocker.due-date.title',
} as const satisfies Record<SaveBlocker, TranslationKeys>;
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
  // The same paper, read again as a sale
  const saleImportHref = (documentId: string) => keepReturnTo(`${getOrganizationRouteChildHref({ organizationId: params.organizationId, routeId: 'invoices', childPath: 'import' })}?documentId=${encodeURIComponent(documentId)}`);

  const [supplierId, setSupplierId] = createSignal(isEditing() ? '' : supplierIdParam() ?? '');
  const [number, setNumber] = createSignal('');
  const [kind, setKind] = createSignal<PurchaseDocumentKind>('invoice');
  const [metadata, setMetadata] = createSignal<PurchaseMetadataEntry[]>([]);
  const [issueDate, setIssueDate] = createSignal(today());
  const [paymentMethod, setPaymentMethod] = createSignal<PaymentMethod | null>(null);
  const [scheduleRows, setScheduleRows] = createSignal<ScheduleRow[]>([]);
  // "Already paid" (an old invoice, a ticket paid on the spot): untouched, each due date keeps its own status
  const [paidChoice, setPaidChoice] = createSignal<boolean>();
  const [paidDate, setPaidDate] = createSignal('');
  const [instalmentsSource, setInstalmentsSource] = createSignal<InstalmentsSource | undefined>(undefined);
  const [currency, setCurrency] = createSignal('EUR');
  const [category, setCategory] = createSignal<ExpenseCategory>('other');
  const [withholdingRateBps, setWithholdingRateBps] = createSignal(0);
  const [notes, setNotes] = createSignal('');
  const [documentId, setDocumentId] = createSignal<string | null>(null);
  const [items, setItems] = createSignal<PurchaseInvoiceItemInput[]>([emptyPurchaseInvoiceItem()]);
  const [extraction, setExtraction] = createSignal<PurchaseInvoiceExtraction | null>(null);

  // Leaving with changes asks first; what the AI read or the server loaded is where the form starts from
  const leaveGuard = useUnsavedChangesGuard({
    snapshot: () => ({ supplierId: supplierId(), number: number(), kind: kind(), metadata: metadata(), issueDate: issueDate(), paymentMethod: paymentMethod(), scheduleRows: scheduleRows(), paidChoice: paidChoice(), paidDate: paidDate(), currency: currency(), category: category(), withholdingRateBps: withholdingRateBps(), notes: notes(), items: items() }),
  });

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
    const loadedRows = toScheduleRows(purchaseInvoice.instalments);
    setScheduleRows(loadedRows);
    // Old invoices can have been marked paid before instalments existed. Keep that state without
    // overriding partially paid schedules, whose individual row statuses remain authoritative.
    setPaidChoice(purchaseInvoice.status === 'paid' && loadedRows.length === 0 ? true : undefined);
    setPaidDate(toDateInput(purchaseInvoice.paidAt));
    setCurrency(purchaseInvoice.currency);
    setCategory(purchaseInvoice.category);
    setWithholdingRateBps(purchaseInvoice.withholdingRateBps);
    setNotes(purchaseInvoice.notes ?? '');
    setDocumentId(purchaseInvoice.documentId);
    setItems(purchaseInvoice.items?.map(({ description, quantityMillis, unitPriceMinor, taxRateBps, discountRateBps, deductibleRateBps }) => ({ description, quantityMillis, unitPriceMinor, taxRateBps, discountRateBps, deductibleRateBps })) ?? [emptyPurchaseInvoiceItem()]);
    leaveGuard.resetBaseline();
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
    // The editor is reused by "save and next": payment choices belong only to the previous paper.
    setPaidChoice(undefined);
    setPaidDate('');
    setCurrency(result.draft.currency);
    setCategory(result.draft.category);
    setWithholdingRateBps(result.draft.withholdingRateBps);
    setNotes('');
    // A delivery note photo can come without any readable line
    setItems(result.draft.items.length > 0 ? result.draft.items : [emptyPurchaseInvoiceItem()]);
    // The reading can arrive after the user clicked around: it is not a change of theirs
    leaveGuard.resetBaseline();
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

  const isPaid = () => paidChoice() ?? (scheduleRows().length > 0 && scheduleRows().every(row => row.status === 'paid'));

  // The due dates as they will be saved, shown so before saving: ticked, every one is paid (a single one for the whole
  // invoice when none is set); unticked, the payments are undone and a returned charge stays returned
  const shownScheduleRows = (): ScheduleRow[] => {
    const rows = scheduleRows();
    const choice = paidChoice();

    if (choice === true) {
      const settled = rows.length > 0 ? rows : [{ dueDate: issueDate(), amountMinor: totals().payableMinor }];
      return settled.map(row => ({ ...row, status: 'paid' }));
    }

    if (choice === false) {
      return rows.map(row => (row.status === 'paid' ? { ...row, status: 'pending' } : row));
    }

    return rows;
  };

  // Paid on the payment date given, the invoice date by default: an old invoice was not paid today
  const instalments = (): InstalmentInput[] => {
    const rows = fromScheduleRows(shownScheduleRows());
    const paidAt = new Date(`${paidDate() || issueDate()}T00:00:00.000Z`);

    return paidChoice() === true ? rows.map(row => ({ ...row, paidAt })) : rows;
  };

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
    // A settled invoice has no actionable deadline. Its paid instalments are kept as payment history,
    // but the old printed date must not make the draft fail due-date validation.
    // A delivery note has no due date: what the AI read on it must not make the draft fail either
    dueDate: isPaid() || kind() === 'delivery_note' ? null : fromScheduleRows(scheduleRows()).map(({ dueDate }) => dueDate).toSorted((a, b) => a.getTime() - b.getTime())[0] ?? null,
    paymentMethod: paymentMethod(),
    instalments: kind() === 'delivery_note' ? [] : instalments(),
    currency: currency(),
    category: category(),
    withholdingRateBps: withholdingRateBps(),
    notes: notes().trim() || null,
    documentId: documentId(),
    metadata: metadata().map(entry => ({ label: entry.label.trim(), value: entry.value.trim() })).filter(entry => entry.label !== '' && entry.value !== ''),
    items: items(),
  });

  // Paqui sees this purchase as it is on screen, unsaved changes included, with what the AI read and the paper itself
  const assistantPanel = useAiAssistantPanel();
  useAssistantScreen(() => {
    const { documentId: _documentId, ...form } = draft();
    const supplierName = suppliers().find(contact => contact.id === supplierId())?.name ?? null;
    const base = { saved: isEditing(), form: { ...form, supplierName }, computedTotals: totals(), printedTotalMinor: extraction()?.printedTotal ?? null };
    const full = { ...base, aiReading: extraction() === null ? null : { lines: extraction()!.draft.items, withholdingRateBps: extraction()!.draft.withholdingRateBps, notes: extraction()!.warnings, checks: reading()?.checks ?? [] } };
    // A very long invoice keeps the form, what the AI read is on the paper anyway
    const data = JSON.stringify(full).length <= MAX_ASSISTANT_SCREEN_CHARS ? full : base;

    return { subject: t('purchases.editor.assistant-subject'), documentId: documentId() ?? undefined, data: JSON.stringify(data).length <= MAX_ASSISTANT_SCREEN_CHARS ? data : { computedTotals: totals(), printedTotalMinor: base.printedTotalMinor } };
  });

  // What still keeps the purchase from being saved, told to the user instead of a save button that silently does nothing.
  // The due date mirrors the server rule: a pending due date before the invoice date is refused
  const saveBlockers = createMemo((): SaveBlocker[] => {
    const { dueDate } = draft();
    return [
      ...(supplierId() ? [] : ['supplier' as const]),
      ...(number().trim() ? [] : ['number' as const]),
      ...(issueDate() ? [] : ['issue_date' as const]),
      ...(items().length > 0 && items().every(item => item.description.trim() && item.quantityMillis > 0) ? [] : ['lines' as const]),
      ...(issueDate() && dueDate && toDateInput(dueDate) < issueDate() ? ['due_date_before_issue_date' as const] : []),
    ];
  });
  const canSave = () => saveBlockers().length === 0;
  // Shown once the user pressed save: before that, an empty form is not a mistake
  const [saveAttempted, setSaveAttempted] = createSignal(false);
  const missingFields = () => (saveAttempted() ? saveBlockers().filter(blocker => blocker !== 'due_date_before_issue_date') : []);
  const formatDate = (value: string) => new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00.000Z`));
  const earliestDueDate = () => scheduleRows().map(row => row.dueDate).filter(Boolean).toSorted()[0] ?? '';

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
      leaveGuard.afterSave(() => {
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
      });
    },
    onError: (error: unknown) => createToast({ type: 'error', message: getErrorMessage({ error, defaultMessage: t('purchases.toast.error') }) }),
  }));

  // Pressed while something is missing, it says what instead of doing nothing
  let blockersElement: HTMLDivElement | undefined;
  const save = () => {
    if (!canSave()) {
      setSaveAttempted(true);
      queueMicrotask(() => blockersElement?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    saveMutation.mutate();
  };

  const deleteMutation = createMutation(() => ({
    mutationFn: async () => deletePurchaseInvoice({ organizationId: params.organizationId, purchaseInvoiceId: params.purchaseInvoiceId! }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: getPurchaseInvoicesQueryKey({ organizationId: params.organizationId }) });
      leaveGuard.allowLeave();
      navigate(listHref());
    },
  }));

  leaveGuard.setSave({ label: t('purchases.editor.save'), canSave, run: async () => saveMutation.mutateAsync() });

  const supplierOptions = () => [
    { value: '', label: t('purchases.editor.supplier.placeholder') },
    ...suppliers().map(contact => ({ value: contact.id, label: contact.taxId ? `${contact.name} · ${contact.taxId}` : contact.name })),
  ];

  return (
    <main class="page">
      {leaveGuard.elements}
      <EditorBar
        backHref={listHref()}
        backLabel={t('purchases.editor.back')}
        title={isEditing() ? t('purchases.editor.edit-title') : t('purchases.editor.new-title')}
        meta={queue().length > 0 && <span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t('purchases.editor.queue', { count: queue().length })}</span>}
        secondaryActions={isEditing()
          ? [{
              label: t('purchases.editor.delete.confirm'),
              icon: 'i-tabler-trash',
              isDestructive: true,
              isLoading: deleteMutation.isPending,
              onSelect: async () => {
                if (await confirm({ title: t('purchases.editor.delete.title'), message: t('purchases.editor.delete.message'), confirmButton: { text: t('purchases.editor.delete.confirm'), variant: 'destructive' } })) {
                  deleteMutation.mutate();
                }
              },
            }]
          : []}
        actions={(
          <Button isLoading={saveMutation.isPending} onClick={save}>
            {queue().length > 0 ? t('purchases.editor.save-and-next') : t('purchases.editor.save')}
          </Button>
        )}
      />

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
              <ReviewNotice
                tone="warning"
                icon="i-tabler-file-alert"
                title={getMessage()}
                actions={reading()?.errorCode !== 'ai_assistant.not_configured' && reading()?.errorCode !== 'purchase_invoice.document_not_extractable' && (
                  <Button size="sm" variant="outline" class="gap-1.5" isLoading={retryReadingMutation.isPending} onClick={() => retryReadingMutation.mutate()}>
                    <div class="i-tabler-refresh size-4" />
                    {t('purchases.editor.reading.retry')}
                  </Button>
                )}
              />
            )}
          </Show>

          <Show when={extraction()}>
            {getExtraction => (
              <>
                <div class="flex items-center gap-2 text-xs text-muted-foreground">
                  <div class="i-tabler-sparkles size-4 shrink-0 text-violet-600 dark:text-violet-300" />
                  <p>{t('purchases.editor.read-by-ai')}</p>
                </div>

                <Show when={getExtraction().issuer && getExtraction().recipient}>
                  <InvoiceParties issuer={getExtraction().issuer!} recipient={getExtraction().recipient!} ownSide={getExtraction().direction === 'issued' ? 'issuer' : getExtraction().direction === 'received' ? 'recipient' : null} />
                </Show>

                {/* Neither the tax id nor the name told who issued it: registered as an expense unless the user says it is a sale.
                    The parties are shown just above, the notice does not repeat them */}
                <Show when={getExtraction().direction === 'unknown' && getExtraction().issuer}>
                  <ReviewNotice
                    tone="warning"
                    icon="i-tabler-arrows-exchange"
                    title={t('purchases.editor.direction.unknown.title')}
                    actions={documentId() && (
                      <Button as={A} size="sm" variant="outline" class="gap-1.5" href={saleImportHref(documentId()!)}>
                        <div class="i-tabler-file-invoice size-4" />
                        {t('purchases.editor.direction.issued.action')}
                      </Button>
                    )}
                  >
                    {t('purchases.editor.direction.unknown')}
                  </ReviewNotice>
                </Show>

                <Show when={getExtraction().direction === 'issued'}>
                  <ReviewNotice
                    tone="danger"
                    icon="i-tabler-alert-triangle"
                    title={t('purchases.editor.direction.issued')}
                    actions={documentId() && (
                      <Button as={A} size="sm" class="gap-1.5" href={saleImportHref(documentId()!)}>
                        <div class="i-tabler-file-invoice size-4" />
                        {t('purchases.editor.direction.issued.action')}
                      </Button>
                    )}
                  />
                </Show>

                {/* The due date is checked live below, as it is edited: the reading's own check would only repeat it */}
                <ReadingChecks checks={reading()?.checks ?? []} warnings={getExtraction().warnings} ignoreDueDate />

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

          <div ref={blockersElement} class="flex flex-col gap-3 empty:hidden">
            <Show when={saveBlockers().includes('due_date_before_issue_date')}>
              <ReviewNotice
                tone="danger"
                icon="i-tabler-calendar-exclamation"
                title={t('purchases.editor.blocker.due-date.title')}
                actions={(
                  <>
                    <Show when={kind() !== 'delivery_note'}>
                      <Button size="sm" class="gap-1.5" onClick={() => setPaidChoice(true)}>
                        <div class="i-tabler-circle-check size-4" />
                        {t('purchases.editor.blocker.due-date.mark-paid')}
                      </Button>
                    </Show>
                    <Button size="sm" variant="outline" onClick={() => setScheduleRows(rows => rows.map(row => (row.dueDate !== '' && row.dueDate < issueDate() ? { ...row, dueDate: issueDate() } : row)))}>
                      {t('purchases.editor.blocker.due-date.use-issue-date')}
                    </Button>
                  </>
                )}
              >
                {t('purchases.editor.blocker.due-date.description', { dueDate: formatDate(earliestDueDate()), issueDate: formatDate(issueDate()) })}
              </ReviewNotice>
            </Show>

            <Show when={missingFields().length > 0}>
              <ReviewNotice tone="danger" icon="i-tabler-lock" title={t('purchases.editor.blocker.title')}>
                <ul class="list-disc space-y-0.5 pl-4">
                  <For each={missingFields()}>{blocker => <li>{t(SAVE_BLOCKER_I18N_KEYS[blocker])}</li>}</For>
                </ul>
              </ReviewNotice>
            </Show>
          </div>

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
            <Show when={suppliers().find(contact => contact.id === supplierId())}>
              {getSupplier => (
                <SupplierTariffCheck
                  organizationId={params.organizationId}
                  supplierId={getSupplier().id}
                  supplierName={getSupplier().name}
                  currency={currency()}
                  items={items()}
                  onAddNote={note => setNotes(current => (current.trim() === '' ? note : `${current.trimEnd()}\n\n${note}`))}
                />
              )}
            </Show>
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
              <div class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-orange-500/30 bg-orange-500/8 p-3 text-sm sm:col-span-2">
                <p class="min-w-0 flex-1">{t('purchases.editor.total-mismatch', { printed: money(extraction()!.printedTotal ?? 0), computed: money(totals().totalMinor) })}</p>
                <Button size="sm" variant="outline" class="shrink-0" onClick={() => assistantPanel.ask(t('purchases.editor.total-mismatch.ask-prompt', { printed: money(extraction()!.printedTotal ?? 0), computed: money(totals().totalMinor) }))}>
                  <div class="i-tabler-sparkles mr-1.5 size-4" />
                  {t('purchases.editor.ask-paqui')}
                </Button>
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
              rows={shownScheduleRows()}
              onRowsChange={(rows) => {
                setScheduleRows(rows);
                setInstalmentsSource(undefined);
              }}
              issueDate={issueDate()}
              payableMinor={totals().payableMinor}
              currency={currency()}
              source={instalmentsSource()}
              contactTermsDays={supplierTermsDays()}
              isPaid={isPaid()}
              paidControl={(
                <div class="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
                  <div class={cn(isPaid() && 'font-semibold')}>
                    <SimpleCheckbox checked={isPaid()} onChange={setPaidChoice} label={t('purchases.editor.already-paid')} />
                  </div>
                  <Show when={isPaid()}>
                    <label class="flex items-center gap-2 text-sm text-muted-foreground">
                      {t('purchases.editor.paid-on')}
                      <TextField
                        type="date"
                        class="h-9 w-40"
                        value={paidDate() || issueDate()}
                        onInput={(event) => {
                          setPaidDate(event.currentTarget.value);
                          setPaidChoice(true);
                        }}
                      />
                    </label>
                  </Show>
                </div>
              )}
            />
          </Show>

          <PurchaseMetadataFields value={metadata()} onChange={setMetadata} />
        </div>

        <Show when={documentQuery.data?.document}>
          {getDocument => (
            <aside class="min-w-0 lg:sticky lg:top-6 lg:self-start">
              {/* As tall as the paper, scrolled within the screen when it is longer */}
              <div class="max-h-[calc(100dvh-9rem)] overflow-auto rounded-xl border bg-card">
                <DocumentSidePreview document={getDocument()} />
              </div>
            </aside>
          )}
        </Show>
      </div>

    </main>
  );
}
