import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../../app/database/database.test-utils';
import { createServer } from '../../app/server';
import { createTestServerDependencies } from '../../app/server.test-utils';
import { overrideConfig } from '../../config/config.test-utils';
import { contactsTable } from '../../contacts/contacts.table';
import { invoicesTable } from '../../invoicing/invoicing.tables';
import { ORGANIZATION_ROLES } from '../../organizations/organizations.constants';
import { purchaseInvoicesTable } from '../../purchases/purchases.tables';

const ADMIN_ID = 'usr_000000000000000000000000';
const GESTOR_ID = 'usr_111111111111111111111111';
const OWNER_ID = 'usr_222222222222222222222222';
const CLIENT_ORG_ID = 'org_aaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_ORG_ID = 'org_bbbbbbbbbbbbbbbbbbbbbbbb';

async function setupApp() {
  const { db } = await createInMemoryDatabase({
    users: [
      { id: ADMIN_ID, email: 'admin@example.com', name: 'Admin' },
      { id: GESTOR_ID, email: 'gestor@example.com', name: 'Gestor' },
      { id: OWNER_ID, email: 'owner@example.com', name: 'Owner' },
    ],
    userRoles: [{ userId: ADMIN_ID, role: 'admin' }],
    organizations: [
      { id: CLIENT_ORG_ID, name: 'Bar Paqui' },
      { id: OTHER_ORG_ID, name: 'Not a client' },
    ],
    organizationMembers: [
      { organizationId: CLIENT_ORG_ID, userId: OWNER_ID, role: ORGANIZATION_ROLES.OWNER },
      { organizationId: OTHER_ORG_ID, userId: OWNER_ID, role: ORGANIZATION_ROLES.OWNER },
    ],
  });

  for (const organizationId of [CLIENT_ORG_ID, OTHER_ORG_ID]) {
    const [contact] = await db.insert(contactsTable).values({ organizationId, name: 'Contact', isCustomer: true, isSupplier: true }).returning();
    await db.insert(invoicesTable).values([
      { organizationId, customerId: contact!.id, status: 'issued', number: `F-${organizationId}`, issueDate: new Date('2026-08-01'), dueDate: new Date('2026-09-01'), subtotalMinor: 10_000, taxMinor: 2_100, totalMinor: 12_100 },
      { organizationId, customerId: contact!.id, status: 'draft', issueDate: new Date('2026-08-02'), dueDate: new Date('2026-09-02') },
    ]);
    await db.insert(purchaseInvoicesTable).values({ organizationId, supplierId: contact!.id, number: 'P-1', issueDate: new Date('2026-08-03'), subtotalMinor: 5_000, taxMinor: 1_050, deductibleTaxMinor: 1_050, totalMinor: 6_050 });
  }

  const { app } = createServer(createTestServerDependencies({ db, config: overrideConfig({ env: 'test' }) }));
  const request = async ({ path, userId, method = 'GET', body }: { path: string; userId: string; method?: string; body?: unknown }) => app.request(
    path,
    { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) },
    { loggedInUserId: userId },
  );

  return { db, request };
}

async function createGestoriaWithClient({ request, modules }: { request: Awaited<ReturnType<typeof setupApp>>['request']; modules: string[] }) {
  const created = await request({ path: '/api/admin/gestorias', userId: ADMIN_ID, method: 'POST', body: { name: 'Gestoría López', taxId: 'B12345678' } });
  expect(created.status, await created.clone().text()).to.eql(201);
  const { gestoria } = await created.json() as { gestoria: { id: string } };

  const member = await request({ path: `/api/admin/gestorias/${gestoria.id}/members`, userId: ADMIN_ID, method: 'POST', body: { email: 'Gestor@Example.com' } });
  expect(member.status, await member.clone().text()).to.eql(201);

  const client = await request({ path: `/api/admin/gestorias/${gestoria.id}/clients`, userId: ADMIN_ID, method: 'POST', body: { organizationId: CLIENT_ORG_ID, modules } });
  expect(client.status, await client.clone().text()).to.eql(201);

  return { gestoriaId: gestoria.id };
}

