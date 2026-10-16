import type { GestoriaModule } from '../../gestorias/gestorias.types';
import type { Quarter } from '../../taxes/taxes.types';
import type { DemoGestoriaClientCompany } from './demo-gestorias.fixtures';
import { FetchError } from 'ofetch';
import { calculatePurchaseInvoiceTotals } from '../../purchases/purchases.models';
import { get } from '../../shared/utils/get';
import { defineHandler } from '../demo-api-mock.models';
import { documentFileStorage } from '../demo.storage';
import { calculateTotals, getDemoFiscalProfile, listDemoInvoices } from '../invoicing/demo-invoicing';
import { demoBranding, demoFiscalProfile } from '../invoicing/demo-invoicing.fixtures';
import { listDemoPurchaseInvoicesWithSupplier } from '../purchases/demo-purchases';
import { computeDemoQuarterlyTaxReport } from '../taxes/demo-taxes';
import { DEMO_ACME_CLIENT, DEMO_GENERATED_CLIENTS, demoGestoria } from './demo-gestorias.fixtures';

// The gestoría workspace of the demo, read only like the real one. Acme SL is read from the demo records the visitor
// edits; the other client companies have books generated from the visit date, kept in memory only.

type Stored = Record<string, any>;

const DAY = 24 * 60 * 60 * 1000;
const HISTORY_MONTHS = 15;
const HIDDEN_INVOICE_STATUSES = ['draft', 'issuing'];

function fail(message: string, status: number): never {
  throw Object.assign(new FetchError(message), { status });
}

const clients = [DEMO_ACME_CLIENT, ...DEMO_GENERATED_CLIENTS].map(({ organizationId, name, legalName, taxId, legalForm, modules }) => ({ organizationId, name, legalName, taxId, legalForm, modules: [...modules] }));

function getReadableClient({ gestoriaId, organizationId, module }: { gestoriaId: string; organizationId: string; module?: GestoriaModule }) {
  if (gestoriaId !== demoGestoria.id) {
    fail('Gestoría not found', 404);
  }

  const client = clients.find(candidate => candidate.organizationId === organizationId);

  if (!client) {
    fail('Client not found', 404);
  }

  if (module && !client.modules.includes(module)) {
    fail('The gestoría has no access to this module of the company', 403);
  }

  return client;
}

// Every month of the history where a recurring sale or expense falls, oldest first, only what is already billed
function buildSchedule<T extends { everyMonths: number; dayOfMonth: number }>({ recurring, now }: { recurring: T[]; now: Date }) {
  return recurring
    .flatMap(entry => Array.from({ length: HISTORY_MONTHS + 1 }, (_, monthIndex) => monthIndex)
      .filter(monthIndex => monthIndex % entry.everyMonths === 0)
      .map(monthIndex => ({ entry, monthIndex, issueDate: new Date(now.getFullYear(), now.getMonth() - monthIndex, entry.dayOfMonth, 10) }))
      .filter(({ issueDate }) => issueDate.getTime() <= now.getTime()))
    .sort((a, b) => a.issueDate.getTime() - b.issueDate.getTime());
}

function toContact({ company, party, role }: { company: DemoGestoriaClientCompany; party: DemoGestoriaClientCompany['customers'][number]; role: 'customer' | 'supplier' }) {
  return { id: `ctc_${company.invoicePrefix}${party.key}`, organizationId: company.organizationId, kind: 'company', ...party, isCustomer: role === 'customer', isSupplier: role === 'supplier' };
}

