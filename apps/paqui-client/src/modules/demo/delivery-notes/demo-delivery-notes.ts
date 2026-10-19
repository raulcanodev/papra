import type { Storage } from 'unstorage';
import type { DeliveryNoteDraftInput, DeliveryNoteReading } from '../../delivery-notes/delivery-notes.types';
import { FetchError } from 'ofetch';
import { prefixStorage } from 'unstorage';
import { defineHandler } from '../demo-api-mock.models';
import { createId } from '../demo.models';
import { getValues } from '../demo.storage.models';
import { createDemoDraftInvoice, getDemoContact, getDemoFiscalProfile, getDemoInvoice, listDemoContacts, listDemoInvoices, listDemoProducts } from '../invoicing/demo-invoicing';
import { daysAgoToDate } from '../invoicing/demo-invoicing.fixtures';
import { getDemoContactPrices } from '../pricing/demo-pricing';

// Delivery notes of the demo, in the browser localStorage like every other demo record, same rules as the server
type Stored = Record<string, any>;

let deliveryNotesStorage: Storage<Stored> | undefined;

export function bindDeliveryNotesStorage(storage: Storage<any>) {
  deliveryNotesStorage = prefixStorage<Stored>(storage, 'deliveryNotes:notes');
}

function db() {
  if (!deliveryNotesStorage) {
    throw new Error('Demo delivery notes storage is not bound');
  }

  return deliveryNotesStorage;
}

function fail({ message, code, status }: { message: string; code?: string; status: number }): never {
  throw Object.assign(new FetchError(message), { status, data: { error: { message, code } } });
}

// Deleting the draft invoice frees its delivery notes: an invoice that no longer exists means pending
async function hydrate(deliveryNote: Stored): Promise<Stored> {
  const [customer, invoice] = await Promise.all([
    getDemoContact({ organizationId: deliveryNote.organizationId, contactId: deliveryNote.customerId }),
    deliveryNote.invoiceId ? getDemoInvoice({ invoiceId: deliveryNote.invoiceId }) : null,
  ]);

  return {
    ...deliveryNote,
    customerName: customer?.name ?? '',
    customerIcon: customer?.icon ?? null,
    customerIconColor: customer?.iconColor ?? null,
    invoiceId: invoice ? deliveryNote.invoiceId : null,
    invoiceNumber: invoice?.number ?? null,
    invoiceStatus: invoice?.status ?? null,
    status: invoice ? 'invoiced' : 'pending',
    itemCount: deliveryNote.items.length,
  };
}

async function listDeliveryNotes({ organizationId }: { organizationId: string }) {
  const deliveryNotes = (await getValues(db())).filter(deliveryNote => deliveryNote.organizationId === organizationId);

  return (await Promise.all(deliveryNotes.map(hydrate))).toSorted((a, b) => String(b.date).localeCompare(String(a.date)));
}

export async function getDemoInvoiceDeliveryNotes({ organizationId, invoiceId }: { organizationId: string; invoiceId: string }) {
  return (await listDeliveryNotes({ organizationId }))
    .filter(deliveryNote => deliveryNote.invoiceId === invoiceId)
    .map(({ id, number, date }) => ({ id, number, date }));
}

// Keeps the browser demo consistent with the server when a draft invoice adds or removes delivery notes.
export async function setDemoInvoiceDeliveryNotes({ organizationId, invoiceId, customerId, deliveryNoteIds }: { organizationId: string; invoiceId: string; customerId: string; deliveryNoteIds: string[] }) {
  const ids = [...new Set(deliveryNoteIds)];
  const selected = await Promise.all(ids.map(async (id) => {
    const stored = await db().getItem(id);
    if (!stored) {
      return null;
    }
    const deliveryNote = await hydrate(stored);
    return deliveryNote.customerId === customerId && (deliveryNote.status === 'pending' || deliveryNote.invoiceId === invoiceId) ? stored : null;
  }));

  if (selected.includes(null)) {
    fail({ message: 'A delivery note is not a pending one of this customer', code: 'invoicing.delivery_notes_unavailable', status: 409 });
  }

  const current = (await getValues(db())).filter(deliveryNote => deliveryNote.organizationId === organizationId && deliveryNote.invoiceId === invoiceId);
  const now = new Date().toISOString();
  await Promise.all([
    ...current.filter(deliveryNote => !ids.includes(deliveryNote.id)).map(async deliveryNote => db().setItem(deliveryNote.id, { ...deliveryNote, invoiceId: null, updatedAt: now })),
    ...selected.map(async deliveryNote => db().setItem(deliveryNote!.id, { ...deliveryNote, invoiceId, updatedAt: now })),
  ]);
}

