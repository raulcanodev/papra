import type { Database } from '../app/database/database.types';
import type { PriceListInput, PriceListItemsInput, ProductCostsInput, ShippingRateInput } from './pricing.models';
import { and, asc, count, desc, eq, inArray, isNull, sql, sum } from 'drizzle-orm';
import { createContactNotFoundError } from '../contacts/contacts.errors';
import { contactsTable } from '../contacts/contacts.table';
import { invoicingProductsTable } from '../invoicing/invoicing.tables';
import { createPriceListNotFoundError, createPricingProductNotFoundError, createShippingRateNotFoundError } from './pricing.errors';
import { getItemMargin, getItemShippingRateId } from './pricing.models';
import { costConceptsTable, priceListContactsTable, priceListItemsTable, priceListsTable, productCostLinesTable, shippingRatesTable } from './pricing.tables';

export function createPricingRepository({ db }: { db: Database }) {
  return {
    listCostConcepts: async (args: { organizationId: string }) => listCostConcepts({ db, ...args }),
    getProductCosts: async (args: { organizationId: string; productId: string }) => getProductCosts({ db, ...args }),
    saveProductCosts: async (args: { organizationId: string; productId: string; costs: ProductCostsInput }) => saveProductCosts({ db, ...args }),
    getProductCostTotals: async (args: { organizationId: string }) => getProductCostTotals({ db, ...args }),
    listShippingRates: async (args: { organizationId: string }) => listShippingRates({ db, ...args }),
    createShippingRate: async (args: { organizationId: string; shippingRate: ShippingRateInput }) => createShippingRate({ db, ...args }),
    updateShippingRate: async (args: { organizationId: string; shippingRateId: string; shippingRate: ShippingRateInput }) => updateShippingRate({ db, ...args }),
    archiveShippingRate: async (args: { organizationId: string; shippingRateId: string }) => archiveShippingRate({ db, ...args }),
    listPriceLists: async (args: { organizationId: string }) => listPriceLists({ db, ...args }),
    getPriceList: async (args: { organizationId: string; priceListId: string }) => getPriceList({ db, ...args }),
    createPriceList: async (args: { organizationId: string; priceList: PriceListInput }) => createPriceList({ db, ...args }),
    updatePriceList: async (args: { organizationId: string; priceListId: string; priceList: PriceListInput }) => updatePriceList({ db, ...args }),
    archivePriceList: async (args: { organizationId: string; priceListId: string }) => archivePriceList({ db, ...args }),
    duplicatePriceList: async (args: { organizationId: string; priceListId: string; name: string }) => duplicatePriceList({ db, ...args }),
    savePriceListItems: async (args: { organizationId: string; priceListId: string; items: PriceListItemsInput['items'] }) => savePriceListItems({ db, ...args }),
    setPriceListContacts: async (args: { organizationId: string; priceListId: string; contactIds: string[] }) => setPriceListContacts({ db, ...args }),
    setContactPriceList: async (args: { organizationId: string; contactId: string; priceListId: string | null }) => setContactPriceList({ db, ...args }),
    getContactPrices: async (args: { organizationId: string; contactId: string }) => getContactPrices({ db, ...args }),
    getPublicPriceList: async (args: { organizationId: string; priceListId: string }) => getPublicPriceList({ db, ...args }),
  };
}

// ----- Cost breakdowns -----

async function listCostConcepts({ db, organizationId }: { db: Database; organizationId: string }) {
  const concepts = await db.select({ id: costConceptsTable.id, name: costConceptsTable.name }).from(costConceptsTable).where(eq(costConceptsTable.organizationId, organizationId)).orderBy(asc(costConceptsTable.name));
  return { concepts };
}

async function ensureProducts({ db, organizationId, productIds }: { db: Database; organizationId: string; productIds: string[] }) {
  const uniqueIds = [...new Set(productIds)];
  if (uniqueIds.length === 0) {
    return;
  }
  const found = await db.select({ id: invoicingProductsTable.id }).from(invoicingProductsTable).where(and(eq(invoicingProductsTable.organizationId, organizationId), inArray(invoicingProductsTable.id, uniqueIds)));
  if (found.length !== uniqueIds.length) {
    throw createPricingProductNotFoundError();
  }
}

