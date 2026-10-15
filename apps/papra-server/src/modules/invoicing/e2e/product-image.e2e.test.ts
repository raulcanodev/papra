import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../../app/database/database.test-utils';
import { createServer } from '../../app/server';
import { createTestServerDependencies } from '../../app/server.test-utils';
import { overrideConfig } from '../../config/config.test-utils';
import { ORGANIZATION_ROLES } from '../../organizations/organizations.constants';

const USER_ID = 'usr_111111111111111111111111';
const ORG_ID = 'org_222222222222222222222222';
const OTHER_ORG_ID = 'org_444444444444444444444444';

const document = (id: string, organizationId: string) => ({ id, organizationId, name: `${id}.jpg`, originalName: `${id}.jpg`, mimeType: 'image/jpeg', originalStorageKey: id, originalSha256Hash: id });

describe('product image e2e', () => {
  test('a product keeps a photo, only a document of its own organization', async () => {
    const { db } = await createInMemoryDatabase({
      users: [{ id: USER_ID, email: 'user@example.com' }],
      organizations: [{ id: ORG_ID, name: 'Org 1' }, { id: OTHER_ORG_ID, name: 'Org 2' }],
      organizationMembers: [{ organizationId: ORG_ID, userId: USER_ID, role: ORGANIZATION_ROLES.OWNER }],
      documents: [document('doc_own', ORG_ID), document('doc_other', OTHER_ORG_ID)],
    });
    const { app } = createServer(createTestServerDependencies({ db, config: overrideConfig({ env: 'test' }) }));
    const request = async ({ path, method, body }: { path: string; method: string; body: unknown }) => app.request(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, { loggedInUserId: USER_ID });
    const product = { name: 'Taza', unitPriceMinor: 1_200, imageDocumentId: 'doc_own' };

    const created = await request({ path: `/api/organizations/${ORG_ID}/invoicing/products`, method: 'POST', body: product });
    expect(created.status).to.eql(201);
    const { product: saved } = await created.json() as { product: { id: string; imageDocumentId: string | null } };
    expect(saved.imageDocumentId).to.eql('doc_own');

    const foreign = await request({ path: `/api/organizations/${ORG_ID}/invoicing/products/${saved.id}`, method: 'PUT', body: { ...product, imageDocumentId: 'doc_other' } });
    expect(foreign.status).to.eql(404);

    const removed = await request({ path: `/api/organizations/${ORG_ID}/invoicing/products/${saved.id}`, method: 'PUT', body: { ...product, imageDocumentId: null } });
    expect((await removed.json() as { product: { imageDocumentId: string | null } }).product.imageDocumentId).to.eql(null);
  });
});
