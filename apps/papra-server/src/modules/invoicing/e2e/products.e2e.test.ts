import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../../app/database/database.test-utils';
import { createServer } from '../../app/server';
import { createTestServerDependencies } from '../../app/server.test-utils';
import { overrideConfig } from '../../config/config.test-utils';
import { ORGANIZATION_ROLES } from '../../organizations/organizations.constants';

const USER_ID = 'usr_111111111111111111111111';
const ORG_ID = 'org_222222222222222222222222';
const OTHER_USER_ID = 'usr_333333333333333333333333';
const OTHER_ORG_ID = 'org_444444444444444444444444';

type Product = { id: string; name: string; contactId: string | null; contactName: string | null };

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
    return (await response.json() as { contact: { id: string } }).contact;
  };

  const listProducts = async (query = '') => {
    const response = await request({ path: `/api/organizations/${ORG_ID}/invoicing/products${query}` });
    return (await response.json() as { products: Product[] }).products;
  };

  return { request, createContact, listProducts };
}

describe('products e2e', () => {
  test('a product is ours by default, or belongs to a supplier or a customer, and can be listed by its contact', async () => {
    const { request, createContact, listProducts } = await setupApp();
    const supplier = await createContact({ name: 'Papelería Ejemplo', isSupplier: true });

    await request({ path: `/api/organizations/${ORG_ID}/invoicing/products`, method: 'POST', body: { name: 'Consultoría', unitPriceMinor: 18_000 } });
    await request({ path: `/api/organizations/${ORG_ID}/invoicing/products`, method: 'POST', body: { name: 'Folios A4', unitPriceMinor: 450, contactId: supplier.id } });

    expect((await listProducts()).map(({ name, contactName }) => [name, contactName])).to.eql([['Consultoría', null], ['Folios A4', 'Papelería Ejemplo']]);
    expect((await listProducts(`?contactId=${supplier.id}`)).map(({ name }) => name)).to.eql(['Folios A4']);
  });

  test('a product cannot belong to a contact of another organization', async () => {
    const { request, createContact } = await setupApp();
    const foreign = await createContact({ name: 'Secret SL', isSupplier: true, organizationId: OTHER_ORG_ID, userId: OTHER_USER_ID });

    const response = await request({ path: `/api/organizations/${ORG_ID}/invoicing/products`, method: 'POST', body: { name: 'Stolen', unitPriceMinor: 100, contactId: foreign.id } });

    expect(response.status).to.eql(404);
  });

  test('a product can move to our own catalog and be archived', async () => {
    const { request, createContact, listProducts } = await setupApp();
    const customer = await createContact({ name: 'Acme', isCustomer: true });
    const created = await request({ path: `/api/organizations/${ORG_ID}/invoicing/products`, method: 'POST', body: { name: 'Plan Acme', unitPriceMinor: 9_000, contactId: customer.id } });
    const { product } = await created.json() as { product: Product };

    await request({ path: `/api/organizations/${ORG_ID}/invoicing/products/${product.id}`, method: 'PUT', body: { name: 'Plan Acme', unitPriceMinor: 9_000, contactId: null } });
    expect((await listProducts()).map(({ contactId }) => contactId)).to.eql([null]);

    expect((await request({ path: `/api/organizations/${ORG_ID}/invoicing/products/${product.id}`, method: 'DELETE' })).status).to.eql(204);
    expect(await listProducts()).to.eql([]);
  });
});
