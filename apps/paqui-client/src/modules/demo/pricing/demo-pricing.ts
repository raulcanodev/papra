import type { Storage } from 'unstorage';
import { FetchError } from 'ofetch';
import { prefixStorage } from 'unstorage';
import { adjustPriceMinor, getNetPriceMinor } from '../../pricing/pricing.models';
import { defineHandler } from '../demo-api-mock.models';
import { createId } from '../demo.models';
import { getValues } from '../demo.storage.models';

// Same rules as the server pricing module, kept in the browser's localStorage

type Stored = Record<string, any>;

function createPricingStorages(storage: Storage<any>) {
  return {
    concepts: prefixStorage<Stored>(storage, 'pricing:concepts'),
    // One record per product: its ordered breakdown lines
    productCosts: prefixStorage<Stored>(storage, 'pricing:productCosts'),
    shippingRates: prefixStorage<Stored>(storage, 'pricing:shippingRates'),
    // Price lists embed their items; contact assignments are keyed by contact id
    priceLists: prefixStorage<Stored>(storage, 'pricing:priceLists'),
    contactPriceLists: prefixStorage<Stored>(storage, 'pricing:contactPriceLists'),
    products: prefixStorage<Stored>(storage, 'invoicing:products'),
    contacts: prefixStorage<Stored>(storage, 'invoicing:contacts'),
    profile: prefixStorage<Stored>(storage, 'invoicing:profile'),
    organizations: prefixStorage<Stored>(storage, 'organizations'),
  };
}

let storages: ReturnType<typeof createPricingStorages> | undefined;

export function bindPricingStorage(storage: Storage<any>) {
  storages = createPricingStorages(storage);
}

function db() {
  if (!storages) {
    throw new Error('Demo pricing storage is not bound');
  }
  return storages;
}

// The storages, for the other demo pricing handlers (the import)
export const getDemoPricingStorages = () => db();

function fail(message: string, status: number): never {
  throw Object.assign(new FetchError(message), { status });
}

const now = () => new Date().toISOString();

async function listConcepts(organizationId: string) {
  return (await getValues(db().concepts)).filter(concept => concept.organizationId === organizationId).sort((a, b) => a.name.localeCompare(b.name));
}

async function getProductCosts(productId: string) {
  const record = await db().productCosts.getItem(productId);
  const lines: Array<{ conceptId: string; conceptName: string; amountMinor: number }> = record?.lines ?? [];
  return { lines, totalMinor: lines.reduce((total, line) => total + line.amountMinor, 0) };
}

export async function saveProductCosts({ organizationId, productId, lines }: { organizationId: string; productId: string; lines: Array<{ conceptName: string; amountMinor: number }> }) {
  const concepts = await listConcepts(organizationId);
  const resolved = [];
  for (const line of lines) {
    let concept = concepts.find(candidate => candidate.name.toLowerCase() === line.conceptName.trim().toLowerCase());
    if (!concept) {
      concept = { id: createId({ prefix: 'cco' }), organizationId, name: line.conceptName.trim(), createdAt: now(), updatedAt: now() };
      concepts.push(concept);
      await db().concepts.setItem(concept.id, concept);
    }
    resolved.push({ conceptId: concept.id, conceptName: concept.name, amountMinor: line.amountMinor });
  }
  await db().productCosts.setItem(productId, { organizationId, productId, lines: resolved });
  return getProductCosts(productId);
}

async function getCostTotals(organizationId: string) {
  return (await getValues(db().productCosts))
    .filter(record => record.organizationId === organizationId && record.lines.length > 0)
    .map(record => ({ productId: record.productId, totalMinor: record.lines.reduce((total: number, line: Stored) => total + line.amountMinor, 0) }));
}