async function getProductCosts({ db, organizationId, productId }: { db: Database; organizationId: string; productId: string }) {
  await ensureProducts({ db, organizationId, productIds: [productId] });
  const lines = await db
    .select({ conceptId: productCostLinesTable.conceptId, conceptName: costConceptsTable.name, amountMinor: productCostLinesTable.amountMinor })
    .from(productCostLinesTable)
    .innerJoin(costConceptsTable, eq(productCostLinesTable.conceptId, costConceptsTable.id))
    .where(and(eq(productCostLinesTable.organizationId, organizationId), eq(productCostLinesTable.productId, productId)))
    .orderBy(asc(productCostLinesTable.position));

  return { lines, totalMinor: lines.reduce((total, line) => total + line.amountMinor, 0) };
}

// The breakdown is replaced as a whole, the concepts it names are created when new (case and spaces as typed the first time)
async function saveProductCosts({ db, organizationId, productId, costs }: { db: Database; organizationId: string; productId: string; costs: ProductCostsInput }) {
  await ensureProducts({ db, organizationId, productIds: [productId] });

  await db.transaction(async (tx) => {
    const names = [...new Set(costs.lines.map(line => line.conceptName))];
    const existing = names.length === 0 ? [] : await tx.select().from(costConceptsTable).where(eq(costConceptsTable.organizationId, organizationId));
    const conceptIdByName = new Map(existing.map(concept => [concept.name.toLowerCase(), concept.id]));
    const missing = names.filter(name => !conceptIdByName.has(name.toLowerCase()));

    if (missing.length > 0) {
      const created = await tx.insert(costConceptsTable).values(missing.map(name => ({ organizationId, name }))).onConflictDoNothing().returning();
      created.forEach(concept => conceptIdByName.set(concept.name.toLowerCase(), concept.id));
    }

    await tx.delete(productCostLinesTable).where(and(eq(productCostLinesTable.organizationId, organizationId), eq(productCostLinesTable.productId, productId)));

    if (costs.lines.length > 0) {
      await tx.insert(productCostLinesTable).values(costs.lines.map((line, position) => ({
        organizationId,
        productId,
        conceptId: conceptIdByName.get(line.conceptName.toLowerCase())!,
        amountMinor: line.amountMinor,
        position,
      })));
    }
  });

  return getProductCosts({ db, organizationId, productId });
}

async function getProductCostTotals({ db, organizationId }: { db: Database; organizationId: string }) {
  const rows = await db
    .select({ productId: productCostLinesTable.productId, totalMinor: sum(productCostLinesTable.amountMinor) })
    .from(productCostLinesTable)
    .where(eq(productCostLinesTable.organizationId, organizationId))
    .groupBy(productCostLinesTable.productId);

  return { costs: rows.map(({ productId, totalMinor }) => ({ productId, totalMinor: Number(totalMinor ?? 0) })) };
}

// ----- Shipping rates -----

async function ensureCarrier({ db, organizationId, carrierContactId }: { db: Database; organizationId: string; carrierContactId: string | null | undefined }) {
  if (carrierContactId === null || carrierContactId === undefined) {
    return;
  }
  const [contact] = await db.select({ id: contactsTable.id }).from(contactsTable).where(and(eq(contactsTable.id, carrierContactId), eq(contactsTable.organizationId, organizationId))).limit(1);
  if (!contact) {
    throw createContactNotFoundError();
  }
}

async function ensureShippingRates({ db, organizationId, shippingRateIds }: { db: Database; organizationId: string; shippingRateIds: Array<string | null | undefined> }) {
  const ids = [...new Set(shippingRateIds.filter((id): id is string => id !== null && id !== undefined))];
  if (ids.length === 0) {
    return;
  }
  const found = await db.select({ id: shippingRatesTable.id }).from(shippingRatesTable).where(and(eq(shippingRatesTable.organizationId, organizationId), inArray(shippingRatesTable.id, ids)));
  if (found.length !== ids.length) {
    throw createShippingRateNotFoundError();
  }
}

