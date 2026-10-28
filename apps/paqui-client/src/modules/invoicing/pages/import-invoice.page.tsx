import type { InvoiceItemInput } from '../invoicing.types';
import type { Contact } from '@/modules/contacts/contacts.types';
import { A, useNavigate, useParams, useSearchParams } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createEffect, createMemo, createSignal, Index, Show } from 'solid-js';
import { emptyContact } from '@/modules/contacts/components/contact-form';
import { createContact, fetchContacts, getContactsQueryKey, updateContact } from '@/modules/contacts/contacts.services';
import { DocumentSidePreview } from '@/modules/documents/components/document-side-preview';
import { fetchDocument } from '@/modules/documents/documents.services';
import { getDueDatesQueryKey } from '@/modules/due-dates/due-dates.services';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { InvoiceParties } from '@/modules/purchases/components/invoice-parties';
import { findPartyContact } from '@/modules/purchases/purchases.models';
import { createPurchaseReadings, fetchPurchaseInvoices, fetchPurchaseReadings, getPurchaseInvoicesQueryKey, getPurchaseReadingsQueryKey } from '@/modules/purchases/purchases.services';
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
import { FormField } from '../components/catalog-page';
import { getLineNetMinor, getLineTaxMinor, getWithholdingMinor } from '../components/invoice-preview';
import { WITHHOLDING_RATES_BPS } from '../invoicing.constants';
import { fetchFiscalProfile, fetchInvoices, importIssuedInvoice } from '../invoicing.services';

const TAX_RATES_BPS = [0, 400, 1_000, 2_100];

const emptyLine = (): InvoiceItemInput => ({ description: '', quantityMillis: 1_000, unitPriceMinor: 0, taxRateBps: 2_100, discountRateBps: 0, discountMinor: 0 });

const toDateInput = (date: Date | string | null | undefined) => (date === null || date === undefined ? '' : new Date(date).toISOString().slice(0, 10));

/**
 * An invoice the organization issued before (or outside) the app, registered from its uploaded paper: the AI reads
 * it, the user reviews it, and it is saved as already issued with its printed number, never issued again.
 */
