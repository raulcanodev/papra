import type { EntityCustomPropertiesInput } from '../custom-properties/custom-properties.types';
import type { EntityIconColor } from '../ui/components/entity-icon.constants';

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
  icon: string | null;
  iconColor: EntityIconColor | null;
  isCustomer: boolean;
  isSupplier: boolean;
  isSalesRepresentative: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// The look (icon and its color) is optional: contacts created on the fly (from a purchase invoice...) keep the default one
export type ContactInput = Omit<Contact, 'id' | 'organizationId' | 'archivedAt' | 'createdAt' | 'updatedAt' | 'icon' | 'iconColor'> & Partial<Pick<Contact, 'icon' | 'iconColor'>>;

export type ContactInputWithCustomProperties = ContactInput & { customProperties?: EntityCustomPropertiesInput };
