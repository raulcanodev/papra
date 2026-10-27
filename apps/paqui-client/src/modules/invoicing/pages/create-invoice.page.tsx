import type { Invoice, InvoiceDeliveryNote, InvoiceDraftInput, InvoiceItemInput, InvoiceTemplateId, InvoicingProduct } from '../invoicing.types';
import type { Contact } from '@/modules/contacts/contacts.types';
import type { DeliveryNote } from '@/modules/delivery-notes/delivery-notes.types';
import type { PaymentMethod } from '@/modules/due-dates/due-dates.types';
import { A, useNavigate, useParams } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createEffect, createSignal, Index, on, Show } from 'solid-js';
import { ContactFormFields, emptyContact } from '@/modules/contacts/components/contact-form';
import { createContact, fetchContacts, getContactsQueryKey } from '@/modules/contacts/contacts.services';
import { InvoiceDeliveryNotesField } from '@/modules/delivery-notes/components/invoice-delivery-notes-field';
import { PAYMENT_METHOD_LABEL_I18N_KEYS, PAYMENT_METHODS } from '@/modules/due-dates/due-dates.constants';
import { getDocumentLocale } from '@/modules/i18n/document-locale';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { getContactPricesQueryKey } from '@/modules/pricing/components/contact-price-list-field';
import { fetchContactPrices } from '@/modules/pricing/pricing.services';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { Badge } from '@/modules/ui/components/badge';
import { Button } from '@/modules/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/modules/ui/components/dialog';
import { SimpleCheckbox } from '@/modules/ui/components/simple-checkbox';
import { SimpleSelect } from '@/modules/ui/components/simple-select';
import { createToast } from '@/modules/ui/components/sonner';
import { TextArea } from '@/modules/ui/components/textarea';
import { TextField } from '@/modules/ui/components/textfield';
import { getOrganizationRouteHref } from '@/modules/ui/navigation/organization-navigation';
import { useReturnHref } from '@/modules/ui/navigation/return-to';
import { FormField, SaveButton } from '../components/catalog-page';
import { CustomerSelector, customerSummary } from '../components/customer-selector';
import { getLineNetMinor, InvoicePreview } from '../components/invoice-preview';
import { getProductsQueryKey } from '../components/product-form';
import { ProductSelector } from '../components/product-selector';
import { WITHHOLDING_RATES_BPS } from '../invoicing.constants';
import { createInvoice, createProduct, downloadInvoicePdf, fetchFiscalProfile, fetchInvoice, fetchInvoiceBranding, fetchInvoiceSeries, fetchProducts, fetchTaxRates, issueInvoice, sendInvoice, updateInvoice } from '../invoicing.services';

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'MXN', 'CAD', 'AUD'];
const FALLBACK_TAX_RATES_BPS = [0, 400, 1_000, 2_100];

