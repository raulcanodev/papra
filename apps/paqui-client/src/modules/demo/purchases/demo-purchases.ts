import type { Storage } from 'unstorage';
import type { PurchaseInvoiceDraftInput } from '../../purchases/purchases.types';
import { FetchError } from 'ofetch';
import { prefixStorage } from 'unstorage';
import { addDays } from '../../due-dates/due-dates.models';
import { calculatePurchaseInvoiceTotals } from '../../purchases/purchases.models';
import { defineHandler } from '../demo-api-mock.models';
import { createId } from '../demo.models';
import { getValues } from '../demo.storage.models';
import { buildDemoInstalments, getDemoSettledState } from '../due-dates/demo-due-dates.models';
import { getDemoContact, listDemoContacts } from '../invoicing/demo-invoicing';
import { daysAgoToDate } from '../invoicing/demo-invoicing.fixtures';

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
  const { payableMinor, ...totals } = calculatePurchaseInvoiceTotals({ items: draft.items, withholdingRateBps: draft.withholdingRateBps });
  const { instalments: _instalments, ...fields } = draft;
  const instalments = buildDemoInstalments({ draft, existing: existing?.instalments, supplierTermsDays: supplier.paymentTermsDays ?? 30, payableMinor, now });
  const settled = instalments.length > 0 ? getDemoSettledState(instalments) : { status: existing?.status ?? 'pending', paidAt: existing?.paidAt ?? null };

  return {
    ...existing,
    ...fields,
    ...totals,
    id: existing?.id ?? createId({ prefix: 'pinv' }),
    organizationId,
    issueDate: new Date(draft.issueDate).toISOString(),
    dueDate: instalments.map(({ dueDate }) => dueDate).toSorted()[0] ?? (draft.dueDate ? new Date(draft.dueDate).toISOString() : null),
    paymentMethod: draft.paymentMethod ?? null,
    items: draft.items.map((item, position) => ({ ...item, id: createId({ prefix: 'pitm' }), position })),
    instalments,
    status: settled.status,
    paidAt: settled.paidAt,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

async function withSupplier({ organizationId, purchaseInvoice }: { organizationId: string; purchaseInvoice: Stored }) {
  const supplier = await getDemoContact({ organizationId, contactId: purchaseInvoice.supplierId });

  const instalments = ((purchaseInvoice.instalments ?? []) as Stored[]).map(instalment => ({ ...instalment, direction: 'payable', purchaseInvoiceId: purchaseInvoice.id, invoiceId: null, contactId: purchaseInvoice.supplierId, currency: purchaseInvoice.currency }));

  return { ...purchaseInvoice, instalments, supplier, supplierName: supplier?.name ?? '—', supplierTaxId: supplier?.taxId ?? null, supplierIcon: supplier?.icon ?? null, supplierIconColor: supplier?.iconColor ?? null };
}

async function getOwnedPurchaseInvoice({ organizationId, purchaseInvoiceId }: { organizationId: string; purchaseInvoiceId: string }) {
  const purchaseInvoice = await db().getItem(purchaseInvoiceId);
  if (!purchaseInvoice || purchaseInvoice.organizationId !== organizationId) {
    fail('Purchase invoice not found.', 404);
  }

  return purchaseInvoice;
}

type PurchaseLine = PurchaseInvoiceDraftInput['items'][number];

type RecurringExpense = {
  supplierTaxId: string;
  prefix: string;
  category: PurchaseInvoiceDraftInput['category'];
  /** An invoice unless said otherwise: the train and the stationery shop give a ticket */
  kind?: PurchaseInvoiceDraftInput['kind'];
  /** Every how many months it is billed */
  everyMonths: number;
  dayOfMonth: number;
  withholdingRateBps: number;
  paymentMethod: PurchaseInvoiceDraftInput['paymentMethod'];
  line: (monthIndex: number) => Omit<PurchaseLine, 'discountRateBps' | 'deductibleRateBps' | 'quantityMillis'> & { quantityMillis?: number; deductibleRateBps?: number };
};

// What a two person studio spends in a year: desk rent (with the 19% withholding of model 115), the accountant (15%,
// model 111), hosting, phone, ads, insurance and bank fees (VAT exempt), plus the odd trip and stationery.
// Deterministic, so every visitor sees the same figures, and dated from the visit so the current quarter is never empty.
const RECURRING_EXPENSES: RecurringExpense[] = [
  { supplierTaxId: 'B00000012', prefix: 'CW-', category: 'rent', everyMonths: 1, dayOfMonth: 1, withholdingRateBps: 1_900, paymentMethod: 'transfer', line: () => ({ description: 'Cuota mensual de dos puestos fijos', unitPriceMinor: 35_000, taxRateBps: 2_100 }) },
  { supplierTaxId: 'B00000013', prefix: 'GM/', category: 'professional_services', everyMonths: 1, dayOfMonth: 5, withholdingRateBps: 1_500, paymentMethod: 'transfer', line: () => ({ description: 'Asesoría contable, fiscal y laboral', unitPriceMinor: 9_000, taxRateBps: 2_100 }) },
  { supplierTaxId: 'A00000015', prefix: 'TE-', category: 'supplies', everyMonths: 1, dayOfMonth: 8, withholdingRateBps: 0, paymentMethod: 'direct_debit', line: () => ({ description: 'Fibra y dos líneas móviles', unitPriceMinor: 4_500, taxRateBps: 2_100 }) },
  { supplierTaxId: 'A00000017', prefix: 'BE-', category: 'bank_fees', everyMonths: 1, dayOfMonth: 28, withholdingRateBps: 0, paymentMethod: 'direct_debit', line: () => ({ description: 'Comisión de mantenimiento de cuenta', unitPriceMinor: 800, taxRateBps: 0 }) },
  { supplierTaxId: 'B00000010', prefix: 'NUBE-', category: 'software', everyMonths: 3, dayOfMonth: 15, withholdingRateBps: 0, paymentMethod: 'card', line: () => ({ description: 'Hosting y dominio (trimestre)', quantityMillis: 3_000, unitPriceMinor: 4_500, taxRateBps: 2_100 }) },
  { supplierTaxId: 'B00000016', prefix: 'AO-', category: 'marketing', everyMonths: 2, dayOfMonth: 20, withholdingRateBps: 0, paymentMethod: 'card', line: monthIndex => ({ description: 'Campaña de anuncios en buscadores', unitPriceMinor: 12_000 + (monthIndex % 3) * 3_000, taxRateBps: 2_100 }) },
  { supplierTaxId: 'A00000014', prefix: 'POL-', category: 'insurance', everyMonths: 12, dayOfMonth: 3, withholdingRateBps: 0, paymentMethod: 'direct_debit', line: () => ({ description: 'Prima anual de responsabilidad civil profesional', unitPriceMinor: 42_000, taxRateBps: 0 }) },
  { supplierTaxId: 'B00000018', prefix: 'VE-', category: 'travel', kind: 'simplified_invoice', everyMonths: 4, dayOfMonth: 12, withholdingRateBps: 0, paymentMethod: 'card', line: () => ({ description: 'Tren Madrid - Bilbao ida y vuelta (visita a cliente)', unitPriceMinor: 9_800, taxRateBps: 1_000 }) },
  { supplierTaxId: 'B00000011', prefix: 'PAP-', category: 'supplies', kind: 'simplified_invoice', everyMonths: 5, dayOfMonth: 17, withholdingRateBps: 0, paymentMethod: 'cash', line: () => ({ description: 'Material de oficina', unitPriceMinor: 8_650, taxRateBps: 2_100 }) },
];

const HISTORY_MONTHS = 15;

export function buildDemoPurchaseSchedule({ now }: { now: Date }) {
  return RECURRING_EXPENSES.flatMap(expense => Array.from({ length: HISTORY_MONTHS + 1 }, (_, index) => index)
    .filter(monthIndex => monthIndex % expense.everyMonths === 0)
    .map((monthIndex) => {
      const issueDate = new Date(now.getFullYear(), now.getMonth() - monthIndex, expense.dayOfMonth, 10);

      return { expense, monthIndex, issueDate };
    })
    // Only what was already billed: this month's later invoices have not arrived yet
    .filter(({ issueDate }) => issueDate.getTime() <= now.getTime()));
}

export async function seedDemoPurchases({ organizationId, now = new Date() }: { organizationId: string; now?: Date }) {
  const contacts = await listDemoContacts({ organizationId });
  const supplierByTaxId = new Map(contacts.filter(contact => contact.isSupplier).map(contact => [contact.taxId, contact]));
  const seeded: Array<{ id: string; supplierTaxId: string; issueDate: Date }> = [];

  for (const { expense, monthIndex, issueDate } of buildDemoPurchaseSchedule({ now })) {
    const supplier = supplierByTaxId.get(expense.supplierTaxId);

    if (!supplier) {
      continue;
    }

    const { quantityMillis = 1_000, deductibleRateBps = 10_000, ...line } = expense.line(monthIndex);
    const daysAgo = Math.round((now.getTime() - issueDate.getTime()) / 86_400_000);
    // The last few weeks are still to be paid; last month's phone bill came back unpaid (a returned direct debit)
    const isReturned = expense.supplierTaxId === 'A00000015' && monthIndex === 1;
    const status = daysAgo < 20 || isReturned ? 'pending' : 'paid';
    const number = `${expense.prefix}${issueDate.getFullYear()}-${String(issueDate.getMonth() + 1).padStart(2, '0')}`;

    const purchaseInvoice = await buildPurchaseInvoice({
      organizationId,
      draft: {
        supplierId: supplier.id,
        number,
        kind: expense.kind ?? 'invoice',
        issueDate,
        dueDate: daysAgoToDate(now, daysAgo - 30),
        paymentMethod: expense.paymentMethod,
        currency: 'EUR',
        category: expense.category,
        withholdingRateBps: expense.withholdingRateBps,
        notes: null,
        documentId: null,
        metadata: [],
        items: [{ ...line, quantityMillis, discountRateBps: 0, deductibleRateBps }],
      },
    });

    const paidAt = status === 'paid' ? issueDate.toISOString() : null;
    const instalments = (purchaseInvoice.instalments as Stored[]).map(instalment => ({ ...instalment, status: isReturned ? 'returned' : status, paidAt, returnedAt: isReturned ? daysAgoToDate(now, daysAgo - 30).toISOString() : null }));
    await db().setItem(purchaseInvoice.id, { ...purchaseInvoice, instalments, status, paidAt });
    seeded.push({ id: purchaseInvoice.id, supplierTaxId: expense.supplierTaxId, issueDate });
  }

  return { purchaseInvoices: seeded };
}

export async function getDemoPurchaseInvoice({ purchaseInvoiceId }: { purchaseInvoiceId: string }) {
  return db().getItem(purchaseInvoiceId);
}

/** Links an archived file to a seeded received invoice, like uploading the PDF of the supplier does */
export async function attachDemoPurchaseDocument({ purchaseInvoiceId, documentId }: { purchaseInvoiceId: string; documentId: string }) {
  const purchaseInvoice = await db().getItem(purchaseInvoiceId);

  if (purchaseInvoice) {
    await db().setItem(purchaseInvoiceId, { ...purchaseInvoice, documentId });
  }
}

// The demo has no AI: a received invoice "read" from any uploaded file, from a supplier the demo does not know yet,
// so the visitor sees the whole flow (supplier creation, prefilled lines, review)
export function buildDemoExtraction({ documentId, now = new Date() }: { documentId: string; now?: Date }) {
  const issueDate = daysAgoToDate(now, 3);
  const items = [
    { description: 'Juegos de base con almohadas', quantityMillis: 100_000, unitPriceMinor: 1_500, taxRateBps: 2_100, discountRateBps: 0, deductibleRateBps: 10_000 },
    { description: 'Portes', quantityMillis: 1_000, unitPriceMinor: 2_250, taxRateBps: 2_100, discountRateBps: 0, deductibleRateBps: 10_000 },
  ];
  // "Giro a 30 y 60 días": two direct debits, computed from the issue date, the total split in two
  const { payableMinor } = calculatePurchaseInvoiceTotals({ items, withholdingRateBps: 0 });
  const firstHalf = Math.floor(payableMinor / 2);
  const instalments = [{ dueDate: addDays(issueDate, 30), amountMinor: firstHalf }, { dueDate: addDays(issueDate, 60), amountMinor: payableMinor - firstHalf }];

  return {
    schemaVersion: 3,
    direction: 'received',
    draft: {
      supplierId: null,
      kind: 'invoice',
      number: `FRA/${String(now.getTime()).slice(-6)}`,
      issueDate: issueDate.toISOString(),
      dueDate: instalments[0]!.dueDate.toISOString(),
      paymentMethod: 'direct_debit',
      instalments: instalments.map(({ dueDate, amountMinor }) => ({ dueDate: dueDate.toISOString(), amountMinor })),
      instalmentsSource: 'terms',
      currency: 'EUR',
      category: 'goods',
      withholdingRateBps: 0,
      documentId,
      metadata: [{ label: 'Forma de pago', value: 'Giro a 30 y 60 días' }, { label: 'Pedido', value: 'PED-2026-0412' }],
      items,
    },
    counterparty: { status: 'create', contactId: null, matchedBy: null, hasSupplierRole: false, candidates: [], name: 'Textiles Ejemplo SL', taxId: 'B00000020', email: 'facturas@textiles.example', phone: null, addressLine1: 'Calle del Telar 8', postalCode: '03801', city: 'Alcoy', country: 'ES' },
    warnings: [],
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
      // Marking the whole invoice paid pays each of its due dates (pending again undoes the payments, not the returns)
      const instalments = ((existing.instalments ?? []) as Stored[]).map(instalment => (body.status === 'paid'
        ? { ...instalment, status: 'paid', paidAt: instalment.paidAt ?? now, returnedAt: null }
        : instalment.status === 'paid' ? { ...instalment, status: 'pending', paidAt: null } : instalment));
      const purchaseInvoice = { ...existing, instalments, status: body.status, paidAt: body.status === 'paid' ? now : null, updatedAt: now };
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

export async function listDemoPurchaseInvoices({ organizationId }: { organizationId: string }) {
  return (await getValues(db())).filter(purchaseInvoice => purchaseInvoice.organizationId === organizationId);
}

/** Received invoices with their supplier, as the list route returns them */
export async function listDemoPurchaseInvoicesWithSupplier({ organizationId }: { organizationId: string }) {
  return Promise.all((await listDemoPurchaseInvoices({ organizationId })).map(async purchaseInvoice => withSupplier({ organizationId, purchaseInvoice })));
}

/** Saves a purchase changed outside its own handlers (a due date paid from the due dates page) */
export async function saveDemoPurchaseInvoice(purchaseInvoice: Stored) {
  await db().setItem(purchaseInvoice.id, purchaseInvoice);
}
