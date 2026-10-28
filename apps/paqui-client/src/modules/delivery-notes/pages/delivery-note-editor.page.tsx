import type { DeliveryNoteDraftInput, DeliveryNoteItemInput, DeliveryNoteReadingLine } from '../delivery-notes.types';
import type { InvoicingProduct } from '@/modules/invoicing/invoicing.types';
import { A, useNavigate, useParams, useSearchParams } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createEffect, createMemo, createSignal, For, Index, on, Show } from 'solid-js';
import { emptyContact } from '@/modules/contacts/components/contact-form';
import { createContact, fetchContacts, getContactsQueryKey } from '@/modules/contacts/contacts.services';
import { DocumentSidePreview } from '@/modules/documents/components/document-side-preview';
import { fetchDocument } from '@/modules/documents/documents.services';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { FormField } from '@/modules/invoicing/components/catalog-page';
import { getProductsQueryKey } from '@/modules/invoicing/components/product-form';
import { ProductSelector } from '@/modules/invoicing/components/product-selector';
import { createProduct, fetchProducts } from '@/modules/invoicing/invoicing.services';
import { useConfirmModal } from '@/modules/shared/confirm';
import { useI18nApiErrors } from '@/modules/shared/http/composables/i18n-api-errors';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { useUnsavedChangesGuard } from '@/modules/shared/unsaved-changes';
import { Button } from '@/modules/ui/components/button';
import { EditorBar } from '@/modules/ui/components/editor-bar';
import { PageSection, PageSections } from '@/modules/ui/components/page-section';
import { SimpleSelect } from '@/modules/ui/components/simple-select';
import { createToast } from '@/modules/ui/components/sonner';
import { TextArea } from '@/modules/ui/components/textarea';
import { TextField } from '@/modules/ui/components/textfield';
import { getOrganizationRouteChildHref, getOrganizationRouteHref } from '@/modules/ui/navigation/organization-navigation';
import { createDeliveryNote, deleteDeliveryNote, fetchDeliveryNote, getDeliveryNoteReadingQueryKey, getDeliveryNotesQueryKey, openDeliveryNotePdf, readDeliveryNote, updateDeliveryNote } from '../delivery-notes.services';

// A line of the editor: what is saved, plus how the reading matched it (shown until the user picks the product)
type EditorLine = DeliveryNoteItemInput & { reading?: Pick<DeliveryNoteReadingLine, 'matchedBy' | 'confidence' | 'alternativeProductIds'> };

const today = () => new Date().toISOString().slice(0, 10);
const emptyLine = (): EditorLine => ({ productId: null, writtenText: null, description: '', quantityMillis: 1_000 });

