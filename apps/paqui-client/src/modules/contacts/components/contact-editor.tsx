import type { Contact, ContactInput, ContactRole } from '../contacts.types';
import type { EntityCustomPropertiesInput } from '@/modules/custom-properties/custom-properties.types';
import { createMutation } from '@tanstack/solid-query';
import { createSignal } from 'solid-js';
import { EntityCustomPropertiesFields, invalidateEntityCustomProperties } from '@/modules/custom-properties/components/entity-custom-properties-fields.component';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { SaveButton } from '@/modules/invoicing/components/catalog-page';
import { queryClient } from '@/modules/shared/query/query-client';
import { createToast } from '@/modules/ui/components/sonner';
import { CONTACT_ROLE_CUSTOM_PROPERTY_ENTITY_TYPES, CONTACT_ROLE_DEFAULT_KINDS, CONTACT_ROLE_FLAGS, CONTACT_ROLE_LABEL_I18N_KEYS, normalizeTaxId } from '../contacts.constants';
import { createContact, getContactsQueryKey, updateContact } from '../contacts.services';
import { ContactFormFields, emptyContact, toContactInput } from './contact-form';

/**
 * Creates or edits a contact in the role it is seen in (the customers page, a supplier's page...). A new contact
 * with the tax id of an existing one gets the role added to it instead of a duplicate.
 * Mounted each time its dialog opens, so it starts from its props.
 */
export function ContactEditor(props: {
  organizationId: string;
  role: ContactRole;
  contact: Contact | null;
  /** The address book, to find an existing contact with the same tax id */
  contacts: Contact[];
  onDone: (result: { contact: Contact | null }) => void;
  autofocus?: boolean;
}) {
  const { t } = useI18n();
  const [value, setValue] = createSignal<ContactInput>(props.contact === null
    ? emptyContact({ kind: CONTACT_ROLE_DEFAULT_KINDS[props.role], [CONTACT_ROLE_FLAGS[props.role]]: true })
    : toContactInput(props.contact));
  const [customProperties, setCustomProperties] = createSignal<EntityCustomPropertiesInput>({});

  const findExistingByTaxId = (taxId: string | null) => {
    const normalized = normalizeTaxId({ taxId });
    return normalized === null ? undefined : props.contacts.find(contact => normalizeTaxId({ taxId: contact.taxId }) === normalized);
  };

  const mutation = createMutation(() => ({
    mutationFn: async () => {
      if (props.contact !== null) {
        const { contact } = await updateContact({ organizationId: props.organizationId, contactId: props.contact.id, contact: { ...value(), customProperties: customProperties() } });
        return { contact, addedRoleTo: null };
      }

      const existing = findExistingByTaxId(value().taxId);
      if (existing !== undefined) {
        const { contact } = await updateContact({ organizationId: props.organizationId, contactId: existing.id, contact: { ...toContactInput(existing), [CONTACT_ROLE_FLAGS[props.role]]: true, customProperties: customProperties() } });
        return { contact, addedRoleTo: existing.name };
      }

      const { contact } = await createContact({ organizationId: props.organizationId, contact: { ...value(), customProperties: customProperties() } });
      return { contact, addedRoleTo: null };
    },
    onSuccess: async ({ contact, addedRoleTo }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getContactsQueryKey({ organizationId: props.organizationId }) }),
        invalidateEntityCustomProperties({ organizationId: props.organizationId, entityType: CONTACT_ROLE_CUSTOM_PROPERTY_ENTITY_TYPES[props.role] }),
      ]);
      createToast({
        type: 'success',
        message: addedRoleTo === null
          ? t('contacts.toast.saved')
          : t('contacts.toast.role-added', { name: addedRoleTo, role: t(CONTACT_ROLE_LABEL_I18N_KEYS[props.role]).toLowerCase() }),
      });
      props.onDone({ contact });
    },
    onError: () => createToast({ type: 'error', message: t('contacts.toast.error') }),
  }));

  return (
    <form
      class="grid gap-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (value().name.trim()) {
          mutation.mutate();
        }
      }}
    >
      <ContactFormFields value={value()} onChange={setValue} autofocus={props.autofocus} />
      <EntityCustomPropertiesFields
        organizationId={props.organizationId}
        entityType={CONTACT_ROLE_CUSTOM_PROPERTY_ENTITY_TYPES[props.role]}
        entityId={props.contact?.id ?? null}
        value={customProperties()}
        onChange={setCustomProperties}
      />
      <SaveButton loading={mutation.isPending} editing={props.contact !== null} onCancel={() => props.onDone({ contact: null })} />
    </form>
  );
}