async function listShippingRates({ db, organizationId }: { db: Database; organizationId: string }) {
  const rows = await db
    .select({ shippingRate: shippingRatesTable, carrierName: contactsTable.name })
    .from(shippingRatesTable)
    .leftJoin(contactsTable, eq(shippingRatesTable.carrierContactId, contactsTable.id))
    .where(and(eq(shippingRatesTable.organizationId, organizationId), isNull(shippingRatesTable.archivedAt)))
    .orderBy(asc(shippingRatesTable.name));

  return { shippingRates: rows.map(({ shippingRate, carrierName }) => ({ ...shippingRate, carrierName })) };
}

async function createShippingRate({ db, organizationId, shippingRate }: { db: Database; organizationId: string; shippingRate: ShippingRateInput }) {
  await ensureCarrier({ db, organizationId, carrierContactId: shippingRate.carrierContactId });
  const [saved] = await db.insert(shippingRatesTable).values({ organizationId, ...shippingRate }).returning();
  return { shippingRate: saved! };
}

async function updateShippingRate({ db, organizationId, shippingRateId, shippingRate }: { db: Database; organizationId: string; shippingRateId: string; shippingRate: ShippingRateInput }) {
  await ensureCarrier({ db, organizationId, carrierContactId: shippingRate.carrierContactId });
  const [saved] = await db.update(shippingRatesTable).set({ ...shippingRate, updatedAt: new Date() }).where(and(eq(shippingRatesTable.id, shippingRateId), eq(shippingRatesTable.organizationId, organizationId), isNull(shippingRatesTable.archivedAt))).returning();
  if (!saved) {
    throw createShippingRateNotFoundError();
  }
  return { shippingRate: saved };
}

// Archived rates stop being offered; the price lists using them fall back to no shipping
async function archiveShippingRate({ db, organizationId, shippingRateId }: { db: Database; organizationId: string; shippingRateId: string }) {
  await db.transaction(async (tx) => {
    const [archived] = await tx.update(shippingRatesTable).set({ archivedAt: new Date(), updatedAt: new Date() }).where(and(eq(shippingRatesTable.id, shippingRateId), eq(shippingRatesTable.organizationId, organizationId), isNull(shippingRatesTable.archivedAt))).returning({ id: shippingRatesTable.id });
    if (!archived) {
      throw createShippingRateNotFoundError();
    }
    await tx.update(priceListsTable).set({ defaultShippingRateId: null, updatedAt: new Date() }).where(eq(priceListsTable.defaultShippingRateId, shippingRateId));
    await tx.update(priceListItemsTable).set({ shippingRateId: null, updatedAt: new Date() }).where(eq(priceListItemsTable.shippingRateId, shippingRateId));
  });
}

// ----- Price lists -----

async function getActivePriceList({ db, organizationId, priceListId }: { db: Database; organizationId: string; priceListId: string }) {
  const [priceList] = await db.select().from(priceListsTable).where(and(eq(priceListsTable.id, priceListId), eq(priceListsTable.organizationId, organizationId), isNull(priceListsTable.archivedAt))).limit(1);
  if (!priceList) {
    throw createPriceListNotFoundError();
  }
  return { priceList };
}

async function listPriceLists({ db, organizationId }: { db: Database; organizationId: string }) {
  const itemCounts = db.select({ priceListId: priceListItemsTable.priceListId, itemCount: count().as('item_count') }).from(priceListItemsTable).groupBy(priceListItemsTable.priceListId).as('item_counts');
  const contactCounts = db.select({ priceListId: priceListContactsTable.priceListId, contactCount: count().as('contact_count') }).from(priceListContactsTable).groupBy(priceListContactsTable.priceListId).as('contact_counts');

  const rows = await db
    .select({ priceList: priceListsTable, itemCount: itemCounts.itemCount, contactCount: contactCounts.contactCount })
    .from(priceListsTable)
    .leftJoin(itemCounts, eq(itemCounts.priceListId, priceListsTable.id))
    .leftJoin(contactCounts, eq(contactCounts.priceListId, priceListsTable.id))
    .where(and(eq(priceListsTable.organizationId, organizationId), isNull(priceListsTable.archivedAt)))
    .orderBy(desc(priceListsTable.isDefault), asc(priceListsTable.name));

  return { priceLists: rows.map(({ priceList, itemCount, contactCount }) => ({ ...priceList, itemCount: Number(itemCount ?? 0), contactCount: Number(contactCount ?? 0) })) };
}

