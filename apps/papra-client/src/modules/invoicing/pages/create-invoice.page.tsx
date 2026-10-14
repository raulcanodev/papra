import type { InvoiceDraftInput, InvoiceItemInput, InvoiceTemplateId, InvoicingCustomer } from '../invoicing.types';
import { A, useNavigate, useParams } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createEffect, createMemo, createSignal, For, Index, Show } from 'solid-js';
import { getDocumentLocale } from '@/modules/i18n/document-locale';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { queryClient } from '@/modules/shared/query/query-client';
import { Badge } from '@/modules/ui/components/badge';
import { Button } from '@/modules/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/modules/ui/components/dialog';
import { SimpleSelect } from '@/modules/ui/components/simple-select';
import { createToast } from '@/modules/ui/components/sonner';
import { TextArea } from '@/modules/ui/components/textarea';
import { TextField } from '@/modules/ui/components/textfield';
import { getOrganizationRouteHref } from '@/modules/ui/navigation/organization-navigation';
import { FormField, SaveButton } from '../components/catalog-page';
import { CustomerFormFields, emptyCustomer } from '../components/customer-form';
import { getLineNetMinor, InvoicePreview } from '../components/invoice-preview';
import { createCustomer, createInvoice, fetchCustomers, fetchFiscalProfile, fetchInvoice, fetchInvoiceBranding, fetchInvoiceSeries, fetchProducts, fetchSalesRepresentatives, fetchTaxRates, sendInvoice, updateInvoice } from '../invoicing.services';

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

function customerSummary(customer: InvoicingCustomer) {
  return [customer.addressLine1, [customer.postalCode, customer.city].filter(Boolean).join(' '), customer.country].filter(Boolean).join(', ');
}

function SectionTitle(props: { children?: string }) {
  return <h2 class="mb-3 text-[15px] font-semibold">{props.children}</h2>;
}

