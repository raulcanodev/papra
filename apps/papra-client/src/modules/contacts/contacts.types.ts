import type { EntityCustomPropertiesInput } from '../custom-properties/custom-properties.types';

export type ContactKind = 'company' | 'person';

export type ContactRole = 'customer' | 'supplier' | 'sales_representative';

export type Contact = {
  id: string;
  organizationId: string;
  kind: ContactKind;
  name: string;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  currency: string;
  paymentTermsDays: number;
  notes: string | null;
  isCustomer: boolean;
  isSupplier: boolean;
  isSalesRepresentative: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ContactInput = Omit<Contact, 'id' | 'organizationId' | 'archivedAt' | 'createdAt' | 'updatedAt'>;

export type ContactInputWithCustomProperties = ContactInput & { customProperties?: EntityCustomPropertiesInput };
