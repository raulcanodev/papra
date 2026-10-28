import type { Database } from '../../../app/database/database.types';
import { eq } from 'drizzle-orm';
import { describe, expect, test } from 'vitest';
import { sessionsTable } from '../../../app/auth/auth.tables';
import { createInMemoryDatabase } from '../../../app/database/database.test-utils';
import { createServer } from '../../../app/server';
import { createTestServerDependencies } from '../../../app/server.test-utils';
import { getClientBaseUrl } from '../../../config/config.models';
import { overrideConfig } from '../../../config/config.test-utils';
import { organizationsTable } from '../../../organizations/organizations.table';
import { userRolesTable } from '../../../roles/roles.table';
import { usersTable } from '../../../users/users.table';
import { impersonationsTable } from '../impersonation.table';

const PASSWORD = 'StrongPassword123!';
const REASON = 'Setting up the invoicing for the customer';

// Keeps the cookies of one browser between requests, the way the client does
function createBrowser({ app, origin }: { app: ReturnType<typeof createServer>['app']; origin: string }) {
  const cookies = new Map<string, string>();

  const request = async (path: string, { method = 'GET', body }: { method?: string; body?: unknown } = {}) => {
    const response = await app.request(path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Origin': origin,
        'Cookie': [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    for (const cookie of response.headers.getSetCookie()) {
      const [pair = '', ...attributes] = cookie.split(';');
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1);
      const isRemoved = value === '' || attributes.some(attribute => attribute.trim().toLowerCase() === 'max-age=0');

      if (isRemoved) {
        cookies.delete(name);
      } else {
        cookies.set(name, value);
      }
    }

    return response;
  };

  return { request };
}

async function setup() {
  const { db } = await createInMemoryDatabase();
  const config = overrideConfig({ env: 'test', auth: { isEmailVerificationRequired: false } });
  const { app } = createServer(createTestServerDependencies({ db, config }));
  const { clientBaseUrl } = getClientBaseUrl({ config });

  const signUp = async ({ email, name }: { email: string; name: string }) => {
    const browser = createBrowser({ app, origin: clientBaseUrl });
    const response = await browser.request('/api/auth/sign-up/email', { method: 'POST', body: { email, password: PASSWORD, name } });
    expect(response.status).to.eql(200);
    const { user } = await response.json() as { user: { id: string } };

    return { browser, userId: user.id };
  };

  const admin = await signUp({ email: 'admin@example.com', name: 'Admin' });
  const customer = await signUp({ email: 'customer@example.com', name: 'Customer' });
  await db.insert(userRolesTable).values({ userId: admin.userId, role: 'admin' }).onConflictDoNothing();

  const getMe = async (browser: typeof admin.browser) => {
    const response = await browser.request('/api/users/me');
    return { status: response.status, email: response.status === 200 ? ((await response.json()) as { user: { email: string } }).user.email : undefined };
  };

  return { db, admin, customer, signUp, getMe };
}

async function getImpersonationSessions({ db }: { db: Database }) {
  const sessions = await db.select().from(sessionsTable);
  return sessions.filter(session => session.impersonatedBy !== null);
}

describe('impersonation e2e', () => {
  test('an admin enters a customer account with a reason, acts as them, and comes back to their own account', async () => {
    const { db, admin, customer, getMe } = await setup();

    const startResponse = await admin.browser.request('/api/auth/impersonation/start', { method: 'POST', body: { userId: customer.userId, reason: REASON } });
    expect(startResponse.status).to.eql(200);

    expect(await getMe(admin.browser)).to.eql({ status: 200, email: 'customer@example.com' });

    const [impersonationSession] = await getImpersonationSessions({ db });
    expect(impersonationSession?.userId).to.eql(customer.userId);
    expect(impersonationSession?.impersonatedBy).to.eql(admin.userId);
    // One hour at most
    expect(impersonationSession!.expiresAt.getTime() - Date.now()).to.be.lessThanOrEqual(60 * 60 * 1000);

    const [auditRow] = await db.select().from(impersonationsTable);
    expect(auditRow).to.include({ adminUserId: admin.userId, targetUserId: customer.userId, reason: REASON, adminEmail: 'admin@example.com', targetEmail: 'customer@example.com', canWrite: false, endedAt: null });

    const stopResponse = await admin.browser.request('/api/auth/impersonation/stop', { method: 'POST' });
    expect(stopResponse.status).to.eql(200);
    expect(await stopResponse.json()).to.eql({ restored: true });

    expect(await getMe(admin.browser)).to.eql({ status: 200, email: 'admin@example.com' });
    expect(await getImpersonationSessions({ db })).to.eql([]);

    const [endedAuditRow] = await db.select().from(impersonationsTable);
    expect(endedAuditRow?.endedAt).to.be.instanceOf(Date);
  });

  test('an impersonation is read-only by default: it reads everything, changes nothing, and can still be left', async () => {
    const { db, admin, customer, getMe } = await setup();

    await admin.browser.request('/api/auth/impersonation/start', { method: 'POST', body: { userId: customer.userId, reason: REASON } });

    expect(await getMe(admin.browser)).to.eql({ status: 200, email: 'customer@example.com' });
    expect((await admin.browser.request('/api/organizations')).status).to.eql(200);

    const refused = [
      await admin.browser.request('/api/organizations', { method: 'POST', body: { name: 'Created by mistake' } }),
      await admin.browser.request('/api/users/me', { method: 'PUT', body: { name: 'Renamed by mistake' } }),
      await admin.browser.request('/api/auth/update-user', { method: 'POST', body: { name: 'Renamed by mistake' } }),
    ];

    expect(refused.map(response => response.status)).to.eql([403, 403, 403]);
    expect(await refused[0]!.json()).to.deep.include({ error: { code: 'auth.impersonation_read_only', message: 'This impersonation is read-only' } });
    expect(await db.select().from(organizationsTable)).to.eql([]);
    expect((await db.select().from(usersTable).where(eq(usersTable.id, customer.userId)))[0]?.name).to.eql('Customer');

    const stopResponse = await admin.browser.request('/api/auth/impersonation/stop', { method: 'POST' });
    expect(await stopResponse.json()).to.eql({ restored: true });
    expect(await getMe(admin.browser)).to.eql({ status: 200, email: 'admin@example.com' });
  });

  test('an admin who asks for it when entering can change things in the account', async () => {
    const { db, admin, customer } = await setup();

    await admin.browser.request('/api/auth/impersonation/start', { method: 'POST', body: { userId: customer.userId, reason: REASON, canWrite: true } });

    const response = await admin.browser.request('/api/organizations', { method: 'POST', body: { name: 'Set up for them' } });

    expect(response.status).to.eql(200);
    expect((await db.select().from(organizationsTable)).map(organization => organization.name)).to.eql(['Set up for them']);

    const [auditRow] = await db.select().from(impersonationsTable);
    expect(auditRow?.canWrite).to.eql(true);
  });

  test('while impersonating, actions that would take over the account or outlive the visit are refused', async () => {
    const { admin, customer } = await setup();

    // Even when allowed to change things
    await admin.browser.request('/api/auth/impersonation/start', { method: 'POST', body: { userId: customer.userId, reason: REASON, canWrite: true } });

    const refused = [
      await admin.browser.request('/api/auth/change-password', { method: 'POST', body: { currentPassword: PASSWORD, newPassword: 'AnotherPassword123!' } }),
      await admin.browser.request('/api/auth/two-factor/enable', { method: 'POST', body: { password: PASSWORD } }),
      await admin.browser.request('/api/auth/revoke-sessions', { method: 'POST', body: {} }),
      await admin.browser.request('/api/auth/impersonation/start', { method: 'POST', body: { userId: admin.userId, reason: REASON } }),
      await admin.browser.request('/api/api-keys', { method: 'POST', body: { name: 'backdoor', permissions: ['documents:read'] } }),
      await admin.browser.request('/api/users/me/password', { method: 'POST', body: { newPassword: 'AnotherPassword123!' } }),
    ];

    expect(refused.map(response => response.status)).to.eql([403, 403, 403, 403, 403, 403]);

    // The admin powers stay outside the impersonated account
    const adminRouteResponse = await admin.browser.request('/api/admin/users');
    expect(adminRouteResponse.status).to.eql(401);
  });

  test('a user without the impersonation permission cannot impersonate anyone', async () => {
    const { db, admin, customer } = await setup();

    const startResponse = await customer.browser.request('/api/auth/impersonation/start', { method: 'POST', body: { userId: admin.userId, reason: REASON } });

    expect(startResponse.status).to.eql(403);
    expect(await getImpersonationSessions({ db })).to.eql([]);
    expect(await db.select().from(impersonationsTable)).to.eql([]);
  });

  test('an admin cannot impersonate another admin nor themselves', async () => {
    const { db, admin, signUp } = await setup();
    const otherAdmin = await signUp({ email: 'other-admin@example.com', name: 'Other admin' });
    await db.insert(userRolesTable).values({ userId: otherAdmin.userId, role: 'admin' });

    const otherAdminResponse = await admin.browser.request('/api/auth/impersonation/start', { method: 'POST', body: { userId: otherAdmin.userId, reason: REASON } });
    const selfResponse = await admin.browser.request('/api/auth/impersonation/start', { method: 'POST', body: { userId: admin.userId, reason: REASON } });

    expect([otherAdminResponse.status, selfResponse.status]).to.eql([403, 403]);
    expect(await getImpersonationSessions({ db })).to.eql([]);
  });

  test('a reason is required', async () => {
    const { db, admin, customer } = await setup();

    const response = await admin.browser.request('/api/auth/impersonation/start', { method: 'POST', body: { userId: customer.userId, reason: 'fix' } });

    expect(response.status).to.eql(400);
    expect(await getImpersonationSessions({ db })).to.eql([]);
  });

  test('an impersonation older than one hour is destroyed on its next request', async () => {
    const { db, admin, customer, getMe } = await setup();

    await admin.browser.request('/api/auth/impersonation/start', { method: 'POST', body: { userId: customer.userId, reason: REASON } });
    const [session] = await getImpersonationSessions({ db });
    await db.update(sessionsTable).set({ createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) }).where(eq(sessionsTable.id, session!.id));

    expect((await getMe(admin.browser)).status).to.eql(401);
    expect(await getImpersonationSessions({ db })).to.eql([]);

    const [auditRow] = await db.select().from(impersonationsTable);
    expect(auditRow?.endedAt).to.be.instanceOf(Date);
  });

  test('when the admin loses the permission, their ongoing impersonations stop working', async () => {
    const { db, admin, customer, getMe } = await setup();

    await admin.browser.request('/api/auth/impersonation/start', { method: 'POST', body: { userId: customer.userId, reason: REASON } });
    await db.delete(userRolesTable).where(eq(userRolesTable.userId, admin.userId));

    expect((await getMe(admin.browser)).status).to.eql(401);
    expect(await getImpersonationSessions({ db })).to.eql([]);
  });

  test('the stop route never swaps a regular session', async () => {
    const { customer, getMe } = await setup();

    const response = await customer.browser.request('/api/auth/impersonation/stop', { method: 'POST' });

    expect(response.status).to.eql(400);
    expect(await getMe(customer.browser)).to.eql({ status: 200, email: 'customer@example.com' });
  });

  test('the customer and admin user rows are untouched by an impersonation', async () => {
    const { db, admin, customer } = await setup();
    const usersBefore = await db.select().from(usersTable);

    await admin.browser.request('/api/auth/impersonation/start', { method: 'POST', body: { userId: customer.userId, reason: REASON } });
    await admin.browser.request('/api/auth/impersonation/stop', { method: 'POST' });

    expect(await db.select().from(usersTable)).to.eql(usersBefore);
  });
});
