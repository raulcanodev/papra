import type { Contact } from '../contacts.models';
import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../../app/database/database.test-utils';
import { createServer } from '../../app/server';
import { createTestServerDependencies } from '../../app/server.test-utils';
import { overrideConfig } from '../../config/config.test-utils';
import { documentFoldersTable } from '../../documents/document-folders.table';
import { ORGANIZATION_ROLES } from '../../organizations/organizations.constants';

const USER_ID = 'usr_111111111111111111111111';
const ORG_ID = 'org_222222222222222222222222';
const OTHER_USER_ID = 'usr_333333333333333333333333';
const OTHER_ORG_ID = 'org_444444444444444444444444';

async function setupApp() {
  const { db } = await createInMemoryDatabase({
    users: [{ id: USER_ID, email: 'user@example.com' }, { id: OTHER_USER_ID, email: 'other@example.com' }],
    organizations: [{ id: ORG_ID, name: 'Org 1' }, { id: OTHER_ORG_ID, name: 'Org 2' }],
    organizationMembers: [
      { organizationId: ORG_ID, userId: USER_ID, role: ORGANIZATION_ROLES.OWNER },
      { organizationId: OTHER_ORG_ID, userId: OTHER_USER_ID, role: ORGANIZATION_ROLES.OWNER },
    ],
  });

  const { app } = createServer(createTestServerDependencies({ db, config: overrideConfig({ env: 'test' }) }));

  const request = async ({ path, method = 'GET', body, userId = USER_ID }: { path: string; method?: string; body?: unknown; userId?: string }) => app.request(
    path,
    { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) },
    { loggedInUserId: userId },
  );

  const createContact = async ({ organizationId = ORG_ID, userId = USER_ID, ...contact }: Record<string, unknown> & { organizationId?: string; userId?: string }) => {
    const response = await request({ path: `/api/organizations/${organizationId}/contacts`, method: 'POST', body: contact, userId });
    const { contact: created } = await response.json() as { contact: Contact };

    return created;
  };

  const createInvoice = async ({ customerId, salesRepresentativeId }: { customerId: string; salesRepresentativeId?: string }) => request({
    path: `/api/organizations/${ORG_ID}/invoicing/invoices`,
    method: 'POST',
    body: {
      customerId,
      salesRepresentativeId,
      issueDate: '2026-10-01',
      dueDate: '2026-10-31',
      items: [{ description: 'Service', quantityMillis: 1_000, unitPriceMinor: 10_000, taxRateBps: 2_100 }],
    },
  });

  return { db, request, createContact, createInvoice };
}

describe('contacts e2e', () => {
  test('a contact can hold several roles, and the listing filters by role', async () => {
    const { request, createContact } = await setupApp();

    await createContact({ name: 'Acme SL', isCustomer: true, isSupplier: true });
    await createContact({ name: 'Laura', kind: 'person', isSalesRepresentative: true });
    await createContact({ name: 'Plain contact' });

    const list = async (role?: string) => {
      const response = await request({ path: `/api/organizations/${ORG_ID}/contacts${role === undefined ? '' : `?role=${role}`}` });
      const { contacts } = await response.json() as { contacts: Contact[] };
      return contacts.map(({ name }) => name);
    };

    expect(await list()).to.eql(['Acme SL', 'Laura', 'Plain contact']);
    expect(await list('customer')).to.eql(['Acme SL']);
    expect(await list('supplier')).to.eql(['Acme SL']);
    expect(await list('sales_representative')).to.eql(['Laura']);
  });

  test('customers and suppliers get a documents folder named after them, sales representatives do not', async () => {
    const { db, request, createContact } = await setupApp();

    const supplier = await createContact({ name: 'Proveedor SL', isSupplier: true });
    await createContact({ name: 'Laura', kind: 'person', isSalesRepresentative: true });

    await request({ path: `/api/organizations/${ORG_ID}/contacts/${supplier.id}`, method: 'PUT', body: { name: 'Proveedor Renamed SL', isSupplier: true } });

    const folders = await db.select().from(documentFoldersTable);
    expect(folders.map(({ contactId, name, kind }) => ({ contactId, name, kind }))).to.eql([{ contactId: supplier.id, name: 'Proveedor Renamed SL', kind: 'contact' }]);
  });

  test('the custom properties of every role of a contact are saved and returned together', async () => {
    const { request, createContact } = await setupApp();

    const createDefinition = async (definition: Record<string, unknown>) => {
      const response = await request({ path: `/api/organizations/${ORG_ID}/custom-properties`, method: 'POST', body: definition });
      return (await response.json() as { propertyDefinition: { id: string } }).propertyDefinition;
    };

    const segment = await createDefinition({ name: 'Segment', type: 'text', entityType: 'customer' });
    const leadTime = await createDefinition({ name: 'Lead time', type: 'number', entityType: 'supplier' });

    const contact = await createContact({ name: 'Acme SL', isCustomer: true, isSupplier: true, customProperties: { [segment.id]: 'SMB', [leadTime.id]: 7 } });

    const response = await request({ path: `/api/organizations/${ORG_ID}/contacts/${contact.id}` });
    const { customProperties } = await response.json() as { customProperties: { name: string; value: unknown }[] };

    expect(customProperties.map(({ name, value }) => ({ name, value }))).to.eql([{ name: 'Segment', value: 'SMB' }, { name: 'Lead time', value: 7 }]);

    // A contact without the supplier role cannot carry supplier properties
    const rejected = await request({ path: `/api/organizations/${ORG_ID}/contacts`, method: 'POST', body: { name: 'Only customer', isCustomer: true, customProperties: { [leadTime.id]: 3 } } });
    expect(rejected.status).to.eql(404);
  });

  test('an invoice customer must be a contact of the organization with the customer role, and its sales representative the matching role', async () => {
    const { createContact, createInvoice } = await setupApp();

    const customer = await createContact({ name: 'Acme SL', isCustomer: true });
    const supplierOnly = await createContact({ name: 'Proveedor SL', isSupplier: true });
    const representative = await createContact({ name: 'Laura', kind: 'person', isSalesRepresentative: true });
    const otherOrgRepresentative = await createContact({ organizationId: OTHER_ORG_ID, userId: OTHER_USER_ID, name: 'Other', isSalesRepresentative: true });

    expect((await createInvoice({ customerId: customer.id, salesRepresentativeId: representative.id })).status).to.eql(201);
    expect((await createInvoice({ customerId: supplierOnly.id })).status).to.eql(400);
    expect((await createInvoice({ customerId: customer.id, salesRepresentativeId: customer.id })).status).to.eql(400);
    expect((await createInvoice({ customerId: customer.id, salesRepresentativeId: otherOrgRepresentative.id })).status).to.eql(404);
  });

  test('contacts of another organization are neither listed nor readable', async () => {
    const { request, createContact } = await setupApp();

    const otherContact = await createContact({ organizationId: OTHER_ORG_ID, userId: OTHER_USER_ID, name: 'Secret SL', isCustomer: true });

    const listResponse = await request({ path: `/api/organizations/${ORG_ID}/contacts` });
    expect((await listResponse.json() as { contacts: Contact[] }).contacts).to.eql([]);

    const readResponse = await request({ path: `/api/organizations/${ORG_ID}/contacts/${otherContact.id}` });
    expect(readResponse.status).to.eql(404);

    const forbiddenResponse = await request({ path: `/api/organizations/${OTHER_ORG_ID}/contacts` });
    expect(forbiddenResponse.status).to.eql(403);
  });
});