const today = () => new Date().toISOString().slice(0, 10);
function plusDays(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
const newLine = (taxRateBps = 2_100): InvoiceItemInput => ({ description: '', quantityMillis: 1_000, unitPriceMinor: 0, taxRateBps, discountRateBps: 0 });

function formatMoney(minor: number, currency: string) {
  try {
    return new Intl.NumberFormat(getDocumentLocale(), { style: 'currency', currency }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

function SectionTitle(props: { children?: string }) {
  return <h2 class="mb-3 text-[15px] font-semibold">{props.children}</h2>;
}

export function CreateInvoicePage() {
  const { t } = useI18n();
  const params = useParams();
  const navigate = useNavigate();
  const { returnHref } = useReturnHref(() => getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'invoices' }));

  const contactsQuery = useQuery(() => ({ queryKey: getContactsQueryKey({ organizationId: params.organizationId }), queryFn: () => fetchContacts({ organizationId: params.organizationId }) }));
  const profileQuery = useQuery(() => ({ queryKey: ['invoicing', params.organizationId, 'profile'], queryFn: () => fetchFiscalProfile({ organizationId: params.organizationId }) }));
  const brandingQuery = useQuery(() => ({ queryKey: ['invoicing', params.organizationId, 'branding'], queryFn: () => fetchInvoiceBranding({ organizationId: params.organizationId }) }));
  const productsQuery = useQuery(() => ({ queryKey: getProductsQueryKey({ organizationId: params.organizationId }), queryFn: () => fetchProducts({ organizationId: params.organizationId }) }));
  const taxesQuery = useQuery(() => ({ queryKey: ['invoicing', params.organizationId, 'tax-rates'], queryFn: () => fetchTaxRates({ organizationId: params.organizationId }) }));
  const seriesQuery = useQuery(() => ({ queryKey: ['invoicing', params.organizationId, 'series'], queryFn: () => fetchInvoiceSeries({ organizationId: params.organizationId }) }));
  const invoiceQuery = useQuery(() => ({
    queryKey: ['invoicing', params.organizationId, 'invoices', params.invoiceId],
    queryFn: () => fetchInvoice({ organizationId: params.organizationId, invoiceId: params.invoiceId }),
    enabled: Boolean(params.invoiceId),
  }));

  const [customerId, setCustomerId] = createSignal('');
  const [seriesId, setSeriesId] = createSignal('');
  const [salesRepresentativeId, setSalesRepresentativeId] = createSignal('');
  const [issueDate, setIssueDate] = createSignal(today());
  const [dueDate, setDueDate] = createSignal(plusDays(30));
  const [paymentMethod, setPaymentMethod] = createSignal<PaymentMethod | null>(null);
  const [currency, setCurrency] = createSignal('EUR');
  const [templateId, setTemplateId] = createSignal<InvoiceTemplateId>('minimal');
  const [withholdingRateBps, setWithholdingRateBps] = createSignal<number | null>(null);
  const [equivalenceSurcharge, setEquivalenceSurcharge] = createSignal(false);
  const [notes, setNotes] = createSignal('');
  const [items, setItems] = createSignal<InvoiceItemInput[]>([newLine()]);
  const [deliveryNotes, setDeliveryNotes] = createSignal<InvoiceDeliveryNote[]>([]);
  const [savedDeliveryNotes, setSavedDeliveryNotes] = createSignal<InvoiceDeliveryNote[]>([]);
  const [deliveryNotesAddedToItems, setDeliveryNotesAddedToItems] = createSignal<string[]>([]);
  const [isMoreDetailsOpen, setIsMoreDetailsOpen] = createSignal(false);
  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = createSignal(false);
  const [newCustomer, setNewCustomer] = createSignal(emptyContact({ isCustomer: true }));
  // The lines whose discount field is open: a line with a discount always shows it
  const [discountLines, setDiscountLines] = createSignal<number[]>([]);
  // The invoice just issued: the dialog then offers to send it or download it
  const [issuedInvoice, setIssuedInvoice] = createSignal<Invoice | null>(null);

  let loadedInvoiceId: string | undefined;
  createEffect(() => {
    const invoice = invoiceQuery.data?.invoice;
    if (!invoice || loadedInvoiceId === invoice.id) {
      return;
    }

    loadedInvoiceId = invoice.id;
    setCustomerId(invoice.customerId);
    setSeriesId(invoice.seriesId ?? '');
    setSalesRepresentativeId(invoice.salesRepresentativeId ?? '');
    setIssueDate(invoice.issueDate.toISOString().slice(0, 10));
    setDueDate(invoice.dueDate.toISOString().slice(0, 10));
    setPaymentMethod(invoice.paymentMethod ?? null);
    setCurrency(invoice.currency);
    setTemplateId(invoice.templateId);
    setWithholdingRateBps(invoice.withholdingRateBps);
    setEquivalenceSurcharge(invoice.equivalenceSurcharge ?? false);
    setNotes(invoice.notes ?? '');
    setItems(invoice.items?.map(item => ({
      productId: item.productId,
      description: item.description,
      quantityMillis: item.quantityMillis,
      unitPriceMinor: item.unitPriceMinor,
      taxRateBps: item.taxRateBps,
      discountRateBps: item.discountRateBps,
    })) ?? [newLine()]);
    setDeliveryNotes(invoice.deliveryNotes ?? []);
    setSavedDeliveryNotes(invoice.deliveryNotes ?? []);
    setDeliveryNotesAddedToItems((invoice.deliveryNotes ?? []).map(deliveryNote => deliveryNote.id));
  });

  // The customer price list: picking a product uses its price there and the list discount, else the catalog price
  const contactPricesQuery = useQuery(() => ({
    queryKey: getContactPricesQueryKey({ organizationId: params.organizationId, contactId: customerId() }),
    queryFn: () => fetchContactPrices({ organizationId: params.organizationId, contactId: customerId() }),
    enabled: customerId() !== '',
  }));
  const customerPriceList = () => (customerId() === '' ? null : contactPricesQuery.data?.priceList ?? null);
  const getProductPricing = (product: { id: string; unitPriceMinor: number }) => {
    const listPrice = contactPricesQuery.data?.prices.find(price => price.productId === product.id);
    return listPrice && customerPriceList()
      ? { unitPriceMinor: listPrice.priceMinor, discountRateBps: customerPriceList()!.discountRateBps }
      : { unitPriceMinor: product.unitPriceMinor, discountRateBps: 0 };
  };

  // A new invoice follows the customer: when it changes, the product lines take the prices of its price list
  createEffect(on(() => contactPricesQuery.data, (data) => {
    if (!data || params.invoiceId) {
      return;
    }
    const products = productsQuery.data?.products ?? [];
    setItems(current => current.map((item) => {
      const product = item.productId === null || item.productId === undefined ? undefined : products.find(candidate => candidate.id === item.productId);
      return product ? { ...item, ...getProductPricing(product) } : item;
    }));
  }, { defer: true }));

  // Untouched new invoices use the fiscal profile default withholding, an edited invoice keeps its own
  const effectiveWithholdingRateBps = () => withholdingRateBps() ?? profileQuery.data?.profile?.defaultWithholdingRateBps ?? 0;

  const defaultTaxRateBps = () => taxesQuery.data?.taxRates.find(tax => tax.isDefault)?.rateBps;
  createEffect(() => {
    const rateBps = defaultTaxRateBps();
    const [first] = items();
    if (rateBps !== undefined && items().length === 1 && first && first.description === '' && first.unitPriceMinor === 0 && first.taxRateBps !== rateBps) {
      setItems([newLine(rateBps)]);
    }
  });

  const taxRates = () => taxesQuery.data?.taxRates.length ? taxesQuery.data.taxRates : FALLBACK_TAX_RATES_BPS.map(rateBps => ({ id: String(rateBps), name: t('invoicing.editor.vat'), rateBps }));
  const customers = () => (contactsQuery.data?.contacts ?? []).filter(contact => contact.isCustomer);
  const salesRepresentatives = () => (contactsQuery.data?.contacts ?? []).filter(contact => contact.isSalesRepresentative);
  const selectedCustomer = () => customers().find(customer => customer.id === customerId());

  const selectedSeries = () => {
    const series = seriesQuery.data?.series ?? [];
    return series.find(item => item.id === seriesId()) ?? series.find(item => item.isDefault) ?? series[0];
  };
  const invoiceNumber = () => {
    const number = invoiceQuery.data?.invoice.number;
    if (number) {
      return number;
    }

    const series = selectedSeries();
    return series ? `${series.prefix}${String(series.nextNumber).padStart(series.padding, '0')}` : null;
  };

  const selectCustomer = (customer: Contact) => {
    if (customer.id !== customerId()) {
      setDeliveryNotes([]);
      setSavedDeliveryNotes([]);
      setDeliveryNotesAddedToItems([]);
    }
    setCustomerId(customer.id);
    // A retailer customer under the equivalence surcharge gets it by default, it can still be unchecked on this invoice
    setEquivalenceSurcharge(customer.equivalenceSurcharge ?? false);
    setCurrency(customer.currency);
    // A customer without payment terms takes the ones of the fiscal profile
    setDueDate(plusDays(customer.paymentTermsDays ?? profileQuery.data?.profile?.paymentTermsDays ?? 30));
  };

  const openNewCustomerDialog = (name: string) => {
    setNewCustomer(emptyContact({ isCustomer: true, name, currency: currency() }));
    setIsCustomerDialogOpen(true);
  };

  const createCustomerMutation = createMutation(() => ({
    mutationFn: () => createContact({ organizationId: params.organizationId, contact: newCustomer() }),
    onSuccess: async ({ contact }) => {
      await queryClient.invalidateQueries({ queryKey: getContactsQueryKey({ organizationId: params.organizationId }) });
      selectCustomer(contact);
      setIsCustomerDialogOpen(false);
      createToast({ type: 'success', message: t('invoicing.editor.customer.toast.created') });
    },
    onError: () => createToast({ type: 'error', message: t('invoicing.editor.customer.toast.error') }),
  }));

  const mutation = createMutation(() => ({
    mutationFn: async ({ issue }: { issue: boolean }) => {
      const draft: InvoiceDraftInput = {
        customerId: customerId(),
        seriesId: seriesId() || null,
        salesRepresentativeId: salesRepresentativeId() || null,
        issueDate: new Date(`${issueDate()}T00:00:00.000Z`),
        dueDate: new Date(`${dueDate()}T00:00:00.000Z`),
        paymentMethod: paymentMethod(),
        currency: currency(),
        templateId: templateId(),
        withholdingRateBps: effectiveWithholdingRateBps(),
        equivalenceSurcharge: equivalenceSurcharge(),
        notes: notes() || null,
        items: items(),
        deliveryNoteIds: deliveryNotes().map(deliveryNote => deliveryNote.id),
      };
      const { invoice } = params.invoiceId
        ? await updateInvoice({ organizationId: params.organizationId, invoiceId: params.invoiceId, invoice: draft })
        : await createInvoice({ organizationId: params.organizationId, invoice: draft });
      return issue ? issueInvoice({ organizationId: params.organizationId, invoiceId: invoice.id }) : { invoice };
    },
    onSuccess: ({ invoice }, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['invoicing', params.organizationId, 'invoices'] });
      if (variables.issue) {
        setIssuedInvoice(invoice);
        return;
      }
      createToast({ type: 'success', message: t('invoicing.editor.toast.draft-saved') });
      navigate(returnHref());
    },
    onError: () => createToast({ type: 'error', message: t('invoicing.editor.toast.error') }),
  }));

  const sendMutation = createMutation(() => ({
    mutationFn: (invoiceId: string) => sendInvoice({ organizationId: params.organizationId, invoiceId }),
    onSuccess: () => {
      createToast({ type: 'success', message: t('invoicing.invoices.toast.sent') });
      void queryClient.invalidateQueries({ queryKey: ['invoicing', params.organizationId, 'invoices'] });
      navigate(returnHref());
    },
    onError: () => createToast({ type: 'error', message: t('invoicing.invoices.toast.send-error') }),
  }));

  const downloadIssuedInvoice = async (invoice: Invoice) => {
    try {
      await downloadInvoicePdf({ organizationId: params.organizationId, invoiceId: invoice.id, filename: invoice.number ?? invoice.id });
    } catch {
      createToast({ type: 'error', message: t('invoicing.editor.issued.download-error') });
    }
  };

  const updateItem = (index: number, patch: Partial<InvoiceItemInput>) => setItems(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const applyProduct = (index: number, name: string, product: InvoicingProduct | null) => {
    updateItem(index, product
      ? { productId: product.id, description: product.name, taxRateBps: product.taxRateBps, ...getProductPricing(product) }
      : { productId: null, description: name });
  };

  const createLineProduct = async (index: number, name: string) => {
    const line = items()[index] ?? newLine(defaultTaxRateBps());
    try {
      const { product } = await createProduct({
        organizationId: params.organizationId,
        product: { name, description: null, unit: 'unidad', unitPriceMinor: line.unitPriceMinor, currency: currency(), taxRateBps: line.taxRateBps, icon: null, iconColor: null, contactId: null, imageDocumentId: null },
      });
      void queryClient.invalidateQueries({ queryKey: getProductsQueryKey({ organizationId: params.organizationId }) });
      createToast({ type: 'success', message: t('invoicing.products.toast.saved') });
      return product;
    } catch (error) {
      createToast({ type: 'error', message: t('invoicing.products.toast.error') });
      throw error;
    }
  };

  const addDeliveryNotes = (notesToAdd: DeliveryNote[]) => {
    setDeliveryNotes(current => [
      ...current,
      ...notesToAdd
        .filter(note => !current.some(existing => existing.id === note.id))
        .map(({ id, number, date }) => ({ id, number, date })),
    ]);

    const notesWithNewItems = notesToAdd.filter(note => !deliveryNotesAddedToItems().includes(note.id));
    setDeliveryNotesAddedToItems(current => [...new Set([...current, ...notesToAdd.map(note => note.id)])]);
    const products = productsQuery.data?.products ?? [];
    const addedLines = notesWithNewItems.flatMap(note => note.items ?? []).map((item): InvoiceItemInput => {
      const product = item.productId ? products.find(candidate => candidate.id === item.productId) : undefined;
      return {
        productId: product?.id ?? null,
        description: product?.name ?? item.description,
        quantityMillis: item.quantityMillis,
        taxRateBps: product?.taxRateBps ?? defaultTaxRateBps() ?? 2_100,
        ...(product ? getProductPricing(product) : { unitPriceMinor: 0, discountRateBps: 0 }),
      };
    });

    setItems((current) => {
      const next = current.length === 1 && current[0]?.description === '' ? [] : [...current];
      for (const line of addedLines) {
        const index = next.findIndex(existing => existing.productId === line.productId
          && existing.description === line.description
          && existing.unitPriceMinor === line.unitPriceMinor
          && existing.taxRateBps === line.taxRateBps
          && existing.discountRateBps === line.discountRateBps);
        if (index === -1) {
          next.push(line);
        } else {
          next[index] = { ...next[index]!, quantityMillis: next[index]!.quantityMillis + line.quantityMillis };
        }
      }
      return next.length > 0 ? next : [newLine(defaultTaxRateBps())];
    });
  };

  const canSubmit = () => Boolean((!params.invoiceId || !invoiceQuery.isLoading) && customerId() && items().length && items().every(item => item.description.trim() && item.quantityMillis > 0));
  const canIssue = () => canSubmit() && Boolean(profileQuery.data?.profile);

  return (
    <div class="w-full px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8">
      <div class="grid w-full gap-10 lg:(grid-cols-[minmax(0,460px)_minmax(0,560px)] justify-center) xl:gap-14">
        {/* Form */}
        <form class="min-w-0 space-y-10" onSubmit={event => event.preventDefault()}>
          <div class="flex items-center justify-between gap-4">
            <div class="flex min-w-0 items-center gap-2.5">
              <Button as={A} href={returnHref()} variant="ghost" size="icon-sm" class="-ml-2 text-muted-foreground" aria-label={t('invoicing.editor.back')}>
                <div class="i-tabler-arrow-left size-4" />
              </Button>
              <h1 class="truncate text-[28px] font-semibold tracking-tight">{invoiceNumber() ?? t('invoicing.editor.new-title')}</h1>
              <Badge variant="secondary">{t('invoicing.status.draft')}</Badge>
            </div>
            <SimpleSelect
              aria-label={t('invoicing.common.currency')}
              class="shrink-0"
              triggerClass="h-8 w-auto gap-2 rounded-full border-transparent bg-muted px-3 font-medium shadow-none hover:bg-accent"
              value={currency()}
              onChange={setCurrency}
              options={(CURRENCIES.includes(currency()) ? CURRENCIES : [currency(), ...CURRENCIES]).map(code => ({ value: code, label: code }))}
            />
          </div>

          <Show when={profileQuery.data && !profileQuery.data.profile}>
            <div class="flex items-center justify-between gap-4 rounded-xl border border-warning/30 bg-warning/5 p-4">
              <div>
                <div class="text-sm font-medium">{t('invoicing.editor.profile-missing.title')}</div>
                <div class="text-sm text-muted-foreground">{t('invoicing.editor.profile-missing.description')}</div>
              </div>
              <Button as={A} size="sm" variant="outline" href={getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'settingsFiscalProfile' })}>{t('invoicing.editor.profile-missing.action')}</Button>
            </div>
          </Show>

          {/* Customer */}
          <section>
            <SectionTitle>{t('invoicing.editor.customer')}</SectionTitle>
            <Show
              when={selectedCustomer()}
              fallback={<CustomerSelector customers={customers()} onSelect={selectCustomer} onCreate={openNewCustomerDialog} />}
            >
              {customer => (
                <div class="flex items-start gap-3">
                  <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                    {customer().name.trim().charAt(0).toUpperCase()}
                  </span>
                  <div class="min-w-0 flex-1 text-sm">
                    <div class="truncate font-medium">{customer().name}</div>
                    <div class="truncate text-xs text-muted-foreground">{customer().email || t('invoicing.editor.customer.no-email')}</div>
                    <Show when={customerSummary(customer())}>{summary => <div class="truncate text-xs text-muted-foreground">{summary()}</div>}</Show>
                    <Show when={customerPriceList()}>
                      {priceList => (
                        <div class="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-px text-[11px] font-medium text-primary">
                          <div class="i-tabler-tags size-3" />
                          {priceList().discountRateBps > 0 ? t('pricing.invoice.price-list-discount', { name: priceList().name, discount: priceList().discountRateBps / 100 }) : t('pricing.invoice.price-list', { name: priceList().name })}
                        </div>
                      )}
                    </Show>
                  </div>
                  <Button type="button" variant="secondary" size="sm" class="h-7 rounded-full" onClick={() => setCustomerId('')}>{t('invoicing.editor.customer.change')}</Button>
                </div>
              )}
            </Show>
          </section>

          {/* Items */}
          <section>
            <SectionTitle>{t('invoicing.editor.items')}</SectionTitle>
            <Show when={customerId()}>
              <InvoiceDeliveryNotesField
                organizationId={params.organizationId}
                customerId={customerId()}
                deliveryNotes={deliveryNotes()}
                savedDeliveryNotes={savedDeliveryNotes()}
                onAdd={addDeliveryNotes}
                onRemove={deliveryNoteId => setDeliveryNotes(current => current.filter(note => note.id !== deliveryNoteId))}
              />
            </Show>
            <div class="divide-y border-y">
              <Index each={items()}>
                {(item, index) => (
                  <div class="py-5">
                    <div class="mb-4 flex items-center justify-between">
                      <h3 class="text-sm font-semibold">{items().length > 1 ? t('invoicing.editor.item-number', { number: index + 1 }) : t('invoicing.editor.item')}</h3>
                      <Show when={items().length > 1}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          class="-mr-2 size-7 text-muted-foreground"
                          aria-label={t('invoicing.editor.item.remove')}
                          onClick={() => {
                            setItems(current => current.filter((_, itemIndex) => itemIndex !== index));
                            setDiscountLines(current => current.filter(line => line !== index).map(line => (line > index ? line - 1 : line)));
                          }}
                        >
                          <div class="i-tabler-trash size-4" />
                        </Button>
                      </Show>
                    </div>

                    <div class="space-y-4">
                      <FormField label={t('invoicing.editor.item.product')}>
                        <ProductSelector
                          products={productsQuery.data?.products ?? []}
                          value={item().description}
                          selectedProductId={item().productId}
                          onChange={(name, product) => applyProduct(index, name, product)}
                          onCreate={name => createLineProduct(index, name)}
                        />
                      </FormField>

                      <div class="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-end gap-2">
                        <FormField label={t('invoicing.editor.item.quantity')}>
                          <TextField class="no-spinner h-10" type="number" min="0.001" step="0.001" value={item().quantityMillis / 1_000} onInput={event => updateItem(index, { quantityMillis: Math.round(Number(event.currentTarget.value) * 1_000) })} />
                        </FormField>
                        <span class="pb-2.5 text-sm text-muted-foreground">×</span>
                        <FormField label={t('invoicing.editor.item.price')}>
                          <div class="relative">
                            <TextField class="no-spinner h-10 pr-11" type="number" min="0" step="0.01" value={item().unitPriceMinor / 100} onInput={event => updateItem(index, { unitPriceMinor: Math.round(Number(event.currentTarget.value) * 100) })} />
                            <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{currency()}</span>
                          </div>
                        </FormField>
                        <span class="pb-2.5 text-sm text-muted-foreground">=</span>
                        <div class="text-sm">
                          <div class="mb-1.5 font-medium">{t('invoicing.editor.item.total')}</div>
                          <div class="flex h-10 items-center truncate tabular-nums">{formatMoney(getLineNetMinor(item()), currency())}</div>
                        </div>
                      </div>

                      <div class="flex items-center justify-between gap-4 pt-1">
                        <div>
                          <div class="text-sm font-medium">{t('invoicing.editor.item.tax')}</div>
                          <div class="text-xs text-muted-foreground">{t('invoicing.editor.item.tax.description')}</div>
                        </div>
                        <SimpleSelect
                          aria-label={t('invoicing.editor.item.tax-rate')}
                          triggerClass="h-8 w-auto gap-2 rounded-full border-transparent bg-muted px-3 font-medium shadow-none"
                          value={String(item().taxRateBps)}
                          onChange={value => updateItem(index, { taxRateBps: Number(value) })}
                          options={taxRates().map(tax => ({ value: String(tax.rateBps), label: `${tax.name} · ${tax.rateBps / 100}%` }))}
                        />
                      </div>

                      <Show
                        when={item().discountRateBps > 0 || discountLines().includes(index)}
                        fallback={(
                          <button type="button" class="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground" onClick={() => setDiscountLines(current => [...current, index])}>
                            <div class="i-tabler-discount size-3.5" />
                            {t('invoicing.editor.item.discount.add')}
                          </button>
                        )}
                      >
                        <div class="flex items-center justify-between gap-4">
                          <div class="text-sm font-medium">{t('invoicing.editor.item.discount')}</div>
                          <div class="flex items-center gap-1">
                            <div class="relative w-24">
                              <TextField
                                class="no-spinner h-8 pr-7 text-right"
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                aria-label={t('invoicing.editor.item.discount')}
                                value={item().discountRateBps / 100}
                                onInput={event => updateItem(index, { discountRateBps: Math.min(10_000, Math.max(0, Math.round(Number(event.currentTarget.value) * 100))) })}
                              />
                              <span class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              class="size-7 text-muted-foreground"
                              aria-label={t('invoicing.editor.item.discount.remove')}
                              onClick={() => {
                                updateItem(index, { discountRateBps: 0 });
                                setDiscountLines(current => current.filter(line => line !== index));
                              }}
                            >
                              <div class="i-tabler-x size-3.5" />
                            </Button>
                          </div>
                        </div>
                      </Show>
                    </div>
                  </div>
                )}
              </Index>

              <button
                type="button"
                class="flex w-full items-center gap-3 py-3.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setItems(current => [...current, newLine(defaultTaxRateBps())])}
              >
                <span class="flex size-8 items-center justify-center rounded-full bg-muted">
                  <div class="i-tabler-plus size-4" />
                </span>
                {t('invoicing.editor.item.add')}
              </button>
            </div>
          </section>

          {/* Details */}
          <section>
            <SectionTitle>{t('invoicing.editor.details')}</SectionTitle>
            <div class="grid gap-4 sm:grid-cols-2">
              <FormField label={t('invoicing.editor.issue-date')}><TextField class="h-10" type="date" value={issueDate()} onInput={event => setIssueDate(event.currentTarget.value)} /></FormField>
              <FormField label={t('invoicing.editor.due-date')}><TextField class="h-10" type="date" value={dueDate()} onInput={event => setDueDate(event.currentTarget.value)} /></FormField>
            </div>

            {/* The rest of the details keep sensible defaults, so they stay folded until needed */}
            <div class="mt-5 border-y">
              <button
                type="button"
                class="flex w-full items-center gap-3 py-3 text-left"
                aria-expanded={isMoreDetailsOpen()}
                onClick={() => setIsMoreDetailsOpen(open => !open)}
              >
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-medium">{t('invoicing.editor.more-details')}</div>
                  <Show when={!isMoreDetailsOpen()}>
                    <div class="truncate text-xs text-muted-foreground">{t('invoicing.editor.more-details.description')}</div>
                  </Show>
                </div>
                <div class={cn('i-tabler-chevron-down size-4 shrink-0 text-muted-foreground transition-transform', isMoreDetailsOpen() && 'rotate-180')} />
              </button>
              <Show when={isMoreDetailsOpen()}>
                <div class="grid gap-4 pb-5 pt-1 sm:grid-cols-2">
                  <FormField label={t('due-dates.schedule.method')}>
                    <SimpleSelect
                      triggerClass="h-10"
                      value={paymentMethod() ?? ''}
                      onChange={value => setPaymentMethod(value === '' ? null : value as PaymentMethod)}
                      options={[{ value: '', label: t('due-dates.schedule.method.none') }, ...PAYMENT_METHODS.map(method => ({ value: method, label: t(PAYMENT_METHOD_LABEL_I18N_KEYS[method]) }))]}
                    />
                  </FormField>
                  <FormField label={t('invoicing.editor.series')}>
                    <SimpleSelect
                      triggerClass="h-10"
                      value={seriesId()}
                      onChange={setSeriesId}
                      options={[
                        { value: '', label: t('invoicing.editor.series.default') },
                        ...(seriesQuery.data?.series ?? []).map(series => ({ value: series.id, label: `${series.name} · ${series.prefix}` })),
                      ]}
                    />
                  </FormField>
                  <FormField label={t('invoicing.editor.sales-representative')}>
                    <SimpleSelect
                      triggerClass="h-10"
                      value={salesRepresentativeId()}
                      onChange={setSalesRepresentativeId}
                      options={[
                        { value: '', label: t('invoicing.editor.sales-representative.none') },
                        ...salesRepresentatives().map(person => ({ value: person.id, label: person.name })),
                      ]}
                    />
                  </FormField>
                  <FormField label={t('invoicing.common.pdf-style')}>
                    <SimpleSelect
                      triggerClass="h-10"
                      value={templateId()}
                      onChange={value => setTemplateId(value as InvoiceTemplateId)}
                      options={[
                        { value: 'minimal', label: t('invoicing.common.pdf-style.minimal') },
                        { value: 'classic', label: t('invoicing.common.pdf-style.classic') },
                      ]}
                    />
                  </FormField>
                  <FormField label={t('invoicing.editor.withholding')}>
                    <SimpleSelect
                      triggerClass="h-10"
                      value={String(effectiveWithholdingRateBps())}
                      onChange={value => setWithholdingRateBps(Number(value))}
                      options={[...new Set([...WITHHOLDING_RATES_BPS, effectiveWithholdingRateBps()])].toSorted((a, b) => a - b).map(rateBps => ({
                        value: String(rateBps),
                        label: rateBps === 0 ? t('invoicing.editor.withholding.none') : `${rateBps / 100} %`,
                      }))}
                    />
                  </FormField>
                  <div class="sm:col-span-2">
                    <SimpleCheckbox checked={equivalenceSurcharge()} onChange={setEquivalenceSurcharge} label={t('invoicing.editor.equivalence-surcharge')} />
                    <p class="mt-1 pl-6 text-xs text-muted-foreground">{t('invoicing.editor.equivalence-surcharge.description')}</p>
                  </div>
                  <FormField label={t('invoicing.editor.notes')} class="sm:col-span-2">
                    <TextArea value={notes()} placeholder={t('invoicing.editor.notes.placeholder')} onInput={event => setNotes(event.currentTarget.value)} />
                  </FormField>
                </div>
              </Show>
            </div>
          </section>
        </form>

        {/* Preview */}
        <aside class="mx-auto w-full min-w-0 max-w-[620px] lg:(sticky top-6 self-start max-w-[min(620px,calc((100dvh-10rem)*210/297))])">
          <div class="mb-4 flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" class="rounded-full" disabled={!canSubmit()} isLoading={mutation.isPending && !mutation.variables?.issue} onClick={() => mutation.mutate({ issue: false })}>
              {t('invoicing.editor.save-draft')}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              class="rounded-full"
              disabled={!canIssue()}
              title={canIssue() ? undefined : t('invoicing.editor.issue-requirements')}
              isLoading={mutation.isPending && mutation.variables?.issue}
              onClick={() => mutation.mutate({ issue: true })}
            >
              {t('invoicing.editor.issue')}
              <div class="i-tabler-check size-3.5" />
            </Button>
          </div>
          <InvoicePreview
            number={invoiceNumber() ?? t('invoicing.status.draft')}
            issueDate={issueDate()}
            dueDate={dueDate()}
            currency={currency()}
            items={items()}
            withholdingRateBps={effectiveWithholdingRateBps()}
            equivalenceSurcharge={equivalenceSurcharge()}
            notes={notes()}
            customer={selectedCustomer()}
            profile={profileQuery.data?.profile}
            branding={brandingQuery.data?.branding}
          />
        </aside>
      </div>

      <Dialog
        open={issuedInvoice() !== null}
        onOpenChange={(open) => {
          if (!open) {
            navigate(returnHref());
          }
        }}
      >
        <DialogContent class="max-w-md">
          <Show when={issuedInvoice()}>
            {invoice => (
              <>
                <DialogHeader>
                  <DialogTitle>{t('invoicing.editor.issued.title', { number: invoice().number ?? '' })}</DialogTitle>
                  <DialogDescription>{t('invoicing.editor.issued.description')}</DialogDescription>
                </DialogHeader>
                <div class="flex flex-col gap-2">
                  <Button
                    type="button"
                    class="justify-start gap-2"
                    disabled={!selectedCustomer()?.email}
                    isLoading={sendMutation.isPending}
                    onClick={() => sendMutation.mutate(invoice().id)}
                  >
                    <div class="i-tabler-send size-4" />
                    {selectedCustomer()?.email ? t('invoicing.editor.issued.send', { email: selectedCustomer()!.email! }) : t('invoicing.editor.issued.no-email')}
                  </Button>
                  <Button type="button" variant="secondary" class="justify-start gap-2" onClick={() => void downloadIssuedInvoice(invoice())}>
                    <div class="i-tabler-download size-4" />
                    {t('invoicing.editor.issued.download')}
                  </Button>
                  <Button type="button" variant="ghost" class="text-muted-foreground" onClick={() => navigate(returnHref())}>
                    {t('invoicing.editor.issued.done')}
                  </Button>
                </div>
              </>
            )}
          </Show>
        </DialogContent>
      </Dialog>

      <Dialog open={isCustomerDialogOpen()} onOpenChange={setIsCustomerDialogOpen}>
        <DialogContent class="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('invoicing.editor.customer.dialog.title')}</DialogTitle>
            <DialogDescription>{t('invoicing.editor.customer.dialog.description')}</DialogDescription>
          </DialogHeader>
          <form
            class="grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (newCustomer().name.trim()) {
                createCustomerMutation.mutate();
              }
            }}
          >
            <ContactFormFields value={newCustomer()} onChange={setNewCustomer} autofocus />
            <SaveButton loading={createCustomerMutation.isPending} editing={false} onCancel={() => setIsCustomerDialogOpen(false)} />
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