export function ImportInvoicePage() {
  const { t, getLocale } = useI18n();
  const params = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { getErrorMessage } = useI18nApiErrors();

  const documentId = () => (typeof searchParams.documentId === 'string' ? searchParams.documentId : '');
  const queue = () => (typeof searchParams.queue === 'string' && searchParams.queue !== '' ? searchParams.queue.split(',') : []);
  const { returnHref: listHref, keepReturnTo } = useReturnHref(() => getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'invoices' }));

  const [customerId, setCustomerId] = createSignal('');
  const [number, setNumber] = createSignal('');
  const [issueDate, setIssueDate] = createSignal('');
  const [dueDate, setDueDate] = createSignal('');
  const [isPaid, setIsPaid] = createSignal(false);
  const [currency, setCurrency] = createSignal('EUR');
  const [withholdingRateBps, setWithholdingRateBps] = createSignal(0);
  const [notes, setNotes] = createSignal('');
  const [items, setItems] = createSignal<InvoiceItemInput[]>([emptyLine()]);

  // Leaving with changes asks first; what the AI read is where the form starts from
  const leaveGuard = useUnsavedChangesGuard({
    snapshot: () => ({ customerId: customerId(), number: number(), issueDate: issueDate(), dueDate: dueDate(), isPaid: isPaid(), currency: currency(), withholdingRateBps: withholdingRateBps(), notes: notes(), items: items() }),
  });

  const contactsQuery = useQuery(() => ({ queryKey: getContactsQueryKey({ organizationId: params.organizationId }), queryFn: () => fetchContacts({ organizationId: params.organizationId }) }));
  const contacts = () => contactsQuery.data?.contacts ?? [];
  const customers = () => contacts().filter(contact => contact.isCustomer);

  // The reading is the same one the purchases use: it tells who issued the paper, so a received invoice is caught here
  const isInProgress = (status: string | undefined) => status === 'pending' || status === 'reading';
  const readingQuery = useQuery(() => ({
    queryKey: getPurchaseReadingsQueryKey({ organizationId: params.organizationId, documentId: documentId() }),
    queryFn: async () => {
      const { readings: [reading] } = await fetchPurchaseReadings({ organizationId: params.organizationId, documentIds: [documentId()] });
      if (reading) {
        return { reading };
      }
      const { readings: [queued] } = await createPurchaseReadings({ organizationId: params.organizationId, documentIds: [documentId()] });
      return { reading: queued ?? null };
    },
    enabled: documentId() !== '',
    refetchInterval: query => (isInProgress(query.state.data?.reading?.status) ? 1_500 : false),
    retry: 1,
  }));
  const reading = () => readingQuery.data?.reading ?? null;
  const extraction = () => reading()?.extraction ?? null;
  const isReading = () => readingQuery.isLoading || isInProgress(reading()?.status);

  // Who issued the paper: what the reading found, or what the user answered when it could not tell (or got it wrong).
  // Without a reading (it failed, the form is filled by hand) the paper is taken as ours: it was uploaded to the sales.
  const [answeredDirection, setAnsweredDirection] = createSignal<'issued' | null>(null);
  const direction = () => answeredDirection() ?? extraction()?.direction ?? null;
  const isSale = () => direction() === 'issued' || direction() === null;
  const profileQuery = useQuery(() => ({ queryKey: ['invoicing', params.organizationId, 'profile'], queryFn: () => fetchFiscalProfile({ organizationId: params.organizationId }) }));

  // A paper already in the books (an issued invoice, a purchase) is not registered twice
  const invoicesQuery = useQuery(() => ({ queryKey: ['invoicing', params.organizationId, 'invoices'], queryFn: () => fetchInvoices({ organizationId: params.organizationId }) }));
  const purchasesQuery = useQuery(() => ({ queryKey: getPurchaseInvoicesQueryKey({ organizationId: params.organizationId }), queryFn: () => fetchPurchaseInvoices({ organizationId: params.organizationId }) }));
  const isAlreadyRegistered = () => (invoicesQuery.data?.invoices ?? []).some(invoice => invoice.documentId === documentId())
    || (purchasesQuery.data?.purchaseInvoices ?? []).some(purchaseInvoice => purchaseInvoice.documentId === documentId());

  const documentQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'documents', documentId()],
    queryFn: () => fetchDocument({ organizationId: params.organizationId, documentId: documentId() }),
    enabled: documentId() !== '',
  }));

  // The form starts from the reading once, then belongs to the user
  let loadedDocumentId: string | undefined;
  createEffect(() => {
    const read = extraction();
    if (!read || loadedDocumentId === documentId()) {
      return;
    }
    loadedDocumentId = documentId();
    setAnsweredDirection(null);

    const { draft, counterparty } = read;
    setNumber(draft.number ?? '');
    setIssueDate(toDateInput(draft.issueDate));
    setDueDate(toDateInput(draft.dueDate ?? draft.issueDate));
    setCurrency(draft.currency || 'EUR');
    setWithholdingRateBps(draft.withholdingRateBps ?? 0);
    if (draft.items.length > 0) {
      setItems(draft.items.map(item => ({ description: item.description, quantityMillis: item.quantityMillis, unitPriceMinor: item.unitPriceMinor, taxRateBps: item.taxRateBps, discountRateBps: item.discountRateBps, discountMinor: 0 })));
    }
    // Only a paper read as ours names its customer: on an unclear one, the user first says whether it is theirs
    const matched = read.direction !== 'issued' || counterparty.contactId === null ? undefined : contacts().find(contact => contact.id === counterparty.contactId);
    if (matched?.isCustomer === true) {
      setCustomerId(matched.id);
    }
    leaveGuard.resetBaseline();
  });

  // The customer read on the paper: the counterparty of a paper read as ours, the recipient of an unclear one the user
  // says is theirs (the reading took the issuer as the other side), and the party that is not us on one read as received
  // that the user says is theirs (the sides were swapped). When it is not a customer yet, one click makes it one.
  const customerParty = () => {
    const read = extraction();
    if (!read || direction() !== 'issued') {
      return null;
    }
    return read.direction === 'unknown' ? (read.recipient ?? read.counterparty) : read.counterparty;
  };
  const matchedContact = createMemo((): Contact | undefined => {
    const read = extraction();
    const party = customerParty();
    if (!read || !party) {
      return undefined;
    }
    if (read.direction !== 'unknown') {
      const contactId = read.counterparty.contactId;
      return contactId === null ? undefined : contacts().find(contact => contact.id === contactId);
    }
    return findPartyContact({ party, contacts: contacts() });
  });
  const answerIsMine = () => {
    setAnsweredDirection('issued');
    const matched = matchedContact();
    if (customerId() === '' && matched?.isCustomer === true) {
      setCustomerId(matched.id);
    }
  };
  // Only for a paper of ours: on a received invoice the other party is a supplier, not a customer
  const isOwnPaper = () => direction() === 'issued' && !isAlreadyRegistered();
  const canCreateCustomer = () => isOwnPaper() && customerId() === '' && customerParty()?.name && matchedContact() === undefined;
  const canAddCustomerRole = () => isOwnPaper() && customerId() === '' && matchedContact() !== undefined && !matchedContact()!.isCustomer;

  const customerMutation = createMutation(() => ({
    mutationFn: async () => {
      const existing = matchedContact();
      if (existing) {
        const { id: _id, organizationId: _organizationId, archivedAt: _archivedAt, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = existing;
        return updateContact({ organizationId: params.organizationId, contactId: existing.id, contact: { ...input, isCustomer: true } });
      }
      const read = customerParty()!;
      return createContact({
        organizationId: params.organizationId,
        contact: emptyContact({
          name: read.name ?? '',
          taxId: read.taxId,
          email: read.email,
          phone: read.phone,
          addressLine1: read.addressLine1,
          postalCode: read.postalCode,
          city: read.city,
          country: read.country,
          bankAccount: read.bankAccount ?? null,
          currency: currency(),
          isCustomer: true,
        }),
      });
    },
    onSuccess: async ({ contact }) => {
      await queryClient.invalidateQueries({ queryKey: getContactsQueryKey({ organizationId: params.organizationId }) });
      setCustomerId(contact.id);
      createToast({ type: 'success', message: t('invoicing.import.customer-created', { name: contact.name }) });
    },
    onError: (error: unknown) => createToast({ type: 'error', message: getErrorMessage({ error, defaultMessage: t('contacts.toast.error') }) }),
  }));

  const updateItem = (index: number, patch: Partial<InvoiceItemInput>) => setItems(current => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  const subtotalMinor = () => items().reduce((sum, item) => sum + getLineNetMinor(item), 0);
  const taxMinor = () => items().reduce((sum, item) => sum + getLineTaxMinor(item), 0);
  const withholdingMinor = () => getWithholdingMinor({ subtotalMinor: subtotalMinor(), withholdingRateBps: withholdingRateBps() });
  const money = (minor: number) => new Intl.NumberFormat(getLocale(), { style: 'currency', currency: currency() || 'EUR' }).format(minor / 100);

  const validLines = () => items().filter(item => item.description.trim() !== '');
  // What keeps the sale from being registered, said next to the disabled button
  const missing = () => [
    !isSale() && t('invoicing.import.missing.side'),
    customerId() === '' && t('invoicing.import.missing.customer'),
    number().trim() === '' && t('invoicing.import.missing.number'),
    (issueDate() === '' || dueDate() === '' || dueDate() < issueDate()) && t('invoicing.import.missing.dates'),
    validLines().length === 0 && t('invoicing.import.missing.lines'),
  ].filter((reason): reason is string => typeof reason === 'string');
  const canSave = () => !isAlreadyRegistered() && !isReading() && missing().length === 0;
  const missingMessage = () => (isAlreadyRegistered() || isReading() || missing().length === 0 ? undefined : t('invoicing.import.missing', { items: missing().join(', ') }));

  const saveMutation = createMutation(() => ({
    mutationFn: () => importIssuedInvoice({
      organizationId: params.organizationId,
      invoice: {
        documentId: documentId(),
        number: number().trim(),
        isPaid: isPaid(),
        customerId: customerId(),
        issueDate: new Date(`${issueDate()}T00:00:00.000Z`),
        dueDate: new Date(`${dueDate()}T00:00:00.000Z`),
        currency: currency(),
        withholdingRateBps: withholdingRateBps(),
        notes: notes().trim() || null,
        items: validLines(),
      },
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['invoicing', params.organizationId, 'invoices'] }),
        queryClient.invalidateQueries({ queryKey: getDueDatesQueryKey({ organizationId: params.organizationId }) }),
      ]);
      createToast({ type: 'success', message: t('invoicing.import.saved') });

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
        navigate(keepReturnTo(`${getOrganizationRouteChildHref({ organizationId: params.organizationId, routeId: 'invoices', childPath: 'import' })}?${search.toString()}`));
      });
    },
    onError: (error: unknown) => createToast({ type: 'error', message: getErrorMessage({ error, defaultMessage: t('invoicing.import.error') }) }),
  }));

  leaveGuard.setSave({ label: t('invoicing.import.save'), canSave, run: async () => saveMutation.mutateAsync() });

  const customerOptions = () => [
    { value: '', label: t('invoicing.import.customer.placeholder') },
    ...customers().map(contact => ({ value: contact.id, label: contact.taxId ? `${contact.name} · ${contact.taxId}` : contact.name })),
  ];
  const purchaseHref = () => `${getOrganizationRouteChildHref({ organizationId: params.organizationId, routeId: 'purchases', childPath: 'new' })}?documentId=${encodeURIComponent(documentId())}`;

  return (
    <main class="page">
      {leaveGuard.elements}
      <EditorBar
        backHref={listHref()}
        backLabel={t('layout.back')}
        title={t('invoicing.import.title')}
        meta={queue().length > 0 && <span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t('invoicing.import.queue', { count: queue().length })}</span>}
        actions={(
          <Button disabled={!canSave()} title={missingMessage()} isLoading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            {queue().length > 0 ? t('invoicing.import.save-and-next') : t('invoicing.import.save')}
          </Button>
        )}
      />

      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div class="flex min-w-0 flex-col gap-6">
          <p class="text-sm text-muted-foreground">{t('invoicing.import.description')}</p>

          <Show when={isAlreadyRegistered()}>
            <div class="flex flex-wrap items-center gap-3 rounded-xl border border-orange-500/30 bg-orange-500/8 p-4 text-sm">
              <p class="min-w-0 flex-1">{t('invoicing.import.already-registered')}</p>
              <Button as={A} href={`/organizations/${params.organizationId}/documents/${encodeURIComponent(documentId())}`} size="sm" variant="outline">{t('invoicing.import.open-document')}</Button>
            </div>
          </Show>

          <Show when={isReading()}>
            <div class="flex items-center gap-3 rounded-xl border bg-muted/40 p-4 text-sm">
              <div class="i-tabler-loader-2 size-5 animate-spin text-muted-foreground" />
              {t('invoicing.import.reading')}
            </div>
          </Show>
          <Show when={readingQuery.isError || reading()?.status === 'failed'}>
            <div class="rounded-xl border border-orange-500/30 bg-orange-500/8 p-4 text-sm">{t('invoicing.import.reading-failed')}</div>
          </Show>

          <Show when={extraction()}>
            {getExtraction => (
              <Show when={getExtraction().issuer && getExtraction().recipient}>
                <InvoiceParties issuer={getExtraction().issuer!} recipient={getExtraction().recipient!} ownSide={direction() === 'issued' ? 'issuer' : direction() === 'received' ? 'recipient' : null} />
              </Show>
            )}
          </Show>

          {/* Read as an invoice received from a supplier: it is an expense, not one of ours, unless the user says the reading is wrong */}
          <Show when={direction() === 'received' && !isAlreadyRegistered()}>
            <div class="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/8 p-4 text-sm">
              <div class="i-tabler-arrows-exchange mt-0.5 size-5 shrink-0 text-red-600" />
              <div class="min-w-0 flex-1">
                <p class="font-medium">{t('invoicing.import.direction.received.title')}</p>
                <p class="text-muted-foreground">{t('invoicing.import.direction.received', { name: (extraction()?.issuer ?? extraction()?.counterparty)?.name ?? '—' })}</p>
                <div class="mt-3 flex flex-wrap gap-2">
                  <Button as={A} href={keepReturnTo(purchaseHref())} size="sm">{t('invoicing.import.direction.switch-to-purchase')}</Button>
                  <Button size="sm" variant="ghost" onClick={answerIsMine}>{t('invoicing.import.direction.mine')}</Button>
                </div>
              </div>
            </div>
          </Show>

          {/* Neither the tax id nor the name told who issued it: the user says, nothing is guessed */}
          <Show when={direction() === 'unknown' && !isAlreadyRegistered()}>
            <div class="flex items-start gap-3 rounded-xl border border-orange-500/30 bg-orange-500/8 p-4 text-sm">
              <div class="i-tabler-help-circle mt-0.5 size-5 shrink-0 text-orange-600" />
              <div class="min-w-0 flex-1">
                <p class="font-medium">{t('invoicing.import.direction.unknown.title')}</p>
                <p class="text-muted-foreground">
                  {t('invoicing.import.direction.unknown', { issuer: (extraction()?.issuer ?? extraction()?.counterparty)?.name ?? '—', recipient: extraction()?.recipient?.name ?? '—' })}
                </p>
                <div class="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={answerIsMine}>{t('invoicing.import.direction.unknown.mine')}</Button>
                  <Button as={A} href={keepReturnTo(purchaseHref())} size="sm" variant="outline">{t('invoicing.import.direction.unknown.purchase')}</Button>
                </div>
                <Show when={profileQuery.isSuccess && !profileQuery.data?.profile?.taxId}>
                  <p class="mt-3 text-xs text-muted-foreground">
                    {t('invoicing.import.direction.fiscal-hint')}
                    {' '}
                    <A href={getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'settingsFiscalProfile' })} class="underline underline-offset-2 hover:text-foreground">{t('invoicing.import.direction.fiscal-hint.link')}</A>
                  </p>
                </Show>
              </div>
            </div>
          </Show>

          <Show when={missingMessage() && isSale()}>
            <p class="flex items-center gap-2 text-sm text-muted-foreground">
              <span class="i-tabler-info-circle size-4 shrink-0" />
              {missingMessage()}
            </p>
          </Show>

          <Show when={canCreateCustomer() || canAddCustomerRole()}>
            <div class="flex flex-wrap items-center gap-3 rounded-xl border border-violet-500/25 bg-violet-500/8 p-4 text-sm">
              <div class="i-tabler-user-plus size-5 shrink-0 text-violet-600 dark:text-violet-300" />
              <p class="min-w-0 flex-1">
                {canAddCustomerRole()
                  ? t('invoicing.import.customer.add-role', { name: matchedContact()!.name })
                  : t('invoicing.import.customer.create', { name: customerParty()?.name ?? '' })}
              </p>
              <Button size="sm" isLoading={customerMutation.isPending} onClick={() => customerMutation.mutate()}>
                {canAddCustomerRole() ? t('invoicing.import.customer.add-role.button') : t('invoicing.import.customer.create.button')}
              </Button>
            </div>
          </Show>

          <section class="grid gap-4 sm:grid-cols-2">
            <FormField label={t('invoicing.invoices.table.customer')} class="sm:col-span-2">
              <SimpleSelect triggerClass="h-10 w-full" value={customerId()} onChange={setCustomerId} options={customerOptions()} />
            </FormField>
            <FormField label={t('invoicing.import.number')}>
              <TextField value={number()} onInput={event => setNumber(event.currentTarget.value)} />
            </FormField>
            <FormField label={t('invoicing.import.currency')}>
              <TextField value={currency()} maxLength={3} onInput={event => setCurrency(event.currentTarget.value.toUpperCase())} />
            </FormField>
            <FormField label={t('invoicing.invoices.table.issue-date')}>
              <TextField type="date" value={issueDate()} onInput={event => setIssueDate(event.currentTarget.value)} />
            </FormField>
            <FormField label={t('invoicing.import.due-date')}>
              <TextField type="date" value={dueDate()} min={issueDate()} onInput={event => setDueDate(event.currentTarget.value)} />
            </FormField>
            <div class="sm:col-span-2">
              <SimpleCheckbox checked={isPaid()} onChange={setIsPaid} label={t('invoicing.import.paid')} />
            </div>
          </section>

          <section class="border-t pt-6">
            <div class="mb-3 flex items-center justify-between">
              <h2 class="font-medium">{t('purchases.editor.lines')}</h2>
              <Button variant="outline" size="sm" class="gap-1.5" onClick={() => setItems(current => [...current, emptyLine()])}>
                <div class="i-tabler-plus size-4" />
                {t('purchases.editor.add-line')}
              </Button>
            </div>
            <div class="flex flex-col divide-y">
              <Index each={items()}>
                {(item, index) => (
                  <div class="grid grid-cols-2 gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-4">
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
                      <TextField type="number" min="0" max="100" step="0.01" value={item().discountRateBps / 100} onInput={event => updateItem(index, { discountRateBps: Math.min(10_000, Math.max(0, Math.round(Number(event.currentTarget.value) * 100))) })} />
                    </FormField>
                  </div>
                )}
              </Index>
            </div>
          </section>

          <section class="grid gap-4 border-t pt-6 sm:grid-cols-2">
            <div class="flex flex-col gap-4">
              <FormField label={t('invoicing.editor.withholding')}>
                <SimpleSelect triggerClass="h-10 w-full" value={String(withholdingRateBps())} onChange={value => setWithholdingRateBps(Number(value))} options={[...new Set([...WITHHOLDING_RATES_BPS, withholdingRateBps()])].toSorted((a, b) => a - b).map(rateBps => ({ value: String(rateBps), label: rateBps === 0 ? t('invoicing.editor.withholding.none') : `${rateBps / 100} %` }))} />
              </FormField>
              <FormField label={t('invoicing.import.notes')}>
                <TextArea value={notes()} rows={3} onInput={event => setNotes(event.currentTarget.value)} />
              </FormField>
            </div>
            <dl class="grid h-fit grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt class="text-muted-foreground">{t('invoicing.preview.subtotal')}</dt>
              <dd class="text-right tabular-nums">{money(subtotalMinor())}</dd>
              <dt class="text-muted-foreground">{t('invoicing.preview.tax')}</dt>
              <dd class="text-right tabular-nums">{money(taxMinor())}</dd>
              <Show when={withholdingMinor() > 0}>
                <dt class="text-muted-foreground">{t('invoicing.preview.withholding', { rate: withholdingRateBps() / 100 })}</dt>
                <dd class="text-right tabular-nums">{money(-withholdingMinor())}</dd>
              </Show>
              <dt class="border-t pt-1.5 font-medium">{t('invoicing.preview.amount-due')}</dt>
              <dd class={cn('border-t pt-1.5 text-right font-medium tabular-nums')}>{money(subtotalMinor() + taxMinor() - withholdingMinor())}</dd>
              <Show when={extraction()?.printedTotal !== null && extraction()?.printedTotal !== undefined && extraction()!.printedTotal !== subtotalMinor() + taxMinor()}>
                <dd class="col-span-2 mt-2 text-xs text-orange-700 dark:text-orange-300">{t('invoicing.import.total-mismatch', { total: money(extraction()!.printedTotal!) })}</dd>
              </Show>
            </dl>
          </section>
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