// The price list with, for each product, the internal figures (cost, shipping, margin) its editor shows
async function getPriceList({ db, organizationId, priceListId }: { db: Database; organizationId: string; priceListId: string }) {
  const { priceList } = await getActivePriceList({ db, organizationId, priceListId });

  const [itemRows, { costs }, { shippingRates }, contacts] = await Promise.all([
    db.select({ item: priceListItemsTable, productName: invoicingProductsTable.name, productUnit: invoicingProductsTable.unit, productBasePriceMinor: invoicingProductsTable.unitPriceMinor, productArchivedAt: invoicingProductsTable.archivedAt })
      .from(priceListItemsTable)
      .innerJoin(invoicingProductsTable, eq(priceListItemsTable.productId, invoicingProductsTable.id))
      .where(eq(priceListItemsTable.priceListId, priceListId))
      .orderBy(asc(priceListItemsTable.position), asc(invoicingProductsTable.name)),
    getProductCostTotals({ db, organizationId }),
    listShippingRates({ db, organizationId }),
    db.select({ id: contactsTable.id, name: contactsTable.name, isCustomer: contactsTable.isCustomer, isSupplier: contactsTable.isSupplier })
      .from(priceListContactsTable)
      .innerJoin(contactsTable, eq(priceListContactsTable.contactId, contactsTable.id))
      .where(and(eq(priceListContactsTable.priceListId, priceListId), isNull(contactsTable.archivedAt)))
      .orderBy(asc(contactsTable.name)),
  ]);

  const costByProductId = new Map(costs.map(cost => [cost.productId, cost.totalMinor]));
  const shippingById = new Map(shippingRates.map(rate => [rate.id, rate.amountMinor]));

  const items = itemRows.map(({ item, productName, productUnit, productBasePriceMinor, productArchivedAt }) => {
    const shippingRateId = getItemShippingRateId({ item, priceList });
    const shippingMinor = shippingRateId === null ? 0 : (shippingById.get(shippingRateId) ?? 0);
    const productCostMinor = costByProductId.get(item.productId) ?? 0;

    return {
      productId: item.productId,
      productName,
      productUnit,
      productBasePriceMinor,
      isProductArchived: productArchivedAt !== null,
      priceMinor: item.priceMinor,
      overridesShipping: item.overridesShipping,
      shippingRateId: item.shippingRateId,
      appliedShippingRateId: shippingRateId,
      productCostMinor,
      shippingMinor,
      ...getItemMargin({ priceMinor: item.priceMinor, discountRateBps: priceList.discountRateBps, productCostMinor, shippingMinor }),
    };
  });

  return { priceList: { ...priceList, items, contacts } };
}

async function unsetOtherDefaults({ db, organizationId, priceListId }: { db: Database; organizationId: string; priceListId?: string }) {
  await db.update(priceListsTable).set({ isDefault: false }).where(and(
    eq(priceListsTable.organizationId, organizationId),
    eq(priceListsTable.isDefault, true),
    priceListId === undefined ? undefined : sql`${priceListsTable.id} <> ${priceListId}`,
  ));
}

async function createPriceList({ db, organizationId, priceList }: { db: Database; organizationId: string; priceList: PriceListInput }) {
  await ensureShippingRates({ db, organizationId, shippingRateIds: [priceList.defaultShippingRateId] });
  const saved = await db.transaction(async (tx) => {
    if (priceList.isDefault) {
      await unsetOtherDefaults({ db: tx, organizationId });
    }
    const [row] = await tx.insert(priceListsTable).values({ organizationId, ...priceList }).returning();
    return row!;
  });
  return { priceList: saved };
}

