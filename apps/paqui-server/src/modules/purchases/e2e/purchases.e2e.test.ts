import type { Contact } from '../../contacts/contacts.models';
import type { PurchaseInvoice } from '../purchases.models';
import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../../app/database/database.test-utils';
import { createServer } from '../../app/server';
import { createTestServerDependencies } from '../../app/server.test-utils';
import { overrideConfig } from '../../config/config.test-utils';
import { documentFoldersTable, documentsFoldersTable } from '../../documents/document-folders.table';
import { ORGANIZATION_ROLES } from '../../organizations/organizations.constants';

const USER_ID = 'usr_111111111111111111111111';
const ORG_ID = 'org_222222222222222222222222';
const OTHER_USER_ID = 'usr_333333333333333333333333';
const OTHER_ORG_ID = 'org_444444444444444444444444';

const document = (id: string, organizationId: string) => ({ id, organizationId, name: `${id}.pdf`, originalName: `${id}.pdf`, mimeType: 'application/pdf', originalStorageKey: id, originalSha256Hash: id });

async function setupApp() {
  const { db } = await createInMemoryDatabase({
    users: [{ id: USER_ID, email: 'user@example.com' }, { id: OTHER_USER_ID, email: 'other@example.com' }],
    organizations: [{ id: ORG_ID, name: 'Org 1' }, { id: OTHER_ORG_ID, name: 'Org 2' }],
    organizationMembers: [
      { organizationId: ORG_ID, userId: USER_ID, role: ORGANIZATION_ROLES.OWNER },
      { organizationId: OTHER_ORG_ID, userId: OTHER_USER_ID, role: ORGANIZATION_ROLES.OWNER },
    ],
    documents: [document('doc_own', ORG_ID), document('doc_other', OTHER_ORG_ID)],
  });

  const { app } = createServer(createTestServerDependencies({ db, config: overrideConfig({ env: 'test' }) }));

  const request = async ({ path, method = 'GET', body, userId = USER_ID }: { path: string; method?: string; body?: unknown; userId?: string }) => app.request(
    path,
    { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) },
    { loggedInUserId: userId },
  );

  const createContact = async (contact: Record<string, unknown>) => {
    const response = await request({ path: `/api/organizations/${ORG_ID}/contacts`, method: 'POST', body: contact });
    return (await response.json() as { contact: Contact }).contact;
  };

  const draft = (overrides: Record<string, unknown> = {}) => ({
    number: 'FRA/000011',
    issueDate: '2026-08-03',
    dueDate: '2026-08-18',
    category: 'goods',
    items: [{ description: 'Juegos de base con almohadas', quantityMillis: 100_000, unitPriceMinor: 1_500, taxRateBps: 2_100 }],
    ...overrides,
  });

  const createPurchase = async (body: Record<string, unknown>) => request({ path: `/api/organizations/${ORG_ID}/purchases`, method: 'POST', body });

  return { db, request, createContact, createPurchase, draft };
}