describe('gestorias e2e', () => {
  describe('back office', () => {
    test('only admins manage gestorías', async () => {
      const { request } = await setupApp();

      const response = await request({ path: '/api/admin/gestorias', userId: GESTOR_ID, method: 'POST', body: { name: 'Sneaky' } });

      expect(response.status).to.eql(401);
    });

    test('the detail lists the members and the client companies with their modules', async () => {
      const { request } = await setupApp();
      const { gestoriaId } = await createGestoriaWithClient({ request, modules: ['taxes', 'invoices', 'invoices'] });

      const response = await request({ path: `/api/admin/gestorias/${gestoriaId}`, userId: ADMIN_ID });
      const body = await response.json() as { members: { email: string }[]; clients: { organizationId: string; modules: string[] }[] };

      expect(body.members.map(({ email }) => email)).to.eql(['gestor@example.com']);
      expect(body.clients.map(({ organizationId, modules }) => ({ organizationId, modules }))).to.eql([{ organizationId: CLIENT_ORG_ID, modules: ['invoices', 'taxes'] }]);
    });
  });

  describe('gestoría workspace', () => {
    test('a member sees the gestoría and its clients, without any onboarding', async () => {
      const { request } = await setupApp();
      const { gestoriaId } = await createGestoriaWithClient({ request, modules: ['invoices'] });

      const list = await request({ path: '/api/gestorias', userId: GESTOR_ID });
      expect(((await list.json()) as { gestorias: { id: string }[] }).gestorias.map(({ id }) => id)).to.eql([gestoriaId]);

      const detail = await request({ path: `/api/gestorias/${gestoriaId}`, userId: GESTOR_ID });
      expect(((await detail.json()) as { clients: { organizationId: string }[] }).clients.map(({ organizationId }) => organizationId)).to.eql([CLIENT_ORG_ID]);

      const onboarding = await request({ path: '/api/onboarding', userId: GESTOR_ID });
      expect(((await onboarding.json()) as { flow: unknown }).flow).to.eql(null);
    });

    test('the issued invoices of a client are readable, never its drafts', async () => {
      const { request } = await setupApp();
      const { gestoriaId } = await createGestoriaWithClient({ request, modules: ['invoices'] });

      const response = await request({ path: `/api/gestorias/${gestoriaId}/clients/${CLIENT_ORG_ID}/invoices`, userId: GESTOR_ID });
      const { invoices } = await response.json() as { invoices: { status: string; organizationId: string }[] };

      expect(invoices.map(({ status, organizationId }) => ({ status, organizationId }))).to.eql([{ status: 'issued', organizationId: CLIENT_ORG_ID }]);
    });

    test('a module that was not granted, a company that is not a client, or a non member are all refused', async () => {
      const { request } = await setupApp();
      const { gestoriaId } = await createGestoriaWithClient({ request, modules: ['invoices'] });

      const refused = [
        await request({ path: `/api/gestorias/${gestoriaId}/clients/${CLIENT_ORG_ID}/purchases`, userId: GESTOR_ID }),
        await request({ path: `/api/gestorias/${gestoriaId}/clients/${CLIENT_ORG_ID}/taxes/2026/3`, userId: GESTOR_ID }),
        await request({ path: `/api/gestorias/${gestoriaId}/clients/${OTHER_ORG_ID}/invoices`, userId: GESTOR_ID }),
        // The owner of the company is not part of the gestoría
        await request({ path: `/api/gestorias/${gestoriaId}/clients/${CLIENT_ORG_ID}/invoices`, userId: OWNER_ID }),
        await request({ path: `/api/gestorias/${gestoriaId}`, userId: OWNER_ID }),
      ];

      expect(refused.map(response => response.status)).to.eql([403, 403, 403, 403, 403]);
    });

    test('the access ends as soon as the admin removes the company or the module', async () => {
      const { request } = await setupApp();
      const { gestoriaId } = await createGestoriaWithClient({ request, modules: ['invoices', 'purchases'] });

      expect((await request({ path: `/api/gestorias/${gestoriaId}/clients/${CLIENT_ORG_ID}/purchases`, userId: GESTOR_ID })).status).to.eql(200);

      await request({ path: `/api/admin/gestorias/${gestoriaId}/clients/${CLIENT_ORG_ID}`, userId: ADMIN_ID, method: 'PUT', body: { modules: ['invoices'] } });
      expect((await request({ path: `/api/gestorias/${gestoriaId}/clients/${CLIENT_ORG_ID}/purchases`, userId: GESTOR_ID })).status).to.eql(403);

      await request({ path: `/api/admin/gestorias/${gestoriaId}/clients/${CLIENT_ORG_ID}`, userId: ADMIN_ID, method: 'DELETE' });
      expect((await request({ path: `/api/gestorias/${gestoriaId}/clients/${CLIENT_ORG_ID}/invoices`, userId: GESTOR_ID })).status).to.eql(403);
    });

    test('the activity of the quarter only includes the figures of the granted modules', async () => {
      const { request } = await setupApp();
      const { gestoriaId } = await createGestoriaWithClient({ request, modules: ['invoices'] });

      const response = await request({ path: `/api/gestorias/${gestoriaId}/activity?year=2026&quarter=3`, userId: GESTOR_ID });
      const { activity } = await response.json() as { activity: { organizationId: string; issued: { count: number; baseMinor: number; taxMinor: number } | null; received: unknown }[] };

      expect(activity.map(({ organizationId, issued, received }) => ({ organizationId, issued: issued && { count: issued.count, baseMinor: issued.baseMinor, taxMinor: issued.taxMinor }, received }))).to.eql([
        { organizationId: CLIENT_ORG_ID, issued: { count: 1, baseMinor: 10_000, taxMinor: 2_100 }, received: null },
      ]);
    });
  });
});
