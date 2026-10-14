import type { SearchHit } from '../search.models';
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

  const search = async ({ query, kinds, organizationId = ORG_ID, userId = USER_ID }: { query: string; kinds?: string; organizationId?: string; userId?: string }) => {
    const params = new URLSearchParams({ query, ...(kinds === undefined ? {} : { kinds }) });
    const response = await request({ path: `/api/organizations/${organizationId}/search?${params.toString()}`, userId });

    return { status: response.status, ...(await response.json() as { results: SearchHit[] }) };
  };

  return { request, search };
}

describe('search e2e', () => {
  test('one query finds contacts, invoices and products by their different fields', async () => {
    const { request, search } = await setupApp();

    const contactResponse = await request({ path: `/api/organizations/${ORG_ID}/contacts`, method: 'POST', body: { name: 'Acme Industrial SL', taxId: 'B12345678', isCustomer: true } });
    const { contact } = await contactResponse.json() as { contact: { id: string } };
    await request({ path: `/api/organizations/${ORG_ID}/invoicing/products`, method: 'POST', body: { name: 'Consultoría estratégica', unitPriceMinor: 15_000 } });
    await request({
      path: `/api/organizations/${ORG_ID}/invoicing/invoices`,
      method: 'POST',
      body: { customerId: contact.id, issueDate: '2026-10-01', dueDate: '2026-10-31', items: [{ description: 'Auditoría de procesos', quantityMillis: 1_000, unitPriceMinor: 10_000, taxRateBps: 2_100 }] },
    });

    expect((await search({ query: 'acme' })).results.map(({ kind }) => kind).toSorted()).to.eql(['contact', 'invoice']);
    expect((await search({ query: 'b1234' })).results.map(({ kind, matchedOn }) => [kind, matchedOn])).to.eql([['contact', 'taxId'], ['invoice', 'customerTaxId']]);
    expect((await search({ query: 'auditor' })).results.map(({ kind, matchedOn }) => [kind, matchedOn])).to.eql([['invoice', 'line item']]);
    expect((await search({ query: 'consultor' })).results.map(({ kind }) => kind)).to.eql(['product']);
  });

  test('the kinds filter limits what is searched', async () => {
    const { request, search } = await setupApp();

    await request({ path: `/api/organizations/${ORG_ID}/contacts`, method: 'POST', body: { name: 'Acme SL', isSupplier: true } });
    await request({ path: `/api/organizations/${ORG_ID}/invoicing/products`, method: 'POST', body: { name: 'Acme plan', unitPriceMinor: 100 } });

    expect((await search({ query: 'acme', kinds: 'product' })).results.map(({ kind }) => kind)).to.eql(['product']);
  });

  test('the text is searched literally, wildcards do not match everything', async () => {
    const { request, search } = await setupApp();

    await request({ path: `/api/organizations/${ORG_ID}/contacts`, method: 'POST', body: { name: 'Acme SL' } });

    expect((await search({ query: '%%' })).results).to.eql([]);
    expect((await search({ query: 'a_m' })).results).to.eql([]);
  });

  test('results never cross organizations and non members are rejected', async () => {
    const { request, search } = await setupApp();

    await request({ path: `/api/organizations/${OTHER_ORG_ID}/contacts`, method: 'POST', body: { name: 'Secret SL' }, userId: OTHER_USER_ID });

    expect((await search({ query: 'secret' })).results).to.eql([]);
    expect((await search({ query: 'secret', organizationId: OTHER_ORG_ID })).status).to.eql(403);
  });
});
