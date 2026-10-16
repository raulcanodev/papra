import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../../../app/database/database.test-utils';
import { createServer } from '../../../app/server';
import { createTestServerDependencies } from '../../../app/server.test-utils';
import { overrideConfig } from '../../../config/config.test-utils';
import { documentsTable } from '../../../documents/documents.table';
import { ORGANIZATION_ROLES } from '../../../organizations/organizations.constants';

const USER_ID = 'usr_111111111111111111111111';
const ORG_ID = 'org_222222222222222222222222';
const OTHER_USER_ID = 'usr_333333333333333333333333';

describe('ai attachments e2e', () => {
  test('a file attached to the assistant becomes a document, attaching the same file again gives it back instead of failing', async () => {
    const { db } = await createInMemoryDatabase({
      users: [{ id: USER_ID, email: 'user@example.com' }, { id: OTHER_USER_ID, email: 'other@example.com' }],
      organizations: [{ id: ORG_ID, name: 'Acme' }],
      organizationMembers: [{ organizationId: ORG_ID, userId: USER_ID, role: ORGANIZATION_ROLES.OWNER }],
    });
    const { app } = createServer(createTestServerDependencies({ db, config: overrideConfig({ env: 'test', documentsStorage: { driver: 'in-memory' } }) }));

    const attach = async ({ name, userId = USER_ID }: { name: string; userId?: string }) => {
      const formData = new FormData();
      formData.append('file', new File(['Referencia;Precio\nR-1;12,50\n'], name, { type: 'text/csv' }));
      const body = new Response(formData);

      return app.request(`/api/organizations/${ORG_ID}/ai/attachments`, { method: 'POST', headers: Object.fromEntries(body.headers.entries()), body: await body.arrayBuffer() }, { loggedInUserId: userId });
    };

    const first = await attach({ name: 'tarifa.csv' });
    expect(first.status).to.eql(200);
    const { document, isExisting } = await first.json() as { document: { id: string; name: string }; isExisting: boolean };
    expect(document.name).to.eql('tarifa.csv');
    expect(isExisting).to.eql(false);

    const again = await attach({ name: 'tarifa (1).csv' });
    expect(again.status).to.eql(200);
    expect(await again.json()).to.deep.include({ isExisting: true });
    expect((await db.select().from(documentsTable)).map(({ id }) => id)).to.eql([document.id]);

    expect((await attach({ name: 'tarifa.csv', userId: OTHER_USER_ID })).status).to.eql(403);
  });
});