function buildCompanyBooks({ company, now }: { company: DemoGestoriaClientCompany; now: Date }) {
  const numbersByYear = new Map<number, number>();

  const invoices = buildSchedule({ recurring: company.sales, now }).map(({ entry, monthIndex, issueDate }, index) => {
    const customer = toContact({ company, party: company.customers.find(party => party.key === entry.customerKey)!, role: 'customer' });
    const year = issueDate.getFullYear();
    const sequence = (numbersByYear.get(year) ?? 0) + 1;
    numbersByYear.set(year, sequence);

    const items = entry.lines(monthIndex).map(({ quantityMillis = 1_000, ...line }, position) => ({ ...line, id: `itm_${company.invoicePrefix}${index}x${position}`, position, productId: null, quantityMillis, discountRateBps: 0 }));
    const dueDate = new Date(issueDate.getTime() + 30 * DAY);
    const isRecent = now.getTime() - issueDate.getTime() < 30 * DAY;
    const stamp = issueDate.toISOString();

    return {
      id: `inv_${company.invoicePrefix}${year}${sequence}`,
      organizationId: company.organizationId,
      customerId: customer.id,
      customerName: customer.name,
      customerEmail: customer.email,
      customerIcon: customer.icon,
      customerIconColor: customer.iconColor,
      customer,
      seriesId: null,
      salesRepresentativeId: null,
      documentId: null,
      status: isRecent ? 'sent' : 'paid',
      number: `${company.invoicePrefix}-${year}-${String(sequence).padStart(4, '0')}`,
      issueDate: stamp,
      dueDate: dueDate.toISOString(),
      currency: 'EUR',
      ...calculateTotals({ items }),
      notes: null,
      terms: 'Pago por transferencia en un plazo de 30 días desde la fecha de factura.',
      templateId: 'minimal',
      items,
      issuedAt: stamp,
      sentAt: stamp,
      paidAt: isRecent ? null : new Date(dueDate.getTime() - 5 * DAY).toISOString(),
      voidedAt: null,
      createdAt: stamp,
      updatedAt: stamp,
    };
  });

  const purchaseInvoices = buildSchedule({ recurring: company.expenses, now }).map(({ entry, monthIndex, issueDate }, index) => {
    const supplier = toContact({ company, party: company.suppliers.find(party => party.key === entry.supplierKey)!, role: 'supplier' });
    const items = entry.lines(monthIndex).map(({ quantityMillis = 1_000, ...line }, position) => ({ ...line, id: `pitm_${company.invoicePrefix}${index}x${position}`, position, quantityMillis, discountRateBps: 0, deductibleRateBps: 10_000 }));
    const { payableMinor: _payableMinor, ...totals } = calculatePurchaseInvoiceTotals({ items, withholdingRateBps: entry.withholdingRateBps });
    // The last few weeks are still to be paid
    const isRecent = now.getTime() - issueDate.getTime() < 20 * DAY;
    const stamp = issueDate.toISOString();

    return {
      ...totals,
      id: `pinv_${company.invoicePrefix}${index}`,
      organizationId: company.organizationId,
      supplierId: supplier.id,
      supplier,
      supplierName: supplier.name,
      supplierTaxId: supplier.taxId,
      supplierIcon: supplier.icon,
      supplierIconColor: supplier.iconColor,
      number: `${entry.prefix}${issueDate.getFullYear()}-${String(issueDate.getMonth() + 1).padStart(2, '0')}`,
      kind: 'invoice',
      issueDate: stamp,
      dueDate: new Date(issueDate.getTime() + 30 * DAY).toISOString(),
      currency: 'EUR',
      category: entry.category,
      withholdingRateBps: entry.withholdingRateBps,
      notes: null,
      documentId: null,
      metadata: [],
      items,
      status: isRecent ? 'pending' : 'paid',
      paidAt: isRecent ? null : stamp,
      createdAt: stamp,
      updatedAt: stamp,
    };
  });

  return { invoices, purchaseInvoices };
}

// Generated once per company and day: stable ids for the PDF downloads, and a demo that never ages
const booksCache = new Map<string, ReturnType<typeof buildCompanyBooks>>();

