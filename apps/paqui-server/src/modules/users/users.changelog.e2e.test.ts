import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../app/database/database.test-utils';
import { createServer } from '../app/server';
import { createTestServerDependencies } from '../app/server.test-utils';
import { overrideConfig } from '../config/config.test-utils';

const USER_ID = 'usr_111111111111111111111111';

async function setupApp() {
  const { db } = await createInMemoryDatabase({ users: [{ id: USER_ID, email: 'user@example.com' }] });
  const { app } = createServer(createTestServerDependencies({ db, config: overrideConfig({ env: 'test' }) }));

  const getMe = async () => (await (await app.request('/api/users/me', { method: 'GET' }, { loggedInUserId: USER_ID })).json()) as { user: { lastSeenChangelogId: string | null } };
  const markSeen = async (entryId: string) => app.request('/api/users/me/changelog-seen', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entryId }) }, { loggedInUserId: USER_ID });

  return { getMe, markSeen };
}

describe('changelog seen e2e', () => {
  test('a user has seen nothing until they read it, and then it is remembered', async () => {
    const { getMe, markSeen } = await setupApp();

    expect((await getMe()).user.lastSeenChangelogId).toBe(null);

    expect((await markSeen('2026-11-05')).status).toBe(204);
    expect((await getMe()).user.lastSeenChangelogId).toBe('2026-11-05');
  });

  test('only the date of an entry is accepted', async () => {
    const { markSeen } = await setupApp();

    expect((await markSeen('whatever')).status).toBe(400);
  });
});