describe('purchases e2e', () => {
  test('a received invoice is registered with its computed totals and its file archived in the supplier folder', async () => {
    const { db, createContact, createPurchase, draft } = await setupApp();

    const supplier = await createContact({ name: 'Sandra Mireya Flores Macas', kind: 'person', taxId: '00000000T', isSupplier: true });
    const response = await createPurchase(draft({ supplierId: supplier.id, documentId: 'doc_own' }));

    expect(response.status).to.eql(201);
    const { purchaseInvoice } = await response.json() as { purchaseInvoice: PurchaseInvoice & { supplier: Contact } };

    expect(purchaseInvoice).to.include({ supplierId: supplier.id, number: 'FRA/000011', status: 'pending', subtotalMinor: 150_000, taxMinor: 31_500, deductibleTaxMinor: 31_500, totalMinor: 181_500 });
    expect(purchaseInvoice.supplier.name).to.eql('Sandra Mireya Flores Macas');

    const [folder] = await db.select().from(documentFoldersTable);
    const [assignment] = await db.select().from(documentsFoldersTable);
    expect(folder?.contactId).to.eql(supplier.id);
    expect(assignment).to.include({ documentId: 'doc_own', folderId: folder?.id });
  });

  test('the same supplier invoice number cannot be registered twice', async () => {
    const { createContact, createPurchase, draft } = await setupApp();

    const supplier = await createContact({ name: 'Nube Hosting SL', isSupplier: true });

    expect((await createPurchase(draft({ supplierId: supplier.id }))).status).to.eql(201);

    const duplicate = await createPurchase(draft({ supplierId: supplier.id }));
    expect(duplicate.status).to.eql(409);
    expect(await duplicate.json()).to.eql({ error: { code: 'purchase_invoice.already_exists', message: 'An invoice with this number from this supplier is already registered.' } });
  });

  test('the supplier must be a contact with the supplier role and the document one of the organization', async () => {
    const { createContact, createPurchase, draft } = await setupApp();

    const customerOnly = await createContact({ name: 'Acme SL', isCustomer: true });
    const supplier = await createContact({ name: 'Nube Hosting SL', isSupplier: true });

    expect((await createPurchase(draft({ supplierId: customerOnly.id }))).status).to.eql(400);
    expect((await createPurchase(draft({ supplierId: supplier.id, documentId: 'doc_other' }))).status).to.eql(404);
  });

  test('purchase invoices are listed by status, marked as paid, and deleted', async () => {
    const { request, createContact, createPurchase, draft } = await setupApp();

    const supplier = await createContact({ name: 'Nube Hosting SL', isSupplier: true });
    const { purchaseInvoice: first } = await (await createPurchase(draft({ supplierId: supplier.id, number: 'A-1' }))).json() as { purchaseInvoice: PurchaseInvoice };
    await createPurchase(draft({ supplierId: supplier.id, number: 'A-2', issueDate: '2026-09-01', dueDate: null }));

    const paid = await request({ path: `/api/organizations/${ORG_ID}/purchases/${first.id}/status`, method: 'PATCH', body: { status: 'paid' } });
    expect((await paid.json() as { purchaseInvoice: PurchaseInvoice }).purchaseInvoice.status).to.eql('paid');

    const list = async (query: string) => {
      const response = await request({ path: `/api/organizations/${ORG_ID}/purchases${query}` });
      return (await response.json() as { purchaseInvoices: (PurchaseInvoice & { supplierName: string })[] }).purchaseInvoices.map(({ number, supplierName }) => `${number} ${supplierName}`);
    };

    expect(await list('')).to.eql(['A-2 Nube Hosting SL', 'A-1 Nube Hosting SL']);
    expect(await list('?status=pending')).to.eql(['A-2 Nube Hosting SL']);
    expect(await list('?from=2026-08-01&to=2026-09-01')).to.eql(['A-1 Nube Hosting SL']);

    expect((await request({ path: `/api/organizations/${ORG_ID}/purchases/${first.id}`, method: 'DELETE' })).status).to.eql(204);
    expect(await list('')).to.eql(['A-2 Nube Hosting SL']);
  });

  test('an old invoice registered as already paid is paid on the date given, not today', async () => {
    const { createContact, createPurchase, draft } = await setupApp();

    const supplier = await createContact({ name: 'Nube Hosting SL', isSupplier: true });
    const response = await createPurchase(draft({
      supplierId: supplier.id,
      issueDate: '2025-03-10',
      dueDate: null,
      instalments: [{ dueDate: '2025-03-10', amountMinor: 181_500, status: 'paid', paidAt: '2025-03-12' }],
    }));
    const { purchaseInvoice } = await response.json() as { purchaseInvoice: PurchaseInvoice & { instalments: { status: string; paidAt: string }[] } };

    expect(purchaseInvoice.status).to.eql('paid');
    expect(new Date(purchaseInvoice.paidAt!).toISOString()).to.eql('2025-03-12T00:00:00.000Z');
    expect(purchaseInvoice.instalments.map(({ status, paidAt }) => [status, paidAt])).to.eql([['paid', '2025-03-12T00:00:00.000Z']]);
  });

  test('the purchase invoices of another organization are neither listed, readable nor editable', async () => {
    const { request, createContact, createPurchase, draft } = await setupApp();

    const supplier = await createContact({ name: 'Nube Hosting SL', isSupplier: true });
    const { purchaseInvoice } = await (await createPurchase(draft({ supplierId: supplier.id }))).json() as { purchaseInvoice: PurchaseInvoice };

    const asOther = async (path: string, method = 'GET', body?: unknown) => request({ path: `/api/organizations/${OTHER_ORG_ID}${path}`, method, body, userId: OTHER_USER_ID });

    expect((await (await asOther('/purchases')).json() as { purchaseInvoices: unknown[] }).purchaseInvoices).to.eql([]);
    expect((await asOther(`/purchases/${purchaseInvoice.id}`)).status).to.eql(404);
    expect((await asOther(`/purchases/${purchaseInvoice.id}/status`, 'PATCH', { status: 'paid' })).status).to.eql(404);
    expect((await asOther(`/purchases/${purchaseInvoice.id}`, 'DELETE')).status).to.eql(404);
  });
});
