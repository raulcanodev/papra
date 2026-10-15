import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../../app/database/database.test-utils';
import { createServer } from '../../app/server';
import { createTestServerDependencies } from '../../app/server.test-utils';
import { overrideConfig } from '../../config/config.test-utils';
import { documentsTable } from '../../documents/documents.table';
import { ORGANIZATION_ROLES } from '../../organizations/organizations.constants';
import { captureSessionsTable } from '../captures.tables';

const USER_ID = 'usr_111111111111111111111111';
const ORG_ID = 'org_222222222222222222222222';
const OTHER_USER_ID = 'usr_333333333333333333333333';

type CaptureSessionDto = { id: string; purpose: string; status: string; documentIds: string[] };

async function setupApp() {
  const { db } = await createInMemoryDatabase({
    users: [{ id: USER_ID, email: 'user@example.com' }, { id: OTHER_USER_ID, email: 'other@example.com' }],
    organizations: [{ id: ORG_ID, name: 'Acme' }],
    organizationMembers: [
      { organizationId: ORG_ID, userId: USER_ID, role: ORGANIZATION_ROLES.OWNER },
      { organizationId: ORG_ID, userId: OTHER_USER_ID, role: ORGANIZATION_ROLES.MEMBER },
    ],
  });

  const { app } = createServer(createTestServerDependencies({ db, config: overrideConfig({ env: 'test', documentsStorage: { driver: 'in-memory' } }) }));

  const openCapture = async ({ purpose = 'purchase' }: { purpose?: string } = {}) => {
    const response = await app.request(`/api/organizations/${ORG_ID}/captures`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purpose }) }, { loggedInUserId: USER_ID });
    return { response, ...(await response.json() as { captureSession: CaptureSessionDto; token: string }) };
  };

  const getCapture = async ({ captureSessionId, userId = USER_ID }: { captureSessionId: string; userId?: string }) => app.request(`/api/organizations/${ORG_ID}/captures/${captureSessionId}`, { method: 'GET' }, { loggedInUserId: userId });

  // The phone has no session, only the token of the QR code
  const sendPhoto = async ({ token, name = 'photo.jpg', type = 'image/jpeg', content = name }: { token: string; name?: string; type?: string; content?: string }) => {
    const formData = new FormData();
    formData.append('file', new File([content], name, { type }));
    const body = new Response(formData);

    return app.request(`/api/captures/${token}/files`, { method: 'POST', headers: Object.fromEntries(body.headers.entries()), body: await body.arrayBuffer() });
  };

  return { db, app, openCapture, getCapture, sendPhoto };
}

describe('captures e2e', () => {
  test('the phone sends photos with the token of the QR code, the computer sees them arrive as documents of the organization', async () => {
    const { db, app, openCapture, getCapture, sendPhoto } = await setupApp();

    const { response, captureSession, token } = await openCapture();
    expect(response.status).to.eql(201);
    expect(captureSession).to.include({ purpose: 'purchase', status: 'waiting' });
    expect(token).toHaveLength(40);

    const capture = await app.request(`/api/captures/${token}`, { method: 'GET' });
    expect(await capture.json()).to.deep.include({ capture: { purpose: 'purchase', status: 'waiting', fileCount: 0, maxFiles: 20, expiresAt: (await db.select().from(captureSessionsTable))[0]!.expiresAt.toISOString(), organizationName: 'Acme' } });

    expect((await sendPhoto({ token, name: 'invoice-1.jpg' })).status).to.eql(201);
    expect((await sendPhoto({ token, name: 'invoice-2.pdf', type: 'application/pdf' })).status).to.eql(201);

    const { captureSession: received } = await (await getCapture({ captureSessionId: captureSession.id })).json() as { captureSession: CaptureSessionDto };
    expect(received.status).to.eql('receiving');
    expect(received.documentIds).toHaveLength(2);

    const documents = await db.select().from(documentsTable);
    expect(documents.map(({ name, organizationId, createdBy }) => ({ name, organizationId, createdBy })).toSorted((a, b) => a.name.localeCompare(b.name))).to.eql([
      { name: 'invoice-1.jpg', organizationId: ORG_ID, createdBy: USER_ID },
      { name: 'invoice-2.pdf', organizationId: ORG_ID, createdBy: USER_ID },
    ]);

    expect((await app.request(`/api/captures/${token}/complete`, { method: 'POST' })).status).to.eql(200);
    const { captureSession: completed } = await (await getCapture({ captureSessionId: captureSession.id })).json() as { captureSession: CaptureSessionDto };
    expect(completed.status).to.eql('completed');

    // A finished capture takes no more photos
    expect((await sendPhoto({ token, name: 'late.jpg' })).status).to.eql(409);
  });

  test('a product capture takes a single image, no PDF', async () => {
    const { openCapture, sendPhoto } = await setupApp();
    const { token } = await openCapture({ purpose: 'product_image' });

    expect((await sendPhoto({ token, name: 'scan.pdf', type: 'application/pdf' })).status).to.eql(400);
    expect((await sendPhoto({ token, name: 'product.jpg' })).status).to.eql(201);
    expect((await sendPhoto({ token, name: 'second.jpg' })).status).to.eql(409);
  });

  test('an unknown or expired token gives nothing away, another member cannot follow the capture', async () => {
    const { db, app, openCapture, getCapture, sendPhoto } = await setupApp();
    const { captureSession, token } = await openCapture();

    expect((await app.request(`/api/captures/${'x'.repeat(40)}`, { method: 'GET' })).status).to.eql(404);
    expect((await getCapture({ captureSessionId: captureSession.id, userId: OTHER_USER_ID })).status).to.eql(404);

    await db.update(captureSessionsTable).set({ expiresAt: new Date(Date.now() - 1_000) });

    expect((await app.request(`/api/captures/${token}`, { method: 'GET' })).status).to.eql(404);
    expect((await sendPhoto({ token })).status).to.eql(404);
  });
});
