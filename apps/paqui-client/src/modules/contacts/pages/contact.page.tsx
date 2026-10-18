import type { TranslationKeys } from '@/modules/i18n/locales.types';
import type { InvoiceStatus, InvoicingProduct } from '@/modules/invoicing/invoicing.types';
import { A, useNavigate, useParams, useSearchParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { ContactDeliveryNotes } from '@/modules/delivery-notes/components/contact-delivery-notes';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { CatalogCell, CatalogRow, CatalogTable } from '@/modules/invoicing/components/catalog-page';
import { getProductsQueryKey, ProductForm } from '@/modules/invoicing/components/product-form';
import { ProductsTable } from '@/modules/invoicing/components/products-table';
import { getInvoicePayableMinor } from '@/modules/invoicing/invoicing.models';
import { deleteProduct, fetchInvoices, fetchProducts } from '@/modules/invoicing/invoicing.services';
import { ContactPriceListField, getContactPricesQueryKey } from '@/modules/pricing/components/contact-price-list-field';
import { PriceListShareMenu } from '@/modules/pricing/components/price-list-share-menu';
import { fetchContactPrices } from '@/modules/pricing/pricing.services';
import { ProductScannerDialog } from '@/modules/product-scanner/components/product-scanner-dialog';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { Badge } from '@/modules/ui/components/badge';
import { Button } from '@/modules/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/modules/ui/components/dialog';
import { EntityIcon } from '@/modules/ui/components/entity-icon';
import { RowActions } from '@/modules/ui/components/row-actions';
import { createToast } from '@/modules/ui/components/sonner';
import { Tabs, TabsContent, TabsIndicator, TabsList, TabsTrigger } from '@/modules/ui/components/tabs';
import { getOrganizationRouteChildHref, getOrganizationRouteHref } from '@/modules/ui/navigation/organization-navigation';
import { ContactEditor } from '../components/contact-editor';
import { CONTACT_ROLE_BADGE_CLASSES, CONTACT_ROLE_LABEL_I18N_KEYS, CONTACT_ROLE_PAGE_I18N_KEYS, CONTACT_ROLE_ROUTE_IDS, getContactFallbackIcon, getContactRoles } from '../contacts.constants';
import { fetchContacts, getContactsQueryKey } from '../contacts.services';
import { useDeleteContact } from '../use-delete-contact';

const CONTACT_TABS = ['invoices', 'delivery-notes', 'products', 'price-lists'] as const;

const invoiceStatusLabelKeys = { draft: 'invoicing.status.draft', issuing: 'invoicing.status.issuing', issued: 'invoicing.status.issued', sent: 'invoicing.status.sent', paid: 'invoicing.status.paid', void: 'invoicing.status.void' } as const satisfies Record<InvoiceStatus, TranslationKeys>;

/** One contact with its details, invoices, products and price list. */
export function ContactPage() {
  const { t, getLocale } = useI18n();
  const params = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // The open tab lives in the URL so a link (or going back) lands on it
  const activeTab = () => CONTACT_TABS.find(tab => tab === searchParams.tab) ?? 'invoices';
  const { deleteContact } = useDeleteContact();
  const [contactFormOpen, setContactFormOpen] = createSignal(false);
  const [productFormOpen, setProductFormOpen] = createSignal(false);
  const [scannerOpen, setScannerOpen] = createSignal(false);
  const [editingProduct, setEditingProduct] = createSignal<InvoicingProduct | null>(null);

  const contactsQuery = useQuery(() => ({ queryKey: getContactsQueryKey({ organizationId: params.organizationId }), queryFn: () => fetchContacts({ organizationId: params.organizationId }) }));
  const productsQuery = useQuery(() => ({ queryKey: [...getProductsQueryKey({ organizationId: params.organizationId }), { contactId: params.contactId }], queryFn: () => fetchProducts({ organizationId: params.organizationId, contactId: params.contactId }) }));
  const catalogProductsQuery = useQuery(() => ({ queryKey: [...getProductsQueryKey({ organizationId: params.organizationId }), { scope: 'all' }], queryFn: () => fetchProducts({ organizationId: params.organizationId }) }));
  const invoicesQuery = useQuery(() => ({ queryKey: ['invoicing', params.organizationId, 'invoices'], queryFn: () => fetchInvoices({ organizationId: params.organizationId }) }));
  const pricesQuery = useQuery(() => ({ queryKey: getContactPricesQueryKey({ organizationId: params.organizationId, contactId: params.contactId }), queryFn: () => fetchContactPrices({ organizationId: params.organizationId, contactId: params.contactId }) }));

  const contact = createMemo(() => contactsQuery.data?.contacts.find(candidate => candidate.id === params.contactId));
  const contactInvoices = createMemo(() => (invoicesQuery.data?.invoices ?? []).filter(invoice => invoice.customerId === params.contactId));
  const catalogProductsById = createMemo(() => new Map((catalogProductsQuery.data?.products ?? []).map(product => [product.id, product])));
  const priceRows = createMemo(() => (pricesQuery.data?.prices ?? []).flatMap((price) => {
    const product = catalogProductsById().get(price.productId);
    return product ? [{ product, priceMinor: price.priceMinor }] : [];
  }));
  const role = () => getContactRoles({ contact: contact() ?? { isCustomer: true, isSupplier: false, isSalesRepresentative: false } })[0] ?? 'customer';
  const backHref = () => getOrganizationRouteHref({ organizationId: params.organizationId, routeId: CONTACT_ROLE_ROUTE_IDS[role()] });
  const invoiceEditHref = (invoiceId: string) => getOrganizationRouteChildHref({ organizationId: params.organizationId, routeId: 'invoices', childPath: `${invoiceId}/edit` });
  const money = ({ amountMinor, currency }: { amountMinor: number; currency: string }) => new Intl.NumberFormat(getLocale(), { style: 'currency', currency }).format(amountMinor / 100);

  const openProductForm = (product: InvoicingProduct | null) => {
    setEditingProduct(product);
    setProductFormOpen(true);
  };

  const removeProduct = async (product: InvoicingProduct) => {
    try {
      await deleteProduct({ organizationId: params.organizationId, productId: product.id });
      await queryClient.invalidateQueries({ queryKey: getProductsQueryKey({ organizationId: params.organizationId }) });
      createToast({ type: 'success', message: t('invoicing.products.toast.deleted') });
    } catch {
      createToast({ type: 'error', message: t('invoicing.products.toast.delete-error') });
    }
  };

  return (
    <main class="page">
      <A href={backHref()} class="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <div class="i-tabler-arrow-left size-4" />
        {t(`contacts.roles.${CONTACT_ROLE_ROUTE_IDS[role()] === 'salesRepresentatives' ? 'sales_representatives' : CONTACT_ROLE_ROUTE_IDS[role()]}` as 'contacts.roles.customers')}
      </A>

      <Show when={contact()} fallback={<Show when={!contactsQuery.isLoading}><div class="rounded-xl border border-dashed py-14 text-center text-sm text-muted-foreground">{t('contacts.not-found')}</div></Show>}>
        {getContact => (
          <>
            <div class="page-header">
              <div class="flex min-w-0 items-center gap-3">
                <EntityIcon icon={getContact().icon} color={getContact().iconColor} fallback={getContactFallbackIcon({ contact: getContact() })} />
                <div class="min-w-0">
                  <h1 class="page-title truncate">{getContact().name}</h1>
                  <div class="mt-1 flex flex-wrap gap-1.5">
                    <For each={getContactRoles({ contact: getContact() })}>
                      {contactRole => <span class={cn('rounded-full px-1.5 py-px text-[11px] font-medium', CONTACT_ROLE_BADGE_CLASSES[contactRole])}>{t(CONTACT_ROLE_LABEL_I18N_KEYS[contactRole])}</span>}
                    </For>
                  </div>
                </div>
              </div>
              <RowActions
                itemName={getContact().name}
                onEdit={() => setContactFormOpen(true)}
                onDelete={async () => (await deleteContact(getContact())) && navigate(backHref())}
                deleteMessage={t('contacts.delete-message')}
              />
            </div>

            <dl class="mb-8 grid gap-x-6 gap-y-4 border-y py-5 text-sm grid-cols-2 sm:grid-cols-3">
              <For each={[
                { label: t('invoicing.common.tax-id'), value: getContact().taxId },
                { label: 'Email', value: getContact().email },
                { label: t('contacts.detail.phone'), value: getContact().phone },
                { label: t('contacts.table.location'), value: [getContact().addressLine1, getContact().postalCode, getContact().city, getContact().country].filter(Boolean).join(', ') },
                { label: t('contacts.detail.payment-terms'), value: t('contacts.detail.payment-terms-days', { count: getContact().paymentTermsDays }) },
                { label: t('contacts.detail.notes'), value: getContact().notes },
              ]}
              >
                {item => (
                  <div class="min-w-0">
                    <dt class="text-xs text-muted-foreground">{item.label}</dt>
                    <dd class="mt-0.5 truncate">{item.value || '—'}</dd>
                  </div>
                )}
              </For>
            </dl>

            <Tabs value={activeTab()} onChange={tab => setSearchParams({ tab: tab === 'invoices' ? undefined : tab }, { replace: true })}>
              <TabsList class="mb-4 h-11 w-full overflow-x-auto p-1 sm:w-fit">
                <TabsTrigger value="invoices" class="h-9 gap-2 px-3 sm:px-4">
                  <div class="i-tabler-receipt size-4 max-sm:hidden" />
                  {t('contacts.detail.tabs.invoices')}
                </TabsTrigger>
                {/* Handed with the goods: only customers get delivery notes */}
                <Show when={getContact().isCustomer}>
                  <TabsTrigger value="delivery-notes" class="h-9 gap-2 px-3 sm:px-4">
                    <div class="i-tabler-truck-delivery size-4 max-sm:hidden" />
                    {t('contacts.detail.tabs.delivery-notes')}
                  </TabsTrigger>
                </Show>
                <TabsTrigger value="products" class="h-9 gap-2 px-3 sm:px-4">
                  <div class="i-tabler-package size-4 max-sm:hidden" />
                  {t('contacts.detail.tabs.products')}
                </TabsTrigger>
                <TabsTrigger value="price-lists" class="h-9 gap-2 px-3 sm:px-4">
                  <div class="i-tabler-tags size-4 max-sm:hidden" />
                  {t('contacts.detail.tabs.price-lists')}
                </TabsTrigger>
                <TabsIndicator />
              </TabsList>

              <TabsContent value="invoices" class="mt-0">
                <Show when={contactInvoices().length > 0} fallback={<Show when={!invoicesQuery.isLoading}><div class="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">{t('contacts.detail.invoices.empty')}</div></Show>}>
                  <CatalogTable headers={[{ label: t('invoicing.invoices.table.invoice') }, { label: t('invoicing.invoices.table.issue-date') }, { label: t('invoicing.invoices.table.status') }, { label: t('invoicing.invoices.table.total'), class: 'text-right' }]}>
                    <For each={contactInvoices()}>
                      {invoice => (
                        <CatalogRow onClick={invoice.status === 'draft' ? () => navigate(invoiceEditHref(invoice.id)) : undefined}>
                          <CatalogCell class="font-medium">{invoice.number ?? t('invoicing.status.draft')}</CatalogCell>
                          <CatalogCell class="text-muted-foreground">{invoice.issueDate.toLocaleDateString(getLocale())}</CatalogCell>
                          <CatalogCell><Badge variant="outline">{t(invoiceStatusLabelKeys[invoice.status])}</Badge></CatalogCell>
                          <CatalogCell class="text-right font-medium tabular-nums">{money({ amountMinor: getInvoicePayableMinor(invoice), currency: invoice.currency })}</CatalogCell>
                        </CatalogRow>
                      )}
                    </For>
                  </CatalogTable>
                </Show>
              </TabsContent>

              <TabsContent value="products" class="mt-0">
                <div class="mb-3 flex items-center justify-between gap-3">
              <TabsContent value="delivery-notes" class="mt-0">
                <ContactDeliveryNotes organizationId={params.organizationId} contactId={getContact().id} />
              </TabsContent>

                  <p class="text-sm text-muted-foreground">{t(getContact().isSupplier ? 'contacts.detail.products.supplier' : 'contacts.detail.products.customer', { name: getContact().name })}</p>
                  <div class="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" class="gap-1.5" onClick={() => setScannerOpen(true)} aria-label={t('contacts.detail.products.scan')}>
                      <div class="i-tabler-scan size-4" />
                      <span class="hidden sm:inline">{t('contacts.detail.products.scan')}</span>
                    </Button>
                    <Button size="sm" class="gap-1.5" onClick={() => openProductForm(null)}>
                      <div class="i-tabler-plus size-4" />
                      {t('invoicing.products.new')}
                    </Button>
                  </div>
                </div>

                <Show when={(productsQuery.data?.products.length ?? 0) > 0} fallback={<Show when={!productsQuery.isLoading}><div class="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">{t('contacts.detail.products.empty')}</div></Show>}>
                  <ProductsTable products={productsQuery.data?.products ?? []} showOwner={false} onEdit={openProductForm} onDelete={removeProduct} />
                </Show>
              </TabsContent>

              <TabsContent value="price-lists" class="mt-0">
                <Show when={getContact().isCustomer || getContact().isSupplier} fallback={<div class="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">{t('contacts.detail.price-list.unavailable')}</div>}>
                  <div class="mb-4 grid gap-2 sm:grid-cols-[1fr_18rem_auto] sm:items-center">
                    <div>
                      <div class="font-medium">{t('contacts.detail.price-list.title')}</div>
                      <div class="text-sm text-muted-foreground">{t('contacts.detail.price-list.description')}</div>
                    </div>
                    <ContactPriceListField organizationId={params.organizationId} contactId={getContact().id} />
                    <PriceListShareMenu organizationId={params.organizationId} priceList={pricesQuery.data?.priceList ?? undefined} disabled={priceRows().length === 0} />
                  </div>
                  <Show when={priceRows().length > 0} fallback={<Show when={!pricesQuery.isLoading}><div class="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">{t('contacts.detail.price-list.empty')}</div></Show>}>
                    <CatalogTable headers={[{ label: t('invoicing.products.table.product') }, { label: t('invoicing.products.form.unit') }, { label: t('invoicing.products.form.price'), class: 'text-right' }]}>
                      <For each={priceRows()}>
                        {row => (
                          <CatalogRow>
                            <CatalogCell class="font-medium">{row.product.name}</CatalogCell>
                            <CatalogCell class="text-muted-foreground">{row.product.unit}</CatalogCell>
                            <CatalogCell class="text-right font-medium tabular-nums">{money({ amountMinor: row.priceMinor, currency: row.product.currency })}</CatalogCell>
                          </CatalogRow>
                        )}
                      </For>
                    </CatalogTable>
                  </Show>
                </Show>
              </TabsContent>
            </Tabs>

            <Dialog open={productFormOpen()} onOpenChange={setProductFormOpen}>
              <DialogContent class="max-w-xl">
                <DialogHeader><DialogTitle>{editingProduct() === null ? t('invoicing.products.new') : t('invoicing.products.edit')}</DialogTitle></DialogHeader>
                <ProductForm organizationId={params.organizationId} product={editingProduct()} lockedContactId={getContact().id} onDone={() => setProductFormOpen(false)} />
              </DialogContent>
            </Dialog>

            <ProductScannerDialog organizationId={params.organizationId} contactId={getContact().id} contactName={getContact().name} open={scannerOpen()} onOpenChange={setScannerOpen} />

            <Dialog open={contactFormOpen()} onOpenChange={setContactFormOpen}>
              <DialogContent class="max-w-xl">
                <DialogHeader><DialogTitle>{t(CONTACT_ROLE_PAGE_I18N_KEYS[role()].edit)}</DialogTitle></DialogHeader>
                <ContactEditor organizationId={params.organizationId} role={role()} contact={getContact()} contacts={contactsQuery.data?.contacts ?? []} onDone={() => setContactFormOpen(false)} />
              </DialogContent>
            </Dialog>
          </>
        )}
      </Show>
    </main>
  );
}