export function CreateInvoicePage() {
  const { t } = useI18n();
  const params = useParams();
  const navigate = useNavigate();
  const invoicesHref = () => getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'invoices' });

  const customersQuery = useQuery(() => ({ queryKey: ['invoicing', params.organizationId, 'customers'], queryFn: () => fetchCustomers({ organizationId: params.organizationId }) }));
  const profileQuery = useQuery(() => ({ queryKey: ['invoicing', params.organizationId, 'profile'], queryFn: () => fetchFiscalProfile({ organizationId: params.organizationId }) }));
  const brandingQuery = useQuery(() => ({ queryKey: ['invoicing', params.organizationId, 'branding'], queryFn: () => fetchInvoiceBranding({ organizationId: params.organizationId }) }));
  const productsQuery = useQuery(() => ({ queryKey: ['invoicing', params.organizationId, 'products'], queryFn: () => fetchProducts({ organizationId: params.organizationId }) }));
  const taxesQuery = useQuery(() => ({ queryKey: ['invoicing', params.organizationId, 'tax-rates'], queryFn: () => fetchTaxRates({ organizationId: params.organizationId }) }));
  const seriesQuery = useQuery(() => ({ queryKey: ['invoicing', params.organizationId, 'series'], queryFn: () => fetchInvoiceSeries({ organizationId: params.organizationId }) }));
  const representativesQuery = useQuery(() => ({ queryKey: ['invoicing', params.organizationId, 'sales-representatives'], queryFn: () => fetchSalesRepresentatives({ organizationId: params.organizationId }) }));
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
  const [currency, setCurrency] = createSignal('EUR');
  const [templateId, setTemplateId] = createSignal<InvoiceTemplateId>('minimal');
  const [notes, setNotes] = createSignal('');
  const [items, setItems] = createSignal<InvoiceItemInput[]>([newLine()]);
  const [customerSearch, setCustomerSearch] = createSignal('');
  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = createSignal(false);
  const [newCustomer, setNewCustomer] = createSignal(emptyCustomer());

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
    setCurrency(invoice.currency);
    setTemplateId(invoice.templateId);
    setNotes(invoice.notes ?? '');
    setItems(invoice.items?.map(item => ({
      productId: item.productId,
      description: item.description,
      quantityMillis: item.quantityMillis,
      unitPriceMinor: item.unitPriceMinor,
      taxRateBps: item.taxRateBps,
      discountRateBps: item.discountRateBps,
    })) ?? [newLine()]);
  });

  const defaultTaxRateBps = () => taxesQuery.data?.taxRates.find(tax => tax.isDefault)?.rateBps;
  createEffect(() => {
    const rateBps = defaultTaxRateBps();
    const [first] = items();
    if (rateBps !== undefined && items().length === 1 && first && first.description === '' && first.unitPriceMinor === 0 && first.taxRateBps !== rateBps) {
      setItems([newLine(rateBps)]);
    }
  });

  const taxRates = () => taxesQuery.data?.taxRates.length ? taxesQuery.data.taxRates : FALLBACK_TAX_RATES_BPS.map(rateBps => ({ id: String(rateBps), name: t('invoicing.editor.vat'), rateBps }));
  const customers = () => customersQuery.data?.customers ?? [];
  const selectedCustomer = () => customers().find(customer => customer.id === customerId());
  const filteredCustomers = createMemo(() => {
    const search = customerSearch().trim().toLowerCase();
    const matches = search
      ? customers().filter(customer => `${customer.name} ${customer.email ?? ''} ${customer.taxId ?? ''}`.toLowerCase().includes(search))
      : [...customers()].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
    return matches.slice(0, 4);
  });

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

  const selectCustomer = (customer: InvoicingCustomer) => {
    setCustomerId(customer.id);
    setCurrency(customer.currency);
    setDueDate(plusDays(customer.paymentTermsDays));
    setCustomerSearch('');
  };

  const openNewCustomerDialog = () => {
    setNewCustomer({ ...emptyCustomer(), name: customerSearch().trim(), currency: currency() });
    setIsCustomerDialogOpen(true);
  };

  const createCustomerMutation = createMutation(() => ({
    mutationFn: () => createCustomer({ organizationId: params.organizationId, customer: newCustomer() }),
    onSuccess: async ({ customer }) => {
      await queryClient.invalidateQueries({ queryKey: ['invoicing', params.organizationId, 'customers'] });
      selectCustomer(customer);
      setIsCustomerDialogOpen(false);
      createToast({ type: 'success', message: t('invoicing.editor.customer.toast.created') });
    },
    onError: () => createToast({ type: 'error', message: t('invoicing.editor.customer.toast.error') }),
  }));

  const mutation = createMutation(() => ({
    mutationFn: async ({ send }: { send: boolean }) => {
      const draft: InvoiceDraftInput = {
        customerId: customerId(),
        seriesId: seriesId() || null,
        salesRepresentativeId: salesRepresentativeId() || null,
        issueDate: new Date(`${issueDate()}T00:00:00.000Z`),
        dueDate: new Date(`${dueDate()}T00:00:00.000Z`),
        currency: currency(),
        templateId: templateId(),
        notes: notes() || null,
        items: items(),
      };
      const { invoice } = params.invoiceId
        ? await updateInvoice({ organizationId: params.organizationId, invoiceId: params.invoiceId, invoice: draft })
        : await createInvoice({ organizationId: params.organizationId, invoice: draft });
      return send ? sendInvoice({ organizationId: params.organizationId, invoiceId: invoice.id }) : { invoice };
    },
    onSuccess: (_, variables) => {
      createToast({ type: 'success', message: variables.send ? t('invoicing.invoices.toast.sent') : t('invoicing.editor.toast.draft-saved') });
      navigate(invoicesHref());
    },
    onError: () => createToast({ type: 'error', message: t('invoicing.editor.toast.error') }),
  }));

  const updateItem = (index: number, patch: Partial<InvoiceItemInput>) => setItems(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const applyProductByName = (index: number, name: string) => {
    const product = productsQuery.data?.products.find(item => item.name === name);
    updateItem(index, product
      ? { productId: product.id, description: product.name, unitPriceMinor: product.unitPriceMinor, taxRateBps: product.taxRateBps }
      : { productId: null, description: name });
  };

  const canSubmit = () => Boolean((!params.invoiceId || !invoiceQuery.isLoading) && customerId() && items().length && items().every(item => item.description.trim() && item.quantityMillis > 0));
  const canSend = () => canSubmit() && Boolean(profileQuery.data?.profile) && Boolean(selectedCustomer()?.email);

  return (
    <div class="w-full px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8">
      <div class="grid w-full gap-10 lg:(grid-cols-[minmax(0,460px)_minmax(0,560px)] justify-center) xl:gap-14">
        {/* Form */}
        <form class="min-w-0 space-y-10" onSubmit={event => event.preventDefault()}>
          <div class="flex items-center justify-between gap-4">
            <div class="flex min-w-0 items-center gap-2.5">
              <Button as={A} href={invoicesHref()} variant="ghost" size="icon-sm" class="-ml-2 text-muted-foreground" aria-label={t('invoicing.editor.back')}>
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
              fallback={(
                <div class="space-y-3">
                  <div class="relative">
                    <div class="i-tabler-search pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <TextField
                      class="h-10 pl-9"
                      placeholder={t('invoicing.editor.customer.search')}
                      value={customerSearch()}
                      onInput={event => setCustomerSearch(event.currentTarget.value)}
                    />
                  </div>

                  <Show when={filteredCustomers().length > 0}>
                    <p class="pt-1 text-xs font-medium text-muted-foreground">{customerSearch().trim() ? t('invoicing.editor.customer.results') : t('invoicing.editor.customer.recents')}</p>
                  </Show>

                  <div class="space-y-2">
                    <For each={filteredCustomers()}>
                      {customer => (
                        <button
                          type="button"
                          class="group flex w-full items-center gap-3 rounded-xl border border-border/80 bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent/60"
                          onClick={() => selectCustomer(customer)}
                        >
                          <div class="min-w-0 flex-1">
                            <div class="truncate text-sm font-medium">{customer.name}</div>
                            <Show when={customer.email}>{email => <div class="truncate text-xs text-muted-foreground">{email()}</div>}</Show>
                            <Show when={customerSummary(customer)}>{summary => <div class="truncate text-xs text-muted-foreground">{summary()}</div>}</Show>
                          </div>
                          <span class="shrink-0 rounded-full bg-card px-3 py-1 text-xs font-medium shadow-xs transition-colors group-hover:bg-background">{t('invoicing.editor.customer.select')}</span>
                        </button>
                      )}
                    </For>

                    <button
                      type="button"
                      class="flex w-full items-center gap-3 rounded-xl border border-dashed px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:(border-foreground/30 text-foreground)"
                      onClick={openNewCustomerDialog}
                    >
                      <span class="flex size-7 items-center justify-center rounded-full bg-muted">
                        <div class="i-tabler-user-plus size-4" />
                      </span>
                      {customerSearch().trim() ? t('invoicing.editor.customer.add-named', { name: customerSearch().trim() }) : t('invoicing.editor.customer.add')}
                    </button>
                  </div>
                </div>
              )}
            >
              {customer => (
                <div class="flex items-start gap-3 rounded-xl border border-border/80 bg-card p-4 shadow-xs dark:shadow-none">
                  <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                    {customer().name.trim().charAt(0).toUpperCase()}
                  </span>
                  <div class="min-w-0 flex-1 text-sm">
                    <div class="truncate font-medium">{customer().name}</div>
                    <div class="truncate text-xs text-muted-foreground">{customer().email || t('invoicing.editor.customer.no-email')}</div>
                    <Show when={customerSummary(customer())}>{summary => <div class="truncate text-xs text-muted-foreground">{summary()}</div>}</Show>
                  </div>
                  <Button type="button" variant="secondary" size="sm" class="h-7 rounded-full" onClick={() => setCustomerId('')}>{t('invoicing.editor.customer.change')}</Button>
                </div>
              )}
            </Show>
          </section>

          {/* Items */}
          <section>
            <SectionTitle>{t('invoicing.editor.items')}</SectionTitle>
            <datalist id="invoice-products">
              <For each={productsQuery.data?.products}>{product => <option value={product.name} />}</For>
            </datalist>

            <div class="space-y-3">
              <Index each={items()}>
                {(item, index) => (
                  <div class="rounded-xl border border-border/80 bg-card p-5 shadow-xs dark:shadow-none">
                    <div class="mb-4 flex items-center justify-between">
                      <h3 class="text-sm font-semibold">{items().length > 1 ? t('invoicing.editor.item-number', { number: index + 1 }) : t('invoicing.editor.item')}</h3>
                      <Show when={items().length > 1}>
                        <Button type="button" variant="ghost" size="icon-sm" class="-mr-2 size-7 text-muted-foreground" aria-label={t('invoicing.editor.item.remove')} onClick={() => setItems(current => current.filter((_, itemIndex) => itemIndex !== index))}>
                          <div class="i-tabler-trash size-4" />
                        </Button>
                      </Show>
                    </div>

                    <div class="space-y-4">
                      <FormField label={t('invoicing.editor.item.product')}>
                        <TextField
                          class="h-10"
                          list="invoice-products"
                          value={item().description}
                          onInput={event => applyProductByName(index, event.currentTarget.value)}
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
                    </div>
                  </div>
                )}
              </Index>

              <button
                type="button"
                class="flex w-full items-center gap-3 rounded-xl border border-dashed bg-muted/30 px-4 py-3.5 text-sm text-muted-foreground transition-colors hover:(border-foreground/30 text-foreground)"
                onClick={() => setItems(current => [...current, newLine(defaultTaxRateBps())])}
              >
                <span class="flex size-8 items-center justify-center rounded-full bg-card shadow-xs">
                  <div class="i-tabler-list-details size-4" />
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
                    ...(representativesQuery.data?.salesRepresentatives ?? []).map(person => ({ value: person.id, label: person.name })),
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
              <FormField label={t('invoicing.editor.notes')} class="sm:col-span-2">
                <TextArea value={notes()} placeholder={t('invoicing.editor.notes.placeholder')} onInput={event => setNotes(event.currentTarget.value)} />
              </FormField>
            </div>
          </section>
        </form>

        {/* Preview */}
        <aside class="mx-auto w-full min-w-0 max-w-[620px] lg:(sticky top-6 self-start max-w-[min(620px,calc((100dvh-10rem)*210/297))])">
          <div class="mb-4 flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" class="rounded-full" disabled={!canSubmit()} isLoading={mutation.isPending && !mutation.variables?.send} onClick={() => mutation.mutate({ send: false })}>
              {t('invoicing.editor.save-draft')}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              class="rounded-full"
              disabled={!canSend()}
              title={canSend() ? undefined : t('invoicing.editor.send-requirements')}
              isLoading={mutation.isPending && mutation.variables?.send}
              onClick={() => mutation.mutate({ send: true })}
            >
              {t('invoicing.editor.issue-and-send')}
              <div class="i-tabler-send size-3.5" />
            </Button>
          </div>
          <InvoicePreview
            number={invoiceNumber() ?? t('invoicing.status.draft')}
            issueDate={issueDate()}
            dueDate={dueDate()}
            currency={currency()}
            items={items()}
            notes={notes()}
            customer={selectedCustomer()}
            profile={profileQuery.data?.profile}
            branding={brandingQuery.data?.branding}
          />
        </aside>
      </div>

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
            <CustomerFormFields value={newCustomer()} onChange={setNewCustomer} autofocus />
            <SaveButton loading={createCustomerMutation.isPending} editing={false} onCancel={() => setIsCustomerDialogOpen(false)} />
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
