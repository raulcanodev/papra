import { Buffer } from 'node:buffer';
import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../../app/database/database.test-utils';
import { createServer } from '../../app/server';
import { createTestServerDependencies } from '../../app/server.test-utils';
import { overrideConfig } from '../../config/config.test-utils';
import { ORGANIZATION_ROLES } from '../../organizations/organizations.constants';

const USER_ID = 'usr_111111111111111111111111';
const ORG_ID = 'org_222222222222222222222222';
const OTHER_USER_ID = 'usr_333333333333333333333333';
const OTHER_ORG_ID = 'org_444444444444444444444444';

type DeliveryNote = { id: string; number: string | null; status: 'pending' | 'invoiced'; customerName: string; itemCount: number; invoiceId: string | null; invoiceNumber: string | null };
type Invoice = { id: string; status: string; customerId: string; notes: string | null; subtotalMinor: number; items: Array<{ productId: string | null; description: string; quantityMillis: number; unitPriceMinor: number; taxRateBps: number }> };

async function setupApp() {
  const { db } = await createInMemoryDatabase({
    users: [{ id: USER_ID, email: 'user@example.com' }, { id: OTHER_USER_ID, email: 'other@example.com' }],
    organizations: [{ id: ORG_ID, name: 'Frutas' }, { id: OTHER_ORG_ID, name: 'Other' }],
    organizationMembers: [
      { organizationId: ORG_ID, userId: USER_ID, role: ORGANIZATION_ROLES.OWNER },
      { organizationId: OTHER_ORG_ID, userId: OTHER_USER_ID, role: ORGANIZATION_ROLES.OWNER },
    ],
  });

  const { app } = createServer(createTestServerDependencies({ db, config: overrideConfig({ env: 'test' }) }));

  const request = async ({ path, method = 'GET', body, userId = USER_ID }: { path: string; method?: string; body?: unknown; userId?: string }) => app.request(
    `/api/organizations/${ORG_ID}${path}`,
    { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) },
    { loggedInUserId: userId },
  );

  const json = async <T>(response: Response) => response.json() as Promise<T>;
  const createContact = async (contact: Record<string, unknown>) => (await json<{ contact: { id: string } }>(await request({ path: '/contacts', method: 'POST', body: contact }))).contact;
  const createProduct = async (product: Record<string, unknown>) => (await json<{ product: { id: string } }>(await request({ path: '/invoicing/products', method: 'POST', body: product }))).product;
  const createDeliveryNote = async (draft: Record<string, unknown>) => request({ path: '/delivery-notes', method: 'POST', body: { date: '2026-10-14', ...draft } });
  const listDeliveryNotes = async (query = '') => (await json<{ deliveryNotes: DeliveryNote[] }>(await request({ path: `/delivery-notes${query}` }))).deliveryNotes;

  return { request, json, createContact, createProduct, createDeliveryNote, listDeliveryNotes };
}

