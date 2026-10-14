import type { Storage } from 'unstorage';
import type { PurchaseInvoiceDraftInput } from '../../purchases/purchases.types';
import { FetchError } from 'ofetch';
import { prefixStorage } from 'unstorage';
import { calculatePurchaseInvoiceTotals } from '../../purchases/purchases.models';
import { defineHandler } from '../demo-api-mock.models';
import { createId } from '../demo.models';
import { getValues } from '../demo.storage.models';
import { getDemoContact, listDemoContacts } from '../invoicing/demo-invoicing';
import { daysAgoToDate, demoSuppliers } from '../invoicing/demo-invoicing.fixtures';

// Received invoices of the demo, in the browser localStorage like every other demo record, same rules as the server
type Stored = Record<string, any>;

let purchasesStorage: Storage<Stored> | undefined;

export function bindPurchasesStorage(storage: Storage<any>) {
  purchasesStorage = prefixStorage<Stored>(storage, 'purchases:invoices');
}

function db() {
  if (!purchasesStorage) {
    throw new Error('Demo purchases storage is not bound');
  }

  return purchasesStorage;
}

function fail(message: string, status: number): never {
  throw Object.assign(new FetchError(message), { status, data: { error: { message } } });
}

async function buildPurchaseInvoice({ organizationId, draft, existing }: { organizationId: string; draft: PurchaseInvoiceDraftInput; existing?: Stored }): Promise<Stored> {
  const supplier = await getDemoContact({ organizationId, contactId: draft.supplierId });
  if (!supplier) {
    fail('Contact not found.', 404);
  }
  if (!supplier.isSupplier) {
    fail('The contact does not have the role required for this operation.', 400);
  }

  const duplicate = (await getValues(db())).find(other => other.organizationId === organizationId && other.supplierId === draft.supplierId && other.number === draft.number && other.id !== existing?.id);
  if (duplicate) {
    throw Object.assign(new FetchError('Duplicate'), { status: 409, data: { error: { code: 'purchase_invoice.already_exists', message: 'An invoice with this number from this supplier is already registered.' } } });
  }

  const now = new Date().toISOString();
  const { payableMinor: _payableMinor, ...totals } = calculatePurchaseInvoiceTotals({ items: draft.items, withholdingRateBps: draft.withholdingRateBps });

  return {
    ...existing,
    ...draft,
    ...totals,
    id: existing?.id ?? createId({ prefix: 'pinv' }),
    organizationId,
    issueDate: new Date(draft.issueDate).toISOString(),
    dueDate: draft.dueDate ? new Date(draft.dueDate).toISOString() : null,
    items: draft.items.map((item, position) => ({ ...item, id: createId({ prefix: 'pitm' }), position })),
    status: existing?.status ?? 'pending',
    paidAt: existing?.paidAt ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

async function withSupplier({ organizationId, purchaseInvoice }: { organizationId: string; purchaseInvoice: Stored }) {
  const supplier = await getDemoContact({ organizationId, contactId: purchaseInvoice.supplierId });

  return { ...purchaseInvoice, supplier, supplierName: supplier?.name ?? '—', supplierTaxId: supplier?.taxId ?? null };
}

async function getOwnedPurchaseInvoice({ organizationId, purchaseInvoiceId }: { organizationId: string; purchaseInvoiceId: string }) {
  const purchaseInvoice = await db().getItem(purchaseInvoiceId);
  if (!purchaseInvoice || purchaseInvoice.organizationId !== organizationId) {
    fail('Purchase invoice not found.', 404);
  }

  return purchaseInvoice;
}

export async function seedDemoPurchases({ organizationId, now = new Date() }: { organizationId: string; now?: Date }) {
  const contacts = await listDemoContacts({ organizationId });
  const findSupplier = (taxId: string) => contacts.find(contact => contact.isSupplier && contact.taxId === taxId);
  const hosting = findSupplier(demoSuppliers[0]!.taxId);
  const stationery = findSupplier(demoSuppliers[1]!.taxId);
  if (!hosting || !stationery) {
    return;
  }

  const fixtures = [
    { supplier: hosting, number: 'NUBE-2026-0918', daysAgo: 26, category: 'software', status: 'paid', items: [{ description: 'Hosting y dominio (trimestre)', quantityMillis: 3_000, unitPriceMinor: 4_500, taxRateBps: 2_100, discountRateBps: 0, deductibleRateBps: 10_000 }] },
    { supplier: stationery, number: 'PAP-0457', daysAgo: 12, category: 'supplies', status: 'pending', items: [{ description: 'Material de oficina', quantityMillis: 1_000, unitPriceMinor: 8_650, taxRateBps: 2_100, discountRateBps: 0, deductibleRateBps: 10_000 }, { description: 'Libros técnicos', quantityMillis: 2_000, unitPriceMinor: 2_400, taxRateBps: 400, discountRateBps: 0, deductibleRateBps: 10_000 }] },
  ];

  for (const fixture of fixtures) {
    const issueDate = daysAgoToDate(now, fixture.daysAgo);
    const purchaseInvoice = await buildPurchaseInvoice({
      organizationId,
      draft: { supplierId: fixture.supplier.id, number: fixture.number, issueDate, dueDate: daysAgoToDate(now, fixture.daysAgo - 30), currency: 'EUR', category: fixture.category as PurchaseInvoiceDraftInput['category'], withholdingRateBps: 0, notes: null, documentId: null, items: fixture.items },
    });
    await db().setItem(purchaseInvoice.id, { ...purchaseInvoice, status: fixture.status, paidAt: fixture.status === 'paid' ? issueDate.toISOString() : null });
  }
}

// The demo has no AI: a received invoice "read" from any uploaded file, from a supplier the demo does not know yet,
// so the visitor sees the whole flow (supplier creation, prefilled lines, review)
export function buildDemoExtraction({ documentId, now = new Date() }: { documentId: string; now?: Date }) {
  const issueDate = daysAgoToDate(now, 3);

  return {
    direction: 'received',
    draft: {
      supplierId: null,
      number: `FRA/${String(now.getTime()).slice(-6)}`,
      issueDate: issueDate.toISOString(),
      dueDate: daysAgoToDate(now, -12).toISOString(),
      currency: 'EUR',
      category: 'goods',
      withholdingRateBps: 0,
      documentId,
      items: [
        { description: 'Juegos de base con almohadas', quantityMillis: 100_000, unitPriceMinor: 1_500, taxRateBps: 2_100, discountRateBps: 0, deductibleRateBps: 10_000 },
        { description: 'Portes', quantityMillis: 1_000, unitPriceMinor: 2_250, taxRateBps: 2_100, discountRateBps: 0, deductibleRateBps: 10_000 },
      ],
    },
    counterparty: { contactId: null, hasSupplierRole: false, name: 'Textiles Ejemplo SL', taxId: 'B00000020', email: 'facturas@textiles.example', addressLine1: 'Calle del Telar 8', postalCode: '03801', city: 'Alcoy', country: 'ES' },
    printedTotal: 184_223,
  };
}

export const purchasesHandlers = {
  ...defineHandler({
    path: '/api/organizations/:organizationId/purchases',
    method: 'GET',
    handler: async ({ params: { organizationId }, query }: any) => {
      const purchaseInvoices = (await getValues(db()))
        .filter(purchaseInvoice => purchaseInvoice.organizationId === organizationId && (!query?.status || purchaseInvoice.status === query.status))
        .sort((a, b) => String(b.issueDate).localeCompare(String(a.issueDate)));

      return { purchaseInvoices: await Promise.all(purchaseInvoices.map(async purchaseInvoice => withSupplier({ organizationId, purchaseInvoice }))) };
    },
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/purchases/:purchaseInvoiceId',
    method: 'GET',
    handler: async ({ params: { organizationId, purchaseInvoiceId } }: any) => ({ purchaseInvoice: await withSupplier({ organizationId, purchaseInvoice: await getOwnedPurchaseInvoice({ organizationId, purchaseInvoiceId }) }) }),
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/purchases',
    method: 'POST',
    handler: async ({ params: { organizationId }, body }: any) => {
      const purchaseInvoice = await buildPurchaseInvoice({ organizationId, draft: body });
      await db().setItem(purchaseInvoice.id, purchaseInvoice);

      return { purchaseInvoice: await withSupplier({ organizationId, purchaseInvoice }) };
    },
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/purchases/:purchaseInvoiceId',
    method: 'PUT',
    handler: async ({ params: { organizationId, purchaseInvoiceId }, body }: any) => {
      const existing = await getOwnedPurchaseInvoice({ organizationId, purchaseInvoiceId });
      const purchaseInvoice = await buildPurchaseInvoice({ organizationId, draft: body, existing });
      await db().setItem(purchaseInvoice.id, purchaseInvoice);

      return { purchaseInvoice: await withSupplier({ organizationId, purchaseInvoice }) };
    },
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/purchases/:purchaseInvoiceId/status',
    method: 'PATCH',
    handler: async ({ params: { organizationId, purchaseInvoiceId }, body }: any) => {
      const existing = await getOwnedPurchaseInvoice({ organizationId, purchaseInvoiceId });
      const now = new Date().toISOString();
      const purchaseInvoice = { ...existing, status: body.status, paidAt: body.status === 'paid' ? now : null, updatedAt: now };
      await db().setItem(purchaseInvoiceId, purchaseInvoice);

      return { purchaseInvoice: await withSupplier({ organizationId, purchaseInvoice }) };
    },
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/purchases/:purchaseInvoiceId',
    method: 'DELETE',
    handler: async ({ params: { organizationId, purchaseInvoiceId } }: any) => {
      await getOwnedPurchaseInvoice({ organizationId, purchaseInvoiceId });
      await db().removeItem(purchaseInvoiceId);

      return {};
    },
  }),
};