export async function listShippingRates(organizationId: string) {
  const contacts = await getValues(db().contacts);
  return (await getValues(db().shippingRates))
    .filter(rate => rate.organizationId === organizationId && !rate.archivedAt)
    .map((rate): Stored => ({ ...rate, carrierName: contacts.find(contact => contact.id === rate.carrierContactId)?.name ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getPriceListOrFail(priceListId: string) {
  const priceList = await db().priceLists.getItem(priceListId);
  if (!priceList || priceList.archivedAt) {
    fail('Price list not found', 404);
  }
  return priceList;
}

async function hydratePriceList(priceList: Stored) {
  const [products, contacts, costs, shippingRates, assignments] = await Promise.all([getValues(db().products), getValues(db().contacts), getCostTotals(priceList.organizationId), listShippingRates(priceList.organizationId), getValues(db().contactPriceLists)]);
  const { items: _items, ...rest } = priceList;

  const items = (priceList.items as Stored[]).flatMap((item) => {
    const product = products.find(candidate => candidate.id === item.productId);
    if (!product) {
      return [];
    }
    const appliedShippingRateId = item.overridesShipping ? item.shippingRateId : priceList.defaultShippingRateId;
    const shippingMinor = shippingRates.find(rate => rate.id === appliedShippingRateId)?.amountMinor ?? 0;
    const productCostMinor = costs.find(cost => cost.productId === item.productId)?.totalMinor ?? 0;
    const netPriceMinor = getNetPriceMinor({ priceMinor: item.priceMinor, discountRateBps: priceList.discountRateBps });
    const marginMinor = netPriceMinor - productCostMinor - shippingMinor;
    return [{
      ...item,
      productName: product.name,
      productUnit: product.unit,
      productBasePriceMinor: product.unitPriceMinor,
      isProductArchived: Boolean(product.archivedAt),
      appliedShippingRateId: appliedShippingRateId ?? null,
      productCostMinor,
      shippingMinor,
      netPriceMinor,
      costMinor: productCostMinor + shippingMinor,
      marginMinor,
      marginRateBps: netPriceMinor === 0 ? null : Math.round(marginMinor * 10_000 / netPriceMinor),
    }];
  });

  const assigned = assignments.filter(assignment => assignment.priceListId === priceList.id).map(assignment => contacts.find(contact => contact.id === assignment.contactId)).filter(contact => contact && !contact.archivedAt) as Stored[];

  return {
    ...rest,
    items,
    contacts: assigned.map(contact => ({ id: contact.id, name: contact.name, isCustomer: contact.isCustomer, isSupplier: contact.isSupplier })).sort((a, b) => a.name.localeCompare(b.name)),
    adjustments: priceList.adjustments ?? [],
  };
}

export async function savePriceList(priceList: Stored) {
  if (priceList.isDefault) {
    for (const other of await getValues(db().priceLists)) {
      if (other.organizationId === priceList.organizationId && other.id !== priceList.id && other.isDefault) {
        await db().priceLists.setItem(other.id, { ...other, isDefault: false });
      }
    }
  }
  await db().priceLists.setItem(priceList.id, priceList);
  return priceList;
}

export async function getDemoContactPrices({ organizationId, contactId }: { organizationId: string; contactId: string }) {
  const assignment = await db().contactPriceLists.getItem(contactId);
  const assigned = assignment ? await db().priceLists.getItem(assignment.priceListId) : null;
  const isAssigned = Boolean(assigned && !assigned.archivedAt);
  const priceList = isAssigned ? assigned : (await getValues(db().priceLists)).find(candidate => candidate.organizationId === organizationId && candidate.isDefault && !candidate.archivedAt);

  return priceList
    ? { priceList: { id: priceList.id, name: priceList.name, discountRateBps: priceList.discountRateBps }, isAssigned, prices: priceList.items.map((item: Stored) => ({ productId: item.productId, priceMinor: item.priceMinor })) }
    : { priceList: null, isAssigned: false, prices: [] };
}

// The products and prices a contact may see, never costs nor margins
async function getPublicPriceList(priceList: Stored) {
  const products = await getValues(db().products);
  const profile = await db().profile.getItem(priceList.organizationId);
  const organization = await db().organizations.getItem(priceList.organizationId);
  return {
    companyName: profile?.legalName ?? organization?.name ?? '',
    name: priceList.name,
    discountRateBps: priceList.discountRateBps,
    items: (priceList.items as Stored[]).flatMap((item) => {
      const product = products.find(candidate => candidate.id === item.productId && !candidate.archivedAt);
      return product ? [{ name: product.name, description: product.description ?? null, unit: product.unit, currency: product.currency, taxRateBps: product.taxRateBps, priceMinor: item.priceMinor, netPriceMinor: getNetPriceMinor({ priceMinor: item.priceMinor, discountRateBps: priceList.discountRateBps }) }] : [];
    }),
  };
}

function buildCsv(priceList: Stored, products: Stored[]) {
  const amount = (value: number) => (value / 100).toFixed(2).replace('.', ',');
  const cell = (value: string) => (/[;"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  // Without a discount its columns are left out, like the server export
  const hasDiscount = priceList.discountRateBps > 0;
  const rows = (priceList.items as Stored[]).flatMap((item) => {
    const product = products.find(candidate => candidate.id === item.productId && !candidate.archivedAt);
    return product ? [[product.name, product.description ?? '', product.unit, amount(item.priceMinor), ...(hasDiscount ? [amount(priceList.discountRateBps), amount(getNetPriceMinor({ priceMinor: item.priceMinor, discountRateBps: priceList.discountRateBps }))] : []), amount(product.taxRateBps), product.currency]] : [];
  });
  const text = [['Producto', 'Descripción', 'Unidad', 'Precio (sin IVA)', ...(hasDiscount ? ['Descuento %', 'Precio neto (sin IVA)'] : []), 'IVA %', 'Moneda'], ...rows].map(row => row.map(value => cell(String(value))).join(';')).join('\r\n');
  return new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), `${text}\r\n`], { type: 'text/csv' });
}

// ---------------------------------------------------------------------------------------------------------------------
// Seed: a generic example, a default price list with the catalog and a partner one with a discount
// ---------------------------------------------------------------------------------------------------------------------

const DEMO_COSTS: Record<string, Array<[string, number]>> = {
  'Diseño de identidad visual': [['Horas de equipo', 48_000], ['Licencias y tipografías', 6_000], ['Impresión de pruebas', 3_500]],
  'Desarrollo web': [['Horas de equipo', 3_200], ['Herramientas', 300]],
  'Hosting y mantenimiento': [['Servidor', 1_200], ['Horas de equipo', 1_000]],
  'Manual de formación (impreso)': [['Imprenta', 900], ['Encuadernación', 250]],
  'Servicio de catering': [['Proveedor de catering', 24_000], ['Personal de sala', 4_000]],
};

export async function seedDemoPricing({ organizationId }: { organizationId: string }) {
  const products = (await getValues(db().products)).filter(product => product.organizationId === organizationId && !product.contactId);
  const customers = (await getValues(db().contacts)).filter(contact => contact.organizationId === organizationId && contact.isCustomer).sort((a, b) => a.name.localeCompare(b.name));
  const created = now();

  for (const product of products) {
    const lines = DEMO_COSTS[product.name];
    if (lines) {
      await saveProductCosts({ organizationId, productId: product.id, lines: lines.map(([conceptName, amountMinor]) => ({ conceptName, amountMinor })) });
    }
  }

  const courier = { id: createId({ prefix: 'shr' }), organizationId, name: 'Mensajería 24 h', carrierContactId: null, amountMinor: 650, notes: 'Envíos de material impreso', archivedAt: null, createdAt: created, updatedAt: created };
  await db().shippingRates.setItem(courier.id, courier);

  const item = (product: Stored, priceMinor = product.unitPriceMinor) => ({ productId: product.id, priceMinor, overridesShipping: product.name.includes('impreso'), shippingRateId: product.name.includes('impreso') ? courier.id : null });
  const general = { id: createId({ prefix: 'prl' }), organizationId, name: 'Tarifa general', description: 'Precios habituales del catálogo', discountRateBps: 0, defaultShippingRateId: null, isDefault: true, archivedAt: null, createdAt: created, updatedAt: created, items: products.map(product => item(product)) };
  const partners = { id: createId({ prefix: 'prl' }), organizationId, name: 'Partners', description: 'Clientes recurrentes con contrato anual', discountRateBps: 1_000, defaultShippingRateId: null, isDefault: false, archivedAt: null, createdAt: created, updatedAt: created, items: products.filter(product => !product.name.includes('catering')).map(product => item(product)) };
  await db().priceLists.setItem(general.id, general);
  await db().priceLists.setItem(partners.id, partners);

  for (const customer of customers.slice(0, 2)) {
    await db().contactPriceLists.setItem(customer.id, { contactId: customer.id, organizationId, priceListId: partners.id });
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------------------------------------------------

const base = '/api/organizations/:organizationId/pricing';

export const pricingHandlers = {
  ...defineHandler({ path: `${base}/cost-concepts`, method: 'GET', handler: async ({ params: { organizationId } }) => ({ concepts: (await listConcepts(organizationId)).map(({ id, name }) => ({ id, name })) }) }),
  ...defineHandler({ path: `${base}/product-costs`, method: 'GET', handler: async ({ params: { organizationId } }) => ({ costs: await getCostTotals(organizationId) }) }),
  ...defineHandler({ path: `${base}/products/:productId/costs`, method: 'GET', handler: async ({ params: { productId } }) => getProductCosts(productId) }),
  ...defineHandler({ path: `${base}/products/:productId/costs`, method: 'PUT', handler: async ({ params: { organizationId, productId }, body }: any) => saveProductCosts({ organizationId, productId, lines: body.lines }) }),

  ...defineHandler({ path: `${base}/shipping-rates`, method: 'GET', handler: async ({ params: { organizationId } }) => ({ shippingRates: await listShippingRates(organizationId) }) }),
  ...defineHandler({
    path: `${base}/shipping-rates`,
    method: 'POST',
    handler: async ({ params: { organizationId }, body }: any) => {
      const shippingRate = { ...body, id: createId({ prefix: 'shr' }), organizationId, archivedAt: null, createdAt: now(), updatedAt: now() };
      await db().shippingRates.setItem(shippingRate.id, shippingRate);
      return { shippingRate };
    },
  }),
  ...defineHandler({
    path: `${base}/shipping-rates/:shippingRateId`,
    method: 'PUT',
    handler: async ({ params: { shippingRateId }, body }: any) => {
      const existing = await db().shippingRates.getItem(shippingRateId) ?? fail('Shipping rate not found', 404);
      const shippingRate = { ...existing, ...body, updatedAt: now() };
      await db().shippingRates.setItem(shippingRateId, shippingRate);
      return { shippingRate };
    },
  }),
  ...defineHandler({
    path: `${base}/shipping-rates/:shippingRateId`,
    method: 'DELETE',
    handler: async ({ params: { shippingRateId } }) => {
      const existing = await db().shippingRates.getItem(shippingRateId) ?? fail('Shipping rate not found', 404);
      await db().shippingRates.setItem(shippingRateId, { ...existing, archivedAt: now() });
      for (const priceList of await getValues(db().priceLists)) {
        await db().priceLists.setItem(priceList.id, {
          ...priceList,
          defaultShippingRateId: priceList.defaultShippingRateId === shippingRateId ? null : priceList.defaultShippingRateId,
          items: priceList.items.map((item: Stored) => (item.shippingRateId === shippingRateId ? { ...item, shippingRateId: null } : item)),
        });
      }
    },
  }),

  ...defineHandler({
    path: `${base}/price-lists`,
    method: 'GET',
    handler: async ({ params: { organizationId } }) => {
      const assignments = await getValues(db().contactPriceLists);
      const priceLists = (await getValues(db().priceLists)).filter(priceList => priceList.organizationId === organizationId && !priceList.archivedAt);
      return {
        priceLists: priceLists
          .map(({ items, ...priceList }): Stored => ({ ...priceList, itemCount: items.length, contactCount: assignments.filter(assignment => assignment.priceListId === priceList.id).length }))
          .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name)),
      };
    },
  }),
  ...defineHandler({
    path: `${base}/price-lists`,
    method: 'POST',
    handler: async ({ params: { organizationId }, body }: any) => ({ priceList: await savePriceList({ ...body, id: createId({ prefix: 'prl' }), organizationId, items: [], archivedAt: null, createdAt: now(), updatedAt: now() }) }),
  }),
  ...defineHandler({ path: `${base}/price-lists/:priceListId`, method: 'GET', handler: async ({ params: { priceListId } }) => ({ priceList: await hydratePriceList(await getPriceListOrFail(priceListId)) }) }),
  ...defineHandler({
    path: `${base}/price-lists/:priceListId`,
    method: 'PUT',
    handler: async ({ params: { priceListId }, body }: any) => ({ priceList: await savePriceList({ ...await getPriceListOrFail(priceListId), ...body, updatedAt: now() }) }),
  }),
  ...defineHandler({
    path: `${base}/price-lists/:priceListId`,
    method: 'DELETE',
    handler: async ({ params: { priceListId } }) => {
      await db().priceLists.setItem(priceListId, { ...await getPriceListOrFail(priceListId), archivedAt: now(), isDefault: false });
      for (const assignment of await getValues(db().contactPriceLists)) {
        if (assignment.priceListId === priceListId) {
          await db().contactPriceLists.removeItem(assignment.contactId);
        }
      }
    },
  }),
  ...defineHandler({
    path: `${base}/price-lists/:priceListId/duplicate`,
    method: 'POST',
    handler: async ({ params: { priceListId }, body }: any) => {
      const source = await getPriceListOrFail(priceListId);
      return { priceList: await savePriceList({ ...source, id: createId({ prefix: 'prl' }), name: body.name, isDefault: false, createdAt: now(), updatedAt: now() }) };
    },
  }),
  ...defineHandler({
    path: `${base}/price-lists/:priceListId/items`,
    method: 'PUT',
    handler: async ({ params: { priceListId }, body }: any) => {
      const items = body.items.map((item: Stored) => ({ productId: item.productId, priceMinor: item.priceMinor, overridesShipping: Boolean(item.overridesShipping), shippingRateId: item.overridesShipping ? (item.shippingRateId ?? null) : null }));
      return { priceList: await hydratePriceList(await savePriceList({ ...await getPriceListOrFail(priceListId), items, updatedAt: now() })) };
    },
  }),
  ...defineHandler({
    path: `${base}/price-lists/:priceListId/adjust`,
    method: 'POST',
    handler: async ({ params: { priceListId }, body }: any) => {
      const priceList = await getPriceListOrFail(priceListId);
      const rateBps = body.direction === 'increase' ? body.rateBps : -body.rateBps;
      const items = priceList.items.map((item: Stored) => ({ ...item, priceMinor: adjustPriceMinor({ priceMinor: item.priceMinor, rateBps }) }));
      const adjustment = { id: createId({ prefix: 'pla' }), createdAt: now(), rateBps, productCount: items.length, userName: 'Lucía Martín' };
      return { priceList: await hydratePriceList(await savePriceList({ ...priceList, items, adjustments: [adjustment, ...(priceList.adjustments ?? [])], updatedAt: now() })) };
    },
  }),
  ...defineHandler({
    path: `${base}/price-lists/:priceListId/contacts`,
    method: 'PUT',
    handler: async ({ params: { organizationId, priceListId }, body }: any) => {
      const priceList = await getPriceListOrFail(priceListId);
      for (const assignment of await getValues(db().contactPriceLists)) {
        if (assignment.priceListId === priceListId) {
          await db().contactPriceLists.removeItem(assignment.contactId);
        }
      }
      for (const contactId of body.contactIds as string[]) {
        await db().contactPriceLists.setItem(contactId, { contactId, organizationId, priceListId });
      }
      return { priceList: await hydratePriceList(priceList) };
    },
  }),
  ...defineHandler({
    path: `${base}/price-lists/:priceListId/public`,
    method: 'GET',
    handler: async ({ params: { priceListId } }) => ({ priceList: await getPublicPriceList(await getPriceListOrFail(priceListId)) }),
  }),
  ...defineHandler({
    path: `${base}/price-lists/:priceListId/export.csv`,
    method: 'GET',
    handler: async ({ params: { priceListId } }) => buildCsv(await getPriceListOrFail(priceListId), await getValues(db().products)),
  }),

  ...defineHandler({ path: `${base}/contacts/:contactId/prices`, method: 'GET', handler: async ({ params: { organizationId, contactId } }) => getDemoContactPrices({ organizationId, contactId }) }),
  ...defineHandler({
    path: `${base}/contacts/:contactId/price-list`,
    method: 'PUT',
    handler: async ({ params: { organizationId, contactId }, body }: any) => {
      if (body.priceListId === null) {
        await db().contactPriceLists.removeItem(contactId);
      } else {
        await getPriceListOrFail(body.priceListId);
        await db().contactPriceLists.setItem(contactId, { contactId, organizationId, priceListId: body.priceListId });
      }
      return getDemoContactPrices({ organizationId, contactId });
    },
  }),
};
