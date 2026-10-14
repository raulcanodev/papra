import type { z } from 'zod';
import type { GenericCustomPropertyEntityType } from '../custom-properties/custom-properties.constants';
import type { ContactRole } from './contacts.constants';
import type { contactSchema } from './contacts.schemas';
import type { contactsTable } from './contacts.table';
import { CUSTOM_PROPERTY_ENTITY_TYPES } from '../custom-properties/custom-properties.constants';

export type Contact = typeof contactsTable.$inferSelect;
export type ContactInput = z.infer<typeof contactSchema>;

type ContactRoleFlags = Pick<Contact, 'isCustomer' | 'isSupplier' | 'isSalesRepresentative'>;

export const CONTACT_ROLE_COLUMNS = {
  customer: 'isCustomer',
  supplier: 'isSupplier',
  sales_representative: 'isSalesRepresentative',
} as const satisfies Record<ContactRole, keyof ContactRoleFlags>;

export function hasContactRole({ contact, role }: { contact: ContactRoleFlags; role: ContactRole }) {
  return contact[CONTACT_ROLE_COLUMNS[role]];
}

// Each role brings its own group of custom properties (a supplier field is not a customer field)
const ROLE_CUSTOM_PROPERTY_ENTITY_TYPES = {
  customer: CUSTOM_PROPERTY_ENTITY_TYPES.CUSTOMER,
  supplier: CUSTOM_PROPERTY_ENTITY_TYPES.SUPPLIER,
  sales_representative: CUSTOM_PROPERTY_ENTITY_TYPES.SALES_REPRESENTATIVE,
} as const satisfies Record<ContactRole, GenericCustomPropertyEntityType>;

export function getContactCustomPropertyEntityTypes({ contact }: { contact: ContactRoleFlags }): GenericCustomPropertyEntityType[] {
  return (Object.keys(ROLE_CUSTOM_PROPERTY_ENTITY_TYPES) as ContactRole[])
    .filter(role => hasContactRole({ contact, role }))
    .map(role => ROLE_CUSTOM_PROPERTY_ENTITY_TYPES[role]);
}

// Customers and suppliers get a documents folder (invoices, contracts...), sales representatives do not
export function contactHasDocumentsFolder({ contact }: { contact: ContactRoleFlags }) {
  return contact.isCustomer || contact.isSupplier;
}

// "ES B-1234 5678", "b12345678" and "B12345678" are the same tax id: used to match contacts and detect duplicates
export function normalizeTaxId({ taxId }: { taxId: string | null | undefined }) {
  if (taxId === null || taxId === undefined) {
    return null;
  }

  const normalized = taxId.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^ES(?=[A-Z0-9]{9}$)/, '');

  return normalized === '' ? null : normalized;
}