describe('delivery notes e2e', () => {
  test('pending delivery notes of a customer become one draft invoice priced from the catalog, deleting that draft makes them pending again', async () => {
    const { request, json, createContact, createProduct, createDeliveryNote, listDeliveryNotes } = await setupApp();
    const customer = await createContact({ name: 'Bar Pepe', isCustomer: true, paymentTermsDays: 15 });
    const tomato = await createProduct({ name: 'Tomate pera', unitPriceMinor: 900, taxRateBps: 400 });

    const first = await json<{ deliveryNote: { id: string } }>(await createDeliveryNote({ customerId: customer.id, number: '0041', date: '2026-10-02', items: [
      { productId: tomato.id, writtenText: '3 caj tom', description: 'Tomate pera', quantityMillis: 3_000 },
    ] }));
    const second = await json<{ deliveryNote: { id: string } }>(await createDeliveryNote({ customerId: customer.id, number: '0042', items: [
      { productId: tomato.id, description: 'Tomate pera', quantityMillis: 2_000 },
      { description: 'Portes', quantityMillis: 1_000 },
    ] }));

    expect((await listDeliveryNotes('?status=pending')).map(({ status, number, customerName, itemCount }) => ({ status, number, customerName, itemCount }))).to.eql([
      { status: 'pending', number: '0042', customerName: 'Bar Pepe', itemCount: 2 },
      { status: 'pending', number: '0041', customerName: 'Bar Pepe', itemCount: 1 },
    ]);

    const invoiced = await request({ path: '/delivery-notes/invoice', method: 'POST', body: { deliveryNoteIds: [second.deliveryNote.id, first.deliveryNote.id] } });
    expect(invoiced.status).to.eql(201);
    const { invoice } = await json<{ invoice: Invoice }>(invoiced);

    expect(invoice).to.include({ status: 'draft', customerId: customer.id, subtotalMinor: 4_500 });
    expect(invoice.notes).to.eql('Albaranes: 0041 (02/10/2026), 0042 (14/10/2026)');
    expect(invoice.items.map(({ productId, description, quantityMillis, unitPriceMinor }) => ({ productId, description, quantityMillis, unitPriceMinor }))).to.eql([
      { productId: tomato.id, description: 'Tomate pera', quantityMillis: 5_000, unitPriceMinor: 900 },
      // Typed without a product: priced by hand on the draft invoice
      { productId: null, description: 'Portes', quantityMillis: 1_000, unitPriceMinor: 0 },
    ]);

    expect((await listDeliveryNotes()).map(({ status, invoiceId }) => ({ status, invoiceId }))).to.eql([
      { status: 'invoiced', invoiceId: invoice.id },
      { status: 'invoiced', invoiceId: invoice.id },
    ]);
    expect(await listDeliveryNotes('?status=pending')).to.eql([]);

    // An invoiced delivery note cannot be changed nor invoiced twice
    expect((await request({ path: `/delivery-notes/${first.deliveryNote.id}`, method: 'DELETE' })).status).to.eql(409);
    expect((await request({ path: '/delivery-notes/invoice', method: 'POST', body: { deliveryNoteIds: [first.deliveryNote.id] } })).status).to.eql(409);

    expect((await request({ path: `/invoicing/invoices/${invoice.id}`, method: 'DELETE' })).status).to.eql(204);
    expect((await listDeliveryNotes('?status=pending')).map(({ id }) => id).toSorted()).to.eql([first.deliveryNote.id, second.deliveryNote.id].toSorted());
  });

  test('one invoice cannot mix the delivery notes of two customers', async () => {
    const { request, json, createContact, createDeliveryNote } = await setupApp();
    const bar = await createContact({ name: 'Bar Pepe', isCustomer: true });
    const shop = await createContact({ name: 'Tienda Ana', isCustomer: true });
    const item = { description: 'Lechuga', quantityMillis: 1_000 };

    const ids = await Promise.all([bar, shop].map(async customer => (await json<{ deliveryNote: { id: string } }>(await createDeliveryNote({ customerId: customer.id, items: [item] }))).deliveryNote.id));

    const response = await request({ path: '/delivery-notes/invoice', method: 'POST', body: { deliveryNoteIds: ids } });

    expect(response.status).to.eql(400);
    expect(await json<{ error: { code: string } }>(response)).to.deep.include({ error: { code: 'delivery_notes.mixed_customers', message: 'The delivery notes of an invoice must all belong to the same customer' } });
  });

  test('a delivery note typed by hand takes the next number, kept when it is edited; its customer must be a customer', async () => {
    const { request, json, createContact, createDeliveryNote, listDeliveryNotes } = await setupApp();
    const customer = await createContact({ name: 'Bar Pepe', isCustomer: true });
    const supplier = await createContact({ name: 'Huerta', isSupplier: true });

    expect((await createDeliveryNote({ customerId: supplier.id, items: [{ description: 'X', quantityMillis: 1_000 }] })).status).to.eql(400);

    // A pad number read on a photo, then two typed by hand
    await createDeliveryNote({ customerId: customer.id, number: '0120', items: [{ description: 'Lechuga', quantityMillis: 1_000 }] });
    const { deliveryNote } = await json<{ deliveryNote: { id: string; number: string } }>(await createDeliveryNote({ customerId: customer.id, items: [{ description: 'Lechuga', quantityMillis: 1_000 }] }));
    await createDeliveryNote({ customerId: customer.id, date: '2026-10-13', items: [{ description: 'Cebolla', quantityMillis: 1_000 }] });
    expect(deliveryNote.number).to.eql('0121');

    const updated = await request({ path: `/delivery-notes/${deliveryNote.id}`, method: 'PUT', body: { customerId: customer.id, date: '2026-10-15', items: [{ description: 'Lechuga', quantityMillis: 4_000 }, { description: 'Ajo', quantityMillis: 1_000 }] } });

    expect(updated.status).to.eql(200);
    expect((await listDeliveryNotes()).map(({ number, itemCount }) => ({ number, itemCount }))).to.eql([{ number: '0121', itemCount: 2 }, { number: '0120', itemCount: 1 }, { number: '0122', itemCount: 1 }]);
  });

  test('a delivery note is printed as a PDF', async () => {
    const { request, json, createContact, createDeliveryNote } = await setupApp();
    const customer = await createContact({ name: 'Bar Pepe', isCustomer: true, addressLine1: 'Calle Mayor 1', city: 'Murcia' });
    const { deliveryNote } = await json<{ deliveryNote: { id: string } }>(await createDeliveryNote({ customerId: customer.id, items: [{ description: 'Lechuga', quantityMillis: 12_000 }] }));

    const response = await request({ path: `/delivery-notes/${deliveryNote.id}/pdf` });

    expect(response.status).to.eql(200);
    expect(response.headers.get('Content-Type')).to.eql('application/pdf');
    expect(response.headers.get('Content-Disposition')).to.eql('inline; filename="albaran-0001.pdf"');
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString()).to.eql('%PDF-');
  });

  test('the delivery notes of another organization are out of reach', async () => {
    const { request, json, createContact, createDeliveryNote } = await setupApp();
    const customer = await createContact({ name: 'Bar Pepe', isCustomer: true });
    const { deliveryNote } = await json<{ deliveryNote: { id: string } }>(await createDeliveryNote({ customerId: customer.id, items: [{ description: 'Lechuga', quantityMillis: 1_000 }] }));

    expect((await request({ path: '/delivery-notes', userId: OTHER_USER_ID })).status).to.eql(403);
    expect((await request({ path: `/delivery-notes/${deliveryNote.id}`, userId: OTHER_USER_ID })).status).to.eql(403);
  });
});
