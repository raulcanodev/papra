import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../../app/database/database.test-utils';
import { createServer } from '../../app/server';
import { createTestServerDependencies } from '../../app/server.test-utils';
import { overrideConfig } from '../../config/config.test-utils';
import { ORGANIZATION_ROLES } from '../../organizations/organizations.constants';
import { documentReadingsTable } from '../readings/document-readings.tables';

const USER_ID = 'usr_111111111111111111111111';
const ORG_ID = 'org_222222222222222222222222';
const OTHER_ORG_ID = 'org_444444444444444444444444';

const document = (id: string, organizationId: string) => ({ id, organizationId, name: `${id}.pdf`, originalName: `${id}.pdf`, mimeType: 'application/pdf', originalStorageKey: id, originalSha256Hash: id });

describe('purchase readings e2e', () => {
  test('uploaded documents are queued for reading, only those of the organization, and their status can be followed', async () => {
    const { db } = await createInMemoryDatabase({
      users: [{ id: USER_ID, email: 'user@example.com' }],
      organizations: [{ id: ORG_ID, name: 'Org 1' }, { id: OTHER_ORG_ID, name: 'Org 2' }],
      organizationMembers: [{ organizationId: ORG_ID, userId: USER_ID, role: ORGANIZATION_ROLES.OWNER }],
      documents: [document('doc_a', ORG_ID), document('doc_b', ORG_ID), document('doc_other', OTHER_ORG_ID)],
    });
    // Web only: the readings are queued for a worker, nothing is read during the test
    const { app } = createServer(createTestServerDependencies({ db, config: overrideConfig({ env: 'test', processMode: 'web' }) }));
    const request = async (path: string, init: RequestInit = {}) => app.request(path, { headers: { 'Content-Type': 'application/json' }, ...init }, { loggedInUserId: USER_ID });

    const enqueued = await request(`/api/organizations/${ORG_ID}/purchases/readings`, { method: 'POST', body: JSON.stringify({ documentIds: ['doc_a', 'doc_b', 'doc_other', 'doc_a'] }) });
    const enqueuedBody = await enqueued.clone().text();
    expect(enqueued.status, enqueuedBody).to.eql(202);
    const { readings } = await enqueued.json() as { readings: { documentId: string; status: string; extraction: unknown }[] };
    expect(readings.map(({ documentId, status, extraction }) => ({ documentId, status, extraction })).toSorted((a, b) => a.documentId.localeCompare(b.documentId))).to.eql([
      { documentId: 'doc_a', status: 'pending', extraction: null },
      { documentId: 'doc_b', status: 'pending', extraction: null },
    ]);

    const followed = await request(`/api/organizations/${ORG_ID}/purchases/readings?documentIds=doc_b,doc_other`);
    expect(((await followed.json()) as { readings: { documentId: string }[] }).readings.map(({ documentId }) => documentId)).to.eql(['doc_b']);

    expect(await db.select().from(documentReadingsTable)).toHaveLength(2);
  });
});
