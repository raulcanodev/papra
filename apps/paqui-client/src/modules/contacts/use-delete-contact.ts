import type { Contact } from './contacts.types';
import { useParams } from '@solidjs/router';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { queryClient } from '@/modules/shared/query/query-client';
import { createToast } from '@/modules/ui/components/sonner';
import { deleteContact as deleteContactRequest, getContactsQueryKey } from './contacts.services';

/** Archives a contact from any page and refreshes the address book (the confirmation is asked by the row actions) */
export function useDeleteContact() {
  const { t } = useI18n();
  const params = useParams();

  const deleteContact = async (contact: Contact) => {
    try {
      await deleteContactRequest({ organizationId: params.organizationId, contactId: contact.id });
      await queryClient.invalidateQueries({ queryKey: getContactsQueryKey({ organizationId: params.organizationId }) });
      createToast({ type: 'success', message: t('contacts.toast.deleted', { name: contact.name }) });
      return true;
    } catch {
      createToast({ type: 'error', message: t('contacts.toast.delete-error') });
      return false;
    }
  };

  return { deleteContact };
}
