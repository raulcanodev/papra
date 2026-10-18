import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../../app/database/database.test-utils';
import { createServer } from '../../app/server';
import { createTestServerDependencies } from '../../app/server.test-utils';
import { overrideConfig } from '../../config/config.test-utils';
import { ORGANIZATION_ROLES } from '../../organizations/organizations.constants';

const USER_ID = 'usr_111111111111111111111111';
const COLLEAGUE_ID = 'usr_222222222222222222222222';
const OUTSIDER_ID = 'usr_333333333333333333333333';
const ORG_ID = 'org_444444444444444444444444';
const OTHER_ORG_ID = 'org_555555555555555555555555';

async function setupApp() {
  const { db } = await createInMemoryDatabase({
    users: [{ id: USER_ID, email: 'user@example.com' }, { id: COLLEAGUE_ID, email: 'colleague@example.com' }, { id: OUTSIDER_ID, email: 'outsider@example.com' }],
    organizations: [{ id: ORG_ID, name: 'Restaurant' }, { id: OTHER_ORG_ID, name: 'Agency' }],
    organizationMembers: [
      { organizationId: ORG_ID, userId: USER_ID, role: ORGANIZATION_ROLES.OWNER },
      { organizationId: ORG_ID, userId: COLLEAGUE_ID, role: ORGANIZATION_ROLES.MEMBER },
      { organizationId: OTHER_ORG_ID, userId: USER_ID, role: ORGANIZATION_ROLES.OWNER },
    ],
  });

  const { app } = createServer(createTestServerDependencies({ db, config: overrideConfig({ env: 'test' }) }));

  const request = async ({ organizationId = ORG_ID, method = 'GET', body, userId = USER_ID }: { organizationId?: string; method?: string; body?: unknown; userId?: string }) => {
    const response = await app.request(
      `/api/organizations/${organizationId}/preferences`,
      { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) },
      { loggedInUserId: userId },
    );

    return { status: response.status, body: await response.json() as { preferences: { dashboard: { hiddenWidgetIds: string[]; revenueMode: string }; navigation: { hiddenItemIds: string[] } } } };
  };

  return { request };
}

describe('member preferences e2e', () => {
  test('a member starts with secondary documents hidden and can hide menu entries and home cards', async () => {
    const { request } = await setupApp();

    expect((await request({})).body.preferences).to.eql({
      dashboard: { hiddenWidgetIds: [], revenueMode: 'billed' },
      navigation: { hiddenItemIds: ['documents'] },
    });

    await request({ method: 'PATCH', body: { navigation: { hiddenItemIds: ['salesRepresentatives'] } } });
    await request({ method: 'PATCH', body: { dashboard: { revenueMode: 'profit' } } });

    expect((await request({})).body.preferences).to.eql({
      dashboard: { hiddenWidgetIds: [], revenueMode: 'profit' },
      navigation: { hiddenItemIds: ['salesRepresentatives'] },
    });
  });

  test('preferences belong to one member in one organization', async () => {
    const { request } = await setupApp();

    await request({ method: 'PATCH', body: { navigation: { hiddenItemIds: ['salesRepresentatives'] } } });

    expect((await request({ userId: COLLEAGUE_ID })).body.preferences.navigation.hiddenItemIds).to.eql(['documents']);
    expect((await request({ organizationId: OTHER_ORG_ID })).body.preferences.navigation.hiddenItemIds).to.eql(['documents']);
  });

  test('invalid values are rejected and non members cannot read or write', async () => {
    const { request } = await setupApp();

    expect((await request({ method: 'PATCH', body: { dashboard: { revenueMode: 'everything' } } })).status).to.eql(400);
    expect((await request({ userId: OUTSIDER_ID })).status).to.eql(403);
    expect((await request({ method: 'PATCH', body: { navigation: { hiddenItemIds: [] } }, userId: OUTSIDER_ID })).status).to.eql(403);
  });
});
