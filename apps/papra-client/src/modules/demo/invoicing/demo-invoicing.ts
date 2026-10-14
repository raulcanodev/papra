import type { Storage } from 'unstorage';
import type { Invoice, InvoiceDraftInput, InvoiceTemplateId } from '../../invoicing/invoicing.types';
import { FetchError } from 'ofetch';
import { prefixStorage } from 'unstorage';
import { defineHandler } from '../demo-api-mock.models';
import { createId } from '../demo.models';
import { getValues } from '../demo.storage.models';
import {
  daysAgoToDate,
  demoBranding,
  demoCustomers,
  demoFiscalProfile,
  demoInvoices,
  demoProducts,
  demoSalesRepresentatives,
  demoSeries,
  demoSuppliers,
  demoTaxRates,
} from './demo-invoicing.fixtures';

// Everything below lives in the browser's localStorage (through the shared demo storage), nothing is sent to a server.

type Stored = Record<string, any>;

type DemoInvoicingStorages = ReturnType<typeof createInvoicingStorages>;

function createInvoicingStorages(storage: Storage<any>) {
  return {
    profile: prefixStorage<Stored>(storage, 'invoicing:profile'),
    branding: prefixStorage<Stored>(storage, 'invoicing:branding'),
    // The address book: customers, suppliers and sales representatives, flagged by role like the server contacts
    contacts: prefixStorage<Stored>(storage, 'invoicing:contacts'),
    products: prefixStorage<Stored>(storage, 'invoicing:products'),
    taxRates: prefixStorage<Stored>(storage, 'invoicing:taxRates'),
    series: prefixStorage<Stored>(storage, 'invoicing:series'),
    invoices: prefixStorage<Stored>(storage, 'invoicing:invoices'),
  };
}

let storages: DemoInvoicingStorages | undefined;

export function bindInvoicingStorage(storage: Storage<any>) {
  storages = createInvoicingStorages(storage);
}

function db(): DemoInvoicingStorages {
  if (!storages) {
    throw new Error('Demo invoicing storage is not bound');
  }

  return storages;
}

function fail(message: string, status: number): never {
  throw Object.assign(new FetchError(message), { status });
}

export function calculateTotals(items: Array<{ quantityMillis: number; unitPriceMinor: number; discountRateBps: number; taxRateBps: number }>) {
  return items.reduce((totals, item) => {
    const gross = Math.round(item.quantityMillis * item.unitPriceMinor / 1_000);
    const discount = Math.round(gross * item.discountRateBps / 10_000);
    const net = gross - discount;
    const tax = Math.round(net * item.taxRateBps / 10_000);

    return { subtotalMinor: totals.subtotalMinor + net, taxMinor: totals.taxMinor + tax, totalMinor: totals.totalMinor + net + tax };
  }, { subtotalMinor: 0, taxMinor: 0, totalMinor: 0 });
}

function formatNumber({ prefix, nextNumber, padding }: { prefix: string; nextNumber: number; padding: number }) {
  return `${prefix}${String(nextNumber).padStart(padding, '0')}`;
}

const byCreatedAt = (a: Stored, b: Stored) => String(a.createdAt).localeCompare(String(b.createdAt));

const CONTACT_ROLE_FLAGS = { customer: 'isCustomer', supplier: 'isSupplier', sales_representative: 'isSalesRepresentative' } as const;

function emptyDemoContact(): Stored {
  return { kind: 'company', email: null, phone: null, taxId: null, addressLine1: null, addressLine2: null, postalCode: null, city: null, region: null, country: null, currency: 'EUR', paymentTermsDays: 30, notes: null, isCustomer: false, isSupplier: false, isSalesRepresentative: false, archivedAt: null };
}

// ---------------------------------------------------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------------------------------------------------