function getGeneratedBooks({ company }: { company: DemoGestoriaClientCompany }) {
  const now = new Date();
  const key = `${company.organizationId}:${now.toDateString()}`;

  if (!booksCache.has(key)) {
    booksCache.set(key, buildCompanyBooks({ company, now }));
  }

  return booksCache.get(key)!;
}

async function getClientBooks({ organizationId }: { organizationId: string }): Promise<{ invoices: Stored[]; purchaseInvoices: Stored[]; profile: Stored | null; branding: Stored }> {
  const company = DEMO_GENERATED_CLIENTS.find(candidate => candidate.organizationId === organizationId);

  if (company) {
    return { ...getGeneratedBooks({ company }), profile: company.profile, branding: company.branding };
  }

  const [invoices, purchaseInvoices, profile] = await Promise.all([
    listDemoInvoices(),
    listDemoPurchaseInvoicesWithSupplier({ organizationId }),
    getDemoFiscalProfile({ organizationId }),
  ]);

  return {
    invoices: invoices.filter(invoice => invoice.organizationId === organizationId),
    purchaseInvoices,
    profile: profile ?? demoFiscalProfile,
    branding: demoBranding,
  };
}

const byIssueDateDesc = (a: Stored, b: Stored) => String(b.issueDate).localeCompare(String(a.issueDate));

const isBilled = (invoice: Stored) => !HIDDEN_INVOICE_STATUSES.includes(invoice.status);

function summarizeBooks({ records, start, end }: { records: Stored[]; start: Date; end: Date }) {
  const inPeriod = records.filter(record => new Date(record.issueDate) >= start && new Date(record.issueDate) < end);
  const lastUpdatedAt = records.reduce<string | null>((latest, record) => (latest === null || String(record.updatedAt) > latest ? String(record.updatedAt) : latest), null);

  return {
    count: inPeriod.length,
    baseMinor: inPeriod.reduce((total, record) => total + Number(record.subtotalMinor), 0),
    taxMinor: inPeriod.reduce((total, record) => total + Number(record.taxMinor), 0),
    lastUpdatedAt,
  };
}

async function fileToBlob({ organizationId, documentId }: { organizationId: string; documentId: string }) {
  const file = await documentFileStorage.getItem(`${organizationId}:${documentId}`);

  if (!file) {
    fail('Document not found', 404);
  }

  const response = await fetch('path' in file ? file.path : file.base64Content);

  return response.blob();
}