async function updatePriceList({ db, organizationId, priceListId, priceList }: { db: Database; organizationId: string; priceListId: string; priceList: PriceListInput }) {
  await getActivePriceList({ db, organizationId, priceListId });
  await ensureShippingRates({ db, organizationId, shippingRateIds: [priceList.defaultShippingRateId] });
  const saved = await db.transaction(async (tx) => {
    if (priceList.isDefault) {
      await unsetOtherDefaults({ db: tx, organizationId, priceListId });
    }
    const [row] = await tx.update(priceListsTable).set({ ...priceList, updatedAt: new Date() }).where(and(eq(priceListsTable.id, priceListId), eq(priceListsTable.organizationId, organizationId))).returning();
    return row!;
  });
  return { priceList: saved };
}

// The invoices already written keep their prices; its contacts go back to the default price list
async function archivePriceList({ db, organizationId, priceListId }: { db: Database; organizationId: string; priceListId: string }) {
  await getActivePriceList({ db, organizationId, priceListId });
  await db.transaction(async (tx) => {
    await tx.update(priceListsTable).set({ archivedAt: new Date(), isDefault: false, updatedAt: new Date() }).where(eq(priceListsTable.id, priceListId));
    await tx.delete(priceListContactsTable).where(eq(priceListContactsTable.priceListId, priceListId));
  });
}

// A starting point for a new price list: same products, prices and shipping, no contacts, never the default one
async function duplicatePriceList({ db, organizationId, priceListId, name }: { db: Database; organizationId: string; priceListId: string; name: string }) {
  const { priceList: source } = await getActivePriceList({ db, organizationId, priceListId });
  const copy = await db.transaction(async (tx) => {
    const [created] = await tx.insert(priceListsTable).values({ organizationId, name, description: source.description, discountRateBps: source.discountRateBps, defaultShippingRateId: source.defaultShippingRateId, isDefault: false }).returning();
    const items = await tx.select().from(priceListItemsTable).where(eq(priceListItemsTable.priceListId, priceListId));
    if (items.length > 0) {
      await tx.insert(priceListItemsTable).values(items.map(({ productId, priceMinor, overridesShipping, shippingRateId, position }) => ({ priceListId: created!.id, productId, priceMinor, overridesShipping, shippingRateId, position })));
    }
    return created!;
  });
  return { priceList: copy };
}

async function savePriceListItems({ db, organizationId, priceListId, items }: { db: Database; organizationId: string; priceListId: string; items: PriceListItemsInput['items'] }) {
  await getActivePriceList({ db, organizationId, priceListId });
  await ensureProducts({ db, organizationId, productIds: items.map(item => item.productId) });
  await ensureShippingRates({ db, organizationId, shippingRateIds: items.map(item => item.shippingRateId) });

  await db.transaction(async (tx) => {
    await tx.delete(priceListItemsTable).where(eq(priceListItemsTable.priceListId, priceListId));
    if (items.length > 0) {
      await tx.insert(priceListItemsTable).values(items.map((item, position) => ({
        priceListId,
        productId: item.productId,
        priceMinor: item.priceMinor,
        overridesShipping: item.overridesShipping,
        shippingRateId: item.overridesShipping ? (item.shippingRateId ?? null) : null,
        position,
      })));
    }
    await tx.update(priceListsTable).set({ updatedAt: new Date() }).where(eq(priceListsTable.id, priceListId));
  });

  return getPriceList({ db, organizationId, priceListId });
}

async function ensureContacts({ db, organizationId, contactIds }: { db: Database; organizationId: string; contactIds: string[] }) {
  const ids = [...new Set(contactIds)];
  if (ids.length === 0) {
    return ids;
  }
  const found = await db.select({ id: contactsTable.id }).from(contactsTable).where(and(eq(contactsTable.organizationId, organizationId), inArray(contactsTable.id, ids)));
  if (found.length !== ids.length) {
    throw createContactNotFoundError();
  }
  return ids;
}

