import type { GenericCustomPropertyEntityType } from '../custom-properties/custom-properties.types';
import type { TranslationKeys } from '../i18n/locales.types';
import type { Contact, ContactKind, ContactRole } from './contacts.types';

export const CONTACT_ROLES: ContactRole[] = ['customer', 'supplier', 'sales_representative'];

export const CONTACT_KINDS: ContactKind[] = ['company', 'person'];

export const CONTACT_KIND_LABEL_I18N_KEYS = {
  company: 'contacts.kind.company',
  person: 'contacts.kind.person',
} as const satisfies Record<ContactKind, TranslationKeys>;

export const CONTACT_ROLE_FLAGS = {
  customer: 'isCustomer',
  supplier: 'isSupplier',
  sales_representative: 'isSalesRepresentative',
} as const satisfies Record<ContactRole, keyof Contact>;

export const CONTACT_ROLE_LABEL_I18N_KEYS = {
  customer: 'contacts.roles.customer',
  supplier: 'contacts.roles.supplier',
  sales_representative: 'contacts.roles.sales_representative',
} as const satisfies Record<ContactRole, TranslationKeys>;

export const CONTACT_ROLE_PLURAL_LABEL_I18N_KEYS = {
  customer: 'contacts.roles.customers',
  supplier: 'contacts.roles.suppliers',
  sales_representative: 'contacts.roles.sales_representatives',
} as const satisfies Record<ContactRole, TranslationKeys>;

// Each role has its own page, which decides the kind of the contacts created there
export const CONTACT_ROLE_DEFAULT_KINDS = {
  customer: 'company',
  supplier: 'company',
  sales_representative: 'person',
} as const satisfies Record<ContactRole, ContactKind>;

export const CONTACT_ROLE_PAGE_I18N_KEYS = {
  customer: { description: 'contacts.page.customer.description', new: 'contacts.page.customer.new', edit: 'contacts.page.customer.edit' },
  supplier: { description: 'contacts.page.supplier.description', new: 'contacts.page.supplier.new', edit: 'contacts.page.supplier.edit' },
  sales_representative: { description: 'contacts.page.sales_representative.description', new: 'contacts.page.sales_representative.new', edit: 'contacts.page.sales_representative.edit' },
} as const satisfies Record<ContactRole, Record<'description' | 'new' | 'edit', TranslationKeys>>;

// Same palette as the dashboard tiles: each role keeps its color across the app
export const CONTACT_ROLE_BADGE_CLASSES = {
  customer: 'bg-blue-500/12 text-blue-700 dark:text-blue-300',
  supplier: 'bg-orange-500/12 text-orange-700 dark:text-orange-300',
  sales_representative: 'bg-purple-500/12 text-purple-700 dark:text-purple-300',
} as const satisfies Record<ContactRole, string>;

// Mirrors the server: each role brings its own group of custom properties
export const CONTACT_ROLE_CUSTOM_PROPERTY_ENTITY_TYPES = {
  customer: 'customer',
  supplier: 'supplier',
  sales_representative: 'sales_representative',
} as const satisfies Record<ContactRole, GenericCustomPropertyEntityType>;

export function hasContactRole({ contact, role }: { contact: Pick<Contact, 'isCustomer' | 'isSupplier' | 'isSalesRepresentative'>; role: ContactRole }) {
  return contact[CONTACT_ROLE_FLAGS[role]];
}

export function getContactRoles({ contact }: { contact: Pick<Contact, 'isCustomer' | 'isSupplier' | 'isSalesRepresentative'> }) {
  return CONTACT_ROLES.filter(role => hasContactRole({ contact, role }));
}

// Same normalization as the server (contacts.models), to match a contact by its tax id whatever the spacing or the ES prefix
export function normalizeTaxId({ taxId }: { taxId: string | null | undefined }) {
  if (taxId === null || taxId === undefined) {
    return null;
  }

  const normalized = taxId.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^ES(?=[A-Z0-9]{9}$)/, '');

  return normalized === '' ? null : normalized;
}
