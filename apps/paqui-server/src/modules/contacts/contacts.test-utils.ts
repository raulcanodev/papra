import type { ContactInput } from './contacts.models';

export function createTestContactInput(overrides: Partial<ContactInput> = {}): ContactInput {
  return {
    kind: 'company',
    name: 'Acme SL',
    email: null,
    phone: null,
    taxId: null,
    addressLine1: null,
    addressLine2: null,
    postalCode: null,
    city: null,
    region: null,
    country: 'ES',
    currency: 'EUR',
    paymentTermsDays: 30,
    notes: null,
    isCustomer: false,
    isSupplier: false,
    isSalesRepresentative: false,
    equivalenceSurcharge: false,
    ...overrides,
  };
}
