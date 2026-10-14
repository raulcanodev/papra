import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../../app/database/database.test-utils';
import { createServer } from '../../app/server';
import { createTestServerDependencies } from '../../app/server.test-utils';
import { overrideConfig } from '../../config/config.test-utils';
import { ORGANIZATION_ROLES } from '../../organizations/organizations.constants';

const USER_ID = 'usr_111111111111111111111111';
const ORG_ID = 'org_222222222222222222222222';
const OUTSIDER_ID = 'usr_333333333333333333333333';

type ApprovalResponse = { success: boolean; error?: string; result: { contact: { id: string }; invoice: { id: string } } };

async function setupApp() {
  const { db } = await createInMemoryDatabase({
    users: [{ id: USER_ID, email: 'user@example.com' }, { id: OUTSIDER_ID, email: 'outsider@example.com' }],
    organizations: [{ id: ORG_ID, name: 'Org 1' }],
    organizationMembers: [{ organizationId: ORG_ID, userId: USER_ID, role: ORGANIZATION_ROLES.OWNER }],
  });

  const { app } = createServer(createTestServerDependencies({ db, config: overrideConfig({ env: 'test' }) }));

  const request = async ({ path, method = 'GET', body, userId = USER_ID }: { path: string; method?: string; body?: unknown; userId?: string }) => app.request(
    path,
    { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) },
    { loggedInUserId: userId },
  );

  // What the web app calls when the user approves a card
  const approve = async ({ toolName, args, userId = USER_ID }: { toolName: string; args: Record<string, unknown>; userId?: string }) => {
    const response = await request({ path: `/api/organizations/${ORG_ID}/ai/tools/execute`, method: 'POST', body: { toolName, args }, userId });

    return { status: response.status, body: await response.json() as ApprovalResponse };
  };

  return { request, approve };
}

describe('ai assistant approved actions e2e', () => {
  test('an approved card runs the shared catalog tool as the user, through the same API as the web app', async () => {
    const { request, approve } = await setupApp();

    const created = await approve({ toolName: 'create_contact', args: { name: 'Acme SL', taxId: 'B12345678', email: 'billing@acme.es', isCustomer: true } });
    expect(created.body).to.include({ success: true });
    const contactId = created.body.result.contact.id;

    // Human units in, API units stored: 2 x 100.50 € at 21% VAT
    const invoice = await approve({
      toolName: 'create_invoice_draft',
      args: { customerId: contactId, issueDate: '2026-10-01', dueDate: '2026-10-31', items: [{ description: 'Consultoría', quantity: 2, unitPrice: 100.5, taxRatePercent: 21 }] },
    });
    expect(invoice.body).to.include({ success: true });

    const { invoice: stored } = await (await request({ path: `/api/organizations/${ORG_ID}/invoicing/invoices/${invoice.body.result.invoice.id}` })).json() as { invoice: { subtotalMinor: number; taxMinor: number; totalMinor: number } };
    expect(stored).to.include({ subtotalMinor: 20_100, taxMinor: 4_221, totalMinor: 24_321 });
  });

  test('an update only changes the fields it carries', async () => {
    const { request, approve } = await setupApp();

    const { body: { result: { contact } } } = await approve({ toolName: 'create_contact', args: { name: 'Acme SL', taxId: 'B1', isCustomer: true, paymentTermsDays: 45 } });
    await approve({ toolName: 'update_contact', args: { contactId: contact.id, phone: '600123123' } });

    const { contact: stored } = await (await request({ path: `/api/organizations/${ORG_ID}/contacts/${contact.id}` })).json() as { contact: Record<string, unknown> };
    expect(stored).to.include({ name: 'Acme SL', taxId: 'B1', phone: '600123123', paymentTermsDays: 45, isCustomer: true });
  });

  test('deleting archives, and a failure is reported to the card instead of crashing', async () => {
    const { request, approve } = await setupApp();

    const { body: { result: { contact } } } = await approve({ toolName: 'create_contact', args: { name: 'Old SL', isSupplier: true } });

    expect((await approve({ toolName: 'delete_contact', args: { contactId: contact.id } })).body).to.include({ success: true });
    expect((await (await request({ path: `/api/organizations/${ORG_ID}/contacts` })).json() as { contacts: unknown[] }).contacts).to.eql([]);
    expect((await approve({ toolName: 'delete_contact', args: { contactId: contact.id } })).body).to.include({ success: false, error: 'Contact not found.' });
  });

  test('only tools that need an approval can be executed this way, and only by organization members', async () => {
    const { approve } = await setupApp();

    expect((await approve({ toolName: 'list_contacts', args: {} })).status).to.eql(400);
    expect((await approve({ toolName: 'create_contact', args: { name: 'Intruder' }, userId: OUTSIDER_ID })).status).to.eql(403);
  });
});
