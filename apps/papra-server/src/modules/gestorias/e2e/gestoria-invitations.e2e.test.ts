import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../../app/database/database.test-utils';
import { createServer } from '../../app/server';
import { createTestServerDependencies } from '../../app/server.test-utils';
import { overrideConfig } from '../../config/config.test-utils';
import { ORGANIZATION_ROLES } from '../../organizations/organizations.constants';

const ADMIN_ID = 'usr_000000000000000000000000';
const OWNER_ID = 'usr_222222222222222222222222';
const CLIENT_ORG_ID = 'org_aaaaaaaaaaaaaaaaaaaaaaaa';

function createTestEmailServices() {
  const sentEmails: Array<{ to: string; subject: string; html: string }> = [];

  return {
    name: 'test',
    sendEmail: async (email: { to: string; subject: string; html: string }) => {
      sentEmails.push(email);
    },
    getSentEmails: () => sentEmails,
  };
}

async function setupApp() {
  const { db } = await createInMemoryDatabase({
    users: [
      { id: ADMIN_ID, email: 'admin@example.com', name: 'Admin' },
      { id: OWNER_ID, email: 'owner@example.com', name: 'Owner' },
    ],
    userRoles: [{ userId: ADMIN_ID, role: 'admin' }],
    organizations: [{ id: CLIENT_ORG_ID, name: 'Bar Paqui' }],
    organizationMembers: [{ organizationId: CLIENT_ORG_ID, userId: OWNER_ID, role: ORGANIZATION_ROLES.OWNER }],
  });

  const emailsServices = createTestEmailServices();
  const { app } = createServer(createTestServerDependencies({ db, emailsServices, config: overrideConfig({ env: 'test', client: { baseUrl: 'https://app.paqui.test' } }) }));

  const request = async ({ path, userId, method = 'GET', body }: { path: string; userId?: string; method?: string; body?: unknown }) => app.request(
    path,
    { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) },
    userId === undefined ? undefined : { loggedInUserId: userId },
  );

  const signUp = async ({ email }: { email: string }) => {
    const response = await request({ path: '/api/auth/sign-up/email', method: 'POST', body: { email, password: 'StrongPassword123!', name: 'Gestor' } });
    expect(response.status, await response.clone().text()).to.eql(200);
    const { user } = await response.json() as { user: { id: string } };

    return { userId: user.id };
  };

  const created = await request({ path: '/api/admin/gestorias', userId: ADMIN_ID, method: 'POST', body: { name: 'Gestoría López' } });
  const { gestoria } = await created.json() as { gestoria: { id: string } };
  await request({ path: `/api/admin/gestorias/${gestoria.id}/clients`, userId: ADMIN_ID, method: 'POST', body: { organizationId: CLIENT_ORG_ID, modules: ['invoices'] } });

  return { request, signUp, emailsServices, gestoriaId: gestoria.id };
}

type GestoriaDetail = { members: { email: string }[]; invitations: { id: string; email: string }[] };

describe('gestoria invitations e2e', () => {
  test('someone without an account is invited by email, and once signed up reads the gestoría without any onboarding', async () => {
    const { request, signUp, emailsServices, gestoriaId } = await setupApp();

    const invited = await request({ path: `/api/admin/gestorias/${gestoriaId}/members`, userId: ADMIN_ID, method: 'POST', body: { email: 'New.Gestor@Example.com' } });
    expect(invited.status, await invited.clone().text()).to.eql(201);
    const { member, invitation } = await invited.json() as { member: unknown; invitation: { email: string } };
    expect(member).to.eql(null);
    expect(invitation.email).to.eql('new.gestor@example.com');

    const [email] = emailsServices.getSentEmails();
    expect(email?.to).to.eql('new.gestor@example.com');
    expect(email?.subject).to.eql('You are invited to join Gestoría López on Paqui');
    expect(email?.html).to.include('https://app.paqui.test/register');

    const before = await (await request({ path: `/api/admin/gestorias/${gestoriaId}`, userId: ADMIN_ID })).json() as GestoriaDetail;
    expect({ members: before.members, invitations: before.invitations.map(({ email }) => email) }).to.eql({ members: [], invitations: ['new.gestor@example.com'] });

    const { userId } = await signUp({ email: 'new.gestor@example.com' });

    const onboarding = await request({ path: '/api/onboarding', userId });
    expect(((await onboarding.json()) as { flow: unknown }).flow).to.eql(null);

    const list = await request({ path: '/api/gestorias', userId });
    expect(((await list.json()) as { gestorias: { id: string }[] }).gestorias.map(({ id }) => id)).to.eql([gestoriaId]);

    const invoices = await request({ path: `/api/gestorias/${gestoriaId}/clients/${CLIENT_ORG_ID}/invoices`, userId });
    expect(invoices.status).to.eql(200);

    const after = await (await request({ path: `/api/admin/gestorias/${gestoriaId}`, userId: ADMIN_ID })).json() as GestoriaDetail;
    expect({ members: after.members.map(({ email }) => email), invitations: after.invitations }).to.eql({ members: ['new.gestor@example.com'], invitations: [] });
  });

  test('someone who already has an account is added right away, without any email', async () => {
    const { request, emailsServices, gestoriaId } = await setupApp();

    const response = await request({ path: `/api/admin/gestorias/${gestoriaId}/members`, userId: ADMIN_ID, method: 'POST', body: { email: 'owner@example.com' } });
    const { member, invitation } = await response.json() as { member: { userId: string } | null; invitation: unknown };

    expect(response.status).to.eql(201);
    expect({ userId: member?.userId, invitation }).to.eql({ userId: OWNER_ID, invitation: null });
    expect(emailsServices.getSentEmails()).to.eql([]);
  });

  test('a cancelled invitation gives no access when the person signs up', async () => {
    const { request, signUp, gestoriaId } = await setupApp();

    const invited = await request({ path: `/api/admin/gestorias/${gestoriaId}/members`, userId: ADMIN_ID, method: 'POST', body: { email: 'cancelled@example.com' } });
    const { invitation } = await invited.json() as { invitation: { id: string } };

    const cancelled = await request({ path: `/api/admin/gestorias/${gestoriaId}/invitations/${invitation.id}`, userId: ADMIN_ID, method: 'DELETE' });
    expect(cancelled.status).to.eql(204);

    const cancelledAgain = await request({ path: `/api/admin/gestorias/${gestoriaId}/invitations/${invitation.id}`, userId: ADMIN_ID, method: 'DELETE' });
    expect(cancelledAgain.status).to.eql(404);

    const { userId } = await signUp({ email: 'cancelled@example.com' });

    const list = await request({ path: '/api/gestorias', userId });
    expect(((await list.json()) as { gestorias: unknown[] }).gestorias).to.eql([]);
  });

  test('only admins invite or cancel', async () => {
    const { request, gestoriaId } = await setupApp();

    const invited = await request({ path: `/api/admin/gestorias/${gestoriaId}/members`, userId: OWNER_ID, method: 'POST', body: { email: 'sneaky@example.com' } });

    expect(invited.status).to.eql(401);
  });
});
