import type { Contact, ContactInput, ContactRole } from '../contacts.types';
import type { EntityCustomPropertiesInput } from '@/modules/custom-properties/custom-properties.types';
import type { ActiveFilter, FilterField } from '@/modules/ui/components/table-filters';
import { useParams } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { EntityCustomPropertiesFields, invalidateEntityCustomProperties } from '@/modules/custom-properties/components/entity-custom-properties-fields.component';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { CatalogCell, CatalogPage, CatalogRow, CatalogTable, SaveButton } from '@/modules/invoicing/components/catalog-page';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';
import { EntityIcon } from '@/modules/ui/components/entity-icon';
import { createToast } from '@/modules/ui/components/sonner';
import { matchesSelectedFilter, toDistinctFilterOptions } from '@/modules/ui/components/table-filters';
import { ContactFormFields, emptyContact, toContactInput } from '../components/contact-form';
import { CONTACT_KIND_LABEL_I18N_KEYS, CONTACT_KINDS, CONTACT_ROLE_BADGE_CLASSES, CONTACT_ROLE_CUSTOM_PROPERTY_ENTITY_TYPES, CONTACT_ROLE_DEFAULT_KINDS, CONTACT_ROLE_FLAGS, CONTACT_ROLE_LABEL_I18N_KEYS, CONTACT_ROLE_PAGE_I18N_KEYS, CONTACT_ROLE_PLURAL_LABEL_I18N_KEYS, getContactFallbackIcon, getContactRoles, hasContactRole, normalizeTaxId } from '../contacts.constants';
import { createContact, fetchContacts, getContactsQueryKey, updateContact } from '../contacts.services';

/** The contacts of one role (customers, suppliers or sales representatives), the role and kind of new contacts come from the page */
export function ContactsPage(props: { role: ContactRole }) {
  const { t } = useI18n();
  const params = useParams();

  const [value, setValue] = createSignal<ContactInput>(emptyContact());
  const [customProperties, setCustomProperties] = createSignal<EntityCustomPropertiesInput>({});
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [formOpen, setFormOpen] = createSignal(false);
  const [search, setSearch] = createSignal('');
  const [filters, setFilters] = createSignal<ActiveFilter[]>([]);

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

  const reset = () => {
    setValue(emptyContact());
    setCustomProperties({});
    setEditingId(null);
    setFormOpen(false);
  };

  const openNew = () => {
    setValue(emptyContact({ kind: CONTACT_ROLE_DEFAULT_KINDS[props.role], [CONTACT_ROLE_FLAGS[props.role]]: true }));
    setCustomProperties({});
    setEditingId(null);
    setFormOpen(true);
  };

  const edit = (contact: Contact) => {
    setValue(toContactInput(contact));
    setCustomProperties({});
    setEditingId(contact.id);
    setFormOpen(true);
  };

  // A new contact with the tax id of an existing one (a customer that is also a supplier) gets the role added instead of a duplicate
  const findExistingByTaxId = (taxId: string | null) => {
    const normalized = normalizeTaxId({ taxId });

    return normalized === null ? undefined : contacts().find(contact => normalizeTaxId({ taxId: contact.taxId }) === normalized);
  };

  const mutation = createMutation(() => ({
    mutationFn: async () => {
      const contactId = editingId();

      if (contactId !== null) {
        await updateContact({ organizationId: params.organizationId, contactId, contact: { ...value(), customProperties: customProperties() } });
        return { addedRoleTo: null };
      }

      const existing = findExistingByTaxId(value().taxId);

      if (existing !== undefined) {
        await updateContact({ organizationId: params.organizationId, contactId: existing.id, contact: { ...toContactInput(existing), [CONTACT_ROLE_FLAGS[props.role]]: true, customProperties: customProperties() } });
        return { addedRoleTo: existing.name };
      }

      await createContact({ organizationId: params.organizationId, contact: { ...value(), customProperties: customProperties() } });
      return { addedRoleTo: null };
    },
    onSuccess: async ({ addedRoleTo }) => {
      reset();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getContactsQueryKey({ organizationId: params.organizationId }) }),
        invalidateEntityCustomProperties({ organizationId: params.organizationId, entityType: CONTACT_ROLE_CUSTOM_PROPERTY_ENTITY_TYPES[props.role] }),
      ]);
      createToast({
        type: 'success',
        message: addedRoleTo === null
          ? t('contacts.toast.saved')
          : t('contacts.toast.role-added', { name: addedRoleTo, role: t(CONTACT_ROLE_LABEL_I18N_KEYS[props.role]).toLowerCase() }),
      });
    },
    onError: () => createToast({ type: 'error', message: t('contacts.toast.error') }),
  }));

  return (
    <CatalogPage
      title={t(CONTACT_ROLE_PLURAL_LABEL_I18N_KEYS[props.role])}
      description={t(pageI18nKeys().description)}
      actionLabel={t(pageI18nKeys().new)}
      formOpen={formOpen()}
      onFormOpenChange={open => (open ? openNew() : reset())}
      editing={editingId() !== null}
      editLabel={t(pageI18nKeys().edit)}
      search={search()}
      onSearchChange={setSearch}
      filterFields={filterFields()}
      filters={filters()}
      onFiltersChange={setFilters}
      loading={query.isLoading}
      empty={rows().length === 0}
      form={(
        <form
          class="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (value().name.trim()) {
              mutation.mutate();
            }
          }}
        >
          <ContactFormFields value={value()} onChange={setValue} autofocus />
          <EntityCustomPropertiesFields
            organizationId={params.organizationId}
            entityType={CONTACT_ROLE_CUSTOM_PROPERTY_ENTITY_TYPES[props.role]}
            entityId={editingId()}
            value={customProperties()}
            onChange={setCustomProperties}
          />
          <SaveButton loading={mutation.isPending} editing={editingId() !== null} onCancel={reset} />
        </form>
      )}
    >
      <CatalogTable headers={[{ label: t('contacts.table.contact') }, { label: t('invoicing.common.tax-id') }, { label: t('contacts.table.location') }, { label: '', class: 'w-16' }]}>
        <For each={rows()}>
          {contact => (
            <CatalogRow onClick={() => edit(contact)}>
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
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t(pageI18nKeys().edit)}
                  onClick={(event) => {
                    event.stopPropagation();
                    edit(contact);
                  }}
                >
                  <div class="i-tabler-pencil size-4" />
                </Button>
              </CatalogCell>
            </CatalogRow>
          )}
        </For>
      </CatalogTable>
    </CatalogPage>
  );
}