async function getEditableOrFail({ deliveryNoteId }: { deliveryNoteId: string }) {
  const stored = await db().getItem(deliveryNoteId);

  if (!stored) {
    fail({ message: 'Delivery note not found', code: 'delivery_notes.not_found', status: 404 });
  }

  const deliveryNote = await hydrate(stored);

  if (deliveryNote.status !== 'pending') {
    fail({ message: 'An invoiced delivery note cannot be changed', code: 'delivery_notes.invoiced', status: 409 });
  }

  return deliveryNote;
}

async function buildDeliveryNote({ organizationId, draft, existing }: { organizationId: string; draft: DeliveryNoteDraftInput; existing?: Stored }) {
  const customer = await getDemoContact({ organizationId, contactId: draft.customerId });

  if (!customer) {
    fail({ message: 'Contact not found.', status: 404 });
  }
  if (!customer.isCustomer) {
    fail({ message: 'The contact does not have the role required for this operation.', status: 400 });
  }

  const now = new Date().toISOString();
  // Like the server: typed by hand, it takes the next number; edited, it keeps its own
  const highest = Math.max(0, ...(await getValues(db())).filter(other => other.organizationId === organizationId && /^\d{1,9}$/.test(other.number ?? '')).map(other => Number(other.number)));
  const number = draft.number ?? existing?.number ?? String(highest + 1).padStart(4, '0');

  return {
    ...existing,
    id: existing?.id ?? createId({ prefix: 'dln' }),
    organizationId,
    customerId: draft.customerId,
    number,
    date: new Date(draft.date).toISOString(),
    notes: draft.notes,
    documentId: draft.documentId,
    invoiceId: existing?.invoiceId ?? null,
    items: draft.items.map((item, position) => ({ ...item, id: createId({ prefix: 'dlni' }), position })),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

// The demo has no model to read the photo: whatever is uploaded, it answers with a handwritten note for the first
// customer with two products of the catalog, one read with doubts
async function buildDemoReading({ organizationId, documentId }: { organizationId: string; documentId: string }): Promise<DeliveryNoteReading> {
  const [contacts, products] = await Promise.all([listDemoContacts({ organizationId }), listDemoProducts({ organizationId })]);
  const customer = contacts.find(contact => contact.isCustomer && !contact.archivedAt);
  const [first, second, third] = products.filter(product => product.contactId === null);
  const number = String(4_000 + (await getValues(db())).length + 1);

  return {
    documentId,
    number,
    date: new Date().toISOString().slice(0, 10),
    warnings: ['Demo: este es un albarán de ejemplo. En tu cuenta, la IA lee la foto que envíes.'],
    customer: { name: customer?.name ?? null, taxId: null, contactId: customer?.id ?? null, candidates: [] },
    duplicate: null,
    lines: [
      ...(first ? [{ writtenText: `3 ${first.name.split(' ')[0]!.toLowerCase().slice(0, 6)}.`, quantityMillis: 3_000, productId: first.id, matchedBy: 'reading' as const, confidence: 'high' as const, alternativeProductIds: [] }] : []),
      ...(second ? [{ writtenText: `${second.name.split(' ')[0]!.toLowerCase()} x2`, quantityMillis: 2_000, productId: second.id, matchedBy: 'reading' as const, confidence: 'low' as const, alternativeProductIds: third ? [third.id] : [] }] : []),
    ],
  };
}

// Like the server: the same product adds up on a single line, priced with the customer price list or else the catalog;
// a line typed without a product is priced by hand on the draft invoice
async function buildInvoiceLines({ organizationId, customerId, items }: { organizationId: string; customerId: string; items: Stored[] }) {
  const [products, { priceList, prices }] = await Promise.all([listDemoProducts({ organizationId }), getDemoContactPrices({ organizationId, contactId: customerId })]);
  const lines = new Map<string, Stored>();

  for (const { productId, description, quantityMillis } of items) {
    const key = productId ?? `text:${String(description).toLowerCase()}`;
    const line = lines.get(key);

    lines.set(key, line ? { ...line, quantityMillis: line.quantityMillis + quantityMillis } : { productId, description, quantityMillis });
  }

  return [...lines.values()].map(({ productId, description, quantityMillis }) => {
    const product = products.find(candidate => candidate.id === productId);
    const listPrice = product ? prices.find((price: Stored) => price.productId === product.id) : undefined;

    return {
      productId: product?.id ?? null,
      description,
      quantityMillis,
      unitPriceMinor: listPrice?.priceMinor ?? product?.unitPriceMinor ?? 0,
      taxRateBps: product?.taxRateBps ?? 2_100,
      discountRateBps: listPrice && priceList ? priceList.discountRateBps : 0,
    };
  });
}

// What the demo starts with: the goods handed to a few customers these weeks, most of them not invoiced yet (the
// "not invoiced" banner and the invoice button have something to show), the older ones already on an invoice
const DEMO_DELIVERY_NOTES: Array<{ customerTaxId: string; daysAgo: number; invoiced?: boolean; notes?: string; lines: Array<{ product: 'book' | 'catering' | null; description?: string; quantity: number; writtenText?: string }> }> = [
  { customerTaxId: 'B00000001', daysAgo: 34, invoiced: true, lines: [{ product: 'book', quantity: 12 }] },
  { customerTaxId: 'B00000003', daysAgo: 45, invoiced: true, lines: [{ product: 'book', quantity: 6 }, { product: null, description: 'Portes', quantity: 1 }] },
  { customerTaxId: 'B00000003', daysAgo: 38, invoiced: true, lines: [{ product: 'catering', quantity: 1 }] },
  { customerTaxId: 'B00000003', daysAgo: 11, lines: [{ product: 'book', quantity: 10, writtenText: '10 manual. form.' }] },
  { customerTaxId: 'B00000004', daysAgo: 9, notes: 'Entregar en recepción, preguntar por Ana', lines: [{ product: 'book', quantity: 25 }, { product: null, description: 'Portes', quantity: 1 }] },
  { customerTaxId: 'F00000005', daysAgo: 8, lines: [{ product: 'catering', quantity: 2 }] },
  { customerTaxId: 'B00000003', daysAgo: 6, lines: [{ product: 'book', quantity: 4 }, { product: 'catering', quantity: 1 }] },
  { customerTaxId: 'F00000005', daysAgo: 3, lines: [{ product: 'catering', quantity: 1, writtenText: '1 cater. evento' }] },
  { customerTaxId: 'B00000003', daysAgo: 1, lines: [{ product: 'book', quantity: 8 }] },
];

const DEMO_PRODUCT_NAMES = { book: 'Manual de formación (impreso)', catering: 'Servicio de catering' } as const;

export async function seedDemoDeliveryNotes({ organizationId, now = new Date() }: { organizationId: string; now?: Date }) {
  const [contacts, products, invoices] = await Promise.all([listDemoContacts({ organizationId }), listDemoProducts({ organizationId }), listDemoInvoices()]);
  const sorted = DEMO_DELIVERY_NOTES.toSorted((a, b) => b.daysAgo - a.daysAgo);

  for (const [index, fixture] of sorted.entries()) {
    const customer = contacts.find(contact => contact.taxId === fixture.customerTaxId);

    if (!customer) {
      continue;
    }

    // An invoiced one sits on the latest invoice already issued to that customer, like after "Invoice"
    const invoice = fixture.invoiced
      ? invoices.filter(candidate => candidate.organizationId === organizationId && candidate.customerId === customer.id && candidate.status !== 'draft').toSorted((a, b) => String(b.issueDate).localeCompare(String(a.issueDate)))[0]
      : undefined;
    const date = daysAgoToDate(now, fixture.daysAgo);
    const stamp = date.toISOString();

    await db().setItem(`dln_demo${index}`, {
      id: `dln_demo${index}`,
      organizationId,
      customerId: customer.id,
      number: String(index + 1).padStart(4, '0'),
      date: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString(),
      notes: fixture.notes ?? null,
      documentId: null,
      invoiceId: invoice?.id ?? null,
      items: fixture.lines.map((line, position) => {
        const product = line.product === null ? undefined : products.find(candidate => candidate.name === DEMO_PRODUCT_NAMES[line.product!]);

        return { id: `dlni_demo${index}_${position}`, position, productId: product?.id ?? null, writtenText: line.writtenText ?? null, description: product?.name ?? line.description ?? '', quantityMillis: line.quantity * 1_000 };
      }),
      createdAt: stamp,
      updatedAt: stamp,
    });
  }
}

const base = '/api/organizations/:organizationId/delivery-notes';

export const deliveryNotesHandlers = {
  ...defineHandler({
    path: base,
    method: 'GET',
    handler: async ({ params: { organizationId }, query }) => {
      const { status, customerId } = (query ?? {}) as { status?: string; customerId?: string };
      const deliveryNotes = await listDeliveryNotes({ organizationId });

      return { deliveryNotes: deliveryNotes.filter(deliveryNote => (!status || deliveryNote.status === status) && (!customerId || deliveryNote.customerId === customerId)) };
    },
  }),
  ...defineHandler({
    path: base,
    method: 'POST',
    handler: async ({ params: { organizationId }, body }) => {
      const deliveryNote = await buildDeliveryNote({ organizationId, draft: body as DeliveryNoteDraftInput });
      await db().setItem(deliveryNote.id, deliveryNote);

      return { deliveryNote: await hydrate(deliveryNote) };
    },
  }),
  ...defineHandler({
    path: `${base}/read`,
    method: 'POST',
    handler: async ({ params: { organizationId }, body }) => {
      await new Promise(resolve => setTimeout(resolve, 1_200));

      return { reading: await buildDemoReading({ organizationId, documentId: (body as { documentId: string }).documentId }) };
    },
  }),
  ...defineHandler({
    path: `${base}/invoice`,
    method: 'POST',
    handler: async ({ params: { organizationId }, body }) => {
      const { deliveryNoteIds } = body as { deliveryNoteIds: string[] };
      const deliveryNotes = await Promise.all(deliveryNoteIds.map(async deliveryNoteId => getEditableOrFail({ deliveryNoteId })));
      const [{ customerId }] = deliveryNotes as [Stored, ...Stored[]];

      if (deliveryNotes.some(deliveryNote => deliveryNote.customerId !== customerId)) {
        fail({ message: 'The delivery notes of an invoice must all belong to the same customer', code: 'delivery_notes.mixed_customers', status: 400 });
      }

      const [customer, profile] = await Promise.all([getDemoContact({ organizationId, contactId: customerId }), getDemoFiscalProfile({ organizationId })]);
      const sorted = deliveryNotes.toSorted((a, b) => String(a.date).localeCompare(String(b.date)));
      const formatDate = (date: string) => new Date(date).toLocaleDateString('es-ES', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });
      const issueDate = new Date();
      const invoice = await createDemoDraftInvoice({
        organizationId,
        draft: {
          customerId,
          issueDate,
          dueDate: new Date(issueDate.getTime() + (customer?.paymentTermsDays ?? 30) * 24 * 60 * 60 * 1_000),
          currency: customer?.currency ?? 'EUR',
          templateId: 'minimal',
          withholdingRateBps: profile?.defaultWithholdingRateBps ?? 0,
          notes: `Albaranes: ${sorted.map(deliveryNote => (deliveryNote.number ? `${deliveryNote.number} (${formatDate(deliveryNote.date)})` : formatDate(deliveryNote.date))).join(', ')}`,
          items: await buildInvoiceLines({ organizationId, customerId, items: sorted.flatMap(deliveryNote => deliveryNote.items) }),
        },
      });

      await Promise.all(deliveryNotes.map(async deliveryNote => db().setItem(deliveryNote.id, { ...(await db().getItem(deliveryNote.id)), invoiceId: invoice.id })));

      return { invoice };
    },
  }),
  ...defineHandler({
    path: `${base}/:deliveryNoteId`,
    method: 'GET',
    handler: async ({ params: { deliveryNoteId } }) => {
      const deliveryNote = await db().getItem(deliveryNoteId);

      if (!deliveryNote) {
        fail({ message: 'Delivery note not found', code: 'delivery_notes.not_found', status: 404 });
      }

      return { deliveryNote: await hydrate(deliveryNote) };
    },
  }),
  ...defineHandler({
    path: `${base}/:deliveryNoteId/pdf`,
    method: 'GET',
    handler: async ({ params: { organizationId, deliveryNoteId } }) => {
      const deliveryNote = await db().getItem(deliveryNoteId);

      if (!deliveryNote) {
        fail({ message: 'Delivery note not found', code: 'delivery_notes.not_found', status: 404 });
      }

      const [customer, profile] = await Promise.all([getDemoContact({ organizationId, contactId: deliveryNote.customerId }), getDemoFiscalProfile({ organizationId })]);
      const { renderDemoDeliveryNotePdf } = await import('./demo-delivery-note-pdf');

      return renderDemoDeliveryNotePdf({ deliveryNote, seller: profile ?? {}, customer: customer ?? {} });
    },
  }),
  ...defineHandler({
    path: `${base}/:deliveryNoteId`,
    method: 'PUT',
    handler: async ({ params: { organizationId, deliveryNoteId }, body }) => {
      const existing = await getEditableOrFail({ deliveryNoteId });
      const deliveryNote = await buildDeliveryNote({ organizationId, draft: body as DeliveryNoteDraftInput, existing });
      await db().setItem(deliveryNote.id, deliveryNote);

      return { deliveryNote: await hydrate(deliveryNote) };
    },
  }),
  ...defineHandler({
    path: `${base}/:deliveryNoteId`,
    method: 'DELETE',
    handler: async ({ params: { deliveryNoteId } }) => {
      await getEditableOrFail({ deliveryNoteId });
      await db().removeItem(deliveryNoteId);
    },
  }),
};