export async function seedDemoInvoicing({ organizationId, now = new Date() }: { organizationId: string; now?: Date }) {
  const { profile, branding, contacts, products, taxRates, series, invoices } = db();
  const created = daysAgoToDate(now, 150).toISOString();
  const base = { organizationId, createdAt: created, updatedAt: created, archivedAt: null };

  await profile.setItem(organizationId, { organizationId, ...demoFiscalProfile, createdAt: created, updatedAt: created });
  await branding.setItem(organizationId, { organizationId, ...demoBranding, createdAt: created, updatedAt: created });

  const taxIds = new Map<string, { id: string; rateBps: number }>();
  for (const rate of demoTaxRates) {
    const id = createId({ prefix: 'tax' });
    taxIds.set(rate.key, { id, rateBps: rate.rateBps });
    await taxRates.setItem(id, { id, ...base, name: rate.name, rateBps: rate.rateBps, isDefault: rate.isDefault });
  }

  const seriesRecords = new Map<string, Stored>();
  for (const item of demoSeries) {
    const id = createId({ prefix: 'ser' });
    const record = { id, ...base, name: item.name, prefix: item.prefix, padding: item.padding, nextNumber: 1, isDefault: item.isDefault };
    seriesRecords.set(item.key, record);
    await series.setItem(id, record);
  }

  const repIds = new Map<string, string>();
  for (const rep of demoSalesRepresentatives) {
    const id = createId({ prefix: 'rep' });
    repIds.set(rep.key, id);
    await contacts.setItem(id, { ...emptyDemoContact(), id, ...base, kind: 'person', name: rep.name, email: rep.email, phone: rep.phone, taxId: rep.taxId, notes: rep.notes, isSalesRepresentative: true });
  }

  const customerRecords = new Map<string, Stored>();
  for (const customer of demoCustomers) {
    const id = createId({ prefix: 'cus' });
    const record = {
      ...emptyDemoContact(),
      id,
      ...base,
      isCustomer: true,
      isSupplier: customer.isSupplier ?? false,
      name: customer.name,
      email: customer.email,
      taxId: customer.taxId,
      addressLine1: customer.addressLine1,
      addressLine2: null,
      postalCode: customer.postalCode,
      city: customer.city,
      region: customer.region,
      country: customer.country,
      currency: 'EUR',
      paymentTermsDays: 30,
      notes: null,
    };
    customerRecords.set(customer.key, record);
    await contacts.setItem(id, record);
  }

  for (const { key: _key, ...supplier } of demoSuppliers) {
    const id = createId({ prefix: 'ctc' });
    await contacts.setItem(id, { ...emptyDemoContact(), id, ...base, ...supplier, isSupplier: true });
  }

  const productIds = new Map<string, string>();
  for (const product of demoProducts) {
    const id = createId({ prefix: 'prd' });
    productIds.set(product.key, id);
    await products.setItem(id, {
      id,
      ...base,
      name: product.name,
      description: product.description,
      unit: product.unit,
      unitPriceMinor: product.unitPriceMinor,
      currency: 'EUR',
      taxRateBps: taxIds.get(product.taxKey)?.rateBps ?? 2100,
    });
  }

  const mainSeries = seriesRecords.get('main')!;
  // Oldest first so invoice numbers grow with time.
  const ordered = [...demoInvoices].sort((a, b) => b.daysAgo - a.daysAgo);

  for (const fixture of ordered) {
    const customer = customerRecords.get(fixture.customerKey)!;
    const issueDate = daysAgoToDate(now, fixture.daysAgo);
    const dueDate = new Date(issueDate.getTime() + fixture.paymentTermsDays * 24 * 60 * 60 * 1000);
    const items = fixture.items.map((item, position) => ({
      id: createId({ prefix: 'itm' }),
      position,
      productId: item.productKey ? productIds.get(item.productKey) ?? null : null,
      description: item.description,
      quantityMillis: Math.round(item.quantity * 1_000),
      unitPriceMinor: item.unitPriceMinor,
      taxRateBps: taxIds.get(item.taxKey)?.rateBps ?? 2100,
      discountRateBps: (item.discountPercent ?? 0) * 100,
    }));
    const isDraft = fixture.status === 'draft';
    const number = isDraft ? null : formatNumber({ prefix: mainSeries.prefix, nextNumber: mainSeries.nextNumber, padding: mainSeries.padding });
    if (!isDraft) {
      mainSeries.nextNumber += 1;
    }

    const id = createId({ prefix: 'inv' });
    const stamp = issueDate.toISOString();
    const sentAt = fixture.status === 'sent' || fixture.status === 'paid' ? new Date(issueDate.getTime() + 60 * 60 * 1000).toISOString() : null;
    const paidAt = fixture.status === 'paid' ? new Date(dueDate.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString() : null;

    await invoices.setItem(id, {
      id,
      organizationId,
      customerId: customer.id,
      customerName: customer.name,
      customerEmail: customer.email,
      customer,
      seriesId: isDraft ? null : mainSeries.id,
      salesRepresentativeId: fixture.repKey ? repIds.get(fixture.repKey) ?? null : null,
      documentId: null,
      status: fixture.status,
      number,
      issueDate: stamp,
      dueDate: dueDate.toISOString(),
      currency: 'EUR',
      ...calculateTotals(items),
      notes: fixture.notes ?? demoFiscalProfile.defaultNotes,
      terms: demoFiscalProfile.defaultTerms,
      templateId: 'minimal',
      items,
      issuedAt: isDraft ? null : stamp,
      sentAt,
      paidAt,
      voidedAt: null,
      createdAt: stamp,
      updatedAt: stamp,
    });
  }

  await series.setItem(mainSeries.id, mainSeries);
}

// ---------------------------------------------------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------------------------------------------------

type CatalogKey = 'products' | 'taxRates' | 'series';

const CUSTOM_PROPERTY_ENTITY_CATALOG_KEYS = { customer: 'contacts', supplier: 'contacts', product: 'products', sales_representative: 'contacts' } as const;

/** Raw custom property values (definition id to value) stored on a demo invoicing entity */
export async function getDemoEntityCustomPropertyValues({ organizationId, entityType, entityId }: { organizationId: string; entityType: string; entityId: string }): Promise<Record<string, unknown>> {
  const key = CUSTOM_PROPERTY_ENTITY_CATALOG_KEYS[entityType as keyof typeof CUSTOM_PROPERTY_ENTITY_CATALOG_KEYS];
  const record = key ? await db()[key].getItem(entityId) : null;

  return record?.organizationId === organizationId ? (record.customProperties ?? {}) : {};
}

function catalogHandlers<Path extends string>({ path, key, listKey, itemKey, prefix, onSave }: {
  path: Path;
  key: CatalogKey;
  listKey: string;
  itemKey: string;
  prefix: string;
  onSave?: (record: Stored, all: Stored[]) => Promise<void>;
}) {
  const base = `/api/organizations/:organizationId/invoicing/${path}` as const;

  return {
    ...defineHandler({
      path: base,
      method: 'GET',
      handler: async ({ params: { organizationId } }: any) => {
        const records = (await getValues(db()[key])).filter(record => record.organizationId === organizationId && !record.archivedAt);
        return { [listKey]: records.sort(byCreatedAt) };
      },
    }),
    ...defineHandler({
      path: base,
      method: 'POST',
      handler: async ({ params: { organizationId }, body }: any) => {
        const now = new Date().toISOString();
        const id = createId({ prefix });
        const record: Stored = { ...(key === 'series' ? { nextNumber: 1 } : {}), ...body, id, organizationId, archivedAt: null, createdAt: now, updatedAt: now };
        await onSave?.(record, await getValues(db()[key]));
        await db()[key].setItem(id, record);
        return { [itemKey]: record };
      },
    }),
    ...defineHandler({
      path: `${base}/:resourceId`,
      method: 'PUT',
      handler: async ({ params: { resourceId }, body }: any) => {
        const existing = await db()[key].getItem(resourceId);
        if (!existing) {
          fail('Not found', 404);
        }
        // Like the server, only the submitted custom properties are replaced
        const customProperties = { ...existing.customProperties, ...body?.customProperties };
        const record: Stored = { ...existing, ...body, customProperties, id: existing.id, organizationId: existing.organizationId, updatedAt: new Date().toISOString() };
        await onSave?.(record, await getValues(db()[key]));
        await db()[key].setItem(resourceId, record);
        return { [itemKey]: record };
      },
    }),
  };
}

// Only one default per catalog (tax rates, series).
function singleDefault(key: 'taxRates' | 'series') {
  return async (record: Stored, all: Stored[]) => {
    if (!record.isDefault) {
      return;
    }
    await Promise.all(all.filter(other => other.id !== record.id && other.isDefault).map(other => db()[key].setItem(other.id, { ...other, isDefault: false })));
  };
}

async function hydrateInvoice(invoice: Stored): Promise<Stored> {
  const customer = invoice.customerId ? await db().contacts.getItem(invoice.customerId) : null;

  return { ...invoice, customer, customerName: customer?.name ?? invoice.customerName, customerEmail: customer?.email ?? invoice.customerEmail };
}

async function buildInvoiceFromDraft({ organizationId, draft, existing }: { organizationId: string; draft: InvoiceDraftInput; existing?: Stored }): Promise<Stored> {
  const customer = await db().contacts.getItem(draft.customerId);
  if (!customer || customer.organizationId !== organizationId) {
    fail('Contact not found', 404);
  }
  if (!customer.isCustomer) {
    fail('The contact does not have the role required for this operation.', 400);
  }
  if (draft.salesRepresentativeId) {
    const representative = await db().contacts.getItem(draft.salesRepresentativeId);
    if (!representative || representative.organizationId !== organizationId) {
      fail('Contact not found', 404);
    }
    if (!representative.isSalesRepresentative) {
      fail('The contact does not have the role required for this operation.', 400);
    }
  }

  const now = new Date().toISOString();
  const items = draft.items.map((item, position) => ({
    id: createId({ prefix: 'itm' }),
    position,
    productId: item.productId ?? null,
    description: item.description,
    quantityMillis: item.quantityMillis,
    unitPriceMinor: item.unitPriceMinor,
    taxRateBps: item.taxRateBps,
    discountRateBps: item.discountRateBps,
  }));
  const id = existing?.id ?? createId({ prefix: 'inv' });

  return {
    id,
    organizationId,
    customerId: customer.id,
    customerName: customer.name,
    customerEmail: customer.email,
    customer,
    seriesId: draft.seriesId ?? null,
    salesRepresentativeId: draft.salesRepresentativeId ?? null,
    documentId: null,
    status: 'draft',
    number: null,
    issueDate: new Date(draft.issueDate).toISOString(),
    dueDate: new Date(draft.dueDate).toISOString(),
    currency: draft.currency,
    ...calculateTotals(items),
    notes: draft.notes ?? null,
    terms: draft.terms ?? null,
    templateId: draft.templateId as InvoiceTemplateId,
    items,
    issuedAt: null,
    sentAt: null,
    paidAt: null,
    voidedAt: null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

async function issueInvoice(invoice: Stored): Promise<Stored> {
  if (invoice.status !== 'draft') {
    return invoice;
  }

  const allSeries = await getValues(db().series);
  const series = allSeries.find(item => item.id === invoice.seriesId) ?? allSeries.find(item => item.isDefault) ?? allSeries[0];
  if (!series) {
    fail('Create an invoice series first', 409);
  }

  const number = formatNumber({ prefix: series.prefix, nextNumber: series.nextNumber, padding: series.padding });
  await db().series.setItem(series.id, { ...series, nextNumber: series.nextNumber + 1, updatedAt: new Date().toISOString() });
  const now = new Date().toISOString();
  const issued = { ...invoice, status: 'issued', number, seriesId: series.id, issuedAt: now, updatedAt: now };
  await db().invoices.setItem(invoice.id, issued);

  return issued;
}

async function getInvoiceOrFail(invoiceId: string) {
  const invoice = await db().invoices.getItem(invoiceId);
  if (!invoice) {
    fail('Invoice not found', 404);
  }

  return invoice;
}

// Same routes as the server contacts module, the address book lives with the invoicing records it is linked to
export const contactsHandlers = {
  ...defineHandler({
    path: '/api/organizations/:organizationId/contacts',
    method: 'GET',
    handler: async ({ params: { organizationId }, query }: any) => {
      const role = query?.role as keyof typeof CONTACT_ROLE_FLAGS | undefined;
      const contacts = (await getValues(db().contacts))
        .filter(contact => contact.organizationId === organizationId && !contact.archivedAt && (!role || contact[CONTACT_ROLE_FLAGS[role]]))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));

      return { contacts };
    },
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/contacts',
    method: 'POST',
    handler: async ({ params: { organizationId }, body }: any) => {
      const now = new Date().toISOString();
      const id = createId({ prefix: 'ctc' });
      const { customProperties, ...fields } = body ?? {};
      const contact: Stored = { ...emptyDemoContact(), ...fields, customProperties: customProperties ?? {}, id, organizationId, archivedAt: null, createdAt: now, updatedAt: now };
      await db().contacts.setItem(id, contact);

      return { contact };
    },
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/contacts/:contactId',
    method: 'PUT',
    handler: async ({ params: { organizationId, contactId }, body }: any) => {
      const existing = await db().contacts.getItem(contactId);
      if (!existing || existing.organizationId !== organizationId) {
        fail('Contact not found', 404);
      }
      const { customProperties, ...fields } = body ?? {};
      // Like the server, only the submitted custom properties are replaced
      const contact: Stored = { ...existing, ...fields, customProperties: { ...existing.customProperties, ...customProperties }, id: existing.id, organizationId, updatedAt: new Date().toISOString() };
      await db().contacts.setItem(contactId, contact);

      return { contact };
    },
  }),
};

export async function getDemoContact({ organizationId, contactId }: { organizationId: string; contactId: string }) {
  const contact = await db().contacts.getItem(contactId);

  return contact?.organizationId === organizationId ? contact : null;
}

export const invoicingHandlers = {
  ...defineHandler({
    path: '/api/organizations/:organizationId/invoicing/profile',
    method: 'GET',
    handler: async ({ params: { organizationId } }) => ({ profile: (await db().profile.getItem(organizationId)) ?? null }),
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/invoicing/profile',
    method: 'PUT',
    handler: async ({ params: { organizationId }, body }) => {
      const existing = await db().profile.getItem(organizationId);
      const now = new Date().toISOString();
      const profile = { ...existing, ...(body as Stored), organizationId, createdAt: existing?.createdAt ?? now, updatedAt: now };
      await db().profile.setItem(organizationId, profile);
      return { profile };
    },
  }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/invoicing/branding',
    method: 'GET',
    handler: async ({ params: { organizationId } }) => ({ branding: (await db().branding.getItem(organizationId)) ?? null }),
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/invoicing/branding',
    method: 'PUT',
    handler: async ({ params: { organizationId }, body }) => {
      const existing = await db().branding.getItem(organizationId);
      const now = new Date().toISOString();
      const branding = { ...existing, ...(body as Stored), organizationId, createdAt: existing?.createdAt ?? now, updatedAt: now };
      await db().branding.setItem(organizationId, branding);
      return { branding };
    },
  }),

  ...catalogHandlers({ path: 'products', key: 'products', listKey: 'products', itemKey: 'product', prefix: 'prd' }),
  ...catalogHandlers({ path: 'tax-rates', key: 'taxRates', listKey: 'taxRates', itemKey: 'taxRate', prefix: 'tax', onSave: singleDefault('taxRates') }),
  ...catalogHandlers({ path: 'series', key: 'series', listKey: 'series', itemKey: 'series', prefix: 'ser', onSave: singleDefault('series') }),

  ...defineHandler({
    path: '/api/organizations/:organizationId/invoicing/invoices',
    method: 'GET',
    handler: async ({ params: { organizationId }, query }) => {
      const status = (query as Stored | undefined)?.status as string | undefined;
      const invoices = (await getValues(db().invoices)).filter(invoice => invoice.organizationId === organizationId && (!status || invoice.status === status));
      const hydrated = await Promise.all(invoices.map(hydrateInvoice));
      return { invoices: hydrated.sort((a, b) => String(b.issueDate).localeCompare(String(a.issueDate))) };
    },
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/invoicing/invoices',
    method: 'POST',
    handler: async ({ params: { organizationId }, body }) => {
      const invoice = await buildInvoiceFromDraft({ organizationId, draft: body as InvoiceDraftInput });
      await db().invoices.setItem(invoice.id, invoice);
      return { invoice };
    },
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/invoicing/invoices/:resourceId',
    method: 'GET',
    handler: async ({ params: { resourceId } }) => ({ invoice: await hydrateInvoice(await getInvoiceOrFail(resourceId)) }),
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/invoicing/invoices/:resourceId',
    method: 'PUT',
    handler: async ({ params: { organizationId, resourceId }, body }) => {
      const existing = await getInvoiceOrFail(resourceId);
      if (existing.status !== 'draft') {
        fail('Only draft invoices can be edited', 409);
      }
      const invoice = await buildInvoiceFromDraft({ organizationId, draft: body as InvoiceDraftInput, existing });
      await db().invoices.setItem(invoice.id, invoice);
      return { invoice };
    },
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/invoicing/invoices/:resourceId',
    method: 'DELETE',
    handler: async ({ params: { resourceId } }) => {
      const existing = await getInvoiceOrFail(resourceId);
      if (existing.status !== 'draft') {
        fail('Only draft invoices can be deleted', 409);
      }
      await db().invoices.removeItem(resourceId);
    },
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/invoicing/invoices/:resourceId/issue',
    method: 'POST',
    handler: async ({ params: { resourceId } }) => ({ invoice: await hydrateInvoice(await issueInvoice(await getInvoiceOrFail(resourceId))) }),
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/invoicing/invoices/:resourceId/send',
    method: 'POST',
    handler: async ({ params: { resourceId } }) => {
      let invoice = await issueInvoice(await getInvoiceOrFail(resourceId));
      const hydrated = await hydrateInvoice(invoice);
      if (!hydrated.customerEmail) {
        fail('The customer has no email address', 422);
      }
      // No email leaves the browser: the demo only flips the status.
      const now = new Date().toISOString();
      invoice = { ...invoice, status: invoice.status === 'paid' ? 'paid' : 'sent', sentAt: now, updatedAt: now };
      await db().invoices.setItem(invoice.id, invoice);
      return { invoice: await hydrateInvoice(invoice) };
    },
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/invoicing/invoices/:resourceId/paid',
    method: 'POST',
    handler: async ({ params: { resourceId } }) => {
      const existing = await issueInvoice(await getInvoiceOrFail(resourceId));
      const now = new Date().toISOString();
      const invoice: Stored = { ...existing, status: 'paid', paidAt: now, updatedAt: now };
      await db().invoices.setItem(invoice.id, invoice);
      return { invoice: await hydrateInvoice(invoice) };
    },
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/invoicing/invoices/:resourceId/pdf',
    method: 'GET',
    handler: async ({ params: { organizationId, resourceId } }) => {
      const invoice = await hydrateInvoice(await getInvoiceOrFail(resourceId));
      if (invoice.status === 'draft') {
        fail('Issue the invoice before downloading its PDF', 409);
      }
      const [profile, branding] = await Promise.all([db().profile.getItem(organizationId), db().branding.getItem(organizationId)]);
      const { renderDemoInvoicePdf } = await import('./demo-invoice-pdf');
      return renderDemoInvoicePdf({ invoice, seller: profile ?? demoFiscalProfile, branding: branding ?? demoBranding });
    },
  }),

  // Verifactu is out of the demo: report it as not applicable so the page shows an empty state.
  ...defineHandler({
    path: '/api/organizations/:organizationId/invoicing/verifactu/configuration',
    method: 'GET',
    handler: async () => ({ configuration: null }),
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/invoicing/verifactu/records',
    method: 'GET',
    handler: async () => ({ records: [] }),
  }),
};

export type { Invoice };

export async function listDemoInvoices(): Promise<Stored[]> {
  return Promise.all((await getValues(db().invoices)).map(hydrateInvoice));
}

/** Raw demo invoicing records, used to compute the home dashboard metrics in the browser */
export async function getDemoInvoicingRecords({ organizationId }: { organizationId: string }) {
  const [invoices, customers, profile] = await Promise.all([
    getValues(db().invoices),
    getValues(db().contacts),
    db().profile.getItem(organizationId),
  ]);

  return {
    invoices: invoices.filter(invoice => invoice.organizationId === organizationId),
    customers: customers.filter(customer => customer.organizationId === organizationId && customer.isCustomer),
    currency: (profile?.currency as string | undefined) ?? 'EUR',
  };
}
