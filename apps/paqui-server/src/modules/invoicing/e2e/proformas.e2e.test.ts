import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../../app/database/database.test-utils';
import { createServer } from '../../app/server';
import { createTestServerDependencies } from '../../app/server.test-utils';
import { overrideConfig } from '../../config/config.test-utils';
import { ORGANIZATION_ROLES } from '../../organizations/organizations.constants';

const USER_ID = 'usr_111111111111111111111111';
const ORG_ID = 'org_222222222222222222222222';

type Invoice = { id: string; status: string; number: string | null; dueDate: string | null; seriesId: string | null; sentAt: string | null; convertedInvoiceId: string | null; totalMinor: number; items: Array<{ description: string; quantityMillis: number; unitPriceMinor: number }> };

async function setupApp() {
  const { db } = await createInMemoryDatabase({
    users: [{ id: USER_ID, email: 'user@example.com' }],
    organizations: [{ id: ORG_ID, name: 'Frutas' }],
    organizationMembers: [{ organizationId: ORG_ID, userId: USER_ID, role: ORGANIZATION_ROLES.OWNER }],
  });

  const { app } = createServer(createTestServerDependencies({ db, config: overrideConfig({ env: 'test' }) }));

  const request = async ({ path, method = 'GET', body }: { path: string; method?: string; body?: unknown }) => app.request(
    `/api/organizations/${ORG_ID}${path}`,
    { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) },
    { loggedInUserId: USER_ID },
  );
  const json = async <T>(response: Response) => response.json() as Promise<T>;

  const { contact: customer } = await json<{ contact: { id: string } }>(await request({ path: '/contacts', method: 'POST', body: { name: 'Bar Pepe', email: 'pepe@example.com', isCustomer: true, paymentTermsDays: 15 } }));
  await request({ path: '/invoicing/profile', method: 'PUT', body: { legalName: 'Frutas SL', taxId: 'B12345678', locale: 'es-ES' } });

  const draft = { customerId: customer.id, issueDate: '2026-10-14', dueDate: '2026-11-14', currency: 'EUR', templateId: 'minimal', withholdingRateBps: 0, items: [{ description: 'Tomate pera', quantityMillis: 2_000, unitPriceMinor: 900, taxRateBps: 400 }] };
  const createProforma = async () => (await json<{ invoice: Invoice }>(await request({ path: '/invoicing/invoices', method: 'POST', body: { ...draft, isProforma: true } }))).invoice;
  const listInvoices = async (query = '') => (await json<{ invoices: Invoice[] }>(await request({ path: `/invoicing/invoices${query}` }))).invoices;

  return { request, json, draft, createProforma, listInvoices };
}

describe('proformas e2e', () => {
  test('a proforma takes no number, no due date and nothing to collect, and is left out of the invoices', async () => {
    const { request, createProforma, listInvoices } = await setupApp();

    const proforma = await createProforma();

    expect(proforma).toMatchObject({ status: 'proforma', number: null, dueDate: null, seriesId: null, convertedInvoiceId: null });
    expect(await listInvoices()).toEqual([]);
    expect((await listInvoices('?status=proforma')).map(({ id }) => id)).toEqual([proforma.id]);

    const dueDates = await request({ path: '/due-dates' });
    expect(dueDates.status).toBe(200);
    expect(JSON.stringify(await dueDates.json())).not.toContain(proforma.id);
  });

  test('a proforma can never be issued nor marked as paid', async () => {
    const { request, createProforma } = await setupApp();
    const proforma = await createProforma();

    expect((await request({ path: `/invoicing/invoices/${proforma.id}/issue`, method: 'POST' })).status).toBe(409);
    expect((await request({ path: `/invoicing/invoices/${proforma.id}/paid`, method: 'POST' })).status).toBe(409);
  });

  test('its PDF is available from the start, and sending it keeps it a proforma', async () => {
    const { request, json, createProforma } = await setupApp();
    const proforma = await createProforma();

    const pdf = await request({ path: `/invoicing/invoices/${proforma.id}/pdf` });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get('Content-Type')).toBe('application/pdf');

    const { invoice } = await json<{ invoice: Invoice }>(await request({ path: `/invoicing/invoices/${proforma.id}/send`, method: 'POST' }));
    expect(invoice.status).toBe('proforma');
    expect(invoice.number).toBe(null);
    expect(invoice.sentAt).not.toBe(null);
  });

  test('it stays editable once sent, and converting it makes a draft invoice with its lines, once', async () => {
    const { request, json, draft, createProforma, listInvoices } = await setupApp();
    const proforma = await createProforma();
    await request({ path: `/invoicing/invoices/${proforma.id}/send`, method: 'POST' });

    const edited = await request({ path: `/invoicing/invoices/${proforma.id}`, method: 'PUT', body: { ...draft, items: [{ description: 'Tomate pera', quantityMillis: 3_000, unitPriceMinor: 900, taxRateBps: 400 }] } });
    expect(edited.status).toBe(200);
    expect((await json<{ invoice: Invoice }>(edited)).invoice.status).toBe('proforma');

    const converted = await request({ path: `/invoicing/invoices/${proforma.id}/convert`, method: 'POST' });
    expect(converted.status).toBe(201);
    const { invoice } = await json<{ invoice: Invoice }>(converted);

    expect(invoice).toMatchObject({ status: 'draft', number: null });
    expect(invoice.id).not.toBe(proforma.id);
    expect(invoice.dueDate).not.toBe(null);
    expect(invoice.items.map(({ description, quantityMillis, unitPriceMinor }) => ({ description, quantityMillis, unitPriceMinor }))).toEqual([{ description: 'Tomate pera', quantityMillis: 3_000, unitPriceMinor: 900 }]);

    const [linked] = await listInvoices('?status=proforma');
    expect(linked).toMatchObject({ id: proforma.id, status: 'proforma', convertedInvoiceId: invoice.id });

    expect((await request({ path: `/invoicing/invoices/${proforma.id}/convert`, method: 'POST' })).status).toBe(409);
    expect((await request({ path: `/invoicing/invoices/${proforma.id}`, method: 'PUT', body: draft })).status).toBe(409);
  });

  test('deleting the draft made from a proforma lets it be converted again', async () => {
    const { request, json, createProforma, listInvoices } = await setupApp();
    const proforma = await createProforma();
    const { invoice } = await json<{ invoice: Invoice }>(await request({ path: `/invoicing/invoices/${proforma.id}/convert`, method: 'POST' }));

    expect((await request({ path: `/invoicing/invoices/${invoice.id}`, method: 'DELETE' })).status).toBe(204);

    expect((await listInvoices('?status=proforma'))[0]?.convertedInvoiceId).toBe(null);
    expect((await request({ path: `/invoicing/invoices/${proforma.id}/convert`, method: 'POST' })).status).toBe(201);
  });

  test('only a proforma can be converted', async () => {
    const { request, json, draft } = await setupApp();
    const { invoice } = await json<{ invoice: Invoice }>(await request({ path: '/invoicing/invoices', method: 'POST', body: draft }));

    expect((await request({ path: `/invoicing/invoices/${invoice.id}/convert`, method: 'POST' })).status).toBe(409);
  });

  test('a proforma can be deleted, even once sent', async () => {
    const { request, createProforma, listInvoices } = await setupApp();
    const proforma = await createProforma();
    await request({ path: `/invoicing/invoices/${proforma.id}/send`, method: 'POST' });

    expect((await request({ path: `/invoicing/invoices/${proforma.id}`, method: 'DELETE' })).status).toBe(204);
    expect(await listInvoices('?status=proforma')).toEqual([]);
  });
});