export const gestoriasHandlers = {
  ...defineHandler({
    path: '/api/gestorias',
    method: 'GET',
    handler: async () => ({ gestorias: [demoGestoria] }),
  }),

  ...defineHandler({
    path: '/api/gestorias/:gestoriaId',
    method: 'GET',
    handler: async ({ params: { gestoriaId } }) => {
      if (gestoriaId !== demoGestoria.id) {
        fail('Gestoría not found', 404);
      }

      return { gestoria: demoGestoria, clients };
    },
  }),

  ...defineHandler({
    path: '/api/gestorias/:gestoriaId/activity',
    method: 'GET',
    handler: async ({ params: { gestoriaId }, query }) => {
      if (gestoriaId !== demoGestoria.id) {
        fail('Gestoría not found', 404);
      }

      const year = Number(get(query, ['year']));
      const quarter = Number(get(query, ['quarter'])) as Quarter;
      const start = new Date(Date.UTC(year, (quarter - 1) * 3, 1));
      const end = new Date(Date.UTC(year, quarter * 3, 1));

      const activity = await Promise.all(clients.map(async (client) => {
        const { invoices, purchaseInvoices } = await getClientBooks({ organizationId: client.organizationId });

        return {
          organizationId: client.organizationId,
          issued: client.modules.includes('invoices') ? summarizeBooks({ records: invoices.filter(isBilled), start, end }) : null,
          received: client.modules.includes('purchases') ? summarizeBooks({ records: purchaseInvoices, start, end }) : null,
        };
      }));

      return { period: { year, quarter, start: start.toISOString(), end: end.toISOString() }, activity };
    },
  }),

  ...defineHandler({
    path: '/api/gestorias/:gestoriaId/clients/:organizationId',
    method: 'GET',
    handler: async ({ params: { gestoriaId, organizationId } }) => ({ client: getReadableClient({ gestoriaId, organizationId }) }),
  }),

  ...defineHandler({
    path: '/api/gestorias/:gestoriaId/clients/:organizationId/invoices',
    method: 'GET',
    handler: async ({ params: { gestoriaId, organizationId } }) => {
      getReadableClient({ gestoriaId, organizationId, module: 'invoices' });
      const { invoices } = await getClientBooks({ organizationId });

      return { invoices: invoices.filter(isBilled).sort(byIssueDateDesc) };
    },
  }),

  ...defineHandler({
    path: '/api/gestorias/:gestoriaId/clients/:organizationId/invoices/:invoiceId/pdf',
    method: 'GET',
    handler: async ({ params: { gestoriaId, organizationId, invoiceId } }) => {
      getReadableClient({ gestoriaId, organizationId, module: 'invoices' });
      const { invoices, profile, branding } = await getClientBooks({ organizationId });
      const invoice = invoices.find(candidate => candidate.id === invoiceId && isBilled(candidate));

      if (!invoice) {
        fail('Invoice not found', 404);
      }

      const { renderDemoInvoicePdf } = await import('../invoicing/demo-invoice-pdf');
      return renderDemoInvoicePdf({ invoice, seller: profile ?? demoFiscalProfile, branding });
    },
  }),

  ...defineHandler({
    path: '/api/gestorias/:gestoriaId/clients/:organizationId/purchases',
    method: 'GET',
    handler: async ({ params: { gestoriaId, organizationId } }) => {
      getReadableClient({ gestoriaId, organizationId, module: 'purchases' });
      const { purchaseInvoices } = await getClientBooks({ organizationId });

      return { purchaseInvoices: purchaseInvoices.toSorted(byIssueDateDesc) };
    },
  }),

  ...defineHandler({
    path: '/api/gestorias/:gestoriaId/clients/:organizationId/purchases/:purchaseInvoiceId/document',
    method: 'GET',
    handler: async ({ params: { gestoriaId, organizationId, purchaseInvoiceId } }) => {
      getReadableClient({ gestoriaId, organizationId, module: 'purchases' });
      const { purchaseInvoices } = await getClientBooks({ organizationId });
      const purchaseInvoice = purchaseInvoices.find(candidate => candidate.id === purchaseInvoiceId);

      if (!purchaseInvoice?.documentId) {
        fail('Document not found', 404);
      }

      return fileToBlob({ organizationId, documentId: purchaseInvoice.documentId });
    },
  }),

  ...defineHandler({
    path: '/api/gestorias/:gestoriaId/clients/:organizationId/taxes/:year/:quarter',
    method: 'GET',
    handler: async ({ params: { gestoriaId, organizationId, year, quarter } }) => {
      getReadableClient({ gestoriaId, organizationId, module: 'taxes' });
      const { invoices, purchaseInvoices, profile } = await getClientBooks({ organizationId });

      const report = computeDemoQuarterlyTaxReport({
        issuedInvoices: invoices as never,
        purchaseInvoices: purchaseInvoices as never,
        profile: profile as never,
        year: Number(year),
        quarter: Number(quarter) as Quarter,
      });

      return { report };
    },
  }),

  // The accountant pack is generated by the server, not available in the browser only demo
  ...defineHandler({
    path: '/api/gestorias/:gestoriaId/clients/:organizationId/taxes/:year/:quarter/export',
    method: 'GET',
    handler: async () => {
      throw Object.assign(new FetchError('Not available in demo'), { status: 501, data: { error: { message: 'This feature is not available in demo', code: 'demo.not_available' } } });
    },
  }),
};
