import type { EntityCustomProperty } from '../custom-properties/custom-properties.types';
import type { AsDto } from '../shared/http/http-client.types';
import type { Contact, ContactInputWithCustomProperties, ContactRole } from './contacts.types';
import { apiClient } from '../shared/http/api-client';
import { coerceDates } from '../shared/http/http-client.models';

const basePath = (organizationId: string) => `/api/organizations/${organizationId}/contacts`;

// The whole address book is fetched once and shared: the contacts page tabs and the invoice editor filter it by role
export function getContactsQueryKey({ organizationId }: { organizationId: string }) {
  return ['organizations', organizationId, 'contacts'];
}

export async function fetchContacts({ organizationId, role }: { organizationId: string; role?: ContactRole }) {
  const { contacts } = await apiClient<{ contacts: AsDto<Contact>[] }>({ path: basePath(organizationId), method: 'GET', query: role ? { role } : undefined });

  return { contacts: contacts.map(contact => coerceDates(contact) as Contact) };
}

export async function fetchContact({ organizationId, contactId }: { organizationId: string; contactId: string }) {
  const { contact, customProperties } = await apiClient<{ contact: AsDto<Contact>; customProperties: EntityCustomProperty[] }>({ path: `${basePath(organizationId)}/${contactId}`, method: 'GET' });

  return { contact: coerceDates(contact) as Contact, customProperties };
}

export async function createContact({ organizationId, contact }: { organizationId: string; contact: ContactInputWithCustomProperties }) {
  const { contact: created } = await apiClient<{ contact: AsDto<Contact> }>({ path: basePath(organizationId), method: 'POST', body: contact });

  return { contact: coerceDates(created) as Contact };
}

export async function updateContact({ organizationId, contactId, contact }: { organizationId: string; contactId: string; contact: ContactInputWithCustomProperties }) {
  const { contact: updated } = await apiClient<{ contact: AsDto<Contact> }>({ path: `${basePath(organizationId)}/${contactId}`, method: 'PUT', body: contact });

  return { contact: coerceDates(updated) as Contact };
}

/** Archives the contact: it leaves the address book, its invoices and documents are kept */
export async function deleteContact({ organizationId, contactId }: { organizationId: string; contactId: string }) {
  await apiClient({ path: `/api/organizations/${organizationId}/contacts/${contactId}`, method: 'DELETE' });
}
