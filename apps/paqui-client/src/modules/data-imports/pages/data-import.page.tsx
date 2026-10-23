import type { DataImportEntity } from '../data-imports.types';
import { A, useParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { createSignal, Show } from 'solid-js';
import { fetchContacts, getContactsQueryKey } from '@/modules/contacts/contacts.services';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { getProductsQueryKey } from '@/modules/invoicing/components/product-form';
import { fetchProducts } from '@/modules/invoicing/invoicing.services';
import { Button } from '@/modules/ui/components/button';
import { SettingsSection, SettingsSections } from '@/modules/ui/components/settings-section';
import { getOrganizationRouteHref } from '@/modules/ui/navigation/organization-navigation';
import { DataImportDialog } from '../components/data-import-dialog';

// Moving from another software, in the order the data depends on each other: contacts, products, then where the
// invoice numbering resumes and the old invoices kept as documents
export function DataImportPage() {
  const { t } = useI18n();
  const params = useParams();
  const [openEntity, setOpenEntity] = createSignal<DataImportEntity | null>(null);

  const contactsQuery = useQuery(() => ({
    queryKey: getContactsQueryKey({ organizationId: params.organizationId }),
    queryFn: () => fetchContacts({ organizationId: params.organizationId }),
  }));
  const productsQuery = useQuery(() => ({
    queryKey: getProductsQueryKey({ organizationId: params.organizationId }),
    queryFn: () => fetchProducts({ organizationId: params.organizationId }),
  }));

  const contactsCount = () => contactsQuery.data?.contacts.length;
  const productsCount = () => productsQuery.data?.products.filter(product => !product.contactId && !product.archivedAt).length;

  return (
    <div class="page-narrow">
      <div class="page-header">
        <div>
          <h1 class="page-title">{t('data-import.page.title')}</h1>
          <p class="page-description">{t('data-import.page.description')}</p>
        </div>
      </div>

      <SettingsSections>
        <SettingsSection
          title={t('data-import.contacts.title')}
          description={t('data-import.contacts.description')}
        >
          <ImportAction count={contactsCount()} countKey="data-import.contacts.count" onImport={() => setOpenEntity('contacts')} />
        </SettingsSection>

        <SettingsSection
          title={t('data-import.products.title')}
          description={t('data-import.products.description')}
        >
          <ImportAction count={productsCount()} countKey="data-import.products.count" onImport={() => setOpenEntity('products')} />
        </SettingsSection>

        <SettingsSection title={t('data-import.series.title')} description={t('data-import.series.description')}>
          <div>
            <Button as={A} href={getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'settingsInvoiceSeries' })} variant="outline">
              <div class="i-tabler-list-numbers mr-2 size-4" />
              {t('data-import.series.action')}
            </Button>
          </div>
        </SettingsSection>

        <SettingsSection title={t('data-import.history.title')} description={t('data-import.history.description')}>
          <div>
            <Button as={A} href={getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'documents' })} variant="outline">
              <div class="i-tabler-files mr-2 size-4" />
              {t('data-import.history.action')}
            </Button>
          </div>
        </SettingsSection>
      </SettingsSections>

      <Show when={openEntity()} keyed>
        {entity => (
          <DataImportDialog
            organizationId={params.organizationId}
            entity={entity}
            open
            onOpenChange={open => !open && setOpenEntity(null)}
          />
        )}
      </Show>
    </div>
  );
}

function ImportAction(props: { count: number | undefined; countKey: 'data-import.contacts.count' | 'data-import.products.count'; onImport: () => void }) {
  const { t } = useI18n();

  return (
    <div class="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-4">
      <Button onClick={props.onImport}>
        <div class="i-tabler-table-import mr-2 size-4" />
        {t('data-import.action')}
      </Button>
      <Show when={props.count !== undefined}>
        <span class="text-sm text-muted-foreground">{t(props.countKey, { count: props.count ?? 0 })}</span>
      </Show>
    </div>
  );
}