// The exact set of contacts of a price list: the ones given leave their previous price list, the ones left out lose it
async function setPriceListContacts({ db, organizationId, priceListId, contactIds }: { db: Database; organizationId: string; priceListId: string; contactIds: string[] }) {
  await getActivePriceList({ db, organizationId, priceListId });
  const ids = await ensureContacts({ db, organizationId, contactIds });

  await db.transaction(async (tx) => {
    await tx.delete(priceListContactsTable).where(eq(priceListContactsTable.priceListId, priceListId));
    if (ids.length > 0) {
      await tx.delete(priceListContactsTable).where(inArray(priceListContactsTable.contactId, ids));
      await tx.insert(priceListContactsTable).values(ids.map(contactId => ({ contactId, organizationId, priceListId })));
    }
  });

  return getPriceList({ db, organizationId, priceListId });
}

async function setContactPriceList({ db, organizationId, contactId, priceListId }: { db: Database; organizationId: string; contactId: string; priceListId: string | null }) {
  await ensureContacts({ db, organizationId, contactIds: [contactId] });
  if (priceListId === null) {
    await db.delete(priceListContactsTable).where(eq(priceListContactsTable.contactId, contactId));
    return getContactPrices({ db, organizationId, contactId });
  }

  await getActivePriceList({ db, organizationId, priceListId });
  await db.insert(priceListContactsTable)
    .values({ contactId, organizationId, priceListId })
    .onConflictDoUpdate({ target: priceListContactsTable.contactId, set: { priceListId, updatedAt: new Date() } });

  return getContactPrices({ db, organizationId, contactId });
}

// The prices an invoice for this contact starts from: its own price list, else the default one, else none (catalog prices)
async function getContactPrices({ db, organizationId, contactId }: { db: Database; organizationId: string; contactId: string }) {
  await ensureContacts({ db, organizationId, contactIds: [contactId] });

  const [assigned] = await db
    .select({ priceList: priceListsTable })
    .from(priceListContactsTable)
    .innerJoin(priceListsTable, eq(priceListContactsTable.priceListId, priceListsTable.id))
    .where(and(eq(priceListContactsTable.contactId, contactId), eq(priceListsTable.organizationId, organizationId), isNull(priceListsTable.archivedAt)))
    .limit(1);

  const [fallback] = assigned ? [] : await db.select().from(priceListsTable).where(and(eq(priceListsTable.organizationId, organizationId), eq(priceListsTable.isDefault, true), isNull(priceListsTable.archivedAt))).limit(1);
  const priceList = assigned?.priceList ?? fallback;

  if (!priceList) {
    return { priceList: null, isAssigned: false, prices: [] };
  }

  const prices = await db.select({ productId: priceListItemsTable.productId, priceMinor: priceListItemsTable.priceMinor }).from(priceListItemsTable).where(eq(priceListItemsTable.priceListId, priceList.id));

  return {
    priceList: { id: priceList.id, name: priceList.name, discountRateBps: priceList.discountRateBps },
    isAssigned: assigned !== undefined,
    prices,
  };
}

// What a contact may see of a price list: products and prices only. Built from scratch, never from the internal view,
// so costs, shipping and margins cannot leak into an export by accident.
async function getPublicPriceList({ db, organizationId, priceListId }: { db: Database; organizationId: string; priceListId: string }) {
  const { priceList } = await getActivePriceList({ db, organizationId, priceListId });
  const rows = await db
    .select({ name: invoicingProductsTable.name, description: invoicingProductsTable.description, unit: invoicingProductsTable.unit, currency: invoicingProductsTable.currency, taxRateBps: invoicingProductsTable.taxRateBps, priceMinor: priceListItemsTable.priceMinor })
    .from(priceListItemsTable)
    .innerJoin(invoicingProductsTable, eq(priceListItemsTable.productId, invoicingProductsTable.id))
    .where(and(eq(priceListItemsTable.priceListId, priceListId), isNull(invoicingProductsTable.archivedAt)))
    .orderBy(asc(priceListItemsTable.position), asc(invoicingProductsTable.name));

  return {
    priceList: {
      name: priceList.name,
      discountRateBps: priceList.discountRateBps,
      items: rows.map(row => ({ ...row, netPriceMinor: row.priceMinor - Math.round(row.priceMinor * priceList.discountRateBps / 10_000) })),
    },
  };
}
