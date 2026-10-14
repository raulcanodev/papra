import type { Contact, ContactInput, ContactRole } from '../contacts.types';
import type { EntityCustomPropertiesInput } from '@/modules/custom-properties/custom-properties.types';
import { useParams, useSearchParams } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { EntityCustomPropertiesFields, invalidateEntityCustomProperties } from '@/modules/custom-properties/components/entity-custom-properties-fields.component';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { CatalogCell, CatalogPage, CatalogRow, CatalogTable, SaveButton } from '@/modules/invoicing/components/catalog-page';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { Button } from '@/modules/ui/components/button';
import { createToast } from '@/modules/ui/components/sonner';
import { ContactFormFields, emptyContact, toContactInput } from '../components/contact-form';
import { CONTACT_ROLE_BADGE_CLASSES, CONTACT_ROLE_CUSTOM_PROPERTY_ENTITY_TYPES, CONTACT_ROLE_LABEL_I18N_KEYS, CONTACT_ROLE_PLURAL_LABEL_I18N_KEYS, CONTACT_ROLES, getContactRoles, hasContactRole } from '../contacts.constants';
import { createContact, fetchContacts, getContactsQueryKey, updateContact } from '../contacts.services';

export function ContactsPage() {
  const { t } = useI18n();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [value, setValue] = createSignal<ContactInput>(emptyContact());
  const [customProperties, setCustomProperties] = createSignal<EntityCustomPropertiesInput>({});
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [formOpen, setFormOpen] = createSignal(false);
  const [search, setSearch] = createSignal('');

  // One listing for every tab, the role filter is applied client side so switching tabs is instant
  const query = useQuery(() => ({ queryKey: getContactsQueryKey({ organizationId: params.organizationId }), queryFn: () => fetchContacts({ organizationId: params.organizationId }) }));

  const roleFilter = () => CONTACT_ROLES.find(role => role === searchParams.role);
  const contacts = () => query.data?.contacts ?? [];
  const countFor = (role?: ContactRole) => (role ? contacts().filter(contact => hasContactRole({ contact, role })).length : contacts().length);

  const rows = createMemo(() => {
    const term = search().trim().toLowerCase();
    const role = roleFilter();

    return contacts()
      .filter(contact => !role || hasContactRole({ contact, role }))
      .filter(contact => `${contact.name} ${contact.email ?? ''} ${contact.taxId ?? ''} ${contact.phone ?? ''}`.toLowerCase().includes(term));
  });

  const reset = () => {
    setValue(emptyContact());
    setCustomProperties({});
    setEditingId(null);
    setFormOpen(false);
  };

  const openNew = () => {
    const role = roleFilter();
    setValue(emptyContact({ isCustomer: role === undefined || role === 'customer', isSupplier: role === 'supplier', isSalesRepresentative: role === 'sales_representative', kind: role === 'sales_representative' ? 'person' : 'company' }));
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

  const mutation = createMutation(() => ({
    mutationFn: async () => {
      const contact = { ...value(), customProperties: customProperties() };
      const contactId = editingId();

      return contactId === null
        ? createContact({ organizationId: params.organizationId, contact })
        : updateContact({ organizationId: params.organizationId, contactId, contact });
    },
    onSuccess: async () => {
      reset();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getContactsQueryKey({ organizationId: params.organizationId }) }),
        ...CONTACT_ROLES.map(async role => invalidateEntityCustomProperties({ organizationId: params.organizationId, entityType: CONTACT_ROLE_CUSTOM_PROPERTY_ENTITY_TYPES[role] })),
      ]);
      createToast({ type: 'success', message: t('contacts.toast.saved') });
    },
    onError: () => createToast({ type: 'error', message: t('contacts.toast.error') }),
  }));

  return (
    <CatalogPage
      title={t('contacts.title')}
      description={t('contacts.description')}
      actionLabel={t('contacts.new')}
      formOpen={formOpen()}
      onFormOpenChange={open => (open ? openNew() : reset())}
      editing={editingId() !== null}
      editLabel={t('contacts.edit')}
      search={search()}
      onSearchChange={setSearch}
      loading={query.isLoading}
      empty={rows().length === 0}
      filter={(
        <div class="flex max-w-full shrink-0 gap-1 overflow-x-auto rounded-lg border p-0.5" role="tablist" aria-label={t('contacts.filter.label')}>
          <For each={[undefined, ...CONTACT_ROLES] as const}>
            {role => (
              <button
                type="button"
                role="tab"
                aria-selected={roleFilter() === role}
                class={cn('flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-sm transition-colors', roleFilter() === role ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                onClick={() => setSearchParams({ role })}
              >
                {role ? t(CONTACT_ROLE_PLURAL_LABEL_I18N_KEYS[role]) : t('contacts.filter.all')}
                <span class="text-xs tabular-nums opacity-70">{countFor(role)}</span>
              </button>
            )}
          </For>
        </div>
      )}
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
          {/* One section per role, each role has its own custom fields */}
          <For each={getContactRoles({ contact: value() })}>
            {role => (
              <EntityCustomPropertiesFields
                organizationId={params.organizationId}
                entityType={CONTACT_ROLE_CUSTOM_PROPERTY_ENTITY_TYPES[role]}
                entityId={editingId()}
                value={customProperties()}
                onChange={setCustomProperties}
                title={t('contacts.form.role-fields', { role: t(CONTACT_ROLE_LABEL_I18N_KEYS[role]) })}
              />
            )}
          </For>
          <SaveButton loading={mutation.isPending} editing={editingId() !== null} onCancel={reset} />
        </form>
      )}
    >
      <CatalogTable headers={[{ label: t('contacts.table.contact') }, { label: t('contacts.table.roles') }, { label: t('invoicing.common.tax-id') }, { label: t('contacts.table.location') }, { label: '', class: 'w-16' }]}>
        <For each={rows()}>
          {contact => (
            <CatalogRow onClick={() => edit(contact)}>
              <CatalogCell>
                <div class="flex items-center gap-2.5">
                  <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <div class={cn(contact.kind === 'company' ? 'i-tabler-building' : 'i-tabler-user', 'size-4')} />
                  </span>
                  <div class="min-w-0">
                    <div class="truncate font-medium">{contact.name}</div>
                    <div class="truncate text-xs text-muted-foreground">{contact.email || contact.phone || t('contacts.no-contact-details')}</div>
                  </div>
                </div>
              </CatalogCell>
              <CatalogCell>
                <div class="flex flex-wrap gap-1">
                  <For each={getContactRoles({ contact })} fallback={<span class="text-xs text-muted-foreground">—</span>}>
                    {role => <span class={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', CONTACT_ROLE_BADGE_CLASSES[role])}>{t(CONTACT_ROLE_LABEL_I18N_KEYS[role])}</span>}
                  </For>
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
                  aria-label={t('contacts.edit')}
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
