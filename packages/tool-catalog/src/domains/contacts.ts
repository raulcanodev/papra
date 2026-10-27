import { z } from 'zod';
import { API_KEY_PERMISSIONS } from '../permissions';
import { organizationPath, pick, segment, withoutUndefined, withQuery } from '../request';
import { defineOrganizationTool } from '../tool-definition';
import { currencySchema, idSchema, optionalText, READ_ONLY_NOTE } from './schemas';

const CONTACT_ROLES = ['customer', 'supplier', 'sales_representative'] as const;

// The fields a contact can be written with. The API replaces the whole contact on update (PUT),
// so the update tool merges the changes over what is stored.
const contactFields = {
  kind: z.enum(['company', 'person']).describe('"company" for a business, "person" for an individual'),
  name: z.string().trim().min(1).max(200).describe('Legal or trade name'),
  email: z.string().trim().email().nullable().optional(),
  phone: optionalText(),
  taxId: optionalText().describe('NIF / CIF / NIE / VAT number'),
  addressLine1: optionalText(),
  addressLine2: optionalText(),
  postalCode: optionalText(),
  city: optionalText(),
  region: optionalText(),
  country: optionalText().describe('Country name or ISO code'),
  currency: currencySchema,
  paymentTermsDays: z.number().int().min(0).max(365).nullable().describe('Days between the issue date and the due date. Optional: null when the contact has none'),
  notes: z.string().trim().max(5_000).nullable().optional(),
  isCustomer: z.boolean().describe('Receives invoices from the organization'),
  isSupplier: z.boolean().describe('Sends invoices to the organization'),
  isSalesRepresentative: z.boolean().describe('Sells on behalf of the organization (commercial agent)'),
  equivalenceSurcharge: z.boolean().describe('Customer is a self-employed retailer under the equivalence surcharge (recargo de equivalencia): its invoices carry the surcharge on top of the VAT'),
};

const CONTACT_FIELD_KEYS = Object.keys(contactFields) as Array<keyof typeof contactFields>;

type StoredContact = Record<string, unknown> & { id: string };

export const contactTools = [
  defineOrganizationTool({
    name: 'list_contacts',
    title: 'List contacts',
    description: `List the address book of the organization. Filter by role: customers (they receive invoices), suppliers (they send invoices) or sales representatives (commerciales). A contact can have several roles. ${READ_ONLY_NOTE}`,
    risk: 'read',
    permission: API_KEY_PERMISSIONS.CONTACTS.READ,
    input: { role: z.enum(CONTACT_ROLES).optional() },
    run: ({ role }, { api, organizationId }) => api.request('GET', withQuery(organizationPath(organizationId, '/contacts'), { role })),
  }),
  defineOrganizationTool({
    name: 'get_contact',
    title: 'Get contact',
    description: 'Get one contact with all its fiscal and contact data and its custom properties.',
    risk: 'read',
    permission: API_KEY_PERMISSIONS.CONTACTS.READ,
    input: { contactId: idSchema('Contact ID') },
    run: ({ contactId }, { api, organizationId }) => api.request('GET', organizationPath(organizationId, `/contacts/${segment(contactId)}`)),
  }),
  defineOrganizationTool({
    name: 'create_contact',
    title: 'Create contact',
    description: 'Create a customer, supplier and/or sales representative. Search the workspace first so you do not create a duplicate (same tax ID or name). At least one role should be true.',
    risk: 'write',
    permission: API_KEY_PERMISSIONS.CONTACTS.CREATE,
    input: {
      ...contactFields,
      kind: contactFields.kind.default('company'),
      currency: contactFields.currency.default('EUR'),
      paymentTermsDays: contactFields.paymentTermsDays.default(null),
      isCustomer: contactFields.isCustomer.default(false),
      isSupplier: contactFields.isSupplier.default(false),
      isSalesRepresentative: contactFields.isSalesRepresentative.default(false),
      equivalenceSurcharge: contactFields.equivalenceSurcharge.default(false),
    },
    run: (contact, { api, organizationId }) => api.request('POST', organizationPath(organizationId, '/contacts'), contact),
  }),
  defineOrganizationTool({
    name: 'update_contact',
    title: 'Update contact',
    description: 'Change some fields of a contact. Only the fields you pass change; pass null to clear an optional field.',
    risk: 'write',
    permission: API_KEY_PERMISSIONS.CONTACTS.UPDATE,
    input: {
      contactId: idSchema('Contact ID'),
      ...Object.fromEntries(CONTACT_FIELD_KEYS.map(key => [key, contactFields[key].optional()])) as { [K in keyof typeof contactFields]: z.ZodOptional<(typeof contactFields)[K]> },
    },
    run: async ({ contactId, ...changes }, { api, organizationId }) => {
      const path = organizationPath(organizationId, `/contacts/${segment(contactId)}`);
      const { contact } = await api.request<{ contact: StoredContact }>('GET', path);

      return api.request('PUT', path, { ...pick(contact, CONTACT_FIELD_KEYS), ...withoutUndefined(changes) });
    },
  }),
  defineOrganizationTool({
    name: 'delete_contact',
    title: 'Delete contact',
    description: 'Archive a contact: it disappears from the address book but the invoices already issued to or from it are kept intact.',
    risk: 'destructive',
    permission: API_KEY_PERMISSIONS.CONTACTS.DELETE,
    input: { contactId: idSchema('Contact ID') },
    run: ({ contactId }, { api, organizationId }) => api.request('DELETE', organizationPath(organizationId, `/contacts/${segment(contactId)}`)),
  }),
];
