import type { InvoicingProduct } from '@/modules/invoicing/invoicing.types';
import { A, useNavigate, useParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { getProductsQueryKey, ProductForm } from '@/modules/invoicing/components/product-form';
import { ProductsTable } from '@/modules/invoicing/components/products-table';
import { deleteProduct, fetchProducts } from '@/modules/invoicing/invoicing.services';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/modules/ui/components/dialog';
import { EntityIcon } from '@/modules/ui/components/entity-icon';
import { RowActions } from '@/modules/ui/components/row-actions';
import { createToast } from '@/modules/ui/components/sonner';
import { getOrganizationRouteHref } from '@/modules/ui/navigation/organization-navigation';
import { ContactEditor } from '../components/contact-editor';
import { CONTACT_ROLE_BADGE_CLASSES, CONTACT_ROLE_LABEL_I18N_KEYS, CONTACT_ROLE_PAGE_I18N_KEYS, CONTACT_ROLE_ROUTE_IDS, getContactFallbackIcon, getContactRoles } from '../contacts.constants';
import { fetchContacts, getContactsQueryKey } from '../contacts.services';
import { useDeleteContact } from '../use-delete-contact';

/** One contact with its details and its products: what a supplier sells us, or a customer's own products */
export function ContactPage() {
  const { t } = useI18n();
  const params = useParams();
  const navigate = useNavigate();
  const { deleteContact } = useDeleteContact();
  const [contactFormOpen, setContactFormOpen] = createSignal(false);
  const [productFormOpen, setProductFormOpen] = createSignal(false);
  const [editingProduct, setEditingProduct] = createSignal<InvoicingProduct | null>(null);

  const contactsQuery = useQuery(() => ({ queryKey: getContactsQueryKey({ organizationId: params.organizationId }), queryFn: () => fetchContacts({ organizationId: params.organizationId }) }));
  const productsQuery = useQuery(() => ({ queryKey: [...getProductsQueryKey({ organizationId: params.organizationId }), { contactId: params.contactId }], queryFn: () => fetchProducts({ organizationId: params.organizationId, contactId: params.contactId }) }));

  const contact = createMemo(() => contactsQuery.data?.contacts.find(candidate => candidate.id === params.contactId));
  const role = () => getContactRoles({ contact: contact() ?? { isCustomer: true, isSupplier: false, isSalesRepresentative: false } })[0] ?? 'customer';
  const backHref = () => getOrganizationRouteHref({ organizationId: params.organizationId, routeId: CONTACT_ROLE_ROUTE_IDS[role()] });

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

            <dl class="mb-8 grid gap-4 rounded-xl border bg-card p-4 text-sm sm:grid-cols-3">
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

            <div class="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 class="text-base font-semibold">{t('contacts.detail.products.title')}</h2>
                <p class="text-sm text-muted-foreground">{t(getContact().isSupplier ? 'contacts.detail.products.supplier' : 'contacts.detail.products.customer', { name: getContact().name })}</p>
              </div>
              <Button size="sm" class="gap-1.5" onClick={() => openProductForm(null)}>
                <div class="i-tabler-plus size-4" />
                {t('invoicing.products.new')}
              </Button>
            </div>

            <Show when={(productsQuery.data?.products.length ?? 0) > 0} fallback={<Show when={!productsQuery.isLoading}><div class="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">{t('contacts.detail.products.empty')}</div></Show>}>
              <ProductsTable products={productsQuery.data?.products ?? []} showOwner={false} onEdit={openProductForm} onDelete={removeProduct} />
            </Show>

            <Dialog open={productFormOpen()} onOpenChange={setProductFormOpen}>
              <DialogContent class="max-w-xl">
                <DialogHeader><DialogTitle>{editingProduct() === null ? t('invoicing.products.new') : t('invoicing.products.edit')}</DialogTitle></DialogHeader>
                <ProductForm organizationId={params.organizationId} product={editingProduct()} lockedContactId={getContact().id} onDone={() => setProductFormOpen(false)} />
              </DialogContent>
            </Dialog>

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
