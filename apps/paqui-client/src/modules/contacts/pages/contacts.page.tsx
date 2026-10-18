import type { Contact, ContactRole } from '../contacts.types';
import type { ActiveFilter, FilterField } from '@/modules/ui/components/table-filters';
import { useNavigate, useParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { CatalogCell, CatalogPage, CatalogRow, CatalogTable } from '@/modules/invoicing/components/catalog-page';
import { cn } from '@/modules/shared/style/cn';
import { EntityIcon } from '@/modules/ui/components/entity-icon';
import { RowActions } from '@/modules/ui/components/row-actions';
import { matchesSelectedFilter, toDistinctFilterOptions } from '@/modules/ui/components/table-filters';
import { getOrganizationContactHref } from '@/modules/ui/navigation/organization-navigation';
import { useLinkWithReturn } from '@/modules/ui/navigation/return-to';
import { ContactEditor } from '../components/contact-editor';
import { CONTACT_KIND_LABEL_I18N_KEYS, CONTACT_KINDS, CONTACT_ROLE_BADGE_CLASSES, CONTACT_ROLE_LABEL_I18N_KEYS, CONTACT_ROLE_PAGE_I18N_KEYS, CONTACT_ROLE_PLURAL_LABEL_I18N_KEYS, getContactFallbackIcon, getContactRoles, hasContactRole } from '../contacts.constants';
import { fetchContacts, getContactsQueryKey } from '../contacts.services';
import { useDeleteContact } from '../use-delete-contact';

/** The contacts of one role (customers, suppliers or sales representatives); a click opens the contact detail. */
export function ContactsPage(props: { role: ContactRole }) {
  const { t } = useI18n();
  const params = useParams();
  const linkWithReturn = useLinkWithReturn();
  const navigate = useNavigate();
  const [editing, setEditing] = createSignal<Contact | null>(null);
  const [formOpen, setFormOpen] = createSignal(false);
  const [search, setSearch] = createSignal('');
  const [filters, setFilters] = createSignal<ActiveFilter[]>([]);
  const { deleteContact } = useDeleteContact();
  // One cached listing shared by the three pages, switching between them is instant
  const query = useQuery(() => ({ queryKey: getContactsQueryKey({ organizationId: params.organizationId }), queryFn: () => fetchContacts({ organizationId: params.organizationId }) }));
  const contacts = () => query.data?.contacts ?? [];
  const pageI18nKeys = () => CONTACT_ROLE_PAGE_I18N_KEYS[props.role];
  const roleContacts = createMemo(() => contacts().filter(contact => hasContactRole({ contact, role: props.role })));

  const filterFields = createMemo((): FilterField[] => [
    { id: 'kind', type: 'multi-select', label: t('contacts.filter.kind'), icon: 'i-tabler-building', options: CONTACT_KINDS.map(kind => ({ value: kind, label: t(CONTACT_KIND_LABEL_I18N_KEYS[kind]) })) },
    { id: 'country', type: 'multi-select', label: t('invoicing.common.country'), icon: 'i-tabler-world', options: toDistinctFilterOptions(roleContacts(), contact => (contact.country ? { value: contact.country, label: contact.country } : null)) },
  ]);

  const rows = createMemo(() => {
    const term = search().trim().toLowerCase();

    return roleContacts()
      .filter(contact => matchesSelectedFilter(filters(), 'kind', contact.kind) && matchesSelectedFilter(filters(), 'country', contact.country))
      .filter(contact => `${contact.name} ${contact.email ?? ''} ${contact.taxId ?? ''} ${contact.phone ?? ''}`.toLowerCase().includes(term));
  });

  const openForm = (contact: Contact | null) => {
    setEditing(contact);
    setFormOpen(true);
  };

  const close = () => {
    setFormOpen(false);
    setEditing(null);
  };

  return (
    <CatalogPage
      title={t(CONTACT_ROLE_PLURAL_LABEL_I18N_KEYS[props.role])}
      description={t(pageI18nKeys().description)}
      actionLabel={t(pageI18nKeys().new)}
      formOpen={formOpen()}
      onFormOpenChange={open => (open ? openForm(null) : close())}
      editing={editing() !== null}
      editLabel={t(pageI18nKeys().edit)}
      search={search()}
      onSearchChange={setSearch}
      filterFields={filterFields()}
      filters={filters()}
      onFiltersChange={setFilters}
      loading={query.isLoading}
      empty={rows().length === 0}
      form={<ContactEditor organizationId={params.organizationId} role={props.role} contact={editing()} contacts={contacts()} onDone={close} autofocus />}
    >
      <CatalogTable headers={[{ label: t('contacts.table.contact') }, { label: t('invoicing.common.tax-id') }, { label: t('contacts.table.location') }, { label: '', class: 'w-14' }]}>
        <For each={rows()}>
          {contact => (
            <CatalogRow onClick={() => navigate(linkWithReturn(getOrganizationContactHref({ organizationId: params.organizationId, contactId: contact.id })))}>
              <CatalogCell>
                <div class="flex items-center gap-2.5">
                  <EntityIcon icon={contact.icon} color={contact.iconColor} fallback={getContactFallbackIcon({ contact })} />
                  <div class="min-w-0">
                    <div class="flex items-center gap-1.5">
                      <span class="truncate font-medium">{contact.name}</span>
                      {/* The other roles of the contact, so a customer that is also a supplier is recognizable */}
                      <For each={getContactRoles({ contact }).filter(role => role !== props.role)}>
                        {role => <span class={cn('shrink-0 whitespace-nowrap rounded-full px-1.5 py-px text-[11px] font-medium', CONTACT_ROLE_BADGE_CLASSES[role])}>{t(CONTACT_ROLE_LABEL_I18N_KEYS[role])}</span>}
                      </For>
                    </div>
                    <div class="truncate text-xs text-muted-foreground">{contact.email || contact.phone || t('contacts.no-contact-details')}</div>
                  </div>
                </div>
              </CatalogCell>
              <CatalogCell class="text-muted-foreground">{contact.taxId || '—'}</CatalogCell>
              <CatalogCell class="text-muted-foreground">
                <Show when={contact.city || contact.country} fallback="—">{[contact.city, contact.country].filter(Boolean).join(', ')}</Show>
              </CatalogCell>
              <CatalogCell>
                <RowActions itemName={contact.name} onEdit={() => openForm(contact)} onDelete={() => deleteContact(contact)} deleteMessage={t('contacts.delete-message')} />
              </CatalogCell>
            </CatalogRow>
          )}
        </For>
      </CatalogTable>
    </CatalogPage>
  );
}