// A delivery note is filled in seconds: the customer, the products and how many. No prices (they come from the
// customer price list when invoiced), and the number is given on save.
export function DeliveryNoteEditorPage() {
  const { t } = useI18n();
  const { getErrorMessage } = useI18nApiErrors();
  const { confirm } = useConfirmModal();
  const params = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const isEditing = () => params.deliveryNoteId !== undefined;
  const documentIdParam = () => (typeof searchParams.documentId === 'string' ? searchParams.documentId : undefined);
  const queue = () => (typeof searchParams.queue === 'string' && searchParams.queue !== '' ? searchParams.queue.split(',') : []);
  const listHref = () => getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'deliveryNotes' });

  const [customerId, setCustomerId] = createSignal('');
  const [number, setNumber] = createSignal<string | null>(null);
  const [date, setDate] = createSignal(today());
  const [notes, setNotes] = createSignal('');
  const [isNotesOpen, setIsNotesOpen] = createSignal(false);
  const [documentId, setDocumentId] = createSignal<string | null>(null);
  const [items, setItems] = createSignal<EditorLine[]>([emptyLine()]);

  // Leaving with changes asks first; what the photo read or the server loaded is where the form starts from
  const leaveGuard = useUnsavedChangesGuard({
    snapshot: () => ({ customerId: customerId(), number: number(), date: date(), notes: notes(), items: items().map(({ productId, description, quantityMillis }) => ({ productId, description, quantityMillis })) }),
  });

  const contactsQuery = useQuery(() => ({ queryKey: getContactsQueryKey({ organizationId: params.organizationId }), queryFn: () => fetchContacts({ organizationId: params.organizationId }) }));
  const productsQuery = useQuery(() => ({ queryKey: getProductsQueryKey({ organizationId: params.organizationId }), queryFn: () => fetchProducts({ organizationId: params.organizationId }) }));
  const deliveryNoteQuery = useQuery(() => ({
    queryKey: [...getDeliveryNotesQueryKey({ organizationId: params.organizationId }), params.deliveryNoteId],
    queryFn: () => fetchDeliveryNote({ organizationId: params.organizationId, deliveryNoteId: params.deliveryNoteId! }),
    enabled: isEditing(),
  }));
  // The photo is read once: going back to it does not call the AI again, saving the list does not refresh it
  const readingQuery = useQuery(() => ({
    queryKey: getDeliveryNoteReadingQueryKey({ organizationId: params.organizationId, documentId: documentIdParam() ?? '' }),
    queryFn: () => readDeliveryNote({ organizationId: params.organizationId, documentId: documentIdParam()! }),
    enabled: !isEditing() && documentIdParam() !== undefined,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  }));
  const documentQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'documents', documentId()],
    queryFn: () => fetchDocument({ organizationId: params.organizationId, documentId: documentId()! }),
    enabled: documentId() !== null,
  }));

  const customers = () => (contactsQuery.data?.contacts ?? []).filter(contact => contact.isCustomer);
  const customerIds = createMemo(() => new Set(customers().map(({ id }) => id)));
  // What is sold: our own catalog and the customers' own products, never what suppliers sell us
  const products = createMemo(() => (productsQuery.data?.products ?? []).filter(product => product.contactId === null || customerIds().has(product.contactId)));
  const productsById = createMemo(() => new Map(products().map(product => [product.id, product])));
  const deliveryNote = () => deliveryNoteQuery.data?.deliveryNote;
  const isInvoiced = () => deliveryNote()?.status === 'invoiced';
  const reading = () => readingQuery.data?.reading;

  createEffect(on(() => deliveryNote(), (loaded) => {
    if (!loaded) {
      return;
    }

    setCustomerId(loaded.customerId);
    setNumber(loaded.number);
    setDate(loaded.date.toISOString().slice(0, 10));
    setNotes(loaded.notes ?? '');
    setIsNotesOpen((loaded.notes ?? '') !== '');
    setDocumentId(loaded.documentId);
    setItems(loaded.items?.map(({ productId, writtenText, description, quantityMillis }) => ({ productId, writtenText, description, quantityMillis })) ?? [emptyLine()]);
    leaveGuard.resetBaseline();
  }));

  // Opened from a customer page: the delivery note is already for it
  createEffect(on(() => searchParams.customerId, (id) => {
    if (!isEditing() && typeof id === 'string' && id !== '') {
      setCustomerId(id);
    }
  }));

  // A new delivery note from a photo: shown as soon as it is uploaded, filled once read
  createEffect(on(documentIdParam, (id) => {
    if (!isEditing() && id !== undefined) {
      setDocumentId(id);
    }
  }));

  let prefilledDocumentId: string | undefined;
  createEffect(() => {
    const read = reading();
    if (!read || !productsQuery.data || !contactsQuery.data || prefilledDocumentId === read.documentId) {
      return;
    }

    prefilledDocumentId = read.documentId;
    setCustomerId(read.customer.contactId ?? '');
    setNumber(read.number);
    setDate(read.date?.slice(0, 10) ?? today());
    setItems(read.lines.length === 0
      ? [emptyLine()]
      : read.lines.map((line) => {
          const product = line.productId === null ? undefined : productsById().get(line.productId);
          const lineReading = { matchedBy: line.matchedBy, confidence: line.confidence, alternativeProductIds: line.alternativeProductIds };

          return { productId: product?.id ?? null, writtenText: line.writtenText, description: product?.name ?? line.writtenText, quantityMillis: line.quantityMillis, reading: lineReading };
        }));
    // The photo can be read after the user clicked around: it is not a change of theirs
    leaveGuard.resetBaseline();
  });

  const updateItem = (index: number, patch: Partial<EditorLine>) => setItems(current => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));

  // Picking a product confirms the line: the reading hints go away, the written text stays to be learnt
  const pickProduct = (index: number, product: InvoicingProduct) => updateItem(index, { productId: product.id, description: product.name, reading: undefined });

  const applyProduct = (index: number, name: string, product: InvoicingProduct | null) => {
    if (product) {
      pickProduct(index, product);
      return;
    }

    updateItem(index, { productId: null, description: name });
  };

  const createLineProduct = async (name: string) => {
    try {
      const { product } = await createProduct({
        organizationId: params.organizationId,
        product: { name, description: null, unit: 'unidad', unitPriceMinor: 0, currency: 'EUR', taxRateBps: 2_100, icon: null, iconColor: null, contactId: null, imageDocumentId: null },
      });
      void queryClient.invalidateQueries({ queryKey: getProductsQueryKey({ organizationId: params.organizationId }) });
      createToast({ type: 'success', message: t('invoicing.products.toast.saved') });
      return product;
    } catch (error) {
      createToast({ type: 'error', message: t('invoicing.products.toast.error') });
      throw error;
    }
  };

  const createCustomerMutation = createMutation(() => ({
    mutationFn: (name: string) => createContact({ organizationId: params.organizationId, contact: { ...emptyContact({ isCustomer: true, name }), taxId: reading()?.customer.taxId ?? null } }),
    onSuccess: async ({ contact }) => {
      await queryClient.invalidateQueries({ queryKey: getContactsQueryKey({ organizationId: params.organizationId }) });
      setCustomerId(contact.id);
      createToast({ type: 'success', message: t('invoicing.editor.customer.toast.created') });
    },
    onError: (error: unknown) => createToast({ type: 'error', message: getErrorMessage({ error, defaultMessage: t('invoicing.editor.customer.toast.error') }) }),
  }));

  const goToNext = () => {
    const [next, ...rest] = queue();

    if (next === undefined) {
      navigate(listHref());
      return;
    }

    const search = new URLSearchParams({ documentId: next });
    if (rest.length > 0) {
      search.set('queue', rest.join(','));
    }
    navigate(`${getOrganizationRouteChildHref({ organizationId: params.organizationId, routeId: 'deliveryNotes', childPath: 'new' })}?${search.toString()}`);
  };

  // With print: the tab for the PDF is opened on the click itself, a tab opened after the save would be blocked
  const saveMutation = createMutation(() => ({
    mutationFn: async ({ printTarget }: { printTarget: Window | null }) => {
      const draft: DeliveryNoteDraftInput = {
        customerId: customerId(),
        number: number(),
        date: new Date(`${date()}T00:00:00.000Z`),
        notes: notes().trim() || null,
        documentId: documentId(),
        items: items().map(({ productId, writtenText, description, quantityMillis }) => ({ productId, writtenText, description: description.trim(), quantityMillis })),
      };

      const { deliveryNote: saved } = isInvoiced()
        ? { deliveryNote: deliveryNote()! }
        : isEditing()
          ? await updateDeliveryNote({ organizationId: params.organizationId, deliveryNoteId: params.deliveryNoteId!, deliveryNote: draft })
          : await createDeliveryNote({ organizationId: params.organizationId, deliveryNote: draft });

      if (printTarget) {
        await openDeliveryNotePdf({ organizationId: params.organizationId, deliveryNoteId: saved.id, target: printTarget });
      }

      return { deliveryNote: saved };
    },
    onSuccess: async ({ deliveryNote: saved }) => {
      await queryClient.invalidateQueries({ queryKey: getDeliveryNotesQueryKey({ organizationId: params.organizationId }) });
      createToast({ type: 'success', message: t('delivery-notes.toast.saved', { number: saved.number ?? '' }) });
      leaveGuard.afterSave(goToNext);
    },
    onError: (error: unknown, { printTarget }) => {
      printTarget?.close();
      createToast({ type: 'error', message: getErrorMessage({ error, defaultMessage: t('delivery-notes.toast.error') }) });
    },
  }));

  const save = ({ print }: { print: boolean }) => saveMutation.mutate({ printTarget: print ? window.open('', '_blank') : null });

  const deleteMutation = createMutation(() => ({
    mutationFn: () => deleteDeliveryNote({ organizationId: params.organizationId, deliveryNoteId: params.deliveryNoteId! }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: getDeliveryNotesQueryKey({ organizationId: params.organizationId }) });
      leaveGuard.allowLeave();
      navigate(listHref());
    },
    onError: (error: unknown) => createToast({ type: 'error', message: getErrorMessage({ error, defaultMessage: t('delivery-notes.toast.delete-error') }) }),
  }));

  const canSave = () => customerId() !== '' && items().length > 0 && items().every(item => item.description.trim() !== '' && item.quantityMillis > 0);
  leaveGuard.setSave({ label: t('delivery-notes.editor.save'), canSave: () => canSave() && !isInvoiced(), run: async () => saveMutation.mutateAsync({ printTarget: null }) });
  const unmatchedCount = () => items().filter(item => item.reading !== undefined && (item.productId === null || item.reading.confidence === 'low')).length;
  const unknownCustomerName = () => {
    const read = reading();
    return read && read.customer.contactId === null && customerId() === '' && read.customer.name !== null && read.customer.name.trim() !== '' ? read.customer.name.trim() : null;
  };

  return (
    <main class="page">
      {leaveGuard.elements}
      <EditorBar
        backHref={listHref()}
        backLabel={t('delivery-notes.editor.back')}
        title={isEditing() && number() !== null ? t('delivery-notes.editor.edit-title', { number: number()! }) : t('delivery-notes.editor.new-title')}
        meta={queue().length > 0 && <span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t('delivery-notes.editor.queue', { count: queue().length })}</span>}
        secondaryActions={[
          ...(isEditing() && !isInvoiced()
            ? [{
                label: t('delivery-notes.editor.delete.confirm'),
                icon: 'i-tabler-trash',
                isDestructive: true,
                isLoading: deleteMutation.isPending,
                onSelect: async () => {
                  if (await confirm({ title: t('delivery-notes.editor.delete.title'), message: t('delivery-notes.editor.delete.message'), confirmButton: { text: t('delivery-notes.editor.delete.confirm'), variant: 'destructive' } })) {
                    deleteMutation.mutate();
                  }
                },
              }]
            : []),
          ...(queue().length > 0 ? [{ label: t('delivery-notes.editor.skip'), icon: 'i-tabler-player-skip-forward', onSelect: goToNext }] : []),
          // A phone has room for one button: saving without printing goes in the menu there
          ...(!isInvoiced() ? [{ label: queue().length > 0 ? t('delivery-notes.editor.save-and-next') : t('delivery-notes.editor.save'), icon: 'i-tabler-device-floppy', disabled: !canSave(), isLoading: saveMutation.isPending && saveMutation.variables?.printTarget === null, onSelect: () => save({ print: false }), isMobileOnly: true }] : []),
        ]}
        actions={(
          <>
            <Show when={!isInvoiced()}>
              <Button variant="outline" class="hidden md:inline-flex" disabled={!canSave()} isLoading={saveMutation.isPending && saveMutation.variables?.printTarget === null} onClick={() => save({ print: false })}>
                {queue().length > 0 ? t('delivery-notes.editor.save-and-next') : t('delivery-notes.editor.save')}
              </Button>
            </Show>
            <Button class="gap-1.5" disabled={!canSave()} isLoading={saveMutation.isPending && saveMutation.variables?.printTarget !== null} onClick={() => save({ print: true })}>
              <div class="i-tabler-printer size-4" />
              {isInvoiced() ? t('delivery-notes.editor.print') : t('delivery-notes.editor.save-and-print')}
            </Button>
          </>
        )}
      />

      <div class={cn('grid gap-6', documentId() && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]')}>
        <div class="flex min-w-0 max-w-2xl flex-col gap-4">
          <Show when={readingQuery.isFetching}>
            <div class="flex items-center gap-3 rounded-xl border bg-muted/40 p-4 text-sm">
              <div class="i-tabler-loader-2 size-5 animate-spin text-muted-foreground" />
              {t('delivery-notes.editor.reading')}
            </div>
          </Show>
          <Show when={readingQuery.isError}>
            <div class="flex flex-wrap items-center gap-3 rounded-xl border border-orange-500/30 bg-orange-500/8 p-4 text-sm">
              <p class="min-w-0 flex-1">{getErrorMessage({ error: readingQuery.error, defaultMessage: t('delivery-notes.editor.reading.failed') })}</p>
              <Button size="sm" variant="outline" class="gap-1.5" onClick={() => void readingQuery.refetch()}>
                <div class="i-tabler-refresh size-4" />
                {t('delivery-notes.editor.reading.retry')}
              </Button>
            </div>
          </Show>
          <Show when={isInvoiced()}>
            <div class="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/8 p-4 text-sm">
              <div class="i-tabler-file-check size-5 shrink-0 text-emerald-600 dark:text-emerald-300" />
              <p class="min-w-0 flex-1">{deliveryNote()?.invoiceNumber ? t('delivery-notes.editor.invoiced', { number: deliveryNote()!.invoiceNumber! }) : t('delivery-notes.editor.invoiced-draft')}</p>
              <Show when={deliveryNote()?.invoiceStatus === 'draft' ? deliveryNote()?.invoiceId : null}>
                {invoiceId => (
                  <Button as={A} size="sm" variant="outline" href={getOrganizationRouteChildHref({ organizationId: params.organizationId, routeId: 'invoices', childPath: `${invoiceId()}/edit` })}>
                    {t('delivery-notes.editor.open-invoice')}
                  </Button>
                )}
              </Show>
            </div>
          </Show>
          <Show when={reading()?.duplicate}>
            {duplicate => (
              <div class="flex flex-wrap items-center gap-3 rounded-xl border border-orange-500/30 bg-orange-500/8 p-4 text-sm">
                <div class="i-tabler-copy size-5 shrink-0 text-orange-600" />
                <p class="min-w-0 flex-1">{t('delivery-notes.editor.duplicate', { number: duplicate().number ?? '' })}</p>
                <Button as={A} size="sm" variant="outline" href={getOrganizationRouteChildHref({ organizationId: params.organizationId, routeId: 'deliveryNotes', childPath: `${duplicate().id}/edit` })}>
                  {t('delivery-notes.editor.duplicate.open')}
                </Button>
              </div>
            )}
          </Show>
          <Show when={(reading()?.warnings.length ?? 0) > 0 || unmatchedCount() > 0}>
            <div class="rounded-xl border border-amber-500/30 bg-amber-500/6 p-4 text-sm">
              <p class="font-medium">{t('delivery-notes.editor.review.title')}</p>
              <ul class="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                <Show when={unmatchedCount() > 0}>
                  <li>{t('delivery-notes.editor.review.unmatched', { count: unmatchedCount() })}</li>
                </Show>
                <For each={reading()?.warnings}>{warning => <li>{warning}</li>}</For>
              </ul>
            </div>
          </Show>

          <fieldset disabled={isInvoiced()} class="min-w-0">
            <PageSections>
              <PageSection>
                <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
                  <FormField label={t('delivery-notes.editor.customer')}>
                    <SimpleSelect
                      triggerClass="h-11"
                      value={customerId()}
                      onChange={setCustomerId}
                      disabled={isInvoiced()}
                      options={[{ value: '', label: t('delivery-notes.editor.customer.placeholder') }, ...customers().map(contact => ({ value: contact.id, label: contact.name }))]}
                    />
                  </FormField>
                  <FormField label={t('delivery-notes.editor.date')}>
                    <TextField class="h-11" type="date" value={date()} onInput={event => setDate(event.currentTarget.value)} />
                  </FormField>
                </div>

                <Show when={customerId() === '' && ((reading()?.customer.candidates.length ?? 0) > 0 || unknownCustomerName())}>
                  <div class="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    <Show when={reading()?.customer.name}>
                      {name => <span class="text-muted-foreground">{t('delivery-notes.editor.customer.read', { name: name() })}</span>}
                    </Show>
                    <For each={reading()?.customer.candidates}>
                      {candidate => (
                        <Button size="sm" variant="outline" class="h-7 rounded-full" onClick={() => setCustomerId(candidate.contactId)}>{candidate.name}</Button>
                      )}
                    </For>
                    <Show when={unknownCustomerName()}>
                      {name => (
                        <Button size="sm" variant="secondary" class="h-7 gap-1 rounded-full" isLoading={createCustomerMutation.isPending} onClick={() => createCustomerMutation.mutate(name())}>
                          <div class="i-tabler-user-plus size-3.5" />
                          {t('delivery-notes.editor.customer.create', { name: name() })}
                        </Button>
                      )}
                    </Show>
                  </div>
                </Show>
              </PageSection>

              <PageSection>
                <div class="mb-2 grid grid-cols-[minmax(0,1fr)_6rem_2rem] gap-2 text-xs font-medium text-muted-foreground">
                  <span>{t('delivery-notes.editor.line.product')}</span>
                  <span class="text-right">{t('delivery-notes.editor.line.quantity')}</span>
                </div>
                <div class="flex flex-col gap-2">
                  <Index each={items()}>
                    {(item, index) => {
                      const needsReview = () => item().reading !== undefined && (item().productId === null || item().reading!.confidence === 'low');
                      const alternatives = () => (item().reading?.alternativeProductIds ?? []).map(id => productsById().get(id)).filter(product => product !== undefined);

                      return (
                        <div class={cn('flex flex-col gap-1.5', needsReview() && '-mx-2 rounded-lg bg-amber-500/6 px-2 py-2')}>
                          <div class="grid grid-cols-[minmax(0,1fr)_6rem_2rem] items-center gap-2">
                            <ProductSelector
                              class="[&_input]:h-11"
                              products={products()}
                              selectedProductId={item().productId}
                              ariaLabel={t('delivery-notes.editor.line.product')}
                              placeholder={t('delivery-notes.editor.line.product.placeholder')}
                              value={item().description}
                              onChange={(name, product) => applyProduct(index, name, product)}
                              onCreate={createLineProduct}
                            />
                            <TextField class="no-spinner h-11 text-right text-base font-medium" type="number" inputMode="decimal" min="0.001" step="0.001" aria-label={t('delivery-notes.editor.line.quantity')} value={item().quantityMillis / 1_000} onInput={event => updateItem(index, { quantityMillis: Math.round(Number(event.currentTarget.value) * 1_000) })} />
                            <Button type="button" variant="ghost" size="icon-sm" class="text-muted-foreground" aria-label={t('delivery-notes.editor.line.remove')} disabled={items().length === 1} onClick={() => setItems(current => current.filter((_, itemIndex) => itemIndex !== index))}>
                              <div class="i-tabler-x size-4" />
                            </Button>
                          </div>

                          <Show when={item().reading}>
                            <div class="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                              <div class="i-tabler-writing size-3.5" />
                              <span class="italic">{`«${item().writtenText ?? ''}»`}</span>
                              <Show when={item().reading?.matchedBy === 'memory'}>
                                <span class="rounded-full bg-emerald-500/12 px-1.5 py-px font-medium text-emerald-700 dark:text-emerald-300">{t('delivery-notes.editor.line.remembered')}</span>
                              </Show>
                              <Show when={needsReview()}>
                                <span class="rounded-full bg-amber-500/15 px-1.5 py-px font-medium text-amber-700 dark:text-amber-300">{item().productId === null ? t('delivery-notes.editor.line.unmatched') : t('delivery-notes.editor.line.unsure')}</span>
                              </Show>
                              <Show when={alternatives().length > 0}>
                                <span>{t('delivery-notes.editor.line.alternatives')}</span>
                                <For each={alternatives()}>
                                  {product => (
                                    <Button type="button" size="sm" variant="outline" class="h-6 rounded-full px-2 text-xs" onClick={() => pickProduct(index, product)}>{product.name}</Button>
                                  )}
                                </For>
                              </Show>
                              <Show when={needsReview() && item().productId !== null}>
                                <Button type="button" size="sm" variant="ghost" class="h-6 gap-1 rounded-full px-2 text-xs" onClick={() => pickProduct(index, productsById().get(item().productId!)!)}>
                                  <div class="i-tabler-check size-3.5" />
                                  {t('delivery-notes.editor.line.confirm')}
                                </Button>
                              </Show>
                            </div>
                          </Show>
                        </div>
                      );
                    }}
                  </Index>
                </div>

                <button
                  type="button"
                  class="mt-3 flex items-center gap-1.5 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => setItems(current => [...current, emptyLine()])}
                >
                  <div class="i-tabler-plus size-4" />
                  {t('delivery-notes.editor.line.add')}
                </button>
                <div class="mt-4" />
                <Show
                  when={isNotesOpen()}
                  fallback={(
                    <button type="button" class="flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground" onClick={() => setIsNotesOpen(true)}>
                      <div class="i-tabler-note size-4" />
                      {t('delivery-notes.editor.notes.add')}
                    </button>
                  )}
                >
                  <FormField label={t('delivery-notes.editor.notes')}>
                    <TextArea value={notes()} onInput={event => setNotes(event.currentTarget.value)} />
                  </FormField>
                </Show>
              </PageSection>
            </PageSections>
          </fieldset>
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
